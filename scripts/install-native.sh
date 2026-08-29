#!/bin/bash
set -euo pipefail

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
APP_DOMAIN=""
API_DOMAIN=""
ADMIN_DOMAIN=""
LE_EMAIL=""
FORCE=0
NO_SWAP=0

usage() {
  cat <<'USAGE'
Usage: sudo ./scripts/install-native.sh [options]
  --app-domain DOMAIN     Dashboard domain, for example app.p2pflow.app
  --api-domain DOMAIN     Native/API domain, for example api.p2pflow.app
  --admin-domain DOMAIN   Super Admin domain, for example admin.p2pflow.app
  --email EMAIL           Let's Encrypt contact email
  --no-swap               Do not create a 4 GiB swap file when swap is disabled
  --force                 Replace an existing completed installation (dangerous)
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --app-domain) APP_DOMAIN=${2:-}; shift 2 ;;
    --api-domain) API_DOMAIN=${2:-}; shift 2 ;;
    --admin-domain) ADMIN_DOMAIN=${2:-}; shift 2 ;;
    --email) LE_EMAIL=${2:-}; shift 2 ;;
    --no-swap) NO_SWAP=1; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer as root or with sudo." >&2
  exit 1
fi

if [ "$(uname -s)" != "Linux" ] || [ "$(uname -m)" != "x86_64" ]; then
  echo "This release installer supports Linux x86_64 (amd64)." >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd is required for the native installer." >&2
  exit 1
fi

VERSION=$(tr -d '[:space:]' < "$ROOT_DIR/VERSION")
for f in p2pflow p2pflow-worker p2pflow-migrate p2pflow-updater p2pflow-keygen; do
  if [ ! -x "$ROOT_DIR/bin/$f" ]; then
    echo "Missing prebuilt binary: bin/$f" >&2
    echo "Install from the GitHub Release asset, not directly from the source tree." >&2
    exit 1
  fi
done

prompt_default() {
  local var_name=$1 prompt=$2 default=$3 value
  value=${!var_name:-}
  if [ -z "$value" ]; then
    if [ -t 0 ]; then
      read -r -p "$prompt [$default]: " value
      value=${value:-$default}
    else
      value=$default
    fi
  fi
  printf -v "$var_name" '%s' "$value"
}

prompt_default APP_DOMAIN "Dashboard domain" "app.p2pflow.app"
prompt_default API_DOMAIN "API domain" "api.p2pflow.app"
prompt_default ADMIN_DOMAIN "Super Admin domain" "admin.p2pflow.app"
if [ -z "$LE_EMAIL" ]; then
  if [ -t 0 ]; then
    read -r -p "Let's Encrypt email: " LE_EMAIL
  fi
fi
if [ -z "$LE_EMAIL" ] || [[ "$LE_EMAIL" != *@*.* ]]; then
  echo "A valid --email is required for TLS certificate setup." >&2
  exit 1
fi

for d in "$APP_DOMAIN" "$API_DOMAIN" "$ADMIN_DOMAIN"; do
  if [[ ! "$d" =~ ^[A-Za-z0-9.-]+$ ]] || [[ "$d" != *.* ]]; then
    echo "Invalid domain: $d" >&2
    exit 1
  fi
done

ENV_FILE=/opt/p2pflow/data/p2pflow.env
SETUP_CODE_FILE=/opt/p2pflow/data/P2PFLOW_SETUP_CODE.txt
if [ -f "$ENV_FILE" ] && grep -Eq '^P2PFLOW_SETUP_REQUIRED=("?false"?)$' "$ENV_FILE" && [ "$FORCE" -ne 1 ]; then
  echo "A completed P2PFlow installation already exists at /opt/p2pflow." >&2
  echo "Refusing to overwrite it. Use the update workflow instead." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl openssl nginx postgresql postgresql-contrib nats-server certbot

systemctl enable --now postgresql
if systemctl list-unit-files nats-server.service >/dev/null 2>&1; then
  systemctl disable --now nats-server.service >/dev/null 2>&1 || true
