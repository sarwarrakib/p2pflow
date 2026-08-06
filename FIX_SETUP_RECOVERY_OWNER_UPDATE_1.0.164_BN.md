# P2PFlow v1.0.166 — Setup Recovery ও Owner-only Update Fix

## সমস্যা

v1.0.163-এ partial browser setup-এর পরে encrypted database state ও permanent Application Key save হলেও setup page submitted key ছাড়া saved key reuse করত না। Release folder পরিবর্তনে setup-code location-ও বদলাতে পারত। ফলে একই installation-এ Application Key error এবং installation-code mismatch দেখা যেত। Direct shared-hosting deployment managed launcher/pointer ছাড়া হওয়ায় GitHub install/rollback সম্পূর্ণ ছিল না।

## সমাধান

- Saved Application Key `shared/.env` বা migrated old `.env` থেকে automatically reuse হয়।
- Setup code এবং setup lock stable hosting Application Root/shared directory-তে থাকে।
- Successful setup-এর পরে `/setup` বন্ধ; normal login-এ redirect।
- Setup code/Application Key update authentication হিসেবে ব্যবহার হয় না।
- Earliest existing Admin durable Owner হিসেবে migrate হয়; System Update শুধু Owner দেখতে/ব্যবহার করতে পারে।
- GitHub repository/token browser থেকে test/save করা যায়; token encrypted database state-এ থাকে।
- Ed25519 signing key browser থেকে generate; private key একবার GitHub Actions secret-এর জন্য দেখায়।
- Stable hosting launcher এবং `shared/current-release.json` pointer যোগ হয়েছে। Symlink unavailable হলেও version switch সম্ভব।
- Update-এর আগে database flush/backup এবং readiness check; failure হলে automatic code rollback। Database snapshot rollback নয়।
- Database schema 26।
