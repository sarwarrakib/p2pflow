#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const server = read('app-server.js');
const phpRoot = read('local-php-mail.php');
const phpPublic = read('public/local-php-mail.php');
const settings = read('public/js/pages/settings.js');
const login = read('public/login.js');
const fail = message => { throw new Error(`Mail delivery self-test failed: ${message}`); };

if (phpRoot !== phpPublic) fail('root and public PHP mail bridges are not identical');
if (!server.includes("update('php-mail-bridge:v1')")) fail('Node bridge secret derivation is missing');
if (!phpPublic.includes("hash_hmac('sha256', 'php-mail-bridge:v1', $appKey)")) fail('PHP bridge does not derive the same APP_KEY signing secret as Node');
if (!server.includes('P2PFLOW_PHP_MAIL_SECRET || process.env.CRM_PHP_MAIL_SECRET')) fail('P2PFLOW_PHP_MAIL_SECRET alias is not supported');
if (!server.includes('SMTP configuration incomplete. Missing:')) fail('direct SMTP diagnostic endpoint is missing');
if (!server.includes('configuration incomplete (missing:')) fail('local SMTP fallback does not report incomplete configuration');
if (!server.includes('local-mail.quota')) fail('local mail quota health state is missing');
if (!server.includes('localMailQuotaBlockedUntil')) fail('local mail quota circuit breaker is missing');
if (!server.includes("requestedDriver === 'smtp'")) fail('direct SMTP test route is missing');

const appKey = 'mail-self-test-app-key-1234567890';
const expected = crypto.createHmac('sha256', appKey).update('php-mail-bridge:v1').digest('hex');
if (!/^[a-f0-9]{64}$/.test(expected)) fail('derived bridge key is invalid');

if (!/return sendTrackedMail\(to, subject, body, \{ type: 'login_otp', userId: user\.id \}\)/.test(server)) fail('login OTP is not using tracked mail delivery');
if (!server.includes('otpRecipient: maskEmail(user.email)') || !server.includes('otpDriver: pending?.delivery?.driver')) fail('login OTP response is missing delivery diagnostics');
if (!server.includes('dispatchNotificationEmail(item);')) fail('notification-center events are not connected to email delivery');
if (!server.includes("item.type === 'mail_failed'")) fail('mail failure recursion guard is missing');
if (!server.includes('sendNotificationEmail: true')) fail('notification email default is missing');

for (const field of ['sendNotificationEmail','sendOrderEmail','sendSecurityChangeEmail','sendLoginFailureEmail']) {
  if (!settings.includes(`name=\"${field}\"`)) fail(`Settings UI is missing ${field}`);
  if (!server.includes(`'${field}'`)) fail(`Settings API is missing ${field}`);
}
if (!login.includes('data.otpRecipient') || !login.includes('data.otpDriver')) fail('login UI does not show masked OTP delivery target/driver');
if (!settings.includes('id="settingsTestSmtpBtn"') || !settings.includes("runMailTest('smtp'")) fail('Settings UI is missing direct SMTP test');
if (!settings.includes('id="settingsTestLocalMailBtn"') || !settings.includes("runMailTest('local'")) fail('Settings UI is missing isolated local mail test');

console.log('Mail delivery self-test passed.');