fi

if ! id p2pflow >/dev/null 2>&1; then
  useradd --system --home /opt/p2pflow --shell /usr/sbin/nologin p2pflow
fi
install -d -m 0755 /opt/p2pflow /opt/p2pflow/releases
install -d -m 0750 -o p2pflow -g p2pflow /opt/p2pflow/data /opt/p2pflow/data/uploads /opt/p2pflow/data/system-updates

if [ "$NO_SWAP" -ne 1 ] && [ "$(swapon --show --noheadings | wc -l)" -eq 0 ]; then
  if [ ! -f /swapfile ]; then
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile || true
  if ! grep -q '^/swapfile ' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  cat > /etc/sysctl.d/99-p2pflow.conf <<'SYSCTL'
vm.swappiness=10
SYSCTL
  sysctl -p /etc/sysctl.d/99-p2pflow.conf >/dev/null || true
fi

RELEASE_DIR="/opt/p2pflow/releases/$VERSION"
rm -rf "$RELEASE_DIR.tmp"
mkdir -p "$RELEASE_DIR.tmp"
cp -a "$ROOT_DIR"/. "$RELEASE_DIR.tmp"/
rm -rf "$RELEASE_DIR.tmp/.git" "$RELEASE_DIR.tmp/data"
rm -rf "$RELEASE_DIR"
mv "$RELEASE_DIR.tmp" "$RELEASE_DIR"
ln -sfn "$RELEASE_DIR" /opt/p2pflow/current
chown -R root:root "$RELEASE_DIR"
chmod 0755 "$RELEASE_DIR/bin/"*

DB_NAME=p2pflow
DB_USER=p2pflow
DB_PASS=$(openssl rand -hex 24)
if runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';" >/dev/null
else
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';" >/dev/null
fi
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  runuser -u postgres -- createdb -O "$DB_USER" "$DB_NAME"
fi

APP_SECRET=$(openssl rand -hex 32)
EXTENSION_TOKEN=$(openssl rand -hex 32)
BILLING_SECRET=$(openssl rand -hex 32)
SETUP_CODE=$(openssl rand -hex 32)
VAPID_OUTPUT=$("$RELEASE_DIR/bin/p2pflow-keygen" vapid)
VAPID_PRIVATE=$(printf '%s\n' "$VAPID_OUTPUT" | sed -n 's/^VAPID_PRIVATE_KEY=//p')
VAPID_PUBLIC=$(printf '%s\n' "$VAPID_OUTPUT" | sed -n 's/^VAPID_PUBLIC_KEY=//p')
UPDATE_PRIVATE_FILE="/root/P2PFLOW_RELEASE_SIGNING_PRIVATE_v${VERSION}.key"
UPDATE_OUTPUT=$("$RELEASE_DIR/bin/p2pflow-keygen" release --private-out "$UPDATE_PRIVATE_FILE")
UPDATE_PUBLIC=$(printf '%s\n' "$UPDATE_OUTPUT" | sed -n 's/^P2PFLOW_UPDATE_PUBLIC_KEY=//p')
chmod 0600 "$UPDATE_PRIVATE_FILE"

