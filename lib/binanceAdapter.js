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

const ENDPOINTS = {
  listOrders: ['POST', '/sapi/v1/c2c/orderMatch/listOrders'],
  listAds: ['POST', '/sapi/v1/c2c/ads/listWithPagination'],
  searchAds: ['POST', '/sapi/v1/c2c/ads/search'],
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(timeoutMs || 20000));
  let res;
  try {
    res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, redirect: 'error', signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error(`Binance SAPI timeout after ${timeoutMs}ms for ${label}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
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

module.exports = { BASE_URL, ENDPOINTS, signQuery, buildSignedRequest, callSignedSapi, callSignedSapiPath };
