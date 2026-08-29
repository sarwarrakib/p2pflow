'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const net = require('net');
const { URL } = require('url');
const { inspectLegacyPackage, importLegacyToDatabase } = require('./legacyImporter');
const { normalizeDatabaseProvider, databaseProviderLabel, createStateStore } = require('./databaseProvider');
const { mysqlConnectionOptions } = require('./mysqlStateStore');

function clean(value, max = 500) {
  return String(value == null ? '' : value).replace(/[\r\n\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function applyP2PFlowEnvAliases(env = process.env) {
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('P2PFLOW_')) continue;
    const legacyKey = `CRM_${key.slice('P2PFLOW_'.length)}`;
    if (env[legacyKey] === undefined) env[legacyKey] = value;
  }
  if (env.P2PFLOW_DATABASE_URL && env.DATABASE_URL === undefined) env.DATABASE_URL = env.P2PFLOW_DATABASE_URL;
  return env;
}

function parseEnvText(text) {
  const result = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim().replace(/^export\s+/, '');
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    result[key] = value;
  }
  return result;
}

function quoteEnv(value) {
  const text = String(value == null ? '' : value);
  if (!text) return '';
  if (/^[A-Za-z0-9_./:@%+,-]+$/.test(text)) return text;
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`;
}

function upsertEnvFile(filePath, values = {}) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const existingText = fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf8') : '';
  const lines = existingText ? existingText.split(/\r?\n/) : ['# P2PFlow hosting configuration'];
  const pending = new Map(Object.entries(values).map(([key, value]) => [key, String(value == null ? '' : value)]));
  const output = [];
  const seen = new Set();
  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || !pending.has(match[1])) {
      output.push(line);
      continue;
    }
    const key = match[1];
    if (seen.has(key)) continue;
    output.push(`${key}=${quoteEnv(pending.get(key))}`);
    seen.add(key);
  }
  for (const [key, value] of pending.entries()) {
    if (seen.has(key)) continue;
    if (output.length && output[output.length - 1] !== '') output.push('');
    output.push(`${key}=${quoteEnv(value)}`);
  }
  while (output.length && output[output.length - 1] === '') output.pop();
  fs.writeFileSync(resolved, `${output.join('\n')}\n`, { mode: 0o600 });
  try { fs.chmodSync(resolved, 0o600); } catch {}
  return resolved;
}

function resolveEnvFile(projectRoot = path.resolve(__dirname, '..'), env = process.env) {
  return path.resolve(env.P2PFLOW_ENV_FILE || env.CRM_ENV_FILE || path.join(projectRoot, '.env'));
}

function resolveSetupDirectory(projectRoot = path.resolve(__dirname, '..'), envFile = resolveEnvFile(projectRoot), env = process.env) {
  return path.resolve(env.P2PFLOW_SETUP_DIR || env.CRM_SETUP_DIR || path.join(path.dirname(envFile), '.p2pflow'));
}

function setupPaths(projectRoot, envFile, env = process.env) {
  const directory = resolveSetupDirectory(projectRoot, envFile, env);
  // First-run files belong to the stable hosting application root, not to a
  // versioned release directory. This keeps the setup code and legacy-import
  // location unchanged while application releases are switched.
  const installRoot = path.resolve(env.P2PFLOW_INSTALL_ROOT || env.CRM_INSTALL_ROOT || projectRoot);
  return {
    installRoot,
    directory,
    lock: path.join(directory, 'setup-complete.json'),
    pending: path.join(directory, 'setup-pending.json'),
    bootstrap: path.join(directory, 'owner-bootstrap.json'),
    code: path.join(installRoot, 'P2PFLOW_SETUP_CODE.txt'),
    legacyCode: path.join(directory, 'P2PFLOW_SETUP_CODE.txt'),
    legacyDirectory: path.join(installRoot, 'legacy-import'),
    legacyFile: path.join(installRoot, 'legacy-import', 'app.db.enc')
  };
}

function configuredSetupValues(envFile, env = process.env) {
  let fileValues = {};
  try {
    if (envFile && fs.existsSync(envFile)) fileValues = parseEnvText(fs.readFileSync(envFile, 'utf8'));
  } catch {}
  const values = { ...fileValues, ...env };
  const databaseUrl = String(values.P2PFLOW_DATABASE_URL || values.CRM_DATABASE_URL || values.DATABASE_URL || '').trim();
  return {
    appKey: String(values.P2PFLOW_APP_KEY || values.CRM_APP_KEY || '').trim(),
    secretVaultKey: String(values.P2PFLOW_SECRET_VAULT_KEY || values.CRM_SECRET_VAULT_KEY || '').trim(),
    databaseProvider: normalizeDatabaseProvider(values.P2PFLOW_DATABASE_PROVIDER || values.CRM_DATABASE_PROVIDER || '', databaseUrl),
    databaseUrl,
    databaseTable: safeIdentifier(values.P2PFLOW_DATABASE_TABLE || values.P2PFLOW_MYSQL_TABLE || values.P2PFLOW_POSTGRES_TABLE || values.CRM_DATABASE_TABLE || values.CRM_MYSQL_TABLE || values.CRM_POSTGRES_TABLE || 'p2pflow_state')
  };
}

function configuredMailSetupValues(envFile, env = process.env) {
  let fileValues = {};
  try {
    if (envFile && fs.existsSync(envFile)) fileValues = parseEnvText(fs.readFileSync(envFile, 'utf8'));
  } catch {}
  // The .env file is the persistent setup source of truth. Prefer it over the
  // current process environment because the setup server may still be running
  // with values loaded before the file was edited.
  const values = { ...env, ...fileValues };
  return {
    mailDriver: clean(values.P2PFLOW_MAIL_DRIVER || values.CRM_MAIL_DRIVER || 'local', 30).toLowerCase(),
    mailFrom: clean(values.P2PFLOW_MAIL_FROM || values.CRM_MAIL_FROM || '', 180),
    smtpHost: clean(values.P2PFLOW_SMTP_HOST || values.CRM_SMTP_HOST || '', 255),
    smtpPort: String(Number(values.P2PFLOW_SMTP_PORT || values.CRM_SMTP_PORT || 587) || 587),
    smtpSecure: String(values.P2PFLOW_SMTP_SECURE || values.CRM_SMTP_SECURE || 'false').toLowerCase() === 'true',
    smtpStarttls: String(values.P2PFLOW_SMTP_STARTTLS || values.CRM_SMTP_STARTTLS || 'true').toLowerCase() !== 'false',
    smtpUser: clean(values.P2PFLOW_SMTP_USER || values.CRM_SMTP_USER || '', 255),
    smtpPass: String(values.P2PFLOW_SMTP_PASS || values.CRM_SMTP_PASS || ''),
    smtpHelo: clean(values.P2PFLOW_SMTP_HELO || values.CRM_SMTP_HELO || '', 255)
  };
}

function isSetupComplete(paths) {
  try { return fs.existsSync(paths.lock) && JSON.parse(fs.readFileSync(paths.lock, 'utf8')).complete === true; } catch { return false; }
}

function secureOwnerSecretCode(value) {
  const secret = String(value || '');
  if (!/^\d{6}$/.test(secret)) return '';
  if (/^(\d)\1{5}$/.test(secret) || ['123456', '654321', '012345', '543210'].includes(secret)) return '';
  return secret;
}

function validateOwner(body = {}) {
  const errors = [];
  const username = clean(body.ownerUsername, 120);
  const ownerName = clean(body.ownerName || 'Owner', 160);
  const email = clean(body.ownerEmail, 180);
  const password = String(body.ownerPassword || '');
  const confirmPassword = String(body.ownerPasswordConfirm || password);
  const secretCode = String(body.ownerSecretCode || '');
  if (!username || !/^[A-Za-z0-9_.@-]{3,120}$/.test(username)) errors.push('Owner username must be 3-120 characters and use letters, numbers, dot, underscore, @ or dash.');
  if (!ownerName) errors.push('Owner name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('A valid Owner email is required.');
  if (password.length < 12) errors.push('Owner password must be at least 12 characters.');
  if (password !== confirmPassword) errors.push('Owner password confirmation does not match.');
  if (!secureOwnerSecretCode(secretCode)) errors.push('Owner secret must be a non-repeating, non-sequential 6-digit number.');
  return { errors, values: { username, ownerName, email, password, secretCode } };
}

function safeIdentifier(value, fallback = 'p2pflow_state') {
  return clean(value || fallback, 80).replace(/[^A-Za-z0-9_]/g, '_') || fallback;
}

function databaseProvider(input = {}) {
  return normalizeDatabaseProvider(input.databaseProvider || input.provider, input.databaseUrl || input.connectionString || '');
}

function buildDatabaseUrl(input = {}) {
  const provider = databaseProvider(input);
  const direct = String(input.databaseUrl || '').trim();
  if (direct) {
    let parsed;
    try { parsed = new URL(direct); } catch { throw new Error(`${databaseProviderLabel(provider)} connection URL is invalid.`); }
    const protocols = provider === 'postgres' ? ['postgres:', 'postgresql:'] : ['mysql:', 'mariadb:'];
    if (!protocols.includes(parsed.protocol)) {
      throw new Error(provider === 'postgres'
        ? 'PostgreSQL URL must begin with postgres:// or postgresql://.'
        : 'MariaDB/MySQL URL must begin with mysql:// or mariadb://.');
    }
    return direct;
  }
  const host = clean(input.databaseHost || '127.0.0.1', 255);
  const port = Number(input.databasePort || (provider === 'postgres' ? 5432 : 3306));
  const database = clean(input.databaseName, 120);
  const username = clean(input.databaseUser, 120);
  const password = String(input.databasePassword || '');
  if (!host) throw new Error('Database host is required.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Database port must be between 1 and 65535.');
  if (!database) throw new Error('Database name is required.');
  if (!username) throw new Error('Database username is required.');
  if (!password) throw new Error('Database password is required.');
  const scheme = provider === 'postgres' ? 'postgresql' : 'mysql';
  return `${scheme}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

function sslOptions(input = {}) {
  const enabled = input.databaseSsl === true || ['true', 'require', 'required', '1', 'on'].includes(String(input.databaseSsl || '').toLowerCase());
  if (!enabled) return undefined;
  const rejectUnauthorized = !['false', '0', 'off', 'no'].includes(String(input.databaseSslRejectUnauthorized ?? 'true').toLowerCase());
  return { rejectUnauthorized };
}

async function inspectPostgresDatabase(input, connectionString, providedTable) {
  let Pool;
  try { ({ Pool } = require('pg')); } catch { throw new Error('PostgreSQL driver is not installed. Use the hosting panel Run NPM Install button first.'); }
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000, ssl: sslOptions(input) });
  try {
    const ping = await pool.query('SELECT current_database() AS database_name, current_user AS database_user, version() AS database_version');
    await pool.query('BEGIN');
    try {
      await pool.query('CREATE TEMP TABLE p2pflow_setup_privilege_probe (id INTEGER) ON COMMIT DROP');
      await pool.query('ROLLBACK');
    } catch (error) {
      try { await pool.query('ROLLBACK'); } catch {}
      throw new Error(`Database user cannot create tables: ${error.message}`);
    }
    const candidates = Array.from(new Set([providedTable, 'p2pflow_state', 'crm_state']));
    let detectedTable = providedTable;
    let existingState = false;
    let stateRow = null;
    for (const table of candidates) {
      const exists = await pool.query('SELECT to_regclass($1) AS table_name', [table]);
      if (!exists.rows[0]?.table_name) continue;
      const row = await pool.query(`SELECT id, payload, revision, schema_version, app_version FROM "${table.replace(/"/g, '""')}" WHERE id = $1 LIMIT 1`, ['main']);
      if (row.rowCount) { detectedTable = table; existingState = true; stateRow = row.rows[0]; break; }
    }
    if (existingState && input.appKey) {
      const store = createStateStore({ provider: 'postgres', connectionString, table: detectedTable, appKey: String(input.appKey), pool });
      try { store.decryptObject(stateRow.payload); }
      catch { throw new Error('Existing P2PFlow data was found, but the Application Key cannot decrypt it. Use the exact permanent key from the previous installation.'); }
    }
    return {
      provider: 'postgres', connectionString, table: detectedTable, existingState,
      databaseName: String(ping.rows[0]?.database_name || ''),
      databaseUser: String(ping.rows[0]?.database_user || ''),
      databaseVersion: String(ping.rows[0]?.database_version || '').split(/\s+/).slice(0, 2).join(' '),
      storedVersion: stateRow ? String(stateRow.app_version || '') : '',
      storedSchema: stateRow ? Number(stateRow.schema_version || 0) : 0,
      storedRevision: stateRow ? Number(stateRow.revision || 0) : 0
    };
  } finally { await pool.end().catch(() => {}); }
}

