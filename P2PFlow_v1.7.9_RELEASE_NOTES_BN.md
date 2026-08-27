# P2PFlow v1.7.9 — Owner Authority / Multi-account Permission Repair

## কেন এই update

v1.7.8 পর্যন্ত permission architecture-এ role-label bypass বন্ধ করার সময় durable P2PFlow Owner-ও সাধারণ user-এর মতো explicit global permission এবং exact Binance-account grant-এর উপর নির্ভর করতে শুরু করেছিল। এর ফলে পুরনো release-এর তুলনায় Owner account Orders, P2P Message/Chat, Binance Sync এবং নতুন Binance API account-এর কিছু operation-এ অপ্রত্যাশিত Permission Denied পেতে পারত।

## v1.7.9 পরিবর্তন

- `isOwner === true` এখন একমাত্র intentional superuser boundary।
- Owner সব global permission কার্যকরভাবে পাবে; stored permission checkbox অসম্পূর্ণ হলেও Owner lockout হবে না।
- Owner সব current এবং future Binance API credential-এর পূর্ণ account-scoped permission dynamically পাবে।
- Non-owner Admin/Manager/Agent/Auditor role label কোনো implicit access দেয় না; তাদের explicit RBAC আগের মতোই থাকে।
- Owner অন্য user/agent-এর payment account operationally use করতে পারবে।
- Orders/Chat/Sync authorization আর unrelated `Advertisement` account feature toggle-এর উপর নির্ভর করবে না।
- Payment Methods-এর global **Sync Payment Methods** button একাধিক accessible Binance account থাকলে আর account selection error দেবে না; সব accessible enabled account sync করবে এবং per-account success/failure summary দেবে।
- Sync button busy state শেষে success/failure/cancel সব ক্ষেত্রেই recover করবে।
- Owner bootstrap payload full effective permissions এবং current Binance-account authority প্রকাশ করে, তাই frontend menu/button permission state backend-এর সাথে consistent।

## যেটা ইচ্ছাকৃতভাবে অপরিবর্তিত

- Orders account feature switch OFF থাকলে সেই account-এর Orders visibility/assignment overlay OFF থাকবে। এটা permission denial নয়; user preference/control।
- Advertisement switch শুধু Advertisement behavior নিয়ন্ত্রণ করবে।
- Non-owner user-এর global + exact-account permission matrix বহাল আছে।
- Database schema **37**; নতুন migration লাগবে না।
