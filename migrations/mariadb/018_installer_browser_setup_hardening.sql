START TRANSACTION;
-- 2.0.8 installer/browser-setup/GitHub-release hardening checkpoint.
-- No relational table rewrite is required for this release.
UPDATE update_state SET current_version='2.0.8',updated_at=CURRENT_TIMESTAMP WHERE id=1;
COMMIT;
