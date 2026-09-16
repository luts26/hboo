import pool from '../database/mysql.js';

class TransactionRepository {

    async getMonoTransactions(dateFrom, dateTo) {

        const fromTimestamp = Math.floor(dateFrom / 1000);
        const toTimestamp = Math.floor(dateTo / 1000);

        const [rows] = await pool.execute(`
            SELECT *
            FROM mono_transaction
            WHERE time >= ?
                AND time <= ?
            ORDER BY time DESC
        `, [fromTimestamp, toTimestamp]);

        return rows;
    }

    async getPrivatTransactions(dateFrom, dateTo) {

        const [rows] = await pool.execute(`
            SELECT *
            FROM privat_transaction
            WHERE date >= ?
                AND date <= ?
            ORDER BY date DESC
        `, [dateFrom, dateTo]);

        return rows;
    }

    async getActualSpent(dateFrom, dateTo) {

        const fromTimestamp = Math.floor(dateFrom / 1000);
        const toTimestamp = Math.floor(dateTo / 1000);

        const [rows] = await pool.execute(`
            SELECT
                COALESCE(SUM(actual_spent), 0) AS actualSpent
            FROM (
                SELECT
                    ABS(CAST(amount AS DECIMAL(15, 2))) AS actual_spent
                FROM mono_transaction
                WHERE time >= ?
                    AND time <= ?
                    AND CAST(amount AS DECIMAL(15, 2)) < 0

                UNION ALL

                SELECT
                    ABS(CAST(amount AS DECIMAL(15, 2))) AS actual_spent
                FROM privat_transaction
                WHERE date >= ?
                    AND date <= ?
                    AND CAST(amount AS DECIMAL(15, 2)) < 0
            ) bank_expenses
        `, [fromTimestamp, toTimestamp, dateFrom, dateTo]);

        return Number(rows[0]?.actualSpent || 0);
    }
}

export default new TransactionRepository();
