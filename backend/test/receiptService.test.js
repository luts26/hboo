import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {ReceiptService, sniffMimeType, MAX_RECEIPT_BYTES} from '../src/services/ReceiptService.js';
import {LocalReceiptStorage} from '../src/storage/LocalReceiptStorage.js';

const jpeg = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const png = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const webp = () => Buffer.from('RIFFxxxxWEBP', 'ascii');

function makeService({purchase = {id: 42, userId: 7}, existingReceipt = null} = {}) {
    const storage = {
        files: new Map(),
        deleted: [],
        counter: 0,
        async save({buffer, mimeType}) {
            this.counter += 1;
            const storageKey = `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
            this.files.set(storageKey, Buffer.from(buffer));
            return {storageKey, sizeBytes: buffer.length};
        },
        async read(storageKey) {
            return this.files.get(storageKey);
        },
        async delete(storageKey) {
            this.deleted.push(storageKey);
            this.files.delete(storageKey);
            return true;
        }
    };
    const repository = {
        receipt: existingReceipt,
        receipts: existingReceipt ? [existingReceipt] : [],
        upserts: [],
        async findByPurchaseId(userId, purchaseId) {
            return Number(userId) === 7 && Number(purchaseId) === 42 ? this.receipt : null;
        },
        async findById(userId, receiptId) {
            return this.receipts.find(item => Number(item.userId || 7) === Number(userId) && Number(item.id) === Number(receiptId)) || null;
        },
        async findStandaloneReceipts(userId) {
            return this.receipts.filter(item => Number(item.userId || 7) === Number(userId) && item.purchaseId === null);
        },
        async upsertReceipt(userId, receipt) {
            this.upserts.push(receipt);
            if (this.receipt?.clientMutationId === receipt.clientMutationId) {
                return {receipt: this.receipt, replacedStorageKey: null, idempotent: true};
            }
            const replacedStorageKey = this.receipt?.storageKey || null;
            this.receipt = {id: this.receipt?.id || 9, ...receipt, createdAt: 'now', updatedAt: 'now'};
            this.receipts = [this.receipt];
            return {receipt: this.receipt, replacedStorageKey, idempotent: false};
        },
        async createStandaloneReceipt(userId, receipt) {
            const existing = this.receipts.find(item => Number(item.userId) === Number(userId) && item.clientMutationId === receipt.clientMutationId);
            if (existing) return {receipt: existing, idempotent: true};
            const saved = {id: this.receipts.length + 20, userId, purchaseId: null, ...receipt, createdAt: 'now', updatedAt: 'now'};
            this.receipts.push(saved);
            return {receipt: saved, idempotent: false};
        },
        async deleteByPurchaseId(userId, purchaseId) {
            if (Number(userId) !== 7 || Number(purchaseId) !== 42 || !this.receipt) return null;
            const deleted = this.receipt;
            this.receipt = null;
            return deleted;
        },
        async deleteById(userId, receiptId) {
            const index = this.receipts.findIndex(item => Number(item.userId || 7) === Number(userId) && Number(item.id) === Number(receiptId));
            if (index === -1) return null;
            const [deleted] = this.receipts.splice(index, 1);
            return deleted;
        }
    };
    const purchaseRepository = {
        async findPurchaseById(userId, purchaseId) {
            return Number(userId) === 7 && Number(purchaseId) === 42 ? purchase : null;
        }
    };
    return {
        service: new ReceiptService({repository, purchaseRepository, storage}),
        repository,
        storage
    };
}

test('sniffs supported mobile image formats from bytes', () => {
    assert.equal(sniffMimeType(jpeg()), 'image/jpeg');
    assert.equal(sniffMimeType(png()), 'image/png');
    assert.equal(sniffMimeType(webp()), 'image/webp');
    assert.equal(sniffMimeType(Buffer.from('not-image')), null);
});

test('rejects invalid purchase ownership before saving file', async () => {
    const {service, storage} = makeService({purchase: null});

    await assert.rejects(() => service.saveReceipt(7, 42, {
        clientMutationId: 'receipt-1',
        file: {filename: 'r.jpg', data: jpeg(), mimeType: 'image/jpeg'}
    }), /Purchase not found/);
    assert.equal(storage.files.size, 0);
});

test('valid upload stores file metadata without trusting path-like filename', async () => {
    const {service, repository, storage} = makeService();
    const receipt = await service.saveReceipt(7, 42, {
        clientMutationId: 'receipt-1',
        file: {filename: '../secret.jpg', data: jpeg(), mimeType: 'application/octet-stream'}
    });

    assert.equal(receipt.purchaseId, 42);
    assert.equal(receipt.mimeType, 'image/jpeg');
    assert.equal(receipt.originalFilename, 'secret.jpg');
    assert.equal(repository.upserts[0].clientMutationId, 'receipt-1');
    assert.equal(storage.files.size, 1);
});

test('standalone upload stores owner and nullable purchase id', async () => {
    const {service, repository} = makeService();
    const receipt = await service.saveStandaloneReceipt(7, {
        clientMutationId: 'standalone-1',
        file: {filename: 'standalone.jpg', data: jpeg(), mimeType: 'image/jpeg'}
    });

    assert.equal(receipt.purchaseId, null);
    assert.equal(repository.receipts[0].userId, 7);
    assert.equal(repository.receipts[0].purchaseId, null);
});

test('standalone metadata image and delete enforce owner', async () => {
    const {service, repository, storage} = makeService();
    const receipt = await service.saveStandaloneReceipt(7, {
        clientMutationId: 'standalone-1',
        file: {filename: 'standalone.jpg', data: jpeg(), mimeType: 'image/jpeg'}
    });

    assert.equal((await service.getStandaloneReceipt(7, receipt.id)).id, receipt.id);
    assert.equal(await service.getStandaloneReceipt(8, receipt.id), null);
    assert.equal((await service.getStandaloneReceiptImage(7, receipt.id)).buffer.length, jpeg().length);
    assert.equal(await service.getStandaloneReceiptImage(8, receipt.id), null);
    assert.equal(await service.deleteStandaloneReceipt(8, receipt.id), false);
    assert.equal(await service.deleteStandaloneReceipt(7, receipt.id), true);
    assert.equal(repository.receipts.length, 0);
    assert.equal(storage.deleted.length, 1);
});

test('standalone idempotent retry does not duplicate receipt metadata', async () => {
    const {service, repository, storage} = makeService();
    const first = await service.saveStandaloneReceipt(7, {
        clientMutationId: 'standalone-1',
        file: {filename: 'one.jpg', data: jpeg(), mimeType: 'image/jpeg'}
    });
    const second = await service.saveStandaloneReceipt(7, {
        clientMutationId: 'standalone-1',
        file: {filename: 'retry.jpg', data: jpeg(), mimeType: 'image/jpeg'}
    });

    assert.equal(second.id, first.id);
    assert.equal(repository.receipts.length, 1);
    assert.equal(storage.deleted.length, 1);
});

test('multiple standalone receipts for one user are allowed', async () => {
    const {service} = makeService();
    await service.saveStandaloneReceipt(7, {
        clientMutationId: 'standalone-1',
        file: {filename: 'one.jpg', data: jpeg(), mimeType: 'image/jpeg'}
    });
    await service.saveStandaloneReceipt(7, {
        clientMutationId: 'standalone-2',
        file: {filename: 'two.jpg', data: jpeg(), mimeType: 'image/jpeg'}
    });

    assert.equal((await service.listStandaloneReceipts(7)).length, 2);
});

test('rejects unsupported image and oversized payloads', async () => {
    const {service} = makeService();

    await assert.rejects(() => service.saveReceipt(7, 42, {
        clientMutationId: 'receipt-1',
        file: {filename: 'bad.gif', data: Buffer.from('GIF89a'), mimeType: 'image/gif'}
    }), /Unsupported image format/);

    await assert.rejects(() => service.saveReceipt(7, 42, {
        clientMutationId: 'receipt-2',
        file: {filename: 'big.jpg', data: Buffer.concat([jpeg(), Buffer.alloc(MAX_RECEIPT_BYTES + 1)]), mimeType: 'image/jpeg'}
    }), /Receipt image is too large/);
});

test('idempotent retry does not create duplicate canonical file', async () => {
    const existing = {
        id: 9,
        purchaseId: 42,
        clientMutationId: 'receipt-1',
        storageKey: 'existing.jpg',
        originalFilename: 'r.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 12
    };
    const {service, repository, storage} = makeService({existingReceipt: existing});

    const receipt = await service.saveReceipt(7, 42, {
        clientMutationId: 'receipt-1',
        file: {filename: 'retry.jpg', data: jpeg(), mimeType: 'image/jpeg'}
    });

    assert.equal(receipt.id, 9);
    assert.equal(repository.upserts.length, 1);
    assert.equal(storage.deleted.length, 1);
    assert.equal(storage.files.size, 0);
});

test('replace keeps one receipt and removes old stored file after DB update', async () => {
    const existing = {
        id: 9,
        purchaseId: 42,
        clientMutationId: 'receipt-old',
        storageKey: 'old.jpg',
        originalFilename: 'old.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 12
    };
    const {service, repository, storage} = makeService({existingReceipt: existing});

    const receipt = await service.saveReceipt(7, 42, {
        clientMutationId: 'receipt-new',
        file: {filename: 'new.png', data: png(), mimeType: 'image/png'}
    });

    assert.equal(receipt.id, 9);
    assert.equal(receipt.mimeType, 'image/png');
    assert.equal(repository.receipt.clientMutationId, 'receipt-new');
    assert.deepEqual(storage.deleted, ['old.jpg']);
});

test('delete removes metadata first and then physical file when present', async () => {
    const existing = {
        id: 9,
        purchaseId: 42,
        clientMutationId: 'receipt-1',
        storageKey: 'old.jpg',
        originalFilename: 'old.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 12
    };
    const {service, repository, storage} = makeService({existingReceipt: existing});

    assert.equal(await service.deleteReceipt(7, 42), true);
    assert.equal(repository.receipt, null);
    assert.deepEqual(storage.deleted, ['old.jpg']);
});

test('local receipt storage rejects traversal and absolute storage keys', async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hboo-receipts-'));
    const storage = new LocalReceiptStorage({baseDir});

    assert.throws(() => storage.resolve('../secret.jpg'), /Invalid receipt storage key/);
    assert.throws(() => storage.resolve('/tmp/secret.jpg'), /Invalid receipt storage key/);

    const saved = await storage.save({buffer: jpeg(), mimeType: 'image/jpeg'});
    assert.equal(await storage.exists(saved.storageKey), true);
    assert.equal((await storage.read(saved.storageKey)).length, jpeg().length);
    assert.equal(await storage.delete(saved.storageKey), true);
});
