import test from 'node:test';
import assert from 'node:assert/strict';

import {ProductCatalogService} from '../src/services/ProductCatalogService.js';
import {normalizeQuantity} from '../src/services/ProductUnitService.js';

const categories = [
    {id: 1, name: 'Овочі', sortOrder: 10, status: 'active'},
    {id: 2, name: 'Фрукти', sortOrder: 20, status: 'active'}
];

const products = [
    {id: 10, categoryId: 1, categoryName: 'Овочі', name: 'Помідори', measurementType: 'weight', status: 'active'},
    {id: 11, categoryId: 1, categoryName: 'Овочі', name: 'Огірки', measurementType: 'weight', status: 'active'},
    {id: 12, categoryId: 1, categoryName: 'Овочі', name: 'Курятина', measurementType: 'weight', status: 'disabled'}
];

const merchants = [
    {id: 7, name: 'Базар', status: 'active'}
];

function makeService() {
    const catalogRepository = {
        findCategories: async () => categories,
        findProducts: async () => products,
        findCategoryById: async id => categories.find(item => Number(item.id) === Number(id)) || null,
        findProductById: async id => products.find(item => Number(item.id) === Number(id)) || null,
        findMerchants: async () => merchants,
        findMerchantById: async id => merchants.find(item => Number(item.id) === Number(id)) || null,
        createProduct: async product => ({
            id: 99,
            categoryName: 'Фрукти',
            ...product
        }),
        updateProduct: async (id, product) => ({
            id,
            categoryName: 'Фрукти',
            ...product
        }),
        createMerchant: async merchant => ({id: 8, status: 'active', ...merchant})
    };
    const purchasesRepository = {
        createPurchase: async (userId, purchase) => ({
            id: 123,
            merchantName: 'Базар',
            ...purchase,
            items: purchase.items.map((item, index) => ({
                id: index + 1,
                purchaseId: 123,
                productName: products.find(product => product.id === item.productId)?.name,
                categoryId: 1,
                categoryName: 'Овочі',
                measurementType: 'weight',
                productStatus: products.find(product => product.id === item.productId)?.status,
                ...item
            }))
        }),
        replacePurchase: async (userId, purchaseId, purchase) => ({id: purchaseId, ...purchase}),
        findPurchases: async () => [],
        findPurchaseById: async () => null
    };

    return new ProductCatalogService({catalogRepository, purchasesRepository});
}

test('creates product with category assignment and measurement validation', async () => {
    const service = makeService();
    const product = await service.createProduct({
        name: 'Помело',
        category_id: 2,
        measurement_type: 'weight'
    });

    assert.equal(product.name, 'Помело');
    assert.equal(product.categoryId, 2);
    assert.deepEqual(product.allowedUnits, ['g', 'kg']);
    await assert.rejects(() => service.createProduct({name: 'Bad', category_id: 2, measurement_type: 'box'}), /measurement_type/);
});

test('validates units by product measurement type', async () => {
    const service = makeService();

    await assert.rejects(() => service.createPurchase(1, {
        purchased_at: '2026-09-28T12:00:00',
        payment_type: 'cash',
        items: [{product_id: 10, quantity: 1, unit: 'ml', total: 20}]
    }), /unit must match/);
});

test('creates cash purchase without merchant or transaction and recalculates total', async () => {
    const service = makeService();
    const purchase = await service.createPurchase(1, {
        purchased_at: '2026-09-28T12:00:00',
        payment_type: 'cash',
        transaction_provider: null,
        transaction_id: null,
        items: [
            {product_id: 10, quantity: 0.85, unit: 'kg', total: 76.42},
            {product_id: 11, quantity: 1.2, unit: 'kg', total: 84},
            {product_id: 12, quantity: 0.75, unit: 'kg', total: 165}
        ]
    });

    assert.equal(purchase.merchantId, null);
    assert.equal(purchase.transactionProvider, null);
    assert.equal(purchase.total, 325.42);
    assert.equal(purchase.items.length, 3);
    assert.equal(purchase.items[2].productStatus, 'disabled');
});

