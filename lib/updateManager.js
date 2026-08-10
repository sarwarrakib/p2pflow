'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { assertReleaseTreeSafe, computeReleaseTreeSha256 } = require('./releaseIntegrity');

function clean(value, max = 500) {
  return String(value == null ? '' : value).replace(/[\r\n\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function parseSemver(value) {
  const match = String(value || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] || '' };
}

function compareSemver(a, b) {
  const av = parseSemver(a); const bv = parseSemver(b);
  if (!av || !bv) return String(a || '').localeCompare(String(b || ''));
  for (const key of ['major', 'minor', 'patch']) if (av[key] !== bv[key]) return av[key] > bv[key] ? 1 : -1;
  if (av.pre === bv.pre) return 0;
  if (!av.pre) return 1;
  if (!bv.pre) return -1;
  return av.pre.localeCompare(bv.pre);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env || process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', data => { if (stdout.length < 1024 * 1024) stdout += data.toString(); });
    child.stderr.on('data', data => { if (stderr.length < 1024 * 1024) stderr += data.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ code, stdout, stderr });
      else reject(Object.assign(new Error(`${command} exited with code ${code}: ${(stderr || stdout).slice(-2000)}`), { code, stdout, stderr }));
    });
  });
}

function safeReleaseVersion(value) {
  const version = clean(value, 80).replace(/^v/i, '');
  if (!parseSemver(version)) throw new Error(`Invalid release version: ${value}`);
  return version;
}

