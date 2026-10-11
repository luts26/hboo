import test from 'node:test';
import assert from 'node:assert/strict';

import {ReceiptParserService} from '../src/services/ReceiptParserService.js';

const receipt = {id: 7};
const ocr = {id: 8, status: 'completed', rawText: 'raw', updatedAt: '2026-10-10 10:00:00'};

function makeService({draft, transactionAmount = -120, merchantName = 'NOVUS'} = {}) {
    return new ReceiptParserService({
        receipts: {
            findById: async () => receipt
        },
        ocrRepository: {
            findByReceiptId: async () => ocr
        },
        planning: {
            findItemById: async () => ({
                id: 55,
                title: 'Groceries',
                merchantId: 3,
                shoppingItems: [
                    {id: 1, productId: 11, productName: 'Milk', name: 'Milk', amount: 2, unit: 'l'}
                ]
            })
        },
        transactions: {
            getLinkedPlanningTransactions: async () => [{
                provider: 'mono',
                providerTransactionId: 'tx-1',
                timestamp: 1791619200000,
                amount: transactionAmount,
                description: merchantName
            }]
        },
        catalog: {
            findMerchants: async () => [{id: 3, name: merchantName, status: 'active'}],
            findMerchantById: async () => ({id: 3, name: merchantName, status: 'active'})
        },
        matcher: {
            match: async ({rawName, merchantId, shoppingItems}) => ({
                match: null,
                source: 'shopping_list',
                candidates: [{
                    productId: shoppingItems[0].productId,
                    productName: 'Milk',
                    source: 'shopping_list',
                    merchantId,
                    rawName
                }]
            })
        },
        parser: () => draft
    });
}

test('smart receipt parse enriches OCR items with planning shopping-list suggestions', async () => {
    const service = makeService({
        draft: {
            merchant: {rawName: 'NOVUS', normalizedHint: 'NOVUS'},
            total: {value: 120},
            items: [{rawName: 'МОЛ УЛЬТР 2.5 900МЛ', quantity: 2, unit: 'pcs', total: 120}],
            warnings: []
        }
    });

    const result = await service.parseReceipt(1, 7, {planningItemId: 55});

    assert.equal(result.draft.context.planningItem.id, 55);
    assert.equal(result.draft.context.transaction.providerTransactionId, 'tx-1');
    assert.equal(result.draft.items[0].rawName, 'МОЛ УЛЬТР 2.5 900МЛ');
    assert.equal(result.draft.items[0].productMatchCandidates[0].source, 'shopping_list');
    assert.ok(result.draft.warnings.includes('RECEIPT_TOTAL_MATCHES_TRANSACTION'));
});

test('smart receipt parse reports merchant and amount discrepancies without replacing receipt data', async () => {
    const service = makeService({
        merchantName: 'NOVUS',
        transactionAmount: -150,
        draft: {
            merchant: {rawName: 'АТБ', normalizedHint: 'АТБ'},
            total: {value: 120},
            items: [{rawName: 'ПАКЕТ МАЙКА', quantity: 1, unit: 'pcs', total: 2}],
            warnings: []
        }
    });

    const result = await service.parseReceipt(1, 7, {planningItemId: 55});

    assert.equal(result.draft.merchant.rawName, 'АТБ');
    assert.ok(result.draft.warnings.includes('MERCHANT_CONTEXT_MISMATCH'));
    assert.ok(result.draft.warnings.includes('RECEIPT_TOTAL_TRANSACTION_MISMATCH'));
});
