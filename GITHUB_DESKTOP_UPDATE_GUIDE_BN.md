# P2PFlow v1.0.167 - GitHub Desktop দিয়ে সহজ ও নিরাপদ Update Guide

## আগে বুঝে নিন: কোন ZIP কোথায় যাবে

### 1. GitHub-এর জন্য

`P2PFlow_v1.0.167_GITHUB_SOURCE.zip`

- ZIP file-টি GitHub repository-তে সরাসরি রাখবেন না।
- ZIP extract করে **ভেতরের সব file ও folder** repository root-এ রাখবেন।
- GitHub repository-এর প্রথম স্তরেই `package.json`, `server.js`, `.github`, `lib`, `public` ও `scripts` দেখা প্রয়োজন।

### 2. Hosting-এর জন্য

`P2PFlow_v1.0.167_HOSTING_MIGRATION.zip`

- এটি GitHub repository-তে যাবে না।
- এটি একবার hosting-এর Node Application Root-এ deploy করলে stable launcher, versioned release folder, verified install এবং rollback চালু হবে।

---

## প্রথমবার GitHub Desktop দিয়ে Upload - সবচেয়ে সহজ নিয়ম

### ধাপ 1: খালি Private Repository তৈরি করুন

1. GitHub Desktop খুলুন।
2. `File -> New repository` চাপুন।
3. Name দিন: `p2pflow-private`।
4. `Initialize this repository with a README` চালু রাখুন।
5. `Create repository` চাপুন।
6. `Publish repository` চাপুন।
7. **Keep this code private** অবশ্যই চালু রাখুন।

এখন GitHub-এ private repository তৈরি হয়েছে, কিন্তু P2PFlow source এখনো upload হয়নি। তাই release workflow-ও এখনো চলবে না।

### ধাপ 2: Release Signing Secret একবার সেট করুন

1. P2PFlow-এ Owner account দিয়ে login করুন।
2. `Control Panel -> System Update` খুলুন।
3. `Generate Signing Key` চাপুন।
4. দেখানো private key সঙ্গে সঙ্গে copy করুন। P2PFlow শুধু public key সংরক্ষণ করে; private key দ্বিতীয়বার দেখাবে না।
5. Browser-এ GitHub repository খুলুন।
6. যান: `Settings -> Secrets and variables -> Actions -> New repository secret`।
7. Name দিন:

   `UPDATE_SIGNING_PRIVATE_KEY`

8. Value-তে সম্পূর্ণ private key paste করে Save করুন।

Private key কোনো file, commit, screenshot, chat বা repository-তে রাখবেন না।

### ধাপ 3: Source copy করে প্রথম Push দিন

1. `P2PFlow_v1.0.167_GITHUB_SOURCE.zip` একটি temporary folder-এ extract করুন।
2. GitHub Desktop-এ repository নির্বাচন করে `Repository -> Show in Explorer` চাপুন।
3. Extract করা package-এর **ভেতরের সব file ও folder** repository folder-এ copy/overwrite করুন।
4. `.git` folder কখনো মুছবেন না।
5. `.github` folder-টি hidden হলেও copy হয়েছে নিশ্চিত করুন।
6. GitHub Desktop-এর Changes tab-এ fileগুলো review করুন।
7. Summary লিখুন:

   `Initial P2PFlow 1.0.167`

8. `Commit to main` চাপুন।
9. `Push origin` চাপুন।

Push হওয়ার পর GitHub Actions নিজে tests চালিয়ে signed `v1.0.167` Release তৈরি করবে। আলাদা করে tag বা ZIP upload করতে হবে না।

---

## P2PFlow-কে Private GitHub Repository-এর সঙ্গে Connect করুন

Fine-grained token তৈরি করুন:

- Repository access: `Only select repositories`
- Selected repository: শুধু `p2pflow-private`
- Repository permission: `Contents - Read-only`
- Expiration date: একটি সীমিত মেয়াদ দিন

Token অবশ্যই `github_pat_` দিয়ে শুরু হবে।

তারপর P2PFlow-এর `System Update` page-এ:

