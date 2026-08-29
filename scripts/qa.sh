#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
# Every browser JavaScript file must parse.
if command -v node >/dev/null 2>&1; then
  find web extension -type f -name '*.js' -print 2>/dev/null | sort | while IFS= read -r f; do node --check "$f" >/dev/null; done
  find scripts -maxdepth 1 -type f -name '*.mjs' -print 2>/dev/null | sort | while IFS= read -r f; do node --check "$f" >/dev/null; done
  node scripts/api-contract-audit.mjs >/dev/null
  node scripts/permission-contract-audit.mjs >/dev/null
  node scripts/accounting-contract-audit.mjs >/dev/null
  node scripts/browser-role-contract-audit.mjs >/dev/null
  node scripts/domain-contract-audit.mjs >/dev/null
  node scripts/installer-contract-audit.mjs >/dev/null
fi
# Make sure all three migration families contain the same ordered migration set.
p="$(find migrations/postgres -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort)"
m="$(find migrations/mysql -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort)"
r="$(find migrations/mariadb -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort)"
[ "$p" = "$m" ] && [ "$p" = "$r" ] || { echo "Migration file sets differ" >&2; exit 1; }
printf '%s\n' "P2PFlow static QA passed."
