BEGIN;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivery_queued_at TIMESTAMPTZ NULL;
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS destination_key VARCHAR(64) NOT NULL DEFAULT '';
UPDATE notification_deliveries SET destination_key=md5(destination) WHERE destination_key='';
CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_dedupe_idx ON notification_deliveries(notification_id,user_id,channel,destination_key);
ALTER TABLE extension_tasks ADD COLUMN IF NOT EXISTS claim_token_hash VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE extension_tasks ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NULL;
ALTER TABLE extension_tasks ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ NULL;
ALTER TABLE extension_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;
ALTER TABLE extension_tasks ADD COLUMN IF NOT EXISTS last_error TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS extension_tasks_tenant_claim_idx ON extension_tasks(tenant_id,status,lease_expires_at,id);

CREATE TABLE IF NOT EXISTS system_release_history (
 id BIGSERIAL PRIMARY KEY,
 version VARCHAR(40) NOT NULL,
 sha256 VARCHAR(128) NOT NULL DEFAULT '',
 status VARCHAR(40) NOT NULL DEFAULT 'staged',
 manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 staged_path TEXT NOT NULL DEFAULT '',
 requested_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS system_release_history_version_idx ON system_release_history(version,id DESC);

CREATE TABLE IF NOT EXISTS system_update_events (
 id BIGSERIAL PRIMARY KEY,
 event_type VARCHAR(80) NOT NULL,
 version VARCHAR(40) NOT NULL DEFAULT '',
 message TEXT NOT NULL DEFAULT '',
 metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
 user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS system_update_events_created_idx ON system_update_events(id DESC);

UPDATE update_state SET current_version='2.0.4',updated_at=CURRENT_TIMESTAMP WHERE id=1;
COMMIT;
