#!/bin/bash
set -euo pipefail

REPO=""
VERSION=""
PASS_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO=${2:-}; shift 2 ;;
    --version) VERSION=${2:-}; shift 2 ;;
    --app-domain|--api-domain|--admin-domain|--email)
      PASS_ARGS+=("$1" "${2:-}"); shift 2 ;;
    --no-swap|--force)
      PASS_ARGS+=("$1"); shift ;;
    -h|--help)
      cat <<'USAGE'
Usage:
  sudo ./scripts/install-from-github.sh --repo OWNER/REPO [--version v2.0.8] [installer options]

For a private repository, set GITHUB_TOKEN to a fine-grained read-only token
with Contents: Read permission before running this command.
USAGE
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo/root." >&2
  exit 1
fi
if [[ ! "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "--repo OWNER/REPO is required." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
if ! command -v curl >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl python3
fi

AUTH_FILE=""
cleanup() {
  [ -n "$AUTH_FILE" ] && rm -f "$AUTH_FILE"
  [ -n "${TMP_DIR:-}" ] && rm -rf "$TMP_DIR"
}
trap cleanup EXIT
CURL_AUTH=()
if [ -n "${GITHUB_TOKEN:-}" ]; then
  AUTH_FILE=$(mktemp)
  chmod 0600 "$AUTH_FILE"
  printf 'header = "Authorization: Bearer %s"\nheader = "X-GitHub-Api-Version: 2022-11-28"\n' "$GITHUB_TOKEN" > "$AUTH_FILE"
  CURL_AUTH=(--config "$AUTH_FILE")
fi

api_get() {
  curl -fsSL "${CURL_AUTH[@]}" -H 'Accept: application/vnd.github+json' "$1"
}

if [ -z "$VERSION" ]; then
  SCRIPT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
  if [ -f "$SCRIPT_ROOT/VERSION" ]; then
    VERSION=$(tr -d '[:space:]' < "$SCRIPT_ROOT/VERSION")
  else
    JSON=$(api_get "https://api.github.com/repos/$REPO/releases/latest")
    VERSION=$(printf '%s' "$JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])')
  fi
fi
VERSION=${VERSION#v}
TAG="v$VERSION"
ASSET="P2PFlow_v${VERSION}_linux_amd64.tar.gz"
CHECKSUM="${ASSET}.sha256"

JSON=$(api_get "https://api.github.com/repos/$REPO/releases/tags/$TAG")
ASSET_URL=$(printf '%s' "$JSON" | python3 -c 'import json,sys; n=sys.argv[1]; d=json.load(sys.stdin); print(next((x["url"] for x in d.get("assets",[]) if x.get("name")==n),""))' "$ASSET")
CHECK_URL=$(printf '%s' "$JSON" | python3 -c 'import json,sys; n=sys.argv[1]; d=json.load(sys.stdin); print(next((x["url"] for x in d.get("assets",[]) if x.get("name")==n),""))' "$CHECKSUM")
if [ -z "$ASSET_URL" ] || [ -z "$CHECK_URL" ]; then
  echo "Release $TAG does not contain $ASSET and its checksum." >&2
  echo "Push the tag and wait for the GitHub Actions release workflow to finish." >&2
  exit 1
fi

TMP_DIR=$(mktemp -d)
curl -fL "${CURL_AUTH[@]}" -H 'Accept: application/octet-stream' -H 'X-GitHub-Api-Version: 2022-11-28' -o "$TMP_DIR/$ASSET" "$ASSET_URL"
curl -fL "${CURL_AUTH[@]}" -H 'Accept: application/octet-stream' -H 'X-GitHub-Api-Version: 2022-11-28' -o "$TMP_DIR/$CHECKSUM" "$CHECK_URL"
(
  cd "$TMP_DIR"
  sha256sum -c "$CHECKSUM"
)
tar -xzf "$TMP_DIR/$ASSET" -C "$TMP_DIR"
INSTALLER=$(find "$TMP_DIR" -mindepth 2 -maxdepth 3 -type f -name install.sh -print -quit)
if [ -z "$INSTALLER" ]; then
  echo "Release asset does not contain install.sh." >&2
  exit 1
fi
chmod +x "$INSTALLER"
"$INSTALLER" "${PASS_ARGS[@]}"
