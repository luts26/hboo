import authService from '../services/AuthService.js';
import { sendJson } from '../http/response.js';

async function authHandler(req, res) {

    let body = '';

    for await (const chunk of req) {
        body += chunk;
    }

    let data;

    try {

        data = JSON.parse(body);
    } catch {

        sendJson(res, 400, {
            error: 'Invalid JSON'
        });

        return;
    }

    const { username, password } = data;

    if (!username || !password) {

        sendJson(res, 400, {
            error: 'Username and password are required'
        });

        return;
    }

    const result = await authService.login(username, password);

    if (!result) {
        
        sendJson(res, 401, {
            error: 'Invalid credentials'
        });

        return;
    }

    sendJson(res, 200, result);
}

export default authHandler;
