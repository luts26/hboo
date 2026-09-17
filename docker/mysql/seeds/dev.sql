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
    (
        1,
        1250000,
        'test-mono-card-alpha',
        'UAH',
        500000,
        980,
        '1789106400',
        'TEST-MONO-IBAN-ALPHA',
        'test-mono-send-alpha',
        'demo-black'
    ),
    (
        2,
        342500,
        'test-mono-card-beta',
        'UAH',
        0,
        980,
        '1789106400',
        'TEST-MONO-IBAN-BETA',
        'test-mono-send-beta',
        'demo-white'
    );

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
    (1001, '15000.00', '0.00', '0.00', '980', 'Synthetic payroll deposit', 6012, 1500000, 6012, 'test-mono-receipt-1001', 'test-mono-tx-1001', 1789107300),
    (1002, '-820.50', '8.20', '0.00', '980', 'Synthetic grocery purchase', 5411, -82050, 5411, 'test-mono-receipt-1002', 'test-mono-tx-1002', 1789054800),
    (1003, '-430.00', '4.30', '0.00', '980', 'Synthetic cafe meal', 5812, -43000, 5812, 'test-mono-receipt-1003', 'test-mono-tx-1003', 1789035900),
    (1004, '-275.75', '2.75', '0.00', '980', 'Synthetic pharmacy order', 5912, -27575, 5912, 'test-mono-receipt-1004', 'test-mono-tx-1004', 1788970200),
    (1005, '-1160.00', '0.00', '0.00', '980', 'Synthetic utility payment', 4900, -116000, 4900, 'test-mono-receipt-1005', 'test-mono-tx-1005', 1788931800),
    (1006, '-1200.00', '0.00', '10.00', '980', 'Synthetic ATM withdrawal', 6011, -120000, 6011, 'test-mono-receipt-1006', 'test-mono-tx-1006', 1788887100),
    (1007, '-900.00', '0.00', '0.00', '980', 'Synthetic savings transfer', 6012, -90000, 6012, 'test-mono-receipt-1007', 'test-mono-tx-1007', 1788852000),
    (1008, '-199.00', '1.99', '0.00', '980', 'Synthetic mobile top up', 4814, -19900, 4814, 'test-mono-receipt-1008', 'test-mono-tx-1008', 1788788700),
    (1009, '-360.40', '3.60', '0.00', '980', 'Synthetic delivery order', 5814, -36040, 5814, 'test-mono-receipt-1009', 'test-mono-tx-1009', 1788685500),
    (1010, '-750.00', '0.00', '0.00', '980', 'Synthetic outgoing transfer', 4829, -75000, 4829, 'test-mono-receipt-1010', 'test-mono-tx-1010', 1788584400),
    (1011, '2200.00', '0.00', '0.00', '980', 'Synthetic incoming transfer', 4829, 220000, 4829, 'test-mono-receipt-1011', 'test-mono-tx-1011', 1788539400);

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
