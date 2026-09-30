import receiptRepository from '../repositories/ReceiptRepository.js';
import receiptOcrRepository from '../repositories/ReceiptOcrRepository.js';
import receiptStorage from '../storage/LocalReceiptStorage.js';
import tesseractOcrAdapter from '../ocr/TesseractOcrAdapter.js';

const SAFE_FAILURE_MESSAGE = 'OCR processing failed';

class ReceiptOcrService {
    constructor({
        receiptRepository: receipts = receiptRepository,
        ocrRepository = receiptOcrRepository,
        storage = receiptStorage,
        adapter = tesseractOcrAdapter,
        maxConcurrent = Number(process.env.OCR_MAX_CONCURRENT || 1)
    } = {}) {
        this.receiptRepository = receipts;
        this.ocrRepository = ocrRepository;
        this.storage = storage;
        this.adapter = adapter;
        this.maxConcurrent = Math.max(1, maxConcurrent || 1);
        this.activeByReceiptId = new Map();
        this.activeCount = 0;
        this.queue = [];
    }

    async getOcr(userId, receiptId) {
        const receipt = await this.requireReceipt(userId, receiptId);
        const result = await this.ocrRepository.findByReceiptId(receipt.id);
        return result ? this.formatOcr(receipt.id, result) : this.emptyOcr(receipt.id);
    }

    async runOcr(userId, receiptId) {
        const receipt = await this.requireReceipt(userId, receiptId);
        const key = String(receipt.id);
        if (this.activeByReceiptId.has(key)) {
            return this.activeByReceiptId.get(key);
        }

        const task = this.enqueue(() => this.executeOcr(receipt))
            .finally(() => this.activeByReceiptId.delete(key));
        this.activeByReceiptId.set(key, task);
        return task;
    }

    async executeOcr(receipt) {
        const start = Date.now();
        const engine = this.adapter.engine || 'tesseract';
        const language = this.adapter.language || 'ukr+eng';
        const engineVersion = await this.safeEngineVersion();
        await this.ocrRepository.markProcessing(receipt.id, {engine, engineVersion, language});
        console.info('Receipt OCR started', {receiptId: Number(receipt.id), engine});

        try {
            const buffer = await this.storage.read(receipt.storageKey);
            const result = await this.adapter.recognize({buffer, mimeType: receipt.mimeType});
            const durationMs = Date.now() - start;
            const saved = await this.ocrRepository.markCompleted(receipt.id, {
                rawText: result.rawText || '',
                engine: result.engine || engine,
                engineVersion: result.engineVersion || engineVersion,
                language: result.language || language,
                durationMs
            });
            console.info('Receipt OCR completed', {receiptId: Number(receipt.id), engine: saved.engine, durationMs});
            return this.formatOcr(receipt.id, saved);
        } catch (error) {
            const durationMs = Date.now() - start;
            const saved = await this.ocrRepository.markFailed(receipt.id, {
                errorMessage: SAFE_FAILURE_MESSAGE,
                engine,
                engineVersion,
                language,
                durationMs
            });
            console.warn('Receipt OCR failed', {
                receiptId: Number(receipt.id),
                engine,
                durationMs,
                failure: this.failureCategory(error)
            });
            return this.formatOcr(receipt.id, saved);
        }
    }

    enqueue(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({task, resolve, reject});
            this.drainQueue();
        });
    }

    drainQueue() {
        while (this.activeCount < this.maxConcurrent && this.queue.length) {
            const item = this.queue.shift();
            this.activeCount += 1;
            Promise.resolve()
                .then(item.task)
                .then(item.resolve, item.reject)
                .finally(() => {
                    this.activeCount -= 1;
                    this.drainQueue();
                });
        }
    }

    async requireReceipt(userId, receiptId) {
        const receipt = await this.receiptRepository.findById(
            this.requireId(userId, 'user id'),
            this.requireId(receiptId, 'receipt id')
        );
        if (!receipt) {
            const error = new Error('Receipt not found');
            error.statusCode = 404;
            throw error;
        }
        return receipt;
    }

    async safeEngineVersion() {
        if (typeof this.adapter.getVersion !== 'function') return null;
        return this.adapter.getVersion().catch(() => null);
    }

    emptyOcr(receiptId) {
        return {
            receiptId: Number(receiptId),
            status: null,
            rawText: null,
            engine: this.adapter.engine || 'tesseract',
            engineVersion: null,
            language: this.adapter.language || 'ukr+eng',
            error: null,
            durationMs: null,
            createdAt: null,
            updatedAt: null
        };
    }

    formatOcr(receiptId, result) {
        return {
            receiptId: Number(receiptId),
            status: result.status,
            rawText: result.status === 'completed' ? (result.rawText || '') : null,
            engine: result.engine,
            engineVersion: result.engineVersion || null,
            language: result.language,
            error: result.status === 'failed' ? SAFE_FAILURE_MESSAGE : null,
            durationMs: result.durationMs === null || result.durationMs === undefined ? null : Number(result.durationMs),
            createdAt: result.createdAt || null,
            updatedAt: result.updatedAt || null
        };
    }

    requireId(value, field) {
        const id = Number(value);
        if (!Number.isInteger(id) || id <= 0) {
            const error = new Error(`${field} must be a positive integer`);
            error.statusCode = 400;
            throw error;
        }
        return id;
    }

    failureCategory(error) {
        if (error?.killed || error?.signal === 'SIGTERM') return 'timeout';
        if (error?.code === 'ENOENT') return 'engine_unavailable';
        return 'processing_error';
    }
}

export default new ReceiptOcrService();
export {ReceiptOcrService, SAFE_FAILURE_MESSAGE};
