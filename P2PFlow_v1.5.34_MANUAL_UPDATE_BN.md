# P2PFlow v1.5.34 — Manual Update Guide

## 1. Backup

Update-এর আগে production database, `.env`, `.p2pflow/`, `shared/` এবং uploaded/runtime data backup নিন।

## 2. Application files replace

v1.5.34 Unified ZIP clean directory-তে extract করে application files replace করুন। Production `.env`, database বা runtime directories overwrite করবেন না।

## 3. Dependencies ও verification

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

## 4. Service restart ও browser refresh

- P2PFlow service restart করুন।
- Browser hard refresh করুন।
- PWA/mobile browser সম্পূর্ণ close করে আবার খুলুন।
- CDN/reverse-proxy cache থাকলে purge করুন।
- Health/Footer-এ version `1.5.34` এবং schema `35` নিশ্চিত করুন।

## 5. Agent role permission test

1. Team & Control → Users-এ test Agent edit করুন।
2. Agent/User Role নির্বাচন করুন।
3. Role template-এর Global Permissions auto-tick হয়েছে কিনা দেখুন।
4. Binance Account Permissions-এ একই role-এর applicable permission auto-tick হয়েছে কিনা দেখুন।
5. একটি Binance account-এ `Binance live order sync` grant রাখুন।
6. Agent login থেকে ওই account-এর unassigned live order দেখা যাচ্ছে কিনা পরীক্ষা করুন।
7. অন্য ungranted Binance account-এর order দেখা যাচ্ছে না কিনা নিশ্চিত করুন।

## 6. Order-only assignment test

### Global mode

Settings → General → **Payment Account capacity guard for Agent auto assignment** OFF করুন।

তারপর এমন Agent ব্যবহার করুন যার কোনো Payment Account/balance নেই কিন্তু:

- Agent enabled;
- required role/account permissions আছে;
- routing rule আছে;
- max active/order amount rules pass করে।

নতুন test order auto-assign হচ্ছে কিনা যাচাই করুন।

### Per-Agent mode

Global guard আবার ON করুন। User/Agent Edit → **Use Payment Account calculation for auto assignment** OFF করুন। একই test পুনরায় চালান। শুধু ওই Agent-এর জন্য wallet/balance requirement বাদ যাওয়ার কথা।

## 7. Accounting-aware Agent regression

একজন accounting-enabled Agent-এর route-এ Capacity Guard ON রেখে insufficient/no wallet condition তৈরি করুন। সেই Agent যেন capacity rule অনুযায়ী block হয়—এটি নিশ্চিত করুন।

## 8. Live Order Work-state regression

Live Order permission থাকা Agent-এর header-এ Work button না দেখালেও old hidden Work OFF state তার assignment আটকাবে না। Controlled order দিয়ে যাচাই করুন।

## 9. Rollback

প্রয়োজনে application code rollback করা যাবে। v1.5.34 database schema 35-ই ব্যবহার করে; নতুন schema migration নেই। Database backup অক্ষত রাখুন।
