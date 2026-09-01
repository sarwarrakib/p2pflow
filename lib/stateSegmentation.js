'use strict';

const crypto = require('crypto');

const SEGMENT_FORMAT_VERSION = 1;
const DEFAULT_COLLECTIONS = ['chats', 'ledgers', 'auditLogs'];

function boundedChunkRows(value, fallback = 500) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(100, Math.min(2000, Math.floor(n)));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function collectionSignature(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const first = list[0] || null;
  const last = list[list.length - 1] || null;
  return `${list.length}:${Number(first?.id || 0)}:${Number(last?.id || 0)}`;
}

function chunkDescriptor(collection, chunk, objectId) {
  return {
    objectId,
    count: chunk.length,
    firstId: Number(chunk[0]?.id || 0) || null,
    lastId: Number(chunk[chunk.length - 1]?.id || 0) || null,
    collection
  };
}

async function sealChunk(store, collection, chunk) {
  const json = JSON.stringify(chunk);
  const bytes = Buffer.from(json, 'utf8');
  const digest = sha256(bytes);
  const objectId = `state-segment:${collection}:${digest}`;
  await store.putObject(objectId, bytes, {
    kind: 'state_segment',
    contentType: 'application/json',
    filename: `${collection}-${digest.slice(0, 16)}.json`,
    metadata: {
      segmentFormatVersion: SEGMENT_FORMAT_VERSION,
      collection,
      itemCount: chunk.length,
      firstId: Number(chunk[0]?.id || 0) || null,
      lastId: Number(chunk[chunk.length - 1]?.id || 0) || null
    }
  });
  return chunkDescriptor(collection, chunk, objectId);
}

async function prepareSegmentedState(state, store, options = {}) {
  if (!state || typeof state !== 'object') return { state, info: { enabled:false } };
  if (!store || typeof store.putObject !== 'function') return { state, info: { enabled:false } };
  const collections = Array.isArray(options.collections) && options.collections.length ? options.collections : DEFAULT_COLLECTIONS;
  const chunkRows = boundedChunkRows(options.chunkRows || 500);
  const cache = options.cache instanceof Map ? options.cache : new Map();
  const prepared = { ...state };
  const manifest = {
    v: SEGMENT_FORMAT_VERSION,
    chunkRows,
    collections: {}
  };
  const info = { enabled:true, version:SEGMENT_FORMAT_VERSION, chunkRows, collections:{} };

  for (const collection of collections) {
    const rows = Array.isArray(state[collection]) ? state[collection] : [];
    let cached = cache.get(collection) || null;
    const signature = collectionSignature(rows);
    const sameArray = Boolean(cached && cached.rows === rows);
    const canAppendReuse = Boolean(sameArray && rows.length >= cached.length && cached.chunkRows === chunkRows);
    let sealed = canAppendReuse ? [...cached.sealed] : [];
    let sealedCount = canAppendReuse ? Number(cached.sealedCount || 0) : 0;

    // If the same array changed without an append/shrink signature, rebuild. The
    // selected collections are append-only in normal P2PFlow operation; ledger
    // rollback replaces the whole array, which also forces a rebuild.
    if (sameArray && rows.length === cached.length && signature !== cached.signature) {
      sealed = [];
      sealedCount = 0;
    }

    while (rows.length - sealedCount >= chunkRows) {
      const chunk = rows.slice(sealedCount, sealedCount + chunkRows);
      const descriptor = await sealChunk(store, collection, chunk);
      sealed.push(descriptor);
      sealedCount += chunk.length;
    }

    const tail = rows.slice(sealedCount);
    manifest.collections[collection] = { sealed, tail };
    delete prepared[collection];
    cache.set(collection, { rows, length:rows.length, signature, chunkRows, sealed:[...sealed], sealedCount });
    info.collections[collection] = { totalRows:rows.length, sealedChunks:sealed.length, sealedRows:sealedCount, tailRows:tail.length };
  }

  prepared.__p2pflowSegments = manifest;
  return { state: prepared, info, cache };
}

async function hydrateSegmentedState(state, store) {
  if (!state || typeof state !== 'object') return state;
  const manifest = state.__p2pflowSegments;
  if (!manifest || Number(manifest.v || 0) !== SEGMENT_FORMAT_VERSION || !manifest.collections) return state;
  if (!store || typeof store.getObject !== 'function') throw new Error('Segmented state cannot be hydrated because object storage is unavailable.');

  for (const [collection, descriptor] of Object.entries(manifest.collections || {})) {
    const rows = [];
    for (const chunk of descriptor?.sealed || []) {
      const objectId = String(chunk?.objectId || '').trim();
      if (!objectId) throw new Error(`Segmented state ${collection} contains an invalid object reference.`);
      const object = await store.getObject(objectId);
      if (!object || !object.data) throw new Error(`Segmented state object is missing: ${objectId}`);
      let parsed;
      try { parsed = JSON.parse(Buffer.from(object.data).toString('utf8')); }
      catch (error) { throw new Error(`Segmented state object is invalid JSON: ${objectId}: ${error.message}`); }
      if (!Array.isArray(parsed)) throw new Error(`Segmented state object is not an array: ${objectId}`);
      if (chunk.count !== undefined && Number(chunk.count) !== parsed.length) throw new Error(`Segmented state row-count check failed: ${objectId}`);
      rows.push(...parsed);
    }
    if (Array.isArray(descriptor?.tail)) rows.push(...descriptor.tail);
    state[collection] = rows;
  }
  delete state.__p2pflowSegments;
  return state;
}

module.exports = {
  SEGMENT_FORMAT_VERSION,
  DEFAULT_COLLECTIONS,
  boundedChunkRows,
  prepareSegmentedState,
  hydrateSegmentedState
};
