'use strict';

// Binance C2C SAPI adapter helper.
// This file contains the signing pattern and endpoint map used by the CRM.
// Keep live calls disabled until API permissions, IP whitelist, rate limits,
// OTP/authType flow and chat payload are confirmed by Binance/support.

const crypto = require('crypto');

function normalizeBinanceApiBaseUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || 'https://api.binance.com')); }
  catch { throw new Error('BINANCE_API_BASE_URL must be a valid HTTPS URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('BINANCE_API_BASE_URL must be HTTPS and must not contain credentials, query parameters, or fragments.');
  }
  if (parsed.pathname && parsed.pathname !== '/') throw new Error('BINANCE_API_BASE_URL must not contain a path.');
  const host = parsed.hostname.toLowerCase();
  const officialHosts = new Set(['api.binance.com', 'api1.binance.com', 'api2.binance.com', 'api3.binance.com', 'api4.binance.com']);
  const allowCustom = String(process.env.P2PFLOW_ALLOW_CUSTOM_BINANCE_API_BASE || '').toLowerCase() === 'true';
  if (!officialHosts.has(host) && !allowCustom) {
    throw new Error('BINANCE_API_BASE_URL must use an official Binance API host unless P2PFLOW_ALLOW_CUSTOM_BINANCE_API_BASE=true is explicitly set.');
  }
  return parsed.origin;
}

const BASE_URL = normalizeBinanceApiBaseUrl(process.env.BINANCE_API_BASE_URL || 'https://api.binance.com');

// A single process can run fast order discovery, detailed reconciliation, Ads,
// merchant state, chat catch-up and interactive actions at the same time. Without
// a shared gate those loops can create a request burst per credential, amplifying
// Binance latency/rate limiting into local 30s gateway timeouts.
const BINANCE_HTTP_GLOBAL_CONCURRENCY = Math.max(2, Math.min(32, Number(process.env.P2PFLOW_BINANCE_HTTP_CONCURRENCY || 8) || 8));
const BINANCE_HTTP_PER_KEY_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.P2PFLOW_BINANCE_HTTP_PER_KEY_CONCURRENCY || 3) || 3));
const BINANCE_HTTP_MAX_QUEUE = Math.max(50, Math.min(5000, Number(process.env.P2PFLOW_BINANCE_HTTP_MAX_QUEUE || 600) || 600));
const binanceHttpScheduler = { active:0, perKey:new Map(), blockedUntil:new Map(), queue:[], sequence:0, timer:null };

