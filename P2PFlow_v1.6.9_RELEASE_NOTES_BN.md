# P2PFlow v1.6.9 Release Notes

## Order receiving regression recovery

v1.6.9 is intentionally rebuilt from the known-good v1.6.4 order engine instead of layering another patch on v1.6.5-v1.6.8.

### What is preserved exactly from v1.6.4

- Binance `listOrders` ingestion and order upsert path.
- Fast order discovery scheduler.
- Normal Binance order reconciliation loop.
- Existing Live Order permission model.
- Existing assignment and auto-assignment priority/capacity rules.
- Existing Admin/Manager/Agent account-scoped order permissions.

The new Chat account switches are not referenced from Binance ingestion, polling, reconciliation, or global credential activation.

### New account controls, implemented as a user-only overlay

The Chat page keeps the requested All Accounts selector and per-account settings:

- Orders: when OFF, that CRM user does not see that Binance account's orders. The system still syncs the account globally. Assignment routing keeps all v1.6.4 rules and adds only this user's OFF deny gate. Turning the switch back ON immediately restores the old permission/assignment visibility from already-synced orders.
- Notifications: mutes only that CRM user's in-app/email/push notifications tied to the selected Binance account. It does not affect order sync or assignment.
- Advertisement: hides/manages the selected account only for that CRM user, subject to existing Ads permissions. Background Ads sync is not disabled.

### Safety reset for earlier broken account-control values

Versions v1.6.5-v1.6.8 may have persisted account-control values while the feature was coupled to order runtime. On the first v1.6.9 startup, those new account switches are reset to their safe default (ON) for all users. This happens once. Users may then intentionally turn individual account switches OFF again.

This reset does not change existing roles, permissions, Binance credential grants, order assignments, orders, chats, payment accounts, ledgers, or accounting records.

### Verification

- Dedicated `account-feature-overlay-v169-self-test` asserts that user account controls are absent from the three core Binance order ingestion/polling functions.
- JavaScript syntax suite passes.
- `npm run build` passes.
- Complete `npm test` passes.
- Final unified ZIP is re-extracted and tested again before delivery.

Database schema target remains 37. A database previously upgraded by v1.6.5-v1.6.8 keeps its higher stored schema number because P2PFlow migrations are additive and never downgrade `meta.schemaVersion`.
