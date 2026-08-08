# P2PFlow v1.4.4 — Navigation Visual Refresh

এই release-এ menu/sidebar-এর **পূর্ণ visual redesign** করা হয়েছে। Existing 26-page structure, role/permission rules, route behavior, accounting logic, orders, chat, Binance integration এবং System Update flow পরিবর্তন করা হয়নি।

## UI পরিবর্তন

- Desktop sidebar width, spacing, typography এবং visual hierarchy নতুন করে সাজানো হয়েছে।
- Brand area এখন premium glass-style control-center card।
- Dashboard একটি আলাদা quick-access card হিসেবে আরও পরিষ্কার active state পায়।
- পাঁচটি accordion group একই structure রাখলেও প্রতিটি group-এর নিজস্ব subtle accent state আছে:
  - P2P Trading
  - Accounting
  - Team & Control
  - Reports & Monitoring
  - System
- Open/active group এখন card surface, accent rail, icon state এবং caret transition দিয়ে স্পষ্ট বোঝা যায়।
- Active submenu-তে accent marker, highlighted icon এবং stronger selected state যোগ হয়েছে।
- Badge/NEW state নতুন sidebar theme-এর সঙ্গে সামঞ্জস্য করা হয়েছে।
- Server status/version footer compact glass panel করা হয়েছে এবং logout control icon-button করা হয়েছে।
- Mobile drawer আরও প্রশস্ত, rounded এবং blurred backdrop সহ নতুন visual treatment পেয়েছে।
- Mobile persistent bottom navigation full-width bar থেকে floating dark dock design-এ পরিবর্তিত হয়েছে।
- Mobile menu button নতুন gold control style পেয়েছে।
- Focus-visible এবং prefers-reduced-motion behavior রাখা হয়েছে।

## Compatibility / safety

- Navigation configuration এবং permission filtering অপরিবর্তিত।
- এক সময়ে একটিমাত্র submenu open থাকার behavior অপরিবর্তিত।
- Existing page IDs/routes অপরিবর্তিত।
- Database/schema/accounting calculation-এ কোনো পরিবর্তন নেই।
- v1.4.3 System Update background staging/fast verification fix অপরিবর্তিত আছে।
- v1.4.1 dependency lock এবং GitHub Actions fixes অপরিবর্তিত আছে।

## Version

- Internal version: `1.4.4`
- Unified package: `P2PFlow_v1.4.4_UNIFIED.zip`
