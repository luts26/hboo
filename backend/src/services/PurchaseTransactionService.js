import pool from '../database/mysql.js';
import purchaseRepository from '../repositories/PurchaseRepository.js';
import transactionRepository from '../repositories/TransactionRepository.js';
import planningService from './PlanningService.js';

const DAY_MS = 86400000;
const CANDIDATE_WINDOW_DAYS = 3;
const CANDIDATE_LIMIT = 8;
const MIN_CANDIDATE_SCORE = 65;
const FALLBACK_MIN_CANDIDATE_SCORE = 45;
const PROVIDERS = ['mono', 'privat'];

class PurchaseTransactionService {

    async getCandidates(userId, purchaseId, {includeFallback = false} = {}) {
        const purchase = await this.requirePurchase(userId, purchaseId);
        const purchasedAt = new Date(purchase.purchasedAt).getTime();
        const rows = await transactionRepository.getPurchaseTransactionCandidates(
            purchasedAt - CANDIDATE_WINDOW_DAYS * DAY_MS,
            purchasedAt + CANDIDATE_WINDOW_DAYS * DAY_MS,
            purchase.id
        );

        return rows
            .map(row => this.formatCandidate(row, purchase))
            .filter(candidate => includeFallback
                ? this.isReasonableFallbackCandidate(candidate)
                : candidate.score >= MIN_CANDIDATE_SCORE)
            .sort((a, b) => b.score - a.score || Math.abs(a.timestamp - purchasedAt) - Math.abs(b.timestamp - purchasedAt))
            .slice(0, CANDIDATE_LIMIT);
    }

    async getLinkedTransaction(userId, purchaseId) {
        const purchase = await this.requirePurchase(userId, purchaseId);
        const linked = await transactionRepository.getLinkedPurchaseTransaction(purchase.id);

        return {
            transaction: linked ? this.formatTransaction(linked) : null
        };
    }

