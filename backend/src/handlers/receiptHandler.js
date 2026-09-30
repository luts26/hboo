import receiptService from '../services/ReceiptService.js';
import receiptOcrService from '../services/ReceiptOcrService.js';
import {sendJson} from '../http/response.js';
import {readMultipartForm} from '../http/multipart.js';

function createReceiptHandler({
    receipts = receiptService,
    ocr = receiptOcrService,
    readForm = readMultipartForm
} = {}) {
    return async function receiptHandler(req, res) {
    try {
        const userId = req.user.user_id;
        const purchaseId = req.params.purchaseId;
        const receiptId = req.params.receiptId;

        if (req.method === 'GET' && !purchaseId && !receiptId) {
            sendJson(res, 200, await receipts.listStandaloneReceipts(userId));
            return;
        }

        if (receiptId && req.params.mode === 'ocr' && req.method === 'GET') {
            sendJson(res, 200, await ocr.getOcr(userId, receiptId));
            return;
        }

        if (receiptId && req.params.mode === 'ocr' && req.method === 'POST') {
            sendJson(res, 200, await ocr.runOcr(userId, receiptId));
            return;
        }

        if (req.method === 'POST' && !purchaseId) {
            const form = await readForm(req);
            const receipt = await receipts.saveStandaloneReceipt(userId, {
                file: form.files.receipt,
                clientMutationId: form.fields.client_mutation_id
            });
            sendJson(res, 201, receipt);
            return;
        }

        if (receiptId && req.method === 'GET' && req.params.mode === 'image') {
            const image = await receipts.getStandaloneReceiptImage(userId, receiptId);
            if (!image) {
                sendJson(res, 404, {error: 'Receipt not found'});
                return;
            }
            res.writeHead(200, {
                'Content-Type': image.receipt.mimeType,
                'Content-Length': image.buffer.length,
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff'
            });
            res.end(image.buffer);
            return;
        }

        if (receiptId && req.method === 'GET') {
            const receipt = await receipts.getStandaloneReceipt(userId, receiptId);
            if (!receipt) {
                sendJson(res, 404, {error: 'Receipt not found'});
                return;
            }
            sendJson(res, 200, receipt);
            return;
        }

        if (receiptId && req.method === 'DELETE') {
            const deleted = await receipts.deleteStandaloneReceipt(userId, receiptId);
            if (!deleted) {
                sendJson(res, 404, {error: 'Receipt not found'});
                return;
            }
            sendJson(res, 200, {deleted: true});
            return;
        }

        if (req.method === 'GET' && req.params.mode === 'image') {
            const image = await receipts.getReceiptImage(userId, purchaseId);
            if (!image) {
                sendJson(res, 404, {error: 'Receipt not found'});
                return;
            }
            res.writeHead(200, {
                'Content-Type': image.receipt.mimeType,
                'Content-Length': image.buffer.length,
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff'
            });
            res.end(image.buffer);
            return;
        }

        if (req.method === 'GET') {
            const receipt = await receipts.getReceipt(userId, purchaseId);
            if (!receipt) {
                sendJson(res, 404, {error: 'Receipt not found'});
                return;
            }
            sendJson(res, 200, receipt);
            return;
        }

        if (req.method === 'POST') {
            const form = await readForm(req);
            const receipt = await receipts.saveReceipt(userId, purchaseId, {
                file: form.files.receipt,
                clientMutationId: form.fields.client_mutation_id
            });
            sendJson(res, 201, receipt);
            return;
        }

        if (req.method === 'DELETE') {
            const deleted = await receipts.deleteReceipt(userId, purchaseId);
            if (!deleted) {
                sendJson(res, 404, {error: 'Receipt not found'});
                return;
            }
            sendJson(res, 200, {deleted: true});
            return;
        }

        sendJson(res, 404, {error: 'Not Found'});
    } catch (error) {
        if (error.statusCode) {
            sendJson(res, error.statusCode, {error: error.message});
            return;
        }
        throw error;
    }
    };
}

export default createReceiptHandler();
export {createReceiptHandler};
