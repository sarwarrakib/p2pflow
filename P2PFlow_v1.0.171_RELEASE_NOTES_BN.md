# P2PFlow v1.0.171 - Direct Hostinger Startup Fix

## মূল সমাধান

- Hosting startup আর `releases/<version>/` directory বা release manifest খুঁজবে না।
- ZIP root-এর আসল `server.js` সরাসরি setup UI এবং application UI চালাবে।
- Hostinger deployment nested release directory বাদ দিলে বা পরিবর্তন করলেও startup বন্ধ হবে না।
- Direct deployment-এ `.env`, setup state এবং update cache Application Root-এর ভেতরেই থাকবে।
- System Update page direct-hosting mode পরিষ্কারভাবে দেখাবে; GitHub connection, signed release verification এবং Check Now চালু থাকবে।
- Default build command এখন dependency-independent syntax validation করে। Production dependencies `npm ci` দ্বারা install হবে।

## Fresh installation

`/ready` response-এ `version: 1.0.171` এবং `status: setup_required` দেখা গেলে `/setup` খুলুন।
