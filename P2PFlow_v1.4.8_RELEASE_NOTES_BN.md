# P2PFlow v1.4.8 — P2P Profile / Security Separation

## কী পরিবর্তন হয়েছে

- Mobile footer-এর **Profile** এখন সরাসরি নতুন **P2P Profile** page খুলবে।
- **Security** আর P2P Profile page নয়; এটি এখন শুধুমাত্র P2PFlow login/email/password/6-digit secret security settings-এর জন্য আলাদা page।
- Sidebar-এর **P2P Trading** group-এ নতুন **P2P Profile** navigation item যোগ হয়েছে।
- P2P Profile-এর আগের Trade / Others / Feedback / API profile switch / share / sync systems একই dedicated page-এ রাখা হয়েছে।
- Profile-এর **More** section-এ Binance owner account-এর অতিরিক্ত তথ্য দেখানো হয়েছে: KYC status/type/name, country, mobile verification/bind status, Google 2FA, P2P agreement, sub-account status, business status, complaint flag, merchant/user numbers, followers/following, ads, payment method count, order-summary counters, source এবং last-sync time।
- Binance C2C SAPI `GET /sapi/v1/c2c/paymentMethod/getPayMethodByUserId` ব্যবহার করে owner payment methods sync যোগ হয়েছে। Profile-এর **Payment Method(s)** এখন internal Payment Accounts page-এ না গিয়ে P2P Profile-এর নিজস্ব subpage-এ Binance-returned methods দেখায়।
- Official `POST /sapi/v1/c2c/user/baseDetail` data এবং `GET /sapi/v1/c2c/orderMatch/getUserOrderSummary` data profile record-এ সংরক্ষণ/দেখানোর support যোগ হয়েছে।
- Existing public profile + merchant detail + Chrome extension feedback fallback/sync flow রাখা হয়েছে।

## Version

`1.4.8`
