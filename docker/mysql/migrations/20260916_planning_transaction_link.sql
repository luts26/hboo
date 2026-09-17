-- Development Planning manual transaction link migration for hboo_dev only.

USE `hboo_dev`;

CREATE TABLE IF NOT EXISTS `planning_transaction_link` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `planning_item_id` bigint unsigned NOT NULL,
  `provider` varchar(25) NOT NULL,
  `provider_transaction_id` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_planning_transaction_link` (`planning_item_id`, `provider`, `provider_transaction_id`),
  KEY `idx_planning_transaction_link_item` (`planning_item_id`),
  KEY `idx_planning_transaction_link_transaction` (`provider`, `provider_transaction_id`),
  CONSTRAINT `fk_planning_transaction_link_item`
    FOREIGN KEY (`planning_item_id`) REFERENCES `planning_item` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
