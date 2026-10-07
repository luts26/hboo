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

    async getManualMatchCandidates(dateFrom, dateTo, planningItemId) {
        const fromTimestamp = Math.floor(dateFrom / 1000);
        const toTimestamp = Math.floor(dateTo / 1000);

        const [rows] = await pool.execute(`
            SELECT *
            FROM (
                SELECT
                    'mono' AS provider,
                    mt.t_id AS providerTransactionId,
                    mt.time * 1000 AS timestamp,
                    CAST(mt.amount AS DECIMAL(15, 2)) AS amount,
                    mt.description AS description,
                    CAST(mt.mcc AS CHAR) AS category,
                    ptl.id IS NOT NULL AS linked
                FROM mono_transaction mt
                LEFT JOIN planning_transaction_link ptl
                    ON ptl.provider = 'mono'
                    AND ptl.provider_transaction_id = mt.t_id
                    AND ptl.planning_item_id = ?
                WHERE mt.time >= ?
                    AND mt.time <= ?
                    AND mt.t_id IS NOT NULL
                    AND CAST(mt.amount AS DECIMAL(15, 2)) < 0

                UNION ALL

                SELECT
                    'privat' AS provider,
                    pt.t_id AS providerTransactionId,
                    CAST(pt.date AS UNSIGNED) AS timestamp,
                    CAST(pt.amount AS DECIMAL(15, 2)) AS amount,
                    CONCAT_WS(': ', pt.details, pt.category_details) AS description,
                    pt.category AS category,
                    ptl.id IS NOT NULL AS linked
                FROM privat_transaction pt
                LEFT JOIN planning_transaction_link ptl
                    ON ptl.provider = 'privat'
                    AND ptl.provider_transaction_id = pt.t_id
                    AND ptl.planning_item_id = ?
                WHERE CAST(pt.date AS UNSIGNED) >= ?
                    AND CAST(pt.date AS UNSIGNED) <= ?
                    AND pt.t_id IS NOT NULL
                    AND CAST(pt.amount AS DECIMAL(15, 2)) < 0
            ) transactions
            ORDER BY timestamp DESC
        `, [planningItemId, fromTimestamp, toTimestamp, planningItemId, dateFrom, dateTo]);

        return rows;
    }

    async getSmartCompletionCandidates(dateFrom, dateTo, planningItemId, categoryId = null) {
        const fromTimestamp = Math.floor(dateFrom / 1000);
        const toTimestamp = Math.floor(dateTo / 1000);

        const [rows] = await pool.execute(`
            SELECT *
            FROM (
                SELECT
                    'mono' AS provider,
                    mt.t_id AS providerTransactionId,
                    mt.time * 1000 AS timestamp,
                    CAST(mt.amount AS DECIMAL(15, 2)) AS amount,
                    mt.description AS description,
                    CAST(mt.mcc AS CHAR) AS category,
                    cm.category_id IS NOT NULL AS categoryMatched,
                    ptl.id IS NOT NULL AS linked
                FROM mono_transaction mt
                LEFT JOIN category_mapping cm
                    ON cm.provider = 'mono'
                    AND cm.external_code = CAST(mt.mcc AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci
                    AND cm.category_id = ?
                LEFT JOIN planning_transaction_link ptl
                    ON ptl.provider = 'mono'
                    AND ptl.provider_transaction_id = mt.t_id
                    AND ptl.planning_item_id = ?
                WHERE mt.time >= ?
                    AND mt.time <= ?
                    AND mt.t_id IS NOT NULL
                    AND CAST(mt.amount AS DECIMAL(15, 2)) < 0
                    AND NOT EXISTS (
                        SELECT 1
                        FROM planning_transaction_link existing_link
                        WHERE existing_link.provider = 'mono'
                            AND existing_link.provider_transaction_id = mt.t_id
                    )

                UNION ALL

                SELECT
                    'privat' AS provider,
                    pt.t_id AS providerTransactionId,
                    CAST(pt.date AS UNSIGNED) AS timestamp,
                    CAST(pt.amount AS DECIMAL(15, 2)) AS amount,
                    CONCAT_WS(': ', pt.details, pt.category_details) AS description,
                    pt.category AS category,
                    cm.category_id IS NOT NULL AS categoryMatched,
                    ptl.id IS NOT NULL AS linked
                FROM privat_transaction pt
                LEFT JOIN category_mapping cm
                    ON cm.provider = 'privat'
                    AND cm.external_code = pt.category
                    AND cm.category_id = ?
                LEFT JOIN planning_transaction_link ptl
                    ON ptl.provider = 'privat'
                    AND ptl.provider_transaction_id = pt.t_id
                    AND ptl.planning_item_id = ?
                WHERE CAST(pt.date AS UNSIGNED) >= ?
                    AND CAST(pt.date AS UNSIGNED) <= ?
                    AND pt.t_id IS NOT NULL
                    AND CAST(pt.amount AS DECIMAL(15, 2)) < 0
                    AND NOT EXISTS (
                        SELECT 1
                        FROM planning_transaction_link existing_link
                        WHERE existing_link.provider = 'privat'
                            AND existing_link.provider_transaction_id = pt.t_id
                    )
            ) transactions
            ORDER BY timestamp DESC
        `, [
            categoryId,
            planningItemId,
            fromTimestamp,
            toTimestamp,
            categoryId,
            planningItemId,
            dateFrom,
            dateTo
        ]);

        return rows;
    }

    async getLinkedPlanningTransactions(planningItemId) {
        const [rows] = await pool.execute(`
            SELECT *
            FROM (
                SELECT
                    ptl.id AS linkId,
                    ptl.planning_item_id AS planningItemId,
                    ptl.created_at AS linkedAt,
                    'mono' AS provider,
                    mt.t_id AS providerTransactionId,
                    mt.time * 1000 AS timestamp,
                    CAST(mt.amount AS DECIMAL(15, 2)) AS amount,
                    mt.description AS description,
                    CAST(mt.mcc AS CHAR) AS category,
                    TRUE AS linked
                FROM planning_transaction_link ptl
                INNER JOIN mono_transaction mt
                    ON mt.t_id = ptl.provider_transaction_id
                WHERE ptl.planning_item_id = ?
                    AND ptl.provider = 'mono'

                UNION ALL

                SELECT
                    ptl.id AS linkId,
                    ptl.planning_item_id AS planningItemId,
                    ptl.created_at AS linkedAt,
                    'privat' AS provider,
                    pt.t_id AS providerTransactionId,
                    CAST(pt.date AS UNSIGNED) AS timestamp,
                    CAST(pt.amount AS DECIMAL(15, 2)) AS amount,
                    CONCAT_WS(': ', pt.details, pt.category_details) AS description,
                    pt.category AS category,
                    TRUE AS linked
                FROM planning_transaction_link ptl
                INNER JOIN privat_transaction pt
                    ON pt.t_id = ptl.provider_transaction_id
                WHERE ptl.planning_item_id = ?
                    AND ptl.provider = 'privat'
            ) transactions
            ORDER BY timestamp DESC
        `, [planningItemId, planningItemId]);

        return rows;
    }

    async getPurchaseTransactionCandidates(dateFrom, dateTo, purchaseId) {
        const fromTimestamp = Math.floor(dateFrom / 1000);
        const toTimestamp = Math.floor(dateTo / 1000);

        const [rows] = await pool.execute(`
            SELECT *
            FROM (
                SELECT
                    'mono' AS provider,
                    mt.t_id AS providerTransactionId,
                    mt.time * 1000 AS timestamp,
                    CAST(mt.amount AS DECIMAL(15, 2)) AS amount,
                    mt.description AS description,
                    CAST(mt.mcc AS CHAR) AS category
                FROM mono_transaction mt
                WHERE mt.time >= ?
                    AND mt.time <= ?
                    AND mt.t_id IS NOT NULL
                    AND CAST(mt.amount AS DECIMAL(15, 2)) < 0
                    AND NOT EXISTS (
                        SELECT 1
                        FROM purchase_transaction_link existing_link
                        WHERE existing_link.provider = 'mono'
                            AND existing_link.provider_transaction_id = mt.t_id
                            AND existing_link.purchase_id <> ?
                    )

                UNION ALL

                SELECT
                    'privat' AS provider,
                    pt.t_id AS providerTransactionId,
                    CAST(pt.date AS UNSIGNED) AS timestamp,
                    CAST(pt.amount AS DECIMAL(15, 2)) AS amount,
                    CONCAT_WS(': ', pt.details, pt.category_details) AS description,
                    pt.category AS category
                FROM privat_transaction pt
                WHERE CAST(pt.date AS UNSIGNED) >= ?
                    AND CAST(pt.date AS UNSIGNED) <= ?
                    AND pt.t_id IS NOT NULL
                    AND CAST(pt.amount AS DECIMAL(15, 2)) < 0
                    AND NOT EXISTS (
                        SELECT 1
                        FROM purchase_transaction_link existing_link
                        WHERE existing_link.provider = 'privat'
                            AND existing_link.provider_transaction_id = pt.t_id
                            AND existing_link.purchase_id <> ?
                    )
            ) transactions
            ORDER BY timestamp DESC
        `, [fromTimestamp, toTimestamp, purchaseId, dateFrom, dateTo, purchaseId]);

        return rows;
    }

    async getLinkedPurchaseTransaction(purchaseId, connection = pool) {
        const [rows] = await connection.execute(`
            SELECT *
            FROM (
                SELECT
                    ptl.id AS linkId,
                    ptl.purchase_id AS purchaseId,
                    ptl.created_at AS linkedAt,
                    'mono' AS provider,
                    mt.t_id AS providerTransactionId,
                    mt.time * 1000 AS timestamp,
                    CAST(mt.amount AS DECIMAL(15, 2)) AS amount,
                    mt.description AS description,
                    CAST(mt.mcc AS CHAR) AS category
                FROM purchase_transaction_link ptl
                INNER JOIN mono_transaction mt
                    ON mt.t_id = ptl.provider_transaction_id
                WHERE ptl.purchase_id = ?
                    AND ptl.provider = 'mono'

                UNION ALL

                SELECT
                    ptl.id AS linkId,
                    ptl.purchase_id AS purchaseId,
                    ptl.created_at AS linkedAt,
                    'privat' AS provider,
                    pt.t_id AS providerTransactionId,
                    CAST(pt.date AS UNSIGNED) AS timestamp,
                    CAST(pt.amount AS DECIMAL(15, 2)) AS amount,
                    CONCAT_WS(': ', pt.details, pt.category_details) AS description,
                    pt.category AS category
                FROM purchase_transaction_link ptl
                INNER JOIN privat_transaction pt
                    ON pt.t_id = ptl.provider_transaction_id
                WHERE ptl.purchase_id = ?
                    AND ptl.provider = 'privat'
            ) transactions
            LIMIT 1
        `, [purchaseId, purchaseId]);

        return rows[0] || null;
    }

    async getTransaction(provider, providerTransactionId, connection = pool) {
        const table = this.getProviderTable(provider);
        const providerValue = provider === 'mono' ? `'mono'` : `'privat'`;
        const timestampExpression = provider === 'mono' ? 'time * 1000' : 'CAST(date AS UNSIGNED)';
        const descriptionExpression = provider === 'mono' ? 'description' : 'CONCAT_WS(\': \', details, category_details)';
        const categoryExpression = provider === 'mono' ? 'CAST(mcc AS CHAR)' : 'category';

        const [rows] = await connection.execute(`
            SELECT
                ${providerValue} AS provider,
                t_id AS providerTransactionId,
                ${timestampExpression} AS timestamp,
                CAST(amount AS DECIMAL(15, 2)) AS amount,
                ${descriptionExpression} AS description,
                ${categoryExpression} AS category
            FROM ${table}
            WHERE t_id = ?
            LIMIT 1
        `, [providerTransactionId]);

        return rows[0] || null;
    }

    async transactionExists(provider, providerTransactionId) {
        return this.transactionExistsWithConnection(pool, provider, providerTransactionId);
    }

    async transactionExistsWithConnection(connection, provider, providerTransactionId) {
        const table = this.getProviderTable(provider);
        const [rows] = await connection.execute(`
            SELECT t_id
            FROM ${table}
            WHERE t_id = ?
            LIMIT 1
        `, [providerTransactionId]);

        return rows.length > 0;
    }

    async createPlanningTransactionLink(planningItemId, provider, providerTransactionId) {
        return this.createPlanningTransactionLinkWithConnection(pool, planningItemId, provider, providerTransactionId);
    }

    async createPlanningTransactionLinkWithConnection(connection, planningItemId, provider, providerTransactionId) {
        const [result] = await connection.execute(`
            INSERT INTO planning_transaction_link (
                planning_item_id,
                provider,
                provider_transaction_id,
                created_at
            )
            VALUES (?, ?, ?, NOW())
        `, [planningItemId, provider, providerTransactionId]);

        return result.insertId;
    }

    async createPurchaseTransactionLinkWithConnection(connection, purchaseId, provider, providerTransactionId) {
        const [result] = await connection.execute(`
            INSERT INTO purchase_transaction_link (
                purchase_id,
                provider,
                provider_transaction_id,
                created_at
            )
            VALUES (?, ?, ?, NOW())
        `, [purchaseId, provider, providerTransactionId]);

        return result.insertId;
    }

    async findPurchaseTransactionLinkByPurchaseWithConnection(connection, purchaseId) {
        const [rows] = await connection.execute(`
            SELECT
                id,
                purchase_id AS purchaseId,
                provider,
                provider_transaction_id AS providerTransactionId,
                created_at AS createdAt
            FROM purchase_transaction_link
            WHERE purchase_id = ?
            LIMIT 1
        `, [purchaseId]);

        return rows[0] || null;
    }

    async findPurchaseTransactionLinkByTransactionWithConnection(connection, provider, providerTransactionId) {
        const [rows] = await connection.execute(`
            SELECT
                id,
                purchase_id AS purchaseId,
                provider,
                provider_transaction_id AS providerTransactionId,
                created_at AS createdAt
            FROM purchase_transaction_link
            WHERE provider = ?
                AND provider_transaction_id = ?
            LIMIT 1
        `, [provider, providerTransactionId]);

        return rows[0] || null;
    }

    async getTransactionAmount(provider, providerTransactionId) {
        return this.getTransactionAmountWithConnection(pool, provider, providerTransactionId);
    }

    async getTransactionAmountWithConnection(connection, provider, providerTransactionId) {
        const table = this.getProviderTable(provider);
        const [rows] = await connection.execute(`
            SELECT CAST(amount AS DECIMAL(15, 2)) AS amount
            FROM ${table}
            WHERE t_id = ?
            LIMIT 1
        `, [providerTransactionId]);

        return rows[0] ? Number(rows[0].amount) : null;
    }

    async deletePlanningTransactionLink(planningItemId, provider, providerTransactionId) {
        const [result] = await pool.execute(`
            DELETE FROM planning_transaction_link
            WHERE planning_item_id = ?
                AND provider = ?
                AND provider_transaction_id = ?
        `, [planningItemId, provider, providerTransactionId]);

        return result.affectedRows > 0;
    }

    async deletePurchaseTransactionLink(purchaseId) {
        const [result] = await pool.execute(`
            DELETE FROM purchase_transaction_link
            WHERE purchase_id = ?
        `, [purchaseId]);

        return result.affectedRows > 0;
    }

    getProviderTable(provider) {
        if (provider === 'mono') return 'mono_transaction';
        if (provider === 'privat') return 'privat_transaction';

        throw new Error('Unsupported provider');
    }
}

export default new TransactionRepository();
