#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app-server.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function assert(ok, message) {
  if (!ok) throw new Error(`Merchant break sync self-test failed: ${message}`);
}

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `missing function ${name}`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

const context = {
  deepValuesByKey(input, keys, limit = 30) {
    const wanted = new Set(keys);
    const out = [];
    const seen = new Set();
    function walk(value) {
      if (!value || typeof value !== 'object' || seen.has(value) || out.length >= limit) return;
      seen.add(value);
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (wanted.has(key)) out.push(child);
        walk(child);
        if (out.length >= limit) return;
      }
    }
    walk(input);
    return out;
  },
  merchantStatusFromResponse(response, keys, onWords = [], offWords = []) {
    const values = context.deepValuesByKey(response, keys, 30);
    for (const raw of values) {
      if (raw === true || Number(raw) === 1) return 1;
      if (raw === false || Number(raw) === 0) return 0;
      const value = String(raw ?? '').trim().toLowerCase();
      if (onWords.includes(value)) return 1;
      if (offWords.includes(value)) return 0;
    }
    return null;
  }
};
vm.createContext(context);
for (const name of [
  'merchantBusinessStatusCodeFromResponse',
  'merchantBusinessControlsFromStatusCode',
  'merchantBusinessStatusFromResponse',
  'merchantBreakStatusFromResponse'
]) {
  vm.runInContext(`${extractFunction(name)}\nthis.${name} = ${name};`, context);
}

const samples = [
  { code: 1, business: 1, break: 0, label: 'Open' },
  { code: 2, business: 0, break: 0, label: 'Closed' },
  { code: 3, business: 1, break: 1, label: 'Take break' }
];
for (const sample of samples) {
  const payload = { success: true, data: { businessStatus: sample.code } };
  assert(context.merchantBusinessStatusCodeFromResponse(payload) === sample.code, `${sample.label} code parse failed`);
  assert(context.merchantBusinessStatusFromResponse(payload) === sample.business, `${sample.label} business toggle mapping failed`);
  assert(context.merchantBreakStatusFromResponse(payload) === sample.break, `${sample.label} break toggle mapping failed`);
}

assert(source.includes("for (const endpointName of ['getUserBaseDetailOfficial', 'getUserBaseDetail'])"), 'realtime owner baseDetail source is not wired');
assert(source.includes('Read both on the same realtime cycle so Profile businessStatus=3 and Ads Break cannot drift.'), 'realtime Profile/Ads synchronization guard is missing');
assert(source.includes("syncOwnerP2pBusinessStatusSnapshot(credential, rawStatus.businessStatusCode"), 'realtime status is not pushed back into cached P2P Profile');
assert(source.includes("type: 'p2p.owner_profile.updated'"), 'P2P Profile live refresh event is missing');
assert(source.includes("type: 'ads.merchant.controls.synced'"), 'Ads merchant control live refresh event is missing');
assert(source.includes("Math.max(4000, Number(process.env.CRM_ADS_MERCHANT_STATUS_SECONDS || 5) * 1000)"), 'server merchant-status realtime loop is no longer configured around 5 seconds');

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  documentedBusinessStatus: { 1: 'Open', 2: 'Closed', 3: 'Take break' },
  breakToggleFromStatus3: true,
  realtimeBaseDetailSync: true,
  profileAndAdsSharedState: true
}, null, 2));
