import { sendJson } from '../http/response.js';

export default async function healthHandler(req, res, url) {

	sendJson(res, 200, {
	    status: 'ok refactory'
	});
}
