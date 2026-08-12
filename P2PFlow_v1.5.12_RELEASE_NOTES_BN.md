# P2PFlow v1.5.12 Release Notes

## Settings page redesign

আগের Settings page-এ সব configuration একই long form-এ ছিল। v1.5.12-এ Settings-কে ৬টি purpose-based section-এ ভাগ করা হয়েছে:

- General
- Binance & Sync
- Login & Security
- Email Delivery
- Notifications
- Presence & Activity

Desktop-এ compact side navigation এবং mobile-এ horizontal section navigation আছে। User যে section শেষবার খুলেছে browser সেটি মনে রাখে। সব section একই secure Settings form-এর অংশ, তাই প্রয়োজনীয় পরিবর্তন করে একবার Save Settings দিলেই যথেষ্ট।

## Compact Email Delivery

Primary + Backup 1 + Backup 2 + Backup 3 এখন আর চারটি বড় repeated SMTP form হিসেবে দেখা যায় না।

প্রতিটি route card-এ সামনে শুধু দরকারি বিষয় রাখা হয়েছে:

- route status
- enable/disable switch (backup route)
- provider
- From Email
- direct Test button (backup route)

SMTP host, port, encryption, username, password, Reply-To, Envelope From এবং HELO `Connection & sender details` খুললে দেখা যায়। Incomplete enabled SMTP route হলে details নিজে থেকেই open হয় যাতে configuration problem লুকিয়ে না থাকে।

## Email delivery overview

Email section-এর শুরুতে এখন দেখা যায়:

- selected Primary provider
- কতটি Backup enabled
- SMTP last verified time
- Login OTP route last verified time
- compact Primary -> Backup 1 -> Backup 2 -> Backup 3 delivery order

## Mail tests simplified

একটি Mail Test Recipient field-এর নিচে প্রধান দুইটি test সামনে রাখা হয়েছে:

- Test Full Chain
- Test Login OTP

Direct SMTP এবং local PHP/sendmail test `Low-level mail tests`-এর ভেতরে রাখা হয়েছে। প্রতিটি Backup route-এ নিজের ছোট Test button আছে।

## Existing behavior preserved

v1.5.11-এর Automatic Multi-Email Failover engine, Email OTP, Security Question fallback, Owner Emergency Login, OTP-disabled PIN-only login, SMTP stage diagnostics, encrypted password storage, database/state behavior এবং Binance/business functionality পরিবর্তন করা হয়নি।

Failover safety অপরিবর্তিত:

- permanent recipient rejection হলে অন্য provider-এ retry হয় না
- SMTP DATA body পাঠানোর পর ambiguous disconnect হলে duplicate email এড়াতে retry হয় না

## Verification

- Full `npm test`: PASS
- Settings UI self-test: PASS
- Mail failover self-test: PASS
- `npm run build`: PASS
- Manual patch ZIP integrity: verified
- Unified ZIP integrity: verified
