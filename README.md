# P2PFlow 1.2

P2P operations CRM with Bangla-first compact UI, encrypted database state, Binance integration and signed private-GitHub updates.

## Version

- Normal update: `1.2 -> 1.3`
- Hotfix: `1.2 -> 1.2.1`
- Internal SemVer: `1.2.0`; UI: `1.2`

## GitHub update

Extract `P2PFlow_v1.2.0_GITHUB_SOURCE.zip` into the private repository root, Commit and Push origin. Then use:

```text
System Update -> Check Now -> Update Now
```

## Manual hosting deploy

Use `P2PFlow_v1.2.0_HOSTING_READY.zip` only for a clean/manual deployment or recovery. Keep the existing `.env`, `.p2pflow`, `shared/` and database.

```text
Node.js: 20+
Install: npm ci --omit=dev --ignore-scripts
Build: npm run build
Startup: server.js
Start: npm start
```

Before activation, P2PFlow finishes active writes and creates a database backup. Code rollback does not delete current business records.
