# P2PFlow v1.5.39 — Manual Update Guide

**Database schema:** 37 — নতুন migration নেই।

## 1. Backup

Update-এর আগে production database, `.env`, `.p2pflow/`, `shared/` এবং deployment configuration backup নিন।

## 2. Application files update

v1.5.39 Unified ZIP clean directory-তে extract করে application code replace করুন। Production database বা secret/config files package দিয়ে overwrite করবেন না।

## 3. Dependencies ও validation

Production process অনুযায়ী dependency install/verify করুন, তারপর:

```bash
npm run build
npm test
```

## 4. Service restart

P2PFlow Node service/supervisor restart করুন। Health page-এ application version `1.5.39` এবং schema `37` নিশ্চিত করুন।

## 5. Browser/PWA cache পরিষ্কার

v1.5.39 asset cache version পরিবর্তন হয়েছে। Deployment-এর পরে:

- browser hard refresh করুন;
- PWA/mobile browser সম্পূর্ণ close করে আবার খুলুন;
- reverse proxy/CDN cache থাকলে purge করুন।

## 6. Stable Shell controlled test

1. Orders page থেকে একটি order click করুন; 1–2 seconds-এর মধ্যে অন্য page click করুন। প্রথম order-এর slow response পরে এসে current page খুলে দিতে পারবে না।
2. একটি order একবার open করুন এবং 20–30 seconds অপেক্ষা করুন। Page list/detail-এর মধ্যে jump করা বা বারবার বের হয়ে যাওয়া উচিত নয়।
3. Chat-এ পুরোনো message দেখতে উপরে scroll করুন। Incoming message এলেও chat box hide/show, full order redraw বা forced scroll-to-bottom হওয়া উচিত নয়।
4. Browser DevTools Network Throttling ব্যবহার করে Slow 3G/Fast 3G test করুন। Button/page দ্রুত পাল্টালে সবসময় সর্বশেষ navigation-ই visible থাকবে।
5. সাময়িক API/upstream failure-এ sidebar/topbar/current shell থাকবে; browser automatic reload হওয়া উচিত নয়।
6. Orders list-এ নিচে scroll করে background refresh অপেক্ষা করুন; viewport reset হওয়া উচিত নয়।
7. Ads search field-এ টাইপ করতে থাকুন এবং realtime refresh অপেক্ষা করুন; typed text, focus ও scroll নষ্ট হওয়া উচিত নয়।
8. P2P Market-এ দ্রুত filter বদলান; পুরোনো slow result নতুন filter result overwrite করতে পারবে না।

## 7. Existing critical regressions

Controlled environment-এ Chat message/image, Mark Paid, Release/FUND_PWD, Payment Split, Ads Create/Edit, permission/account scope এবং Payment Account/accounting workflow একবার পরীক্ষা করুন।

## 8. Rollback

সমস্যা হলে v1.5.38 code-এ rollback করা যায়; schema v1.5.39-এও 37 থাকায় নতুন database migration নেই। তবে rollback-এর আগে/পরে production database backup অক্ষত রাখুন।
