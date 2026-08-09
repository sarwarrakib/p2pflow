# P2PFlow v1.4.11 — P2P Payment Method Reliability Fix

## পরিবর্তন

- Currency picker এবং Payment Method picker-এর Search এখন সরাসরি visible rows filter করে; empty-result state-ও দেখায়।
- Search-এর জন্য method name, short name, identifier, pay type, currency code/name/country—সব searchable text হিসেবে ব্যবহার করা হয়।
- Binance user payment method list থেকে পাওয়া প্রতিটি usable payment-method ID-এর detail endpoint (`getPayMethodById`) দিয়ে full field information hydrate করার চেষ্টা করা হয়। ফলে `fieldList`-এ থাকা wallet/account number, payee, bank, branch, remarks/notes ইত্যাদি profile payment cards এবং editor-এ পাওয়া সহজ হয়।
- Remarks/Note এখন field type-এর ওপর নির্ভর না করে field name/title-এ `remark`, `note`, `instruction` থাকলেও শনাক্ত হয়।
- Mobile `Add a payment method` action bar-এর visibility/stability বাড়ানো হয়েছে।
- Binance-এর documented C2C API payment-method configuration add/edit write endpoint দেয় না। তাই local P2PFlow edit/add আর Binance-side success হিসেবে দেখানো হয় না; API response-এ `paymentMethodWriteSupported: false` দেওয়া হয় এবং UI পরিষ্কার warning দেখায়।

## গুরুত্বপূর্ণ

বর্তমান Binance C2C API দিয়ে configured payment method read করা যায়, কিন্তু payment-method configuration Binance account-এ create/edit করা যায় না। P2PFlow-এ local override রাখা যায়; Binance-side change করতে Binance app/web payment method settings ব্যবহার করতে হবে এবং তারপর profile sync করতে হবে।
