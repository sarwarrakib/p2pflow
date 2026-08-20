# P2PFlow v1.5.30 — Public Launch Checklist

## Package ও deployment

- [ ] `P2PFlow_v1.5.30_UNIFIED.zip` SHA-256 verify করা হয়েছে।
- [ ] Production database এবং runtime config backup আছে।
- [ ] `npm ci --omit=dev --ignore-scripts` সফল।
- [ ] `npm run build` সফল।
- [ ] `npm test` সফল।
- [ ] Database schema `35` healthy।
- [ ] Browser/CDN v1.5.30 assets load করছে।

## Release Verification flow

- [ ] Payment Split requirement OFF হলে Release সরাসরি dedicated verification screen খোলে।
- [ ] Split already saved/satisfied থাকলে Release retry-তে split page আবার আসে না।
- [ ] Proof requirement OFF হলে proof-এর জন্য final action block হয় না।
- [ ] Binance Auto initial check raw SAPI missing-code error user-কে দেখায় না।
- [ ] Google challenge হলে `Authenticator App Verification` screen আসে।
- [ ] Auto challenge-এ `Binance needs extra verification.` দেখা যায়।
- [ ] Explicit method configured থাকলে `Release requires verification.` দেখা যায়।
- [ ] Verification field পুরোনো Release modal-এর ভেতরে নয়; dedicated screen-এ থাকে।
- [ ] `checkIfCanReleaseCoin` deny/fail হলে `releaseCoin` পাঠানো হয় না।

## Responsive verification UI

- [ ] Android portrait-এ full-screen responsive।
- [ ] ছোট screen-এ horizontal overflow নেই।
- [ ] Paste action কাজ করে বা clipboard unavailable হলে safe fallback দেখায়।
- [ ] Desktop/tablet-এ centered verification card ঠিকভাবে দেখা যায়।
- [ ] Back এবং Close action কাজ করে।

## Per-API Release Verification

- [ ] System Settings-এ Release Verification section নেই।
- [ ] API Credentials-এর প্রতিটি row-এ gear icon আছে।
- [ ] Gear icon সংশ্লিষ্ট credential-এর Release Verification popup খোলে।
- [ ] Binance Auto / FIDO2 / Fund Password / Google / SMS / Email / YubiKey selection কাজ করে।
- [ ] Primary P2PFlow verification configure করা যায়।
- [ ] Secondary Primary-এর থেকে আলাদা method হিসেবে configure করা যায়।
- [ ] Primary fail/unavailable হলে Secondary fallback পাওয়া যায়।
- [ ] Saved Fund Password browser/API response-এ plaintext আসে না।

## API Credential connect

- [ ] নতুন credential Save-এর আগে automatic validation হয়।
- [ ] Save-এর আগে live Binance C2C check হয়।
- [ ] Live check fail হলে credential save হয় না।
- [ ] Successful profile sync-এর পরে P2P username table-এ identity হয়।
- [ ] generic `Main Binance Account` নতুন credential name হিসেবে আসে না।
- [ ] Validate/Live Check text button নেই।
- [ ] gear / enable-disable / delete compact icon action হিসেবে দেখা যায়।

## Existing business regression

- [ ] Payment Split edit/delete balance ও daily/monthly limit restore করে।
- [ ] SELL receive split-এ Send Money/Cash Out charge apply হয় না।
- [ ] BUY/SELL relevant split accounting ঠিক।
- [ ] Orders/Ads account scope ও notifications scope ঠিক।
- [ ] Multi-account Ads isolation ঠিক।
- [ ] Payment Account RBAC/bulk actions ঠিক।
- [ ] Session/trusted-device/authentication stable।
- [ ] Database encrypted-state, backup, accounting ও signed updater tests healthy।

## Controlled live Binance check

- [ ] ছোট SELL order-এ Binance Auto verification tested।
- [ ] Production account যে verification method বাস্তবে চায় সেটি tested।
- [ ] Failed verification-এর পরে retry split পুনরায় add করে না।
- [ ] Successful Release-এর পরে order state/ledger expectedভাবে update হয়।
