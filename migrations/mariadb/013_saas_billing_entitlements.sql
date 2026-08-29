ALTER TABLE subscriptions ADD COLUMN setup_fee_paid_at DATETIME(6) NULL;
ALTER TABLE subscriptions ADD COLUMN billing_cycle_anchor DATETIME(6) NULL;
ALTER TABLE subscriptions ADD COLUMN next_invoice_at DATETIME(6) NULL;
ALTER TABLE subscriptions ADD COLUMN past_due_since DATETIME(6) NULL;
ALTER TABLE subscriptions ADD COLUMN grace_until DATETIME(6) NULL;
ALTER TABLE subscriptions ADD COLUMN cancelled_at DATETIME(6) NULL;
ALTER TABLE subscriptions ADD COLUMN metadata_json JSON NOT NULL DEFAULT (JSON_OBJECT());

ALTER TABLE invoices ADD COLUMN idempotency_key VARCHAR(220) NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN provider VARCHAR(80) NOT NULL DEFAULT 'manual';
ALTER TABLE invoices ADD COLUMN provider_invoice_id VARCHAR(220) NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN period_start DATETIME(6) NULL;
ALTER TABLE invoices ADD COLUMN period_end DATETIME(6) NULL;
ALTER TABLE invoices ADD COLUMN updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);
CREATE INDEX invoices_idempotency_idx ON invoices(tenant_id,idempotency_key);
CREATE INDEX invoices_billing_due_idx ON invoices(status,due_at,tenant_id);

ALTER TABLE payments ADD COLUMN provider_event_id VARCHAR(220) NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN failure_code VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN failure_message TEXT NOT NULL;
CREATE INDEX payments_invoice_status_idx ON payments(invoice_id,status,id);

ALTER TABLE billing_webhook_events ADD COLUMN attempt_count INT NOT NULL DEFAULT 0;
ALTER TABLE billing_webhook_events ADD COLUMN last_error TEXT NOT NULL;

CREATE TABLE IF NOT EXISTS billing_checkout_sessions (
 id VARCHAR(120) PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 invoice_id BIGINT UNSIGNED NOT NULL,
 provider VARCHAR(80) NOT NULL,
 provider_session_id VARCHAR(220) NOT NULL DEFAULT '',
 idempotency_key VARCHAR(220) NOT NULL,
 checkout_url TEXT NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'created',
 expires_at DATETIME(6) NULL,
 completed_at DATETIME(6) NULL,
 metadata_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_billing_checkout_idempotency(tenant_id,idempotency_key),
 INDEX idx_billing_checkout_invoice(invoice_id,status,created_at),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS billing_reconciliation_issues (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NULL,
 invoice_id BIGINT UNSIGNED NULL,
 payment_id BIGINT UNSIGNED NULL,
 provider VARCHAR(80) NOT NULL DEFAULT '',
 provider_event_id VARCHAR(220) NOT NULL DEFAULT '',
 issue_type VARCHAR(100) NOT NULL,
 expected_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 actual_json JSON NOT NULL DEFAULT (JSON_OBJECT()),
 status VARCHAR(32) NOT NULL DEFAULT 'open',
 resolution_note TEXT NOT NULL,
 resolved_by BIGINT UNSIGNED NULL,
 resolved_at DATETIME(6) NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX idx_billing_recon_status(status,created_at),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
 FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
 FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE SET NULL,
 FOREIGN KEY(resolved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tenant_entitlement_overrides (
 tenant_id BIGINT UNSIGNED NOT NULL,
 entitlement_key VARCHAR(140) NOT NULL,
 value_json JSON NOT NULL,
 reason TEXT NOT NULL,
 updated_by BIGINT UNSIGNED NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(tenant_id,entitlement_key),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO permissions(code,description) VALUES
 ('billing.reconcile','Resolve billing reconciliation issues'),
 ('billing.invoice','Create and manage workspace invoices');
INSERT IGNORE INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code='admin' AND p.code IN ('billing.reconcile','billing.invoice');
UPDATE plans SET entitlements_json=JSON_MERGE_PATCH(COALESCE(entitlements_json,JSON_OBJECT()),JSON_OBJECT('orders',TRUE,'ads',TRUE,'chat',TRUE,'payment_accounts',TRUE,'accounting',TRUE,'reports',TRUE,'notifications',TRUE,'routing',TRUE,'approvals',TRUE,'api_credentials',TRUE,'p2p_profile',TRUE,'extension',TRUE,'market',TRUE,'system_update',TRUE)) WHERE code='starter';
UPDATE update_state SET current_version='2.0.4',updated_at=CURRENT_TIMESTAMP WHERE id=1;
