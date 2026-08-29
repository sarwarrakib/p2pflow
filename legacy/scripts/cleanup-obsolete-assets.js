#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const obsoleteFiles = ['public/assets/order-filter.png'];
const removed = [];

for (const relative of obsoleteFiles) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) continue;
  const stat = fs.lstatSync(target);
  if (!stat.isFile()) throw new Error(`Refusing to remove non-file obsolete asset: ${relative}`);
  fs.rmSync(target, { force:true });
  removed.push(relative);
}

const assetsDir = path.join(root, 'public', 'assets');
if (fs.existsSync(assetsDir) && fs.statSync(assetsDir).isDirectory() && fs.readdirSync(assetsDir).length === 0) {
  fs.rmdirSync(assetsDir);
}

console.log(JSON.stringify({ ok:true, obsoleteAssetsRemoved:removed }));
