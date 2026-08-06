'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createStateStore, normalizeDatabaseProvider } = require('./databaseProvider');

function clean(value, max = 500) {
  return String(value == null ? '' : value).replace(/[\r\n\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function decryptLegacyState(source, appKey) {
  const file = path.resolve(String(source || ''));
  const keyText = String(appKey || '');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Legacy encrypted database file was not found: ${file}`);
  if (fs.statSync(file).size > 256 * 1024 * 1024) throw new Error('Legacy encrypted database file is larger than the 256 MB safety limit.');
  if (keyText.length < 32) throw new Error('The exact permanent Application Key from the old installation is required.');
  let box;
  try { box = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error('Legacy database file is not valid encrypted JSON.'); }
  if (!box || !box.iv || !box.tag || !box.data) throw new Error('Legacy database file does not contain a supported encrypted payload.');
  try {
    const key = crypto.createHash('sha256').update(keyText).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
    const state = JSON.parse(Buffer.concat([decipher.update(Buffer.from(box.data, 'base64')), decipher.final()]).toString('utf8'));
    if (!state || typeof state !== 'object' || !Array.isArray(state.users) || !state.meta) throw new Error('Unsupported legacy state structure.');
    return state;
  } catch (error) {
    if (error.message === 'Unsupported legacy state structure.') throw error;
    throw new Error('Legacy data could not be decrypted. Use the exact Application Key from the old installation.');
  }
}

function hashPassword(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(value), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function applyOwnerOverride(state, owner = {}) {
  if (!state || !Array.isArray(state.users)) throw new Error('Legacy state has no user list.');
  const target = state.users.find(user => String(user.role || '').toLowerCase() === 'admin' && user.enabled !== false)
    || state.users.find(user => String(user.role || '').toLowerCase() === 'admin');
  if (!target) throw new Error('Legacy data has no Owner/Admin account to update.');
  const username = clean(owner.username, 120);
  const ownerName = clean(owner.ownerName || 'Owner', 160);
  const email = clean(owner.email, 180);
  const password = String(owner.password || '');
  const secretCode = String(owner.secretCode || '');
  if (!username || !email || password.length < 12 || !/^\d{6}$/.test(secretCode)) throw new Error('Valid Owner username, email, password and 6-digit secret are required for legacy import.');
  target.username = username;
  target.name = ownerName;
  target.email = email;
  target.passwordHash = hashPassword(password);
  target.loginSecretHash = hashPassword(secretCode);
  target.role = 'admin';
  target.enabled = true;
  target.securityHardenedAt = new Date().toISOString();
  return target;
}

function firstExistingPath(candidates) {
  return candidates.map(value => value && path.resolve(value)).find(value => value && fs.existsSync(value) && fs.statSync(value).isFile()) || '';
}

function collectLegacyFiles(state, source, legacyRoot) {
  let proofsImported = 0;
  let mediaImported = 0;
  const missing = [];
  const importRoot = path.resolve(legacyRoot || path.dirname(source));
  for (const proof of state.proofFiles || []) {
    if (proof.dataBase64 || proof.contentBase64) { proof.storage = 'database'; continue; }
    const file = firstExistingPath([
      proof.storagePath,
      proof.filename && path.join(importRoot, 'proofs', proof.filename),
      proof.filename && path.join(importRoot, 'data', 'proofs', proof.filename),
      proof.filename && path.join(path.dirname(source), 'proofs', proof.filename)
    ]);
    if (!file) { if (proof.filename) missing.push(`proof:${proof.filename}`); continue; }
    const buffer = fs.readFileSync(file);
    proof.dataBase64 = buffer.toString('base64');
    proof.sizeBytes = buffer.length;
    proof.storage = 'database';
    delete proof.storagePath;
    proofsImported += 1;
  }
  for (const media of state.chatMedia || []) {
    if (media.dataBase64) { media.storage = 'database'; continue; }
    const file = firstExistingPath([
      media.storagePath,
      media.filename && path.join(importRoot, 'chat-media', media.filename),
      media.filename && path.join(importRoot, 'public', 'chat-media', media.filename),
      media.filename && path.join(path.dirname(source), 'chat-media', media.filename)
    ]);
    if (!file) { if (media.filename) missing.push(`media:${media.filename}`); continue; }
    const buffer = fs.readFileSync(file);
    media.dataBase64 = buffer.toString('base64');
    media.sizeBytes = buffer.length;
    media.storage = 'database';
    media.token = media.token || crypto.randomBytes(32).toString('hex');
    delete media.storagePath;
    mediaImported += 1;
  }
  return { proofsImported, mediaImported, missing };
}

function inspectLegacyPackage(options = {}) {
  const source = path.resolve(String(options.source || ''));
  const state = decryptLegacyState(source, options.appKey);
  const fileImport = collectLegacyFiles(state, source, options.legacyRoot || path.dirname(source));
  return {
    state,
    fileImport,
    summary: {
      appVersion: String(state.meta?.appVersion || state.settings?.appVersion || ''),
      schemaVersion: Number(state.meta?.schemaVersion || 0),
      users: Array.isArray(state.users) ? state.users.length : 0,
      orders: Array.isArray(state.orders) ? state.orders.length : 0,
      ledgers: Array.isArray(state.ledgers) ? state.ledgers.length : 0,
      proofFiles: Array.isArray(state.proofFiles) ? state.proofFiles.length : 0,
      chatMedia: Array.isArray(state.chatMedia) ? state.chatMedia.length : 0,
      missingFiles: fileImport.missing.length
    }
  };
}

async function importLegacyToDatabase(options = {}) {
  const inspected = inspectLegacyPackage(options);
  if (inspected.fileImport.missing.length && !options.allowMissingFiles) {
    throw new Error(`Legacy data references ${inspected.fileImport.missing.length} missing attachment(s): ${inspected.fileImport.missing.slice(0, 8).join(', ')}. Copy the old proofs/chat-media folders into the legacy-import folder before continuing.`);
  }
  if (options.owner) applyOwnerOverride(inspected.state, options.owner);
  const provider = normalizeDatabaseProvider(options.provider, options.connectionString);
  const store = createStateStore({
    provider,
    connectionString: options.connectionString,
    table: options.table || 'p2pflow_state',
    appKey: options.appKey,
    appVersion: 'legacy-browser-import',
    poolMax: 2,
    ssl: options.ssl,
    instanceLockKey: `${options.table || 'p2pflow_state'}:legacy-browser-import`
  });
  try {
    await store.init();
    if (await store.hasMainState()) throw new Error('The selected database already contains P2PFlow data. Legacy import was not applied.');
    for (const proof of inspected.state.proofFiles || []) {
      const encoded = proof.dataBase64 || proof.contentBase64 || '';
      if (!encoded) continue;
      const buffer = Buffer.from(String(encoded), 'base64');
      proof.objectId = proof.objectId || `proof:${proof.id}:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
      await store.putObject(proof.objectId, buffer, { kind: 'proof', contentType: proof.mimeType, filename: proof.filename, metadata: { orderId: proof.orderId || null, splitId: proof.splitId || null } });
      proof.storage = 'database_object';
      proof.sizeBytes = buffer.length;
      delete proof.dataBase64;
      delete proof.contentBase64;
      delete proof.storagePath;
    }
    for (const media of inspected.state.chatMedia || []) {
      const encoded = media.dataBase64 || '';
      if (!encoded) continue;
      const buffer = Buffer.from(String(encoded), 'base64');
      media.objectId = media.objectId || `chat-media:${media.id}:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
      media.token = media.token || crypto.randomBytes(32).toString('hex');
      await store.putObject(media.objectId, buffer, { kind: 'chat_media', contentType: media.mimeType, filename: media.filename, metadata: { orderNo: media.orderNo || '' } });
      media.storage = 'database_object';
      media.sizeBytes = buffer.length;
      delete media.dataBase64;
      delete media.storagePath;
    }
    await store.writeState(inspected.state, 'browser_legacy_file_import');
    await store.createBackup(inspected.state, 'legacy_browser_import', { source: path.basename(options.source), ...inspected.fileImport });
    return { ...inspected.summary, revision: store.currentRevision, fileImport: inspected.fileImport };
  } finally {
    await store.close().catch(() => {});
  }
}

module.exports = {
  decryptLegacyState,
  applyOwnerOverride,
  collectLegacyFiles,
  inspectLegacyPackage,
  importLegacyToDatabase,
  importLegacyToPostgres: importLegacyToDatabase
};