test('passes client mutation id so repository can make purchase create idempotent', async () => {
    let createCalls = 0;
    const catalogRepository = {
        findCategoryById: async id => categories.find(item => Number(item.id) === Number(id)) || null,
        findProductById: async id => products.find(item => Number(item.id) === Number(id)) || null,
        findMerchantById: async () => null
    };
    const purchasesRepository = {
        createPurchase: async (userId, purchase) => {
            createCalls += 1;
            return {
                id: 123,
                merchantName: null,
                ...purchase,
                items: purchase.items.map((item, index) => ({
                    id: index + 1,
                    purchaseId: 123,
                    productName: 'Помідори',
                    categoryId: 1,
                    categoryName: 'Овочі',
                    measurementType: 'weight',
                    productStatus: 'active',
                    ...item
                }))
            };
        }
    };
    const service = new ProductCatalogService({catalogRepository, purchasesRepository});
    const purchase = await service.createPurchase(1, {
        client_mutation_id: 'local-purchase-abc',
        purchased_at: '2026-09-28T12:00:00',
        payment_type: 'cash',
        items: [{product_id: 10, quantity: 1, unit: 'kg', total: 20}]
    });

    assert.equal(createCalls, 1);
    assert.equal(purchase.clientMutationId, 'local-purchase-abc');
});

test('creates purchase from receipt through transactional repository path', async () => {
    let captured = null;
    const catalogRepository = {
        findCategoryById: async id => categories.find(item => Number(item.id) === Number(id)) || null,
        findProductById: async id => products.find(item => Number(item.id) === Number(id)) || null,
        findMerchantById: async id => merchants.find(item => Number(item.id) === Number(id)) || null
    };
    const purchasesRepository = {
        createPurchaseFromReceipt: async (userId, receiptId, purchase) => {
            captured = {userId, receiptId, purchase};
            return {
                status: 'created',
                purchase: {
                    id: 222,
                    merchantName: 'Базар',
                    receiptId: 44,
                    ...purchase,
                    items: purchase.items.map((item, index) => ({
                        id: index + 1,
                        purchaseId: 222,
                        productName: 'Помідори',
                        categoryId: 1,
                        categoryName: 'Овочі',
                        measurementType: 'weight',
                        productStatus: 'active',
                        ...item
                    }))
                }
            };
        }
    };
    const service = new ProductCatalogService({catalogRepository, purchasesRepository});

    const result = await service.createPurchaseFromReceipt(7, 44, {
        client_mutation_id: 'receipt-review-44',
        merchant_id: 7,
        purchased_at: '2026-09-28T12:00:00',
        payment_type: 'bank',
        items: [{product_id: 10, quantity: 1.25, unit: 'kg', total: 55}]
    });

    assert.equal(captured.userId, 7);
    assert.equal(captured.receiptId, 44);
    assert.equal(captured.purchase.clientMutationId, 'receipt-review-44');
    assert.equal(captured.purchase.total, '55.00');
    assert.equal(result.status, 'created');
    assert.equal(result.idempotent, false);
    assert.equal(result.purchase.hasReceipt, true);
    assert.equal(result.purchase.receipt.id, 44);
});

test('receipt confirmation reports idempotent linked purchase without duplicate create', async () => {
    const catalogRepository = {
        findCategoryById: async id => categories.find(item => Number(item.id) === Number(id)) || null,
        findProductById: async id => products.find(item => Number(item.id) === Number(id)) || null,
        findMerchantById: async () => null
    };
    const purchasesRepository = {
        createPurchaseFromReceipt: async (userId, receiptId, purchase) => ({
            status: 'already_linked',
            purchase: {
                id: 222,
                merchantId: null,
                merchantName: null,
                receiptId,
                ...purchase,
                items: purchase.items.map((item, index) => ({
                    id: index + 1,
                    purchaseId: 222,
                    productName: 'Помідори',
                    categoryId: 1,
                    categoryName: 'Овочі',
                    measurementType: 'weight',
                    productStatus: 'active',
                    ...item
                }))
            }
        })
    };
    const service = new ProductCatalogService({catalogRepository, purchasesRepository});

    const result = await service.createPurchaseFromReceipt(7, 44, {
        client_mutation_id: 'receipt-review-44',
        purchased_at: '2026-09-28T12:00:00',
        payment_type: 'bank',
        items: [{product_id: 10, quantity: 1, unit: 'kg', total: 20}]
    });

    assert.equal(result.status, 'already_linked');
    assert.equal(result.idempotent, true);
    assert.equal(result.purchase.id, 222);
    assert.equal(result.purchase.hasReceipt, true);
});

