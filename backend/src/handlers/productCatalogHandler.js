import productCatalogService from '../services/ProductCatalogService.js';
import purchaseTransactionService from '../services/PurchaseTransactionService.js';
import { sendJson } from '../http/response.js';

function getDefaultPurchaseRange(now = new Date()) {
    return {
        dateFrom: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime(),
        dateTo: now.getTime()
    };
}

function getPurchaseRange(url) {
    const fallback = getDefaultPurchaseRange();
    const dateFromParam = url.searchParams.get('date_from');
    const dateToParam = url.searchParams.get('date_to');
    const dateFrom = dateFromParam ? Number(dateFromParam) : fallback.dateFrom;
    const dateTo = dateToParam ? Number(dateToParam) : fallback.dateTo;

    if (!Number.isFinite(dateFrom) || !Number.isFinite(dateTo) || dateFrom > dateTo) {
        return null;
    }

    return {dateFrom, dateTo};
}

async function productCatalogHandler(req, res, url) {
    try {
        if (req.method === 'GET' && url.pathname === '/api/product-categories') {
            sendJson(res, 200, await productCatalogService.getCategories({
                includeDisabled: url.searchParams.get('includeDisabled') === 'true'
            }));
            return;
        }

        if (req.method === 'GET' && url.pathname === '/api/products') {
            sendJson(res, 200, await productCatalogService.getProducts({
                includeDisabled: url.searchParams.get('includeDisabled') === 'true',
                search: url.searchParams.get('search')
            }));
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/products') {
            sendJson(res, 201, await productCatalogService.createProduct(await readJson(req)));
            return;
        }

        if (req.method === 'PUT' && url.pathname.match(/^\/api\/products\/\d+$/)) {
            const product = await productCatalogService.updateProduct(req.params.id, await readJson(req));
            sendJsonOrNotFound(res, product, 'Product not found');
            return;
        }

        if (req.method === 'GET' && url.pathname === '/api/merchants') {
            sendJson(res, 200, await productCatalogService.getMerchants({
                includeDisabled: url.searchParams.get('includeDisabled') === 'true'
            }));
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/merchants') {
            sendJson(res, 201, await productCatalogService.createMerchant(await readJson(req)));
            return;
        }

        if (req.method === 'GET' && url.pathname === '/api/purchases') {
            const range = getPurchaseRange(url);
            if (!range) {
                sendJson(res, 400, {error: 'Invalid date range'});
                return;
            }
            sendJson(res, 200, await productCatalogService.getPurchases(req.user.user_id, range));
            return;
        }

        if (req.method === 'GET' && url.pathname.match(/^\/api\/purchases\/\d+$/)) {
            const purchase = await productCatalogService.getPurchase(req.user.user_id, req.params.id);
            sendJsonOrNotFound(res, purchase, 'Purchase not found');
            return;
        }

        if (req.method === 'GET' && url.pathname.match(/^\/api\/purchases\/\d+\/transactions\/candidates$/)) {
            sendJson(res, 200, await purchaseTransactionService.getCandidates(req.user.user_id, req.params.id, {
                includeFallback: url.searchParams.get('includeFallback') === 'true'
            }));
            return;
        }

        if (req.method === 'GET' && url.pathname.match(/^\/api\/purchases\/\d+\/transactions\/linked$/)) {
            sendJson(res, 200, await purchaseTransactionService.getLinkedTransaction(req.user.user_id, req.params.id));
            return;
        }

        if (req.method === 'POST' && url.pathname.match(/^\/api\/purchases\/\d+\/transactions$/)) {
            sendJson(res, 201, await purchaseTransactionService.linkTransaction(
                req.user.user_id,
                req.params.id,
                await readJson(req)
            ));
            return;
        }

        if (req.method === 'DELETE' && url.pathname.match(/^\/api\/purchases\/\d+\/transactions$/)) {
            sendJson(res, 200, await purchaseTransactionService.unlinkTransaction(req.user.user_id, req.params.id));
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/purchases') {
            sendJson(res, 201, await productCatalogService.createPurchase(req.user.user_id, await readJson(req)));
            return;
        }

        if (req.method === 'PUT' && url.pathname.match(/^\/api\/purchases\/\d+$/)) {
            const purchase = await productCatalogService.updatePurchase(req.user.user_id, req.params.id, await readJson(req));
            sendJsonOrNotFound(res, purchase, 'Purchase not found');
            return;
        }

        if (req.method === 'DELETE' && url.pathname.match(/^\/api\/purchases\/\d+$/)) {
            const deleted = await productCatalogService.deletePurchase(req.user.user_id, req.params.id);
            sendJsonOrNotFound(res, deleted ? {deleted: true} : null, 'Purchase not found');
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
}

async function readJson(req) {
    let body = '';
    for await (const chunk of req) body += chunk;

    try {
        return body ? JSON.parse(body) : {};
    } catch {
        const error = new Error('Invalid JSON');
        error.statusCode = 400;
        throw error;
    }
}

function sendJsonOrNotFound(res, data, message) {
    if (!data) {
        sendJson(res, 404, {error: message});
        return;
    }

    sendJson(res, 200, data);
}

export default productCatalogHandler;
