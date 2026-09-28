-- Development-only mocked data
-- All data in this file is synthetic and intended only for local development/testing.
-- Login: demo.admin || demo.user
-- Password: change_me_dev_only
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
        'demo.admin',
        'Demo',
        'Admin',
        'demo.admin@example.com',
        '$2b$04$bmEbOVGS.OHr9PbslO3dTOteDT79Je0rT92GF9g3ueTVoxwlXYGnO',
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
