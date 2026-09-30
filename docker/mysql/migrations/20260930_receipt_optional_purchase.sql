SET NAMES utf8mb4;

ALTER TABLE receipt
    ADD COLUMN user_id BIGINT NULL AFTER id;

UPDATE receipt r
INNER JOIN purchase p ON p.id = r.purchase_id
SET r.user_id = p.user_id
WHERE r.user_id IS NULL;

ALTER TABLE receipt
    MODIFY purchase_id BIGINT UNSIGNED NULL,
    MODIFY user_id BIGINT NOT NULL,
    ADD KEY idx_receipt_user_id (user_id),
    ADD UNIQUE KEY uniq_receipt_user_client_mutation (user_id, client_mutation_id),
    ADD CONSTRAINT fk_receipt_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
