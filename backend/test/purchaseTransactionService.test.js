import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../src/database/mysql.js';
import purchaseTransactionService from '../src/services/PurchaseTransactionService.js';

test.after(async () => {
    await pool.end();
});

test('scores exact amount same-day merchant match as strongest candidate', () => {
    const candidate = purchaseTransactionService.formatCandidate({
        provider: 'mono',
        providerTransactionId: 'tx-1',
        timestamp: new Date('2026-10-05T09:30:00Z').getTime(),
        amount: -1516.35,
        description: 'АТБ MARKET',
        category: '5411'
    }, {
        id: 10,
        merchantName: 'АТБ',
        purchasedAt: '2026-10-05 12:00:00',
        total: 1516.35,
        note: null
    });

    assert.equal(candidate.score, 100);
    assert.deepEqual(candidate.reasons, ['exact amount', 'same date', 'merchant match']);
});

test('keeps unrelated nearby expense below conservative candidate threshold', () => {
    const candidate = purchaseTransactionService.formatCandidate({
        provider: 'privat',
        providerTransactionId: 'tx-2',
        timestamp: new Date('2026-10-08T09:30:00Z').getTime(),
        amount: -420,
        description: 'Unknown merchant',
        category: '11'
    }, {
        id: 10,
        merchantName: 'АТБ',
        purchasedAt: '2026-10-05 12:00:00',
        total: 1516.35,
        note: null
    });

    assert.ok(candidate.score < 65);
    assert.equal(candidate.signals.amount, 0);
    assert.equal(candidate.signals.merchant, 0);
});

test('allows bounded fallback only for still-reasonable candidates', () => {
    const closeAmountCandidate = {
        score: 50,
        signals: {amount: 0.55, merchant: 0, date: 0.8}
    };
    const unrelatedCandidate = {
        score: 50,
        signals: {amount: 0.25, merchant: 0, date: 1}
    };

    assert.equal(purchaseTransactionService.isReasonableFallbackCandidate(closeAmountCandidate), true);
    assert.equal(purchaseTransactionService.isReasonableFallbackCandidate(unrelatedCandidate), false);
});

test('rejects invalid providers before link creation', async () => {
    await assert.rejects(
        () => purchaseTransactionService.linkTransaction(1, 10, {
            provider: 'unknown',
            providerTransactionId: 'tx-1'
        }),
        /provider is invalid/
    );
});
