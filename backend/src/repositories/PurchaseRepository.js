import pool from '../database/mysql.js';

const purchaseFields = `
    p.id,
    p.user_id AS userId,
    p.client_mutation_id AS clientMutationId,
    p.merchant_id AS merchantId,
    m.name AS merchantName,
    p.purchased_at AS purchasedAt,
    p.payment_type AS paymentType,
    p.transaction_provider AS transactionProvider,
    p.transaction_id AS transactionId,
    p.total,
    p.note,
    p.created_at AS createdAt,
    p.updated_at AS updatedAt
`;

const itemFields = `
    pi.id,
    pi.purchase_id AS purchaseId,
    pi.product_id AS productId,
    pr.name AS productName,
    pr.category_id AS categoryId,
    pc.name AS categoryName,
    pr.measurement_type AS measurementType,
    pr.status AS productStatus,
    pi.quantity,
    pi.unit,
    pi.total,
    pi.created_at AS createdAt,
    pi.updated_at AS updatedAt
`;

const toSqlDateTime = timestamp => {
    const date = new Date(Number(timestamp));
    const pad = value => String(value).padStart(2, '0');
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('-') + ' ' + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join(':');
};

const isFiniteTimestamp = value => value !== null
    && value !== undefined
    && value !== ''
    && Number.isFinite(Number(value));

class PurchaseRepository {

    async findPurchases(userId, {limit = 50, dateFrom = null, dateTo = null} = {}) {
        const fromTime = Number(dateFrom);
        const toTime = Number(dateTo);
        if (!isFiniteTimestamp(dateFrom) || !isFiniteTimestamp(dateTo) || fromTime > toTime) {
            throw new Error('Invalid purchase date range');
        }

        const [rows] = await pool.execute(`
            SELECT ${purchaseFields}
            FROM purchase p
            LEFT JOIN merchant m ON m.id = p.merchant_id
            WHERE p.user_id = ?
              AND p.purchased_at >= ?
              AND p.purchased_at <= ?
            ORDER BY p.purchased_at DESC, p.id DESC
            LIMIT ?
        `, [userId, toSqlDateTime(fromTime), toSqlDateTime(toTime), Number(limit)]);

        await this.attachItems(rows);
        return rows;
    }

    async findPurchaseById(userId, purchaseId) {
        const [rows] = await pool.execute(`
            SELECT ${purchaseFields}
            FROM purchase p
            LEFT JOIN merchant m ON m.id = p.merchant_id
            WHERE p.user_id = ?
              AND p.id = ?
            LIMIT 1
        `, [userId, purchaseId]);

        const purchase = rows[0] || null;
        if (!purchase) return null;

        purchase.items = await this.findItemsByPurchaseId(purchase.id);
        return purchase;
    }

    async findPurchaseByClientMutationId(userId, clientMutationId, connection = pool) {
        if (!clientMutationId) return null;
        const [rows] = await connection.execute(`
            SELECT ${purchaseFields}
            FROM purchase p
            LEFT JOIN merchant m ON m.id = p.merchant_id
            WHERE p.user_id = ?
              AND p.client_mutation_id = ?
            LIMIT 1
        `, [userId, clientMutationId]);

        const purchase = rows[0] || null;
        if (!purchase) return null;

        purchase.items = await this.findItemsByPurchaseId(purchase.id, connection);
        return purchase;
    }

    async findItemsByPurchaseId(purchaseId, connection = pool) {
        const [rows] = await connection.execute(`
            SELECT ${itemFields}
            FROM purchase_item pi
            INNER JOIN product pr ON pr.id = pi.product_id
            INNER JOIN product_category pc ON pc.id = pr.category_id
            WHERE pi.purchase_id = ?
            ORDER BY pi.id ASC
        `, [purchaseId]);

        return rows;
    }

