# P2PFlow v1.6.7 Release Notes

## Orders account-control compatibility fix

- Version advanced from `1.6.6` to `1.6.7`.
- Database schema stays at additive schema `39`; this release changes runtime/UI behavior only.
- The Chat-page **Orders** switch remains a per-CRM-user + per-Binance-account deny/allow preference. It does not replace or rewrite the established permissions, assignment rules, routing, or Binance background sync.

## Exact behavior

- API A **Orders OFF** hides API A orders only from the current CRM user.
- API B remains independent. If API B is ON and the user has the old required permissions, API B orders continue to work normally.
- Turning API A **Orders ON** immediately restores every existing API A order that the old permission/assignment model says the current user may see.
- Admin/Manager/non-assignment-scoped operators with effective account Orders View regain the account immediately.
- Assignment-scoped users regain already assigned API A orders. Unassigned orders remain hidden unless the user has Live Order access; future orders continue through the existing auto-assignment routing logic.
- A user with effective API A **Live Order (`binance.sync`)** regains API A live-order visibility and API-A-specific auto-assignment eligibility when Orders is ON, without changing API B behavior.
- **Notifications** remains independent: Orders ON + Notifications OFF still shows/handles orders but mutes that CRM user's notifications for that account.
- **Advertisement** remains independent and does not affect Orders synchronization.

## Stale Orders page recovery

- Fixed a persistent-route cache issue where an Orders page detached while an account was OFF could later be restored as a stale empty page after the account was turned ON.
- Orders ON/OFF now invalidates the current user's Orders data cache and detached Orders route. The next Orders navigation loads fresh permission-scoped data.
- The same invalidation occurs immediately in the Chat settings tab and through the user-specific realtime event, covering multiple open browser tabs.
- Explicitly saving Orders ON also triggers a reconciliation even when the server already had ON, so a stale browser state can recover without toggling OFF/ON twice.
- Orders account filter options now omit accounts that are OFF for the current user. A saved filter that points to an unavailable account is reset to **All API Accounts**, preventing an apparently empty Orders page caused by a stale browser filter.

## Assignment compatibility

- Live Order bypass of Work Status is now evaluated for the exact Binance account of the incoming order.
- Auto-assignment checks the current CRM user's Orders preference only for the target order's account; another account's switch cannot block or enable the route.
- Manual assignment and auto-assignment continue to use the existing eligibility/routing system rather than a new replacement system.

## Validation

- Expanded runtime `--per-user-account-controls-self-test` to cover manager-style visibility, Live Order OFF->ON recovery, assigned-user OFF->ON recovery, manual assignment visibility, and account-specific auto-assignment eligibility.
- Added `order-feature-overlay-v167-self-test.js` to guard the deny-only overlay, stale-route invalidation, stale account-filter reconciliation, and existing assignment semantics.
- Existing Live Order / Work Status / assignment regression tests were updated to verify the account-specific effective-access helper instead of the pre-v1.6.6 implementation text.
- `npm run build` and the complete `npm test` suite are required to pass before release packaging.
