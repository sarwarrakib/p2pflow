# P2PFlow 1.6 - এক ফাইল Installation / Update / GitHub Guide

## A. নতুন সার্ভারে ইনস্টল

1. `P2PFlow_v1.7.1_UNIFIED.zip` Node Application Root-এ upload করুন।
2. ZIP-এর **ভেতরের সব file/folder সরাসরি Application Root-এ** extract করুন। অতিরিক্ত parent folder রাখবেন না।
3. Hosting settings:

```text
Node.js: 20 বা নতুন
Install Command: npm ci --omit=dev --ignore-scripts
Build Command: npm run build
Startup File: server.js
Start Command: npm start
```

4. Restart/Deploy করুন।
5. `https://YOUR-DOMAIN/ready` খুলুন।
6. Fresh install হলে `https://YOUR-DOMAIN/setup` খুলে setup শেষ করুন।

## B. আগে P2PFlow ইনস্টল থাকলে manual update

1. Database এবং Application Root backup নিন।
2. **মুছবেন না:** `.env`, `.p2pflow`, `shared/`, database credentials/data।
3. একই `P2PFlow_v1.7.1_UNIFIED.zip` extract করে application files overwrite করুন।
4. `npm ci --omit=dev --ignore-scripts` চালান।
5. Restart করুন।

Supervisor নতুন root version detect করে managed release snapshot বানাবে। পুরোনো valid release history `releases/`-এ থাকলে সেটিও থাকবে।

## C. একই ZIP GitHub Desktop-এ upload

1. ZIP temporary folder-এ extract করুন।
2. GitHub Desktop -> Repository -> Show in Explorer.
3. Extract করা content repository root-এ copy/overwrite করুন। `.git` মুছবেন না।
4. GitHub Desktop-এ Commit করুন।
5. Push origin করুন।

**ZIP file নিজে repository-তে upload করবেন না; ZIP-এর extracted content দেবেন।**

## D. নতুন version panel থেকে update

1. New source version GitHub-এ Push করুন।
2. GitHub Actions `Publish signed P2PFlow release` workflow complete হতে দিন।
3. P2PFlow -> System Update খুলুন।
4. `Check Now` চাপুন।
5. `Update Now` চাপুন।
6. Owner password + secret code confirm করুন।

P2PFlow update-এর আগে database backup নেয়, signed manifest/package/tree verify করে, verified release pointer বদলে hosting process restart করে। নতুন release startup fail করলে pointer আগের release-এ ফিরে যায়, তাই database data অপরিবর্তিত থাকে।

## GitHub source upload হয়েছে কিন্তু update দেখা যাচ্ছে না

System Update এখন GitHub repository-এর `package.json`-ও পরীক্ষা করে। নতুন source version detect হলেও signed GitHub Release এখনও publish না হলে UI `publishing` status দেখাবে এবং page open থাকলে স্বয়ংক্রিয়ভাবে আবার check করবে। দীর্ঘ সময় pending থাকলে GitHub repository -> Actions-এ release workflow failure দেখুন।
