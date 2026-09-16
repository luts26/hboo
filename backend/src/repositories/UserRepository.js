import pool from '../database/mysql.js';

class UserRepository {

    async findByUsername(username) {
        const [rows] = await pool.execute(`
            SELECT
                id,
                username,
                first_name,
                last_name,
                email,
                password,
                status
            FROM users
            WHERE username = ?
            LIMIT 1
        `, [username]);

        return rows[0] ?? null;
    }

    async getUserRoles(userId) {

        const [rows] = await pool.execute(`
            SELECT r.name
            FROM roles r
            INNER JOIN user_roles ur
                ON ur.role_id = r.id
            WHERE ur.user_id = ?
              AND r.status = 'ACTIVE'
        `, [userId]);

        return rows.map(row => row.name);
    }
}

export default new UserRepository();
