-- Development Planning v2 migration for hboo_dev only.

USE `hboo_dev`;

CREATE TABLE IF NOT EXISTS `planning_period` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `budget_amount` decimal(12,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_planning_period_user_dates` (`user_id`, `start_date`, `end_date`),
  CONSTRAINT `fk_planning_period_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_planning_period_dates` CHECK (`start_date` <= `end_date`),
  CONSTRAINT `chk_planning_period_budget_amount` CHECK (`budget_amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `planning_item` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `period_id` bigint unsigned NOT NULL,
  `category_id` bigint unsigned DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `description` varchar(1000) DEFAULT NULL,
  `planned_amount` decimal(12,2) NOT NULL,
  `actual_amount` decimal(12,2) DEFAULT NULL,
  `status` enum('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
  `planned_at` date NOT NULL,
  `completed_at` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `transaction_id` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_planning_item_period_status` (`period_id`, `status`),
  KEY `idx_planning_item_category` (`category_id`),
  CONSTRAINT `fk_planning_item_period`
    FOREIGN KEY (`period_id`) REFERENCES `planning_period` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_planning_item_category`
    FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_planning_item_planned_amount` CHECK (`planned_amount` >= 0),
  CONSTRAINT `chk_planning_item_actual_amount` CHECK (`actual_amount` IS NULL OR `actual_amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
