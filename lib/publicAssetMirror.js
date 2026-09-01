'use strict';

const fs = require('fs');
const path = require('path');

function syncPublicMirror(sourceDirectory, installRoot) {
  const source = path.join(path.resolve(sourceDirectory), 'public');
  const destination = path.join(path.resolve(installRoot), 'public');
  if (path.resolve(source) === path.resolve(destination)) return { synced:false, reason:'root_runtime', source, destination, files:0, bytes:0 };
  if (!fs.existsSync(source)) throw new Error('Active release public directory is missing.');
  fs.mkdirSync(destination, { recursive:true, mode:0o755 });
  let files = 0;
  let bytes = 0;

  function copyEntry(src, dst, relative) {
    const stat = fs.lstatSync(src);
    if (stat.isSymbolicLink()) throw new Error(`Release public tree contains a symbolic link: ${relative}`);
    if (stat.isDirectory()) {
      fs.mkdirSync(dst, { recursive:true, mode:0o755 });
      for (const name of fs.readdirSync(src)) copyEntry(path.join(src, name), path.join(dst, name), relative ? `${relative}/${name}` : name);
      return;
    }
    if (!stat.isFile()) throw new Error(`Unsupported public asset: ${relative}`);
    fs.mkdirSync(path.dirname(dst), { recursive:true, mode:0o755 });
    const temp = `${dst}.next-${process.pid}-${Date.now()}`;
    try {
      fs.copyFileSync(src, temp);
      fs.renameSync(temp, dst);
    } finally {
      try { if (fs.existsSync(temp)) fs.rmSync(temp, { force:true }); } catch {}
    }
    files += 1;
    bytes += stat.size;
  }

  // Only release-owned paths are overwritten. Unrelated hosting files in the
  // root public directory are intentionally preserved.
  for (const name of fs.readdirSync(source)) copyEntry(path.join(source, name), path.join(destination, name), name);
  return { synced:true, files, bytes, source, destination };
}

module.exports = { syncPublicMirror };
