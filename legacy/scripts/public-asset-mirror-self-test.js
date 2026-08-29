#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { syncPublicMirror } = require('../lib/publicAssetMirror');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2pflow-public-mirror-'));
try {
  const installRoot = path.join(temp, 'install');
  const release = path.join(installRoot, 'releases', '1.4.5');
  fs.mkdirSync(path.join(installRoot, 'public'), { recursive:true });
  fs.mkdirSync(path.join(release, 'public', 'js'), { recursive:true });
  fs.writeFileSync(path.join(installRoot, 'public', 'app.js'), 'legacy-flat-menu');
  fs.writeFileSync(path.join(installRoot, 'public', 'keep.txt'), 'hosting-owned');
  fs.writeFileSync(path.join(release, 'public', 'app.js'), 'grouped-control-center');
  fs.writeFileSync(path.join(release, 'public', 'index.html'), '<html>1.4.5</html>');
  fs.writeFileSync(path.join(release, 'public', 'js', 'page.js'), 'ok');

  const result = syncPublicMirror(release, installRoot);
  if (!result.synced || result.files !== 3) throw new Error(`Unexpected mirror result: ${JSON.stringify(result)}`);
  if (fs.readFileSync(path.join(installRoot, 'public', 'app.js'), 'utf8') !== 'grouped-control-center') throw new Error('app.js was not replaced by the active release asset.');
  if (fs.readFileSync(path.join(installRoot, 'public', 'js', 'page.js'), 'utf8') !== 'ok') throw new Error('Nested public asset was not mirrored.');
  if (fs.readFileSync(path.join(installRoot, 'public', 'keep.txt'), 'utf8') !== 'hosting-owned') throw new Error('Unrelated hosting public file was removed or modified.');

  const rootResult = syncPublicMirror(installRoot, installRoot);
  if (rootResult.synced !== false || rootResult.reason !== 'root_runtime') throw new Error('Root runtime should not copy public assets onto itself.');

  const unsafeRelease = path.join(installRoot, 'releases', 'unsafe');
  fs.mkdirSync(path.join(unsafeRelease, 'public'), { recursive:true });
  fs.symlinkSync(path.join(release, 'public', 'app.js'), path.join(unsafeRelease, 'public', 'linked.js'));
  let rejected = false;
  try { syncPublicMirror(unsafeRelease, installRoot); } catch { rejected = true; }
  if (!rejected) throw new Error('Public mirror must reject symbolic links.');

  console.log(JSON.stringify({
    ok:true,
    activeReleaseAssetsMirrored:true,
    nestedAssetsMirrored:true,
    unrelatedHostingFilesPreserved:true,
    atomicFileReplacement:true,
    symlinkRejected:true
  }, null, 2));
} finally {
  fs.rmSync(temp, { recursive:true, force:true });
}
