import planningService from '../services/PlanningService.js';
import { sendJson } from '../http/response.js';

async function planningHandler(req, res, url) {
    try {
        if (req.method === 'POST' && url.pathname === '/api/planning/period') {
            const data = await readJson(req);
            const period = await planningService.createPeriod(req.user.user_id, data);

            sendJson(res, 201, period);
            return;
        }

        if (req.method === 'GET' && url.pathname === '/api/planning/period/current') {
            const period = await planningService.getCurrentPeriod(req.user.user_id);

            sendJsonOrNotFound(res, period, 'Planning period not found');
            return;
        }

        if (req.method === 'GET' && url.pathname.match(/^\/api\/planning\/period\/\d+$/)) {
            const period = await planningService.getPeriod(req.user.user_id, req.params.id);

            sendJsonOrNotFound(res, period, 'Planning period not found');
            return;
        }

        if (req.method === 'PUT' && url.pathname.match(/^\/api\/planning\/period\/\d+$/)) {
            const data = await readJson(req);
            const period = await planningService.updatePeriod(req.user.user_id, req.params.id, data);

            sendJsonOrNotFound(res, period, 'Planning period not found');
            return;
        }

        if (req.method === 'GET' && url.pathname.match(/^\/api\/planning\/period\/\d+\/items$/)) {
            const items = await planningService.getItems(req.user.user_id, req.params.id);

            sendJsonOrNotFound(res, items, 'Planning period not found');
            return;
        }

        if (req.method === 'POST' && url.pathname === '/api/planning/item') {
            const data = await readJson(req);
            const item = await planningService.createItem(req.user.user_id, data);

            sendJson(res, 201, item);
            return;
        }

        if (req.method === 'PUT' && url.pathname.match(/^\/api\/planning\/item\/\d+$/)) {
            const data = await readJson(req);
            const item = await planningService.updateItem(req.user.user_id, req.params.id, data);

            sendJsonOrNotFound(res, item, 'Planning item not found');
            return;
        }

        if (req.method === 'DELETE' && url.pathname.match(/^\/api\/planning\/item\/\d+$/)) {
            const deleted = await planningService.deleteItem(req.user.user_id, req.params.id);

            if (!deleted) {
                sendJson(res, 404, {
                    error: 'Planning item not found'
                });
                return;
            }

            sendJson(res, 200, {
                deleted: true
            });
            return;
        }

        if (req.method === 'GET' && url.pathname.match(/^\/api\/planning\/period\/\d+\/statistics$/)) {
            const statistics = await planningService.getStatistics(req.user.user_id, req.params.id);

            sendJsonOrNotFound(res, statistics, 'Planning period not found');
            return;
        }

        sendJson(res, 404, {
            error: 'Not Found'
        });
    } catch (error) {
        if (error.statusCode) {
            sendJson(res, error.statusCode, {
                error: error.message
            });
            return;
        }

        throw error;
    }
}

async function readJson(req) {
    let body = '';

    for await (const chunk of req) {
        body += chunk;
    }

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
        sendJson(res, 404, {
            error: message
        });
        return;
    }

    sendJson(res, 200, data);
}

export default planningHandler;
