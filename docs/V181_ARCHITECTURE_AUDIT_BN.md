# P2PFlow v1.8.1 — Architecture & Performance Audit

## Audit conclusion

মূল সমস্যা Node.js নিজে নয়। বর্তমান codebase-এর প্রধান structural risk হলো `app-server.js`-এ business/API logic-এর অতিরিক্ত concentration এবং database persistence-এর legacy encrypted-state model। v1.8.0 ইতিমধ্যে chats/ledgers/auditLogs chunk segmentation, runtime indexes, bounded Binance concurrency এবং coalesced background save যোগ করেছে। v1.8.1-এ Android/native client-এর জন্য versioned API contract এবং relational normalization target schema যোগ করা হয়েছে।

## কেন Node.js রাখা হয়েছে

Binance C2C integration-এ HTTP + WebSocket I/O বেশি, তাই Node.js এই workload-এর জন্য উপযুক্ত। ভাষা বদলালে bottleneck নিজে থেকে ঠিক হবে না; persistence/query boundaries ও background work আলাদা করাই বেশি গুরুত্বপূর্ণ।

## Binance source documents থেকে confirmed integration

- Chat credential: `GET /sapi/v1/c2c/chat/retrieveChatCredential`
- Chat history/fallback: `GET /sapi/v1/c2c/chat/retrieveChatMessagesWithPagination`
- Image upload URL: `POST /sapi/v1/c2c/chat/image/pre-signed-url`
- Orders, ads, payment methods এবং merchant control-এর documented SAPI routes existing adapter-এর সাথে সামঞ্জস্যপূর্ণ।

## v1.8.1 API contract

Browser-এর legacy `/api/*` route অপরিবর্তিত। নতুন native clients `/api/v1/*` ব্যবহার করবে।

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/session/me`
- `GET /api/v1/session/bootstrap`
- `GET /api/v1/realtime/events`
- `GET /api/v1/orders`, `/api/v1/ads`, `/api/v1/payment-accounts` ইত্যাদি existing handlers-এ versioned alias হয়
- `GET /api/v1/meta` client capability discovery দেয়

Android/native login-এ `clientType: "android"` পাঠালে successful login response-এ short-lived session-equivalent bearer token পাওয়া যায়। Subsequent request-এ `Authorization: Bearer <token>` ব্যবহার করা যায়। Browser cookie + CSRF behavior অপরিবর্তিত।

## Database target structure

`database/schema-v39-mysql.sql` এবং `database/schema-v39-postgres.sql`-এ workspace-scoped normalized target tables দেয়া হয়েছে: workspaces, orders, ads, payment accounts, chats, ledger। Hot query columns-এর composite indexes দেয়া হয়েছে। Existing encrypted state tables এখনো rollback/compatibility source; production data zero-downtime migrate করার আগে table-by-table dual-write/backfill/verification প্রয়োজন।

## পরবর্তী normalization order

1. orders + order assignments
2. payment accounts + ledger
3. advertisements
4. chats + read states
5. users/roles/permissions
6. notifications/audit retention

প্রতি ধাপে backfill → checksum/count verification → dual write → read switch → rollback window রাখতে হবে। এক deploy-এ সব authoritative table switch করা financial/order data-এর জন্য অপ্রয়োজনীয় risk।

## Extension audit

Uploaded Chrome extension v6.1.9 Manifest V3 হলেও `host_permissions` এবং content script `http://*/*`, `https://*/*`-এ চলে। Functional হলেও production hardening-এর জন্য host scope P2PFlow + Binance domains-এ সীমাবদ্ধ করা উচিত। Extension-কে P2PFlow-এর versioned API endpoint ব্যবহার করানোও recommended, কিন্তু v1.8.1 web package-এ extension source merge করা হয়নি।
