# P2PFlow v1.7.8 — Interactive Speed Restore

## লক্ষ্য

v1.5.30-এর fast page interaction অনুভূতি ফিরিয়ে আনা, কিন্তু v1.7.7-এর current design/features এবং stale-request-safe navigation architecture অক্ষুণ্ণ রাখা।

## প্রধান পরিবর্তন

- Heavy data pages-এ recursive whole-page DOM morph বাদ দিয়ে viewport-preserving native commit।
- Initial bundle lean রেখেই common page modules background/idle warmup।
- Navigation hover/focus/touch intent-এ target module আগেভাগে preload।
- প্রতিটি route change-এ full sidebar rebuild বাদ; active navigation state-only update।
- Persistent detached route-host cache 12 → 6।
- English UI-তে unnecessary full DOM language traversal skip।
- Bengali translation bounded cache যোগ।
- Existing `navigationEpoch` + `AbortController` latest-navigation-wins protection রাখা হয়েছে, তাই v1.5.30-এর old-page-late-response jump-back bug ফিরছে না।
- v1.7.7 database persistence ticket / settings 504 fix রাখা হয়েছে।
- v1.7.6 Binance API scheduler + WS-first realtime architecture রাখা হয়েছে।

## Design / feature safety

`public/style.css` v1.7.7-এর সঙ্গে byte-identical। Current feature/page modules remove করা হয়নি। Optimization মূলত app shell, module scheduling, render commit এবং navigation runtime-এ।

## Compatibility

- Version: **1.7.8**
- Database schema: **37 — unchanged**
- Migration: **not required**
- Existing `.env`, `.p2pflow`, `shared/` এবং database অবশ্যই preserve করতে হবে।
