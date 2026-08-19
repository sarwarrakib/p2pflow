# P2PFlow v1.5.28 — Public Launch Checklist

## Package ও deployment

- [ ] `P2PFlow_v1.5.28_UNIFIED.zip` SHA-256 verify করা হয়েছে।
- [ ] Production database এবং runtime config backup আছে।
- [ ] `npm ci --omit=dev --ignore-scripts` সফল।
- [ ] `npm run build` সফল।
- [ ] `npm test` সফল।
- [ ] Schema `35` healthy।
- [ ] Browser/CDN v1.5.28 assets load করছে।

## Saved Payment Split final-action flow

- [ ] Split requirement ON + split missing -> Payment Split modal আসে।
- [ ] Split save করার পর Continue -> dedicated final-action/verification modal আসে।
- [ ] Saved valid split থাকলে Mark Paid আবার click করলে Split modal আসে না।
- [ ] Saved valid split থাকলে Release আবার click করলে Split modal আসে না।
- [ ] Proof Mandatory + proof missing -> Split workflow proof complete করতে বলে।
- [ ] Proof Optional + saved split -> direct final-action modal আসে।
- [ ] Split requirement OFF -> split থাকুক/না থাকুক direct final-action modal আসে।

## Binance verification retry

- [ ] Failed Release-এর error local success status save করে না।
- [ ] Failed Release-এর parsed verification requirement order state-এ preserve হয়।
- [ ] Retry-তে required verification field final-action modal-এ সরাসরি দেখা যায়।
- [ ] Retry-তে Payment Split আবার save হয় না এবং balance/limit duplicate movement হয় না।
- [ ] `checkIfCanReleaseCoin` fail/deny হলে `releaseCoin` পাঠানো হয় না।
- [ ] Successful final action-এর পরে previous failure state clear হয়।

## Existing regression

- [ ] SELL receive split-এ Personal/Merchant Send Money/Cash Out charge `0`।
- [ ] Split Edit/Delete balance ও daily/monthly limit reconcile করে।
- [ ] Multi-number selection এবং atomic multi-split কাজ করে।
- [ ] BUY Mark Paid exact account/payId ব্যবহার করে।
- [ ] SELL Release exact account/payId ব্যবহার করে।
- [ ] Orders/Ads multi-account isolation ঠিক।
- [ ] P2P chat incremental/smooth।
- [ ] Payment Account search/filter/bulk actions ঠিক।
- [ ] Notification scope/sound/push ঠিক।
- [ ] Security/trusted-device session stable।
- [ ] Accounting ও database backup/encryption health ঠিক।
