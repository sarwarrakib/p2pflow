# P2PFlow v1.4.15

এই hotfix release signing-key rotation-এর পর automatic update verification আরও নির্ভরযোগ্য ও পরিষ্কার করেছে।

- GitHub Actions signed release manifest-এ এখন Ed25519 signing public-key fingerprint যুক্ত হয়।
- P2PFlow-এ সংরক্ষিত update public key-এর fingerprint System Update পেজে দেখা যায়।
- Release key এবং P2PFlow key না মিললে generic signature failure-এর বদলে key-mismatch diagnostic দেখাবে।
- GitHub secret `UPDATE_SIGNING_PRIVATE_KEY` invalid হলে release workflow এখন পরিষ্কার error দিয়ে থামবে।
- Signature verification কোনোভাবেই bypass/disable করা হয়নি।
- v1.4.15 নতুন version হওয়ায় signing key বদলানোর পর GitHub workflow নতুন করে signed Release publish করতে পারবে; পুরোনো v1.4.14 release পুনরায় ব্যবহার করা হবে না।

## Update

P2PFlow-এ নতুন signing key generate করে তার private key GitHub repository secret `UPDATE_SIGNING_PRIVATE_KEY`-এ বসানোর পরে এই v1.4.15 source GitHub-এ push করুন। GitHub Actions সফলভাবে শেষ হলে System Update > Check Now ব্যবহার করুন।
