ALTER TABLE chats MODIFY exchange_account_id BIGINT UNSIGNED NULL;
CREATE TABLE IF NOT EXISTS exchange_sync_state (
 exchange_account_id BIGINT UNSIGNED PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 last_order_sync_at DATETIME(6) NULL,
 last_ads_sync_at DATETIME(6) NULL,
 last_chat_connected_at DATETIME(6) NULL,
 last_chat_event_at DATETIME(6) NULL,
 chat_status VARCHAR(32) NOT NULL DEFAULT 'idle',
 last_error TEXT NOT NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY idx_exchange_sync_due(tenant_id,last_order_sync_at,last_ads_sync_at),
 CONSTRAINT fk_sync_account FOREIGN KEY(exchange_account_id) REFERENCES exchange_accounts(id) ON DELETE CASCADE,
 CONSTRAINT fk_sync_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE outbox_events ADD COLUMN claimed_at DATETIME(6) NULL;
CREATE TABLE IF NOT EXISTS worker_leases (
 lease_key VARCHAR(220) PRIMARY KEY,
 owner_id VARCHAR(160) NOT NULL,
 expires_at DATETIME(6) NOT NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY idx_worker_leases_exp(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
