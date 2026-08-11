#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const style = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const setup = fs.readFileSync(path.join(root, 'public', 'setup.css'), 'utf8');

function assert(ok, message) {
  if (!ok) throw new Error(message);
}
function hexRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(ch => ch + ch).join('') : clean;
  return [0,2,4].map(i => parseInt(full.slice(i, i + 2), 16) / 255);
}
function luminance(hex) {
  const rgb = hexRgb(hex).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrast(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

assert(style.includes('/* v1.5.1 - unified P2PFlow color system */'), 'Unified v1.5.1 color layer missing.');
assert(style.includes('--brand: #f0b90b;'), 'Primary P2P gold token missing.');
assert(style.includes('--brand-ink: #181a20;'), 'Primary button ink token missing.');
assert(style.includes('--soft: #f5f6f7;') && style.includes('--border: #e6e8ea;'), 'Legacy color compatibility aliases missing.');
assert(style.includes('.login-submit-btn{background:linear-gradient(92deg,#dca900 0%,var(--brand) 48%,#f8d33a 100%);color:var(--brand-ink)'), 'Login primary action is not using the unified gold palette.');
assert(style.includes('.dash-hero,.admin-hero,.order-hero-panel,.accounting-hero{'), 'Hero color unification selector missing.');
assert(setup.includes('--brand:#f0b90b;') && setup.includes('--brand-ink:#181a20;'), 'Setup wizard is not using the unified P2P palette.');
assert(!/#1565d8|#0d47a1|#3078d8/i.test(setup), 'Legacy setup blue brand colors are still active.');

for (const relative of ['public/index.html', 'public/login.html', 'public/setup.html']) {
  const html = fs.readFileSync(path.join(root, relative), 'utf8');
  const versions = [...html.matchAll(/\?v=(\d+\.\d+\.\d+)/g)].map(match => match[1]);
  assert(versions.length > 0, `${relative} has no cache-busted assets.`);
  assert(versions.every(version => version === pkg.version), `${relative} cache-buster does not match package version ${pkg.version}.`);
}

const contrastPairs = [
  ['brand button', '#181a20', '#f0b90b'],
  ['brand text on white', '#8a6a00', '#ffffff'],
  ['body text', '#181a20', '#f5f6f7'],
  ['muted text', '#667085', '#ffffff'],
  ['success text', '#047857', '#ecfdf5'],
  ['warning text', '#9a3412', '#fff7ed'],
  ['danger text', '#9f1239', '#fff1f2'],
  ['info text', '#1d4ed8', '#eff6ff']
];
for (const [label, fg, bg] of contrastPairs) {
  const ratio = contrast(fg, bg);
  assert(ratio >= 4.5, `${label} contrast ${ratio.toFixed(2)} is below 4.5:1.`);
}

console.log(`UI color system self-test passed for P2PFlow ${pkg.version}.`);
