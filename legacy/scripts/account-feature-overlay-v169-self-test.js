#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root,'app-server.js'),'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
function assert(value, message){ if(!value) throw new Error(`v${pkg.version} account-feature overlay self-test failed: ${message}`); }
function bodyOf(name){
  const asyncStart = src.indexOf(`async function ${name}`);
  const syncStart = src.indexOf(`function ${name}`);
  const starts = [asyncStart, syncStart].filter(value => value >= 0);
  const start = starts.length ? Math.min(...starts) : -1;
  assert(start >= 0, `${name} missing`);
  const paramOpen = src.indexOf('(', start);
  let parenDepth = 0; let paramClose = -1;
  for (let i=paramOpen;i<src.length;i++){
    if(src[i]==='(') parenDepth++;
    else if(src[i]===')' && --parenDepth===0){ paramClose=i; break; }
  }
  assert(paramClose > paramOpen, `${name} parameters could not be parsed`);
  const brace = src.indexOf('{', paramClose); let depth=0;
  for(let i=brace;i<src.length;i++){ if(src[i]==='{') depth++; else if(src[i]==='}' && --depth===0) return src.slice(start,i+1); }
  throw new Error(`Could not parse ${name}`);
}
for (const name of ['syncBinanceOrdersWithCredential','runBinanceFastOrderDiscovery','runBinanceAutoOrderSync']) {
  const body=bodyOf(name);
  assert(!/userBinanceCredentialFeature|featureControls|chatAccountControls|ordersEnabled/.test(body), `${name} is coupled to user account switches`);
}
assert(src.includes('function canAccessOrderBase(user, order)'), 'v1.6.4 base order visibility is not preserved');
assert(src.includes('function ordersAccessibleToUserBase(user)'), 'v1.6.4 base list visibility is not preserved');
assert(src.includes("userBinanceCredentialFeatureEnabled(agentLoginUser(x.agent.id), order.credentialId, 'orders')"), 'Orders OFF is not a deny-only auto-assignment overlay');
assert(src.includes('target.settings.userAccountFeatureOverlayV169Initialized'), 'stale v1.6.5-v1.6.8 control reset is missing');
assert(src.includes("if (url.pathname === '/api/chat-account-controls')"), 'chat account controls endpoint missing');
assert(src.includes('ordersAccessibleToUser(user, { respectFeatureControls:false })'), 'Chat was incorrectly coupled to Orders OFF');
console.log(JSON.stringify({ok:true,version:pkg.version,orderCore:'v1.6.4-preserved',userOverlay:'deny-only',staleControlsResetToOn:true,chatIndependentFromOrdersToggle:true}));
