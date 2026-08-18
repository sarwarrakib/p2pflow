# P2PFlow v1.5.21 — Release Notes

- Application version: `1.5.21`
- Database schema: `33`
- Package type: Unified
- Migration: প্রয়োজন নেই

## ১. Payment Account Serial Number-এর নতুন uniqueness rule

আগের release-এ `Serial Number` পুরো system-এ globally unique ছিল। ফলে bKash, Nagad অথবা আলাদা mobile/label group-এ একই serial ব্যবহার করতে গেলেও account save block হয়ে যেত।

v1.5.21-এ Serial Number-এর uniqueness scope এখন **Payment Method name + Label** অনুযায়ী নির্ধারিত হয়।

### Label থাকলে

একই normalized Payment Method এবং একই normalized Label-এর মধ্যে একই Serial Number দ্বিতীয়বার save করা যাবে না।

উদাহরণ:

```text
bKash + Office Phone + SIM-001   -> Save
bKash + Office Phone + SIM-001   -> Block
bKash + Backup Phone + SIM-001   -> Save
Nagad + Office Phone + SIM-001   -> Save
```

অর্থাৎ একই Payment Method-এর ভিন্ন non-empty Label আলাদা serial namespace হিসেবে কাজ করে।

### Label blank থাকলে

Label না দিলে Serial Number পুরো Payment Method-এর মধ্যে unique থাকবে। একই Payment Method-এর labeled account-এ serialটি আগে থাকলেও conflict হবে।

উদাহরণ:

```text
bKash + [No Label] + SIM-010     -> Save
bKash + Office Phone + SIM-010   -> Block
Nagad + [No Label] + SIM-010     -> Save
```

Blank Label method-wide namespace ব্যবহার করে, যাতে Label ছাড়া account-এর serial ambiguity তৈরি না করে।

## ২. Payment Method name অনুযায়ী namespace

Serial scope Payment Method ID-এর পরিবর্তে normalized Payment Method name ব্যবহার করে। ফলে একই method name-এর duplicate/local alias record থাকলেও serial collision bypass করা যাবে না। Name না থাকলে code, তারপর internal ID fallback হিসেবে ব্যবহৃত হয়।

Normalization:

- শুরু/শেষের whitespace বাদ যায়
- একাধিক whitespace একটি space হয়
- case-insensitive comparison
- Unicode `NFKC` normalization

তাই `Office Phone`, ` office   phone ` এবং `OFFICE PHONE` একই Label scope হিসেবে গণ্য হবে।

## ৩. Add, Edit ও Bulk Add একই নিয়ম ব্যবহার করে

নতুন rule নিচের সব flow-এ server-side enforce করা হয়েছে:

- Add Payment Account
- Edit Payment Account
- Bulk Add Payment Accounts
- Structured bulk payload
- CSV import

Edit-এর সময় বর্তমান account নিজেকে conflict হিসেবে ধরে না। Payment Method, Label অথবা Serial পরিবর্তন করলে final combined scope যাচাই হয়।

## ৪. Bulk Add-এর আগাম duplicate warning

Bulk Add preview-তে একই batch-এর মধ্যে conflicting Serial Number থাকলে affected row লাল warning state দেখাবে। Save করার আগেই user error দেখতে পাবে।

Bulk preview rule:

- same serial + same label -> conflict
- same serial + different non-empty label -> allowed
- same serial + one/both blank label -> conflict

Client-side warning শুধু দ্রুত feedback দেয়; authoritative validation backend-এ থাকে। Existing database-এর conflicting account client থেকে লুকানো থাকলেও server save block করবে।

## ৫. Error response

Serial conflict হলে API এখন structured response দেয়:

```text
code: PAYMENT_ACCOUNT_SERIAL_SCOPE_CONFLICT
scope.paymentMethodId
scope.paymentMethodName
scope.label
```

Error message-এ একই Label scope নাকি blank-Label method-wide scope conflict হয়েছে তা পরিষ্কারভাবে বলা হয়। Existing account number বা অন্য user-এর private account details response-এ প্রকাশ করা হয় না।

## ৬. Database ও backward compatibility

- Database schema `33` অপরিবর্তিত।
- Existing Payment Account record পরিবর্তন বা delete হবে না।
- পুরোনো global uniqueness নতুন rule-এর চেয়ে কঠোর ছিল, তাই existing data automatically compatible।
- Label এবং Serial Number field format অপরিবর্তিত।
- Payment Account permissions, ownership, search, Offline Business reservation এবং ledger behavior অপরিবর্তিত।

## ৭. Verification

নতুন `scripts/payment-account-serial-scope-self-test.js` নিচের caseগুলো runtime-এ যাচাই করে:

- same method + same label conflict
- same method + different non-empty label allowed
- different payment method allowed
- blank label method-wide conflict
- equivalent normalized payment-method names একই namespace
- edit self-exclusion
- blank Serial Number optional
- bulk preview composite validation

## Update-এর পরে

1. Database, `.env`, `.p2pflow/` ও `shared/` backup নিন।
2. Application files replace করুন; persistent data overwrite করবেন না।
3. `npm ci --omit=dev --ignore-scripts`
4. `npm run build`
5. `npm test`
6. Service restart করুন।
7. Browser hard refresh এবং CDN/reverse-proxy asset cache purge করুন।
8. Add/Edit/Bulk Add দিয়ে controlled serial-scope test করুন।

এই update Binance API contract পরিবর্তন করে না। Payment Account Label ও Serial Number P2PFlow-এর internal CRM metadata; Binance C2C Payment Method endpoints অপরিবর্তিত থাকে।
