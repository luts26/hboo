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
}

export default new BalanceRepository();
