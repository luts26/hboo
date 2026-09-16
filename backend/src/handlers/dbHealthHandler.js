import pool from '../database/mysql.js';
import { sendJson } from '../http/response.js';

export default async function dbHealthHandler(req, res, url) {

	try {
		const [rows] = await pool.execute('SELECT 1 AS result');

		sendJson(res, 200, {
			status: 'ok',
			database: 'connected',
			result: rows[0].result
		});

	} catch (error) {

		console.error(error);

		sendJson(res, 500, {
			status: 'error',
			database: 'disconnected'
		});
	}
}
