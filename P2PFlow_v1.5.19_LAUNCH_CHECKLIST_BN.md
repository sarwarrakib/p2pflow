# P2PFlow v1.5.19 Public Launch Checklist

Application: `1.5.19`  
Database schema: `32`

Public traffic চালু করার আগে mandatory itemগুলো complete ও documented করুন।

## 1. Package integrity

- [ ] `P2PFlow_v1.5.19_UNIFIED.zip` এবং SHA-256 file একই trusted source থেকে নেওয়া হয়েছে।
- [ ] `sha256sum -c P2PFlow_v1.5.19_SHA256.txt` সফল।
- [ ] `unzip -t P2PFlow_v1.5.19_UNIFIED.zip` সফল।
- [ ] ZIP-এ `.env`, `.p2pflow`, `shared/`, database, proof/media data, private key বা runtime secret নেই।
- [ ] Rollback-এর জন্য previous application release ও database backup available।

## 2. Server and dependencies

```bash
node --version
npm ci --omit=dev --ignore-scripts
npm run build
npm test
npm audit --omit=dev --audit-level=high
npm ls --omit=dev
```

- [ ] Node.js 20+।
- [ ] Build এবং full tests pass।
- [ ] High/critical dependency advisory নেই বা approved written risk acceptance আছে।
- [ ] Invalid/extraneous production dependency নেই।
- [ ] `php -l local-php-mail.php` সফল, যদি PHP mail bridge ব্যবহার হয়।

## 3. Production environment and security

- [ ] `NODE_ENV=production`
- [ ] `P2PFLOW_PRODUCTION_STRICT=true`
- [ ] HTTPS public base URL সঠিক।
- [ ] `P2PFLOW_ALLOWED_HOSTS` exact hostname ধারণ করে।
- [ ] Trusted proxy exact loopback/IP/CIDR; unrestricted `all` নয়।
- [ ] Node port public firewall-এ বন্ধ এবং Nginx/approved proxy-এর পেছনে।
- [ ] Strong permanent application key secret manager/offline backup-এ আছে।
- [ ] `.env` owner-only permission, সাধারণত `chmod 600`।
- [ ] Database/Binance/SMTP secret logs, package, Git বা browser response-এ নেই।
- [ ] `npm run preflight:production -- --root /opt/p2pflow --env /opt/p2pflow/shared/.env` exit code 0।

## 4. Database, migration and restore

- [ ] Production database/user least privilege ব্যবহার করে।
- [ ] Database TLS/private network/firewall policy কার্যকর।
- [ ] Empty database setup pass।
- [ ] Existing data থাকলে staging clone-এ schema `32` migration pass।
- [ ] Existing users, orders, Ads, credentials, payment accounts, ledger, accounting এবং audit data অক্ষত।
- [ ] Encrypted state restart-এর পর decrypt/load হয়।
- [ ] Automatic backup এবং retention configured।
- [ ] অন্য server/temporary database-এ backup restore drill pass।
- [ ] Application key-এর অন্তত দুইটি secure backup আছে।

## 5. Nginx, TLS and systemd

- [ ] Valid certificate/full chain এবং automatic renewal configured।
- [ ] HTTP → HTTPS redirect।
- [ ] Wrong Host header rejected।
- [ ] `/api/events` proxy buffering/compression disabled।
- [ ] Hidden files denied।
- [ ] `sudo nginx -t` সফল।
- [ ] Systemd unit shipped `server.js` চালায় এবং writable paths বাস্তব install root-এর সঙ্গে মেলে।
- [ ] `sudo systemd-analyze verify` সফল।
- [ ] Service restart loop নেই এবং logs-এ secret নেই।

## 6. Core application smoke test

- [ ] `/ready` HTTP 200, version `1.5.19`, schema `32`।
- [ ] `/health` authorised view-এ database, mail, update এবং storage status সঠিক।
- [ ] Anonymous visitor private API/data দেখতে পারে না।
- [ ] Cross-origin mutating request rejected।
- [ ] Login rate limit ও `Retry-After` কাজ করে।
- [ ] Logout/disable/revoke-এর পর existing session/SSE protected data পায় না।
- [ ] Browser console-এ uncaught error বা failed application asset নেই।

## 7. Users, roles and permission eye

- [ ] Add User + Login modal কাজ করে।
- [ ] Global এবং exact Binance-account permission matrix render হয়।
- [ ] প্রতিটি permission-এর ডান পাশে eye button আছে।
- [ ] Eye click/keyboard/touch-এ সম্পূর্ণ scope/dependency description দেখা যায়।
- [ ] Outside click, Escape, scroll/resize-এ tooltip বন্ধ হয়।
- [ ] Non-admin delegation editor-এর নিজের permission/account scope ছাড়ায় না।
- [ ] Permission revoke-এর পর UI, API এবং realtime access বন্ধ হয়।

