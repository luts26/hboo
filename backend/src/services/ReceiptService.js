import crypto from 'node:crypto';
import receiptRepository from '../repositories/ReceiptRepository.js';
import purchaseRepository from '../repositories/PurchaseRepository.js';
import receiptStorage from '../storage/LocalReceiptStorage.js';

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const sniffMimeType = buffer => {
    if (!buffer || buffer.length < 12) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    return null;
};

class ReceiptService {
    constructor({repository = receiptRepository, purchaseRepository: purchases = purchaseRepository, storage = receiptStorage} = {}) {
        this.repository = repository;
        this.purchaseRepository = purchases;
        this.storage = storage;
    }

    async getReceipt(userId, purchaseId) {
        await this.requirePurchase(userId, purchaseId);
        const receipt = await this.repository.findByPurchaseId(userId, purchaseId);
        return receipt ? this.formatReceipt(receipt) : null;
    }

    async listStandaloneReceipts(userId) {
        return (await this.repository.findStandaloneReceipts(this.requireId(userId, 'user id')))
            .map(receipt => this.formatReceipt(receipt));
    }

    async getStandaloneReceipt(userId, receiptId) {
        const receipt = await this.repository.findById(
            this.requireId(userId, 'user id'),
            this.requireId(receiptId, 'receipt id')
        );
        return receipt ? this.formatReceipt(receipt) : null;
    }

    async getReceiptImage(userId, purchaseId) {
        await this.requirePurchase(userId, purchaseId);
        const receipt = await this.repository.findByPurchaseId(userId, purchaseId);
        if (!receipt) return null;
        return {
            receipt: this.formatReceipt(receipt),
            buffer: await this.storage.read(receipt.storageKey)
        };
    }

    async getStandaloneReceiptImage(userId, receiptId) {
        const receipt = await this.repository.findById(
            this.requireId(userId, 'user id'),
            this.requireId(receiptId, 'receipt id')
        );
        if (!receipt) return null;
        return {
            receipt: this.formatReceipt(receipt),
            buffer: await this.storage.read(receipt.storageKey)
        };
    }

    async saveReceipt(userId, purchaseId, {file, clientMutationId}) {
        await this.requirePurchase(userId, purchaseId);
        const validated = this.validateFile(file);
        const mutationId = this.requireClientMutationId(clientMutationId);
        let savedFile = null;

        try {
            savedFile = await this.storage.save({
                buffer: validated.buffer,
                mimeType: validated.mimeType
            });
            const result = await this.repository.upsertReceipt(userId, {
                purchaseId,
                clientMutationId: mutationId,
                storageKey: savedFile.storageKey,
                originalFilename: this.safeOriginalFilename(file.filename),
                mimeType: validated.mimeType,
                sizeBytes: savedFile.sizeBytes
            });
            if (result.idempotent && savedFile.storageKey) await this.storage.delete(savedFile.storageKey).catch(() => {});
            if (result.replacedStorageKey) await this.storage.delete(result.replacedStorageKey).catch(() => {});
            return this.formatReceipt(result.receipt);
        } catch (error) {
            if (savedFile?.storageKey) await this.storage.delete(savedFile.storageKey).catch(() => {});
            throw error;
        }
    }

    async saveStandaloneReceipt(userId, {file, clientMutationId}) {
        const ownerId = this.requireId(userId, 'user id');
        const validated = this.validateFile(file);
        const mutationId = this.requireClientMutationId(clientMutationId);
        let savedFile = null;

        try {
            savedFile = await this.storage.save({
                buffer: validated.buffer,
                mimeType: validated.mimeType
            });
            const result = await this.repository.createStandaloneReceipt(ownerId, {
                clientMutationId: mutationId,
                storageKey: savedFile.storageKey,
                originalFilename: this.safeOriginalFilename(file.filename),
                mimeType: validated.mimeType,
                sizeBytes: savedFile.sizeBytes
            });
            if (result.idempotent && savedFile.storageKey) await this.storage.delete(savedFile.storageKey).catch(() => {});
            return this.formatReceipt(result.receipt);
        } catch (error) {
            if (savedFile?.storageKey) await this.storage.delete(savedFile.storageKey).catch(() => {});
            throw error;
        }
    }

    async deleteReceipt(userId, purchaseId) {
        await this.requirePurchase(userId, purchaseId);
        const deleted = await this.repository.deleteByPurchaseId(userId, purchaseId);
        if (!deleted) return false;
        await this.storage.delete(deleted.storageKey).catch(() => {});
        return true;
    }

    async deleteStandaloneReceipt(userId, receiptId) {
        const deleted = await this.repository.deleteById(
            this.requireId(userId, 'user id'),
            this.requireId(receiptId, 'receipt id')
        );
        if (!deleted) return false;
        await this.storage.delete(deleted.storageKey).catch(() => {});
        return true;
    }

    async requirePurchase(userId, purchaseId) {
        const purchase = await this.purchaseRepository.findPurchaseById(this.requireId(userId, 'user id'), this.requireId(purchaseId, 'purchase id'));
        if (!purchase) {
            const error = new Error('Purchase not found');
            error.statusCode = 404;
            throw error;
        }
        return purchase;
    }

    validateFile(file) {
        if (!file?.data?.length) throw this.validationError('Receipt image is required');
        if (file.data.length > MAX_RECEIPT_BYTES) throw this.validationError('Receipt image is too large', 413);
        const sniffed = sniffMimeType(file.data);
        if (!sniffed || !SUPPORTED_TYPES.has(sniffed)) throw this.validationError('Unsupported image format');
        return {buffer: file.data, mimeType: sniffed};
    }

    requireClientMutationId(value) {
        const text = String(value || '').trim();
        if (!text || text.length > 128) return crypto.randomUUID();
        if (!/^[a-zA-Z0-9._:-]+$/.test(text)) throw this.validationError('client_mutation_id is invalid');
        return text;
    }

    requireId(value, field) {
        const id = Number(value);
        if (!Number.isInteger(id) || id <= 0) throw this.validationError(`${field} must be a positive integer`);
        return id;
    }

    safeOriginalFilename(value) {
        const text = String(value || '').split(/[\\/]/).pop().trim();
        if (!text) return null;
        return text.replace(/[^\p{L}\p{N}._ -]/gu, '').slice(0, 255) || null;
    }

    formatReceipt(receipt) {
        return {
            id: Number(receipt.id),
            purchaseId: receipt.purchaseId === null || receipt.purchaseId === undefined ? null : Number(receipt.purchaseId),
            clientMutationId: receipt.clientMutationId,
            originalFilename: receipt.originalFilename || null,
            mimeType: receipt.mimeType,
            sizeBytes: Number(receipt.sizeBytes),
            createdAt: receipt.createdAt,
            updatedAt: receipt.updatedAt
        };
    }

    validationError(message, statusCode = 400) {
        const error = new Error(message);
        error.statusCode = statusCode;
        return error;
    }
}

export default new ReceiptService();
export {ReceiptService, MAX_RECEIPT_BYTES, SUPPORTED_TYPES, sniffMimeType};
