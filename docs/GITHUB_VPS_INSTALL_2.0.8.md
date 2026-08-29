# P2PFlow 2.0.8 - GitHub Release and Ubuntu VPS Install

This is the recommended first-install path for the target server:
Ubuntu 24.04 LTS, Linux x86_64/amd64, systemd, root/sudo access.
The production VPS does not need Go installed. GitHub Actions builds the Go binaries.

## 1. Domain layout

Create these DNS A records and point them to the VPS public IPv4 address:

- `app.p2pflow.app` - browser dashboard and same-origin browser API
- `api.p2pflow.app` - API-only hostname for Android/native/integrations
- `admin.p2pflow.app` - Super Admin browser hostname

The root `p2pflow.app` may stay on separate Business Hosting for a public/marketing site.
Do not start the browser setup until the three VPS subdomains resolve to the VPS.

## 2. Publish the source to GitHub

A private repository is recommended until you intentionally want to open the source.
Never commit `.env`, database files, setup codes, signing private keys, API secrets, or production data.
The included `.gitignore` excludes the common secret/runtime paths.

From the extracted `P2PFlow_v2.0.8` source directory:

```bash
git init
git add .
git commit -m "P2PFlow v2.0.8"
git branch -M main
git remote add origin git@github.com:YOUR_GITHUB_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Create and push the release tag:

```bash
git tag -a v2.0.8 -m "P2PFlow v2.0.8"
git push origin v2.0.8
```

The included workflow `.github/workflows/release.yml` runs tests/QA, builds Linux amd64 binaries,
and publishes these GitHub Release assets:

- `P2PFlow_v2.0.8_linux_amd64.tar.gz`
- `P2PFlow_v2.0.8_linux_amd64.tar.gz.sha256`

Wait until the GitHub Actions workflow and the v2.0.8 Release are successful before installing the VPS.

## 3. Private GitHub repository access on the VPS

For a private repository, use either an SSH deploy key for cloning and a fine-grained GitHub token
with read-only Contents permission for downloading private Release assets.
Do not use an account-wide write token on the production VPS.

Clone the repository on the VPS:

```bash
cd /root
git clone git@github.com:YOUR_GITHUB_USERNAME/YOUR_REPOSITORY.git p2pflow-source
cd /root/p2pflow-source
```

For a private Release, set a temporary read-only token in the root shell before the next command:

```bash
read -rsp "GitHub read-only token: " GITHUB_TOKEN; echo
export GITHUB_TOKEN
```

For a public repository, `GITHUB_TOKEN` is not required.

The release downloader uses the GitHub Releases API and verifies the published SHA-256 checksum before running the installer.

## 4. Install the prebuilt GitHub Release on the VPS

Run:

```bash
sudo -E ./scripts/install-from-github.sh \
  --repo YOUR_GITHUB_USERNAME/YOUR_REPOSITORY \
  --version v2.0.8 \
  --app-domain app.p2pflow.app \
  --api-domain api.p2pflow.app \
  --admin-domain admin.p2pflow.app \
  --email YOUR_EMAIL_ADDRESS
```

The installer:

1. verifies Linux amd64 and systemd;
2. installs Nginx, PostgreSQL, NATS and Certbot;
3. creates a 4 GiB swap file when swap is disabled;
4. creates a private local PostgreSQL database/user with a random password;
5. creates application, extension, billing and VAPID secrets;
6. installs the release under `/opt/p2pflow/releases/2.0.8`;
7. points `/opt/p2pflow/current` to the active release;
8. installs separate `p2pflow-api.service` and `p2pflow-worker.service`;
9. binds NATS to `127.0.0.1:4222` only;
10. obtains a Let's Encrypt certificate for the three domains;
11. writes the split-domain Nginx configuration;
12. creates a one-time setup code and prints the HTTPS browser setup URL;
13. generates the System Update Ed25519 public/private signing pair, stores only the public key in runtime configuration, and writes the root-only private key under `/root/P2PFLOW_RELEASE_SIGNING_PRIVATE_v2.0.8.key`. Move that private key to an encrypted/offline backup after installation and do not commit it to GitHub.

If TLS issuance fails, fix DNS and rerun the installer. Do not enter the Super Admin password over plain HTTP.

## 5. Finish in the browser

Open:

```text
https://app.p2pflow.app/setup
```

Enter the setup code printed by the installer. It is also stored temporarily at:

```text
/opt/p2pflow/data/P2PFLOW_SETUP_CODE.txt
```

Then:

1. click the database test button; the local PostgreSQL database was already prepared;
2. enter Workspace name;
3. enter Owner/Super Admin username, name, email, strong password and private 6-digit security PIN;
4. optionally configure SMTP, or skip mail and configure it later;
5. verify `https://app.p2pflow.app` as the public application URL;
6. finish installation.

On successful completion the setup endpoint:

- applies migrations through 018;
- creates the first Owner and marks it as platform Super Admin;
- stores the one-way password/PIN hashes;
- updates the production runtime environment;
- deletes the one-time setup-code file;
- permanently disables setup mode;
- restarts the API through systemd;
- allows the worker to restart and begin background processing.

## 6. Runtime separation on one VPS

The source/release remains one project, but runtime work is separated:

- `/opt/p2pflow/current/web/` - dashboard files served through the Go HTTP service/Nginx
- `p2pflow-api.service` - browser/API/auth/SSE and user-facing requests
- `p2pflow-worker.service` - Binance synchronization, chat/background work, notifications, billing jobs and maintenance
- PostgreSQL - normalized permanent relational data
- `p2pflow-nats.service` - local event transport between API and worker
- Nginx - public TLS termination and hostname routing

This separation is specifically intended to prevent background Binance work from becoming the normal request path for every browser action.

## 7. Verify the installation

```bash
systemctl status p2pflow-api.service --no-pager
systemctl status p2pflow-worker.service --no-pager
systemctl status p2pflow-nats.service --no-pager
systemctl status postgresql --no-pager
systemctl status nginx --no-pager

curl -fsS https://app.p2pflow.app/healthz
curl -fsS https://app.p2pflow.app/ready
curl -fsS https://api.p2pflow.app/healthz
curl -fsS https://api.p2pflow.app/ready
```

Logs:

```bash
journalctl -u p2pflow-api.service -f
journalctl -u p2pflow-worker.service -f
```

The API hostname intentionally returns 404 for `/`; use `/api/...`, `/healthz` or `/ready`.

## 8. Important production items after first login

Before public launch, separately verify:

- real PostgreSQL backup and restore;
- Owner/Admin/Manager/Agent browser E2E sessions;
- authorized Binance API account sync and controlled actions;
- Chrome extension on a logged-in Binance browser session;
- SMTP and public Web Push delivery;
- selected real payment-gateway adapter/webhook;
- load/failover behavior if multiple API/worker instances are added later.

Do not publish production `.env`, setup codes, Binance keys, database passwords or release signing private keys to GitHub.
