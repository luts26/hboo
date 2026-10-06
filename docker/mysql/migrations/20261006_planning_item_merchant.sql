-- Development Planning merchant link migration for hboo_dev only.

USE `hboo_dev`;

ALTER TABLE `planning_item`
  ADD COLUMN `merchant_id` BIGINT UNSIGNED NULL AFTER `category_id`,
  ADD KEY `idx_planning_item_merchant` (`merchant_id`),
  ADD CONSTRAINT `fk_planning_item_merchant`
    FOREIGN KEY (`merchant_id`) REFERENCES `merchant` (`id`) ON DELETE SET NULL;
