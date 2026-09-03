'use strict';

const API_V1_PREFIX = '/api/v1';

const V1_ALIASES = Object.freeze({
  '/api/v1/auth/login': '/api/login',
  '/api/v1/auth/logout': '/api/logout',
  '/api/v1/session/me': '/api/me',
  '/api/v1/session/bootstrap': '/api/bootstrap',
  '/api/v1/realtime/events': '/api/events'
});

function normalizeApiRequestUrl(rawUrl = '/') {
  const input = String(rawUrl || '/');
  const parsed = new URL(input, 'http://localhost');
  if (parsed.pathname === `${API_V1_PREFIX}/meta`) {
    return { version: 1, meta: true, originalPath: parsed.pathname, url: input };
  }
  if (parsed.pathname === API_V1_PREFIX || parsed.pathname.startsWith(`${API_V1_PREFIX}/`)) {
    const mappedPath = V1_ALIASES[parsed.pathname] || `/api${parsed.pathname.slice(API_V1_PREFIX.length) || '/'}`;
    parsed.pathname = mappedPath.replace(/\/+/g, '/');
    return { version: 1, meta: false, originalPath: String(new URL(input, 'http://localhost').pathname), url: `${parsed.pathname}${parsed.search}` };
  }
  return { version: 0, meta: false, originalPath: parsed.pathname, url: input };
}

function bearerTokenFromRequest(req) {
  const raw = String(req?.headers?.authorization || '').trim();
  const match = raw.match(/^Bearer\s+([A-Za-z0-9._~-]{20,256})$/i);
  return match ? match[1] : '';
}

function isBearerApiRequest(req) {
  return Boolean(bearerTokenFromRequest(req));
}

function wantsMobileAccessToken(req, body = {}) {
  const requested = String(body.clientType || body.client || req?.headers?.['x-p2pflow-client'] || '').trim().toLowerCase();
  return Number(req?._p2pflowApiVersion || 0) === 1 && ['android', 'ios', 'mobile', 'native'].includes(requested);
}

module.exports = {
  API_V1_PREFIX,
  V1_ALIASES,
  normalizeApiRequestUrl,
  bearerTokenFromRequest,
  isBearerApiRequest,
  wantsMobileAccessToken
};
