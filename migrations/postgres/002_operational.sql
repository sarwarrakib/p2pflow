BEGIN;
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_code VARCHAR(80) NOT NULL DEFAULT 'agent';
ALTER TABLE users ADD COLUMN IF NOT EXISTS include_profit_in_company_totals BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS assignment_accounting_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions_overridden BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS users_tenant_role_idx ON users(tenant_id, role_code, status);

ALTER TABLE roles ADD COLUMN IF NOT EXISTS system_role VARCHAR(80) NOT NULL DEFAULT 'agent';
ALTER TABLE roles ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE roles ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS user_permissions (
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_preferences (
 user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 order_accepting BOOLEAN NOT NULL DEFAULT TRUE,
 ready_to_receive_orders BOOLEAN NOT NULL DEFAULT TRUE,
 notifications_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 ui_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_preferences_tenant_idx ON user_preferences(tenant_id, order_accepting, ready_to_receive_orders);

CREATE TABLE IF NOT EXISTS user_security (
 user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 secret_code_hash TEXT NOT NULL DEFAULT '',
 fallback_question TEXT NOT NULL DEFAULT '',
 fallback_answer_hash TEXT NOT NULL DEFAULT '',
 password_changed_at TIMESTAMPTZ NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trusted_devices (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 device_hash VARCHAR(128) NOT NULL,
 label VARCHAR(180) NOT NULL DEFAULT '',
 user_agent TEXT NOT NULL DEFAULT '',
 last_ip VARCHAR(80) NOT NULL DEFAULT '',
 last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,
 revoked_at TIMESTAMPTZ NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(user_id, device_hash)
);
CREATE INDEX IF NOT EXISTS trusted_devices_user_idx ON trusted_devices(user_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS exchange_payment_methods (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 exchange_account_id BIGINT NOT NULL REFERENCES exchange_accounts(id) ON DELETE CASCADE,
 external_pay_id BIGINT NOT NULL DEFAULT 0,
 identifier VARCHAR(120) NOT NULL DEFAULT '',
 name VARCHAR(180) NOT NULL DEFAULT '',
 detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(exchange_account_id, external_pay_id, identifier)
);
CREATE INDEX IF NOT EXISTS exchange_payment_methods_tenant_idx ON exchange_payment_methods(tenant_id, exchange_account_id, active);

CREATE TABLE IF NOT EXISTS exchange_account_profiles (
 exchange_account_id BIGINT PRIMARY KEY REFERENCES exchange_accounts(id) ON DELETE CASCADE,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 order_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 warning_json JSONB NOT NULL DEFAULT '[]'::jsonb,
 synced_at TIMESTAMPTZ NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_account_controls (
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 exchange_account_id BIGINT NOT NULL REFERENCES exchange_accounts(id) ON DELETE CASCADE,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 auto_sync BOOLEAN NOT NULL DEFAULT TRUE,
 auto_assign BOOLEAN NOT NULL DEFAULT TRUE,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(tenant_id, exchange_account_id)
);

CREATE TABLE IF NOT EXISTS payment_splits (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 payment_account_id BIGINT NULL REFERENCES payment_accounts(id) ON DELETE SET NULL,
 assigned_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
 amount NUMERIC(28,12) NOT NULL DEFAULT 0,
 commission NUMERIC(28,12) NOT NULL DEFAULT 0,
 reference VARCHAR(220) NOT NULL DEFAULT '',
 status VARCHAR(32) NOT NULL DEFAULT 'pending',
 metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_splits_order_idx ON payment_splits(tenant_id, order_id, status, id);

CREATE TABLE IF NOT EXISTS offline_transactions (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 payment_account_id BIGINT NULL REFERENCES payment_accounts(id) ON DELETE SET NULL,
 amount NUMERIC(28,12) NOT NULL DEFAULT 0,
 currency VARCHAR(20) NOT NULL DEFAULT 'BDT',
 reference VARCHAR(220) NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 status VARCHAR(32) NOT NULL DEFAULT 'pending',
 payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS offline_transactions_tenant_idx ON offline_transactions(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS offline_transaction_allocations (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 offline_transaction_id BIGINT NOT NULL REFERENCES offline_transactions(id) ON DELETE CASCADE,
 order_id BIGINT NULL REFERENCES orders(id) ON DELETE SET NULL,
 payment_split_id BIGINT NULL REFERENCES payment_splits(id) ON DELETE SET NULL,
 amount NUMERIC(28,12) NOT NULL DEFAULT 0,
 status VARCHAR(32) NOT NULL DEFAULT 'received',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS offline_alloc_tx_idx ON offline_transaction_allocations(offline_transaction_id, id);

CREATE TABLE IF NOT EXISTS business_entries (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 entry_type VARCHAR(40) NOT NULL,
 category VARCHAR(160) NOT NULL DEFAULT '',
 amount NUMERIC(28,12) NOT NULL DEFAULT 0,
 currency VARCHAR(20) NOT NULL DEFAULT 'BDT',
 amount_usd NUMERIC(28,12) NOT NULL DEFAULT 0,
 business_date DATE NOT NULL DEFAULT CURRENT_DATE,
 agent_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
 payment_account_id BIGINT NULL REFERENCES payment_accounts(id) ON DELETE SET NULL,
 description TEXT NOT NULL DEFAULT '',
 protected BOOLEAN NOT NULL DEFAULT FALSE,
 metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS business_entries_tenant_date_idx ON business_entries(tenant_id, business_date DESC, entry_type, id DESC);

CREATE TABLE IF NOT EXISTS accounting_closings (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 business_date DATE NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'closed',
 summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 closed_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
 closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(tenant_id, business_date)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 endpoint_hash VARCHAR(128) NOT NULL,
 endpoint TEXT NOT NULL,
 p256dh TEXT NOT NULL DEFAULT '',
 auth TEXT NOT NULL DEFAULT '',
 scope_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 user_agent TEXT NOT NULL DEFAULT '',
 disabled_at TIMESTAMPTZ NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(user_id, endpoint_hash)
);

CREATE TABLE IF NOT EXISTS extension_cache (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 cache_key VARCHAR(220) NOT NULL,
 payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 expires_at TIMESTAMPTZ NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(tenant_id, cache_key)
);

CREATE TABLE IF NOT EXISTS billing_webhook_events (
 id BIGSERIAL PRIMARY KEY,
 provider VARCHAR(80) NOT NULL,
 provider_event_id VARCHAR(220) NOT NULL,
 tenant_id BIGINT NULL REFERENCES tenants(id) ON DELETE SET NULL,
 event_type VARCHAR(120) NOT NULL DEFAULT '',
 payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 status VARCHAR(32) NOT NULL DEFAULT 'received',
 processed_at TIMESTAMPTZ NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS subscription_usage (
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 period_key VARCHAR(20) NOT NULL,
 api_requests BIGINT NOT NULL DEFAULT 0,
 orders_synced BIGINT NOT NULL DEFAULT 0,
 chat_messages BIGINT NOT NULL DEFAULT 0,
 storage_bytes BIGINT NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(tenant_id, period_key)
);

CREATE TABLE IF NOT EXISTS update_state (
 id BIGINT PRIMARY KEY DEFAULT 1,
 current_version VARCHAR(40) NOT NULL DEFAULT '2.0.0',
 channel VARCHAR(40) NOT NULL DEFAULT 'stable',
 staged_version VARCHAR(40) NOT NULL DEFAULT '',
 status VARCHAR(40) NOT NULL DEFAULT 'idle',
 detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO update_state(id,current_version) VALUES(1,'2.0.0') ON CONFLICT(id) DO NOTHING;

INSERT INTO permissions(code,description) VALUES
 ('dashboard.view','View dashboard'),('orders.view','View orders'),('orders.manage','Manage orders'),('orders.split','Manage payment splits'),('orders.final_action','Run paid/release/cancel actions'),('orders.assign','Assign orders'),
 ('ads.view','View ads'),('ads.manage','Manage ads'),('binance.chat','Use Binance chat'),('p2p.profile.view','View P2P profiles'),('credentials.manage','Manage Binance API accounts'),
 ('accounts.view','View payment accounts'),('accounts.use','Use payment accounts'),('accounts.manage','Manage payment accounts'),('routing.manage','Manage routing rules'),
 ('users.manage','Manage workspace users'),('roles.manage','Manage roles and permissions'),('notifications.manage','Manage notification preferences'),('reports.view','View reports'),
 ('accounting.view','View accounting'),('accounting.manage','Manage accounting'),('accounting.close','Close business day'),('activity.view','View activity'),('audit.view','View audit log'),
 ('approvals.manage','Manage approvals'),('extension.manage','Manage extension bridge'),('settings.manage','Manage settings'),('system.update','Manage system updates'),('market.view','View P2P market')
ON CONFLICT(code) DO NOTHING;
COMMIT;
