# P2PFlow v1.5.16 Public Launch Checklist

এই checklist-এর কোনো mandatory item অসম্পূর্ণ থাকলে public launch স্থগিত রাখুন। প্রথমে staging domain-এ সম্পূর্ণ checklist চালান, তারপর production-এ পুনরাবৃত্তি করুন।

## 1. Package integrity

- [ ] `P2PFlow_v1.5.16_UNIFIED.zip` এবং SHA-256 file একই secure source থেকে নেওয়া হয়েছে।
- [ ] `sha256sum -c P2PFlow_v1.5.16_SHA256.txt` সফল হয়েছে।
- [ ] ZIP extract করার আগে আলাদা empty directory ব্যবহার করা হয়েছে।
- [ ] Package-এ `.env`, `.p2pflow`, `shared`, database dump, master/private key, session বা proof runtime file নেই।

## 2. Host prerequisites

- [ ] 64-bit supported Linux host এবং security updates installed।
- [ ] `node --version` Node.js 20 বা নতুন দেখায়।
- [ ] `command -v node` যাচাই করা হয়েছে; systemd template-এর `/usr/bin/node` path ভিন্ন হলে actual absolute path বসানো হয়েছে।
- [ ] Nginx, MariaDB/MySQL বা PostgreSQL, certificate tooling এবং backup tooling installed।
- [ ] Dedicated non-login `p2pflow` service user/group তৈরি করা হয়েছে।
- [ ] Application root `/opt/p2pflow` শুধু প্রয়োজনীয় user/group-এর writable।

## 3. Clean dependency install and audit

Application root-এ চালান:

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
npm audit --omit=dev --audit-level=high
```

- [ ] চারটি command সফল হয়েছে।
- [ ] High বা critical advisory নেই; exception থাকলে লিখিত risk acceptance আছে।
- [ ] `npm ls --omit=dev` invalid/extraneous dependency দেখায় না।

## 4. Production environment

- [ ] `NODE_ENV=production`
- [ ] `P2PFLOW_PRODUCTION_STRICT=true`
- [ ] `P2PFLOW_PUBLIC_BASE_URL=https://panel.example.com` বাস্তব domain দিয়ে সেট।
- [ ] `P2PFLOW_ALLOWED_HOSTS` exact public hostname ধারণ করে।
- [ ] `P2PFLOW_TRUST_PROXY=loopback` যখন Nginx একই host-এ; remote proxy হলে শুধু exact proxy IP/CIDR trusted। `all` ব্যবহার করা হয়নি।
- [ ] `P2PFLOW_BIND_HOST=127.0.0.1` যখন Nginx একই host-এ।
- [ ] Secure cookie/SameSite settings production preflight-এ accepted।
- [ ] `P2PFLOW_PUBLIC_HEALTH_DETAILS=false`।
- [ ] Strong permanent application key secure secret manager/offline backup-এ আছে এবং Git/package-এ নেই।
- [ ] `.env` permission owner read/write only, সাধারণত `chmod 600`।
- [ ] SMTP/Binance/database secret shell history, logs বা monitoring label-এ প্রকাশ পায় না।

Run:

```bash
npm run preflight:production -- --root /opt/p2pflow --env /opt/p2pflow/shared/.env
```

- [ ] Preflight exit code 0 এবং কোনো error নেই।
- [ ] Warning প্রতিটি review/document করা হয়েছে।

## 5. Database and encryption

- [ ] Production-এর জন্য আলাদা database/user তৈরি করা হয়েছে।
- [ ] Database user শুধু প্রয়োজনীয় schema/data privilege পায়; global admin privilege নয়।
- [ ] TLS/private network/firewall policy database connection রক্ষা করে।
- [ ] Empty database setup সফল।
- [ ] Existing data থাকলে staging clone-এ schema 30 migration সফল।
- [ ] Encrypted state restart-এর পর decrypt/load হয়।
- [ ] Automatic backup তৈরি হয় এবং retention policy পর্যাপ্ত।
- [ ] অন্য server/temporary database-এ একটি backup restore করে data, owner login, order, Ads ও accounting যাচাই করা হয়েছে।
- [ ] Application key হারালে data recover হবে না—key-এর অন্তত দুইটি secure backup আছে।

