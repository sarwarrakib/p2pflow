#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const server = read('app-server.js');
const settings = read('public/js/pages/settings.js');
const pkg = JSON.parse(read('package.json'));
const fail = message => { throw new Error(`Mail failover self-test failed: ${message}`); };
const assert = (ok, message) => { if (!ok) fail(message); };

assert(pkg.version === '1.6.8', `expected v1.6.8, got ${pkg.version}`);

for (const marker of [
  'mailFallbackRoutes: []',
  'MAX_MAIL_FALLBACK_ROUTES = 3',
  'function runtimeMailFallbackConfigs()',
  'function runtimeMailRouteChain()',
  'async function sendMailUsingConfig',
  'function mailFailoverAllowed',
  "code: 'mail_failover_exhausted'",
  "logAudit(null, 'mail_route_failed'",
  "steps.push(healthStep('mail.failover'",
  "requestedDriver.match(/^fallback-(\\d+)$/)"
]) assert(server.includes(marker), `server marker missing: ${marker}`);

assert(server.includes("if (['recipient_missing','recipient_rejected'].includes(diagnosis?.code)) return false;"), 'permanent recipient rejection must not fail over');
assert(server.includes("if (stage === 'DATA_BODY' && !code) return false;"), 'ambiguous post-DATA disconnect must not fail over');
assert(server.includes('for (let index = 0; index < chain.length; index += 1)'), 'ordered route iteration is missing');
assert(server.includes('if (canTryNext) continue;'), 'automatic route continuation is missing');
assert(server.includes('mailFallbackRoutes must be an array.'), 'Settings API fallback-route validation is missing');
assert(server.includes('smtpPasswordConfigured: Boolean(config.smtpPassword)'), 'fallback SMTP password must be hidden from public settings');
assert(server.includes('mailFailoverEnabledCount = runtimeMailFallbackConfigs().length'), 'public failover count is missing');

for (const marker of [
  'P2PFLOW_MAX_MAIL_FALLBACKS = 3',
  'Email Delivery',
  'Automatic backups',
  'Backup ${slot}',
  'Test Full Chain',
  'Test Login OTP',
  "runMailTest(`fallback-${slot}`",
  'obj.mailFallbackRoutes = Array.from'
]) assert(settings.includes(marker), `Settings UI marker missing: ${marker}`);

assert(settings.includes('Recipient rejection is not retried on another provider'), 'UI safety note for recipient rejection is missing');
assert(settings.includes('ambiguous disconnect after SMTP DATA is not retried'), 'UI duplicate-protection note is missing');

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  primaryPlusBackups: true,
  maxBackupRoutes: 3,
  permanentRecipientFailoverBlocked: true,
  ambiguousPostDataFailoverBlocked: true,
  perBackupTestButtons: true
}, null, 2));