## 8. Payment Account ownership and access

Test users: Admin, Manager, Agent A, Agent B, custom all-account operator।

- [ ] Admin ও Manager সব Payment Account দেখতে/manage করতে পারে।
- [ ] Add Account-এ Account User logged-in user হিসেবে default selected।
- [ ] Agent-এর Add Account modal logged-in Account User defaultসহ JavaScript error ছাড়া খোলে।
- [ ] Agent A `accounts.manage` পেলে শুধু নিজের account add/edit/manage করে।
- [ ] Agent A Agent B-এর account ID দিয়ে GET/PATCH/ledger attempt করলে 403।
- [ ] Agent owner/access পরিবর্তন করতে পারে না।
- [ ] Custom non-Agent role-এ `accounts.manage_all` দিলে all-account management ও owner/access control কাজ করে।
- [ ] `accounts.use`, `ledger.adjust`, `offline.transactions.manage` আলাদা action scope বজায় রাখে।
- [ ] Search result শুধু user-এর access থাকা Payment Account দেখায়।

## 9. Label, Serial and payment-account search

- [ ] Label save/edit হয়।
- [ ] Non-empty Serial Number unique; duplicate rejected।
- [ ] Number, Label ও Serial দিয়ে search কাজ করে।
- [ ] Serial natural order (`SIM-2` before `SIM-10`) ঠিক আছে।
- [ ] Bulk Add sequential serial/padding ঠিক রাখে।
- [ ] Restricted user search/API-তে hidden number প্রকাশ পায় না।

## 10. Offline Business transactions

- [ ] User-এর `offline.transactions.manage` permission প্রয়োজন।
- [ ] Candidate list active, permitted, unreserved ও receive-limit available account দেখায়।
- [ ] `1,000,000` requested এবং `50,000` per-number test-এ suggested allocation সঠিক।
- [ ] Pending/partial/ready session-এর number অন্য Offline Business session বা normal order payment split-এ reuse হয় না।
- [ ] Pending normal order payment split-এর number Offline Business candidate বা অন্য নতুন order split-এ reuse হয় না।
- [ ] Received click account ledger ও balance বাড়ায়।
- [ ] Planned amount ও current daily/monthly receive limit-এর বেশি গ্রহণ blocked।
- [ ] কম amount লিখে repeated partial receive করা যায়।
- [ ] Full received amount full offline order তৈরি করে।
- [ ] Explicit partial finalization শুধু received total-এর offline order তৈরি করে।
- [ ] Finalized order splits/ledger linkage reconcile করে।
- [ ] Zero-received cancel reservation release করে।
- [ ] Finalized/cancelled session পুনরায় mutate করা যায় না।

## 11. Security page and recovery

- [ ] Security page Admin/Manager/Agent/Auditor-এর জন্য blank/crash হয় না।
- [ ] Trusted-device create/last-used/expiry date render হয়।
- [ ] `formatDate is not defined` console error নেই।
- [ ] Security Question set/change/remove এবং fallback recovery pass।
- [ ] Trusted-device, OTP, owner emergency এবং email-outage flow pass।
- [ ] Security revert email GET শুধু confirmation; explicit POST ছাড়া setting বদলায় না।

## 12. Notification Preferences

- [ ] Notifications page preference panel দেখায়।
- [ ] Orders, Assignments, Messages, Payments, Ads/Binance, Accounting, Team, System category per-user ON/OFF হয়।
- [ ] In App এবং Email channel আলাদাভাবে save হয়।
- [ ] Refresh/logout-login-এর পর preference থাকে।
- [ ] Disabled category-এর নতুন panel/email notification আসে না।
- [ ] Messages OFF করলে chat notification center/badge behavior policy অনুযায়ী বন্ধ।
- [ ] Security category mandatory এবং disable করা যায় না।
- [ ] Global `sendNotificationEmail=false` per-user Email preference-এর উপর precedence নেয়।

## 13. Orders, Ads and Manual Feedback