test('passes purchase date range options to repository list', async () => {
    let captured = null;
    const service = new ProductCatalogService({
        catalogRepository: {},
        purchasesRepository: {
            findPurchases: async (userId, options) => {
                captured = {userId, options};
                return [{
                    id: 1,
                    clientMutationId: 'cm-1',
                    merchantId: null,
                    merchantName: null,
                    purchasedAt: '2026-09-12T12:00:00',
                    paymentType: 'bank',
                    total: 10,
                    items: [{
                        id: 1,
                        purchaseId: 1,
                        productId: 10,
                        productName: 'Помідори',
                        categoryId: 1,
                        categoryName: 'Овочі',
                        measurementType: 'weight',
                        productStatus: 'active',
                        quantity: 1,
                        unit: 'kg',
                        total: 10
                    }]
                }];
            }
        }
    });

    const dateFrom = new Date(2026, 8, 1, 0, 0, 0, 0).getTime();
    const dateTo = new Date(2026, 8, 29, 12, 0, 0, 0).getTime();
    const purchases = await service.getPurchases(7, {dateFrom, dateTo});

    assert.deepEqual(captured, {userId: 7, options: {dateFrom, dateTo}});
    assert.equal(purchases.length, 1);
    assert.equal(purchases[0].items.length, 1);
});

test('purchase list item mapping matches purchase detail endpoint shape', async () => {
    const purchase = {
        id: 1,
        clientMutationId: 'cm-1',
        merchantId: 7,
        merchantName: 'Базар',
        purchasedAt: '2026-09-12T12:00:00',
        paymentType: 'bank',
        total: 10,
        items: [{
            id: 11,
            purchaseId: 1,
            productId: 10,
            productName: 'Помідори',
            categoryId: 1,
            categoryName: 'Овочі',
            measurementType: 'weight',
            productStatus: 'active',
            quantity: 1,
            unit: 'kg',
            total: 10
        }]
    };
    const service = new ProductCatalogService({
        catalogRepository: {},
        purchasesRepository: {
            findPurchases: async () => [purchase],
            findPurchaseById: async () => purchase
        }
    });

    const [listed] = await service.getPurchases(7, {dateFrom: 1, dateTo: 2});
    const detail = await service.getPurchase(7, 1);

    assert.deepEqual(listed.items, detail.items);
    assert.deepEqual(Object.keys(listed.items[0]).sort(), Object.keys(detail.items[0]).sort());
});

test('allows optional merchant and validates money/decimal quantity', async () => {
    const service = makeService();
    await assert.rejects(() => service.createPurchase(1, {
        merchant_id: 7,
        purchased_at: '2026-09-28T12:00:00',
        payment_type: 'cash',
        items: [{product_id: 10, quantity: 0, unit: 'kg', total: 1}]
    }), /quantity/);
    await assert.rejects(() => service.createPurchase(1, {
        merchant_id: 7,
        purchased_at: '2026-09-28T12:00:00',
        payment_type: 'cash',
        items: [{product_id: 10, quantity: 1, unit: 'kg', total: -1}]
    }), /total/);
});

test('normalizes kg/g and l/ml while preserving entered unit outside analytics', () => {
    assert.deepEqual(normalizeQuantity(0.85, 'kg'), {quantity: 850, unit: 'g'});
    assert.deepEqual(normalizeQuantity(900, 'ml'), {quantity: 900, unit: 'ml'});
    assert.deepEqual(normalizeQuantity(0.85, 'l'), {quantity: 850, unit: 'ml'});
    assert.deepEqual(normalizeQuantity(10, 'pcs'), {quantity: 10, unit: 'pcs'});
});

test('receipt raw name is purchase item evidence and does not alter factual amount unit price', async () => {
    const service = makeService();
    const purchase = await service.createPurchase(1, {
        purchased_at: '2026-09-28T12:00:00',
        payment_type: 'cash',
        items: [{
            product_id: 10,
            quantity: 900,
            unit: 'g',
            total: 46.50,
            raw_name: 'Хліб пш.Панський 400г'
        }]
    });

    assert.equal(purchase.items[0].quantity, 900);
    assert.equal(purchase.items[0].unit, 'g');
    assert.equal(purchase.items[0].total, 46.50);
    assert.equal(purchase.items[0].rawName, 'Хліб пш.Панський 400г');
});
