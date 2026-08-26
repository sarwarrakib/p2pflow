# P2PFlow v1.7.4 Release Notes

## Ads editor / HTTP 504 gateway timeout fix

The Ads editor no longer starts live Binance advertisement or P2P Profile network requests from the Edit click path. `/api/ads/:id` is now a local synchronized-snapshot endpoint even when a legacy `refresh=1` query is supplied. This prevents a slow Binance/Profile fallback chain from holding the web request open until LiteSpeed/Nginx/shared-hosting returns HTTP 504.

### Root cause fixed

SELL payment-method refresh could call two Binance owner-profile endpoints and try multiple `clientType` variants sequentially. With 15-second transport windows, a single editor refresh could remain open for roughly 60 seconds on a normal `web` credential and longer for other client types. The browser API layer also retried HTML 504 responses, multiplying the visible delay.

### New behavior

- Edit opens only from the already-synchronized exact-account CRM snapshot.
- No `/api/ads/:id?refresh=1` request is started by the Edit button.
- `/api/ads/:id` never waits for live Binance detail, payment-method, or catalog SAPI calls.
- Payment options are cache-only for normal reads.
- If the payment cache is empty and the operator explicitly requests methods, a bounded fast refresh is used: configured `clientType`, no clientType fan-out, maximum 6 seconds per endpoint attempt.
- HTTP 504 HTML is not automatically retried; a gateway timeout is already a long upstream wait and retrying it can turn one timeout into several minutes.
- BUY continues to use the selected credential's Binance valid payment-method catalog.
- SELL continues to use the selected credential's Profile -> P2P Payment Method list keyed by Binance `payId`.
- Reference Price remains display-only.
- Advertisement Save/Update remains optimistic-direct-first; live detail is fetched only for the existing Binance amount-rejection recovery branch.

### Safety / regression protection

- Database schema remains 37; no migration is required.
- The v1.6.4 proven Binance order-ingestion engine remains byte-hash protected.
- Dedicated `ads-editor-gateway-v174-self-test` verifies that Edit and `/api/ads/:id` cannot reintroduce external SAPI waits or automatic 504 retries.
- `npm run build` and the complete `npm test` suite pass on the source tree.
