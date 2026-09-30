import receiptRepository from '../repositories/ReceiptRepository.js';
import receiptOcrRepository from '../repositories/ReceiptOcrRepository.js';
import {parseReceiptOcr} from '../receipts/ReceiptParser.js';

class ReceiptParserService {
    constructor({
        receipts = receiptRepository,
        ocrRepository = receiptOcrRepository,
        parser = parseReceiptOcr
    } = {}) {
        this.receiptRepository = receipts;
        this.ocrRepository = ocrRepository;
        this.parser = parser;
    }

    async parseReceipt(userId, receiptId) {
        const receipt = await this.requireReceipt(userId, receiptId);
        const ocr = await this.ocrRepository.findByReceiptId(receipt.id);
        if (!ocr || ocr.status !== 'completed') {
            const error = new Error('Receipt OCR is not completed');
            error.statusCode = 409;
            throw error;
        }
        return {
            receiptId: Number(receipt.id),
            ocrId: Number(ocr.id),
            ocrUpdatedAt: ocr.updatedAt || null,
            draft: this.parser(ocr.rawText || '')
        };
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

    requireId(value, field) {
        const id = Number(value);
        if (!Number.isInteger(id) || id <= 0) {
            const error = new Error(`${field} must be a positive integer`);
            error.statusCode = 400;
            throw error;
        }
        return id;
    }
}

export default new ReceiptParserService();
export {ReceiptParserService};
