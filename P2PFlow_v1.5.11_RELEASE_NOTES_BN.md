# P2PFlow v1.5.11 Release Notes

## Automatic Multi-Email Failover

Settings > Email Sending System এখন একটি **Primary** route-এর পাশাপাশি সর্বোচ্চ **৩টি ordered Backup Email Route** সংরক্ষণ করতে পারে। Login OTP, email recovery/security verification, order email, notification email এবং অন্যান্য site email একই failover chain ব্যবহার করে।

Delivery order:

`Primary -> Backup 1 -> Backup 2 -> Backup 3`

আগের route provider/authentication/quota/network/sender/relay/policy কারণে fail করলে পরের enabled route automatically চেষ্টা করা হয়। কোন backup দিয়ে mail সফল হয়েছে এবং তার আগে কোন route fail করেছে তা mail audit/test response-এ দেখা যায়।

## Independent provider credentials

প্রতিটি backup route-এর নিজস্ব Email System, From/Reply-To, SMTP Host/Port/Encryption, Username, Password/App Password এবং HELO configuration আছে। Gmail, Outlook/Microsoft, Yahoo, Zoho, iCloud, AOL, Fastmail, GMX/Mail.com, Yandex, SendGrid, Mailgun, Brevo, Custom SMTP, Hosting Auto, PHP mail এবং Sendmail ব্যবহার করা যায়।

Backup SMTP password database-backed encrypted state-এর ভেতরেই থাকে এবং Settings API plaintext password ফেরত দেয় না।

## Duplicate / wrong-recipient safety

- Permanent recipient rejection হলে অন্য provider দিয়ে একই invalid recipient-এ mail পুনরায় পাঠানো হয় না।
- RCPT stage-এর temporary 4xx deferral বা relay/provider-specific failure হলে next backup চেষ্টা করা যায়।
- SMTP DATA body পাঠানোর পর response হারিয়ে গেলে first provider mail accept করে থাকতে পারে; explicit 4xx/5xx rejection না থাকলে duplicate mail এড়াতে automatic failover করা হয় না।

## Login security behavior

Login OTP আগে Primary এবং enabled backup routes দিয়ে delivery চেষ্টা করবে। **সব usable route fail হওয়ার পরেই** existing Security Question fallback / Owner Emergency Login behavior চালু হবে। Email OTP disabled থাকলে v1.5.9-এর PIN-only login flow অপরিবর্তিত।

## Settings tests

নতুন/পরিবর্তিত test controls:

- Test Full Mail Chain
- Test Login OTP Failover
- Test Backup Route 1 / 2 / 3
- Existing direct Test SMTP এবং Test Local Mail

প্রতিটি backup route enable করার আগে তার direct test চালানো recommended।

## Compatibility

Existing v1.5.10 configuration automatic Primary route হিসেবেই থাকবে। Backup routes defaultভাবে disabled, তাই update-এর পর existing mail behavior নিজে থেকে পরিবর্তিত হবে না। Database/application data flow, Binance integration, Owner Emergency Login এবং existing mail diagnostics preserved।

## Validation

- Full `npm test`: PASS
- `npm run build`: PASS
- New Mail Failover self-test: PASS
- Manual patch ZIP integrity: PASS
- Unified ZIP integrity: PASS