cat > "$ENV_FILE" <<EOF_ENV
P2PFLOW_VERSION="$VERSION"
P2PFLOW_ENV="production"
P2PFLOW_LISTEN="127.0.0.1:8080"
P2PFLOW_PUBLIC_DIR="/opt/p2pflow/current/web"
P2PFLOW_MIGRATION_DIR="/opt/p2pflow/current/migrations"
P2PFLOW_UPLOAD_DIR="/opt/p2pflow/data/uploads"
P2PFLOW_MAX_UPLOAD_BYTES="10485760"
P2PFLOW_PUBLIC_BASE_URL="https://$APP_DOMAIN"
P2PFLOW_SUPERADMIN_EMAIL=""
P2PFLOW_SETUP_REQUIRED="true"
P2PFLOW_SETUP_CODE_FILE="$SETUP_CODE_FILE"
DB_DRIVER="postgres"
DB_URL="postgres://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME?sslmode=disable"
DB_MAX_OPEN="50"
DB_MAX_IDLE="20"
DB_CONN_MAX_LIFETIME="30m"
APP_SECRET="$APP_SECRET"
COOKIE_SECURE="true"
COOKIE_DOMAIN=""
SESSION_TTL="24h"
P2PFLOW_AUTO_MIGRATE="true"
P2PFLOW_WORKERS="false"
BINANCE_API_BASE_URL="https://api.binance.com"
P2PFLOW_BINANCE_HTTP_CONCURRENCY="12"
P2PFLOW_BINANCE_HTTP_PER_KEY_CONCURRENCY="3"
P2PFLOW_BINANCE_INTERACTIVE_RESERVE="3"
P2PFLOW_BINANCE_ORDER_SYNC_INTERVAL="3s"
P2PFLOW_BINANCE_ADS_SYNC_INTERVAL="30s"
P2PFLOW_BINANCE_SYNC_MAX_PAGES="5"
P2PFLOW_BINANCE_CHAT_RECONNECT_MIN="1s"
P2PFLOW_BINANCE_CHAT_RECONNECT_MAX="30s"
NATS_URL="nats://127.0.0.1:4222"
REDIS_URL=""
P2PFLOW_EXTENSION_TOKEN="$EXTENSION_TOKEN"
P2PFLOW_EXTENSION_POLL_SECONDS="2"
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_FROM=""
SMTP_FROM_NAME="P2PFlow"
BILLING_WEBHOOK_SECRET="$BILLING_SECRET"
BILLING_DEFAULT_PROVIDER="manual"
BILLING_CHECKOUT_URL=""
BILLING_CHECKOUT_API_KEY=""
BILLING_CURRENCY="BDT"
BILLING_GRACE_PERIOD="72h"
BILLING_INVOICE_LEAD="168h"
VAPID_PRIVATE_KEY="$VAPID_PRIVATE"
VAPID_PUBLIC_KEY="$VAPID_PUBLIC"
VAPID_SUBJECT="mailto:$LE_EMAIL"
P2PFLOW_PUSH_TTL="5m"
P2PFLOW_PUSH_DELIVERY_CONCURRENCY="8"
P2PFLOW_UPDATE_RELEASE_DIR="/opt/p2pflow/data/system-updates"
P2PFLOW_UPDATE_PUBLIC_KEY="$UPDATE_PUBLIC"
P2PFLOW_UPDATE_REQUIRE_SIGNATURE="true"
P2PFLOW_UPDATE_MAX_ARTIFACT_BYTES="536870912"
P2PFLOW_UPDATE_APPLY_PROGRAM="/opt/p2pflow/current/bin/p2pflow-updater"
P2PFLOW_UPDATE_CURRENT_LINK="/opt/p2pflow/data/system-updates/current"
EOF_ENV
chown p2pflow:p2pflow "$ENV_FILE"
chmod 0600 "$ENV_FILE"
printf '%s\n' "$SETUP_CODE" > "$SETUP_CODE_FILE"
chown root:p2pflow "$SETUP_CODE_FILE"
chmod 0640 "$SETUP_CODE_FILE"

install -m 0644 "$RELEASE_DIR/deploy/systemd/p2pflow-api.service" /etc/systemd/system/p2pflow-api.service
install -m 0644 "$RELEASE_DIR/deploy/systemd/p2pflow-worker.service" /etc/systemd/system/p2pflow-worker.service
install -m 0644 "$RELEASE_DIR/deploy/systemd/p2pflow-nats.service" /etc/systemd/system/p2pflow-nats.service
systemctl daemon-reload
systemctl enable --now p2pflow-nats.service
systemctl enable p2pflow-api.service p2pflow-worker.service
systemctl restart p2pflow-api.service
systemctl restart p2pflow-worker.service

