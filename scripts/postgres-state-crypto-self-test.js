#!/usr/bin/env node
'use strict';

const { PostgresStateStore, sha256 } = require('../lib/postgresStateStore');
const store = new PostgresStateStore({ appKey: 'self-test-key-0123456789-self-test-key', appVersion: '1.0.166', pool: {} });
const original = { meta: { schemaVersion: 25 }, transaction: { id: 123, amount: 5000 }, nested: ['a', 'b'] };
const payload = store.encryptObject(original);
const restored = store.decryptObject(payload);
if (JSON.stringify(restored) !== JSON.stringify(original)) throw new Error('PostgreSQL state encryption round trip failed.');
if (!/^[a-f0-9]{64}$/.test(sha256(payload))) throw new Error('PostgreSQL state checksum failed.');
const binary = Buffer.from('sensitive proof and chat media bytes');
const sealed = store.encryptBuffer(binary);
if (sealed.includes(binary)) throw new Error('Database object encryption left plaintext visible.');
if (!store.decryptBuffer(sealed).equals(binary)) throw new Error('Database object encryption round trip failed.');
let wrongKeyRejected = false;
try {
  const wrong = new PostgresStateStore({ appKey: 'different-self-test-key-0123456789-x', pool: {} });
  wrong.decryptObject(payload);
} catch { wrongKeyRejected = true; }
if (!wrongKeyRejected) throw new Error('Encrypted state was readable with the wrong key.');
let wrongObjectKeyRejected = false;
try {
  const wrong = new PostgresStateStore({ appKey: 'different-self-test-key-0123456789-x', pool: {} });
  wrong.decryptBuffer(sealed);
} catch { wrongObjectKeyRejected = true; }
if (!wrongObjectKeyRejected) throw new Error('Encrypted database object was readable with the wrong key.');
console.log(JSON.stringify({ ok: true, aes256gcmStateRoundTrip: true, aes256gcmObjectRoundTrip: true, wrongKeyRejected: true }, null, 2));
