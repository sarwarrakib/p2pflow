# P2PFlow v1.5.13 Release Notes

## Mobile Order List redesign

This release redesigns only the mobile Order List presentation using the supplied Order History reference as the visual direction. No image or mockup was generated.

### What changed

- Replaced the large rounded mobile order cards with a flat, compact order-history list.
- Added a stronger visual hierarchy: Buy/Sell + asset on the left, status on the right, then aligned label/value rows.
- Kept Primary Amount visually prominent while Price, Quantity, Actual, Remaining and Order number stay compact.
- Moved source, payment method and lead into a small context line instead of a large repeated pill area.
- Counterparty, Chat button/unread count and order time/countdown now share a compact footer.
- Ongoing/Fulfilled tabs use the reference-style underline treatment.
- Inner order tabs use lightweight text controls with a soft active state instead of heavy dark pills.
- Removed mobile-only shadows, large borders and excessive card spacing.

### Preserved exactly

- Existing order data and API payloads.
- Order status logic and live updates.
- Source, type, payment method, amount, rate, quantity, actual, remaining, order number, lead, counterparty and time/countdown.
- Open-order click behavior.
- Chat button and unread counter.
- Ongoing/Fulfilled and status-tab filtering.
- Create, Sync, Refresh and existing Order page menu actions.
- Desktop Order List layout.
- Database/state, Binance sync and all business logic.

Version: 1.5.13
