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
  const match = String(value || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  const result = { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
  result.text = `${result.major}.${result.minor}.${result.patch}`;
  return result;
}

function compare(a, b) {
  for (const key of ['major', 'minor', 'patch']) if (a[key] !== b[key]) return a[key] - b[key];
  return 0;
}

function incrementPatch(version) {
  return { ...version, patch: version.patch + 1, text: `${version.major}.${version.minor}.${version.patch + 1}` };
}

function replaceVersionPair(text, oldCurrent, oldFollowing, newCurrent, newFollowing) {
  // Update both the active version and examples that mention the following
  // release. Placeholders prevent 1.0.167 -> 1.0.168 -> 1.0.169 cascades.
  const currentMarker = '__P2PFLOW_CURRENT_VERSION__';
  const followingMarker = '__P2PFLOW_FOLLOWING_VERSION__';
  return String(text)
    .split(oldFollowing).join(followingMarker)
    .split(oldCurrent).join(currentMarker)
    .split(currentMarker).join(newCurrent)
    .split(followingMarker).join(newFollowing);
}

const currentParsed = parse(current);
if (!currentParsed) throw new Error(`package.json has an invalid version: ${current}`);
const requested = String(process.argv[2] || '').trim();
const next = requested === 'patch' || !requested ? incrementPatch(currentParsed) : parse(requested);
if (!next) throw new Error('Use: node scripts/set-version.js patch OR node scripts/set-version.js 1.0.168');
if (compare(next, currentParsed) <= 0) throw new Error(`New version ${next.text} must be greater than current version ${current}.`);

const oldFollowing = incrementPatch(currentParsed);
const newFollowing = incrementPatch(next);

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
  const after = replaceVersionPair(before, current, oldFollowing.text, next.text, newFollowing.text);
  fs.writeFileSync(file, after);
}

console.log(`P2PFlow version updated: ${current} -> ${next.text}`);
console.log(`The next-version examples were updated to ${newFollowing.text}.`);
console.log('Next: review files in GitHub Desktop, commit, and Push origin. The GitHub workflow will publish the signed release automatically.');
