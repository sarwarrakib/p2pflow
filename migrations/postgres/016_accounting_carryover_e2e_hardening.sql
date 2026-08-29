BEGIN;
CREATE TABLE IF NOT EXISTS accounting_carryover_lots (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 closing_id BIGINT NULL REFERENCES accounting_closings(id) ON DELETE SET NULL,
 business_date DATE NOT NULL,
 asset VARCHAR(32) NOT NULL DEFAULT 'USDT',
 sell_fiat NUMERIC(28,12) NOT NULL DEFAULT 0,
 sold_asset NUMERIC(28,12) NOT NULL DEFAULT 0,
 initial_carryover_fiat NUMERIC(28,12) NOT NULL DEFAULT 0,
 initial_provisional_net_asset NUMERIC(28,12) NOT NULL DEFAULT 0,
 provisional_net_yield_per_bdt NUMERIC(28,18) NOT NULL DEFAULT 0,
 provisional_buy_rate NUMERIC(28,12) NOT NULL DEFAULT 0,
 provisional_fee_rate NUMERIC(18,12) NOT NULL DEFAULT 0,
 operational_profit_asset NUMERIC(28,12) NOT NULL DEFAULT 0,
 settled_fiat NUMERIC(28,12) NOT NULL DEFAULT 0,
 settled_net_asset NUMERIC(28,12) NOT NULL DEFAULT 0,
 settled_fee_asset NUMERIC(28,12) NOT NULL DEFAULT 0,
 outstanding_fiat NUMERIC(28,12) NOT NULL DEFAULT 0,
 estimated_net_asset NUMERIC(28,12) NOT NULL DEFAULT 0,
 status VARCHAR(24) NOT NULL DEFAULT 'open',
 source VARCHAR(80) NOT NULL DEFAULT 'daily_close_v206',
 agent_snapshot_complete BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(tenant_id,business_date,asset)
);
CREATE INDEX IF NOT EXISTS accounting_carryover_lots_open_idx ON accounting_carryover_lots(tenant_id,asset,status,business_date,id);

CREATE TABLE IF NOT EXISTS accounting_carryover_settlements (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 carryover_lot_id BIGINT NOT NULL REFERENCES accounting_carryover_lots(id) ON DELETE CASCADE,
 buy_order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 origin_business_date DATE NOT NULL,
 settlement_business_date DATE NOT NULL,
 asset VARCHAR(32) NOT NULL DEFAULT 'USDT',
 buy_order_no VARCHAR(100) NOT NULL DEFAULT '',
 allocated_fiat NUMERIC(28,12) NOT NULL DEFAULT 0,
 actual_net_asset NUMERIC(28,12) NOT NULL DEFAULT 0,
 actual_fee_asset NUMERIC(28,12) NOT NULL DEFAULT 0,
 provisional_net_asset NUMERIC(28,12) NOT NULL DEFAULT 0,
 adjustment_asset NUMERIC(28,12) NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(carryover_lot_id,buy_order_id)
);
CREATE INDEX IF NOT EXISTS accounting_carryover_settlement_date_idx ON accounting_carryover_settlements(tenant_id,asset,settlement_business_date,id);
CREATE INDEX IF NOT EXISTS accounting_carryover_settlement_origin_idx ON accounting_carryover_settlements(tenant_id,origin_business_date,carryover_lot_id,id);

CREATE TABLE IF NOT EXISTS accounting_carryover_agent_shares (
 id BIGSERIAL PRIMARY KEY,
 tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 carryover_lot_id BIGINT NOT NULL REFERENCES accounting_carryover_lots(id) ON DELETE CASCADE,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 sell_fiat NUMERIC(28,12) NOT NULL DEFAULT 0,
 sold_asset NUMERIC(28,12) NOT NULL DEFAULT 0,
 operational_profit_asset NUMERIC(28,12) NOT NULL DEFAULT 0,
 included_in_company_totals BOOLEAN NOT NULL DEFAULT TRUE,
 source VARCHAR(80) NOT NULL DEFAULT 'daily_close_v206',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(carryover_lot_id,user_id)
);
CREATE INDEX IF NOT EXISTS accounting_carryover_agent_user_idx ON accounting_carryover_agent_shares(tenant_id,user_id,carryover_lot_id);

CREATE INDEX IF NOT EXISTS orders_accounting_event_idx ON orders(tenant_id,order_source,status,completed_at,updated_at,trade_type,id);
UPDATE update_state SET current_version='2.0.6',updated_at=CURRENT_TIMESTAMP WHERE id=1;
COMMIT;
