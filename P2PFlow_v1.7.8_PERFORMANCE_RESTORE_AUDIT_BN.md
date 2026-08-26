# P2PFlow v1.7.8 — Legacy-Speed / Current-Feature Performance Restore Audit

## উদ্দেশ্য

v1.5.30-এর দ্রুত অনুভূতি ফিরিয়ে আনা, কিন্তু v1.7.7-এর বর্তমান feature, permission, realtime flow, design এবং **latest navigation wins** architecture অক্ষুণ্ণ রাখা। পুরনো navigation race আবার ফিরিয়ে আনা যাবে না।

## v1.5.30 বনাম v1.7.7 source comparison থেকে root cause

### 1. First visit slow, second visit faster

v1.5.30 প্রায় সব page JavaScript initial HTML থেকেই eager-load করত। তাই bootstrap বড় হলেও page-এ প্রথম click-এর সময় আলাদা module download/parse অপেক্ষা কম ছিল।

v1.7.7 initial bootstrap ছোট করার জন্য page modules lazy-load করে। ফলে কোনো page প্রথমবার খোলার সময় তার module network/parse path-এ যায়; দ্বিতীয়বার browser cache/module registry থেকে পাওয়া যায়। User-এর observed “প্রথমবার slow, দ্বিতীয়বার faster” আচরণের সঙ্গে এটি সরাসরি মিলে যায়।

Measured Brotli-q5 basis:

- v1.5.30 initial scripts: ~224.8 KB
- v1.7.7 initial scripts: ~137.8 KB
- v1.7.7 therefore smaller initial transfer, কিন্তু first page visit module cost পরে দেয়।

### 2. Large-page generic DOM morph CPU cost

v1.7.7-এর `stableMorphContent()` / recursive `morphStableNode()` full-page DOM tree compare/move করে। Orders, Ads, Accounting, Chat-এর মতো বড় DOM-এ native replacement-এর তুলনায় main-thread CPU, DOM traversal এবং layout work বাড়ে।

v1.5.30 native content replacement করত, তাই large page render noticeably lighter ছিল।

### 3. পুরনো navigation race আসলেই architecture bug ছিল

v1.5.30-তে slow page A request pending থাকা অবস্থায় page B click করলে B আগে render হতে পারত; পরে A-এর পুরনো async completion UI-কে আবার A-তে ফিরিয়ে দিতে পারত।

v1.7.7-এর `navigationEpoch`, `AbortController`, navigation scope এবং route/page render guard এই race ঠিক করে। v1.7.8-এ এই protection **পুরোটাই রাখা হয়েছে**।

### 4. Route host memory / repeated navigation work

v1.7.7 detached route DOM host বেশি retain করতে পারত এবং প্রতিটি navigation-এ পুরো sidebar/navigation tree rebuild করত। Heavy pages বেশি ব্যবহার করলে memory pressure/GC এবং unnecessary DOM handler work বাড়তে পারে।

### 5. Language traversal overhead

প্রতি page render-এর পরে English UI-তেও full subtree text traversal হচ্ছিল। বড় table/list DOM-এর জন্য এটি unnecessary work। Bengali translation-এর repeat phrase work-ও cache করা ছিল না।

## v1.7.8 hybrid architecture

### Native fast commit for heavy pages

Orders, Chat, Ads, P2P Market/Profile, Accounts, Accounting family, Settings, Notifications, Activity, Agents, Security/Health এবং অন্যান্য heavy data screens native content commit ব্যবহার করে।

- design markup পরিবর্তন করা হয়নি
- page-specific realtime DOM patches অক্ষুণ্ণ
- viewport capture/restore করা হয়
- small/light view-এর জন্য stable morph fallback এখনও আছে

এতে generic recursive whole-page morph hot path থেকে heavy pages বের হয়েছে।

### Lazy bootstrap + proactive warmup

v1.7.8 initial page transfer v1.7.7-এর মতো lean থাকে, কিন্তু old eager-load speed-এর সুবিধা ফিরিয়ে আনতে দুই স্তরের warmup যোগ হয়েছে:

1. `pointerenter`, `focus`, `touchstart` navigation intent দেখলেই target page module preload হয়।
2. initial route settle হওয়ার ~180ms পরে visible/allowed page modules idle/background-এ warm হয়।

Priority: Orders → Chat → Ads → P2P Market → P2P Profile → Dashboard → Accounts → Notifications → Settings → Accounting → remaining visible pages.

ফলে user প্রথমবার page click করার আগেই অধিকাংশ common module ready হওয়ার সুযোগ পায়; initial bootstrap আবার 1 MB-এর eager bundle করা হয়নি।

### Navigation active-state only update

প্রতিটি route change-এ `renderNav()` দিয়ে sidebar recreate না করে `syncNavigationActiveState()` শুধু active classes/group state/badges/mobile state update করে। Full nav render boot/permission rebuild-এর জন্য থাকে।

### Route host cache bounded

Persistent route-host limit 12 → 6 করা হয়েছে। Heavy detached pages দীর্ঘ সময় retain না করে memory/GC pressure bounded রাখা হয়।

### i18n fast path

- English mode-এ previously Bengali-translated না হওয়া fresh subtree-এর full language walk skip হয়।
- Bengali phrase result bounded cache (2500 entries) ব্যবহার করে।
- Bengali → English switch-এর original-text restore behavior রাখা হয়েছে।

## Feature/design preservation verification

- `public/style.css` v1.7.7 এবং v1.7.8 byte-identical SHA-256:
  `5935bee69b7c4ea9e79d3cc8c28853f2ac1d08a2db6a94a6af81a222b6adf7da`
- Existing page modules/features remove করা হয়নি।
- Version bump ছাড়া feature module source intentionally rewritten করা হয়নি; main optimization host/runtime architecture-এ।
- v1.7.7 persistence ticket / 504 fix অক্ষুণ্ণ।
- v1.7.6 Binance scheduler, WS-first chat, realtime/SSE protections অক্ষুণ্ণ।

## Network/bootstrap measurement

Brotli quality 5 basis:

- v1.7.7 initial: ~137.8 KB
- v1.7.8 initial: ~138.9 KB

অর্থাৎ proactive warm architecture যোগ করেও initial compressed payload প্রায় একই রাখা হয়েছে। Warmed modules background/intent timing-এ আসে, critical first paint-কে all-page eager bundle দিয়ে block করে না।

## Regression tests

নতুন `interactive-performance-v178-self-test.js` যাচাই করে:

- v1.7.8 version
- latest-navigation cancellation এখনও আছে
- heavy route native commit gate
- viewport preservation
- route host bound = 6
- background module warmup
- navigation-intent warmup
- English i18n fast path
- Bengali translation cache
- active-only navigation state sync
- stable morph fallback এখনও আছে

Full project `npm test` এবং `npm run build` pass করতে হবে release package তৈরির আগে।

## Production expectation

এই release browser-side structural bottleneck target করে: first-page module wait, generic DOM morph CPU, repeated nav rebuild, retained DOM এবং unnecessary i18n traversal। এটি production network, database, VPS CPU, reverse proxy বা external Binance latency-এর fixed millisecond guarantee দেয় না। তবে application নিজে যে avoidable delay তৈরি করছিল তার সবচেয়ে বড় identified frontend hot paths সরানো হয়েছে।
