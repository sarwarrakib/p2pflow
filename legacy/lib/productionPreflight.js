'use strict';

const fs = require('fs');
const path = require('path');
const { applyP2PFlowEnvAliases, inspectDatabase, validatePublicBaseUrl } = require('./hostingSetup');
const { normalizeDatabaseProvider, databaseProviderLabel } = require('./databaseProvider');

function clean(value) {
  return String(value == null ? '' : value).trim();
}


function hostToken(value) {
  const raw = clean(value).split(',')[0].toLowerCase();
  if (!raw || /[\/\s@\u0000-\u001f\u007f]/.test(raw)) return '';
  try { return new URL(`http://${raw}`).host.toLowerCase(); } catch { return '' ; }
}

function hostnameToken(value) {
  const host = hostToken(value);
  if (!host) return '';
  try { return new URL(`http://${host}`).hostname.toLowerCase(); } catch { return ''; }
}

function isLoopbackHostname(value) {
  const hostname = clean(value).toLowerCase().replace(/^\[|\]$/g, '');
  return hostname === 'localhost' || hostname === 'localhost.localdomain' || hostname === '::1' || /^127(?:\.|$)/.test(hostname);
}

function hasSecretVariety(value) {
  const text = String(value || '');
  if (text.length < 32) return false;
  if (/^(.)\1+$/.test(text)) return false;
  return new Set(text).size >= 8;
}

