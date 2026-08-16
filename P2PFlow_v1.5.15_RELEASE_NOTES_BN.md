# P2PFlow v1.5.15 Release Notes

Release date: 2026-08-16  
Application version: `1.5.15`  
Database schema: `30`

## Release status

এই সংস্করণটি v1.5.14-এর পূর্ণ production-hardening release candidate। Application code, browser UI, multi-account Binance access, advertisements, authentication, setup, deployment template, updater এবং database migration path পর্যালোচনা ও সংশোধন করা হয়েছে। Public launch-এর আগে `P2PFlow_v1.5.15_LAUNCH_CHECKLIST_BN.md`-এর live infrastructure gate অবশ্যই সম্পন্ন করতে হবে।

## গুরুত্বপূর্ণ নিরাপত্তা সংশোধন

- Trusted proxy boundary, `Host` allowlist এবং canonical public origin validation যোগ করা হয়েছে। ভুল host এখন `421 Misdirected Request` পায়।
- Production strict mode এখন HTTPS public URL, allowed host, safe proxy trust, secure cookies এবং database configuration যাচাই করে।
- Cross-site mutating request, invalid/null origin এবং unsafe extension-admin request বন্ধ করা হয়েছে।
- CSP, HSTS, frame protection, MIME sniffing protection, no-index, Permissions Policy, COOP ও Origin-Agent-Cluster header যোগ করা হয়েছে।
- Login, recovery, trusted-device ও owner bootstrap flow-তে bounded identity/IP rate limit এবং `Retry-After` যোগ হয়েছে।
- Session-authenticated SSE connection প্রতি event-এ session, user এবং account permission পুনরায় যাচাই করে; connection limit ও heartbeat যোগ হয়েছে।
- Public 5xx response থেকে internal detail সরিয়ে request ID দেওয়া হয়েছে; sensitive log value redaction যোগ হয়েছে।
- Static file serving-এ traversal, dotfile, NUL, PHP, invalid method এবং path escape প্রতিরোধ করা হয়েছে।
- New/changed login password-এর minimum length 12 এবং maximum 200 করা হয়েছে। Security question/answer-এর validation শক্ত করা হয়েছে।
- Email security-revert link আর GET request-এ state পরিবর্তন করে না। GET শুধু confirmation page দেখায়; POST confirmation-এর পর revert হয়।
- Binance, PHP mail bridge, pre-signed upload এবং GitHub updater-এর outbound URL, redirect, protocol ও host validation শক্ত করা হয়েছে।
- GitHub redirect-এর সময় API authorization token অন্য host-এ পাঠানো বন্ধ করা হয়েছে।

## Advertisements ও multi-account সংশোধন

- Merchant Business/Online/Break state এখন প্রতিটি Binance credential-এর জন্য আলাদা database/runtime record ব্যবহার করে।
- Legacy shared merchant state schema 30 migration-এর সময় account-scoped record-এ স্থানান্তর হয়।
- Account delete করলে সংশ্লিষ্ট merchant runtime/readiness data পরিষ্কার হয়।
- Ads list, edit, publish, status, sync এবং merchant control নির্বাচিত credential ও exact account permission অনুসরণ করে।
- Read-only Ads GET, page load, background verification এবং status refresh এখন কোনো Binance mutation command পাঠায় না। Exact mode probe শুধু explicit user-initiated mutation workflow opt-in করলে চলতে পারে।
- Duplicate advertisement/order identifiers আলাদা account context-এ collision ছাড়া পরিচালিত হয়।

## Authentication ও recovery

- Security question fallback user editor এবং self-service recovery flow-তে সমর্থিত।
- Security answer plaintext হিসেবে সংরক্ষিত হয় না।
- Mail failure-এর পরেই fallback challenge চালু হয় এবং attempt/expiry সীমা প্রয়োগ হয়।
- Trusted-device, emergency owner login এবং disabled-email-OTP flow-এর dead-end সংশোধন করা হয়েছে।

## Frontend নিরাপত্তা ও accessibility

- Credentials, audit, notifications, routing, orders, profile, proofs, chat media এবং external link rendering-এ escaping/URL allowlist শক্ত করা হয়েছে।
- Binance profile/payment/share URL শুধু `https://binance.com` বা তার subdomain গ্রহণ করে।
- `target="_blank"` link-এ `noopener noreferrer` প্রয়োগ করা হয়েছে।
- Active public assets থেকে inline event handler ও `javascript:` URL সরানো হয়েছে।
- Modal-এ focus trap, Escape/backdrop close, ARIA এবং focus restoration যোগ হয়েছে।
- Login, setup, security এবং user forms-এ password policy UI-তে প্রতিফলিত হয়েছে।

## Hosting ও deployment

- Systemd template-এর অকার্যকর `launcher.js` path সংশোধন করে shipped `server.js` entrypoint ব্যবহার করা হয়েছে।
- Production doctor path এবং update/install root সংশোধন করা হয়েছে।
- Node/V8 JIT-এর সঙ্গে অসামঞ্জস্যপূর্ণ `MemoryDenyWriteExecute=true` সরানো হয়েছে।
- Systemd sandbox, restrictive umask, capability removal এবং writable path limit যোগ হয়েছে।
- Nginx template-এ TLS 1.2/1.3, HTTP/2, protected forwarding headers, SSE no-buffering, hidden-file deny এবং safe timeouts যোগ হয়েছে।
- Setup-generated environment-এ production strict, allowed host, loopback proxy trust, bind host এবং secure defaults যোগ হয়েছে।
- Unified packager `.env`, keys, database, shared/release state, backup files, editor temp files এবং পুরোনো release artifact package-এ নেয় না।

## Code structure ও maintainability

- `app-server.js` এবং `public/app.js` থেকে duplicate legacy tail ও duplicate runtime implementation সরানো হয়েছে।
- সব active JavaScript file recursive syntax check-এর জন্য `scripts/check-all-js.js` যোগ হয়েছে।
- Production security invariants-এর static regression test যোগ হয়েছে।
- Multi-account Ads merchant isolation-এর dedicated self-test যোগ হয়েছে।

## Verification summary

নিচের verification সফল হয়েছে:

- 74 active JavaScript file syntax check
- Full `npm test`
- `npm run build`
- Ads merchant account isolation test
- Merchant break/business state test
- Account-scoped Binance RBAC test
- Security-question fallback test
- Login, trusted-device, owner emergency এবং OTP-disabled tests
- Mail routing, delivery ও failover tests
- Hosting setup ও production-preflight tests
- PostgreSQL/MySQL encryption source tests
- Database-only persistence test
- Signed update, package validation, WAF transport, supervisor ও rollback tests
- Accounting self-test
- PHP lint
- Nginx syntax test
- Systemd unit verification with the host's actual Node binary path
- Offline npm advisory audit: 0 cached vulnerabilities across 26 production dependencies

## Environment limitation

এই build environment-এ package registry DNS পাওয়া যায়নি। তাই latest online `npm audit`, clean online `npm ci`, real MariaDB/PostgreSQL driver connection এবং live Binance/SMTP mutation test এখানে চালানো হয়নি। এগুলো public launch-এর বাধ্যতামূলক live gate হিসেবে checklist-এ রাখা হয়েছে।
