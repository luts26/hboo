import transactionService from '../services/TransactionService.js';
import { sendJson } from '../http/response.js';

async function transactionHandler(req, res, url) {
    const dateFromParam = url.searchParams.get('date_from');
    const dateToParam = url.searchParams.get('date_to');
    const updateTransaction = url.searchParams.get('updateTransaction') || null;
    const language = url.searchParams.get('lang') || 'uk';

    const now = new Date();

    const dateFrom = dateFromParam
        ? Number(dateFromParam)
        : new Date(
            now.getFullYear(),
            now.getMonth(),
            1
        ).getTime();

    const dateTo = dateToParam ? Number(dateToParam) : now.getTime();

    if (!Number.isFinite(dateFrom) || !Number.isFinite(dateTo) || dateFrom > dateTo) {
    	
        sendJson(res, 400, {
		    error: 'Invalid date range'
		});

        return;
    }

    const transactions = await transactionService.getTransactions(dateFrom, dateTo, updateTransaction, language);

    sendJson(res, 200, transactions)
}

export default transactionHandler;
