# P2PFlow 1.2 Release Notes

## বাংলা ও সংক্ষিপ্ত UI

- নতুন browser-এ বাংলা এখন default language।
- Login, navigation, dashboard, orders, chat, advertisements, accounts, reports, accounting, settings, security, System Update এবং setup page-এর বাংলা coverage বাড়ানো হয়েছে।
- নতুন modal, notification, dynamic table, option, placeholder, title ও aria label তৈরি হলেও automatic Bangla translation প্রয়োগ হয়।
- English/Bangla toggle অক্ষত আছে; English mode-ও সংক্ষিপ্ত copy ব্যবহার করে।
- বাংলা পড়ার সুবিধার জন্য Bengali font fallback যোগ করা হয়েছে।

## লেখা ও layout cleanup

- Page subtitle এবং পুনরাবৃত্ত বড় ব্যাখ্যা সরানো হয়েছে।
- প্রয়োজনীয় warning ও security note ছোট করা হয়েছে; গুরুত্বপূর্ণ নির্দেশনা বাদ দেওয়া হয়নি।
- Section spacing, notice এবং helper text compact করা হয়েছে।
- Browser setup page সম্পূর্ণ সংক্ষিপ্ত বাংলা ৫-ধাপের flow-এ লেখা হয়েছে।

## নিরাপত্তা ও ডাটা

- Database schema, accounting formula, order workflow, permissions, Binance actions এবং encrypted storage logic পরিবর্তন করা হয়নি।
- Update/rollback-এর data-safety ও backup নিয়ম অপরিবর্তিত।
- Internal version `1.2.0`; UI-তে `1.2` দেখাবে।
