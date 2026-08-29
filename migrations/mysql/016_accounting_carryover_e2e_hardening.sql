START TRANSACTION;
CREATE TABLE accounting_carryover_lots (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 closing_id BIGINT UNSIGNED NULL,
 business_date DATE NOT NULL,
 asset VARCHAR(32) NOT NULL DEFAULT 'USDT',
 sell_fiat DECIMAL(28,12) NOT NULL DEFAULT 0,
 sold_asset DECIMAL(28,12) NOT NULL DEFAULT 0,
 initial_carryover_fiat DECIMAL(28,12) NOT NULL DEFAULT 0,
 initial_provisional_net_asset DECIMAL(28,12) NOT NULL DEFAULT 0,
 provisional_net_yield_per_bdt DECIMAL(28,18) NOT NULL DEFAULT 0,
 provisional_buy_rate DECIMAL(28,12) NOT NULL DEFAULT 0,
 provisional_fee_rate DECIMAL(18,12) NOT NULL DEFAULT 0,
 operational_profit_asset DECIMAL(28,12) NOT NULL DEFAULT 0,
 settled_fiat DECIMAL(28,12) NOT NULL DEFAULT 0,
 settled_net_asset DECIMAL(28,12) NOT NULL DEFAULT 0,
 settled_fee_asset DECIMAL(28,12) NOT NULL DEFAULT 0,
 outstanding_fiat DECIMAL(28,12) NOT NULL DEFAULT 0,
 estimated_net_asset DECIMAL(28,12) NOT NULL DEFAULT 0,
 status VARCHAR(24) NOT NULL DEFAULT 'open',
 source VARCHAR(80) NOT NULL DEFAULT 'daily_close_v206',
 agent_snapshot_complete BOOLEAN NOT NULL DEFAULT FALSE,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_accounting_carryover_lot(tenant_id,business_date,asset),
 KEY accounting_carryover_lots_open_idx(tenant_id,asset,status,business_date,id),
 CONSTRAINT fk_accounting_carryover_lot_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 CONSTRAINT fk_accounting_carryover_lot_close FOREIGN KEY(closing_id) REFERENCES accounting_closings(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE accounting_carryover_settlements (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 carryover_lot_id BIGINT UNSIGNED NOT NULL,
 buy_order_id BIGINT UNSIGNED NOT NULL,
 origin_business_date DATE NOT NULL,
 settlement_business_date DATE NOT NULL,
 asset VARCHAR(32) NOT NULL DEFAULT 'USDT',
 buy_order_no VARCHAR(100) NOT NULL DEFAULT '',
 allocated_fiat DECIMAL(28,12) NOT NULL DEFAULT 0,
 actual_net_asset DECIMAL(28,12) NOT NULL DEFAULT 0,
 actual_fee_asset DECIMAL(28,12) NOT NULL DEFAULT 0,
 provisional_net_asset DECIMAL(28,12) NOT NULL DEFAULT 0,
 adjustment_asset DECIMAL(28,12) NOT NULL DEFAULT 0,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_accounting_carryover_settlement(carryover_lot_id,buy_order_id),
 KEY accounting_carryover_settlement_date_idx(tenant_id,asset,settlement_business_date,id),
 KEY accounting_carryover_settlement_origin_idx(tenant_id,origin_business_date,carryover_lot_id,id),
 CONSTRAINT fk_accounting_carryover_settlement_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 CONSTRAINT fk_accounting_carryover_settlement_lot FOREIGN KEY(carryover_lot_id) REFERENCES accounting_carryover_lots(id) ON DELETE CASCADE,
 CONSTRAINT fk_accounting_carryover_settlement_order FOREIGN KEY(buy_order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE accounting_carryover_agent_shares (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 carryover_lot_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 sell_fiat DECIMAL(28,12) NOT NULL DEFAULT 0,
 sold_asset DECIMAL(28,12) NOT NULL DEFAULT 0,
 operational_profit_asset DECIMAL(28,12) NOT NULL DEFAULT 0,
 included_in_company_totals BOOLEAN NOT NULL DEFAULT TRUE,
 source VARCHAR(80) NOT NULL DEFAULT 'daily_close_v206',
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_accounting_carryover_agent(carryover_lot_id,user_id),
 KEY accounting_carryover_agent_user_idx(tenant_id,user_id,carryover_lot_id),
 CONSTRAINT fk_accounting_carryover_agent_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 CONSTRAINT fk_accounting_carryover_agent_lot FOREIGN KEY(carryover_lot_id) REFERENCES accounting_carryover_lots(id) ON DELETE CASCADE,
 CONSTRAINT fk_accounting_carryover_agent_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX orders_accounting_event_idx ON orders(tenant_id,order_source,status,completed_at,updated_at,trade_type,id);
UPDATE update_state SET current_version='2.0.6',updated_at=CURRENT_TIMESTAMP WHERE id=1;
COMMIT;
