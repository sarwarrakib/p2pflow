# P2PFlow v1.7.9 — Owner Permission Root-Cause Audit

## Source comparison finding

পুরনো v1.5.30-এ `admin` role সরাসরি global permission এবং Binance-account scope bypass করত। পরবর্তী permission-hardening-এ role label-কে non-authoritative করা হয়, যা non-owner users-এর security isolation-এর জন্য সঠিক ছিল; কিন্তু durable `isOwner` identity-এর জন্য equivalent superuser boundary রাখা হয়নি।

ফলে তিন ধরনের regression তৈরি হয়েছিল:

1. **Global permission regression** — Owner stored permission list অসম্পূর্ণ/stale হলে Orders/Sync/Chat-এর global gate fail করতে পারত।
2. **Exact-account regression** — Owner-এর `binanceCredentialPermissions` row না থাকলে existing/new Binance account-এ account-scoped permission fail করত। নতুন credential create-এর সময় আলাদা Owner grant row লেখা হচ্ছিল না, তাই future credential-এ সমস্যা আরও স্পষ্ট হতে পারত।
3. **Cross-feature regression** — `canUseOrderCredential()` Orders/Chat/Sync permission যাচাই করার সময় ভুলভাবে `advertisements` feature switch-ও require করছিল। ফলে Ads OFF করলে Chat/Sync operation-ও deny হতে পারত।

আর global Payment Method Sync button empty body পাঠাত, কিন্তু backend একাধিক account থাকলে explicit credential selection চাইত। তাই button-এর intent এবং backend contract মিলছিল না।

## Final authority model

- **P2PFlow Owner (`isOwner === true`)**: full global + all current/future Binance account authority.
- **Non-owner users**: explicit global permissions + exact Binance-account grants.
- Role names templates মাত্র; Owner ছাড়া role label কোনো hidden privilege দেয় না।
- Per-account feature switches permissions নয়; এগুলো display/assignment/notification/advertisement behavior overlay।

## Regression protection

v1.7.9-এ dedicated `owner-superuser-v179-self-test.js` যোগ করা হয়েছে। এটি নিশ্চিত করে:

- Owner global superuser boundary আছে।
- Non-owner role-name bypass নেই।
- Future credential Owner-এর dynamic scope-এ আসে।
- Owner bootstrap full effective authority দেয়।
- Payment account use Owner-এর জন্য all-account।
- Advertisement toggle Chat/Sync permission contaminate করে না।
- Payment Method Sync all accessible accounts aggregate করে।
- Frontend Owner authority backend-এর সাথে consistent।

Existing accounting migration self-test-এও mismatched role-label সহ durable Owner-এর full authority runtime assertion যোগ করা হয়েছে।
