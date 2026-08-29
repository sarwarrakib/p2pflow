BEGIN;
-- Preserve any legacy duplicate records but make their provider ids unique before
-- enforcing the idempotency invariant for future webhook processing.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY tenant_id, provider, provider_payment_id ORDER BY id
  ) AS rn
  FROM payments
  WHERE provider_payment_id <> ''
)
UPDATE payments p
SET provider_payment_id=LEFT(p.provider_payment_id, 150) || '-dup-' || p.id
FROM ranked r
WHERE p.id=r.id AND r.rn>1;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_idempotency_idx
  ON payments(tenant_id, provider, provider_payment_id)
  WHERE provider_payment_id <> '';
COMMIT;
