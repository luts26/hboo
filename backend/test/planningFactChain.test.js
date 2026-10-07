import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../src/database/mysql.js';
import planningService from '../src/services/PlanningService.js';
import transactionRepository from '../src/repositories/TransactionRepository.js';

test.after(async () => {
    await pool.end();
});

test('formats Planning fact chain through shared bank transaction identity', () => {
    const [fact] = planningService.formatPlanningFacts([
        {
            planningTransactionLinkId: 7,
            planningItemId: 123,
            planningLinkedAt: '2026-10-05 10:00:00',
            provider: 'mono',
            providerTransactionId: 'tx-atb',
            transactionTimestamp: 1791187200000,
            transactionAmount: -1516.35,
            transactionDescription: 'АТБ',
            transactionCategory: '5411',
            purchaseId: 456,
            merchantId: 8,
            merchantName: 'АТБ',
            purchasedAt: '2026-10-05 12:00:00',
            paymentType: 'bank',
            purchaseTotal: 1516.35,
            receiptId: 789,
            purchaseItemId: 1,
            productId: 2,
            productName: 'Хліб',
            categoryId: 3,
            categoryName: 'Хліб та випічка',
            measurementType: 'weight',
            productStatus: 'active',
            quantity: 400,
            unit: 'g',
            itemTotal: 40.79
        }
    ]);

    assert.equal(fact.transaction.provider, 'mono');
    assert.equal(fact.transaction.providerTransactionId, 'tx-atb');
    assert.equal(fact.transaction.expenseAmount, 1516.35);
    assert.equal(fact.purchase.id, 456);
    assert.equal(fact.purchase.itemCount, 1);
    assert.deepEqual(fact.receipt, {id: 789});
    assert.equal(fact.items[0].productName, 'Хліб');
});

test('keeps partial Planning to Transaction chain when Purchase is missing', () => {
    const [fact] = planningService.formatPlanningFacts([
        {
            planningTransactionLinkId: 8,
            planningItemId: 124,
            planningLinkedAt: '2026-10-06 10:00:00',
            provider: 'privat',
            providerTransactionId: 'tx-no-purchase',
            transactionTimestamp: 1791273600000,
            transactionAmount: -250,
            transactionDescription: 'Payment',
            transactionCategory: 'other',
            purchaseId: null,
            receiptId: null,
            purchaseItemId: null
        }
    ]);

    assert.equal(fact.transaction.providerTransactionId, 'tx-no-purchase');
    assert.equal(fact.purchase, null);
    assert.equal(fact.receipt, null);
    assert.deepEqual(fact.items, []);
});

test('empty rows represent an unlinked or unlinked-purchase state without stale Purchase data', () => {
    assert.deepEqual(planningService.formatPlanningFacts([]), []);
});

test('Planning fact query derives Purchase only by provider and provider transaction id with ownership filters', async () => {
    let capturedSql = '';
    let capturedParams = [];
    const fakeConnection = {
        execute: async (sql, params) => {
            capturedSql = sql;
            capturedParams = params;
            return [[]];
        }
    };

    await transactionRepository.getPlanningItemFacts(10, 123, fakeConnection);

    assert.match(capturedSql, /LEFT JOIN purchase_transaction_link putl[\s\S]*putl\.provider = ptl\.provider[\s\S]*putl\.provider_transaction_id = ptl\.provider_transaction_id/);
    assert.match(capturedSql, /p\.user_id = \?/);
    assert.match(capturedSql, /r\.user_id = \?/);
    assert.deepEqual(capturedParams, [10, 10, 10, 123, 10, 10, 10, 123]);
});
