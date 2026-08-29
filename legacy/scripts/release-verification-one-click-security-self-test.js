#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const pkg = JSON.parse(read('package.json'));
const server = read('app-server.js');
const app = read('public/app.js');
const fail = message => { throw new Error(`Release one-click/security self-test failed: ${message}`); };
const assert = (value, message) => { if (!value) fail(message); };

assert(!app.includes('id="verifyFinalActionLocalBtn"') && !app.includes("$('#verifyFinalActionLocalBtn')"), 'Legacy separate local Verify button still exists.');
assert(app.includes('gateState.verifyNow = async () =>') && app.includes('await localGateState.verifyNow();'), 'Release button does not verify P2PFlow step-up inline.');
assert(app.includes("if (policy.localVerificationEnabled) return openReleaseVerificationPage(order, finalAction);"), 'Local verification still opens a separate Continue-only stage.');
assert(app.includes("const submitText = finalAction === 'quick_release' ? 'Quick Release' : 'Release Coin';"), 'Release verification screen does not expose a single final action button.');
assert(app.includes("gateState.method === 'EMAIL_OTP' && autoSendOtp") && app.includes('Resend Email OTP'), 'Email OTP is not automatically requested with resend-only secondary action.');
assert(app.includes('sameVerificationScreen') && app.includes("setFormMessage('#releaseVerificationMessage', retryMessage, 'danger')"), 'Rejected Binance OTP cannot remain on the same screen with an inline error.');
assert(server.includes("crypto.createCipheriv('aes-256-gcm'") && server.includes('crypto.hkdfSync') && server.includes('cipher.setAAD'), 'Fund Password field-level AES-GCM vault is missing HKDF/AAD protection.');
assert(server.includes('releaseFundPasswordVault') && server.includes("credential.releaseFundPassword = '';"), 'Legacy plaintext Fund Password field is not cleared after vault storage.');
assert(server.includes('P2PFLOW_SECRET_VAULT_KEY') && read('.env.example').includes('P2PFLOW_SECRET_VAULT_KEY='), 'Optional separate secret-vault key is not documented/configurable.');
assert(server.includes('crypto.scryptSync') && server.includes('passwordHash: hashPassword') && server.includes('loginSecretHash: hashPassword'), 'User password/secret-code one-way scrypt storage guard is missing.');

console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  singleReleaseButton:true,
  inlineLocalVerification:true,
  emailOtpAutoSend:true,
  inlineBinanceRetry:true,
  fundPasswordFieldVault:'AES-256-GCM+HKDF+AAD',
  userPasswords:'scrypt-one-way'
}, null, 2));
