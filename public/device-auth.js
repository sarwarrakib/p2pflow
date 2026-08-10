'use strict';

// P2PFlow trusted-device key storage.
// The signing private key is imported as non-extractable and stored only in
// IndexedDB. localStorage contains only the random public device id so a copied
// session cookie by itself is not enough to authorize normal API requests.

(function initP2PFlowDeviceAuth(global) {
  const DB_NAME = 'p2pflow-device-auth';
  const DB_VERSION = 1;
  const STORE = 'keys';
  const RECORD_KEY = 'primary';
  const DEVICE_ID_STORAGE = 'p2pflowTrustedDeviceId';

  function base64Url(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    for (const value of view) binary += String.fromCharCode(value);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function randomId() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return base64Url(bytes);
  }

  function browserName() {
    const ua = String(navigator.userAgent || '');
    const platform = String(navigator.userAgentData?.platform || navigator.platform || '').trim();
    let browser = 'Browser';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = 'Chrome';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';
    return `${browser}${platform ? ` on ${platform}` : ''}`.slice(0, 120);
  }

  function supported() {
    return Boolean(global.isSecureContext && global.crypto?.subtle && global.indexedDB);
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB unavailable'));
    });
  }

  async function readRecord() {
    if (!supported()) return null;
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(RECORD_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error || new Error('Trusted device read failed'));
      });
    } finally {
      db.close();
    }
  }

  async function writeRecord(record) {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record, RECORD_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Trusted device save failed'));
        tx.onabort = () => reject(tx.error || new Error('Trusted device save aborted'));
      });
    } finally {
      db.close();
    }
  }

  async function deleteRecord() {
    localStorage.removeItem(DEVICE_ID_STORAGE);
    if (!global.indexedDB) return;
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(RECORD_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Trusted device delete failed'));
      });
      db.close();
    } catch {}
  }

  async function generateRecord() {
    if (!supported()) return null;
    const generated = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', generated.publicKey);
    const privateJwk = await crypto.subtle.exportKey('jwk', generated.privateKey);
    // Re-import the private key as non-extractable before persisting it.
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      privateJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
    const record = {
      version: 1,
      deviceId: randomId(),
      name: browserName(),
      publicKeyJwk: {
        kty: publicKeyJwk.kty,
        crv: publicKeyJwk.crv,
        x: publicKeyJwk.x,
        y: publicKeyJwk.y,
        ext: true,
        key_ops: ['verify']
      },
      privateKey,
      createdAt: new Date().toISOString()
    };
    await writeRecord(record);
    localStorage.setItem(DEVICE_ID_STORAGE, record.deviceId);
    return record;
  }

  async function load() {
    if (!supported()) return null;
    try {
      const record = await readRecord();
      if (!record?.deviceId || !record?.privateKey || !record?.publicKeyJwk) return null;
      localStorage.setItem(DEVICE_ID_STORAGE, record.deviceId);
      return record;
    } catch {
      return null;
    }
  }

  async function ensure() {
    const existing = await load();
    if (existing) return existing;
    try { return await generateRecord(); }
    catch { return null; }
  }

  async function sign(record, text) {
    if (!record?.privateKey) throw new Error('Trusted-device private key is unavailable');
    const bytes = new TextEncoder().encode(String(text || ''));
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      record.privateKey,
      bytes
    );
    return base64Url(signature);
  }

  function getDeviceId() {
    return String(localStorage.getItem(DEVICE_ID_STORAGE) || '').trim();
  }

  global.P2PFlowDeviceAuth = {
    supported,
    load,
    ensure,
    sign,
    forget: deleteRecord,
    getDeviceId,
    storageKey: DEVICE_ID_STORAGE
  };
})(window);
