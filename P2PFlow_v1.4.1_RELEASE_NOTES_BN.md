# P2PFlow v1.4.1 Hotfix

এই hotfix শুধুমাত্র GitHub release/dependency installation সমস্যার সমাধানের জন্য। Application feature, accounting rules, permissions, database format এবং UI workflow অপরিবর্তিত রাখা হয়েছে।

## সমাধান

- `package-lock.json`-এর invalid `postgres-interval-1.3.0.tgz` reference সরিয়ে valid `postgres-interval@1.2.0` lock করা হয়েছে।
- `package.json`-এ `overrides` দিয়ে `postgres-interval`-কে `1.2.0` pin করা হয়েছে, যাতে ভবিষ্যৎ lock regeneration-এ একই broken version ফিরে না আসে।
- `.github/workflows/ci.yml` এবং `.github/workflows/release.yml`-এ `actions/checkout` ও `actions/setup-node` v4 থেকে v5 করা হয়েছে, যাতে Node 20 action-runtime deprecation warning দূর হয়।
- Internal SemVer `1.4.0` থেকে `1.4.1` করা হয়েছে।

## GitHub-এ ব্যবহার

এই Unified ZIP extract করে repository root-এর files overwrite/merge করুন, তারপর GitHub Desktop থেকে Commit এবং Push origin করুন। `.env`, `.p2pflow`, runtime database, `shared/` বা secret/key file GitHub-এ commit করবেন না।
