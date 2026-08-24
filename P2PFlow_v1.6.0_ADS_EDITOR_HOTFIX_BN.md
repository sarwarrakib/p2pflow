# P2PFlow v1.6.0 — Advertisement Editor Hotfix

## সম্পন্ন আপডেট

### 1. নতুন Advertisement তৈরির ৩ ধাপ
- নতুন Advertisement তৈরির সময় আগের মতো তিনটি ধাপ থাকবে:
  1. Set Type & Price
  2. Set Amount & Method
  3. Set Conditions
- শেষ ধাপে Preview এবং Post করা যাবে।

### 2. Edit Advertisement এখন Single Full Page
- Edit Advertisement-এ আর step navigation নেই।
- Advertisement-এর সব তথ্য ও setting একই scrollable page-এ দেখা এবং edit করা যাবে।
- Advertisement-এর Binance account edit করার সময় পরিবর্তন করা যাবে না।

### 3. Ads List-এর Three-dot Action Menu
- Three-dot button এখন সরাসরি editor খুলবে না।
- ক্লিক করলে নিচের action দেখাবে:
  - Edit
  - Delete
- Edit ক্লিক করলে latest live data যাচাই করে single-page editor খুলবে।
- Delete ক্লিক করলে confirmation-এর পরে live Advertisement হলে আগে Binance-এ close এবং পরে P2PFlow থেকে remove হবে।

### 4. একাধিক Binance API Account-এর সম্পূর্ণ Isolation
- Advertisement যে credential/account-এর, editor শুধুমাত্র সেই account-এর data ব্যবহার করবে।
- Account A-এর Advertisement-এ Account B-এর payment account/payId ব্যবহার করা যাবে না।
- Edit preload-এর সময় exact account থেকে Advertisement detail এবং payment methods যাচাই না হলে editor fail-closed অবস্থায় block হবে।
- PATCH request দিয়ে credentialId পরিবর্তনের চেষ্টা server থেকে reject হবে।
- Existing live Advertisement update করার আগে exact account-এর live detail এবং payment-method ownership আবার যাচাই হবে।

### 5. Dynamic Fixed Price Range
- Fixed price range selected Binance account, asset, fiat, BUY/SELL side এবং selected payment method অনুযায়ী Binance C2C reference-price API থেকে refresh হয়।
- Editor load, pair/side/payment-method change এবং final Save/Post-এর আগে range পুনরায় refresh হয়।
- Input field-এ live `min`, `max` এবং price tick/step বসানো হয়।
- Range-এর বাইরে value দিলে এই ধরনের message দেখাবে:
  - `Fixed price must fall within the limited range of: 122.48~132.27`
- Client-side check-এর পাশাপাশি Create, Edit এবং Publish endpoint-এ server-side revalidation আছে।
- Binance response-এ explicit min/max bounds থাকলে তা সরাসরি ব্যবহার করা হয়। শুধু reference price থাকলে live reference-based Binance UI band হিসাব করা হয় এবং upper tick floor করা হয়।

### 6. Advertisement Serial/Position স্থির রাখা
- Ads list আর `updatedAt` বা edit time দিয়ে sort হয় না।
- Immutable create time এবং stable ID tie-breaker দিয়ে order রাখা হয়।
- কোনো Advertisement edit করার পরে সেটি list-এর উপরে উঠে যাবে না।
- Binance sync request-ও stable `createTime` order ব্যবহার করে।

## পরিবর্তিত প্রধান ফাইল
- `app-server.js`
- `public/js/pages/ads.js`
- `public/style.css`
- `scripts/advertisement-reference-ui-self-test.js`

## Verification
- JavaScript syntax check: 98 files passed
- Advertisement workflow self-test: passed
- Multi-account ad payload self-test: passed
- Merchant account isolation self-test: passed
- Full `npm test`: passed
- Accounting self-test: passed

## Live Acceptance Note
Automated test suite সম্পূর্ণ পাস করেছে। নিরাপত্তার কারণে কোনো বাস্তব Binance Advertisement create/edit/delete mutation চালানো হয়নি; production account-এ deploy করার পরে একটি controlled test Advertisement দিয়ে final live acceptance test করতে হবে।
