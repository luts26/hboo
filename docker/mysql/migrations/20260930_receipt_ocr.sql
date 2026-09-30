SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS receipt_ocr (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    receipt_id BIGINT UNSIGNED NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    raw_text MEDIUMTEXT NULL,
    engine VARCHAR(64) NOT NULL,
    engine_version VARCHAR(128) NULL,
    language VARCHAR(64) NOT NULL,
    error_message VARCHAR(255) NULL,
    duration_ms INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_receipt_ocr_receipt (receipt_id),
    KEY idx_receipt_ocr_status (status),
    CONSTRAINT fk_receipt_ocr_receipt FOREIGN KEY (receipt_id) REFERENCES receipt (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
