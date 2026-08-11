# P2PFlow v1.5.3

## System Update 403 hardening

এই release shared-hosting/cPanel/LiteSpeed/ModSecurity environment-এ System Update control request HTML `403 Forbidden` হয়ে Node application পর্যন্ত না পৌঁছানোর সমস্যা harden করে।

- System Update-এর সব browser-side mutation/control request আর `/api/system-update/*` POST route ব্যবহার করে না।
- নতুন neutral control transport: `/api/session-step`।
- Request URL ও plaintext body থেকে update/apply/rollback/config ধরনের WAF-sensitive শব্দ সরানো হয়েছে।
- Control payload ছোট Base64URL envelope-এর ভিতরে `text/plain` হিসেবে পাঠানো হয়।
- Owner session, Owner-only permission, CSRF token, trusted-device/session binding, Owner password, 6-digit secret, one-time 90-second permit, signed release verification, database backup এবং supervisor restart অপরিবর্তিত আছে।
- Check, stage, stage-status, permit, commit, GitHub connection test/save এবং signing-key generation একই neutral transport ব্যবহার করে।
- System Update page load হওয়ার সময় একই neutral POST channel probe করে। Hosting/WAF 403 হলে Install button disabled থাকে এবং সরাসরি hosting security/ModSecurity diagnostic message দেখায়।
- পুরোনো `/api/system-update/*` endpoints backward compatibility-এর জন্য server-side রাখা হয়েছে, কিন্তু v1.5.3 UI আর সেগুলোর mutation route call করে না।

## Validation

- Full `npm test`: PASS
- System Update WAF transport self-test: PASS
- JavaScript syntax checks: PASS
- Release/self-integrity checks: PASS
- Existing database-only persistence, encryption, mail, login, trusted-device, UI color, GitHub signed release, public mirror, supervisor and accounting tests: PASS
