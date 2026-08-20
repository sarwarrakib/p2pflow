# P2PFlow v1.5.31 — Release Notes

**Application:** 1.5.31  
**Database schema:** 35  
**Migration:** প্রয়োজন নেই

## Release Verification regression fix

v1.5.30-এ তিনটি verification regression ছিল:

1. API account-এ Fund Transfer Password/Google/SMS preference নির্বাচন করলে সেটি Binance-এর পরে ফেরত দেওয়া concrete challenge-এর ওপরেও force হচ্ছিল।
2. `Verification failed`-এর মতো generic error-এ `verification` শব্দ পাওয়া মাত্র UI ভুলভাবে একটি generic **Binance verification code** field বানাচ্ছিল।
3. Google/SMS verification payload-এ dedicated `googleVerifyCode`/`mobileVerifyCode` field-এর সঙ্গে `authType=GOOGLE/SMS`-ও force করা হচ্ছিল। আগের working flow-এর compatibility ফিরিয়ে dedicated field পাঠানো হচ্ছে, extra authType selector force করা হচ্ছে না।

## নতুন challenge-driven behavior

- Saved verification method এখন **preference**, security override নয়।
- Binance যদি concreteভাবে Google Authenticator চায়, Google field-ই দেখাবে—যদিও API settings-এ Fund Transfer Password selected থাকে।
- Binance যদি SMS চায়, SMS field দেখাবে; Email/YubiKey/Fund/FIDO2-এর ক্ষেত্রেও concrete challenge preference-এর আগে priority পাবে।
- `Your google verification code is missing` → Authenticator App Verification screen।
- `Verification failed` → নতুন generic code field নয়; আগের concrete verification screen-ই থাকবে এবং fresh code retry করতে বলবে।
- Generic **Binance verification code** field কেবল Binance message-এ সত্যিই generic verification/authentication code missing/required বলা হলে দেখাবে।
- Raw Binance JSON/error payload user-facing verification form-এ দেখানো হবে না।

## Google/SMS compatibility

Google Authenticator retry-তে `googleVerifyCode` এবং SMS retry-তে `mobileVerifyCode` ব্যবহার হবে। এই dedicated fields ব্যবহার করার সময় P2PFlow আর `authType=GOOGLE` বা `authType=SMS` force করবে না।

## Fund Transfer Password

- Saved Fund Password auto-use আগের মতো P2PFlow local step-up verification-এর পরে server-side থেকে ব্যবহার হবে।
- কিন্তু Binance যদি concreteভাবে অন্য verification method চায়, stored Fund Password আর সেই challenge-এর ওপর force করা হবে না।
- Fund Password browser-এ expose/prefill করা হয় না।

## UI / cache

সব browser asset query version `1.5.31` করা হয়েছে যাতে পুরোনো v1.5.29/v1.5.30 verification UI cache থেকে load হওয়ার ঝুঁকি কমে। Deployment-এর পরে hard refresh করা আবশ্যক।

## Verification

- 88 JavaScript files syntax checked
- targeted Payment Split / Final Action verification self-test passed
- Fund Password preference → Google challenge override passed
- Google/SMS dedicated payload regression test passed
- generic `Verification failed` does not invent a verification field
- Google missing-code challenge detection passed
- full `npm run build` passed
- full `npm test` passed
- PHP lint passed
- clean-extracted final ZIP build/test passed
