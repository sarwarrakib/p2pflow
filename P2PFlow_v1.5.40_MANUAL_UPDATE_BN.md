# P2PFlow v1.5.40 — Manual Update Guide

**Application:** 1.5.40  
**Database schema:** 37

## ১. Backup

Update-এর আগে database, `.env`, `.p2pflow/`, `shared/` এবং hosting configuration backup নিন। Schema migration নেই, কিন্তু production rollback safety-এর জন্য backup বাধ্যতামূলক ধরে নিন।

## ২. Application files replace

`P2PFlow_v1.5.40_UNIFIED.zip` clean directory-তে extract করুন। Production persistent files/directories overwrite করবেন না।

## ৩. Dependency / build / test

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

Production environment-এ আপনার existing supported MariaDB/MySQL/PostgreSQL configuration ব্যবহার করুন।

## ৪. Service restart

Application service restart করুন। Footer/Health/System Update-এ version `1.5.40`, schema `37` নিশ্চিত করুন।

## ৫. Browser/PWA cache পরিষ্কার

এই release frontend architecture পরিবর্তন করে এবং asset query version `1.5.40`। Deployment-এর পরে:

- browser hard refresh করুন;
- installed PWA/mobile browser সম্পূর্ণ close করে reopen করুন;
- CDN/reverse-proxy static cache purge করুন;
- service worker পুরোনো asset ধরে থাকলে নতুন page load সম্পন্ন হতে দিন।

## ৬. Stable-shell controlled test

1. System Update page খুলুন এবং 20–30 seconds বসে থাকুন। Horizontal scrollbar animation-এর সঙ্গে আসা-যাওয়া করা যাবে না।
2. System Update → Orders → Settings → P2P Market দ্রুত switch করুন। নতুন page click করার পরে আগের page delayed response হিসেবে আবার সামনে আসা যাবে না।
3. Slow network throttling ব্যবহার করতে পারলে page switch করুন। Target page-এর shell সঙ্গে সঙ্গে দেখা যাবে; dynamic data পরে আসবে।
4. Settings input-এ লিখে কিছুক্ষণ অপেক্ষা করুন। Background event input/focus কেটে দিতে পারবে না।
5. Order detail/chat খুলে chat-এ উপরে scroll করুন। New message এলে chat/order shell rebuild বা scroll reset হবে না।
6. P2P Market filter দ্রুত কয়েকবার বদলান। Latest selection-ই final data দেখাবে।
7. System Update details expand করুন; background status update-এ open state অকারণে collapse হওয়া উচিত নয়।

## ৭. Rollback

Rollback করলে v1.5.39 code-এ ফিরে যেতে পারবেন; schema একই 37। তবে v1.5.40 frontend cache/static assets browser-এ থাকতে পারে, তাই rollback-এর পরও hard refresh/CDN purge করুন।
