'use strict';

const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');

function base64urlEncode(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(value) {
  const input = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(input + padding, 'base64');
}

function hkdfExtract(salt, ikm) {
  return crypto.createHmac('sha256', Buffer.from(salt)).update(Buffer.from(ikm)).digest();
}

function hkdfExpand(prk, info, length) {
  const output = [];
  let previous = Buffer.alloc(0);
  let counter = 1;
  let total = 0;
  while (total < length) {
    previous = crypto.createHmac('sha256', prk)
      .update(Buffer.concat([previous, Buffer.from(info), Buffer.from([counter])]))
      .digest();
    output.push(previous);
    total += previous.length;
    counter += 1;
    if (counter > 255) throw new Error('HKDF output is too long.');
  }
  return Buffer.concat(output).subarray(0, length);
}

function rawPublicKeyToJwk(publicKey, privateKey = null) {
  const key = Buffer.from(publicKey);
  if (key.length !== 65 || key[0] !== 4) throw new Error('P-256 public key must be an uncompressed 65-byte point.');
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64urlEncode(key.subarray(1, 33)),
    y: base64urlEncode(key.subarray(33, 65)),
    ext: true
  };
  if (privateKey) jwk.d = base64urlEncode(privateKey);
  return jwk;
}

function normalizeP256PrivateKey(value) {
  const input = Buffer.from(value || []);
  // Node/OpenSSL may return a valid P-256 scalar without leading zero bytes.
  // VAPID/JWK expects the scalar to be represented as exactly 32 bytes.
  // Canonicalize short scalars so key generation is deterministic across
  // Node/OpenSSL builds and older short-form stored keys remain usable.
  if (input.length < 1 || input.length > 32) throw new Error('Invalid VAPID private key.');
  const privateKey = input.length === 32
    ? Buffer.from(input)
    : Buffer.concat([Buffer.alloc(32 - input.length), input]);
  if (!privateKey.some(byte => byte !== 0)) throw new Error('Invalid VAPID private key.');
  return privateKey;
}

function generateVapidKeys() {
  const ecdh = crypto.createECDH('prime256v1');
  const publicKey = ecdh.generateKeys();
  const privateKey = normalizeP256PrivateKey(ecdh.getPrivateKey());
  return {
    publicKey: base64urlEncode(publicKey),
    privateKey: base64urlEncode(privateKey)
  };
}

function validateVapidKeys(keys = {}) {
  const publicKey = base64urlDecode(keys.publicKey);
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('Invalid VAPID public key.');
  const privateKey = normalizeP256PrivateKey(base64urlDecode(keys.privateKey));
  const ecdh = crypto.createECDH('prime256v1');
  try {
    ecdh.setPrivateKey(privateKey);
  } catch {
    throw new Error('Invalid VAPID private key.');
  }
  if (!crypto.timingSafeEqual(ecdh.getPublicKey(), publicKey)) throw new Error('VAPID public/private key mismatch.');
  return { publicKey, privateKey };
}

