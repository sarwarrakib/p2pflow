# P2PFlow v1.5.33 — Manual Update Guide

**Application:** 1.5.33  
**Database schema:** 35  
**Database migration:** নেই

## 1. Backup

Update-এর আগে production database, `.env`, `.p2pflow/`, `shared/` এবং uploaded/runtime data backup নিন।

## 2. Application files replace

`P2PFlow_v1.5.33_UNIFIED.zip` clean directory-তে extract করে application files replace করুন। Production `.env`, database, `.p2pflow/` বা `shared/` overwrite করবেন না।

## 3. Dependency/build/test

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

তারপর service restart করুন। Browser/PWA সম্পূর্ণ close-open বা hard refresh করুন এবং reverse proxy/CDN static cache purge করুন। Footer/Health-এ version `1.5.33` নিশ্চিত করুন।

## 4. Chat stability test

একটি active order chat খুলুন:

1. 20–30টি message থাকলে উপরের পুরোনো message-এ scroll করুন।
2. অন্য Binance account/device থেকে নতুন message পাঠান।
3. নতুন message data আসবে, কিন্তু আপনার current scroll location jump করা উচিত নয়।
4. bottom-এ ফিরে এলে নতুন message naturalভাবে নিচে follow করতে পারে।
5. chat box hide/show বা repeated page reload হওয়া উচিত নয়।

Server log-এ WSS unavailable হলে active chat fallback polling কাজ করবে; enabled/live WSS থাকলে incoming message আরও দ্রুত আসবে।

## 5. Camera এবং image upload test

Mobile browser/PWA-তে order chat → attachment খুলুন:

- Camera চাপলে supported device-এ camera picker/open হওয়া উচিত;
- Album থেকে একটি screenshot পাঠান;
- medium/large screenshot compression-এর পরে send হওয়া উচিত;
- network/pre-signed URL failure হলে request অনির্দিষ্টকাল spinner হয়ে না থেকে bounded retry বা clear error দিতে হবে।

Camera permission browser/OS policy অনুযায়ী user approval চাইতে পারে।

## 6. P2P Market scroll test

P2P Market-এর মাঝামাঝি/নিচের দিকে scroll করুন এবং অন্তত 10–15 seconds অপেক্ষা করুন। Data/cards refresh ও reorder হতে পারে, কিন্তু page top-এ ফিরে যাওয়া উচিত নয়।

## 7. Settings typing test

Settings-এর কোনো text/input field-এ 15 seconds ধরে edit করুন। Background sync চললেও input focus/typed text generic 5-second re-render-এর কারণে disappear/reset হওয়া উচিত নয়।

## 8. Fast new-order test

Controlled Binance P2P order তৈরি করুন। Default fast discovery প্রায় 3 seconds-এ lightweight list check করে, তাই আগের 30–40 second delay উল্লেখযোগ্যভাবে কমার কথা। Network/API delay বিবেচনায় exact 3-second guarantee নয়।

প্রয়োজনে environment-এ:

```text
CRM_FAST_ORDER_DISCOVERY_MS=3000
```

দেওয়া যায়; application minimum 2000 ms enforce করে। খুব কম interval production rate-limit/load বিবেচনা ছাড়া ব্যবহার করবেন না।

## 9. Mark as Paid test

একটি controlled BUY-side order-এ exact synced orderNumber/payId থাকার পরে Mark as Paid চালান। Fast path unnecessary pre-detail refresh বাদ দেয়। Live API response time এখনও Binance/network-এর ওপর নির্ভর করবে।

## 10. Rollback

সমস্যা হলে application code আগের signed release-এ rollback করুন এবং backup database/runtime data অক্ষত রাখুন। v1.5.33 schema 35 ব্যবহার করে, তাই নতুন schema migration rollback প্রয়োজন নেই।
