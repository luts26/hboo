-- Development categories migration/seed for hboo_dev only.
-- Keeps the legacy `category` table untouched.

USE `hboo_dev`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `category_mapping`;
DROP TABLE IF EXISTS `category_translations`;
DROP TABLE IF EXISTS `categories`;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE `categories` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(100) NOT NULL,
  `icon` varchar(255) DEFAULT NULL,
  `type` varchar(25) NOT NULL DEFAULT 'expense',
  `status` varchar(25) NOT NULL DEFAULT 'active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_categories_code` (`code`),
  KEY `idx_categories_status_type` (`status`, `type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `category_translations` (
  `category_id` bigint unsigned NOT NULL,
  `language` varchar(10) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`category_id`, `language`),
  KEY `idx_category_translations_language` (`language`),
  CONSTRAINT `fk_category_translations_category`
    FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `category_mapping` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `category_id` bigint unsigned NOT NULL,
  `provider` varchar(25) NOT NULL,
  `external_code` varchar(100) NOT NULL,
  `external_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_category_mapping_provider_code` (`provider`, `external_code`),
  KEY `idx_category_mapping_category_id` (`category_id`),
  CONSTRAINT `fk_category_mapping_category`
    FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `categories` (`id`, `code`, `icon`, `type`, `status`) VALUES
  (1, 'transfers', 'transfer-money-icon', 'expense', 'active'),
  (2, 'restaurants', 'restoran-icon', 'expense', 'active'),
  (3, 'groceries', 'food-icon', 'expense', 'active'),
  (4, 'medicine', 'medicine-icon', 'expense', 'active'),
  (5, 'children_goods', 'toy-icon', 'expense', 'active'),
  (6, 'entertainment', 'fun-icon', 'expense', 'active'),
  (7, 'cleaning_clothing', 'cleaning-clothing-icon', 'expense', 'active'),
  (8, 'car', 'car-icon', 'expense', 'active'),
  (9, 'other', 'other-icon', 'expense', 'active'),
  (10, 'delivery', 'delivery-icon', 'expense', 'active'),
  (11, 'cash_withdrawal', 'atm-icon', 'expense', 'active'),
  (12, 'travel', 'travel-icon', 'expense', 'active'),
  (13, 'bank_services', '', 'expense', 'active'),
  (14, 'payments', '', 'expense', 'active'),
  (15, 'flowers', 'flover-icon', 'expense', 'active'),
  (16, 'mobile_communication', 'mobile-icon', 'expense', 'active'),
  (17, 'beauty_health', 'beauty-icon', 'expense', 'active'),
  (18, 'hotels', 'hotel-icon', 'expense', 'active'),
  (19, 'savings', 'savemoney-icon', 'expense', 'active'),
  (20, 'services', '', 'expense', 'active');

INSERT INTO `category_translations` (`category_id`, `language`, `name`, `description`) VALUES
  (1, 'uk', 'Перекази', NULL),
  (1, 'en', 'Transfers', NULL),
  (2, 'uk', 'Кафе та ресторани', 'Ресторани та бари'),
  (2, 'en', 'Cafes and restaurants', 'Restaurants and bars'),
  (3, 'uk', 'Продукти та супермаркети', 'Продукти'),
  (3, 'en', 'Groceries and supermarkets', 'Groceries'),
  (4, 'uk', 'Медицина', 'Аназізи, Ортопедія, Стоматологія, Медичне обслуговування'),
  (4, 'en', 'Medicine', 'Medical tests, Orthopedics, Dentistry, Medical care'),
  (5, 'uk', 'Товари для дітей', NULL),
  (5, 'en', 'Children goods', NULL),
  (6, 'uk', 'Розваги', NULL),
  (6, 'en', 'Entertainment', NULL),
  (7, 'uk', 'Хімчистка та шиття', NULL),
  (7, 'en', 'Dry cleaning and tailoring', NULL),
  (8, 'uk', 'Авто', NULL),
  (8, 'en', 'Car', NULL),
  (9, 'uk', 'Інше', NULL),
  (9, 'en', 'Other', NULL),
  (10, 'uk', 'Послуги доставки', 'Укрпошта, Нова пошта'),
  (10, 'en', 'Delivery services', 'Ukrposhta, Nova Poshta'),
  (11, 'uk', 'Зняття готівки', NULL),
  (11, 'en', 'Cash withdrawal', NULL),
  (12, 'uk', 'Подорожі', 'Mетро, Дитяча залізниця'),
  (12, 'en', 'Travel', 'Metro, Children railway'),
  (13, 'uk', 'Банківські послуги', NULL),
  (13, 'en', 'Bank services', NULL),
  (14, 'uk', 'Платежі', NULL),
  (14, 'en', 'Payments', NULL),
  (15, 'uk', 'Квіти', NULL),
  (15, 'en', 'Flowers', NULL),
  (16, 'uk', 'Звязок', 'Поповнення мобільного, Iнтернет'),
  (16, 'en', 'Mobile communication', 'Mobile top up, Internet'),
  (17, 'uk', 'Краса та здоровя', NULL),
  (17, 'en', 'Beauty and health', NULL),
  (18, 'uk', 'Готелі', NULL),
  (18, 'en', 'Hotels', NULL),
  (19, 'uk', 'Заощадження', NULL),
  (19, 'en', 'Savings', NULL),
  (20, 'uk', 'Послуги', NULL),
  (20, 'en', 'Services', NULL);

INSERT INTO `category_mapping` (`category_id`, `provider`, `external_code`, `external_name`) VALUES
  (1, 'privat', '8', NULL),
  (1, 'mono', '4829', NULL),
  (2, 'privat', '5', NULL),
  (2, 'mono', '5814', NULL),
  (2, 'mono', '5462', NULL),
  (2, 'mono', '5812', NULL),
  (2, 'mono', '5441', NULL),
  (3, 'privat', '10', NULL),
  (3, 'mono', '5499', NULL),
  (3, 'mono', '5411', NULL),
  (3, 'mono', '5399', NULL),
  (4, 'mono', '5912', NULL),
  (4, 'mono', '8071', NULL),
  (4, 'mono', '5976', NULL),
  (4, 'mono', '8021', NULL),
  (4, 'mono', '8099', NULL),
  (4, 'mono', '8062', NULL),
  (5, 'mono', '5945', NULL),
  (6, 'privat', '12', NULL),
  (6, 'mono', '7996', NULL),
  (7, 'mono', '7216', NULL),
  (7, 'mono', '7211', NULL),
  (8, 'privat', '13', NULL),
  (8, 'mono', '7542', NULL),
  (8, 'mono', '5541', NULL),
  (9, 'privat', '11', NULL),
  (9, 'mono', '5944', NULL),
  (9, 'mono', '4812', NULL),
  (9, 'mono', '9399', NULL),
  (9, 'mono', '6012', NULL),
  (10, 'mono', '9402', NULL),
  (10, 'mono', '4214', NULL),
  (10, 'mono', '7399', NULL),
  (10, 'mono', '7299', NULL),
  (11, 'privat', '2', NULL),
  (11, 'mono', '6011', NULL),
  (12, 'privat', '15', NULL),
  (12, 'mono', '4111', NULL),
  (12, 'mono', '4112', NULL),
  (13, 'privat', '1000000000054736', NULL),
  (14, 'privat', '6', NULL),
  (14, 'mono', '4215', NULL),
  (14, 'mono', '5942', NULL),
  (14, 'mono', '5999', NULL),
  (14, 'mono', '7999', NULL),
  (15, 'mono', '5992', NULL),
  (16, 'privat', '9', NULL),
  (16, 'mono', '4900', NULL),
  (16, 'mono', '4814', NULL),
  (17, 'mono', '5977', NULL),
  (17, 'mono', '7230', NULL),
  (18, 'mono', '7011', NULL),
  (19, 'privat', '100000000000896', NULL),
  (20, 'privat', '1000000000054739', NULL);
