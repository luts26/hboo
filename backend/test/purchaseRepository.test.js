import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../src/database/mysql.js';
import purchaseRepository from '../src/repositories/PurchaseRepository.js';

test('findPurchases loads item rows for all returned purchases with one bulk item query', async () => {
    const originalExecute = pool.execute;
    const calls = [];
    pool.execute = async (sql, params) => {
        calls.push({sql, params});
        if (sql.includes('FROM purchase p')) {
            return [[
                {id: 1, userId: 7, merchantName: 'Novus', purchasedAt: '2026-09-29 12:00:00', paymentType: 'bank', total: 100},
                {id: 2, userId: 7, merchantName: 'АТБ', purchasedAt: '2026-09-28 12:00:00', paymentType: 'bank', total: 50}
            ]];
        }
        if (sql.includes('FROM purchase_item pi')) {
            assert.match(sql, /WHERE pi\.purchase_id IN \(\?, \?\)/);
            assert.deepEqual(params, [1, 2]);
            return [[
                {id: 11, purchaseId: 1, productId: 101, productName: 'Молоко', categoryId: 30, categoryName: 'Молочні', measurementType: 'volume', productStatus: 'active', quantity: 2, unit: 'l', total: 100},
                {id: 12, purchaseId: 2, productId: 102, productName: 'Рис', categoryId: 60, categoryName: 'Крупи та макарони', measurementType: 'weight', productStatus: 'active', quantity: 1, unit: 'kg', total: 50}
            ]];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
    };

    try {
        const purchases = await purchaseRepository.findPurchases(7, {
            dateFrom: new Date(2026, 8, 1, 0, 0, 0, 0).getTime(),
            dateTo: new Date(2026, 8, 29, 12, 0, 0, 0).getTime()
        });

        assert.equal(calls.length, 2);
        assert.equal(purchases.length, 2);
        assert.equal(purchases[0].items.length, 1);
        assert.equal(purchases[1].items.length, 1);
        assert.equal(purchases[0].items[0].categoryName, 'Молочні');
    } finally {
        pool.execute = originalExecute;
    }
});

test('findPurchases applies inclusive date range before loading selected item rows', async () => {
    const originalExecute = pool.execute;
    const calls = [];
    pool.execute = async (sql, params) => {
        calls.push({sql, params});
        if (sql.includes('FROM purchase p')) {
            assert.match(sql, /p\.purchased_at >= \?/);
            assert.match(sql, /p\.purchased_at <= \?/);
            assert.deepEqual(params.slice(0, 3), [7, '2026-09-01 00:00:00', '2026-09-30 23:59:59']);
            return [[
                {id: 2, userId: 7, merchantName: 'АТБ', purchasedAt: '2026-09-30 23:59:59', paymentType: 'bank', total: 50}
            ]];
        }
        if (sql.includes('FROM purchase_item pi')) {
            assert.match(sql, /WHERE pi\.purchase_id IN \(\?\)/);
            assert.deepEqual(params, [2]);
            return [[
                {id: 12, purchaseId: 2, productId: 102, productName: 'Рис', categoryId: 60, categoryName: 'Крупи та макарони', measurementType: 'weight', productStatus: 'active', quantity: 1, unit: 'kg', total: 50}
            ]];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
    };

    try {
        const purchases = await purchaseRepository.findPurchases(7, {
            dateFrom: new Date(2026, 8, 1, 0, 0, 0, 0).getTime(),
            dateTo: new Date(2026, 8, 30, 23, 59, 59, 999).getTime()
        });

        assert.equal(calls.length, 2);
        assert.equal(purchases.length, 1);
        assert.equal(purchases[0].items.length, 1);
    } finally {
        pool.execute = originalExecute;
    }
});

test('findPurchases returns empty range without querying purchase items', async () => {
    const originalExecute = pool.execute;
    const calls = [];
    pool.execute = async sql => {
        calls.push(sql);
        if (sql.includes('FROM purchase p')) return [[]];
        throw new Error(`Unexpected SQL: ${sql}`);
    };

    try {
        const purchases = await purchaseRepository.findPurchases(7, {
            dateFrom: new Date(2026, 7, 1, 0, 0, 0, 0).getTime(),
            dateTo: new Date(2026, 7, 31, 23, 59, 59, 999).getTime()
        });

        assert.deepEqual(purchases, []);
        assert.equal(calls.length, 1);
    } finally {
        pool.execute = originalExecute;
    }
});

test('findPurchases rejects invalid date ranges instead of falling back to full history', async () => {
    await assert.rejects(() => purchaseRepository.findPurchases(7, {dateFrom: null, dateTo: null}), /Invalid purchase date range/);
    await assert.rejects(() => purchaseRepository.findPurchases(7, {dateFrom: 10, dateTo: 1}), /Invalid purchase date range/);
});
