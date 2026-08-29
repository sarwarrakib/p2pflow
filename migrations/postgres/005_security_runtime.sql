BEGIN;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS public_key_jwk JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS device_id_hint VARCHAR(40) NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS device_auth_challenges (
  id VARCHAR(120) PRIMARY KEY,
  trusted_device_id BIGINT NOT NULL REFERENCES trusted_devices(id) ON DELETE CASCADE,
  signing_payload TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS device_auth_challenges_exp_idx ON device_auth_challenges(trusted_device_id,expires_at);
CREATE TABLE IF NOT EXISTS security_challenges (
  id VARCHAR(120) PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(80) NOT NULL,
  target VARCHAR(240) NOT NULL DEFAULT '',
  code_hash VARCHAR(128) NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS security_challenges_user_exp_idx ON security_challenges(user_id,purpose,expires_at);
COMMIT;
