SET NAMES utf8mb4;

INSERT INTO product_category (name, sort_order, status)
VALUES
    ('Напої', 10, 'active'),
    ('Фрукти', 20, 'active'),
    ('Овочі', 30, 'active'),
    ('Зелень', 40, 'active'),
    ('Хліб та випічка', 50, 'active'),
    ('Крупи та макарони', 60, 'active'),
    ('Молочні', 70, 'active'),
    ('Яйця', 80, 'active'),
    ('М''ясо', 90, 'active'),
    ('Риба та морепродукти', 100, 'active'),
    ('Десерти', 110, 'active'),
    ('Ягоди', 120, 'active'),
    ('Снеки', 130, 'active'),
    ('Паперові товари', 140, 'active'),
    ('Особиста гігієна', 150, 'active'),
    ('Побутова хімія', 160, 'active'),
    ('Інше', 170, 'active')
ON DUPLICATE KEY UPDATE
    sort_order = VALUES(sort_order),
    status = VALUES(status),
    updated_at = NOW();

INSERT INTO product (category_id, name, measurement_type, status)
SELECT pc.id, seed.name, seed.measurement_type, 'active'
FROM (
    SELECT 'Хліб та випічка' category_name, 'Хліб' name, 'weight' measurement_type UNION ALL
    SELECT 'Хліб та випічка', 'Батон', 'count' UNION ALL
    SELECT 'Хліб та випічка', 'Лаваш', 'count' UNION ALL
    SELECT 'Хліб та випічка', 'Булочки', 'count' UNION ALL
    SELECT 'Риба та морепродукти', 'Риба', 'weight' UNION ALL
    SELECT 'Риба та морепродукти', 'Лосось', 'weight' UNION ALL
    SELECT 'Риба та морепродукти', 'Оселедець', 'weight' UNION ALL
    SELECT 'Риба та морепродукти', 'Креветки', 'weight' UNION ALL
    SELECT 'Яйця', 'Яйця курячі', 'count' UNION ALL
    SELECT 'Яйця', 'Яйця перепелині', 'count'
) seed
INNER JOIN product_category pc ON pc.name = seed.category_name
ON DUPLICATE KEY UPDATE
    category_id = VALUES(category_id),
    measurement_type = VALUES(measurement_type),
    status = VALUES(status),
    updated_at = NOW();

UPDATE product p
INNER JOIN product_category pc ON pc.name = 'Яйця'
SET p.category_id = pc.id,
    p.updated_at = NOW()
WHERE p.name = 'Яйця';
