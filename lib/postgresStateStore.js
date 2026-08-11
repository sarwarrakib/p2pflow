'use strict';

const crypto = require('crypto');
const { CODEC_LABEL, encodeStateObject, decodeStateObject, payloadInfo, payloadNeedsUpgrade } = require('./statePayloadCodec');

function safeIdentifier(value, fallback = 'p2pflow_state') {
  const cleaned = String(value || fallback).replace(/[^a-zA-Z0-9_]/g, '_');
  return cleaned || fallback;
}

function quotedIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

class PostgresStateStore {
  constructor(options = {}) {
    this.provider = 'postgres';
    this.connectionString = String(options.connectionString || '').trim();
    this.table = safeIdentifier(options.table || 'p2pflow_state');
    this.historyTable = safeIdentifier(options.historyTable || `${this.table}_history`);
    this.backupTable = safeIdentifier(options.backupTable || `${this.table}_backups`);
    this.objectTable = safeIdentifier(options.objectTable || `${this.table}_objects`);
    this.appKey = String(options.appKey || '');
    this.appVersion = String(options.appVersion || '0.0.0');
    // One connection is held for the lifetime advisory lock; at least one more is required for transactions.
    this.poolMax = Math.max(2, Number(options.poolMax || 5) || 5);
    this.ssl = options.ssl || undefined;
    this.historyLimit = Math.min(12, Math.max(2, Number(options.historyLimit || 3) || 3));
    this.historyWriteIntervalMs = Math.max(15 * 60_000, Number(options.historyWriteIntervalMs || 6 * 60 * 60_000) || 6 * 60 * 60_000);
    this.historyCleanupBatch = Math.min(10, Math.max(1, Number(options.historyCleanupBatch || 3) || 3));
    this.backupLimit = Math.min(20, Math.max(2, Number(options.backupLimit || 5) || 5));
    this.historyMaintenanceTimer = null;
    this.historyMaintenanceInFlight = false;
    this.historyLastArchivedAt = 0;
    this.instanceLockKey = String(options.instanceLockKey || `${this.table}:single-instance`);
    this.pool = options.pool || null;
    this.externalPool = Boolean(options.pool);
    this.lockClient = null;
    this.saveQueued = false;
    this.saveInFlight = null;
    this.queuedReasons = new Set();
    this.currentRevision = 0;
    this.lastError = '';
    this.lastSavedAt = null;
    this.lastPayloadInfo = null;
  }

  keyBytes() {
    return crypto.createHash('sha256').update(this.appKey).digest();
  }

