# P2PFlow v1.5.21 — Public Launch Checklist

সব বাধ্যতামূলক item pass না হওয়া পর্যন্ত public traffic চালু করবেন না।

## Package ও backup

- [ ] `P2PFlow_v1.5.21_UNIFIED.zip` SHA-256 verify করা হয়েছে।
- [ ] Database backup নেওয়া হয়েছে।
- [ ] Backup অন্য server/storage-এ restore test হয়েছে।
- [ ] `.env`, `.p2pflow/`, `shared/` এবং reverse-proxy config backup আছে।
- [ ] Release package-এ runtime secret/database/private key নেই।

## Runtime

- [ ] Node.js 20+।
- [ ] `npm ci --omit=dev --ignore-scripts` সফল।
- [ ] `npm run build` সফল।
- [ ] `npm test` সফল।
- [ ] Production preflight সফল।
- [ ] Service restart-এর পরে stable/healthy।

## Payment Account Serial scope

- [ ] Same Payment Method + same non-empty Label + same Serial block হয়।
- [ ] Same Payment Method + different non-empty Label + same Serial save হয়।
- [ ] Different Payment Method + same Label/Serial save হয়।
- [ ] Blank Label একই Payment Method-এর পুরো serial namespace reserve করে।
- [ ] Blank Label serial labeled account-এর same serial-এর সঙ্গে conflict করে।
- [ ] Label/Serial case, repeated spaces ও Unicode normalization bypass করা যায় না।
- [ ] Edit current account নিজেকে duplicate ধরে না।
- [ ] Payment Method/Label/Serial edit করলে final scope পুনরায় validate হয়।
- [ ] Bulk Add একই scope-এর duplicate row দেখায় ও save block করে।
- [ ] Bulk backend validation atomic; error হলে কোনো account create হয় না।
- [ ] Serial conflict response অন্য account-এর private details প্রকাশ করে না।

## Payment Account permissions

- [ ] Agent শুধু নিজের Payment Account দেখে/manage করে।
- [ ] Admin/Manager সব Payment Account access পায়।
- [ ] Custom role own/all scope অনুযায়ী কাজ করে।
- [ ] Number/Label/Serial search permission scope মানে।
- [ ] Offline Business candidate list permission ও reservation মানে।

## Domain ও transport

- [ ] Valid HTTPS certificate।
- [ ] `P2PFLOW_PUBLIC_BASE_URL` exact HTTPS origin।
- [ ] `P2PFLOW_ALLOWED_HOSTS` exact production hosts।
- [ ] Trusted proxy config deployment-এর সঙ্গে মেলে।
- [ ] HTTP → HTTPS redirect।
- [ ] SSE buffering disabled এবং long-lived connections কাজ করে।

## Session, push ও work status

- [ ] Bonded device-এ Wi-Fi/mobile-network switch করলে logout হয় না।
- [ ] Revoked trusted device access বন্ধ হয়।
- [ ] New assigned order background notification আসে।
- [ ] New Binance message background notification আসে।
- [ ] Notifications OFF করলে background notification আসে না।
- [ ] Agent Work ON + offline হলে eligible order assign হয়।
- [ ] Agent Work PAUSED + online হলে নতুন assignment হয় না।

## Orders, Ads ও Chat

- [ ] Orders first load acceptable latency।
- [ ] Ads initial cached render দ্রুত।
- [ ] দুই Binance account-এর Ads update/publish controlled test pass।
- [ ] Incoming/outgoing chat message পুরো page reload করে না।
- [ ] Chat scroll/focus smooth থাকে।
- [ ] Exact Binance account permission enforce হয়।

## Operations

- [ ] SMTP primary/fallback test pass।
- [ ] Log rotation ও disk/database alerts আছে।
- [ ] Backup age/certificate expiry/service-down monitoring আছে।
- [ ] Signed update ও rollback drill staging-এ হয়েছে।
- [ ] Browser hard refresh/CDN cache purge করা হয়েছে।
- [ ] Chrome/Edge/Firefox/Safari এবং target mobile devices smoke-tested।
- [ ] Controlled load test acceptable।

## Launch approval

- [ ] কোনো Critical/High unresolved defect নেই।
- [ ] Real Binance read-only sync pass।
- [ ] Small controlled live order/chat/Ad tests pass।
- [ ] Owner launch approval দিয়েছে।
