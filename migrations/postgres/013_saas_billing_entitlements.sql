BEGIN;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS setup_fee_paid_at TIMESTAMPTZ NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle_anchor TIMESTAMPTZ NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_invoice_at TIMESTAMPTZ NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMPTZ NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_until TIMESTAMPTZ NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(220) NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS provider VARCHAR(80) NOT NULL DEFAULT 'manual';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS provider_invoice_id VARCHAR(220) NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_end TIMESTAMPTZ NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS invoices_idempotency_uq ON invoices(tenant_id,idempotency_key) WHERE idempotency_key<>'';
CREATE INDEX IF NOT EXISTS invoices_billing_due_idx ON invoices(status,due_at,tenant_id);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_event_id VARCHAR(220) NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_code VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_message TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS payments_invoice_status_idx ON payments(invoice_id,status,id DESC);

ALTER TABLE billing_webhook_events ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_webhook_events ADD COLUMN IF NOT EXISTS last_error TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS billing_checkout_sessions (
 id VARCHAR(120) PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
 provider VARCHAR(80) NOT NULL,
 provider_session_id VARCHAR(220) NOT NULL DEFAULT '',
 idempotency_key VARCHAR(220) NOT NULL,
 checkout_url TEXT NOT NULL DEFAULT '',
 status VARCHAR(32) NOT NULL DEFAULT 'created',
 expires_at TIMESTAMPTZ NULL,
 completed_at TIMESTAMPTZ NULL,
 metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS billing_checkout_invoice_idx ON billing_checkout_sessions(invoice_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS billing_reconciliation_issues (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NULL REFERENCES tenants(id) ON DELETE SET NULL,
 invoice_id BIGINT NULL REFERENCES invoices(id) ON DELETE SET NULL,
 payment_id BIGINT NULL REFERENCES payments(id) ON DELETE SET NULL,
 provider VARCHAR(80) NOT NULL DEFAULT '',
 provider_event_id VARCHAR(220) NOT NULL DEFAULT '',
 issue_type VARCHAR(100) NOT NULL,
 expected_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 actual_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 status VARCHAR(32) NOT NULL DEFAULT 'open',
 resolution_note TEXT NOT NULL DEFAULT '',
 resolved_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
 resolved_at TIMESTAMPTZ NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_recon_status_idx ON billing_reconciliation_issues(status,created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_entitlement_overrides (
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 entitlement_key VARCHAR(140) NOT NULL,
 value_json JSONB NOT NULL DEFAULT 'true'::jsonb,
 reason TEXT NOT NULL DEFAULT '',
 updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(tenant_id,entitlement_key)
);

INSERT INTO permissions(code,description) VALUES
 ('billing.reconcile','Resolve billing reconciliation issues'),
 ('billing.invoice','Create and manage workspace invoices')
ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code='admin' AND p.code IN ('billing.reconcile','billing.invoice')
ON CONFLICT DO NOTHING;

UPDATE plans SET entitlements_json = entitlements_json || '{"orders":true,"ads":true,"chat":true,"payment_accounts":true,"accounting":true,"reports":true,"notifications":true,"routing":true,"approvals":true,"api_credentials":true,"p2p_profile":true,"extension":true,"market":true,"system_update":true}'::jsonb
WHERE code='starter';
UPDATE update_state SET current_version='2.0.4',updated_at=CURRENT_TIMESTAMP WHERE id=1;
COMMIT;
