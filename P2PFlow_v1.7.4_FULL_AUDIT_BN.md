# P2PFlow v1.7.4 Full Audit and Optimization Report

## Scope

v1.7.4 keeps the complete v1.7.0 optimization scope and the v1.7.1 System Update transport hotfix, then hardens the Ads fixed-price and payment-method workflow. Binance reference-price availability is display guidance rather than a mutation blocker; BUY uses Binance valid payment methods, while SELL uses the exact credential's Profile → P2P Payment Method rows selected by Binance payId. The payment picker search is explicitly live-filtered.

The audit covered application boot/static delivery, frontend shell/routing, Orders, order detail, realtime SSE updates, Binance order ingestion boundaries, Ads, Chat, notifications, payment accounts, accounting balance recalculation, database persistence/crypto, mobile overlays, build/release packaging, and repository hygiene.

## 1. Binance order core

Status: protected, not refactored.

The v1.6.4 order ingestion, fast discovery scheduler, and normal reconciliation functions are byte-locked by SHA-256 assertions. Per-user account controls are absent from those functions. This avoids repeating the regression introduced after v1.6.4.

## 2. Orders frontend and API payload

Finding: list responses previously carried data only needed on detail pages, and realtime changes could cause broad list reloads.

Resolution: compact list views remove raw Binance detail/result/message payloads, chat/media/proofs, approvals, audits, assignments, and other detail-only fields. Realtime changes patch existing rows locally; a newly discovered order fetches only its compact list-view item. Progressive list batching remains in place for large fulfilled histories.

## 3. Navigation and rendering

Finding: network-gated revisits make an already-rendered SPA feel slower than necessary.

Resolution: persistent detached route hosts are displayed immediately and revalidated in the background. Existing scroll/lifecycle protection remains. This avoids blank/loading waits on common back-and-forth navigation.

## 4. Database persistence and 504 risk

Finding: synchronous Brotli compression of large encrypted application state can block the Node.js event loop. Repeated unchanged background persistence can also amplify database pressure.

Resolution: MySQL/PostgreSQL state encoding uses asynchronous Brotli compression for normal saves and legacy compaction. Repeated unchanged Ads/merchant-status writes are checkpointed. This removes identified application-side event-loop and write-amplification pressure, although infrastructure-level 504 causes still require production proxy/DB metrics.

## 5. Payment-account balance calculation

Finding: account balances were recalculated with repeated full-ledger filtering per account.

Resolution: ledger entries are aggregated once into a map and then applied to accounts, reducing the hot path to roughly O(accounts + ledgers).

## 6. Payment action and copy reliability

Finding: Mark as Paid could still open the split popup while Payment Split was disabled; copy handlers could be lost after realtime DOM replacement.

Resolution: split-disabled paid action goes directly to the paid mutation path. Copy is handled by delegated document events with Clipboard API and fallback copy support.

## 7. Ads Edit and payment methods

Finding: editor entry could block on multiple Binance calls; SELL payment methods risked cross-account fallback.

Resolution: editor opens from exact-account cached data and refreshes live data in the open editor. SELL payment methods are scoped to the exact credential. Expensive enrichment is used only where required for a mutation, not for initial editor display.

## 8. Ads fixed-price bounds

Finding: locally guessed percentage bounds could disagree with Binance.

Resolution: no synthetic percentage range is shown and Fixed Reference Price is not a local validation source. The editor displays one Binance reference value only; no min/max/market-high-low fields are exposed to the Fixed-price UI. The Binance mutation endpoint is authoritative, and exact X~Y text is only captured from an actual Binance rejection when present.

## 9. Chat account controls

Status: preserved from the safe v1.6.9 overlay design.

Orders, Notifications, and Advertisement switches are stored per CRM user and per Binance credential. They never deactivate a global Binance credential or stop order ingestion. The Chat inbox uses its own accessible-account scope rather than the Orders visibility switch.

## 10. Mobile overlays

Finding: bottom action sheets could be covered by the fixed mobile navigation.

Resolution: Ads sheets hide the fixed bottom navigation while open and use 100dvh plus safe-area-aware spacing and bounded overflow.

## 11. Static delivery and startup

Finding: large stable frontend assets were forced through no-store on every visit and classic scripts were parser blocking.

