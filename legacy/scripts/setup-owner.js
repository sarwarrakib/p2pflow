#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { parseEnvText, secureOwnerSecretCode } = require('../lib/productionPreflight');

const args = process.argv.slice(2);
function value(name) {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || '') : '';
}

const installRoot = path.resolve(value('--root') || process.env.CRM_INSTALL_ROOT || '/opt/p2pflow');
const envFile = path.resolve(value('--env') || process.env.CRM_ENV_FILE || path.join(installRoot, 'shared', '.env'));

function question(rl, prompt, defaultValue = '') {
  return new Promise(resolve => rl.question(`${prompt}${defaultValue ? ` [${defaultValue}]` : ''}: `, answer => resolve(String(answer || '').trim() || defaultValue)));
}

function hiddenQuestion(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = '';
    stdout.write(`${prompt}: `);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = char => {
      if (char === '\u0003') {
        cleanup();
        stdout.write('\n');
        reject(new Error('Cancelled.'));
        return;
      }
      if (char === '\r' || char === '\n') {
        cleanup();
        stdout.write('\n');
        resolve(value);
        return;
      }
      if (char === '\u007f' || char === '\b') {
        value = value.slice(0, -1);
        return;
      }
      if (/^[\x20-\x7E]$/.test(char)) value += char;
    };
    function cleanup() {
      stdin.removeListener('data', onData);
      try { stdin.setRawMode(false); } catch {}
      stdin.pause();
    }
    stdin.on('data', onData);
  });
}


function quoteEnvValue(value) {
  const escaped = String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}

function updateEnvText(text, values) {
  const lines = String(text || '').split(/\r?\n/);
  const seen = new Set();
  const output = lines.map(line => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || !Object.prototype.hasOwnProperty.call(values, match[1])) return line;
    seen.add(match[1]);
    return `${match[1]}=${values[match[1]]}`;
  });
  for (const [key, val] of Object.entries(values)) {
    if (!seen.has(key)) output.push(`${key}=${val}`);
  }
  return `${output.join('\n').replace(/\n+$/, '')}\n`;
}

(async () => {
  if (!fs.existsSync(envFile)) throw new Error(`Environment file does not exist: ${envFile}`);
  const existingText = fs.readFileSync(envFile, 'utf8');
  const existing = parseEnvText(existingText);
  const envInput = {
    username: process.env.CRM_SETUP_OWNER_USERNAME || value('--username'),
    email: process.env.CRM_SETUP_OWNER_EMAIL || value('--email'),
    password: process.env.CRM_SETUP_OWNER_PASSWORD || '',
    secretCode: process.env.CRM_SETUP_OWNER_SECRET_CODE || ''
  };

  let username = envInput.username;
  let email = envInput.email;
  let password = envInput.password;
  let secretCode = envInput.secretCode;

  if (process.stdin.isTTY && process.stdout.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    username = username || await question(rl, 'Owner username', existing.CRM_OWNER_USERNAME || 'owner');
    email = email || await question(rl, 'Owner email', existing.CRM_OWNER_EMAIL || '');
    rl.close();
    password = password || await hiddenQuestion('Owner password (minimum 12 characters)');
    const passwordConfirm = await hiddenQuestion('Confirm owner password');
    if (password !== passwordConfirm) throw new Error('Owner password confirmation does not match.');
    secretCode = secretCode || await hiddenQuestion('Owner 6-digit secret code');
  }

  username = String(username || '').trim();
  email = String(email || '').trim();
  password = String(password || '');
  secretCode = String(secretCode || '');

  if (!username) throw new Error('Owner username is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid owner email is required.');
  if (password.length < 12) throw new Error('Owner password must contain at least 12 characters.');
  if (!secureOwnerSecretCode(secretCode)) throw new Error('Owner secret code must be a non-repeating, non-sequential 6 digit value.');

  const next = updateEnvText(existingText, {
    CRM_OWNER_USERNAME: username,
    CRM_OWNER_EMAIL: email,
    CRM_OWNER_PASSWORD: quoteEnvValue(password),
    CRM_OWNER_SECRET_CODE: secretCode
  });
  const temporary = `${envFile}.next-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, next, { mode: 0o600 });
  fs.renameSync(temporary, envFile);
  try { fs.chmodSync(envFile, 0o600); } catch {}

  console.log(`Owner bootstrap values were saved to ${envFile}.`);
  console.log('The owner account is created only on the first successful startup of an empty configured application database.');
  console.log('An existing/imported database keeps its current owner account and is not overwritten.');
  console.log('After the first successful login, blank CRM_OWNER_PASSWORD and CRM_OWNER_SECRET_CODE in the env file; the database keeps their secure hashes.');
})().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