## 6. Nginx and TLS

- [ ] `deploy/nginx-p2pflow.conf.example` থেকে domain/certificate path পরিবর্তন করা হয়েছে।
- [ ] Nginx শুধু public 80/443 expose করে; Node port public firewall-এ বন্ধ।
- [ ] `X-Forwarded-For` client-supplied chain append না করে trusted proxy দ্বারা replace হয়।
- [ ] `/api/events` buffering/compression disabled।
- [ ] Hidden files denied।
- [ ] Valid certificate, full chain, renewal এবং expiry alert configured।
- [ ] `sudo nginx -t` সফল।
- [ ] HTTP request HTTPS-এ redirect হয়।
- [ ] Wrong Host header application/Nginx দ্বারা গ্রহণ হয় না।

## 7. Systemd service

- [ ] `deploy/p2pflow.service.example` path, user/group এবং Node binary অনুযায়ী update করা হয়েছে।
- [ ] `ExecStartPre` production doctor এবং `ExecStart` shipped `server.js` ব্যবহার করে।
- [ ] `MemoryDenyWriteExecute=true` যোগ করা হয়নি।
- [ ] Service sandbox-এর `ReadWritePaths` বাস্তব install root-এর সঙ্গে মেলে।
- [ ] `sudo systemd-analyze verify /etc/systemd/system/p2pflow.service` সফল।
- [ ] `sudo systemctl daemon-reload && sudo systemctl enable --now p2pflow` সফল।
- [ ] Restart loop নেই; logs-এ secret নেই।

## 8. Application smoke test

- [ ] `/ready` returns HTTP 200, version `1.5.16`, expected schema/revision।
- [ ] `/health`/admin health authorised view-এ database, mail, update এবং storage status সঠিক।
- [ ] Anonymous visitor private API/data দেখতে পারে না।
- [ ] Invalid Host returns 421 বা proxy-level rejection।
- [ ] Cross-origin POST/PUT/PATCH/DELETE rejected।
- [ ] Login rate limit এবং Retry-After কাজ করে।
- [ ] Logout-এর পর existing SSE stream protected data পায় না।
- [ ] Disabled/revoked user-এর session ও realtime access বন্ধ হয়।
- [ ] Security revert email link GET-এ শুধু confirmation; POST-এর আগে পরিবর্তন হয় না।

## 9. Users, roles and multi-account RBAC

Test users: Owner/Admin, Manager, account-A-only operator, account-B-only operator, read-only user।

- [ ] Admin সব intended account manage করতে পারে।
- [ ] Account-A operator শুধু A-এর granted orders/Ads/chat/profile capability পায়।
- [ ] Account-B data/API action A user-এর কাছে hidden/403।
- [ ] Global permission ছাড়া account grant alone action চালাতে পারে না।
- [ ] Account grant ছাড়া global permission alone অন্য account action চালাতে পারে না।
- [ ] Assignment target agent-এর account access যাচাই হয়।
- [ ] Permission revoke-এর পর refresh, API এবং SSE access বন্ধ হয়।
- [ ] Security question set/change/remove এবং fallback recovery পরীক্ষা করা হয়েছে।
- [ ] `Add User + Login` button modal খোলে, default Agent role resolve হয় এবং account permission matrix render হয়।
- [ ] Orders/Ads account selector dropdown নয়; `All` ও P2P username button/tab হিসেবে render হয়।
- [ ] Orders-এর `Source`-এ P2P username/Local দেখা যায় এবং আলাদা `Binance Account` column নেই।

## 10. Binance controlled validation

প্রতিটি credential আলাদাভাবে test করুন। Production capital/large Ad দিয়ে প্রথম test করবেন না।

