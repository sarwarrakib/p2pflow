import fs from 'node:fs';

const need = (path, token) => {
  const text = fs.readFileSync(path, 'utf8');
  if (!text.includes(token)) throw new Error(`${path}: missing ${token}`);
};

need('internal/httpapi/setup_v208.go', 'P2PFLOW_SETUP_REQUIRED');
need('internal/httpapi/setup_v208.go', 'setup_code_invalid');
need('internal/httpapi/setup_v208.go', 'database_not_empty');
need('internal/httpapi/setup_v208.go', 'os.Exit(0)');
need('deploy/systemd/p2pflow-api.service', 'Environment=P2PFLOW_WORKERS=false');
need('deploy/systemd/p2pflow-worker.service', 'Environment=P2PFLOW_WORKERS=true');
need('deploy/systemd/p2pflow-nats.service', '127.0.0.1');
need('scripts/install-native.sh', 'P2PFLOW_SETUP_CODE.txt');
need('scripts/install-native.sh', 'certbot certonly');
need('scripts/install-from-github.sh', 'releases/tags');
need('.github/workflows/release.yml', 'linux_amd64.tar.gz');
for (const family of ['postgres','mysql','mariadb']) {
  need(`migrations/${family}/018_installer_browser_setup_hardening.sql`, "current_version='2.0.8'");
}
console.log('Installer/browser-setup/GitHub release contract audit passed (v2.0.8).');
