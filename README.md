# P2PFlow 2.0.8

P2PFlow 2.x হলো existing P2PFlow platform-এর scalable multi-tenant SaaS rewrite। **2.0.8** current checkpoint 2.0.7-এর timezone/domain hardening-এর উপর functional browser first-install, GitHub Release build, prebuilt Linux amd64 deployment এবং separate API/Worker runtime hardening যোগ করে।

## 2.0.8 installer and GitHub deployment hardening

- Native Ubuntu 24.04 amd64 one-command installer for the target VPS.
- API and background worker run as separate systemd services on the same VPS.
- Local PostgreSQL and loopback-only NATS are prepared automatically.
- Setup mode blocks the normal application until the browser wizard is completed.
- The browser wizard uses a one-time setup code, tests the prepared database, creates the first Owner/Super Admin, saves the production runtime environment, locks setup, and restarts the API.
- GitHub Actions builds the Linux amd64 binaries and publishes a checksum-protected Release asset when a v2.0.8 tag is pushed.
- The server can install the prebuilt GitHub Release without installing Go.
- Migration 018 records the 2.0.8 release checkpoint for PostgreSQL, MySQL and MariaDB.

For the new installation path, start with `docs/GITHUB_VPS_INSTALL_2.0.8.md`.

## Core stack

- Go 1.23 modular backend
- PostgreSQL 15+ / MySQL 8+ / MariaDB 10.11+ selectable with `DB_DRIVER`
- normalized tenant-scoped relational storage; giant full-state blob rewrite নেই
- Binance signed REST scheduler + persistent C2C chat WebSocket
- SSE + optional NATS multi-instance realtime fan-out
- row-locked Payment Accounts + protected accounting/reversal/approval core
- public workspace signup + RBAC + deny-by-default exchange-account scoped permissions
- setup fee + monthly subscription + plan entitlement + Super Admin control plane
- tenant-scoped Chrome Extension bridge v6.1.9
- P2P Market documented C2C SAPI search path + legacy UI contract
- durable notification delivery queue + RFC8291/RFC8188 Web Push + VAPID ES256
- signed ZIP staging + Ed25519 verification + atomic release-pointer updater/rollback
- production preflight + API/permission/accounting/browser-role/domain static contract audits

## 2.0.7 highlights

- `accountingTimezoneOffsetMinutes` এখন daily/monthly/yearly/custom normalized order-report range-এ UTC boundary shift করে
- Binance completed order daily grouping configured business timezone অনুযায়ী হয়
- carryover BUY settlement business date configured timezone অনুযায়ী persist হয়; UTC date দিয়ে আর force করা হয় না
- frontend `range.businessDate` server-side configured timezone থেকে পায়, ফলে browser local timezone fallback-এর উপর নির্ভরতা কমে
- Business Entry/close default date configured accounting timezone থেকে আসে
- closed-day summary-তে timezone offset + exact UTC range snapshot রাখা হয়
- UTC+06, UTC-05 এবং custom inclusive-date boundary regression tests যোগ হয়েছে
- migration `017_accounting_timezone_domain_hardening.sql` তিন SQL family-তে release checkpoint `2.0.7` sync করে
- `deploy/nginx/p2pflow-split-domains.conf.example` দিয়ে `app.`, optional `admin.`, `api.` topology documented
- browser app same-origin `/api` proxy ব্যবহার করে; `api.` host Android/native/integration-এর জন্য API-only রাখা যায়

2.0.6-এর normalized FIFO/day-lock/carryover model retained আছে; 2.0.7 তার timestamp-to-business-date boundary parity complete করে।

## Start here

- Setup: `docs/SETUP_BN.md`
- Website/API/domain map: `docs/DOMAIN_DEPLOYMENT_BN.md`
- Architecture: `docs/ARCHITECTURE_BN.md`
- Feature status: `docs/FEATURE_PARITY_STATUS.md`
- 2.0.8 GitHub/VPS install: `docs/GITHUB_VPS_INSTALL_2.0.8.md`
- 2.0.8 release notes: `docs/RELEASE_NOTES_2.0.8.md`
- 2.0.8 QA record: `docs/QA_2.0.8.md`
- 2.0.7 release notes: `docs/RELEASE_NOTES_2.0.7_BN.md`
- Production launch checklist: `docs/PRODUCTION_LAUNCH_CHECKLIST_BN.md`
- Chrome extension: `extension/README.md`

Old 1.7.7 source `legacy/`-তে শুধুমাত্র feature/design/parity reference হিসেবে রাখা হয়েছে। Live three-DB, real Binance, selected payment gateway, public Push Service, multi-instance failover এবং production browser sessions দিয়ে external validation আলাদাভাবে করতে হবে; source QA pass-কে সেই live verification বলা হবে না।
