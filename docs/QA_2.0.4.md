# P2PFlow 2.0.4 QA Record

## Passed in this build environment

- `gofmt -w ./cmd ./internal` ✅
- `go test ./...` ✅
- `go vet ./...` ✅
- `./scripts/qa.sh` ✅
  - every `web/**/*.js` parse check
  - every `extension/**/*.js` parse check
  - frontend/backend API static contract audit
  - PostgreSQL/MySQL/MariaDB migration filename parity
- API contract result: **127 frontend API paths / 157 backend route patterns / pass** ✅
- 14 ordered migrations in each SQL family ✅
- Extension tenant-token/collector normalization tests ✅
- Web Push VAPID key stability + RFC8291 encryption/decryption roundtrip + private endpoint rejection tests ✅
- System Update valid ZIP extraction + traversal rejection + Ed25519 verify/tamper tests ✅
- default Go compile/test path includes `p2pflow-updater` and `p2pflow-keygen` ✅
- offline release key generation/signing helper smoke test ✅

## Production DB driver build limitation in sandbox

`go test -tags dbdrivers ./...` cannot complete here because this container has no Go module proxy/DNS access and the external MySQL/PGX modules are not cached. `go mod download` fails at `proxy.golang.org` network resolution. Deployment machine must run:

```bash
go mod download
./scripts/build.sh
```

The default dependency-free source test path passed; real driver build remains a deployment-environment check.

## Live/external QA still required

- PostgreSQL 15+ full migration + row-lock/concurrency suite
- MySQL 8+ full migration + row-lock/concurrency suite
- MariaDB 10.11+ full migration + row-lock/concurrency suite
- Chrome extension v6.1.9 with logged-in Binance advertiser page and real P2P Info click
- public HTTPS PushManager subscribe -> provider delivery -> notification click -> unsubscribe
- SMTP real delivery/retry
- selected payment gateway checkout/signature/webhook replay/out-of-order event test
- authorized Binance non-destructive sync and controlled final-action validation
- every role/permission/account-scope browser E2E
- multi-instance NATS worker failover and representative load test
- backup/restore/PITR drill

Financially destructive live actions were not executed from this sandbox.
