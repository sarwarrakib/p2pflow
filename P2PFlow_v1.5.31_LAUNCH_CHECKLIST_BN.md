# P2PFlow v1.5.31 — Launch Checklist

- [ ] Production database backup নেওয়া হয়েছে
- [ ] `.env`, `.p2pflow/`, `shared/` backup নেওয়া হয়েছে
- [ ] Application version 1.5.31 দেখা যাচ্ছে
- [ ] Database schema 35 দেখা যাচ্ছে
- [ ] `npm run build` pass
- [ ] `npm test` pass
- [ ] Browser hard refresh করা হয়েছে
- [ ] CDN/reverse-proxy cache purge করা হয়েছে
- [ ] SELL order-এ Binance Auto Release test করা হয়েছে
- [ ] Google missing-code response-এ Authenticator App page আসে
- [ ] Google code submit-এর পরে generic “Binance verification code” field তৈরি হয় না
- [ ] Google retry payload old-compatible dedicated field ব্যবহার করে
- [ ] SMS challenge-এ SMS field আসে
- [ ] Fund Password preference concrete Binance challenge-কে override করে না
- [ ] Stored Fund Password browser-এ expose হয় না
- [ ] Payment Split ON/OFF existing behavior ঠিক আছে
- [ ] Final Release সফল হলে order/accounting status update হয়
