# P2PFlow v1.5.36 — Release Notes

**Application:** 1.5.36  
**Database schema:** 36  
**Migration:** নতুন migration প্রয়োজন নেই

## FUND_PWD Release flow সংশোধন

Binance CS team-এর দেওয়া 3-step FUND_PWD flow অনুযায়ী Release implementation পরিবর্তন করা হয়েছে:

1. `GET /sapi/v1/c2c/cryptography/rsa-public-key`
2. Fund Transfer Password server memory-তে Binance RSA public key দিয়ে RSA/OAEP-SHA256 encryption
3. `POST /sapi/v1/c2c/orderMatch/releaseCoin` with:
   - `authType: FUND_PWD`
   - `code: <RSA-encrypted fund password>`
   - `orderNumber`
   - `payId`
   - `confirmPaidType: normal`

FUND_PWD flow-এ `checkIfCanReleaseCoin` মাঝখানে ঢোকানো হয় না; Binance CS-এর 3-step sequence সরাসরি অনুসরণ করা হয়।

## Saved Fund Transfer Password

- API credential-এর Release Verification = **Fund Transfer Password** হলে saved password automaticভাবে ব্যবহার হবে।
- Saved password browser/API response-এ ফেরত দেওয়া হয় না।
- প্রতিটি release attempt-এ fresh Binance C2C RSA public key নেওয়া হয় এবং password encrypt করে ciphertext Binance-এ পাঠানো হয়।
- Legacy plaintext password `code` হিসেবে পাঠানো হয় না।
- RSA ciphertext-এর জন্য পুরোনো 180-character plaintext limit প্রযোজ্য নয়; encrypted payload truncation fix করা হয়েছে।

## P2PFlow/CRM verification ON হলে

Primary/Secondary P2PFlow verification enabled থাকলে flow:

`Release -> P2PFlow verification -> saved Fund Password -> RSA encryption -> releaseCoin`

Primary fail করলে configured Secondary verification আগের নিয়মে ব্যবহার করা যাবে। Verification pass না করলে saved Fund Password ব্যবহার করা হবে না।

## P2PFlow/CRM verification OFF হলে

Saved Fund Transfer Password থাকলে:

`Release -> RSA public key -> encrypt saved password -> releaseCoin`

অতিরিক্ত CRM verification page লাগবে না।

## Password saved না থাকলে

Release click করলে dedicated Fund Transfer Password field দেখাবে। User যে password দেবে সেটি current request-এর জন্য server memory-তে নিয়ে RSA encryption করা হবে; Binance-এ plaintext পাঠানো হবে না।

## অন্যান্য verification method

Google Authenticator, SMS/Mobile OTP, Binance Auto, FIDO2, Email OTP এবং YubiKey-এর v1.5.35 challenge-driven behavior অপরিবর্তিত রাখা হয়েছে।

## Regression coverage

- RSA public-key endpoint mapping
- RSA/OAEP-SHA256 encryption round-trip
- saved password automatic flow
- manual Release-time Fund Password
- optional CRM verification gate
- Primary/Secondary gate
- encrypted ciphertext truncation protection
- Google/SMS existing mapping
- generic verification-code false field regression
- Payment Split/final action regressions
- permission/RBAC/accounting/session/update regressions

## Live deployment note

Build environment-এ production Binance credential বা real coin release ব্যবহার করা হয়নি। Deployment-এর পরে ছোট controlled SELL order দিয়ে FUND_PWD live smoke test করুন।
