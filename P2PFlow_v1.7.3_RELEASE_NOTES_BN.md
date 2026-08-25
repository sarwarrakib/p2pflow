# P2PFlow v1.7.3 Release Notes

## Ads direct-update, display-only Reference Price, and performance hotfix

v1.7.3 removes the remaining Ads read-before-write regression that could stop an edit with `The latest Binance advertisement amount could not be read, so no update was sent. Please try again.` It also makes Fixed-price Reference Price strictly display-only and reduces several application/update latency paths without touching the byte-protected v1.6.4 Binance order engine.

### Advertisement Update now sends first, reads only on a real amount conflict

- Existing live Ads no longer call Binance `getDetailByNo` before the first Update request.
- The update payload is built from P2PFlow's already-synced exact-account advertisement snapshot and sent directly to Binance.
- Reference Price is not queried anywhere in the Save/Post/Publish mutation path.
- Payment-method resolution for Save uses the exact credential's already-synced selection model and does not force a network refresh first.
- Only when Binance itself rejects the requested amount with an amount/state validation error does P2PFlow fetch fresh advertisement detail once and retry if the Binance amount changed while the editor was open.
- Privilege-lag and strict-payload compatibility retries reuse the same prepared payload instead of adding another advertisement-detail read.
- No local advertisement change is saved when Binance rejects the actual mutation.

### Fixed Reference Price is display-only

- Fixed-price UI shows one `Reference Price` value only.
- Highest Order Price / Lowest Ad Price / local max/min guide lines are removed from the fixed-price editor.
- The public Reference Price response returns only identity, pair/side, `referencePrice`, `priceScale`, freshness/cache metadata and `displayOnly:true`.
- It does not expose `minPrice`, `maxPrice`, `allowedRangeText`, local validation messages or a market high/low value to the Fixed-price editor.
- Reference lookup continues in the background and may display a recent last-known quote, but failure never blocks Next, Preview, Save, Post or Publish.
- No guessed percentage range is generated.
- Binance's actual Post/Update response is the authority. If Binance rejects the submitted price, its real error is returned; exact range text can still be parsed from that rejection for diagnostics.

### BUY and SELL payment methods

- BUY remains isolated to the selected credential's Binance valid/generic payment-method catalog and sends generic identifier/payType rows with `payId:0`.
- SELL remains isolated to the exact advertisement-owning API credential's Profile → P2P Payment Method list.
- SELL selection/submission uses the real Binance `payId`, preserving multiple saved methods of the same type without cross-account fallback.
- Payment picker search remains live on input and browser search-clear events and searches the method/account/bank/payee/currency text available for that row.

### Page-load and payload latency reductions

- Initial authenticated boot uses the combined `/api/bootstrap` response instead of performing `/api/me` and then `/api/bootstrap` sequentially.
- Large JSON API responses use asynchronous gzip level 1 when the client accepts gzip and the payload is at least 8 KiB.
- Users page now requests Users and Payment Accounts in parallel.
- Ledger page now requests ledger data and Payment Accounts in parallel.
- Existing detached-route stale-while-revalidate navigation, compact Orders payload, realtime order delta patching, async database compression, one-pass balance aggregation and immutable versioned frontend caching remain enabled.

### Faster signed version staging

- A newly downloaded signed release still verifies package size/hash, safe tar entries, required files, manifest compatibility and the complete signed release-tree digest.
- Production staging no longer spawns the package's runtime syntax/self-test processes again after the signed release has already passed CI/release packaging.
- Reused staged releases and pre-activation validation use the same integrity-first/no-runtime-spawn path.
- Database flush, pre-switch backup, signed manifest verification, rollback metadata and supervisor-controlled activation remain intact.

### Regression protection

- Added `ads-direct-update-performance-v173-self-test.js` to both build and full test suites.
- The test fails if the old latest-amount blocker returns, if `getDetailByNo` moves back before the first update attempt, if Reference Price participates in mutation validation, if Fixed Reference response leaks min/max/range fields, or if production staging starts spawning runtime tests again.
- Existing protected hashes still require the three v1.6.4 Binance order ingestion/reconciliation functions to remain byte-identical.
- Database schema target remains 37; no migration is required.

### Verification

- JavaScript syntax suite: PASS (105 JavaScript files).
- `npm run build`: PASS.
- Complete `npm test`: PASS.
- v1.6.4 protected order-engine hashes: PASS.
- Ads direct-update/display-only reference regression test: PASS.
- System Update transport, security, RBAC, payment/accounting, database crypto, update manager and supervisor tests: PASS.
- Final unified ZIP is re-extracted into a clean directory and verified again before delivery.
