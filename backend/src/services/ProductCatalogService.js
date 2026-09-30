import productCatalogRepository from '../repositories/ProductCatalogRepository.js';
import purchaseRepository from '../repositories/PurchaseRepository.js';
import {
    getAllowedUnits,
    isUnitAllowed,
    isValidMeasurementType
} from './ProductUnitService.js';

const PAYMENT_TYPES = ['cash', 'bank', 'other'];
const STATUSES = ['active', 'disabled'];

const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

class ProductCatalogService {

    constructor({
        catalogRepository = productCatalogRepository,
        purchasesRepository = purchaseRepository
    } = {}) {
        this.catalogRepository = catalogRepository;
        this.purchasesRepository = purchasesRepository;
    }

    async getCategories(options = {}) {
        return (await this.catalogRepository.findCategories(options)).map(category => this.formatCategory(category));
    }

    async getProducts(options = {}) {
        return (await this.catalogRepository.findProducts(options)).map(product => this.formatProduct(product));
    }

    async createProduct(data) {
        const product = await this.buildProduct(data);
        return this.formatProduct(await this.catalogRepository.createProduct(product));
    }

    async updateProduct(productId, data) {
        const id = this.requireId(productId, 'product id');
        const current = await this.catalogRepository.findProductById(id);
        if (!current) return null;

        const product = await this.buildProduct({
            category_id: data.category_id ?? data.categoryId ?? current.categoryId,
            name: data.name ?? current.name,
            measurement_type: data.measurement_type ?? data.measurementType ?? current.measurementType,
            status: data.status ?? current.status
        });

        return this.formatProduct(await this.catalogRepository.updateProduct(id, product));
    }

    async getMerchants(options = {}) {
        return (await this.catalogRepository.findMerchants(options)).map(merchant => this.formatMerchant(merchant));
    }

    async createMerchant(data) {
        const name = this.requireName(data.name, 'name');
        return this.formatMerchant(await this.catalogRepository.createMerchant({name}));
    }

    async getPurchases(userId, options = {}) {
        const rows = await this.purchasesRepository.findPurchases(this.requireId(userId, 'user id'), options);
        return rows.map(purchase => this.formatPurchase(purchase));
    }

    async getPurchase(userId, purchaseId) {
        const purchase = await this.purchasesRepository.findPurchaseById(
            this.requireId(userId, 'user id'),
            this.requireId(purchaseId, 'purchase id')
        );

        return purchase ? this.formatPurchase(purchase) : null;
    }

    async createPurchase(userId, data) {
        const purchase = await this.buildPurchase(data);
        return this.formatPurchase(await this.purchasesRepository.createPurchase(
            this.requireId(userId, 'user id'),
            purchase
        ));
    }

    async createPurchaseFromReceipt(userId, receiptId, data) {
        const purchase = await this.buildPurchase(data);
        const result = await this.purchasesRepository.createPurchaseFromReceipt(
            this.requireId(userId, 'user id'),
            this.requireId(receiptId, 'receipt id'),
            purchase
        );

        if (result.status === 'not_found') {
            const error = new Error('Receipt not found');
            error.statusCode = 404;
            throw error;
        }
        if (result.status === 'link_failed' || !result.purchase) {
            const error = new Error('Receipt could not be linked');
            error.statusCode = 409;
            throw error;
        }

        return {
            status: result.status,
            idempotent: result.status !== 'created',
            purchase: this.formatPurchase(result.purchase)
        };
    }

    async updatePurchase(userId, purchaseId, data) {
        const purchase = await this.buildPurchase(data);
        const updated = await this.purchasesRepository.replacePurchase(
            this.requireId(userId, 'user id'),
            this.requireId(purchaseId, 'purchase id'),
            purchase
        );

        return updated ? this.formatPurchase(updated) : null;
    }

    async deletePurchase(userId, purchaseId) {
        return this.purchasesRepository.deletePurchase(
            this.requireId(userId, 'user id'),
            this.requireId(purchaseId, 'purchase id')
        );
    }

    async buildProduct(data) {
        const categoryId = this.requireId(data.category_id ?? data.categoryId, 'category_id');
        const category = await this.catalogRepository.findCategoryById(categoryId);
        if (!category || category.status !== 'active') throw this.validationError('category_id must reference active product category');

        const measurementType = String(data.measurement_type ?? data.measurementType ?? '').trim();
        if (!isValidMeasurementType(measurementType)) throw this.validationError('measurement_type must be weight, volume, or count');

        const status = String(data.status || 'active').trim();
        if (!STATUSES.includes(status)) throw this.validationError('status must be active or disabled');

        return {
            categoryId,
            name: this.requireName(data.name, 'name'),
            measurementType,
            status
        };
    }

    async buildPurchase(data) {
        const items = Array.isArray(data.items) ? data.items : [];
        if (!items.length) throw this.validationError('items must contain at least one purchase item');

        const merchantId = data.merchant_id ?? data.merchantId ?? null;
        if (merchantId !== null && merchantId !== '') {
            const merchant = await this.catalogRepository.findMerchantById(this.requireId(merchantId, 'merchant_id'));
            if (!merchant || merchant.status !== 'active') throw this.validationError('merchant_id must reference active merchant');
        }

        const paymentType = String(data.payment_type ?? data.paymentType ?? '').trim();
        if (!PAYMENT_TYPES.includes(paymentType)) throw this.validationError('payment_type must be cash, bank, or other');

        const builtItems = [];
        for (const item of items) builtItems.push(await this.buildPurchaseItem(item));

        return {
            clientMutationId: this.optionalClientMutationId(data.client_mutation_id ?? data.clientMutationId),
            merchantId: merchantId === null || merchantId === '' ? null : Number(merchantId),
            purchasedAt: this.requireDateTime(data.purchased_at ?? data.purchasedAt, 'purchased_at'),
            paymentType,
            transactionProvider: this.optionalText(data.transaction_provider ?? data.transactionProvider),
            transactionId: this.optionalText(data.transaction_id ?? data.transactionId),
            note: this.optionalText(data.note),
            items: builtItems,
            total: roundMoney(builtItems.reduce((sum, item) => sum + Number(item.total), 0)).toFixed(2)
        };
    }

