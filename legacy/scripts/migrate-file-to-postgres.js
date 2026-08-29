#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PostgresStateStore } = require('../lib/postgresStateStore');

function loadEnv(file) {
  if (!file || !fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const text = line.trim(); if (!text || text.startsWith('#')) continue;
    const index = text.indexOf('='); if (index < 1) continue;
    const key = text.slice(0, index).trim().replace(/^export\s+/, '');
    let value = text.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value.replace(/\\n/g, '\n');
  }
}

loadEnv(process.env.CRM_ENV_FILE || path.join(__dirname, '..', '.env'));
const source = path.resolve(process.env.CRM_LEGACY_DB_FILE || process.argv[2] || path.join(__dirname, '..', 'legacy-import', 'app.db.enc'));
const appKey = String(process.env.CRM_APP_KEY || '');
if (!fs.existsSync(source)) throw new Error(`Legacy encrypted database file not found: ${source}`);
if (appKey.length < 32) throw new Error('Set the same CRM_APP_KEY that encrypted the legacy database.');
const box = JSON.parse(fs.readFileSync(source, 'utf8'));
const key = crypto.createHash('sha256').update(appKey).digest();
const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'));
decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
const state = JSON.parse(Buffer.concat([decipher.update(Buffer.from(box.data, 'base64')), decipher.final()]).toString('utf8'));
const legacyRoot = path.resolve(process.env.CRM_LEGACY_ROOT || path.dirname(path.dirname(source)));

function firstExistingPath(candidates) {
  return candidates.map(value => value && path.resolve(value)).find(value => value && fs.existsSync(value) && fs.statSync(value).isFile()) || '';
}

function importLegacyFiles(target) {
  let proofsImported = 0;
  let mediaImported = 0;
  const missing = [];
  for (const proof of target.proofFiles || []) {
    if (proof.dataBase64) { proof.storage = 'database'; continue; }
    const file = firstExistingPath([
      proof.storagePath,
      proof.filename && path.join(legacyRoot, 'data', 'proofs', proof.filename),
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
  for (const media of target.chatMedia || []) {
    if (media.dataBase64) { media.storage = 'database'; continue; }
    const file = firstExistingPath([
      media.storagePath,
      media.filename && path.join(legacyRoot, 'public', 'chat-media', media.filename)
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

const fileImport = importLegacyFiles(state);
if (fileImport.missing.length && String(process.env.CRM_ALLOW_MISSING_LEGACY_FILES || 'false').toLowerCase() !== 'true') {
  throw new Error(`Legacy database references ${fileImport.missing.length} missing file(s): ${fileImport.missing.slice(0, 10).join(', ')}. Copy the old data/proofs and public/chat-media folders under CRM_LEGACY_ROOT, or set CRM_ALLOW_MISSING_LEGACY_FILES=true only after accepting those missing attachments.`);
}

(async () => {
  const sslEnabled = String(process.env.CRM_POSTGRES_SSL || 'false').toLowerCase() === 'true';
  const store = new PostgresStateStore({
    connectionString: process.env.CRM_DATABASE_URL || process.env.DATABASE_URL,
    table: process.env.CRM_POSTGRES_TABLE || 'crm_state',
    appKey,
    appVersion: 'legacy-import',
    poolMax: 2,
    ssl: sslEnabled ? { rejectUnauthorized: String(process.env.CRM_POSTGRES_SSL_REJECT_UNAUTHORIZED || 'false').toLowerCase() === 'true' } : undefined,
    instanceLockKey: process.env.CRM_INSTANCE_LOCK_KEY || `${process.env.CRM_POSTGRES_TABLE || 'crm_state'}:single-instance`
  });
  await store.init();
  const main = `"${store.table.replace(/"/g, '""')}"`;
  const existing = await store.pool.query(`SELECT id, payload, checksum, revision FROM ${main} WHERE id=$1`, ['main']);
  const forced = String(process.env.CRM_FORCE_LEGACY_IMPORT || 'false').toLowerCase() === 'true';
  if (existing.rows.length && !forced) throw new Error('PostgreSQL database already contains application data. Leave it untouched or set CRM_FORCE_LEGACY_IMPORT=true only for an intentional replacement.');
  if (existing.rows.length && forced) {
    const current = store.decryptObject(existing.rows[0].payload);
    store.currentRevision = Number(existing.rows[0].revision || 0);
    await store.createBackup(current, 'pre_forced_legacy_import', { sourceRevision: store.currentRevision, replacementSource: path.basename(source) });
  }
  for (const proof of state.proofFiles || []) {
    const encoded = proof.dataBase64 || proof.contentBase64 || '';
    if (!encoded) continue;
    const buffer = Buffer.from(String(encoded), 'base64');
    proof.objectId = proof.objectId || `proof:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
    await store.putObject(proof.objectId, buffer, { kind: 'proof', contentType: proof.mimeType, filename: proof.filename, metadata: { orderId: proof.orderId || null, splitId: proof.splitId || null } });
    proof.storage = 'postgres_object';
    proof.sizeBytes = buffer.length;
    delete proof.dataBase64;
    delete proof.contentBase64;
    delete proof.storagePath;
  }
  for (const media of state.chatMedia || []) {
    const encoded = media.dataBase64 || '';
    if (!encoded) continue;
    const buffer = Buffer.from(String(encoded), 'base64');
    media.objectId = media.objectId || `chat-media:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
    media.token = media.token || crypto.randomBytes(32).toString('hex');
    await store.putObject(media.objectId, buffer, { kind: 'chat_media', contentType: media.mimeType, filename: media.filename, metadata: { orderNo: media.orderNo || '' } });
    media.storage = 'postgres_object';
    media.sizeBytes = buffer.length;
    delete media.dataBase64;
    delete media.storagePath;
  }
  await store.writeState(state, 'one_time_legacy_file_import');
  await store.createBackup(state, 'legacy_file_import', { source: path.basename(source), ...fileImport });
  console.log(JSON.stringify({ ok: true, source, schemaVersion: Number(state.meta && state.meta.schemaVersion || 0), revision: store.currentRevision, fileImport }, null, 2));
  await store.close();
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
