# P2PFlow 1.4

## Menu UI redesign

- Sidebar navigation এখন configuration-driven grouped structure ব্যবহার করে।
- Dashboard আলাদা primary item; P2P Trading, Accounting, Team & Control, Reports & Monitoring এবং System accordion group যোগ হয়েছে।
- এক সময়ে একটিমাত্র submenu খোলা থাকে এবং active group স্বয়ংক্রিয়ভাবে খোলে।
- প্রতিটি menu/submenu item-এ consistent SVG icon, active accent bar, compact badge এবং hover state যোগ হয়েছে।
- Orders, P2P Message, Approvals, Alerts এবং System Update-এ প্রয়োজন অনুযায়ী count/NEW badge দেখা যায়।
- Role ও permission visibility logic অপরিবর্তিত; permission না থাকলে item বা empty parent group দেখায় না।
- Mobile bottom navigation এখন Dashboard / P2P / Orders / P2P Message / Menu। Menu থেকে full grouped drawer খোলে।
- Sidebar footer-এ compact server status, version এবং Logout রাখা হয়েছে।
- বাংলা ও ইংরেজি language toggle নতুন menu structure-এ কাজ করে।

## Data and backend safety

এই release UI/navigation-only functional update। Orders, ledger, accounting formulas, users, permissions, database encryption, Binance integration এবং update data-safety workflow পরিবর্তন করা হয়নি।
