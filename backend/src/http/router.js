import healthHandler from '../handlers/healthHandler.js';
import dbHealthHandler from '../handlers/dbHealthHandler.js';
import authHandler from '../handlers/authHandler.js';
import balanceHandler from '../handlers/balanceHandler.js';
import transactionHandler from '../handlers/transactionHandler.js';
import categoryHandler from '../handlers/categoryHandler.js';
import planningHandler from '../handlers/planningHandler.js';

const routes = {
    'GET /api/health': {
        handler: healthHandler,
        public: true
    },
    'GET /api/db/health': {
        handler: dbHealthHandler,
        public: true
    },
    'POST /api/auth/login': {
        handler: authHandler,
        public: true
    },
    'GET /api/categories': {
        handler: categoryHandler,
        public: true
    },
    'GET /api/hbv2/balance': {
        handler: balanceHandler
    },
    'GET /api/hbv2/transaction': {
        handler: transactionHandler
    },
    'POST /api/planning/period': {
        handler: planningHandler
    },
    'GET /api/planning/period/current': {
        handler: planningHandler
    },
    'GET /api/planning/period/:id': {
        handler: planningHandler
    },
    'PUT /api/planning/period/:id': {
        handler: planningHandler
    },
    'GET /api/planning/period/:id/items': {
        handler: planningHandler
    },
    'POST /api/planning/item': {
        handler: planningHandler
    },
    'PUT /api/planning/item/:id': {
        handler: planningHandler
    },
    'DELETE /api/planning/item/:id': {
        handler: planningHandler
    },
    'GET /api/planning/item/:id/transactions/candidates': {
        handler: planningHandler
    },
    'GET /api/planning/item/:id/transactions/suggestions': {
        handler: planningHandler
    },
    'GET /api/planning/item/:id/transactions/linked': {
        handler: planningHandler
    },
    'POST /api/planning/item/:id/transactions': {
        handler: planningHandler
    },
    'POST /api/planning/item/:id/transactions/confirm': {
        handler: planningHandler
    },
    'DELETE /api/planning/item/:id/transactions': {
        handler: planningHandler
    },
    'GET /api/planning/period/:id/statistics': {
        handler: planningHandler
    }
};

export function findRoute(method, pathname) {
    const routeKey = `${method} ${pathname}`;

    if (routes[routeKey]) {
        return {
            route: routes[routeKey],
            params: {}
        };
    }

    for (const [key, route] of Object.entries(routes)) {
        const [routeMethod, routePath] = key.split(' ');

        if (routeMethod !== method || !routePath.includes(':')) {
            continue;
        }

        const pathParts = pathname.split('/').filter(Boolean);
        const routeParts = routePath.split('/').filter(Boolean);

        if (pathParts.length !== routeParts.length) {
            continue;
        }

        const params = {};
        let matched = true;

        for (let index = 0; index < routeParts.length; index += 1) {
            const routePart = routeParts[index];

            if (routePart.startsWith(':')) {
                params[routePart.slice(1)] = pathParts[index];
                continue;
            }

            if (routePart !== pathParts[index]) {
                matched = false;
                break;
            }
        }

        if (matched) {
            return {
                route,
                params
            };
        }
    }

    return null;
}

export default routes;
