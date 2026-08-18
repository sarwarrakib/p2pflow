# P2PFlow v1.5.19 Release Notes

Release date: 2026-08-18  
Application version: `1.5.19`  
Database schema: `32`

## Release summary

এই hotfix দুই বা ততোধিক Binance P2P account যুক্ত থাকলে দ্বিতীয় account-এর advertisement update অথবা draft publish করার সময় Binance `illegal parameter`/parameter rejection সমস্যাটি ঠিক করে। মূল পরিবর্তন Ads payload construction ও payment-method mapping layer-এ করা হয়েছে; database schema পরিবর্তন হয়নি।

## সমস্যার মূল কারণ

### 1. Update payload-এ create-only field

`/sapi/v1/c2c/ads/update` request-এ `classify` পাঠানো হচ্ছিল। এটি advertisement create payload-এর field হলেও supplied `AdUpdateReq` contract-এ নেই। কিছু Binance merchant account/validation route অপ্রয়োজনীয় field উপেক্ষা করলেও অন্য account সেটি `-31002`/illegal parameter হিসেবে প্রত্যাখ্যান করতে পারে।

এখন update request strict allowlist ব্যবহার করে। `classify`, `onlineNow`, `countries` এবং অন্য create-only/undocumented field Update Ads payload-এ যায় না।

### 2. প্রথম account-এর payment-method `payId` দ্বিতীয় account-এ reuse

CRM-এর local payment method একই হলেও Binance-এর `tradeMethods[].payId` account-specific হতে পারে। আগে global payment-method record-এ থাকা প্রথম synced account-এর `binancePayId` দ্বিতীয় account-এর update/publish request-এ reuse হওয়ার ঝুঁকি ছিল।

এখন:

- প্রতিটি selected Binance credential-এর live advertisement detail, synced P2P Profile এবং ওই credential-এর known Ads থেকে payment-method mapping resolve হয়।
- Account A-এর `payId` Account B-এর payload-এ fallback হয় না।
- Multi-account mode-এ exact account mapping পাওয়া না গেলে request Binance-এ পাঠানোর বদলে fail-closed error দেখায় এবং সংশ্লিষ্ট P2P Profile sync করতে বলে।
- Single-account installation-এর পুরোনো safe fallback behavior বজায় রাখা হয়েছে।

### 3. Account-specific advertisement classification

নতুন advertisement create/draft publish-এর `classify` এখন selected Binance account-এর সর্বশেষ synced advertisement থেকে infer হয়। Concrete illegal-parameter rejection হলে accepted mutation হওয়ার আগে একবার alternate supported classification দিয়ে retry করা হয়। সফল retry-তে ব্যবহৃত classification local advertisement record-এ সংরক্ষিত হয়।

## Update Advertisement behavior

- Update-এর আগে exact credential দিয়ে latest advertisement detail reload হয়।
- Selected local payment methods exact account-এর `tradeMethods` ও positive `payId`-এ resolve হয়।
- Documented `AdUpdateReq` field ছাড়া অন্য field বাদ যায়।
- প্রথম attempt `updateMode: FULL` ব্যবহার করে।
- Concrete illegal-parameter rejection হলে latest detail পুনরায় load করে strict payload থেকে `updateMode` বাদ দিয়ে একটি compatibility retry হয়।
- Binance উভয় request প্রত্যাখ্যান করলে local advertisement পরিবর্তন করা হয় না। Response-এ Binance account name/credential ID এবং sanitized error code/message থাকে।

## Publish/Create behavior

- Draft publish এবং নতুন advertisement create selected credential-এর payment-method mapping ব্যবহার করে।
- Payment method অন্য account-এর সঙ্গে linked থাকলে publish request পাঠানো হয় না; draft অক্ষত থাকে।
- Selected account-এর known `classify` ব্যবহার হয়; প্রয়োজন হলে controlled alternate-classify retry হয়।
- Binance advertisement number না পাওয়া পর্যন্ত local record live advertisement হিসেবে চিহ্নিত হয় না।

## Ads editor

- Payment-method picker selected Binance account অনুযায়ী filter হয়।
- Account button/change করলে ওই account-এ unavailable selected method স্বয়ংক্রিয়ভাবে বাদ যায়।
- Exact account mapping না থাকলে P2P Profile sync করার নির্দেশ দেখায়।
- Account-specific payment account/bank information available থাকলে method card-এ দেখা যায়।

## Database and compatibility

- Database schema: `32` — unchanged.
- Existing users, roles, account grants, orders, Ads, payment accounts, ledger, accounting, notifications এবং Offline Business data migrate বা rewrite হয় না।
- Existing Ads পরবর্তী sync/update-এর সময় account-specific mapping ব্যবহার করবে।
- Deployment-এর পরে প্রতিটি Binance account-এর P2P Profile এবং Ads list একবার sync করা strongly recommended।

## Verification performed

- 79টি active JavaScript file syntax check
- `npm run build`
- পূর্ণ `npm test`
- New two-account Ads payload regression self-test
- Primary account `payId=111` এবং Secondary account `payId=222` isolation test
- Update payload documented-field allowlist test
- Update payload থেকে `classify`, `onlineNow`, `countries` exclusion test
- Per-account create classification test
- Existing Ads merchant state/account isolation test
- Multi-account UI, account-scoped RBAC, authentication, Security Question, trusted-device, mail routing/failover, database encryption/persistence, accounting এবং signed update/rollback tests
- Final ZIP integrity এবং clean extraction verification

## Live-operation limitation

Automated test environment-এ real production Binance credential দিয়ে advertisement create/update/status mutation চালানো হয়নি। Public deployment-এর আগে staging বা ছোট controlled advertisement দিয়ে প্রথম ও দ্বিতীয় account আলাদাভাবে update, publish এবং status change পরীক্ষা করতে হবে।
