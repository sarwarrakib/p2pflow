# P2PFlow v1.5.12 Manual Update

এই update মূলত Settings page redesign এবং Email Delivery UI compact করার জন্য। Database migration বা নতুন npm dependency নেই।

## Manual patch দিয়ে update

1. `P2PFlow_v1.5.12_MANUAL_PATCH.zip` download করুন
2. cPanel/File Manager-এ P2PFlow Application Root-এ upload করুন
3. Extract করে existing files **Overwrite / Replace** করুন
4. Node.js Application **Restart** করুন
5. browser-এ `/ready` খুলে `"version":"1.5.12"` নিশ্চিত করুন
6. Settings page-এ hard refresh দিন

`npm install` বা Terminal command প্রয়োজন নেই।

## নতুন Settings layout

Settings এখন General, Binance & Sync, Login & Security, Email Delivery, Notifications এবং Presence & Activity section-এ ভাগ করা।

Email Delivery-তে Primary এবং Backup route compact card হিসেবে আছে। Provider/From Email সামনে থাকবে; SMTP-এর বিস্তারিত edit করতে `Connection & sender details` খুলবেন।

## Mail failover test

Settings -> Email Delivery:

1. প্রয়োজন হলে Mail Test Recipient দিন
2. `Test Full Chain` চালান
3. `Test Login OTP` চালান
4. কোনো নির্দিষ্ট backup পরীক্ষা করতে সেই Backup card-এর `Test` button ব্যবহার করুন

Existing mail failover/login behavior পরিবর্তন হয়নি।
