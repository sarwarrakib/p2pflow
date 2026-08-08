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
  const result = { major:Number(match[1]), minor:Number(match[2]), patch:Number(match[3]) };
  result.text = `${result.major}.${result.minor}.${result.patch}`;
  return result;
}
function compare(a,b) {
  for (const key of ['major','minor','patch']) if (a[key] !== b[key]) return a[key] - b[key];
  return 0;
}
function nextPatch(v) { return { ...v, patch:v.patch+1, text:`${v.major}.${v.minor}.${v.patch+1}` }; }
function nextMinor(v) { return { major:v.major, minor:v.minor+1, patch:0, text:`${v.major}.${v.minor+1}.0` }; }
function nextMajor(v) { return { major:v.major+1, minor:0, patch:0, text:`${v.major+1}.0.0` }; }

const currentParsed = parse(current);
if (!currentParsed) throw new Error(`package.json has an invalid version: ${current}`);
const requested = String(process.argv[2] || 'minor').trim().toLowerCase();
let next;
if (requested === 'minor' || requested === 'next') next = nextMinor(currentParsed);
else if (requested === 'patch' || requested === 'hotfix') next = nextPatch(currentParsed);
else if (requested === 'major') next = nextMajor(currentParsed);
else next = parse(requested);
if (!next) throw new Error('Use: node scripts/set-version.js minor | patch | major | 1.4.0');
if (compare(next,currentParsed) <= 0) throw new Error(`New version ${next.text} must be greater than current version ${current}.`);

pkg.version = next.text;
fs.writeFileSync(packagePath, JSON.stringify(pkg,null,2)+'\n');
const lock = JSON.parse(fs.readFileSync(lockPath,'utf8'));
lock.version = next.text;
if (lock.packages && lock.packages['']) lock.packages[''].version = next.text;
fs.writeFileSync(lockPath, JSON.stringify(lock,null,2)+'\n');

const textFiles = [
  'public/index.html','public/setup.html','public/app.js',
  'public/js/pages/accounting.js','public/js/pages/accounts.js','public/js/pages/ads.js',
  'public/js/pages/p2p-market.js','public/js/pages/reports.js','public/js/pages/security.js',
  'public/js/pages/system-update.js','README.md','UNIFIED_INSTALL_BN.md',
  'docs/PRODUCTION_GITHUB_UPDATE_SETUP_BN.md','GITHUB_DESKTOP_UPDATE_GUIDE_BN.md','PACKAGE_TYPE.txt'
];
for (const relative of textFiles) {
  const file = path.join(root,relative);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file,'utf8');
  let after = before.split(current).join(next.text);
  if (relative === 'public/index.html' || relative === 'public/setup.html') {
    after = after.replace(/\?v=\d+\.\d+\.\d+/g, `?v=${next.text}`);
  }
  if (relative === 'UNIFIED_INSTALL_BN.md' || relative === 'GITHUB_DESKTOP_UPDATE_GUIDE_BN.md') {
    after = after.replace(/P2PFlow_v\d+\.\d+\.\d+_UNIFIED\.zip/g, `P2PFlow_v${next.text}_UNIFIED.zip`);
  }
  if (relative === 'README.md') {
    const futureMinor = nextMinor(next).text;
    const futurePatch = nextPatch(next).text;
    after = after.replace(/Normal next version: `SET_NEXT_VERSION\.bat` -> `\d+\.\d+\.\d+`/, `Normal next version: \`SET_NEXT_VERSION.bat\` -> \`${futureMinor}\``);
    after = after.replace(/Hotfix: `SET_HOTFIX_VERSION\.bat` -> `\d+\.\d+\.\d+`/, `Hotfix: \`SET_HOTFIX_VERSION.bat\` -> \`${futurePatch}\``);
  }
  fs.writeFileSync(file,after);
}
console.log(`P2PFlow version updated: ${current} -> ${next.text}`);
console.log(requested === 'patch' || requested === 'hotfix'
  ? 'Hotfix version prepared.'
  : 'Next normal version prepared. UI will hide the trailing .0.');
console.log('Next: GitHub Desktop -> Commit -> Push origin. The release workflow publishes the signed update automatically.');
