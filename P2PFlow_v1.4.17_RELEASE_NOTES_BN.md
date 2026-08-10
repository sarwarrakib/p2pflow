# P2PFlow v1.4.17

## Email recovery lockout fix

- Setup email correction এখন Email Delivery failure হলেও Owner-কে lock out করবে না।
- নতুন email-এ OTP পাঠানো ব্যর্থ হলে server একটি one-time Hosting Recovery Code তৈরি করে `shared/email-recovery-code.txt`-এ রাখে।
- Hosting Recovery Code 15 মিনিট valid, একই browser/network-এ ব্যবহার করতে হয়, সর্বোচ্চ 6টি verification attempt আছে এবং successful recovery-এর পর file auto-delete হয়।
- Code API response বা browser source-এ পাঠানো হয় না; Hostinger/File Manager access লাগবে।
- Username + current password + 6-digit secret + hosting recovery code সফল হলে email update হয়।
- Recovery-এর সময় browser-এর P-256 device key enroll হয় এবং নতুন secure session তৈরি হয়; তাই recovery-এর পর আরেকটি email OTP পাঠিয়ে আবার lockout করা হয় না।

## Update logout migration

- v1.4.16-এর মতো পুরোনো cookie-only session upgrade-এর সময় সঙ্গে সঙ্গে delete করা হয় না।
- Cookie alone API access পায় না। একই browser-এ 6-digit secret এবং নতুন non-extractable device key দিয়ে session secure-upgrade করা যায়।
- ফলে future update-এর পর supported existing session থাকলে email/password ছাড়াই একবার secret দিয়ে secure device login চালু করা যায়।
- Copied cookie একা remote access দিতে পারে না।
