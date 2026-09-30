import test from 'node:test';
import assert from 'node:assert/strict';

import {ReceiptOcrService, SAFE_FAILURE_MESSAGE} from '../src/services/ReceiptOcrService.js';

const receipt = {
    id: 101,
    userId: 7,
    purchaseId: null,
    storageKey: 'receipt.jpg',
    mimeType: 'image/jpeg'
};

function makeService({adapterResult = {rawText: 'TEST MARKET\nTOTAL 77.00'}, adapterError = null, adapterDelay = 0} = {}) {
    const calls = {recognize: 0};
    const storage = {
        async read(storageKey) {
            assert.equal(storageKey, receipt.storageKey);
            return Buffer.from('fake-image');
        }
    };
    const receiptRepository = {
        async findById(userId, receiptId) {
            if (Number(userId) !== 7 || Number(receiptId) !== receipt.id) return null;
            return receipt;
        }
    };
    const ocrRepository = {
        row: null,
        processingCount: 0,
        async findByReceiptId(receiptId) {
            return Number(receiptId) === receipt.id ? this.row : null;
        },
        async markProcessing(receiptId, meta) {
            this.processingCount += 1;
            this.row = {
                id: 1,
                receiptId,
                status: 'processing',
                rawText: null,
                errorMessage: null,
                durationMs: null,
                createdAt: 'created',
                updatedAt: 'processing',
                ...meta
            };
            return this.row;
        },
        async markCompleted(receiptId, data) {
            this.row = {
                ...this.row,
                receiptId,
                status: 'completed',
                rawText: data.rawText,
                errorMessage: null,
                durationMs: data.durationMs,
                updatedAt: 'completed',
                engine: data.engine,
                engineVersion: data.engineVersion,
                language: data.language
            };
            return this.row;
        },
        async markFailed(receiptId, data) {
            this.row = {
                ...this.row,
                receiptId,
                status: 'failed',
                rawText: null,
                errorMessage: data.errorMessage,
                durationMs: data.durationMs,
                updatedAt: 'failed',
                engine: data.engine,
                engineVersion: data.engineVersion,
                language: data.language
            };
            return this.row;
        }
    };
    const adapter = {
        engine: 'tesseract',
        language: 'ukr+eng',
        async getVersion() {
            return 'tesseract 5-test';
        },
        async recognize(input) {
            calls.recognize += 1;
            calls.lastRecognizeInput = input;
            if (adapterDelay) await new Promise(resolve => setTimeout(resolve, adapterDelay));
            if (adapterError) throw adapterError;
            return {
                engine: 'tesseract',
                engineVersion: 'tesseract 5-test',
                language: 'ukr+eng',
                ...adapterResult
            };
        }
    };

    return {
        service: new ReceiptOcrService({receiptRepository, ocrRepository, storage, adapter, maxConcurrent: 1}),
        ocrRepository,
        calls
    };
}

test('owner can run OCR and raw text is persisted as completed', async () => {
    const {service, ocrRepository, calls} = makeService();

    const result = await service.runOcr(7, receipt.id);

    assert.equal(calls.recognize, 1);
    assert.equal(result.receiptId, receipt.id);
    assert.equal(result.status, 'completed');
    assert.equal(result.rawText, 'TEST MARKET\nTOTAL 77.00');
    assert.equal(result.engine, 'tesseract');
    assert.equal(result.language, 'ukr+eng');
    assert.equal(ocrRepository.row.rawText, 'TEST MARKET\nTOTAL 77.00');
    assert.equal(calls.lastRecognizeInput.psm, undefined);
    assert.equal(calls.lastRecognizeInput.mimeType, receipt.mimeType);
});

test('another user cannot start or read receipt OCR', async () => {
    const {service, calls} = makeService();

    await assert.rejects(() => service.runOcr(8, receipt.id), /Receipt not found/);
    await assert.rejects(() => service.getOcr(8, receipt.id), /Receipt not found/);
    assert.equal(calls.recognize, 0);
});

test('missing receipt returns not found before OCR adapter runs', async () => {
    const {service, calls} = makeService();

    await assert.rejects(() => service.runOcr(7, 999), /Receipt not found/);
    assert.equal(calls.recognize, 0);
});

test('OCR failure stores failed state without stack or storage path', async () => {
    const {service, ocrRepository} = makeService({
        adapterError: new Error('/data/receipts/secret.jpg exploded')
    });

    const result = await service.runOcr(7, receipt.id);

    assert.equal(result.status, 'failed');
    assert.equal(result.rawText, null);
    assert.equal(result.error, SAFE_FAILURE_MESSAGE);
    assert.equal(ocrRepository.row.errorMessage, SAFE_FAILURE_MESSAGE);
    assert.doesNotMatch(result.error, /\/data\/receipts|exploded|secret/);
});

test('repeated concurrent request for same receipt does not spawn duplicate OCR', async () => {
    const {service, calls} = makeService({adapterDelay: 25});

    const [first, second] = await Promise.all([
        service.runOcr(7, receipt.id),
        service.runOcr(7, receipt.id)
    ]);

    assert.equal(calls.recognize, 1);
    assert.equal(first.status, 'completed');
    assert.equal(second.status, 'completed');
});

test('re-run replaces current OCR row instead of creating history', async () => {
    const {service, ocrRepository, calls} = makeService();

    await service.runOcr(7, receipt.id);
    await service.runOcr(7, receipt.id);

    assert.equal(calls.recognize, 2);
    assert.equal(ocrRepository.processingCount, 2);
    assert.equal(ocrRepository.row.id, 1);
    assert.equal(ocrRepository.row.status, 'completed');
});
