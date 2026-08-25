# P2PFlow v1.6.8 — Launch Checklist

## Package

- [ ] Application `1.6.8`
- [ ] Database schema `39`
- [ ] ZIP SHA-256 verified
- [ ] `npm run build` passes
- [ ] complete `npm test` passes
- [ ] service restarted
- [ ] browser/PWA/CDN cache cleared

## Order ingestion

- [ ] Every active Binance API credential is polled even when a CRM user has Orders OFF
- [ ] No Orders/Notifications/Advertisement user preference is consulted by background Binance ingestion
- [ ] Fast discovery allows up to 20 seconds for Binance list response instead of 4.5/7 seconds
- [ ] A slow API A request does not prevent API B from continuing its discovery cycle
- [ ] New Binance order reaches local CRM storage and emits realtime changed-order event
- [ ] Binance status change reaches CRM without requiring browser reload

## Existing permission + new overlay

- [ ] Admin/Manager with exact account Orders View sees permitted orders when account Orders is ON
- [ ] Live Order user sees permitted unassigned live orders when Orders is ON
- [ ] Assignment-only user sees assigned orders according to old assignment logic
- [ ] API A Orders OFF affects only that CRM user + API A
- [ ] API B remains independent
- [ ] Orders ON triggers immediate exact-account recovery reconciliation
- [ ] Notifications OFF does not hide or stop orders

## Production recovery check

- [ ] Turn API A Orders OFF, wait for a Binance order, verify another permitted user still sees it
- [ ] Turn API A Orders ON, verify the first user receives existing permitted order without waiting for a new Binance order
- [ ] Check logs for any SAPI timeout/error and record the actual duration/account if present
- [ ] Test with at least two connected API accounts simultaneously
