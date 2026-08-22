# P2PFlow v1.5.38 - Manual Update Guide

**Application:** 1.5.38  
**Database schema:** 37  
**Migration:** নতুন migration নেই

## 1. Backup

Update-এর আগে production database, `.env`, `.p2pflow/`, `shared/` এবং uploaded runtime data backup নিন। `P2PFLOW_SECRET_VAULT_KEY` ব্যবহার করলে key backup নিশ্চিত করুন।

## 2. Application files update

v1.5.38 Unified ZIP clean directory-তে extract করে application code replace করুন। Production `.env`, database এবং runtime directories overwrite করবেন না।

## 3. Install / verify

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

## 4. Restart ও cache clear

Application/service restart করুন। এরপর browser/PWA hard refresh করুন। Reverse proxy/CDN থাকলে public JS/CSS cache purge করুন। Footer/Health-এ `1.5.38` নিশ্চিত করুন।

## 5. Release Verification smoke test

একটি controlled order-এ:

1. Release চাপুন;
2. local Secret Code/User Password/Email OTP configured থাকলে শুধু সেই input ও Release button দেখুন;
3. ভুল value দিলে একই screen-এ inline warning নিশ্চিত করুন;
4. Google/SMS challenge এলে dedicated input একই modal-এ retry হয় কিনা দেখুন;
5. long explanatory cards/text আর আছে কিনা পরীক্ষা করুন।

## 6. Advertisement UI smoke test

### Create BUY Ad

1. My Ads -> Create;
2. Binance account select করুন;
3. Buy নির্বাচন করুন;
4. Asset/Fiat নির্বাচন করুন;
5. Fixed/Floating price type পরীক্ষা করুন;
6. live Price Range এবং market line কয়েক সেকেন্ড পর refresh হচ্ছে কিনা দেখুন;
7. Payment Method sheet-এ saved account number নয়, generic Binance method type আসছে কিনা দেখুন;
8. সর্বোচ্চ 5টি method select করা যায় কিনা দেখুন;
9. Conditions -> Verification Request / Terms / Auto Reply / Conditions / Regions / Status দেখুন;
10. Preview -> Post flow পরীক্ষা করুন।

### Create SELL Ad

1. Sell নির্বাচন করুন;
2. Payment Method sheet খুলুন;
3. selected API account-এর saved Binance P2P payment account details আসছে কিনা দেখুন;
4. অন্য API account-এর account/payId mix হচ্ছে না নিশ্চিত করুন;
5. সর্বোচ্চ 5টি account select করুন;
6. Preview এবং draft/Post flow পরীক্ষা করুন।

## 7. Price Range note

C2C `getReferencePrice` live response-এ explicit usable min/max bound এলে UI সেটিই দেখায়। Supplied v7.4 schema bound field guarantee না করায় bound absent হলে reference-based display guide fallback হয়। এটি manual backend guard নয়; Binance create/update response final authority।

## 8. Existing functions regression

Orders, P2P Market, Ads filters, merchant Business/Online/Break, Ads edit/delete/publish, account selector, permissions, Payment Split, chat, notifications, Settings এবং accounting smoke-test করুন। Redesign existing features সরানোর জন্য নয়।

## 9. Rollback

Rollback প্রয়োজন হলে application code previous release-এ ফিরিয়ে service restart করুন। Schema 37 অপরিবর্তিত, তাই v1.5.37-এ code rollback-এর জন্য নতুন DB down-migration লাগে না। Database backup তবুও অক্ষত রাখুন।
