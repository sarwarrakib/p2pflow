# P2PFlow 1.1 - GitHub Desktop Update Guide

## প্রথমবার source upload

1. `P2PFlow_v1.1.0_GITHUB_SOURCE.zip` extract করুন।
2. GitHub Desktop-এ আপনার private repository খুলুন।
3. ZIP-এর ভেতরের সব file/folder repository root-এ copy করুন। ZIP file নিজে upload করবেন না।
4. `.git` folder মুছবেন না। `.github` folder copy হয়েছে নিশ্চিত করুন।
5. Summary লিখুন: `P2PFlow 1.1`
6. `Commit to main` চাপুন।
7. `Push origin` চাপুন।
8. GitHub Actions-এর `Publish signed P2PFlow release` সফল হওয়া পর্যন্ত অপেক্ষা করুন।

## একবার Hosting Ready deploy

বর্তমান direct-hosting version থেকে automatic install engine চালু করতে `P2PFlow_v1.1.0_HOSTING_READY.zip` একবার Node Application Root-এ extract করে restart করুন। Existing `.env`, `.p2pflow`, `shared/` এবং database মুছবেন না। এর পরের versionগুলো GitHub থেকে System Update page দিয়েই install হবে।

## পরবর্তী normal update

1. নতুন source package repository root-এ copy/overwrite করুন।
2. GitHub Desktop-এ Changes review করুন।
3. Commit এবং Push origin করুন।
4. P2PFlow -> System Update -> `Check Now` -> `Update Now`।

## নিজে code edit করলে version

`SET_NEXT_VERSION.bat` চালান:

- Option 1: normal feature update, যেমন `1.1 -> 1.2`
- Option 2: hotfix, যেমন `1.1 -> 1.1.1`

Internal package version SemVer অনুযায়ী `1.1.0`; UI-তে এটি `1.1` দেখাবে।

## গুরুত্বপূর্ণ

- GitHub repository-তে extracted source দিন, ZIP নয়।
- `.env`, Application Key, database password বা signing private key কখনও commit করবেন না।
- Update install-এর আগে P2PFlow স্বয়ংক্রিয় database backup তৈরি করে।