async function inspectMySqlDatabase(input, connectionString, providedTable) {
  let mysql;
  try { mysql = require('mysql2/promise'); } catch { throw new Error('MariaDB/MySQL driver is not installed. Use the hosting panel Run NPM Install button first.'); }
  const options = mysqlConnectionOptions(connectionString, { connectionLimit: 1, connectTimeout: 10000, ssl: sslOptions(input) });
  const pool = mysql.createPool(options);
  try {
    const [pingRows] = await pool.query('SELECT DATABASE() AS database_name, CURRENT_USER() AS database_user, VERSION() AS database_version');
    try {
      await pool.query('CREATE TEMPORARY TABLE p2pflow_setup_privilege_probe (id INT)');
      await pool.query('DROP TEMPORARY TABLE p2pflow_setup_privilege_probe');
    } catch (error) {
      try { await pool.query('DROP TEMPORARY TABLE IF EXISTS p2pflow_setup_privilege_probe'); } catch {}
      throw new Error(`Database user cannot create tables: ${error.message}`);
    }
    const candidates = Array.from(new Set([providedTable, 'p2pflow_state', 'crm_state']));
    let detectedTable = providedTable;
    let existingState = false;
    let stateRow = null;
    for (const table of candidates) {
      const [exists] = await pool.query('SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1', [table]);
      if (!exists.length) continue;
      const safeTable = `\`${table.replace(/`/g, '``')}\``;
      const [rows] = await pool.query(`SELECT id, payload, revision, schema_version, app_version FROM ${safeTable} WHERE id = ? LIMIT 1`, ['main']);
      if (rows.length) { detectedTable = table; existingState = true; stateRow = rows[0]; break; }
    }
    if (existingState && input.appKey) {
      const store = createStateStore({ provider: 'mysql', connectionString, table: detectedTable, appKey: String(input.appKey), pool });
      try { store.decryptObject(stateRow.payload); }
      catch { throw new Error('Existing P2PFlow data was found, but the Application Key cannot decrypt it. Use the exact permanent key from the previous installation.'); }
    }
    const ping = pingRows[0] || {};
    return {
      provider: 'mysql', connectionString, table: detectedTable, existingState,
      databaseName: String(ping.database_name || ''),
      databaseUser: String(ping.database_user || ''),
      databaseVersion: String(ping.database_version || ''),
      storedVersion: stateRow ? String(stateRow.app_version || '') : '',
      storedSchema: stateRow ? Number(stateRow.schema_version || 0) : 0,
      storedRevision: stateRow ? Number(stateRow.revision || 0) : 0
    };
  } finally { await pool.end().catch(() => {}); }
}

