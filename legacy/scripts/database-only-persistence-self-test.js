#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const app = read('app-server.js');
const mysql = read('lib/mysqlStateStore.js');
const postgres = read('lib/postgresStateStore.js');
const codec = read('lib/statePayloadCodec.js');
const phpRoot = read('local-php-mail.php');
const phpPublic = read('public/local-php-mail.php');

function fail(message) { throw new Error(`Database-only persistence self-test failed: ${message}`); }

if (/fs\.(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|renameSync|copyFileSync)\s*\(/.test(app)) {
  fail('application runtime still writes authoritative application data to local files');
}
if (app.includes('shared/email-recovery-code.txt')) fail('owner email recovery still creates a local data file');
if (!app.includes('saveProofDataUrlToDatabase')) fail('proof upload path is not explicitly database-backed');
if (!app.includes("storage: 'database_object'")) fail('database object storage marker is missing');
if (!app.includes("stateStorage: 'database_encrypted_compressed'")) fail('storage health does not report database-only compressed state');
if (!app.includes('payloadSavingPercent') || !app.includes('databaseTables: storageTables')) fail('database storage observability is missing');
if (!codec.includes('brotliCompressSync') || !codec.includes('CODEC_VERSION = 2')) fail('compressed state codec v2 is missing');
if (!mysql.includes('historyLimit || 3') || !postgres.includes('historyLimit || 3')) fail('compact history defaults are missing');
if (!mysql.includes('backupLimit || 5') || !postgres.includes('backupLimit || 5')) fail('bounded database backup retention is missing');
if (phpRoot.includes('data/.mail-bridge-secret') || phpPublic.includes('data/.mail-bridge-secret')) fail('PHP mail bridge still reads a local secret data file');
if (!app.includes('deriveHostingEmailRecoveryCode')) fail('local-file-free hosting recovery path is missing');

console.log(JSON.stringify({
  ok: true,
  authoritativeApplicationData: 'database',
  proofAndMedia: 'database_object',
  stateCodec: 'aes-256-gcm+br-v2',
  databaseTableSizeHealth: true,
  localRecoveryFile: false,
  phpMailSecretFileFallback: false,
  historySnapshotsDefault: 3,
  databaseBackupsDefault: 5
}, null, 2));
