SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS product_category (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    status VARCHAR(25) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_product_category_name (name),
    KEY idx_product_category_status_sort (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS product (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    category_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    measurement_type VARCHAR(25) NOT NULL,
    status VARCHAR(25) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_product_name (name),
    KEY idx_product_category_id (category_id),
    KEY idx_product_status (status),
    CONSTRAINT fk_product_category FOREIGN KEY (category_id) REFERENCES product_category (id),
    CONSTRAINT chk_product_measurement_type CHECK (measurement_type IN ('weight', 'volume', 'count'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS merchant (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(25) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_merchant_name (name),
    KEY idx_merchant_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS purchase (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    merchant_id BIGINT UNSIGNED NULL,
    purchased_at DATETIME NOT NULL,
    payment_type VARCHAR(25) NOT NULL,
    transaction_provider VARCHAR(25) NULL,
    transaction_id VARCHAR(255) NULL,
    total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    note TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_purchase_user_purchased_at (user_id, purchased_at),
    KEY idx_purchase_merchant_id (merchant_id),
    KEY idx_purchase_transaction (transaction_provider, transaction_id),
    CONSTRAINT fk_purchase_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_purchase_merchant FOREIGN KEY (merchant_id) REFERENCES merchant (id),
    CONSTRAINT chk_purchase_payment_type CHECK (payment_type IN ('cash', 'bank', 'other'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS purchase_item (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    purchase_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    quantity DECIMAL(12,3) NOT NULL,
    unit VARCHAR(10) NOT NULL,
    total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_purchase_item_purchase_id (purchase_id),
    KEY idx_purchase_item_product_id (product_id),
    CONSTRAINT fk_purchase_item_purchase FOREIGN KEY (purchase_id) REFERENCES purchase (id) ON DELETE CASCADE,
    CONSTRAINT fk_purchase_item_product FOREIGN KEY (product_id) REFERENCES product (id),
    CONSTRAINT chk_purchase_item_quantity CHECK (quantity > 0),
    CONSTRAINT chk_purchase_item_total CHECK (total >= 0),
    CONSTRAINT chk_purchase_item_unit CHECK (unit IN ('g', 'kg', 'ml', 'l', 'pcs'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
    ('Бакалія', 170, 'active'),
    ('Товари для дому', 180, 'active'),
    ('Інше', 190, 'active')
ON DUPLICATE KEY UPDATE
    sort_order = VALUES(sort_order),
    status = VALUES(status);

INSERT INTO merchant (name, status)
VALUES
    ('АТБ', 'active'),
    ('Сільпо', 'active'),
    ('Лоток', 'active'),
    ('Бульварчик', 'active'),
    ('Novus', 'active'),
    ('Аврора', 'active'),
    ('Рошен', 'active'),
    ('Брусилівські ковбаси', 'active'),
    ('Базар', 'active')
ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO product (category_id, name, measurement_type, status)
SELECT pc.id, seed.name, seed.measurement_type, 'active'
FROM (
    SELECT 'Овочі' category_name, 'Помідори' name, 'weight' measurement_type UNION ALL
    SELECT 'Овочі', 'Огірки', 'weight' UNION ALL
    SELECT 'Овочі', 'Картопля', 'weight' UNION ALL
    SELECT 'Овочі', 'Морква', 'weight' UNION ALL
    SELECT 'Овочі', 'Кабачки', 'weight' UNION ALL
    SELECT 'Овочі', 'Буряк', 'weight' UNION ALL
    SELECT 'Фрукти', 'Яблука', 'weight' UNION ALL
    SELECT 'Фрукти', 'Груші', 'weight' UNION ALL
    SELECT 'Фрукти', 'Апельсини', 'weight' UNION ALL
    SELECT 'Фрукти', 'Мандарини', 'weight' UNION ALL
    SELECT 'Фрукти', 'Лимони', 'weight' UNION ALL
    SELECT 'Фрукти', 'Банани', 'weight' UNION ALL
    SELECT 'Фрукти', 'Ківі', 'weight' UNION ALL
    SELECT 'Хліб та випічка', 'Хліб', 'weight' UNION ALL
    SELECT 'Хліб та випічка', 'Батон', 'count' UNION ALL
    SELECT 'Хліб та випічка', 'Лаваш', 'count' UNION ALL
    SELECT 'Хліб та випічка', 'Булочки', 'count' UNION ALL
    SELECT 'Молочні', 'Молоко', 'volume' UNION ALL
    SELECT 'Молочні', 'Кефір', 'weight' UNION ALL
    SELECT 'Молочні', 'Сир', 'weight' UNION ALL
    SELECT 'Молочні', 'Сметана', 'weight' UNION ALL
    SELECT 'Молочні', 'Масло', 'weight' UNION ALL
    SELECT 'Молочні', 'Ряжанка', 'volume' UNION ALL
    SELECT 'Яйця', 'Яйця курячі', 'count' UNION ALL
    SELECT 'Яйця', 'Яйця перепелині', 'count' UNION ALL
    SELECT 'М''ясо', 'Курятина', 'weight' UNION ALL
    SELECT 'М''ясо', 'Індичка', 'weight' UNION ALL
    SELECT 'М''ясо', 'Свинина', 'weight' UNION ALL
    SELECT 'М''ясо', 'Яловичина', 'weight' UNION ALL
    SELECT 'М''ясо', 'Ковбаса', 'weight' UNION ALL
    SELECT 'М''ясо', 'Сосиски', 'weight' UNION ALL
    SELECT 'Риба та морепродукти', 'Риба', 'weight' UNION ALL
    SELECT 'Риба та морепродукти', 'Лосось', 'weight' UNION ALL
    SELECT 'Риба та морепродукти', 'Оселедець', 'weight' UNION ALL
    SELECT 'Риба та морепродукти', 'Креветки', 'weight' UNION ALL
    SELECT 'Крупи та макарони', 'Рис', 'weight' UNION ALL
    SELECT 'Крупи та макарони', 'Гречка', 'weight' UNION ALL
    SELECT 'Крупи та макарони', 'Макарони', 'weight' UNION ALL
    SELECT 'Крупи та макарони', 'Кускус', 'weight' UNION ALL
    SELECT 'Крупи та макарони', 'Булгур', 'weight' UNION ALL
    SELECT 'Крупи та макарони', 'Вівсяні пластівці', 'weight' UNION ALL
    SELECT 'Крупи та макарони', 'Сочевиця', 'weight' UNION ALL
    SELECT 'Десерти', 'Шоколад', 'weight' UNION ALL
    SELECT 'Десерти', 'Печиво', 'weight' UNION ALL
    SELECT 'Десерти', 'Цукерки', 'weight' UNION ALL
    SELECT 'Десерти', 'Морозиво', 'weight' UNION ALL
    SELECT 'Напої', 'Сік', 'volume' UNION ALL
    SELECT 'Напої', 'Мінеральна вода', 'volume' UNION ALL
    SELECT 'Напої', 'Солодка газована вода', 'volume' UNION ALL
    SELECT 'Побутова хімія', 'Таблетки для посудомийної машини', 'count' UNION ALL
    SELECT 'Побутова хімія', 'Засіб для прання', 'volume' UNION ALL
    SELECT 'Побутова хімія', 'Кондиціонер для прання', 'volume' UNION ALL
    SELECT 'Побутова хімія', 'Засіб для чищення', 'volume' UNION ALL
    SELECT 'Особиста гігієна', 'Зубна паста', 'count' UNION ALL
    SELECT 'Особиста гігієна', 'Зубна щітка', 'count' UNION ALL
    SELECT 'Особиста гігієна', 'Шампунь', 'volume' UNION ALL
    SELECT 'Особиста гігієна', 'Мило', 'count' UNION ALL
    SELECT 'Особиста гігієна', 'Гель для душу', 'volume'
) seed
INNER JOIN product_category pc ON pc.name = seed.category_name
ON DUPLICATE KEY UPDATE
    category_id = VALUES(category_id),
    measurement_type = VALUES(measurement_type),
    status = VALUES(status);
