# P2PFlow v1.7.9 — Manual Update Guide

## Preserve অবশ্যই করবেন

- `.env`
- `.p2pflow/`
- `shared/`
- database / DB credentials
- reverse-proxy configuration

## Update flow

1. Current application + database backup নিন।
2. v1.7.9 ZIP application/repository root-এ extract করুন; runtime secret/data overwrite করবেন না।
3. Production dependency install policy অনুযায়ী install করুন, সাধারণ clean production install:
   `npm ci --omit=dev --ignore-scripts`
4. Run: `npm run build`
5. Run: `npm test`
6. Application process restart করুন।
7. Browser hard refresh করুন।
8. Owner account দিয়ে Launch Checklist-এর permission smoke test করুন।

## Migration

Database schema **37 unchanged**। Owner authority runtime/effective permission repair; নতুন database migration দরকার নেই।

## Rollback

Unexpected regression হলে runtime database/secret untouched রেখে previous application code restore করা যাবে।
