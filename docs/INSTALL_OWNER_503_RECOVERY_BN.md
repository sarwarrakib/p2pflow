# P2PFlow v1.2.0 — Shared Hosting Install ও 503 Recovery

সাধারণ shared-hosting installation-এর জন্য terminal command প্রয়োজন নেই। পূর্ণ নির্দেশনা:

```text
docs/HOSTING_BROWSER_INSTALL_BN.md
```

## Hosting panel-এ যা করবেন

1. MariaDB/MySQL database ও user তৈরি করুন।
2. User-কে database-এ **All Privileges** দিন।
3. Node.js application তৈরি করুন; Node `20+`, Startup File `server.js`।
4. ZIP extract করা folder-কে Application Root দিন।
5. **Run NPM Install / Install Dependencies** চাপুন।
6. Application Start/Restart করুন।
7. Browser-এ `https://YOUR-DOMAIN/setup` খুলুন।
8. Application Root-এর `P2PFLOW_SETUP_CODE.txt` থেকে code নিন।
9. **MariaDB 10.5 / MySQL-compatible** নির্বাচন করে database test করুন।
10. Owner email, password ও private 6-digit secret দিয়ে install শেষ করুন।

## 503 হলে

- Node application Running কি না
- Startup file `server.js` কি না
- Node version `20+` কি না
- Run NPM Install সফল হয়েছে কি না
- Application Root সঠিক কি না
- Database Host/Name/User/Password সঠিক কি না
- Database user All Privileges পেয়েছে কি না
- Application/Passenger log-এ dependency বা connection error আছে কি না

Database configure না থাকলেও P2PFlow `/ready`-তে HTTP 200 সহ `setup_required` response দেয়। তাই raw 503 হলে সাধারণত Node process, dependency installation অথবা hosting proxy configuration পরীক্ষা করতে হবে।
