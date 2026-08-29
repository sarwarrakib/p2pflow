# P2PFlow 2.0.5 QA Record

## এই build environment-এ passed

- `gofmt -w ./cmd ./internal` ✅
- `go test ./...` ✅
- `go vet ./...` ✅
- `./scripts/qa.sh` ✅
  - every Web/Extension JS parse
  - every `scripts/*.mjs` parse
  - frontend/backend API route contract audit
  - strict Binance account permission contract audit
  - Accounting/migration contract audit
  - PostgreSQL/MySQL/MariaDB migration filename parity
- `./scripts/production-preflight.sh` ✅ (source/build path; `.env` absent থাকায় external runtime config check intentionally skipped)
- normalized BUY/SELL accounting fact unit tests ✅
- normalized replacement model unit test ✅
- Binance signing/release/security tests from previous checkpoints retained ✅
- Web Push/VAPID and signed System Update tests retained ✅

## 2.0.5 source-level regression checks

- account-scoped permission list: Orders / Sync & Chat / Ads / P2P Profile canonical matrix
- account grant is tenant-bound and global-permission bounded
- Orders sync requires `binance.sync`
- P2P profile sync requires `p2p.profile.sync`
- legacy no-grant-all-accounts fallback absent
- migration 015 exists in all three SQL families
- Accounting UI no longer calls projected Binance order ledger “Actual Binance Asset”
- Agent accounting response has explicit company-balance/close-history hiding path
- accounting entry totals are not limited to the current result page

## Production DB driver build note

Main DB binaries are built with `dbdrivers` tag. If Go module dependencies are not already cached, deployment machine needs internet/module proxy access once:

```bash
go mod download
./scripts/build.sh
```

The sandbox may not resolve `proxy.golang.org`; a network failure there is not counted as a source compilation success or failure for the real DB drivers.

## Live/external QA still required before public launch

- PostgreSQL 15+ full migration 001..015 + concurrency/rollback test
- MySQL 8+ full migration 001..015 + concurrency/rollback test
- MariaDB 10.11+ full migration 001..015 + concurrency/rollback test
- authorized non-destructive Binance sync on each account scope
- controlled Mark Paid / Release validation only with an account authorized for that test
- Chrome extension v6.1.9 with logged-in Binance advertiser page
- public HTTPS PushManager subscribe -> provider delivery -> click -> unsubscribe
- SMTP delivery/retry
- selected payment gateway checkout/signature/webhook replay/out-of-order event test
- Owner/Admin/Manager/Agent account-scope browser E2E matrix
- multi-instance API/worker/NATS failover
- representative load test using authenticated business routes plus `scripts/http-smoke-load.mjs`
- backup/restore/PITR drill
- accounting reconciliation against known historical business data, especially old carryover-close history

Financially destructive live actions were not executed from this sandbox.
