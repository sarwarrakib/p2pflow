# P2PFlow v1.6.5 Release Notes

## Realtime speed and 504 hardening

- Version advanced from `1.6.4` to `1.6.5` and database schema advanced from `37` to additive schema `38` for per-Binance-account feature controls.
- MySQL/PostgreSQL whole-state Brotli compression now runs asynchronously instead of synchronously on the Node.js HTTP event loop. Legacy state/history/backup payload compaction also uses the async encoder. This removes a major event-loop stall path that could delay API/SSE responses and contribute to intermittent proxy `504` responses until a server restart.
- Repeated background persistence was reduced. Order, Ads and merchant-status loops persist immediately for material changes/error changes, with a five-minute durability checkpoint instead of writing the entire encrypted state on unchanged polling cycles.
- Fast Binance order discovery now defaults to approximately 2 seconds, runs enabled API accounts in parallel and uses a bounded 4.5-second list timeout. Detailed reconciliation fetches order details only for changed/open orders and keeps a small REST chat fallback because WebSocket remains the realtime chat path.
- Orders list API now returns a compact list view and excludes large raw Binance payload/history/chat/proof structures. Realtime order SSE changes patch the current cached list locally; only a newly discovered order hydrates one compact `/list-view` row.
- Returning to an already mounted page is instant from the retained route DOM; data revalidation happens in the background instead of blocking page navigation.

## Orders

- When **Payment Split is OFF**, `Mark as Paid` goes directly to the paid action and does not open the Payment Split popup.
- Payment/account copy buttons use delegated click handling plus Clipboard API fallback, so buttons continue working after realtime DOM morphs without requiring a reload.
- New/status-changed orders are broadcast before the queued database checkpoint so the UI is not held behind state compression/persistence.

## Advertisements

- Edit Advertisement opens immediately using the already-synchronized exact-account snapshot. Live Binance ad detail and payment-method refresh continues in the background and merges into the open editor.
- SELL ads now use only the exact advertisement credential's saved Binance P2P payment methods. There is no global/other-account fallback; the methods already selected on the advertisement are reconciled against that exact account.
- Account payment-method refresh has bounded timeouts and registers newly observed method types in the local method catalog while keeping account-specific payId/account details inside the credential-scoped owner profile.
- Fixed-price limits no longer use an undocumented percentage formula. If Binance returns explicit min/max bounds they are used. If the reference endpoint returns only `referencePrice`, the UI shows that live reference and lets Binance authoritatively validate the submitted fixed price; an exact `Fixed price must fall within the limited range of: X~Y` rejection is parsed and returned to the editor.
- The public P2P marketplace search was removed from the critical reference-price request path so opening/editing an advertisement does not wait on a second unrelated request.
- On responsive/mobile devices Ads bottom sheets hide the fixed bottom nav while open and respect `100dvh`/safe-area bounds, keeping bottom actions such as Delete visible.

## Chat multi-account controls

- Chat header now includes an **All Accounts** selector and every connected/permitted Binance API account.
- Selecting an account filters the already-loaded inbox locally, so the selector itself does not wait for another API request.
- Accounts configurable by the user show a settings icon with three independent toggles:
  - **Orders** — controls whether that API account participates in Binance order receive/sync loops.
  - **Notifications** — controls whether events for that account may produce configured in-app/email/push notifications.
  - **Advertisement** — controls whether the account participates in Ads view/manage/create/update/delete/sync paths, still subject to the user's normal Ads permissions.
- The existing Chat notification master switch remains the highest-level mute: when master notification is OFF, no account notification is delivered even if an account's Notifications toggle is ON.

## Validation

- Added `performance-realtime-account-controls-v165-self-test.js` covering async persistence, compact Orders payloads, realtime row delta, cached-route navigation, direct Mark Paid, delegated copy, exact-account Ads payment scope, Binance-only price bounds, mobile Ads sheets and Chat account controls.
- `npm run build` and the complete `npm test` suite must pass before packaging/publishing.
