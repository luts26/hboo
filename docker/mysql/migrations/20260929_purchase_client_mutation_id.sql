SET NAMES utf8mb4;

ALTER TABLE purchase
    ADD COLUMN client_mutation_id VARCHAR(128) NULL AFTER user_id,
    ADD UNIQUE KEY uniq_purchase_user_client_mutation (user_id, client_mutation_id);
