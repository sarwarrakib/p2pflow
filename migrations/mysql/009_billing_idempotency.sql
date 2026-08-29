START TRANSACTION;
UPDATE payments SET provider_payment_id=CONCAT('legacy-', id) WHERE TRIM(provider_payment_id)='';
UPDATE payments p
JOIN (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY tenant_id, provider, provider_payment_id ORDER BY id
  ) AS rn
  FROM payments
) ranked ON ranked.id=p.id
SET p.provider_payment_id=CONCAT(LEFT(p.provider_payment_id, 145), '-dup-', p.id)
WHERE ranked.rn>1;
CREATE UNIQUE INDEX payments_provider_idempotency_idx
  ON payments(tenant_id, provider, provider_payment_id);
COMMIT;
