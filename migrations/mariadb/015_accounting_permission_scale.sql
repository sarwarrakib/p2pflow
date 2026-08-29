START TRANSACTION;
ALTER TABLE orders ADD COLUMN accounting_net_asset DECIMAL(28,12) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN accounting_fee_asset DECIMAL(28,12) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN accounting_fact_version INT NOT NULL DEFAULT 0;
CREATE INDEX orders_accounting_report_idx ON orders(tenant_id,order_source,status,updated_at,trade_type,id);
CREATE INDEX business_entries_accounting_report_idx ON business_entries(tenant_id,business_date,agent_id,entry_type,id);
CREATE INDEX exchange_account_permissions_tenant_user_idx ON exchange_account_permissions(tenant_id,user_id,exchange_account_id,permission_code);

INSERT IGNORE INTO permissions(code,description) VALUES
 ('binance.sync','Synchronize live Binance C2C orders for explicitly granted exchange accounts'),
 ('p2p.profile.sync','Synchronize Binance P2P profile and feedback for explicitly granted exchange accounts');
INSERT IGNORE INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('admin','manager') AND p.code IN ('binance.sync','p2p.profile.sync');
UPDATE update_state SET current_version='2.0.5',updated_at=CURRENT_TIMESTAMP WHERE id=1;
COMMIT;
