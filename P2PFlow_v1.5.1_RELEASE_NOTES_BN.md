# P2PFlow v1.5.1

## UI color system update

এই release-এ P2PFlow-এর দৃশ্যমান color system একীভূত করা হয়েছে, যাতে Dashboard, Login, Setup, Orders, Chat, Ads, Notifications এবং shared controls একই visual language অনুসরণ করে।

### পরিবর্তন

- Primary brand accent এখন consistent charcoal + P2P gold palette ব্যবহার করে।
- পুরোনো blue/teal primary-action styling থেকে Login এবং common action controls সরিয়ে unified gold styling দেওয়া হয়েছে।
- Success, warning, danger এবং information state-এর জন্য আলাদা semantic color tokens রাখা হয়েছে।
- Form focus, input borders, cards, tables, modal, notification panel এবং chat bubble-এর contrast সমন্বয় করা হয়েছে।
- Dashboard/Admin/Order/Accounting hero blocks একই dark premium palette-এ আনা হয়েছে।
- Setup wizard-ও main application-এর একই color system ব্যবহার করে।
- Sidebar-এর dark premium layout রাখা হয়েছে এবং global gold brand accent-এর সাথে সামঞ্জস্য করা হয়েছে।
- Mobile menu, language toggle, active tabs এবং primary action states একই accent ব্যবহার করে।
- CSS legacy compatibility aliases (`--soft`, `--border`) রাখা হয়েছে যাতে পুরোনো selectors ভাঙে না।

### অপরিবর্তিত

- Database-only persistence architecture
- Brotli + AES-256-GCM state payload format
- Database object storage for proof/chat media
- Binance C2C/SAPI data flow
- Mail quota/SMTP fallback fixes
- Signed GitHub update workflow
- Runtime/API/business logic

Internal SemVer: **1.5.1**