for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/healthz >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! curl -fsS http://127.0.0.1:8080/healthz >/dev/null 2>&1; then
  journalctl -u p2pflow-api.service -n 80 --no-pager >&2 || true
  echo "P2PFlow API did not start. See the log above." >&2
  exit 1
fi

cat > /etc/nginx/sites-available/p2pflow <<EOF_NGINX
server {
    listen 80;
    server_name $APP_DOMAIN $API_DOMAIN $ADMIN_DOMAIN;
    root /var/www/html;
    location /.well-known/acme-challenge/ { try_files \$uri =404; }
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF_NGINX
rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/p2pflow /etc/nginx/sites-enabled/p2pflow
nginx -t
systemctl enable --now nginx
systemctl reload nginx

for d in "$APP_DOMAIN" "$API_DOMAIN" "$ADMIN_DOMAIN"; do
  if ! getent ahostsv4 "$d" >/dev/null 2>&1; then
    echo "DNS warning: $d does not resolve yet." >&2
  fi
done

if ! certbot certonly --webroot -w /var/www/html --non-interactive --agree-tos --email "$LE_EMAIL" --cert-name "$APP_DOMAIN" -d "$APP_DOMAIN" -d "$API_DOMAIN" -d "$ADMIN_DOMAIN"; then
  echo >&2
  echo "TLS certificate could not be issued." >&2
  echo "Point all three DNS A records to this VPS, wait for DNS propagation, then run the installer again." >&2
  echo "Do not enter the Super Admin password over plain HTTP." >&2
  exit 1
fi

cat > /etc/nginx/sites-available/p2pflow <<EOF_NGINX
upstream p2pflow_backend {
    keepalive 64;
    server 127.0.0.1:8080;
}

server {
    listen 80;
    server_name $APP_DOMAIN $API_DOMAIN $ADMIN_DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $APP_DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$APP_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$APP_DOMAIN/privkey.pem;
    client_max_body_size 12m;
    location = /api/events {
        proxy_pass http://p2pflow_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }
    location / {
        proxy_pass http://p2pflow_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
    }
}

server {
    listen 443 ssl http2;
    server_name $ADMIN_DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$APP_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$APP_DOMAIN/privkey.pem;
    client_max_body_size 12m;
    location = /api/events {
        proxy_pass http://p2pflow_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }
    location / {
        proxy_pass http://p2pflow_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
    }
}

server {
    listen 443 ssl http2;
    server_name $API_DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$APP_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$APP_DOMAIN/privkey.pem;
    client_max_body_size 12m;
    location = /healthz {
        proxy_pass http://p2pflow_backend;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location = /ready {
        proxy_pass http://p2pflow_backend;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location = /api/events {
        proxy_pass http://p2pflow_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }
    location ^~ /api/ {
        proxy_pass http://p2pflow_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
    }
    location / { return 404; }
}
EOF_NGINX
nginx -t
systemctl reload nginx

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  ufw allow OpenSSH >/dev/null || true
  ufw allow 'Nginx Full' >/dev/null || true
fi

cat <<EOF_DONE

P2PFlow v$VERSION bootstrap installation is ready.

Dashboard setup URL:
  https://$APP_DOMAIN/setup

Setup code:
  $SETUP_CODE

The same code is stored at:
  $SETUP_CODE_FILE

Runtime layout:
  Website/API:  p2pflow-api.service
  Worker:       p2pflow-worker.service
  Database:     PostgreSQL (local)
  Event bus:    p2pflow-nats.service (127.0.0.1 only)
  Dashboard:    https://$APP_DOMAIN
  API:          https://$API_DOMAIN/api/...
  Super Admin:  https://$ADMIN_DOMAIN

Release-signing private key (root-only, move this to an offline backup after setup):
  $UPDATE_PRIVATE_FILE

Open the HTTPS setup URL, test the prepared database, create the Super Admin, and finish setup.
EOF_DONE
