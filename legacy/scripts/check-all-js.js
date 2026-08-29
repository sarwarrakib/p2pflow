#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const excludedDirectories = new Set(['.git', 'node_modules', 'dist', 'dist-unified', 'releases', 'shared', 'data', '.p2pflow', 'legacy-import']);
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') {
      if (entry.isDirectory()) continue;
    }
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) walk(absolute);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.js') || /\.bak(?:\.|$)/i.test(entry.name)) continue;
    files.push(relative);
  }
}

walk(root);
files.sort();
const failures = [];
for (const relative of files) {
  const result = spawnSync(process.execPath, ['--check', relative], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) failures.push({ file: relative, error: String(result.stderr || result.stdout || '').trim() });
}
if (failures.length) {
  for (const failure of failures) console.error(`\n${failure.file}\n${failure.error}`);
  throw new Error(`${failures.length} JavaScript file(s) failed syntax validation.`);
}
console.log(JSON.stringify({ ok: true, checkedJavaScriptFiles: files.length }, null, 2));