    async buildPurchaseItem(data) {
        const productId = this.requireId(data.product_id ?? data.productId, 'product_id');
        const product = await this.catalogRepository.findProductById(productId);
        if (!product) throw this.validationError('product_id must reference product');

        const unit = String(data.unit || '').trim();
        if (!isUnitAllowed(product.measurementType, unit)) {
            throw this.validationError(`unit must match product measurement_type; allowed: ${getAllowedUnits(product.measurementType).join(', ')}`);
        }

        const quantity = this.requirePositiveDecimal(data.quantity, 'quantity');
        const total = this.requireNonNegativeMoney(data.total, 'total');

        return {
            productId,
            quantity,
            unit,
            total
        };
    }

    formatCategory(category) {
        return {
            id: Number(category.id),
            name: category.name,
            sortOrder: Number(category.sortOrder ?? category.sort_order ?? 0),
            status: category.status,
            createdAt: category.createdAt,
            updatedAt: category.updatedAt
        };
    }

    formatProduct(product) {
        return {
            id: Number(product.id),
            categoryId: Number(product.categoryId),
            categoryName: product.categoryName,
            name: product.name,
            measurementType: product.measurementType,
            status: product.status,
            allowedUnits: getAllowedUnits(product.measurementType),
            createdAt: product.createdAt,
            updatedAt: product.updatedAt
        };
    }

    formatMerchant(merchant) {
        return {
            id: Number(merchant.id),
            name: merchant.name,
            status: merchant.status,
            createdAt: merchant.createdAt,
            updatedAt: merchant.updatedAt
        };
    }

    formatPurchase(purchase) {
        return {
            id: Number(purchase.id),
            clientMutationId: purchase.clientMutationId || null,
            merchantId: purchase.merchantId === null || purchase.merchantId === undefined ? null : Number(purchase.merchantId),
            merchantName: purchase.merchantName || null,
            purchasedAt: this.formatDateTime(purchase.purchasedAt),
            paymentType: purchase.paymentType,
            transactionProvider: purchase.transactionProvider || null,
            transactionId: purchase.transactionId || null,
            total: Number(purchase.total),
            note: purchase.note || null,
            hasReceipt: Boolean(purchase.receiptId),
            receipt: purchase.receiptId ? {id: Number(purchase.receiptId)} : null,
            items: Array.isArray(purchase.items) ? purchase.items.map(item => this.formatPurchaseItem(item)) : [],
            createdAt: purchase.createdAt,
            updatedAt: purchase.updatedAt
        };
    }

    formatPurchaseItem(item) {
        return {
            id: Number(item.id),
            purchaseId: Number(item.purchaseId),
            productId: Number(item.productId),
            productName: item.productName,
            categoryId: Number(item.categoryId),
            categoryName: item.categoryName,
            measurementType: item.measurementType,
            productStatus: item.productStatus,
            quantity: Number(item.quantity),
            unit: item.unit,
            total: Number(item.total),
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        };
    }

    requireId(value, field) {
        const id = Number(value);
        if (!Number.isInteger(id) || id <= 0) throw this.validationError(`${field} must be a positive integer`);
        return id;
    }

    requireName(value, field) {
        const name = String(value || '').trim();
        if (!name) throw this.validationError(`${field} is required`);
        if (name.length > 255) throw this.validationError(`${field} is too long`);
        return name;
    }

    requireDateTime(value, field) {
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return value.toISOString().slice(0, 19).replace('T', ' ');
        }

        const text = String(value || '').trim();
        if (!text) throw this.validationError(`${field} is required`);
        const date = new Date(text);
        if (Number.isNaN(date.getTime())) throw this.validationError(`${field} must be a valid date`);
        return date.toISOString().slice(0, 19).replace('T', ' ');
    }

    requirePositiveDecimal(value, field) {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) throw this.validationError(`${field} must be greater than zero`);
        return number.toFixed(3);
    }

    requireNonNegativeMoney(value, field) {
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0) throw this.validationError(`${field} must be zero or greater`);
        return roundMoney(number).toFixed(2);
    }

    optionalText(value) {
        if (value === null || value === undefined) return null;
        const text = String(value).trim();
        return text ? text : null;
    }

    optionalClientMutationId(value) {
        const text = this.optionalText(value);
        if (!text) return null;
        if (text.length > 128) throw this.validationError('client_mutation_id is too long');
        if (!/^[A-Za-z0-9:._-]+$/.test(text)) throw this.validationError('client_mutation_id contains invalid characters');
        return text;
    }

    formatDateTime(value) {
        if (!value) return null;
        if (value instanceof Date) return value.toISOString();
        return value;
    }

    validationError(message) {
        const error = new Error(message);
        error.statusCode = 400;
        return error;
    }
}

export {PAYMENT_TYPES, ProductCatalogService, roundMoney};
export default new ProductCatalogService();
