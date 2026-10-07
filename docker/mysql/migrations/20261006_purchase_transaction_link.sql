-- Development Purchase manual transaction link migration for hboo_dev only.

USE `hboo_dev`;

CREATE TABLE IF NOT EXISTS `purchase_transaction_link` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `purchase_id` bigint unsigned NOT NULL,
  `provider` varchar(25) NOT NULL,
  `provider_transaction_id` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_purchase_transaction_link_purchase` (`purchase_id`),
  UNIQUE KEY `uniq_purchase_transaction_link_transaction` (`provider`, `provider_transaction_id`),
  KEY `idx_purchase_transaction_link_purchase` (`purchase_id`),
  CONSTRAINT `fk_purchase_transaction_link_purchase`
    FOREIGN KEY (`purchase_id`) REFERENCES `purchase` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
