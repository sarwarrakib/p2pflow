# P2PFlow Private GitHub Update Setup

## Browser configuration

Owner login → Control Panel → System Update। Repository, fine-grained token এবং signing key browser থেকেই configure হবে। Environment Variable edit করার প্রয়োজন নেই।

## Recommended repository

নিজের GitHub personal account-এর একটি Private repository ব্যবহার করুন। Repository field-এ full GitHub link অথবা `owner/repository`—দুটিই গ্রহণ করবে।

## Token

Fine-grained Personal Access Token:

- Repository access: Only select repositories
- Selected repository: P2PFlow private repository
- Contents: Read-only
- অন্য permission প্রয়োজন নেই

Save করার আগে P2PFlow repository private কি না এবং token পড়তে পারে কি না test করবে। Token encrypted database state-এ save হয় এবং response/UI-তে ফেরত আসে না।

## Signing key

System Update → Generate Signing Key। Private key একবার দেখাবে। GitHub repository → Settings → Secrets and variables → Actions-এ secret name `UPDATE_SIGNING_PRIVATE_KEY` দিয়ে complete PEM private key save করুন। P2PFlow শুধু public verification key সংরক্ষণ করে।

## Release process

GitHub source package repository-তে push করুন। নতুন application version `package.json`-এ বাড়িয়ে নতুন package version push করুন, যেমন `1.0.168`। Included Action নিজে matching `v1.0.168` tag ও signed GitHub Release publish করবে।

Server নিজে install করবে না। Owner Check Now, Prepare Update এবং Install Update চাপলে তবেই update হবে।

## Rollback

Rollback শুধু code release switch করে। Current MariaDB/PostgreSQL state, revision, order, ledger, payment transaction এবং accounting history অপরিবর্তিত থাকে। Breaking data compatibility epoch-এর মধ্যে rollback block করা হয়।
