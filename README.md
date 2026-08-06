# P2PFlow v1.0.167

P2PFlow is an encrypted P2P operations and accounting application for MariaDB 10.5 / MySQL-compatible hosting and PostgreSQL. MariaDB/MySQL is the default browser-installation choice.

## First installation happens once

The browser `/setup` flow is only for the first database and Owner configuration.

- The setup code is stored at the stable hosting Application Root, not inside a versioned release.
- If a partially completed installation already saved the permanent Application Key, P2PFlow reuses that saved key automatically.
- After a successful startup, the setup lock is stored in the stable `shared/.p2pflow` directory and the setup-code file is deleted.
- After setup is complete, `/setup` redirects to the normal login page. Setup code and Application Key are never used for software updates.

## Shared-hosting deployment

Use the dedicated `P2PFlow_v1.0.167_HOSTING_MIGRATION.zip` package. Extract its contents directly into the Node Application Root. It contains a stable launcher and the initial application release under `releases/1.0.167`.

1. Create a MariaDB/MySQL database and user from the hosting control panel.
2. Give that user All Privileges on the database.
3. Upload and extract the hosting ZIP into the Node Application Root.
4. Select Node.js 20 or newer and `server.js` as the startup file.
5. Press Run NPM Install / Install Dependencies once.
6. Start or restart the Node application.
7. For a new installation only, open `/setup` and use `P2PFLOW_SETUP_CODE.txt` from the Application Root.

No shell command is required for normal shared-hosting installation.

Detailed guide: `docs/HOSTING_BROWSER_INSTALL_BN.md`.

## Existing v1.0.163 installation

Do not delete the database, `.env`, `.p2pflow`, proof/chat data, or the existing Application Root before taking a backup. When the v1.0.167 hosting package is copied over the current Application Root:

- the old root `.env` is migrated to `shared/.env` if needed;
- the old root `.p2pflow` setup state is migrated to `shared/.p2pflow` if needed;
- the saved permanent Application Key is reused;
- an already-completed setup does not reopen;
- the existing Owner account and database records remain unchanged.

## Private GitHub updates

After login, only the durable Owner account can open **Control Panel → System Update**.

From that page the Owner can:

- connect a private GitHub repository;
- save a fine-grained read-only repository token in encrypted database state;
- test the repository connection;
- generate an Ed25519 release-signing key pair;
- check, prepare and install a signed release;
- roll application code back to an older compatible managed release.

Updates never install automatically. A code rollback keeps the current database and transactions; it does not restore an old database snapshot. P2PFlow creates a database backup before a code switch and automatically restores the previous code release if the new release fails readiness.

The GitHub source package is separate from the hosting package. Push the contents of `P2PFlow_v1.0.167_GITHUB_SOURCE.zip` to the private repository. Every push to main/master runs the guarded workflow. A new package version automatically receives a matching tag and signed GitHub Release; reusing an already-published version for different code is blocked.

## Database and encryption

- MariaDB 10.5 / MySQL-compatible through the `mysql2` promise/pool driver.
- PostgreSQL remains available as an optional provider.
- Business state and binary objects are encrypted with AES-256-GCM before database storage.
- MariaDB uses InnoDB, transactional state writes, revision history, database backups and a single-writer database lock.
- The permanent Application Key must be backed up. A different key cannot decrypt existing encrypted data.

## Version

- Application: `1.0.167`
- Database schema: `26`
- Data compatibility epoch: `1`
- Node.js: `20+`

## Setup-code behavior

`P2PFLOW_SETUP_CODE.txt` is created only while first-run setup is required. After setup succeeds, it is deleted and the old code intentionally stops working. This code is not an update password.

If the hosting filesystem cannot create the file, set a 12+ character `P2PFLOW_SETUP_TOKEN` in the Node application environment and use that token only for first installation.
