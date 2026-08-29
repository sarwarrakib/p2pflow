#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const server = read('app-server.js');
const app = read('public/app.js');
const profile = read('public/js/pages/p2p-profile.js');
const security = read('public/js/pages/security.js');
const binance = read('lib/binanceAdapter.js');
const updater = read('lib/updateManager.js');
const preflight = read('lib/productionPreflight.js');
const setup = read('lib/hostingSetup.js');
const nginx = read('deploy/nginx-p2pflow.conf.example');
const service = read('deploy/p2pflow.service.example');
const publicFiles = ['public/index.html','public/login.html','public/setup.html','public/app.js', ...fs.readdirSync(path.join(root, 'public/js/pages')).filter(name => name.endsWith('.js')).map(name => `public/js/pages/${name}`)].map(read).join('\n');
const fail = message => { throw new Error(`Production hardening self-test failed: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

assert((server.match(/function broadcast\s*\(/g) || []).length === 1, 'broadcast implementation is duplicated');
assert(server.includes("return sendJson(res, 421, { error: 'Misdirected request'"), 'Host-header rejection is missing');
assert(server.includes('trustedForwardedHeader') && server.includes('P2PFLOW_ALLOWED_HOSTS'), 'trusted proxy/allowed host boundary is missing');
assert(server.includes('const publicMessage = status >= 500'), 'generic production 5xx response is missing');
assert(server.includes('requestId'), 'request correlation ID is missing');
assert(server.includes('path.relative(PUBLIC_DIR'), 'static-file containment check is missing');
assert(server.includes('realtimeEventForUser') && server.includes('sid: authenticated.sid') && server.includes('userId: user.id'), 'SSE user/session authorization is missing');
assert(server.includes('MAX_SSE_CONNECTIONS_PER_USER'), 'SSE connection limit is missing');
assert(server.includes('MIN_LOGIN_PASSWORD_LENGTH = 12'), '12-character login password policy is missing');
assert(server.includes('Security question must be at least 8 characters'), 'security-question minimum is missing');
assert(server.includes('Security answer must be between 8 and 200 characters'), 'security-answer minimum is missing');
assert(server.includes('Confirm security revert') && server.includes('if (req.method === \'GET\')'), 'email security-revert links still mutate state on GET');
assert(server.includes('normalizePhpMailBridgeUrl') && server.includes('refused a cross-origin redirect'), 'PHP mail bridge URL/redirect controls are missing');
assert(server.includes("redirect: 'error'"), 'outbound pre-signed upload redirect blocking is missing');
assert(server.includes('assertPublicOutboundUrl'), 'outbound public-network validation is missing');
assert(app.includes('function safeWebUrl') && app.includes('function safeBinanceUrl'), 'frontend URL allowlisting is missing');
assert(profile.includes('safeBinanceUrl(p2pResult.paymentMethodManageUrl') && profile.includes('safeBinanceUrl(p2pResult.advertiserUrl'), 'P2P profile external URLs are not constrained');
assert(security.includes('minlength="12"') && app.includes('minlength="12"'), 'password policy is not reflected in both security forms');
assert(!/\son(?:click|error)\s*=/i.test(publicFiles), 'inline click/error handler remains in active public assets');
assert(!/javascript\s*:/i.test(publicFiles), 'javascript: URL remains in active public assets');
assert(binance.includes('normalizeBinanceApiBaseUrl') && binance.includes("redirect: 'error'"), 'Binance base URL/redirect hardening is missing');
assert(updater.includes('validateGithubRequestUrl') && updater.includes("redirect: 'manual'") && updater.includes('delete headers.Authorization'), 'GitHub redirect/token hardening is missing');
assert(preflight.includes('TRUST_PROXY_UNSAFE') && preflight.includes('ALLOWED_HOSTS_MISMATCH'), 'production preflight host/proxy checks are missing');
assert(setup.includes("P2PFLOW_PRODUCTION_STRICT: 'true'"), 'secure setup environment generation is missing');
assert(/ssl_protocols\s+TLSv1\.2\s+TLSv1\.3/.test(nginx) && nginx.includes('proxy_buffering off'), 'TLS/SSE nginx hardening is missing');
assert(service.includes('UMask=0077') && service.includes('NoNewPrivileges=true'), 'systemd hardening is missing');
assert(service.includes('ExecStart=/usr/bin/node /opt/p2pflow/server.js') && !service.includes('/launcher.js'), 'systemd service does not use the shipped server.js entrypoint');
assert(!service.includes('MemoryDenyWriteExecute=true'), 'systemd service enables a JIT-incompatible memory policy');
assert(server.includes('AsyncLocalStorage') && server.includes('advertisementMerchantRuntime') && server.includes('advertisementMerchantControlsView'), 'per-account merchant runtime isolation is missing');
assert(server.includes('const allowMutationProbe = options?.allowMutationProbe === true') && server.includes('if (needsExactModeProbe && allowMutationProbe)'), 'read-only advertisement status checks can still trigger a Binance mutation probe');

console.log(JSON.stringify({
  ok: true,
  hostAndProxyBoundary: true,
  authenticatedRealtime: true,
  frontendUrlSafety: true,
  outboundRedirectSafety: true,
  passwordPolicy: 12,
  accountScopedMerchantState: true,
  readOnlyAdsStatusIsMutationFree: true,
  deploymentHardening: true
}, null, 2));