Resolution: exact-version JS/CSS URLs receive one-year immutable cache headers while unversioned HTML/runtime assets remain no-store. Local classic scripts use defer, preserving order while allowing parallel download.

## 12. Repository/package hygiene

Checks found no obsolete order-filter.png, .bak, .tmp, .orig, editor backup, map/log junk, .DS_Store, or Thumbs.db in the release source. The packager excludes .git, node_modules, runtime state, data/shared directories, environment files, build output, and old release clutter. Intentionally duplicated deployment helper files are retained because packaging/deployment tests rely on them.

## 13. Deliberate non-refactors

app-server.js, app.js, and style.css remain large. A broad module split or CSS deduplication was deliberately not performed in this release because it would create a high regression surface without being required for the measured hot-path improvements. The release instead removes blocking work, payload weight, unnecessary writes, and repeated rendering while protecting current behavior.

## 14. Automated acceptance

The release is guarded by the existing security/RBAC/payment/accounting/update/database/supervisor tests plus full-optimization-v170-self-test. The optimization test also validates static references, package hygiene, exact order-core hashes, user-only account controls, compact Orders, Ads behavior, direct paid action, delegated copy, async persistence, and mobile safe-area handling.

## Ads reference-price and payment-method audit history

Finding: a missing/slow Binance reference-price response could block Post/Edit with `The current Binance fixed-price range could not be loaded. No advertisement action was sent.` even though the actual Binance advertisement mutation endpoint is the authoritative validator.

Resolution: the editor refreshes Reference Price independently in the background. The reference call can retry without a payment-type filter and may display a recent last-good quote as stale guidance. Create/update/publish never waits on the reference endpoint. No cached reference bounds reject a mutation; the real Binance mutation response is the only authority and exact X~Y parsing is retained only for a real rejection. No synthetic percentage range is generated.

Finding: SELL payment selection needed to mirror Profile → P2P Payment Method for the exact API account, including multiple saved methods of the same type.

Resolution: SELL options are projected from the exact credential profile and keyed/submitted by Binance `payId`. There is no cross-account/global fallback. BUY remains a separate generic Binance-valid payment-method catalog and sends generic identifier/payType keys with `payId: 0`.

Finding: payment-method search could be visually defeated by CSS/DOM behavior.

Resolution: the picker filters on `input` and `search`, toggles both the native `hidden` attribute and an explicit `is-search-hidden` class, and displays a no-match state. Search text includes method name, identifier/payType, account, bank, payee, and currency for SELL.

## Production acceptance still required

Automated tests cannot reproduce the user's real Binance C2C latency, credential mix, reverse proxy timeouts, production DB size, browser/PWA cache, or concurrent WebSocket/SSE load. After deployment, validate live new-order arrival, Binance status propagation, assignment behavior, direct paid marking, exact SELL Ads methods, Ads editor timing, per-user account toggles, notification muting, mobile sheets, and a sustained 504 soak test while observing Node CPU/event-loop delay, DB latency, and proxy upstream timing.

## v1.7.4 direct Ads update and latency audit addendum

Finding: although v1.7.2 stopped Reference Price from being a hard client prerequisite, the existing Ads PATCH route still performed a mandatory live `getDetailByNo` read before sending the update. Any Binance detail timeout therefore prevented the mutation before Binance's update endpoint was even called.

Resolution: existing advertisement updates are optimistic/direct-first. The payload uses the already-synced exact-account snapshot and is sent immediately. A live detail read is allowed only after a real Binance amount/state validation rejection, and only to determine whether the amount changed and one retry is justified. The removed `The latest Binance advertisement amount could not be read...` guard is covered by a dedicated source regression test.

Finding: Fixed-price Reference UI still carried market/high-low concepts that could imply local price constraints even though the user expects Reference Price only as an informational quote.

Resolution: Fixed Reference Price now exposes and renders a single reference value. Public reference response strips min/max/range/market-high-low fields. Reference failure never blocks the mutation. Exact Binance rejection details remain available only after Binance evaluates the real submitted advertisement.

Finding: several independent client requests and duplicate production release runtime checks added avoidable latency.

Resolution: initial session boot is one bootstrap request; Users and Ledger independent calls are parallelized; large API JSON is asynchronously gzip-compressed; newly staged signed releases verify cryptographic/package/tree integrity without re-spawning the project's runtime self-test suite on the production host. Database backup and activation safety checks are preserved.
