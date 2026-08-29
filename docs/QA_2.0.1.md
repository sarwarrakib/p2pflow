# P2PFlow 2.0.1 QA checkpoint

Completed in this checkpoint:

- `go test ./...` — PASS
- `go vet ./...` — PASS
- `go build ./cmd/p2pflow ./cmd/p2pflow-worker ./cmd/p2pflow-migrate` — PASS (core/default build)
- `./scripts/qa.sh` — PASS (all browser JS parse checks + all three migration families have the same ordered file set)
- Binance HMAC signer deterministic unit test — PASS
- RSA/OAEP-SHA256 FUND_PWD encryption round-trip unit test — PASS
- Release challenge inference unit tests — PASS
- every PostgreSQL/MySQL/MariaDB migration file parses through P2PFlow migration splitter — PASS

Not claimed/tested in this sandbox:

- real Binance merchant-account mutation tests (Mark Paid/Release/Ad mutation) were not run against a live financial account
- real PostgreSQL/MySQL/MariaDB servers were not available for full integration migration execution
- `-tags dbdrivers` production binary build needs `go mod download`; this sandbox could not reach `proxy.golang.org`, so external driver modules could not be downloaded here

On the deployment server, run `go mod download` and `./scripts/build.sh` as documented in `docs/SETUP_BN.md`.
