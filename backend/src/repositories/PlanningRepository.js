import pool from '../database/mysql.js';

class PlanningRepository {

    async createPeriod(userId, period) {
        const [result] = await pool.execute(`
            INSERT INTO planning_period (
                user_id,
                start_date,
                end_date,
                budget_amount,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, NOW(), NOW())
        `, [
            userId,
            period.startDate,
            period.endDate,
            period.budgetAmount
        ]);

        return this.findPeriodById(userId, result.insertId);
    }

    async findPeriodById(userId, periodId) {
        const [rows] = await pool.execute(`
            SELECT
                id,
                user_id AS userId,
                start_date AS startDate,
                end_date AS endDate,
                budget_amount AS budgetAmount,
                created_at AS createdAt,
                updated_at AS updatedAt
            FROM planning_period
            WHERE id = ?
              AND user_id = ?
            LIMIT 1
        `, [periodId, userId]);

        return rows[0] ?? null;
    }

    async findCurrentPeriod(userId, today) {
        const [activeRows] = await pool.execute(`
            SELECT
                id,
                user_id AS userId,
                start_date AS startDate,
                end_date AS endDate,
                budget_amount AS budgetAmount,
                created_at AS createdAt,
                updated_at AS updatedAt
            FROM planning_period
            WHERE user_id = ?
              AND start_date <= ?
              AND end_date >= ?
            ORDER BY end_date DESC, id DESC
            LIMIT 1
        `, [userId, today, today]);

        if (activeRows[0]) {
            return activeRows[0];
        }

        const [latestRows] = await pool.execute(`
            SELECT
                id,
                user_id AS userId,
                start_date AS startDate,
                end_date AS endDate,
                budget_amount AS budgetAmount,
                created_at AS createdAt,
                updated_at AS updatedAt
            FROM planning_period
            WHERE user_id = ?
            ORDER BY end_date DESC, id DESC
            LIMIT 1
        `, [userId]);

        return latestRows[0] ?? null;
    }

    async updatePeriod(userId, periodId, period) {
        const [result] = await pool.execute(`
            UPDATE planning_period
            SET
                start_date = ?,
                end_date = ?,
                budget_amount = ?,
                updated_at = NOW()
            WHERE id = ?
              AND user_id = ?
        `, [
            period.startDate,
            period.endDate,
            period.budgetAmount,
            periodId,
            userId
        ]);

        if (result.affectedRows === 0) {
            return null;
        }

        return this.findPeriodById(userId, periodId);
    }

