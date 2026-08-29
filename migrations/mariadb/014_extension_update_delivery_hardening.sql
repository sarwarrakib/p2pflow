START TRANSACTION;
ALTER TABLE notifications ADD COLUMN delivery_queued_at DATETIME(6) NULL;
ALTER TABLE notification_deliveries ADD COLUMN destination_key VARCHAR(64) NOT NULL DEFAULT '';
UPDATE notification_deliveries SET destination_key=LOWER(SHA2(destination,256)) WHERE destination_key='';
CREATE UNIQUE INDEX notification_deliveries_dedupe_idx ON notification_deliveries(notification_id,user_id,channel,destination_key);
ALTER TABLE extension_tasks ADD COLUMN claim_token_hash VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE extension_tasks ADD COLUMN claimed_at DATETIME(6) NULL;
ALTER TABLE extension_tasks ADD COLUMN lease_expires_at DATETIME(6) NULL;
ALTER TABLE extension_tasks ADD COLUMN completed_at DATETIME(6) NULL;
ALTER TABLE extension_tasks ADD COLUMN last_error TEXT NOT NULL;
CREATE INDEX extension_tasks_tenant_claim_idx ON extension_tasks(tenant_id,status,lease_expires_at,id);

CREATE TABLE IF NOT EXISTS system_release_history (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 version VARCHAR(40) NOT NULL,
 sha256 VARCHAR(128) NOT NULL DEFAULT '',
 status VARCHAR(40) NOT NULL DEFAULT 'staged',
 manifest_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 staged_path TEXT NOT NULL,
 requested_by BIGINT UNSIGNED NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX idx_system_release_version(version,id),
 FOREIGN KEY(requested_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_update_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 event_type VARCHAR(80) NOT NULL,
 version VARCHAR(40) NOT NULL DEFAULT '',
 message TEXT NOT NULL,
 metadata_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 user_id BIGINT UNSIGNED NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX idx_system_update_events_created(id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

UPDATE update_state SET current_version='2.0.4',updated_at=CURRENT_TIMESTAMP WHERE id=1;
COMMIT;
