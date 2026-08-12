# P2PFlow v1.5.10 Manual Update

1. `P2PFlow_v1.5.10_MANUAL_PATCH.zip` download করুন
2. cPanel File Manager-এ P2PFlow Node Application Root খুলুন
3. ZIP upload করে Extract করুন
4. Existing files Replace/Overwrite করুন
5. Node.js Application থেকে Restart দিন
6. `/ready` খুলে JSON-এ `"version":"1.5.10"` নিশ্চিত করুন
7. Browser-এ hard refresh দিন

## SMTP পরীক্ষা

Settings > Email Sending System-এ গিয়ে:

1. Custom SMTP নির্বাচন করুন
2. SMTP Host, Port, Encryption, Username, Password/App Password এবং From Email Save করুন
3. Provider যদি authenticated sender match চায়, `From Email` SMTP Username-এর একই email দিন অথবা provider-verified sender দিন
4. নতুন `Mail Test Recipient` field-এ একটি নিশ্চিত working destination email দিন
5. প্রথমে `Test SMTP` চাপুন
6. তারপর `Test Login OTP Route` চাপুন

Failure হলে result box-এ `SMTP stage`, code এবং provider response দেখাবে।

- `MAIL_FROM` = sender/From Email সমস্যা
- `RCPT_TO` = recipient বা relay policy সমস্যা
- `DATA_BODY` = provider policy/domain verification/spam/quota সমস্যা

কোনো Terminal command বা `npm install` প্রয়োজন নেই।
