# P2PFlow v1.4.16 — Trusted Device Login + Email Recovery

## Login security
- প্রথমবার/নতুন ডিভাইসে পূর্ণ লগইন: username/email + password + email OTP + 6 digit secret।
- সফল পূর্ণ লগইনের পরে browser একটি P-256 device key তৈরি করে। private key non-extractable অবস্থায় IndexedDB-তে থাকে; server শুধু public key রাখে।
- একই trusted browser-এ পরবর্তী লগইনে password বা email OTP লাগে না; শুধু 6 digit secret এবং device-key signature লাগে।
- Trusted-device মেয়াদ default 30 দিন। মেয়াদ শেষ হলে আবার একবার পূর্ণ লগইন করতে হবে।
- Session cookie browser/network binding পেয়েছে এবং normal API request-এ আলাদা device-id binding লাগে। তাই শুধু copied cookie দিয়ে অন্য ডিভাইস থেকে API session ব্যবহার করা যাবে না।
- Default SameSite cookie policy `Strict` করা হয়েছে।
- Security page থেকে trusted browser list দেখা ও revoke করা যায়।

## ভুল setup email recovery
- Login page এবং Security page-এ `Correct Setup Email` flow যোগ হয়েছে।
- Username + current password + current 6 digit secret যাচাই করে OTP নতুন email-এ পাঠানো হয়।
- নতুন email OTP সফল হলে saved login email update হয়।
- Recovery সফল হলে পুরোনো sessions ও trusted devices revoke হয় এবং পরের login পূর্ণ login হয়।

## Mail load কমানো
- Trusted browser login-এ কোনো email OTP পাঠানো হয় না।
- Failed-login security alert email প্রতি account-এ rate-limited; default cooldown 6 ঘণ্টা। Audit Log-এ security event থেকে যায়।
- Email correction flow-এ verification mail শুধুমাত্র নতুন email-এ যায়।

## সীমাবদ্ধতা
- এই ব্যবস্থা copied cookie / copied session replay-এর ঝুঁকি কমায়। কিন্তু যদি malware বা remote-control software আসল browser/device-টিই নিয়ন্ত্রণ করে, web application একা সেটাকে সম্পূর্ণভাবে প্রতিরোধ করতে পারে না।

## Test
- Full `npm test` passed.
- নতুন trusted-device auth self-test WebCrypto ECDSA signature ↔ Node verification compatibility পরীক্ষা করে।
