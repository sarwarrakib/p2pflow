#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseEnvText,
  validateFreshOwner,
  classifyStartupError,
  runProductionPreflight,
  hostToken,
  hasSecretVariety
} = require('../lib/productionPreflight');

(async () => {
  const parsed = parseEnvText('A=one\nB="line\\nvalue"\n# ignored\n');
  if (parsed.A !== 'one' || parsed.B !== 'line\nvalue') throw new Error('Environment parser failed.');
  if (hostToken('Panel.Example.com:443') !== 'panel.example.com:443') throw new Error('Allowed-host normalization failed.');
  if (!hasSecretVariety('R4nd0m-Application-Key-For-Test-739251!')) throw new Error('High-variety application key was rejected.');
  if (hasSecretVariety('x'.repeat(48))) throw new Error('Low-variety application key was accepted.');

  const validErrors = validateFreshOwner({ CRM_OWNER_USERNAME: 'owner', CRM_OWNER_EMAIL: 'owner@example.com', CRM_OWNER_PASSWORD: 'StrongPassword123!', CRM_OWNER_SECRET_CODE: '739251' });
  if (validErrors.length) throw new Error(`Valid owner setup was rejected: ${validErrors.map(item => item.code).join(',')}`);
  const weakErrors = validateFreshOwner({ CRM_OWNER_USERNAME: 'owner', CRM_OWNER_EMAIL: 'bad', CRM_OWNER_PASSWORD: 'short', CRM_OWNER_SECRET_CODE: '111111' });
  if (!weakErrors.find(item => item.code === 'OWNER_EMAIL_INVALID') || !weakErrors.find(item => item.code === 'OWNER_PASSWORD_WEAK') || !weakErrors.find(item => item.code === 'OWNER_SECRET_INVALID')) throw new Error('Weak owner setup was not rejected.');
  if (classifyStartupError(new Error('CRM_DATABASE_URL is required.')).code !== 'DATABASE_URL_MISSING') throw new Error('Startup error classification failed.');

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2pflow-preflight-'));
  try {
    const envFile = path.join(temp, '.env');
    const validEnvironment = [
      'NODE_ENV=production',
      'PORT=3000',
      'P2PFLOW_INSTALL_ROOT=' + temp,
      'P2PFLOW_DATABASE_PROVIDER=mysql',
      'P2PFLOW_DATABASE_URL=mysql://user:pass@127.0.0.1/p2pflow',
      'P2PFLOW_DATABASE_POOL_MAX=5',
      'P2PFLOW_DATABASE_SSL=false',
      'P2PFLOW_APP_KEY=R4nd0m-Application-Key-For-Test-739251!',
      'P2PFLOW_FRESH_INSTALL=true',
      'P2PFLOW_OWNER_USERNAME=owner',
      'P2PFLOW_OWNER_EMAIL=owner@example.com',
      'P2PFLOW_OWNER_PASSWORD=StrongPassword123!',
      'P2PFLOW_OWNER_SECRET_CODE=739251',
      'P2PFLOW_PUBLIC_BASE_URL=https://panel.example.com',
      'P2PFLOW_ALLOWED_HOSTS=panel.example.com',
      'P2PFLOW_TRUST_PROXY=loopback',
      'P2PFLOW_PRODUCTION_STRICT=true',
      'P2PFLOW_PUBLIC_HEALTH_DETAILS=false',
      'P2PFLOW_SESSION_COOKIE_SAMESITE=Strict',
      'P2PFLOW_MAX_SSE_CONNECTIONS_PER_USER=5',
      'P2PFLOW_LOGIN_MAX_ATTEMPTS=12',
      'P2PFLOW_MAIL_DRIVER=local',
      'P2PFLOW_MAIL_FROM=no-reply@example.com'
    ];
    fs.writeFileSync(envFile, validEnvironment.join('\n') + '\n', { mode: 0o600 });
    fs.chmodSync(envFile, 0o600);
    const result = await runProductionPreflight({ envFile, installRoot: temp, configOnly: true, inheritedEnv: {} });
    if (!result.ok) throw new Error(`Config-only preflight failed: ${result.errors.map(item => item.code).join(',')}`);
    if (result.info.security.publicOrigin !== 'https://panel.example.com' || result.info.security.productionStrict !== true) throw new Error('Security preflight details are incomplete.');

    fs.writeFileSync(envFile, validEnvironment.map(line => line.startsWith('P2PFLOW_ALLOWED_HOSTS=') ? 'P2PFLOW_ALLOWED_HOSTS=other.example.com' : line).join('\n') + '\n', { mode: 0o600 });
    fs.chmodSync(envFile, 0o600);
    const mismatch = await runProductionPreflight({ envFile, installRoot: temp, configOnly: true, inheritedEnv: {} });
    if (mismatch.ok || !mismatch.errors.some(item => item.code === 'ALLOWED_HOSTS_MISMATCH')) throw new Error('Allowed-host mismatch was not blocked.');

    fs.writeFileSync(envFile, validEnvironment.map(line => line.startsWith('P2PFLOW_TRUST_PROXY=') ? 'P2PFLOW_TRUST_PROXY=all' : line).join('\n') + '\n', { mode: 0o600 });
    fs.chmodSync(envFile, 0o600);
    const unsafeProxy = await runProductionPreflight({ envFile, installRoot: temp, configOnly: true, inheritedEnv: {} });
    if (unsafeProxy.ok || !unsafeProxy.errors.some(item => item.code === 'TRUST_PROXY_UNSAFE')) throw new Error('Unsafe trust-proxy configuration was not blocked.');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }

  console.log(JSON.stringify({
    ok: true,
    stagedActivation: true,
    configPreflight: true,
    productionStrict: true,
    allowedHosts: true,
    trustedProxyBoundary: true,
    ownerBootstrapValidation: true,
    startupFailureClassification: true
  }, null, 2));
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
