# P2PFlow v1.6.2 Release Notes

এই রিলিজটি Orders UI performance, mobile order readability, Buy/Sell color semantics এবং mobile navigation drawer-এর iOS blur/stacking সমস্যার জন্য focused stability update।

## Orders filter performance

- Orders filter trigger থেকে uploaded PNG image সম্পূর্ণ সরানো হয়েছে। এখন P2P Market-এর একই inline SVG funnel icon ব্যবহার হয়, তাই icon sharp, responsive এবং extra image fetch/cache dependency নেই।
- Filter popup এখন fixed overlay হিসেবে খোলে এবং open করার সময় আর first select-এ forced focus দেওয়া হয় না। বড় order list-এর layout recalculation কমে যায়।
- API Account, Buy/Sell, Payment Method ও Date filter apply/save/reset সম্পূর্ণ prefetched local Orders data-এর ওপর কাজ করে; filter action কোনো নতুন `/api/orders` request অপেক্ষা করে না।
- বড় Fulfilled history একসাথে সব All/Completed/Cancelled DOM-এ render করা হয় না। Active tab progressive 120-order batch-এ render হয়। viewport bottom-এর কাছে গেলে পরের batch automatically load হয়; network round-trip লাগে না।
- Ongoing/Fulfilled দুটো group DOM-এ available থাকে, তাই group switch এখনও immediate hidden/show toggle।
- Tab/filter/load-more rerender scroll position preserve করে।

## Order colors

- BUY এখন Orders desktop table ও order detail badge-এ green success color।
- SELL এখন Orders desktop table ও order detail badge-এ red danger color।
- Mobile order list-এর Buy green / Sell red semantics অপরিবর্তিত রেখে unified করা হয়েছে।

## Mobile order detail contrast

- Global dark hero theme mobile order detail card-কে dark করে দিচ্ছিল, অথচ text mobile light-theme color থাকায় Order No/Rate/Created ইত্যাদি পড়া কঠিন হচ্ছিল।
- Mobile order detail hero এখন explicit light surface, dark readable text, light separators এবং existing quantity breakdown-এর সঙ্গে consistent contrast ব্যবহার করে।

## Mobile side menu blur fix

- Fixed AppShell mobile rule sidebar এবং sidebar backdrop-কে একই z-index দিচ্ছিল। কিছু iOS/WebKit browser-এ backdrop drawer-এর উপর render হয়ে menu text dark/blurred দেখাতে পারত।
- Sidebar এখন backdrop-এর উপরে deterministic z-index পায়।
- Mobile sidebar backdrop ও sidebar brand-এর backdrop blur বন্ধ করা হয়েছে, যাতে drawer text সবসময় sharp থাকে।

## Regression safety

- Existing login CSRF pre-session fix, chat/P2P Market scroll-stability logic, multi-account scope, permission model এবং order group fast switch রাখা হয়েছে।
- নতুন `stability-order-filter-v162-self-test.js` filter SVG reuse, progressive rendering, cached filter path, Buy/Sell colors, mobile order contrast এবং sidebar stacking verify করে।

## Version

- Previous: `1.6.1`
- Current: `1.6.2`
- Version carry rule unchanged: `1.6.9 -> 1.7.0`, `1.9.9 -> 2.0.0`।
