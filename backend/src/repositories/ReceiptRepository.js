import pool from '../database/mysql.js';

const receiptFields = `
    r.id,
    r.user_id AS userId,
    r.purchase_id AS purchaseId,
    r.client_mutation_id AS clientMutationId,
    r.storage_key AS storageKey,
    r.original_filename AS originalFilename,
    r.mime_type AS mimeType,
    r.size_bytes AS sizeBytes,
    r.created_at AS createdAt,
    r.updated_at AS updatedAt
`;

class ReceiptRepository {
    async findByPurchaseId(userId, purchaseId, connection = pool) {
        const [rows] = await connection.execute(`
            SELECT ${receiptFields}
            FROM receipt r
            INNER JOIN purchase p ON p.id = r.purchase_id
            WHERE p.user_id = ?
              AND r.purchase_id = ?
            LIMIT 1
        `, [userId, purchaseId]);
        return rows[0] || null;
    }

    async findById(userId, receiptId, connection = pool) {
        const [rows] = await connection.execute(`
            SELECT ${receiptFields}
            FROM receipt r
            WHERE r.user_id = ?
              AND r.id = ?
            LIMIT 1
        `, [userId, receiptId]);
        return rows[0] || null;
    }

    async findStandaloneReceipts(userId, connection = pool) {
        const [rows] = await connection.execute(`
            SELECT ${receiptFields}
            FROM receipt r
            WHERE r.user_id = ?
              AND r.purchase_id IS NULL
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT 50
        `, [userId]);
        return rows;
    }

    async findByClientMutationId(userId, clientMutationId, connection = pool) {
        if (!clientMutationId) return null;
        const [rows] = await connection.execute(`
            SELECT ${receiptFields}
            FROM receipt r
            WHERE r.user_id = ?
              AND r.client_mutation_id = ?
            LIMIT 1
        `, [userId, clientMutationId]);
        return rows[0] || null;
    }

    async upsertReceipt(userId, receipt) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const existingByMutation = await this.findByClientMutationId(
                userId,
                receipt.clientMutationId,
                connection
            );
            if (existingByMutation) {
                await connection.commit();
                return {receipt: existingByMutation, replacedStorageKey: null, idempotent: true};
            }

            const existing = await this.findByPurchaseId(userId, receipt.purchaseId, connection);
            if (existing) {
                await connection.execute(`
                    UPDATE receipt
                    SET client_mutation_id = ?,
                        storage_key = ?,
                        original_filename = ?,
                        mime_type = ?,
                        size_bytes = ?,
                        updated_at = NOW()
                    WHERE id = ?
                `, [
                    receipt.clientMutationId,
                    receipt.storageKey,
                    receipt.originalFilename,
                    receipt.mimeType,
                    receipt.sizeBytes,
                    existing.id
                ]);
                await connection.commit();
                return {
                    receipt: await this.findByPurchaseId(userId, receipt.purchaseId),
                    replacedStorageKey: existing.storageKey,
                    idempotent: false
                };
            }

            await connection.execute(`
                INSERT INTO receipt (
                    user_id,
                    purchase_id,
                    client_mutation_id,
                    storage_key,
                    original_filename,
                    mime_type,
                    size_bytes,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                userId,
                receipt.purchaseId,
                receipt.clientMutationId,
                receipt.storageKey,
                receipt.originalFilename,
                receipt.mimeType,
                receipt.sizeBytes
            ]);

            await connection.commit();
            return {
                receipt: await this.findByPurchaseId(userId, receipt.purchaseId),
                replacedStorageKey: null,
                idempotent: false
            };
        } catch (error) {
            await connection.rollback();
            if (error?.code === 'ER_DUP_ENTRY') {
                const existing = await this.findByClientMutationId(userId, receipt.clientMutationId)
                    || await this.findByPurchaseId(userId, receipt.purchaseId);
                if (existing) return {receipt: existing, replacedStorageKey: null, idempotent: true};
            }
            throw error;
        } finally {
            connection.release();
        }
    }

    async createStandaloneReceipt(userId, receipt) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const existing = await this.findByClientMutationId(userId, receipt.clientMutationId, connection);
            if (existing) {
                await connection.commit();
                return {receipt: existing, idempotent: true};
            }
            const [result] = await connection.execute(`
                INSERT INTO receipt (
                    user_id,
                    purchase_id,
                    client_mutation_id,
                    storage_key,
                    original_filename,
                    mime_type,
                    size_bytes,
                    created_at,
                    updated_at
                )
                VALUES (?, NULL, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                userId,
                receipt.clientMutationId,
                receipt.storageKey,
                receipt.originalFilename,
                receipt.mimeType,
                receipt.sizeBytes
            ]);
            await connection.commit();
            return {receipt: await this.findById(userId, result.insertId), idempotent: false};
        } catch (error) {
            await connection.rollback();
            if (error?.code === 'ER_DUP_ENTRY') {
                const existing = await this.findByClientMutationId(userId, receipt.clientMutationId);
                if (existing) return {receipt: existing, idempotent: true};
            }
            throw error;
        } finally {
            connection.release();
        }
    }

    async deleteById(userId, receiptId) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const existing = await this.findById(userId, receiptId, connection);
            if (!existing) {
                await connection.commit();
                return null;
            }
            await connection.execute('DELETE FROM receipt WHERE id = ? AND user_id = ?', [existing.id, userId]);
            await connection.commit();
            return existing;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async deleteByPurchaseId(userId, purchaseId) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const existing = await this.findByPurchaseId(userId, purchaseId, connection);
            if (!existing) {
                await connection.commit();
                return null;
            }
            await connection.execute('DELETE FROM receipt WHERE id = ?', [existing.id]);
            await connection.commit();
            return existing;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

export default new ReceiptRepository();
export {ReceiptRepository};