function ensureInside(parent, child) {
  const root = path.resolve(parent) + path.sep;
  const target = path.resolve(child);
  if (!(`${target}${path.sep}`).startsWith(root)) throw new Error('Unsafe release path.');
  return target;
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function updatePublicKeyFingerprint(key) {
  const publicKey = crypto.createPublicKey(key);
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return `sha256:${crypto.createHash('sha256').update(der).digest('hex')}`;
}

function hashFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

function validateBootstrapFiles(directory, manifest) {
  const files = manifest && manifest.bootstrapFiles;
  if (!files || typeof files !== 'object' || Array.isArray(files) || !Object.keys(files).length) {
    throw new Error('Local hosting release has no bootstrap file manifest.');
  }
  const root = path.resolve(directory);
  for (const [relative, expected] of Object.entries(files)) {
    if (!relative || relative.includes('\\') || relative.startsWith('/') || relative.split('/').includes('..')) {
      throw new Error(`Unsafe bootstrap file path: ${relative}`);
    }
    const full = path.resolve(root, relative);
    if (!(`${full}${path.sep}`).startsWith(`${root}${path.sep}`)) throw new Error(`Bootstrap file is outside the release: ${relative}`);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new Error(`Bootstrap file is missing: ${relative}`);
    const wantedHash = String(expected && expected.sha256 || '').toLowerCase();
    const wantedSize = Number(expected && expected.size);
    if (!/^[a-f0-9]{64}$/.test(wantedHash) || !Number.isSafeInteger(wantedSize) || wantedSize < 0) {
      throw new Error(`Bootstrap file metadata is invalid: ${relative}`);
    }
    const stat = fs.statSync(full);
    if (stat.size !== wantedSize || hashFileSha256(full).toLowerCase() !== wantedHash) {
      throw new Error(`Bootstrap file verification failed: ${relative}`);
    }
  }
}

class UpdateManager {
  constructor(options = {}) {
    this.currentVersion = String(options.currentVersion || '0.0.0');
    this.schemaVersion = Number(options.schemaVersion || 0);
    this.dataCompatibilityEpoch = Number(options.dataCompatibilityEpoch || 1);
    this.installRoot = path.resolve(options.installRoot || path.join(process.cwd(), '..'));
    this.releasesDir = path.resolve(options.releasesDir || path.join(this.installRoot, 'releases'));
    this.sharedDir = path.resolve(options.sharedDir || path.join(this.installRoot, 'shared'));
    this.cacheDir = path.resolve(options.cacheDir || path.join(this.sharedDir, 'update-cache'));
    this.currentLink = path.resolve(options.currentLink || path.join(this.installRoot, 'current'));
    this.currentPointer = path.resolve(options.currentPointer || path.join(this.sharedDir, 'current-release.json'));
    this.repository = clean(options.repository || process.env.P2PFLOW_GITHUB_REPOSITORY || process.env.CRM_GITHUB_REPOSITORY || '', 240).replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
    this.token = String(options.token || process.env.P2PFLOW_GITHUB_TOKEN || process.env.CRM_GITHUB_TOKEN || '').trim();
    this.apiVersion = clean(options.apiVersion || process.env.P2PFLOW_GITHUB_API_VERSION || process.env.CRM_GITHUB_API_VERSION || '2026-03-10', 30);
    this.publicKey = String(options.publicKey || process.env.P2PFLOW_UPDATE_PUBLIC_KEY || process.env.CRM_UPDATE_PUBLIC_KEY || '').trim().replace(/\\n/g, '\n');
    this.requireSignature = String(options.requireSignature ?? process.env.P2PFLOW_UPDATE_REQUIRE_SIGNATURE ?? process.env.CRM_UPDATE_REQUIRE_SIGNATURE ?? 'true').toLowerCase() !== 'false';
    this.manifestAssetName = clean(options.manifestAssetName || process.env.P2PFLOW_UPDATE_MANIFEST_ASSET || process.env.CRM_UPDATE_MANIFEST_ASSET || 'p2pflow-update-manifest.json', 160);
    this.signatureAssetName = clean(options.signatureAssetName || process.env.P2PFLOW_UPDATE_SIGNATURE_ASSET || process.env.CRM_UPDATE_SIGNATURE_ASSET || 'p2pflow-update-manifest.sig', 160);
    this.allowPrerelease = String(options.allowPrerelease ?? process.env.P2PFLOW_UPDATE_ALLOW_PRERELEASE ?? process.env.CRM_UPDATE_ALLOW_PRERELEASE ?? 'false').toLowerCase() === 'true';
    this.maxPackageBytes = Math.max(16, Number(options.maxPackageMb || process.env.P2PFLOW_UPDATE_MAX_PACKAGE_MB || process.env.CRM_UPDATE_MAX_PACKAGE_MB || 512) || 512) * 1024 * 1024;
    this.maxExtractedBytes = Math.max(64, Number(options.maxExtractedMb || process.env.P2PFLOW_UPDATE_MAX_EXTRACTED_MB || process.env.CRM_UPDATE_MAX_EXTRACTED_MB || 2048) || 2048) * 1024 * 1024;
    this.maxReleaseFiles = Math.max(1000, Number(options.maxReleaseFiles || process.env.P2PFLOW_UPDATE_MAX_RELEASE_FILES || process.env.CRM_UPDATE_MAX_RELEASE_FILES || 100000) || 100000);
    this.maxMetadataBytes = Math.max(64, Number(options.maxMetadataKb || process.env.P2PFLOW_UPDATE_MAX_METADATA_KB || process.env.CRM_UPDATE_MAX_METADATA_KB || 4096) || 4096) * 1024;
  }

  reconfigure(options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, 'repository')) this.repository = clean(options.repository || '', 240).replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
    if (Object.prototype.hasOwnProperty.call(options, 'token')) this.token = String(options.token || '').trim();
    if (Object.prototype.hasOwnProperty.call(options, 'apiVersion')) this.apiVersion = clean(options.apiVersion || '2026-03-10', 30);
    if (Object.prototype.hasOwnProperty.call(options, 'publicKey')) this.publicKey = String(options.publicKey || '').trim().replace(/\\n/g, '\n');
    if (Object.prototype.hasOwnProperty.call(options, 'requireSignature')) this.requireSignature = options.requireSignature !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'allowPrerelease')) this.allowPrerelease = options.allowPrerelease === true;
    return this;
  }

  pointerTarget() {
    try {
      const record = JSON.parse(fs.readFileSync(this.currentPointer, 'utf8'));
      const candidate = path.resolve(record.directory || path.join(this.releasesDir, String(record.version || '')));
      return fs.existsSync(candidate) ? fs.realpathSync(candidate) : '';
    } catch { return ''; }
  }

  isManagedInstall() {
    try {
      const current = this.currentResolvedPath();
      return Boolean(current && fs.existsSync(this.releasesDir) && ensureInside(this.releasesDir, current));
    } catch { return false; }
  }

  configStatus() {
    const parts = this.repository.split('/').filter(Boolean);
    const managedInstall = this.isManagedInstall();
    const sharedHostingEntry = String(process.env.P2PFLOW_SHARED_HOSTING_ENTRY || process.env.CRM_SHARED_HOSTING_ENTRY || '').toLowerCase() === 'true';
    const launcherConnected = Boolean(process.send) || sharedHostingEntry;
    const repositoryConfigured = parts.length === 2;
    const tokenConfigured = Boolean(this.token);
    const publicKeyConfigured = Boolean(this.publicKey);
    let publicKeyFingerprint = '';
    if (publicKeyConfigured) {
      try { publicKeyFingerprint = updatePublicKeyFingerprint(this.publicKey); } catch {}
    }
    const connectionReady = repositoryConfigured && tokenConfigured;
    const releaseSecurityReady = !this.requireSignature || publicKeyConfigured;
    const automaticInstallReady = managedInstall && launcherConnected;
    return {
      managedInstall,
      sharedHostingEntry,
      installationMode: automaticInstallReady ? (sharedHostingEntry ? 'shared-hosting' : 'managed') : 'direct',
      installRoot: this.installRoot,
      repository: repositoryConfigured ? this.repository : '',
      repositoryUrl: repositoryConfigured ? `https://github.com/${this.repository}` : '',
      repositoryConfigured,
      tokenConfigured,
      connectionReady,
      signatureRequired: this.requireSignature,
      publicKeyConfigured,
      publicKeyFingerprint,
      releaseSecurityReady,
      launcherConnected,
      automaticInstallReady,
      ready: connectionReady && releaseSecurityReady && automaticInstallReady
    };
  }

  githubHeaders(accept = 'application/vnd.github+json') {
    const headers = {
      Accept: accept,
      'X-GitHub-Api-Version': this.apiVersion,
      'User-Agent': `P2PFlow/${this.currentVersion}`
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return headers;
  }

  async githubFetch(url, options = {}) {
    if (typeof fetch !== 'function') throw new Error('Node.js 20+ is required for the update client.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 30000));
    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: { ...this.githubHeaders(options.accept), ...(options.headers || {}) },
        redirect: 'follow',
        signal: controller.signal
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`GitHub request failed (${response.status}): ${text.slice(0, 500) || response.statusText}`);
      }
      return response;
    } finally { clearTimeout(timeout); }
  }

  repositoryParts() {
    const parts = this.repository.split('/').filter(Boolean);
    if (parts.length !== 2) throw new Error('Set P2PFLOW_GITHUB_REPOSITORY to owner/repository.');
    if (!this.token) throw new Error('Set P2PFLOW_GITHUB_TOKEN to a fine-grained token with Contents: read for the private repository.');
    return { owner: parts[0], repo: parts[1] };
  }

  async repositoryInfo() {
    const { owner, repo } = this.repositoryParts();
    const response = await this.githubFetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
    const data = await response.json();
    return {
      fullName: clean(data.full_name || `${owner}/${repo}`, 240),
      private: Boolean(data.private),
      defaultBranch: clean(data.default_branch || '', 120),
      htmlUrl: clean(data.html_url || `https://github.com/${owner}/${repo}`, 500),
      permissions: data.permissions ? {
        pull: Boolean(data.permissions.pull),
        push: Boolean(data.permissions.push),
        admin: Boolean(data.permissions.admin)
      } : null
    };
  }

  async repositorySourceVersion() {
    const { owner, repo } = this.repositoryParts();
    const response = await this.githubFetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/package.json`);
    const data = await response.json();
    if (!data || String(data.encoding || '').toLowerCase() !== 'base64' || !data.content) throw new Error('GitHub repository package.json could not be read.');
    const pkg = JSON.parse(Buffer.from(String(data.content).replace(/\s+/g, ''), 'base64').toString('utf8'));
    const version = safeReleaseVersion(pkg.version);
    return { version, sha: clean(data.sha || '', 80), htmlUrl: clean(data.html_url || '', 500), updateAvailable: compareSemver(version, this.currentVersion) > 0 };
  }

  async latestRelease() {
    const { owner, repo } = this.repositoryParts();
    // Listing releases returns an empty array when a connected repository has no
    // published release. The old /releases/latest endpoint returned an ambiguous
    // 404 for that normal first-run state, which looked like a broken connection.
    const response = await this.githubFetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=20`);
    const releases = await response.json();
    if (!Array.isArray(releases)) throw new Error('GitHub returned an invalid releases response.');
    const candidates = releases
      .filter(item => item && !item.draft && (this.allowPrerelease || !item.prerelease))
      .map(item => {
        try { return { item, version: safeReleaseVersion(item.tag_name || item.name) }; }
        catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => compareSemver(b.version, a.version));
    if (!candidates.length) return null;
    const release = candidates[0].item;
    const version = candidates[0].version;
    return {
      id: release.id,
      tag: release.tag_name,
      version,
      name: clean(release.name || release.tag_name, 180),
      body: String(release.body || '').slice(0, 12000),
      publishedAt: release.published_at || release.created_at || null,
      htmlUrl: release.html_url || '',
      prerelease: Boolean(release.prerelease),
      assets: Array.isArray(release.assets) ? release.assets.map(asset => ({ id: asset.id, name: asset.name, size: asset.size, contentType: asset.content_type })) : [],
      updateAvailable: compareSemver(version, this.currentVersion) > 0
    };
  }

  assetByName(release, name) {
    const asset = (release.assets || []).find(item => item.name === name);
    if (!asset) throw new Error(`Release asset not found: ${name}`);
    return asset;
  }

  async downloadAsset(asset, destination = null) {
    const { owner, repo } = this.repositoryParts();
    const limit = destination ? this.maxPackageBytes : this.maxMetadataBytes;
    if (Number(asset.size || 0) > limit) throw new Error(`Release asset ${asset.name} exceeds the allowed size limit.`);
    const response = await this.githubFetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/assets/${asset.id}`, { accept: 'application/octet-stream', timeoutMs: destination ? 300000 : 120000 });
    if (!destination) {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) throw new Error(`Downloaded release asset is empty: ${asset.name}`);
      if (buffer.length > limit) throw new Error(`Release asset ${asset.name} exceeds the allowed size limit.`);
      return buffer;
    }
    if (!response.body) throw new Error(`Release asset ${asset.name} has no response body.`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.part-${process.pid}-${Date.now()}`;
    const output = fs.createWriteStream(temporary, { mode: 0o600, flags: 'wx' });
    const hash = crypto.createHash('sha256');
    let size = 0;
    const guard = new Transform({
      transform(chunk, encoding, callback) {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > limit) return callback(new Error(`Release asset ${asset.name} exceeds the allowed size limit.`));
        hash.update(buffer);
        callback(null, buffer);
      }
    });
    try {
      await pipeline(Readable.fromWeb(response.body), guard, output);
      if (!size) throw new Error(`Downloaded release asset is empty: ${asset.name}`);
      fs.renameSync(temporary, destination);
      return { path: destination, size, sha256: hash.digest('hex') };
    } catch (error) {
      try { fs.unlinkSync(temporary); } catch {}
      throw error;
    }
  }

  normalizeManifest(input, options = {}) {
    const requirePackage = options.requirePackage !== false;
    const manifest = { ...(input || {}) };
    manifest.version = safeReleaseVersion(manifest.version || manifest.tag);
    if (!['p2pflow', 'manual-p2p-desk-crm'].includes(String(manifest.product || ''))) throw new Error('Release manifest product does not match P2PFlow.');
    if (!isPositiveInteger(manifest.dataCompatibilityEpoch)) throw new Error('Release manifest dataCompatibilityEpoch is invalid.');
    manifest.dataCompatibilityEpoch = Number(manifest.dataCompatibilityEpoch);
    if (manifest.dataCompatibilityEpoch !== this.dataCompatibilityEpoch) {
      throw new Error(`Release ${manifest.version} uses data compatibility epoch ${manifest.dataCompatibilityEpoch}; this database uses epoch ${this.dataCompatibilityEpoch}. Code switching across a breaking data epoch is blocked to protect transactions.`);
    }
    if (!/^[a-f0-9]{64}$/i.test(String(manifest.treeSha256 || ''))) throw new Error('Release manifest tree SHA-256 is invalid.');
    if (!isPositiveInteger(manifest.treeFiles) || Number(manifest.treeFiles) > this.maxReleaseFiles) throw new Error('Release manifest treeFiles is invalid or exceeds the configured file limit.');
    if (!Number.isSafeInteger(Number(manifest.treeBytes)) || Number(manifest.treeBytes) < 0 || Number(manifest.treeBytes) > this.maxExtractedBytes) throw new Error('Release manifest treeBytes is invalid or exceeds the configured extracted-size limit.');
    manifest.treeFiles = Number(manifest.treeFiles);
    manifest.treeBytes = Number(manifest.treeBytes);
    if (requirePackage) {
      if (!manifest.packageAsset || !manifest.sha256 || !isPositiveInteger(manifest.packageBytes)) throw new Error('Release manifest is missing packageAsset, packageBytes or sha256.');
      if (path.basename(String(manifest.packageAsset)) !== String(manifest.packageAsset) || !/^[a-zA-Z0-9._-]+\.tar\.gz$/.test(String(manifest.packageAsset))) throw new Error('Release packageAsset must be a safe .tar.gz filename.');
      if (!/^[a-f0-9]{64}$/i.test(String(manifest.sha256))) throw new Error('Release manifest SHA-256 is invalid.');
      if (Number(manifest.packageBytes) > this.maxPackageBytes) throw new Error('Release manifest packageBytes exceeds the configured update limit.');
    }
    const requiredNodeMajor = Number(String(manifest.node || '').match(/(\d+)/)?.[1] || 20);
    const currentNodeMajor = Number(process.versions.node.split('.')[0] || 0);
    if (currentNodeMajor < requiredNodeMajor) throw new Error(`Release ${manifest.version} requires Node.js ${requiredNodeMajor} or newer.`);
    const schema = manifest.schema || {};
    const minSchema = Number(schema.min ?? 0);
    const maxSchema = Number(schema.max ?? Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(minSchema) || !Number.isSafeInteger(maxSchema) || minSchema < 0 || maxSchema < minSchema) throw new Error('Release manifest schema range is invalid.');
    manifest.schema = { min: minSchema, max: maxSchema };
    if (this.schemaVersion < minSchema || this.schemaVersion > maxSchema) {
      throw new Error(`Release ${manifest.version} supports database schema ${minSchema}-${maxSchema}; current schema is ${this.schemaVersion}.`);
    }
    return manifest;
  }

  verifyManifest(rawManifest, rawSignature) {
    const manifest = this.normalizeManifest(JSON.parse(rawManifest.toString('utf8')), { requirePackage: true });
    if (this.requireSignature) {
      if (!this.publicKey) throw new Error('P2PFLOW_UPDATE_PUBLIC_KEY is required because signed updates are enabled.');
      if (!rawSignature || !rawSignature.length) throw new Error('Release signature asset is missing or empty.');
      const signatureText = rawSignature.toString('utf8').trim();
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signatureText)) throw new Error('Release manifest signature encoding is invalid.');
      const signature = Buffer.from(signatureText, 'base64');
      if (signature.length !== 64) throw new Error('Release manifest signature length is invalid.');
      let configuredFingerprint = '';
      try { configuredFingerprint = updatePublicKeyFingerprint(this.publicKey); }
      catch { throw new Error('Configured update public key is invalid. Generate a new signing key and save its private key in GitHub Actions.'); }
      const releaseFingerprint = String(manifest.signingKeyFingerprint || '').trim().toLowerCase();
      if (releaseFingerprint) {
        if (!/^sha256:[a-f0-9]{64}$/.test(releaseFingerprint)) throw new Error('Release manifest signing-key fingerprint is invalid.');
        if (releaseFingerprint !== configuredFingerprint.toLowerCase()) {
          throw new Error(`Release signing key does not match this P2PFlow installation (release ${releaseFingerprint.slice(0, 19)}…, configured ${configuredFingerprint.slice(0, 19)}…). Publish a new release after updating GitHub secret UPDATE_SIGNING_PRIVATE_KEY.`);
        }
      }
      const valid = crypto.verify(null, rawManifest, this.publicKey, signature);
      if (!valid) throw new Error('Release manifest signature verification failed. The release assets may have been signed with a different key or modified after signing.');
    }
    return manifest;
  }

  async fetchVerifiedManifest(release) {
    const manifestAsset = this.assetByName(release, this.manifestAssetName);
    const manifestRaw = await this.downloadAsset(manifestAsset);
    let signatureRaw = null;
    const signatureAsset = (release.assets || []).find(item => item.name === this.signatureAssetName);
    if (signatureAsset) signatureRaw = await this.downloadAsset(signatureAsset);
    const manifest = this.verifyManifest(manifestRaw, signatureRaw);
    if (manifest.version !== release.version) throw new Error(`Release tag ${release.version} does not match manifest version ${manifest.version}.`);
    return { manifest, manifestRaw, signatureRaw };
  }

  async validateTarEntries(packagePath, manifest) {
    const plain = await run('tar', ['-tzf', packagePath]);
    const entries = plain.stdout.split(/\r?\n/).filter(Boolean);
    if (!entries.length) throw new Error('Release package is empty.');
    let topDirectory = '';
    const stripped = new Set();
    for (const entry of entries) {
      if (entry.includes('\\')) throw new Error(`Backslashes are not allowed in release package paths: ${entry}`);
      const normalized = entry.replace(/\/+$/, '');
      if (!normalized) continue;
      if (normalized.startsWith('/') || normalized.split('/').includes('..')) throw new Error(`Unsafe path in release package: ${entry}`);
      const parts = normalized.split('/').filter(Boolean);
      if (!topDirectory) topDirectory = parts[0] || '';
      if (!topDirectory || parts[0] !== topDirectory) throw new Error('Release package must contain exactly one top-level directory.');
      if (parts.length > 1) {
        const target = parts.slice(1).join('/');
        if (stripped.has(target)) throw new Error(`Duplicate path after extraction: ${target}`);
        stripped.add(target);
      }
    }
    if (!topDirectory || !stripped.size) throw new Error('Release package does not contain application files.');
    const verbose = await run('tar', ['--numeric-owner', '-tvzf', packagePath]);
    let fileCount = 0;
    let totalBytes = 0;
    for (const line of verbose.stdout.split(/\r?\n/).filter(Boolean)) {
      const kind = line.charAt(0);
      if (kind === 'l' || kind === 'h') throw new Error('Release packages may not contain symbolic links or hard links.');
      if (!['-', 'd'].includes(kind)) throw new Error(`Unsupported file type in release package: ${line.slice(0, 120)}`);
      if (kind === '-') {
        const sizeMatch = line.match(/^\S+\s+\S+\s+(\d+)\s+\d{4}-\d{2}-\d{2}\s+/);
        if (!sizeMatch) throw new Error(`Could not verify release file size from tar listing: ${line.slice(0, 160)}`);
        fileCount += 1;
        totalBytes += Number(sizeMatch[1]);
        if (fileCount > this.maxReleaseFiles || totalBytes > this.maxExtractedBytes) throw new Error('Release package exceeds the configured extracted file/count limit.');
      }
    }
    if (manifest && (fileCount !== Number(manifest.treeFiles) || totalBytes !== Number(manifest.treeBytes))) {
      throw new Error('Release package file count/size does not match the signed manifest.');
    }
    return { entries, fileCount, totalBytes };
  }

  async validateReleaseDirectory(directory, manifest) {
    ensureInside(this.releasesDir, directory);
    assertReleaseTreeSafe(directory);
    for (const required of ['server.js', 'app-server.js', 'package.json', 'public/index.html', 'lib/binanceAdapter.js', 'lib/releaseIntegrity.js']) {
      if (!fs.existsSync(path.join(directory, required))) throw new Error(`Release is missing ${required}.`);
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    if (String(pkg.version) !== String(manifest.version)) throw new Error(`package.json version ${pkg.version} does not match manifest ${manifest.version}.`);
    const dependencyRoots = [path.join(directory, 'node_modules'), path.join(this.installRoot, 'node_modules')];
    const dependencyReady = name => dependencyRoots.some(root => fs.existsSync(path.join(root, name, 'package.json')));
    for (const dependency of ['mysql2', 'pg', 'ws']) {
      if (!dependencyReady(dependency)) throw new Error(`Production dependency ${dependency} is missing. Use the hosting panel Run NPM Install button once.`);
    }
    let tree;
    if (manifest.localInstall === true && manifest.bootstrapMode === 'critical-files') {
      validateBootstrapFiles(directory, manifest);
      tree = computeReleaseTreeSha256(directory);
    } else {
      tree = computeReleaseTreeSha256(directory);
      if (tree.sha256.toLowerCase() !== String(manifest.treeSha256).toLowerCase()) throw new Error('Release directory tree SHA-256 does not match the verified manifest.');
      if (tree.fileCount !== Number(manifest.treeFiles) || tree.totalBytes !== Number(manifest.treeBytes)) throw new Error('Release directory file count/size does not match the verified manifest.');
    }
    const testEnv = { ...process.env, P2PFLOW_APP_KEY: process.env.P2PFLOW_APP_KEY || process.env.CRM_APP_KEY || 'self-test-only-key-self-test-only-key' };
    // Signed GitHub releases already pass the complete test suite in CI. On shared
    // hosting, repeating every self-test while an HTTP request is waiting can hit
    // the provider connection timeout and make the Update button fall back from
    // "Verifying..." without ever reaching the activation step. Always perform
    // local syntax/runtime dependency checks, but keep the expensive full suite
    // for legacy/local packages that were not produced by the signed CI profile.
    await run(process.execPath, ['--check', 'server.js'], { cwd: directory });
    await run(process.execPath, ['--check', 'app-server.js'], { cwd: directory });
    const signedCiRuntime = manifest.localInstall !== true && manifest.verificationProfile === 'signed-ci-runtime';
    if (!signedCiRuntime) {
      for (const script of ['scripts/release-self-test.js', 'scripts/postgres-state-crypto-self-test.js', 'scripts/update-manager-self-test.js']) {
        if (fs.existsSync(path.join(directory, script))) await run(process.execPath, [script], { cwd: directory, env: testEnv });
      }
      await run(process.execPath, ['app-server.js', '--accounting-self-test'], { cwd: directory, env: testEnv });
    }
    return { version: pkg.version, tree };
  }

  async validateInstalledRelease(itemOrDirectory) {
    const directory = ensureInside(this.releasesDir, typeof itemOrDirectory === 'string' ? itemOrDirectory : itemOrDirectory?.directory);
    const hiddenManifestPath = path.join(directory, '.release-manifest.json');
    const visibleManifestPath = path.join(directory, 'release-manifest.json');
    const manifestPath = fs.existsSync(hiddenManifestPath) ? hiddenManifestPath : visibleManifestPath;
    if (!fs.existsSync(manifestPath)) throw new Error('Installed release has no release manifest and cannot be selected.');
    const rawManifest = fs.readFileSync(manifestPath);
    const parsed = JSON.parse(rawManifest.toString('utf8'));
    let manifest;
    if (parsed.localInstall === true) {
      manifest = this.normalizeManifest(parsed, { requirePackage: false });
    } else {
      const signaturePath = path.join(directory, '.release-manifest.sig');
      if (!fs.existsSync(signaturePath)) throw new Error('Installed GitHub release has no stored signature.');
      manifest = this.verifyManifest(rawManifest, fs.readFileSync(signaturePath));
    }
    await this.validateReleaseDirectory(directory, manifest);
    return { version: manifest.version, directory, manifest, current: path.resolve(directory) === this.currentResolvedPath() };
  }

  async stageLatest() {
    const release = await this.latestRelease();
    if (!release) return { release: null, staged: false, reason: 'no_release' };
    if (!release.updateAvailable) return { release, staged: false, reason: 'already_current' };
    const verified = await this.fetchVerifiedManifest(release);
    const manifest = verified.manifest;
    const packageAsset = this.assetByName(release, manifest.packageAsset);
    if (Number(packageAsset.size || 0) && Number(packageAsset.size) !== Number(manifest.packageBytes)) throw new Error('GitHub release asset size does not match the signed manifest.');
    const version = safeReleaseVersion(manifest.version);
    const finalDir = ensureInside(this.releasesDir, path.join(this.releasesDir, version));
    fs.mkdirSync(this.releasesDir, { recursive: true });
    if (fs.existsSync(finalDir)) {
      await this.validateReleaseDirectory(finalDir, manifest);
      fs.writeFileSync(path.join(finalDir, '.release-manifest.json'), verified.manifestRaw, { mode: 0o600 });
      if (verified.signatureRaw) fs.writeFileSync(path.join(finalDir, '.release-manifest.sig'), verified.signatureRaw, { mode: 0o600 });
      return { release, manifest, staged: true, reused: true, targetDir: finalDir };
    }
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const nonce = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const packagePath = path.join(this.cacheDir, `${version}-${nonce}.tar.gz`);
    const stageDir = ensureInside(this.releasesDir, path.join(this.releasesDir, `.stage-${version}-${nonce}`));
    try {
      const downloaded = await this.downloadAsset(packageAsset, packagePath);
      if (downloaded.size !== Number(manifest.packageBytes)) throw new Error('Downloaded release package size does not match the signed manifest.');
      const digest = downloaded.sha256;
      if (digest.toLowerCase() !== String(manifest.sha256).toLowerCase()) throw new Error('Release package SHA-256 does not match the signed manifest.');
      await this.validateTarEntries(packagePath, manifest);
      fs.mkdirSync(stageDir, { recursive: true });
      await run('tar', ['--no-same-owner', '--no-same-permissions', '--strip-components=1', '-xzf', packagePath, '-C', stageDir]);
      await this.validateReleaseDirectory(stageDir, manifest);
      fs.writeFileSync(path.join(stageDir, '.release-manifest.json'), verified.manifestRaw, { mode: 0o600 });
      if (verified.signatureRaw) fs.writeFileSync(path.join(stageDir, '.release-manifest.sig'), verified.signatureRaw, { mode: 0o600 });
      fs.renameSync(stageDir, finalDir);
      return { release, manifest, staged: true, reused: false, targetDir: finalDir, sha256: digest };
    } finally {
      try { if (fs.existsSync(packagePath)) fs.unlinkSync(packagePath); } catch {}
      try { if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true }); } catch {}
    }
  }

  localReleaseInfo(directory) {
    const hiddenManifestPath = path.join(directory, '.release-manifest.json');
    const visibleManifestPath = path.join(directory, 'release-manifest.json');
    const manifestPath = fs.existsSync(hiddenManifestPath) ? hiddenManifestPath : visibleManifestPath;
    const pkgPath = path.join(directory, 'package.json');
    if (!fs.existsSync(pkgPath) || !fs.existsSync(manifestPath)) return null;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const manifest = this.normalizeManifest(rawManifest, { requirePackage: rawManifest.localInstall !== true });
      if (String(pkg.version) !== String(manifest.version)) return null;
      let resolvedDirectory = path.resolve(directory);
      try { resolvedDirectory = fs.realpathSync(directory); } catch {}
      return {
        version: manifest.version,
        directory,
        manifest,
        current: resolvedDirectory === this.currentResolvedPath()
      };
    } catch { return null; }
  }

  currentResolvedPath() {
    const pointed = this.pointerTarget();
    if (pointed) return pointed;
    try { return fs.realpathSync(this.currentLink); } catch {}
    const cwd = path.resolve(process.cwd());
    try { return ensureInside(this.releasesDir, cwd); } catch { return cwd; }
  }

  listInstalledReleases() {
    if (!fs.existsSync(this.releasesDir)) return [];
    return fs.readdirSync(this.releasesDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.stage-') && !entry.name.startsWith('.install-'))
      .map(entry => this.localReleaseInfo(path.join(this.releasesDir, entry.name)))
      .filter(Boolean)
      .sort((a, b) => compareSemver(b.version, a.version));
  }

  releaseByVersion(version) {
    const wanted = safeReleaseVersion(version);
    return this.listInstalledReleases().find(item => item.version === wanted) || null;
  }
}

module.exports = { UpdateManager, compareSemver, parseSemver, safeReleaseVersion, run };
