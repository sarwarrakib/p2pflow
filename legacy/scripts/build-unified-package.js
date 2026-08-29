#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const outDir = path.resolve(process.env.P2PFLOW_PACKAGE_OUT || path.join(root, 'dist-unified'));
const stage = path.join(outDir, `stage-${pkg.version}`);
const zipPath = path.join(outDir, `P2PFlow_v${pkg.version}_UNIFIED.zip`);

const topLevelExcludes = new Set([
  '.git','node_modules','releases','shared','dist','dist-unified','data','legacy-import','.p2pflow',
  '.env','.env.local','P2PFLOW_SETUP_CODE.txt'
]);
const sensitiveNames = new Set([
  '.env','.env.local','P2PFLOW_SETUP_CODE.txt','startup-failure.json','current-release.json',
  'pending-activation.json','app.db.enc','master.key','private.key','id_rsa'
]);

function isSensitive(relative) {
  const parts = relative.split('/');
  return parts.some(part => sensitiveNames.has(part) || /\.bak(?:\.|$)/i.test(part) || part.endsWith('~')) || parts.includes('shared') || parts.includes('releases') || parts.includes('.p2pflow');
}
function copySafe(src, dst, relative = '') {
  const stat = fs.lstatSync(src);
  if (stat.isSymbolicLink()) throw new Error(`Refusing symbolic link in unified package: ${relative || src}`);
  if (isSensitive(relative)) throw new Error(`Refusing to package sensitive runtime file: ${relative}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive:true });
    for (const name of fs.readdirSync(src)) {
      if (!relative && topLevelExcludes.has(name)) continue;
      const childRelative = relative ? `${relative}/${name}` : name;
      copySafe(path.join(src, name), path.join(dst, name), childRelative);
    }
    return;
  }
  if (!stat.isFile()) throw new Error(`Unsupported filesystem object: ${relative}`);
  fs.mkdirSync(path.dirname(dst), { recursive:true });
  fs.copyFileSync(src, dst);
}

fs.rmSync(outDir, { recursive:true, force:true });
fs.mkdirSync(stage, { recursive:true });
const currentReleaseNotes = `P2PFlow_v${pkg.version}_RELEASE_NOTES_BN.md`;
function isTopLevelPackageClutter(name) {
  if (/^P2PFlow_v\d+\.\d+\.\d+_/i.test(name) && !name.startsWith(`P2PFlow_v${pkg.version}_`)) return true;
  if (/^P2PFlow_v.*_TEST_REPORT\.txt$/i.test(name)) return true;
  if (/^P2PFlow_v.*_RELEASE_NOTES_BN\.md$/i.test(name) && name !== currentReleaseNotes) return true;
  return false;
}
for (const name of fs.readdirSync(root)) {
  if (topLevelExcludes.has(name)) continue;
  if (name === path.basename(outDir)) continue;
  if (isTopLevelPackageClutter(name)) continue;
  copySafe(path.join(root, name), path.join(stage, name), name);
}

const packageType = `P2PFlow UNIFIED PACKAGE\nVersion: ${pkg.version}\n\nONE ZIP FOR ALL USES\n- Fresh server: extract to the Node application root; run npm ci --omit=dev --ignore-scripts, npm run build, npm test, then npm start and complete /setup.\n- Existing server: back up and preserve .env, .p2pflow, shared/ and the database; replace only application files; run the exact production dependency install, build/test/preflight, then restart.\n- GitHub: extract the same ZIP into the repository root, review the diff, commit and push without runtime secrets or persistent data.\n- Future updates: System Update checks signed GitHub Releases and installs them without replacing database records.\n\nComplete P2PFlow_v${pkg.version}_LAUNCH_CHECKLIST_BN.md before public traffic is enabled.\nNever copy runtime .env/.p2pflow/shared/database files into GitHub.\n`;
fs.writeFileSync(path.join(stage, 'PACKAGE_TYPE.txt'), packageType);

const zip = spawnSync('zip', ['-q','-r',zipPath,'.'], { cwd:stage, stdio:'inherit' });
if (zip.error) throw zip.error;
if (zip.status !== 0) process.exit(zip.status || 1);
const hash = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
const shaPath = path.join(outDir, `P2PFlow_v${pkg.version}_SHA256.txt`);
fs.writeFileSync(shaPath, `${hash}  ${path.basename(zipPath)}\n`);
fs.rmSync(stage, { recursive:true, force:true });
console.log(JSON.stringify({ ok:true, version:pkg.version, packageMode:'UNIFIED', zipPath, sha256:hash, shaPath }, null, 2));
