import pool from '../database/mysql.js';

const ocrFields = `
    ro.id,
    ro.receipt_id AS receiptId,
    ro.status,
    ro.raw_text AS rawText,
    ro.engine,
    ro.engine_version AS engineVersion,
    ro.language,
    ro.error_message AS errorMessage,
    ro.duration_ms AS durationMs,
    ro.created_at AS createdAt,
    ro.updated_at AS updatedAt
`;

class ReceiptOcrRepository {
    async findByReceiptId(receiptId, connection = pool) {
        const [rows] = await connection.execute(`
            SELECT ${ocrFields}
            FROM receipt_ocr ro
            WHERE ro.receipt_id = ?
            LIMIT 1
        `, [receiptId]);
        return rows[0] || null;
    }

    async markProcessing(receiptId, {engine, engineVersion, language}, connection = pool) {
        await connection.execute(`
            INSERT INTO receipt_ocr (
                receipt_id,
                status,
                raw_text,
                engine,
                engine_version,
                language,
                error_message,
                duration_ms,
                created_at,
                updated_at
            )
            VALUES (?, 'processing', NULL, ?, ?, ?, NULL, NULL, NOW(), NOW())
            ON DUPLICATE KEY UPDATE
                status = 'processing',
                raw_text = NULL,
                engine = VALUES(engine),
                engine_version = VALUES(engine_version),
                language = VALUES(language),
                error_message = NULL,
                duration_ms = NULL,
                updated_at = NOW()
        `, [receiptId, engine, engineVersion, language]);
        return this.findByReceiptId(receiptId, connection);
    }

    async markCompleted(receiptId, {rawText, engine, engineVersion, language, durationMs}, connection = pool) {
        await connection.execute(`
            UPDATE receipt_ocr
            SET status = 'completed',
                raw_text = ?,
                engine = ?,
                engine_version = ?,
                language = ?,
                error_message = NULL,
                duration_ms = ?,
                updated_at = NOW()
            WHERE receipt_id = ?
        `, [rawText, engine, engineVersion, language, durationMs, receiptId]);
        return this.findByReceiptId(receiptId, connection);
    }

    async markFailed(receiptId, {errorMessage, engine, engineVersion, language, durationMs}, connection = pool) {
        await connection.execute(`
            UPDATE receipt_ocr
            SET status = 'failed',
                raw_text = NULL,
                engine = ?,
                engine_version = ?,
                language = ?,
                error_message = ?,
                duration_ms = ?,
                updated_at = NOW()
            WHERE receipt_id = ?
        `, [engine, engineVersion, language, errorMessage, durationMs, receiptId]);
        return this.findByReceiptId(receiptId, connection);
    }
}

export default new ReceiptOcrRepository();
export {ReceiptOcrRepository};
