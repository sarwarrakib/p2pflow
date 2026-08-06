'use strict';

const crypto = require('crypto');
const { URL } = require('url');

function safeIdentifier(value, fallback = 'p2pflow_state') {
  const cleaned = String(value || fallback).replace(/[^a-zA-Z0-9_]/g, '_');
  return cleaned || fallback;
}

function quotedIdentifier(value) {
  return `\`${String(value).replace(/`/g, '``')}\``;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function mysqlConnectionOptions(connectionString, extra = {}) {
  let parsed;
  try { parsed = new URL(String(connectionString || '')); }
  catch { throw new Error('P2PFLOW_DATABASE_URL is not a valid MariaDB/MySQL connection URL.'); }
  if (!['mysql:', 'mariadb:'].includes(parsed.protocol)) {
    throw new Error('MariaDB/MySQL connection URL must begin with mysql:// or mariadb://.');
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!database) throw new Error('MariaDB/MySQL connection URL must include a database name.');
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username || ''),
    password: decodeURIComponent(parsed.password || ''),
    database,
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: false,
    dateStrings: false,
    decimalNumbers: true,
    enableKeepAlive: true,
    waitForConnections: true,
    queueLimit: 0,
    ...extra
  };
}

function parseJson(value, fallback = {}) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object' && !Buffer.isBuffer(value)) return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

class MySqlStateStore {
  constructor(options = {}) {
    this.provider = 'mysql';
    this.connectionString = String(options.connectionString || '').trim();
    this.table = safeIdentifier(options.table || 'p2pflow_state');
    this.historyTable = safeIdentifier(options.historyTable || `${this.table}_history`);
    this.backupTable = safeIdentifier(options.backupTable || `${this.table}_backups`);
    this.objectTable = safeIdentifier(options.objectTable || `${this.table}_objects`);
    this.appKey = String(options.appKey || '');
    this.appVersion = String(options.appVersion || '0.0.0');
    this.poolMax = Math.max(2, Number(options.poolMax || 5) || 5);
    this.ssl = options.ssl || undefined;
    this.historyLimit = Math.max(20, Number(options.historyLimit || 500) || 500);
    this.instanceLockKey = String(options.instanceLockKey || `${this.table}:single-instance`).slice(0, 64);
    this.pool = options.pool || null;
    this.externalPool = Boolean(options.pool);
    this.lockConnection = null;
    this.saveQueued = false;
    this.saveInFlight = null;
    this.queuedReasons = new Set();
    this.currentRevision = 0;
    this.lastError = '';
    this.lastSavedAt = null;
  }

  keyBytes() {
    return crypto.createHash('sha256').update(this.appKey).digest();
  }

