# P2PFlow v1.7.8 — Manual Update Guide

## গুরুত্বপূর্ণ

এই package application code update করে। Existing server-এর runtime data/secret replace করবেন না।

Preserve:

- `.env`
- `.p2pflow/`
- `shared/`
- database / DB credentials
- production reverse-proxy configuration

## Recommended update flow

1. Current application + database backup নিন।
2. Maintenance/controlled traffic window নিন।
3. v1.7.8 ZIP repository/application root-এ extract করুন; preserved runtime files overwrite করবেন না।
4. Production-এর existing dependency policy অনুযায়ী install করুন, সাধারণ clean production install:
   `npm ci --omit=dev --ignore-scripts`
5. Run:
   `npm run build`
6. Run:
   `npm test`
7. Application process restart করুন।
8. Browser hard refresh করে launch checklist follow করুন।

## Migration

Database schema 37 unchanged; v1.7.8 performance restore-এর জন্য নতুন schema migration নেই।

## Rollback

Unexpected production regression হলে runtime database/secret untouched রেখে previous v1.7.7 application code restore করুন। Database schema একই থাকায় code rollback সহজ থাকে।
