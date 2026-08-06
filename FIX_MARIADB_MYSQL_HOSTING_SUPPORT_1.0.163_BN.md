# P2PFlow v1.0.166 — MariaDB 10.5 / MySQL-compatible Support

## সমস্যা

আগের v1.0.162 browser installer PostgreSQL storage-এর জন্য তৈরি ছিল। শুধুমাত্র MariaDB 10.5 / MySQL-compatible hosting-এ database connection সম্পন্ন করা যেত না।

## সমাধান

- Browser setup-এ MariaDB 10.5 / MySQL-compatible default provider যোগ করা হয়েছে।
- Hosting control panel থেকে পাওয়া Host, Port 3306, Database Name, Username এবং Password দিয়ে setup করা যায়।
- `mysql2` promise/pool driver যোগ করা হয়েছে।
- MariaDB/MySQL-এর জন্য InnoDB transactional state tables, encrypted history, backup এবং binary object tables যোগ করা হয়েছে।
- AES-256-GCM state/object encryption, checksum verification এবং Application Key protection বজায় রাখা হয়েছে।
- Database-level `GET_LOCK` single-writer guard যোগ করা হয়েছে।
- Setup, health, preflight, System Update এবং documentation provider-aware করা হয়েছে।
- PostgreSQL optional provider হিসেবে অক্ষত রাখা হয়েছে।
- File-based legacy data MariaDB/MySQL empty database-এ browser থেকে import করা যায়।

## Version

- Application: 1.0.166
- v1.0.163 database schema: 25 (historical note)
- Data compatibility epoch: 1
