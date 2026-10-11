import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const read = filePath => fs.readFileSync(path.join(backendRoot, filePath), 'utf8');

test('receipt confirmation repository creates purchase and links receipt in one transaction', () => {
    const source = read('src/repositories/PurchaseRepository.js');
    const method = source.match(/async createPurchaseFromReceipt\(userId, receiptId, purchase\) \{[\s\S]*?\n    async replacePurchase/)?.[0] || '';

    assert.match(method, /await connection\.beginTransaction\(\)/);
    assert.match(method, /FOR UPDATE/);
    assert.match(method, /receipt\.purchaseId/);
    assert.match(method, /findPurchaseByClientMutationId/);
    assert.match(method, /INSERT INTO purchase/);
    assert.match(method, /INSERT INTO purchase_item/);
    assert.match(method, /createPurchaseTransactionLinkIfPresent/);
    assert.match(method, /UPDATE receipt[\s\S]*SET purchase_id = \?/);
    assert.match(method, /linkResult\.affectedRows !== 1[\s\S]*await connection\.rollback\(\)/);
    assert.match(method, /catch \(error\)[\s\S]*await connection\.rollback\(\)/);
    assert.match(method, /finally[\s\S]*connection\.release\(\)/);
});

test('receipt confirmation links purchase to existing bank transaction through purchase_transaction_link', () => {
    const source = read('src/repositories/PurchaseRepository.js');

    assert.match(source, /import transactionRepository from '\.\/TransactionRepository\.js'/);
    assert.match(source, /async createPurchaseTransactionLinkIfPresent\(connection, purchaseId, purchase\)/);
    assert.match(source, /purchase\.transactionProvider/);
    assert.match(source, /purchase\.transactionId/);
    assert.match(source, /findPurchaseTransactionLinkByPurchaseWithConnection/);
    assert.match(source, /findPurchaseTransactionLinkByTransactionWithConnection/);
    assert.match(source, /PURCHASE_TRANSACTION_CONFLICT/);
    assert.match(source, /createPurchaseTransactionLinkWithConnection/);
});
