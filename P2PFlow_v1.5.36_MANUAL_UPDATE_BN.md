# P2PFlow v1.5.36 — Manual Update Guide

**Application:** 1.5.36  
**Database schema:** 36

## 1. Backup

Update-এর আগে production database, `.env`, `.p2pflow/`, `shared/` এবং uploaded/runtime data backup নিন।

## 2. Application update

`P2PFlow_v1.5.36_UNIFIED.zip` clean directory-তে extract করে application files update করুন। Production `.env`, database এবং persistent runtime directories overwrite করবেন না।

## 3. Dependencies ও verification

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

## 4. Restart ও browser cache

Application service restart করুন। Browser/PWA hard refresh বা সম্পূর্ণ close-open করুন। Reverse proxy/CDN থাকলে cache purge করুন। Footer/Health-এ version `1.5.36` নিশ্চিত করুন।

## 5. FUND_PWD Settings

API Credentials -> সংশ্লিষ্ট Binance account -> Release Verification gear:

1. Binance verification = **Fund Transfer Password** নির্বাচন করুন।
2. চাইলে Fund Transfer Password save করুন। Saved থাকলে automaticভাবে ব্যবহার হবে।
3. অতিরিক্ত CRM protection চাইলে **Require P2PFlow verification before Release** ON করুন।
4. Primary এবং optional Secondary verification নির্বাচন করুন।
5. Save Release Verification করুন।

### Saved password + CRM verification OFF

Release click করলেই P2PFlow fresh Binance RSA key নিয়ে password encrypt করে `releaseCoin` চালাবে।

### Saved password + CRM verification ON

Release -> Primary/Secondary P2PFlow verification -> pass -> saved password RSA encrypt -> `releaseCoin`।

### Password saved নয়

Release-এর সময় Fund Transfer Password field আসবে। Password submit করলে সেটি RSA encrypt করে current release attempt-এ ব্যবহার হবে।

## 6. Controlled live test

ছোট SELL order দিয়ে পরীক্ষা করুন:

- correct `orderNumber` ও `payId` sync হয়েছে;
- Fund Password saved থাকলে password field আসে না;
- CRM verification ON থাকলে আগে CRM verification আসে;
- CRM verification OFF থাকলে saved password দিয়ে সরাসরি release attempt হয়;
- saved password না থাকলে Fund Transfer Password input আসে;
- সফল হলে order released status-এ যায়।

## 7. Rollback

সমস্যা হলে database backup অক্ষত রেখে previous application release-এ rollback করুন। v1.5.36 নতুন schema migration করে না; schema 36-ই ব্যবহার করে।
