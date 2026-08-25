# P2PFlow v1.7.2 Release Notes

## Ads fixed-price and payment-method regression fix

v1.7.2 fixes the Ads editor regression where a missing or slow Binance reference-price response could block Post/Edit with `The current Binance fixed-price range could not be loaded. No advertisement action was sent.` It also makes BUY and SELL payment-method sources follow their intended Binance models and fixes payment-method search filtering.

### Fixed-price reference behavior

- Reference price is guidance for the editor, not a prerequisite for sending an advertisement mutation.
- The editor loads reference price in the background and refreshes it every 15 seconds instead of aggressively polling every 5 seconds.
- The backend reference lookup first tries the selected payment type and can retry without payType when Binance does not return a usable quote for that filter.
- Reference transport allowance is 15 seconds and a recent last-good quote may be returned as stale display guidance for up to five minutes.
- Post/Edit/Publish no longer waits for the reference endpoint. This removes the reference API from the mutation critical path.
- Only a fresh cached response with explicit Binance min/max bounds may reject a price locally. Stale/reference-only/missing guides do not block Save/Post.
- No percentage-derived or guessed min/max range is generated.
- The actual Binance Post/Update endpoint remains final authority. When Binance returns an exact `X~Y` limited-range error, the existing parser exposes that authoritative range to the editor.

### BUY payment methods

- BUY advertisement payment choices come from the selected credential's Binance valid payment-method catalog.
- BUY uses Binance generic payment identifiers/payTypes and sends the generic trade-method payload (`payId: 0`) expected by the existing Binance Ads integration.
- SELL-only saved-account payment rows are not mixed into the BUY picker.

### SELL payment methods

- SELL advertisement payment choices come from Profile → P2P Payment Method for the exact Binance API credential that owns the advertisement.
- Saved methods are selected and submitted by the real Binance `payId`, not by a local CRM payment-type ID.
- This preserves distinct saved methods even when several entries share the same payment type.
- No global or other-account fallback is allowed. Missing exact-account methods fail closed instead of silently switching accounts.
- The payment-options endpoint can refresh that exact credential's profile list and falls back only to the same credential's cached list if Binance is temporarily unavailable.

### Payment-method search

- Search filters live on both `input` and browser `search` events.
- Rows are hidden with both the native `hidden` attribute and an explicit CSS class, preventing styling from accidentally re-showing filtered rows.
- SELL search covers method name, identifier/payType, account, bank, payee and currency.
- A `No matching payment method` state appears when nothing matches.

### Regression protection

- Added `ads-price-payment-v172-self-test.js` and included it in both build and full test suites.
- Updated the Ads reference UI test for non-blocking Binance-authoritative price validation and exact SELL payId selection.
- The v1.6.4 byte-protected Binance order ingestion core remains unchanged.
- v1.7.1 System Update transport fix remains intact.
- Database schema target remains 37; no migration is required.

### Verification

- JavaScript syntax suite: PASS (104 JavaScript files).
- `npm run build`: PASS.
- Full test suite: PASS when executed in batches to stay within the sandbox command time limit.
- Final unified ZIP is extracted into a clean directory and build/test verification is repeated before delivery.
