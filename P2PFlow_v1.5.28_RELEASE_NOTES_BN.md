# P2PFlow v1.5.28 — Saved Split Direct Final Action & Verification Retry

## Version

- Application: `1.5.28`
- Database schema: `35`
- Package: Unified
- Database migration: প্রয়োজন নেই

## Saved Payment Split থাকলে আর Split popup পুনরায় খুলবে না

Mark as Paid, Release Coin বা Quick Release-এর জন্য Payment Split policy ON থাকলে frontend এখন server-এর authoritative split-readiness state ব্যবহার করে।

একটি relevant actual Payment Split আগে থেকেই save করা থাকলে এবং Proof policy Mandatory হলে প্রয়োজনীয় proof-ও attached থাকলে final-action button আর Payment Split modal খুলবে না। সরাসরি dedicated final-action / Binance verification modal খুলবে।

ফলে এই flow এখন:

1. Split না থাকলে -> Payment Split modal।
2. Split save -> Continue to Mark as Paid / Release।
3. Dedicated final-action / verification modal।
4. Binance action fail হলেও split আগের মতো save থাকবে।
5. Retry করলে -> আবার Split modal নয়; সরাসরি final-action / verification modal।

Proof Mandatory এবং saved split-এ proof missing থাকলে Split modal এখনও খুলবে, কারণ gate তখন সম্পূর্ণ হয়নি। Proof Optional হলে saved actual split-ই gate satisfy করবে।

## Split step এবং final-action step আলাদা করা হয়েছে

Payment Split modal এখন শুধু split data save/complete করার জন্য। Split form-এর final button এখন `Continue to Mark as Paid`, `Continue to Release Coin` বা `Continue to Quick Release` হিসেবে dedicated final-action modal-এ নিয়ে যায়।

Binance verification field আর Payment Split page-এর দায়িত্ব নয়। এতে split save এবং Binance final action failure একে অন্যের UI state নষ্ট করে না।

## Failed Release verification retry preserve হয়

Binance Release attempt fail করলে safe/sanitized failure metadata order-এর সঙ্গে রাখা হয়:

- action;
- failure time;
- sanitized message;
- Binance যে extra verification field require করেছে তার parsed requirement।

একই Release action আবার খুললে required verification field সরাসরি final-action modal-এ দেখা যায়। User-কে আবার Payment Split page পার হতে হয় না। সফল final action হলে পুরোনো failure state clear হয়ে যায়।

## `checkIfCanReleaseCoin` verification error handling

Release-এর আগে Binance eligibility check failure এখন verification requirement parser-এর মধ্য দিয়ে যায়। Email/SMS/Google Authenticator/Fund password/FIDO2/verification-code-এর মতো concrete requirement Binance error-এ থাকলে তা final verification UI-তে পাঠানো হয়।

Eligibility check allow না করলে `releaseCoin` পাঠানো হয় না।

## Server-side split readiness

Full order response-এ নতুন `finalActionSplitGate` summary রয়েছে:

- `enabled`
- `direction`
- `proofRequired`
- `relevantSplitCount`
- `missingProofCount`
- `satisfied`

Frontend এই server truth-কে primary source হিসেবে ব্যবহার করে; stale local Remaining/selected-wallet state দিয়ে আর split popup নির্ধারণ করে না।

## Regression coverage

`payment-split-final-action-self-test.js` এখন অতিরিক্তভাবে যাচাই করে:

- saved split + required proof -> gate satisfied;
- required proof missing -> gate unsatisfied;
- proof optional -> saved split direct final-action eligible;
- ready split final-action button Split popup bypass করে;
- split completion dedicated final verification modal-এ transition করে;
- failed Binance verification metadata direct retry-এর জন্য preserve হয়।

v1.5.27-এর receive-charge fix, split edit/delete, limit reconciliation, proof policy, Payment Split ON/OFF setting এবং multi-number selection অপরিবর্তিত আছে।
