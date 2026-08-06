# P2PFlow v1.0.169

## এই সংস্করণের লক্ষ্য

Shared hosting-এ `Request Timeout` বন্ধ করা এবং এক ZIP deploy করেই `/setup` বা login page চালু করা।

## মূল সংশোধন

- Version serial `1.0.169` করা হয়েছে।
- আগের Hosting Ready package-এর root launcher web server-কে `child_process.fork()`-এ চালাত। কিছু shared-hosting proxy শুধু startup process-এর listener গ্রহণ করে, তাই browser request timeout হতো।
- নতুন `hosting-entry.js` একই startup process-এর ভেতরে verified release চালায়; web server child process-এ যায় না।
- Active release এখনও `shared/current-release.json` pointer এবং release tree SHA-256 দিয়ে যাচাই হয়।
- Signed update install-এর সময় target pointer লেখা, database flush/backup, hosting restart এবং failed activation rollback রাখা হয়েছে।
- Startup error হলেও blank timeout না দিয়ে port-এ diagnostic `503` JSON response দেওয়ার fallback যোগ হয়েছে।
- Shared hosting-এ Node child process/fork permission আর প্রয়োজন নেই।
- GitHub connection, Ed25519 signature, package/tree hash, schema, data epoch, path traversal ও symlink checks fail-closed আছে।

## Deployment

শুধু `P2PFlow_v1.0.169_HOSTING_READY.zip` Node Application Root-এ extract করে dependencies install, build এবং restart করতে হবে। Startup file `server.js`।
