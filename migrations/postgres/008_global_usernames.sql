BEGIN;
-- Public SaaS login accepts username as a global identifier. Normalize legacy rows
-- and make duplicates deterministic before enforcing the global invariant.
UPDATE users SET username='user-' || id WHERE BTRIM(username)='';
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY LOWER(username) ORDER BY id) AS rn
  FROM users
)
UPDATE users u
SET username=LEFT(u.username, 95) || '-' || u.id
FROM ranked r
WHERE u.id=r.id AND r.rn>1;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_global_idx ON users(LOWER(username));
COMMIT;
