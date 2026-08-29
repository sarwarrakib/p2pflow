BEGIN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accounting_net_asset NUMERIC(28,12) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accounting_fee_asset NUMERIC(28,12) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS accounting_fact_version INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS orders_accounting_report_idx ON orders(tenant_id,order_source,status,updated_at,trade_type,id);
CREATE INDEX IF NOT EXISTS business_entries_accounting_report_idx ON business_entries(tenant_id,business_date,agent_id,entry_type,id);
CREATE INDEX IF NOT EXISTS exchange_account_permissions_tenant_user_idx ON exchange_account_permissions(tenant_id,user_id,exchange_account_id,permission_code);

INSERT INTO permissions(code,description) VALUES
 ('binance.sync','Synchronize live Binance C2C orders for explicitly granted exchange accounts'),
 ('p2p.profile.sync','Synchronize Binance P2P profile and feedback for explicitly granted exchange accounts')
ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('admin','manager') AND p.code IN ('binance.sync','p2p.profile.sync')
ON CONFLICT DO NOTHING;

UPDATE update_state SET current_version='2.0.5',updated_at=CURRENT_TIMESTAMP WHERE id=1;
COMMIT;
