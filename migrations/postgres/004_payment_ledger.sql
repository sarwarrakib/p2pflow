BEGIN;
CREATE TABLE IF NOT EXISTS payment_account_ledger (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 payment_account_id BIGINT NOT NULL REFERENCES payment_accounts(id) ON DELETE CASCADE,
 user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
 order_id BIGINT NULL REFERENCES orders(id) ON DELETE SET NULL,
 entry_type VARCHAR(80) NOT NULL,
 direction VARCHAR(20) NOT NULL DEFAULT '',
 amount NUMERIC(28,12) NOT NULL DEFAULT 0,
 balance_before NUMERIC(28,12) NOT NULL DEFAULT 0,
 balance_after NUMERIC(28,12) NOT NULL DEFAULT 0,
 reference VARCHAR(220) NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_account_ledger_account_idx ON payment_account_ledger(tenant_id,payment_account_id,id DESC);
CREATE INDEX IF NOT EXISTS payment_account_ledger_order_idx ON payment_account_ledger(tenant_id,order_id,id DESC);
COMMIT;
