# P2PFlow v1.4.12 — Database History / 503 Recovery Fix

এই রিলিজটি production MariaDB/MySQL database-এ `p2pflow_state_history` অস্বাভাবিকভাবে বড় হয়ে যাওয়া এবং restart-এর সময় 503 হওয়ার সমস্যার জন্য তৈরি।

## কী ঠিক করা হয়েছে

- প্রতিটি `saveDb()`-এ পুরো encrypted application state আর history table-এ duplicate হবে না।
- Default recovery history limit `500` থেকে `8` করা হয়েছে; safety clamp সর্বোচ্চ 25।
- Normal writes-এর history checkpoint default প্রতি 15 মিনিটে সর্বোচ্চ একবার তৈরি হয়।
- পুরোনো history row ছোট batch-এ background-এ prune হয়; startup-কে block করে না।
- Healthy main state থাকলে startup-এর সময় `p2pflow_state_history`-এর বড় payload আর preload করা হয় না। History শুধু main state invalid হলে recovery-এর জন্য পড়া হয়।
- Startup migration-এ state বদল না হলে database-এ অপ্রয়োজনীয় full-state rewrite করা হয় না।
- Existing MariaDB/MySQL tables আগে `INFORMATION_SCHEMA` দিয়ে detect করা হয়। ফলে existing installation restart করার জন্য database user-এর `CREATE TABLE` permission আর প্রয়োজন হয় না। Table সত্যিই missing হলে তবেই CREATE privilege দরকার হবে।
- Health output-এ history retention/maintenance status যোগ হয়েছে।

## Existing বড় history table

v1.4.12 সফলভাবে start হওয়ার পর `p2pflow_state_history`-এর পুরোনো revision background-এ ছোট ছোট batch-এ delete হতে থাকবে এবং newest recovery checkpoints রাখা হবে। InnoDB physical file size hosting panel-এ সঙ্গে সঙ্গে না কমলে database provider-এর Optimize Table / reclaim operation পরে চালানো যেতে পারে।

Internal version: `1.4.12`
