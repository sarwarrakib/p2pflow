# P2PFlow v1.4.3 Hotfix

এই hotfix System Update-এ `Update Now` চাপার পর দীর্ঘ সময় `Verifying...` দেখিয়ে আবার আগের অবস্থায় ফিরে যাওয়ার সমস্যার জন্য।

## Root cause

আগের signed GitHub release package-এর ভিতরে পুরো `node_modules` bundle করা হচ্ছিল এবং `/api/system-update/stage` request-এর মধ্যেই download, archive verification, extraction, tree hashing ও self-test চলছিল। Shared hosting / reverse proxy connection timeout হলে browser response হারিয়ে যেত, ফলে UI আবার `Update Now` দেখাত এবং Owner authorization/activation ধাপে পৌঁছাত না।

## v1.4.3 changes

- Signed GitHub update package এখন lightweight code release; `node_modules` আর release tarball-এ bundle হয় না।
- Existing hosting root-এর already-installed locked production dependencies (`mysql2`, `pg`, `ws`) ব্যবহার করা হবে।
- Signed CI release manifest-এ `dependenciesBundled: false` এবং `verificationProfile: signed-ci-runtime` যোগ করা হয়েছে।
- Signed CI package local verification-এ full heavy test suite পুনরায় চালানোর বদলে tree integrity + required files + dependency presence + JavaScript syntax validation করা হয়; complete test suite GitHub Actions-এ release publish-এর আগেই বাধ্যতামূলকভাবে চলে।
- নতুন v1.4.3 runtime থেকে staging background job হিসেবে চলে; HTTP request দ্রুত return করে এবং UI stage status poll করে। ফলে ভবিষ্যতে বড় release verify হলেও hosting request timeout update flow ভাঙবে না।
- Stage failure হলে exact error System Update page-এ সংরক্ষিতভাবে দেখানো হবে।
- Existing database, accounting, orders, users, permissions এবং persistent shared data update package-এর বাইরে থাকে।

## Compatibility

v1.4.3 release package পুরোনো v1.4.2 updater দিয়েও stage করা যায়, কারণ release ছোট এবং production dependencies hosting application root-এ আগে থেকেই installed থাকে।

## Version

Internal version: `1.4.3`
