#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const server = read('app-server.js');
const login = read('public/login.js');
const loginHtml = read('public/login.html');
const deviceAuth = read('public/device-auth.js');
const app = read('public/app.js');

function fail(message) { throw new Error(`Trusted-device auth self-test failed: ${message}`); }

if (!server.includes("'/api/login/device/challenge'")) fail('trusted-device challenge route is missing');
if (!server.includes("'/api/login/device'")) fail('trusted-device login route is missing');
if (!server.includes("'/api/login/recover-email'")) fail('email recovery route is missing');
if (!server.includes("'/api/login/device/legacy'") || !server.includes("'/api/login/device/upgrade'")) fail('legacy-session secure upgrade routes are missing');
if (!server.includes('deriveHostingEmailRecoveryCode') || !server.includes('owner-email-recovery-code.js') || !server.includes('HOSTING_EMAIL_RECOVERY_TTL_MS')) fail('mail-outage database-only hosting recovery fallback is missing');
if (!server.includes("X-P2PFlow-Device-Id") && !server.includes("x-p2pflow-device-id")) fail('device-id API binding is missing');
if (!server.includes("'Strict', 'Strict'")) fail('Strict SameSite default is missing');
if (!server.includes('LOGIN_FAILURE_EMAIL_COOLDOWN_MS')) fail('failed-login email cooldown is missing');
if (!server.includes("authLevel: 'trusted_device_secret'")) fail('trusted-device session auth level is missing');
if (!deviceAuth.includes("false,\n      ['sign']")) fail('private key is not imported as non-extractable');
if (!deviceAuth.includes('indexedDB')) fail('device private key is not stored in IndexedDB');
if (!login.includes("/api/login/device/challenge") || !login.includes("/api/login/device")) fail('standalone login client does not use trusted-device flow');
if (!login.includes('/api/login/recover-email')) fail('standalone login client does not expose email recovery');
if (!login.includes('/api/login/device/legacy') || !login.includes('/api/login/device/upgrade')) fail('standalone login client cannot secure a legacy session after update');
if (!login.includes('Hosting Terminal command')) fail('standalone login client does not explain hosting recovery fallback');
if (!loginHtml.includes('/device-auth.js')) fail('login page does not load trusted-device key helper');
if (!app.includes('p2pflowTrustedDeviceId')) fail('application API requests are not bound to trusted-device id');

(async () => {
  const pair = await crypto.webcrypto.subtle.generateKey({ name:'ECDSA', namedCurve:'P-256' }, true, ['sign','verify']);
  const publicJwk = await crypto.webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const payload = Buffer.from('P2PFlow trusted-device self-test', 'utf8');
  const signature = Buffer.from(await crypto.webcrypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' }, pair.privateKey, payload));
  if (signature.length !== 64) fail(`unexpected P-256 WebCrypto signature length ${signature.length}`);
  const key = crypto.createPublicKey({ key: publicJwk, format:'jwk' });
  if (!crypto.verify('sha256', payload, { key, dsaEncoding:'ieee-p1363' }, signature)) fail('server-side P1363 verification is incompatible with WebCrypto ECDSA');
  console.log('Trusted-device auth self-test passed.');
})().catch(error => { console.error(error); process.exit(1); });
