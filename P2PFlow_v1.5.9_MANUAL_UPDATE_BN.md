# P2PFlow v1.5.9 Manual Update

এই hotfix-এর জন্য Terminal command বা `npm install` দরকার নেই।

1. `P2PFlow_v1.5.9_MANUAL_PATCH.zip` download করুন
2. cPanel File Manager-এ P2PFlow Node Application Root খুলুন
3. ZIP upload করে **Extract** করুন
4. Existing files-এর ক্ষেত্রে **Overwrite / Replace** দিন
5. cPanel Node.js Application থেকে **Restart** দিন
6. browser-এ `https://YOUR-DOMAIN/ready` খুলুন
7. JSON-এ `"version":"1.5.9"` আছে নিশ্চিত করুন
8. Login page-এ hard refresh করুন (Ctrl+F5 / mobile browser cache refresh)

## এই fix-এর পরে

যদি Settings-এ Email OTP OFF থাকে, Username/Password দেওয়ার পরে শুধু **Security PIN** step আসবে। আপনার existing 6-digit secret দিলেই login হবে; Gmail/SMTP ব্যবহার হবে না।

যদি Email OTP ON থাকে এবং sender Gmail/SMTP সত্যিই fail করে, v1.5.8-এর Owner Emergency Login / Security Question fallback আগের মতোই কাজ করবে।
