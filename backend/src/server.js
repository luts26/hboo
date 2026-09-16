import http from 'node:http';
import { sendJson } from './http/response.js';
import { findRoute } from './http/router.js'
import authenticate from './auth/authenticate.js'

const port = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    const matchedRoute = findRoute(req.method, url.pathname);
    const route = matchedRoute?.route;

    if (!route) {
        sendJson(res, 404, {error: 'Not Found'});

        return;
    }

    try {

        if (route.public !== true) {
            const user = await authenticate(req);

            if (!user) {
                sendJson(res, 401, {
                    error: 'Unauthorized'
                });

                return;
            }

            req.user = user;
        }

        req.params = matchedRoute.params;

        await route.handler(req, res, url);
    } catch (error) {
        console.error(error);

        sendJson(res, 500, {
            error: 'Internal Server Error'
        });
    }
});

server.listen(port, '0.0.0.0', () => {
	console.log(`hb00 app listening on port ${port}`);
})
