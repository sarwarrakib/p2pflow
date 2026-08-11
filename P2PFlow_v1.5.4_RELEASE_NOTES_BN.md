# P2PFlow v1.5.4

## P2P Profile ↔ Ads Break realtime sync fix

এই আপডেটে P2P Profile এবং P2P Ads merchant controls একই Binance business state ব্যবহার করে।

### সমস্যার কারণ
- P2P Profile `/sapi/v1/c2c/user/baseDetail` থেকে `businessStatus` দেখাচ্ছিল। Binance status mapping: `1 = Open`, `2 = Closed`, `3 = Take break`।
- Ads realtime merchant monitor প্রধানত `/sapi/v1/c2c/merchant/getAdDetails` থেকে `onlineStatus` পড়ছিল। এই merchant detail response-এ canonical `businessStatus` সবসময় পাওয়া যায় না।
- ফলে Profile-এ `Business On Break` দেখা গেলেও Ads-এর Break toggle stale/unknown/off থাকতে পারত।

### v1.5.4 পরিবর্তন
- Ads merchant realtime loop এখন একই cycle-এ owner `user/baseDetail` business status-ও পড়ে।
- `businessStatus=3` সরাসরি `Business ON + Online OFF + Break ON` হিসেবে map হয়।
- `businessStatus=2` হলে `Business OFF + Online OFF + Break OFF`।
- `businessStatus=1` হলে `Business ON + Break OFF`; Online state merchant detail থেকে আসে।
- Merchant detail সাময়িকভাবে fail করলেও owner business status পাওয়া গেলে Closed/Break state Ads UI-তে সঠিক থাকে।
- Realtime merchant status P2P Profile cache-এ push-back হয় এবং live event দিয়ে Profile page refresh হয়।
- Ads merchant control SSE + 5-second server sync loop আগের মতো থাকে।

### Validation
- Merchant break sync self-test: PASS
- Full npm test: PASS
- npm run build: PASS
- Unified package integrity: PASS
