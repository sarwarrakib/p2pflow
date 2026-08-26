'use strict';

// P2PFlow v1.7.8 frontend routing core.
// Clean History API URLs are canonical. Legacy #/ URLs remain readable and are
// migrated in-place so old bookmarks and notification links keep working.
(function installP2PFlowHistoryRouter(global) {
  const PAGE_PATHS = Object.freeze({
    dashboard: '/dashboard',
    'p2p-market': '/p2p/market',
    'p2p-profile': '/p2p/profile',
    orders: '/orders',
    chat: '/p2p/messages',
    ads: '/p2p/advertisements',
    approvals: '/p2p/approvals',
    accounts: '/payments/accounts',
    'offline-transactions': '/payments/offline-business',
    ledger: '/payments/statement',
    agents: '/team/users',
    'user-roles': '/team/roles',
    routing: '/team/routing',
    reports: '/reports',
    accounting: '/accounting',
    'accounting-expenses': '/accounting/expenses',
    'accounting-income': '/accounting/income',
    'accounting-capital': '/accounting/capital',
    'accounting-closing': '/accounting/closing',
    activity: '/monitor/activity',
    credentials: '/system/api-credentials',
    health: '/system/health',
    'system-update': '/system/update',
    settings: '/system/settings',
    'p2p-extension': '/system/extension',
    security: '/system/security',
    notifications: '/notifications',
    audit: '/monitor/audit'
  });

  const PATH_PAGES = new Map(Object.entries(PAGE_PATHS).map(([page, path]) => [path, page]));
  const LEGACY_PATH_ALIASES = new Map(Object.keys(PAGE_PATHS).map(page => [`/${page}`, page]));
  LEGACY_PATH_ALIASES.set('/', 'dashboard');
  LEGACY_PATH_ALIASES.set('/system-update', 'system-update');
  LEGACY_PATH_ALIASES.set('/p2p-market', 'p2p-market');
  LEGACY_PATH_ALIASES.set('/p2p-profile', 'p2p-profile');
  LEGACY_PATH_ALIASES.set('/offline-transactions', 'offline-transactions');
  LEGACY_PATH_ALIASES.set('/user-roles', 'user-roles');
  LEGACY_PATH_ALIASES.set('/p2p-extension', 'p2p-extension');

  function cleanPathname(value) {
    let path = String(value || '/').trim() || '/';
    try { path = decodeURIComponent(path); } catch (_) {}
    path = path.split('?')[0].split('#')[0] || '/';
    if (!path.startsWith('/')) path = '/' + path;
    path = path.replace(/\/{2,}/g, '/');
    if (path.length > 1) path = path.replace(/\/+$/, '');
    return path || '/';
  }

  function normalizeRoute(route = {}) {
    const page = Object.prototype.hasOwnProperty.call(PAGE_PATHS, route.page) ? String(route.page) : 'dashboard';
    return {
      page,
      orderId: page === 'orders' && Number(route.orderId || 0) > 0 ? Number(route.orderId) : null,
      ledgerAccountId: page === 'ledger' && Number(route.ledgerAccountId || route.accountId || 0) > 0 ? Number(route.ledgerAccountId || route.accountId) : null
    };
  }

  function routeToPath(route = {}) {
    const normalized = normalizeRoute(route);
    if (normalized.page === 'orders' && normalized.orderId) return `/orders/${normalized.orderId}`;
    if (normalized.page === 'ledger' && normalized.ledgerAccountId) return `/payments/statement/account/${normalized.ledgerAccountId}`;
    return PAGE_PATHS[normalized.page] || '/dashboard';
  }

  function pathToRoute(pathname = '/') {
    const path = cleanPathname(pathname);
    let match = path.match(/^\/orders\/(\d+)$/);
    if (match) return { page:'orders', orderId:Number(match[1]), ledgerAccountId:null };
    match = path.match(/^\/payments\/statement\/account\/(\d+)$/);
    if (match) return { page:'ledger', orderId:null, ledgerAccountId:Number(match[1]) };
    const page = PATH_PAGES.get(path) || LEGACY_PATH_ALIASES.get(path) || null;
    if (!page) return null;
    return { page, orderId:null, ledgerAccountId:null };
  }

  function legacyHashToRoute(hash = '') {
    const raw = String(hash || '').replace(/^#\/?/, '').trim();
    if (!raw) return null;
    const parts = raw.split('/').filter(Boolean);
    const page = parts[0] || 'dashboard';
    if (!Object.prototype.hasOwnProperty.call(PAGE_PATHS, page)) return null;
    const route = { page, orderId:null, ledgerAccountId:null };
    if (page === 'orders' && parts[1]) route.orderId = Number(parts[1]) || null;
    if (page === 'ledger' && parts[1] === 'account' && parts[2]) route.ledgerAccountId = Number(parts[2]) || null;
    return normalizeRoute(route);
  }

  function locationToRoute(locationLike = global.location) {
    const legacy = legacyHashToRoute(locationLike?.hash || '');
    if (legacy) return legacy;
    return pathToRoute(locationLike?.pathname || '/') || { page:'dashboard', orderId:null, ledgerAccountId:null };
  }

  function canonicalizeLocation(locationLike = global.location) {
    const route = locationToRoute(locationLike);
    return { route, path:routeToPath(route) };
  }

  function isKnownAppPath(pathname = '/') {
    return Boolean(pathToRoute(pathname));
  }

  global.P2PFlowHistoryRouter = Object.freeze({
    PAGE_PATHS,
    cleanPathname,
    normalizeRoute,
    routeToPath,
    pathToRoute,
    legacyHashToRoute,
    locationToRoute,
    canonicalizeLocation,
    isKnownAppPath
  });
})(window);
