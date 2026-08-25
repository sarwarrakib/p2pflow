# P2PFlow v1.6.6 — Launch Checklist

## Version / package

- [ ] Application `1.6.6`
- [ ] Database schema `39`
- [ ] ZIP SHA-256 matches
- [ ] `npm run build` passes
- [ ] complete `npm test` passes
- [ ] `node app-server.js --per-user-account-controls-self-test` passes
- [ ] service restart complete
- [ ] reverse-proxy/CDN/browser/PWA cache cleared

## Existing permission logic preserved

- [ ] Existing Global Permissions remain unchanged
- [ ] Exact Binance Account Permissions remain unchanged
- [ ] Orders/Notifications/Advertisement switches do not grant permissions the user did not already have
- [ ] Enabled Binance API credentials continue background order/Ads/merchant sync regardless of a CRM user's switch

## Per-user Orders

- [ ] User A + API A Orders OFF -> only API A orders hidden from User A
- [ ] User A + API B Orders ON -> API B orders still visible under old permission/assignment logic
- [ ] User B still sees API A when User B has permission and Orders ON/default
- [ ] User A's API A OFF does not stop API A new-order discovery/status updates for other users
- [ ] Assignment-scoped User A is not newly assigned API A orders while API A Orders is OFF
- [ ] Turning API A Orders back ON restores the normal permission/assignment view

## Per-user Notifications

- [ ] API B Orders ON + Notifications OFF -> orders still work for the user
- [ ] Only that user's API B in-app/email/push notifications are muted
- [ ] Another user's API B notification delivery is unaffected
- [ ] Chat Notifications master OFF still mutes all account notifications for that user

## Per-user Advertisement

- [ ] Advertisement OFF removes only that user's selected API account from Ads operations
- [ ] Other users with Ads permission remain unaffected
- [ ] `ads.view` / `ads.manage` still control authorization
- [ ] Background Ads/merchant sync continues with Advertisement OFF for one user

## Chat

- [ ] All Accounts selector still lists permitted accounts
- [ ] Account Settings can be saved by the current user for their own preference
- [ ] Orders OFF does not remove established permitted chat conversations
- [ ] Account selection remains local/instant

## Existing critical regressions

- [ ] New Binance orders appear promptly
- [ ] Order status changes update promptly
- [ ] Payment Split OFF -> Mark as Paid has no split popup
- [ ] Copy buttons work after realtime DOM updates
- [ ] Advertisement Edit remains fast and exact-account scoped
- [ ] Login/CSRF flow works
- [ ] Chat WebSocket/incoming messages work
- [ ] Chat/P2P Market scroll remains stable
- [ ] Mobile side drawer/popup layout remains readable
- [ ] Payment Account/ledger/accounting data intact

## Security / update safety

- [ ] `.env`, `.p2pflow/`, `shared/`, database are absent from release ZIP
- [ ] secret vault key backup exists when separately configured
- [ ] Health Check clean
- [ ] signed GitHub System Update is Ready
- [ ] database backup verified before switching release
- [ ] previous validated release rollback remains available
