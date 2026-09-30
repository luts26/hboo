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
