# P2PFlow v1.0.166 — GitHub Hosting Build Path Fix

- GitHub deployment source এখন ZIP root-এই `package.json`, `server.js`, `scripts`, `lib`, `public` দেয়।
- Hosting build-এর জন্য `npm run build` যোগ হয়েছে।
- Release package builder আলাদা `npm run build:release`; এটি hosting build নয়।
- Build source missing হলে পরিষ্কার error দেয়।
- GitHub Actions release workflow named package script ব্যবহার করে।