function schedulerKey(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey || '')).digest('hex').slice(0, 20);
}
function endpointPriority(label) {
  const value = String(label || '');
  if (/markOrderAsPaid|releaseCoin|updateAd|updateAdsStatus|postAd|setMerchant|startMerchant|closeMerchant|startRest|endRest/i.test(value)) return 0;
  if (/retrieveChatCredential|markOrderMessagesAsRead|markUserMessagesAsRead|getChatImagePreSignedUrl/i.test(value)) return 1;
  if (/listOrders|getUserOrderDetail|retrieveChatMessages/i.test(value)) return 3;
  return 2;
}
function setSchedulerBackoff(apiKey, response) {
  const status = Number(response?.status || 0);
  if (![418, 429].includes(status)) return;
  const key = schedulerKey(apiKey);
  const raw = String(response?.headers?.get?.('retry-after') || '').trim();
  const retrySeconds = Number(raw);
  const retryAt = Number.isFinite(retrySeconds) && retrySeconds > 0
    ? Date.now() + Math.min(120000, retrySeconds * 1000)
    : Date.now() + (status === 418 ? 30000 : 2500);
  binanceHttpScheduler.blockedUntil.set(key, Math.max(Number(binanceHttpScheduler.blockedUntil.get(key) || 0), retryAt));
}
function pumpBinanceHttpQueue() {
  if (binanceHttpScheduler.timer) { clearTimeout(binanceHttpScheduler.timer); binanceHttpScheduler.timer = null; }
  if (!binanceHttpScheduler.queue.length) return;
  const now = Date.now();
  binanceHttpScheduler.queue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
  let earliestWake = Infinity;
  let started = false;
  for (let i = 0; i < binanceHttpScheduler.queue.length && binanceHttpScheduler.active < BINANCE_HTTP_GLOBAL_CONCURRENCY;) {
    const item = binanceHttpScheduler.queue[i];
    if (Number(item.deadline || 0) > 0 && Number(item.deadline) <= now) {
      binanceHttpScheduler.queue.splice(i, 1);
      const error = new Error(`Binance SAPI local queue wait exceeded ${item.queueTimeoutMs}ms for ${item.label}.`);
      error.code = 'BINANCE_LOCAL_QUEUE_TIMEOUT';
      error.statusCode = 503;
      item.reject(error);
      continue;
    }
    if (Number(item.deadline || 0) > 0) earliestWake = Math.min(earliestWake, Number(item.deadline));
    const blockedUntil = Number(binanceHttpScheduler.blockedUntil.get(item.key) || 0);
    const keyActive = Number(binanceHttpScheduler.perKey.get(item.key) || 0);
    if (blockedUntil > now) { earliestWake = Math.min(earliestWake, blockedUntil); i += 1; continue; }
    if (keyActive >= BINANCE_HTTP_PER_KEY_CONCURRENCY) { i += 1; continue; }
    binanceHttpScheduler.queue.splice(i, 1);
    binanceHttpScheduler.active += 1;
    binanceHttpScheduler.perKey.set(item.key, keyActive + 1);
    started = true;
    Promise.resolve().then(item.task).then(item.resolve, item.reject).finally(() => {
      binanceHttpScheduler.active = Math.max(0, binanceHttpScheduler.active - 1);
      const next = Math.max(0, Number(binanceHttpScheduler.perKey.get(item.key) || 1) - 1);
      if (next) binanceHttpScheduler.perKey.set(item.key, next); else binanceHttpScheduler.perKey.delete(item.key);
      pumpBinanceHttpQueue();
    });
  }
  // Concurrency-saturated queues are woken by the active request finalizer. A
  // timer is needed only for rate-limit/deadline time, avoiding a 25ms busy loop.
  if (binanceHttpScheduler.queue.length && Number.isFinite(earliestWake)) {
    const delay = Math.max(20, Math.min(1000, earliestWake - Date.now()));
    binanceHttpScheduler.timer = setTimeout(pumpBinanceHttpQueue, delay);
    if (typeof binanceHttpScheduler.timer.unref === 'function') binanceHttpScheduler.timer.unref();
  }
}
function scheduleBinanceHttp(apiKey, label, task, requestTimeoutMs = 20000) {
  if (binanceHttpScheduler.queue.length >= BINANCE_HTTP_MAX_QUEUE) {
    const error = new Error(`Binance SAPI local queue is full for ${label}. Background sync load is being shed instead of timing out the process.`);
    error.statusCode = 503;
    error.code = 'BINANCE_LOCAL_QUEUE_FULL';
    return Promise.reject(error);
  }
  const key = schedulerKey(apiKey);
  const queueTimeoutMs = Math.max(1500, Math.min(8000, Math.round((Number(requestTimeoutMs || 20000) || 20000) * 0.4)));
  return new Promise((resolve, reject) => {
    binanceHttpScheduler.queue.push({ key, label, task, resolve, reject, priority:endpointPriority(label), sequence:++binanceHttpScheduler.sequence, queueTimeoutMs, deadline:Date.now() + queueTimeoutMs });
    pumpBinanceHttpQueue();
  });
}

