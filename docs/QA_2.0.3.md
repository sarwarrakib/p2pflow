# P2PFlow 2.0.3 QA Record

এই checkpoint-এর QA source-level/local deterministic environment-এ করা হয়েছে। External production DB servers, real billing provider, public Web Push endpoint এবং live Binance financial mutation এই sandbox-এ চালানো হয়নি।

## Passed locally

- `go test ./...` ✅
- `go vet ./...` ✅
- `scripts/qa.sh` ✅
  - every browser JavaScript file parses with Node
  - PostgreSQL/MySQL/MariaDB migration filename families match
- default local builds of `cmd/p2pflow`, `cmd/p2pflow-worker`, `cmd/p2pflow-migrate` ✅
- entitlement permission mapping/coercion tests ✅
- checkout HMAC determinism test ✅
- production checkout HTTPS requirement test ✅
- existing Binance/release/security/migration parser unit tests ✅

## Build environment limitation

`go mod download` / `-tags dbdrivers` production build could not download `github.com/go-sql-driver/mysql` because this sandbox blocks DNS/network access to `proxy.golang.org`. This is not a source compile failure in the default build; a normal deployment machine with internet/module cache must run:

```bash
go mod download
./scripts/build.sh
```

## Production QA still required

- PostgreSQL 15+ migration + transaction/concurrency suite
- MySQL 8+ migration + transaction/concurrency suite
- MariaDB 10.11+ migration + transaction/concurrency suite
- selected payment gateway hosted-checkout + signed webhook mapping
- duplicate/out-of-order provider webhook replay test
- public HTTPS browser push sender/delivery test after sender is implemented
- authorized Binance non-destructive sync and controlled final-action validation
- extension end-to-end browser run
- multi-instance NATS worker/fan-out failover
- representative tenant/account/order/chat load test
- backup/restore and disaster recovery drill
