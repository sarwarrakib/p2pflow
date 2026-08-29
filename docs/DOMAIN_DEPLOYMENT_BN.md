# P2PFlow 2.0.7 — Website / API / Domain Deployment Guide

এই build-এ source code **একটি repository**, কিন্তু responsibility আলাদা folder-এ রাখা হয়েছে। Production-এ সবচেয়ে নিরাপদ setup হলো browser-এর জন্য same-origin API proxy রাখা এবং Android/integration-এর জন্য আলাদা `api.` hostname expose করা।

## কোন folder কী

| অংশ | Source / output | কাজ |
|---|---|---|
| Website frontend | `web/` | Login, Dashboard, Orders, Ads, Chat, Accounting, Billing, Super Admin UI, CSS/JS/PWA |
| Main HTTP API + Web server | `cmd/p2pflow/` + `internal/httpapi/` | `/api/...`, auth/session, static `web/` serving, health/readiness |
| Business/service layer | `internal/service/` | tenant/business orchestration |
| Binance connector | `internal/binance/` | Binance REST/C2C/WebSocket client/scheduler |
| Database | `internal/db/` + `migrations/{postgres,mysql,mariadb}/` | normalized SQL persistence/migrations |
| Background worker | `cmd/p2pflow-worker/` + `internal/worker/` | background sync/delivery/job processing |
| Chrome Extension | `extension/` | Binance advertiser/feedback bridge |
| Deployment | `deploy/nginx/`, `deploy/systemd/`, `docker-compose.*.yml` | reverse proxy/service/container examples |
| Production config | `.env` | domain, DB, secret, SMTP, billing, push, update settings |
| Built binaries | `bin/` after `./scripts/build.sh` | `p2pflow`, `p2pflow-worker`, `p2pflow-migrate`, `p2pflow-updater`, `p2pflow-keygen` |


## আপনার `p2pflow.app` domain-এর জন্য recommended map

আপনার existing domain যদি `p2pflow.app` হয়, production-এ map করুন:

```text
p2pflow.app        -> public landing/marketing; এখন landing না থাকলে app.p2pflow.app-এ redirect
app.p2pflow.app    -> main P2PFlow Website/Dashboard + same-origin /api
api.p2pflow.app    -> API-only hostname for Android/native/trusted integrations
admin.p2pflow.app  -> optional Super Admin hostname
```

Current repository-তে আলাদা Next.js marketing site নেই; `web/` authenticated application/login/signup UI। তাই public marketing frontend তৈরি না করা পর্যন্ত root `p2pflow.app`-কে `https://app.p2pflow.app`-এ redirect করা practical। ভবিষ্যতে marketing site আলাদা deploy করলে root domain সেটিতে যাবে এবং Go application `app.`-এ থাকবে।

Exact production `.env` example:

```env
P2PFLOW_PUBLIC_BASE_URL=https://app.p2pflow.app
COOKIE_SECURE=true
COOKIE_DOMAIN=.p2pflow.app   # only if app/admin shared session is desired
```

Exact DNS records:

```text
p2pflow.app        A  <SERVER_IP>
app.p2pflow.app    A  <SERVER_IP>
api.p2pflow.app    A  <SERVER_IP>
admin.p2pflow.app  A  <SERVER_IP>
```

একটি SAN certificate চাইলে `app.p2pflow.app` প্রথম domain রাখুন, যাতে template-এর certificate path সরাসরি match করে:

```bash
sudo certbot certonly --standalone \
  -d app.p2pflow.app \
  -d api.p2pflow.app \
  -d admin.p2pflow.app \
  -d p2pflow.app
```

Root marketing site এখন আলাদা না থাকলে certificate নেওয়ার পরে Nginx-এ root domain redirect block রাখতে পারেন:

```nginx
server {
    listen 443 ssl http2;
    server_name p2pflow.app;
    ssl_certificate /etc/letsencrypt/live/app.p2pflow.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.p2pflow.app/privkey.pem;
    return 301 https://app.p2pflow.app$request_uri;
}
```

`deploy/nginx/p2pflow-split-domains.conf.example`-এ global replace `example.com` → `p2pflow.app` করলে app/admin/api blocks আপনার domain-এর জন্য তৈরি হবে।

## Recommended DNS

একই server IP ধরলে DNS-এ:

```text
app.example.com    A    <SERVER_IP>
api.example.com    A    <SERVER_IP>
admin.example.com  A    <SERVER_IP>   # optional
```

Cloudflare ব্যবহার করলে তিনটি record proxy করা যায়, কিন্তু `/api/*` এবং `/api/events` cache করবেন না।

## কেন browser সরাসরি api.example.com call করবে না

