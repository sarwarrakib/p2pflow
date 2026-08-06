# P2PFlow 1.1 Release Notes

- Version display এখন `1.1`, `1.2`, `1.2.1` format অনুসরণ করে।
- Normal update minor version বাড়ায়; hotfix patch version বাড়ায়।
- System Update page সম্পূর্ণ compact redesign করা হয়েছে।
- ডান পাশে শুধু step-by-step Note panel রাখা হয়েছে।
- `Update Now` এক ক্লিকে signed package verify ও prepare করে, তারপর Owner authorization নিয়ে install করে।
- GitHub push-এর পরে Check Now -> Update Now flow চালু করা হয়েছে।
- Install-এর আগে active write completion এবং database backup বাধ্যতামূলক।
- Code rollback database records বা পরবর্তী transaction delete করে না।
- Shared hosting startup same process-এ থাকে; child-process proxy timeout এড়ানো হয়েছে।
- Initial hosting release validation critical executable files দিয়ে করা হয়, তাই hosting hidden documentation বাদ দিলেও valid application আর startup_failed হবে না।
- Future GitHub releases পূর্ণ Ed25519 signature, package SHA-256 ও release-tree verification ছাড়া install হয় না।