function createVapidJwt(endpoint, keys, subject, expiresAt = Math.floor(Date.now() / 1000) + 12 * 60 * 60) {
  const url = new URL(endpoint);
  const aud = url.origin;
  const header = base64urlEncode(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = base64urlEncode(Buffer.from(JSON.stringify({
    aud,
    exp: Math.min(Math.floor(Date.now() / 1000) + 24 * 60 * 60 - 60, Number(expiresAt)),
    sub: String(subject || 'mailto:admin@example.com')
  })));
  const unsigned = `${header}.${payload}`;
  const { publicKey, privateKey } = validateVapidKeys(keys);
  const privateJwk = rawPublicKeyToJwk(publicKey, privateKey);
  const privateObject = crypto.createPrivateKey({ key: privateJwk, format: 'jwk' });
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key: privateObject, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${base64urlEncode(signature)}`;
}

function normalizeSubscription(subscription = {}) {
  const endpoint = String(subscription.endpoint || '').trim();
  const endpointUrl = new URL(endpoint);
  if (endpointUrl.protocol !== 'https:') throw new Error('Push subscription endpoint must use HTTPS.');
  const p256dh = base64urlDecode(subscription.keys?.p256dh || subscription.p256dh || '');
  const auth = base64urlDecode(subscription.keys?.auth || subscription.auth || '');
  if (p256dh.length !== 65 || p256dh[0] !== 4) throw new Error('Invalid push subscription p256dh key.');
  if (auth.length < 16 || auth.length > 64) throw new Error('Invalid push subscription auth secret.');
  return { endpoint, endpointUrl, p256dh, auth };
}

function deriveContentEncryptionKeys(subscription, options = {}) {
  const normalized = normalizeSubscription(subscription);
  const sender = crypto.createECDH('prime256v1');
  if (options.senderPrivateKey) sender.setPrivateKey(Buffer.from(options.senderPrivateKey));
  else sender.generateKeys();
  const senderPublicKey = sender.getPublicKey();
  const sharedSecret = sender.computeSecret(normalized.p256dh);
  const authPrk = hkdfExtract(normalized.auth, sharedSecret);
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    normalized.p256dh,
    senderPublicKey
  ]);
  const ikm = hkdfExpand(authPrk, keyInfo, 32);
  const salt = options.salt ? Buffer.from(options.salt) : crypto.randomBytes(16);
  if (salt.length !== 16) throw new Error('Web Push salt must be 16 bytes.');
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);
  return { ...normalized, senderPublicKey, senderPrivateKey: sender.getPrivateKey(), salt, cek, nonce };
}

function encryptPayload(subscription, payload, options = {}) {
  const content = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload ?? ''), 'utf8');
  const rs = Math.max(256, Math.min(65535, Number(options.recordSize || 4096) || 4096));
  // One final RFC 8188 record is enough for compact notification payloads.
  // 16 bytes are reserved for the AES-GCM tag and one byte for the final-record delimiter.
  if (content.length + 17 > rs) throw new Error(`Web Push payload exceeds the ${rs}-byte record size.`);
  const derived = deriveContentEncryptionKeys(subscription, options);
  const plaintext = Buffer.concat([content, Buffer.from([2])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', derived.cek, derived.nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.alloc(21 + derived.senderPublicKey.length);
  derived.salt.copy(header, 0);
  header.writeUInt32BE(rs, 16);
  header[20] = derived.senderPublicKey.length;
  derived.senderPublicKey.copy(header, 21);
  return {
    body: Buffer.concat([header, ciphertext, tag]),
    salt: derived.salt,
    senderPublicKey: derived.senderPublicKey,
    senderPrivateKey: derived.senderPrivateKey,
    cek: derived.cek,
    nonce: derived.nonce,
    recordSize: rs
  };
}

function decryptPayloadForTest(subscriptionPrivateKey, authSecret, body) {
  const input = Buffer.from(body);
  if (input.length < 21) throw new Error('Encrypted Web Push body is too short.');
  const salt = input.subarray(0, 16);
  const rs = input.readUInt32BE(16);
  const keyIdLength = input[20];
  if (keyIdLength !== 65 || input.length < 21 + keyIdLength + 17) throw new Error('Invalid Web Push key identifier.');
  const senderPublicKey = input.subarray(21, 21 + keyIdLength);
  const encrypted = input.subarray(21 + keyIdLength);
  const ciphertext = encrypted.subarray(0, -16);
  const tag = encrypted.subarray(-16);
  const receiver = crypto.createECDH('prime256v1');
  receiver.setPrivateKey(Buffer.from(subscriptionPrivateKey));
  const receiverPublicKey = receiver.getPublicKey();
  const sharedSecret = receiver.computeSecret(senderPublicKey);
  const authPrk = hkdfExtract(Buffer.from(authSecret), sharedSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), receiverPublicKey, senderPublicKey]);
  const ikm = hkdfExpand(authPrk, keyInfo, 32);
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const delimiter = plaintext.lastIndexOf(2);
  if (delimiter < 0 || plaintext.subarray(delimiter + 1).some(value => value !== 0)) throw new Error('Invalid Web Push record delimiter.');
  return { payload: plaintext.subarray(0, delimiter), recordSize: rs, senderPublicKey, salt };
}

function sendRequest(url, options, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, res => {
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        if (size >= 16 * 1024) return;
        const buffer = Buffer.from(chunk);
        chunks.push(buffer.subarray(0, Math.max(0, 16 * 1024 - size)));
        size += buffer.length;
      });
      res.on('end', () => resolve({
        statusCode: Number(res.statusCode || 0),
        headers: res.headers || {},
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.setTimeout(Math.max(3000, Number(timeoutMs || 12000)), () => req.destroy(new Error('Web Push request timed out.')));
    req.on('error', reject);
    req.end(body);
  });
}

async function sendWebPush(subscription, payload, options = {}) {
  const normalized = normalizeSubscription(subscription);
  const encrypted = encryptPayload(subscription, Buffer.from(JSON.stringify(payload || {})), { recordSize: options.recordSize || 4096 });
  const jwt = createVapidJwt(normalized.endpoint, options.vapidKeys, options.subject, options.expiresAt);
  const response = await sendRequest(normalized.endpointUrl, {
    method: 'POST',
    headers: {
      TTL: String(Math.max(0, Math.min(2419200, Number(options.ttl ?? 86400) || 0))),
      Urgency: ['very-low', 'low', 'normal', 'high'].includes(options.urgency) ? options.urgency : 'high',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(encrypted.body.length),
      Authorization: `vapid t=${jwt}, k=${options.vapidKeys.publicKey}`
    }
  }, encrypted.body, options.timeoutMs || 12000);
  return {
    ok: response.statusCode >= 200 && response.statusCode < 300,
    permanentFailure: response.statusCode === 404 || response.statusCode === 410,
    retryable: response.statusCode === 429 || response.statusCode >= 500,
    ...response
  };
}

module.exports = {
  base64urlEncode,
  base64urlDecode,
  generateVapidKeys,
  validateVapidKeys,
  createVapidJwt,
  normalizeSubscription,
  encryptPayload,
  decryptPayloadForTest,
  sendWebPush
};
