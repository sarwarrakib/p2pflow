# Binance C2C Advertiser Feedback CRM Collector v6.1.9

P2PFlow 2.0.7-এর tenant-scoped advertiser/feedback collector। Chrome চালু এবং Binance logged-in থাকলে এটি P2PFlow-এর queued P2P Info task collect করে hidden Binance advertiser tabs থেকে result ফিরিয়ে দেয়।

## 6.1.9 changes

- P2PFlow tenant token (`p2pv2.<tenant>.<signature>`) ছাড়া shared/global CRM task access নেই।
- Direct page bridge exact-origin checked; saved CRM origin-এর বাইরে page message accepted হয় না।
- Manifest আর সব website-এ static content script inject করে না। Binance host permission fixed; configured CRM host permission Save & Connect-এর সময় Chrome থেকে explicitly চাওয়া হয় এবং bridge শুধু সেই host-এ dynamically registered হয়।
- Advertiser URL strict `https://c2c.binance.com/.../advertiserDetail?advertiserNo=...` validation।
- Active work-এর সময় fast polling; idle অবস্থায় adaptive backoff প্রায় 15 seconds পর্যন্ত। Chrome alarm 30-second wake fallback থাকে।
- Multiple hidden collection tabs parallel চালানো যায় (default 3, maximum 6)।
- Same advertiser duplicate in-flight task suppress করা হয়।
- Server claim/result token, retry/lease এবং failed-result handling P2PFlow 2.0.7 backend-এর সঙ্গে compatible।

## Setup

1. Chrome → Extensions → Developer mode → **Load unpacked** → এই `extension/` folder নির্বাচন করুন।
2. P2PFlow-এ **Extension Bridge** page খুলুন এবং আপনার workspace-এর Server URL + tenant-scoped Extension Token copy করুন। Master `P2PFLOW_EXTENSION_TOKEN` browser-এ paste করবেন না।
3. Extension popup খুলে Server URL + tenant token paste করুন।
4. **Save & Connect** চাপুন। Chrome configured CRM host access চাইলে **Allow** করুন।
5. `Listen for SELL order P2P Info clicks from CRM` enabled রাখুন। Max parallel সাধারণত 3 যথেষ্ট।
6. Binance browser session logged-in রাখুন। CAPTCHA/risk verification এলে সেই Chrome profile-এ manually complete করে task retry করুন।

Extension update-এর পর আগের broad host permission intentionally removed হয়েছে। তাই 6.1.9-এ প্রথমবার **Save & Connect** আবার চাপতে হতে পারে যাতে শুধুমাত্র configured CRM host permission grant হয়।
