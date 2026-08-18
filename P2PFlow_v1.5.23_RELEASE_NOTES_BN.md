# P2PFlow v1.5.23 — Payment Account Bulk Serial Scope Fix

- Application version: `1.5.23`
- Database schema: `33`
- Package type: Unified
- Database migration: প্রয়োজন নেই

## সমস্যার মূল কারণ

v1.5.21–v1.5.22-এ Serial conflict rule প্রয়োজনের চেয়ে বেশি কঠোর ছিল। কোনো Payment Method-এর পুরোনো Payment Account-এ Label ফাঁকা থাকলে সেই Serial পুরো Payment Method-এর জন্য reserve হয়ে যেত। ফলে নতুন row-তে সঠিক Label দেওয়া থাকলেও পুরোনো no-Label account-এর Serial মিলে গেলে Bulk Add block হতো।

উদাহরণ:

```text
Existing: Nagad + No Label + Serial 03
New:      Nagad + Mobile A + Serial 03
```

আগের rule এটিকে conflict ধরত। Error message incoming Label দেখে তৈরি হওয়ায় “same Label under Nagad” দেখাত, যদিও প্রকৃত conflicting record-এর Label ফাঁকা ছিল। তাই message বিভ্রান্তিকর ছিল।

Bulk Add atomic হওয়ায় Account 3, 4 ও 5-এর যেকোনো validation error থাকলে কোনো account-ই তৈরি হতো না। এটি data consistency-এর জন্য ইচ্ছাকৃত behavior; false-positive validation-টাই bug ছিল।

## সংশোধিত Serial uniqueness rule

Serial scope এখন:

```text
Normalized Payment Method Name + Normalized Label
```

Label না থাকলে সেটি আলাদা `no-Label` scope। এটি named Label-এর wildcard নয়।

### Allowed

```text
Nagad + Mobile A + 03
Nagad + Mobile B + 03
Nagad + No Label + 03
bKash + Mobile A + 03
```

উপরের চারটি আলাদা scope, তাই একই Serial ব্যবহার করা যাবে।

### Blocked

```text
Nagad + Mobile A + 03
Nagad + mobile   a + 03
```

Case, অতিরিক্ত space এবং Unicode normalization-এর পরে Label একই হওয়ায় দ্বিতীয় row block হবে।

```text
Nagad + No Label + 03
Nagad + No Label + 03
```

দুইটি no-Label row একই scope হওয়ায় দ্বিতীয় row block হবে।

## Bulk Add diagnostics উন্নত করা হয়েছে

Bulk preview এখন সত্যিকারের conflict হলে:

- conflicting দুই/একাধিক row লাল border-এ দেখায়;
- exact Serial দেখায়;
- exact Label অথবা `no-Label scope` দেখায়;
- কোন Account row-এর সঙ্গে duplicate হয়েছে তা দেখায়।

Server validation response এখন জানায়:

- `PAYMENT_ACCOUNT_SERIAL_SCOPE_CONFLICT` code;
- Payment Method;
- Label/no-Label scope;
- Serial Number;
- conflict current bulk list-এর কোন row-তে, নাকি existing account-এ;
- actor accountটি দেখার permission রাখলে conflicting account number।

Permission-এর বাইরে থাকা account number error response-এ প্রকাশ করা হয় না।

## Add, Edit ও Import consistency

একই authoritative rule এখন প্রযোজ্য:

- Add Payment Account
- Edit Payment Account
- Bulk Add
- CSV import
- Structured bulk import

Comparison এখনও ব্যবহার করে:

- leading/trailing whitespace trim;
- repeated whitespace collapse;
- case-insensitive comparison;
- Unicode NFKC normalization;
- normalized Payment Method name namespace।

## Existing data ও migration

- Database schema `33` অপরিবর্তিত।
- Existing Payment Account, balance, ledger, Label বা Serial পরিবর্তন করা হবে না।
- কোনো automatic rename বা data deletion নেই।
- পুরোনো no-Label account নতুন named Label account-কে আর block করবে না।
- সত্যিকারের same method + same normalized Label + same Serial conflict এখনও block হবে।

## Verification

Release-specific checks যাচাই করে:

- same Payment Method + same normalized Label + same Serial conflict;
- different named Labels একই Serial reuse করতে পারে;
- named Label ও no-Label একই Serial reuse করতে পারে;
- দুইটি no-Label row একই Serial ব্যবহার করতে পারে না;
- different Payment Method একই Serial reuse করতে পারে;
- legacy no-Label existing account named Label row block করে না;
- Add/Edit self-record conflict হিসেবে ধরা হয় না;
- Bulk preview exact conflicting row দেখায়;
- server diagnostic exact scope ও Serial দেখায়;
- full JavaScript syntax, build ও regression suite pass করে।
