# P2PFlow 1.1

P2PFlow private P2P operations CRM with encrypted database state, Binance integration and signed private-GitHub updates.

## Version format

- Normal update: `1.1 -> 1.2`
- Hotfix: `1.1 -> 1.1.1`
- Internal package version remains SemVer, for example `1.1.0`; UI hides the final zero.

## Hosting

Use `P2PFlow_v1.1.0_HOSTING_READY.zip` once to enable the stable same-process update launcher. Extract its contents directly into the Node Application Root. Do not delete the existing `.env`, `.p2pflow`, `shared/` or database.

```text
Node.js: 20+
Install: npm ci --omit=dev --ignore-scripts
Build: npm run build
Startup: server.js
Start: npm start
```

## GitHub update flow

Upload the extracted contents of `P2PFlow_v1.1.0_GITHUB_SOURCE.zip` to the private repository root, then Commit and Push origin. GitHub Actions publishes a signed release. In P2PFlow use:

```text
System Update -> Check Now -> Update Now
```

Before activation, P2PFlow waits for active writes, flushes state and creates a database backup. Code rollback does not delete current database records.