বর্তমান P2PFlow browser authentication HttpOnly session cookie + CSRF protection ব্যবহার করে। তাই Web UI-কে `app.example.com` থেকে load করিয়ে একই hostname-এর `/api/...` request Nginx দিয়ে backend-এ proxy করা সবচেয়ে নিরাপদ ও সহজ। এতে CORS দরকার হয় না এবং session cookie cross-origin করতে হয় না।

একই backend-কে `api.example.com`-এও expose করা হয়, কিন্তু সেটি Android/native app বা trusted integration-এর জন্য। Browser frontend-কে cross-origin API-তে জোর করে পাঠাতে চাইলে আলাদা CORS/origin policy ও native token contract design করা উচিত; শুধু JavaScript URL বদলানো recommended নয়।

## `.env` domain settings

Main browser hostname:

```env
P2PFLOW_PUBLIC_BASE_URL=https://app.example.com
COOKIE_SECURE=true
```

`app.example.com` ও `admin.example.com`-এ একই login session share করতে চাইলে optional:

```env
COOKIE_DOMAIN=.example.com
```

শুধু `app.example.com` ব্যবহার করলে `COOKIE_DOMAIN=` ফাঁকা রাখাই ভালো।

## Nginx

Template:

```text
deploy/nginx/p2pflow-split-domains.conf.example
```

Copy:

```bash
sudo cp deploy/nginx/p2pflow-split-domains.conf.example /etc/nginx/sites-available/p2pflow
sudo nano /etc/nginx/sites-available/p2pflow
```

তারপর `example.com` আপনার domain-এ বদলান এবং TLS certificate path ঠিক করুন। Enable:

```bash
sudo ln -s /etc/nginx/sites-available/p2pflow /etc/nginx/sites-enabled/p2pflow
sudo nginx -t
sudo systemctl reload nginx
```

Let's Encrypt example (একটি SAN certificate):

```bash
# app.example.com প্রথম -d হওয়ায় certificate name সাধারণত app.example.com হবে
sudo certbot certonly --standalone \
  -d app.example.com \
  -d api.example.com \
  -d admin.example.com
```

`--standalone` ব্যবহার করলে certificate নেওয়ার সময় port 80 free থাকতে হবে; existing Nginx চললে সাময়িক stop করুন অথবা আপনার environment অনুযায়ী Certbot `--nginx`/webroot method ব্যবহার করুন। Template-এর app/admin/api তিন TLS block একই SAN certificate path ব্যবহার করে।

## Routing result

- `https://app.example.com/` → Website/Dashboard
- `https://app.example.com/api/...` → same backend API, browser-safe same-origin
- `https://admin.example.com/` → optional separate Admin hostname; app role checks still apply
- `https://api.example.com/api/...` → API-only endpoint for Android/integrations
- `https://api.example.com/` → 404 by design
- internal Go service → `127.0.0.1:8080`, public internet-এ expose করবেন না


## Single-server service mode বনাম separate worker

প্রথম production server-এ সবচেয়ে সহজ mode:

```env
P2PFLOW_WORKERS=true
NATS_URL=
```

এ অবস্থায় শুধু `deploy/systemd/p2pflow.service` enable করুন; main process-ই background workers চালাবে। `p2pflow.service` এখন `.env`-এর `P2PFLOW_WORKERS` value respect করে।

পরে API/worker আলাদা process/instance করলে:

```env
P2PFLOW_WORKERS=false
NATS_URL=nats://127.0.0.1:4222
```

তখন `p2pflow.service` + `p2pflow-worker.service` দুটো enable করুন; worker unit নিজে `P2PFLOW_WORKERS=true` override করে। Separate process-এর realtime event API instance-এ পৌঁছাতে NATS ব্যবহার করুন।

## Build output deployment

Build:

```bash
go mod download
./scripts/build.sh
```

Main runtime files/folders copy করবেন:

```text
bin/p2pflow
bin/p2pflow-worker
bin/p2pflow-migrate
bin/p2pflow-updater
bin/p2pflow-keygen
web/
migrations/
.env
```

Recommended application directory:

```text
/opt/p2pflow/
```

Uploads/system-update state release folder-এর বাইরে persistent path-এ রাখুন, যেমন:

```text
/opt/p2pflow/data/uploads/
/opt/p2pflow/data/system-updates/
```

এবং `.env`-এ সেই absolute path দিন।

## Important security note

`api.example.com` public hostname থাকলেও database (`5432/3306`) এবং NATS (`4222`) public internet-এ expose করবেন না। শুধু Nginx-এর 80/443 public থাকবে; Go `:8080`, DB এবং NATS private localhost/VPC network-এ থাকবে।
