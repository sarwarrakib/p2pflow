# P2PFlow v1.4.13 — Standalone Login Route

এই hotfix-এ login screen-কে মূল SPA/router থেকে আলাদা করা হয়েছে।

- নতুন standalone `/login` route যোগ হয়েছে (`public/login.html` + `public/login.js`)।
- session expire হলে আগের `#/orders`, `#/chat`, `#/profile` ইত্যাদি route-এ login UI দেখানোর বদলে browser `/login?next=...`-এ যায়।
- login page আর application router, realtime streams, page auto-refresh বা hosting challenge auto-reload logic load করে না।
- login চলাকালে HTTP 503/HTML response এলেও page নিজে থেকে reload loop করবে না; error দেখিয়ে একই login page-এ থাকবে।
- সফল login-এর পর `next` route নিরাপদভাবে restore হয়; direct logout-এর পর `/login`-এ যায়।
- `public/index.html` থেকে embedded login markup সরানো হয়েছে, তাই app URL এবং login URL এখন আলাদা।
- `/login` server-side alias `/login.html` serve করে।
- নতুন `login-route-self-test` regression test যোগ হয়েছে।
