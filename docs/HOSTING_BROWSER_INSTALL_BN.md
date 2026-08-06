# P2PFlow Shared Hosting Browser Installation

মূল নির্দেশনা project root-এর `INSTALL_HOSTING_BN.md`-এ আছে। এই version-এর স্থায়ী নিয়ম:

- First-run setup একবার।
- Setup code Application Root-এ স্থায়ী location-এ থাকে এবং successful setup-এর পরে delete হয়।
- Saved permanent Application Key partial setup recovery-তে automatically reuse হয়।
- Setup complete হওয়ার পরে `/setup` redirect হয়; update সেখানে হয় না।
- Update শুধু Owner login থেকে Control Panel → System Update-এ হয়।
- MariaDB 10.5 / MySQL-compatible default database provider।
- Stable same-process hosting entry `releases/` থেকে versioned code চালায় এবং `shared/current-release.json` দিয়ে active release track করে। Web server child process-এ যায় না।
- Code rollback database/transactions rollback করে না।
