import pool from '../database/mysql.js';

class AuthSessionRepository {

    async create(userId, tokenHash, expiresAt) {
        await pool.execute(`
            INSERT INTO auth_session (
                user_id,
                token_hash,
                created_at,
                expires_at
            )
            VALUES (?, ?, NOW(), ?)
        `, [
            userId,
            tokenHash,
            expiresAt
        ]);
    }

    async findByTokenHash(tokenHash) {
        const [rows] = await pool.execute(`
            SELECT *
            FROM auth_session
            WHERE token_hash = ?
              AND expires_at > NOW()
            LIMIT 1
        `, [tokenHash]);

        return rows[0] ?? null;
    }
}

export default new AuthSessionRepository();
