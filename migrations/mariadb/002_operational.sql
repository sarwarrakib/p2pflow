START TRANSACTION;
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);

ALTER TABLE users ADD COLUMN username VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN role_code VARCHAR(80) NOT NULL DEFAULT 'agent';
ALTER TABLE users ADD COLUMN include_profit_in_company_totals TINYINT(1) NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN assignment_accounting_enabled TINYINT(1) NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN last_seen_at DATETIME(6) NULL;
ALTER TABLE users ADD COLUMN permissions_overridden TINYINT(1) NOT NULL DEFAULT FALSE;
CREATE INDEX users_tenant_role_idx ON users(tenant_id, role_code, status);

ALTER TABLE roles ADD COLUMN system_role VARCHAR(80) NOT NULL DEFAULT 'agent';
ALTER TABLE roles ADD COLUMN description TEXT NOT NULL;
ALTER TABLE roles ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT TRUE;
ALTER TABLE roles ADD COLUMN locked TINYINT(1) NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS user_permissions (
 user_id BIGINT UNSIGNED NOT NULL,
 permission_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(user_id, permission_id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_preferences (
 user_id BIGINT UNSIGNED PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 order_accepting TINYINT(1) NOT NULL DEFAULT TRUE,
 ready_to_receive_orders TINYINT(1) NOT NULL DEFAULT TRUE,
 notifications_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 ui_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX user_preferences_tenant_idx ON user_preferences(tenant_id, order_accepting, ready_to_receive_orders);

CREATE TABLE IF NOT EXISTS user_security (
 user_id BIGINT UNSIGNED PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 secret_code_hash TEXT NOT NULL,
 fallback_question TEXT NOT NULL,
 fallback_answer_hash TEXT NOT NULL,
 password_changed_at DATETIME(6) NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trusted_devices (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 device_hash VARCHAR(128) NOT NULL,
 label VARCHAR(180) NOT NULL DEFAULT '',
 user_agent TEXT NOT NULL,
 last_ip VARCHAR(80) NOT NULL DEFAULT '',
 last_used_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 expires_at DATETIME(6) NOT NULL,
 revoked_at DATETIME(6) NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE(user_id, device_hash),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX trusted_devices_user_idx ON trusted_devices(user_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS exchange_payment_methods (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 exchange_account_id BIGINT UNSIGNED NOT NULL,
 external_pay_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
 identifier VARCHAR(120) NOT NULL DEFAULT '',
 name VARCHAR(180) NOT NULL DEFAULT '',
 detail_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 active TINYINT(1) NOT NULL DEFAULT TRUE,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE(exchange_account_id, external_pay_id, identifier),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(exchange_account_id) REFERENCES exchange_accounts(id) ON DELETE CASCADE
);
CREATE INDEX exchange_payment_methods_tenant_idx ON exchange_payment_methods(tenant_id, exchange_account_id, active);

CREATE TABLE IF NOT EXISTS exchange_account_profiles (
 exchange_account_id BIGINT UNSIGNED PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 profile_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 order_summary_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 warning_json JSON NOT NULL DEFAULT (JSON_ARRAY()),
 synced_at DATETIME(6) NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(exchange_account_id) REFERENCES exchange_accounts(id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_account_controls (
 tenant_id BIGINT UNSIGNED NOT NULL,
 exchange_account_id BIGINT UNSIGNED NOT NULL,
 enabled TINYINT(1) NOT NULL DEFAULT TRUE,
 auto_sync TINYINT(1) NOT NULL DEFAULT TRUE,
 auto_assign TINYINT(1) NOT NULL DEFAULT TRUE,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(tenant_id, exchange_account_id),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(exchange_account_id) REFERENCES exchange_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_splits (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 order_id BIGINT UNSIGNED NOT NULL,
 payment_account_id BIGINT UNSIGNED NULL,
 assigned_user_id BIGINT UNSIGNED NULL,
 amount NUMERIC(28,12) NOT NULL DEFAULT 0,
 commission NUMERIC(28,12) NOT NULL DEFAULT 0,
 reference VARCHAR(220) NOT NULL DEFAULT '',
 status VARCHAR(32) NOT NULL DEFAULT 'pending',
 metadata_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
 FOREIGN KEY(payment_account_id) REFERENCES payment_accounts(id) ON DELETE SET NULL,
 FOREIGN KEY(assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX payment_splits_order_idx ON payment_splits(tenant_id, order_id, status, id);

CREATE TABLE IF NOT EXISTS offline_transactions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 payment_account_id BIGINT UNSIGNED NULL,
 amount NUMERIC(28,12) NOT NULL DEFAULT 0,
 currency VARCHAR(20) NOT NULL DEFAULT 'BDT',
 reference VARCHAR(220) NOT NULL DEFAULT '',
 note TEXT NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'pending',
 payload_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 created_by BIGINT UNSIGNED NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(payment_account_id) REFERENCES payment_accounts(id) ON DELETE SET NULL,
 FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX offline_transactions_tenant_idx ON offline_transactions(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS offline_transaction_allocations (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 offline_transaction_id BIGINT UNSIGNED NOT NULL,
 order_id BIGINT UNSIGNED NULL,
 payment_split_id BIGINT UNSIGNED NULL,
 amount NUMERIC(28,12) NOT NULL DEFAULT 0,
 status VARCHAR(32) NOT NULL DEFAULT 'received',
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(offline_transaction_id) REFERENCES offline_transactions(id) ON DELETE CASCADE,
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL,
 FOREIGN KEY(payment_split_id) REFERENCES payment_splits(id) ON DELETE SET NULL
);
CREATE INDEX offline_alloc_tx_idx ON offline_transaction_allocations(offline_transaction_id, id);

CREATE TABLE IF NOT EXISTS business_entries (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 entry_type VARCHAR(40) NOT NULL,
 category VARCHAR(160) NOT NULL DEFAULT '',
 amount NUMERIC(28,12) NOT NULL DEFAULT 0,
 currency VARCHAR(20) NOT NULL DEFAULT 'BDT',
 amount_usd NUMERIC(28,12) NOT NULL DEFAULT 0,
 business_date DATE NOT NULL DEFAULT CURRENT_DATE(),
 agent_id BIGINT UNSIGNED NULL,
 payment_account_id BIGINT UNSIGNED NULL,
 description TEXT NOT NULL,
 protected TINYINT(1) NOT NULL DEFAULT FALSE,
 metadata_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 created_by BIGINT UNSIGNED NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(agent_id) REFERENCES users(id) ON DELETE SET NULL,
 FOREIGN KEY(payment_account_id) REFERENCES payment_accounts(id) ON DELETE SET NULL,
 FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX business_entries_tenant_date_idx ON business_entries(tenant_id, business_date DESC, entry_type, id DESC);

CREATE TABLE IF NOT EXISTS accounting_closings (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 business_date DATE NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'closed',
 summary_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 closed_by BIGINT UNSIGNED NULL,
 closed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE(tenant_id, business_date),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(closed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 endpoint_hash VARCHAR(128) NOT NULL,
 endpoint TEXT NOT NULL,
 p256dh TEXT NOT NULL,
 auth TEXT NOT NULL,
 scope_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 user_agent TEXT NOT NULL,
 disabled_at DATETIME(6) NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE(user_id, endpoint_hash),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS extension_cache (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 cache_key VARCHAR(220) NOT NULL,
 payload_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 expires_at DATETIME(6) NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE(tenant_id, cache_key),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS billing_webhook_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 provider VARCHAR(80) NOT NULL,
 provider_event_id VARCHAR(220) NOT NULL,
 tenant_id BIGINT UNSIGNED NULL,
 event_type VARCHAR(120) NOT NULL DEFAULT '',
 payload_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 status VARCHAR(32) NOT NULL DEFAULT 'received',
 processed_at DATETIME(6) NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE(provider, provider_event_id),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS subscription_usage (
 tenant_id BIGINT UNSIGNED NOT NULL,
 period_key VARCHAR(20) NOT NULL,
 api_requests BIGINT NOT NULL DEFAULT 0,
 orders_synced BIGINT NOT NULL DEFAULT 0,
 chat_messages BIGINT NOT NULL DEFAULT 0,
 storage_bytes BIGINT NOT NULL DEFAULT 0,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(tenant_id, period_key),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS update_state (
 id BIGINT UNSIGNED PRIMARY KEY DEFAULT 1,
 current_version VARCHAR(40) NOT NULL DEFAULT '2.0.0',
 channel VARCHAR(40) NOT NULL DEFAULT 'stable',
 staged_version VARCHAR(40) NOT NULL DEFAULT '',
 status VARCHAR(40) NOT NULL DEFAULT 'idle',
 detail_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);
INSERT IGNORE INTO update_state(id,current_version) VALUES(1,'2.0.0');

INSERT IGNORE INTO permissions(code,description) VALUES
 ('dashboard.view','View dashboard'),('orders.view','View orders'),('orders.manage','Manage orders'),('orders.split','Manage payment splits'),('orders.final_action','Run paid/release/cancel actions'),('orders.assign','Assign orders'),
 ('ads.view','View ads'),('ads.manage','Manage ads'),('binance.chat','Use Binance chat'),('p2p.profile.view','View P2P profiles'),('credentials.manage','Manage Binance API accounts'),
 ('accounts.view','View payment accounts'),('accounts.use','Use payment accounts'),('accounts.manage','Manage payment accounts'),('routing.manage','Manage routing rules'),
 ('users.manage','Manage workspace users'),('roles.manage','Manage roles and permissions'),('notifications.manage','Manage notification preferences'),('reports.view','View reports'),
 ('accounting.view','View accounting'),('accounting.manage','Manage accounting'),('accounting.close','Close business day'),('activity.view','View activity'),('audit.view','View audit log'),
 ('approvals.manage','Manage approvals'),('extension.manage','Manage extension bridge'),('settings.manage','Manage settings'),('system.update','Manage system updates'),('market.view','View P2P market')
;
COMMIT;
