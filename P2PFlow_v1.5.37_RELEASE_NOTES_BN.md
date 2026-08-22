# P2PFlow v1.5.37 — Release Notes

**Application:** 1.5.37  
**Database schema:** 37  
**Migration:** schema 36 -> 37 additive automatic migration

## এক-বাটন Release Verification

P2PFlow local verification enabled থাকলে Release আর দুই ধাপের `Verify -> Release` flow ব্যবহার করে না। একই Release Verification screen-এ User Password, 6-digit Secret Code বা Email OTP দিয়ে **Release Coin** চাপলেই:

1. P2PFlow local verification একই click-chain-এ যাচাই হয়;
2. verification সঠিক হলে একই request flow-তেই Binance release চালু হয়;
3. saved Fund Transfer Password প্রয়োজন হলে server-side secret vault থেকে নিয়ে Binance RSA encryption করে Release সম্পন্ন করে।

আলাদা local **Verify** button নেই। Email OTP-এর জন্য শুধু প্রয়োজনে **Resend Email OTP** secondary action থাকে।

## ভুল local verification-এ inline warning

- ভুল User Password, Secret Code বা Email OTP দিলে Release page/modal close বা reload হয় না।
- যে input-এ সমস্যা হয়েছে তার নিচে warning দেখায় এবং input focus থাকে।
- Primary method fail/usable না হলে configured Secondary method-এর **Change Verification System** action ব্যবহার করা যায়।
- Challenge attempt state preserve করা হয় যাতে backend lockout/max-attempt protection কার্যকর থাকে।

## Google / SMS / Binance verification retry স্থির UI

Google Authenticator, SMS/Mobile OTP, Email, YubiKey বা concrete Binance verification code ভুল হলে একই verification method থাকলে page/modal আর close/reopen হয় না। Field clear/focus হয় এবং inline warning দেখা যায়। Binance সত্যিই অন্য concrete verification method চাইলে তবেই screen method বদলায়।

## Saved Fund Transfer Password field-level Secret Vault

v1.5.36 পর্যন্ত saved Fund Transfer Password পুরো encrypted database state-এর ভিতরে reversible plaintext field হিসেবে ছিল। Raw database payload নিজেই AES-256-GCM encrypted থাকায় সরাসরি database dump থেকে password পড়া যেত না, কিন্তু application state decrypt হলে ওই field plaintext হতো।

v1.5.37-এ Fund Transfer Password-এর জন্য দ্বিতীয়, field-level encryption layer যোগ হয়েছে:

- **AES-256-GCM** field encryption
- **HKDF-SHA256** derived vault key
- credential ID + secret purpose bound **AAD**
- random 96-bit IV per saved secret
- legacy plaintext field migration-এর পরে clear করা হয়
- পুরো database state আগের মতো আলাদা **AES-256-GCM** layer-এ encrypted থাকে

অর্থাৎ saved Fund Password at-rest অবস্থায় double encryption boundary পায়।

## আলাদা Secret Vault Key

নতুন fresh setup automaticভাবে permanent `P2PFLOW_SECRET_VAULT_KEY` generate করে। Existing installation-এ এটি না থাকলে backward-compatibleভাবে `P2PFLOW_APP_KEY` থেকে field-vault key derive হয়।

সর্বোচ্চ key separation-এর জন্য production-এ আলাদা permanent 32+ character `P2PFLOW_SECRET_VAULT_KEY` ব্যবহার করা recommended। Existing install-এ পরে key যোগ করলে আগের APP_KEY-mode secrets readable থাকবে; ওই Fund Password আবার Save করলে নতুন separate vault key mode-এ seal হবে।

**Important:** Separate vault key দিয়ে secret save করার পরে key হারানো/পরিবর্তন করা যাবে না। Key হারালে encrypted Fund Password recover করা যাবে না; credential-এর Fund Password clear/re-enter করতে হবে।

## User Password / Secret Code storage

User Login Password, 6-digit Login Secret Code এবং Security Question Answer reversible encryption দিয়ে রাখা হয় না। এগুলো random salt সহ Node `scrypt` one-way hash হিসেবে stored থাকে এবং verification-এ timing-safe comparison ব্যবহার হয়। এগুলোর original plaintext database থেকে recover করা যায় না।

## Fund Password release-time lifecycle

Fund Password Binance release-এর জন্য reversible হওয়া প্রয়োজন। Release-এর সময়:

1. vault ciphertext server memory-তে decrypt হয়;
2. Binance C2C RSA public key fetch হয়;
3. Fund Password RSA/OAEP-SHA256 দিয়ে encrypt হয়;
4. `releaseCoin`-এ `authType=FUND_PWD`, encrypted `code`, `confirmPaidType=normal`, `orderNumber`, `payId` পাঠানো হয়;
5. plaintext Fund Password browser/API response/audit log-এ ফেরত দেওয়া হয় না।

## Rollback safety

Schema 37 migration legacy `releaseFundPassword` field clear করে এবং vault field ব্যবহার করে। v1.5.36-এ rollback করলে old app saved encrypted vault value ব্যবহার করতে জানবে না এবং Fund Password saved নেই হিসেবে আচরণ করবে। এটি intentional fail-safe; rollback অবস্থায় manual Fund Password entry ব্যবহার করুন অথবা v1.5.37-এ ফিরে আসুন।

## Regression coverage

- single Release click local verification + Binance continuation
- no separate local Verify button
- Email OTP auto-request + Resend only
- wrong User Password / Secret Code / Email OTP inline warning
- Google/SMS same-screen inline retry
- Fund Password field-level AES-256-GCM vault
- HKDF/AAD binding
- schema 36 -> 37 legacy Fund Password migration
- user password/secret `scrypt` hashing regression
- Binance RSA/OAEP-SHA256 FUND_PWD release regression
- Primary/Secondary verification fallback
- Payment Split/final-action regression
- permissions/RBAC, Ads, realtime chat, accounting, session, database encryption and updater regressions

## Live deployment note

এই build environment-এ production Binance credential দিয়ে real coin Release চালানো হয়নি। Deployment-এর পরে ছোট controlled SELL order দিয়ে saved FUND_PWD + local verification, manual FUND_PWD এবং Google/SMS retry পরীক্ষা করুন।
