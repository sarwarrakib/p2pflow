# P2PFlow v1.4.6 — Sidebar Scroll Hotfix

এই hotfix v1.4.5-এর public asset synchronization এবং grouped navigation baseline-এর উপর তৈরি।

## কী ঠিক হয়েছে

- Sidebar-এর menu area এখন সব desktop/mobile viewport-এ আলাদা vertical scroll region হিসেবে কাজ করবে।
- Sidebar `100dvh`-এ bounded থাকে; brand ও server/logout footer জায়গা নেওয়ার পরে navigation বাকি height ব্যবহার করে।
- বড় submenu বা permission অনুযায়ী বেশি menu item থাকলেও নিচের item আর viewport-এর বাইরে inaccessible থাকবে না।
- Mouse wheel/trackpad sidebar-এর brand/footer-এর উপর থাকলেও menu list scroll করতে পারবে।
- Mobile drawer-এ touch scrolling, momentum scrolling এবং overscroll containment যোগ করা হয়েছে।
- Keyboard `PageUp`, `PageDown`, `Home`, `End` দিয়ে long menu scroll করা যাবে।
- Accordion group খোলার পরে active/target item প্রয়োজন হলে নিজে থেকে visible range-এ চলে আসে।

## অপরিবর্তিত

- Dashboard + পাঁচটি grouped navigation section
- এক সময়ে একটি submenu open
- Role/permission filtering
- Existing page IDs/routes, badges এবং mobile bottom navigation
- Accounting, orders, P2P chat, Binance integration, database এবং update engine behavior
- v1.4.5 public asset mirror/cache fixes
