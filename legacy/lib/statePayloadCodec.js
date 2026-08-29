'use strict';

const crypto = require('crypto');
const zlib = require('zlib');

const CODEC_VERSION = 2;
const CODEC_LABEL = 'aes-256-gcm+br-v2';

function keyBytes(appKey) {
  return crypto.createHash('sha256').update(String(appKey || '')).digest();
}

function encryptBytes(bytes, appKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(appKey), iv);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  };
}

function decryptBytes(box, appKey) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(appKey), Buffer.from(box.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(box.data, 'base64')), decipher.final()]);
}

function encodeStateObject(obj, appKey) {
  const plain = Buffer.from(JSON.stringify(obj), 'utf8');
  let body = plain;
  let compression = 'none';
  try {
    const compressed = zlib.brotliCompressSync(plain, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: plain.length
      }
    });
    // Keep tiny states uncompressed when Brotli framing would not save useful space.
    if (compressed.length + 48 < plain.length) {
      body = compressed;
      compression = 'br';
    }
  } catch {}
  const encrypted = encryptBytes(body, appKey);
  return JSON.stringify({
    v: CODEC_VERSION,
    c: compression,
    p: plain.length,
    b: body.length,
    ...encrypted
  });
}

function brotliCompressAsync(plain) {
  return new Promise((resolve, reject) => {
    zlib.brotliCompress(plain, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: plain.length
      }
    }, (error, compressed) => error ? reject(error) : resolve(compressed));
  });
}

async function encodeStateObjectAsync(obj, appKey) {
  // JSON.stringify is intentionally the only synchronous part. Brotli is the
  // expensive phase on large order/chat histories, so run it on libuv's worker
  // pool instead of blocking HTTP/SSE responses on the Node.js event loop.
  const plain = Buffer.from(JSON.stringify(obj), 'utf8');
  let body = plain;
  let compression = 'none';
  try {
    const compressed = await brotliCompressAsync(plain);
    if (compressed.length + 48 < plain.length) {
      body = compressed;
      compression = 'br';
    }
  } catch {}
  const encrypted = encryptBytes(body, appKey);
  return JSON.stringify({
    v: CODEC_VERSION,
    c: compression,
    p: plain.length,
    b: body.length,
    ...encrypted
  });
}

function decodeStateObject(payload, appKey) {
  const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload || '');
  const box = JSON.parse(text);
  if (!box || !box.iv || !box.tag || !box.data) throw new Error('Unsupported encrypted database payload.');
  const decrypted = decryptBytes(box, appKey);
  if (Number(box.v) === 1) return JSON.parse(decrypted.toString('utf8'));
  if (Number(box.v) !== CODEC_VERSION) throw new Error(`Unsupported encrypted database payload version ${box.v}.`);
  let plain = decrypted;
  if (box.c === 'br') plain = zlib.brotliDecompressSync(decrypted);
  else if (box.c !== 'none') throw new Error(`Unsupported database payload compression ${box.c}.`);
  if (box.p && Number(box.p) !== plain.length) throw new Error('Database payload length verification failed.');
  return JSON.parse(plain.toString('utf8'));
}

function payloadInfo(payload) {
  const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload || '');
  try {
    const box = JSON.parse(text);
    const payloadBytes = Buffer.byteLength(text, 'utf8');
    const plainBytes = Math.max(0, Number(box && box.p || 0));
    const bodyBytes = Math.max(0, Number(box && box.b || 0));
    return {
      version: Number(box && box.v || 0),
      codec: Number(box && box.v || 0) === CODEC_VERSION ? CODEC_LABEL : `legacy-v${Number(box && box.v || 0) || 0}`,
      compression: String(box && box.c || (Number(box && box.v) === 1 ? 'none' : 'unknown')),
      payloadBytes,
      plainBytes,
      bodyBytes,
      compressionRatio: plainBytes > 0 ? payloadBytes / plainBytes : null
    };
  } catch {
    return { version: 0, codec: 'unknown', compression: 'unknown', payloadBytes: Buffer.byteLength(text, 'utf8'), plainBytes: 0, bodyBytes: 0, compressionRatio: null };
  }
}

function payloadNeedsUpgrade(payload) {
  return payloadInfo(payload).version !== CODEC_VERSION;
}

module.exports = {
  CODEC_VERSION,
  CODEC_LABEL,
  encodeStateObject,
  encodeStateObjectAsync,
  decodeStateObject,
  payloadInfo,
  payloadNeedsUpgrade
};
