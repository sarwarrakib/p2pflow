# P2PFlow v1.5.37 — Manual Update Guide

**Application:** 1.5.37  
**Database schema:** 37  
**Migration:** schema 36 -> 37 automatic additive migration

## 1. Update-এর আগে backup

Production database, `.env`, `.p2pflow/`, `shared/` এবং uploaded/runtime data backup নিন। বিশেষভাবে `P2PFLOW_APP_KEY` হারাবেন না।

## 2. Secret Vault Key — production recommendation

v1.5.37 Fund Transfer Password-এর জন্য আলাদা field-level secret vault support করে। Production-এ সবচেয়ে শক্ত key separation চাইলে **প্রথম v1.5.37 startup-এর আগে** `.env`-এ permanent random 32+ character key দিন:

```text
P2PFLOW_SECRET_VAULT_KEY=<permanent-random-secret-at-least-32-characters>
```

নতুন browser fresh setup এই key automaticভাবে generate করে।

Existing installation-এ key না দিলেও migration কাজ করবে; field vault `P2PFLOW_APP_KEY` থেকে key derive করবে। পরে আলাদা vault key যোগ করলে পুরোনো secret readable থাকবে; Fund Transfer Password আবার Save করলে সেটি separate vault key mode-এ re-seal হবে।

**Key backup:** আলাদা vault key দিয়ে Fund Password save করার পরে key change/delete/lose করবেন না। হারালে saved Fund Password decrypt করা যাবে না এবং re-enter করতে হবে।

## 3. Application files update

`P2PFlow_v1.5.37_UNIFIED.zip` clean directory-তে extract করে application files update করুন। Production `.env`, database এবং persistent runtime directories overwrite করবেন না।

## 4. Dependencies ও verification

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

## 5. Service restart এবং migration

Application service restart করুন। First startup schema 36 -> 37 migration চালিয়ে legacy saved Fund Transfer Password-কে field-level secret vault-এ seal করে এবং legacy plaintext field clear করে।

Footer/Health-এ নিশ্চিত করুন:

- Application `1.5.37`
- Database schema `37`

তারপর Browser/PWA hard refresh/close-open করুন এবং reverse proxy/CDN cache purge করুন।

## 6. One-click Release Verification test

API Credentials -> Binance account -> Release Verification gear থেকে local verification configure করুন।

### Saved Fund Password + Secret Code

1. Release Verification = **Fund Transfer Password** রাখুন।
2. Fund Password save করুন।
3. P2PFlow verification ON করুন; Primary = 6-digit Secret Code।
4. SELL order-এ Release চাপুন।
5. Secret Code field-এ code লিখুন।
6. **একবার Release Coin** চাপুন।
7. Correct হলে একই click-chain-এ saved Fund Password vault থেকে নিয়ে RSA encrypt করে Binance Release হবে।
8. Wrong হলে page reload/remount হবে না; input-এর নিচে warning আসবে।

### Email OTP

Email OTP method হলে verification page OTP automatic request করবে। OTP লিখে **Release Coin** চাপুন। আলাদা Verify button নেই। OTP না এলে শুধু **Resend Email OTP** ব্যবহার করুন।

### User Password

User Password method হলে password লিখে **Release Coin** একবার চাপুন। ভুল password inline warning দেখাবে।

## 7. Binance Google/SMS retry test

Binance concrete Google বা SMS challenge দিলে code লিখে Release করুন। ভুল code হলে একই verification screen থাকবে, field clear/focus হবে এবং input-এর নিচে warning আসবে; page close/reopen হওয়া উচিত নয়।

## 8. Storage security verification

Expected behavior:

- API Credentials GET/browser-এ saved Fund Password value পাওয়া যাবে না; শুধু configured status থাকবে।
- Database application state-এর Fund Password vault field `p2psec1...` ciphertext হবে, plaintext password নয়।
- Login Password/Secret Code/Security Answer salted scrypt hash; original plaintext recoverable নয়।
- Fund Password release-এর সময় server memory-তেই decrypt হয়, তারপর Binance RSA public key দিয়ে encrypt হয়ে Binance-এ যায়।

## 9. Rollback

v1.5.37 schema 37 থেকে v1.5.36 code-এ rollback করলে old code vault field বুঝবে না। Legacy plaintext field migration-এ intentionally empty করা হয়, তাই saved automatic Fund Password unavailable দেখাতে পারে। Rollback অবস্থায় manual Fund Password ব্যবহার করুন অথবা v1.5.37 পুনরায় deploy করুন।

Database এবং `.env` backup অক্ষত রাখুন; বিশেষ করে `P2PFLOW_APP_KEY` এবং configured `P2PFLOW_SECRET_VAULT_KEY` সংরক্ষণ করুন।
