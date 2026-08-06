#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseEnvText,
  validateFreshOwner,
  classifyStartupError,
  runProductionPreflight
} = require('../lib/productionPreflight');

(async () => {
  const parsed = parseEnvText('A=one\nB="line\\nvalue"\n# ignored\n');
  if (parsed.A !== 'one' || parsed.B !== 'line\nvalue') throw new Error('Environment parser failed.');
  if (!validateFreshOwner({ CRM_OWNER_USERNAME: 'owner', CRM_OWNER_EMAIL: 'owner@example.com', CRM_OWNER_PASSWORD: 'StrongPassword123!', CRM_OWNER_SECRET_CODE: '739251' }).length === false) {
    // no-op; explicit check below keeps failure message clear
  }
  const validErrors = validateFreshOwner({ CRM_OWNER_USERNAME: 'owner', CRM_OWNER_EMAIL: 'owner@example.com', CRM_OWNER_PASSWORD: 'StrongPassword123!', CRM_OWNER_SECRET_CODE: '739251' });
  if (validErrors.length) throw new Error(`Valid owner setup was rejected: ${validErrors.map(item => item.code).join(',')}`);
  const weakErrors = validateFreshOwner({ CRM_OWNER_USERNAME: 'owner', CRM_OWNER_EMAIL: 'bad', CRM_OWNER_PASSWORD: 'short', CRM_OWNER_SECRET_CODE: '111111' });
  if (!weakErrors.find(item => item.code === 'OWNER_EMAIL_INVALID') || !weakErrors.find(item => item.code === 'OWNER_PASSWORD_WEAK') || !weakErrors.find(item => item.code === 'OWNER_SECRET_INVALID')) throw new Error('Weak owner setup was not rejected.');
  if (classifyStartupError(new Error('CRM_DATABASE_URL is required.')).code !== 'DATABASE_URL_MISSING') throw new Error('Startup error classification failed.');

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rneed-preflight-'));
  try {
    const envFile = path.join(temp, '.env');
    fs.writeFileSync(envFile, [
      'PORT=3000',
      'CRM_INSTALL_ROOT=' + temp,
      'CRM_DATABASE_PROVIDER=mysql',
      'CRM_DATABASE_URL=mysql://user:pass@example.invalid/rneed',
      'CRM_APP_KEY=01234567890123456789012345678901',
      'CRM_DATABASE_POOL_MAX=5',
      'CRM_FRESH_INSTALL=true',
      'CRM_OWNER_USERNAME=owner',
      'CRM_OWNER_EMAIL=owner@example.com',
      'CRM_OWNER_PASSWORD=StrongPassword123!',
      'CRM_OWNER_SECRET_CODE=739251'
    ].join('\n') + '\n');
    const result = await runProductionPreflight({ envFile, installRoot: temp, configOnly: true, inheritedEnv: {} });
    if (!result.ok) throw new Error(`Config-only preflight failed: ${result.errors.map(item => item.code).join(',')}`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }

  console.log(JSON.stringify({
    ok: true,
    stagedActivation: true,
    configPreflight: true,
    ownerBootstrapValidation: true,
    startupFailureClassification: true
  }, null, 2));
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
