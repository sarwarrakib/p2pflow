# P2PFlow v1.5.29 — Public Launch Checklist

## Package ও deployment

- [ ] `P2PFlow_v1.5.29_UNIFIED.zip` SHA-256 verify করা হয়েছে।
- [ ] Production database এবং runtime config backup আছে।
- [ ] `npm ci --omit=dev --ignore-scripts` সফল।
- [ ] `npm run build` সফল।
- [ ] `npm test` সফল।
- [ ] Schema `35` healthy।
- [ ] Browser/CDN v1.5.29 assets load করছে।

## Release Verification Settings

- [ ] Settings-এ **Release Verification** section দেখা যায়।
- [ ] প্রতিটি Binance API account আলাদা verification profile দেখায়।
- [ ] Binance Auto / FIDO2 / Fund Password / Google / SMS / Email / YubiKey options দেখা যায়।
- [ ] Primary P2PFlow method নির্বাচন করা যায়।
- [ ] Secondary Primary-এর থেকে আলাদা method হিসেবে নির্বাচন করা যায়।
- [ ] Same Primary + Secondary save করতে গেলে validation block করে।
- [ ] Fund Password save/clear `credentials.manage` ছাড়া blocked।
- [ ] Saved Fund Password Settings page reload-এর পর plaintext/prefill হিসেবে ফিরে আসে না।

## P2PFlow Primary/Secondary gate

- [ ] User Password Primary সফল হয়।
- [ ] 6-digit Secret Code Primary/Secondary সফল হয়।
- [ ] Email OTP selected হলে registered email-এ OTP যায়।
- [ ] Primary wrong হলে `Change Verification System` দেখা যায়।
- [ ] Secondary successful হলে Release continue করা যায়।
- [ ] Local token expire হলে verification আবার চায়।
- [ ] Token অন্য order/action/session-এ reuse করা যায় না।

## Automatic Fund Transfer Password

- [ ] Method Fund Transfer Password না হলে Auto-use enable করা যায় না।
- [ ] P2PFlow local verification OFF থাকলে Auto-use enable করা যায় না।
- [ ] Saved Fund Password ছাড়া Auto-use enable করা যায় না।
- [ ] Local verification complete হওয়ার আগে Release auto secret ব্যবহার করে না।
- [ ] Local verification complete হওয়ার পরে browser-এ password না দেখিয়ে server-side secret apply হয়।
- [ ] Audit Log/API response/browser bundle-এ stored Fund Password value প্রকাশ হয় না।

## Binance verification behaviour

- [ ] Google selection Google verification field দেখায়।
- [ ] SMS selection Mobile/SMS field দেখায়।
- [ ] Email selection Binance email-code field দেখায়।
- [ ] YubiKey selection YubiKey field দেখায়।
- [ ] FIDO2 selection fabricated fingerprint assertion তৈরি করে না; concrete API token/code ছাড়া forced release করা হয় না।
- [ ] Binance explicit selected method reject করলে local success ধরে order Released করা হয় না।
- [ ] `checkIfCanReleaseCoin` fail/deny হলে `releaseCoin` পাঠানো হয় না।
- [ ] Unlisted/voice-like Binance challenge-এর জন্য Binance Auto path controlled test করা হয়েছে।

## Existing final-action regression

- [ ] Saved valid Payment Split থাকলে Release retry-তে Split modal আবার আসে না।
- [ ] Proof Mandatory + proof missing হলে split gate অসম্পূর্ণ থাকে।
- [ ] Split requirement OFF হলে direct final-action page আসে।
- [ ] SELL receive split-এ Personal/Merchant Send Money/Cash Out charge `0`।
- [ ] Split Edit/Delete balance এবং daily/monthly limits reconcile করে।
- [ ] Multi-number selection/atomic multi-split কাজ করে।
- [ ] BUY Mark Paid exact linked account/payId ব্যবহার করে।
- [ ] Orders/Ads multi-account isolation ঠিক।
- [ ] Notifications account scope/sound/push ঠিক।
- [ ] Database encrypted-state, backup, accounting এবং signed updater tests healthy।
