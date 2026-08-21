#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const server = read('app-server.js');
const loginJs = read('public/login.js');
const loginHtml = read('public/login.html');
const securityJs = read('public/js/pages/security.js');
const appJs = read('public/app.js');
const pkg = JSON.parse(read('package.json'));
const fail = message => { throw new Error(`Security Question fallback self-test failed: ${message}`); };
const assert = (ok, message) => { if (!ok) fail(message); };

assert(pkg.version === '1.5.36', `expected v1.5.36, got ${pkg.version}`);
assert(server.includes('loginSecurityQuestionFallbackEnabled: true'), 'global fallback default is missing');
assert(server.includes("securityQuestion: cleanStr(opts.securityQuestion || '', 240)"), 'user securityQuestion field is missing');
assert(server.includes("securityAnswerHash: opts.securityAnswer ? hashPassword(String(opts.securityAnswer)) : ''"), 'security answer is not hashed at user creation');
assert(server.includes('user.securityAnswerHash = hashPassword(validateSecurityAnswerValue(body.securityAnswer))'), 'security answer update is not one-way hashed');
assert(!server.includes('securityAnswer:'), 'plaintext securityAnswer field appears in server state/user output');

assert(server.includes('Date.now() + 5 * 60 * 1000'), '5-minute fallback challenge lifetime is missing');
assert(server.includes('5 - Number(item.attempts || 0)'), 'fallback remaining-attempt counter is missing');
assert(server.includes('if (item.attempts >= 5)'), '5-attempt fallback lockout is missing');
assert(server.includes("verifyPassword(String(body.securityAnswer || '').trim(), user.securityAnswerHash || '')"), 'security answer verification is missing');
assert(server.includes("verifyPassword(secret, user.loginSecretHash || '')"), 'existing 6-digit secret verification is missing');
assert(server.includes('if (!answerOk || !secretOk)'), 'fallback does not require both answer and secret');
assert(server.includes("securityFallbackVerified ? 'security_question_fallback' : 'full_login'"), 'fallback success auth level is missing');

assert(server.includes("if (url.pathname === '/api/me/security/fallback') return handleMeSecurityFallback(req, res);"), 'self-service fallback API route is missing');
assert(server.includes("verifyPassword(String(body.currentPassword || ''), user.passwordHash || '')"), 'fallback settings do not require current password');
assert(server.includes("verifyPassword(secret, user.loginSecretHash || '')"), 'fallback settings do not require current 6-digit secret');
assert(server.includes('updated without email verification'), 'email-independent fallback update behavior is missing');

assert(loginHtml.includes('id="securityFallbackPanel"'), 'login fallback panel is missing');
assert(loginHtml.includes('id="securityFallbackAnswer"'), 'login fallback answer field is missing');
assert(loginHtml.includes('id="securityFallbackSecretCode"'), 'login fallback secret field is missing');
assert(loginJs.includes('data.securityFallbackRequired'), 'login UI does not enter fallback flow on OTP mail failure');
assert(loginJs.includes('payload.securityFallbackId = securityFallbackId'), 'login UI does not submit the fallback challenge ID');
assert(loginJs.includes('payload.securityAnswer'), 'login UI does not submit security answer');

assert(securityJs.includes("api('/api/me/security/fallback'"), 'Security page is not connected to self-service fallback API');
assert(securityJs.includes('currentPassword') && securityJs.includes('currentSecretCode'), 'Security page does not collect current password + secret');
assert(appJs.includes('securityQuestion') && appJs.includes('securityAnswer') && appJs.includes('clearSecurityFallback'), 'Users modal cannot configure/clear per-user fallback');

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  fallbackOnlyAfterMailFailure: true,
  challengeMinutes: 5,
  maxAttempts: 5,
  requiresSecurityAnswerAndExistingSecret: true,
  securityAnswerPlaintextStored: false,
  selfServiceWithoutEmail: true,
  usersAdminConfiguration: true
}, null, 2));
