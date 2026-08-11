# GitHub Desktop - P2PFlow Unified Update

P2PFlow 1.5 থেকে **GitHub-এর জন্য আলাদা ZIP নেই**। Hosting এবং GitHub দু জায়গাতেই একই `P2PFlow_v1.5.0_UNIFIED.zip` ব্যবহার করবেন।

## প্রথম upload

1. Unified ZIP temporary folder-এ extract করুন।
2. GitHub Desktop-এ private repository খুলুন।
3. Repository -> Show in Explorer.
4. ZIP-এর extracted সব content repository root-এ copy করুন। `.git` folder অক্ষত রাখুন।
5. নিশ্চিত করুন repository root-এ আছে: `package.json`, `server.js`, `app-server.js`, `.github/`, `lib/`, `public/`, `scripts/`।
6. Summary: `P2PFlow 1.5`
7. Commit to main.
8. Push origin.

## পরের normal version

নিজে source edit করলে `SET_NEXT_VERSION.bat` চালান। যেমন `1.3 -> 1.4`। এরপর Commit + Push করুন।

Hotfix হলে `SET_HOTFIX_VERSION.bat` চালান। এতে বর্তমান patch version এক ধাপ বাড়বে।

Push হওয়ার পরে GitHub Actions tests + audit + signed package build + GitHub Release publish করবে। তারপর System Update page নিজে নতুন release detect করবে।

## খুব গুরুত্বপূর্ণ

- `.env`, `.p2pflow`, `shared/`, database dump/key/token GitHub-এ দেবেন না।
- `UPDATE_SIGNING_PRIVATE_KEY` শুধু GitHub Actions repository secret-এ থাকবে।
- `github_pat_...` read token P2PFlow-এর encrypted database setting-এ থাকবে; source code-এ নয়।
