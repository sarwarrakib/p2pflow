# P2PFlow v1.5.16 Release Notes

Release date: 2026-08-17  
Application version: `1.5.16`  
Database schema: `30`

## Release status

এই সংস্করণে Orders ও Ads-এর multi-account interface সরল করা হয়েছে, Binance P2P username-ভিত্তিক account context যোগ হয়েছে, Ads-এর `All` merchant controls account-permission অনুযায়ী batch action চালায় এবং `Add User + Login` modal-এর runtime failure সংশোধন করা হয়েছে। Database schema পরিবর্তন হয়নি।

## Orders account interface

- Dropdown selector সরিয়ে `All` এবং প্রতিটি অনুমোদিত Binance account-এর button/tab যোগ করা হয়েছে।
- Account button-এ configured API label-এর পরিবর্তে synced Binance P2P username দেখানো হয়। P2P username না পাওয়া পর্যন্ত configured account name fallback হিসেবে থাকে।
- `All` নির্বাচন করলে user-এর `orders.view` থাকা সব account-এর order একসঙ্গে দেখায়।
- নির্দিষ্ট account button নির্বাচন করলে শুধু সেই account-এর order দেখায়।
- Order list থেকে আলাদা `Binance Account` column সরানো হয়েছে।
- `Source` column-এ এখন `Local` অথবা order-linked Binance P2P username দেখায়।
- Desktop ও mobile—দুই layout-এই একই account identity ব্যবহার হয়।
- Create, Sync, Chat, Mark Paid, Release, Quick Release ও অন্যান্য order action আগের exact global + account permission rule অনুসরণ করে।

## Ads account interface

- Dropdown selector সরিয়ে `All` এবং account-specific button/tab যোগ করা হয়েছে।
- Button ও Ad card-এ synced Binance P2P username দেখানো হয়; username না থাকলে configured account name দেখায়।
- `All` নির্বাচন করলে user-এর `ads.view` থাকা সব account-এর Ads একসঙ্গে দেখা যায়।
- নির্দিষ্ট account নির্বাচন করলে শুধু সেই account-এর Ads দেখা যায়।
- অপ্রয়োজনীয় account selector ব্যাখ্যা ও verbose capability text সরানো হয়েছে।
- Ad create ও manual sync account-sensitive operation হওয়ায় নির্দিষ্ট account নির্বাচন করা বাধ্যতামূলক থাকে।

## Ads Business, Online ও Break

- `All` view-তেও Business, Online ও Break control দৃশ্যমান থাকে।
- `All` view থেকে control পরিবর্তন করলে server current user-এর global `ads.manage` এবং exact account-level `ads.manage` থাকা active/configured accountগুলো নিজে নির্ধারণ করে। Client কোনো অতিরিক্ত account ID পাঠিয়ে scope বাড়াতে পারে না।
- নির্দিষ্ট account selected থাকলে action শুধু সেই account-এ চলে।
- Batch response-এ success, failure ও skipped account আলাদাভাবে গণনা করা হয়। আংশিক failure হলেও সফল accountগুলোর result হারায় না।
- Disabled, incomplete অথবা permission-বিহীন account batch mutation থেকে বাদ যায়।
- প্রতিটি account-এর merchant state, result, audit context এবং realtime update আলাদা থাকে।
- Break চালু থাকা অবস্থায় Business/Online পরিবর্তনের আগের নিরাপত্তা নিয়ম বহাল আছে; আগে Break বন্ধ করতে হবে।

## Add User + Login সংশোধন

- User permission matrix-এ একটি JavaScript `Set`-এর উপর ভুলভাবে `includes()` চালানো হচ্ছিল। ফলে `Add User + Login` modal render হওয়ার সময় exception হচ্ছিল। এটি `Set.has()` দিয়ে সংশোধন করা হয়েছে।
- Add User, Edit, Roles ও Activity action button-এ explicit `type="button"` এবং resilient event binding যোগ হয়েছে।
- নতুন user-এর default role আর hard-coded database ID ব্যবহার করে না; enabled Agent role profile runtime-এ resolve করা হয়।
- New-user modal খুললেই role permission ও Binance account matrix সঠিকভাবে populate হয়।
- Account permission matrix heading-এও P2P username দেখানো হয়।

## Binance P2P identity source

- Account display identity `ownerP2pProfiles` এবং credential-এর last synced owner profile থেকে নেওয়া হয়।
- Preferred label: P2P nickname/username।
- Fallback label: configured Binance API account name।
- User number, merchant number এবং profile sync time account metadata-তে সংরক্ষিত থাকে।
- Upgrade-এর পরে কোনো account-এ configured name দেখা গেলে P2P Profile থেকে সেই account একবার Sync করলে username পাওয়া যাবে।

## Permission ও isolation

- Global permission এবং নির্দিষ্ট Binance account permission—দুটিই এখনো আবশ্যক।
- `All` শুধু display scope; এটি permission bypass নয়।
- Orders/Ads list server-side account filter ও permission check অনুসরণ করে।
- Per-Ad action সবসময় Ad-এর linked credential ব্যবহার করে।
- Account A-এর permission দিয়ে Account B-এর order, Ad বা merchant control পরিবর্তন করা যায় না।

## Regression verification

নিচের verification সফল হয়েছে:

- 75টি active JavaScript file syntax check
- `npm run build`
- পূর্ণ `npm test`
- Multi-account UI static regression test
- Account-scoped Binance RBAC self-test
- Ads merchant account isolation self-test
- Merchant Business/Break sync self-test
- Security Question fallback tests
- Login, trusted-device, owner recovery ও OTP-disabled tests
- Mail delivery, routing ও failover tests
- PostgreSQL/MySQL encrypted state tests
- Database-only persistence test
- Signed updater, package safety, supervisor ও rollback tests
- Accounting self-test
- PHP syntax lint
- Real headless Chromium smoke test: `Add User + Login` button click, modal render, dynamic Agent role selection এবং দুই account-এর P2P username rendering

## Live-operation limitation

Automated test environment-এ real Binance credential ব্যবহার করে Ad/order/merchant mutation চালানো হয়নি। Production deployment-এর পরে প্রথমে read-only profile, Ads ও order sync করুন; তারপর ছোট controlled account-specific test দিয়ে `All` এবং exact-account behavior যাচাই করুন।
