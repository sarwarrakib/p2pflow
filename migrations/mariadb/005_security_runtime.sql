ALTER TABLE trusted_devices ADD COLUMN public_key_jwk JSON NULL;
ALTER TABLE trusted_devices ADD COLUMN device_id_hint VARCHAR(40) NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS device_auth_challenges (
  id VARCHAR(120) PRIMARY KEY,
  trusted_device_id BIGINT UNSIGNED NOT NULL,
  signing_payload TEXT NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  used_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_device_challenge_device FOREIGN KEY (trusted_device_id) REFERENCES trusted_devices(id) ON DELETE CASCADE,
  INDEX device_auth_challenges_exp_idx(trusted_device_id,expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS security_challenges (
  id VARCHAR(120) PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  purpose VARCHAR(80) NOT NULL,
  target VARCHAR(240) NOT NULL DEFAULT '',
  code_hash VARCHAR(128) NOT NULL,
  payload_json JSON NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at DATETIME(6) NOT NULL,
  verified_at DATETIME(6) NULL,
  used_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_security_challenge_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_security_challenge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX security_challenges_user_exp_idx(user_id,purpose,expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
