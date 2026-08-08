# P2PFlow v1.4.5 — Active UI Sync Hotfix

এই hotfix-এর লক্ষ্য হলো এমন একটি সমস্যা সমাধান করা যেখানে **System Update-এ Current Version নতুন দেখালেও browser-এ পুরোনো sidebar/menu JavaScript থেকে যেত**।

স্ক্রিনশট অনুযায়ী server/runtime `1.4.4` active ছিল, কিন্তু sidebar এখনও legacy flat navigation দেখাচ্ছিল। Source inspection-এ দুইটি stale-frontend risk পাওয়া গেছে:

1. Managed release switch শুধু `releases/<version>` pointer বদলাত; shared hosting যদি `<application-root>/public` static files Apache/LiteSpeed থেকে সরাসরি serve করে, তাহলে root public assets পুরোনো থাকতে পারত।
2. Node static serving versioned JS/CSS-কে `max-age=31536000, immutable` দিচ্ছিল, তাই ভুল/পুরোনো asset একবার cache হলে browser সেটি দীর্ঘ সময় ধরে রাখতে পারত।

## v1.4.5 Fix

- Managed release startup-এর সময় active release-এর `public/` assets application root-এর `public/` mirror-এ atomically sync হয়। তাই existing 1.4.4 root supervisor পুরোনো হলেও 1.4.5 active হলে UI assets নিজে থেকে root public-এ ঠিক হয়ে যাবে।
- New supervisor code-ও release activation/rollback pointer switch-এর সময় একই public mirror sync করে, যাতে future/manual deployments-এ দুই layer consistent থাকে।
- Explicit rollback-এর আগে current 1.4.5 runtime known-good target release-এর public assets root mirror-এ প্রস্তুত করে।
- Root public sync **শুধু P2PFlow release-এর existing files overwrite করে**; unrelated hosting files delete করে না।
- HTML/JS/CSS-এর one-year immutable caching সরানো হয়েছে।
- Application code assets এখন `no-store, no-cache, must-revalidate, max-age=0` header পায় যখন Node static server ব্যবহার হয়।
- Static response-এ `X-P2PFlow-Version` header যোগ করা হয়েছে support/debugging-এর জন্য।
- Grouped navigation runtime fingerprint যোগ হয়েছে (`grouped-control-center`, UI release `1.4.5`)।
- Group render count mismatch হলে browser console-এ explicit error হবে; silent legacy fallback নয়।

## Menu/UI preserved

v1.4.4-এর full visual redesign অপরিবর্তিত আছে:

- Dashboard quick access
- P2P Trading
- Accounting
- Team & Control
- Reports & Monitoring
- System
- single-open accordion
- permission-aware group/item hiding
- active group/submenu styling
- premium dark sidebar shell
- mobile drawer + floating bottom dock

## Safety

- Database/schema/accounting calculation পরিবর্তন করা হয়নি।
- Existing orders, messages, users, roles, permissions, Binance integration এবং encrypted storage অপরিবর্তিত।
- Update activation/rollback-এর existing release integrity verification অপরিবর্তিত।
- Root public sync release validation-এর পরে হয় এবং file replacement atomic temp-file rename দিয়ে করা হয়।

## Version

- Internal version: `1.4.5`
- Unified package: `P2PFlow_v1.4.5_UNIFIED.zip`
