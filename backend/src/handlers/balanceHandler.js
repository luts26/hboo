import balanceService from '../services/BalanceService.js';
import { sendJson } from '../http/response.js';

const VALID_PROVIDERS = new Set(['mono', 'privat']);

const parseTimestamp = value => {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
};

async function balanceHandler(req, res, url) {
    if (url.pathname === '/api/hbv2/balance/history') {
        const provider = String(url.searchParams.get('provider') || '').toLowerCase();
        const dateFrom = parseTimestamp(url.searchParams.get('date_from'));
        const dateTo = parseTimestamp(url.searchParams.get('date_to'));

        if (!VALID_PROVIDERS.has(provider)) {
            sendJson(res, 400, {error: 'Invalid provider'});
            return;
        }

        if (!dateFrom || !dateTo || dateFrom > dateTo) {
            sendJson(res, 400, {error: 'Invalid date range'});
            return;
        }

        const history = await balanceService.getBalanceHistory({
            provider,
            dateFrom,
            dateTo
        });

        sendJson(res, 200, history);
        return;
    }

    const updateBalance = url.searchParams.get('updateBalance');

    const balance = await balanceService.getBalance(updateBalance);

    sendJson(res, 200, balance);
}

export default balanceHandler
export { parseTimestamp }
