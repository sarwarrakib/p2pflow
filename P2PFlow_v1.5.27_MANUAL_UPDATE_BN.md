# P2PFlow v1.5.27 — Manual Update Guide

## ১. Backup

Update-এর আগে backup নিন:

- production database;
- `.env`;
- `.p2pflow/`;
- `shared/`;
- current application/previous Unified ZIP।

## ২. Application update

`P2PFlow_v1.5.27_UNIFIED.zip` temporary directory-তে extract করে application files replace করুন। Preserve করুন runtime/database/config data।

Node.js 20+ দিয়ে চালান:

```bash
npm ci --omit=dev --ignore-scripts
npm run build
npm test
```

তারপর service restart, browser hard refresh এবং reverse-proxy/CDN static cache purge করুন। Schema `35` অপরিবর্তিত; database migration নেই।

## ৩. Receive charge regression test

একটি Personal বা Merchant Payment Account-এ Send Money charge `Fixed 5` দিন এবং wallet balance `0` রাখুন। Controlled SELL order-এ 100 BDT receive split save করুন। Expected:

- split save হবে;
- balance `+100` হবে;
- transaction charge `0` হবে;
- receive daily/monthly usage `100` হবে;
- `amount plus transfer charge` error আসবে না।

তারপর একই account দিয়ে BUY/send split করলে configured Send Money charge apply হচ্ছে কিনা আলাদাভাবে যাচাই করুন।

## ৪. Final-action Payment Split policy

Settings > General:

### Require Payment Split = ON

1. `Require Payment Split before Mark Paid / Release` ON রাখুন।
2. Controlled BUY/SELL order-এ Mark Paid বা Release চাপুন।
3. Payment Split modal খুলবে।
4. split complete হওয়ার পরে final action হবে।

### Require Payment Split = OFF

1. setting OFF করুন।
2. split ছাড়া controlled order-এ Mark Paid/Release চাপুন।
3. Payment Split popup আসবে না।
4. direct final action modal আসবে এবং Binance live validation/permission অনুযায়ী action চলবে।
5. existing mismatched split থাকলেও split gate final action block করবে না।

## ৫. Proof policy

`Payment Split Proof`:

- Mandatory: split-gated final action-এর আগে প্রতিটি actual split-এ screenshot proof লাগবে।
- Optional: proof ছাড়াই split/final action চলবে।

দুই mode আলাদা controlled order-এ test করুন।

## ৬. Payment Number multi-select

SELL order chat খুলে Payment Numbers:

1. একটি number click করুন — সঙ্গে সঙ্গে send হওয়া উচিত নয়।
2. দ্বিতীয়/তৃতীয় number select করুন।
3. selected indicator ও count ঠিক আছে দেখুন।
4. `Send Selected` চাপুন।
5. confirmation cancel করলে কিছু send হবে না।
6. confirm করলে multiple number-এর ক্ষেত্রে Binance chat message-এ শুধু number list যাবে।
7. page reload ছাড়াই order-এর selected payment accounts card update হবে।

## ৭. Multi-number split

Multiple payment numbers selected থাকা order-এ Add Payment Split খুলুন। Expected:

- প্রতিটি selected number row;
- Number-এর পাশে Amount;
- নিচে Label + Serial;
- serial natural order;
- row amount `0` হলে save হবে না;
- valid rows একসাথে save হবে;
- একটি invalid row থাকলে পুরো batch fail করবে এবং partial split থাকবে না।

## ৮. Live final-action smoke test

Production credential দিয়ে প্রথম test ছোট controlled order-এ করুন। Mark Paid/Release-এর exact linked Binance credential, refreshed order detail, resolved payId এবং returned Binance status Audit Log-এর সঙ্গে মিলিয়ে দেখুন। Failure হলে local order success status-এ যাওয়া উচিত নয়।
