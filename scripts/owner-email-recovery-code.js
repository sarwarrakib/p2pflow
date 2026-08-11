#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseEnvFile(file) {
  const out = {};
  if (!file || !fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[match[1]] = value;
  }
  return out;
}

function recoveryCode(appKey, recoveryId) {
  const digest = crypto.createHmac('sha256', appKey).update(`p2pflow-owner-email-recovery\n${recoveryId}`).digest('hex').toUpperCase();
  return `${digest.slice(0, 4)}-${digest.slice(4, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}`;
}

const recoveryId = String(process.argv[2] || '').trim();
if (!/^[A-Za-z0-9_-]{16,160}$/.test(recoveryId)) {
  console.error('Usage: node scripts/owner-email-recovery-code.js <recoveryId>');
  process.exit(2);
}
const root = path.resolve(__dirname, '..');
const envFile = path.resolve(process.env.P2PFLOW_ENV_FILE || process.env.CRM_ENV_FILE || path.join(root, '.env'));
const fileEnv = parseEnvFile(envFile);
const appKey = String(process.env.P2PFLOW_APP_KEY || process.env.CRM_APP_KEY || fileEnv.P2PFLOW_APP_KEY || fileEnv.CRM_APP_KEY || '');
if (appKey.length < 32) {
  console.error(`A valid P2PFLOW_APP_KEY/CRM_APP_KEY was not found in the environment or ${envFile}.`);
  process.exit(3);
}
console.log(recoveryCode(appKey, recoveryId));
