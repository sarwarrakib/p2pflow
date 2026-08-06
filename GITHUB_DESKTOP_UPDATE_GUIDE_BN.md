# P2PFlow 1.2 - GitHub Desktop Update Guide

## GitHub-এ 1.2 আপলোড

1. `P2PFlow_v1.2.0_GITHUB_SOURCE.zip` আলাদা folder-এ extract করুন।
2. GitHub Desktop থেকে আপনার private repository folder খুলুন।
3. Extract করা সব file/folder repository root-এ copy/overwrite করুন। ZIP file repository-তে দেবেন না।
4. `.git` মুছবেন না এবং `.github` folder copy হয়েছে নিশ্চিত করুন।
5. Summary লিখুন: `P2PFlow 1.2 Bangla UI update`
6. `Commit to main` চাপুন।
7. `Push origin` চাপুন।
8. GitHub Actions release সফল হলে P2PFlow-এ `System Update -> Check Now -> Update Now` চাপুন।

## Hosting package কখন ব্যবহার করবেন

শুধু clean/manual deploy বা update engine না চললে `P2PFlow_v1.2.0_HOSTING_READY.zip` ব্যবহার করুন। Existing `.env`, `.p2pflow`, `shared/` এবং database মুছবেন না।

## পরের version

`SET_NEXT_VERSION.bat`:

- Normal feature update: `1.2 -> 1.3`
- Hotfix: `1.2 -> 1.2.1`

## নিরাপত্তা

- `.env`, Application Key, database password এবং signing private key GitHub-এ commit করবেন না।
- Install-এর আগে P2PFlow database backup তৈরি করে।
- Code rollback business data delete করে না।
