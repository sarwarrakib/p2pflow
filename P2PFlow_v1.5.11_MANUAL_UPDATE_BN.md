# P2PFlow v1.5.11 Manual Update

এই update-এ নতুন npm dependency নেই। v1.5.10 থেকে manual update করতে Terminal command বা `npm install` দরকার নেই।

1. `P2PFlow_v1.5.11_MANUAL_PATCH.zip` download করুন
2. cPanel / Hosting File Manager-এ P2PFlow application root-এ upload করুন
3. ZIP Extract করুন এবং existing files **Overwrite / Replace** করুন
4. Node.js Application থেকে **Restart** দিন
5. browser-এ `/ready` খুলে `"version":"1.5.11"` নিশ্চিত করুন
6. Settings page-এ hard refresh দিন

## Multi-email failover setup

Settings > Email Sending System-এ:

- Primary Email Sending System আগের মতো configure করুন
- Automatic Mail Failover থেকে Backup Email Route 1 enable করুন
- আলাদা provider/account-এর SMTP তথ্য দিন
- `Test Backup Route 1` চালান
- প্রয়োজন হলে Backup Route 2 এবং 3 একইভাবে configure করুন
- শেষে `Test Full Mail Chain` এবং `Test Login OTP Failover` চালান

Recommended: Primary এবং backup-এ একই provider/account ব্যবহার না করে independent provider ব্যবহার করুন। যেমন Primary Custom SMTP, Backup 1 Outlook/Microsoft, Backup 2 অন্য verified SMTP/Zoho।

সব mail route fail করলে তবেই Security Question fallback / Owner Emergency Login ব্যবহার হবে।
