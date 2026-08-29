BEGIN;
ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS account_type VARCHAR(32) NOT NULL DEFAULT 'personal';
ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(28,12) NOT NULL DEFAULT 0;
ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS receive_daily_limit NUMERIC(28,12) NOT NULL DEFAULT 0;
ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS send_daily_limit NUMERIC(28,12) NOT NULL DEFAULT 0;
ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS receive_monthly_limit NUMERIC(28,12) NOT NULL DEFAULT 0;
ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS send_monthly_limit NUMERIC(28,12) NOT NULL DEFAULT 0;
ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS charge_rules_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS commission_rules_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS payment_account_runtime (
 payment_account_id BIGINT PRIMARY KEY REFERENCES payment_accounts(id) ON DELETE CASCADE,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 balance NUMERIC(28,12) NOT NULL DEFAULT 0,
 version BIGINT NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_account_runtime_tenant_idx ON payment_account_runtime(tenant_id,payment_account_id);

CREATE TABLE IF NOT EXISTS accounting_entry_reversals (
 original_entry_id BIGINT PRIMARY KEY REFERENCES business_entries(id) ON DELETE CASCADE,
 reversal_entry_id BIGINT NOT NULL UNIQUE REFERENCES business_entries(id) ON DELETE CASCADE,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 reversed_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
 reason TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE accounting_closings ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ NULL;
ALTER TABLE accounting_closings ADD COLUMN IF NOT EXISTS reopened_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE accounting_closings ADD COLUMN IF NOT EXISTS reopen_reason TEXT NOT NULL DEFAULT '';

ALTER TABLE approvals ADD COLUMN IF NOT EXISTS action_key VARCHAR(220) NOT NULL DEFAULT '';
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS execution_started_at TIMESTAMPTZ NULL;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS execution_finished_at TIMESTAMPTZ NULL;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS execution_error TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS approvals_action_key_uq ON approvals(tenant_id,action_key) WHERE action_key<>'';

CREATE TABLE IF NOT EXISTS notification_user_states (
 notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 is_read BOOLEAN NOT NULL DEFAULT FALSE,
 read_at TIMESTAMPTZ NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(notification_id,user_id)
);
CREATE INDEX IF NOT EXISTS notification_user_states_user_idx ON notification_user_states(tenant_id,user_id,is_read,notification_id DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 category VARCHAR(80) NOT NULL,
 in_app BOOLEAN NOT NULL DEFAULT TRUE,
 email BOOLEAN NOT NULL DEFAULT TRUE,
 push BOOLEAN NOT NULL DEFAULT TRUE,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,category)
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 channel VARCHAR(24) NOT NULL,
 destination TEXT NOT NULL DEFAULT '',
 status VARCHAR(32) NOT NULL DEFAULT 'pending',
 attempt_count INTEGER NOT NULL DEFAULT 0,
 available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 claimed_at TIMESTAMPTZ NULL,
 delivered_at TIMESTAMPTZ NULL,
 last_error TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(notification_id,user_id,channel,destination)
);
CREATE INDEX IF NOT EXISTS notification_deliveries_due_idx ON notification_deliveries(status,available_at,id);

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS trusted_device_id BIGINT NULL REFERENCES trusted_devices(id) ON DELETE SET NULL;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS exchange_account_id BIGINT NULL REFERENCES exchange_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS push_subscriptions_recipient_idx ON push_subscriptions(tenant_id,user_id,disabled_at);

INSERT INTO permissions(code,description) VALUES
 ('accounts.manage_all','Manage all workspace payment accounts'),
 ('ledger.adjust','Post manual payment-account ledger adjustments'),
 ('accounting.reopen','Reopen a closed accounting business day')
ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('admin','manager') AND p.code IN ('accounts.manage_all','ledger.adjust','accounting.reopen')
ON CONFLICT DO NOTHING;

UPDATE update_state SET current_version='2.0.2',updated_at=CURRENT_TIMESTAMP WHERE id=1;
COMMIT;
