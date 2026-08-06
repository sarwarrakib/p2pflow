# P2PFlow v1.1.0 — একবার Setup, এরপর Owner-only Update

এই সংস্করণে `/setup` শুধু প্রথমবার database এবং Owner account তৈরি করার জন্য। একবার setup সফল হলে software update-এর সময় setup code বা permanent Application Key আর দিতে হবে না।

## ১. v1.0.163 থেকে আপডেট করলে আগে যা করবেন

Hosting File Manager থেকে বর্তমান Application Root এবং database-এর backup নিন। বর্তমান database, `.env`, `.p2pflow`, `legacy-import`, proof/chat file অথবা অন্য runtime data মুছবেন না।

`P2PFlow_v1.1.0_HOSTING_READY.zip`-এর ভেতরের সব content সরাসরি বর্তমান Node Application Root-এ extract/copy করে code file overwrite করুন। অতিরিক্ত `P2PFlow` parent folder রাখবেন না। এই package নতুন `.env` বা database data দেয় না, তাই saved key এবং database configuration overwrite হবে না।

তারপর Node Application panel থেকে:

1. Startup file `server.js` রাখুন।
2. Node.js 20 বা নতুন version নির্বাচন করুন।
3. **Run NPM Install / Install Dependencies** একবার চাপুন।
4. Application Restart করুন।

P2PFlow পুরোনো root `.env` এবং `.p2pflow` প্রয়োজন হলে stable `shared` folder-এ নিজে migrate করবে। Existing Owner ও database ঠিক থাকলে সরাসরি login page আসবে; `/setup` খুলতে হবে না।

## ২. একেবারে নতুন installation হলে MariaDB তৈরি

Hosting control panel-এর **MySQL Databases**, **MariaDB Databases** অথবা **Database Manager** খুলুন।

1. একটি database তৈরি করুন।
2. একটি database user ও শক্তিশালী password তৈরি করুন।
3. User-কে database-এর সঙ্গে যুক্ত করুন।
4. **All Privileges** দিন।

cPanel prefix যোগ করলে prefix-সহ সম্পূর্ণ নাম ব্যবহার করবেন। উদাহরণ:

```text
Database Host: localhost
Port: 3306
Database Name: accountname_p2pflow
Database User: accountname_p2pflowuser
```

## ৩. নতুন installation-এর browser setup

Node app Start/Restart হওয়ার পরে Application Root-এ থাকবে:

```text
P2PFLOW_SETUP_CODE.txt
```

তারপর খুলুন:

```text
https://YOUR-DOMAIN/setup
```

Setup code দিন, MariaDB/MySQL নির্বাচন করুন, database connection test করুন, তারপর Owner username, name, email, কমপক্ষে ১২ অক্ষরের password এবং non-repeating/non-sequential 6-digit secret দিন।

নতুন empty database হলে Application Key field খালি রাখুন। P2PFlow key তৈরি করে একবার দেখাবে। সেটি password manager এবং encrypted offline backup-এ সংরক্ষণ করুন।

Setup সফল হওয়ার পরে:

- `P2PFLOW_SETUP_CODE.txt` মুছে যাবে;
- setup lock `shared/.p2pflow/setup-complete.json`-এ থাকবে;
- `/setup` normal login page-এ redirect করবে;
- update-এর সময় setup code বা Application Key লাগবে না।

## ৪. “Existing or legacy data requires exact Application Key” সমস্যার নতুন নিয়ম

আগের সংস্করণে partial setup-এর পরে database state তৈরি হলেও setup page saved Application Key নিজে ব্যবহার করত না। ফলে নতুন code দিলে key error এবং আগের code দিলে installation-code error দেখা যেত।

v1.1.0-এ:

- `shared/.env` বা পুরোনো `.env`-এ valid permanent Application Key থাকলে setup page সেটি নিজে reuse করবে;
- Application Key field আবার লিখতে হবে না;
- setup code release folder বদলালে বদলাবে না;
- সত্যিই saved key না থাকলে এবং encrypted existing data থাকলেই শুধু পুরোনো exact key একবার restore করতে বলবে। Encryption-এর কারণে সেই key ছাড়া পুরোনো data decrypt করা প্রযুক্তিগতভাবে সম্ভব নয়।

