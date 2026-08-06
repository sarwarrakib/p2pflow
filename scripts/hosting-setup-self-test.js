#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {
  applyP2PFlowEnvAliases,
  buildDatabaseUrl,
  validateOwner,
  upsertEnvFile,
  parseEnvText,
  setupPaths,
  configuredSetupValues,
  ensureSetupCode,
  markSetupComplete,
  sanitizeFreshOwnerSecrets
} = require('../lib/hostingSetup');
const { inspectLegacyPackage, applyOwnerOverride } = require('../lib/legacyImporter');

const env = { P2PFLOW_DATABASE_PROVIDER: 'mysql', P2PFLOW_DATABASE_URL: 'mysql://u:p@localhost/db', P2PFLOW_APP_KEY: 'x'.repeat(32) };
applyP2PFlowEnvAliases(env);
if (env.CRM_DATABASE_URL !== env.P2PFLOW_DATABASE_URL || env.CRM_APP_KEY !== env.P2PFLOW_APP_KEY) throw new Error('P2PFlow environment aliases failed.');

const url = buildDatabaseUrl({ databaseProvider: 'mysql', databaseHost: 'db.example.com', databasePort: 3306, databaseName: 'p2p flow', databaseUser: 'owner@db', databasePassword: 'a:b/c' });
if (!url.includes('owner%40db') || !url.includes('a%3Ab%2Fc') || !url.includes('p2p%20flow')) throw new Error('Database URL encoding failed.');

const valid = validateOwner({ ownerUsername: 'owner', ownerName: 'Owner', ownerEmail: 'owner@example.com', ownerPassword: 'StrongPassword123!', ownerPasswordConfirm: 'StrongPassword123!', ownerSecretCode: '739251' });
if (valid.errors.length) throw new Error(`Valid Owner setup was rejected: ${valid.errors.join(' ')}`);
const invalid = validateOwner({ ownerUsername: 'x', ownerName: '', ownerEmail: 'bad', ownerPassword: 'short', ownerPasswordConfirm: 'different', ownerSecretCode: '111111' });
if (invalid.errors.length < 5) throw new Error('Weak Owner setup was not rejected.');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p2pflow-hosting-setup-'));
const envFile = path.join(root, '.env');
upsertEnvFile(envFile, {
  P2PFLOW_DATABASE_PROVIDER: 'mysql',
  P2PFLOW_DATABASE_URL: 'mysql://u:p@localhost/db',
  P2PFLOW_OWNER_PASSWORD: 'StrongPassword123!',
  P2PFLOW_OWNER_SECRET_CODE: '739251',
  P2PFLOW_FRESH_INSTALL: 'true'
});
let parsed = parseEnvText(fs.readFileSync(envFile, 'utf8'));
if (parsed.P2PFLOW_OWNER_PASSWORD !== 'StrongPassword123!') throw new Error('Environment write failed.');
const versionedProjectRoot = path.join(root, 'releases', '1.0.166');
fs.mkdirSync(versionedProjectRoot, { recursive: true });
process.env.P2PFLOW_INSTALL_ROOT = root;
process.env.P2PFLOW_SETUP_DIR = path.join(root, 'shared', '.p2pflow');
const paths = setupPaths(versionedProjectRoot, envFile, process.env);
if (paths.code !== path.join(root, 'P2PFLOW_SETUP_CODE.txt') || paths.legacyFile !== path.join(root, 'legacy-import', 'app.db.enc')) throw new Error('Persistent hosting setup paths are incorrect.');
const configured = configuredSetupValues(envFile, {});
if (configured.databaseProvider !== 'mysql' || configured.appKey) throw new Error('Configured setup values did not read the saved hosting environment correctly.');
upsertEnvFile(envFile, { P2PFLOW_APP_KEY: 'k'.repeat(48) });
if (configuredSetupValues(envFile, {}).appKey !== 'k'.repeat(48)) throw new Error('Saved permanent Application Key was not reusable during setup recovery.');
fs.mkdirSync(paths.legacyDirectory, { recursive: true });
const legacyKey = 'legacy-application-key-'.padEnd(48, 'x');
const legacyState = {
  meta: { appVersion: '1.0.158', schemaVersion: 24 },
  users: [{ id: 1, username: 'oldowner', name: 'Old Owner', email: 'old@example.com', role: 'admin', enabled: true, passwordHash: 'old', loginSecretHash: 'old' }],
  orders: [{ id: 10 }],
  ledgers: [{ id: 20 }],
  proofFiles: [],
  chatMedia: []
};
const iv = crypto.randomBytes(12);
const key = crypto.createHash('sha256').update(legacyKey).digest();
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(legacyState), 'utf8')), cipher.final()]);
fs.writeFileSync(paths.legacyFile, JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') }));
const inspectedLegacy = inspectLegacyPackage({ source: paths.legacyFile, appKey: legacyKey, legacyRoot: paths.legacyDirectory });
if (inspectedLegacy.summary.users !== 1 || inspectedLegacy.summary.orders !== 1 || inspectedLegacy.summary.ledgers !== 1 || inspectedLegacy.summary.missingFiles !== 0) throw new Error('Legacy browser-import inspection failed.');
const importedOwner = applyOwnerOverride(inspectedLegacy.state, { username: 'owner', ownerName: 'Owner', email: 'owner@example.com', password: 'NewStrongPassword123!', secretCode: '739251' });
if (importedOwner.username !== 'owner' || importedOwner.email !== 'owner@example.com' || !String(importedOwner.passwordHash).includes(':') || importedOwner.passwordHash.includes('NewStrongPassword123!')) throw new Error('Legacy Owner credential reset failed.');
const setup = ensureSetupCode(paths, {});
if (!setup.code || !fs.existsSync(paths.code) || paths.code !== path.join(root, 'P2PFLOW_SETUP_CODE.txt')) throw new Error('Visible setup code file was not created in the Application Root.');
markSetupComplete({ projectRoot: versionedProjectRoot, envFile, appVersion: '1.0.166', schemaVersion: 26 });
if (!fs.existsSync(paths.lock) || fs.existsSync(paths.code) || fs.existsSync(paths.legacyCode)) throw new Error('Setup completion lock failed.');
sanitizeFreshOwnerSecrets(envFile);
parsed = parseEnvText(fs.readFileSync(envFile, 'utf8'));
if (parsed.P2PFLOW_OWNER_PASSWORD !== '' || parsed.P2PFLOW_OWNER_SECRET_CODE !== '' || parsed.P2PFLOW_FRESH_INSTALL !== 'false') throw new Error('Owner plaintext sanitization failed.');
delete process.env.P2PFLOW_INSTALL_ROOT;
delete process.env.P2PFLOW_SETUP_DIR;
fs.rmSync(root, { recursive: true, force: true });

console.log(JSON.stringify({ ok: true, browserSetup: true, mariadbSetup: true, envAliases: true, setupCodeProtected: true, ownerPlaintextRemoved: true, legacyBrowserImport: true, savedApplicationKeyRecovery: true, persistentReleasePaths: true }, null, 2));
