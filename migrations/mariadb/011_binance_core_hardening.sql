START TRANSACTION;
ALTER TABLE final_action_challenges ADD COLUMN attempts INT NOT NULL DEFAULT 0;
ALTER TABLE final_action_challenges ADD COLUMN verification_token_hash VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE final_action_challenges ADD COLUMN session_hash VARCHAR(128) NOT NULL DEFAULT '';
CREATE INDEX idx_final_action_challenge_token ON final_action_challenges(user_id,order_id,verification_token_hash,expires_at);
INSERT IGNORE INTO permissions(code,description) VALUES
 ('orders.quick_release','Use exceptional quick-release workflow for an exchange order');
INSERT IGNORE INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code='orders.quick_release' WHERE r.code IN ('admin','manager');
CREATE INDEX chats_unread_lookup_idx ON chats(tenant_id,order_id,is_self,id);
UPDATE update_state SET current_version='2.0.1',updated_at=CURRENT_TIMESTAMP WHERE id=1;
COMMIT;
