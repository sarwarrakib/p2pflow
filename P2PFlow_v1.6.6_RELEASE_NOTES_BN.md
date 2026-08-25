# P2PFlow v1.6.6 Release Notes

## Per-CRM-user Binance account feature controls

- Version advanced from `1.6.5` to `1.6.6` and database schema advanced from `38` to additive schema `39`.
- v1.6.5 stored Chat account **Orders / Notifications / Advertisement** switches on the Binance API credential itself. That made one CRM user's switch affect the whole connected account and could stop new order/Ads synchronization for every user. v1.6.6 removes that behavior.
- These three switches are now stored per **CRM user + Binance API account**. Existing Global Permissions and exact Binance Account Permissions remain the authorization authority; the new switches can only narrow what that specific CRM user sees/receives.
- Enabled Binance credentials continue the established global background order, chat, advertisement and merchant-status synchronization regardless of any individual CRM user's switches.

## Orders behavior

- **Orders ON**: the CRM user sees/receives that API account's orders exactly when the existing `orders.view` / account permission and assignment logic permits it.
- **Orders OFF**: only that API account's orders are hidden from that CRM user. Other permitted API accounts remain visible, and other CRM users are unaffected.
- An assignment-scoped user with Orders OFF for an account is excluded from new automatic/manual assignment for that account, preventing an order from being assigned to a user who intentionally hid that account.
- Turning Orders OFF does not delete orders, revoke the underlying permission, stop Binance ingestion, or remove the account's chat history. Chat keeps the established access model independently.

## Notification behavior

- **Notifications OFF** mutes only that CRM user's configured in-app/email/push delivery for that Binance account.
- Orders remain visible/usable when Orders is ON, and system-wide Binance synchronization continues.
- Other CRM users continue receiving notifications according to their own permissions/preferences.
- The existing Chat Notifications master switch remains the final user-level mute and can suppress all account notifications even when an individual account's Notifications switch is ON.

## Advertisement behavior

- **Advertisement OFF** removes/disables that Binance account from Ads view/manage/create/update/delete for only that CRM user.
- Existing `ads.view` and `ads.manage` permissions are still required when Advertisement is ON.
- Background Binance Ads and merchant-status synchronization is no longer controlled by a CRM user's personal Advertisement switch, so one user cannot make an account stale for everyone else.

## Migration / compatibility

- Schema 39 normalizes `user.binanceCredentialFeatureControls` as per-user account preferences.
- When upgrading a schema-38 database, a legacy credential-level OFF state is transferred to the last identifiable CRM user who changed that account setting when the audit trail can identify that user. The legacy credential-level switches are then neutralized to ON so they cannot globally disable sync.
- If the historical editor cannot be identified, system-wide sync is restored and users default to ON, preserving the established pre-v1.6.5 behavior rather than leaving an account globally disabled.

## Validation

- Added a runtime `--per-user-account-controls-self-test` covering two CRM users and two Binance accounts, including the exact A/B scenario: API A Orders OFF for User A affects only API A/User A; API B Orders ON + Notifications OFF still shows API B orders to User A but mutes only User A's API B notifications; User B remains unaffected.
- Build regression checks explicitly assert that fast order discovery, full order sync, Ads auto-sync and merchant-status sync are sourced from enabled API credentials and are not gated by a CRM user's personal switches.
- `npm run build` and the complete `npm test` suite must pass before packaging/publishing.
