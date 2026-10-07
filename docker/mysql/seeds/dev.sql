-- Development-only mocked data
-- All data in this file is synthetic and intended only for local development/testing.
-- Login: admin || demo.user
-- Admin password: 12345
-- NEVER use these credentials outside the dev database

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM `user_roles`;
DELETE FROM `auth_session`;
DELETE FROM `users`;
DELETE FROM `roles`;
DELETE FROM `mono`;
DELETE FROM `privat`;
DELETE FROM `mono_transaction`;
DELETE FROM `privat_transaction`;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO `roles` (`id`, `name`, `status`, `created`, `updated`) VALUES
    (1, 'ROLE_USER', 'ACTIVE', '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
    (2, 'ROLE_ADMIN', 'ACTIVE', '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO `users` (
    `id`,
    `username`,
    `first_name`,
    `last_name`,
    `email`,
    `password`,
    `status`,
    `created`,
    `updated`
) VALUES
    (
        1,
        'demo.user',
        'Demo',
        'User',
        'demo.user@example.com',
        '$2b$04$bmEbOVGS.OHr9PbslO3dTOteDT79Je0rT92GF9g3ueTVoxwlXYGnO',
        'ACTIVE',
        '2026-09-01 09:05:00',
        '2026-09-01 09:05:00'
    ),
    (
        2,
        'admin',
        'Demo',
        'Admin',
        'admin@example.com',
        '$2b$04$OkygdNsf.C876CveQe0X5ORtPqxuKkGjxN0olRu1pzWZeQtricZrS',
        'ACTIVE',
        '2026-09-01 09:10:00',
        '2026-09-01 09:10:00'
    );

INSERT INTO `user_roles` (`user_id`, `role_id`) VALUES
    (1, 1),
    (2, 1),
    (2, 2);

INSERT INTO `mono` (
    `id`,
    `balance`,
    `c_id`,
    `cashback_type`,
    `credit_limit`,
    `currency_code`,
    `date`,
    `iban`,
    `send_id`,
    `type`
) VALUES
    (3001, 3600000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1763460000', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3002, 3350000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1769076000', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3003, 2800000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1773828000', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3004, 4200000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1775210400', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3005, 3900000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1775988000', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3006, 3650000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1777024800', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3007, 3800000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1777716000', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3008, 3350000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1778839200', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3009, 2850000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1779962400', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3010, 2600000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1780740000', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3011, 2150000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1781690400', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3012, 3700000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1782640800', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3013, 4100000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1783159200', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3014, 3500000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1783677600', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3015, 3150000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1784368800', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3016, 2700000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1784887200', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3017, 2300000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1785405600', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3018, 2000000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1785924000', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3019, 2500000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1786528800', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3020, 3900000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1787220000', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3021, 3400000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1787824800', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3022, 2800000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1788516000', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3023, 2400000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1789120800', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3024, 3900000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1789898400', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3025, 3300000, 'test-mono-card-alpha', 'UAH', 3000000, 980, '1790503200', 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black');

INSERT INTO `privat` (
    `id`,
    `account`,
    `balance`,
    `card_number`,
    `credit_limit`,
    `currency`,
    `date`
) VALUES
    (
        1,
        'TEST-PRIVAT-ACCOUNT-ALPHA',
        8600.00,
        'TEST-CARD-ALPHA',
        0.00,
        'UAH',
        '1789106400000'
    ),
    (
        2,
        'TEST-PRIVAT-ACCOUNT-BETA',
        2450.00,
        'TEST-CARD-BETA',
        7000.00,
        'UAH',
        '1789106400000'
    );

INSERT INTO `mono_transaction` (
    `id`,
    `amount`,
    `cashback_amount`,
    `commission_rate`,
    `currency_code`,
    `description`,
    `mcc`,
    `operation_amount`,
    `original_mcc`,
    `receipt_id`,
    `t_id`,
    `time`
) VALUES
    (4001, '52000.00', '0.00', '0.00', '980', 'DEV July salary payment', 6012, 5200000, 6012, 'dev-mono-receipt-202607-001', 'dev-mono-202607-001', 1782896400),
    (4002, '3500.00', '0.00', '0.00', '980', 'DEV July incoming family transfer', 4829, 350000, 4829, 'dev-mono-receipt-202607-002', 'dev-mono-202607-002', 1783096200),
    (4003, '-8420.35', '84.20', '0.00', '980', 'DEV July groceries and supermarket', 5411, -842035, 5411, 'dev-mono-receipt-202607-003', 'dev-mono-202607-003', 1783254000),
    (4004, '-3650.00', '18.25', '0.00', '980', 'DEV July fuel station', 5541, -365000, 5541, 'dev-mono-receipt-202607-004', 'dev-mono-202607-004', 1783536000),
    (4005, '-2480.40', '24.80', '0.00', '980', 'DEV July cafe and restaurant', 5812, -248040, 5812, 'dev-mono-receipt-202607-005', 'dev-mono-202607-005', 1783754100),
    (4006, '-5120.00', '0.00', '0.00', '980', 'DEV July utilities and internet', 4900, -512000, 4900, 'dev-mono-receipt-202607-006', 'dev-mono-202607-006', 1784056200),
    (4007, '-4380.00', '0.00', '0.00', '980', 'DEV July online service purchase', 5999, -438000, 5999, 'dev-mono-receipt-202607-007', 'dev-mono-202607-007', 1784379600),
    (4008, '-1760.00', '17.60', '0.00', '980', 'DEV July pharmacy order', 5912, -176000, 5912, 'dev-mono-receipt-202607-008', 'dev-mono-202607-008', 1784630700),
    (4009, '-3240.00', '32.40', '0.00', '980', 'DEV July delivery services', 4214, -324000, 4214, 'dev-mono-receipt-202607-009', 'dev-mono-202607-009', 1784993400),
    (4010, '-5600.00', '0.00', '0.00', '980', 'DEV July cash withdrawal', 6011, -560000, 6011, 'dev-mono-receipt-202607-010', 'dev-mono-202607-010', 1785324300),
    (4101, '53500.00', '0.00', '0.00', '980', 'DEV August salary payment', 6012, 5350000, 6012, 'dev-mono-receipt-202608-001', 'dev-mono-202608-001', 1785574800),
    (4102, '2200.00', '0.00', '0.00', '980', 'DEV August incoming transfer', 4829, 220000, 4829, 'dev-mono-receipt-202608-002', 'dev-mono-202608-002', 1785776400),
    (4103, '-10320.10', '103.20', '0.00', '980', 'DEV August groceries and household', 5411, -1032010, 5411, 'dev-mono-receipt-202608-003', 'dev-mono-202608-003', 1786016400),
    (4104, '-4210.00', '21.05', '0.00', '980', 'DEV August fuel and car wash', 7542, -421000, 7542, 'dev-mono-receipt-202608-004', 'dev-mono-202608-004', 1786299000),
    (4105, '-5200.00', '52.00', '0.00', '980', 'DEV August restaurants', 5814, -520000, 5814, 'dev-mono-receipt-202608-005', 'dev-mono-202608-005', 1786523400),
    (4106, '-6150.00', '0.00', '0.00', '980', 'DEV August utilities and mobile', 4814, -615000, 4814, 'dev-mono-receipt-202608-006', 'dev-mono-202608-006', 1786803600),
    (4107, '-7800.00', '0.00', '0.00', '980', 'DEV August online equipment purchase', 5942, -780000, 5942, 'dev-mono-receipt-202608-007', 'dev-mono-202608-007', 1787083200),
    (4108, '-2450.30', '24.50', '0.00', '980', 'DEV August clinic and pharmacy', 5912, -245030, 5912, 'dev-mono-receipt-202608-008', 'dev-mono-202608-008', 1787307300),
    (4109, '-3650.00', '36.50', '0.00', '980', 'DEV August delivery and postal services', 7399, -365000, 7399, 'dev-mono-receipt-202608-009', 'dev-mono-202608-009', 1787590200),
    (4110, '-4200.00', '0.00', '0.00', '980', 'DEV August entertainment tickets', 7996, -420000, 7996, 'dev-mono-receipt-202608-010', 'dev-mono-202608-010', 1787837700),
    (4111, '-4580.00', '45.80', '0.00', '980', 'DEV August beauty and health', 7230, -458000, 7230, 'dev-mono-receipt-202608-011', 'dev-mono-202608-011', 1788091500);

INSERT INTO `privat_transaction` (
    `id`,
    `amount`,
    `balance`,
    `cashback`,
    `category`,
    `category_details`,
    `date`,
    `details`,
    `fee`,
    `lat`,
    `lng`,
    `t_id`,
    `type`
) VALUES
    (2001, '9000.00', '8600.00', '0.00', '8', 'Перекази', '1789106100000', 'Synthetic monthly income', '0.00', '0.0000', '0.0000', 'test-privat-tx-2001', 'CREDIT'),
    (2002, '-410.20', '8190.00', '4.10', '10', 'Продукти', '1789050900000', 'Synthetic supermarket purchase', '0.00', '0.0000', '0.0000', 'test-privat-tx-2002', 'DEBIT'),
    (2003, '-260.00', '7780.00', '2.60', '5', 'Ресторани та бари', '1789027800000', 'Synthetic lunch payment', '0.00', '0.0000', '0.0000', 'test-privat-tx-2003', 'DEBIT'),
    (2004, '-185.80', '7520.00', '1.85', '11', 'Інше', '1788967200000', 'Synthetic pharmacy purchase', '0.00', '0.0000', '0.0000', 'test-privat-tx-2004', 'DEBIT'),
    (2005, '-640.00', '7334.20', '0.00', '9', 'Iнтернет', '1788933900000', 'Synthetic internet bill', '0.00', '0.0000', '0.0000', 'test-privat-tx-2005', 'DEBIT'),
    (2006, '-700.00', '6694.20', '0.00', '8', 'Перекази', '1788866100000', 'Synthetic savings transfer', '0.00', '0.0000', '0.0000', 'test-privat-tx-2006', 'DEBIT'),
    (2007, '-1000.00', '5994.20', '0.00', '2', 'Зняття готівки', '1788802800000', 'Synthetic cash withdrawal', '15.00', '0.0000', '0.0000', 'test-privat-tx-2007', 'DEBIT'),
    (2008, '-230.60', '4994.20', '2.30', '11', 'Інше', '1788691800000', 'Synthetic delivery payment', '0.00', '0.0000', '0.0000', 'test-privat-tx-2008', 'DEBIT'),
    (2009, '-160.00', '4763.60', '0.00', '9', 'Поповнення мобільного', '1788591600000', 'Synthetic mobile payment', '0.00', '0.0000', '0.0000', 'test-privat-tx-2009', 'DEBIT'),
    (2010, '1200.00', '4603.60', '0.00', '8', 'Перекази', '1788546000000', 'Synthetic incoming transfer', '0.00', '0.0000', '0.0000', 'test-privat-tx-2010', 'CREDIT'),
    (2011, '-500.00', '5803.60', '0.00', '100000000000896', 'Заощадження', '1788412200000', 'Synthetic deposit transfer', '0.00', '0.0000', '0.0000', 'test-privat-tx-2011', 'DEBIT');

-- DEV-only Product Price History / Prices by Store dataset.
-- Stable client_mutation_id values keep this deterministic and safe to rerun.
SET NAMES utf8mb4;

INSERT INTO purchase (
    user_id,
    client_mutation_id,
    merchant_id,
    purchased_at,
    payment_type,
    total,
    note
)
SELECT u.id, seed.client_mutation_id, m.id, seed.purchased_at, 'cash', seed.total, seed.note
FROM (
    SELECT 'dev-price-2026-07-04-atb' client_mutation_id, 'АТБ' merchant_name, '2026-07-04 10:15:00' purchased_at, 164.40 total, 'DEV price history seed: July ATB groceries' note UNION ALL
    SELECT 'dev-price-2026-07-19-novus', 'Novus', '2026-07-19 18:40:00', 170.61, 'DEV price history seed: July Novus groceries' UNION ALL
    SELECT 'dev-price-2026-08-08-silpo', 'Сільпо', '2026-08-08 13:05:00', 270.40, 'DEV price history seed: August Silpo groceries' UNION ALL
    SELECT 'dev-price-2026-08-24-atb', 'АТБ', '2026-08-24 19:10:00', 182.00, 'DEV price history seed: August ATB groceries' UNION ALL
    SELECT 'dev-price-2026-09-10-novus', 'Novus', '2026-09-10 17:35:00', 130.41, 'DEV price history seed: September Novus groceries' UNION ALL
    SELECT 'dev-price-2026-09-21-atb-morning', 'АТБ', '2026-09-21 10:30:00', 59.90, 'DEV price history seed: same-day ATB observation' UNION ALL
    SELECT 'dev-price-2026-09-21-novus-evening', 'Novus', '2026-09-21 18:20:00', 58.41, 'DEV price history seed: same-day Novus observation' UNION ALL
    SELECT 'dev-price-2026-09-24-bulvarchyk', 'Бульварчик', '2026-09-24 12:20:00', 68.00, 'DEV price history seed: count product at Bulvarchyk' UNION ALL
    SELECT 'dev-price-2026-09-27-atb', 'АТБ', '2026-09-27 16:45:00', 223.30, 'DEV price history seed: duplicate Milk item rows'
) seed
INNER JOIN users u ON u.username = 'demo.user'
INNER JOIN merchant m ON m.name = seed.merchant_name
ON DUPLICATE KEY UPDATE
    merchant_id = VALUES(merchant_id),
    purchased_at = VALUES(purchased_at),
    payment_type = VALUES(payment_type),
    total = VALUES(total),
    note = VALUES(note);

DELETE pi
FROM purchase_item pi
INNER JOIN purchase p ON p.id = pi.purchase_id
INNER JOIN users u ON u.id = p.user_id
WHERE u.username = 'demo.user'
  AND p.client_mutation_id LIKE 'dev-price-%';

INSERT INTO purchase_item (
    purchase_id,
    product_id,
    quantity,
    unit,
    total
)
SELECT p.id, pr.id, seed.quantity, seed.unit, seed.total
FROM (
    SELECT 'dev-price-2026-07-04-atb' client_mutation_id, 'Молоко' product_name, 1.000 quantity, 'l' unit, 57.90 total UNION ALL
    SELECT 'dev-price-2026-07-04-atb', 'Помідори', 500.000, 'g', 42.50 UNION ALL
    SELECT 'dev-price-2026-07-04-atb', 'Яйця курячі', 10.000, 'pcs', 64.00 UNION ALL
    SELECT 'dev-price-2026-07-19-novus', 'Молоко', 900.000, 'ml', 56.61 UNION ALL
    SELECT 'dev-price-2026-07-19-novus', 'Помідори', 1.200, 'kg', 114.00 UNION ALL
    SELECT 'dev-price-2026-08-08-silpo', 'Молоко', 1.000, 'l', 65.40 UNION ALL
    SELECT 'dev-price-2026-08-08-silpo', 'Помідори', 750.000, 'g', 69.00 UNION ALL
    SELECT 'dev-price-2026-08-08-silpo', 'Яйця курячі', 20.000, 'pcs', 136.00 UNION ALL
    SELECT 'dev-price-2026-08-24-atb', 'Молоко', 2.000, 'l', 116.00 UNION ALL
    SELECT 'dev-price-2026-08-24-atb', 'Яйця курячі', 10.000, 'pcs', 66.00 UNION ALL
    SELECT 'dev-price-2026-09-10-novus', 'Молоко', 900.000, 'ml', 58.41 UNION ALL
    SELECT 'dev-price-2026-09-10-novus', 'Яйця курячі', 10.000, 'pcs', 72.00 UNION ALL
    SELECT 'dev-price-2026-09-21-atb-morning', 'Молоко', 1.000, 'l', 59.90 UNION ALL
    SELECT 'dev-price-2026-09-21-novus-evening', 'Молоко', 900.000, 'ml', 58.41 UNION ALL
    SELECT 'dev-price-2026-09-24-bulvarchyk', 'Яйця курячі', 10.000, 'pcs', 68.00 UNION ALL
    SELECT 'dev-price-2026-09-27-atb', 'Молоко', 1.000, 'l', 60.20 UNION ALL
    SELECT 'dev-price-2026-09-27-atb', 'Молоко', 500.000, 'ml', 31.10 UNION ALL
    SELECT 'dev-price-2026-09-27-atb', 'Помідори', 1.500, 'kg', 132.00
) seed
INNER JOIN users u ON u.username = 'demo.user'
INNER JOIN purchase p ON p.user_id = u.id AND p.client_mutation_id = seed.client_mutation_id
INNER JOIN product pr ON pr.name = seed.product_name;

-- DEV-only screenshot / portfolio demo dataset.
-- Synthetic deterministic data for hboo_dev. No REAL data, no bank API calls.

INSERT INTO `mono` (
    `id`,
    `balance`,
    `c_id`,
    `cashback_type`,
    `credit_limit`,
    `currency_code`,
    `date`,
    `iban`,
    `send_id`,
    `type`
) VALUES
    (3026, 3550000, 'test-mono-card-alpha', 'UAH', 3000000, 980, UNIX_TIMESTAMP('2026-09-28 10:00:00'), 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3027, 3120000, 'test-mono-card-alpha', 'UAH', 3000000, 980, UNIX_TIMESTAMP('2026-09-29 10:00:00'), 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3028, 2740000, 'test-mono-card-alpha', 'UAH', 3000000, 980, UNIX_TIMESTAMP('2026-09-30 10:00:00'), 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3029, 7650000, 'test-mono-card-alpha', 'UAH', 3000000, 980, UNIX_TIMESTAMP('2026-10-01 10:00:00'), 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3030, 7210000, 'test-mono-card-alpha', 'UAH', 3000000, 980, UNIX_TIMESTAMP('2026-10-02 10:00:00'), 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3031, 6845000, 'test-mono-card-alpha', 'UAH', 3000000, 980, UNIX_TIMESTAMP('2026-10-03 10:00:00'), 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3032, 6420000, 'test-mono-card-alpha', 'UAH', 3000000, 980, UNIX_TIMESTAMP('2026-10-04 10:00:00'), 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black'),
    (3033, 6040000, 'test-mono-card-alpha', 'UAH', 3000000, 980, UNIX_TIMESTAMP('2026-10-05 10:00:00'), 'TEST-MONO-IBAN-ALPHA', 'test-mono-send-alpha', 'demo-black');

INSERT INTO `mono_transaction` (
    `id`,
    `amount`,
    `cashback_amount`,
    `commission_rate`,
    `currency_code`,
    `description`,
    `mcc`,
    `operation_amount`,
    `original_mcc`,
    `receipt_id`,
    `t_id`,
    `time`
) VALUES
    (4201, '-1387.40', '13.87', '0.00', '980', 'АТБ продукти', 5411, -138740, 5411, 'dev-demo-mono-receipt-202609-001', 'dev-demo-mono-202609-001', UNIX_TIMESTAMP('2026-09-22 18:10:00')),
    (4202, '-465.00', '4.65', '0.00', '980', 'Аптека ліки', 5912, -46500, 5912, 'dev-demo-mono-receipt-202609-002', 'dev-demo-mono-202609-002', UNIX_TIMESTAMP('2026-09-23 11:45:00')),
    (4203, '-820.00', '0.00', '0.00', '980', 'Київстар мобільний звязок', 4814, -82000, 4814, 'dev-demo-mono-receipt-202609-003', 'dev-demo-mono-202609-003', UNIX_TIMESTAMP('2026-09-24 09:20:00')),
    (4204, '-2240.00', '0.00', '0.00', '980', 'Комунальні платежі', 4900, -224000, 4900, 'dev-demo-mono-receipt-202609-004', 'dev-demo-mono-202609-004', UNIX_TIMESTAMP('2026-09-24 20:05:00')),
    (4205, '-312.50', '3.12', '0.00', '980', 'Кафе обід', 5812, -31250, 5812, 'dev-demo-mono-receipt-202609-005', 'dev-demo-mono-202609-005', UNIX_TIMESTAMP('2026-09-25 13:30:00')),
    (4206, '-940.20', '9.40', '0.00', '980', 'Сільпо продукти', 5411, -94020, 5411, 'dev-demo-mono-receipt-202609-006', 'dev-demo-mono-202609-006', UNIX_TIMESTAMP('2026-09-26 19:15:00')),
    (4207, '-580.00', '5.80', '0.00', '980', 'Аврора побутові товари', 5399, -58000, 5399, 'dev-demo-mono-receipt-202609-007', 'dev-demo-mono-202609-007', UNIX_TIMESTAMP('2026-09-27 16:40:00')),
    (4208, '-1540.00', '0.00', '0.00', '980', 'Одяг', 5944, -154000, 5944, 'dev-demo-mono-receipt-202609-008', 'dev-demo-mono-202609-008', UNIX_TIMESTAMP('2026-09-28 18:25:00')),
    (4209, '-720.00', '7.20', '0.00', '980', 'Ресторан вечеря', 5814, -72000, 5814, 'dev-demo-mono-receipt-202609-009', 'dev-demo-mono-202609-009', UNIX_TIMESTAMP('2026-09-29 20:10:00')),
    (4210, '-430.00', '4.30', '0.00', '980', 'Таксі та транспорт', 4121, -43000, 4121, 'dev-demo-mono-receipt-202609-010', 'dev-demo-mono-202609-010', UNIX_TIMESTAMP('2026-09-30 08:50:00')),
    (4211, '54000.00', '0.00', '0.00', '980', 'Зарплата жовтень', 6012, 5400000, 6012, 'dev-demo-mono-receipt-202610-001', 'dev-demo-mono-202610-001', UNIX_TIMESTAMP('2026-10-01 09:05:00')),
    (4212, '3500.00', '0.00', '0.00', '980', 'Підробіток переказ', 4829, 350000, 4829, 'dev-demo-mono-receipt-202610-002', 'dev-demo-mono-202610-002', UNIX_TIMESTAMP('2026-10-01 18:30:00')),
    (4213, '-1516.35', '15.16', '0.00', '980', 'АТБ продукти', 5411, -151635, 5411, 'dev-demo-mono-receipt-202610-003', 'dev-demo-mono-202610-003', UNIX_TIMESTAMP('2026-10-02 18:20:00')),
    (4214, '-780.00', '7.80', '0.00', '980', 'Аптека', 5912, -78000, 5912, 'dev-demo-mono-receipt-202610-004', 'dev-demo-mono-202610-004', UNIX_TIMESTAMP('2026-10-03 10:15:00')),
    (4215, '-690.00', '0.00', '0.00', '980', 'Домашній інтернет', 4814, -69000, 4814, 'dev-demo-mono-receipt-202610-005', 'dev-demo-mono-202610-005', UNIX_TIMESTAMP('2026-10-03 12:00:00')),
    (4216, '-424.70', '4.25', '0.00', '980', 'NOVUS продукти', 5411, -42470, 5411, 'dev-demo-mono-receipt-202610-006', 'dev-demo-mono-202610-006', UNIX_TIMESTAMP('2026-10-04 17:35:00')),
    (4217, '-620.00', '6.20', '0.00', '980', 'Кафе вихідний', 5812, -62000, 5812, 'dev-demo-mono-receipt-202610-007', 'dev-demo-mono-202610-007', UNIX_TIMESTAMP('2026-10-05 12:40:00')),
    (4218, '-350.00', '3.50', '0.00', '980', 'Аврора товари для дому', 5399, -35000, 5399, 'dev-demo-mono-receipt-202610-008', 'dev-demo-mono-202610-008', UNIX_TIMESTAMP('2026-10-05 16:05:00')),
    (4219, '-118.00', '1.18', '0.00', '980', 'Метро транспорт', 4111, -11800, 4111, 'dev-demo-mono-receipt-202610-009', 'dev-demo-mono-202610-009', UNIX_TIMESTAMP('2026-10-05 18:10:00')),
    (4220, '-249.00', '2.49', '0.00', '980', 'Підписка сервіс', 4899, -24900, 4899, 'dev-demo-mono-receipt-202610-010', 'dev-demo-mono-202610-010', UNIX_TIMESTAMP('2026-10-05 20:45:00'));

INSERT INTO `privat_transaction` (
    `id`,
    `amount`,
    `balance`,
    `cashback`,
    `category`,
    `category_details`,
    `date`,
    `details`,
    `fee`,
    `lat`,
    `lng`,
    `t_id`,
    `type`
) VALUES
    (2012, '-245.00', '4518.60', '2.45', '10', 'Продукти', UNIX_TIMESTAMP('2026-09-22 09:15:00') * 1000, 'Лоток продукти', '0.00', '0.0000', '0.0000', 'dev-demo-privat-202609-001', 'DEBIT'),
    (2013, '-180.00', '4273.60', '0.00', '9', 'Поповнення мобільного', UNIX_TIMESTAMP('2026-09-25 10:00:00') * 1000, 'Київстар поповнення', '0.00', '0.0000', '0.0000', 'dev-demo-privat-202609-002', 'DEBIT'),
    (2014, '-520.00', '4093.60', '5.20', '5', 'Ресторани та бари', UNIX_TIMESTAMP('2026-09-27 14:20:00') * 1000, 'Ресторан', '0.00', '0.0000', '0.0000', 'dev-demo-privat-202609-003', 'DEBIT'),
    (2015, '-1270.00', '3573.60', '0.00', '11', 'Інше', UNIX_TIMESTAMP('2026-09-30 19:00:00') * 1000, 'Одяг', '0.00', '0.0000', '0.0000', 'dev-demo-privat-202609-004', 'DEBIT'),
    (2016, '9000.00', '12303.60', '0.00', '8', 'Перекази', UNIX_TIMESTAMP('2026-10-01 09:30:00') * 1000, 'Додатковий дохід', '0.00', '0.0000', '0.0000', 'dev-demo-privat-202610-001', 'CREDIT'),
    (2017, '-360.00', '11943.60', '3.60', '10', 'Продукти', UNIX_TIMESTAMP('2026-10-02 08:35:00') * 1000, 'Сільпо сніданки', '0.00', '0.0000', '0.0000', 'dev-demo-privat-202610-002', 'DEBIT'),
    (2018, '-1200.00', '10743.60', '0.00', '8', 'Перекази', UNIX_TIMESTAMP('2026-10-03 15:10:00') * 1000, 'Переказ у накопичення', '0.00', '0.0000', '0.0000', 'dev-demo-privat-202610-003', 'DEBIT'),
    (2019, '-275.40', '10468.20', '2.75', '11', 'Інше', UNIX_TIMESTAMP('2026-10-04 20:25:00') * 1000, 'Доставка', '0.00', '0.0000', '0.0000', 'dev-demo-privat-202610-004', 'DEBIT');

INSERT INTO merchant (name, status)
VALUES
    ('Лоток', 'active'),
    ('Аптека', 'active'),
    ('Київстар', 'active')
ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO product (category_id, name, measurement_type, status)
SELECT pc.id, seed.name, seed.measurement_type, 'active'
FROM (
    SELECT 'Напої' category_name, 'Вода Моршинська' name, 'volume' measurement_type UNION ALL
    SELECT 'Напої', 'Кава', 'weight' UNION ALL
    SELECT 'Напої', 'Чай', 'weight' UNION ALL
    SELECT 'Бакалія', 'Олія', 'volume' UNION ALL
    SELECT 'Бакалія', 'Цукор', 'weight' UNION ALL
    SELECT 'Бакалія', 'Сіль', 'weight' UNION ALL
    SELECT 'М''ясо', 'Куряче філе', 'weight'
) seed
INNER JOIN product_category pc ON pc.name = seed.category_name
ON DUPLICATE KEY UPDATE
    category_id = VALUES(category_id),
    measurement_type = VALUES(measurement_type),
    status = VALUES(status);

DELETE pi
FROM purchase_item pi
INNER JOIN purchase p ON p.id = pi.purchase_id
INNER JOIN users u ON u.id = p.user_id
WHERE u.username = 'demo.user'
  AND p.client_mutation_id LIKE 'dev-demo-purchase-%';

INSERT INTO purchase (
    user_id,
    client_mutation_id,
    merchant_id,
    purchased_at,
    payment_type,
    total,
    note
)
SELECT u.id, seed.client_mutation_id, m.id, seed.purchased_at, seed.payment_type, seed.total, seed.note
FROM (
    SELECT 'dev-demo-purchase-2026-07-09-atb' client_mutation_id, 'АТБ' merchant_name, '2026-07-09 18:25:00' purchased_at, 'bank' payment_type, 892.30 total, 'DEV July weekly groceries' note UNION ALL
    SELECT 'dev-demo-purchase-2026-07-16-silpo', 'Сільпо', '2026-07-16 19:10:00', 'bank', 1214.20, 'DEV July larger grocery basket' UNION ALL
    SELECT 'dev-demo-purchase-2026-07-29-lotok', 'Лоток', '2026-07-29 08:50:00', 'cash', 274.70, 'DEV July small local shop' UNION ALL
    SELECT 'dev-demo-purchase-2026-08-02-atb', 'АТБ', '2026-08-02 17:45:00', 'bank', 1048.60, 'DEV August groceries' UNION ALL
    SELECT 'dev-demo-purchase-2026-08-14-novus', 'Novus', '2026-08-14 18:05:00', 'bank', 1560.40, 'DEV August supermarket basket' UNION ALL
    SELECT 'dev-demo-purchase-2026-08-21-avrora', 'Аврора', '2026-08-21 15:30:00', 'bank', 462.00, 'DEV household goods' UNION ALL
    SELECT 'dev-demo-purchase-2026-08-30-atb', 'АТБ', '2026-08-30 11:20:00', 'bank', 734.50, 'DEV August top-up groceries' UNION ALL
    SELECT 'dev-demo-purchase-2026-09-03-silpo', 'Сільпо', '2026-09-03 18:40:00', 'bank', 1398.85, 'DEV September start groceries' UNION ALL
    SELECT 'dev-demo-purchase-2026-09-12-atb', 'АТБ', '2026-09-12 12:15:00', 'bank', 1186.20, 'DEV September weekly groceries' UNION ALL
    SELECT 'dev-demo-purchase-2026-09-18-novus', 'Novus', '2026-09-18 19:30:00', 'bank', 1739.70, 'DEV September family groceries' UNION ALL
    SELECT 'dev-demo-purchase-2026-09-22-atb', 'АТБ', '2026-09-22 18:10:00', 'bank', 1387.40, 'DEV planned grocery basket' UNION ALL
    SELECT 'dev-demo-purchase-2026-09-27-avrora', 'Аврора', '2026-09-27 16:40:00', 'bank', 580.00, 'DEV household goods' UNION ALL
    SELECT 'dev-demo-purchase-2026-09-30-lotok', 'Лоток', '2026-09-30 08:20:00', 'cash', 318.00, 'DEV local bread and dairy' UNION ALL
    SELECT 'dev-demo-purchase-2026-10-02-atb', 'АТБ', '2026-10-02 18:20:00', 'bank', 1516.35, 'DEV October planned groceries' UNION ALL
    SELECT 'dev-demo-purchase-2026-10-03-silpo', 'Сільпо', '2026-10-03 09:45:00', 'bank', 864.20, 'DEV weekend groceries' UNION ALL
    SELECT 'dev-demo-purchase-2026-10-04-novus', 'Novus', '2026-10-04 17:35:00', 'bank', 424.70, 'DEV price check basket' UNION ALL
    SELECT 'dev-demo-purchase-2026-10-05-atb', 'АТБ', '2026-10-05 10:25:00', 'cash', 548.90, 'DEV current day essentials' UNION ALL
    SELECT 'dev-demo-purchase-2026-10-05-avrora', 'Аврора', '2026-10-05 16:05:00', 'bank', 350.00, 'DEV October household goods'
) seed
INNER JOIN users u ON u.username = 'demo.user'
INNER JOIN merchant m ON m.name = seed.merchant_name
ON DUPLICATE KEY UPDATE
    merchant_id = VALUES(merchant_id),
    purchased_at = VALUES(purchased_at),
    payment_type = VALUES(payment_type),
    total = VALUES(total),
    note = VALUES(note);

INSERT INTO purchase_item (
    purchase_id,
    product_id,
    quantity,
    unit,
    total
)
SELECT p.id, pr.id, seed.quantity, seed.unit, seed.total
FROM (
    SELECT 'dev-demo-purchase-2026-07-09-atb' client_mutation_id, 'Молоко' product_name, 900.000 quantity, 'ml' unit, 43.80 total UNION ALL
    SELECT 'dev-demo-purchase-2026-07-09-atb', 'Хліб', 400.000, 'g', 38.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-09-atb', 'Яйця курячі', 10.000, 'pcs', 65.40 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-09-atb', 'Куряче філе', 1.400, 'kg', 312.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-09-atb', 'Банани', 1.200, 'kg', 69.60 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-09-atb', 'Вода Моршинська', 6.000, 'l', 87.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-09-atb', 'Гречка', 1.000, 'kg', 76.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-09-atb', 'Ковбаса', 500.000, 'g', 198.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-16-silpo', 'Молоко', 900.000, 'ml', 45.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-16-silpo', 'Сир', 300.000, 'g', 126.80 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-16-silpo', 'Масло', 200.000, 'g', 82.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-16-silpo', 'Помідори', 1.000, 'kg', 89.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-16-silpo', 'Огірки', 1.000, 'kg', 64.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-16-silpo', 'Яблука', 1.500, 'kg', 72.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-16-silpo', 'Кава', 250.000, 'g', 224.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-16-silpo', 'Олія', 850.000, 'ml', 78.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-16-silpo', 'Рис', 1.000, 'kg', 78.40 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-16-silpo', 'Шоколад', 200.000, 'g', 74.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-16-silpo', 'Печиво', 500.000, 'g', 77.10 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-16-silpo', 'Сік', 2.000, 'l', 200.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-29-lotok', 'Хліб', 400.000, 'g', 39.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-29-lotok', 'Кефір', 900.000, 'g', 49.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-29-lotok', 'Банани', 800.000, 'g', 47.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-29-lotok', 'Яйця курячі', 10.000, 'pcs', 68.80 UNION ALL
    SELECT 'dev-demo-purchase-2026-07-29-lotok', 'Чай', 100.000, 'g', 70.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-02-atb', 'Молоко', 900.000, 'ml', 44.60 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-02-atb', 'Хліб', 400.000, 'g', 39.80 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-02-atb', 'Яйця курячі', 10.000, 'pcs', 68.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-02-atb', 'Куряче філе', 1.600, 'kg', 376.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-02-atb', 'Картопля', 3.000, 'kg', 84.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-02-atb', 'Макарони', 1.000, 'kg', 73.80 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-02-atb', 'Вода Моршинська', 6.000, 'l', 91.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-02-atb', 'Ковбаса', 700.000, 'g', 270.70 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-14-novus', 'Молоко', 900.000, 'ml', 46.10 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-14-novus', 'Сир', 350.000, 'g', 152.60 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-14-novus', 'Масло', 200.000, 'g', 86.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-14-novus', 'Яйця курячі', 10.000, 'pcs', 70.40 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-14-novus', 'Банани', 1.500, 'kg', 91.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-14-novus', 'Помідори', 1.200, 'kg', 112.80 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-14-novus', 'Огірки', 1.000, 'kg', 68.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-14-novus', 'Кава', 250.000, 'g', 239.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-14-novus', 'Сік', 3.000, 'l', 216.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-14-novus', 'Шоколад', 300.000, 'g', 128.70 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-14-novus', 'Олія', 850.000, 'ml', 82.60 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-14-novus', 'Куряче філе', 1.100, 'kg', 265.60 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-21-avrora', 'Таблетки для посудомийної машини', 30.000, 'pcs', 249.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-21-avrora', 'Засіб для прання', 2.000, 'l', 143.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-21-avrora', 'Мило', 4.000, 'pcs', 70.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-30-atb', 'Хліб', 400.000, 'g', 40.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-30-atb', 'Молоко', 900.000, 'ml', 45.70 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-30-atb', 'Яйця курячі', 10.000, 'pcs', 69.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-30-atb', 'Банани', 1.000, 'kg', 62.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-30-atb', 'Гречка', 1.000, 'kg', 79.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-30-atb', 'Сир', 300.000, 'g', 134.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-30-atb', 'Вода Моршинська', 6.000, 'l', 94.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-08-30-atb', 'Печиво', 500.000, 'g', 209.10 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-03-silpo', 'Молоко', 900.000, 'ml', 46.80 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-03-silpo', 'Хліб', 400.000, 'g', 40.79 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-03-silpo', 'Яйця курячі', 10.000, 'pcs', 71.60 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-03-silpo', 'Куряче філе', 1.500, 'kg', 369.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-03-silpo', 'Ковбаса', 600.000, 'g', 247.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-03-silpo', 'Сир', 300.000, 'g', 139.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-03-silpo', 'Банани', 1.400, 'kg', 88.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-03-silpo', 'Яблука', 1.500, 'kg', 76.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-03-silpo', 'Помідори', 1.000, 'kg', 92.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-03-silpo', 'Олія', 850.000, 'ml', 84.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-03-silpo', 'Цукор', 1.000, 'kg', 47.30 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-03-silpo', 'Кава', 250.000, 'g', 195.76 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-12-atb', 'Молоко', 900.000, 'ml', 45.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-12-atb', 'Хліб', 400.000, 'g', 40.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-12-atb', 'Яйця курячі', 10.000, 'pcs', 72.40 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-12-atb', 'Куряче філе', 1.300, 'kg', 325.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-12-atb', 'Банани', 1.200, 'kg', 75.60 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-12-atb', 'Вода Моршинська', 6.000, 'l', 96.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-12-atb', 'Рис', 1.000, 'kg', 81.40 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-12-atb', 'Ковбаса', 500.000, 'g', 212.80 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-12-atb', 'Шоколад', 300.000, 'g', 125.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-12-atb', 'Огірки', 1.000, 'kg', 111.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-18-novus', 'Молоко', 900.000, 'ml', 47.80 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-18-novus', 'Сир', 400.000, 'g', 188.40 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-18-novus', 'Яйця курячі', 10.000, 'pcs', 73.30 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-18-novus', 'Куряче філе', 1.700, 'kg', 431.80 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-18-novus', 'Банани', 1.400, 'kg', 89.60 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-18-novus', 'Помідори', 1.000, 'kg', 96.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-18-novus', 'Масло', 200.000, 'g', 89.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-18-novus', 'Макарони', 1.000, 'kg', 78.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-18-novus', 'Олія', 850.000, 'ml', 86.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-18-novus', 'Кава', 250.000, 'g', 254.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-18-novus', 'Печиво', 700.000, 'g', 142.10 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-18-novus', 'Вода Моршинська', 6.000, 'l', 161.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-22-atb', 'Молоко', 900.000, 'ml', 46.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-22-atb', 'Хліб', 400.000, 'g', 40.79 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-22-atb', 'Яйця курячі', 10.000, 'pcs', 73.30 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-22-atb', 'Ковбаса', 300.000, 'g', 129.60 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-22-atb', 'Вода Моршинська', 1.500, 'l', 27.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-22-atb', 'Сир', 300.000, 'g', 141.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-22-atb', 'Банани', 1.000, 'kg', 64.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-22-atb', 'Куряче філе', 1.500, 'kg', 382.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-22-atb', 'Картопля', 3.000, 'kg', 90.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-22-atb', 'Гречка', 1.000, 'kg', 81.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-22-atb', 'Помідори', 1.000, 'kg', 94.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-22-atb', 'Печиво', 500.000, 'g', 215.21 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-27-avrora', 'Засіб для прання', 2.000, 'l', 149.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-27-avrora', 'Зубна паста', 2.000, 'pcs', 126.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-27-avrora', 'Шампунь', 500.000, 'ml', 188.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-27-avrora', 'Мило', 4.000, 'pcs', 117.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-30-lotok', 'Хліб', 400.000, 'g', 41.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-30-lotok', 'Молоко', 900.000, 'ml', 48.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-30-lotok', 'Кефір', 900.000, 'g', 54.60 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-30-lotok', 'Яйця курячі', 10.000, 'pcs', 74.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-09-30-lotok', 'Банани', 1.000, 'kg', 100.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-02-atb', 'Молоко', 900.000, 'ml', 47.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-02-atb', 'Хліб', 400.000, 'g', 41.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-02-atb', 'Яйця курячі', 10.000, 'pcs', 74.40 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-02-atb', 'Ковбаса', 300.000, 'g', 132.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-02-atb', 'Вода Моршинська', 1.500, 'l', 28.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-02-atb', 'Сир', 300.000, 'g', 144.30 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-02-atb', 'Банани', 1.000, 'kg', 65.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-02-atb', 'Куряче філе', 1.600, 'kg', 417.60 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-02-atb', 'Картопля', 3.000, 'kg', 93.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-02-atb', 'Гречка', 1.000, 'kg', 83.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-02-atb', 'Олія', 850.000, 'ml', 88.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-02-atb', 'Печиво', 500.000, 'g', 300.25 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-03-silpo', 'Молоко', 900.000, 'ml', 48.10 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-03-silpo', 'Сир', 300.000, 'g', 147.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-03-silpo', 'Масло', 200.000, 'g', 91.40 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-03-silpo', 'Яйця курячі', 10.000, 'pcs', 75.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-03-silpo', 'Яблука', 1.500, 'kg', 82.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-03-silpo', 'Помідори', 1.000, 'kg', 98.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-03-silpo', 'Огірки', 1.000, 'kg', 74.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-03-silpo', 'Сік', 2.000, 'l', 154.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-03-silpo', 'Шоколад', 300.000, 'g', 93.10 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-04-novus', 'Молоко', 900.000, 'ml', 49.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-04-novus', 'Хліб', 400.000, 'g', 42.20 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-04-novus', 'Банани', 1.000, 'kg', 67.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-04-novus', 'Вода Моршинська', 1.500, 'l', 29.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-04-novus', 'Яйця курячі', 10.000, 'pcs', 76.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-04-novus', 'Кава', 250.000, 'g', 161.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-05-atb', 'Хліб', 400.000, 'g', 41.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-05-atb', 'Молоко', 900.000, 'ml', 47.60 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-05-atb', 'Яйця курячі', 10.000, 'pcs', 74.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-05-atb', 'Банани', 1.000, 'kg', 65.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-05-atb', 'Вода Моршинська', 1.500, 'l', 28.90 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-05-atb', 'Макарони', 1.000, 'kg', 82.80 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-05-atb', 'Цукор', 1.000, 'kg', 48.40 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-05-atb', 'Сіль', 1.000, 'kg', 28.50 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-05-atb', 'Чай', 100.000, 'g', 130.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-05-avrora', 'Зубна паста', 1.000, 'pcs', 68.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-05-avrora', 'Мило', 4.000, 'pcs', 74.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-05-avrora', 'Засіб для чищення', 750.000, 'ml', 89.00 UNION ALL
    SELECT 'dev-demo-purchase-2026-10-05-avrora', 'Гель для душу', 500.000, 'ml', 119.00
) seed
INNER JOIN users u ON u.username = 'demo.user'
INNER JOIN purchase p ON p.user_id = u.id AND p.client_mutation_id = seed.client_mutation_id
INNER JOIN product pr ON pr.name = seed.product_name;

DELETE pp
FROM planning_period pp
INNER JOIN users u ON u.id = pp.user_id
WHERE u.username IN ('demo.user', 'admin')
  AND pp.start_date <= '2026-10-31'
  AND pp.end_date >= '2026-08-01';

INSERT INTO planning_period (user_id, start_date, end_date, budget_amount, created_at, updated_at)
SELECT u.id, seed.start_date, seed.end_date, seed.budget_amount, seed.created_at, seed.created_at
FROM (
    SELECT '2026-08-01' start_date, '2026-08-31' end_date, 32500.00 budget_amount, '2026-08-01 08:00:00' created_at UNION ALL
    SELECT '2026-09-01', '2026-09-30', 34000.00, '2026-09-01 08:00:00' UNION ALL
    SELECT '2026-10-01', '2026-10-31', 36000.00, '2026-10-01 08:00:00'
) seed
INNER JOIN users u ON u.username = 'demo.user';

INSERT INTO planning_item (
    period_id,
    category_id,
    title,
    description,
    planned_amount,
    actual_amount,
    status,
    planned_at,
    completed_at,
    created_at,
    updated_at
)
SELECT pp.id, c.id, seed.title, seed.description, seed.planned_amount, seed.actual_amount, seed.status, seed.planned_at, seed.completed_at, seed.created_at, seed.created_at
FROM (
    SELECT '2026-08-01' period_start, 'Продукти' title, 'groceries' category_code, 'Плановий продуктовий кошик' description, 7800.00 planned_amount, 7542.10 actual_amount, 'completed' status, '2026-08-02' planned_at, '2026-08-30 11:30:00' completed_at, '2026-08-01 08:05:00' created_at UNION ALL
    SELECT '2026-08-01', 'Комунальні', 'mobile_communication', 'Комунальні, інтернет і мобільний звязок', 6100.00, 6150.00, 'completed', '2026-08-15', '2026-08-15 10:30:00', '2026-08-01 08:06:00' UNION ALL
    SELECT '2026-08-01', 'Аптека', 'medicine', 'Аптека та клініка', 2500.00, 2450.30, 'completed', '2026-08-20', '2026-08-21 12:00:00', '2026-08-01 08:07:00' UNION ALL
    SELECT '2026-08-01', 'Відпочинок', 'entertainment', 'Квитки та зустрічі', 4500.00, 4200.00, 'completed', '2026-08-26', '2026-08-26 20:00:00', '2026-08-01 08:08:00' UNION ALL
    SELECT '2026-08-01', 'Побутові покупки', 'other', 'Побутова хімія та дрібниці', 1200.00, 462.00, 'completed', '2026-08-21', '2026-08-21 15:40:00', '2026-08-01 08:09:00' UNION ALL
    SELECT '2026-09-01', 'Продукти', 'groceries', 'Вересневий продуктовий кошик', 8200.00, 8150.35, 'completed', '2026-09-03', '2026-09-30 08:30:00', '2026-09-01 08:05:00' UNION ALL
    SELECT '2026-09-01', 'Комунальні', 'mobile_communication', 'Комунальні платежі та звязок', 5900.00, 5940.00, 'completed', '2026-09-24', '2026-09-24 20:10:00', '2026-09-01 08:06:00' UNION ALL
    SELECT '2026-09-01', 'Аптека', 'medicine', 'Ліки та профілактика', 1600.00, 1245.00, 'completed', '2026-09-23', '2026-09-23 11:50:00', '2026-09-01 08:07:00' UNION ALL
    SELECT '2026-09-01', 'Одяг', 'other', 'Осінній одяг', 3000.00, 2810.00, 'completed', '2026-09-28', '2026-09-30 19:05:00', '2026-09-01 08:08:00' UNION ALL
    SELECT '2026-09-01', 'Кафе та ресторани', 'restaurants', 'Кілька зустрічей протягом місяця', 1800.00, 1552.50, 'completed', '2026-09-29', '2026-09-29 20:15:00', '2026-09-01 08:09:00' UNION ALL
    SELECT '2026-09-01', 'Побутові покупки', 'other', 'Аврора та локальні покупки', 1000.00, 580.00, 'completed', '2026-09-27', '2026-09-27 16:45:00', '2026-09-01 08:10:00' UNION ALL
    SELECT '2026-10-01', 'Продукти', 'groceries', 'Поточний продуктовий план на жовтень', 8500.00, 3354.15, 'completed', '2026-10-02', '2026-10-05 10:30:00', '2026-10-01 08:05:00' UNION ALL
    SELECT '2026-10-01', 'Комунальні', 'mobile_communication', 'Комунальні платежі за вересень', 6200.00, NULL, 'pending', '2026-10-10', NULL, '2026-10-01 08:06:00' UNION ALL
    SELECT '2026-10-01', 'Інтернет', 'mobile_communication', 'Домашній інтернет', 690.00, 690.00, 'completed', '2026-10-03', '2026-10-03 12:05:00', '2026-10-01 08:07:00' UNION ALL
    SELECT '2026-10-01', 'Мобільний звязок', 'mobile_communication', 'Київстар для сімї', 820.00, NULL, 'pending', '2026-10-20', NULL, '2026-10-01 08:08:00' UNION ALL
    SELECT '2026-10-01', 'Аптека', 'medicine', 'Аптека і сезонні ліки', 1600.00, 780.00, 'completed', '2026-10-03', '2026-10-03 10:20:00', '2026-10-01 08:09:00' UNION ALL
    SELECT '2026-10-01', 'Одяг', 'other', 'Осінні речі', 2800.00, NULL, 'pending', '2026-10-12', NULL, '2026-10-01 08:10:00' UNION ALL
    SELECT '2026-10-01', 'Відпочинок', 'entertainment', 'Вихідні та квитки', 2500.00, NULL, 'pending', '2026-10-18', NULL, '2026-10-01 08:11:00' UNION ALL
    SELECT '2026-10-01', 'Побутові покупки', 'other', 'Побутова хімія і дрібниці для дому', 1200.00, 350.00, 'completed', '2026-10-05', '2026-10-05 16:10:00', '2026-10-01 08:12:00'
) seed
INNER JOIN users u ON u.username = 'demo.user'
INNER JOIN planning_period pp ON pp.user_id = u.id AND pp.start_date = seed.period_start
LEFT JOIN categories c ON c.code = seed.category_code;

INSERT INTO planning_shopping_item (
    local_id,
    planning_item_id,
    product_id,
    name,
    amount,
    unit,
    checked,
    position,
    created_at,
    updated_at
)
SELECT seed.local_id, pi.id, pr.id, seed.name, seed.amount, seed.unit, seed.checked, seed.position, seed.created_at, seed.created_at
FROM (
    SELECT 'dev-shop-202609-products-01' local_id, '2026-09-01' period_start, 'Продукти' item_title, 'Хліб' name, 400.000 amount, 'g' unit, 1 checked, 1 position, '2026-09-01 08:20:00' created_at UNION ALL
    SELECT 'dev-shop-202609-products-02', '2026-09-01', 'Продукти', 'Молоко', 900.000, 'ml', 1, 2, '2026-09-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202609-products-03', '2026-09-01', 'Продукти', 'Яйця курячі', 10.000, 'pcs', 1, 3, '2026-09-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202609-products-04', '2026-09-01', 'Продукти', 'Ковбаса', 300.000, 'g', 1, 4, '2026-09-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202609-products-05', '2026-09-01', 'Продукти', 'Вода Моршинська', 1.500, 'l', 1, 5, '2026-09-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202609-products-06', '2026-09-01', 'Продукти', 'Сир', 300.000, 'g', 1, 6, '2026-09-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202609-products-07', '2026-09-01', 'Продукти', 'Банани', 1.000, 'kg', 1, 7, '2026-09-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202610-products-01', '2026-10-01', 'Продукти', 'Хліб', 400.000, 'g', 1, 1, '2026-10-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202610-products-02', '2026-10-01', 'Продукти', 'Молоко', 900.000, 'ml', 1, 2, '2026-10-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202610-products-03', '2026-10-01', 'Продукти', 'Яйця курячі', 10.000, 'pcs', 1, 3, '2026-10-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202610-products-04', '2026-10-01', 'Продукти', 'Ковбаса', 300.000, 'g', 1, 4, '2026-10-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202610-products-05', '2026-10-01', 'Продукти', 'Вода Моршинська', 1.500, 'l', 1, 5, '2026-10-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202610-products-06', '2026-10-01', 'Продукти', 'Сир', 300.000, 'g', 1, 6, '2026-10-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202610-products-07', '2026-10-01', 'Продукти', 'Банани', 1.000, 'kg', 1, 7, '2026-10-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202610-products-08', '2026-10-01', 'Продукти', 'Куряче філе', 1.500, 'kg', 0, 8, '2026-10-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202610-products-09', '2026-10-01', 'Продукти', 'Гречка', 1.000, 'kg', 0, 9, '2026-10-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202610-products-10', '2026-10-01', 'Продукти', 'Олія', 850.000, 'ml', 0, 10, '2026-10-01 08:20:00' UNION ALL
    SELECT 'dev-shop-202610-house-01', '2026-10-01', 'Побутові покупки', 'Зубна паста', 1.000, 'pcs', 1, 1, '2026-10-01 08:25:00' UNION ALL
    SELECT 'dev-shop-202610-house-02', '2026-10-01', 'Побутові покупки', 'Мило', 4.000, 'pcs', 1, 2, '2026-10-01 08:25:00' UNION ALL
    SELECT 'dev-shop-202610-house-03', '2026-10-01', 'Побутові покупки', 'Засіб для чищення', 750.000, 'ml', 1, 3, '2026-10-01 08:25:00' UNION ALL
    SELECT 'dev-shop-202610-house-04', '2026-10-01', 'Побутові покупки', 'Таблетки для посудомийної машини', 30.000, 'pcs', 0, 4, '2026-10-01 08:25:00'
) seed
INNER JOIN users u ON u.username = 'demo.user'
INNER JOIN planning_period pp ON pp.user_id = u.id AND pp.start_date = seed.period_start
INNER JOIN planning_item pi ON pi.period_id = pp.id AND pi.title = seed.item_title
LEFT JOIN product pr ON pr.name = seed.name;
