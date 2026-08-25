# P2PFlow v1.7.3 — Manual Update Guide

**Application:** 1.7.3  
**Database schema:** 37  
**Database migration:** নেই

## 1. Update-এর আগে

Database backup নিন এবং production `.env`, `.p2pflow/`, `shared/` ও external database credentials/data আলাদা নিরাপদ backup-এ রাখুন। যদি `P2PFLOW_SECRET_VAULT_KEY` ব্যবহার করেন, key backup বিশেষভাবে নিশ্চিত করুন।

## 2. Source replace

`P2PFlow_v1.7.3_UNIFIED.zip` clean temporary directory-তে extract করুন। Extract করা application files production Application Root-এ copy/overwrite করুন।

**মুছবেন/overwrite করবেন না:**

- `.env`
- `.p2pflow/`
- `shared/`
- production database
- hosting-managed persistent secret files

## 3. Dependencies / validation

Production environment-এর policy অনুযায়ী চালান:

```text
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

তারপর service restart করুন। Health/System Update/Footer-এ application `1.7.3` এবং schema `37` নিশ্চিত করুন।

## 4. Browser/PWA cache

v1.7.3 routing এবং AppShell architecture বদলেছে। Deployment-এর পরে:

1. reverse proxy/CDN cache purge করুন;
2. browser/PWA সম্পূর্ণ close করুন;
3. আবার খুলে hard refresh করুন;
4. পুরোনো tab দীর্ঘ সময় open থাকলে close করুন।

## 5. Clean URL test

Login-এর পরে নিচের route-গুলো address bar থেকে সরাসরি খুলে Refresh দিন:

```text
/dashboard
/orders
/accounting
/system/settings
/system/update
```

একটি existing order থাকলে `/orders/<internal-order-id>`-ও সরাসরি refresh করুন। 404 বা login loop হওয়া উচিত নয় (valid session থাকলে)।

পুরোনো bookmark `/#/orders/...` খুললে clean `/orders/...` URL-এ migrate হওয়া expected।

## 6. Fixed shell test

Desktop-এ Accounting/Reports/Orders-এর দীর্ঘ page-এ নিচে scroll করুন। Expected:

- browser document নিজে scroll করবে না;
- sidebar top/logo/footer viewport-এর মধ্যে থাকবে;
- top header viewport-এর মধ্যে থাকবে;
- শুধু route content area scroll করবে;
- global horizontal scrollbar তৈরি/গায়েব হবে না।

Mobile-এ sidebar drawer খুলে/বন্ধ করে route content scroll test করুন।

## 7. Slow-network navigation test

Browser DevTools থেকে network Slow 3G/Custom latency simulation ব্যবহার করতে পারেন। দ্রুত:

`Accounting → Orders → Ads → Settings → System Update`

click করুন। Expected:

- target page-এর shell সঙ্গে সঙ্গে দেখা যাবে;
- আগের page পরে ফিরে আসবে না;
- pending পুরোনো request নতুন page overwrite করবে না;
- Back/Forward সঠিক clean route দেখাবে।

## 8. Realtime stability test

কমপক্ষে একটি controlled live order দিয়ে:

- Order detail খুলে chat-এর উপরে scroll করুন;
- incoming message আসতে দিন;
- P2P Market-এ scroll রেখে refresh cycle চলতে দিন;
- Settings form-এ typing রেখে realtime events আসতে দিন;
- Orders list-এ নতুন order/status update আসতে দিন।

Expected: page shell/header/sidebar reload নয়; শুধুমাত্র dynamic data update।

## 9. Reverse proxy note

Production reverse proxy যেন clean application routes Node server-এ forward করে। Included production setup-এর `location /` proxy model এর সঙ্গে compatible। Node app known SPA paths-এ `index.html` fallback দেয়। `/api/...` requests আগের API router দিয়েই handle হয়।

## 10. Rollback

v1.7.3 database schema পরিবর্তন করে না। প্রয়োজন হলে validated previous release code pointer-এ rollback করা যায়। Rollback-এর পরে browser/CDN cache আবার purge/hard-refresh করুন, কারণ v1.7.3 asset query/version এবং routing runtime আলাদা।
