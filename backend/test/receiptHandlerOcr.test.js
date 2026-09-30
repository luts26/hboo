import test from 'node:test';
import assert from 'node:assert/strict';

import {createReceiptHandler} from '../src/handlers/receiptHandler.js';

function makeResponse() {
    return {
        statusCode: null,
        headers: null,
        body: '',
        writeHead(statusCode, headers) {
            this.statusCode = statusCode;
            this.headers = headers;
        },
        end(body = '') {
            this.body = String(body);
        }
    };
}

test('POST /api/receipts/:receiptId/ocr accepts empty body and does not parse multipart upload', async () => {
    let multipartCalled = false;
    let ocrCalled = false;
    const handler = createReceiptHandler({
        receipts: {},
        ocr: {
            async runOcr(userId, receiptId) {
                ocrCalled = true;
                assert.equal(userId, 7);
                assert.equal(receiptId, '4');
                return {
                    receiptId: 4,
                    status: 'completed',
                    rawText: 'TEST MARKET',
                    engine: 'tesseract',
                    language: 'ukr+eng'
                };
            }
        },
        async readForm() {
            multipartCalled = true;
            throw new Error('multipart parser should not be called');
        }
    });
    const req = {
        method: 'POST',
        headers: {'content-length': '0'},
        user: {user_id: 7},
        params: {receiptId: '4', mode: 'ocr'}
    };
    const res = makeResponse();

    await handler(req, res);

    assert.equal(ocrCalled, true);
    assert.equal(multipartCalled, false);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), {
        receiptId: 4,
        status: 'completed',
        rawText: 'TEST MARKET',
        engine: 'tesseract',
        language: 'ukr+eng'
    });
});

test('POST /api/receipts still uses multipart upload parser', async () => {
    let multipartCalled = false;
    const handler = createReceiptHandler({
        receipts: {
            async saveStandaloneReceipt(userId, payload) {
                assert.equal(userId, 7);
                assert.equal(payload.clientMutationId, 'receipt-mutation');
                return {id: 4, purchaseId: null};
            }
        },
        ocr: {},
        async readForm() {
            multipartCalled = true;
            return {
                files: {receipt: {data: Buffer.from('fake')}},
                fields: {client_mutation_id: 'receipt-mutation'}
            };
        }
    });
    const req = {
        method: 'POST',
        headers: {},
        user: {user_id: 7},
        params: {}
    };
    const res = makeResponse();

    await handler(req, res);

    assert.equal(multipartCalled, true);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(JSON.parse(res.body), {id: 4, purchaseId: null});
});

test('GET /api/receipts/:receiptId/parse returns parser draft without multipart upload', async () => {
    let multipartCalled = false;
    let parserCalled = false;
    const handler = createReceiptHandler({
        receipts: {},
        ocr: {},
        parser: {
            async parseReceipt(userId, receiptId) {
                parserCalled = true;
                assert.equal(userId, 7);
                assert.equal(receiptId, '4');
                return {
                    receiptId: 4,
                    draft: {
                        parserVersion: 'receipt-parser-v1',
                        items: []
                    }
                };
            }
        },
        async readForm() {
            multipartCalled = true;
            throw new Error('multipart parser should not be called');
        }
    });
    const req = {
        method: 'GET',
        headers: {},
        user: {user_id: 7},
        params: {receiptId: '4', mode: 'parse'}
    };
    const res = makeResponse();

    await handler(req, res);

    assert.equal(parserCalled, true);
    assert.equal(multipartCalled, false);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), {
        receiptId: 4,
        draft: {
            parserVersion: 'receipt-parser-v1',
            items: []
        }
    });
});

test('POST /api/receipts/:receiptId/confirm reads JSON and creates purchase from receipt', async () => {
    let captured = null;
    const handler = createReceiptHandler({
        receipts: {},
        ocr: {},
        parser: {},
        purchaseConfirmation: {
            async createPurchaseFromReceipt(userId, receiptId, payload) {
                captured = {userId, receiptId, payload};
                return {
                    status: 'created',
                    idempotent: false,
                    purchase: {id: 9, receipt: {id: 4}}
                };
            }
        },
        async readForm() {
            throw new Error('multipart parser should not be called');
        }
    });
    const req = {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        user: {user_id: 7},
        params: {receiptId: '4', mode: 'confirm'},
        async *[Symbol.asyncIterator]() {
            yield Buffer.from(JSON.stringify({
                client_mutation_id: 'receipt-review-4',
                payment_type: 'bank',
                items: [{product_id: 10, quantity: 1, unit: 'pcs', total: 20}]
            }));
        }
    };
    const res = makeResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(captured.userId, 7);
    assert.equal(captured.receiptId, '4');
    assert.equal(captured.payload.client_mutation_id, 'receipt-review-4');
    assert.deepEqual(JSON.parse(res.body), {
        status: 'created',
        idempotent: false,
        purchase: {id: 9, receipt: {id: 4}}
    });
});
