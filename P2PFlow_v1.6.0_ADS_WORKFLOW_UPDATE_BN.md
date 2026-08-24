# P2PFlow v1.6.0 — Advertisement Workflow Update

## এই আপডেটে যা পরিবর্তন হয়েছে

- নতুন Advertisement তৈরি করার পেজ তিনটি ধাপে বিভক্ত: **Set Type & Price**, **Set Amount & Method**, এবং **Set Conditions**।
- **Edit Advertisement** এখন কোনো step ছাড়াই একটি সম্পূর্ণ single-page editor হিসেবে সব তথ্য দেখায়।
- Ads List-এর তিন-ডট action menu থেকে আলাদা **Edit** ও **Delete** action পাওয়া যায়।
- Edit খোলার আগে Advertisement এবং Payment Method তার নিজস্ব Binance API account থেকে পুনরায় যাচাই করা হয়। Account mismatch হলে edit fail-closed হবে; অন্য API account-এর payment method fallback হিসেবে ব্যবহার হবে না।
- Fixed Price-এর live limit Binance reference-price API থেকে নেওয়া হয় এবং `Fixed price must fall within the limited range of: MIN~MAX` আকারে দেখানো হয়। Submit করার ঠিক আগে client ও server উভয় দিক থেকে নতুন করে range যাচাই হয়।
- Advertisement list `createTime`-ভিত্তিক stable ordering ব্যবহার করে। Edit/update time পরিবর্তিত হলেও Ad-এর পূর্বের serial position অপরিবর্তিত থাকে।
- Live Binance Advertisement delete করার সময় প্রথমে Binance-এ ad close করা হয়, তারপর dashboard record archive করা হয়।

## নিরাপত্তা ও account isolation

- Advertisement-এর `credentialId` edit-এর মাধ্যমে পরিবর্তন করা যায় না।
- Advertisement number, Binance credential এবং live detail একসঙ্গে না মিললে editor খোলা হয় না।
- SELL ad-এর saved payment account এবং BUY ad-এর generic payment-method catalog প্রতিটি credential অনুযায়ী আলাদাভাবে refresh ও filter করা হয়।
- Multiple Binance API account থাকলে global payment ID fallback বন্ধ থাকে।

## যাচাই

- JavaScript syntax check: 98 files passed.
- `npm run build`: passed.
- `npm test`: passed, including Ads multi-account isolation, RBAC, merchant state, update/rollback, database encryption এবং accounting self-tests.

## Production update note

Update করার আগে `.env`, `.p2pflow`, `shared/` এবং production database-এর backup রাখুন। Application files replace করার সময় persistent runtime data overwrite করবেন না। এরপর production server-এ dependency install, `npm run build`, `npm test`, production preflight এবং service restart সম্পন্ন করুন।
