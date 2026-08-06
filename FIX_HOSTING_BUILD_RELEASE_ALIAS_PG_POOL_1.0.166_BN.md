# P2PFlow v1.0.166 — Hosting build ও pg-pool compatibility fix

- Shared hosting-এ ভুল করে `npm run build:release` configured থাকলেও এখন সেটি safe hosting validation চালাবে।
- Signed GitHub release package তৈরির command এখন `npm run release:package`।
- GitHub Actions workflow নতুন command ব্যবহার করে।
- `pg/lib/pool.js` private path check সরানো হয়েছে। আধুনিক `pg` package Pool implementation আলাদা `pg-pool` package থেকে নেয়।
- Dependency validation এখন stable public module resolution দিয়ে হয়: `mysql2/promise`, `pg`, `pg-pool`, `ws`।
- Hosting production command: Install `npm ci --omit=dev --ignore-scripts`, Build `npm run build`, Start `npm start`।
