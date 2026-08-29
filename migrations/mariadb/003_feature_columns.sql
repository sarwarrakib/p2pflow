ALTER TABLE orders MODIFY exchange_account_id BIGINT UNSIGNED NULL;
ALTER TABLE orders ADD COLUMN order_source VARCHAR(32) NOT NULL DEFAULT 'binance';
ALTER TABLE orders ADD COLUMN external_status VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN payment_method_id BIGINT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN payment_method_identifier VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN binance_pay_id BIGINT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN payment_deadline_at TIMESTAMP NULL;
ALTER TABLE orders ADD COLUMN source_note TEXT NOT NULL;
ALTER TABLE orders ADD COLUMN completed_at TIMESTAMP NULL;
ALTER TABLE orders ADD COLUMN final_action_by BIGINT UNSIGNED NULL;
CREATE INDEX orders_tenant_account_status_time_idx ON orders(tenant_id, exchange_account_id, status, updated_at);
CREATE INDEX chats_external_uuid_idx ON chats(exchange_account_id, external_uuid);
CREATE INDEX chats_external_message_idx ON chats(exchange_account_id, external_message_id);
CREATE TABLE IF NOT EXISTS order_assignments (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT UNSIGNED NOT NULL, order_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
 role VARCHAR(32) NOT NULL DEFAULT 'lead', assigned_amount DECIMAL(28,12) NOT NULL DEFAULT 0, actual_amount DECIMAL(28,12) NOT NULL DEFAULT 0,
 direction VARCHAR(16) NOT NULL DEFAULT '', status VARCHAR(32) NOT NULL DEFAULT 'assigned', assigned_by BIGINT UNSIGNED NULL,
 leave_reason VARCHAR(180) NOT NULL DEFAULT '', leave_note TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_order_assignment_state(order_id,user_id,status),
 INDEX idx_order_assignments_order(tenant_id,order_id,status,id), FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS coagent_requests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT UNSIGNED NOT NULL, order_id BIGINT UNSIGNED NOT NULL, requested_by BIGINT UNSIGNED NULL,
 required_amount DECIMAL(28,12) NOT NULL DEFAULT 0, reason TEXT NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'pending', assigned_user_id BIGINT UNSIGNED NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_coagent_requests_order(tenant_id,order_id,status,id), FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE, FOREIGN KEY(requested_by) REFERENCES users(id) ON DELETE SET NULL,
 FOREIGN KEY(assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS final_action_challenges (
 id VARCHAR(120) PRIMARY KEY, tenant_id BIGINT UNSIGNED NOT NULL, order_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL, action VARCHAR(60) NOT NULL,
 method VARCHAR(40) NOT NULL, challenge_hash TEXT NOT NULL, verified_at TIMESTAMP NULL, expires_at TIMESTAMP NOT NULL, used_at TIMESTAMP NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_final_action_challenge_exp(user_id,order_id,expires_at),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS expense_categories (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT UNSIGNED NOT NULL, name VARCHAR(160) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_expense_category(tenant_id,name), FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS billing_customers (
 tenant_id BIGINT UNSIGNED PRIMARY KEY, provider VARCHAR(80) NOT NULL DEFAULT 'manual', provider_customer_id VARCHAR(220) NOT NULL DEFAULT '',
 metadata_json JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS tenant_domains (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT UNSIGNED NOT NULL, hostname VARCHAR(253) NOT NULL UNIQUE, status VARCHAR(32) NOT NULL DEFAULT 'pending',
 verified_at TIMESTAMP NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('orders.create','Create local/offline orders'),('billing.view','View workspace billing'),('billing.manage','Manage workspace billing'),('superadmin.view','View SaaS super-admin'),('superadmin.manage','Manage SaaS tenants and plans');
