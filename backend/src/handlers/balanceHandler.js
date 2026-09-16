import balanceService from '../services/BalanceService.js';
import { sendJson } from '../http/response.js';

async function balanceHandler(req, res, url) {
    const updateBalance = url.searchParams.get('updateBalance');

    const balance = await balanceService.getBalance(updateBalance);

    sendJson(res, 200, balance);
}

export default balanceHandler
