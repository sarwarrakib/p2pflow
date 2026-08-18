# P2PFlow v1.5.20 — Public Launch Checklist

সব বাধ্যতামূলক item pass না হওয়া পর্যন্ত public traffic চালু করবেন না।

## Package ও backup

- [ ] `P2PFlow_v1.5.20_UNIFIED.zip` SHA-256 verify করা হয়েছে।
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

## Domain ও transport

- [ ] Valid HTTPS certificate।
- [ ] `P2PFLOW_PUBLIC_BASE_URL` exact HTTPS origin।
- [ ] `P2PFLOW_ALLOWED_HOSTS` exact production hosts।
- [ ] Trusted proxy config deployment-এর সঙ্গে মেলে।
- [ ] HTTP → HTTPS redirect।
- [ ] SSE buffering disabled এবং long-lived connections কাজ করে।

## Session stability ও security

- [ ] Bonded device-এ Wi-Fi/mobile-network switch করলে logout হয় না।
- [ ] Screen ON/active ব্যবহারকালে random secret-code login হয় না।
- [ ] Revoked trusted device access বন্ধ হয়।
- [ ] Disabled user session বন্ধ হয়।
- [ ] CSRF, Host এবং Origin controls কাজ করে।
- [ ] Security Question, trusted-device এবং emergency login controlled test হয়েছে।

## Web Push

- [ ] `sw.js` HTTPS-এ 200 এবং correct JavaScript MIME দেয়।
- [ ] `manifest.webmanifest` load হয়।
- [ ] VAPID subject production origin/mailto।
- [ ] VAPID private key encrypted/preserved এবং public source/log-এ নেই।
- [ ] Android/desktop bonded device subscription সফল।
- [ ] iPhone/iPad Home Screen web app subscription সফল, যদি iOS support প্রয়োজন হয়।
- [ ] New assigned order background notification আসে।
- [ ] New Binance message background notification আসে।
- [ ] Phone lock/app inactive test pass।
- [ ] Notifications OFF করলে background notification আসে না।
- [ ] OS Focus/DND ও notification-channel behavior documented।

## Work Status

- [ ] সব enabled user top bar-এ Work button দেখে।
- [ ] Chat ও Orders area-তেও button দেখা যায়।
- [ ] Agent Work ON + offline হলে eligible order assign হয়।
- [ ] Agent Work PAUSED + online হলে নতুন assignment হয় না।
- [ ] Permission, exact Binance account, routing ও capacity boundary অক্ষত।

## Orders ও Ads performance

- [ ] Orders first load acceptable latency।
- [ ] Combined navigation count endpoint কাজ করে।
- [ ] Orders unread count duplicate request ছাড়া আসে।
- [ ] Ads initial cached render দ্রুত।
- [ ] Manual Ads refresh exact account live state আনে।
- [ ] দুইটি Binance account-এর Ads update/publish controlled test pass।
- [ ] All/selected account Business, Online, Break behavior pass।

## Smooth Chat

- [ ] Incoming message পুরো order page reload করে না।
- [ ] Outgoing text/media পুরো page reload করে না।
- [ ] Chat scroll bottom behavior smooth।
- [ ] পুরোনো message পড়লে new-message button আসে; forced jump হয় না।
- [ ] P2P Message inbox partial refresh search/focus preserve করে।
- [ ] Message read state/unread badge সঠিক।

## Multi-account/RBAC

- [ ] User শুধু permitted Binance account buttons দেখে।
- [ ] Orders/Ads exact account permission enforce হয়।
- [ ] Agent নিজের payment accounts-এ সীমাবদ্ধ।
- [ ] Admin/Manager all payment accounts access পায়।
- [ ] Offline Business reservations cross-order reuse block করে।

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
- [ ] Real locked-device push test pass।
- [ ] Owner launch approval দিয়েছে।
