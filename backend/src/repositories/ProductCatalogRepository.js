import pool from '../database/mysql.js';

const categoryFields = `
    id,
    name,
    sort_order AS sortOrder,
    status,
    created_at AS createdAt,
    updated_at AS updatedAt
`;

const productFields = `
    p.id,
    p.category_id AS categoryId,
    pc.name AS categoryName,
    p.name,
    p.measurement_type AS measurementType,
    p.status,
    p.created_at AS createdAt,
    p.updated_at AS updatedAt
`;

const merchantFields = `
    id,
    name,
    status,
    created_at AS createdAt,
    updated_at AS updatedAt
`;

class ProductCatalogRepository {

    async findCategories({includeDisabled = false} = {}) {
        const [rows] = await pool.execute(`
            SELECT ${categoryFields}
            FROM product_category
            WHERE (? = TRUE OR status = 'active')
            ORDER BY sort_order ASC, name ASC
        `, [includeDisabled]);

        return rows;
    }

    async findProducts({includeDisabled = false, search = null} = {}) {
        const params = [includeDisabled];
        let searchSql = '';

        if (search) {
            searchSql = 'AND p.name LIKE ?';
            params.push(`%${search}%`);
        }

        const [rows] = await pool.execute(`
            SELECT ${productFields}
            FROM product p
            INNER JOIN product_category pc ON pc.id = p.category_id
            WHERE (? = TRUE OR p.status = 'active')
              ${searchSql}
            ORDER BY pc.sort_order ASC, p.name ASC
        `, params);

        return rows;
    }

    async findProductById(productId, connection = pool) {
        const [rows] = await connection.execute(`
            SELECT ${productFields}
            FROM product p
            INNER JOIN product_category pc ON pc.id = p.category_id
            WHERE p.id = ?
            LIMIT 1
        `, [productId]);

        return rows[0] || null;
    }

    async createProduct(product) {
        const [result] = await pool.execute(`
            INSERT INTO product (
                category_id,
                name,
                measurement_type,
                status,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, NOW(), NOW())
            ON DUPLICATE KEY UPDATE
                category_id = VALUES(category_id),
                measurement_type = VALUES(measurement_type),
                status = VALUES(status),
                updated_at = NOW(),
                id = LAST_INSERT_ID(id)
        `, [
            product.categoryId,
            product.name,
            product.measurementType,
            product.status
        ]);

        return this.findProductById(result.insertId);
    }

    async updateProduct(productId, product) {
        const [result] = await pool.execute(`
            UPDATE product
            SET
                category_id = ?,
                name = ?,
                measurement_type = ?,
                status = ?,
                updated_at = NOW()
            WHERE id = ?
        `, [
            product.categoryId,
            product.name,
            product.measurementType,
            product.status,
            productId
        ]);

        if (result.affectedRows === 0) return null;
        return this.findProductById(productId);
    }

    async findCategoryById(categoryId) {
        const [rows] = await pool.execute(`
            SELECT ${categoryFields}
            FROM product_category
            WHERE id = ?
            LIMIT 1
        `, [categoryId]);

        return rows[0] || null;
    }

    async findMerchants({includeDisabled = false} = {}) {
        const [rows] = await pool.execute(`
            SELECT ${merchantFields}
            FROM merchant
            WHERE (? = TRUE OR status = 'active')
            ORDER BY name ASC
        `, [includeDisabled]);

        return rows;
    }

    async findMerchantById(merchantId) {
        const [rows] = await pool.execute(`
            SELECT ${merchantFields}
            FROM merchant
            WHERE id = ?
            LIMIT 1
        `, [merchantId]);

        return rows[0] || null;
    }

    async createMerchant(merchant) {
        const [result] = await pool.execute(`
            INSERT INTO merchant (name, status, created_at, updated_at)
            VALUES (?, 'active', NOW(), NOW())
            ON DUPLICATE KEY UPDATE
                status = 'active',
                updated_at = NOW(),
                id = LAST_INSERT_ID(id)
        `, [merchant.name]);

        return this.findMerchantById(result.insertId);
    }
}

export default new ProductCatalogRepository();