পুরোনো setup code one-time code; নতুন server instance অন্য code তৈরি করলে পুরোনোটি গ্রহণ না করা স্বাভাবিক। v1.1.0-এ code stable Application Root-এ থাকে এবং setup সফল হওয়ার পরে আর প্রয়োজন হয় না।

## ৫. Update কোথা থেকে করবেন

Owner account দিয়ে login করুন:

```text
Control Panel → System Update
```

শুধু `isOwner` account এই menu ও API ব্যবহার করতে পারবে। অন্য Admin/Manager update install করতে পারবে না।

System Update page-এ:

1. Private GitHub repository link দিন।
2. Fine-grained token দিন।
3. **Test Connection** চাপুন।
4. Owner password ও secret দিয়ে **Save Connection** করুন।
5. **Generate Signing Key** চাপুন।
6. দেখানো private key GitHub repository secret `UPDATE_SIGNING_PRIVATE_KEY` হিসেবে একবার save করুন।
7. ভবিষ্যতে **Check Now → Prepare Update → Install Update** ব্যবহার করুন।

Update নিজে install হবে না। শুধু Owner button চাপলে install হবে।

## ৬. GitHub token-এর minimum permission

GitHub-এ personal private repository ব্যবহার করুন। Fine-grained Personal Access Token তৈরি করার সময়:

```text
Repository access: Only select repositories
Selected repository: আপনার P2PFlow private repository
Repository permissions: Contents — Read-only
```

P2PFlow-এর database-এ token encrypted state-এর মধ্যে থাকবে; UI token আবার দেখাবে না। Source code বা GitHub file-এ token লিখবেন না।

## ৭. GitHub source কীভাবে ব্যবহার করবেন

`P2PFlow_v1.1.0_GITHUB_SOURCE.zip` extract করে তার content private repository-তে upload/push করুন। Included workflow `.github/workflows/release.yml` main/master-এ নতুন version push হলে স্বয়ংক্রিয়ভাবে:

- dependency install ও test চালাবে;
- package version/tag মিলাবে;
- signed update package তৈরি করবে;
- GitHub Release publish করবে।

Current server 1.1.0 হলে 1.1.0 release update হিসেবে দেখাবে না। পরবর্তী source package 1.0.172 GitHub Desktop থেকে push করলেই workflow নিজে `v1.0.172` tag ও signed release publish করবে; তারপর Control Panel-এ update দেখাবে।

## ৮. Update ও rollback-এ data safety

Update install-এর আগে P2PFlow:

- নতুন write সাময়িকভাবে থামায়;
- active mutation ও background write শেষ হওয়ার অপেক্ষা করে;
- database durable flush করে;
- pre-update database backup তৈরি করে;
- signed package, SHA-256, tree hash, file count, size, Node version, schema এবং data epoch যাচাই করে;
- নতুন code release চালু করে readiness check করে।

New release ready না হলে stable same-process hosting entry পরের restart-এ আগের code release-এ ফিরে যায়। Database পুরোনো snapshot দিয়ে replace করা হয় না, তাই update-এর পরে commit হওয়া transaction code rollback-এর কারণে কাটা যায় না। Rollback শুধু compatible managed code release-এর মধ্যে অনুমোদিত।

v1.1.0 থেকে managed release history শুরু হয়। ভবিষ্যতে 1.1.0 install করলে 1.1.0-এ code rollback করা যাবে। Buggy v1.0.163-এ automatic rollback ইচ্ছাকৃতভাবে দেওয়া হয়নি।

## ৯. Hosting requirement

One-click update-এর জন্য hosting-এ এগুলো প্রয়োজন:

- Node.js 20+
- application folder-এ write permission
- Linux `tar` utility
- private GitHub API outbound HTTPS access

System Update page-এর Setup Status-এ hosting entry/repository/token/signing key সব Ready না হলে Install button চালু হবে না।

## ১০. 503 হলে

Hosting panel থেকে যাচাই করুন:

- Node application Running কি না;
- Startup file `server.js` কি না;
- Node.js 20+ কি না;
- Run NPM Install সফল হয়েছে কি না;
- Application Root ঠিক কি না;
- MariaDB Host/Name/User/Password ঠিক কি না;
- database user-এর All Privileges আছে কি না।

Application log-এ `shared/startup-failure.json`-এর error code দেখা যেতে পারে। Existing setup complete থাকলে `/setup` ইচ্ছাকৃতভাবে আর খুলবে না; configuration হারালে backup থেকে `shared/.env` restore করতে হবে।
