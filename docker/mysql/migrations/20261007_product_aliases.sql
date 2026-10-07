-- Development Product Alias migration for hboo_dev only.

USE `hboo_dev`;

SELECT DATABASE(), CURRENT_USER();

SET @raw_name_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'purchase_item'
      AND COLUMN_NAME = 'raw_name'
);

SET @add_raw_name_sql = IF(
    @raw_name_exists = 0,
    'ALTER TABLE purchase_item ADD COLUMN raw_name VARCHAR(500) NULL AFTER total',
    'SELECT ''purchase_item.raw_name already exists'''
);

PREPARE add_raw_name_stmt FROM @add_raw_name_sql;
EXECUTE add_raw_name_stmt;
DEALLOCATE PREPARE add_raw_name_stmt;

CREATE TABLE IF NOT EXISTS product_alias (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_id BIGINT UNSIGNED NOT NULL,
    merchant_id BIGINT UNSIGNED NULL,
    alias VARCHAR(500) NOT NULL,
    normalized_alias VARCHAR(500) NOT NULL,
    merchant_scope_id BIGINT UNSIGNED
        GENERATED ALWAYS AS (COALESCE(merchant_id, 0)) STORED,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_product_alias_scope_normalized (merchant_scope_id, normalized_alias),
    KEY idx_product_alias_product_id (product_id),
    KEY idx_product_alias_merchant_id (merchant_id),
    KEY idx_product_alias_normalized (normalized_alias),
    CONSTRAINT fk_product_alias_product
        FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE,
    CONSTRAINT fk_product_alias_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchant (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
