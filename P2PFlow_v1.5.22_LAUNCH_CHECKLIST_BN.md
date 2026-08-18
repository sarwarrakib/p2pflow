# P2PFlow v1.5.22 — Public Launch Checklist

সব বাধ্যতামূলক item pass না হওয়া পর্যন্ত public traffic চালু করবেন না।

## Package ও backup

- [ ] `P2PFlow_v1.5.22_UNIFIED.zip` SHA-256 verify করা হয়েছে।
- [ ] Production database backup নেওয়া হয়েছে।
- [ ] Backup অন্য server/storage-এ restore test হয়েছে।
- [ ] `.env`, `.p2pflow/`, `shared/` এবং reverse-proxy config backup আছে।
- [ ] Release package-এ runtime secret, database, VAPID private key বা master key নেই।

## Runtime

- [ ] Node.js 20+।
- [ ] `npm ci --omit=dev --ignore-scripts` সফল।
- [ ] `npm run build` সফল।
- [ ] `npm test` সফল।
- [ ] Production preflight সফল।
- [ ] Service restart-এর পরে stable/healthy।
- [ ] Browser/CDN cache থেকে v1.5.22 assets load হচ্ছে।

## Work Status placement

- [ ] Header-এ eligible Agent-এর জন্য একটিই Work button আছে।
- [ ] Orders page-এ duplicate Work button নেই।
- [ ] Standalone P2P Message page-এ Work button নেই।
- [ ] Order Details embedded chat-এ Work button নেই।
- [ ] Work OFF Agent online থাকলেও নতুন assignment পায় না।
- [ ] Work ON Agent offline থাকলেও permission/routing/capacity match করলে assignment পায়।
- [ ] Existing assigned order Work OFF করলে মুছে যায় না।

## Live Order permission visibility

- [ ] Global `binance.sync` ছাড়া account grant দিয়ে Work hide bypass করা যায় না।
- [ ] Global ও exact account-level `binance.sync` থাকলে Work button hide হয়।
- [ ] Admin-এর Work button নেই।
- [ ] Non-Agent user-এর meaningless Work button নেই।
- [ ] Permission update open session-এ realtime Work show/hide করে।
- [ ] Exact Binance account RBAC অপরিবর্তিত।

## Notification button placement

- [ ] Standalone P2P Message page-এ Notifications ON/OFF master button আছে।
- [ ] Order Details embedded chat-এ Notification button নেই।
- [ ] Notifications page category preferences আছে কিন্তু duplicate master button নেই।
- [ ] সব standard logged-in role প্রয়োজনীয় notification control access পায়।

## Notifications OFF

- [ ] OFF click-এর সঙ্গে সঙ্গে button OFF হয়।
- [ ] New order foreground sound বাজে না।
- [ ] Assignment foreground sound বাজে না।
- [ ] Incoming P2P message foreground sound বাজে না।
- [ ] Current device browser Push subscription server থেকে remove হয়।
- [ ] Current device local Push subscription unsubscribe হয়।
- [ ] App background/locked থাকলে browser notification আসে না।
- [ ] অন্য bonded device-এর independent subscription অক্ষত থাকে।
- [ ] Disable request fail হলে UI ভুল OFF/ON state-এ আটকে থাকে না।

## Notifications ON ও sound

- [ ] Device bonded/trusted।
- [ ] Valid HTTPS origin।
- [ ] Browser Push/Service Worker support আছে।
- [ ] Notification permission granted।
- [ ] ON click-এর পরে current device subscription active।
- [ ] Selected built-in sound foreground event-এ বাজে।
- [ ] Custom sound app/page চলমান অবস্থায় বাজে।
- [ ] New order browser notification আসে।
- [ ] Assignment browser notification আসে।
- [ ] Incoming P2P message browser notification আসে।
- [ ] Service Worker notification `silent:false` এবং OS/browser sound settings enabled।
- [ ] Fully closed/locked অবস্থার sound OS/browser policy অনুযায়ী বাস্তব device-এ যাচাই হয়েছে।

## Notification preferences

- [ ] Orders Background category কাজ করে।
- [ ] Assignments Background category কাজ করে।
- [ ] P2P Messages Background category কাজ করে।
- [ ] Master OFF সব current-device automatic sound/push block করে।
- [ ] Master ON সব Background category enable করে।
- [ ] In App ও Email preferences আলাদাভাবে কাজ করে।
- [ ] Security notification policy প্রত্যাশিতভাবে mandatory থাকে।

## Orders, Ads ও Chat regression

- [ ] Orders first load acceptable latency।
- [ ] Ads initial cached render দ্রুত।
- [ ] দুই Binance account-এর Ads update/publish controlled test pass।
- [ ] Incoming/outgoing P2P message পুরো page reload করে না।
- [ ] Chat scroll/focus smooth থাকে।
- [ ] Chat credential/WebSocket reconnect stable।
- [ ] Unread counts ও navigation badge সঠিক।

## Session ও device

- [ ] Bonded device-এ Wi-Fi/mobile-network switch করলে logout হয় না।
- [ ] Revoked trusted device access বন্ধ হয়।
- [ ] Session expiry/disabled user fail-closed।
- [ ] Android locked/background push test pass।
- [ ] iPhone/iPad ব্যবহার করলে Home Screen web app push test pass।
- [ ] Target desktop browsers push/sound test pass।

## Existing feature regression

- [ ] Payment Account Agent own-scope ও Admin/Manager all-scope সঠিক।
- [ ] Payment Account Label/Serial scoped uniqueness সঠিক।
- [ ] Offline Business pending account reservation সঠিক।
- [ ] Notification Preferences data persist করে।
- [ ] Security page ও trusted-device controls কাজ করে।
- [ ] Manual Feedback link exact advertiser page খোলে।
- [ ] Accounting, ledger এবং profit exclusion totals সঠিক।

## Operations

- [ ] SMTP primary/fallback test pass।
- [ ] Log rotation ও service/database alerts আছে।
- [ ] Backup age/certificate expiry/service-down monitoring আছে।
- [ ] Signed update ও rollback drill staging-এ হয়েছে।
- [ ] Chrome/Edge/Firefox/Safari এবং target mobile devices smoke-tested।
- [ ] Controlled load test acceptable।

## Launch approval

- [ ] কোনো Critical/High unresolved defect নেই।
- [ ] Real Binance read-only sync pass।
- [ ] Small controlled live order/chat/Ad tests pass।
- [ ] Owner launch approval দিয়েছে।
