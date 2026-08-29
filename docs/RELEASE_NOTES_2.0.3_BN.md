# P2PFlow 2.0.3 Release Notes

## Release scope

2.0.3 হলো SaaS, plan entitlement, Super Admin এবং billing lifecycle checkpoint। একই archive-এ 2.0.2-এর প্রয়োজনীয় protected payment/accounting/approval schema/runtime core-ও reconstruct করা হয়েছে যাতে 2.0.3 source self-contained থাকে।

## SaaS lifecycle

- setup fee এবং monthly price আলাদা billing stage।
- setup paid হওয়ার আগে workspace `pending_setup`; setup paid হলে monthly invoice তৈরি হয়।
- monthly/renewal invoice paid হলে active period, billing anchor এবং next-invoice schedule update হয়।
- overdue invoice grace period চালু করে; grace expiry-তে subscription/workspace suspend হয়।
- paid reconciliation access restore করে।
- end-of-period cancellation ও resume flow যোগ হয়েছে।

## Billing safety

- production webhook-এর জন্য HMAC secret required।
- provider event ID idempotency যোগ হয়েছে।
- payment ID duplicate protection আছে।
- wrong amount, wrong currency বা non-payable invoice automatic activation করে না।
- mismatch/unmatched event reconciliation queue-তে যায়।
- generic hosted checkout URL production-এ HTTPS required।
- checkout session 30 মিনিট পর expire হতে পারে এবং একই invoice/provider request idempotently reuse হয়।

## Entitlements / usage limits

- tenant access plan entitlement অনুযায়ী server-side gate হয়।
- mapped features: Orders, Ads, Chat, P2P Profile, API Credentials, Payment Accounts, Routing, Notifications, Reports, Accounting, Approvals, Extension, Market, System Update।
- tenant-specific Super Admin overrides যোগ হয়েছে।
- plan downgrade active user/API-account count-এর নিচে নামলে reject হয়।
- `maxUsers=0` / `maxExchangeAccounts=0` unlimited হিসেবে supported।

## Super Admin

- platform summary expanded: active/suspended workspaces, past-due subscriptions, overdue invoices, MRR/ARR, reconciliation, total collected revenue।
- tenant detail endpoint + effective entitlements + invoice/payment history।
- tenant status/plan update without accidentally re-enabling intentionally disabled members।
- entitlement override add/remove।
- manual/custom invoice creation।
- reconciliation list/resolve এবং webhook event history।
- plan create/edit UI including entitlements JSON।

## Customer billing UI

- current plan/usage/entitlements।
- subscription period, setup-paid, next invoice, past-due/grace timestamps।
- pending/past-due/suspended/cancellation warnings।
- configured default checkout provider ব্যবহার।
- hosted checkout URL থাকলে redirect; manual provider হলে instructions।
- cancel-at-period-end / resume controls।

## Financial hardening carried in this archive

- row-locked payment account runtime balance ও limits।
- account deletion nonzero-balance/pending-split guard; bulk delete-ও guard bypass করতে পারে না।
- immutable accounting reversal + closed-day protection/reopen।
- Manager Approval final-action state machine।
- normalized notification preference/read-state persistence।

## Database

PostgreSQL, MySQL এবং MariaDB-তে ordered `012_financial_security_notifications.sql` এবং `013_saas_billing_entitlements.sql` আছে। Latest migration `update_state.current_version = 2.0.3` করে।

## Known remaining work

এটি এখনও final public launch release নয়। Extension full E2E, System Update production parity, P2P Market browser parity, external Web Push sender, actual chosen payment-provider adapter, three real DB-server integration matrix, browser E2E, load/failover এবং backup/restore drill বাকি।