  encryptObject(obj) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.keyBytes(), iv);
    const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
  }

  decryptObject(text) {
    const box = JSON.parse(String(text || ''));
    if (!box || box.v !== 1 || !box.iv || !box.tag || !box.data) throw new Error('Unsupported encrypted database payload.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.keyBytes(), Buffer.from(box.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(box.data, 'base64')), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }

  encryptBuffer(buffer) {
    const plaintext = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.keyBytes(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([Buffer.from('P2PFLOW01', 'ascii'), iv, cipher.getAuthTag(), encrypted]);
  }

  decryptBuffer(buffer) {
    const payload = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
    const magic = payload.subarray(0, 9).toString('ascii');
    if (!['P2PFLOW01', 'RNEEDOBJ1'].includes(magic)) return payload;
    if (payload.length < 37) throw new Error('Encrypted database object is truncated.');
    const iv = payload.subarray(9, 21);
    const tag = payload.subarray(21, 37);
    const encrypted = payload.subarray(37);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.keyBytes(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  async init() {
    if (!this.connectionString && !this.pool) throw new Error('P2PFLOW_DATABASE_URL is required for MariaDB/MySQL storage.');
    if (this.appKey.length < 32 || this.appKey === 'change-this-to-a-long-random-secret-before-production') {
      throw new Error('P2PFLOW_APP_KEY must be a unique secret of at least 32 characters. Keep it permanently; changing it makes encrypted database payloads unreadable.');
    }
    if (!this.pool) {
      let mysql;
      try { mysql = require('mysql2/promise'); }
      catch { throw new Error('The mysql2 dependency is not installed. Use the hosting panel Run NPM Install button first.'); }
      const options = mysqlConnectionOptions(this.connectionString, {
        connectionLimit: this.poolMax,
        connectTimeout: 10000,
        ssl: this.ssl
      });
      this.pool = mysql.createPool(options);
    }
    await this.ensureSchema();
    await this.acquireSingleInstanceLock();
  }

  async ensureColumn(table, column, definition) {
    const [rows] = await this.pool.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`, [table, column]);
    if (!rows.length) await this.pool.query(`ALTER TABLE ${quotedIdentifier(table)} ADD COLUMN ${quotedIdentifier(column)} ${definition}`);
  }

  async ensureSchema() {
    const main = quotedIdentifier(this.table);
    const history = quotedIdentifier(this.historyTable);
    const backups = quotedIdentifier(this.backupTable);
    const objects = quotedIdentifier(this.objectTable);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS ${main} (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      payload LONGTEXT NOT NULL,
      revision BIGINT NOT NULL DEFAULT 0,
      checksum CHAR(64) NOT NULL DEFAULT '',
      app_version VARCHAR(64) NOT NULL DEFAULT '',
      schema_version INT NOT NULL DEFAULT 0,
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await this.ensureColumn(this.table, 'revision', 'BIGINT NOT NULL DEFAULT 0');
    await this.ensureColumn(this.table, 'checksum', "CHAR(64) NOT NULL DEFAULT ''");
    await this.ensureColumn(this.table, 'app_version', "VARCHAR(64) NOT NULL DEFAULT ''");
    await this.ensureColumn(this.table, 'schema_version', 'INT NOT NULL DEFAULT 0');
    await this.ensureColumn(this.table, 'updated_at', 'DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)');

    await this.pool.query(`CREATE TABLE IF NOT EXISTS ${history} (
      revision BIGINT NOT NULL PRIMARY KEY,
      payload LONGTEXT NOT NULL,
      checksum CHAR(64) NOT NULL,
      app_version VARCHAR(64) NOT NULL,
      schema_version INT NOT NULL,
      reason VARCHAR(240) NOT NULL DEFAULT '',
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      INDEX ${quotedIdentifier(`${this.historyTable}_created_idx`)} (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await this.pool.query(`CREATE TABLE IF NOT EXISTS ${backups} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      label VARCHAR(180) NOT NULL,
      source_revision BIGINT NOT NULL DEFAULT 0,
      payload LONGTEXT NOT NULL,
      checksum CHAR(64) NOT NULL,
      app_version VARCHAR(64) NOT NULL,
      schema_version INT NOT NULL,
      metadata LONGTEXT NOT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      INDEX ${quotedIdentifier(`${this.backupTable}_created_idx`)} (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await this.pool.query(`CREATE TABLE IF NOT EXISTS ${objects} (
      object_id VARCHAR(191) NOT NULL PRIMARY KEY,
      kind VARCHAR(60) NOT NULL DEFAULT 'file',
      content_type VARCHAR(180) NOT NULL DEFAULT 'application/octet-stream',
      filename VARCHAR(255) NOT NULL DEFAULT '',
      size_bytes BIGINT NOT NULL DEFAULT 0,
      checksum CHAR(64) NOT NULL,
      data LONGBLOB NOT NULL,
      metadata LONGTEXT NOT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  async acquireSingleInstanceLock() {
    this.lockConnection = await this.pool.getConnection();
    const [rows] = await this.lockConnection.query('SELECT GET_LOCK(?, 0) AS locked', [this.instanceLockKey]);
    if (!rows[0] || Number(rows[0].locked) !== 1) {
      this.lockConnection.release();
      this.lockConnection = null;
      throw new Error('Another application instance already owns this database. Start only one writer instance to prevent transaction loss.');
    }
  }

  validPayload(row) {
    if (!row || !row.payload) return false;
    return !row.checksum || row.checksum === sha256(row.payload);
  }

  async hasMainState() {
    const [rows] = await this.pool.query(`SELECT id FROM ${quotedIdentifier(this.table)} WHERE id = ? LIMIT 1`, ['main']);
    return rows.length > 0;
  }

  async loadState({ seed, migrate }) {
    const main = quotedIdentifier(this.table);
    const history = quotedIdentifier(this.historyTable);
    const [mainRows] = await this.pool.query(`SELECT payload, revision, checksum, app_version, schema_version, updated_at FROM ${main} WHERE id = ?`, ['main']);
    const mainRow = mainRows[0] || null;
    const [historyRows] = await this.pool.query(`SELECT payload, revision, checksum, app_version, schema_version, created_at AS updated_at FROM ${history} ORDER BY revision DESC LIMIT 25`);
    let row = null;
    let state = null;
    let recoveredFromHistory = false;
    let lastStoredError = null;
    const candidates = [...(mainRow ? [{ row: mainRow, history: false }] : []), ...historyRows.map(item => ({ row: item, history: true }))];
    for (const candidate of candidates) {
      if (!this.validPayload(candidate.row)) {
        lastStoredError = new Error(`Stored database revision ${candidate.row.revision || 0} failed its checksum.`);
        continue;
      }
      try {
        state = this.decryptObject(candidate.row.payload);
        row = candidate.row;
        recoveredFromHistory = candidate.history;
        break;
      } catch (error) { lastStoredError = error; }
    }
    if (row) this.currentRevision = Number(row.revision || 0);
    else if (candidates.length) {
      const error = new Error('No verified MariaDB/MySQL state revision could be decrypted. Startup was stopped to protect existing data; verify P2PFLOW_APP_KEY and inspect the database history.');
      error.cause = lastStoredError || undefined;
      throw error;
    } else {
      state = await seed();
      this.currentRevision = 0;
    }
    await migrate(state);
    await this.writeState(state, recoveredFromHistory ? 'automatic_history_recovery' : (row ? 'startup_migration' : 'fresh_database'));
    return { state, recoveredFromHistory, createdFresh: !row, revision: this.currentRevision };
  }

  async writeState(state, reason = 'state_update') {
    const payload = this.encryptObject(state);
    const checksum = sha256(payload);
    const schemaVersion = Number(state && state.meta && state.meta.schemaVersion || 0);
    const main = quotedIdentifier(this.table);
    const history = quotedIdentifier(this.historyTable);
    const client = await this.pool.getConnection();
    try {
      await client.beginTransaction();
      const [currentRows] = await client.query(`SELECT revision FROM ${main} WHERE id = ? FOR UPDATE`, ['main']);
      const revision = Number(currentRows[0] && currentRows[0].revision || 0) + 1;
      await client.query(`INSERT INTO ${main} (id, payload, revision, checksum, app_version, schema_version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))
        ON DUPLICATE KEY UPDATE payload=VALUES(payload), revision=VALUES(revision), checksum=VALUES(checksum), app_version=VALUES(app_version), schema_version=VALUES(schema_version), updated_at=CURRENT_TIMESTAMP(6)`,
      ['main', payload, revision, checksum, this.appVersion, schemaVersion]);
      await client.query(`INSERT IGNORE INTO ${history} (revision, payload, checksum, app_version, schema_version, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))`,
      [revision, payload, checksum, this.appVersion, schemaVersion, String(reason || 'state_update').slice(0, 240)]);
      const [oldRows] = await client.query(`SELECT revision FROM ${history} ORDER BY revision DESC LIMIT 100000 OFFSET ?`, [this.historyLimit]);
      if (oldRows.length) {
        const placeholders = oldRows.map(() => '?').join(',');
        await client.query(`DELETE FROM ${history} WHERE revision IN (${placeholders})`, oldRows.map(item => item.revision));
      }
      await client.commit();
      this.currentRevision = revision;
      this.lastSavedAt = new Date().toISOString();
      this.lastError = '';
      return { revision, checksum, schemaVersion };
    } catch (error) {
      try { await client.rollback(); } catch {}
      this.lastError = String(error && error.message || error || 'MariaDB/MySQL save failed');
      throw error;
    } finally { client.release(); }
  }

  scheduleSave(getState, reason = 'state_update') {
    this.saveQueued = true;
    this.queuedReasons.add(String(reason || 'state_update').slice(0, 120));
    if (this.saveInFlight) return this.saveInFlight;
    this.saveInFlight = (async () => {
      while (this.saveQueued) {
        this.saveQueued = false;
        const reasons = Array.from(this.queuedReasons);
        this.queuedReasons.clear();
        const state = await getState();
        await this.writeState(state, reasons.join(',') || 'state_update');
      }
    })().finally(() => {
      this.saveInFlight = null;
      if (this.saveQueued) this.scheduleSave(getState, 'queued_follow_up');
    });
    return this.saveInFlight;
  }

  async flush(getState) {
    while (this.saveQueued || this.saveInFlight) {
      if (this.saveQueued && !this.saveInFlight) this.scheduleSave(getState, 'flush');
      const active = this.saveInFlight;
      if (active) await active;
    }
  }

  async putObject(objectId, buffer, metadata = {}) {
    const id = String(objectId || '').trim();
    if (!id) throw new Error('Database object ID is required.');
    const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
    if (!data.length) throw new Error(`Database object ${id} is empty.`);
    const checksum = crypto.createHash('sha256').update(data).digest('hex');
    const objects = quotedIdentifier(this.objectTable);
    const sealed = this.encryptBuffer(data);
    const objectMetadata = { ...(metadata.metadata || {}), encryption: 'aes-256-gcm-v1' };
    const values = [id, String(metadata.kind || 'file').slice(0, 60), String(metadata.contentType || 'application/octet-stream').slice(0, 180), String(metadata.filename || '').slice(0, 255), data.length, checksum, sealed, JSON.stringify(objectMetadata)];
    const [inserted] = await this.pool.query(`INSERT IGNORE INTO ${objects} (object_id, kind, content_type, filename, size_bytes, checksum, data, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))`, values);
    if (!inserted.affectedRows) {
      const [existing] = await this.pool.query(`SELECT checksum, size_bytes FROM ${objects} WHERE object_id=?`, [id]);
      const row = existing[0];
      if (!row || row.checksum !== checksum || Number(row.size_bytes || 0) !== data.length) {
        throw new Error(`Immutable database object conflict: ${id}. Existing backup-referenced bytes were not overwritten.`);
      }
      await this.pool.query(`UPDATE ${objects} SET kind=?, content_type=?, filename=?, metadata=?, updated_at=CURRENT_TIMESTAMP(6) WHERE object_id=?`, [values[1], values[2], values[3], values[7], id]);
    }
    return { objectId: id, sizeBytes: data.length, checksum, immutable: true };
  }

  async getObject(objectId) {
    const objects = quotedIdentifier(this.objectTable);
    const [rows] = await this.pool.query(`SELECT object_id, kind, content_type, filename, size_bytes, checksum, data, metadata, created_at, updated_at FROM ${objects} WHERE object_id=?`, [String(objectId || '')]);
    const row = rows[0] || null;
    if (!row) return null;
    const data = this.decryptBuffer(Buffer.from(row.data || []));
    const checksum = crypto.createHash('sha256').update(data).digest('hex');
    if (row.checksum && row.checksum !== checksum) throw new Error(`Database object checksum failed: ${row.object_id}`);
    return { ...row, metadata: parseJson(row.metadata, {}), data };
  }

  async createBackup(state, label, metadata = {}) {
    await this.flush(() => state);
    const payload = this.encryptObject(state);
    const checksum = sha256(payload);
    const schemaVersion = Number(state && state.meta && state.meta.schemaVersion || 0);
    const backups = quotedIdentifier(this.backupTable);
    const [result] = await this.pool.query(`INSERT INTO ${backups} (label, source_revision, payload, checksum, app_version, schema_version, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))`,
    [String(label || 'manual_backup').slice(0, 180), this.currentRevision, payload, checksum, this.appVersion, schemaVersion, JSON.stringify(metadata || {})]);
    const [rows] = await this.pool.query(`SELECT id, label, source_revision, app_version, schema_version, metadata, created_at FROM ${backups} WHERE id=?`, [result.insertId]);
    const row = rows[0] || null;
    return row ? { ...row, metadata: parseJson(row.metadata, {}) } : null;
  }

  async listBackups(limit = 20) {
    const backups = quotedIdentifier(this.backupTable);
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const [rows] = await this.pool.query(`SELECT id, label, source_revision, app_version, schema_version, metadata, created_at FROM ${backups} ORDER BY id DESC LIMIT ${safeLimit}`);
    return rows.map(row => ({ ...row, metadata: parseJson(row.metadata, {}) }));
  }

  async health() {
    const started = Date.now();
    const [rows] = await this.pool.query('SELECT VERSION() AS version');
    return {
      ok: true,
      provider: 'mysql',
      databaseVersion: String(rows[0] && rows[0].version || ''),
      table: this.table,
      revision: this.currentRevision,
      lastSavedAt: this.lastSavedAt,
      lastError: this.lastError,
      ms: Date.now() - started,
      singleWriterLock: Boolean(this.lockConnection)
    };
  }

  async close() {
    try { if (this.saveInFlight) await this.saveInFlight; } catch {}
    if (this.lockConnection) {
      try { await this.lockConnection.query('SELECT RELEASE_LOCK(?) AS released', [this.instanceLockKey]); } catch {}
      try { this.lockConnection.release(); } catch {}
      this.lockConnection = null;
    }
    if (this.pool && !this.externalPool) await this.pool.end();
    if (!this.externalPool) this.pool = null;
  }
}

module.exports = { MySqlStateStore, mysqlConnectionOptions, sha256 };