    async linkTransaction(userId, purchaseId, data) {
        const id = this.requireId(purchaseId, 'purchase id');
        const provider = this.requireProvider(data.provider);
        const providerTransactionId = this.requireString(
            data.providerTransactionId ?? data.provider_transaction_id,
            'providerTransactionId'
        );
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const purchase = await purchaseRepository.findPurchaseById(userId, id);
            if (!purchase) throw this.notFoundError('Purchase not found');

            const transaction = await transactionRepository.getTransaction(provider, providerTransactionId, connection);
            if (!transaction) throw this.notFoundError('Transaction not found');
            if (!(Number(transaction.amount) < 0)) throw this.validationError('Transaction must be an expense');

            const existingPurchaseLink = await transactionRepository.findPurchaseTransactionLinkByPurchaseWithConnection(
                connection,
                purchase.id
            );
            const existingTransactionLink = await transactionRepository.findPurchaseTransactionLinkByTransactionWithConnection(
                connection,
                provider,
                providerTransactionId
            );

            const sameLink = existingPurchaseLink
                && existingTransactionLink
                && Number(existingPurchaseLink.id) === Number(existingTransactionLink.id);

            if (sameLink) {
                await connection.commit();
                return this.getLinkedTransaction(userId, purchase.id);
            }

            if (existingPurchaseLink) {
                throw this.conflictError('Purchase already has a linked bank transaction');
            }

            if (existingTransactionLink) {
                throw this.conflictError('Bank transaction is already linked to another purchase');
            }

            await transactionRepository.createPurchaseTransactionLinkWithConnection(
                connection,
                purchase.id,
                provider,
                providerTransactionId
            );

            await connection.commit();
            return this.getLinkedTransaction(userId, purchase.id);
        } catch (error) {
            await connection.rollback();
            if (error?.code === 'ER_DUP_ENTRY') {
                throw this.conflictError('Purchase transaction link already exists');
            }
            throw error;
        } finally {
            connection.release();
        }
    }

    async unlinkTransaction(userId, purchaseId) {
        const purchase = await this.requirePurchase(userId, purchaseId);
        const deleted = await transactionRepository.deletePurchaseTransactionLink(purchase.id);

        if (!deleted) throw this.notFoundError('Purchase transaction link not found');

        return {transaction: null};
    }

    async requirePurchase(userId, purchaseId) {
        const purchase = await purchaseRepository.findPurchaseById(
            this.requireId(userId, 'user id'),
            this.requireId(purchaseId, 'purchase id')
        );
        if (!purchase) throw this.notFoundError('Purchase not found');
        return purchase;
    }

    formatCandidate(transaction, purchase) {
        const formatted = this.formatTransaction(transaction);
        const amountSignal = this.getAmountScore(purchase.total, formatted.amount);
        const dateSignal = this.getDateScore(purchase.purchasedAt, formatted.timestamp);
        const merchantSignal = this.getMerchantScore(purchase, formatted);
        const score = this.roundMoney((amountSignal * 60) + (dateSignal * 25) + (merchantSignal * 15));
        const reasons = this.getReasons(amountSignal, dateSignal, merchantSignal);

        return {
            transaction: formatted,
            score,
            reasons,
            signals: {
                amount: this.roundMoney(amountSignal),
                date: this.roundMoney(dateSignal),
                merchant: this.roundMoney(merchantSignal)
            },
            ...formatted
        };
    }

    formatTransaction(transaction) {
        const timestamp = Number(transaction.timestamp) || null;
        const amount = this.toMoney(transaction.amount);

        return {
            provider: transaction.provider,
            providerTransactionId: transaction.providerTransactionId,
            timestamp,
            date: timestamp ? new Date(timestamp).toISOString() : null,
            amount,
            expenseAmount: this.roundMoney(Math.abs(amount)),
            description: transaction.description || 'Transaction',
            category: transaction.category || null,
            linkId: transaction.linkId === undefined ? null : Number(transaction.linkId),
            linkedAt: transaction.linkedAt ? this.formatDateTime(transaction.linkedAt) : null
        };
    }

    getAmountScore(purchaseTotal, transactionAmount) {
        const total = this.toMoney(purchaseTotal);
        const expense = Math.abs(this.toMoney(transactionAmount));
        if (total <= 0 || expense <= 0) return 0;

        const diff = Math.abs(total - expense);
        if (diff <= 0.01) return 1;

        const diffRatio = diff / Math.max(total, expense);
        if (diffRatio <= 0.01) return 0.9;
        if (diffRatio <= 0.05) return 0.75;
        if (diffRatio <= 0.1) return 0.55;
        if (diffRatio <= 0.2) return 0.25;
        return 0;
    }

    getDateScore(purchasedAt, transactionTimestamp) {
        if (!transactionTimestamp) return 0;
        const purchaseDate = new Date(purchasedAt);
        const purchaseDay = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth(), purchaseDate.getDate()).getTime();
        const transactionDate = new Date(transactionTimestamp);
        const transactionDay = new Date(transactionDate.getFullYear(), transactionDate.getMonth(), transactionDate.getDate()).getTime();
        const diffDays = Math.abs(transactionDay - purchaseDay) / DAY_MS;

        if (diffDays === 0) return 1;
        if (diffDays <= 1) return 0.8;
        if (diffDays <= 3) return 0.55;
        return 0;
    }

    getMerchantScore(purchase, transaction) {
        if (!purchase.merchantName) return 0;
        return planningService.getMerchantScore(
            {title: purchase.merchantName, description: purchase.note || null},
            {description: transaction.description}
        );
    }

    getReasons(amountSignal, dateSignal, merchantSignal) {
        const reasons = [];
        if (amountSignal === 1) reasons.push('exact amount');
        else if (amountSignal >= 0.75) reasons.push('close amount');
        if (dateSignal === 1) reasons.push('same date');
        else if (dateSignal >= 0.55) reasons.push('nearby date');
        if (merchantSignal >= 0.7) reasons.push('merchant match');
        else if (merchantSignal >= 0.35) reasons.push('merchant partial match');
        return reasons;
    }

    isReasonableFallbackCandidate(candidate) {
        if (candidate.score < FALLBACK_MIN_CANDIDATE_SCORE) return false;
        return candidate.signals.amount >= 0.55 || candidate.signals.merchant >= 0.35;
    }

    requireProvider(value) {
        const provider = String(value || '').trim();
        if (!PROVIDERS.includes(provider)) throw this.validationError('provider is invalid');
        return provider;
    }

    requireString(value, field) {
        const text = String(value || '').trim();
        if (!text) throw this.validationError(`${field} is required`);
        if (text.length > 255) throw this.validationError(`${field} is too long`);
        return text;
    }

    requireId(value, field) {
        const id = Number(value);
        if (!Number.isInteger(id) || id <= 0) throw this.validationError(`${field} is invalid`);
        return id;
    }

    toMoney(value) {
        return this.roundMoney(Number(value) || 0);
    }

    roundMoney(value) {
        return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    }

    formatDateTime(value) {
        if (!value) return null;
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    validationError(message) {
        const error = new Error(message);
        error.statusCode = 400;
        return error;
    }

    notFoundError(message) {
        const error = new Error(message);
        error.statusCode = 404;
        return error;
    }

    conflictError(message) {
        const error = new Error(message);
        error.statusCode = 409;
        return error;
    }
}

export default new PurchaseTransactionService();