function parsedDatabaseHostname(databaseUrl) {
  try { return new URL(databaseUrl).hostname.toLowerCase(); } catch { return ''; }
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
      envFileExists: loaded.exists,
      security: {}
    }
  };

  const nodeMajor = Number(String(process.versions.node || '').split('.')[0] || 0);
  if (nodeMajor < 20) result.errors.push({ code: 'NODE_VERSION_UNSUPPORTED', message: 'Node.js 20 or newer is required.' });
  if (!loaded.exists) result.errors.push({ code: 'ENV_FILE_MISSING', message: `Production environment file is missing: ${envFile}` });
  else {
    try {
      const permissions = fs.statSync(envFile).mode & 0o777;
      result.info.security.envFileMode = permissions.toString(8).padStart(3, '0');
      if ((permissions & 0o077) !== 0) result.errors.push({ code: 'ENV_FILE_PERMISSIONS_UNSAFE', message: `${envFile} must not be readable or writable by group/others. Use chmod 600.` });
    } catch (error) {
      result.warnings.push({ code: 'ENV_FILE_MODE_UNCHECKED', message: `Could not verify environment-file permissions: ${clean(error.message || error)}` });
    }
  }

  const nodeEnv = clean(env.NODE_ENV || '').toLowerCase();
  result.info.security.nodeEnv = nodeEnv || '(unset)';
  if (nodeEnv !== 'production') result.errors.push({ code: 'NODE_ENV_NOT_PRODUCTION', message: 'NODE_ENV must be production.' });

  const databaseUrl = clean(env.P2PFLOW_DATABASE_URL || env.CRM_DATABASE_URL || env.DATABASE_URL || '');
  if (!databaseUrl) result.errors.push({ code: 'DATABASE_URL_MISSING', message: 'P2PFLOW_DATABASE_URL is required.' });
  const appKey = String(env.P2PFLOW_APP_KEY || env.CRM_APP_KEY || '');
  const appKeyPlaceholders = new Set([
    'replace-with-at-least-32-random-characters',
    'change-this-to-a-long-random-secret-before-production',
    '01234567890123456789012345678901'
  ]);
  if (!hasSecretVariety(appKey) || appKeyPlaceholders.has(appKey)) {
    result.errors.push({ code: 'APP_KEY_INVALID', message: 'P2PFLOW_APP_KEY must be a permanent high-entropy unique secret of at least 32 characters.' });
  }
  result.info.security.appKeyConfigured = appKey.length >= 32;

  const poolMax = Number(env.P2PFLOW_DATABASE_POOL_MAX || env.P2PFLOW_MYSQL_POOL_MAX || env.P2PFLOW_POSTGRES_POOL_MAX || env.CRM_DATABASE_POOL_MAX || env.CRM_MYSQL_POOL_MAX || env.CRM_POSTGRES_POOL_MAX || 5);
  if (!Number.isFinite(poolMax) || poolMax < 2) result.errors.push({ code: 'DATABASE_POOL_TOO_SMALL', message: 'P2PFLOW_DATABASE_POOL_MAX must be at least 2.' });
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) result.errors.push({ code: 'PORT_INVALID', message: 'PORT must be between 1 and 65535.' });

  const publicBaseRaw = clean(env.P2PFLOW_PUBLIC_BASE_URL || env.CRM_PUBLIC_BASE_URL || '');
  let publicBaseUrl = null;
  try {
    const origin = validatePublicBaseUrl(publicBaseRaw);
    publicBaseUrl = new URL(origin);
    result.info.security.publicOrigin = origin;
  } catch (error) {
    result.errors.push({ code: publicBaseRaw ? 'PUBLIC_BASE_URL_INVALID' : 'PUBLIC_BASE_URL_MISSING', message: clean(error.message || error) || 'P2PFLOW_PUBLIC_BASE_URL is required.' });
  }

  const strict = booleanValue(env.P2PFLOW_PRODUCTION_STRICT ?? env.CRM_PRODUCTION_STRICT, false);
  result.info.security.productionStrict = strict;
  if (!strict) result.errors.push({ code: 'PRODUCTION_STRICT_DISABLED', message: 'P2PFLOW_PRODUCTION_STRICT=true is required before public launch.' });

  const trustProxy = clean(env.P2PFLOW_TRUST_PROXY || env.CRM_TRUST_PROXY || 'loopback').toLowerCase();
  const proxyTokens = trustProxy.split(',').map(value => value.trim()).filter(Boolean);
  result.info.security.trustProxy = trustProxy;
  if (proxyTokens.includes('all')) result.errors.push({ code: 'TRUST_PROXY_UNSAFE', message: 'P2PFLOW_TRUST_PROXY=all allows spoofed forwarding headers. Trust only loopback, private proxies, or explicit proxy IP addresses.' });
  if (proxyTokens.includes('private')) result.warnings.push({ code: 'TRUST_PROXY_PRIVATE_RANGE', message: 'P2PFLOW_TRUST_PROXY=private trusts every private-network peer. Explicit proxy IPs or loopback are safer.' });

  const allowedHostsRaw = clean(env.P2PFLOW_ALLOWED_HOSTS || env.CRM_ALLOWED_HOSTS || '');
  const allowedHosts = new Set(allowedHostsRaw.split(',').map(hostToken).filter(Boolean));
  result.info.security.allowedHosts = [...allowedHosts];
  if (!allowedHosts.size) result.errors.push({ code: 'ALLOWED_HOSTS_MISSING', message: 'P2PFLOW_ALLOWED_HOSTS must list the public application hostname.' });
  if (publicBaseUrl && !allowedHosts.has(publicBaseUrl.host.toLowerCase()) && !allowedHosts.has(publicBaseUrl.hostname.toLowerCase())) {
    result.errors.push({ code: 'ALLOWED_HOSTS_MISMATCH', message: 'P2PFLOW_ALLOWED_HOSTS must include the hostname from P2PFLOW_PUBLIC_BASE_URL.' });
  }

  const publicHealthDetails = booleanValue(env.P2PFLOW_PUBLIC_HEALTH_DETAILS, false);
  result.info.security.publicHealthDetails = publicHealthDetails;
  if (publicHealthDetails) result.errors.push({ code: 'PUBLIC_HEALTH_DETAILS_ENABLED', message: 'P2PFLOW_PUBLIC_HEALTH_DETAILS must be false for a public deployment.' });

  const sameSite = clean(env.P2PFLOW_SESSION_COOKIE_SAMESITE || env.CRM_SESSION_COOKIE_SAMESITE || 'Strict');
  if (!['Strict', 'Lax', 'None'].includes(sameSite)) result.errors.push({ code: 'COOKIE_SAMESITE_INVALID', message: 'P2PFLOW_SESSION_COOKIE_SAMESITE must be Strict, Lax, or None.' });
  if (sameSite === 'None') result.warnings.push({ code: 'COOKIE_SAMESITE_NONE', message: 'SameSite=None is unnecessary for the normal same-origin panel and expands cross-site cookie exposure.' });
  result.info.security.sessionCookieSameSite = sameSite;

  const maxSse = Number(env.P2PFLOW_MAX_SSE_CONNECTIONS_PER_USER || 5);
  if (!Number.isInteger(maxSse) || maxSse < 1 || maxSse > 20) result.errors.push({ code: 'SSE_CONNECTION_LIMIT_INVALID', message: 'P2PFLOW_MAX_SSE_CONNECTIONS_PER_USER must be between 1 and 20.' });
  const loginAttempts = Number(env.P2PFLOW_LOGIN_MAX_ATTEMPTS || env.CRM_LOGIN_MAX_ATTEMPTS || 12);
  if (!Number.isInteger(loginAttempts) || loginAttempts < 4 || loginAttempts > 100) result.errors.push({ code: 'LOGIN_RATE_LIMIT_INVALID', message: 'P2PFLOW_LOGIN_MAX_ATTEMPTS must be between 4 and 100.' });

  const databaseHost = parsedDatabaseHostname(databaseUrl);
  const sslEnabled = booleanValue(env.P2PFLOW_DATABASE_SSL || env.P2PFLOW_MYSQL_SSL || env.P2PFLOW_POSTGRES_SSL || env.CRM_DATABASE_SSL || env.CRM_MYSQL_SSL || env.CRM_POSTGRES_SSL, false);
  result.info.security.databaseHost = databaseHost;
  result.info.security.databaseSsl = sslEnabled;
  if (databaseHost && !isLoopbackHostname(databaseHost) && !sslEnabled) {
    result.warnings.push({ code: 'REMOTE_DATABASE_WITHOUT_TLS', message: 'The database host is not loopback and database TLS is disabled. Enable TLS unless the connection is protected by an equivalent private encrypted channel.' });
  }

  const bindHost = clean(env.P2PFLOW_BIND_HOST || env.CRM_BIND_HOST || '');
  result.info.security.bindHost = bindHost || 'all-interfaces';
  if (!bindHost) result.warnings.push({ code: 'BIND_HOST_UNRESTRICTED', message: 'P2PFLOW_BIND_HOST is empty, so Node may listen on every interface. Use 127.0.0.1 behind Nginx unless your platform requires another bind address.' });
  if (bindHost && !isLoopbackHostname(bindHost)) result.warnings.push({ code: 'PUBLIC_BIND_ADDRESS', message: `The Node process binds to ${bindHost}. Restrict it at the firewall and expose only the HTTPS reverse proxy.` });

  const mailFrom = clean(env.P2PFLOW_MAIL_FROM || env.CRM_MAIL_FROM || '');
  if (!mailFrom || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailFrom)) result.warnings.push({ code: 'MAIL_FROM_NOT_READY', message: 'P2PFLOW_MAIL_FROM is missing or invalid. Login OTP and security notifications may not be deliverable.' });
  const mailDriver = clean(env.P2PFLOW_MAIL_DRIVER || env.CRM_MAIL_DRIVER || 'local').toLowerCase();
  if (mailDriver === 'smtp' && !clean(env.P2PFLOW_SMTP_HOST || env.CRM_SMTP_HOST || '')) result.errors.push({ code: 'SMTP_HOST_MISSING', message: 'SMTP mail driver is selected, but P2PFLOW_SMTP_HOST is missing.' });

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
  hostToken,
  hostnameToken,
  hasSecretVariety,
  classifyStartupError,
  runProductionPreflight
};
