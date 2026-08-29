'use strict';

// Starts only the active route's page bundle while the app core is still
// downloading/parsing. Other page bundles remain lazy and are fetched on first use.
(() => {
  const registry = window.P2PFlowPageModulePromises || (window.P2PFlowPageModulePromises = new Map());
  const selfUrl = new URL(document.currentScript?.src || location.href, location.href);
  const version = selfUrl.searchParams.get('v') || '';
  const route = window.P2PFlowHistoryRouter?.pathToRoute?.(location.pathname || '/') || null;
  const page = route?.page || 'dashboard';
  const files = {
    dashboard:'dashboard.js', 'p2p-market':'p2p-market.js', 'p2p-profile':'p2p-profile.js', orders:'orders.js', chat:'chat.js', ads:'ads.js',
    approvals:'approvals.js', accounts:'accounts.js', 'offline-transactions':'offline-transactions.js', ledger:'ledger.js', agents:'users.js',
    'user-roles':'user-roles.js', routing:'routing.js', reports:'reports.js', accounting:'accounting.js', 'accounting-expenses':'accounting.js',
    'accounting-income':'accounting.js', 'accounting-capital':'accounting.js', 'accounting-closing':'accounting.js', activity:'activity.js', credentials:'credentials.js',
    health:'health.js', 'system-update':'system-update.js', settings:'settings.js', 'p2p-extension':'p2p-extension.js', security:'security.js', notifications:'notifications.js', audit:'audit.js'
  };
  const filename = files[page];
  if (!filename) return;
  const url = `/js/pages/${filename}${version ? `?v=${encodeURIComponent(version)}` : ''}`;
  if (registry.has(url)) return;
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.dataset.p2pflowPageModule = url;
    script.onload = () => { script.dataset.loaded = '1'; resolve(); };
    script.onerror = () => { registry.delete(url); reject(new Error(`Page module could not be loaded: ${page}`)); };
    document.head.appendChild(script);
  });
  registry.set(url, promise);
})();
