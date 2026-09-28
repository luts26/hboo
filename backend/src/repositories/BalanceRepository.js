import pool from '../database/mysql.js';

class BalanceRepository {

    async getTodayMonoBalance() {

        const startOfDay = Math.floor(
            new Date().setHours(0, 0, 0, 0) / 1000
        );

        const [rows] = await pool.execute(`
            SELECT *
            FROM mono
            WHERE date >= ?
            ORDER BY date DESC
            LIMIT 1
        `, [startOfDay]);

        return rows;
    }

    async getLastMonoBalance() {

        const [rows] = await pool.execute(`
            SELECT *
            FROM mono
            ORDER BY date DESC
            LIMIT 1
        `);

        return rows;
    }

    async getTodayPrivatBalance() {

        const startOfDay = Math.floor(
            new Date().setHours(0, 0, 0, 0)
        );

        const [rows] = await pool.execute(`
            SELECT *
            FROM privat
            WHERE date >= ?
            ORDER BY date DESC
            LIMIT 1
        `, [startOfDay]);

        return rows;
    }

    async getLastPrivatBalance() {

        const [rows] = await pool.execute(`
            SELECT *
            FROM privat
            ORDER BY date DESC
            LIMIT 1
        `);

        return rows;
    }

    async getMonoBalanceHistory({dateFrom, dateTo}) {

        const fromSeconds = Math.floor(Number(dateFrom) / 1000);
        const toSeconds = Math.floor(Number(dateTo) / 1000);

        const [previousRows] = await pool.execute(`
            SELECT *
            FROM mono
            WHERE currency_code = 980
              AND date < ?
            ORDER BY date DESC, id DESC
            LIMIT 1
        `, [String(fromSeconds)]);

        const [rangeRows] = await pool.execute(`
            SELECT *
            FROM mono
            WHERE currency_code = 980
              AND date BETWEEN ? AND ?
            ORDER BY date ASC, id ASC
        `, [String(fromSeconds), String(toSeconds)]);

        return {
            previous: previousRows,
            rows: rangeRows
        };
    }

    async getPrivatBalanceHistory({dateFrom, dateTo}) {

        const from = Number(dateFrom);
        const to = Number(dateTo);

        const [previousRows] = await pool.execute(`
            SELECT *
            FROM privat
            WHERE currency IN ('UAH', '980')
              AND date < ?
            ORDER BY date DESC, id DESC
            LIMIT 1
        `, [String(from)]);

        const [rangeRows] = await pool.execute(`
            SELECT *
            FROM privat
            WHERE currency IN ('UAH', '980')
              AND date BETWEEN ? AND ?
            ORDER BY date ASC, id ASC
        `, [String(from), String(to)]);

        return {
            previous: previousRows,
            rows: rangeRows
        };
    }
}

export default new BalanceRepository();
