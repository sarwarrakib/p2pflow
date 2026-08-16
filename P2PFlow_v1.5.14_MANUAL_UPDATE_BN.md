# P2PFlow v1.5.14 Manual Update Guide

এই guide existing P2PFlow installation-কে v1.5.14-এ update করার জন্য। একই `P2PFlow_v1.5.14_UNIFIED.zip` fresh install, manual update এবং GitHub source update—সব ক্ষেত্রেই ব্যবহার করা যাবে।

## Update-এর আগে

1. Database backup নিন।
2. Application Root-এর backup নিন।
3. নিচের persistent item মুছবেন বা overwrite করবেন না:
   - `.env`
   - `.p2pflow/`
   - `shared/`
   - external MariaDB/MySQL/PostgreSQL database ও credentials
   - hosting-specific persistent upload/release directory
4. সম্ভব হলে current `/ready` page এবং current version note করে রাখুন।

## Manual Update

1. `P2PFlow_v1.5.14_UNIFIED.zip` temporary folder-এ extract করুন।
2. Extract করা application files P2PFlow Application Root-এ copy করে existing application files overwrite করুন।
3. ZIP-এর parent folder নয়—ZIP-এর ভেতরের file/folder সরাসরি Application Root-এ থাকতে হবে।
4. Dependency install command চালান:

```text
npm ci --omit=dev --ignore-scripts
```

5. Build verification চালান:

```text
npm run build
```

6. Hosting control panel থেকে Node.js application restart/deploy করুন। Startup file `server.js` থাকবে।
7. `/ready` খুলে version `1.5.14` এবং ready status যাচাই করুন।
8. Browser-এ একবার hard refresh করুন, যাতে `style.css`, `app.js`, Orders, Ads, Users এবং Accounting module-এর v1.5.14 asset load হয়।

## Update-এর পর প্রয়োজনীয় configuration

### A. Security Question

1. **Users & Permissions** খুলুন।
2. User-এর **Edit User / Permissions** খুলুন।
3. **Login Security & Recovery** section-এ Security Question এবং Security Answer দিন।
4. Save করুন। Users page-এ Security Question status `Set` দেখাবে।

### B. Binance Account Permission

1. একই user editor-এর **Global Permissions** section-এ প্রয়োজনীয় permission enable করুন।
2. **Binance Account Permissions** section-এ প্রতিটি Binance account আলাদা করে permission দিন।
3. উদাহরণ:
   - Account A: Orders View + Binance Chat
   - Account B: Ads View + Ads Manage
4. Save করুন। Account grant global permission bypass করবে না; দুই জায়গাতেই প্রয়োজনীয় permission থাকতে হবে।

### C. Orders পরীক্ষা

1. Orders page খুলুন।
2. Binance Account selector থেকে assigned account বেছে নিন।
3. নিশ্চিত করুন শুধু selected account-এর orders দেখা যাচ্ছে।
4. User-এর permission অনুযায়ী Create, Sync, Assign, Split, Chat, Mark as Paid বা Release action available কি না যাচাই করুন।

### D. Ads পরীক্ষা

1. My Ads page খুলুন।
2. Binance Account selector থেকে account বেছে নিন।
3. Sync button দিয়ে selected account sync করুন।
4. `ads.manage` grant থাকলে Create/Edit/Publish/Status/Merchant controls ব্যবহার করুন।
5. অন্য account নির্বাচন করে নিশ্চিত করুন প্রথম account-এর ads সেখানে দেখাচ্ছে না।

### E. Individual-Only Profit

1. Users & Permissions -> Edit User খুলুন।
2. **Include this user's profit in company income and capital totals** checkbox OFF করুন।
3. Accounting Overview/Capital/Daily Closing খুলুন।
4. User-এর income individual row-এ দৃশ্যমান এবং **Individual-only Profit Excluded**-এ দেখাচ্ছে কি না যাচাই করুন।
5. **Company-counted User Profit** ও **Company Recognized Asset**-এ ওই profit অন্তর্ভুক্ত হবে না।

## Optional Full Verification

Production data backup নেওয়ার পর server terminal access থাকলে চালানো যায়:

```text
npm test
```

এই suite release, authentication, mail failover, account-scoped Binance RBAC, database encryption/persistence, update rollback এবং accounting checks চালায়।

## Rollback

Update startup fail করলে managed supervisor আগের valid release pointer restore করতে পারে। Manual rollback প্রয়োজন হলে:

1. Application বন্ধ করুন।
2. v1.5.14-এর আগে নেওয়া application backup restore করুন।
3. Persistent `.env`, `.p2pflow`, `shared/` এবং database অপরিবর্তিত রাখুন।
4. `npm ci --omit=dev --ignore-scripts` চালিয়ে restart করুন।

এই update কোনো নতুন third-party runtime dependency যোগ করে না। Existing database data replace বা reset করা হয় না।
