BEGIN;
ALTER TABLE chats ALTER COLUMN exchange_account_id DROP NOT NULL;
CREATE TABLE IF NOT EXISTS exchange_sync_state (
 exchange_account_id BIGINT PRIMARY KEY REFERENCES exchange_accounts(id) ON DELETE CASCADE,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 last_order_sync_at TIMESTAMPTZ NULL,
 last_ads_sync_at TIMESTAMPTZ NULL,
 last_chat_connected_at TIMESTAMPTZ NULL,
 last_chat_event_at TIMESTAMPTZ NULL,
 chat_status VARCHAR(32) NOT NULL DEFAULT 'idle',
 last_error TEXT NOT NULL DEFAULT '',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS exchange_sync_state_due_idx ON exchange_sync_state(tenant_id,last_order_sync_at,last_ads_sync_at);
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NULL;
CREATE TABLE IF NOT EXISTS worker_leases (
 lease_key VARCHAR(220) PRIMARY KEY,
 owner_id VARCHAR(160) NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS worker_leases_exp_idx ON worker_leases(expires_at);
COMMIT;
