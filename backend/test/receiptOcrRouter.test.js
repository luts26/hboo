import test from 'node:test';
import assert from 'node:assert/strict';

import routes, {findRoute} from '../src/http/router.js';

test('receipt OCR routes are authenticated and map receipt id with ocr mode', () => {
    assert.equal(routes['POST /api/receipts/:receiptId/ocr'].public, undefined);
    assert.equal(routes['GET /api/receipts/:receiptId/ocr'].public, undefined);

    const post = findRoute('POST', '/api/receipts/55/ocr');
    const get = findRoute('GET', '/api/receipts/55/ocr');

    assert.equal(post.route, routes['POST /api/receipts/:receiptId/ocr']);
    assert.equal(get.route, routes['GET /api/receipts/:receiptId/ocr']);
    assert.equal(post.params.receiptId, '55');
    assert.equal(post.params.mode, 'ocr');
    assert.equal(post.params.purchaseId, undefined);
    assert.equal(get.params.receiptId, '55');
    assert.equal(get.params.mode, 'ocr');
    assert.equal(get.params.purchaseId, undefined);
});