const ENDPOINTS = {
  listOrders: ['POST', '/sapi/v1/c2c/orderMatch/listOrders'],
  listAds: ['POST', '/sapi/v1/c2c/ads/listWithPagination'],
  searchAds: ['POST', '/sapi/v1/c2c/ads/search'],
  getAdReferencePrice: ['POST', '/sapi/v1/c2c/ads/getReferencePrice'],
  getAvailableAdsCategory: ['GET', '/sapi/v1/c2c/ads/getAvailableAdsCategory'],
  listDigitalCurrencies: ['POST', '/sapi/v1/c2c/digitalCurrency/list'],
  listFiatCurrencies: ['POST', '/sapi/v1/c2c/fiatCurrency/list'],
  agentListFiatCurrencies: ['POST', '/sapi/v1/c2c/agent/fiatCurrency/list'],
  getCommissionOverview: ['POST', '/sapi/v1/c2c/commission-rate/overview'],
  getTakerCommissionRate: ['POST', '/sapi/v1/c2c/commission-rate/taker'],
  getAdDetail: ['POST', '/sapi/v1/c2c/ads/getDetailByNo'],
  postAd: ['POST', '/sapi/v1/c2c/ads/post'],
  updateAd: ['POST', '/sapi/v1/c2c/ads/update'],
  updateAdsStatus: ['POST', '/sapi/v1/c2c/ads/updateStatus'],
  getMerchantAdDetails: ['GET', '/sapi/v1/c2c/merchant/getAdDetails'],
  setMerchantOnline: ['POST', '/sapi/v1/c2c/merchant/getOnline'],
  setMerchantOffline: ['POST', '/sapi/v1/c2c/merchant/getOffline'],
  startMerchantBusiness: ['POST', '/sapi/v1/c2c/merchant/startBusiness'],
  closeMerchantBusiness: ['POST', '/sapi/v1/c2c/merchant/closeBusiness'],
  startMerchantRest: ['POST', '/sapi/v1/c2c/merchant/startRest'],
  endMerchantRest: ['POST', '/sapi/v1/c2c/merchant/endRest'],
  getUserOrderDetail: ['POST', '/sapi/v1/c2c/orderMatch/getUserOrderDetail'],
  listUserOrderHistory: ['GET', '/sapi/v1/c2c/orderMatch/listUserOrderHistory'],
  markOrderAsPaid: ['POST', '/sapi/v1/c2c/orderMatch/markOrderAsPaid'],
  verifiedAdditionalKyc: ['POST', '/sapi/v1/c2c/orderMatch/verifiedAdditionalKyc'],
  checkIfCanReleaseCoin: ['POST', '/sapi/v1/c2c/orderMatch/checkIfCanReleaseCoin'],
  getC2cRsaPublicKey: ['GET', '/sapi/v1/c2c/cryptography/rsa-public-key'],
  releaseCoin: ['POST', '/sapi/v1/c2c/orderMatch/releaseCoin'],
  queryCounterPartyOrderStatistic: ['POST', '/sapi/v1/c2c/orderMatch/queryCounterPartyOrderStatistic'],
  // Current user-profile SAPI paths used for counterparty profile fallback. The similarly named
  // orderMatch/getUserOrderSummary endpoint is the authenticated account's order summary, not
  // a target user's P2P profile summary, so it is kept out of this fallback flow.
  getUserBaseDetail: ['POST', '/sapi/v1/c2c/user/getUserBaseDetail'],
  getUserOrderSummary: ['POST', '/sapi/v1/c2c/user/getUserOrderSummary'],
  getUserBaseDetailOfficial: ['POST', '/sapi/v1/c2c/user/baseDetail'],
  getOrderMatchUserOrderSummary: ['GET', '/sapi/v1/c2c/orderMatch/getUserOrderSummary'],
  getPaymentMethodById: ['GET', '/sapi/v1/c2c/paymentMethod/getPayMethodById'],
  getPaymentMethodByUserId: ['GET', '/sapi/v1/c2c/paymentMethod/getPayMethodByUserId'],
  listAllPaymentMethods: ['POST', '/sapi/v1/c2c/paymentMethod/listAll'],
  agentGetPaymentMethodByUserId: ['GET', '/sapi/v1/c2c/agent/ads/getPayMethodByUserId'],
  agentListAllPaymentMethods: ['POST', '/sapi/v1/c2c/agent/ads/listAllTradeMethods'],
  retrieveChatCredential: ['GET', '/sapi/v1/c2c/chat/retrieveChatCredential'],
  retrieveChatMessages: ['GET', '/sapi/v1/c2c/chat/retrieveChatMessagesWithPagination'],
  markOrderMessagesAsRead: ['POST', '/sapi/v1/c2c/chat/markOrderMessagesAsRead'],
  markUserMessagesAsRead: ['POST', '/sapi/v1/c2c/chat/markUserMessagesAsRead'],
  getChatImagePreSignedUrl: ['POST', '/sapi/v1/c2c/chat/image/pre-signed-url'],
  getRiskWarningTips: ['POST', '/sapi/v1/c2c/chat/getRiskWarningTips'],
  getApiKeyPermission: ['GET', '/sapi/v1/account/apiRestrictions'],
  getApiTradingStatus: ['GET', '/sapi/v1/account/apiTradingStatus'],
  getAccountStatus: ['GET', '/sapi/v1/account/status']
};

