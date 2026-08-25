# P2PFlow v1.6.8 Release Notes

## Binance order ingestion reliability recovery

- Version advanced from `1.6.7` to `1.6.8`.
- Database schema stays at `39`; no data-structure migration is required.
- The v1.6.5-v1.6.7 regression that could stop new Binance orders before they reached CRM storage has been removed.

## Root cause fixed

v1.6.4 used the Binance adapter's normal 20-second request timeout for `listOrders`. The speed optimization introduced later forced the fast discovery path to 4.5 seconds and normal reconciliation to 7 seconds. On production connections where Binance C2C SAPI legitimately responded after those limits, the request was aborted, so there was no local order for Admin/Manager/Live Order users to display.

v1.6.8 restores a 20-second reliable transport allowance for order-list and order-detail reconciliation. The fast discovery timer remains frequent, but a slow API account no longer shortens the transport deadline.

## Multi-account polling isolation

- Fast order discovery now tracks in-flight state per Binance API credential.
- A slow API A request does not block API B/C from starting their next discovery cycle.
- Every active credential with API key + secret continues to be polled regardless of any CRM user's Orders/Notifications/Advertisement switches.
- Personal account switches never participate in Binance ingestion.

## Orders switch behavior

The established v1.6.4 permission/assignment behavior remains authoritative, with the new feature acting only as a per-user account overlay:

- API A Orders OFF: only that CRM user does not receive/view API A orders or assignment for API A.
- API A Orders ON: the user's old permission/assignment rules become active again.
- Admin/Manager/non-assignment-scoped user with exact account Orders View sees permitted API A orders.
- Live Order (`binance.sync`) user sees permitted unassigned live API A orders when API A Orders is ON.
- Assignment-scoped user sees assigned orders; future assignments use the existing routing/auto-assignment logic.
- API B remains independent from API A.
- Notifications OFF never disables order ingestion or order visibility.

## Immediate recovery after Orders ON

Saving an account with Orders ON now schedules a non-blocking exact-account Binance reconciliation using the system sync identity. This is only a recovery trigger; it does not grant permissions and does not modify global credential settings. If the earlier short-timeout regression caused an order to be missed locally, the account is queried immediately and any discovered order/status changes are broadcast to open clients.

## Validation

- Added `order-ingestion-reliability-v168-self-test.js`.
- The test guards the 20-second order transport, per-credential fast polling, absence of user-feature controls in ingestion, immediate Orders-ON reconciliation, and preservation of assigned-or-Live-Order visibility.
- Existing account-control, permission, routing, realtime, database, update and accounting regression suites remain part of `npm run build` / `npm test`.
