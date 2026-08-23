# P2PFlow v1.5.40 — Release Notes

**Application:** 1.5.40  
**Database schema:** 37  
**Migration:** প্রয়োজন নেই

## ১. Fixed-shell SPA architecture

এই release-এর মূল পরিবর্তন UI patch নয়; authenticated frontend-এর navigation/render structure বদলানো হয়েছে। Sidebar, topbar এবং content viewport application lifetime-এ স্থায়ী থাকে। Normal backend update আর পুরো browser page বা application shell reload করে না।

প্রতিটি route-এর rendered DOM আলাদা cache-এ রাখা হয়। User অন্য page-এ গেলে current route DOM detach হয়ে cache-এ থাকে এবং target route-এর cached view থাকলে সঙ্গে সঙ্গে restore হয়। Cached view না থাকলে target page-এর static shell সঙ্গে সঙ্গে mount হয়। ফলে slow network-এর সময় আগের page আর screen-এ পড়ে থাকে না।

## ২. Static structure, dynamic data only

Dashboard, P2P Market, Orders, Order Detail, P2P Message, Advertisements, Settings, System Update এবং বাকি route-গুলোর জন্য page-specific static loading shell আছে। Dynamic data API/SSE/WSS থেকে এলে existing view patch/morph হয়। Server থেকে normal page navigation-এর জন্য নতুন HTML document fetch করা হয় না।

একই route-এর update-এ stable DOM morph layer:

- existing element যতটা সম্ভব reuse করে;
- focused input/textarea/select value ও caret ধরে রাখে;
- open `<details>` state ধরে রাখে;
- window scroll ধরে রাখে;
- keyed scroll container-এর scrollTop/scrollLeft ধরে রাখে;
- নতুন/removed dynamic row প্রয়োজন অনুযায়ী add/remove করে।

## ৩. Old page / delayed response overwrite বন্ধ

Navigation এখন strict **Latest Navigation Wins**। নতুন page/order navigation শুরু হলে পুরোনো navigation GET/render controller abort হয়। পুরোনো response দেরিতে ফিরলেও current route-এর DOM commit করতে পারে না।

System Update page-এর direct/neutral control request-এও আলাদা render guard + parent abort signal যোগ হয়েছে, কারণ এটি generic `api()` wrapper-এর বাইরে fetch ব্যবহার করত।

## ৪. প্রতি সেকেন্ডে scrollbar/jump fix

Screenshot-এ দেখা horizontal scrollbar আসা-যাওয়ার একটি root cause ছিল route progress bar। এটি `overflow:visible` রেখে animated transform করায় progress element viewport width-এর বাইরে যেত; animation cycle অনুযায়ী browser horizontal scroll range তৈরি/সরাত।

v1.5.40-এ:

- route progress fixed overlay;
- `overflow:hidden`;
- viewport width-এর মধ্যে clipped;
- desktop sidebar offset-এর সঙ্গে fixed;
- mobile-এ left/right viewport-bound;
- `html`-এ stable vertical scrollbar gutter;
- `html/body/app/main/#content` horizontal overflow-contained।

Background data patch-এর সময় পুরোনো full-content opacity/translate effect-ও সরানো হয়েছে।

## ৫. Realtime event policy

Generic `db_updated` event এখন আর সব page rerender করতে পারে না। Approved non-destructive pages-ই background patch পায়। Orders, Ads, P2P Market ও Chat তাদের dedicated incremental realtime updater ব্যবহার করে। Settings-এর মতো form-heavy page generic event-এ rebuild হয় না।

## ৬. System Update স্থিতিশীলতা

System Update-এর hero, overview, settings, installed versions, backups এবং guide stable keys ব্যবহার করে। Release polling/status update existing nodes patch করে। Page ছেড়ে গেলে pending System Update fetch/render current page overwrite করতে পারে না।

Actual signed update install শেষে service নতুন version-এ online হলে intentional full reload থাকে—এটাই normal data refresh-এর একমাত্র ব্যতিক্রম।

## ৭. Compatibility

- Database schema 37 অপরিবর্তিত।
- v1.5.38 Advertisement UI/payment-method rules অপরিবর্তিত।
- v1.5.37 field-level Fund Password vault অপরিবর্তিত।
- v1.5.36 Binance FUND_PWD RSA/OAEP-SHA256 flow অপরিবর্তিত।
- v1.5.33 realtime chat/order discovery অপরিবর্তিত।

## ৮. Verification

Source tree-এ 95 JavaScript file syntax check, stable-shell/navigation tests, realtime UI tests এবং সম্পূর্ণ `npm test` pass করা হয়েছে। Final package clean-extract করেও build/test পুনরায় চালাতে হবে/চালানো হয়েছে release packaging-এর final verification ধাপে।
