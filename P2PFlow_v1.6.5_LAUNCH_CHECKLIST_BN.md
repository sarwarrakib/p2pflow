# P2PFlow v1.6.5 — Launch Checklist

## Version / package

- [ ] Application `1.6.5`
- [ ] Database schema `38`
- [ ] ZIP SHA-256 matches
- [ ] `npm run build` passes
- [ ] complete `npm test` passes
- [ ] service restart complete
- [ ] reverse-proxy/CDN/browser/PWA cache cleared

## Realtime / performance

- [ ] New Binance order appears promptly in the fast discovery cycle
- [ ] Binance order status changes patch Orders promptly without 40–50 second full-list wait
- [ ] Orders initial load remains usable with large Fulfilled history
- [ ] Returning between previously visited pages displays retained route immediately
- [ ] 15-minute navigation/Orders/Chat/Ads soak test does not reproduce intermittent 504
- [ ] MySQL/PostgreSQL connections remain healthy during background sync

## Orders

- [ ] Payment Split OFF -> Mark as Paid has no split popup
- [ ] Payment Split ON -> split gate still works
- [ ] Copy buttons work before and after realtime DOM updates without page reload
- [ ] New order row/status remains correct per exact API account

## Advertisements

- [ ] Edit opens immediately before live refresh completes
- [ ] SELL ad shows only its exact Binance account's saved P2P payment methods
- [ ] Existing selected SELL payment method is selected in editor
- [ ] No cross-account payId/payment account fallback
- [ ] Fixed-price UI uses explicit Binance bounds only when actually returned
- [ ] Exact Binance range rejection `X~Y` is shown to the operator
- [ ] Mobile Ads action sheet shows both Edit and Delete above safe-area/bottom nav

## Chat account selector/settings

- [ ] Default selector is All Accounts
- [ ] All permitted connected API accounts appear
- [ ] Selecting account filters inbox without a network wait
- [ ] Orders OFF prevents that account from order receive/sync loops
- [ ] Notifications OFF prevents that account's notification delivery
- [ ] Advertisement OFF removes that account from Ads participation
- [ ] User permissions still restrict Ads/account actions
- [ ] Chat master Notifications OFF mutes all account notifications

## Existing critical regressions

- [ ] Login/CSRF flow works without reload workaround
- [ ] Chat WebSocket/incoming messages work
- [ ] Chat and P2P Market scroll do not jump
- [ ] BUY green / SELL red semantics remain correct
- [ ] Mobile side drawer readable
- [ ] Release Verification/FUND_PWD controlled test passes
- [ ] Payment Account/ledger/accounting data intact

## Security / update safety

- [ ] `.env`, `.p2pflow/`, `shared/`, database are absent from release ZIP
- [ ] secret vault key backup exists when separately configured
- [ ] Health Check clean
- [ ] signed GitHub System Update is Ready
- [ ] database backup verified before switching release
- [ ] previous validated release rollback remains available