async function inspectDatabase(input = {}) {
  const provider = databaseProvider(input);
  const connectionString = buildDatabaseUrl({ ...input, databaseProvider: provider });
  const providedTable = safeIdentifier(input.databaseTable || 'p2pflow_state');
  return provider === 'postgres'
    ? inspectPostgresDatabase(input, connectionString, providedTable)
    : inspectMySqlDatabase(input, connectionString, providedTable);
}

function randomSetupCode() {
  return crypto.randomBytes(10).toString('hex').toUpperCase();
}

function readSetupCodeFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return '';
    const existing = fs.readFileSync(filePath, 'utf8').match(/SETUP CODE:\s*([A-F0-9]{20,})/i);
    return existing ? existing[1].toUpperCase() : '';
  } catch {
    return '';
  }
}

function ensureSetupCode(paths, env = process.env) {
  const configured = String(env.P2PFLOW_SETUP_TOKEN || env.CRM_SETUP_TOKEN || '').trim();
  if (configured.length >= 12) return { code: configured, source: 'hosting environment variable', file: '', logOnly: false };
  fs.mkdirSync(paths.directory, { recursive: true, mode: 0o700 });

  for (const filePath of [paths.code, paths.legacyCode]) {
    const existing = readSetupCodeFile(filePath);
    if (existing) return { code: existing, source: 'hosting File Manager', file: filePath, logOnly: false };
  }

  const code = randomSetupCode();
  const content = [
    'P2PFlow First-Run Setup',
    '',
    `SETUP CODE: ${code}`,
    '',
    'Open your website /setup page and enter this code.',
    'This file is deleted automatically after the database starts successfully.',
    'Do not share this code.'
  ].join('\n');

  const writeErrors = [];
  for (const filePath of [paths.code, paths.legacyCode]) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(filePath, `${content}\n`, { mode: 0o600 });
      try { fs.chmodSync(filePath, 0o600); } catch {}
      return { code, source: 'hosting File Manager', file: filePath, logOnly: false };
    } catch (error) {
      writeErrors.push(`${filePath}: ${error.message}`);
    }
  }

  return {
    code,
    source: 'application log fallback',
    file: '',
    logOnly: true,
    warning: `P2PFlow could not create the setup-code file. Set P2PFLOW_SETUP_TOKEN in the hosting Node environment, or use the one-time code printed in the application log. ${writeErrors.join(' | ')}`
  };
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function secureHeaders(contentType = 'application/json; charset=utf-8') {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), browsing-topics=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Origin-Agent-Cluster': '?1',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, secureHeaders());
  res.end(JSON.stringify(payload));
}

