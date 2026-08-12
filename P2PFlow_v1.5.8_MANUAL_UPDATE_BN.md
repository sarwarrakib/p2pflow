# P2PFlow v1.5.8 Manual Update

এই hotfix-এর জন্য নতুন dependency নেই। cPanel File Manager দিয়ে patch overwrite করে শুধু Node application Restart করলেই হবে।

## Update

1. Application Root-এর backup রাখুন
2. `P2PFlow_v1.5.8_MANUAL_PATCH.zip` Application Root-এ upload করুন
3. ZIP Extract করুন এবং existing files **Overwrite/Replace** করুন
4. cPanel → Setup Node.js App / Application Manager → P2PFlow → **Restart** চাপুন
5. Browser-এ `https://YOUR-DOMAIN/ready` খুলুন
6. JSON-এ `"version":"1.5.8"` আছে নিশ্চিত করুন
7. Login page hard refresh করুন

`/ready`-তে 1.5.8 না দেখালে নতুন code active হয়নি। তখন login test না করে Application Root / Extract location এবং Restart আবার যাচাই করুন।

## Login

1. Owner username/email + password দিয়ে Full Login করুন
2. Sender Gmail/SMTP fail করলে:
   - Security Question configured থাকলে সেটি দেখাবে
   - না থাকলে Owner Emergency Login দেখাবে
3. Owner Emergency Login-এ বর্তমান 6 digit Secret দিন
4. Login হওয়ার পর Settings → Email Sending System থেকে working sender configure করুন

যদি generic mail error এখনও দেখা যায়, login page-এ `Email sender down? Owner Emergency Login` option দেখাবে। সেটি চাপলে server mail route আবার verify করবে এবং delivery fail থাকলে emergency challenge খুলবে।

## এই patch-এ Terminal লাগবে না

- `npm install` / `npm ci` দরকার নেই
- Hosting recovery command দরকার নেই
- login email change দরকার নেই
- database data overwrite হয় না
