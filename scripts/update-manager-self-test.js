#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { UpdateManager, compareSemver } = require('../lib/updateManager');
const { computeReleaseTreeSha256 } = require('../lib/releaseIntegrity');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rneed-update-test-'));
(async () => {
try {
  const releases = path.join(temp, 'releases');
  const shared = path.join(temp, 'shared');
  const current = path.join(temp, 'current');
  fs.mkdirSync(releases, { recursive: true });
  fs.mkdirSync(shared, { recursive: true });
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  const manager = new UpdateManager({
    currentVersion: '1.0.159', schemaVersion: 25,
    dataCompatibilityEpoch: 1,
    installRoot: temp, releasesDir: releases, sharedDir: shared, currentLink: current,
    repository: 'owner/private-repository', token: 'test-token', publicKey: publicPem, requireSignature: true
  });
  manager.githubFetch = async url => {
    if (String(url).includes('/contents/package.json')) return { json: async () => ({ encoding: 'base64', content: Buffer.from(JSON.stringify({ version: '1.0.168' })).toString('base64'), sha: 'abc' }) };
    return { json: async () => [] };
  };
  const sourceVersion = await manager.repositorySourceVersion();
  if (!sourceVersion || sourceVersion.version !== '1.0.168' || sourceVersion.updateAvailable !== true) throw new Error('Repository source version detection failed.');
  const noRelease = await manager.latestRelease();
  if (noRelease !== null) throw new Error('An empty GitHub release list must be treated as a valid no-release state.');
  manager.githubFetch = async () => ({ json: async () => [{
    id: 165,
    tag_name: 'v1.0.165',
    name: 'v1.0.165',
    body: 'older but returned first',
    draft: false,
    prerelease: false,
    published_at: new Date().toISOString(),
    assets: []
  }, {
    id: 167,
    tag_name: 'v1.0.167',
    name: 'v1.0.167',
    body: 'newest semantic version',
    draft: false,
    prerelease: false,
    published_at: new Date(Date.now() - 1000).toISOString(),
    assets: []
  }] });
  const discovered = await manager.latestRelease();
  if (!discovered || discovered.version !== '1.0.167' || discovered.updateAvailable !== true) throw new Error('Published release discovery failed.');

  const manifest = {
    format: 1, product: 'p2pflow', dataCompatibilityEpoch: 1, version: '1.0.166', tag: 'v1.0.166',
    packageAsset: 'p2pflow-v1.0.166.tar.gz', packageBytes: 12345,
    sha256: 'a'.repeat(64), treeSha256: 'b'.repeat(64), treeFiles: 250, treeBytes: 500000,
    node: '>=20.0.0',
    schema: { min: 25, max: 2147483647 }
  };
  const raw = Buffer.from(JSON.stringify(manifest));
  const signature = Buffer.from(crypto.sign(null, raw, privateKey).toString('base64'));
  const verified = manager.verifyManifest(raw, signature);
  if (verified.version !== '1.0.166') throw new Error('Signed manifest version verification failed.');
  let rejected = false;
  try { manager.verifyManifest(raw, Buffer.from(crypto.randomBytes(64).toString('base64'))); } catch { rejected = true; }
  if (!rejected) throw new Error('Invalid release signature was accepted.');
  rejected = false;
  try {
    const unsafe = Buffer.from(JSON.stringify({ ...manifest, packageAsset: '../escape.tar.gz' }));
    manager.verifyManifest(unsafe, Buffer.from(crypto.sign(null, unsafe, privateKey).toString('base64')));
  } catch { rejected = true; }
  if (!rejected) throw new Error('Unsafe package filename was accepted.');
  rejected = false;
  try {
    const invalidTree = Buffer.from(JSON.stringify({ ...manifest, treeSha256: 'not-a-digest' }));
    manager.verifyManifest(invalidTree, Buffer.from(crypto.sign(null, invalidTree, privateKey).toString('base64')));
  } catch { rejected = true; }
  if (!rejected) throw new Error('Invalid release tree digest was accepted.');
  rejected = false;
  try {
    const incompatible = Buffer.from(JSON.stringify({ ...manifest, dataCompatibilityEpoch: 2 }));
    manager.verifyManifest(incompatible, Buffer.from(crypto.sign(null, incompatible, privateKey).toString('base64')));
  } catch { rejected = true; }
  if (!rejected) throw new Error('Incompatible data compatibility epoch was accepted.');

  for (const version of ['1.0.158', '1.0.159']) {
    const dir = path.join(releases, version);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'p2pflow', version }));
    fs.writeFileSync(path.join(dir, 'fixture.txt'), `release-${version}`);
    const tree = computeReleaseTreeSha256(dir);
    fs.writeFileSync(path.join(dir, '.release-manifest.json'), JSON.stringify({
      format: 1,
      product: 'p2pflow',
      dataCompatibilityEpoch: 1,
      version,
      node: '>=20.0.0',
      schema: { min: 25, max: 2147483647 },
      localInstall: true,
      treeSha256: tree.sha256,
      treeFiles: tree.fileCount,
      treeBytes: tree.totalBytes,
      installedAt: new Date().toISOString()
    }));
  }
  const untrusted = path.join(releases, '1.0.157');
  fs.mkdirSync(untrusted, { recursive: true });
  fs.writeFileSync(path.join(untrusted, 'package.json'), JSON.stringify({ name: 'p2pflow', version: '1.0.157' }));

  fs.symlinkSync(path.relative(temp, path.join(releases, '1.0.159')), current, 'dir');
  const installed = manager.listInstalledReleases();
  if (installed.length !== 2 || !installed.find(item => item.version === '1.0.159' && item.current)) throw new Error('Installed release discovery or manifest requirement failed.');
  if (!(compareSemver('1.0.166', '1.0.159') > 0 && compareSemver('1.0.158', '1.0.159') < 0)) throw new Error('Semantic version comparison failed.');
  console.log(JSON.stringify({
    ok: true,
    signedManifest: true,
    invalidSignatureRejected: true,
    unsafePackageRejected: true,
    treeDigestRequired: true,
    incompatibleDataEpochRejected: true,
    manifestRequiredForRollback: true,
    noReleaseIsValid: true,
    publishedReleaseDiscovery: true,
    highestSemanticReleaseSelected: true,
    repositorySourceVersionDetection: true,
    installedReleases: installed.map(item => item.version)
  }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