- [ ] Read-only profile/merchant status sync।
- [ ] Read-only Ads list এবং order list sync।
- [ ] Page load/GET refresh কোনো `updateAdsStatus` বা অন্য mutation পাঠায় না।
- [ ] One small test Ad create/update/offline/online/close।
- [ ] Merchant Business/Online/Break state অন্য account-এ leak হয় না।
- [ ] Ads `All` view-তে Business/Online/Break দৃশ্যমান এবং action শুধু current user-এর `ads.manage`-permitted active accountগুলোতে চলে।
- [ ] Specific P2P username button selected থাকলে merchant action শুধু সেই account-এ চলে।
- [ ] P2P Profile sync-এর পরে Orders/Ads account button-এ সঠিক Binance P2P username দেখা যায়।
- [ ] One controlled order detail/chat/mark-read flow।
- [ ] Applicable হলে small-value Mark Paid/Release two-person approval দিয়ে test।
- [ ] Additional KYC ও payment-method response handling যাচাই।
- [ ] API error, timeout, rate limit ও invalid credential user-friendly এবং audit-logged।
- [ ] Credential secret UI/log/API response-এ প্রকাশ পায় না।

## 11. Accounting and profit exclusion

- [ ] Included user profit company total/capital-এ যোগ হয়।
- [ ] Individual-only user income detail দৃশ্যমান কিন্তু company total/capital-এ যোগ হয় না।
- [ ] Daily close, carryover adjustment, transfer charge, owner cash flow এবং agent breakdown sample data দিয়ে মিলেছে।
- [ ] Timezone/business-day boundary production locale অনুযায়ী verified।
- [ ] Export/report totals source ledger-এর সঙ্গে reconcile করা হয়েছে।

## 12. Email and recovery

- [ ] Primary SMTP test delivery সফল।
- [ ] প্রতিটি configured backup route আলাদাভাবে test।
- [ ] Permanent recipient failure-এ unsafe duplicate/failover behavior নেই।
- [ ] Login/recovery/security-change mail সঠিক recipient ও template ব্যবহার করে।
- [ ] Primary mail outage simulation-এর পর approved fallback flow কাজ করে।
- [ ] Owner emergency recovery policy/documentation secure location-এ রাখা হয়েছে।

## 13. Browser, mobile and accessibility

- [ ] Current Chrome desktop/mobile।
- [ ] Current Firefox desktop।
- [ ] Safari/WebKit desktop/mobile।
- [ ] 360px, 768px, 1024px এবং wide desktop layouts।
- [ ] Keyboard-only navigation, modal focus trap, Escape close এবং focus return।
- [ ] No console error, failed asset or mixed-content warning।
- [ ] Login, Orders, Ads, Users, Accounting, Settings এবং System Update critical flows pass।

## 14. Monitoring, load and operations

- [ ] Uptime/HTTP error/latency monitor configured।
- [ ] Database size, connections, backup age এবং restore failure alerts configured।
- [ ] CPU, memory, disk, inode, certificate expiry এবং service restart alerts configured।
- [ ] Application/Nginx logs rotate এবং retention/privacy policy মেনে চলে।
- [ ] Expected concurrent users/SSE connections দিয়ে staging load test pass।
- [ ] Incident owner, escalation contact এবং maintenance window নির্ধারিত।

## 15. Update and rollback drill

- [ ] Staging clone-এ signed update package detect/download/verify/install সফল।
- [ ] Database backup update switch-এর আগে তৈরি হয়েছে।
- [ ] Deliberately failed release previous code pointer ও public assets restore করেছে।
- [ ] Manual rollback procedure সময় মেপে test করা হয়েছে।
- [ ] Rollback-এর পর data/schema compatibility verified।

## Final go-live approval

- [ ] উপরের সব mandatory check complete।
- [ ] Open critical/high issue 0।
- [ ] Latest encrypted backup এবং tested restore point available।
- [ ] Owner/Admin/operations sign-off documented।
- [ ] DNS cutover/traffic enable plan এবং immediate rollback trigger agreed।
