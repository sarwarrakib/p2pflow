# P2PFlow v1.4.2 Hotfix

## GitHub Release exit code 128 fix

- `release.yml` থেকে checkout-এর পরে redundant `git fetch --tags --force` সরানো হয়েছে।
- `actions/checkout@v5` এখন `fetch-depth: 0` এবং `fetch-tags: true` দিয়ে full history ও tags checkout করে।
- `persist-credentials: false` নিরাপত্তা সেটিং রাখা হয়েছে; release metadata step আর credential-less network `git fetch` চালায় না।
- এর ফলে private repository-তে release metadata stage-এ `git fetch` authentication failure/exit code 128 হওয়ার পথটি বন্ধ হয়েছে।

## Previous v1.4.1 dependency hotfix retained

- broken `postgres-interval-1.3.0.tgz` lock reference নেই; `postgres-interval` 1.2.0-এ pinned/overridden।
- GitHub Actions `actions/checkout@v5`, `actions/setup-node@v5`, Node 22 ব্যবহার করে।

## Version consistency hardening

- Internal version `1.4.2`।
- Browser asset cache-busting query version `1.4.2` করা হয়েছে।
- Unified install guide-এ package filename `P2PFlow_v1.4.2_UNIFIED.zip` করা হয়েছে।
- `scripts/set-version.js` future version bump-এ stale asset query/package filename-ও normalize করবে।
