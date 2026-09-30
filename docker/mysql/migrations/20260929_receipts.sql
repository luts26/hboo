SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS receipt (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    purchase_id BIGINT UNSIGNED NOT NULL,
    client_mutation_id VARCHAR(128) NOT NULL,
    storage_key VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_receipt_purchase (purchase_id),
    UNIQUE KEY uniq_receipt_purchase_client_mutation (purchase_id, client_mutation_id),
    UNIQUE KEY uniq_receipt_storage_key (storage_key),
    KEY idx_receipt_purchase_id (purchase_id),
    CONSTRAINT fk_receipt_purchase FOREIGN KEY (purchase_id) REFERENCES purchase (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
