#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

echo "[1/6] Static contracts"
./scripts/qa.sh

echo "[2/6] Go tests"
go test ./...

echo "[3/6] Go vet"
go vet ./...

echo "[4/6] Default command builds"
go build ./cmd/p2pflow ./cmd/p2pflow-worker ./cmd/p2pflow-migrate ./cmd/p2pflow-updater ./cmd/p2pflow-keygen

echo "[5/6] Production configuration"
ENV_FILE="${P2PFLOW_ENV_FILE:-.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  fail=0
  need() { eval "v=\${$1:-}"; [ -n "$v" ] || { echo "ERROR: $1 is required" >&2; fail=1; }; }
  need DB_DRIVER; need DB_URL; need APP_SECRET; need P2PFLOW_PUBLIC_BASE_URL
  repo_version="$(cat VERSION 2>/dev/null || true)"
  if [ -n "${P2PFLOW_VERSION:-}" ] && [ -n "$repo_version" ] && [ "$P2PFLOW_VERSION" != "$repo_version" ]; then
    echo "ERROR: P2PFLOW_VERSION=$P2PFLOW_VERSION does not match repository VERSION=$repo_version" >&2
    fail=1
  fi
  case "${DB_DRIVER:-}" in postgres|mysql|mariadb) ;; *) echo "ERROR: DB_DRIVER must be postgres/mysql/mariadb" >&2; fail=1;; esac
  [ "${P2PFLOW_ENV:-}" = production ] || { echo "ERROR: P2PFLOW_ENV must be production" >&2; fail=1; }
  [ "${COOKIE_SECURE:-}" = true ] || { echo "ERROR: COOKIE_SECURE=true required" >&2; fail=1; }
  [ "${P2PFLOW_AUTO_MIGRATE:-}" = false ] || { echo "ERROR: use dedicated migration step (P2PFLOW_AUTO_MIGRATE=false)" >&2; fail=1; }
  case "${P2PFLOW_PUBLIC_BASE_URL:-}" in https://*) ;; *) echo "ERROR: public base URL must use HTTPS" >&2; fail=1;; esac
  app_secret="${APP_SECRET:-}"
  [ ${#app_secret} -ge 32 ] || { echo "ERROR: APP_SECRET must be at least 32 characters" >&2; fail=1; }
  case "${APP_SECRET:-}" in *replace-with*|*change-me*) echo "ERROR: APP_SECRET is still a placeholder" >&2; fail=1;; esac
  if [ "${P2PFLOW_UPDATE_REQUIRE_SIGNATURE:-true}" = true ]; then need P2PFLOW_UPDATE_PUBLIC_KEY; fi
  if [ -n "${P2PFLOW_PREFLIGHT_URL:-}" ] && command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 5 "${P2PFLOW_PREFLIGHT_URL%/}/healthz" >/dev/null || { echo "ERROR: liveness probe failed" >&2; fail=1; }
    curl -fsS --max-time 5 "${P2PFLOW_PREFLIGHT_URL%/}/ready" >/dev/null || { echo "ERROR: readiness/DB probe failed" >&2; fail=1; }
  fi
  [ "$fail" -eq 0 ] || exit 1
else
  echo "INFO: $ENV_FILE not found; source/build checks passed, runtime configuration checks skipped."
fi

echo "[6/6] Browser role E2E"
if [ -n "${P2PFLOW_E2E_BASE_URL:-}" ]; then
  node scripts/browser-role-e2e.mjs
elif [ "${P2PFLOW_REQUIRE_BROWSER_E2E:-false}" = true ]; then
  echo "ERROR: P2PFLOW_REQUIRE_BROWSER_E2E=true but P2PFLOW_E2E_BASE_URL is not set" >&2
  exit 1
else
  echo "INFO: browser role E2E skipped; set P2PFLOW_E2E_BASE_URL and role session cookies to run it."
fi

echo "P2PFlow production preflight passed."
