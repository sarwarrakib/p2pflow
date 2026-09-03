'use strict';

const crypto = require('crypto');
const { CODEC_LABEL, encodeStateObject, encodeStateObjectAsync, decodeStateObject, payloadInfo, payloadNeedsUpgrade } = require('./statePayloadCodec');
const { boundedChunkRows, prepareSegmentedState, hydrateSegmentedState } = require('./stateSegmentation');
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
    this.historyLimit = Math.min(12, Math.max(2, Number(options.historyLimit || 3) || 3));
    this.historyWriteIntervalMs = Math.max(15 * 60_000, Number(options.historyWriteIntervalMs || 6 * 60 * 60_000) || 6 * 60 * 60_000);
    this.historyCleanupBatch = Math.min(10, Math.max(1, Number(options.historyCleanupBatch || 3) || 3));
    this.backupLimit = Math.min(20, Math.max(2, Number(options.backupLimit || 5) || 5));
    this.historyMaintenanceTimer = null;
    this.historyMaintenanceInFlight = false;
    this.historyLastArchivedAt = 0;
    this.instanceLockKey = String(options.instanceLockKey || `${this.table}:single-instance`).slice(0, 64);
    this.pool = options.pool || null;
    this.externalPool = Boolean(options.pool);
    this.lockConnection = null;
    this.saveQueued = false;
    this.saveInFlight = null;
    this.queuedReasons = new Set();
    // v1.7.7: each save request gets its own durability ticket. HTTP mutations
    // wait only until their ticket is included in a committed snapshot instead
    // of waiting for the entire background save queue to become idle.
    this.saveTicketCounter = 0;
    this.persistedSaveTicket = 0;
    this.saveWaiters = [];
    this.currentRevision = 0;
    this.lastError = '';
    this.lastSavedAt = null;
    this.lastPayloadInfo = null;
    this.segmentChunkRows = boundedChunkRows(options.segmentChunkRows || process.env.P2PFLOW_STATE_SEGMENT_CHUNK_ROWS || 500);
    this.segmentStateCache = new Map();
    this.lastSegmentInfo = null;
  }

  keyBytes() {
    return crypto.createHash('sha256').update(this.appKey).digest();
  }

  encryptObject(obj) {
    return encodeStateObject(obj, this.appKey);
  }

  encryptObjectAsync(obj) {
    return encodeStateObjectAsync(obj, this.appKey);
  }

  decryptObject(text) {
    return decodeStateObject(text, this.appKey);
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

  async tableExists(table) {
    const [rows] = await this.pool.query(`SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, [table]);
    return rows.length > 0;
  }

  async ensureColumn(table, column, definition) {
    const [rows] = await this.pool.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`, [table, column]);
    if (!rows.length) await this.pool.query(`ALTER TABLE ${quotedIdentifier(table)} ADD COLUMN ${quotedIdentifier(column)} ${definition}`);
  }

  async createTableIfMissing(table, sql) {
    if (await this.tableExists(table)) return false;
    try {
      await this.pool.query(sql);
      return true;
    } catch (error) {
      const message = String(error && error.message || error || '');
      if (/CREATE command denied|permission denied|access denied/i.test(message)) {
        const wrapped = new Error(`Database table ${table} is missing and this database user does not have CREATE permission. Create the table once with an administrator account or grant CREATE temporarily. Existing installations do not require CREATE permission after the table exists.`);
        wrapped.cause = error;
        throw wrapped;
      }
      throw error;
    }
  }

  async ensureSchema() {
    const main = quotedIdentifier(this.table);
    const history = quotedIdentifier(this.historyTable);
    const backups = quotedIdentifier(this.backupTable);
    const objects = quotedIdentifier(this.objectTable);
    await this.createTableIfMissing(this.table, `CREATE TABLE ${main} (
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

    await this.createTableIfMissing(this.historyTable, `CREATE TABLE ${history} (
      revision BIGINT NOT NULL PRIMARY KEY,
      payload LONGTEXT NOT NULL,
      checksum CHAR(64) NOT NULL,
      app_version VARCHAR(64) NOT NULL,
      schema_version INT NOT NULL,
      reason VARCHAR(240) NOT NULL DEFAULT '',
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      INDEX ${quotedIdentifier(`${this.historyTable}_created_idx`)} (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await this.createTableIfMissing(this.backupTable, `CREATE TABLE ${backups} (
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

    await this.createTableIfMissing(this.objectTable, `CREATE TABLE ${objects} (
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
    let row = null;
    let state = null;
    let recoveredFromHistory = false;
    let lastStoredError = null;
    let storedCandidateCount = mainRow ? 1 : 0;

    if (mainRow) {
      if (!this.validPayload(mainRow)) lastStoredError = new Error(`Stored database revision ${mainRow.revision || 0} failed its checksum.`);
      else {
        try {
          state = await hydrateSegmentedState(this.decryptObject(mainRow.payload), this);
          row = mainRow;
        } catch (error) { lastStoredError = error; }
      }
    }

    if (!row) {
      const [historyRefs] = await this.pool.query(`SELECT revision FROM ${history} ORDER BY revision DESC LIMIT ?`, [Math.min(8, this.historyLimit)]);
      storedCandidateCount += historyRefs.length;
      for (const ref of historyRefs) {
        const [historyRows] = await this.pool.query(`SELECT payload, revision, checksum, app_version, schema_version, created_at AS updated_at FROM ${history} WHERE revision = ? LIMIT 1`, [ref.revision]);
        const candidate = historyRows[0] || null;
        if (!candidate) continue;
        if (!this.validPayload(candidate)) {
          lastStoredError = new Error(`Stored database revision ${candidate.revision || 0} failed its checksum.`);
          continue;
        }
        try {
          state = await hydrateSegmentedState(this.decryptObject(candidate.payload), this);
          row = candidate;
          recoveredFromHistory = true;
          break;
        } catch (error) { lastStoredError = error; }
      }
    }

    if (row) this.currentRevision = Number(row.revision || 0);
    else if (storedCandidateCount > 0) {
      const error = new Error('No verified MariaDB/MySQL state revision could be decrypted. Startup was stopped to protect existing data; verify P2PFLOW_APP_KEY and inspect the database history.');
      error.cause = lastStoredError || undefined;
      throw error;
    } else {
      state = await seed();
      this.currentRevision = 0;
    }

    const beforeMigrationHash = sha256(JSON.stringify(state));
    await migrate(state);
    const afterMigrationHash = sha256(JSON.stringify(state));
    const migrationChanged = beforeMigrationHash !== afterMigrationHash;

    if (!row) {
      await this.writeState(state, 'fresh_database', { forceHistory: true });
    } else if (recoveredFromHistory) {
      await this.writeState(state, 'automatic_history_recovery', { forceHistory: true });
    } else if (migrationChanged) {
      await this.archiveStoredRow(mainRow, 'pre_startup_migration');
      await this.writeState(state, 'startup_migration', { forceHistory: true });
    } else if (mainRow && payloadNeedsUpgrade(mainRow.payload)) {
      await this.writeState(state, 'payload_compaction');
    } else {
      this.lastSavedAt = mainRow && mainRow.updated_at ? new Date(mainRow.updated_at).toISOString() : null;
      this.lastPayloadInfo = mainRow ? payloadInfo(mainRow.payload) : null;
    }
    this.scheduleHistoryMaintenance(750);
    return { state, recoveredFromHistory, createdFresh: !row, revision: this.currentRevision };
  }

  async archiveStoredRow(row, reason = 'checkpoint') {
    if (!row || !row.payload || !this.validPayload(row)) return false;
    const history = quotedIdentifier(this.historyTable);
    try {
      await this.pool.query(`INSERT IGNORE INTO ${history} (revision, payload, checksum, app_version, schema_version, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))`, [Number(row.revision || 0), row.payload, row.checksum || sha256(row.payload), row.app_version || this.appVersion, Number(row.schema_version || 0), String(reason || 'checkpoint').slice(0, 240)]);
      return true;
    } catch (error) {
      console.warn(`History checkpoint skipped: ${String(error && error.message || error || 'unknown error')}`);
      return false;
    }
  }

  async shouldArchiveHistory(client, reason = 'state_update', forceHistory = false) {
    if (forceHistory) return true;
    const history = quotedIdentifier(this.historyTable);
    const [rows] = await client.query(`SELECT revision, created_at FROM ${history} ORDER BY revision DESC LIMIT 1`);
    if (!rows.length) return true;
    const lastAt = Date.parse(rows[0].created_at || '') || this.historyLastArchivedAt || 0;
    this.historyLastArchivedAt = lastAt;
    const important = /automatic_history_recovery|fresh_database|startup_migration|restore|manual_checkpoint/i.test(String(reason || ''));
    return important || !lastAt || Date.now() - lastAt >= this.historyWriteIntervalMs;
  }

  async writeState(state, reason = 'state_update', options = {}) {
    const segmented = await prepareSegmentedState(state, this, { chunkRows:this.segmentChunkRows, cache:this.segmentStateCache });
    const payload = await this.encryptObjectAsync(segmented.state);
    this.lastSegmentInfo = segmented.info;
    const checksum = sha256(payload);
    const schemaVersion = Number(state && state.meta && state.meta.schemaVersion || 0);
    const main = quotedIdentifier(this.table);
    const history = quotedIdentifier(this.historyTable);
    const client = await this.pool.getConnection();
    let archived = false;
    try {
      await client.beginTransaction();
      const [currentRows] = await client.query(`SELECT revision FROM ${main} WHERE id = ? FOR UPDATE`, ['main']);
      const revision = Number(currentRows[0] && currentRows[0].revision || 0) + 1;
      await client.query(`INSERT INTO ${main} (id, payload, revision, checksum, app_version, schema_version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))
        ON DUPLICATE KEY UPDATE payload=VALUES(payload), revision=VALUES(revision), checksum=VALUES(checksum), app_version=VALUES(app_version), schema_version=VALUES(schema_version), updated_at=CURRENT_TIMESTAMP(6)`,
      ['main', payload, revision, checksum, this.appVersion, schemaVersion]);
      if (await this.shouldArchiveHistory(client, reason, options.forceHistory === true)) {
        await client.query(`INSERT IGNORE INTO ${history} (revision, payload, checksum, app_version, schema_version, reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))`,
        [revision, payload, checksum, this.appVersion, schemaVersion, String(reason || 'state_update').slice(0, 240)]);
        archived = true;
      }
      await client.commit();
      this.currentRevision = revision;
      this.lastSavedAt = new Date().toISOString();
      this.lastPayloadInfo = payloadInfo(payload);
      if (archived) this.historyLastArchivedAt = Date.now();
      this.lastError = '';
      this.scheduleHistoryMaintenance(500);
      return { revision, checksum, schemaVersion, historyArchived: archived };
    } catch (error) {
      try { await client.rollback(); } catch {}
      this.lastError = String(error && error.message || error || 'MariaDB/MySQL save failed');
      throw error;
    } finally { client.release(); }
  }

  scheduleHistoryMaintenance(delayMs = 1000) {
    if (this.historyMaintenanceTimer || !this.pool) return;
    this.historyMaintenanceTimer = setTimeout(() => {
      this.historyMaintenanceTimer = null;
      this.runHistoryMaintenance().catch(error => {
        console.warn(`Database history maintenance skipped: ${String(error && error.message || error || 'unknown error')}`);
      });
    }, Math.max(50, Number(delayMs || 0)));
    if (typeof this.historyMaintenanceTimer.unref === 'function') this.historyMaintenanceTimer.unref();
  }

  async runHistoryMaintenance() {
    if (this.historyMaintenanceInFlight || !this.pool) return { pruned: 0, compacted: 0, remaining: 0 };
    this.historyMaintenanceInFlight = true;
    const history = quotedIdentifier(this.historyTable);
    let pruned = 0;
    let compacted = 0;
    let more = false;
    try {
      const [rows] = await this.pool.query(`SELECT revision FROM ${history} ORDER BY revision DESC LIMIT ? OFFSET ?`, [this.historyCleanupBatch, this.historyLimit]);
      if (rows.length) {
        const placeholders = rows.map(() => '?').join(',');
        const [result] = await this.pool.query(`DELETE FROM ${history} WHERE revision IN (${placeholders})`, rows.map(item => item.revision));
        pruned = Number(result && result.affectedRows || 0);
      }
      more = rows.length === this.historyCleanupBatch;
      try {
        const result = await this.compactLegacyPayloads(2);
        compacted = Number(result.compacted || 0);
        more = more || Boolean(result.more);
      } catch (error) {
        // Compaction is a size optimization only; never block normal durability.
        console.warn(`Database payload compaction skipped: ${String(error && error.message || error || 'unknown error')}`);
      }
      try { await this.pruneBackups(); } catch {}
      if (more) this.scheduleHistoryMaintenance(1200);
      return { pruned, compacted, remaining: more ? 'more' : 0 };
    } finally {
      this.historyMaintenanceInFlight = false;
    }
  }

  async compactLegacyPayloads(limit = 2) {
    const safeLimit = Math.max(1, Math.min(5, Number(limit) || 2));
    const history = quotedIdentifier(this.historyTable);
    const backups = quotedIdentifier(this.backupTable);
    let compacted = 0;
    let seen = 0;
    const [historyRows] = await this.pool.query(`SELECT revision, payload, checksum FROM ${history} WHERE payload LIKE '%\"v\":1%' ORDER BY revision DESC LIMIT ${safeLimit}`);
    for (const row of historyRows || []) {
      seen += 1;
      if (!payloadNeedsUpgrade(row.payload) || (row.checksum && row.checksum !== sha256(row.payload))) continue;
      const nextPayload = await this.encryptObjectAsync(this.decryptObject(row.payload));
      const nextChecksum = sha256(nextPayload);
      const [result] = await this.pool.query(`UPDATE ${history} SET payload=?, checksum=? WHERE revision=? AND checksum=?`, [nextPayload, nextChecksum, row.revision, row.checksum || sha256(row.payload)]);
      compacted += Number(result && result.affectedRows || 0);
    }
    const remaining = Math.max(0, safeLimit - seen);
    if (remaining > 0) {
      const [backupRows] = await this.pool.query(`SELECT id, payload, checksum FROM ${backups} WHERE payload LIKE '%\"v\":1%' ORDER BY id DESC LIMIT ${remaining}`);
      for (const row of backupRows || []) {
        seen += 1;
        if (!payloadNeedsUpgrade(row.payload) || (row.checksum && row.checksum !== sha256(row.payload))) continue;
        const nextPayload = await this.encryptObjectAsync(this.decryptObject(row.payload));
        const nextChecksum = sha256(nextPayload);
        const [result] = await this.pool.query(`UPDATE ${backups} SET payload=?, checksum=? WHERE id=? AND checksum=?`, [nextPayload, nextChecksum, row.id, row.checksum || sha256(row.payload)]);
        compacted += Number(result && result.affectedRows || 0);
      }
    }
    return { compacted, more: seen >= safeLimit };
  }

  waitForSaveTicket(ticket) {
    const target = Math.max(0, Number(ticket || 0));
    if (!target || this.persistedSaveTicket >= target) {
      return Promise.resolve({ ticket: target, revision: this.currentRevision });
    }
    return new Promise((resolve, reject) => {
      this.saveWaiters.push({ ticket: target, resolve, reject });
    });
  }

  resolveSaveWaiters() {
    if (!this.saveWaiters.length) return;
    const pending = [];
    for (const waiter of this.saveWaiters) {
      if (waiter.ticket <= this.persistedSaveTicket) waiter.resolve({ ticket: waiter.ticket, revision: this.currentRevision });
      else pending.push(waiter);
    }
    this.saveWaiters = pending;
  }

  rejectSaveWaiters(error) {
    const waiters = this.saveWaiters.splice(0);
    for (const waiter of waiters) waiter.reject(error);
  }

  startSaveWorker(getState) {
    if (this.saveInFlight || !this.saveQueued) return;
    const worker = (async () => {
      while (this.saveQueued) {
        this.saveQueued = false;
        const reasons = Array.from(this.queuedReasons);
        this.queuedReasons.clear();
        // Tickets scheduled after this point are intentionally handled by the
        // next loop. This makes a request-specific promise a precise durability
        // barrier even while background Binance/chat checkpoints keep arriving.
        const targetTicket = this.saveTicketCounter;
        const state = await getState();
        await this.writeState(state, reasons.join(',') || 'state_update');
        this.persistedSaveTicket = Math.max(this.persistedSaveTicket, targetTicket);
        this.resolveSaveWaiters();
      }
    })();
    this.saveInFlight = worker;
    worker.then(() => {
      if (this.saveInFlight === worker) this.saveInFlight = null;
      if (this.saveQueued) this.startSaveWorker(getState);
    }, error => {
      if (this.saveInFlight === worker) this.saveInFlight = null;
      this.saveQueued = false;
      this.queuedReasons.clear();
      this.rejectSaveWaiters(error);
    });
  }

  scheduleSave(getState, reason = 'state_update') {
    const ticket = ++this.saveTicketCounter;
    this.saveQueued = true;
    this.queuedReasons.add(String(reason || 'state_update').slice(0, 120));
    const waiter = this.waitForSaveTicket(ticket);
    this.startSaveWorker(getState);
    return waiter;
  }

  async flush(getState) {
    // Full drains remain available for shutdown/backups. Normal HTTP mutations
    // do not use this global barrier in v1.7.7; they wait on their own ticket.
    while (this.saveQueued || this.saveInFlight) {
      if (this.saveQueued && !this.saveInFlight) this.startSaveWorker(getState);
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

  async pruneBackups() {
    const backups = quotedIdentifier(this.backupTable);
    const [rows] = await this.pool.query(`SELECT id FROM ${backups} ORDER BY id DESC LIMIT 10 OFFSET ?`, [this.backupLimit]);
    if (!rows.length) return 0;
    const placeholders = rows.map(() => '?').join(',');
    const [result] = await this.pool.query(`DELETE FROM ${backups} WHERE id IN (${placeholders})`, rows.map(row => row.id));
    const deleted = Number(result && result.affectedRows || 0);
    if (rows.length === 10) setTimeout(() => this.pruneBackups().catch(() => {}), 500).unref?.();
    return deleted;
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
    try { await this.pruneBackups(); } catch {}
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
    let storage = { totalBytes: 0, tables: {}, rowCounts: {}, objectSourceBytes: 0 };
    try {
      const names = [this.table, this.historyTable, this.backupTable, this.objectTable];
      const placeholders = names.map(() => '?').join(',');
      const [sizes] = await this.pool.query(`SELECT TABLE_NAME, COALESCE(DATA_LENGTH,0) AS data_bytes, COALESCE(INDEX_LENGTH,0) AS index_bytes, COALESCE(TABLE_ROWS,0) AS table_rows FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${placeholders})`, names);
      for (const row of sizes || []) {
        const bytes = Number(row.data_bytes || 0) + Number(row.index_bytes || 0);
        const name = String(row.TABLE_NAME || row.table_name || '');
        storage.tables[name] = bytes;
        storage.rowCounts[name] = Number(row.table_rows || row.TABLE_ROWS || 0);
        storage.totalBytes += bytes;
      }
      const [objectStats] = await this.pool.query(`SELECT COUNT(*) AS row_count, COALESCE(SUM(size_bytes),0) AS source_bytes FROM ${quotedIdentifier(this.objectTable)}`);
      if (objectStats[0]) {
        storage.rowCounts[this.objectTable] = Number(objectStats[0].row_count || 0);
        storage.objectSourceBytes = Number(objectStats[0].source_bytes || 0);
      }
    } catch {}
    return {
      ok: true,
      provider: 'mysql',
      databaseVersion: String(rows[0] && rows[0].version || ''),
      table: this.table,
      revision: this.currentRevision,
      lastSavedAt: this.lastSavedAt,
      lastError: this.lastError,
      payloadCodec: CODEC_LABEL,
      payload: this.lastPayloadInfo,
      segmentedState: this.lastSegmentInfo || { enabled:true, chunkRows:this.segmentChunkRows, collections:{} },
      storage,
      historyLimit: this.historyLimit,
      backupLimit: this.backupLimit,
      historyWriteIntervalMinutes: Math.round(this.historyWriteIntervalMs / 60000),
      historyMaintenanceInFlight: this.historyMaintenanceInFlight,
      saveQueue: {
        queued: Boolean(this.saveQueued),
        inFlight: Boolean(this.saveInFlight),
        waitingRequests: this.saveWaiters.length,
        scheduledTicket: this.saveTicketCounter,
        persistedTicket: this.persistedSaveTicket,
        lagTickets: Math.max(0, this.saveTicketCounter - this.persistedSaveTicket)
      },
      ms: Date.now() - started,
      singleWriterLock: Boolean(this.lockConnection)
    };
  }

  async close() {
    if (this.historyMaintenanceTimer) { clearTimeout(this.historyMaintenanceTimer); this.historyMaintenanceTimer = null; }
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
