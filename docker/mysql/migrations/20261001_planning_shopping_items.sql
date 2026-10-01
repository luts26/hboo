-- Development Planning Shopping List v2 migration for hboo_dev only.

USE `hboo_dev`;

CREATE TABLE IF NOT EXISTS `planning_shopping_item` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `local_id` varchar(128) NOT NULL,
  `planning_item_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `amount` decimal(12,3) DEFAULT NULL,
  `unit` varchar(10) DEFAULT NULL,
  `checked` tinyint(1) NOT NULL DEFAULT 0,
  `position` int NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_planning_shopping_item_local` (`planning_item_id`, `local_id`),
  KEY `idx_planning_shopping_item_plan_position` (`planning_item_id`, `position`),
  KEY `idx_planning_shopping_item_product` (`product_id`),
  CONSTRAINT `fk_planning_shopping_item_plan`
    FOREIGN KEY (`planning_item_id`) REFERENCES `planning_item` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_planning_shopping_item_product`
    FOREIGN KEY (`product_id`) REFERENCES `product` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_planning_shopping_item_amount` CHECK (`amount` IS NULL OR `amount` > 0),
  CONSTRAINT `chk_planning_shopping_item_unit` CHECK (`unit` IS NULL OR `unit` IN ('g', 'kg', 'ml', 'l', 'pcs'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
