#!/usr/bin/env node
'use strict';
const { MySqlStateStore, mysqlConnectionOptions, sha256 } = require('../lib/mysqlStateStore');
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
console.log(JSON.stringify({ ok: true, provider: 'mysql', encryptedState: true, encryptedObjects: true }, null, 2));
