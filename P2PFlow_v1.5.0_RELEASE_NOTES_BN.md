# P2PFlow v1.5.0

## Clean unified release

- Project package থেকে পুরোনো v1.4.x release notes এবং historical test-report files সরানো হয়েছে।
- Runtime, database, Binance integration, login/auth, mail/OTP, notifications, update manager এবং deployment-এর প্রয়োজনীয় source/configuration files রাখা হয়েছে।
- GitHub signed update workflow, versioning scripts, production doctor, database migration tools এবং hosting/deploy examples রাখা হয়েছে, কারণ এগুলো maintenance/update flow-এর অংশ।
- Duplicate-looking `local-php-mail.php` files ইচ্ছাকৃতভাবে রাখা হয়েছে: root copy hosting PHP document-root deployment-এর জন্য, `public/` copy public mirror/static deployment flow-এর জন্য প্রয়োজনীয়।

## Mail / OTP delivery hardening retained

- Local PHP mail sender quota (`550 Sender rate overlimit`) detect করে repeated local retry cooldown চালু থাকে।
- Complete authenticated SMTP configuration পাওয়া গেলে SMTP fallback ব্যবহার হয়।
- SMTP settings database এবং `.env` থেকে field-by-field merge হয়।
- Settings-এ `Test Active Mail`, `Test SMTP`, `Test Local Mail` diagnostics আছে।
- Login OTP এবং automated notification mail delivery audit/diagnostics retained।
- PHP mail bridge signature compatibility fix retained।

## Version

- Internal SemVer: **1.5.0**
- UI release line: **1.5**
