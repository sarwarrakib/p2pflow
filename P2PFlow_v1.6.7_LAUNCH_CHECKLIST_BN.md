# P2PFlow v1.6.7 — Launch Checklist

## Version / package

- [ ] Application `1.6.7`
- [ ] Database schema `39`
- [ ] ZIP SHA-256 matches
- [ ] `npm run build` passes
- [ ] complete `npm test` passes
- [ ] `node app-server.js --per-user-account-controls-self-test` passes
- [ ] service restart complete
- [ ] reverse-proxy/CDN/browser/PWA cache cleared

## Orders switch — old system + new overlay

- [ ] API A Orders OFF hides only API A from that CRM user
- [ ] API B remains visible when API B is ON and the user has the established permission
- [ ] Another CRM user's API A visibility is unaffected
- [ ] Background Binance sync for API A continues while one user has API A Orders OFF
- [ ] Turning API A Orders ON restores existing permitted API A orders immediately
- [ ] Admin/Manager with account Orders/Live Order permission sees the account again after ON
- [ ] Assignment-scoped user sees existing assigned API A orders after ON
- [ ] Assignment-scoped user without Live Order does not see unassigned API A orders
- [ ] Manual assignment makes an eligible assigned order visible
- [ ] New orders continue through the old routing/auto-assignment rules
- [ ] API A Orders toggle never changes API B assignment eligibility

## Browser/realtime recovery

- [ ] Turn API A OFF while Orders was previously opened, return to Orders and confirm no stale API A rows
- [ ] Turn API A back ON from Chat, return to Orders and confirm fresh rows without page reload
- [ ] Repeat with Orders open in a second browser tab; realtime event refreshes that tab
- [ ] Saved filter pointing to an OFF account resets to All API Accounts
- [ ] Explicit Save with Orders already ON still reconciles a stale Orders page

## Independent notification behavior

- [ ] API B Orders ON + Notifications OFF -> orders still visible/usable
- [ ] Only that CRM user's API B notification delivery is muted
- [ ] Other users' API B notifications are unaffected
- [ ] Chat master Notifications OFF still mutes all notifications for that user

## Existing critical regressions

- [ ] New Binance order discovery still works
- [ ] Order status realtime update still works
- [ ] Work Status behavior remains unchanged for non-Live-Order agents
- [ ] Live Order Work-status bypass applies only to the permitted Binance account
- [ ] Payment Split OFF -> Mark as Paid has no split popup
- [ ] Copy buttons work after realtime DOM updates
- [ ] Ads Edit/payment-method account isolation still works
- [ ] Chat WebSocket/incoming messages work
- [ ] Mobile popup/navigation remains usable
- [ ] Payment Account/ledger/accounting data intact

## Security / update safety

- [ ] `.env`, `.p2pflow/`, `shared/`, database are absent from release ZIP
- [ ] production database backup verified
- [ ] Health Check clean
- [ ] signed GitHub System Update is Ready
- [ ] previous validated release rollback remains available
