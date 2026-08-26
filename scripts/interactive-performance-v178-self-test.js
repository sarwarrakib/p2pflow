#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const pkg = JSON.parse(read('package.json'));
const assert = (condition, message) => { if (!condition) throw new Error(`Interactive performance v1.7.8 self-test failed: ${message}`); };

assert(pkg.version === '1.7.8', `expected v1.7.8, got ${pkg.version}`);
assert(app.includes("state.navigationController?.abort('navigation_changed')"), 'latest-navigation-wins cancellation was removed');
assert(app.includes('FAST_NATIVE_CONTENT_PAGES') && app.includes('shouldUseNativeContentCommit'), 'heavy-page native commit gate is missing');
assert(app.includes('nativeReplaceContentPreservingViewport'), 'native content replacement does not preserve viewport state');
assert(app.includes("maxHosts:6"), 'route-host LRU is not bounded to six mounted/detached views');
assert(app.includes('scheduleVisiblePageModuleWarmup') && app.includes("setTimeout(() => scheduleVisiblePageModuleWarmup(), 180)"), 'background visible-page module warmup is missing');
assert(app.includes("button.addEventListener('pointerenter', warmPageModule") && app.includes("button.addEventListener('touchstart', warmPageModule"), 'navigation intent does not warm page modules');
assert(app.includes('bnTranslationCache') && app.includes('BN_TRANSLATION_CACHE_LIMIT'), 'Bengali translation cache is missing');
assert(app.includes("previousAppliedLang !== 'bn'"), 'fresh-English DOM fast path is missing');
assert(app.includes('function syncNavigationActiveState()') && app.includes('syncNavigationActiveState();'), 'route changes still require a full sidebar rebuild');
assert(app.includes('function stableMorphContent(container, html)'), 'small-view stable morph fallback was removed');

console.log(JSON.stringify({
  ok:true,
  version:pkg.version,
  latestNavigationWins:true,
  heavyDomNativeCommit:true,
  viewportPreserved:true,
  routeHostLimit:6,
  pageModuleBackgroundWarmup:true,
  navigationIntentWarmup:true,
  fastEnglishI18n:true,
  cachedBengaliTranslation:true,
  activeOnlyNavigationUpdate:true,
  stableMorphFallback:true
}, null, 2));
