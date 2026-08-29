#!/bin/sh
set -eu
if command -v openssl >/dev/null 2>&1; then
  openssl rand -hex 32
  exit 0
fi
if command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
  exit 0
fi
echo "Install openssl or python3 to generate a secret." >&2
exit 1
