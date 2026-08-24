# P2PFlow v1.6.0 — Frontend Architecture Refactor

**Application:** 1.6.0  
**Database schema:** 37  
**Database migration:** প্রয়োজন নেই

## কেন এই release

v1.5.x-এ backend/business feature দ্রুত বাড়ার সঙ্গে frontend-এর route rendering, document scrolling এবং background refresh একই DOM tree-কে বারবার স্পর্শ করছিল। ফলে slow network বা realtime event-এর সময় header/sidebar সরে যাওয়া, page jump, পুরোনো request পরে এসে নতুন page overwrite করা, form focus/scroll হারানো এবং `/#/...` URL-এর ওপর অতিরিক্ত নির্ভরতা দেখা যাচ্ছিল।

v1.6.0 এই সমস্যাগুলোকে CSS hotfix হিসেবে নয়, frontend architecture level-এ আলাদা করেছে। Backend order/accounting/RBAC/Binance logic অপরিবর্তিত রেখে authenticated UI-কে fixed-shell SPA runtime-এ নেওয়া হয়েছে।

## 1. Permanent AppShell

Authenticated app এখন তিনটি স্থায়ী অংশে বিভক্ত:

```text
Browser viewport (100dvh, document scroll disabled)
├── Sidebar
│   ├── Brand / user
│   ├── Navigation (নিজস্ব scroll)
│   └── Server status / logout
└── Workspace
    ├── Top Header (স্থায়ী)
    └── Route Viewport (শুধু এই অংশ page scroll করে)
```

Desktop-এ sidebar এবং top header page content-এর সঙ্গে আর scroll করে না। Mobile-এ sidebar overlay/drawer হিসেবেই থাকে। `html`, `body`, `#app` এবং `.main` viewport-bound; browser document scrolling বন্ধ।

## 2. Clean History API URLs

Canonical URL-এ আর hash প্রয়োজন নেই। উদাহরণ:

- `/dashboard`
- `/orders`
- `/orders/71206`
- `/p2p/market`
- `/p2p/messages`
- `/p2p/advertisements`
- `/payments/accounts`
- `/payments/statement/account/42`
- `/accounting`
- `/accounting/expenses`
- `/system/settings`
- `/system/update`

পুরোনো `/#/orders/71206` bookmark/link এখনও readable; client সেটিকে clean route-এ migrate করে। নতুন runtime notification/login/PWA navigation clean URL ব্যবহার করে।

## 3. Direct refresh / server History fallback

Node static server known application route-গুলোতে `index.html` serve করে। তাই `/orders/71206` বা `/system/update` browser address bar থেকে সরাসরি খুলে Refresh দিলেও 404 হওয়ার কথা নয়। Static asset এবং `/api/...` behavior অপরিবর্তিত।

## 4. Per-route persistent DOM hosts

প্রতিটি route-এর নিজস্ব DOM host আছে। Active route-টাই live document-এ attached থাকে; inactive route host detach হয়ে memory-তে থাকে। এতে:

- duplicate element ID live DOM-এ থাকে না;
- page-specific form state/DOM preserve করা যায়;
- route-এ ফিরে এলে target page নিজের view সঙ্গে সঙ্গে restore করতে পারে;
- প্রতিটি route-এর scroll position আলাদা থাকে;
- LRU limit দিয়ে inactive host memory bounded রাখা হয়।

## 5. Latest Navigation Wins

প্রতিটি route change নতুন navigation scope তৈরি করে। আগের pending navigation request `AbortController` দিয়ে cancel হয়। কোনো response cancel হওয়ার আগেই network থেকে ফিরে এলেও route/page guard mismatch হলে current view-এ commit করতে পারে না।

অর্থাৎ `Accounting → Orders → Settings` দ্রুত click করলে পুরোনো Accounting বা Orders response পরে এসে Settings-এর জায়গা দখল করতে পারবে না। Browser Back/Forward `popstate` দিয়েও একই route authority ব্যবহার করে।

## 6. Page lifecycle registry

সব application page একটি explicit runtime registry-তে আছে। Route ছাড়ার সময় page-specific background lifecycle বন্ধ হয়, যেমন:

- P2P Market refresh timer / observer
- Order detail and chat sync
- P2P Message inbox refresh
- Ads polling
- Accounting refresh timer

এতে inactive page background task current page-এর UI-তে কাজ করার সুযোগ কমে। Existing page code আলাদা `public/js/pages/*.js` file-এই আছে; business feature loss করা হয়নি।

## 7. Dynamic data patch, shell replacement নয়

Realtime/API refresh client-side declarative view snapshot তৈরি করতে পারলেও active route host আর destroy/recreate হয় না। Stable DOM morph layer existing node-গুলো patch করে। Focus, input caret, open details এবং keyed internal scroll container preserve করার logic বহাল আছে।

Orders/Chat/Market/Ads-এর dedicated incremental updater আগের মতোই থাকে। Chat message WSS/fallback দিয়ে আসে, order/list data realtime refresh হয়, কিন্তু sidebar/header/browser document reload হয় না।

## 8. Route-only scrolling

`window.scrollTo/window.scrollBy/window.scrollY` dependency page modules থেকে সরানো হয়েছে। Scroll-aware feature এখন active route viewport ব্যবহার করে। P2P Market infinite loading/pull-to-refresh, page restoration এবং mobile navigation route-scroller aware।

Settings sticky navigation এবং Order side panel-এর sticky offset fixed header-এর বাইরে নতুন route viewport-এর জন্য adjust করা হয়েছে।

## 9. Overflow / scrollbar stability

Global loading progress fixed clipped overlay; animation viewport width বাড়াতে পারে না। Main route host horizontal overflow hidden রাখে; প্রয়োজনীয় table/chip container নিজেদের horizontal scroll করতে পারে। Vertical route scrollbar layout-safe থাকে।

## 10. Existing features preserved

এই release frontend architecture refactor। v1.5.x-এর নিচের featureগুলো intentionally preserved:

- Binance multi-account credential isolation
- Orders / Assignment / Work Status / Order-only assignment mode
- Realtime P2P chat + camera/image retry
- Payment Split / proof policy / Mark Paid / Release
- FUND_PWD RSA/OAEP-SHA256 flow + P2PFlow local verification + secret vault
- Advertisement reference UI, BUY/SELL payment-method separation, max 5 methods
- Payment Accounts / bulk / accounting / ledger / reports
- Permission-authoritative RBAC
- Notifications / Push / session/trusted-device security
- Signed System Update / rollback / database backup

## Validation completed in build environment

- `node scripts/check-all-js.js`
- dedicated `frontend-architecture-v160-self-test.js`
- fixed-shell/navigation regression
- complete `npm run build`
- complete `npm test`
- PHP syntax checks
- Unified ZIP integrity and sensitive/runtime-file scan
- final ZIP clean-extract build/test verification

Production browser/network endurance and live Binance mutations are deployment-time checks; they are not claimed as executed inside the build environment.