    async attachItems(purchases, connection = pool) {
        if (!purchases.length) return purchases;

        const ids = purchases.map(purchase => Number(purchase.id)).filter(id => Number.isInteger(id) && id > 0);
        if (!ids.length) return purchases;

        const placeholders = ids.map(() => '?').join(', ');
        const [items] = await connection.execute(`
            SELECT ${itemFields}
            FROM purchase_item pi
            INNER JOIN product pr ON pr.id = pi.product_id
            INNER JOIN product_category pc ON pc.id = pr.category_id
            WHERE pi.purchase_id IN (${placeholders})
            ORDER BY pi.purchase_id ASC, pi.id ASC
        `, ids);

        const itemsByPurchaseId = new Map();
        items.forEach(item => {
            const key = String(item.purchaseId);
            if (!itemsByPurchaseId.has(key)) itemsByPurchaseId.set(key, []);
            itemsByPurchaseId.get(key).push(item);
        });

        purchases.forEach(purchase => {
            purchase.items = itemsByPurchaseId.get(String(purchase.id)) || [];
        });

        return purchases;
    }

    async createPurchase(userId, purchase) {
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const existing = await this.findPurchaseByClientMutationId(userId, purchase.clientMutationId, connection);
            if (existing) {
                await connection.commit();
                return existing;
            }

            const [result] = await connection.execute(`
                INSERT INTO purchase (
                    user_id,
                    client_mutation_id,
                    merchant_id,
                    purchased_at,
                    payment_type,
                    transaction_provider,
                    transaction_id,
                    total,
                    note,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                userId,
                purchase.clientMutationId,
                purchase.merchantId,
                purchase.purchasedAt,
                purchase.paymentType,
                purchase.transactionProvider,
                purchase.transactionId,
                purchase.total,
                purchase.note
            ]);

            const purchaseId = result.insertId;

            for (const item of purchase.items) {
                await connection.execute(`
                    INSERT INTO purchase_item (
                        purchase_id,
                        product_id,
                        quantity,
                        unit,
                        total,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, NOW(), NOW())
                `, [
                    purchaseId,
                    item.productId,
                    item.quantity,
                    item.unit,
                    item.total
                ]);
            }

            await connection.commit();
            return this.findPurchaseById(userId, purchaseId);
        } catch (error) {
            await connection.rollback();
            if (error?.code === 'ER_DUP_ENTRY' && purchase.clientMutationId) {
                const existing = await this.findPurchaseByClientMutationId(userId, purchase.clientMutationId);
                if (existing) return existing;
            }
            throw error;
        } finally {
            connection.release();
        }
    }

    async replacePurchase(userId, purchaseId, purchase) {
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [result] = await connection.execute(`
                UPDATE purchase
                SET
                    merchant_id = ?,
                    purchased_at = ?,
                    payment_type = ?,
                    transaction_provider = ?,
                    transaction_id = ?,
                    total = ?,
                    note = ?,
                    updated_at = NOW()
                WHERE id = ?
                  AND user_id = ?
            `, [
                purchase.merchantId,
                purchase.purchasedAt,
                purchase.paymentType,
                purchase.transactionProvider,
                purchase.transactionId,
                purchase.total,
                purchase.note,
                purchaseId,
                userId
            ]);

            if (result.affectedRows === 0) {
                await connection.rollback();
                return null;
            }

            await connection.execute('DELETE FROM purchase_item WHERE purchase_id = ?', [purchaseId]);

            for (const item of purchase.items) {
                await connection.execute(`
                    INSERT INTO purchase_item (
                        purchase_id,
                        product_id,
                        quantity,
                        unit,
                        total,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, NOW(), NOW())
                `, [
                    purchaseId,
                    item.productId,
                    item.quantity,
                    item.unit,
                    item.total
                ]);
            }

            await connection.commit();
            return this.findPurchaseById(userId, purchaseId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async deletePurchase(userId, purchaseId) {
        const [result] = await pool.execute(`
            DELETE FROM purchase
            WHERE id = ?
              AND user_id = ?
        `, [purchaseId, userId]);

        return result.affectedRows > 0;
    }
}

export default new PurchaseRepository();