  encryptObject(obj) {
    return encodeStateObject(obj, this.appKey);
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
    if (!['P2PFLOW01', 'RNEEDOBJ1'].includes(magic)) return payload; // Backward-compatible read for early or legacy sealed object rows.
    if (payload.length < 37) throw new Error('Encrypted database object is truncated.');
    const iv = payload.subarray(9, 21);
    const tag = payload.subarray(21, 37);
    const encrypted = payload.subarray(37);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.keyBytes(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  async init() {
    if (!this.connectionString && !this.pool) throw new Error('P2PFLOW_DATABASE_URL is required. Select PostgreSQL in the setup page or provide a PostgreSQL connection URL.');
    if (this.appKey.length < 32 || this.appKey === 'change-this-to-a-long-random-secret-before-production') {
      throw new Error('P2PFLOW_APP_KEY must be a unique secret of at least 32 characters. Keep it permanently; changing it makes encrypted database payloads unreadable.');
    }
    if (!this.pool) {
      let Pool;
      try { ({ Pool } = require('pg')); } catch {
        throw new Error('The pg dependency is not installed. Run npm ci --omit=dev before starting.');
      }
      this.pool = new Pool({ connectionString: this.connectionString, max: this.poolMax, ssl: this.ssl });
    }
    if (this.pool && typeof this.pool.on === 'function') this.pool.on('error', error => {
      this.lastError = String(error && error.message || error || 'PostgreSQL pool error');
      console.error('PostgreSQL pool error:', this.lastError);
    });
    await this.ensureSchema();
    await this.acquireSingleInstanceLock();
  }

  async ensureSchema() {
    const main = quotedIdentifier(this.table);
    const history = quotedIdentifier(this.historyTable);
    const backups = quotedIdentifier(this.backupTable);
    const objects = quotedIdentifier(this.objectTable);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${main} (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        revision BIGINT NOT NULL DEFAULT 0,
        checksum TEXT NOT NULL DEFAULT '',
        app_version TEXT NOT NULL DEFAULT '',
        schema_version INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE ${main} ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE ${main} ADD COLUMN IF NOT EXISTS checksum TEXT NOT NULL DEFAULT '';
      ALTER TABLE ${main} ADD COLUMN IF NOT EXISTS app_version TEXT NOT NULL DEFAULT '';
      ALTER TABLE ${main} ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS ${history} (
        revision BIGINT PRIMARY KEY,
        payload TEXT NOT NULL,
        checksum TEXT NOT NULL,
        app_version TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ${backups} (
        id BIGSERIAL PRIMARY KEY,
        label TEXT NOT NULL,
        source_revision BIGINT NOT NULL DEFAULT 0,
        payload TEXT NOT NULL,
        checksum TEXT NOT NULL,
        app_version TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ${objects} (
        object_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'file',
        content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        filename TEXT NOT NULL DEFAULT '',
        size_bytes BIGINT NOT NULL DEFAULT 0,
        checksum TEXT NOT NULL,
        data BYTEA NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ${quotedIdentifier(`${this.historyTable}_created_idx`)} ON ${history} (created_at DESC);
      CREATE INDEX IF NOT EXISTS ${quotedIdentifier(`${this.backupTable}_created_idx`)} ON ${backups} (created_at DESC);
    `);
  }

  async acquireSingleInstanceLock() {
    this.lockClient = await this.pool.connect();
    const result = await this.lockClient.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [this.instanceLockKey]);
    if (!result.rows[0] || result.rows[0].locked !== true) {
      this.lockClient.release();
      this.lockClient = null;
      throw new Error('Another application instance already owns this database. Start only one writer instance to prevent transaction loss.');
    }
  }

  async hasMainState() {
    const main = quotedIdentifier(this.table);
    const result = await this.pool.query(`SELECT id FROM ${main} WHERE id = $1 LIMIT 1`, ['main']);
    return result.rowCount > 0;
  }

  validPayload(row) {
    if (!row || !row.payload) return false;
    return !row.checksum || row.checksum === sha256(row.payload);
  }

  async loadState({ seed, migrate }) {
    const main = quotedIdentifier(this.table);
    const history = quotedIdentifier(this.historyTable);
    const mainResult = await this.pool.query(`SELECT payload, revision, checksum, app_version, schema_version, updated_at FROM ${main} WHERE id = $1`, ['main']);
    const mainRow = mainResult.rows[0] || null;
    let row = null;
    let state = null;
    let recoveredFromHistory = false;
    let lastStoredError = null;
    let storedCandidateCount = mainRow ? 1 : 0;

    if (mainRow) {
      if (!this.validPayload(mainRow)) lastStoredError = new Error(`Stored database revision ${mainRow.revision || 0} failed its checksum.`);
      else {
        try {
          state = this.decryptObject(mainRow.payload);
          row = mainRow;
        } catch (error) { lastStoredError = error; }
      }
    }

    if (!row) {
      const refs = await this.pool.query(`SELECT revision FROM ${history} ORDER BY revision DESC LIMIT $1`, [Math.min(8, this.historyLimit)]);
      storedCandidateCount += (refs.rows || []).length;
      for (const ref of refs.rows || []) {
        const result = await this.pool.query(`SELECT payload, revision, checksum, app_version, schema_version, created_at AS updated_at FROM ${history} WHERE revision = $1 LIMIT 1`, [ref.revision]);
        const candidate = result.rows[0] || null;
        if (!candidate) continue;
        if (!this.validPayload(candidate)) {
          lastStoredError = new Error(`Stored database revision ${candidate.revision || 0} failed its checksum.`);
          continue;
        }
        try {
          state = this.decryptObject(candidate.payload);
          row = candidate;
          recoveredFromHistory = true;
          break;
        } catch (error) { lastStoredError = error; }
      }
    }

    if (row) this.currentRevision = Number(row.revision || 0);
    else if (storedCandidateCount > 0) {
      const error = new Error('No verified PostgreSQL state revision could be decrypted. Startup was stopped to protect existing data; verify P2PFLOW_APP_KEY and inspect the database history.');
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

    if (!row) await this.writeState(state, 'fresh_database', { forceHistory: true });
    else if (recoveredFromHistory) await this.writeState(state, 'automatic_history_recovery', { forceHistory: true });
    else if (migrationChanged) {
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
      await this.pool.query(`INSERT INTO ${history} (revision, payload, checksum, app_version, schema_version, reason, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW()) ON CONFLICT (revision) DO NOTHING`, [Number(row.revision || 0), row.payload, row.checksum || sha256(row.payload), row.app_version || this.appVersion, Number(row.schema_version || 0), String(reason || 'checkpoint').slice(0, 240)]);
      return true;
    } catch (error) {
      console.warn(`History checkpoint skipped: ${String(error && error.message || error || 'unknown error')}`);
      return false;
    }
  }

  async shouldArchiveHistory(client, reason = 'state_update', forceHistory = false) {
    if (forceHistory) return true;
    const history = quotedIdentifier(this.historyTable);
    const result = await client.query(`SELECT revision, created_at FROM ${history} ORDER BY revision DESC LIMIT 1`);
    if (!result.rows.length) return true;
    const lastAt = Date.parse(result.rows[0].created_at || '') || this.historyLastArchivedAt || 0;
    this.historyLastArchivedAt = lastAt;
    const important = /automatic_history_recovery|fresh_database|startup_migration|restore|manual_checkpoint/i.test(String(reason || ''));
    return important || !lastAt || Date.now() - lastAt >= this.historyWriteIntervalMs;
  }

  async writeState(state, reason = 'state_update', options = {}) {
    const payload = this.encryptObject(state);
    const checksum = sha256(payload);
    const schemaVersion = Number(state && state.meta && state.meta.schemaVersion || 0);
    const main = quotedIdentifier(this.table);
    const history = quotedIdentifier(this.historyTable);
    const client = await this.pool.connect();
    let archived = false;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${this.table}:write`]);
      const current = await client.query(`SELECT revision FROM ${main} WHERE id = $1 FOR UPDATE`, ['main']);
      const revision = Number(current.rows[0] && current.rows[0].revision || 0) + 1;
      await client.query(`
        INSERT INTO ${main} (id, payload, revision, checksum, app_version, schema_version, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload, revision=EXCLUDED.revision, checksum=EXCLUDED.checksum,
          app_version=EXCLUDED.app_version, schema_version=EXCLUDED.schema_version, updated_at=NOW()
      `, ['main', payload, revision, checksum, this.appVersion, schemaVersion]);
      if (await this.shouldArchiveHistory(client, reason, options.forceHistory === true)) {
        await client.query(`INSERT INTO ${history} (revision, payload, checksum, app_version, schema_version, reason, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW()) ON CONFLICT (revision) DO NOTHING`,
          [revision, payload, checksum, this.appVersion, schemaVersion, String(reason || 'state_update').slice(0, 240)]);
        archived = true;
      }
      await client.query('COMMIT');
      this.currentRevision = revision;
      this.lastSavedAt = new Date().toISOString();
      this.lastPayloadInfo = payloadInfo(payload);
      if (archived) this.historyLastArchivedAt = Date.now();
      this.lastError = '';
      this.scheduleHistoryMaintenance(500);
      return { revision, checksum, schemaVersion, historyArchived: archived };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      this.lastError = String(error && error.message || error || 'PostgreSQL save failed');
      throw error;
    } finally { client.release(); }
  }

  scheduleHistoryMaintenance(delayMs = 1000) {
    if (this.historyMaintenanceTimer || !this.pool) return;
    this.historyMaintenanceTimer = setTimeout(() => {
      this.historyMaintenanceTimer = null;
      this.runHistoryMaintenance().catch(error => console.warn(`Database history maintenance skipped: ${String(error && error.message || error || 'unknown error')}`));
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
      const result = await this.pool.query(`SELECT revision FROM ${history} ORDER BY revision DESC OFFSET $1 LIMIT $2`, [this.historyLimit, this.historyCleanupBatch]);
      const rows = result.rows || [];
      if (rows.length) {
        const ids = rows.map(item => Number(item.revision));
        const deleted = await this.pool.query(`DELETE FROM ${history} WHERE revision = ANY($1::bigint[])`, [ids]);
        pruned = Number(deleted.rowCount || 0);
      }
      more = rows.length === this.historyCleanupBatch;
      try {
        const result2 = await this.compactLegacyPayloads(2);
        compacted = Number(result2.compacted || 0);
        more = more || Boolean(result2.more);
      } catch (error) {
        console.warn(`Database payload compaction skipped: ${String(error && error.message || error || 'unknown error')}`);
      }
      try { await this.pruneBackups(); } catch {}
      return { pruned, compacted, remaining: more ? 'more' : 0 };
    } finally {
      this.historyMaintenanceInFlight = false;
      if (more) this.scheduleHistoryMaintenance(1200);
    }
  }

  async compactLegacyPayloads(limit = 2) {
    const safeLimit = Math.max(1, Math.min(5, Number(limit) || 2));
    const history = quotedIdentifier(this.historyTable);
    const backups = quotedIdentifier(this.backupTable);
    let compacted = 0;
    let seen = 0;
    const historyResult = await this.pool.query(`SELECT revision, payload, checksum FROM ${history} WHERE payload LIKE '%\"v\":1%' ORDER BY revision DESC LIMIT $1`, [safeLimit]);
    for (const row of historyResult.rows || []) {
      seen += 1;
      if (!payloadNeedsUpgrade(row.payload) || (row.checksum && row.checksum !== sha256(row.payload))) continue;
      const nextPayload = this.encryptObject(this.decryptObject(row.payload));
      const nextChecksum = sha256(nextPayload);
      const updated = await this.pool.query(`UPDATE ${history} SET payload=$1, checksum=$2 WHERE revision=$3 AND checksum=$4`, [nextPayload, nextChecksum, row.revision, row.checksum || sha256(row.payload)]);
      compacted += Number(updated.rowCount || 0);
    }
    const remaining = Math.max(0, safeLimit - seen);
    if (remaining > 0) {
      const backupResult = await this.pool.query(`SELECT id, payload, checksum FROM ${backups} WHERE payload LIKE '%\"v\":1%' ORDER BY id DESC LIMIT $1`, [remaining]);
      for (const row of backupResult.rows || []) {
        seen += 1;
        if (!payloadNeedsUpgrade(row.payload) || (row.checksum && row.checksum !== sha256(row.payload))) continue;
        const nextPayload = this.encryptObject(this.decryptObject(row.payload));
        const nextChecksum = sha256(nextPayload);
        const updated = await this.pool.query(`UPDATE ${backups} SET payload=$1, checksum=$2 WHERE id=$3 AND checksum=$4`, [nextPayload, nextChecksum, row.id, row.checksum || sha256(row.payload)]);
        compacted += Number(updated.rowCount || 0);
      }
    }
    return { compacted, more: seen >= safeLimit };
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
    const inserted = await this.pool.query(`
      INSERT INTO ${objects} (object_id, kind, content_type, filename, size_bytes, checksum, data, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW(), NOW())
      ON CONFLICT (object_id) DO NOTHING
      RETURNING object_id, checksum
    `, values);
    if (!inserted.rows.length) {
      const existing = await this.pool.query(`SELECT checksum, size_bytes FROM ${objects} WHERE object_id=$1`, [id]);
      const row = existing.rows[0];
      if (!row || row.checksum !== checksum || Number(row.size_bytes || 0) !== data.length) {
        throw new Error(`Immutable database object conflict: ${id}. Existing backup-referenced bytes were not overwritten.`);
      }
      await this.pool.query(`UPDATE ${objects} SET kind=$2, content_type=$3, filename=$4, metadata=$5::jsonb, updated_at=NOW() WHERE object_id=$1`, [id, values[1], values[2], values[3], values[7]]);
    }
    return { objectId: id, sizeBytes: data.length, checksum, immutable: true };
  }

  async getObject(objectId) {
    const objects = quotedIdentifier(this.objectTable);
    const result = await this.pool.query(`SELECT object_id, kind, content_type, filename, size_bytes, checksum, data, metadata, created_at, updated_at FROM ${objects} WHERE object_id=$1`, [String(objectId || '')]);
    const row = result.rows[0] || null;
    if (!row) return null;
    const data = this.decryptBuffer(Buffer.from(row.data || []));
    const checksum = crypto.createHash('sha256').update(data).digest('hex');
    if (row.checksum && row.checksum !== checksum) throw new Error(`Database object checksum failed: ${row.object_id}`);
    return { ...row, data };
  }

  async pruneBackups() {
    const backups = quotedIdentifier(this.backupTable);
    const refs = await this.pool.query(`SELECT id FROM ${backups} ORDER BY id DESC OFFSET $1 LIMIT 10`, [this.backupLimit]);
    const rows = refs.rows || [];
    if (!rows.length) return 0;
    const ids = rows.map(row => Number(row.id));
    const result = await this.pool.query(`DELETE FROM ${backups} WHERE id = ANY($1::bigint[])`, [ids]);
    const deleted = Number(result.rowCount || 0);
    if (rows.length === 10) { const timer = setTimeout(() => this.pruneBackups().catch(() => {}), 500); if (typeof timer.unref === 'function') timer.unref(); }
    return deleted;
  }

  async createBackup(state, label, metadata = {}) {
    await this.flush(() => state);
    const payload = this.encryptObject(state);
    const checksum = sha256(payload);
    const schemaVersion = Number(state && state.meta && state.meta.schemaVersion || 0);
    const backups = quotedIdentifier(this.backupTable);
    const result = await this.pool.query(`
      INSERT INTO ${backups} (label, source_revision, payload, checksum, app_version, schema_version, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
      RETURNING id, label, source_revision, app_version, schema_version, metadata, created_at
    `, [String(label || 'manual_backup').slice(0, 180), this.currentRevision, payload, checksum, this.appVersion, schemaVersion, JSON.stringify(metadata || {})]);
    try { await this.pruneBackups(); } catch {}
    return result.rows[0];
  }

  async listBackups(limit = 20) {
    const backups = quotedIdentifier(this.backupTable);
    const result = await this.pool.query(`SELECT id, label, source_revision, app_version, schema_version, metadata, created_at FROM ${backups} ORDER BY id DESC LIMIT $1`, [Math.max(1, Math.min(100, Number(limit) || 20))]);
    return result.rows;
  }

  async health() {
    const started = Date.now();
    await this.pool.query('SELECT 1');
    const storage = { totalBytes: 0, tables: {}, rowCounts: {}, objectSourceBytes: 0 };
    try {
      for (const name of [this.table, this.historyTable, this.backupTable, this.objectTable]) {
        const result = await this.pool.query('SELECT COALESCE(pg_total_relation_size(to_regclass($1)),0) AS bytes', [name]);
        const bytes = Number(result.rows[0] && result.rows[0].bytes || 0);
        storage.tables[name] = bytes;
        storage.totalBytes += bytes;
        const countResult = await this.pool.query(`SELECT COUNT(*)::bigint AS row_count FROM ${quotedIdentifier(name)}`);
        storage.rowCounts[name] = Number(countResult.rows[0] && countResult.rows[0].row_count || 0);
      }
      const objectStats = await this.pool.query(`SELECT COUNT(*)::bigint AS row_count, COALESCE(SUM(size_bytes),0)::bigint AS source_bytes FROM ${quotedIdentifier(this.objectTable)}`);
      storage.rowCounts[this.objectTable] = Number(objectStats.rows[0] && objectStats.rows[0].row_count || 0);
      storage.objectSourceBytes = Number(objectStats.rows[0] && objectStats.rows[0].source_bytes || 0);
    } catch {}
    return {
      ok: true,
      provider: 'postgres',
      table: this.table,
      revision: this.currentRevision,
      lastSavedAt: this.lastSavedAt,
      lastError: this.lastError,
      payloadCodec: CODEC_LABEL,
      payload: this.lastPayloadInfo,
      storage,
      historyLimit: this.historyLimit,
      backupLimit: this.backupLimit,
      historyWriteIntervalMinutes: Math.round(this.historyWriteIntervalMs / 60000),
      historyMaintenanceInFlight: this.historyMaintenanceInFlight,
      ms: Date.now() - started,
      singleWriterLock: Boolean(this.lockClient)
    };
  }

  async close() {
    if (this.historyMaintenanceTimer) { clearTimeout(this.historyMaintenanceTimer); this.historyMaintenanceTimer = null; }
    try { if (this.saveInFlight) await this.saveInFlight; } catch {}
    if (this.lockClient) {
      try { await this.lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [this.instanceLockKey]); } catch {}
      try { this.lockClient.release(); } catch {}
      this.lockClient = null;
    }
    if (this.pool && !this.externalPool) await this.pool.end();
    if (!this.externalPool) this.pool = null;
  }
}

module.exports = { PostgresStateStore, sha256 };