function signQuery(params, secretKey) {
  const query = new URLSearchParams(params).toString();
  const signature = crypto.createHmac('sha256', secretKey).update(query).digest('hex');
  return `${query}&signature=${signature}`;
}

function buildSignedRequest({ apiKey, secretKey, method, path, query = {}, body = null, clientType = 'web' }) {
  const params = { ...query, timestamp: Date.now() };
  const signedQuery = signQuery(params, secretKey);
  return {
    method,
    url: `${BASE_URL}${path}?${signedQuery}`,
    headers: {
      'X-MBX-APIKEY': apiKey,
      'clientType': clientType,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  };
}

async function callSignedSapiPath({ apiKey, secretKey, endpointName = '', method, path, query = {}, body = null, clientType = 'web', dryRun = true, timeoutMs = 20000 }) {
  const label = endpointName || `${method || 'GET'} ${path || ''}`;
  const req = buildSignedRequest({ apiKey, secretKey, method, path, query: { recvWindow: 5000, ...query }, body, clientType });
  if (dryRun) return { dryRun: true, endpointName: label, request: { ...req, headers: { ...req.headers, 'X-MBX-APIKEY': mask(apiKey) }, url: req.url.replace(/signature=[a-f0-9]+/, 'signature=***') } };
  let res;
  res = await scheduleBinanceHttp(apiKey, label, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(timeoutMs || 20000));
    try {
      const response = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, redirect: 'error', signal: controller.signal });
      setSchedulerBackoff(apiKey, response);
      return response;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        const timeoutError = new Error(`Binance SAPI timeout after ${timeoutMs}ms for ${label}`);
        timeoutError.code = 'BINANCE_SAPI_TIMEOUT';
        timeoutError.statusCode = 504;
        throw timeoutError;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }, timeoutMs);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const error = new Error(`Binance SAPI error ${res.status} ${res.statusText || ''} on ${label}: ${payload}`);
    error.statusCode = 502;
    error.httpStatus = res.status;
    error.endpointName = label;
    error.binanceResult = data;
    if (data && typeof data === 'object') {
      error.binanceCode = data.code !== undefined && data.code !== null ? String(data.code) : null;
      error.binanceMessage = data.msg !== undefined && data.msg !== null
        ? String(data.msg)
        : (data.message !== undefined && data.message !== null ? String(data.message) : null);
    }
    throw error;
  }
  return data;
}

async function callSignedSapi({ apiKey, secretKey, endpointName, query = {}, body = null, clientType = 'web', dryRun = true, timeoutMs = 20000 }) {
  const ep = ENDPOINTS[endpointName];
  if (!ep) throw new Error(`Unknown Binance C2C endpoint: ${endpointName}`);
  const [method, path] = ep;
  return callSignedSapiPath({ apiKey, secretKey, endpointName, method, path, query, body, clientType, dryRun, timeoutMs });
}

function mask(value) {
  const s = String(value || '');
  if (s.length <= 8) return '****';
  return s.slice(0, 4) + '********' + s.slice(-4);
}

module.exports = { BASE_URL, ENDPOINTS, signQuery, buildSignedRequest, callSignedSapi, callSignedSapiPath, schedulerStats: () => ({ active:binanceHttpScheduler.active, queued:binanceHttpScheduler.queue.length, credentialPools:binanceHttpScheduler.perKey.size, globalConcurrency:BINANCE_HTTP_GLOBAL_CONCURRENCY, perKeyConcurrency:BINANCE_HTTP_PER_KEY_CONCURRENCY }) };
