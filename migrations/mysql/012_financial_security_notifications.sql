ALTER TABLE payment_accounts ADD COLUMN account_type VARCHAR(32) NOT NULL DEFAULT 'personal';
ALTER TABLE payment_accounts ADD COLUMN opening_balance DECIMAL(28,12) NOT NULL DEFAULT 0;
ALTER TABLE payment_accounts ADD COLUMN receive_daily_limit DECIMAL(28,12) NOT NULL DEFAULT 0;
ALTER TABLE payment_accounts ADD COLUMN send_daily_limit DECIMAL(28,12) NOT NULL DEFAULT 0;
ALTER TABLE payment_accounts ADD COLUMN receive_monthly_limit DECIMAL(28,12) NOT NULL DEFAULT 0;
ALTER TABLE payment_accounts ADD COLUMN send_monthly_limit DECIMAL(28,12) NOT NULL DEFAULT 0;
ALTER TABLE payment_accounts ADD COLUMN charge_rules_json JSON NOT NULL DEFAULT (JSON_OBJECT());
ALTER TABLE payment_accounts ADD COLUMN commission_rules_json JSON NOT NULL DEFAULT (JSON_OBJECT());

CREATE TABLE IF NOT EXISTS payment_account_runtime (
 payment_account_id BIGINT UNSIGNED PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 balance DECIMAL(28,12) NOT NULL DEFAULT 0,
 version BIGINT NOT NULL DEFAULT 0,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX idx_payment_account_runtime_tenant(tenant_id,payment_account_id),
 FOREIGN KEY(payment_account_id) REFERENCES payment_accounts(id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS accounting_entry_reversals (
 original_entry_id BIGINT UNSIGNED PRIMARY KEY,
 reversal_entry_id BIGINT UNSIGNED NOT NULL UNIQUE,
 tenant_id BIGINT UNSIGNED NOT NULL,
 reversed_by BIGINT UNSIGNED NULL,
 reason TEXT NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(original_entry_id) REFERENCES business_entries(id) ON DELETE CASCADE,
 FOREIGN KEY(reversal_entry_id) REFERENCES business_entries(id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(reversed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
ALTER TABLE accounting_closings ADD COLUMN reopened_at DATETIME(6) NULL;
ALTER TABLE accounting_closings ADD COLUMN reopened_by BIGINT UNSIGNED NULL;
ALTER TABLE accounting_closings ADD COLUMN reopen_reason TEXT NOT NULL;

ALTER TABLE approvals ADD COLUMN action_key VARCHAR(220) NOT NULL DEFAULT '';
ALTER TABLE approvals ADD COLUMN execution_started_at DATETIME(6) NULL;
ALTER TABLE approvals ADD COLUMN execution_finished_at DATETIME(6) NULL;
ALTER TABLE approvals ADD COLUMN execution_error TEXT NOT NULL;
CREATE INDEX approvals_action_key_idx ON approvals(tenant_id,action_key);

CREATE TABLE IF NOT EXISTS notification_user_states (
 notification_id BIGINT UNSIGNED NOT NULL,
 tenant_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 is_read TINYINT(1) NOT NULL DEFAULT FALSE,
 read_at DATETIME(6) NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(notification_id,user_id),
 INDEX idx_notification_user_states_user(tenant_id,user_id,is_read,notification_id),
 FOREIGN KEY(notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notification_preferences (
 tenant_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 category VARCHAR(80) NOT NULL,
 in_app TINYINT(1) NOT NULL DEFAULT TRUE,
 email TINYINT(1) NOT NULL DEFAULT TRUE,
 push TINYINT(1) NOT NULL DEFAULT TRUE,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(user_id,category),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notification_deliveries (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 notification_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 channel VARCHAR(24) NOT NULL,
 destination TEXT NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'pending',
 attempt_count INT NOT NULL DEFAULT 0,
 available_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 claimed_at DATETIME(6) NULL,
 delivered_at DATETIME(6) NULL,
 last_error TEXT NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX idx_notification_deliveries_due(status,available_at,id),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE push_subscriptions ADD COLUMN trusted_device_id BIGINT UNSIGNED NULL;
ALTER TABLE push_subscriptions ADD COLUMN exchange_account_id BIGINT UNSIGNED NULL;
CREATE INDEX push_subscriptions_recipient_idx ON push_subscriptions(tenant_id,user_id,disabled_at);

INSERT IGNORE INTO permissions(code,description) VALUES
 ('accounts.manage_all','Manage all workspace payment accounts'),
 ('ledger.adjust','Post manual payment-account ledger adjustments'),
 ('accounting.reopen','Reopen a closed accounting business day');
UPDATE update_state SET current_version='2.0.2',updated_at=CURRENT_TIMESTAMP WHERE id=1;
