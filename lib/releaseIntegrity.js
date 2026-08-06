'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RELEASE_METADATA_FILES = new Set([
  '.release-manifest.json',
  '.release-manifest.sig'
]);

function normalizedRelative(root, target) {
  const relative = path.relative(root, target).split(path.sep).join('/');
  if (!relative || relative === '.' || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe release path: ${target}`);
  }
  return relative;
}

function assertReleaseTreeSafe(rootDirectory) {
  const root = path.resolve(rootDirectory);
  const rootStat = fs.lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error('Release root must be a real directory, not a symbolic link.');
  }
  const files = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const stat = fs.lstatSync(full);
      const relative = normalizedRelative(root, full);
      if (stat.isSymbolicLink()) throw new Error(`Release contains a symbolic link: ${relative}`);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) files.push({ full, relative, size: stat.size });
      else throw new Error(`Release contains an unsupported filesystem object: ${relative}`);
    }
  };
  walk(root);
  files.sort((a, b) => a.relative < b.relative ? -1 : (a.relative > b.relative ? 1 : 0));
  return files;
}

function hashFileSync(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function computeReleaseTreeSha256(rootDirectory, options = {}) {
  const excludeMetadata = options.excludeMetadata !== false;
  const files = assertReleaseTreeSafe(rootDirectory);
  const tree = crypto.createHash('sha256');
  let fileCount = 0;
  let totalBytes = 0;
  for (const item of files) {
    if (excludeMetadata && RELEASE_METADATA_FILES.has(item.relative)) continue;
    const digest = hashFileSync(item.full);
    tree.update(item.relative, 'utf8');
    tree.update('\0');
    tree.update(String(item.size), 'utf8');
    tree.update('\0');
    tree.update(digest, 'ascii');
    tree.update('\n');
    fileCount += 1;
    totalBytes += item.size;
  }
  return { sha256: tree.digest('hex'), fileCount, totalBytes };
}

module.exports = {
  RELEASE_METADATA_FILES,
  assertReleaseTreeSafe,
  computeReleaseTreeSha256,
  hashFileSync
};
