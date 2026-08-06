'use strict';

const fs = require('fs');
const path = require('path');
const { applyP2PFlowEnvAliases, inspectDatabase } = require('./hostingSetup');
const { normalizeDatabaseProvider, databaseProviderLabel } = require('./databaseProvider');

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function parseEnvText(text) {
  const out = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim().replace(/^export\s+/, '');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }
    }
    out[key] = value;
  }
  return out;
}

function loadEnvironment(envFile, inherited = process.env) {
  const resolved = path.resolve(String(envFile || ''));
  if (!envFile || !fs.existsSync(resolved)) {
    const env = { ...inherited };
    applyP2PFlowEnvAliases(env);
    return { env, envFile: resolved, exists: false };
  }
  const parsed = parseEnvText(fs.readFileSync(resolved, 'utf8'));
  const env = { ...parsed, ...inherited };
  applyP2PFlowEnvAliases(env);
  return { env, parsed, envFile: resolved, exists: true };
}

function secureOwnerSecretCode(value) {
  const secret = String(value || '');
  if (!/^\d{6}$/.test(secret)) return '';
  if (/^(\d)\1{5}$/.test(secret) || ['123456', '654321', '012345', '543210'].includes(secret)) return '';
  return secret;
}

function validateFreshOwner(env) {
  const errors = [];
  const username = clean(env.P2PFLOW_OWNER_USERNAME || env.CRM_OWNER_USERNAME || env.CRM_INITIAL_ADMIN_USERNAME || '');
  const email = clean(env.P2PFLOW_OWNER_EMAIL || env.CRM_OWNER_EMAIL || env.CRM_INITIAL_ADMIN_EMAIL || '');
  const password = String(env.P2PFLOW_OWNER_PASSWORD || env.CRM_OWNER_PASSWORD || env.CRM_INITIAL_ADMIN_PASSWORD || '');
  const secret = String(env.P2PFLOW_OWNER_SECRET_CODE || env.CRM_OWNER_SECRET_CODE || env.CRM_INITIAL_ADMIN_SECRET_CODE || '');
  if (!username) errors.push({ code: 'OWNER_USERNAME_REQUIRED', message: 'P2PFLOW_OWNER_USERNAME is required for a fresh database.' });
  if (!email) errors.push({ code: 'OWNER_EMAIL_REQUIRED', message: 'P2PFLOW_OWNER_EMAIL is required for a fresh database.' });
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ code: 'OWNER_EMAIL_INVALID', message: 'P2PFLOW_OWNER_EMAIL must be a valid email address.' });
  if (!password) errors.push({ code: 'OWNER_PASSWORD_REQUIRED', message: 'P2PFLOW_OWNER_PASSWORD is required for a fresh database.' });
  else if (password.length < 12) errors.push({ code: 'OWNER_PASSWORD_WEAK', message: 'P2PFLOW_OWNER_PASSWORD must contain at least 12 characters.' });
  if (!secureOwnerSecretCode(secret)) errors.push({ code: 'OWNER_SECRET_INVALID', message: 'P2PFLOW_OWNER_SECRET_CODE must be a non-repeating, non-sequential 6 digit code.' });
  return errors;
}

function safeIdentifier(value, fallback = 'p2pflow_state') {
  return clean(value || fallback).replace(/[^a-zA-Z0-9_]/g, '_') || fallback;
}

function quotedIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function booleanValue(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function classifyStartupError(error) {
  const raw = clean(error && (error.message || error) || 'Unknown startup failure');
  const cases = [
    [/(?:CRM|P2PFLOW)_DATABASE_URL is required/i, 'DATABASE_URL_MISSING', 'Database connection is not configured.'],
    [/(?:CRM|P2PFLOW)_APP_KEY must be/i, 'APP_KEY_INVALID', 'The permanent application encryption key is missing or invalid.'],
    [/(?:pg|mysql2) dependency is not installed|driver is not installed/i, 'DEPENDENCY_MISSING', 'Required Node.js database dependency is not installed.'],
    [/Fresh database setup requires|(?:CRM|P2PFLOW)_OWNER_/i, 'OWNER_SETUP_REQUIRED', 'Fresh database owner setup is incomplete.'],
    [/Another application instance already owns/i, 'DATABASE_ALREADY_IN_USE', 'Another application process is already using this database.'],
    [/No verified (?:PostgreSQL|MariaDB\/MySQL) state revision could be decrypted/i, 'APP_KEY_OR_STATE_MISMATCH', 'Stored application data could not be decrypted. Verify the permanent application key.'],
    [/password authentication failed|access denied|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout expired|connect EHOSTUNREACH|unknown database|database .* does not exist|role .* does not exist/i, 'DATABASE_CONNECTION_FAILED', 'The application could not connect to the configured database.'],
    [/data compatibility epoch/i, 'DATA_COMPATIBILITY_BLOCK', 'This code version is not compatible with the stored database epoch.']
  ];
  for (const [pattern, code, message] of cases) {
    if (pattern.test(raw)) return { code, message, detail: raw.slice(0, 500) };
  }
  return { code: 'UNKNOWN_STARTUP_FAILURE', message: 'The application failed during startup. Check the production doctor and service log.', detail: raw.slice(0, 500) };
}

async function checkDatabase(env, result) {
  const connectionString = clean(env.P2PFLOW_DATABASE_URL || env.CRM_DATABASE_URL || env.DATABASE_URL || '');
  const provider = normalizeDatabaseProvider(env.P2PFLOW_DATABASE_PROVIDER || env.CRM_DATABASE_PROVIDER || '', connectionString);
  const table = safeIdentifier(env.P2PFLOW_DATABASE_TABLE || env.P2PFLOW_MYSQL_TABLE || env.P2PFLOW_POSTGRES_TABLE || env.CRM_DATABASE_TABLE || env.CRM_MYSQL_TABLE || env.CRM_POSTGRES_TABLE || 'p2pflow_state');
  const sslEnabled = booleanValue(env.P2PFLOW_DATABASE_SSL || env.P2PFLOW_MYSQL_SSL || env.P2PFLOW_POSTGRES_SSL || env.CRM_DATABASE_SSL || env.CRM_MYSQL_SSL || env.CRM_POSTGRES_SSL, false);
  const rejectUnauthorized = booleanValue(env.P2PFLOW_DATABASE_SSL_REJECT_UNAUTHORIZED || env.P2PFLOW_MYSQL_SSL_REJECT_UNAUTHORIZED || env.P2PFLOW_POSTGRES_SSL_REJECT_UNAUTHORIZED || env.CRM_DATABASE_SSL_REJECT_UNAUTHORIZED || env.CRM_MYSQL_SSL_REJECT_UNAUTHORIZED || env.CRM_POSTGRES_SSL_REJECT_UNAUTHORIZED, true);
  try {
    const inspection = await inspectDatabase({
      databaseProvider: provider,
      databaseUrl: connectionString,
      databaseTable: table,
      databaseSsl: sslEnabled,
      databaseSslRejectUnauthorized: rejectUnauthorized,
      appKey: String(env.P2PFLOW_APP_KEY || env.CRM_APP_KEY || '')
    });
    result.info.database = {
      reachable: true,
      provider,
      providerLabel: databaseProviderLabel(provider),
      name: inspection.databaseName,
      user: inspection.databaseUser,
      version: inspection.databaseVersion
    };
    if (inspection.existingState) {
      result.info.storedState = {
        exists: true,
        revision: Number(inspection.storedRevision || 0),
        schemaVersion: Number(inspection.storedSchema || 0),
        appVersion: String(inspection.storedVersion || '')
      };
    } else {
      result.info.storedState = { exists: false };
      result.errors.push(...validateFreshOwner(env));
      const installRoot = path.resolve(clean(env.P2PFLOW_INSTALL_ROOT || env.CRM_INSTALL_ROOT || result.installRoot || ''));
      const legacyFile = clean(env.P2PFLOW_LEGACY_DB_FILE || env.CRM_LEGACY_DB_FILE || (installRoot ? path.join(installRoot, 'legacy-import', 'app.db.enc') : ''));
      const confirmedFresh = booleanValue(env.P2PFLOW_FRESH_INSTALL ?? env.CRM_FRESH_INSTALL, false);
      if (legacyFile && fs.existsSync(legacyFile) && fs.statSync(legacyFile).size > 0 && !confirmedFresh) {
        result.errors.push({
          code: 'LEGACY_IMPORT_REQUIRED',
          message: `Legacy data file exists at ${legacyFile}. Import it before activation, or set P2PFLOW_FRESH_INSTALL=true only when this is intentionally a new empty installation.`
        });
      }
    }
  } catch (error) {
    const failure = classifyStartupError(error);
    result.errors.push({ code: failure.code, message: failure.message, detail: failure.detail });
    result.info.database = { reachable: false, provider };
  }
}

async function runProductionPreflight(options = {}) {
  const envFile = path.resolve(String(options.envFile || process.env.P2PFLOW_ENV_FILE || process.env.CRM_ENV_FILE || path.join(options.installRoot || process.env.P2PFLOW_INSTALL_ROOT || process.env.CRM_INSTALL_ROOT || '/opt/p2pflow', 'shared', '.env')));
  const loaded = loadEnvironment(envFile, options.inheritedEnv || process.env);
  const env = loaded.env;
  const result = {
    ok: false,
    envFile,
    installRoot: path.resolve(String(options.installRoot || env.P2PFLOW_INSTALL_ROOT || env.CRM_INSTALL_ROOT || process.env.P2PFLOW_INSTALL_ROOT || process.env.CRM_INSTALL_ROOT || '/opt/p2pflow')),
    errors: [],
    warnings: [],
    info: {
      nodeVersion: process.versions.node,
      envFileExists: loaded.exists
    }
  };

  const nodeMajor = Number(String(process.versions.node || '').split('.')[0] || 0);
  if (nodeMajor < 20) result.errors.push({ code: 'NODE_VERSION_UNSUPPORTED', message: 'Node.js 20 or newer is required.' });
  if (!loaded.exists) result.errors.push({ code: 'ENV_FILE_MISSING', message: `Production environment file is missing: ${envFile}` });

  const databaseUrl = clean(env.P2PFLOW_DATABASE_URL || env.CRM_DATABASE_URL || env.DATABASE_URL || '');
  if (!databaseUrl) result.errors.push({ code: 'DATABASE_URL_MISSING', message: 'P2PFLOW_DATABASE_URL is required.' });
  const appKey = String(env.P2PFLOW_APP_KEY || env.CRM_APP_KEY || '');
  if (appKey.length < 32 || appKey === 'replace-with-at-least-32-random-characters' || appKey === 'change-this-to-a-long-random-secret-before-production') {
    result.errors.push({ code: 'APP_KEY_INVALID', message: 'P2PFLOW_APP_KEY must be a permanent unique secret of at least 32 characters.' });
  }
  const poolMax = Number(env.P2PFLOW_DATABASE_POOL_MAX || env.P2PFLOW_MYSQL_POOL_MAX || env.P2PFLOW_POSTGRES_POOL_MAX || env.CRM_DATABASE_POOL_MAX || env.CRM_MYSQL_POOL_MAX || env.CRM_POSTGRES_POOL_MAX || 5);
  if (!Number.isFinite(poolMax) || poolMax < 2) result.errors.push({ code: 'DATABASE_POOL_TOO_SMALL', message: 'P2PFLOW_DATABASE_POOL_MAX must be at least 2.' });
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) result.errors.push({ code: 'PORT_INVALID', message: 'PORT must be between 1 and 65535.' });

  if (!clean(env.P2PFLOW_PUBLIC_BASE_URL || env.CRM_PUBLIC_BASE_URL || '')) result.warnings.push({ code: 'PUBLIC_BASE_URL_MISSING', message: 'P2PFLOW_PUBLIC_BASE_URL is not configured. Public links and notifications may be incomplete.' });
  const updateRepository = clean(env.P2PFLOW_GITHUB_REPOSITORY || env.CRM_GITHUB_REPOSITORY || '');
  const updateToken = clean(env.P2PFLOW_GITHUB_TOKEN || env.CRM_GITHUB_TOKEN || '');
  const updatePublicKey = clean(env.P2PFLOW_UPDATE_PUBLIC_KEY || env.CRM_UPDATE_PUBLIC_KEY || '');
  if (!updateRepository || !updateToken || !updatePublicKey) {
    result.warnings.push({ code: 'GITHUB_UPDATE_NOT_READY', message: 'Private GitHub update settings are incomplete. The application can run, but Control Panel updates will remain unavailable.' });
  }

  if (!options.configOnly && databaseUrl && appKey.length >= 32 && !result.errors.some(item => ['ENV_FILE_MISSING', 'DATABASE_URL_MISSING', 'APP_KEY_INVALID'].includes(item.code))) {
    await checkDatabase(env, result);
  }

  result.ok = result.errors.length === 0;
  return result;
}

module.exports = {
  parseEnvText,
  loadEnvironment,
  secureOwnerSecretCode,
  validateFreshOwner,
  safeIdentifier,
  classifyStartupError,
  runProductionPreflight
};
