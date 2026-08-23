# P2PFlow v1.5.39 — Release Notes

**Application:** 1.5.39  
**Database schema:** 37  
**Migration:** প্রয়োজন নেই

## Stable Shell architecture

এই release-এর মূল লক্ষ্য page jump, repeated HTML reload, chat disappear/reappear এবং slow response-এর কারণে পুরোনো page পরে এসে current page overwrite করা বন্ধ করা।

- Authenticated application shell (sidebar, topbar, current view structure) আর transient API/hosting challenge-এর কারণে `window.location.reload()` করবে না।
- Navigation-এর জন্য **Latest Navigation Wins** policy যোগ হয়েছে। নতুন page/order click হলে আগের pending navigation request abort/stale হয়ে যায় এবং পরে response এলেও DOM পরিবর্তন করতে পারে না।
- একই route বারবার click করলে redundant full render হয় না।
- Slow network-এ current stable screen mounted থাকে; non-blocking top progress indicator data load দেখায়।
- Cancelled/stale request error popup বা destructive error page তৈরি করে না।

## Order detail ও Chat stability

- Order detail load-এর সময় পুরোনো Orders response পরে এসে detail page-কে list দিয়ে replace করতে পারবে না।
- Open order background refresh আর পুরো `#content`/order HTML rebuild করে না। Status, amount, payment details, splits, assignment, approvals ও statement-এর dynamic অংশগুলো in-place patch হয়।
- Chat DOM background order update-এর সময় reconstruct হয় না। ফলে পুরোনো message দেখতে উপরে scroll করলে chat hide/show বা forced jump হওয়ার কথা নয়।
- Incoming message existing realtime WSS + active-chat fallback দিয়ে incremental merge হয়। User bottom-এ না থাকলে viewport একই জায়গায় থাকে।
- Order action-এর delayed response user অন্য page/order-এ চলে গেলে সেই পুরোনো page আবার খুলতে পারে না।

## Orders list

- Background order refresh সম্পূর্ণ page rebuild না করে order section/counts/account state patch করে।
- Scroll position background refresh-এর আগে/পরে preserve হয়।
- Ongoing/Fulfilled group switch cached current dataset ব্যবহার করতে পারে; অপ্রয়োজনীয় network roundtrip কমানো হয়েছে।

## P2P Market

- Rapid filter পরিবর্তনে পুরোনো slow response আর নতুন filter result overwrite করতে পারে না।
- Foreground request-এ request sequence + cancellation guard আছে।
- Background update চলাকালে existing cards/viewport রাখা হয়; transient API failure হলে usable existing data destroy হয় না।
- আগের realtime market refresh/scroll-anchor behavior বজায় আছে।

## Advertisements

- Ads realtime refresh এখন search field, filters, scroll ও static controls পুনর্নির্মাণ না করে card/status/merchant dynamic data patch করে।
- 5-second/background refresh চলার সময় search typing/focus/caret preserve হয়।
- v1.5.38-এর Binance-reference Post Ad UI, BUY generic payment methods, SELL saved account methods, maximum 5 selection এবং live reference-price guide অপরিবর্তিত।

## Settings ও অন্যান্য interactive page

- Settings/P2P Market/Chat/Ads তাদের নিজস্ব stable update loop ব্যবহার করে; generic database event দিয়ে full page render হয় না।
- Top-level page renderers current route authority যাচাই করে; user অন্য page-এ গেলে পুরোনো async callback আর সেই page redraw করতে পারে না।

## Hosting / challenge behavior

আগে API response-এর জায়গায় hosting/browser verification HTML পাওয়া গেলে authenticated frontend automatic full page reload করতে পারত। v1.5.39-এ এই behavior সরানো হয়েছে। Current UI mounted থাকবে এবং connection recover হলে retry করা যাবে। System Update সফলভাবে code switch করার পর যে intentional reload দরকার, সেটি এই পরিবর্তনের আওতার বাইরে।

## Regression coverage

Automated coverage-এ আছে:

- stable navigation shell;
- automatic browser reload disabled for API challenge;
- latest-navigation-wins cancellation;
- stale action/page render blocking;
- non-destructive order detail patching;
- persistent chat DOM/scroll behavior;
- Orders background partial patch;
- P2P Market latest-request-wins;
- Ads background partial patch/search focus preservation;
- existing chat WSS/fallback, fast order discovery and Mark Paid fast path;
- Ads/RBAC/Payment Split/Release Verification/FUND_PWD RSA/security/accounting/database/updater regressions।

## Production note

এই build environment-এ real production Binance order/chat mutation বা real slow-network browser session চালানো হয়নি। Deployment-এর পরে controlled order এবং browser network throttling/slow connection দিয়ে launch checklist-এর stability tests চালান।
