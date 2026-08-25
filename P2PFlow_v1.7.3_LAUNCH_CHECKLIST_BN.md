# P2PFlow v1.7.3 — Launch Checklist

## Version / package

- [ ] Application `1.7.3`
- [ ] Database schema `37`
- [ ] SHA-256 downloaded ZIP-এর সঙ্গে মিলে
- [ ] `npm run build` pass
- [ ] `npm test` pass
- [ ] service restart complete
- [ ] CDN/reverse-proxy/browser/PWA cache cleared

## Fixed AppShell

- [ ] Desktop-এ sidebar page scroll-এর সঙ্গে সরে যায় না
- [ ] Desktop-এ top header page scroll-এর সঙ্গে সরে যায় না
- [ ] শুধু route content viewport vertical scroll করে
- [ ] sidebar navigation নিজের scrollbar-এ scroll করে
- [ ] global/browser horizontal scrollbar তৈরি/গায়েব হয় না
- [ ] Accounting long page-এ top থেকে bottom পর্যন্ত scroll smooth
- [ ] Order detail long page-এ shell স্থির
- [ ] Mobile sidebar overlay ঠিকমতো open/close হয়

## Clean routes / direct refresh

- [ ] `/dashboard` direct refresh
- [ ] `/orders` direct refresh
- [ ] `/orders/<existing-id>` direct refresh
- [ ] `/p2p/market` direct refresh
- [ ] `/accounting` direct refresh
- [ ] `/system/settings` direct refresh
- [ ] `/system/update` direct refresh
- [ ] পুরোনো `/#/...` bookmark clean URL-এ migrate হয়
- [ ] Browser Back/Forward সঠিক page/URL restore করে

## Navigation race / slow network

- [ ] Slow network-এ দ্রুত 5+ page click করলে latest clicked page-ই থাকে
- [ ] আগের slow response পরে এসে current page overwrite করে না
- [ ] page click করার পর previous page view অপেক্ষার সময় সামনে পড়ে থাকে না
- [ ] route change হলে inactive page timers/polling current UI-তে কাজ করে না
- [ ] System Update pending request page ছাড়ার পরে অন্য page overwrite করে না

## Realtime / scroll / input stability

- [ ] Chat উপরে scroll থাকা অবস্থায় incoming message এলে scroll reset হয় না
- [ ] Chat box hide/show বা পুরো order page reload হয় না
- [ ] Orders realtime update শুধু data patch করে
- [ ] P2P Market refresh-এর সময় current scroll usable থাকে
- [ ] Settings typing/caret realtime event-এ নষ্ট হয় না
- [ ] Ads filter/search background update-এ নষ্ট হয় না
- [ ] Accounting refresh-এর সময় browser document jump করে না

## Existing critical feature smoke test

- [ ] New Binance order appears promptly
- [ ] Order auto assignment/RBAC expected
- [ ] Mark Paid controlled test
- [ ] Release Verification controlled test
- [ ] FUND_PWD saved/manual + local P2PFlow verification controlled test
- [ ] Google/SMS verification retry inline থাকে
- [ ] Chat text + gallery + camera image send
- [ ] SELL Ad saved payment account selection (max 5)
- [ ] BUY Ad generic payment method selection (max 5)
- [ ] Payment Account / ledger / accounting values intact
- [ ] Notification/push scope intact

## Security / update safety

- [ ] `.env`, `.p2pflow/`, `shared/`, database package-এর ভিতরে নেই
- [ ] `P2PFLOW_SECRET_VAULT_KEY` backup আছে (যদি separate key ব্যবহৃত হয়)
- [ ] Health Check clean
- [ ] System Update GitHub connection/signature Ready
- [ ] database backup before update verified
- [ ] previous release rollback available

## Endurance acceptance

- [ ] অন্তত 10 মিনিট Orders/Chat/Market/Accounting/Settings/System Update navigation + scrolling চালানো হয়েছে
- [ ] কোনো body/document scroll দেখা যায়নি
- [ ] কোনো old-page flash/stale response navigation হয়নি
- [ ] কোনো automatic full HTML/browser reload হয়নি
- [ ] কোনো focus/scroll loss reproduce হয়নি
