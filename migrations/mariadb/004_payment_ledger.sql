CREATE TABLE IF NOT EXISTS payment_account_ledger (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT UNSIGNED NOT NULL, payment_account_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NULL, order_id BIGINT UNSIGNED NULL,
 entry_type VARCHAR(80) NOT NULL, direction VARCHAR(20) NOT NULL DEFAULT '', amount DECIMAL(28,12) NOT NULL DEFAULT 0,
 balance_before DECIMAL(28,12) NOT NULL DEFAULT 0, balance_after DECIMAL(28,12) NOT NULL DEFAULT 0,
 reference VARCHAR(220) NOT NULL DEFAULT '', note TEXT NOT NULL, metadata_json JSON NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_payment_ledger_account(tenant_id,payment_account_id,id), INDEX idx_payment_ledger_order(tenant_id,order_id,id),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE, FOREIGN KEY(payment_account_id) REFERENCES payment_accounts(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB;
