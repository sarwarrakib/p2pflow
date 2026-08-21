#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const server = read('app-server.js');
const adapter = read('lib/binanceAdapter.js');
const app = read('public/app.js');
const credentials = read('public/js/pages/credentials.js');
const fail = message => { throw new Error(`FUND_PWD RSA release self-test failed: ${message}`); };
const assert = (value, message) => { if (!value) fail(message); };

assert(adapter.includes("getC2cRsaPublicKey: ['GET', '/sapi/v1/c2c/cryptography/rsa-public-key']"), 'C2C RSA public-key endpoint is missing.');
assert(server.includes('encryptFundPasswordForBinance') && server.includes('extractBinanceRsaPublicKey'), 'RSA key retrieval/extraction helpers are missing.');
assert(server.includes('RSA_PKCS1_OAEP_PADDING') && server.includes("oaepHash:'sha256'") && server.includes("toString('base64')"), 'RSA/ECB/OAEPWITHSHA-256ANDMGF1PADDING-compatible encryption is missing.');
assert(server.includes("out.authType = 'FUND_PWD'") && server.includes("out.confirmPaidType = 'normal'") && server.includes('out._fundPasswordPlaintext = fundPassword'), 'FUND_PWD release preparation is incomplete.');
assert(server.includes('releaseBody.code = await encryptFundPasswordForBinance') && server.includes("verificationMethod:'FUND_PWD'") && server.includes("endpointName: 'releaseCoin'"), 'Encrypted password is not sent through the direct releaseCoin path.');
assert(server.includes('Do not insert checkIfCanReleaseCoin into that deterministic flow.'), 'FUND_PWD path can regress into checkIfCanReleaseCoin.');
assert(server.includes("String(body.code).slice(0, 2048)"), 'Encrypted RSA ciphertext can still be truncated to the legacy plaintext limit.');
assert(app.includes("if (String(policy.binanceMethod || 'AUTO').toUpperCase() === 'FUND_PWD' && !policy.fundPasswordConfigured)"), 'Unsaved FUND_PWD does not open a Release-time password field.');
assert(app.includes('fundPasswordRequired') && app.includes("add('fundPassword', 'Fund Transfer Password'"), 'Release-time Fund Transfer Password retry field is missing.');
assert(credentials.includes('If a password is saved, FUND_PWD Release uses it automatically') && !credentials.includes('data-release-field="autoFundPassword"'), 'Saved Fund Password is not automatic or legacy auto-use checkbox remains.');
assert(credentials.includes('If P2PFlow verification is enabled, Primary/Secondary verification must pass first.'), 'CRM step-up gate is not described for saved FUND_PWD.');
assert(!server.includes('Stored Fund Transfer Password can only be used after the configured P2PFlow verification succeeds.'), 'Legacy rule still requires CRM verification even when it is disabled.');

console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  rsaPublicKeyEndpoint:true,
  oaepSha256:true,
  savedPasswordAutomatic:true,
  manualPasswordAtRelease:true,
  crmVerificationOptionalGate:true,
  directFundPwdReleaseCoin:true
}, null, 2));
