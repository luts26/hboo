import test from 'node:test';
import assert from 'node:assert/strict';

import {ReceiptParserService} from '../src/services/ReceiptParserService.js';

const receipt = {
    id: 101,
    userId: 7,
    purchaseId: null
};

function makeService({ocr = {id: 5, receiptId: 101, status: 'completed', rawText: 'TEST\nСУМА 12,34', updatedAt: 'updated'}} = {}) {
    const receiptRepository = {
        async findById(userId, receiptId) {
            if (Number(userId) !== 7 || Number(receiptId) !== receipt.id) return null;
            return receipt;
        }
    };
    const ocrRepository = {
        async findByReceiptId(receiptId) {
            return Number(receiptId) === receipt.id ? ocr : null;
        }
    };
    return new ReceiptParserService({
        receipts: receiptRepository,
        ocrRepository,
        parser(rawText) {
            return {rawText, parserVersion: 'test-parser'};
        }
    });
}

test('receipt parser service requires receipt ownership and completed OCR', async () => {
    const service = makeService();

    await assert.rejects(() => service.parseReceipt(8, receipt.id), /Receipt not found/);
    await assert.rejects(() => makeService({ocr: null}).parseReceipt(7, receipt.id), /Receipt OCR is not completed/);
    await assert.rejects(() => makeService({ocr: {status: 'processing'}}).parseReceipt(7, receipt.id), /Receipt OCR is not completed/);
});

test('receipt parser service returns deterministic draft from persisted raw OCR only', async () => {
    const result = await makeService().parseReceipt(7, receipt.id);

    assert.equal(result.receiptId, 101);
    assert.equal(result.ocrId, 5);
    assert.equal(result.ocrUpdatedAt, 'updated');
    assert.deepEqual(result.draft, {
        rawText: 'TEST\nСУМА 12,34',
        parserVersion: 'test-parser'
    });
});
