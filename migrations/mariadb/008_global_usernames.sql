START TRANSACTION;
UPDATE users SET username=CONCAT('user-', id) WHERE TRIM(username)='';
UPDATE users u
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY LOWER(username) ORDER BY id) AS rn
  FROM users
) ranked ON ranked.id=u.id
SET u.username=CONCAT(LEFT(u.username, 95), '-', u.id)
WHERE ranked.rn>1;
CREATE UNIQUE INDEX users_username_global_idx ON users(username);
COMMIT;