- [ ] Orders/Ads-এ `All` ও P2P username account buttons কাজ করে।
- [ ] Exact Binance-account permission ছাড়া অন্য account data/action hidden/403।
- [ ] Orders Source-এ P2P username/Local দেখায়; আলাদা Binance Account column নেই।
- [ ] Ads All merchant action শুধু permitted active accountগুলোতে চলে।
- [ ] Specific account selected থাকলে action শুধু সেই account-এ।
- [ ] Page load/read-only refresh কোনো Ads mutation পাঠায় না।
- [ ] P2P Information → Open Feedback Page নতুন tab-এ exact extension `advertiserUrl` খোলে।
- [ ] Invalid/non-Binance advertiser URL block হয়।
- [ ] Popup blocked হলে user warning পায়।

## 14. Order Acceptance and assignment

- [ ] Agent Orders page-এ Order Acceptance ON/OFF control দেখা যায়।
- [ ] OFF Agent online থাকলেও নতুন assignment পায় না।
- [ ] ON Agent offline থাকলেও permission/routing/capacity match করলে candidate হয়।
- [ ] Exact Binance-account order permission ছাড়া ON Agent ওই order পায় না।
- [ ] OFF login/session-এ Yes/No prompt আসে।
- [ ] Existing assigned order OFF করার সঙ্গে সঙ্গে unassign হয় না।

## 15. Binance controlled validation

প্রতিটি credential আলাদাভাবে ছোট controlled data দিয়ে test করুন।

- [ ] P2P profile/merchant status/Ads list/order list read-only sync।
- [ ] Merchant Business/Online/Break state account-isolated।
- [ ] One small test Ad create/update/status।
- [ ] One controlled order detail/chat/mark-read।
- [ ] Applicable হলে small-value Mark Paid/Release approval policy সহ test।
- [ ] API timeout/rate limit/invalid credential user-friendly ও audit-logged।
- [ ] Credential secret UI/log/API response-এ নেই।

## 16. Multi-account Ads hotfix validation

প্রতিটি connected Binance account আলাদাভাবে test করুন।

- [ ] প্রতিটি account-এর P2P Profile sync সম্পন্ন এবং payment methods দেখা যায়।
- [ ] Ads list refresh-এর পরে প্রতিটি advertisement সঠিক P2P username/account-এর অধীনে আসে।
- [ ] দ্বিতীয় account-এর existing advertisement update সফল; `-31002`/illegal parameter আসে না।
- [ ] Update-এর পরে price, amount, limits, remarks এবং payment methods Binance page-এ expected value দেখায়।
- [ ] দ্বিতীয় account-এর private draft publish সফল এবং advertisement number ফিরে আসে।
- [ ] প্রথম account-এর update/publish আগের মতো সফল।
- [ ] দুই account-এ একই local payment-method type থাকলেও payload account-specific Binance `payId` ব্যবহার করে।
- [ ] একটি account-এর payment method অন্য account-এ unavailable হলে UI methodটি দেখায় না বা server fail-closed error দেয়।
- [ ] Update reject হলে local advertisement fields বদলায় না।
- [ ] Status Online/Offline operation exact selected account-এই চলে।
- [ ] Logs/API response-এ API key, secret বা raw signed URL নেই।

## 17. Accounting and profit scope

- [ ] Included user profit company total/capital-এ যোগ হয়।
- [ ] Individual-only profit দেখা যায় কিন্তু company total/capital-এ যোগ হয় না।
- [ ] Offline Business received ledger/account balance এবং finalized order accounting reconcile করে।
- [ ] Daily close, carryover, charge, expense, income ও capital sample data দিয়ে মিলেছে।
- [ ] Business timezone/day boundary verified।

## 18. Mail, browser and operations

- [ ] Primary এবং configured backup SMTP route test pass।
- [ ] Chrome, Firefox এবং Safari/WebKit critical flow pass।
- [ ] 360px, 768px, 1024px এবং wide desktop layouts pass।
- [ ] Keyboard modal/focus/Escape behavior pass।
- [ ] Uptime, latency, 5xx, database, backup age, disk, certificate expiry এবং restart alert configured।
- [ ] Logs rotate এবং privacy/retention policy মেনে চলে।
- [ ] Expected concurrent users/SSE দিয়ে staging load test pass।

## 19. Update and rollback drill

- [ ] Staging-এ signed update detect/download/verify/install pass।
- [ ] Update switch-এর আগে database backup তৈরি হয়।
- [ ] Deliberately failed release previous code/public assets restore করে।
- [ ] Manual rollback procedure timed ও documented।
- [ ] Rollback-এর পর data/schema compatibility verified।

## Final go-live approval

- [ ] সব mandatory check complete।
- [ ] Open critical/high issue 0।
- [ ] Tested restore point available।
- [ ] Owner/Admin/operations sign-off documented।
- [ ] DNS/traffic enable plan এবং rollback trigger agreed।
