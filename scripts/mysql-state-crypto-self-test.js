#!/usr/bin/env node
'use strict';
const { MySqlStateStore, mysqlConnectionOptions, sha256 } = require('../lib/mysqlStateStore');

(async () => {
  const store = new MySqlStateStore({ appKey: 'm'.repeat(48), table: 'p2pflow_state', connectionString: 'mysql://user:pass@127.0.0.1:3306/p2pflow' });
  const original = { meta: { schemaVersion: 25 }, text: 'MariaDB encrypted state', nested: { ok: true } };
  const payload = store.encryptObject(original);
  const restored = store.decryptObject(payload);
  if (JSON.stringify(restored) !== JSON.stringify(original)) throw new Error('MariaDB/MySQL state encryption round trip failed.');
  const sealed = store.encryptBuffer(Buffer.from('database object'));
  if (store.decryptBuffer(sealed).toString() !== 'database object') throw new Error('MariaDB/MySQL object encryption round trip failed.');
  if (!/^[a-f0-9]{64}$/.test(sha256(payload))) throw new Error('MariaDB/MySQL state checksum failed.');
  const options = mysqlConnectionOptions('mysql://u:p@localhost:3306/demo');
  if (options.host !== 'localhost' || options.port !== 3306 || options.database !== 'demo') throw new Error('MariaDB/MySQL URL parsing failed.');
  if (store.historyLimit !== 8) throw new Error(`Expected safe default history limit 8, got ${store.historyLimit}.`);
  const clamped = new MySqlStateStore({ appKey: 'm'.repeat(48), historyLimit: 500, connectionString: 'mysql://u:p@localhost:3306/demo' });
  if (clamped.historyLimit > 25) throw new Error('History limit safety clamp failed.');

  let createAttempted = false;
  const existingSchemaStore = new MySqlStateStore({
    appKey: 'm'.repeat(48),
    table: 'p2pflow_state',
    pool: {
      async query(sql, params = []) {
        const text = String(sql || '');
        if (/INFORMATION_SCHEMA\.TABLES/i.test(text)) return [[{ ok: 1 }], []];
        if (/INFORMATION_SCHEMA\.COLUMNS/i.test(text)) return [[{ COLUMN_NAME: params[1] }], []];
        if (/\bCREATE\s+TABLE\b/i.test(text)) { createAttempted = true; throw new Error('CREATE command denied'); }
        throw new Error(`Unexpected fake-pool query: ${text.slice(0, 120)}`);
      }
    }
  });
  await existingSchemaStore.ensureSchema();
  if (createAttempted) throw new Error('Existing schema should not require CREATE TABLE privilege.');


  let historyReadOnHealthyStartup = false;
  const healthyState = { meta: { schemaVersion: 25 }, value: 'healthy' };
  const healthyPayload = store.encryptObject(healthyState);
  const healthyStore = new MySqlStateStore({
    appKey: 'm'.repeat(48),
    table: 'p2pflow_state',
    pool: {
      async query(sql) {
        const text = String(sql || '');
        if (/FROM `p2pflow_state` WHERE id = \?/i.test(text)) {
          return [[{ payload: healthyPayload, revision: 77, checksum: sha256(healthyPayload), app_version: '1.4.11', schema_version: 25, updated_at: new Date() }], []];
        }
        if (/p2pflow_state_history/i.test(text)) {
          historyReadOnHealthyStartup = true;
          throw new Error('Healthy startup should not read large history payloads.');
        }
        throw new Error(`Unexpected healthy-startup query: ${text.slice(0, 120)}`);
      }
    }
  });
  const loaded = await healthyStore.loadState({ seed: async () => ({}), migrate: async () => {} });
  if (loaded.revision !== 77 || historyReadOnHealthyStartup) throw new Error('Healthy startup history bypass failed.');


  let deletedHistoryRows = 0;
  const cleanupStore = new MySqlStateStore({
    appKey: 'm'.repeat(48),
    historyLimit: 8,
    historyCleanupBatch: 3,
    pool: {
      async query(sql) {
        const text = String(sql || '');
        if (/SELECT revision FROM `p2pflow_state_history`/i.test(text)) return [[{ revision: 10 }, { revision: 9 }, { revision: 8 }], []];
        if (/DELETE FROM `p2pflow_state_history`/i.test(text)) { deletedHistoryRows += 3; return [{ affectedRows: 3 }, []]; }
        throw new Error(`Unexpected cleanup query: ${text.slice(0, 120)}`);
      }
    }
  });
  const cleanupResult = await cleanupStore.runHistoryMaintenance();
  if (cleanupResult.pruned !== 3 || deletedHistoryRows !== 3) throw new Error('Incremental history pruning failed.');

  console.log(JSON.stringify({
    ok: true,
    provider: 'mysql',
    encryptedState: true,
    encryptedObjects: true,
    safeHistoryLimit: store.historyLimit,
    maxHistoryLimit: clamped.historyLimit,
    existingSchemaNeedsCreatePrivilege: false,
    healthyStartupReadsHistoryPayloads: historyReadOnHealthyStartup,
    incrementalHistoryPruneRows: cleanupResult.pruned
  }, null, 2));
})().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});
