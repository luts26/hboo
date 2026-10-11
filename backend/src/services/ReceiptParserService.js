import receiptRepository from '../repositories/ReceiptRepository.js';
import receiptOcrRepository from '../repositories/ReceiptOcrRepository.js';
import planningRepository from '../repositories/PlanningRepository.js';
import transactionRepository from '../repositories/TransactionRepository.js';
import productCatalogRepository from '../repositories/ProductCatalogRepository.js';
import {parseReceiptOcr} from '../receipts/ReceiptParser.js';
import productMatcher from './ProductMatcher.js';
import planningService from './PlanningService.js';

class ReceiptParserService {
    constructor({
        receipts = receiptRepository,
        ocrRepository = receiptOcrRepository,
        planning = planningRepository,
        transactions = transactionRepository,
        catalog = productCatalogRepository,
        matcher = productMatcher,
        parser = parseReceiptOcr
    } = {}) {
        this.receiptRepository = receipts;
        this.ocrRepository = ocrRepository;
        this.planningRepository = planning;
        this.transactionRepository = transactions;
        this.catalogRepository = catalog;
        this.matcher = matcher;
        this.parser = parser;
    }

    async parseReceipt(userId, receiptId, options = {}) {
        const receipt = await this.requireReceipt(userId, receiptId);
        const ocr = await this.ocrRepository.findByReceiptId(receipt.id);
        if (!ocr || ocr.status !== 'completed') {
            const error = new Error('Receipt OCR is not completed');
            error.statusCode = 409;
            throw error;
        }
        return {
            receiptId: Number(receipt.id),
            ocrId: Number(ocr.id),
            ocrUpdatedAt: ocr.updatedAt || null,
            draft: await this.enrichDraft(this.parser(ocr.rawText || ''), userId, options)
        };
    }

    async enrichDraft(draft, userId, options = {}) {
        const context = await this.buildContext(userId, options);
        const merchantId = context.merchant?.id || this.findDetectedMerchantId(draft?.merchant, context.merchants) || null;
        const items = [];

        for (const item of (Array.isArray(draft?.items) ? draft.items : [])) {
            const matchResult = await this.matcher.match({
                rawName: item.rawName,
                merchantId,
                shoppingItems: context.planningItem?.shoppingItems || []
            });
            items.push({
                ...item,
                productMatch: matchResult.match,
                productMatchSource: matchResult.source,
                productMatchCandidates: matchResult.candidates
            });
        }

        const warnings = [
            ...(Array.isArray(draft?.warnings) ? draft.warnings : []),
            ...this.getContextWarnings(draft, context)
        ];

        return {
            ...draft,
            items,
            context: this.formatContext(context),
            warnings: [...new Set(warnings)]
        };
    }

    async buildContext(userId, options = {}) {
        const planningItemId = this.optionalId(options.planningItemId ?? options.planning_item_id);
        const merchants = await this.catalogRepository.findMerchants({includeDisabled: false}).catch(() => []);
        if (!planningItemId) return {planningItem: null, merchant: null, transaction: null, merchants};

        const planningItem = await this.planningRepository.findItemById(
            this.requireId(userId, 'user id'),
            planningItemId
        );
        if (!planningItem) return {planningItem: null, merchant: null, transaction: null, merchants};

        const merchant = planningItem.merchantId
            ? await this.catalogRepository.findMerchantById(planningItem.merchantId).catch(() => null)
            : null;
        const linkedTransactions = await this.transactionRepository.getLinkedPlanningTransactions(planningItem.id).catch(() => []);
        const transaction = linkedTransactions[0] || null;

        return {planningItem, merchant, transaction, merchants};
    }

    getContextWarnings(draft, context) {
        const warnings = [];
        const receiptMerchant = draft?.merchant;
        if (context.merchant && receiptMerchant?.rawName) {
            const score = planningService.getMerchantScore(
                {title: context.merchant.name},
                {description: receiptMerchant.normalizedHint || receiptMerchant.rawName}
            );
            if (score < 0.7) warnings.push('MERCHANT_CONTEXT_MISMATCH');
        }

        const receiptTotal = this.optionalMoney(draft?.total?.value);
        const transactionAmount = this.optionalMoney(context.transaction?.amount);
        if (context.transaction && receiptTotal === null) warnings.push('RECEIPT_TOTAL_MISSING_FOR_TRANSACTION');
        if (receiptTotal !== null && transactionAmount !== null) {
            const difference = this.roundMoney(Math.abs(receiptTotal - Math.abs(transactionAmount)));
            if (difference <= 0.05) warnings.push('RECEIPT_TOTAL_MATCHES_TRANSACTION');
            else warnings.push('RECEIPT_TOTAL_TRANSACTION_MISMATCH');
        }

        return warnings;
    }

    formatContext(context) {
        return {
            planningItem: context.planningItem ? {
                id: Number(context.planningItem.id),
                title: context.planningItem.title,
                merchantId: context.planningItem.merchantId === null || context.planningItem.merchantId === undefined ? null : Number(context.planningItem.merchantId),
                merchantName: context.merchant?.name || null,
                shoppingItems: (context.planningItem.shoppingItems || []).map(item => ({
                    id: item.id === undefined ? null : Number(item.id),
                    productId: item.productId === null || item.productId === undefined ? null : Number(item.productId),
                    productName: item.productName || null,
                    name: item.name,
                    amount: item.amount === null || item.amount === undefined ? null : Number(item.amount),
                    unit: item.unit || null
                }))
            } : null,
            transaction: context.transaction ? {
                provider: context.transaction.provider,
                providerTransactionId: context.transaction.providerTransactionId,
                timestamp: Number(context.transaction.timestamp) || null,
                amount: Number(context.transaction.amount),
                description: context.transaction.description || null
            } : null
        };
    }

    findDetectedMerchantId(merchantHint, merchants = []) {
        const hints = [
            merchantHint?.normalizedHint,
            merchantHint?.rawName
        ].map(value => this.normalizeComparableText(value)).filter(Boolean);
        if (!hints.length) return null;
        const merchant = merchants.find(item => hints.includes(this.normalizeComparableText(item.name)));
        return merchant ? Number(merchant.id) : null;
    }

    normalizeComparableText(value) {
        return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    optionalMoney(value) {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? this.roundMoney(number) : null;
    }

    roundMoney(value) {
        return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    }

    optionalId(value) {
        if (value === null || value === undefined || value === '') return null;
        const id = Number(value);
        return Number.isInteger(id) && id > 0 ? id : null;
    }

    async requireReceipt(userId, receiptId) {
        const receipt = await this.receiptRepository.findById(
            this.requireId(userId, 'user id'),
            this.requireId(receiptId, 'receipt id')
        );
        if (!receipt) {
            const error = new Error('Receipt not found');
            error.statusCode = 404;
            throw error;
        }
        return receipt;
    }

    requireId(value, field) {
        const id = Number(value);
        if (!Number.isInteger(id) || id <= 0) {
            const error = new Error(`${field} must be a positive integer`);
            error.statusCode = 400;
            throw error;
        }
        return id;
    }
}

export default new ReceiptParserService();
export {ReceiptParserService};
