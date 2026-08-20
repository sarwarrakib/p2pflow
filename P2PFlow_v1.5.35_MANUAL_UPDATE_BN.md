# P2PFlow v1.5.35 — Manual Update Guide

## 1. Backup

Update-এর আগে production database, `.env`, `.p2pflow/`, `shared/` এবং uploaded runtime data backup নিন।

## 2. Application files replace

`P2PFlow_v1.5.35_UNIFIED.zip` clean directory-তে extract করে application files replace করুন। Production `.env`, database বা runtime directories overwrite করবেন না।

## 3. Dependencies ও validation

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

## 4. Service restart

P2PFlow service restart করুন। প্রথম startup-এ schema 35 → 36 additive migration হবে। Health/System status-এ schema `36` নিশ্চিত করুন।

## 5. Browser cache

Browser/PWA hard refresh করুন। Reverse proxy/CDN cache থাকলে purge করুন। UI version `1.5.35` নিশ্চিত করুন।

## 6. Permission migration controlled check

একটি test user/role দিয়ে পরীক্ষা করুন:

1. Role name যাই হোক, `orders.view` unchecked থাকলে Orders page/order data পাওয়া যাবে না।
2. `orders.view` + exact Binance account grant দিলে ওই account-এর Orders দেখা যাবে।
3. `binance.sync` + exact account grant দিলে ওই account-এর live orders দেখা যাবে।
4. অন্য Binance account grant না থাকলে সেই account দেখা যাবে না।
5. `accounts.manage_all` দিলে all-account management হবে; permission সরালে Role name যাই হোক all-account management হবে না।
6. assignment user-এর role name বদলালেও actual permissions/routing একই থাকলে assignment behavior বদলাবে না।

Schema 36 migration Role name দেখে grant দেয় না। পুরোনো explicit account IDs preserve হয়; broad legacy access কেবল `credentials.manage`/`agents.manage` permission থাকলে existing credentials-এ explicit grant হয়। Migration-এর পরে Users → Edit User থেকে account-level grants review করুন।

## 7. Advertisement Rate Guard test

একটি test Advertisement খুলুন:

- Minimum Rate: `115`
- Maximum Rate: `125`
- Price: `120` → Save হওয়া উচিত
- Price: `114` → Minimum Rate validation হওয়া উচিত
- Price: `126` → Maximum Rate validation হওয়া উচিত
- Minimum `130`, Maximum `120` → invalid range validation হওয়া উচিত

Blank/0 দিলে সংশ্লিষ্ট bound disabled থাকবে।

এই Min/Max values local P2PFlow guard; Binance payload-এর undocumented field নয়।

## 8. Rollback

Rollback প্রয়োজন হলে application code previous release-এ ফিরিয়ে database backup অক্ষত রাখুন। Schema 36 additive; rollback-এর আগে production backup বাধ্যতামূলক রাখুন।
