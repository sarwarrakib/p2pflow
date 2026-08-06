#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const app = read('public/app.js');
const index = read('public/index.html');
const setup = read('public/setup.html');
const css = read('public/style.css');

function assert(value, message) {
  if (!value) throw new Error(message);
}

assert(/<html\s+lang="bn"/i.test(index), 'Main document must default to Bangla.');
assert(/lang:\s*localStorage\.getItem\('crmLang'\)\s*\|\|\s*'bn'/.test(app), 'New browsers must default to Bangla.');
assert(/MutationObserver/.test(app) && /setupLanguageObserver/.test(app), 'Dynamic UI translation observer is missing.');
assert(/placeholder.*title.*aria-label.*data-label/s.test(app), 'Attribute translation coverage is incomplete.');
assert(/<html\s+lang="bn"/i.test(setup), 'Setup document must be Bangla.');
assert(/data-step="1"/.test(setup) && /P2PFlow ইনস্টল/.test(setup), 'Setup steps are not fully localized.');
assert(/Noto Sans Bengali/.test(css) && /Hind Siliguri/.test(css), 'Bangla font fallback is missing.');
assert(/compact-copy/.test(css), 'Compact copy styles are missing.');

const start = app.indexOf('const I18N_BN =');
const end = app.indexOf('function languageRoot');
assert(start >= 0 && end > start, 'Localization runtime block could not be located.');
const source = `${app.slice(start, end)}\nthis.localizationCheck = {\n  entries: Object.keys(I18N_BN).length,\n  shortCopy: Object.entries(UI_SHORT_COPY),\n  samples: [\n    trText('Today'),\n    trText('System Update'),\n    trText('No Manager is active.'),\n    trText('Server connectivity, local mail, storage, session and Binance diagnostics without terminal access.'),\n    trText('Version 1.2')\n  ]\n};`;
const context = { state: { lang: 'bn' } };
vm.createContext(context);
vm.runInContext(source, context);
const result = context.localizationCheck;
assert(result.entries >= 1000, `Expected broad Bangla dictionary coverage, found ${result.entries}.`);
const untranslatedShortCopy = result.shortCopy.filter(([original, compact]) => /[A-Za-z]/.test(compact) && context.translateBnPhrase(compact) === compact);
assert(untranslatedShortCopy.length === 0, `Compact text lacks Bangla translation: ${untranslatedShortCopy.map(item => item[1]).join(', ')}`);
assert(result.samples[0] === 'আজ', 'Today translation failed.');
assert(result.samples[1] === 'সিস্টেম আপডেট', 'System Update translation failed.');
assert(result.samples[3] === 'সার্ভার ও সংযোগ স্ট্যাটাস।', 'Compact copy translation failed.');
assert(result.samples[4] === 'ভার্সন 1.2', 'Dynamic version translation failed.');

const pageDir = path.join(root, 'public', 'js', 'pages');
const pageFiles = fs.readdirSync(pageDir).filter(name => name.endsWith('.js'));
const subtitleCalls = [];
for (const name of pageFiles) {
  const text = fs.readFileSync(path.join(pageDir, name), 'utf8');
  const matcher = /setTitle\([^,\n]+,\s*(['"`])([^'"`]*)\1\)/g;
  let match;
  while ((match = matcher.exec(text))) {
    if (String(match[2] || '').trim()) subtitleCalls.push(`${name}: ${match[0]}`);
  }
}
assert(subtitleCalls.length === 0, `Long page subtitles remain: ${subtitleCalls.join(' | ')}`);

console.log(JSON.stringify({
  ok: true,
  defaultLanguage: 'bn',
  dictionaryEntries: result.entries,
  dynamicTranslation: true,
  attributeTranslation: true,
  compactCopy: true,
  setupBangla: true,
  pageSubtitlesRemoved: true,
  samples: result.samples
}, null, 2));
