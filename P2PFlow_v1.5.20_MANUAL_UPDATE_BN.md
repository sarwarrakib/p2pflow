# P2PFlow v1.5.20 — Manual Update Guide

## লক্ষ্য

Existing P2PFlow installation-কে application version `1.5.20`, schema `33`-এ update করা। এই update session stability, performance, background Web Push, global Work Status এবং smooth chat যোগ করে।

## ১. Update-এর আগে backup

অবশ্যই backup নিন:

- Production database-এর encrypted/full backup
- `.env`
- `.p2pflow/`
- `shared/`
- reverse-proxy/systemd/hosting configuration

Update ZIP-এর application files দিয়ে উপরোক্ত persistent data overwrite করবেন না।

## ২. Maintenance window

- নতুন order/Ad mutation সাময়িক বন্ধ রাখুন।
- active agents-কে maintenance জানান।
- current version এবং database health লিখে রাখুন।
- rollback-এর জন্য previous application directory/ZIP রাখুন।

## ৩. Files replace

`P2PFlow_v1.5.20_UNIFIED.zip` temporary directory-তে extract করুন। Existing application root-এ safe application files copy করুন। Preserve করুন:

```text
.env
.p2pflow/
shared/
database/external database data
releases/
runtime logs
```

Release ZIP-এ runtime secrets বা business database থাকার কথা নয়।

## ৪. Production dependencies

Node.js 20+ ব্যবহার করুন:

```bash
npm ci --omit=dev --ignore-scripts
```

`npm install` দিয়ে lockfile পরিবর্তন করবেন না।

## ৫. Build ও test

```bash
npm run build
npm test
```

Production preflight available হলে:

```bash
npm run preflight:production
```

কোনো test fail হলে service restart/public traffic চালু করবেন না।

## ৬. Environment / Web Push

HTTPS এবং exact public origin নিশ্চিত করুন:

```text
P2PFLOW_PUBLIC_BASE_URL=https://panel.example.com
P2PFLOW_ALLOWED_HOSTS=panel.example.com
P2PFLOW_WEB_PUSH_SUBJECT=https://panel.example.com
```

VAPID public/private key blank থাকলে application encrypted database-এ একবার generate করে। Existing database preserve করলে existing subscriptions কাজ করবে। নতুন server/database-এ migrate করার সময় existing VAPID key pair হারালে browserগুলোকে পুনরায় Notifications ON করতে হবে। Optional fixed values:

```text
P2PFLOW_WEB_PUSH_PUBLIC_KEY=
P2PFLOW_WEB_PUSH_PRIVATE_KEY=
```

Private key কখনো GitHub, screenshot বা public log-এ দেবেন না।

## ৭. Service restart

Systemd উদাহরণ:

```bash
sudo systemctl restart p2pflow
sudo systemctl status p2pflow --no-pager
```

Hosting panel হলে configured Node application restart action ব্যবহার করুন।

## ৮. Browser cache

- Browser hard refresh করুন।
- CDN/reverse-proxy static cache purge করুন।
- DevTools/Application থেকে `sw.js` version `1.5.20` asset load হচ্ছে কিনা দেখুন।
- পুরোনো tab বন্ধ করে নতুন tab খুলুন।

## ৯. Session regression test

1. Normal login করুন।
2. Device Bond/Trust করুন।
3. Screen ON রেখে Wi-Fi থেকে mobile data বা অন্য network-এ যান।
4. Orders, Ads, Chat page খুলুন।
5. Secret-code login page-এ না গিয়ে session সচল থাকা নিশ্চিত করুন।
6. Security থেকে device revoke করলে session block হচ্ছে কিনা আলাদাভাবে যাচাই করুন।

## ১০. Background notification setup

### Android/Desktop

1. Security page-এ browser/device Bond/Trust করুন।
2. Chat page-এর উপরে **Notifications OFF** button click করুন।
3. Browser permission prompt-এ Allow দিন।
4. Button **Notifications ON** দেখাচ্ছে নিশ্চিত করুন।
5. Test notification বা controlled assigned order/message পাঠান।
6. App background এবং phone locked অবস্থায় notification আসে কিনা দেখুন।

### iPhone/iPad

1. Safari থেকে site খুলুন।
2. Share → **Add to Home Screen** করুন।
3. Home Screen icon থেকে P2PFlow খুলুন।
4. Login ও Bond/Trust করুন।
5. Notifications ON click করে permission দিন।
6. Home Screen web app background/locked test করুন।

OS Focus/Do Not Disturb, battery optimization, notification channel settings বা browser policy sound suppress করতে পারে। Background custom sound guarantee করা যায় না।

## ১১. Work Status test

- Admin, Manager, Agent এবং অন্য enabled user-এ top bar button দেখা যাচ্ছে কিনা দেখুন।
- Agent Work ON, browser offline: eligible test order auto-assign হয় কিনা।
- Agent Work PAUSED, browser online: নতুন order assign না হওয়া।
- Existing assigned order PAUSED করলেও মুছে না যাওয়া।
- Exact Binance account permission/routing/capacity এখনও enforce হওয়া।

## ১২. Orders/Ads performance test

- Orders page first load ও account switch timing দেখুন।
- Unread badges-এর জন্য duplicate requests কমেছে কিনা browser Network tab-এ দেখুন।
- Ads page cached list দ্রুত render হচ্ছে কিনা দেখুন।
- Explicit Sync এবং Business/Online/Break exact selected account-এ কাজ করছে কিনা controlled test করুন।

## ১৩. Smooth chat test

1. একটি Binance order chat খুলুন।
2. অন্য device/account থেকে message পাঠান।
3. পুরো page white-flash/reload না হয়ে শুধু নতুন bubble append হচ্ছে নিশ্চিত করুন।
4. পুরোনো message পড়ার সময় নতুন message এলে scroll না লাফিয়ে **New messages** button আসে কিনা দেখুন।
5. Text এবং media send-এর পর composer/scroll অক্ষত আছে কিনা দেখুন।
6. P2P Message inbox search focus রেখে background refresh test করুন।

## ১৪. Rollback

Code rollback প্রয়োজন হলে:

- Service stop করুন।
- Previous application files restore করুন।
- Database schema `33` additive; previous compatible release সাধারণত unknown fields preserve করে, তবুও verified database backup ছাড়া rollback করবেন না।
- Service start করে login/orders/ads পরীক্ষা করুন।

## বাধ্যতামূলক সততা

এই package build/test environment-এ real Binance credential দিয়ে live order, Ad বা chat mutation এবং real locked mobile device-এ push delivery করা হয়নি। Public traffic-এর আগে আপনার staging/production HTTPS domain ও actual devices-এ verification সম্পন্ন করুন।
