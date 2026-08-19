# P2PFlow v1.5.29 — Configurable Binance Release Verification & Primary/Secondary P2PFlow Step-up

## Version

- Application: `1.5.29`
- Database schema: `35`
- Package: Unified
- Database migration: প্রয়োজন নেই

## Release Verification এখন Binance account অনুযায়ী configure করা যায়

Settings-এ নতুন **Release Verification** section যোগ হয়েছে। প্রতিটি saved Binance API account-এর জন্য আলাদাভাবে Release verification method নির্বাচন করা যাবে।

Selectable methods:

- `Binance Auto`
- `FIDO2 / Fingerprint`
- `Fund Transfer Password`
- `Google Authenticator`
- `SMS / Mobile OTP`
- `Email OTP`
- `YubiKey`

`Binance Auto` আগের error-driven behaviour রাখে: প্রথমে unnecessary verification field না পাঠিয়ে release attempt/check করা হয়; Binance concrete requirement দিলে সেই field final verification page-এ দেখানো হয়।

### গুরুত্বপূর্ণ Binance সীমাবদ্ধতা

এই setting Binance-এর server-side security policy override করে না। P2PFlow selected method-এর documented field/auth type দেখায় ও পাঠায়, কিন্তু Binance account/order/risk state অনুযায়ী method reject করতে বা অন্য verification requirement দিতে পারে।

Supplied C2C SAPI v7.4-এ selectable `authType` হিসেবে `FIDO2`, `FUND_PWD`, `GOOGLE`, `SMS` দেখা যায়; একই request model-এ Email, Google, Mobile এবং YubiKey code field রয়েছে। Voice/phone-call verification selectable `authType` হিসেবে supplied document-এ নেই। তাই unlisted/voice-like server challenge-এর জন্য `Binance Auto` ব্যবহার করতে হবে।

FIDO2 auth type documented হলেও supplied API document browser WebAuthn/FIDO2 challenge/assertion exchange define করে না। তাই P2PFlow কোনো fabricated fingerprint assertion তৈরি করে না; FIDO2 নির্বাচন করলে Binance API release-এর জন্য যে token/code বাস্তবে পাওয়া যায় সেটিই field-এ দিতে হবে।

## Fund Transfer Password server-side auto-use

Binance verification method `Fund Transfer Password` নির্বাচন করলে নতুন **Automatic Fund Transfer Password** option পাওয়া যায়।

ON করতে হলে:

1. Fund Transfer Password save থাকতে হবে;
2. **Require P2PFlow verification before Release** ON থাকতে হবে;
3. Primary local verification configure থাকতে হবে।

Release-এর সময় configured P2PFlow verification সফল হলে server saved Fund Transfer Password নিজে Binance release payload-এ `FUND_PWD` verification হিসেবে apply করবে। Operator-এর browser-এ saved password ফেরত পাঠানো হয় না এবং final-action modal-এ সেটি prefill করা হয় না।

Fund Transfer Password save/clear করার জন্য `credentials.manage` permission প্রয়োজন। `settings.manage` থাকা user secret পরিবর্তন না করে verification preference edit করতে পারে। Audit log শুধু method/configuration summary রাখে; password value রাখে না। Persistent application state database-এ existing encrypted-state storage-এর মধ্যে থাকে।

## Primary এবং Secondary P2PFlow verification

প্রতিটি Binance account-এর জন্য optional local step-up gate configure করা যায়। Supported P2PFlow methods:

- **User Password**
- **6-digit Secret Code**
- **Email OTP**

একটি **Primary** এবং optional আলাদা **Secondary** method রাখা যাবে। Primary verification fail হলে final-action page-এ **Change Verification System** button দেখা যাবে; সেটি ব্যবহার করে configured Secondary method-এ যাওয়া যাবে।

Email OTP local challenge:

- logged-in user-এর registered email-এ যায়;
- challenge 5 মিনিট valid;
- resend cooldown existing OTP policy অনুসরণ করে;
- সর্বোচ্চ failed-attempt guard আছে;
- challenge user + order + action + credential + current session-এর সঙ্গে bound।

Successful local verification থেকে short-lived server-side verification token তৈরি হয়। Token order/action/credential/session bound এবং 5 মিনিট valid। Binance attempt fail হলে token TTL-এর মধ্যে retry করা যায়; token expire হলে local verification আবার করতে হয়। Successful Release হলে token invalidate হয়।

## Release flow

Configured local gate থাকলে SELL Release / Quick Release flow:

1. Existing Payment Split gate আগে complete/satisfied হতে হবে (যদি Split requirement ON থাকে)।
2. Dedicated final-action page খুলবে।
3. Primary P2PFlow verification complete হবে।
4. Primary fail হলে Secondary-তে switch করা যাবে।
5. Configured Binance verification field complete হবে।
6. Auto Fund Password হলে operator password লিখবে না; server-side saved secret ব্যবহার হবে।
7. `checkIfCanReleaseCoin` চলবে।
8. Check allow করলে `releaseCoin` চলবে।

Payment Split already saved থাকলে v1.5.28-এর মতো Split popup পুনরায় আসে না।

## Security hardening

- Saved Fund Transfer Password public Settings response-এ থাকে না; শুধু `fundPasswordConfigured: true/false` status যায়।
- Full Order response-এ password value থাকে না।
- Browser JavaScript bundle internal stored-secret field ব্যবহার করে না।
- Fund Password exact secret হিসেবে preserve করা হয়; trim/normalization করে password বদলানো হয় না।
- Password save/clear `credentials.manage` permission ছাড়া blocked।
- Auto Fund Password local P2PFlow verification ছাড়া enable করা যায় না।
- Local verification token raw form-এ persistent database-এ রাখা হয় না; short-lived in-memory hash দিয়ে validate করা হয়।
- Verification challenge/token session এবং exact order/credential/action-এর সঙ্গে bound।

## Regression coverage

Automated coverage-এ যোগ হয়েছে:

- per-account Release Verification Settings UI;
- documented method catalogue;
- Primary/Secondary fallback UI;
- local verification start/verify endpoints;
- auto Fund Password local-gate enforcement;
- saved Fund Password browser/API policy response-এ না যাওয়া;
- exact Fund Password preservation;
- Google Authenticator payload mapping;
- SMS payload mapping;
- saved split direct final-action flow;
- existing Payment Split edit/delete, balance/limit reconciliation, receive-charge fix, multi-account RBAC, Ads isolation, trusted-device/session, database encryption/persistence, accounting এবং signed updater regression।
