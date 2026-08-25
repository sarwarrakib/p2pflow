# P2PFlow v1.7.0 Release Notes

## Release model

v1.7.0 is the cumulative cleanup and performance release built on the safe v1.6.9 line while byte-protecting the known-good v1.6.4 Binance order engine. The three protected order functions are verified by SHA-256 in the build/test suite and are not modified by the new account controls or performance work.

## Restored post-v1.6.4 features

- Payment Split OFF now uses the direct Mark as Paid path without opening the split popup.
- Payment-value copy uses delegated click handling plus Clipboard and textarea fallback, so realtime DOM updates do not break copy actions.
- Orders list uses compact payloads, targeted list-view fetch for genuinely new orders, and realtime local row patching instead of repeatedly downloading the full list.
- Detached route hosts are shown immediately and revalidated in the background for faster navigation.
- Ads Edit opens from exact-account cached data immediately, then refreshes verified Binance data in the already-open editor.
- SELL Ads payment methods are restricted to the selected Binance credential; cross-account/global fallback is removed.
- Fixed-price UI does not invent percentage ranges. Explicit Binance bounds are used when provided; exact X~Y bounds are parsed from Binance mutation rejection when available.
- Mobile Ads action sheets account for dynamic viewport, safe-area insets, and the fixed bottom navigation.
- Chat All Accounts plus per-user Orders, Notifications, and Advertisement switches remain user-only overlays and never gate global Binance ingestion.

## Performance and 504 hardening

- MySQL/PostgreSQL state compression is asynchronous, moving expensive Brotli work off the main Node.js event loop.
- Payment-account balance recalculation is a one-pass ledger aggregation instead of scanning every ledger for every account.
- Repeated unchanged advertisement persistence and repeated identical merchant-status errors are checkpointed instead of forcing database writes every poll.
- Versioned JS/CSS assets use immutable browser caching; unversioned HTML/runtime assets remain no-store.
- Local classic scripts use defer so the browser can fetch assets in parallel while preserving execution order.
- Heavy order-detail/chat/proof/audit fields are removed from the Orders list payload and remain available on detail routes.

## Order reliability guard

The build fails if any of these known-good v1.6.4 core functions change unexpectedly:

- syncBinanceOrdersWithCredential
- runBinanceFastOrderDiscovery
- runBinanceAutoOrderSync

Existing Live Order permission, Admin/Manager/Agent account permissions, assignment, and auto-assignment logic remain in the protected order engine. Account-level Orders OFF is a final per-user visibility/assignment deny overlay only.

## Hygiene and packaging

- Obsolete Orders PNG filter asset remains removed; Orders uses the P2P Market SVG filter icon.
- Temporary, backup, editor-junk, stale map/log files, sensitive runtime files, node_modules, runtime state, shared data, and old top-level release artifacts are excluded from the unified package.
- Local asset references and versioned frontend references are validated in self-tests.

## Verification

- JavaScript syntax suite passes.
- npm run build passes.
- Complete npm test passes.
- Dedicated full-optimization-v170-self-test passes.
- Final unified ZIP is extracted to a clean directory and tested again before delivery.

No live production test with the user's real Binance credentials, reverse proxy, database workload, or WebSocket traffic is performed in this environment. Production acceptance should therefore include live order ingestion/status timing, Ads edit/payment-method verification, Chat controls, notification delivery, and a 504 soak test.

Database schema target remains 37. A database previously upgraded by an additive later schema is not downgraded automatically.
