import pool from '../database/mysql.js';

class CategoryRepository {

    async findActive(language = 'uk') {
        const [rows] = await pool.execute(`
            SELECT
                c.id,
                c.code,
                COALESCE(t.name, fallback_t.name) AS name,
                c.icon,
                c.type
            FROM categories c
            LEFT JOIN category_translations t
                ON t.category_id = c.id
                AND t.language = ?
            LEFT JOIN category_translations fallback_t
                ON fallback_t.category_id = c.id
                AND fallback_t.language = 'uk'
            WHERE c.status = 'active'
            ORDER BY c.id ASC
        `, [language]);

        return rows;
    }

    async findByExternalCode(provider, externalCode, language = 'uk') {
        const [rows] = await pool.execute(`
            SELECT
                c.id,
                c.code,
                COALESCE(t.name, fallback_t.name) AS name,
                c.icon,
                c.type,
                cm.provider,
                cm.external_code AS externalCode,
                cm.external_name AS externalName
            FROM category_mapping cm
            INNER JOIN categories c
                ON c.id = cm.category_id
            LEFT JOIN category_translations t
                ON t.category_id = c.id
                AND t.language = ?
            LEFT JOIN category_translations fallback_t
                ON fallback_t.category_id = c.id
                AND fallback_t.language = 'uk'
            WHERE cm.provider = ?
                AND cm.external_code = ?
                AND c.status = 'active'
            LIMIT 1
        `, [language, provider, String(externalCode)]);

        return rows[0] || null;
    }
}

export default new CategoryRepository();
