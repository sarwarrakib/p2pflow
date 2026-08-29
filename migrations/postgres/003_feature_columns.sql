BEGIN;
ALTER TABLE orders ALTER COLUMN exchange_account_id DROP NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source VARCHAR(32) NOT NULL DEFAULT 'binance';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_status VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method_id BIGINT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method_identifier VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS binance_pay_id BIGINT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_deadline_at TIMESTAMPTZ NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_note TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_action_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_tenant_account_status_time_idx ON orders(tenant_id, exchange_account_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS chats_external_uuid_uq ON chats(exchange_account_id, external_uuid) WHERE external_uuid<>'';
CREATE UNIQUE INDEX IF NOT EXISTS chats_external_message_uq ON chats(exchange_account_id, external_message_id) WHERE external_message_id<>'';

CREATE TABLE IF NOT EXISTS order_assignments (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role VARCHAR(32) NOT NULL DEFAULT 'lead',
 assigned_amount NUMERIC(28,12) NOT NULL DEFAULT 0,
 actual_amount NUMERIC(28,12) NOT NULL DEFAULT 0,
 direction VARCHAR(16) NOT NULL DEFAULT '',
 status VARCHAR(32) NOT NULL DEFAULT 'assigned',
 assigned_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
 leave_reason VARCHAR(180) NOT NULL DEFAULT '',
 leave_note TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(order_id,user_id,status)
);
CREATE INDEX IF NOT EXISTS order_assignments_order_idx ON order_assignments(tenant_id,order_id,status,id);

CREATE TABLE IF NOT EXISTS coagent_requests (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 requested_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
 required_amount NUMERIC(28,12) NOT NULL DEFAULT 0,
 reason TEXT NOT NULL DEFAULT '',
 status VARCHAR(32) NOT NULL DEFAULT 'pending',
 assigned_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS coagent_requests_order_idx ON coagent_requests(tenant_id,order_id,status,id);

CREATE TABLE IF NOT EXISTS final_action_challenges (
 id VARCHAR(120) PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 action VARCHAR(60) NOT NULL,
 method VARCHAR(40) NOT NULL,
 challenge_hash TEXT NOT NULL DEFAULT '',
 verified_at TIMESTAMPTZ NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 used_at TIMESTAMPTZ NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS final_action_challenge_exp_idx ON final_action_challenges(user_id,order_id,expires_at);

CREATE TABLE IF NOT EXISTS expense_categories (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 name VARCHAR(160) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(tenant_id,name)
);

CREATE TABLE IF NOT EXISTS billing_customers (
 tenant_id BIGINT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 provider VARCHAR(80) NOT NULL DEFAULT 'manual',
 provider_customer_id VARCHAR(220) NOT NULL DEFAULT '',
 metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_domains (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 hostname VARCHAR(253) NOT NULL UNIQUE,
 status VARCHAR(32) NOT NULL DEFAULT 'pending',
 verified_at TIMESTAMPTZ NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO permissions(code,description) VALUES
 ('orders.create','Create local/offline orders'),('billing.view','View workspace billing'),('billing.manage','Manage workspace billing'),('superadmin.view','View SaaS super-admin'),('superadmin.manage','Manage SaaS tenants and plans')
ON CONFLICT(code) DO NOTHING;
COMMIT;