    async createItem(item) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.execute(`
                INSERT INTO planning_item (
                    period_id,
                    category_id,
                    merchant_id,
                    title,
                    description,
                    planned_amount,
                    actual_amount,
                    status,
                    planned_at,
                    completed_at,
                    cancelled_at,
                    transaction_id,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                item.periodId,
                item.categoryId,
                item.merchantId,
                item.title,
                item.description,
                item.plannedAmount,
                item.actualAmount,
                item.status,
                item.plannedAt,
                item.completedAt,
                item.cancelledAt,
                item.transactionId
            ]);
            await this.replaceShoppingItemsWithConnection(connection, item.userId, result.insertId, item.shoppingItems || []);
            await connection.commit();
            return this.findItemById(item.userId, result.insertId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async findItemById(userId, itemId) {
        return this.findItemByIdWithConnection(pool, userId, itemId);
    }

    async findItemByIdWithConnection(connection, userId, itemId) {
        const [rows] = await connection.execute(`
            SELECT
                pi.id,
                pi.period_id AS periodId,
                pi.category_id AS categoryId,
                pi.merchant_id AS merchantId,
                pi.title,
                pi.description,
                pi.planned_amount AS plannedAmount,
                pi.actual_amount AS actualAmount,
                pi.status,
                pi.planned_at AS plannedAt,
                pi.completed_at AS completedAt,
                pi.cancelled_at AS cancelledAt,
                pi.transaction_id AS transactionId,
                pi.created_at AS createdAt,
                pi.updated_at AS updatedAt
            FROM planning_item pi
            INNER JOIN planning_period pp
                ON pp.id = pi.period_id
            WHERE pi.id = ?
              AND pp.user_id = ?
            LIMIT 1
        `, [itemId, userId]);

        return rows[0] ? await this.attachShoppingItems(userId, rows[0], connection) : null;
    }

    async findItemsByPeriodId(userId, periodId) {
        const [rows] = await pool.execute(`
            SELECT
                pi.id,
                pi.period_id AS periodId,
                pi.category_id AS categoryId,
                pi.merchant_id AS merchantId,
                pi.title,
                pi.description,
                pi.planned_amount AS plannedAmount,
                pi.actual_amount AS actualAmount,
                pi.status,
                pi.planned_at AS plannedAt,
                pi.completed_at AS completedAt,
                pi.cancelled_at AS cancelledAt,
                pi.transaction_id AS transactionId,
                pi.created_at AS createdAt,
                pi.updated_at AS updatedAt
            FROM planning_item pi
            INNER JOIN planning_period pp
                ON pp.id = pi.period_id
            WHERE pi.period_id = ?
              AND pp.user_id = ?
            ORDER BY pi.planned_at ASC, pi.id ASC
        `, [periodId, userId]);

        return this.attachShoppingItemsToMany(userId, rows);
    }

    async updateItem(userId, itemId, item) {
        return this.updateItemWithConnection(pool, userId, itemId, item);
    }

    async updateItemWithConnection(connection, userId, itemId, item) {
        const [result] = await connection.execute(`
            UPDATE planning_item pi
            INNER JOIN planning_period pp
                ON pp.id = pi.period_id
            SET
                pi.period_id = ?,
                pi.category_id = ?,
                pi.merchant_id = ?,
                pi.title = ?,
                pi.description = ?,
                pi.planned_amount = ?,
                pi.actual_amount = ?,
                pi.status = ?,
                pi.planned_at = ?,
                pi.completed_at = ?,
                pi.cancelled_at = ?,
                pi.transaction_id = ?,
                pi.updated_at = NOW()
            WHERE pi.id = ?
              AND pp.user_id = ?
        `, [
            item.periodId,
            item.categoryId,
            item.merchantId,
            item.title,
            item.description,
            item.plannedAmount,
            item.actualAmount,
            item.status,
            item.plannedAt,
            item.completedAt,
            item.cancelledAt,
            item.transactionId,
            itemId,
            userId
        ]);

        if (result.affectedRows === 0) {
            return null;
        }

        if (Array.isArray(item.shoppingItems)) {
            await this.replaceShoppingItemsWithConnection(connection, userId, itemId, item.shoppingItems);
        }

        return this.findItemByIdWithConnection(connection, userId, itemId);
    }

    async deleteItem(userId, itemId) {
        const [result] = await pool.execute(`
            DELETE pi
            FROM planning_item pi
            INNER JOIN planning_period pp
                ON pp.id = pi.period_id
            WHERE pi.id = ?
              AND pp.user_id = ?
        `, [itemId, userId]);

        return result.affectedRows > 0;
    }

    async categoryExists(categoryId) {
        const [rows] = await pool.execute(`
            SELECT id
            FROM categories
            WHERE id = ?
              AND status = 'active'
            LIMIT 1
        `, [categoryId]);

        return rows.length > 0;
    }

    async productExists(productId, connection = pool) {
        const [rows] = await connection.execute(`
            SELECT id
            FROM product
            WHERE id = ?
              AND status = 'active'
            LIMIT 1
        `, [productId]);

        return rows.length > 0;
    }

    async attachShoppingItems(userId, item, connection = pool) {
        const [rows] = await connection.execute(`
            SELECT
                psi.id,
                psi.local_id AS localId,
                psi.planning_item_id AS planningItemId,
                psi.product_id AS productId,
                p.name AS productName,
                psi.name,
                psi.amount,
                psi.unit,
                psi.checked,
                psi.position,
                psi.created_at AS createdAt,
                psi.updated_at AS updatedAt
            FROM planning_shopping_item psi
            INNER JOIN planning_item pi ON pi.id = psi.planning_item_id
            INNER JOIN planning_period pp ON pp.id = pi.period_id
            LEFT JOIN product p ON p.id = psi.product_id
            WHERE psi.planning_item_id = ?
              AND pp.user_id = ?
            ORDER BY psi.position ASC, psi.id ASC
        `, [item.id, userId]);

        return {
            ...item,
            shoppingItems: rows
        };
    }

    async attachShoppingItemsToMany(userId, items) {
        if (!items.length) return [];
        const ids = items.map(item => Number(item.id));
        const placeholders = ids.map(() => '?').join(',');
        const [rows] = await pool.execute(`
            SELECT
                psi.id,
                psi.local_id AS localId,
                psi.planning_item_id AS planningItemId,
                psi.product_id AS productId,
                p.name AS productName,
                psi.name,
                psi.amount,
                psi.unit,
                psi.checked,
                psi.position,
                psi.created_at AS createdAt,
                psi.updated_at AS updatedAt
            FROM planning_shopping_item psi
            INNER JOIN planning_item pi ON pi.id = psi.planning_item_id
            INNER JOIN planning_period pp ON pp.id = pi.period_id
            LEFT JOIN product p ON p.id = psi.product_id
            WHERE psi.planning_item_id IN (${placeholders})
              AND pp.user_id = ?
            ORDER BY psi.position ASC, psi.id ASC
        `, [...ids, userId]);
        const byItemId = new Map();
        rows.forEach(row => {
            const key = String(row.planningItemId);
            if (!byItemId.has(key)) byItemId.set(key, []);
            byItemId.get(key).push(row);
        });

        return items.map(item => ({
            ...item,
            shoppingItems: byItemId.get(String(item.id)) || []
        }));
    }

    async replaceShoppingItemsWithConnection(connection, userId, itemId, shoppingItems) {
        const [ownedRows] = await connection.execute(`
            SELECT psi.local_id AS localId
            FROM planning_shopping_item psi
            INNER JOIN planning_item pi ON pi.id = psi.planning_item_id
            INNER JOIN planning_period pp ON pp.id = pi.period_id
            WHERE psi.planning_item_id = ?
              AND pp.user_id = ?
        `, [itemId, userId]);
        const nextLocalIds = new Set(shoppingItems.map(item => item.localId));

        for (const row of ownedRows) {
            if (nextLocalIds.has(row.localId)) continue;
            await connection.execute(`
                DELETE FROM planning_shopping_item
                WHERE planning_item_id = ?
                  AND local_id = ?
            `, [itemId, row.localId]);
        }

        for (const item of shoppingItems) {
            await connection.execute(`
                INSERT INTO planning_shopping_item (
                    local_id,
                    planning_item_id,
                    product_id,
                    name,
                    amount,
                    unit,
                    checked,
                    position,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                    product_id = VALUES(product_id),
                    name = VALUES(name),
                    amount = VALUES(amount),
                    unit = VALUES(unit),
                    checked = VALUES(checked),
                    position = VALUES(position),
                    updated_at = NOW()
            `, [
                item.localId,
                itemId,
                item.productId,
                item.name,
                item.amount,
                item.unit,
                item.checked ? 1 : 0,
                item.position
            ]);
        }
    }
}

export default new PlanningRepository();
