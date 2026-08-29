# P2PFlow v1.7.7 Manual Update

1. Current server/application এবং database backup নিন।
2. `.env`, `.p2pflow/`, `shared/`, database data, uploaded persistent objects **replace করবেন না**।
3. v1.7.7 ZIP-এর application files project root-এ replace করুন।
4. Production dependency install command চালান: `npm ci --omit=dev --ignore-scripts`
5. `npm run build`
6. `npm test`
7. `npm run preflight:production`
8. Application restart করুন।
9. `/api/chat-account-controls`, main Settings এবং Notification Preferences save করে response timing যাচাই করুন।
10. Browser DevTools Network-এ `X-P2PFlow-Response-Ms` ও `X-P2PFlow-Persist-Ms` দেখুন।

Database schema 37 অপরিবর্তিত; migration লাগবে না।
