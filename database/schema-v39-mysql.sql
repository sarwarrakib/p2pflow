-- P2PFlow v1.8.1 normalized relational target schema (MySQL/MariaDB)
-- Safe additive foundation: existing encrypted state tables remain the rollback source.
CREATE TABLE IF NOT EXISTS p2pflow_workspaces_v39 (
  id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  slug VARCHAR(96) NOT NULL,
  name VARCHAR(180) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_p2pflow_workspace_slug_v39 (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS p2pflow_orders_v39 (
  workspace_id BIGINT UNSIGNED NOT NULL,
  id BIGINT UNSIGNED NOT NULL,
  credential_id BIGINT UNSIGNED NULL,
  external_order_no VARCHAR(96) NULL,
  order_no VARCHAR(96) NULL,
  status VARCHAR(48) NOT NULL DEFAULT '',
  external_status VARCHAR(64) NOT NULL DEFAULT '',
  trade_type VARCHAR(24) NOT NULL DEFAULT '',
  asset VARCHAR(24) NOT NULL DEFAULT '',
  fiat VARCHAR(24) NOT NULL DEFAULT '',
  amount DECIMAL(36,12) NOT NULL DEFAULT 0,
  total_price DECIMAL(36,12) NOT NULL DEFAULT 0,
  assigned_agent_id BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  payload_json JSON NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE KEY uq_p2pflow_order_external_v39 (workspace_id, credential_id, external_order_no),
  KEY idx_p2pflow_orders_status_v39 (workspace_id, status, updated_at),
  KEY idx_p2pflow_orders_agent_v39 (workspace_id, assigned_agent_id, status, updated_at),
  KEY idx_p2pflow_orders_created_v39 (workspace_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS p2pflow_ads_v39 (
  workspace_id BIGINT UNSIGNED NOT NULL,
  id BIGINT UNSIGNED NOT NULL,
  credential_id BIGINT UNSIGNED NULL,
  adv_no VARCHAR(96) NULL,
  status INT NOT NULL DEFAULT 0,
  trade_type VARCHAR(24) NOT NULL DEFAULT '',
  asset VARCHAR(24) NOT NULL DEFAULT '',
  fiat VARCHAR(24) NOT NULL DEFAULT '',
  price DECIMAL(36,12) NOT NULL DEFAULT 0,
  surplus_amount DECIMAL(36,12) NOT NULL DEFAULT 0,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  payload_json JSON NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE KEY uq_p2pflow_ads_external_v39 (workspace_id, credential_id, adv_no),
  KEY idx_p2pflow_ads_status_v39 (workspace_id, credential_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS p2pflow_payment_accounts_v39 (
  workspace_id BIGINT UNSIGNED NOT NULL,
  id BIGINT UNSIGNED NOT NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  payment_method_id BIGINT UNSIGNED NULL,
  status VARCHAR(32) NOT NULL DEFAULT '',
  account_number_hash CHAR(64) NOT NULL DEFAULT '',
  current_balance DECIMAL(36,12) NOT NULL DEFAULT 0,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  payload_json JSON NOT NULL,
  PRIMARY KEY (workspace_id, id),
  KEY idx_p2pflow_payment_owner_v39 (workspace_id, owner_user_id, status),
  KEY idx_p2pflow_payment_method_v39 (workspace_id, payment_method_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS p2pflow_chats_v39 (
  workspace_id BIGINT UNSIGNED NOT NULL,
  id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  credential_id BIGINT UNSIGNED NULL,
  external_message_id VARCHAR(128) NULL,
  direction VARCHAR(24) NOT NULL DEFAULT '',
  message_type VARCHAR(24) NOT NULL DEFAULT 'text',
  created_at DATETIME(6) NULL,
  payload_json JSON NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE KEY uq_p2pflow_chat_external_v39 (workspace_id, credential_id, external_message_id),
  KEY idx_p2pflow_chat_order_v39 (workspace_id, order_id, id),
  KEY idx_p2pflow_chat_created_v39 (workspace_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS p2pflow_ledger_v39 (
  workspace_id BIGINT UNSIGNED NOT NULL,
  id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NULL,
  payment_account_id BIGINT UNSIGNED NULL,
  direction VARCHAR(24) NOT NULL DEFAULT '',
  amount DECIMAL(36,12) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NULL,
  payload_json JSON NOT NULL,
  PRIMARY KEY (workspace_id, id),
  KEY idx_p2pflow_ledger_account_v39 (workspace_id, payment_account_id, created_at),
  KEY idx_p2pflow_ledger_order_v39 (workspace_id, order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
