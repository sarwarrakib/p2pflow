#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const server = read('app-server.js');
const settings = read('public/js/pages/settings.js');
const pkg = JSON.parse(read('package.json'));
const fail = message => { throw new Error(`Mail routing self-test failed: ${message}`); };
const assert = (ok, message) => { if (!ok) fail(message); };

assert(pkg.version === '1.6.3', `expected v1.6.3, got ${pkg.version}`);

const systems = [
  ['auto','Hosting Auto'], ['php','PHP mail'], ['sendmail','Sendmail'],
  ['gmail','Gmail'], ['outlook','Outlook / Microsoft'], ['yahoo','Yahoo'],
  ['zoho','Zoho'], ['icloud','iCloud'], ['aol','AOL'], ['fastmail','Fastmail'],
  ['gmx','GMX / Mail.com'], ['yandex','Yandex'], ['sendgrid','SendGrid'],
  ['mailgun','Mailgun'], ['brevo','Brevo'], ['smtp','Custom SMTP']
];
for (const [key, label] of systems) {
  assert(server.includes(`${key}: { label: '${label}'`) || key === 'smtp' && server.includes("smtp: { label: 'Custom SMTP'"), `server preset missing ${label}`);
  assert(settings.includes(`['${key}','${label}']`), `Settings dropdown missing ${label}`);
}

for (const marker of [
  "gmail: { label: 'Gmail', transport: 'smtp', host: 'smtp.gmail.com', port: 587",
  "outlook: { label: 'Outlook / Microsoft', transport: 'smtp', host: 'smtp.office365.com', port: 587",
  "yahoo: { label: 'Yahoo', transport: 'smtp', host: 'smtp.mail.yahoo.com', port: 465"
]) assert(server.includes(marker), `provider preset missing: ${marker}`);

assert(server.includes('the chosen transport comes only from the global Email Sending System'), 'global route guard comment is missing');
assert(server.includes("if (driver === 'auto') delivery = sendViaLocalServerMail"), 'Hosting Auto routing is missing');
assert(server.includes("else if (driver === 'php') delivery = sendViaPhpMail"), 'PHP mail routing is missing');
assert(server.includes("else if (driver === 'sendmail') delivery = sendViaSendmail"), 'Sendmail routing is missing');
assert(server.includes("else if (driver === 'smtp') delivery = sendViaSmtp"), 'SMTP routing is missing');

const localStart = server.indexOf('async function sendViaLocalServerMail');
const localEnd = server.indexOf('\nasync function sendViaPhpMail', localStart);
assert(localStart >= 0 && localEnd > localStart, 'could not isolate Hosting Auto function');
const localBody = server.slice(localStart, localEnd);
assert(!localBody.includes('sendViaSmtp('), 'Hosting Auto still has a hidden SMTP fallback');
assert(localBody.includes('must never switch to SMTP behind the global Email Sending System setting'), 'Hosting Auto no-hidden-override guard is missing');

assert(server.includes("requestedDriver === 'login-otp'"), 'Test Login OTP Route backend is missing');
assert(server.includes('loginOtpRouteLastVerifiedAt'), 'Login OTP route verification timestamp is missing');
assert(server.includes('smtpLastVerifiedAt'), 'SMTP verification timestamp is missing');
assert(settings.includes('settingsTestLoginOtpBtn'), 'Settings UI is missing Test Login OTP Route button');
assert(settings.includes("runMailTest('login-otp'"), 'Settings UI does not call exact Login OTP route test');
assert(settings.includes('settingsTestSmtpBtn') && settings.includes("runMailTest('smtp'"), 'Settings UI is missing direct SMTP test');
assert(settings.includes('settingsTestLocalMailBtn') && settings.includes("runMailTest('local'"), 'Settings UI is missing local mail test');

for (const code of [
  'smtp_configuration_incomplete', 'smtp_authentication_failed', 'sender_rejected', 'recipient_rejected',
  'message_rejected', 'smtp_relay_denied', 'smtp_policy_rejected', 'provider_rate_limited', 'tls_error', 'network_error'
]) assert(server.includes(`'${code}'`), `mail error classifier missing ${code}`);

for (const stage of ['MAIL_FROM','RCPT_TO','DATA_COMMAND','DATA_BODY']) {
  assert(server.includes(`'${stage}'`), `SMTP stage diagnostic missing ${stage}`);
}
assert(server.includes("const authenticatedMailbox = validEmailAddress(config.smtpUser)"), 'authenticated SMTP username is not used as safe From fallback');
assert(settings.includes('settingsMailTestRecipient'), 'Settings UI is missing explicit mail-test recipient input');
assert(settings.includes('data.smtpStage') && settings.includes('data.detail'), 'Settings UI does not expose SMTP stage/detail diagnostics');

for (const field of ['sendNotificationEmail','sendOrderEmail','sendSecurityChangeEmail','sendLoginFailureEmail']) {
  assert(settings.includes(`name="${field}"`), `Settings UI is missing ${field}`);
  assert(server.includes(`'${field}'`), `Settings API is missing ${field}`);
}

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  globalEmailSendingSystem: true,
  providerCount: systems.length,
  hiddenTransportOverride: false,
  loginOtpExactRouteTest: true,
  detailedMailDiagnostics: true
}, null, 2));