function sendFile(res, file, type) {
  try {
    const data = fs.readFileSync(file);
    res.writeHead(200, secureHeaders(type));
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Setup asset not found.' });
  }
}

function readJson(req, maxBytes = 128 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total <= maxBytes) chunks.push(chunk);
    });
    req.on('end', () => {
      if (total > maxBytes) return reject(Object.assign(new Error('Setup request is too large.'), { statusCode: 413 }));
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('Invalid JSON request.'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

function requestOrigin(req) {
  const host = clean(req?.headers?.host || '', 255).split(',')[0].trim().toLowerCase();
  if (!host || /[\/\s@\u0000-\u001f\u007f]/.test(host)) return '';
  try {
    const parsed = new URL(`${req?.socket?.encrypted ? 'https' : 'http'}://${host}`);
    return parsed.origin;
  } catch {
    return '';
  }
}

function validatePublicBaseUrl(value) {
  const raw = clean(value, 500);
  if (!raw) throw Object.assign(new Error('Public website URL is required for production setup.'), { statusCode: 422 });
  let parsed;
  try { parsed = new URL(raw); }
  catch { throw Object.assign(new Error('Public website URL is invalid.'), { statusCode: 422 }); }
  if (parsed.protocol !== 'https:') throw Object.assign(new Error('Public website URL must use HTTPS.'), { statusCode: 422 });
  if (!parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw Object.assign(new Error('Public website URL must contain only the HTTPS domain and optional port.'), { statusCode: 422 });
  }
  if (parsed.pathname && parsed.pathname !== '/') throw Object.assign(new Error('Public website URL must point to the domain root without a path.'), { statusCode: 422 });
  const hostname = parsed.hostname.toLowerCase();
  if (['localhost', 'localhost.localdomain', '127.0.0.1', '::1'].includes(hostname) || (net.isIP(hostname) === 4 && hostname.startsWith('127.'))) {
    throw Object.assign(new Error('Public website URL cannot use localhost or a loopback address.'), { statusCode: 422 });
  }
  return parsed.origin;
}

function writeBootstrapFile(paths, origin) {
  const token = crypto.randomBytes(32).toString('base64url');
  const record = {
    version: 1,
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    usedAt: null
  };
  fs.mkdirSync(paths.directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(paths.bootstrap, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  return { token, claimUrl: `${origin}/setup/claim?token=${encodeURIComponent(token)}` };
}


function beginBootstrapClaim(paths, token) {
  if (!fs.existsSync(paths.bootstrap)) throw new Error('This one-time Owner access link is unavailable or has already been used.');
  const record = JSON.parse(fs.readFileSync(paths.bootstrap, 'utf8'));
  const providedHash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
  const expectedHash = String(record.tokenHash || '');
  const validHash = expectedHash.length === providedHash.length && crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(providedHash));
  if (!validHash || record.usedAt || !record.expiresAt || Date.parse(record.expiresAt) < Date.now()) throw new Error('This one-time Owner access link is invalid or expired.');
  const claimPath = `${paths.bootstrap}.claiming-${process.pid}-${Date.now()}`;
  fs.renameSync(paths.bootstrap, claimPath);
  return { record, claimPath };
}

function finishBootstrapClaim(claimPath) {
  try { fs.rmSync(claimPath, { force: true }); } catch {}
}

function restoreBootstrapClaim(paths, claimPath) {
  try {
    if (fs.existsSync(claimPath) && !fs.existsSync(paths.bootstrap)) fs.renameSync(claimPath, paths.bootstrap);
  } catch {}
}

function createEnvValues(body, inspection, appKey, paths, existingMail = {}, secretVaultKey = '') {
  const publicBaseUrl = validatePublicBaseUrl(body.publicBaseUrl);
  const publicHostname = new URL(publicBaseUrl).hostname;
  const mailDriver = clean(body.mailDriver || existingMail.mailDriver || 'local', 30).toLowerCase();
  const provider = normalizeDatabaseProvider(inspection.provider || body.databaseProvider, inspection.connectionString);
  const ssl = sslOptions(body);
  const values = {
    NODE_ENV: 'production',
    PORT: String(Number(process.env.PORT || body.port || 3000) || 3000),
    P2PFLOW_BIND_HOST: '127.0.0.1',
    P2PFLOW_ENV_FILE: resolveEnvFile(path.resolve(__dirname, '..')),
    P2PFLOW_SETUP_DIR: paths.directory,
    P2PFLOW_DATABASE_PROVIDER: provider,
    P2PFLOW_DATABASE_URL: inspection.connectionString,
    P2PFLOW_DATABASE_TABLE: inspection.table,
    P2PFLOW_DATABASE_POOL_MAX: '5',
    P2PFLOW_DATABASE_SSL: ssl ? 'true' : 'false',
    P2PFLOW_DATABASE_SSL_REJECT_UNAUTHORIZED: ssl?.rejectUnauthorized === false ? 'false' : 'true',
    P2PFLOW_INSTANCE_LOCK_KEY: `${inspection.table}:single-writer`,
    P2PFLOW_APP_KEY: appKey,
    P2PFLOW_SECRET_VAULT_KEY: secretVaultKey || crypto.randomBytes(48).toString('base64'),
    P2PFLOW_FRESH_INSTALL: inspection.existingState ? 'false' : 'true',
    P2PFLOW_PUBLIC_BASE_URL: publicBaseUrl,
    P2PFLOW_PRODUCTION_STRICT: 'true',
    P2PFLOW_ALLOWED_HOSTS: publicHostname,
    P2PFLOW_TRUST_PROXY: 'loopback',
    P2PFLOW_PUBLIC_HEALTH_DETAILS: 'false',
    P2PFLOW_MAX_SSE_CONNECTIONS_PER_USER: '5',
    P2PFLOW_LOGIN_WINDOW_MS: String(15 * 60 * 1000),
    P2PFLOW_LOGIN_MAX_ATTEMPTS: '12',
    P2PFLOW_AUTH_RATE_LIMIT_MAX_KEYS: '5000',
    P2PFLOW_MAIL_DRIVER: ['local', 'smtp', 'php', 'sendmail'].includes(mailDriver) ? mailDriver : 'local',
    P2PFLOW_MAIL_FROM: clean(body.mailFrom || existingMail.mailFrom || body.ownerEmail, 180),
    P2PFLOW_MAIL_FROM_NAME: 'P2PFlow',
    P2PFLOW_SMTP_HOST: clean(body.smtpHost || existingMail.smtpHost, 255),
    P2PFLOW_SMTP_PORT: String(Number(body.smtpPort || existingMail.smtpPort || 587) || 587),
    P2PFLOW_SMTP_SECURE: (body.smtpSecure === true || String(body.smtpSecure).toLowerCase() === 'true' || (body.smtpSecure === undefined && existingMail.smtpSecure === true)) ? 'true' : 'false',
    P2PFLOW_SMTP_STARTTLS: (body.smtpStarttls === false || String(body.smtpStarttls).toLowerCase() === 'false' || (body.smtpStarttls === undefined && existingMail.smtpStarttls === false)) ? 'false' : 'true',
    P2PFLOW_SMTP_USER: clean(body.smtpUser || existingMail.smtpUser, 255),
    P2PFLOW_SMTP_PASS: String(body.smtpPass || existingMail.smtpPass || ''),
    P2PFLOW_SMTP_HELO: clean(body.smtpHelo || existingMail.smtpHelo || '', 255)
  };
  if (provider === 'postgres') {
    values.P2PFLOW_POSTGRES_TABLE = inspection.table;
    values.P2PFLOW_POSTGRES_POOL_MAX = '5';
    values.P2PFLOW_POSTGRES_SSL = ssl ? 'true' : 'false';
    values.P2PFLOW_POSTGRES_SSL_REJECT_UNAUTHORIZED = ssl?.rejectUnauthorized === false ? 'false' : 'true';
  } else {
    values.P2PFLOW_MYSQL_TABLE = inspection.table;
    values.P2PFLOW_MYSQL_POOL_MAX = '5';
    values.P2PFLOW_MYSQL_SSL = ssl ? 'true' : 'false';
    values.P2PFLOW_MYSQL_SSL_REJECT_UNAUTHORIZED = ssl?.rejectUnauthorized === false ? 'false' : 'true';
  }
  if (!inspection.existingState) {
    values.P2PFLOW_OWNER_USERNAME = clean(body.ownerUsername, 120);
    values.P2PFLOW_OWNER_NAME = clean(body.ownerName || 'Owner', 160);
    values.P2PFLOW_OWNER_EMAIL = clean(body.ownerEmail, 180);
    values.P2PFLOW_OWNER_PASSWORD = String(body.ownerPassword || '');
    values.P2PFLOW_OWNER_SECRET_CODE = String(body.ownerSecretCode || '');
  }
  return values;
}

function markSetupComplete({ projectRoot, envFile, appVersion = '', schemaVersion = 0 }) {
  const paths = setupPaths(projectRoot, envFile);
  fs.mkdirSync(paths.directory, { recursive: true, mode: 0o700 });
  const record = { complete: true, app: 'P2PFlow', appVersion, schemaVersion, completedAt: new Date().toISOString() };
  fs.writeFileSync(paths.lock, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  try { fs.rmSync(paths.pending, { force: true }); } catch {}
  try { fs.rmSync(paths.code, { force: true }); } catch {}
  try { fs.rmSync(paths.legacyCode, { force: true }); } catch {}
  return paths;
}

function sanitizeFreshOwnerSecrets(envFile) {
  if (!fs.existsSync(envFile)) return;
  upsertEnvFile(envFile, {
    P2PFLOW_FRESH_INSTALL: 'false',
    P2PFLOW_OWNER_PASSWORD: '',
    P2PFLOW_OWNER_SECRET_CODE: '',
    CRM_FRESH_INSTALL: 'false',
    CRM_OWNER_PASSWORD: '',
    CRM_OWNER_SECRET_CODE: ''
  });
}

function setupRequired(projectRoot, envFile, env = process.env) {
  const paths = setupPaths(projectRoot, envFile, env);
  const complete = isSetupComplete(paths);
  const databaseUrl = String(env.P2PFLOW_DATABASE_URL || env.CRM_DATABASE_URL || env.DATABASE_URL || '').trim();
  const appKey = String(env.P2PFLOW_APP_KEY || env.CRM_APP_KEY || '').trim();
  return { required: !databaseUrl || appKey.length < 32, complete, paths };
}

function startHostingSetupServer(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || path.resolve(__dirname, '..'));
  const envFile = path.resolve(options.envFile || resolveEnvFile(projectRoot));
  const paths = setupPaths(projectRoot, envFile);
  const setupCode = ensureSetupCode(paths);
  const port = Number(options.port || process.env.PORT || 3000);
  const publicDir = path.join(projectRoot, 'public');
  const attempts = new Map();
  const startupFailure = options.startupFailure || null;

  console.log(`P2PFlow setup is available at /setup on port ${port}.`);
  if (setupCode.file) console.log(`Open ${setupCode.file} in the hosting File Manager to copy the setup code.`);
  else if (setupCode.logOnly) {
    console.warn(setupCode.warning || 'P2PFlow could not create the setup-code file.');
    console.warn(`P2PFlow one-time setup code: ${setupCode.code}`);
  } else console.log('Use the P2PFLOW_SETUP_TOKEN configured in the hosting environment settings.');

  function verifyCode(req, body) {
    const ip = clean(req.socket.remoteAddress || '', 120).trim() || 'unknown';
    const entry = attempts.get(ip) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
    if (Date.now() > entry.resetAt) { entry.count = 0; entry.resetAt = Date.now() + 15 * 60 * 1000; }
    entry.count += 1;
    attempts.set(ip, entry);
    if (attempts.size > 1000) {
      for (const [key, value] of attempts) if (Number(value?.resetAt || 0) <= Date.now()) attempts.delete(key);
      while (attempts.size > 1000) attempts.delete(attempts.keys().next().value);
    }
    if (entry.count > 20) throw Object.assign(new Error('Too many setup attempts. Wait 15 minutes and try again.'), { statusCode: 429 });
    if (!timingSafeEqualText(String(body.setupCode || '').trim().toUpperCase(), String(setupCode.code).trim().toUpperCase())) {
      throw Object.assign(new Error('Installation code is incorrect.'), { statusCode: 403 });
    }
  }

  const server = http.createServer(async (req, res) => {
    const pathname = String(req.url || '').split('?')[0];
    try {
      if (req.method === 'GET' && (pathname === '/' || pathname === '/setup')) return sendFile(res, path.join(publicDir, 'setup.html'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && pathname === '/setup.css') return sendFile(res, path.join(publicDir, 'setup.css'), 'text/css; charset=utf-8');
      if (req.method === 'GET' && pathname === '/setup.js') return sendFile(res, path.join(publicDir, 'setup.js'), 'application/javascript; charset=utf-8');
      if (req.method === 'GET' && ['/ready', '/healthz', '/api/ready', '/api/healthz'].includes(pathname)) {
        return sendJson(res, 200, { ok: true, status: 'setup_required', setupRequired: true, app: 'P2PFlow', version: options.appVersion || '', startupFailure });
      }
      if (req.method === 'GET' && pathname === '/setup/api/status') {
        const existing = fs.existsSync(envFile) ? parseEnvText(fs.readFileSync(envFile, 'utf8')) : {};
        return sendJson(res, 200, {
          ok: true,
          setupRequired: true,
          app: 'P2PFlow',
          version: options.appVersion || '',
          setupCodeSource: setupCode.source,
          setupCodeFile: setupCode.file ? path.basename(setupCode.file) : '',
          savedApplicationKeyAvailable: configuredSetupValues(envFile, process.env).appKey.length >= 32,
          startupFailure,
          legacyImport: {
            available: fs.existsSync(paths.legacyFile),
            folder: 'legacy-import',
            databaseFile: 'legacy-import/app.db.enc'
          },
          defaults: {
            databaseProvider: normalizeDatabaseProvider(existing.P2PFLOW_DATABASE_PROVIDER || existing.CRM_DATABASE_PROVIDER || '', existing.P2PFLOW_DATABASE_URL || existing.CRM_DATABASE_URL || existing.DATABASE_URL || ''),
            databaseHost: '127.0.0.1',
            databasePort: normalizeDatabaseProvider(existing.P2PFLOW_DATABASE_PROVIDER || existing.CRM_DATABASE_PROVIDER || '', existing.P2PFLOW_DATABASE_URL || existing.CRM_DATABASE_URL || existing.DATABASE_URL || '') === 'postgres' ? 5432 : 3306,
            databaseName: '',
            databaseUser: '',
            databaseTable: existing.P2PFLOW_DATABASE_TABLE || existing.P2PFLOW_MYSQL_TABLE || existing.P2PFLOW_POSTGRES_TABLE || existing.CRM_DATABASE_TABLE || existing.CRM_MYSQL_TABLE || existing.CRM_POSTGRES_TABLE || 'p2pflow_state',
            publicBaseUrl: existing.P2PFLOW_PUBLIC_BASE_URL || existing.CRM_PUBLIC_BASE_URL || (requestOrigin(req).startsWith('https://') ? requestOrigin(req) : ''),
            ownerUsername: existing.P2PFLOW_OWNER_USERNAME || existing.CRM_OWNER_USERNAME || 'owner',
            ownerName: existing.P2PFLOW_OWNER_NAME || existing.CRM_OWNER_NAME || 'Owner',
            ownerEmail: existing.P2PFLOW_OWNER_EMAIL || existing.CRM_OWNER_EMAIL || '',
            mailDriver: existing.P2PFLOW_MAIL_DRIVER || existing.CRM_MAIL_DRIVER || 'local',
            mailFrom: existing.P2PFLOW_MAIL_FROM || existing.CRM_MAIL_FROM || '',
            smtpHost: existing.P2PFLOW_SMTP_HOST || existing.CRM_SMTP_HOST || '',
            smtpPort: existing.P2PFLOW_SMTP_PORT || existing.CRM_SMTP_PORT || 587,
            smtpSecure: String(existing.P2PFLOW_SMTP_SECURE || existing.CRM_SMTP_SECURE || 'false').toLowerCase() === 'true',
            smtpStarttls: String(existing.P2PFLOW_SMTP_STARTTLS || existing.CRM_SMTP_STARTTLS || 'true').toLowerCase() !== 'false',
            smtpUser: existing.P2PFLOW_SMTP_USER || existing.CRM_SMTP_USER || ''
          }
        });
      }
      if (req.method === 'POST' && pathname === '/setup/api/test-database') {
        const body = await readJson(req);
        verifyCode(req, body);
        const configured = configuredSetupValues(envFile, process.env);
        const submittedKey = String(body.appKey || '').trim();
        const reusableKey = submittedKey || configured.appKey;
        const inspection = await inspectDatabase({ ...body, appKey: reusableKey || undefined });
        let legacy = null;
        const importLegacy = body.importLegacy === true || String(body.importLegacy || '').toLowerCase() === 'true';
        if (importLegacy) {
          if (inspection.existingState) throw Object.assign(new Error('The selected database already contains P2PFlow data. Choose an empty database for file-based data import.'), { statusCode: 422 });
          if (!fs.existsSync(paths.legacyFile)) throw Object.assign(new Error('Upload the old app.db.enc file to legacy-import/app.db.enc with the hosting File Manager, then reload this page.'), { statusCode: 422 });
          if (reusableKey.length < 32) throw Object.assign(new Error('Legacy import requires the exact permanent Application Key from the old installation. If this server already has that key saved, P2PFlow will use it automatically.'), { statusCode: 422 });
          const inspected = inspectLegacyPackage({ source: paths.legacyFile, appKey: reusableKey, legacyRoot: paths.legacyDirectory });
          if (inspected.fileImport.missing.length) {
            throw Object.assign(new Error(`Old data references ${inspected.fileImport.missing.length} missing proof/chat file(s). Copy the old proofs and chat-media folders into legacy-import before continuing. First missing item: ${inspected.fileImport.missing[0]}`), { statusCode: 422 });
          }
          legacy = { ...inspected.summary, missing: [] };
        }
        return sendJson(res, 200, { ok: true, database: { ...inspection, connectionString: undefined }, legacy });
      }
      if (req.method === 'POST' && pathname === '/setup/api/save') {
        const body = await readJson(req);
        verifyCode(req, body);
        body.publicBaseUrl = validatePublicBaseUrl(body.publicBaseUrl);
        const importLegacy = body.importLegacy === true || String(body.importLegacy || '').toLowerCase() === 'true';
        const configured = configuredSetupValues(envFile, process.env);
        const submittedKey = String(body.appKey || '').trim();
        let appKey = submittedKey || configured.appKey;
        const configuredKeyUsed = !submittedKey && configured.appKey.length >= 32;
        const preliminary = await inspectDatabase({ ...body, appKey: appKey || undefined });
        const targetWasEmpty = !preliminary.existingState;
        if (importLegacy && preliminary.existingState) throw Object.assign(new Error('The selected database already contains P2PFlow data. Legacy file import requires an empty database.'), { statusCode: 422 });
        if ((preliminary.existingState || importLegacy) && appKey.length < 32) {
          throw Object.assign(new Error('This database contains P2PFlow data, but this hosting installation has no saved permanent Application Key. Restore the exact key from the previous installation once. Normal updates never ask for the setup code or Application Key.'), { statusCode: 422 });
        }
        let generatedAppKey = false;
        if (!preliminary.existingState && !importLegacy && appKey.length < 32) {
          appKey = crypto.randomBytes(48).toString('base64');
          generatedAppKey = true;
        }
        let owner = null;
        if (!preliminary.existingState) {
          owner = validateOwner(body);
          if (owner.errors.length) throw Object.assign(new Error(owner.errors.join(' ')), { statusCode: 422 });
        }
        let legacyImport = null;
        if (importLegacy) {
          if (!fs.existsSync(paths.legacyFile)) throw Object.assign(new Error('Upload the old app.db.enc file to legacy-import/app.db.enc before importing.'), { statusCode: 422 });
          legacyImport = await importLegacyToDatabase({
            provider: preliminary.provider,
            source: paths.legacyFile,
            legacyRoot: paths.legacyDirectory,
            connectionString: preliminary.connectionString,
            table: preliminary.table,
            appKey,
            ssl: sslOptions(body),
            owner: { username: owner.values.username, ownerName: owner.values.ownerName, email: owner.values.email, password: owner.values.password, secretCode: owner.values.secretCode },
            allowMissingFiles: false
          });
        }
        const inspection = (preliminary.existingState || importLegacy)
          ? await inspectDatabase({ ...body, appKey })
          : preliminary;
        const existingMail = configuredMailSetupValues(envFile, process.env);
        const secretVaultKey = configured.secretVaultKey.length >= 32 ? configured.secretVaultKey : crypto.randomBytes(48).toString('base64');
        const values = createEnvValues(body, inspection, appKey, paths, existingMail, secretVaultKey);
        upsertEnvFile(envFile, values);
        fs.mkdirSync(paths.directory, { recursive: true, mode: 0o700 });
        fs.writeFileSync(paths.pending, `${JSON.stringify({ configuredAt: new Date().toISOString(), databaseTable: inspection.table, existingState: inspection.existingState, importedLegacy: Boolean(legacyImport), envFile }, null, 2)}
`, { mode: 0o600 });
        const bootstrap = targetWasEmpty ? writeBootstrapFile(paths, values.P2PFLOW_PUBLIC_BASE_URL) : null;
        try {
          fs.mkdirSync(path.join(projectRoot, 'tmp'), { recursive: true });
          fs.writeFileSync(path.join(projectRoot, 'tmp', 'restart.txt'), `${new Date().toISOString()}
`);
        } catch {}
        sendJson(res, 200, {
          ok: true,
          saved: true,
          existingState: preliminary.existingState,
          importedLegacy: Boolean(legacyImport),
          legacyImport,
          database: { provider: inspection.provider, name: inspection.databaseName, user: inspection.databaseUser, table: inspection.table, version: inspection.databaseVersion, storedVersion: inspection.storedVersion },
          appKeyGenerated: generatedAppKey,
          configuredKeyUsed,
          applicationKey: generatedAppKey ? appKey : '',
          claimUrl: bootstrap?.claimUrl || '',
          message: 'Configuration saved. P2PFlow is restarting. If your hosting panel does not restart it automatically, click Restart once.'
        });
        const timer = setTimeout(() => process.exit(0), 1800);
        if (typeof timer.unref === 'function') timer.unref();
        return;
      }
      return sendJson(res, 404, { error: 'Setup route not found.' });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, { error: clean(error.message || error, 1000) });
    }
  });
  server.listen(port);
  return server;
}

module.exports = {
  applyP2PFlowEnvAliases,
  parseEnvText,
  quoteEnv,
  upsertEnvFile,
  resolveEnvFile,
  resolveSetupDirectory,
  setupPaths,
  configuredSetupValues,
  configuredMailSetupValues,
  isSetupComplete,
  secureOwnerSecretCode,
  validateOwner,
  validatePublicBaseUrl,
  safeIdentifier,
  buildDatabaseUrl,
  sslOptions,
  inspectDatabase,
  ensureSetupCode,
  createEnvValues,
  markSetupComplete,
  sanitizeFreshOwnerSecrets,
  setupRequired,
  startHostingSetupServer,
  beginBootstrapClaim,
  finishBootstrapClaim,
  restoreBootstrapClaim
};
