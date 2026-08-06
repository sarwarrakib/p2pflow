#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const current = String(pkg.version || '');

function parse(value) {
  const normalized = String(value || '').trim().replace(/^v/i, '');
  const match = normalized.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const result = { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3] || 0) };
  result.text = `${result.major}.${result.minor}.${result.patch}`;
  return result;
}

function compare(a, b) {
  for (const key of ['major', 'minor', 'patch']) if (a[key] !== b[key]) return a[key] - b[key];
  return 0;
}

function nextMinor(version) {
  return { major: version.major, minor: version.minor + 1, patch: 0, text: `${version.major}.${version.minor + 1}.0` };
}

function nextHotfix(version) {
  return { major: version.major, minor: version.minor, patch: version.patch + 1, text: `${version.major}.${version.minor}.${version.patch + 1}` };
}

function display(version) {
  return version.patch === 0 ? `${version.major}.${version.minor}` : version.text;
}

function replaceExactVersion(text, oldVersion, newVersion) {
  return String(text)
    .split(`v${oldVersion}`).join(`v${newVersion}`)
    .split(oldVersion).join(newVersion);
}

const currentParsed = parse(current);
if (!currentParsed || !/^\d+\.\d+\.\d+$/.test(current)) throw new Error(`package.json has an invalid version: ${current}`);

const requested = String(process.argv[2] || 'minor').trim().toLowerCase();
let next;
if (['minor', 'feature', 'update'].includes(requested)) next = nextMinor(currentParsed);
else if (['hotfix', 'patch', 'fix'].includes(requested)) next = nextHotfix(currentParsed);
else next = parse(requested);

if (!next) throw new Error('Use: node scripts/set-version.js minor | hotfix | 1.2 | 1.2.1');
if (compare(next, currentParsed) <= 0) throw new Error(`New version ${next.text} must be greater than current version ${current}.`);

pkg.version = next.text;
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
lock.version = next.text;
if (lock.packages && lock.packages['']) lock.packages[''].version = next.text;
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');

const replacements = [
  'public/index.html',
  'public/app.js',
  'public/js/pages/accounting.js',
  'public/js/pages/accounts.js',
  'public/js/pages/ads.js',
  'public/js/pages/p2p-market.js',
  'public/js/pages/reports.js',
  'public/js/pages/security.js',
  'README.md',
  'INSTALL_HOSTING_BN.md',
  'HOSTING_GITHUB_DEPLOY_BN.md',
  'docs/HOSTING_BROWSER_INSTALL_BN.md',
  'docs/INSTALL_OWNER_503_RECOVERY_BN.md',
  'docs/PRODUCTION_GITHUB_UPDATE_SETUP_BN.md',
  'GITHUB_DESKTOP_UPDATE_GUIDE_BN.md'
];

for (const relative of replacements) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, replaceExactVersion(before, current, next.text));
}

console.log(`P2PFlow version updated: ${display(currentParsed)} -> ${display(next)} (${next.text})`);
console.log(requested === 'hotfix' || requested === 'patch' || requested === 'fix'
  ? 'Hotfix version prepared.'
  : 'Feature/update version prepared.');
console.log('Next: review Changes in GitHub Desktop, Commit to main, then Push origin. GitHub Actions will publish the signed release automatically.');
