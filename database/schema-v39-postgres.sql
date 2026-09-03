-- P2PFlow v1.8.1 normalized relational target schema (PostgreSQL)
CREATE TABLE IF NOT EXISTS p2pflow_workspaces_v39 (
  id BIGINT PRIMARY KEY, slug VARCHAR(96) NOT NULL UNIQUE, name VARCHAR(180) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS p2pflow_orders_v39 (
  workspace_id BIGINT NOT NULL, id BIGINT NOT NULL, credential_id BIGINT, external_order_no VARCHAR(96), order_no VARCHAR(96),
  status VARCHAR(48) NOT NULL DEFAULT '', external_status VARCHAR(64) NOT NULL DEFAULT '', trade_type VARCHAR(24) NOT NULL DEFAULT '',
  asset VARCHAR(24) NOT NULL DEFAULT '', fiat VARCHAR(24) NOT NULL DEFAULT '', amount NUMERIC(36,12) NOT NULL DEFAULT 0,
  total_price NUMERIC(36,12) NOT NULL DEFAULT 0, assigned_agent_id BIGINT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_json JSONB NOT NULL, PRIMARY KEY (workspace_id,id), UNIQUE (workspace_id,credential_id,external_order_no)
);
CREATE INDEX IF NOT EXISTS idx_p2pflow_orders_status_v39 ON p2pflow_orders_v39(workspace_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_p2pflow_orders_agent_v39 ON p2pflow_orders_v39(workspace_id,assigned_agent_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_p2pflow_orders_created_v39 ON p2pflow_orders_v39(workspace_id,created_at DESC);
CREATE TABLE IF NOT EXISTS p2pflow_ads_v39 (
  workspace_id BIGINT NOT NULL, id BIGINT NOT NULL, credential_id BIGINT, adv_no VARCHAR(96), status INTEGER NOT NULL DEFAULT 0,
  trade_type VARCHAR(24) NOT NULL DEFAULT '', asset VARCHAR(24) NOT NULL DEFAULT '', fiat VARCHAR(24) NOT NULL DEFAULT '',
  price NUMERIC(36,12) NOT NULL DEFAULT 0, surplus_amount NUMERIC(36,12) NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_json JSONB NOT NULL, PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,credential_id,adv_no)
);
CREATE INDEX IF NOT EXISTS idx_p2pflow_ads_status_v39 ON p2pflow_ads_v39(workspace_id,credential_id,status);
CREATE TABLE IF NOT EXISTS p2pflow_payment_accounts_v39 (
  workspace_id BIGINT NOT NULL, id BIGINT NOT NULL, owner_user_id BIGINT, payment_method_id BIGINT, status VARCHAR(32) NOT NULL DEFAULT '',
  account_number_hash CHAR(64) NOT NULL DEFAULT '', current_balance NUMERIC(36,12) NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_json JSONB NOT NULL, PRIMARY KEY(workspace_id,id)
);
CREATE INDEX IF NOT EXISTS idx_p2pflow_payment_owner_v39 ON p2pflow_payment_accounts_v39(workspace_id,owner_user_id,status);
CREATE INDEX IF NOT EXISTS idx_p2pflow_payment_method_v39 ON p2pflow_payment_accounts_v39(workspace_id,payment_method_id,status);
CREATE TABLE IF NOT EXISTS p2pflow_chats_v39 (
  workspace_id BIGINT NOT NULL, id BIGINT NOT NULL, order_id BIGINT NOT NULL, credential_id BIGINT, external_message_id VARCHAR(128),
  direction VARCHAR(24) NOT NULL DEFAULT '', message_type VARCHAR(24) NOT NULL DEFAULT 'text', created_at TIMESTAMPTZ, payload_json JSONB NOT NULL,
  PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,credential_id,external_message_id)
);
CREATE INDEX IF NOT EXISTS idx_p2pflow_chat_order_v39 ON p2pflow_chats_v39(workspace_id,order_id,id);
CREATE INDEX IF NOT EXISTS idx_p2pflow_chat_created_v39 ON p2pflow_chats_v39(workspace_id,created_at DESC);
CREATE TABLE IF NOT EXISTS p2pflow_ledger_v39 (
  workspace_id BIGINT NOT NULL, id BIGINT NOT NULL, order_id BIGINT, payment_account_id BIGINT, direction VARCHAR(24) NOT NULL DEFAULT '',
  amount NUMERIC(36,12) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ, payload_json JSONB NOT NULL, PRIMARY KEY(workspace_id,id)
);
CREATE INDEX IF NOT EXISTS idx_p2pflow_ledger_account_v39 ON p2pflow_ledger_v39(workspace_id,payment_account_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_p2pflow_ledger_order_v39 ON p2pflow_ledger_v39(workspace_id,order_id);
