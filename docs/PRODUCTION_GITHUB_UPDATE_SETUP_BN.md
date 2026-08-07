# Production GitHub Update Setup - Unified Mode

একবার GitHub connection এবং signing key setup হয়ে গেলে পরবর্তী flow:

```text
Unified source -> GitHub Desktop Commit/Push
-> GitHub Actions test/audit/sign
-> Published GitHub Release
-> P2PFlow System Update Check Now
-> Update Now
-> database backup
-> signed release validation
-> verified pointer switch -> normal hosting process restart
-> readiness check
-> success অথবা automatic code rollback
```

Database release package-এর ভিতরে থাকে না। MariaDB/MySQL/PostgreSQL state এবং runtime secrets persistent থাকে।
