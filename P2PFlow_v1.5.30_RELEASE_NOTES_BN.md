# P2PFlow v1.5.30 — Dedicated Release Verification Screen & Per-API Verification Settings

## Version

- Application: `1.5.30`
- Database schema: `35`
- Package: Unified
- Database migration: প্রয়োজন নেই

## ১. Release এখন আলাদা Verification screen ব্যবহার করে

SELL order-এ Release / Quick Release চাপলে Payment Split gate satisfied থাকলে পুরোনো **Release Coin** form/modal আর দেখানো হয় না। এর বদলে dedicated **Release Verification** screen খোলে।

নতুন screen মোবাইলে full-screen এবং desktop/tablet-এ centered responsive card হিসেবে কাজ করে। UI-তে back/close control, বড় verification title, ছোট instruction, verification input, Paste action এবং বড় Submit button রাখা হয়েছে।

Payment Split requirement OFF থাকলে split থাকুক বা না থাকুক Release button সরাসরি verification flow-এ যায়। Payment Split requirement ON থাকলে কেবল অসম্পূর্ণ split/proof থাকলেই split page আগে আসে; valid split already saved থাকলে সেটি আবার খোলে না।

## ২. Binance Auto challenge আর raw error নয়

আগে Binance Auto mode-এ প্রথম Release attempt-এর response যদি যেমন `Your google verification code is missing` দিত, একই Release modal-এ raw SAPI error দেখানো হতো। এখন specific verification requirement detect হলে backend এটিকে ordinary failure না ধরে structured verification challenge হিসেবে ফেরত দেয়।

User-facing state:

- Binance Auto + concrete Binance challenge: **Binance needs extra verification.**
- Explicitly configured verification method: **Release requires verification.**
- Binance Auto, challenge এখনো জানা নেই: **Binance verification check**

Google verification চাইলে screen-এর title হয় **Authenticator App Verification** এবং শুধু Authenticator code field দেখায়। SMS, Email, Fund Password, FIDO2/Passkey এবং YubiKey-এর ক্ষেত্রেও method অনুযায়ী dedicated field/presentation দেখানো হয়। Raw Binance `-9000` payload user-facing verification panel-এ আর দেখানো হয় না।

## ৩. Verification retry split-কে আর পুনরায় খোলে না

Binance verification fail/challenge হলেও existing Payment Split save অবস্থায় থাকে। Retry করলে split screen-এ ফেরত না গিয়ে Release Verification screen-এই required field দেখানো হয়। Local P2PFlow verification token এখনও valid থাকলে Auto challenge-এর পর সেটি preserve করে পরবর্তী Binance verification attempt-এ ব্যবহার করা হয়।

## ৪. Release Verification এখন API Credentials-এর ভেতরে

System Settings থেকে Release Verification UI সরানো হয়েছে। এখন:

**System → API Credentials → সংশ্লিষ্ট Binance account-এর gear icon → Release Verification**

প্রতিটি API credential-এর verification profile আলাদা। Selectable Binance methods:

- Binance Auto
- FIDO2 / Fingerprint
- Fund Transfer Password
- Google Authenticator
- SMS / Mobile OTP
- Email OTP
- YubiKey

Optional P2PFlow step-up gate-এ Primary এবং Secondary রাখা যায়:

- User Password
- 6-digit Secret Code
- Email OTP

Primary fail/unavailable হলে configured Secondary method **Change Verification System** দিয়ে ব্যবহার করা যায়।

## ৫. Saved Fund Transfer Password নিরাপদ server-side auto-use

Per-API Release Verification popup থেকে Fund Transfer Password save এবং automatic use configure করা যায়। Auto-use চালু থাকলে P2PFlow Primary/Secondary verification সফল হওয়ার পর server saved Fund Password apply করে। Password browser-এ ফেরত পাঠানো হয় না, UI-তে prefill হয় না এবং audit detail-এ raw password লেখা হয় না।

## ৬. API Credentials UI পরিবর্তন

নতুন Binance API connect করার flow এখন:

1. API Key + Secret Key দিন;
2. **Connect & Save** চাপুন;
3. server automatic format/signature validation চালায়;
4. live Binance C2C connection check চালায়;
5. successful হলে credential save করে;
6. Binance P2P profile sync করে P2P username পাওয়া গেলে credential display name হিসেবে সেটি ব্যবহার করে।

অর্থাৎ আলাদা **Validate** বা **Live Check** row button আর নেই। Live connection fail হলে credential save হয় না।

API Credentials table-এর বড় text action button compact icon action-এ পরিবর্তিত হয়েছে:

- gear: Release Verification settings
- play/pause: enable/disable
- trash: delete

Credential identity-তে generic `Main Binance Account`-এর বদলে synced P2P username অগ্রাধিকার পায়। P2P nickname সাময়িকভাবে sync না হলে safe fallback identity দেখায় এবং connection status-এ retry প্রয়োজন জানায়।

## ৭. Binance security boundary

Verification preference P2PFlow কোন documented field/auth type ব্যবহার করবে তা নির্ধারণ করে; এটি Binance risk/security policy bypass করে না। Binance অন্য verification requirement চাইলে Release successful ধরে নেওয়া হয় না। `checkIfCanReleaseCoin` allow না করলে `releaseCoin` পাঠানো হয় না।

## ৮. Regression coverage

v1.5.30 automated coverage-এ আছে:

- dedicated responsive Release Verification page;
- Split OFF → direct verification flow;
- saved split → direct verification retry;
- Google/SMS structured challenge mapping;
- raw missing-code error suppression;
- per-credential Release Verification popup;
- Release Verification System Settings থেকে সরানো;
- API Save automatic validation + live check;
- P2P username credential identity;
- compact credential icon actions;
- Primary/Secondary P2PFlow verification;
- saved Fund Password browser-এ leak না হওয়া;
- Payment Split edit/delete, balance ও daily/monthly limit reconciliation;
- receive split charge-free regression;
- multi-account Ads/RBAC/notification scope;
- authentication/trusted-device/session;
- database encrypted-state/persistence;
- accounting ও signed updater/rollback regression।

## Live deployment note

এই build environment-এ real production Binance credential দিয়ে live coin Release, Google/SMS/Fund Password/FIDO2 mutation চালানো হয়নি। Deployment-এর পরে ছোট controlled SELL order দিয়ে Binance Auto এবং প্রয়োজনীয় configured method live test করুন।
