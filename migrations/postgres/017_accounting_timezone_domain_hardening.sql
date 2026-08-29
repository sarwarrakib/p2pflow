BEGIN;
-- 2.0.7 is a code-level accounting business-timezone/domain deployment hardening
-- checkpoint. No table rewrite is required; the migration records the deployed
-- application/schema checkpoint so signed update/rollback state stays aligned.
UPDATE update_state SET current_version='2.0.7',updated_at=CURRENT_TIMESTAMP WHERE id=1;
COMMIT;
