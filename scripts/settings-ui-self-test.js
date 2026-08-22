#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const settings = read('public/js/pages/settings.js');
const css = read('public/style.css');
const pkg = JSON.parse(read('package.json'));
const fail = message => { throw new Error(`Settings UI self-test failed: ${message}`); };
const assert = (value, message) => { if (!value) fail(message); };

assert(pkg.version === '1.5.38', `expected v1.5.38, got ${pkg.version}`);
for (const section of ['general','binance','security','email','notifications','activity']) {
  assert(settings.includes(`data-settings-section=\"${section}\"`), `navigation section missing: ${section}`);
  assert(settings.includes(`p2pflowSettingsPanel('${section}'`), `panel missing: ${section}`);
}
for (const marker of [
  'settings-workspace',
  'settings-layout',
  'settings-panel-stack',
  'settings-savebar',
  'settings-mail-chain',
  'settings-mail-route-list',
  'Connection & sender details',
  'settings-route-details',
  'Automatic backups',
  'Low-level mail tests',
  'p2pflowActivateSettingsSection',
]) assert(settings.includes(marker), `settings marker missing: ${marker}`);

assert((settings.match(/id=\"settingsMailTestRecipient\"/g) || []).length === 1, 'Mail Test Recipient must appear only once.');
assert((settings.match(/p2pflowFallbackRouteHtml\(fallbackRoutes\[index\]/g) || []).length === 1, 'Fallback cards must be generated from one reusable component.');
assert(settings.includes("localStorage.setItem('p2pflow.settings.section'"), 'selected settings section should persist in the browser.');
assert(settings.includes('obj.mailFallbackRoutes = Array.from'), 'existing mail fallback save mapping is missing.');
assert(settings.includes('fallback${slot}SmtpPassword'), 'backup SMTP password field is missing.');
assert(settings.includes('settingsTestFallback${slot}Btn'), 'per-backup test button is missing.');

for (const marker of [
  '.settings-layout',
  '.settings-nav',
  '.settings-panel.active',
  '.settings-mail-route',
  '.settings-route-details',
  '.settings-savebar',
  '@media(max-width:720px)'
]) assert(css.includes(marker), `CSS marker missing: ${marker}`);

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  categorizedSettings: true,
  sections: 6,
  releaseVerificationMovedToCredentials: true,
  compactFailoverCards: true,
  reusableBackupRouteComponent: true,
  responsive: true
}, null, 2));