1. Repository link paste করুন।
2. Token paste করুন।
3. `Test Connection` চাপুন।
4. Owner password ও 6-digit secret দিয়ে `Save Connection` করুন।
5. `Check Now` চাপুন।

Release তৈরি হতে কয়েক মিনিট লাগলে `No published production release exists yet` দেখানো স্বাভাবিক; এটি আর 404 connection error নয়।

---

## একবার Hosting Migration করুন

এটি শুধু একবার করতে হবে। এরপর নতুন update GitHub থেকে সহজে install হবে।

1. Hosting Application Root এবং database backup নিন।
2. বর্তমান `.env`, `.p2pflow`, database ও Application Key মুছবেন না।
3. Hosting File Manager-এ `P2PFlow_v1.0.167_HOSTING_MIGRATION.zip` upload করুন।
4. ZIP-এর **ভেতরের content সরাসরি Node Application Root-এ** extract/overwrite করুন; অতিরিক্ত parent folder রাখবেন না।
5. Hosting panel-এ সেট করুন:
   - Node.js: `20` বা নতুন
   - Startup file: `server.js`
   - Install command: `npm ci --omit=dev --ignore-scripts`
   - Build command: `npm run build`
   - Start command: `npm start`
6. Application Restart করুন।
7. `/ready` খুলে version `1.0.167` নিশ্চিত করুন।
8. System Update page-এ `Automatic update engine - Ready` দেখা উচিত।

---

## পরের Update কীভাবে Upload করবেন

নতুন official package, যেমন `P2PFlow_v1.0.168_GITHUB_SOURCE.zip`, পাওয়ার পরে:

1. ZIP একটি temporary folder-এ extract করুন।
2. GitHub Desktop-এ `p2pflow-private` repository নির্বাচন করুন।
3. `Repository -> Show in Explorer` খুলুন।
4. `.git` folder অক্ষত রেখে নতুন package-এর **ভেতরের সব content** repository root-এ copy/overwrite করুন।
5. GitHub Desktop-এ Changes review করুন।
6. Summary লিখুন:

   `P2PFlow 1.0.168 update`

7. `Commit to main` চাপুন।
8. `Push origin` চাপুন।

এরপর GitHub নিজে:

- locked production dependencies install করবে;
- high-severity dependency audit চালাবে;
- সম্পূর্ণ test suite চালাবে;
- একই version দ্বিতীয় commit-এ reuse হতে দেবে না;
- Ed25519-signed update package বানাবে;
- matching tag এবং GitHub Release publish করবে।

P2PFlow-এ শুধু:

1. `Check Now`
2. `Prepare Update`
3. `Install Update`

এই তিনটি চাপবেন।

---

## নিজের Code Edit করলে Version বাড়ানোর নিয়ম

Official নতুন package ব্যবহার করলে version আগে থেকেই বাড়ানো থাকবে।

নিজে code edit করলে commit-এর আগে repository root-এর:

`SET_NEXT_VERSION.bat`

double-click করুন। এটি:

- `1.0.167 -> 1.0.168` করবে;
- `package.json` ও `package-lock.json` একই রাখবে;
- browser cache version update করবে;
- guide-এর পরবর্তী উদাহরণ `1.0.169` করবে।

তারপর GitHub Desktop থেকে Commit ও Push দিন। একই version দিয়ে আলাদা code push করলে workflow নিরাপত্তার জন্য release বন্ধ করবে।

---

## Security Rules

- GitHub repository সবসময় Private রাখুন।
- GitHub token শুধু নির্বাচিত repository-তে `Contents: Read-only` দিন।
- Signing private key শুধু GitHub Actions Secret-এ রাখুন।
- `.env`, database, Application Key, token বা private key কখনো GitHub-এ commit করবেন না।
- P2PFlow signature, package SHA-256, complete release-tree hash, file count/size, path safety এবং symlink safety যাচাই না করে update install করবে না।
- Update switch-এর আগে database backup তৈরি হবে; launcher readiness failure হলে আগের verified code release-এ ফিরে যাবে।
