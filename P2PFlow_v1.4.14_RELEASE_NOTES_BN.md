# P2PFlow v1.4.14

## Binance P2P Payment Method truth-source fix

- Binance-এর বর্তমান available/documented P2P API-তে payment-method configuration add/edit write endpoint নেই।
- P2PFlow আর payment number/Remarks local override করে এমনভাবে দেখাবে না যেন Binance-এ পরিবর্তন হয়েছে।
- পুরোনো local-only payment-method overrides আর Binance sync data-এর ওপর apply হবে না।
- Payment Method-এর Edit/Manage এবং Add action এখন Binance P2P খুলবে।
- Payment Method page-এ `Sync from Binance` button যোগ হয়েছে; Binance-এ পরিবর্তন করার পর এটি চাপলে নতুন number/Remarks/details P2PFlow-এ আসবে।
- Backend PATCH দিয়ে local payment-method add/edit বন্ধ করা হয়েছে, যাতে stale/fake Binance values তৈরি না হয়।
- Existing Binance payment-method read/sync, dynamic fields, currency catalog এবং method catalog অক্ষত আছে।
