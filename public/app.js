// v1.7.4: fixed-viewport AppShell, clean History routes, persistent per-route hosts, lifecycle rendering, and data-only DOM patching.
// v1.7.4: stable-shell navigation, stale-request cancellation, non-destructive order/chat updates, and latest-navigation-wins rendering.
// v1.5.23: Payment Account serial scope treats each normalized Label, including no Label, as an independent namespace.
// v1.5.22: Header-only Work Status, chat-only notification master, and coupled sound/push controls.
// v1.5.20: account-scoped Binance RBAC, visible security recovery setup and individual-only profit accounting.
// v1.5.20: first-run recovery reuses the saved Application Key and software updates are Owner-only from Control Panel.
// v1.0.137: Diagnose and harden Binance P2P Create Advertisement privilege flow.
// v1.0.128: lightweight Ads UI, cached reloads and realtime Binance merchant-status sync.
// v1.0.117: Stop order countdowns immediately after completed or cancelled status sync.
// v1.0.115: P2P message inbox and compact Orders three-dot action menu.
// v1.0.114: Persistent Binance-style mobile bottom navigation on every CRM page.
// v1.0.113: Realtime advertisement sync and screenshot-aligned advertisement editor UI.
// v1.0.112: Advertisement management with manager-presence guard and BUY paid-mark action hiding.
// v1.0.111: System-managed payment accounts, private agent access, outbound chat text fix, hidden completed-verification notice and filtered Method Capacity.
// v1.0.102: Chat notifications show the counterparty username prominently with a compact new-message label.
// v1.0.94: Compact and chat headers keep the Binance nickname; the identity line below order badges and incoming counterparty messages use the real name.
// v1.0.81: Notification sound controls moved to Settings with per-browser custom audio support.
const state = {
  user: null,
  csrfToken: null,
  page: 'dashboard',
  bootstrap: null,
  currentOrderId: null,
  currentOrder: null,
  ledgerAccountId: null,
  evt: null,
  refreshTimer: null,
  chatSyncTimer: null,
  chatSyncBusy: false,
  chatSyncFailCount: 0,
  orderSyncBusy: false,
  ordersRefreshBusy: false,
  apiChallengeReloading: false,
  refreshing: false,
  pendingRefresh: false,
  orderSnapshot: null,
  orderCredentialId: Number(localStorage.getItem('crmOrderCredentialId') || 0),
  orderCredentialOptions: [],
  orderLiveCredentialOptions: [],
  orderDetailSyncTimer: null,
  currentOrderReloadTimer: null,
  pendingOpenChatOrderId: null,
  seenOrderEventKeys: new Set(),
  seenOrderSoundKeys: new Set(),
  orderListRefreshTimer: null,
  orderActiveTabs: { ongoing: localStorage.getItem('crmOrderTab:ongoing') || 'all', fulfilled: localStorage.getItem('crmOrderTab:fulfilled') || 'all' },
  reportFilter: { period: 'daily', start: '', end: '' },
  orderGroup: localStorage.getItem('crmOrderGroup') || 'ongoing',
  lang: localStorage.getItem('crmLang') || 'bn',
  applyingLanguage: false,
  p2pInfoTab: 'info',
  p2pFeedbackTab: 'negative',
  activityTimer: null,
  activityHeartbeatSeconds: 15,
  activityViewTimer: null,
  activityFilter: { period: 'daily', start: '', end: '', userId: '' },
  notificationRefreshTimer: null,
  notificationPollTimer: null,
  notificationCenterData: { total: 0, items: [] },
  adsFilters: { asset:'', fiat:'', tradeType:'', status:'', search:'' },
  adsData: null,
  adsCredentialId: Number(localStorage.getItem('crmAdsCredentialId') || 0),
  notificationCredentialId: Number(localStorage.getItem('crmNotificationCredentialId') || 0),
  notificationCredentialScopeSyncTimer: null,
  lastSyncedNotificationCredentialId: null,
  adsSearchTimer: null,
  mobileNavCounts: { orders: 0, chats: 0, approvals: 0 },
  mobileNavSyncTimer: null,
  mobileNavSyncBusy: false,
  chatInboxSearch: '',
  chatInboxRefreshTimer: null,
  chatAccountCredentialId: Number(localStorage.getItem('crmChatAccountCredentialId') || 0),
  chatAccountOptions: [],
  chatAccountMenuOpen: false,
  p2pMarketFilters: { tradeType:'BUY', asset:'USDT', fiat:'BDT', amount:'', payType:'', payTypes:[], publisherType:'', tradableOnly:false, merchantOnly:false, verifiedMerchantOnly:false, noVerificationRequired:false, paymentTime:0, country:'ALL', sortBy:'price', saveFilter:false, page:1, rows:20 },
  p2pMarketData: null,
  p2pMarketLoading: false,
  p2pMarketRefreshTimer: null,
  accountingRefreshTimer: null,
  accountingLoading: false,
  orderAcceptance: null,
  orderAcceptancePromptShown: false,
  orderAcceptanceBusy: false,
  pushConfig: null,
  pushBusy: false,
  serviceWorkerRegistration: null,
  currentOrderChatItems: [],
  currentOrderChatLastId: 0,
  currentOrderChatRefreshBusy: false,
  currentOrderChatRefreshTimer: null,
  currentOrderChatNewCount: 0,
  currentOrderSoftRefreshBusy: false,
  currentOrderChatLastUserScrollAt: 0,
  currentOrderChatPreserveScrollTop: null,
  navigationEpoch: 0,
  navigationController: null,
  navigationRouteKey: '',
  navigationPending: false,
  pageRenderSeq: {},
  pageRenderControllers: {},
  routeViewCache: new Map(),
  routeViewCacheOrder: [],
  activeContentRouteKey: '',
  routeHostManager: null,
  backgroundPatchDepth: 0
};

const pages = [
  ['dashboard', 'Dashboard'],
  ['p2p-market', 'P2P Market'],
  ['p2p-profile', 'P2P Profile'],
  ['orders', 'Orders'],
  ['chat', 'P2P Message'],
  ['ads', 'Advertisements'],
  ['approvals', 'Approvals'],
  ['accounts', 'Payment Accounts'],
  ['offline-transactions', 'Offline Business'],
  ['ledger', 'Account Statement'],
  ['agents', 'Users'],
  ['user-roles', 'User Roles'],
  ['routing', 'Routing'],
  ['reports', 'Reports'],
  ['accounting', 'Accounting Overview'],
  ['accounting-expenses', 'Expense'],
  ['accounting-income', 'Business Income'],
  ['accounting-capital', 'Capital'],
  ['accounting-closing', 'Daily Closing'],
  ['activity', 'Activity Monitor'],
  ['credentials', 'API Credentials'],
  ['health', 'Health Check'],
  ['system-update', 'System Update'],
  ['settings', 'Settings'],
  ['p2p-extension', 'Extension Bridge'],
  ['security', 'Security'],
  ['notifications', 'Notifications'],
  ['audit', 'Audit Logs']
];


const PAGE_PERMISSIONS = {
  dashboard: 'dashboard.view',
  'p2p-market': 'orders.view',
  'p2p-profile': 'p2p.profile.view',
  orders: 'orders.view',
  chat: null,
  ads: 'ads.view',
  approvals: 'approvals.manage',
  binance: 'binance.sync',
  accounts: 'accounts.view',
  'offline-transactions': 'offline.transactions.manage',
  ledger: 'accounts.view',
  agents: 'agents.manage',
  'user-roles': 'roles.manage',
  routing: 'routing.manage',
  reports: 'reports.view',
  accounting: 'accounting.view',
  'accounting-expenses': 'accounting.view',
  'accounting-income': 'accounting.view',
  'accounting-capital': 'accounting.view',
  'accounting-closing': 'accounting.view',
  activity: 'activity.view',
  credentials: 'credentials.manage',
  health: 'settings.manage',
  'system-update': 'settings.manage',
  settings: 'settings.manage',
  'p2p-extension': 'settings.manage',
  notifications: null,
  audit: 'audit.view'
};

const ACCOUNTING_PAGE_IDS = ['accounting','accounting-expenses','accounting-income','accounting-capital','accounting-closing'];
function isAccountingPage(page=state.page) { return ACCOUNTING_PAGE_IDS.includes(page); }

// v1.4: configuration-driven navigation. Visibility still comes from the existing
// role + permission checks in visiblePages(); this layer only controls presentation.
const NAV_MENU_GROUPS = [
  { id:'trading', label:'P2P Trading', icon:'trade', items:[
    ['p2p-market','P2P Market','market'], ['p2p-profile','P2P Profile','profile'], ['orders','Orders','orders'], ['chat','P2P Message','chat'],
    ['ads','Advertisements','ads'], ['approvals','Approvals','approve']
  ]},
  { id:'accounting', label:'Accounting', icon:'accounting', items:[
    ['accounting','Overview','overview'], ['accounts','Payment Accounts','wallet'], ['offline-transactions','Offline Business','offline'], ['ledger','Account Statement','statement'],
    ['accounting-expenses','Expense','expense'], ['accounting-income','Business Income','income'],
    ['accounting-capital','Capital','capital'], ['accounting-closing','Daily Closing','closing']
  ]},
  { id:'team', label:'Team & Control', icon:'team', items:[
    ['agents','Users','users'], ['user-roles','User Roles','roles'], ['routing','Routing','routing']
  ]},
  { id:'monitoring', label:'Reports & Monitoring', icon:'monitor', items:[
    ['reports','Reports','reports'], ['activity','Activity Monitor','activity'], ['audit','Audit Logs','audit'],
    ['notifications','Notifications','alerts']
  ]},
  { id:'system', label:'System', icon:'system', items:[
    ['security','Security','security'], ['credentials','API Credentials','key'], ['p2p-extension','Extension Bridge','extension'],
    ['health','Health Check','health'], ['settings','Settings','settings'], ['system-update','System Update','update']
  ]}
];

const NAV_ICON_SVGS = {
  dashboard:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>',
  trade:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h13m0 0-3-3m3 3-3 3M19 17H6m0 0 3 3m-3-3 3-3"/></svg>',
  market:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18V9m5 9V5m5 13v-6m5 6V3"/></svg>',
  profile:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20v-2c0-3.5 2.8-6 7-6s7 2.5 7 6v2"/></svg>',
  orders:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h10l2 2v16H6zM9 8h6M9 12h6M9 16h4"/></svg>',
  chat:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v12H9l-5 4zM8 9h8M8 13h5"/></svg>',
  ads:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h5l9-5v14l-9-5H4zM9 14l2 6H7l-1-6"/></svg>',
  approve:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4L19 6"/></svg>',
  accounting:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h2M14 12h2M8 16h2M14 16h2"/></svg>',
  overview:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/></svg>',
  wallet:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h15v13H4zM4 9h15M15 13h4"/></svg>',
  offline:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM7 9h10M7 13h5M16 13h1M7 17h3"/><path d="M15 3v4M9 3v4"/></svg>',
  statement:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/></svg>',
  expense:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M7 9l5-5 5 5"/></svg>',
  income:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V4M7 15l5 5 5-5"/></svg>',
  capital:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h16M6 9v9m4-9v9m4-9v9m4-9v9M3 20h18M5 6l7-3 7 3z"/></svg>',
  closing:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  team:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20v-2c0-3 2-5 6-5s6 2 6 5v2M15 14c3 0 5 2 5 4v2"/></svg>',
  users:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 20v-2c0-3 2.5-5 7-5s7 2 7 5v2"/></svg>',
  roles:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9 12l2 2 4-4"/></svg>',
  routing:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 6h8M6 8v4c0 4 3 6 8 6h2"/></svg>',
  monitor:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v12H3zM8 21h8M12 17v4M6 13l3-3 3 2 5-5"/></svg>',
  reports:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18H5zM8 16v-4m4 4V8m4 8v-6"/></svg>',
  activity:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>',
  audit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h3"/><circle cx="17" cy="17" r="3"/></svg>',
  alerts:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3zM10 20h4"/></svg>',
  system:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>',
  security:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/></svg>',
  key:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M15 12v2"/></svg>',
  extension:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5z"/></svg>',
  health:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>',
  settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>',
  update:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>',
  menu:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
};

function navIcon(name) {
  return `<span class="nav-item-icon" aria-hidden="true">${NAV_ICON_SVGS[name] || NAV_ICON_SVGS.dashboard}</span>`;
}

function compactVersionText(value='') {
  const clean = String(value || '').replace(/^v/i,'');
  const match = clean.match(/^(\d+)\.(\d+)\.0$/);
  return match ? `${match[1]}.${match[2]}` : clean;
}

function navPageBadge(pageId) {
  let value = 0;
  if (pageId === 'orders') value = Number(state.mobileNavCounts?.orders || 0);
  if (pageId === 'chat') value = Number(state.mobileNavCounts?.chats || 0);
  if (pageId === 'approvals') value = Number(state.mobileNavCounts?.approvals || 0);
  if (pageId === 'notifications') value = Number(state.notificationCenterData?.total || 0);
  if (pageId === 'system-update' && state.bootstrap?.settings?.updateAvailable) return `<span class="nav-status-badge">${state.lang === 'bn' ? 'নতুন' : 'NEW'}</span>`;
  if (value <= 0) return '';
  return `<span class="nav-count-badge">${value > 99 ? '99+' : value}</span>`;
}

function renderSidebarMeta() {
  const version = compactVersionText(state.bootstrap?.settings?.applicationVersion || '');
  const versionEl = $('#sidebarVersion');
  if (versionEl) versionEl.textContent = state.lang === 'bn' ? `ভার্সন ${version || '-'}` : `Version ${version || '-'}`;
  const statusEl = $('#sidebarServerStatus');
  if (statusEl) statusEl.textContent = navigator.onLine === false ? (state.lang === 'bn' ? 'অফলাইন' : 'Offline') : (state.lang === 'bn' ? 'সার্ভার অনলাইন' : 'Server Online');
  const runtime = $('#sidebarRuntime');
  if (runtime) runtime.classList.toggle('offline', navigator.onLine === false);
}

const FRONTEND_PERMISSION_IMPLICATIONS = Object.freeze({
  'accounts.manage': Object.freeze(['accounts.view']),
  'accounts.manage_all': Object.freeze(['accounts.view', 'accounts.manage']),
  'ledger.adjust': Object.freeze(['accounts.view']),
  'offline.transactions.manage': Object.freeze(['accounts.view']),
  'binance.sync': Object.freeze(['orders.view'])
});
function hasPerm(permission) {
  if (!permission) return true;
  if (!state.user) return false;
  const permissions = state.user.permissions || [];
  if (permissions.includes(permission)) return true;
  return Object.entries(FRONTEND_PERMISSION_IMPLICATIONS).some(([granted, implied]) => permissions.includes(granted) && implied.includes(permission));
}

function canOverrideOrderAssignmentClient() {
  return hasPerm('orders.assign') || hasPerm('approvals.manage');
}
function isAssignmentScopedClient() {
  return Number(state.user?.agentId || 0) > 0 && hasPerm('orders.view') && !canOverrideOrderAssignmentClient();
}

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const money = n => '৳' + Number(n || 0).toLocaleString('en-BD');

let mobileNavReturnFocus = null;
const mobileNavigationQuery = window.matchMedia ? window.matchMedia('(max-width: 900px)') : null;

function usesMobileNavigation() {
  return mobileNavigationQuery ? mobileNavigationQuery.matches : window.innerWidth <= 900;
}

function setMobileNavigation(open, options={}) {
  const sidebar = $('#sidebar');
  const button = $('#mobileMenuBtn');
  const backdrop = $('#sidebarBackdrop');
  const shouldOpen = Boolean(open && usesMobileNavigation());
  if (!sidebar || !button || !backdrop) return;

  if (shouldOpen) mobileNavReturnFocus = document.activeElement;
  const mobileMode = usesMobileNavigation();
  document.body.classList.toggle('nav-open', shouldOpen);
  sidebar.classList.toggle('is-open', shouldOpen);
  sidebar.setAttribute('aria-hidden', mobileMode && !shouldOpen ? 'true' : 'false');
  if ('inert' in sidebar) sidebar.inert = Boolean(mobileMode && !shouldOpen);
  button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  button.setAttribute('aria-label', shouldOpen ? 'Close menu' : 'Open menu');
  button.setAttribute('title', shouldOpen ? 'Close menu' : 'Open menu');
  backdrop.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');

  if (shouldOpen) {
    window.setTimeout(() => {
      const active = sidebar.querySelector('nav button.active') || sidebar.querySelector('nav button');
      if (active) active.focus({ preventScroll: true });
    }, 40);
  } else if (options.restoreFocus && mobileNavReturnFocus && typeof mobileNavReturnFocus.focus === 'function') {
    mobileNavReturnFocus.focus({ preventScroll: true });
  }
  if (state.user && typeof renderMobileBottomNav === 'function') renderMobileBottomNav();
}

function setupResponsiveNavigation() {
  const openButton = $('#mobileMenuBtn');
  const closeButton = $('#mobileMenuClose');
  const backdrop = $('#sidebarBackdrop');
  if (!openButton || !closeButton || !backdrop) return;

  openButton.onclick = () => setMobileNavigation(!document.body.classList.contains('nav-open'), { restoreFocus: true });
  closeButton.onclick = () => setMobileNavigation(false, { restoreFocus: true });
  backdrop.onclick = () => setMobileNavigation(false, { restoreFocus: true });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('nav-open')) {
      setMobileNavigation(false, { restoreFocus: true });
    }
  });

  const handleViewportChange = () => {
    if (!usesMobileNavigation()) setMobileNavigation(false, { restoreFocus: false });
  };
  if (mobileNavigationQuery && typeof mobileNavigationQuery.addEventListener === 'function') {
    mobileNavigationQuery.addEventListener('change', handleViewportChange);
  } else {
    window.addEventListener('resize', handleViewportChange, { passive: true });
  }
  setMobileNavigation(false, { restoreFocus: false });
}
function scrollSidebarNavBy(delta) {
  const nav = $('#nav');
  if (!nav || nav.scrollHeight <= nav.clientHeight + 1) return false;
  const amount = Number(delta || 0);
  if (!Number.isFinite(amount) || amount === 0) return false;
  const maxScroll = Math.max(0, nav.scrollHeight - nav.clientHeight);
  const before = nav.scrollTop;
  nav.scrollTop = Math.max(0, Math.min(maxScroll, before + amount));
  return Math.abs(nav.scrollTop - before) > 0.5;
}

function revealSidebarNavElement(element, behavior='smooth') {
  const nav = $('#nav');
  if (!nav || !element || nav.scrollHeight <= nav.clientHeight + 1) return;
  const navRect = nav.getBoundingClientRect();
  const itemRect = element.getBoundingClientRect();
  const pad = 10;
  let delta = 0;
  if (itemRect.top < navRect.top + pad) delta = itemRect.top - navRect.top - pad;
  else if (itemRect.bottom > navRect.bottom - pad) delta = itemRect.bottom - navRect.bottom + pad;
  if (!delta) return;
  if (typeof nav.scrollBy === 'function') nav.scrollBy({ top:delta, left:0, behavior });
  else nav.scrollTop += delta;
}

function setupSidebarScrollableNavigation() {
  const sidebar = $('#sidebar');
  const nav = $('#nav');
  if (!sidebar || !nav || sidebar.dataset.scrollNavigationReady === '1') return;
  sidebar.dataset.scrollNavigationReady = '1';

  // Route mouse-wheel/trackpad movement to the menu even when the pointer is
  // over the brand or footer. This also works around hosting/browser layouts
  // where a fixed sidebar would otherwise swallow the wheel gesture.
  sidebar.addEventListener('wheel', event => {
    if (!event.deltaY || event.ctrlKey) return;
    if (scrollSidebarNavBy(event.deltaY)) event.preventDefault();
  }, { passive:false });

  // Keyboard access for long menus while focus remains on a menu button.
  sidebar.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const page = Math.max(120, Math.floor(nav.clientHeight * 0.82));
    if (event.key === 'PageDown' && scrollSidebarNavBy(page)) event.preventDefault();
    else if (event.key === 'PageUp' && scrollSidebarNavBy(-page)) event.preventDefault();
    else if (event.key === 'Home' && nav.scrollTop > 0) {
      nav.scrollTop = 0;
      event.preventDefault();
    } else if (event.key === 'End' && nav.scrollTop < nav.scrollHeight - nav.clientHeight - 1) {
      nav.scrollTop = Math.max(0, nav.scrollHeight - nav.clientHeight);
      event.preventDefault();
    }
  });
}

function chatLocaleText(en='', bn='') {
  return state.lang === 'bn' ? (bn || en) : en;
}
function parseChatJsonPayload(raw, depth=0) {
  if (depth > 5 || raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!/^[\[{]/.test(text)) return null;
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'string' ? parseChatJsonPayload(parsed, depth + 1) : parsed;
  } catch {
    return null;
  }
}
function chatSystemValues(payload={}, keys=[], maxDepth=7) {
  const wanted = new Set(keys.map(key => String(key).toLowerCase()));
  const out = [];
  const visited = new Set();
  const walk = (value, depth=0) => {
    if (depth > maxDepth || value == null) return;
    if (typeof value === 'string') {
      const text = value.trim();
      if (/^[\[{]/.test(text)) {
        try { walk(JSON.parse(text), depth + 1); } catch {}
      }
      return;
    }
    if (typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach(item => walk(item, depth + 1));
      return;
    }
    Object.entries(value).forEach(([key, item]) => {
      if (wanted.has(String(key).toLowerCase()) && item !== undefined && item !== null && typeof item !== 'object') {
        const text = String(item).trim();
        if (text && !out.includes(text)) out.push(text);
      }
      walk(item, depth + 1);
    });
  };
  walk(payload, 0);
  return out;
}
function chatSystemField(payload={}, keys=[]) {
  return chatSystemValues(payload, keys)[0] || '';
}
function chatPayloadText(payload={}, maxDepth=7) {
  const out = [];
  const visited = new Set();
  const walk = (value, depth=0, key='') => {
    if (depth > maxDepth || value == null) return;
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return;
      if (/^[\[{]/.test(text)) {
        try { walk(JSON.parse(text), depth + 1, key); return; } catch {}
      }
      if (/^(data:|https?:\/\/).{300,}$/i.test(text)) return;
      out.push(key ? `${key}: ${text}` : text);
      return;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      out.push(key ? `${key}: ${value}` : String(value));
      return;
    }
    if (typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach(item => walk(item, depth + 1, key));
      return;
    }
    Object.entries(value).forEach(([childKey, item]) => walk(item, depth + 1, childKey));
  };
  walk(payload, 0, '');
  return out.join(' · ');
}
function chatSystemFacts(raw, typeHint='') {
  const payload = parseChatJsonPayload(raw) || (raw && typeof raw === 'object' ? raw : null);
  const typeKeys = ['type','eventType','event','action','statusType','messageType','chatMessageType','bizType','subType','cardType','templateType','scenario','scene'];
  const candidates = payload ? chatSystemValues(payload, typeKeys) : [];
  if (typeHint) candidates.push(String(typeHint));
  const normalizeType = value => String(value || '').trim().toLowerCase().replace(/[\s.:-]+/g, '_');
  const genericTypes = new Set(['', 'text', 'image', 'video', 'audio', 'file', 'emoji', 'system', 'notice', 'notification', 'event', 'order_status', 'system_message']);
  const specific = candidates.find(value => !genericTypes.has(normalizeType(value)) && normalizeType(value) !== 'card');
  const rawType = specific || candidates.find(Boolean) || String(typeHint || '');
  const type = normalizeType(rawType);
  const allTypes = candidates.map(normalizeType).filter(Boolean);
  return {
    payload,
    rawType,
    type,
    allTypes,
    signature: allTypes.join(' '),
    text: payload ? chatPayloadText(payload) : String(raw || '')
  };
}
function chatRecordRaw(c={}) {
  const raw = c.rawBinanceMessage && (typeof c.rawBinanceMessage === 'object' || String(c.rawBinanceMessage).trim())
    ? c.rawBinanceMessage
    : null;
  if (raw && typeof raw === 'object') {
    const embedded = raw.content ?? raw.message ?? raw.text ?? raw.body ?? raw.msg ?? raw.imageUrl ?? raw.url ?? raw.data?.content ?? raw.data?.message ?? raw.data?.imageUrl;
    if (embedded === undefined && String(c.message || '').trim()) {
      return { ...raw, content: c.message, crmMessageType: c.messageType || raw.crmMessageType || raw.type || 'text' };
    }
  }
  return raw || c.message || '';
}
function chatVerificationCompleted(c={}) {
  const facts = chatSystemFacts(chatRecordRaw(c), c.messageType || '');
  const signature = `${facts.signature} ${facts.text}`.toLowerCase();
  return /order[_\s-]*verified|verified[_\s-]*additional[_\s-]*kyc|additional[_\s-]*kyc.*verified|verification.*(complete|completed|passed|approved)|order verified\. payment details/.test(signature);
}
function humanizeChatEventType(value='') {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}
function formatBinanceSystemMessage(raw, typeHint='', context={}) {
  const facts = chatSystemFacts(raw, typeHint);
  const payload = facts.payload;
  const type = facts.type;
  const signature = `${facts.signature} ${facts.text}`.toLowerCase();
  const normalContentTypes = new Set(['', 'text', 'image', 'video', 'audio', 'file', 'emoji']);
  const explicitSystem = /^(system|notice|notification|event|order_status|system_message|card)$/i.test(String(typeHint || ''));
  const payloadEvent = !!(payload && facts.allTypes.some(item => !normalContentTypes.has(item)));
  if (!explicitSystem && !payloadEvent) return null;

  const order = context.order || state.currentOrder || {};
  const orderType = String(order.type || '').toUpperCase();
  const asset = chatSystemField(payload || {}, ['symbol','asset','coin','crypto','currency','assetName']) || String(order.asset || 'USDT');
  const amount = chatSystemField(payload || {}, ['amount','quantity','qty','totalAmount','tradeAmount']);
  const reason = chatSystemField(payload || {}, ['reason','cancelReason','message','msg','description','remark']);
  const status = chatSystemField(payload || {}, ['status','orderStatus','verificationStatus','verifyStatus']);
  const assetText = asset || chatLocaleText('the crypto', 'ক্রিপ্টো');
  const amountText = amount ? `${amount}${asset ? ` ${asset}` : ''}` : '';
  const result = (titleEn, textEn, titleBn, textBn, meta={}) => ({
    isSystem: true,
    systemType: meta.systemType || type || 'system',
    title: chatLocaleText(titleEn, titleBn),
    text: chatLocaleText(textEn, textBn),
    ...meta
  });

  const isLiveness = /liveness|live[_\s-]*ness|face.*(check|verification)|identity.*liveness/.test(signature) || (type === 'card' && /verification|requested|pending|order number/.test(signature));
  if (isLiveness || type === 'card') {
    const requester = chatSystemField(payload || {}, ['requesterName','requestedBy','requestBy','requester','initiatorName','merchantName','nickName','senderName','userName']) ||
      ((facts.text.match(/([^·\n]+?)\s+requested to conduct liveness check/i) || [])[1] || '').replace(/^\w+:\s*/, '').trim();
    const orderNo = chatSystemField(payload || {}, ['orderNo','orderNumber','referenceMessage']) || String(order.externalOrderNo || order.orderNo || '');
    const lastVerification = chatSystemField(payload || {}, ['lastVerificationTime','lastVerifyTime','verificationTime','verifyTime']) ||
      ((facts.text.match(/last verification time[:\s]+([^·\n]+?)(?=\s*(?:status|disclaimer)[:\s]|$)/i) || [])[1] || '').trim();
    const rawStatus = String(status || ((facts.text.match(/status[:\s]+(pending|completed|passed|approved|failed|rejected)/i) || [])[1] || 'Pending'));
    const completed = context.verificationCompleted === true || /completed|passed|approved|verified/i.test(rawStatus);
    const statusEn = completed ? 'Completed' : 'Pending';
    const statusBn = completed ? 'সম্পন্ন' : 'অপেক্ষমাণ';
    const introEn = requester ? `${requester} requested to conduct a liveness check.` : 'A liveness check was requested.';
    const introBn = requester ? `${requester} লাইভনেস চেকের অনুরোধ করেছেন।` : 'একটি লাইভনেস চেকের অনুরোধ করা হয়েছে।';
    const linesEn = [introEn, orderNo ? `Order number: ${orderNo}` : '', lastVerification ? `Last verification time: ${lastVerification}` : '', `Status: ${statusEn}`, 'Disclaimer: Binance is neither involved in nor responsible for your P2P transaction or the collection of information for additional verification.'].filter(Boolean).join('\n');
    const linesBn = [introBn, orderNo ? `অর্ডার নম্বর: ${orderNo}` : '', lastVerification ? `সর্বশেষ ভেরিফিকেশন সময়: ${lastVerification}` : '', `স্ট্যাটাস: ${statusBn}`, 'দায়-অস্বীকার: অতিরিক্ত ভেরিফিকেশনের জন্য তথ্য সংগ্রহ বা P2P লেনদেনের সঙ্গে Binance জড়িত নয় এবং এর দায় বহন করে না।'].filter(Boolean).join('\n');
    return result('Liveness check', linesEn, 'লাইভনেস চেক', linesBn, { systemType: 'liveness_check', verificationState: completed ? 'completed' : 'pending' });
  }

  if (/order[_\s-]*verified|verified[_\s-]*additional[_\s-]*kyc|additional[_\s-]*kyc.*verified|verification.*(complete|completed|passed|approved)/.test(signature) || /order verified\. payment details/.test(signature)) {
    return result(
      'Order verified',
      'Payment details have now been shared with the counterparty for the payment to be made.',
      'অর্ডার ভেরিফাই হয়েছে',
      'পেমেন্ট করার জন্য পেমেন্টের তথ্য এখন কাউন্টারপার্টির সঙ্গে শেয়ার করা হয়েছে।',
      { systemType: 'order_verified', verificationState: 'completed' }
    );
  }

  if (/seller_(paid|payed)_with_ref|seller.*(paid|payed).*ref|marked.*order.*paid.*reference/.test(signature)) {
    const nickname = chatSystemField(payload || {}, ['nickname','nickName','userName','senderName','counterpartyName']) || orderCounterpartyNickname(order);
    const realName = chatSystemField(payload || {}, ['realName','fullName','legalName','counterpartyRealName']) || orderCounterpartyRealName(order);
    const reference = chatSystemField(payload || {}, ['referenceMessage','reference','orderNo','orderNumber']) || String(order.externalOrderNo || order.orderNo || '');
    const identity = nickname && realName && nickname.toLowerCase() !== realName.toLowerCase()
      ? `${nickname} (Real name: ${realName}${reference ? `, Reference message: ${reference}` : ''})`
      : (realName || nickname || chatLocaleText('The buyer', 'ক্রেতা'));
    return result(
      'Payment marked as paid',
      `${identity} has marked the order as paid. Please confirm that you have received the payment and release the asset. Please note: Log in to your payment account and confirm receipt before releasing the asset to avoid losses.`,
      'পেমেন্ট পেইড হিসেবে মার্ক করা হয়েছে',
      `${identity} অর্ডারটি পেইড হিসেবে মার্ক করেছেন। পেমেন্ট পেয়েছেন কি না নিশ্চিত হয়ে অ্যাসেট রিলিজ করুন। ক্ষতি এড়াতে অ্যাসেট রিলিজের আগে অবশ্যই আপনার পেমেন্ট অ্যাকাউন্টে লগইন করে টাকা পাওয়ার বিষয়টি যাচাই করুন।`,
      { systemType: 'payment_marked_paid_with_reference' }
    );
  }

  // Verified Binance buyer-side event wording. These event names are emitted as JSON
  // and must be translated before the generic regex rules below.
  if (/buyer_merchant_trading_with_ref|merchant_trading_with_ref|seller.*placed.*order/.test(signature)) {
    return result(
      'Order placed',
      'Seller has placed an order, please pay within the time limit.',
      'অর্ডার প্লেস হয়েছে',
      'বিক্রেতা অর্ডার প্লেস করেছেন। অনুগ্রহ করে নির্ধারিত সময়ের মধ্যে পেমেন্ট করুন।',
      { systemType: 'order_placed' }
    );
  }
  if (/buyer_(paid|payed)|buyer.*mark.*paid|mark.*order.*paid|payment.*marked.*paid/.test(signature)) {
    return result(
      'Payment marked as paid',
      'You have marked the order as paid, please wait for seller to confirm and release the asset.',
      'পেমেন্ট পেইড হিসেবে মার্ক করা হয়েছে',
      'আপনি অর্ডারটি পেইড হিসেবে মার্ক করেছেন। বিক্রেতার নিশ্চিতকরণ ও অ্যাসেট রিলিজের জন্য অপেক্ষা করুন।',
      { systemType: 'buyer_marked_paid' }
    );
  }
  if (/seller_(completed|complete)|seller.*released|release.*coin|coin.*released|crypto.*released/.test(signature)) {
    if (orderType === 'SELL') {
      return result(
        'Order completed',
        `You have released the ${assetText}, and the buyer will receive the ${assetText} soon.`,
        'অর্ডার সম্পন্ন',
        `আপনি ${assetText} রিলিজ করেছেন। ক্রেতা শিগগিরই ${assetText} পেয়ে যাবেন।`,
        { systemType: 'seller_completed' }
      );
    }
    return result(
      'Order completed',
      `Your payment has been received, the asset ${assetText} has been sent to your account.`,
      'অর্ডার সম্পন্ন',
      `আপনার পেমেন্ট পাওয়া গেছে এবং ${assetText} আপনার অ্যাকাউন্টে পাঠানো হয়েছে।`,
      { systemType: 'seller_completed' }
    );
  }
  if (/buyer.*(paid|payed|payment)|mark.*paid|payment.*marked.*paid/.test(signature)) {
    return result(
      'Payment marked as paid',
      orderType === 'SELL' ? 'The buyer marked the order as paid. Confirm receipt in your payment account before releasing the asset.' : 'The buyer marked the order as paid.',
      'পেমেন্ট পেইড হিসেবে চিহ্নিত',
      orderType === 'SELL' ? 'ক্রেতা অর্ডারটি পেইড হিসেবে মার্ক করেছেন। অ্যাসেট রিলিজের আগে আপনার পেমেন্ট অ্যাকাউন্টে টাকা পাওয়ার বিষয়টি নিশ্চিত করুন।' : 'ক্রেতা অর্ডারটি পেইড হিসেবে মার্ক করেছেন।'
    );
  }
  if (/seller.*(confirm|received).*payment|payment.*confirmed.*seller/.test(signature)) {
    return result('Payment confirmed', 'Seller confirmed that the payment was received.', 'পেমেন্ট নিশ্চিত', 'বিক্রেতা পেমেন্ট পাওয়ার বিষয়টি নিশ্চিত করেছেন।');
  }
  if (/buyer.*cancel/.test(signature)) {
    return result('Order cancelled', reason ? `Buyer cancelled the order: ${reason}` : 'Buyer cancelled the order.', 'অর্ডার বাতিল', reason ? `ক্রেতা অর্ডার বাতিল করেছেন: ${reason}` : 'ক্রেতা অর্ডার বাতিল করেছেন।');
  }
  if (/seller.*cancel/.test(signature)) {
    return result('Order cancelled', reason ? `Seller cancelled the order: ${reason}` : 'Seller cancelled the order.', 'অর্ডার বাতিল', reason ? `বিক্রেতা অর্ডার বাতিল করেছেন: ${reason}` : 'বিক্রেতা অর্ডার বাতিল করেছেন।');
  }
  if (/system.*cancel|order.*cancel|cancelled|canceled/.test(signature)) {
    return result('Order cancelled', reason || 'The order was cancelled.', 'অর্ডার বাতিল', reason || 'অর্ডারটি বাতিল হয়েছে।');
  }
  if (/appeal.*(open|create|start)|dispute.*(open|create|start)/.test(signature)) {
    return result('Appeal opened', reason || 'An appeal was opened for this order.', 'আপিল শুরু হয়েছে', reason || 'এই অর্ডারের জন্য আপিল শুরু হয়েছে।');
  }
  if (/appeal.*cancel|dispute.*cancel/.test(signature)) {
    return result('Appeal cancelled', reason || 'The appeal was cancelled.', 'আপিল বাতিল', reason || 'আপিলটি বাতিল হয়েছে।');
  }
  if (/appeal.*(resolve|complete|close)|dispute.*(resolve|complete|close)/.test(signature)) {
    return result('Appeal resolved', reason || 'The appeal was resolved.', 'আপিল নিষ্পত্তি', reason || 'আপিলটি নিষ্পত্তি হয়েছে।');
  }
  if (/payment.*(timeout|expired)|pay.*timeout|order.*expired/.test(signature)) {
    return result('Payment time expired', 'The payment time limit expired.', 'পেমেন্টের সময় শেষ', 'পেমেন্টের নির্ধারিত সময় শেষ হয়েছে।');
  }
  if (/order.*(created|placed)|new_order/.test(signature)) {
    if (orderType === 'SELL') {
      return result(
        'Order created',
        'Order created. Do not share your payment details.\nFollow the steps below:\n1. Receive and review the counterparty\'s identity documents via chat.\n2. After reviewing, click “Order Verified”.\n3. Payment details will then be shared with the counterparty for payment.',
        'অর্ডার তৈরি হয়েছে',
        'অর্ডার তৈরি হয়েছে। এখনই পেমেন্টের তথ্য শেয়ার করবেন না।\nনিচের ধাপগুলো অনুসরণ করুন:\n১. চ্যাটে কাউন্টারপার্টির পরিচয়পত্র গ্রহণ করে যাচাই করুন।\n২. যাচাই শেষে “Order Verified” চাপুন।\n৩. এরপর পেমেন্ট করার জন্য পেমেন্টের তথ্য কাউন্টারপার্টির সঙ্গে শেয়ার হবে।',
        { systemType: 'order_created' }
      );
    }
    return result('Order created', amountText ? `A new order was created for ${amountText}.` : 'A new order was created.', 'অর্ডার তৈরি হয়েছে', amountText ? `${amountText}-এর নতুন অর্ডার তৈরি হয়েছে।` : 'একটি নতুন অর্ডার তৈরি হয়েছে।');
  }
  if (/order.*complete|completed|success/.test(signature)) {
    return result('Order completed', amountText ? `The order for ${amountText} was completed.` : 'The order was completed.', 'অর্ডার সম্পন্ন', amountText ? `${amountText}-এর অর্ডার সম্পন্ন হয়েছে।` : 'অর্ডারটি সম্পন্ন হয়েছে।');
  }
  if (/kyc|verification/.test(signature)) {
    return result('Verification update', reason || 'Binance updated the order verification status.', 'ভেরিফিকেশন আপডেট', reason || 'Binance অর্ডারের ভেরিফিকেশন স্ট্যাটাস আপডেট করেছে।');
  }
  if (/payment.*method/.test(signature)) {
    return result('Payment method updated', reason || 'The payment method was updated.', 'পেমেন্ট মেথড আপডেট', reason || 'পেমেন্ট মেথড আপডেট হয়েছে।');
  }

  const readableType = humanizeChatEventType(facts.rawType || typeHint || 'System update');
  const details = [amountText, status && !readableType.toLowerCase().includes(status.toLowerCase()) ? status : '', reason]
    .filter(Boolean)
    .join(' · ');
  return result(
    readableType || 'Binance system update',
    details || 'Binance updated the order status.',
    readableType || 'Binance সিস্টেম আপডেট',
    details || 'Binance অর্ডারের স্ট্যাটাস আপডেট করেছে।'
  );
}
function normalizeChatDisplayMessage(raw, typeHint='', context={}) {
  let type = String(typeHint || '').toLowerCase();
  const systemMessage = formatBinanceSystemMessage(raw, typeHint, context);
  if (systemMessage) {
    return {
      type: 'system',
      text: systemMessage.text || systemMessage.title || '',
      isSystem: true,
      systemType: systemMessage.systemType,
      systemTitle: systemMessage.title,
      systemText: systemMessage.text
    };
  }
  const unwrap = (val, depth=0) => {
    if (depth > 5) return val;
    if (val == null) return '';
    if (typeof val === 'string') {
      const txt = val.trim();
      if (/^[\[{]/.test(txt)) {
        try { return unwrap(JSON.parse(txt), depth + 1); } catch {}
      }
      return val;
    }
    if (typeof val === 'object') {
      type = String(val.type || val.chatMessageType || val.messageType || val.contentType || type || 'text').toLowerCase();
      const candidate = val.content ?? val.message ?? val.text ?? val.body ?? val.msg ?? val.imageUrl ?? val.url ?? val.data?.content ?? val.data?.message ?? val.data?.imageUrl;
      if (candidate !== undefined) return unwrap(candidate, depth + 1);
      const readable = formatBinanceSystemMessage(val, type, context);
      if (readable) return readable.text || readable.title;
      return humanizeChatEventType(type || 'System update');
    }
    return String(val);
  };
  const text = unwrap(raw);
  return { type: type || 'text', text: String(text || ''), isSystem: false };
}
function orderCounterpartyNickname(order = {}) {
  return String(order.counterpartyName || order.counterpartyStats?.nickname || order.counterpartyNickname || order.nickName || order.userNo || '').trim();
}
function orderCounterpartyRealName(order = {}) {
  const direct = String(order.counterpartyRealName || order.counterPartyRealName || '').trim();
  if (direct) return direct;
  // In a BUY order the selected payment receiver is the seller/counterparty.
  // In a SELL order the payment account belongs to our own side and must not be used as the buyer's name.
  if (String(order.type || '').toUpperCase() === 'BUY') {
    const paymentName = String(order.customerPaymentDetails?.payee || order.customerPaymentDetails?.realName || order.customerPaymentDetails?.fullName || order.customerPaymentDetails?.accountName || '').trim();
    if (paymentName) return paymentName;
  }
  return orderCounterpartyNickname(order) || 'Counterparty';
}

function chatMessageHtml(c, context={}) {
  const normalized = normalizeChatDisplayMessage(chatRecordRaw(c), c.messageType || '', context);
  const msg = normalized.text;
  const type = normalized.type;
  if (normalized.isSystem || /^(system|notice|event)$/i.test(String(c.senderRole || ''))) {
    const title = normalized.systemTitle || chatLocaleText('Binance system update', 'Binance সিস্টেম আপডেট');
    const text = normalized.systemText || msg || '';
    const repeated = title.trim().toLowerCase() === text.trim().toLowerCase();
    return `<div class="chat-row system" data-system-type="${escapeAttr(normalized.systemType || type || 'system')}">
      <div class="chat-system-message">
        <span class="chat-system-label">${escapeHtml(chatLocaleText('Binance system', 'Binance সিস্টেম'))}</span>
        <strong>${escapeHtml(title)}</strong>
        ${!repeated && text ? `<span class="chat-system-text">${escapeHtml(text).replace(/\n/g, '<br>')}</span>` : ''}
        <time>${fmt(c.createdAt)}</time>
      </div>
    </div>`;
  }
  const senderUserId = Number(c.senderUserId || 0);
  const senderName = String(c.senderName || '').trim();
  const senderRole = String(c.senderRole || '').toLowerCase();
  const isCurrentUser = senderUserId > 0 && senderUserId === Number(state.user?.id || 0);
  const isMine = c.source === 'binance-outbound' || senderRole === 'me' || isCurrentUser;
  const crmRoles = new Set(['admin', 'manager', 'agent', 'auditor', 'employee', 'operator']);
  const genericExternalName = /^(me|you|binance|binance merchant account|unknown operator|system operator)$/i.test(senderName);
  let actorLabel = '';
  if (c.source === 'binance') {
    const savedCounterpartyName = /^(counterparty|unknown|binance)$/i.test(senderName) ? '' : senderName;
    actorLabel = orderCounterpartyRealName(state.currentOrder || {}) || savedCounterpartyName || 'Counterparty';
  } else if (c.source === 'binance-outbound') {
    const sentFromCrm = senderUserId > 0 || (crmRoles.has(senderRole) && senderName && !genericExternalName);
    actorLabel = sentFromCrm ? (senderName || 'System') : 'Binance';
  } else {
    actorLabel = senderName || 'System';
  }
  const imageSrc = safeMediaUrl(msg, 'image');
  const videoSrc = safeMediaUrl(msg, 'video');
  const isImage = Boolean(imageSrc && (type === 'image' || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(msg) || /^data:image\//i.test(msg)));
  const isVideo = Boolean(videoSrc && (type === 'video' || /\.(mp4|webm)(\?|$)/i.test(msg) || /^data:video\//i.test(msg)));
  const body = isImage
    ? `<button class="chat-image-button" type="button" data-chat-image-src="${escapeAttr(imageSrc)}" aria-label="Open image full screen"><img class="chat-image" src="${escapeAttr(imageSrc)}" alt="Chat image" loading="lazy"></button>`
    : isVideo
      ? `<video class="chat-video" src="${escapeAttr(videoSrc)}" controls playsinline preload="metadata"></video>`
      : escapeHtml(msg).replace(/\n/g, '<br>');
  return `<div class="chat-row ${isMine ? 'me' : 'them'}">
    <div class="chat-bubble">
      <div class="chat-meta"><span>${escapeHtml(actorLabel)}</span></div>
      <div class="chat-body">${body || '<span class="muted">[empty]</span>'}</div>
      <div class="chat-time">${fmt(c.createdAt)}</div>
    </div>
  </div>`;
}
function openChatImageViewer(src='') {
  const safeSrc = safeMediaUrl(src, 'image');
  if (!safeSrc) return;
  closeChatImageViewer();
  const viewer = document.createElement('dialog');
  viewer.className = 'chat-image-viewer';
  viewer.setAttribute('aria-label', chatLocaleText('Full screen chat image', 'ফুল স্ক্রিন চ্যাট ইমেজ'));
  viewer.innerHTML = `<div class="chat-image-viewer-stage">
    <button class="chat-image-viewer-close" type="button" aria-label="Close image">×</button>
    <img src="${escapeAttr(safeSrc)}" alt="Full screen chat image">
  </div>`;
  viewer.addEventListener('click', event => {
    if (event.target === viewer || event.target.classList.contains('chat-image-viewer-stage') || event.target.closest('.chat-image-viewer-close')) {
      closeChatImageViewer();
    }
  });
  viewer.addEventListener('cancel', event => {
    event.preventDefault();
    closeChatImageViewer();
  });
  viewer.addEventListener('close', () => {
    viewer.remove();
    document.documentElement.classList.remove('chat-image-viewer-open');
    document.body.classList.remove('chat-image-viewer-open');
  }, { once: true });
  document.body.appendChild(viewer);
  document.documentElement.classList.add('chat-image-viewer-open');
  document.body.classList.add('chat-image-viewer-open');
  if (typeof viewer.showModal === 'function') {
    viewer.showModal();
  } else {
    viewer.setAttribute('open', '');
    viewer.classList.add('is-fallback');
  }
  viewer.querySelector('.chat-image-viewer-close')?.focus({ preventScroll: true });
  state.chatImageEscapeHandler = event => { if (event.key === 'Escape') closeChatImageViewer(); };
  document.addEventListener('keydown', state.chatImageEscapeHandler);
}
function closeChatImageViewer() {
  document.querySelectorAll('.chat-image-viewer').forEach(node => {
    if (typeof node.close === 'function' && node.open) {
      try { node.close(); } catch { node.remove(); }
    } else {
      node.remove();
    }
  });
  document.documentElement.classList.remove('chat-image-viewer-open');
  document.body.classList.remove('chat-image-viewer-open');
  if (state.chatImageEscapeHandler) document.removeEventListener('keydown', state.chatImageEscapeHandler);
  state.chatImageEscapeHandler = null;
}
function bindChatImagePreviews(root=document) {
  root.querySelectorAll?.('[data-chat-image-src]').forEach(button => {
    if (button.dataset.previewBound === '1') return;
    button.dataset.previewBound = '1';
    button.addEventListener('click', () => openChatImageViewer(button.dataset.chatImageSrc || ''));
  });
}
function updateChatBox(chats=[], source='binance') {
  if (source === 'binance') {
    mergeCurrentOrderChatItems(chats, { forceScroll:false });
    return;
  }
  const box = $('#chatBox');
  if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
  const html = renderChatList(chats, source);
  if (box.dataset.lastHtml !== html) {
    box.innerHTML = html;
    box.dataset.lastHtml = html;
    bindChatImagePreviews(box);
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }
}
function updateInternalNoteBox(chats=[]) {
  const box = $('#internalNoteBox');
  if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
  const html = renderChatList(chats, 'internal');
  if (box.dataset.lastHtml !== html) {
    box.innerHTML = html;
    box.dataset.lastHtml = html;
    bindChatImagePreviews(box);
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }
}
function setChatSyncStatus(text='Live', cls='live') {
  const isProblem = cls === 'warn' || cls === 'danger';
  const label = isProblem ? (text || 'Live retrying') : 'Live';
  ['#chatSyncStatus', '#chatHeaderSyncStatus'].forEach(selector => {
    const el = $(selector);
    if (!el) return;
    el.textContent = label;
    el.className = `sync-status ${isProblem ? cls : 'live'}`.trim();
  });
}
function isRealBinanceOrder(o) {
  return !!(o && o.orderSource === 'binance' && (o.externalOrderNo || o.orderNo));
}
function normalizedChatList(chats=[], source=null) {
  const filtered = source === 'binance'
    ? chats.filter(c => c.source === 'binance' || c.source === 'binance-outbound')
    : (source ? chats.filter(c => c.source === source || (source === 'internal' && !c.source)) : chats);
  const seen = new Set();
  return filtered.filter(c => {
    const normalized = normalizeChatDisplayMessage(chatRecordRaw(c), c.messageType || '', { order: state.currentOrder || {} });
    const isBinance = c.source === 'binance' || c.source === 'binance-outbound';
    const side = c.source === 'binance-outbound' || c.senderRole === 'me' ? 'me' : 'them';
    const bucket = Math.floor((Date.parse(c.createdAt || c.time || '') || 0) / (3 * 60 * 1000));
    const binId = c.binanceMessageId || c.messageId || c.msgId || c.uuid || '';
    const key = binId
      ? `bin:${binId}`
      : (c.id ? `local:${c.id}` : `${isBinance ? 'binance' : c.source || ''}|${side}|${normalized.type || 'text'}|${normalized.text}|${bucket}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a,b) => {
    const time = (Date.parse(a.createdAt || a.time || '') || 0) - (Date.parse(b.createdAt || b.time || '') || 0);
    return time || Number(a.id || 0) - Number(b.id || 0);
  });
}

function renderChatList(chats=[], source=null) {
  const list = normalizedChatList(chats, source);
  if (!list.length) return '<div class="empty-state small">No messages yet.</div>';
  const verificationCompleted = list.some(chatVerificationCompleted);
  const chatContext = { order: state.currentOrder || {}, verificationCompleted };
  return list.map(item => chatMessageHtml(item, chatContext)).join('');
}

function chatStableKey(chat={}) {
  const externalId = chat.binanceMessageId || chat.messageId || chat.msgId || chat.uuid || '';
  if (externalId) return `bin:${externalId}`;
  if (chat.id) return `local:${chat.id}`;
  const normalized = normalizeChatDisplayMessage(chatRecordRaw(chat), chat.messageType || '', { order: state.currentOrder || {} });
  return `${chat.source || ''}|${chat.senderRole || ''}|${chat.createdAt || chat.time || ''}|${normalized.type || 'text'}|${normalized.text}`;
}

function initializeCurrentOrderChatState(chats=[]) {
  state.currentOrderChatItems = normalizedChatList(chats, 'binance');
  state.currentOrderChatLastId = state.currentOrderChatItems.reduce((max, chat) => Math.max(max, Number(chat.id || 0)), 0);
  state.currentOrderChatNewCount = 0;
  clearTimeout(state.currentOrderChatRefreshTimer);
  state.currentOrderChatRefreshTimer = null;
}

function chatBoxNearBottom(box=$('#chatBox')) {
  return Boolean(box && box.scrollHeight - box.scrollTop - box.clientHeight < 100);
}

function updateChatNewMessagesButton() {
  const button = $('#chatNewMessagesBtn');
  if (!button) return;
  const count = Math.max(0, Number(state.currentOrderChatNewCount || 0));
  button.hidden = count <= 0;
  if (count > 0) button.textContent = state.lang === 'bn' ? `${count}টি নতুন মেসেজ ↓` : `${count} new message${count === 1 ? '' : 's'} ↓`;
}

function bindChatScrollState() {
  const box = $('#chatBox');
  const button = $('#chatNewMessagesBtn');
  if (box && box.dataset.smoothScrollBound !== '1') {
    box.dataset.smoothScrollBound = '1';
    box.addEventListener('scroll', () => {
      state.currentOrderChatLastUserScrollAt = Date.now();
      if (!chatBoxNearBottom(box)) return;
      state.currentOrderChatNewCount = 0;
      updateChatNewMessagesButton();
    }, { passive:true });
  }
  if (button && button.dataset.bound !== '1') {
    button.dataset.bound = '1';
    button.onclick = () => {
      if (box) box.scrollTo({ top:box.scrollHeight, behavior:'smooth' });
      state.currentOrderChatNewCount = 0;
      updateChatNewMessagesButton();
    };
  }
}

function mergeCurrentOrderChatItems(chats=[], options={}) {
  const incoming = normalizedChatList(Array.isArray(chats) ? chats : [], 'binance');
  if (!incoming.length) return 0;
  const existing = new Map((state.currentOrderChatItems || []).map(chat => [chatStableKey(chat), chat]));
  const added = [];
  for (const chat of incoming) {
    const key = chatStableKey(chat);
    if (existing.has(key)) continue;
    existing.set(key, chat);
    added.push(chat);
  }
  if (!added.length) {
    state.currentOrderChatLastId = Math.max(state.currentOrderChatLastId || 0, ...incoming.map(chat => Number(chat.id || 0)));
    return 0;
  }
  state.currentOrderChatItems = [...existing.values()].sort((a,b) => {
    const time = (Date.parse(a.createdAt || a.time || '') || 0) - (Date.parse(b.createdAt || b.time || '') || 0);
    return time || Number(a.id || 0) - Number(b.id || 0);
  });
  state.currentOrderChatLastId = state.currentOrderChatItems.reduce((max, chat) => Math.max(max, Number(chat.id || 0)), state.currentOrderChatLastId || 0);
  if (state.currentOrder) {
    const internal = (state.currentOrder.chats || []).filter(chat => chat.source !== 'binance' && chat.source !== 'binance-outbound');
    state.currentOrder.chats = [...internal, ...state.currentOrderChatItems];
  }
  const box = $('#chatBox');
  if (!box) return added.length;
  const nearBottom = chatBoxNearBottom(box);
  const userIsActivelyScrolling = Date.now() - Number(state.currentOrderChatLastUserScrollAt || 0) < 1400;
  box.querySelector('.empty-state')?.remove();
  const verificationCompleted = state.currentOrderChatItems.some(chatVerificationCompleted);
  const context = { order: state.currentOrder || {}, verificationCompleted };
  for (const chat of added) box.insertAdjacentHTML('beforeend', chatMessageHtml(chat, context));
  bindChatImagePreviews(box);
  bindChatScrollState();
  if (options.forceScroll || options.outgoing || (nearBottom && !userIsActivelyScrolling)) {
    // Apply the stick-to-bottom decision synchronously. A delayed RAF write
    // can fire after the user has started scrolling upward and pull the chat
    // straight back to the bottom.
    box.scrollTop = box.scrollHeight;
    state.currentOrderChatNewCount = 0;
  } else {
    state.currentOrderChatNewCount = Number(state.currentOrderChatNewCount || 0) + added.length;
  }
  updateChatNewMessagesButton();
  return added.length;
}

async function refreshCurrentOrderChatDelta(options={}) {
  const orderId = Number(options.orderId || state.currentOrderId || 0);
  if (!orderId || state.page !== 'orders' || state.currentOrderChatRefreshBusy) return 0;
  state.currentOrderChatRefreshBusy = true;
  try {
    let afterId = Math.max(0, Number(state.currentOrderChatLastId || 0));
    let added = 0;
    for (let page = 0; page < 3; page += 1) {
      const data = await api(`/api/orders/${orderId}/chat-delta?afterId=${afterId}&limit=100`, { silent:true, noAutoReload:true });
      if (Number(state.currentOrderId || 0) !== orderId) return added;
      added += mergeCurrentOrderChatItems(data.items || [], { outgoing:options.outgoing === true, forceScroll:options.forceScroll === true });
      afterId = Math.max(afterId, Number(data.latestId || 0), Number(state.currentOrderChatLastId || 0));
      state.currentOrderChatLastId = afterId;
      if (!data.hasMore) break;
    }
    return added;
  } finally {
    state.currentOrderChatRefreshBusy = false;
  }
}

function scheduleCurrentOrderChatDelta(delay=80, options={}) {
  if (!state.currentOrderId || state.page !== 'orders') return;
  clearTimeout(state.currentOrderChatRefreshTimer);
  state.currentOrderChatRefreshTimer = setTimeout(() => {
    refreshCurrentOrderChatDelta(options).catch(()=>{});
  }, Math.max(0, Number(delay || 0)));
}

function stopChatAutoSync() {
  if (state.chatSyncTimer) clearTimeout(state.chatSyncTimer);
  if (state.currentOrderChatRefreshTimer) clearTimeout(state.currentOrderChatRefreshTimer);
  state.chatSyncTimer = null;
  state.currentOrderChatRefreshTimer = null;
  state.currentOrderChatRefreshBusy = false;
  state.chatSyncBusy = false;
  state.chatSyncFailCount = 0;
}
async function autoSyncBinanceChat(order, updateOnly=true) {
  if (!isRealBinanceOrder(order) || !hasPerm('binance.chat') || state.chatSyncBusy) return false;
  state.chatSyncBusy = true;
  setChatSyncStatus('Live', 'live');
  try {
    const updated = await api(`/api/orders/${order.id}/binance-chat-sync`, { method:'POST', silent:true, body: JSON.stringify({ binanceOrderNumber: order.externalOrderNo || order.orderNo, page: 1, rows: 50, sort: 'desc' }) });
    if (state.currentOrderId !== order.id) return false;
    if (updated && typeof updated === 'object') state.currentOrder = { ...(state.currentOrder || {}), ...updated };
    mergeCurrentOrderChatItems(updated.chats || [], { forceScroll:false });
    state.chatSyncFailCount = 0;
    const imported = Number(updated.imported || 0);
    setChatSyncStatus('Live', 'live');
    if (!updateOnly && imported) notify(`${imported} Binance chat message synced.`, 'ok');
    return true;
  } catch (err) {
    state.chatSyncFailCount += 1;
    const msg = String(err.message || 'Live chat sync paused').replace(/Server returned HTML instead of the expected response.*$/i, 'Hosting/browser challenge returned HTML; retrying quietly.');
    setChatSyncStatus(state.chatSyncFailCount > 2 ? 'Live sync paused' : 'Live retrying', 'warn');
    if (!updateOnly) notify(msg, 'warn');
    return false;
  } finally { state.chatSyncBusy = false; }
}
function scheduleNextChatSync(order) {
  if (state.currentOrderId !== order.id || !isRealBinanceOrder(order) || !hasPerm('binance.chat')) return;
  const delay = state.chatSyncFailCount ? Math.min(30000, 5000 * Math.pow(2, Math.min(3, state.chatSyncFailCount - 1))) : 1500;
  state.chatSyncTimer = setTimeout(async () => {
    await autoSyncBinanceChat(order, true);
    scheduleNextChatSync(order);
  }, delay);
}
function startChatAutoSync(order) {
  stopChatAutoSync();
  if (!isRealBinanceOrder(order) || !hasPerm('binance.chat')) return;
  setTimeout(() => {
    const box = $('#chatBox');
    if (!box) return;
    if (Number.isFinite(Number(state.currentOrderChatPreserveScrollTop))) {
      box.scrollTop = Math.max(0, Number(state.currentOrderChatPreserveScrollTop));
      state.currentOrderChatPreserveScrollTop = null;
    } else {
      box.scrollTop = box.scrollHeight;
    }
  }, 50);
  autoSyncBinanceChat(order, true).finally(() => scheduleNextChatSync(order));
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

async function compressImageFileForChat(file) {
  const originalUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not load image for compression.'));
      image.src = originalUrl;
    });
    const maxDim = 1440;
    const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * ratio));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * ratio));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const preferred = /png/i.test(file.type || '') && file.size < 320 * 1024 ? 'image/png' : 'image/jpeg';
    let blob = await canvasToBlob(canvas, preferred, 0.80);
    if (!blob) throw new Error('Image compression failed.');
    if (blob.size > 1500 * 1024 && preferred !== 'image/jpeg') blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
    if (blob && blob.size > 1500 * 1024) blob = await canvasToBlob(canvas, 'image/jpeg', 0.72);
    return blob || file;
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}

async function readImageFileAsDataUrl(file) {
  if (!file) return null;
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type || '')) throw new Error('Only PNG, JPG or WebP image is allowed.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Image size must be 10MB or less.');
  let finalFile = file;
  if (file.size > 320 * 1024) {
    try {
      const compressed = await compressImageFileForChat(file);
      if (compressed && compressed.size && compressed.size < file.size) finalFile = new File([compressed], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: compressed.type || 'image/jpeg' });
    } catch {
      finalFile = file;
    }
  }
  if (finalFile.size > 2 * 1024 * 1024) throw new Error('Image is still too large after compression. Use a smaller image.');
  return fileToDataUrl(finalFile);
}

async function readChatMediaFileAsDataUrl(file) {
  if (!file) return null;
  const type = String(file.type || '').toLowerCase();
  if (/^image\/(png|jpe?g|webp)$/.test(type)) return readImageFileAsDataUrl(file);
  if (/^video\/(mp4|webm|quicktime)$/.test(type)) {
    if (file.size > 7 * 1024 * 1024) throw new Error('Video must be 7MB or less.');
    return fileToDataUrl(file);
  }
  throw new Error('Only PNG, JPG, WebP, MP4, WebM or MOV media is allowed.');
}
function orderPaymentDetailsSignature(order) {
  const detail = (order && order.customerPaymentDetails) || {};
  const snapshot = (order && order.payMethodSnapshot) || {};
  return JSON.stringify({
    id: order?.binancePayId || detail.payId || snapshot.payId || null,
    method: detail.methodName || snapshot.methodName || snapshot.name || snapshot.identifier || '',
    account: detail.payAccount || snapshot.payAccount || '',
    payee: detail.payee || snapshot.payee || '',
    bank: detail.payBank || snapshot.payBank || '',
    branch: detail.paySubBank || snapshot.paySubBank || '',
    remark: detail.remark || snapshot.remark || '',
    qr: detail.qrCodePath || snapshot.qrCodePath || ''
  });
}

function counterpartyStatsSignature(order) {
  const c = (order && order.counterpartyStats) || {};
  const comments = Array.isArray(c.feedbackComments) ? c.feedbackComments : [];
  return JSON.stringify({
    t: c.thirtyDayTradeCount ?? null,
    cr: c.thirtyDayCompletionRate ?? null,
    p: c.positiveFeedback ?? null,
    n: c.negativeFeedback ?? null,
    pr: c.positiveFeedbackRate ?? null,
    nr: c.negativeFeedbackRate ?? null,
    ap: c.avgPayTimeMinutes30d ?? null,
    ar: c.avgReleaseTimeMinutes30d ?? null,
    all: c.allTrades ?? null,
    buy: c.buyTrades ?? null,
    sell: c.sellTrades ?? null,
    following: c.followingCount ?? null,
    followers: c.followersCount ?? null,
    ads: c.adsCount ?? null,
    firstTrade: c.firstTradeDays ?? null,
    counterparties: c.tradingCounterparties ?? null,
    fc: comments.length,
    err: order && order.lastCounterpartyStatsError ? order.lastCounterpartyStatsError : ''
  });
}

function canLiveSyncCurrentOrder() { return hasPerm('binance.sync') || hasPerm('orders.final_action'); }

async function backgroundAutoSyncOrder(order) {
  if (!isRealBinanceOrder(order) || !canLiveSyncCurrentOrder() || state.orderSyncBusy) return;
  state.orderSyncBusy = true;
  const statusEl = $('#orderSyncStatus');
  const beforeStatus = binanceDisplayStatus(order);
  const beforeMethod = displayPaymentMethodName(order);
  const beforeStats = counterpartyStatsSignature(order);
  const beforePayment = orderPaymentDetailsSignature(order);
  const beforeAdditionalKyc = JSON.stringify(orderAdditionalVerificationState(order));
  try {
    const updated = await api(`/api/orders/${order.id}/binance-auto-sync`, { method:'POST', silent:true, body: JSON.stringify({ binanceOrderNumber: order.externalOrderNo || order.orderNo }) });
    if (state.currentOrderId !== order.id) return;
    if (statusEl) statusEl.textContent = '';
    if (updated?.chats) updateChatBox(updated.chats, 'binance');
    const afterStatus = binanceDisplayStatus(updated);
    const afterMethod = displayPaymentMethodName(updated);
    const afterStats = counterpartyStatsSignature(updated);
    const afterPayment = orderPaymentDetailsSignature(updated);
    const afterAdditionalKyc = JSON.stringify(orderAdditionalVerificationState(updated));
    state.currentOrder = updated;
    if (afterStatus !== beforeStatus || afterMethod !== beforeMethod || isFulfilledOrder(updated) !== isFulfilledOrder(order) || afterStats !== beforeStats || afterPayment !== beforePayment || afterAdditionalKyc !== beforeAdditionalKyc) {
      if (afterStatus !== beforeStatus || afterMethod !== beforeMethod || isFulfilledOrder(updated) !== isFulfilledOrder(order)) notify(`Order ${updated.orderNo || order.orderNo} status updated: ${afterStatus}`, afterStatus === 'CANCELLED' ? 'danger' : 'ok');
      await refreshCurrentOrderStateNonDestructive();
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = '';
  } finally { state.orderSyncBusy = false; }
}

function stopOrderDetailAutoSync() {
  if (state.orderDetailSyncTimer) clearTimeout(state.orderDetailSyncTimer);
  if (state.currentOrderReloadTimer) clearTimeout(state.currentOrderReloadTimer);
  state.orderDetailSyncTimer = null;
  state.currentOrderReloadTimer = null;
  state.orderSyncBusy = false;
}

function scheduleNextOrderDetailSync(order) {
  if (!isRealBinanceOrder(order) || !canLiveSyncCurrentOrder() || state.currentOrderId !== order.id) return;
  const current = state.currentOrder || order;
  const delay = isFulfilledOrder(current) ? 12000 : 3500;
  state.orderDetailSyncTimer = setTimeout(async () => {
    await backgroundAutoSyncOrder(state.currentOrder || order);
    scheduleNextOrderDetailSync(state.currentOrder || order);
  }, delay);
}

function startOrderDetailAutoSync(order) {
  stopOrderDetailAutoSync();
  if (!isRealBinanceOrder(order) || !canLiveSyncCurrentOrder()) return;
  backgroundAutoSyncOrder(order).finally(() => scheduleNextOrderDetailSync(state.currentOrder || order));
}
const I18N_BN = {
  'P2P Market':'P2P মার্কেট','Buy':'কিনুন','Sell':'বিক্রি করুন','All payment methods':'সব পেমেন্ট মেথড','All advertisers':'সব বিজ্ঞাপনদাতা','Merchant only':'শুধু মার্চেন্ট','User only':'শুধু ইউজার','Apply Filters':'ফিল্টার প্রয়োগ','Previous':'আগের পেজ','Next':'পরের পেজ','No advertisements found':'কোনো বিজ্ঞাপন পাওয়া যায়নি','Could not load Binance advertisements':'Binance বিজ্ঞাপন লোড করা যায়নি','Try Again':'আবার চেষ্টা করুন','Limit':'লিমিট','Available':'অ্যাভেইলেবল','Trades':'ট্রেড','Publisher':'প্রকাশক','Rows':'সারি',
  'Secure operations access':'সুরক্ষিত অপারেশন অ্যাক্সেস','Account':'অ্যাকাউন্ট','Verification':'ভেরিফিকেশন','Sign in to continue':'চালিয়ে যেতে সাইন ইন করুন','Enter your username or Gmail and password first.':'প্রথমে ইউজারনেম বা জিমেইল এবং পাসওয়ার্ড দিন।','User or Gmail':'ইউজার অথবা জিমেইল','Enter your password':'পাসওয়ার্ড লিখুন','Change':'পরিবর্তন','Account password verified':'অ্যাকাউন্ট পাসওয়ার্ড যাচাই হয়েছে','Complete the email and secret verification below.':'নিচে ইমেইল ও সিক্রেট ভেরিফিকেশন সম্পন্ন করুন।','Email verification code':'ইমেইল ভেরিফিকেশন কোড','Enter the 6-digit code sent to your registered email.':'রেজিস্টার্ড ইমেইলে পাঠানো ৬ ডিজিট কোড লিখুন।','Security PIN / Secret':'সিকিউরিটি পিন / সিক্রেট','Enter your private 6-digit secret':'আপনার ব্যক্তিগত ৬ ডিজিট সিক্রেট লিখুন','A new code can be requested shortly.':'কিছুক্ষণ পর নতুন কোড চাইতে পারবেন।','Resend OTP':'OTP আবার পাঠান','Continue securely':'নিরাপদে চালিয়ে যান','Verify & Sign In':'ভেরিফাই করে সাইন ইন করুন','Protected access':'সুরক্ষিত অ্যাক্সেস','Encrypted secure session':'এনক্রিপ্টেড সিকিউর সেশন','Dashboard':'ড্যাশবোর্ড','Orders':'অর্ডার','P2P Message':'P2P মেসেজ','Advertisements':'এডভার্টাইজমেন্ট','Approvals':'অ্যাপ্রুভাল','Payment Accounts':'পেমেন্ট অ্যাকাউন্ট','Account Statement':'অ্যাকাউন্ট স্টেটমেন্ট','Users':'ইউজার','User Roles':'ইউজার রোল','Routing':'রাউটিং','Reports':'রিপোর্ট','Business Accounting':'ব্যবসার হিসাব','Accounting Overview':'হিসাব সারসংক্ষেপ','Expense':'খরচ','Business Income':'ব্যবসার আয়','Capital':'মূলধন','API Credentials':'এপিআই ক্রেডেনশিয়াল','Health Check':'হেলথ চেক','Settings':'সেটিংস','Extension Bridge':'এক্সটেনশন ব্রিজ','Security':'সিকিউরিটি','Panel SMS / Alerts':'প্যানেল এসএমএস / অ্যালার্ট','Audit Logs':'অডিট লগ','Logout':'লগআউট','Login':'লগইন','Username':'ইউজারনেম','Password':'পাসওয়ার্ড','Email OTP':'ইমেইল ওটিপি','Secret 6 Digit Code':'সিক্রেট ৬ ডিজিট কোড',
  'Live':'লাইভ','Synced':'সিঙ্কড','Reconnecting':'রিকানেক্টিং','Offline':'অফলাইন','Notifications':'নোটিফিকেশন','New message':'নতুন মেসেজ','Mark all read':'সব পড়া হয়েছে','View all alerts':'সব অ্যালার্ট দেখুন','No new notifications':'নতুন নোটিফিকেশন নেই','Ongoing':'চলমান','Fulfilled':'সম্পন্ন','Loading...':'লোড হচ্ছে...','Loading order...':'অর্ডার লোড হচ্ছে...','Back':'ব্যাক','Refresh':'রিফ্রেশ','Open':'ওপেন','Save':'সেভ','Cancel':'বাতিল','Completed':'সম্পন্ন','Cancelled':'বাতিল হয়েছে','Send':'পাঠান','Action':'অ্যাকশন','Actions':'অ্যাকশন','Status':'স্ট্যাটাস','Note':'নোট','Time':'সময়','User':'ইউজার','Role':'রোল','Enabled':'এনাবলড','Method':'মেথড','Amount':'অ্যামাউন্ট','Balance':'ব্যালেন্স','Current Balance':'বর্তমান ব্যালেন্স','Total Balance':'মোট ব্যালেন্স','Cash Balance':'ক্যাশ ব্যালেন্স','Total Capital':'মোট মূলধন','Today Net Profit':'আজকের নিট লাভ','Gross Profit':'মোট লাভ','Expenses':'খরচ','Net Profit':'নিট লাভ','Crypto Value':'ক্রিপ্টো মূল্য','Capital Distribution':'মূলধন বণ্টন','Trading Result':'লেনদেনের ফলাফল','Average Cost':'গড় ক্রয়মূল্য','Book Inventory':'হিসাবের স্টক','Unrealized P/L':'অবাস্তবায়িত লাভ/ক্ষতি','Capital Change':'মূলধন পরিবর্তন','Daily Profit Trend':'দৈনিক লাভের ধারা','Capital Movement':'মূলধন চলাচল','Capital Added':'মূলধন যোগ','Capital Withdrawn':'মূলধন উত্তোলন','Other Income':'অন্যান্য আয়','Agent Earnings':'এজেন্ট আয়','My Earnings':'আমার আয়','Income & Expense':'আয় ও খরচ','Daily Closing':'দৈনিক হিসাব বন্ধ','Add Entry':'এন্ট্রি যোগ','Accounting Settings':'হিসাব সেটিংস','Sync Binance':'Binance সিঙ্ক','Close Day':'দিনের হিসাব বন্ধ','Business Date':'ব্যবসার তারিখ','Category':'ক্যাটাগরি','Payment Account':'পেমেন্ট অ্যাকাউন্ট','Agent (Optional)':'এজেন্ট (ঐচ্ছিক)','Company':'কোম্পানি','Save Entry':'এন্ট্রি সেভ','Current Valuation Rate':'বর্তমান মূল্যায়ন রেট','Opening Crypto Quantity':'প্রারম্ভিক ক্রিপ্টো পরিমাণ','Opening Crypto Cost Rate':'প্রারম্ভিক ক্রিপ্টো ক্রয়রেট','Timezone Offset':'টাইমজোন অফসেট','Automatic Daily Close':'স্বয়ংক্রিয় দৈনিক হিসাব বন্ধ','Save Settings':'সেটিংস সেভ','Close Business Day':'ব্যবসার দিনের হিসাব বন্ধ','Accounting Start Date':'হিসাব শুরুর তারিখ','Replacement Profit':'রিপ্লেসমেন্ট লাভ','Effective BUY Rate':'কার্যকর BUY রেট','Daily Replacement Calculation':'দৈনিক রিপ্লেসমেন্ট হিসাব','Actual SELL Receipts':'প্রকৃত SELL প্রাপ্তি','Nominal SELL Amount':'মূল SELL অ্যামাউন্ট','Extra Settlement Received':'অতিরিক্ত সেটেলমেন্ট প্রাপ্তি','Crypto Deducted':'কাটা ক্রিপ্টো','Replacement Gross':'রিপ্লেসমেন্ট মোট','Replacement Fee':'রিপ্লেসমেন্ট ফি','Replacement Net':'রিপ্লেসমেন্ট নিট','Replacement Surplus':'রিপ্লেসমেন্ট উদ্বৃত্ত','Universal Profit Value':'ইউনিভার্সাল লাভের মূল্য','Daily Replacement Breakdown':'দৈনিক রিপ্লেসমেন্ট বিস্তারিত','Universal Profit Rate (BDT)':'ইউনিভার্সাল লাভ রেট (BDT)','Fallback P2P BUY Rate (BDT)':'ফলব্যাক P2P BUY রেট (BDT)','Replacement BUY Fee (%)':'রিপ্লেসমেন্ট BUY ফি (%)','BUY Spend':'BUY খরচ','SELL Receipts':'SELL প্রাপ্তি','Profit USDT':'লাভ USDT','Profit BDT':'লাভ BDT','BUY Capacity':'BUY ক্যাপাসিটি','SELL Capacity':'SELL ক্যাপাসিটি','Pending':'পেন্ডিং','Today':'আজ','Alerts':'অ্যালার্ট','Approval Queue':'অ্যাপ্রুভাল কিউ','No alerts':'কোনো অ্যালার্ট নেই','No data':'কোনো ডেটা নেই',
  'Create Advertisement':'এডভার্টাইজমেন্ট তৈরি','Sync Binance Ads':'Binance এড সিঙ্ক','Save Changes':'পরিবর্তন সেভ','Create Binance Order':'Binance অর্ডার তৈরি','Create Offline Order':'অফলাইন অর্ডার তৈরি','Create User Role':'ইউজার রোল তৈরি','Back to Users':'ইউজারে ফিরে যান','Add Account':'অ্যাকাউন্ট যোগ করুন','Add Route':'রুট যোগ করুন','Add Payment Split':'পেমেন্ট স্প্লিট যোগ করুন','Request Co-User':'কো-ইউজার রিকোয়েস্ট','Assign / Add User':'ইউজার অ্যাসাইন / যোগ','Mark as Paid':'পেইড মার্ক করুন','Verified':'ভেরিফাইড','Verifying...':'ভেরিফাই করা হচ্ছে...','Additional Verification Pending':'অতিরিক্ত ভেরিফিকেশন পেন্ডিং','Release Coin':'কয়েন রিলিজ','Complete Offline Order':'অফলাইন অর্ডার কমপ্লিট','Payment Summary':'পেমেন্ট সামারি','Payment Split':'পেমেন্ট স্প্লিট','Payment Splits':'পেমেন্ট স্প্লিট','Payment Split History':'পেমেন্ট স্প্লিট হিস্ট্রি','Assigned Users':'অ্যাসাইনড ইউজার','Chat / Internal Notes':'চ্যাট / ইন্টারনাল নোট','Internal Notes':'ইন্টারনাল নোট','Private notes are not sent to Binance':'প্রাইভেট নোট Binance-এ পাঠানো হয় না','Write a message':'মেসেজ লিখুন','Write internal note':'ইন্টারনাল নোট লিখুন','Waiting for Buyer Paid':'ক্রেতার পেইড মার্কের অপেক্ষা','P2P Info':'P2P তথ্য','Recent Statement Entries':'সাম্প্রতিক স্টেটমেন্ট','Wallet movement':'ওয়ালেট মুভমেন্ট','Final action guard':'ফাইনাল অ্যাকশন গার্ড','Order Amount':'অর্ডার অ্যামাউন্ট','Planned':'প্ল্যানড','Actual':'অ্যাকচুয়াল','Remaining':'রিমেইনিং','Selected splits':'সিলেক্টেড স্প্লিট','Updated by users':'ইউজার আপডেটেড','Need split / actual':'স্প্লিট / অ্যাকচুয়াল দরকার','Matched':'ম্যাচড',
  'Order':'অর্ডার','Source':'সোর্স','Type':'টাইপ','Fiat / USDT':'ফিয়াট / USDT','Rate':'রেট','Lead':'লিড','Account Number':'অ্যাকাউন্ট নম্বর','Receive Left':'রিসিভ বাকি','Send Available':'সেন্ড অ্যাভেইলেবল','Usage Today':'আজকের ব্যবহার','Source Type':'সোর্স টাইপ','Direction':'ডিরেকশন','Before → After':'আগে → পরে','Order/Ref':'অর্ডার/রেফ','Permissions':'পারমিশন','Locked':'লকড','Edit Role':'রোল এডিট','Delete':'ডিলিট','Priority':'প্রায়োরিটি','Amount Range':'অ্যামাউন্ট রেঞ্জ','Capacity Guard':'ক্যাপাসিটি গার্ড','Max Active':'ম্যাক্স অ্যাকটিভ','Payment Method Routing':'পেমেন্ট মেথড রাউটিং','Digital Reports':'ডিজিটাল রিপোর্ট','Daily':'ডেইলি','Monthly':'মান্থলি','Yearly':'ইয়ারলি','Lifetime':'লাইফটাইম','Custom':'কাস্টম','Export CSV':'CSV এক্সপোর্ট','Print / Save PDF':'প্রিন্ট / PDF সেভ',
  'View dashboard':'ড্যাশবোর্ড দেখা','View orders':'অর্ডার দেখা','Create Binance/offline orders':'Binance/অফলাইন অর্ডার তৈরি','Order assign / reassign':'অর্ডার অ্যাসাইন / রি-অ্যাসাইন','Payment split add/update':'পেমেন্ট স্প্লিট যোগ/আপডেট','Paid mark / release final action':'পেইড মার্ক / রিলিজ ফাইনাল অ্যাকশন','Quick release before paid mark':'পেইড মার্ক ছাড়াই কুইক রিলিজ','Approval queue and decisions':'অ্যাপ্রুভাল কিউ ও সিদ্ধান্ত','Binance live order sync':'Binance লাইভ অর্ডার সিঙ্ক','Binance P2P chat access':'Binance P2P চ্যাট অ্যাক্সেস','View advertisements':'এডভার্টাইজমেন্ট দেখা','Create, edit and activate advertisements':'এডভার্টাইজমেন্ট তৈরি, এডিট ও অ্যাক্টিভ করা','View payment accounts':'পেমেন্ট অ্যাকাউন্ট দেখা','Use assigned payment accounts':'নির্ধারিত পেমেন্ট অ্যাকাউন্ট ব্যবহার','Payment account add/edit/status':'পেমেন্ট অ্যাকাউন্ট যোগ/এডিট/স্ট্যাটাস','Offline transaction / statement adjustment':'অফলাইন ট্রানজেকশন / স্টেটমেন্ট অ্যাডজাস্টমেন্ট','Payment routing manage':'পেমেন্ট রাউটিং ম্যানেজ','User add/edit/permission manage':'ইউজার যোগ/এডিট/পারমিশন','User role template manage':'ইউজার রোল টেমপ্লেট ম্যানেজ','View reports':'রিপোর্ট দেখা','View audit logs':'অডিট লগ দেখা','Settings manage':'সেটিংস ম্যানেজ','Binance API credentials manage':'Binance API ক্রেডেনশিয়াল ম্যানেজ','Binance live sync':'Binance লাইভ সিঙ্ক','View business capital, profit and own/overall earnings':'ব্যবসার মূলধন, লাভ এবং নিজস্ব/সামগ্রিক আয় দেখা','Add expenses, income and capital movements':'খরচ, আয় ও মূলধন চলাচল যোগ করা','Sync Binance balance and close business day':'Binance ব্যালেন্স সিঙ্ক ও ব্যবসার দিনের হিসাব বন্ধ করা',
  'Action blocked':'কাজ হয়নি','Success':'সফল','Notice':'নোটিশ','Email OTP sent. Check your email and enter the OTP.':'ইমেইল ওটিপি পাঠানো হয়েছে। মেইল চেক করে OTP দিন।','Enter the 6 digit secret code.':'৬ ডিজিট সিক্রেট কোড দিন:','Enter Email OTP and 6 digit secret code.':'ইমেইল ওটিপি এবং ৬ ডিজিট সিক্রেট কোড দিন:','Secure manual operations panel for P2P orders, split payment, account statement and live dashboard.':'P2P অর্ডার, স্প্লিট পেমেন্ট, অ্যাকাউন্ট স্টেটমেন্ট এবং লাইভ ড্যাশবোর্ডের সিকিউর ম্যানুয়াল অপারেশন প্যানেল।'
};

Object.assign(I18N_BN, {
  'Categories':'ক্যাটাগরি',
  'Expense Categories':'খরচের ক্যাটাগরি',
  'New Category':'নতুন ক্যাটাগরি',
  'New category name':'নতুন ক্যাটাগরির নাম',
  'Category Name':'ক্যাটাগরির নাম',
  'Add Category':'ক্যাটাগরি যোগ',
  'Save Category':'ক্যাটাগরি সেভ',
  'Opening Capital':'প্রারম্ভিক মূলধন',
  'Opening Owner Capital (USDT)':'প্রারম্ভিক মালিকের মূলধন (USDT)',
  'Save Opening Capital':'প্রারম্ভিক মূলধন সেভ',
  'Add Expense':'খরচ যোগ',
  'Save Expense':'খরচ সেভ',
  'Account User':'অ্যাকাউন্ট ইউজার',
  'Select user':'ইউজার নির্বাচন করুন',
  'Account Type':'অ্যাকাউন্টের ধরন',
  'Personal':'পার্সোনাল',
  'Agent':'এজেন্ট',
  'Merchant':'মার্চেন্ট',
  'Agent Access':'এজেন্ট অ্যাক্সেস',
  'Account User Access':'অ্যাকাউন্ট ইউজার অ্যাক্সেস',
  'Payment Account Report':'পেমেন্ট অ্যাকাউন্ট রিপোর্ট'
});

Object.assign(I18N_BN, {
  "Secure access": "নিরাপদ প্রবেশ",
  "P2P operations panel.": "P2P অপারেশন প্যানেল।",
  "Account": "অ্যাকাউন্ট",
  "Verify": "যাচাই",
  "Sign in": "লগইন",
  "Change": "পরিবর্তন",
  "User or Gmail": "ইউজার বা জিমেইল",
  "username or name@gmail.com": "ইউজারনেম বা name@gmail.com",
  "Enter your password": "পাসওয়ার্ড লিখুন",
  "Show password": "পাসওয়ার্ড দেখুন",
  "Hide password": "পাসওয়ার্ড লুকান",
  "Password verified": "পাসওয়ার্ড যাচাই হয়েছে",
  "Enter OTP and secret.": "OTP ও সিক্রেট দিন।",
  "Enter the email OTP.": "ইমেইল OTP দিন।",
  "Email verification code": "ইমেইল যাচাই কোড",
  "Security PIN": "সিকিউরিটি পিন",
  "6-digit secret": "৬ ডিজিট সিক্রেট",
  "Show secret code": "সিক্রেট কোড দেখুন",
  "Hide secret code": "সিক্রেট কোড লুকান",
  "OTP can be resent shortly.": "কিছুক্ষণ পর OTP আবার পাঠানো যাবে।",
  "Resend OTP": "OTP আবার পাঠান",
  "Continue securely": "নিরাপদে এগিয়ে যান",
  "Verify & Sign In": "যাচাই করে লগইন",
  "Checking...": "চেক হচ্ছে...",
  "Please wait...": "অপেক্ষা করুন...",
  "Please wait…": "অপেক্ষা করুন…",
  "Language selector": "ভাষা নির্বাচন",
  "Switch between English and Bangla": "ইংরেজি ও বাংলা বদলান",
  "Switch to English": "ইংরেজিতে যান",
  "Primary navigation": "প্রধান নেভিগেশন",
  "Persistent mobile navigation": "মোবাইল নেভিগেশন",
  "Close menu": "মেনু বন্ধ",
  "Open menu": "মেনু খুলুন",
  "Business Accounting": "ব্যবসার হিসাব",
  "My Ads": "আমার বিজ্ঞাপন",
  "Profile": "প্রোফাইল",
  "Users & Permissions": "ইউজার ও অনুমতি",
  "Activity Monitor": "অ্যাক্টিভিটি",
  "System Update": "সিস্টেম আপডেট",
  "Current version": "বর্তমান ভার্সন",
  "Current Version": "বর্তমান ভার্সন",
  "Available version": "নতুন ভার্সন",
  "GitHub": "GitHub",
  "Connected": "সংযুক্ত",
  "Not connected": "সংযুক্ত নয়",
  "Connection required": "সংযোগ প্রয়োজন",
  "Last backup": "সর্বশেষ ব্যাকআপ",
  "Not created": "তৈরি হয়নি",
  "Created before installation": "ইনস্টলের আগে তৈরি হবে",
  "Check Now": "এখন চেক করুন",
  "Update Now": "আপডেট করুন",
  "Install Now": "এখন ইনস্টল",
  "Install": "ইনস্টল",
  "Installing version": "ভার্সন ইনস্টল হচ্ছে",
  "Waiting for the service...": "সার্ভার চালুর অপেক্ষা...",
  "GitHub Connection": "GitHub সংযোগ",
  "Private Repository": "প্রাইভেট রিপোজিটরি",
  "Read-only Token": "রিড-অনলি টোকেন",
  "Save Connection": "সংযোগ সেভ",
  "Connection Settings": "সংযোগ সেটিংস",
  "Connect GitHub": "GitHub যুক্ত করুন",
  "Release signature": "রিলিজ স্বাক্ষর",
  "Ed25519 verification ready": "Ed25519 যাচাই প্রস্তুত",
  "Signing key required": "সাইনিং কী প্রয়োজন",
  "Generate Signing Key": "সাইনিং কী তৈরি",
  "Generate Key": "কী তৈরি",
  "Replace Key": "কী পরিবর্তন",
  "Copy Signing Key Once": "সাইনিং কী কপি করুন",
  "Copy the private key now.": "প্রাইভেট কী এখনই কপি করুন।",
  "GitHub Secret Name": "GitHub সিক্রেট নাম",
  "Private Signing Key": "প্রাইভেট সাইনিং কী",
  "Copy Key": "কী কপি",
  "Open GitHub Secret": "GitHub Secret খুলুন",
  "Done": "সম্পন্ন",
  "Private repository verified.": "প্রাইভেট রিপোজিটরি যাচাই হয়েছে।",
  "Repository is public.": "রিপোজিটরি পাবলিক।",
  "Connected. No release published yet.": "সংযোগ হয়েছে। এখনো রিলিজ নেই।",
  "Latest release": "সর্বশেষ রিলিজ",
  "GitHub connection saved.": "GitHub সংযোগ সেভ হয়েছে।",
  "Private signing key copied.": "প্রাইভেট সাইনিং কী কপি হয়েছে।",
  "No published release exists yet.": "এখনো কোনো রিলিজ প্রকাশ হয়নি।",
  "P2PFlow is already up to date.": "P2PFlow আপডেট আছে।",
  "Required": "প্রয়োজন",
  "Ready": "প্রস্তুত",
  "Connect": "যুক্ত করুন",
  "Key needed": "কী প্রয়োজন",
  "Hosting setup": "হোস্টিং সেটআপ",
  "Your system is up to date": "সিস্টেম আপডেট আছে",
  "A verified GitHub release is available.": "যাচাইকৃত GitHub রিলিজ পাওয়া গেছে।",
  "No new release": "নতুন রিলিজ নেই",
  "Repository": "রিপোজিটরি",
  "Installed versions": "ইনস্টল করা ভার্সন",
  "Database backups": "ডাটাবেস ব্যাকআপ",
  "Installed": "ইনস্টল হয়েছে",
  "Roll Back": "পেছনের ভার্সনে যান",
  "Roll Back Code": "কোড রোলব্যাক",
  "Current": "বর্তমান",
  "New": "নতুন",
  "Verified": "যাচাইকৃত",
  "Version": "ভার্সন",
  "Revision": "রিভিশন",
  "Created": "তৈরি",
  "No version history yet.": "এখনো ভার্সন ইতিহাস নেই।",
  "A backup will be created before the first installation.": "প্রথম ইনস্টলের আগে ব্যাকআপ তৈরি হবে।",
  "Update guide": "আপডেট গাইড",
  "GitHub connection": "GitHub সংযোগ",
  "Signed release": "সাইন করা রিলিজ",
  "Automatic install": "স্বয়ংক্রিয় ইনস্টল",
  "Data safety": "ডাটা সুরক্ষা",
  "No data loss:": "ডাটা হারাবে না:",
  "Owner Password": "Owner পাসওয়ার্ড",
  "6 Digit Owner Secret": "Owner-এর ৬ ডিজিট সিক্রেট",
  "Install Update": "আপডেট ইনস্টল",
  "Cancel": "বাতিল",
  "Test": "পরীক্ষা",
  "Testing...": "পরীক্ষা হচ্ছে...",
  "Save GitHub Connection": "GitHub সংযোগ সেভ",
  "Save": "সেভ",
  "Current orders, ledger, accounting and database records remain unchanged.": "অর্ডার, লেজার ও হিসাব অপরিবর্তিত থাকবে।",
  "Dashboard": "ড্যাশবোর্ড",
  "P2P Trading": "P2P ট্রেডিং",
  "Accounting": "অ্যাকাউন্টিং",
  "Overview": "ওভারভিউ",
  "Team & Control": "টিম ও নিয়ন্ত্রণ",
  "Reports & Monitoring": "রিপোর্ট ও মনিটরিং",
  "System": "সিস্টেম",
  "SMS / Alerts": "SMS / অ্যালার্ট",
  "Menu": "মেনু",
  "Server Online": "সার্ভার অনলাইন",
  "P2P Market": "P2P মার্কেট",
  "Orders": "অর্ডার",
  "P2P Message": "P2P মেসেজ",
  "Advertisements": "বিজ্ঞাপন",
  "Approvals": "অনুমোদন",
  "Payment Accounts": "পেমেন্ট অ্যাকাউন্ট",
  "Account Statement": "অ্যাকাউন্ট স্টেটমেন্ট",
  "Users": "ইউজার",
  "User Roles": "ইউজার রোল",
  "Routing": "রাউটিং",
  "Digital Reports": "ডিজিটাল রিপোর্ট",
  "Reports": "রিপোর্ট",
  "Accounting Overview": "হিসাব সারসংক্ষেপ",
  "Expense": "খরচ",
  "Business Income": "ব্যবসার আয়",
  "Capital": "মূলধন",
  "Daily Closing": "দৈনিক হিসাব বন্ধ",
  "API Credentials": "API ক্রেডেনশিয়াল",
  "Health Check": "সিস্টেম পরীক্ষা",
  "Settings": "সেটিংস",
  "Extension Bridge": "এক্সটেনশন সংযোগ",
  "Security": "সিকিউরিটি",
  "Panel SMS / Alerts": "প্যানেল অ্যালার্ট",
  "Audit Logs": "অডিট লগ",
  "Logout": "লগআউট",
  "Refresh": "রিফ্রেশ",
  "Reload Now": "এখন রিলোড",
  "Try Again": "আবার চেষ্টা",
  "Open Health Check": "সিস্টেম পরীক্ষা খুলুন",
  "Loading...": "লোড হচ্ছে...",
  "No data": "কোনো ডাটা নেই",
  "No alerts": "কোনো অ্যালার্ট নেই",
  "No users": "কোনো ইউজার নেই",
  "No email": "ইমেইল নেই",
  "No evidence": "প্রমাণ নেই",
  "No limit": "সীমা নেই",
  "No maximum": "সর্বোচ্চ সীমা নেই",
  "No charge": "চার্জ নেই",
  "No more data": "আর ডাটা নেই",
  "All": "সব",
  "Today": "আজ",
  "Daily": "দৈনিক",
  "Monthly": "মাসিক",
  "Yearly": "বার্ষিক",
  "Lifetime": "সর্বমোট",
  "Custom": "কাস্টম",
  "This Month": "এই মাস",
  "This Year": "এই বছর",
  "Start Time": "শুরুর সময়",
  "End Time": "শেষ সময়",
  "Date & Time": "তারিখ ও সময়",
  "Last Seen": "শেষ দেখা",
  "Live State": "লাইভ অবস্থা",
  "Active Now": "এখন সক্রিয়",
  "Online Now": "এখন অনলাইন",
  "Presence": "উপস্থিতি",
  "Attempts": "চেষ্টা",
  "Login Time": "লগইন সময়",
  "App Open": "অ্যাপ খোলা",
  "Today Active": "আজ সক্রিয়",
  "Today Engaged": "আজ কাজ",
  "Login Seconds": "লগইন সেকেন্ড",
  "Idle Seconds": "নিষ্ক্রিয় সেকেন্ড",
  "Order actions": "অর্ডার কাজ",
  "Action": "অ্যাকশন",
  "Actions": "অ্যাকশন",
  "Status": "স্ট্যাটাস",
  "Type": "ধরন",
  "Source": "সোর্স",
  "Method": "মেথড",
  "Payment": "পেমেন্ট",
  "Amount": "পরিমাণ",
  "Price": "দাম",
  "Rate": "রেট",
  "Balance": "ব্যালেন্স",
  "Available": "উপলব্ধ",
  "Remaining": "বাকি",
  "Current Page": "বর্তমান পেজ",
  "First Page": "প্রথম পেজ",
  "Last Page": "শেষ পেজ",
  "Page": "পেজ",
  "Rows": "সারি",
  "Search": "খুঁজুন",
  "Filter": "ফিল্টার",
  "Sort by": "সাজান",
  "Apply": "প্রয়োগ",
  "Reset": "রিসেট",
  "View": "দেখুন",
  "Edit": "এডিট",
  "Delete": "ডিলিট",
  "Add": "যোগ",
  "Create": "তৈরি",
  "Update": "আপডেট",
  "Confirm": "নিশ্চিত",
  "Approve": "অনুমোদন",
  "Reject": "প্রত্যাখ্যান",
  "Back": "পেছনে",
  "Continue": "এগিয়ে যান",
  "Close": "বন্ধ",
  "Open": "খুলুন",
  "More": "আরও",
  "Copy": "কপি",
  "Copy value": "মান কপি",
  "Copy URL": "URL কপি",
  "Copy Token": "টোকেন কপি",
  "Generate": "তৈরি",
  "Enable": "চালু",
  "Disable": "বন্ধ",
  "Enabled": "চালু",
  "Disabled": "বন্ধ",
  "Active": "সক্রিয়",
  "Inactive": "নিষ্ক্রিয়",
  "Online": "অনলাইন",
  "Offline": "অফলাইন",
  "Ongoing": "চলমান",
  "Completed": "সম্পন্ন",
  "Cancelled": "বাতিল",
  "Pending": "অপেক্ষমাণ",
  "Open Order": "অর্ডার খুলুন",
  "Order Summary": "অর্ডার সারসংক্ষেপ",
  "Order Status": "অর্ডার স্ট্যাটাস",
  "Order Amount": "অর্ডার পরিমাণ",
  "Order No": "অর্ডার নম্বর",
  "Order No.": "অর্ডার নম্বর",
  "Order #": "অর্ডার #",
  "Reference": "রেফারেন্স",
  "Counterparty": "কাউন্টারপার্টি",
  "Payment Split": "পেমেন্ট ভাগ",
  "Mark as Paid": "পেইড মার্ক",
  "Release Coin": "কয়েন রিলিজ",
  "Quick Release": "দ্রুত রিলিজ",
  "Wait Payment": "পেমেন্ট অপেক্ষা",
  "Wait Release": "রিলিজ অপেক্ষা",
  "Payment marked as paid": "পেমেন্ট পেইড হিসেবে মার্ক হয়েছে",
  "Order placed": "অর্ডার হয়েছে",
  "Order created": "অর্ডার তৈরি হয়েছে",
  "Order completed": "অর্ডার সম্পন্ন",
  "Order cancelled": "অর্ডার বাতিল",
  "Appeal opened": "আপিল শুরু",
  "Payment time expired": "পেমেন্ট সময় শেষ",
  "Payment confirmed": "পেমেন্ট নিশ্চিত",
  "New Order": "নতুন অর্ডার",
  "New message": "নতুন মেসেজ",
  "Notifications": "নোটিফিকেশন",
  "Mark all read": "সব পড়া হয়েছে",
  "View all alerts": "সব অ্যালার্ট",
  "No new notifications": "নতুন নোটিফিকেশন নেই",
  "Anonymous User": "নামহীন ইউজার",
  "Positive": "পজিটিভ",
  "Negative": "নেগেটিভ",
  "Feedback": "ফিডব্যাক",
  "Completion": "সম্পন্ন হার",
  "Registered": "রেজিস্টার্ড",
  "Trades": "ট্রেড",
  "All Trades": "সব ট্রেড",
  "30d Trades": "৩০ দিনের ট্রেড",
  "Avg. Pay Time": "গড় পেমেন্ট সময়",
  "First Trade": "প্রথম ট্রেড",
  "Followers": "ফলোয়ার",
  "Following": "ফলোয়িং",
  "Verified user": "যাচাইকৃত ইউজার",
  "Non-merchant": "নন-মার্চেন্ট",
  "Merchant": "মার্চেন্ট",
  "Payment Numbers": "পেমেন্ট নম্বর",
  "Bank Transfer": "ব্যাংক ট্রান্সফার",
  "Fast payment": "দ্রুত পেমেন্ট",
  "Fiat Currency": "ফিয়াট কারেন্সি",
  "Crypto Asset": "ক্রিপ্টো অ্যাসেট",
  "Trade Type": "ট্রেড ধরন",
  "Buy": "ক্রয়",
  "Sell": "বিক্রয়",
  "BUY": "BUY",
  "SELL": "SELL",
  "Your Price": "আপনার দাম",
  "Limit": "সীমা",
  "Order Limit": "অর্ডার সীমা",
  "Pay With": "পেমেন্ট মেথড",
  "Payment Method": "পেমেন্ট মেথড",
  "All Region(s)": "সব অঞ্চল",
  "Display to Users In": "যে অঞ্চলে দেখাবে",
  "Terms Tags (Optional)": "শর্ত ট্যাগ (ঐচ্ছিক)",
  "Create Advertisement": "বিজ্ঞাপন তৈরি",
  "Save Changes": "পরিবর্তন সেভ",
  "Sync Binance Ads": "Binance বিজ্ঞাপন সিঙ্ক",
  "Break Mode": "বিরতি মোড",
  "On break": "বিরতিতে",
  "Live Control": "লাইভ কন্ট্রোল",
  "Run Live Sync": "লাইভ সিঙ্ক",
  "Add Account": "অ্যাকাউন্ট যোগ",
  "Save Account": "অ্যাকাউন্ট সেভ",
  "Account Name": "অ্যাকাউন্ট নাম",
  "Account Number": "অ্যাকাউন্ট নম্বর",
  "Account Type": "অ্যাকাউন্ট ধরন",
  "Account User": "অ্যাকাউন্ট ইউজার",
  "Agent Access": "এজেন্ট অ্যাক্সেস",
  "Usage Today": "আজকের ব্যবহার",
  "Receive Left": "রিসিভ বাকি",
  "Send Available": "সেন্ড উপলব্ধ",
  "Current Balance": "বর্তমান ব্যালেন্স",
  "Total Balance": "মোট ব্যালেন্স",
  "Account issue": "অ্যাকাউন্ট সমস্যা",
  "Statement": "স্টেটমেন্ট",
  "Statement In": "স্টেটমেন্ট ইন",
  "Statement Out": "স্টেটমেন্ট আউট",
  "Offline Transaction / Statement Adjustment": "অফলাইন ট্রানজেকশন / স্টেটমেন্ট সমন্বয়",
  "Description": "বিবরণ",
  "Optional note": "ঐচ্ছিক নোট",
  "Note": "নোট",
  "Category": "ক্যাটাগরি",
  "Categories": "ক্যাটাগরি",
  "Add Category": "ক্যাটাগরি যোগ",
  "Save Category": "ক্যাটাগরি সেভ",
  "New Category": "নতুন ক্যাটাগরি",
  "Expense Total": "মোট খরচ",
  "Income Total": "মোট আয়",
  "Owner Capital": "Owner মূলধন",
  "Owner Profit": "Owner লাভ",
  "User Profit": "ইউজার লাভ",
  "Capital Base": "মূলধন ভিত্তি",
  "Current Asset": "বর্তমান সম্পদ",
  "Closing Asset": "ক্লোজিং সম্পদ",
  "Cash Balance": "ক্যাশ ব্যালেন্স",
  "Capital Value": "মূলধন মূল্য",
  "Capital Added": "মূলধন যোগ",
  "Capital Withdrawn": "মূলধন উত্তোলন",
  "Personal Draw": "ব্যক্তিগত উত্তোলন",
  "Other Expense": "অন্যান্য খরচ",
  "Asset Sale": "অ্যাসেট বিক্রি",
  "Add Expense": "খরচ যোগ",
  "Save Expense": "খরচ সেভ",
  "Add Income": "আয় যোগ",
  "Save Income": "আয় সেভ",
  "Add Capital": "মূলধন যোগ",
  "Save Capital": "মূলধন সেভ",
  "Close Day": "দিনের হিসাব বন্ধ",
  "Saved Closes": "সেভ করা ক্লোজিং",
  "Business Date": "ব্যবসার তারিখ",
  "Gross Profit": "মোট লাভ",
  "Net Profit": "নিট লাভ",
  "Profit BDT": "লাভ BDT",
  "Profit USDT": "লাভ USDT",
  "Income BDT": "আয় BDT",
  "Income USDT": "আয় USDT",
  "Total Expense": "মোট খরচ",
  "Total Capital": "মোট মূলধন",
  "Opening Capital": "প্রারম্ভিক মূলধন",
  "Accounting Settings": "হিসাব সেটিংস",
  "Save Settings": "সেটিংস সেভ",
  "Sync Binance": "Binance সিঙ্ক",
  "Business Timezone": "ব্যবসার টাইমজোন",
  "Company": "কোম্পানি",
  "Agent (Optional)": "এজেন্ট (ঐচ্ছিক)",
  "Create User": "ইউজার তৈরি",
  "Save User": "ইউজার সেভ",
  "User Summary": "ইউজার সারসংক্ষেপ",
  "Total Users": "মোট ইউজার",
  "User Role": "ইউজার রোল",
  "Role Name": "রোল নাম",
  "Create Role": "রোল তৈরি",
  "Save Role": "রোল সেভ",
  "Edit Role": "রোল এডিট",
  "Permissions": "অনুমতি",
  "System Role": "সিস্টেম রোল",
  "Manager": "ম্যানেজার",
  "Auditor": "অডিটর",
  "Owner": "Owner",
  "Admin Panel": "অ্যাডমিন প্যানেল",
  "Payment Method Routing": "পেমেন্ট মেথড রাউটিং",
  "Add Route": "রুট যোগ",
  "Save Route": "রুট সেভ",
  "Create Route": "রুট তৈরি",
  "Priority": "অগ্রাধিকার",
  "Amount Range": "পরিমাণ সীমা",
  "Max Active": "সর্বোচ্চ সক্রিয়",
  "Capacity Guard": "ক্যাপাসিটি গার্ড",
  "API Key": "API কী",
  "Secret Key": "সিক্রেট কী",
  "Client Type": "ক্লায়েন্ট ধরন",
  "Add Credential": "ক্রেডেনশিয়াল যোগ",
  "Email for OTP": "OTP ইমেইল",
  "Health": "সিস্টেম অবস্থা",
  "Database": "ডাটাবেস",
  "Server URL": "সার্ভার URL",
  "Public URL": "পাবলিক URL",
  "App Version": "অ্যাপ ভার্সন",
  "Schema": "স্কিমা",
  "Warnings": "সতর্কতা",
  "Run Again": "আবার চালান",
  "Live Check": "লাইভ পরীক্ষা",
  "Mail Driver": "মেইল ড্রাইভার",
  "Mail method": "মেইল মেথড",
  "From Email": "প্রেরক ইমেইল",
  "From Name": "প্রেরক নাম",
  "SMTP Host": "SMTP হোস্ট",
  "SMTP Port": "SMTP পোর্ট",
  "SMTP Username": "SMTP ইউজারনেম",
  "SMTP Password": "SMTP পাসওয়ার্ড",
  "Test Sound": "সাউন্ড পরীক্ষা",
  "Sound Type": "সাউন্ড ধরন",
  "Custom Alerts": "কাস্টম অ্যালার্ট",
  "Extension API": "এক্সটেনশন API",
  "Token": "টোকেন",
  "Pending tasks": "অপেক্ষমাণ কাজ",
  "Collected": "সংগ্রহ হয়েছে",
  "Collecting": "সংগ্রহ হচ্ছে",
  "Blocked Users": "ব্লক করা ইউজার",
  "Share Profile": "প্রোফাইল শেয়ার",
  "P2P Profile": "P2P প্রোফাইল",
  "P2P Feedback": "P2P ফিডব্যাক",
  "Security Settings": "সিকিউরিটি সেটিংস",
  "New Password": "নতুন পাসওয়ার্ড",
  "Confirm Password": "পাসওয়ার্ড নিশ্চিত করুন",
  "Locked": "লকড",
  "Alerts": "অ্যালার্ট",
  "Summary": "সারসংক্ষেপ",
  "Decision Note": "সিদ্ধান্তের নোট",
  "Requested By": "অনুরোধকারী",
  "Approval Queue": "অনুমোদন তালিকা",
  "Approve Request": "অনুমোদন করুন",
  "Reject Request": "প্রত্যাখ্যান করুন",
  "Export CSV": "CSV এক্সপোর্ট",
  "Print / PDF": "প্রিন্ট / PDF",
  "Print / Save PDF": "প্রিন্ট / PDF সেভ",
  "Period": "সময়কাল",
  "Source Type": "সোর্স ধরন",
  "Direction": "দিক",
  "Before → After": "আগে → পরে",
  "Order/Ref": "অর্ডার/রেফ",
  "Success": "সফল",
  "Notice": "নোটিশ",
  "Error": "ত্রুটি",
  "Action blocked": "কাজ বন্ধ হয়েছে",
  "Unknown": "অজানা",
  "Unavailable": "উপলব্ধ নয়",
  "Unassigned": "অ্যাসাইন হয়নি",
  "Partial Done": "আংশিক সম্পন্ন",
  "Left": "ছেড়ে গেছে",
  "Hold Queue": "হোল্ড তালিকা",
  "hold": "হোল্ড",
  "active": "সক্রিয়",
  "inactive": "নিষ্ক্রিয়",
  "limit_full": "সীমা পূর্ণ",
  "completed": "সম্পন্ন",
  "partial": "আংশিক",
  "partial_completed": "আংশিক সম্পন্ন",
  "left": "ছেড়ে গেছে",
  "ready": "প্রস্তুত",
  "online": "অনলাইন",
  "offline": "অফলাইন",
  "idle": "নিষ্ক্রিয়",
  "away": "দূরে",
  "busy": "ব্যস্ত",
  "planned": "পরিকল্পিত",
  "failed": "ব্যর্থ",
  "cancelled": "বাতিল",
  "assigned": "অ্যাসাইন হয়েছে"
});

Object.assign(I18N_BN, {
  "Cash": "ক্যাশ",
  "Name": "নাম",
  "None": "কিছু নেই",
  "With": "সহ",
  "You": "আপনি",
  "all": "সব",
  "live": "লাইভ",
  "Draft": "ড্রাফট",
  "Email": "ইমেইল",
  "Fixed": "নির্দিষ্ট",
  "Label": "লেবেল",
  "Lead:": "লিড:",
  "Note:": "নোট:",
  "Retry": "আবার চেষ্টা",
  "Total": "মোট",
  "Trade": "ট্রেড",
  "Types": "ধরন",
  "shown": "দেখানো",
  "users": "ইউজার",
  "＋ Add": "＋ যোগ",
  "15 Min": "১৫ মিনিট",
  "30 Min": "৩০ মিনিট",
  "Ad No.": "বিজ্ঞাপন নম্বর",
  "Assign": "অ্যাসাইন",
  "Closed": "বন্ধ",
  "Latest": "সর্বশেষ",
  "Others": "অন্যান্য",
  "Profit": "লাভ",
  "Secure": "নিরাপদ",
  "Social": "সোশ্যাল",
  "unread": "অপঠিত",
  "Ad Type": "বিজ্ঞাপন ধরন",
  "Amount:": "পরিমাণ:",
  "Copied.": "কপি হয়েছে।",
  "Cryptos": "ক্রিপ্টো",
  "Expires": "মেয়াদ",
  "Private": "প্রাইভেট",
  "Updated": "আপডেট হয়েছে",
  "User No": "ইউজার নম্বর",
  "binance": "Binance",
  "API Mode": "API মোড",
  "Accounts": "অ্যাকাউন্ট",
  "BUY Sent": "BUY পাঠানো",
  "Bulk Add": "একসাথে যোগ",
  "Currency": "কারেন্সি",
  "Deleted.": "ডিলিট হয়েছে।",
  "Pending:": "অপেক্ষমাণ:",
  "Validate": "যাচাই",
  "Ad Number": "বিজ্ঞাপন নম্বর",
  "All users": "সব ইউজার",
  "Buy maker": "BUY মেকার",
  "SMTP only": "শুধু SMTP",
  "View only": "শুধু দেখা",
  "Buy | Sell": "ক্রয় | বিক্রয়",
  "Day(s) ago": "দিন আগে",
  "Diagnosis:": "পরীক্ষা:",
  "Live sync:": "লাইভ সিঙ্ক:",
  "Low volume": "কম ভলিউম",
  "Priority 1": "অগ্রাধিকার ১",
  "Sell maker": "SELL মেকার",
  "View proof": "প্রমাণ দেখুন",
  "API missing": "API নেই",
  "Area / Fiat": "অঞ্চল / ফিয়াট",
  "Daily cache": "দৈনিক ক্যাশ",
  "Install app": "অ্যাপ ইনস্টল",
  "Offline Txn": "অফলাইন লেনদেন",
  "Edit Details": "বিস্তারিত এডিট",
  "Poll Seconds": "পোল সেকেন্ড",
  "Total amount": "মোট পরিমাণ",
  "conversation": "কথোপকথন",
  "Delivery Mode": "ডেলিভারি মোড",
  "Edit / Access": "এডিট / অ্যাক্সেস",
  "PHP mail only": "শুধু PHP mail",
  "Role deleted.": "রোল ডিলিট হয়েছে।",
  "SELL Received": "SELL পাওয়া",
  "Sendmail only": "শুধু Sendmail",
  "All Statements": "সব স্টেটমেন্ট",
  "Auto-sync Rows": "অটো সিঙ্ক সারি",
  "Country/Region": "দেশ/অঞ্চল",
  "Email Delivery": "ইমেইল ডেলিভারি",
  "Entry deleted.": "এন্ট্রি ডিলিট হয়েছে।",
  "Estimated fee:": "আনুমানিক ফি:",
  "Login Security": "লগইন সিকিউরিটি",
  "Reply-To Email": "Reply-To ইমেইল",
  "Select account": "অ্যাকাউন্ট নির্বাচন",
  "Today App Open": "আজ অ্যাপ খোলা",
  "Wallet Balance": "ওয়ালেট ব্যালেন্স",
  "transaction(s)": "লেনদেন",
  "Assigned access": "অ্যাসাইন করা অ্যাক্সেস",
  "Audited Actions": "অডিট করা কাজ",
  "Business Closed": "ব্যবসা বন্ধ",
  "Capital Summary": "মূলধন সারসংক্ষেপ",
  "Extension Tasks": "এক্সটেনশন কাজ",
  "Extension Token": "এক্সটেনশন টোকেন",
  "Method Capacity": "মেথড ক্যাপাসিটি",
  "No messages yet": "এখনো মেসেজ নেই",
  "Priority 1 user": "অগ্রাধিকার ১ ইউজার",
  "Routing Example": "রাউটিং উদাহরণ",
  "SMTP Encryption": "SMTP এনক্রিপশন",
  "SMTP configured": "SMTP সেট আছে",
  "Send Test Email": "টেস্ট ইমেইল পাঠান",
  "Session History": "সেশন ইতিহাস",
  "Tracking scope:": "ট্র্যাকিং:",
  "Transfer Charge": "ট্রান্সফার চার্জ",
  "Charge / Commission": "চার্জ / কমিশন",
  "Charge / Commission Rule": "চার্জ / কমিশন নিয়ম",
  "Actual Charge / Commission": "প্রকৃত চার্জ / কমিশন",
  "Actual Charge / Commission (Optional)": "প্রকৃত চার্জ / কমিশন (ঐচ্ছিক)",
  "Manual Transaction": "ম্যানুয়াল লেনদেন",
  "Send Money": "সেন্ড মানি",
  "Receive Money": "রিসিভ মানি",
  "Cash Out": "ক্যাশ আউট",
  "Bill Pay": "বিল পে",
  "Mobile Recharge": "মোবাইল রিচার্জ",
  "Select All": "সব নির্বাচন",
  "Clear Selection": "নির্বাচন পরিষ্কার",
  "Edit Selected": "নির্বাচিতগুলো এডিট",
  "Delete Selected": "নির্বাচিতগুলো ডিলিট",
  "No commission": "কমিশন নেই",
  "Money in + money out": "টাকা আসা + টাকা যাওয়া",
  "Send Money + Cash Out": "সেন্ড মানি + ক্যাশ আউট",
  "Change Status": "স্ট্যাটাস পরিবর্তন",
  "Change Account Type": "অ্যাকাউন্ট ধরন পরিবর্তন",
  "Change Label": "লেবেল পরিবর্তন",
  "Change Account Name": "অ্যাকাউন্ট নাম পরিবর্তন",
  "Regenerate Serial Sequence": "সিরিয়াল ক্রম নতুন করে তৈরি",
  "Starting Serial": "শুরুর সিরিয়াল",
  "Fixed Amount": "নির্দিষ্ট পরিমাণ",
  "Percentage": "শতাংশ",
  "Tier Rules (JSON)": "ধাপভিত্তিক নিয়ম (JSON)",
  "Update Selected Accounts": "নির্বাচিত অ্যাকাউন্ট আপডেট",
  "Automatic": "স্বয়ংক্রিয়",
  "Update Security": "আপডেট সিকিউরিটি",
  "User Management": "ইউজার ব্যবস্থাপনা",
  "Actual BUY Spend": "প্রকৃত BUY খরচ",
  "Add User + Login": "ইউজার ও লগইন যোগ",
  "Automatic close:": "স্বয়ংক্রিয় ক্লোজ:",
  "Back to Accounts": "অ্যাকাউন্টে ফিরুন",
  "Closing Snapshot": "ক্লোজিং স্ন্যাপশট",
  "Current Password": "বর্তমান পাসওয়ার্ড",
  "Delete All Tasks": "সব কাজ ডিলিট",
  "Note / Reference": "নোট / রেফারেন্স",
  "SMTP HELO Domain": "SMTP HELO ডোমেইন",
  "Sync All Binance": "সব Binance সিঙ্ক",
  "Terms (Optional)": "শর্ত (ঐচ্ছিক)",
  "Withdraw Capital": "মূলধন উত্তোলন",
  "Auto-sync Seconds": "অটো সিঙ্ক সেকেন্ড",
  "Avg. Release Time": "গড় রিলিজ সময়",
  "Income Categories": "আয়ের ক্যাটাগরি",
  "New advertisement": "নতুন বিজ্ঞাপন",
  "No payment method": "পেমেন্ট মেথড নেই",
  "Payment Method(s)": "পেমেন্ট মেথড",
  "Press Update Now.": "Update Now চাপুন।",
  "Saved Credentials": "সেভ করা ক্রেডেনশিয়াল",
  "Tradable Ads Only": "শুধু ট্রেডযোগ্য বিজ্ঞাপন",
  "User/Agent Profit": "ইউজার/এজেন্ট লাভ",
  "Add to Home screen": "হোম স্ক্রিনে যোগ",
  "Applied maker rate": "প্রয়োগ করা মেকার রেট",
  "Binance diagnosis:": "Binance পরীক্ষা:",
  "Capacity/limit ok?": "ক্যাপাসিটি/সীমা ঠিক?",
  "Capital Categories": "মূলধন ক্যাটাগরি",
  "Holdings more than": "হোল্ডিংস বেশি",
  "Loading 20 more...": "আরও ২০টি লোড হচ্ছে...",
  "Mismatch Tolerance": "মিসম্যাচ সহনশীলতা",
  "Operational Profit": "অপারেশনাল লাভ",
  "Owner Profit Trend": "Owner লাভের ধারা",
  "Payment Time Limit": "পেমেন্ট সময়সীমা",
  "Publish to Binance": "Binance-এ প্রকাশ",
  "Retry loading more": "আবার লোড করুন",
  "Task retry queued.": "কাজটি আবার চেষ্টা হবে।",
  "30d Completion Rate": "৩০ দিনের সম্পন্ন হার",
  "Active Lock Seconds": "অ্যাক্টিভ লক সেকেন্ড",
  "Checking balance...": "ব্যালেন্স চেক হচ্ছে...",
  "Customizable Report": "কাস্টম রিপোর্ট",
  "How statements work": "স্টেটমেন্ট নিয়ম",
  "Live statement rule": "লাইভ স্টেটমেন্ট নিয়ম",
  "Presence & Activity": "উপস্থিতি ও কাজ",
  "Recent Audited Work": "সাম্প্রতিক অডিট কাজ",
  "SMTP not configured": "SMTP সেট নেই",
  "Sync Binance Orders": "Binance অর্ডার সিঙ্ক",
  "Admin / Manager only": "শুধু Admin / Manager",
  "Binance Network Only": "শুধু Binance নেটওয়ার্ক",
  "Carryover Adjustment": "ক্যারি-ওভার সমন্বয়",
  "Confirm New Password": "নতুন পাসওয়ার্ড নিশ্চিত করুন",
  "Current Ad Fee Rates": "বর্তমান বিজ্ঞাপন ফি",
  "Current Owner Profit": "বর্তমান Owner লাভ",
  "Max Proof Size Bytes": "প্রমাণের সর্বোচ্চ সাইজ",
  "No panel alerts yet.": "এখনো প্যানেল অ্যালার্ট নেই।",
  "Operations Dashboard": "অপারেশন ড্যাশবোর্ড",
  "Profile link copied.": "প্রোফাইল লিংক কপি হয়েছে।",
  "Pull down to refresh": "রিফ্রেশ করতে নিচে টানুন",
  "Scroll down for more": "আরও দেখতে নিচে যান",
  "Transaction ID saved": "ট্রানজেকশন ID সেভ হয়েছে",
  "Actual BUY Net Crypto": "প্রকৃত BUY নিট ক্রিপ্টো",
  "Adjusted Capital Base": "সমন্বিত মূলধন ভিত্তি",
  "Auto-reply (Optional)": "অটো রিপ্লাই (ঐচ্ছিক)",
  "Daily Closing History": "দৈনিক ক্লোজিং ইতিহাস",
  "Pending Estimated Net": "অপেক্ষমাণ আনুমানিক নিট",
  "Pro Merchant Ads only": "শুধু Pro Merchant বিজ্ঞাপন",
  "Profit Reconciliation": "লাভ মিল যাচাই",
  "Stored Local P2P Data": "সংরক্ষিত Local P2P ডাটা",
  "Add P2P To Home Screen": "P2P হোম স্ক্রিনে যোগ",
  "Advertisers You Follow": "ফলো করা বিজ্ঞাপনদাতা",
  "Current Business Asset": "বর্তমান ব্যবসার সম্পদ",
  "DAILY BUSINESS CLOSING": "দৈনিক ব্যবসা ক্লোজিং",
  "Delete All Stored Data": "সব সংরক্ষিত ডাটা ডিলিট",
  "No order in this range": "এই সময়সীমায় অর্ডার নেই",
  "No orders in this tab.": "এই ট্যাবে অর্ডার নেই।",
  "Opening capital saved.": "প্রারম্ভিক মূলধন সেভ হয়েছে।",
  "Owner Cash-flow Profit": "Owner ক্যাশ-ফ্লো লাভ",
  "Pending Operating Cash": "অপেক্ষমাণ অপারেটিং ক্যাশ",
  "User / Employee Report": "ইউজার / কর্মী রিপোর্ট",
  "User/Agent Performance": "ইউজার/এজেন্ট পারফরম্যান্স",
  "Activity Retention Days": "অ্যাক্টিভিটি রাখার দিন",
  "Advertiser URL Template": "বিজ্ঞাপনদাতা URL টেমপ্লেট",
  "All Binance Actual USDT": "সব Binance প্রকৃত USDT",
  "Business Open · Offline": "ব্যবসা চালু · অফলাইন",
  "Checking Binance status": "Binance স্ট্যাটাস চেক হচ্ছে",
  "Commit and Push origin.": "Commit করে Push origin করুন।",
  "Copy Binance CS Details": "Binance CS তথ্য কপি",
  "Counterparty Conditions": "কাউন্টারপার্টি শর্ত",
  "Expense category saved.": "খরচের ক্যাটাগরি সেভ হয়েছে।",
  "Mark Idle After Seconds": "কত সেকেন্ডে Idle",
  "New 6 Digit Secret Code": "নতুন ৬ ডিজিট সিক্রেট",
  "Select up to 5 methods.": "সর্বোচ্চ ৫টি মেথড নির্বাচন করুন।",
  "Next Day Opening Capital": "পরের দিনের প্রারম্ভিক মূলধন",
  "No advertisements found.": "কোনো বিজ্ঞাপন পাওয়া যায়নি।",
  "No approval request yet.": "এখনো অনুমোদন অনুরোধ নেই।",
  "No extension task found.": "এক্সটেনশন কাজ পাওয়া যায়নি।",
  "No live fee row returned": "লাইভ ফি পাওয়া যায়নি",
  "Running health checks...": "সিস্টেম পরীক্ষা চলছে...",
  "Save filter for next use": "ফিল্টার সেভ করুন",
  "Settings saved securely.": "সেটিংস নিরাপদে সেভ হয়েছে।",
  "Release Verification": "রিলিজ ভেরিফিকেশন",
  "Binance + step-up": "Binance + অতিরিক্ত ভেরিফিকেশন",
  "Binance verification": "Binance ভেরিফিকেশন",
  "Require P2PFlow verification before Release": "রিলিজের আগে P2PFlow ভেরিফিকেশন প্রয়োজন",
  "Primary P2PFlow verification": "প্রাইমারি P2PFlow ভেরিফিকেশন",
  "Secondary P2PFlow verification": "সেকেন্ডারি P2PFlow ভেরিফিকেশন",
  "Automatic Fund Transfer Password": "অটোমেটিক Fund Transfer Password",
  "Fund Transfer Password": "Fund Transfer Password",
  "Clear saved password": "সেভ করা পাসওয়ার্ড মুছুন",
  "Binance Auto": "Binance Auto",
  "FIDO2 / Fingerprint": "FIDO2 / Fingerprint",
  "Google Authenticator": "Google Authenticator",
  "SMS / Mobile OTP": "SMS / Mobile OTP",
  "Email OTP": "ইমেইল OTP",
  "YubiKey": "YubiKey",
  "User Password": "ইউজার পাসওয়ার্ড",
  "6-digit Secret Code": "৬ ডিজিট সিক্রেট কোড",
  "None": "কোনোটিই নয়",
  "P2PFlow Verification": "P2PFlow ভেরিফিকেশন",
  "Change Verification System": "ভেরিফিকেশন সিস্টেম পরিবর্তন",
  "Verify": "ভেরিফাই",
  "Send Email OTP": "ইমেইল OTP পাঠান",
  "Sum of User/Agent Profit": "ইউজার/এজেন্ট লাভের মোট",
  "Verification unavailable": "যাচাই উপলব্ধ নয়",
  "All advertisements loaded": "সব বিজ্ঞাপন লোড হয়েছে",
  "Clear saved SMTP password": "সেভ করা SMTP পাসওয়ার্ড মুছুন",
  "Close at Current Snapshot": "বর্তমান অবস্থায় ক্লোজ",
  "Complete expense activity": "সম্পূর্ণ খরচ কার্যক্রম",
  "Current account status: .": "বর্তমান অ্যাকাউন্ট স্ট্যাটাস:",
  "Expense category deleted.": "খরচের ক্যাটাগরি ডিলিট হয়েছে।",
  "Manual P2P BUY Rate (BDT)": "ম্যানুয়াল P2P BUY রেট (BDT)",
  "Pending Cash Distribution": "অপেক্ষমাণ ক্যাশ বণ্টন",
  "Required for BDT entries.": "BDT এন্ট্রির জন্য প্রয়োজন।",
  "Security Verification OTP": "সিকিউরিটি যাচাই OTP",
  "Successful server actions": "সফল সার্ভার কাজ",
  "Accounting settings saved.": "হিসাব সেটিংস সেভ হয়েছে।",
  "Activity Heartbeat Seconds": "অ্যাক্টিভিটি হার্টবিট সেকেন্ড",
  "Actual SELL Crypto Outflow": "প্রকৃত SELL ক্রিপ্টো আউটফ্লো",
  "Add Binance API Credential": "Binance API ক্রেডেনশিয়াল যোগ",
  "Binance CS details copied.": "Binance CS তথ্য কপি হয়েছে।",
  "Daily User/Agent Breakdown": "দৈনিক ইউজার/এজেন্ট বিস্তারিত",
  "Income Transaction History": "আয় লেনদেন ইতিহাস",
  "Mark Offline After Seconds": "কত সেকেন্ডে Offline",
  "No statement movement yet.": "এখনো স্টেটমেন্ট মুভমেন্ট নেই।",
  "Pending Estimated Net USDT": "অপেক্ষমাণ আনুমানিক নিট USDT",
  "Positive | Negative | Rows": "পজিটিভ | নেগেটিভ | সারি",
  "Require email OTP at login": "লগইনে ইমেইল OTP প্রয়োজন",
  "SSL/TLS (usually port 465)": "SSL/TLS (সাধারণত 465)",
  "Security settings updated.": "সিকিউরিটি সেটিংস আপডেট হয়েছে।",
  "Verified Merchant Ads only": "শুধু Verified Merchant বিজ্ঞাপন",
  "Automatic close at 23:59:59": "23:59:59-এ স্বয়ংক্রিয় ক্লোজ",
  "Capital Transaction History": "মূলধন লেনদেন ইতিহাস",
  "Dynamic presence & activity": "লাইভ উপস্থিতি ও কাজ",
  "Expense Transaction History": "খরচ লেনদেন ইতিহাস",
  "Followers / Following / Ads": "ফলোয়ার / ফলোয়িং / বিজ্ঞাপন",
  "Local first + SMTP fallback": "প্রথমে Local, পরে SMTP",
  "No payment method selected.": "পেমেন্ট মেথড নির্বাচন হয়নি।",
  "Owner Cash-flow Calculation": "Owner ক্যাশ-ফ্লো হিসাব",
  "Require 6 digit secret code": "৬ ডিজিট সিক্রেট প্রয়োজন",
  "STARTTLS (usually port 587)": "STARTTLS (সাধারণত 587)",
  "Select a maximum of 3 tags.": "সর্বোচ্চ ৩টি ট্যাগ নির্বাচন করুন।",
  "Allow lead user final action": "লিড ইউজারকে ফাইনাল অ্যাকশন দিন",
  "Default USDT Rate (fallback)": "ডিফল্ট USDT রেট",
  "Payment Time Limit (minutes)": "পেমেন্ট সময়সীমা (মিনিট)",
  "Sync Binance Payment Methods": "Binance পেমেন্ট মেথড সিঙ্ক",
  "Binance API trading is locked": "Binance API ট্রেডিং লকড",
  "Binance account is not active": "Binance অ্যাকাউন্ট সক্রিয় নয়",
  "CURRENT ADJUSTED CAPITAL BASE": "বর্তমান সমন্বিত মূলধন ভিত্তি",
  "Advertisers You've Traded With": "যাদের সঙ্গে ট্রেড করেছেন",
  "All notifications marked read.": "সব নোটিফিকেশন পড়া হয়েছে।",
  "Category-wise movement history": "ক্যাটাগরি অনুযায়ী মুভমেন্ট",
  "Closing Current Business Asset": "ক্লোজিং ব্যবসার সম্পদ",
  "High Amount Approval Threshold": "বড় পরিমাণ অনুমোদন সীমা",
  "Require proof for final action": "ফাইনাল অ্যাকশনে প্রমাণ প্রয়োজন",
  "No stored extension data found.": "সংরক্ষিত এক্সটেনশন ডাটা নেই।",
  "Read-only advertisement access.": "শুধু বিজ্ঞাপন দেখার অনুমতি।",
  "Category-wise transaction totals": "ক্যাটাগরি অনুযায়ী মোট লেনদেন",
  "No category data in this period.": "এই সময়ে ক্যাটাগরি ডাটা নেই।",
  "No payment account is available.": "পেমেন্ট অ্যাকাউন্ট নেই।",
  "Running Binance network check...": "Binance নেটওয়ার্ক পরীক্ষা চলছে...",
  "Ads With No Verification Required": "যাচাই ছাড়া বিজ্ঞাপন",
  "Advertisement actions are paused.": "বিজ্ঞাপন অ্যাকশন বন্ধ।",
  "Business day closes at 23:59:59 ·": "ব্যবসার দিন শেষ 23:59:59 ·",
  "Closed-day Owner cash-flow profit": "বন্ধ দিনের Owner ক্যাশ-ফ্লো লাভ",
  "No payment account balance found.": "পেমেন্ট অ্যাকাউন্ট ব্যালেন্স নেই।",
  "Owner Withdrawal / Family Expense": "Owner উত্তোলন / পারিবারিক খরচ",
  "Capital USDT Equivalent (Optional)": "মূলধন USDT সমমূল্য (ঐচ্ছিক)",
  "Advertisement published to Binance.": "বিজ্ঞাপন Binance-এ প্রকাশ হয়েছে।",
  "Difference / Unallocated Adjustment": "পার্থক্য / অনির্ধারিত সমন্বয়",
  "Open this page and press Check Now.": "এই পেজে Check Now চাপুন।",
  "Daily closing data will appear here.": "দৈনিক ক্লোজিং ডাটা এখানে দেখাবে।",
  "Advertisement controls are available.": "বিজ্ঞাপন কন্ট্রোল প্রস্তুত।",
  "Binance USDT Available (SELL capacity)": "Binance USDT উপলব্ধ (SELL ক্যাপাসিটি)",
  "Select a maximum of 5 payment methods.": "সর্বোচ্চ ৫টি পেমেন্ট মেথড নির্বাচন করুন।",
  "Auto import Binance orders periodically": "নির্দিষ্ট সময় পর Binance অর্ডার import",
  "Automatically refreshes every 3 seconds": "প্রতি ৩ সেকেন্ডে রিফ্রেশ",
  "Confirm Owner password and secret code.": "Owner পাসওয়ার্ড ও সিক্রেট নিশ্চিত করুন।",
  "No enabled payment method is available.": "চালু পেমেন্ট মেথড নেই।",
  "No payment accounts have been added yet.": "এখনো পেমেন্ট অ্যাকাউন্ট যোগ হয়নি।",
  "Binance P2P conversations will appear here.": "Binance P2P কথোপকথন এখানে দেখাবে।",
  "Break mode is active. Turn Break off first.": "Break mode চালু। আগে বন্ধ করুন।",
  "Go Online before activating advertisements.": "বিজ্ঞাপন চালুর আগে Online হন।",
  "Prefer the latest completed BUY actual rate": "সর্বশেষ সম্পন্ন BUY প্রকৃত রেট ব্যবহার",
  "Business and Break state are being verified.": "Business ও Break স্ট্যাটাস যাচাই হচ্ছে।",
  "No Binance API profile is assigned to this user.": "এই ইউজারের Binance API প্রোফাইল নেই।",
  "No feedback has been collected in this category.": "এই ক্যাটাগরিতে ফিডব্যাক নেই।",
  "P2PFlow stores only the public verification key.": "P2PFlow শুধু পাবলিক যাচাই কী রাখে।",
  "Show the advertisement in every supported region": "সব সমর্থিত অঞ্চলে বিজ্ঞাপন দেখান",
  "All connected Binance Funding Wallet balances synced.": "সব Binance Funding Wallet ব্যালেন্স সিঙ্ক হয়েছে।",
  "Add, withdraw, family expense and personal draw records": "যোগ, উত্তোলন ও ব্যক্তিগত খরচের রেকর্ড",
  "Break mode is active. Advertisement actions are paused.": "Break mode চালু। বিজ্ঞাপন অ্যাকশন বন্ধ।",
  "Select up to 3 tags. Additional KYC is configured here.": "সর্বোচ্চ ৩টি ট্যাগ; KYC এখানেই সেট করুন।",
  "Sending test email with the currently saved settings...": "সেভ করা সেটিংসে টেস্ট ইমেইল পাঠানো হচ্ছে...",
  "Advertisements are unavailable until Business is started.": "Business চালু না হলে বিজ্ঞাপন পাওয়া যাবে না।",
  "Cash, capacity, users and pending work in one clean view.": "ক্যাশ, ক্যাপাসিটি, ইউজার ও অপেক্ষমাণ কাজ।",
  "Estimated using the latest completed BUY actual net yield": "সর্বশেষ BUY প্রকৃত নিট yield দিয়ে হিসাব",
  "Change the amount, payment method or filters and try again.": "পরিমাণ, মেথড বা ফিল্টার বদলে চেষ্টা করুন।",
  "Manual expenses, payment charges and Binance fee categories": "ম্যানুয়াল খরচ, পেমেন্ট চার্জ ও Binance ফি",
  "Owner cash-flow and User/Agent performance remain separate.": "Owner cash-flow ও User/Agent ফল আলাদা।",
  "Manager is active — আপনি এই ফাংশনগুলো ব্যবহার করতে পারবেন না।": "Manager সক্রিয় — এই ফাংশন ব্যবহার করা যাবে না।",
  "Capital transactions are managed on the separate Capital page.": "মূলধন লেনদেন Capital পেজে করুন।",
  "Copy the new source files into your GitHub Desktop repository.": "নতুন source GitHub Desktop repository-তে কপি করুন।",
  "Current business asset to be locked as the next opening capital": "বর্তমান সম্পদ পরের দিনের opening capital হবে",
  "Wallet/account movement is recorded immediately for BDT income.": "BDT আয়ে wallet/account movement সঙ্গে সঙ্গে রেকর্ড হয়।",
  "Sync actual USDT from every connected Binance account before close": "ক্লোজের আগে সব Binance account-এর প্রকৃত USDT সিঙ্ক করুন",
  "Adding counterparty requirements will reduce the exposure of your Ad.": "কাউন্টারপার্টি শর্ত দিলে বিজ্ঞাপন কম দেখা যাবে।",
  "Current asset, capital base, Owner profit and User/Agent reconciliation": "সম্পদ, মূলধন, Owner লাভ ও User/Agent মিল",
  "Manage all users, managers, auditors, employees, logins and permissions here.": "সব ইউজার, লগইন ও অনুমতি এখানে পরিচালনা করুন।",
  "কোনো Manager active নেই। Manager active হলে controls স্বয়ংক্রিয়ভাবে lock হবে।": "কোনো Manager সক্রিয় নেই। Manager সক্রিয় হলে কন্ট্রোল লক হবে।",
  "Select up to 3 tags. “Additional KYC required” controls the Additional KYC rule.": "সর্বোচ্চ ৩টি ট্যাগ; Additional KYC এখানেই নিয়ন্ত্রণ করুন।",
  "Select up to 5 methods. Only selected methods will appear on this advertisement.": "সর্বোচ্চ ৫টি মেথড; নির্বাচিতগুলোই বিজ্ঞাপনে দেখাবে।",
  "Pending cash cannot be valued until a completed BUY provides an actual net yield.": "সম্পন্ন BUY না হওয়া পর্যন্ত pending cash-এর মূল্য হবে না।",
  "Password, email and secret changes require verification through your current email.": "পাসওয়ার্ড, ইমেইল ও সিক্রেট পরিবর্তনে বর্তমান ইমেইল যাচাই লাগবে।",
  "active writes finish first, then a database backup is created before code activation.": "আগে active write শেষ হবে, তারপর ব্যাকআপ নিয়ে কোড চালু হবে।",
  "Account balance is not edited directly. Every transaction creates a statement entry. Formula:": "ব্যালেন্স সরাসরি বদলায় না; প্রতিটি লেনদেনে স্টেটমেন্ট তৈরি হয়।",
  "Role templates control user access. Examples: Cashier, Night Manager, Auditor, Junior Employee.": "Role template দিয়ে ইউজার অনুমতি নিয়ন্ত্রণ করুন।",
  "Wait for Binance to unlock trading or resolve the restriction before creating an advertisement.": "বিজ্ঞাপন তৈরির আগে Binance restriction সমাধান করুন।",
  "For a bKash order, only bKash routing rules are checked. Nagad rules will not receive bKash orders.": "bKash অর্ডারে শুধু bKash রাউটিং ব্যবহার হবে।",
  "Priority 1 is tried first, then Priority 2. If priority is same, the user with fewer active orders is selected first.": "আগে Priority 1; সমান হলে কম active order থাকা ইউজার নির্বাচন হবে।"
});

Object.assign(I18N_BN, {
  "Period:": "সময়কাল:",
  "1. Method match": "১. মেথড মিল",
  "2. Priority": "২. অগ্রাধিকার",
  "3. Guard rules": "৩. গার্ড নিয়ম",
  "Bangladesh · UTC+06:00": "বাংলাদেশ · UTC+06:00",
  "India · UTC+05:30": "ভারত · UTC+05:30",
  "UAE · UTC+04:00": "UAE · UTC+04:00",
  "Open-order Detail Rows": "চলমান অর্ডারের বিস্তারিত সারি",
  "New bKash order ৳60,000": "নতুন bKash অর্ডার ৳60,000",
  "Advertisers You've Traded With": "যাদের সঙ্গে ট্রেড করেছেন",
  "Server-side real-time order reconciliation": "সার্ভার-সাইড লাইভ অর্ডার মিল",
  "Wait for the GitHub Release workflow to finish.": "GitHub Release workflow শেষ হওয়া পর্যন্ত অপেক্ষা করুন।",
  "Open your browser menu and choose": "Browser menu খুলে নির্বাচন করুন",
  "to create a shortcut.": "শর্টকাট তৈরি করতে।",
  "Source: . Rates refresh when asset, fiat or ad side changes.": "সোর্স অনুযায়ী asset, fiat বা side বদলালে রেট রিফ্রেশ হবে।",
  "Used only to value BDT capital when no completed BUY actual yield exists.": "সম্পন্ন BUY rate না থাকলে শুধু BDT মূলধন হিসাব করতে ব্যবহৃত হয়।",
  "Scheduled: 23:59:59 ·": "নির্ধারিত: 23:59:59 ·",
  "| Transfer charge:": "| ট্রান্সফার চার্জ:",
  "Live ·": "লাইভ ·",
  "USDT ·": "USDT ·",
  "− USDT": "− USDT",
  "✓ Verified": "✓ যাচাইকৃত",
  "bKash rules only": "শুধু bKash নিয়ম",
  "× universal rate": "× ইউনিভার্সাল রেট",
  "Send this result to hosting support if the connection fails.": "সংযোগ ব্যর্থ হলে ফলটি হোস্টিং সাপোর্টে পাঠান।",
  "Connect & Save validates the API and tests Binance access before saving.": "Connect & Save সেভের আগে API যাচাই ও Binance সংযোগ পরীক্ষা করে।",
  "Only matching payment-method rules are used.": "শুধু মিল থাকা পেমেন্ট মেথডের নিয়ম ব্যবহার হবে।",
  "Lower priority number is checked first.": "কম অগ্রাধিকার নম্বর আগে চেক হবে।",
  "Limits and capacity are checked before assignment.": "অ্যাসাইন করার আগে সীমা ও ক্যাপাসিটি চেক হবে।",
  "Notification Sound": "নোটিফিকেশন সাউন্ড",
  "Choose the sound used when the Notifications button is ON.": "Notifications বাটন অন থাকলে যে সাউন্ড বাজবে সেটি নির্বাচন করুন।",
  "Custom sound stays in this browser.": "কাস্টম সাউন্ড শুধু এই ব্রাউজারে থাকবে।",
  "Verify the counterparty before payment or release.": "পেমেন্ট বা রিলিজের আগে কাউন্টারপার্টি যাচাই করুন।",
  "No API credential is assigned.": "কোনো API ক্রেডেনশিয়াল অ্যাসাইন নেই।",
  "Select the API profiles this user can access.": "এই ইউজারের API প্রোফাইল নির্বাচন করুন।",
  "Create an Agent first.": "আগে একজন এজেন্ট তৈরি করুন।",
  "Unchecked accounts remain unavailable unless explicitly granted.": "স্পষ্টভাবে অনুমতি না দিলে অনির্বাচিত অ্যাকাউন্ট ব্যবহার করা যাবে না।",
  "Sync imports orders only; it never pays or releases.": "Sync শুধু অর্ডার আনে; পেইড বা রিলিজ করে না।",
  "No assigned payment account is available.": "কোনো অ্যাসাইন করা পেমেন্ট অ্যাকাউন্ট নেই।",
  "Proof is required before the final action.": "ফাইনাল অ্যাকশনের আগে প্রুফ প্রয়োজন।",
  "Enter the completed amount and proof.": "সম্পন্ন পরিমাণ ও প্রুফ দিন।",
  "API secrets are stored encrypted and never shown again.": "API secret এনক্রিপ্টেড থাকে এবং আবার দেখানো হয় না।",
  "Email verification is required for security changes.": "সিকিউরিটি পরিবর্তনে ইমেইল যাচাই প্রয়োজন।",
  "Every transaction creates a statement entry.": "প্রতিটি লেনদেনে স্টেটমেন্ট এন্ট্রি তৈরি হয়।",
  "BUY deducts; SELL adds received balance.": "BUY ব্যালেন্স কমায়; SELL পাওয়া ব্যালেন্স যোগ করে।",
  "Used only when no completed BUY rate exists.": "সম্পন্ন BUY rate না থাকলে ব্যবহার হবে।",
  "Data is shared by user number and old cache clears daily.": "user number অনুযায়ী ডাটা শেয়ার হয়; পুরোনো cache প্রতিদিন মুছে যায়।",
  "Approval permits the selected final action.": "Approval নির্বাচিত ফাইনাল অ্যাকশন অনুমোদন করে।",
  "Manager is active; advertisement controls are locked.": "Manager সক্রিয়; বিজ্ঞাপন কন্ট্রোল লক।",
  "Advertisement controls are ready.": "বিজ্ঞাপন কন্ট্রোল প্রস্তুত।",
  "Conditions may reduce ad visibility.": "শর্ত দিলে বিজ্ঞাপন কম দেখা যেতে পারে।",
  "SMTP password is stored encrypted.": "SMTP পাসওয়ার্ড এনক্রিপ্টেড থাকে।",
  "Live API actions require valid Binance credentials.": "Live API অ্যাকশনে সঠিক Binance ক্রেডেনশিয়াল প্রয়োজন।"
});


Object.assign(I18N_BN, {
  "Today": "আজ",
  "This Month": "এই মাস",
  "This Year": "এই বছর",
  "Lifetime": "সর্বমোট",
  "Custom": "কাস্টম",
  "View": "দেখুন",
  "Apply": "প্রয়োগ",
  "Refresh": "রিফ্রেশ",
  "Search": "খুঁজুন",
  "Clear search": "সার্চ মুছুন",
  "All": "সব",
  "None": "কোনোটিই নয়",
  "Cancel": "বাতিল",
  "Done": "সম্পন্ন",
  "Back": "ফিরুন",
  "Open": "খুলুন",
  "Close": "বন্ধ",
  "Delete": "ডিলিট",
  "Edit": "এডিট",
  "Save": "সেভ",
  "Add": "যোগ করুন",
  "Create": "তৈরি করুন",
  "Update": "আপডেট",
  "Action": "অ্যাকশন",
  "Actions": "অ্যাকশন",
  "Status": "স্ট্যাটাস",
  "Type": "ধরন",
  "Amount": "পরিমাণ",
  "Time": "সময়",
  "Date": "তারিখ",
  "User": "ইউজার",
  "Role": "রোল",
  "Name": "নাম",
  "Message": "মেসেজ",
  "Details": "বিস্তারিত",
  "Note": "নোট",
  "Source": "সোর্স",
  "Method": "মেথড",
  "Currency": "কারেন্সি",
  "Category": "ক্যাটাগরি",
  "Company": "কোম্পানি",
  "Settings": "সেটিংস",
  "Required": "প্রয়োজন",
  "Optional": "ঐচ্ছিক",
  "Enabled": "চালু",
  "Disabled": "বন্ধ",
  "Online": "অনলাইন",
  "Offline": "অফলাইন",
  "Active": "সক্রিয়",
  "Inactive": "নিষ্ক্রিয়",
  "Pending": "পেন্ডিং",
  "Completed": "সম্পন্ন",
  "Cancelled": "বাতিল",
  "Private": "প্রাইভেট",
  "Public": "পাবলিক",
  "Available": "উপলব্ধ",
  "Unavailable": "অনুপলব্ধ",
  "Current": "বর্তমান",
  "Previous": "আগের",
  "New": "নতুন",
  "Yes": "হ্যাঁ",
  "No": "না",
  "You": "আপনি",
  "Total": "মোট",
  "Balance": "ব্যালেন্স",
  "Account Number": "অ্যাকাউন্ট নম্বর",
  "Payment Method": "পেমেন্ট মেথড",
  "Payment Account": "পেমেন্ট অ্যাকাউন্ট",
  "Select account": "অ্যাকাউন্ট নির্বাচন করুন",
  "Agent (Optional)": "এজেন্ট (ঐচ্ছিক)",
  "Note / Reference": "নোট / রেফারেন্স",
  "Save Category": "ক্যাটাগরি সেভ",
  "New Category": "নতুন ক্যাটাগরি",
  "Add Category": "ক্যাটাগরি যোগ",
  "Business Date": "ব্যবসার তারিখ",
  "No limit": "সীমা নেই",
  "No max": "সর্বোচ্চ সীমা নেই",
  "No charge": "চার্জ নেই",
  "Manual actual": "ম্যানুয়াল প্রকৃত",
  "Unassigned": "অ্যাসাইন হয়নি",
  "Assigned access": "অ্যাসাইনড অ্যাক্সেস",
  "Admin / Manager only": "শুধু Admin / Manager",
  "No data": "ডাটা নেই",
  "No alerts": "কোনো অ্যালার্ট নেই",
  "No users": "কোনো ইউজার নেই",
  "No more data": "আর ডাটা নেই",
  "No evidence": "কোনো প্রমাণ নেই",
  "View proof": "প্রুফ দেখুন",
  "Transaction ID saved": "Transaction ID সেভ হয়েছে",
  "Open Order": "অর্ডার খুলুন",
  "Mark all read": "সব পড়া হয়েছে মার্ক করুন",
  "No panel alerts yet.": "এখনো কোনো প্যানেল অ্যালার্ট নেই।",
  "All notifications marked read.": "সব নোটিফিকেশন পড়া হয়েছে।",
  "Automatically refreshes every 3 seconds": "প্রতি ৩ সেকেন্ডে রিফ্রেশ হয়",
  "No category data in this period.": "এই সময়ে ক্যাটাগরি ডাটা নেই।",
  "Pending cash cannot be valued until a completed BUY provides an actual net yield.": "সম্পন্ন BUY না হওয়া পর্যন্ত pending cash-এর মূল্য নির্ধারণ হবে না।",
  "Sync All Binance": "সব Binance সিঙ্ক",
  "Owner Cash-flow Calculation": "Owner ক্যাশ-ফ্লো হিসাব",
  "Opening Capital": "শুরুর মূলধন",
  "Adjusted Capital Base": "সমন্বিত মূলধন ভিত্তি",
  "All Binance Actual USDT": "সব Binance প্রকৃত USDT",
  "Pending Estimated Net USDT": "Pending আনুমানিক নিট USDT",
  "Current Business Asset": "বর্তমান ব্যবসার সম্পদ",
  "Owner Profit": "Owner লাভ",
  "Profit Reconciliation": "লাভ মিল",
  "Owner cash-flow and User/Agent performance remain separate.": "Owner cash-flow ও User/Agent ফল আলাদা।",
  "Owner Cash-flow Profit": "Owner ক্যাশ-ফ্লো লাভ",
  "Sum of User/Agent Profit": "User/Agent মোট লাভ",
  "Difference / Unallocated Adjustment": "পার্থক্য / বণ্টনহীন সমন্বয়",
  "User/Agent Performance": "User/Agent পারফরম্যান্স",
  "SELL Receipts": "SELL প্রাপ্তি",
  "Actual BUY Spend": "প্রকৃত BUY খরচ",
  "Actual BUY Net Crypto": "প্রকৃত BUY নিট ক্রিপ্টো",
  "Actual SELL Crypto Outflow": "প্রকৃত SELL ক্রিপ্টো আউটফ্লো",
  "Pending Operating Cash": "Pending অপারেটিং ক্যাশ",
  "Pending Estimated Net": "Pending আনুমানিক নিট",
  "Operational Profit": "অপারেশনাল লাভ",
  "Carryover Adjustment": "ক্যারি-ওভার সমন্বয়",
  "User/Agent Profit": "User/Agent লাভ",
  "Daily User/Agent Breakdown": "দৈনিক User/Agent বিবরণ",
  "Pending Cash Distribution": "Pending ক্যাশ বণ্টন",
  "Estimated using the latest completed BUY actual net yield": "সর্বশেষ সম্পন্ন BUY নিট yield দিয়ে হিসাব",
  "No payment account balance found.": "পেমেন্ট অ্যাকাউন্ট ব্যালেন্স পাওয়া যায়নি।",
  "Categories": "ক্যাটাগরি",
  "Add Expense": "খরচ যোগ",
  "Expense Categories": "খরচের ক্যাটাগরি",
  "Manual expenses, payment charges and Binance fee categories": "ম্যানুয়াল খরচ, পেমেন্ট চার্জ ও Binance ফি",
  "Expense Transaction History": "খরচের লেনদেন ইতিহাস",
  "Complete expense activity": "সম্পূর্ণ খরচের কার্যক্রম",
  "Add Income": "আয় যোগ",
  "Income Categories": "আয়ের ক্যাটাগরি",
  "Category-wise transaction totals": "ক্যাটাগরি অনুযায়ী লেনদেন",
  "Income Transaction History": "আয়ের লেনদেন ইতিহাস",
  "Wallet/account movement is recorded immediately for BDT income.": "BDT আয়ে wallet/account movement সঙ্গে সঙ্গে রেকর্ড হয়।",
  "CURRENT ADJUSTED CAPITAL BASE": "বর্তমান সমন্বিত মূলধন ভিত্তি",
  "Add Capital": "মূলধন যোগ",
  "Withdraw Capital": "মূলধন উত্তোলন",
  "Capital Summary": "মূলধন সারসংক্ষেপ",
  "Capital Added": "যোগ করা মূলধন",
  "Owner Withdrawal / Family Expense": "Owner উত্তোলন / পারিবারিক খরচ",
  "Capital Categories": "মূলধন ক্যাটাগরি",
  "Category-wise movement history": "ক্যাটাগরি অনুযায়ী মুভমেন্ট",
  "Capital Transaction History": "মূলধন লেনদেন ইতিহাস",
  "Add, withdraw, family expense and personal draw records": "যোগ, উত্তোলন ও ব্যক্তিগত খরচের রেকর্ড",
  "DAILY BUSINESS CLOSING": "দৈনিক ব্যবসা ক্লোজিং",
  "Current business asset to be locked as the next opening capital": "বর্তমান সম্পদ পরের দিনের opening capital হবে",
  "Current Owner Profit": "বর্তমান Owner লাভ",
  "Close Day": "দিন ক্লোজ",
  "Closing Snapshot": "ক্লোজিং স্ন্যাপশট",
  "Closing Current Business Asset": "ক্লোজিং ব্যবসার সম্পদ",
  "Next Day Opening Capital": "পরের দিনের opening capital",
  "Owner Profit Trend": "Owner লাভের প্রবণতা",
  "Closed-day Owner cash-flow profit": "ক্লোজড দিনের Owner লাভ",
  "Daily Closing History": "দৈনিক ক্লোজিং ইতিহাস",
  "Current asset, capital base, Owner profit and User/Agent reconciliation": "সম্পদ, মূলধন, Owner লাভ ও User/Agent মিল",
  "Capital USDT Equivalent (Optional)": "মূলধনের USDT সমমান (ঐচ্ছিক)",
  "Required for BDT entries.": "BDT এন্ট্রির জন্য প্রয়োজন।",
  "Opening Owner Capital (USDT)": "শুরুর Owner মূলধন (USDT)",
  "Accounting Start Date": "হিসাব শুরুর তারিখ",
  "Save Opening Capital": "শুরুর মূলধন সেভ",
  "Crypto Asset": "ক্রিপ্টো অ্যাসেট",
  "Universal Profit Rate (BDT)": "ইউনিভার্সাল লাভ রেট (BDT)",
  "Manual P2P BUY Rate (BDT)": "ম্যানুয়াল P2P BUY রেট (BDT)",
  "Prefer the latest completed BUY actual rate": "সর্বশেষ সম্পন্ন BUY প্রকৃত রেট ব্যবহার",
  "Business Timezone": "ব্যবসার টাইমজোন",
  "Automatic close at 23:59:59": "23:59:59-এ অটো ক্লোজ",
  "Save Settings": "সেটিংস সেভ",
  "Close at Current Snapshot": "বর্তমান স্ন্যাপশটে ক্লোজ",
  "Office & Administration": "অফিস ও প্রশাসন",
  "Salary & Allowance": "বেতন ও ভাতা",
  "Rent": "ভাড়া",
  "Internet & Communication": "ইন্টারনেট ও যোগাযোগ",
  "Software & Subscription": "সফটওয়্যার ও সাবস্ক্রিপশন",
  "Equipment & Maintenance": "যন্ত্রপাতি ও রক্ষণাবেক্ষণ",
  "Marketing": "মার্কেটিং",
  "Travel & Transport": "ভ্রমণ ও পরিবহন",
  "Tax & Compliance": "কর ও কমপ্লায়েন্স",
  "Food & Hospitality": "খাবার ও আপ্যায়ন",
  "Other Expense": "অন্যান্য খরচ",
  "Service Income": "সেবা আয়",
  "Offline Txn": "অফলাইন লেনদেন",
  "Statement": "স্টেটমেন্ট",
  "Edit / Access": "এডিট / অ্যাক্সেস",
  "Add Account": "অ্যাকাউন্ট যোগ",
  "Bulk Add": "একসাথে যোগ",
  "Transfer Charge": "ট্রান্সফার চার্জ",
  "Receive Left": "রিসিভ বাকি",
  "Send Available": "সেন্ড উপলব্ধ",
  "Usage Today": "আজকের ব্যবহার",
  "Your assigned accounts only.": "শুধু আপনার অ্যাসাইনড অ্যাকাউন্ট।",
  "Tracking scope:": "ট্র্যাকিং সীমা:",
  "Presence & Activity": "উপস্থিতি ও কার্যক্রম",
  "Daily": "দৈনিক",
  "Monthly": "মাসিক",
  "Yearly": "বার্ষিক",
  "All users": "সব ইউজার",
  "User Summary": "ইউজার সারসংক্ষেপ",
  "Session History": "সেশন ইতিহাস",
  "Recent Audited Work": "সাম্প্রতিক অডিট কাজ",
  "Successful server actions": "সফল সার্ভার অ্যাকশন",
  "Online Now": "এখন অনলাইন",
  "Active Now": "এখন সক্রিয়",
  "visible + focused + recent interaction": "দৃশ্যমান, ফোকাসড ও সাম্প্রতিক ব্যবহার",
  "Audited Actions": "অডিটেড অ্যাকশন",
  "Live State": "লাইভ স্ট্যাটাস",
  "Current Page": "বর্তমান পেজ",
  "Login": "লগইন",
  "App Open": "অ্যাপ খোলা",
  "Engaged": "এনগেজড",
  "Idle": "নিষ্ক্রিয়",
  "Background": "ব্যাকগ্রাউন্ড",
  "Interactions": "ইন্টারঅ্যাকশন",
  "Sessions": "সেশন",
  "Engagement": "এনগেজমেন্ট",
  "End": "শেষ",
  "Login Time": "লগইন সময়",
  "Hidden": "লুকানো",
  "Last Page": "সর্বশেষ পেজ",
  "Device": "ডিভাইস",
  "Entity": "এনটিটি",
  "Read-only advertisement access.": "শুধু বিজ্ঞাপন দেখার অনুমতি।",
  "With": "সহ",
  "Total amount": "মোট পরিমাণ",
  "Limit": "সীমা",
  "No payment method": "পেমেন্ট মেথড নেই",
  "Draft": "ড্রাফট",
  "API missing": "API নেই",
  "Live": "লাইভ",
  "Binance API trading is locked": "Binance API trading লক",
  "Binance account is not active": "Binance অ্যাকাউন্ট সক্রিয় নয়",
  "Business Closed": "Business বন্ধ",
  "Break Mode": "Break Mode",
  "Business Open · Offline": "Business চালু · অফলাইন",
  "Checking Binance status": "Binance স্ট্যাটাস চেক হচ্ছে",
  "Cryptos": "ক্রিপ্টো",
  "Types": "ধরন",
  "Buy": "কিনুন",
  "Sell": "বিক্রি",
  "No advertisements found.": "কোনো বিজ্ঞাপন পাওয়া যায়নি।",
  "Select up to 5 methods. Only selected methods will appear on this advertisement.": "সর্বোচ্চ ৫টি মেথড নির্বাচন করুন।",
  "No enabled payment method is available.": "চালু পেমেন্ট মেথড নেই।",
  "All Region(s)": "সব অঞ্চল",
  "Show the advertisement in every supported region": "সব সমর্থিত অঞ্চলে বিজ্ঞাপন দেখান",
  "No payment method selected.": "পেমেন্ট মেথড নির্বাচন হয়নি।",
  "Applied maker rate": "প্রয়োগ করা maker rate",
  "Area / Fiat": "এলাকা / Fiat",
  "Buy maker": "Buy maker",
  "Sell maker": "Sell maker",
  "No live fee row returned": "লাইভ ফি পাওয়া যায়নি",
  "Ad Number": "বিজ্ঞাপন নম্বর",
  "New advertisement": "নতুন বিজ্ঞাপন",
  "Fiat Currency": "Fiat কারেন্সি",
  "Fixed": "নির্দিষ্ট",
  "Your Price": "আপনার মূল্য",
  "Order Limit": "অর্ডার সীমা",
  "Select up to 5 methods.": "সর্বোচ্চ ৫টি মেথড নির্বাচন করুন।",
  "＋ Add": "＋ যোগ",
  "Payment Time Limit": "পেমেন্ট সময়সীমা",
  "15 Min": "১৫ মিনিট",
  "30 Min": "৩০ মিনিট",
  "1 H": "১ ঘণ্টা",
  "3 H": "৩ ঘণ্টা",
  "Terms Tags (Optional)": "শর্ত ট্যাগ (ঐচ্ছিক)",
  "Terms (Optional)": "শর্ত (ঐচ্ছিক)",
  "Auto-reply (Optional)": "অটো-রিপ্লাই (ঐচ্ছিক)",
  "Registered": "রেজিস্টার্ড",
  "Day(s) ago": "দিন আগে",
  "Holdings more than": "হোল্ডিং এর বেশি",
  "Non-merchant": "নন-মার্চেন্ট",
  "Display to Users In": "যে অঞ্চলে দেখাবে",
  "Copy Binance CS Details": "Binance CS তথ্য কপি",
  "Publish to Binance": "Binance-এ প্রকাশ",
  "Your role does not have advertisement management permission.": "আপনার রোলে বিজ্ঞাপন পরিচালনার অনুমতি নেই।",
  "No Manager is active.": "কোনো Manager সক্রিয় নেই।",
  "View only; create and edit are locked.": "শুধু দেখা যাবে; তৈরি ও এডিট লক।",
  "Approve": "অনুমোদন",
  "Reject": "প্রত্যাখ্যান",
  "Pending:": "পেন্ডিং:",
  "Approval Queue": "অনুমোদন কিউ",
  "Issues": "সমস্যা",
  "Requested By": "রিকোয়েস্টকারী",
  "Audit Logs": "অডিট লগ",
  "No messages yet": "এখনো মেসেজ নেই",
  "Binance P2P conversations will appear here.": "Binance P2P কথোপকথন এখানে দেখাবে।",
  "Yesterday": "গতকাল",
  "System update": "সিস্টেম আপডেট",
  "You:": "আপনি:",
  "Counterparty": "কাউন্টারপার্টি",
  "Validate": "ভ্যালিডেট",
  "Live Check": "লাইভ চেক",
  "Enable": "চালু",
  "Disable": "বন্ধ",
  "Add Binance API Credential": "Binance API ক্রেডেনশিয়াল যোগ",
  "Sync Binance Payment Methods": "Binance পেমেন্ট মেথড সিঙ্ক",
  "Secret": "সিক্রেট",
  "Client Type": "ক্লায়েন্ট টাইপ",
  "Last Checked": "সর্বশেষ চেক",
  "Hidden forever": "স্থায়ীভাবে লুকানো",
  "Payment method sync failed": "পেমেন্ট মেথড সিঙ্ক ব্যর্থ",
  "Live check failed": "লাইভ চেক ব্যর্থ",
  "Credential disabled": "ক্রেডেনশিয়াল বন্ধ হয়েছে",
  "Credential enabled": "ক্রেডেনশিয়াল চালু হয়েছে",
  "Delete this API credential permanently? The secret key will be removed and cannot be recovered.": "এই API ক্রেডেনশিয়াল স্থায়ীভাবে ডিলিট করবেন?",
  "Credential deleted": "ক্রেডেনশিয়াল ডিলিট হয়েছে",
  "Operations Dashboard": "অপারেশন ড্যাশবোর্ড",
  "Total Balance": "মোট ব্যালেন্স",
  "Method Capacity": "মেথড ক্যাপাসিটি",
  "Gross Profit": "মোট লাভ",
  "BUY Sent": "BUY পাঠানো",
  "SELL Received": "SELL প্রাপ্ত",
  "Hold Queue": "হোল্ড কিউ",
  "Users": "ইউজার",
  "Alerts": "অ্যালার্ট",
  "Business Capital": "ব্যবসার মূলধন",
  "Today Net Profit": "আজকের নিট লাভ",
  "BUY Capacity": "BUY ক্যাপাসিটি",
  "SELL Capacity": "SELL ক্যাপাসিটি",
  "Running health checks...": "সিস্টেম পরীক্ষা চলছে...",
  "Run Again": "আবার চালান",
  "Binance Network Only": "শুধু Binance নেটওয়ার্ক",
  "Send Test Email": "টেস্ট ইমেইল পাঠান",
  "Diagnosis:": "ডায়াগনসিস:",
  "Running Binance network check...": "Binance নেটওয়ার্ক চেক চলছে...",
  "Binance diagnosis:": "Binance ডায়াগনসিস:",
  "App Version": "অ্যাপ ভার্সন",
  "Platform": "প্ল্যাটফর্ম",
  "Uptime": "আপটাইম",
  "Active Sessions": "সক্রিয় সেশন",
  "API Mode": "API মোড",
  "Mail Driver": "মেইল ড্রাইভার",
  "Saved Credentials": "সেভ করা ক্রেডেনশিয়াল",
  "Active Credential": "সক্রিয় ক্রেডেনশিয়াল",
  "Credential Status": "ক্রেডেনশিয়াল স্ট্যাটাস",
  "Last Live Message": "সর্বশেষ লাইভ মেসেজ",
  "Application": "অ্যাপ্লিকেশন",
  "Metric": "মেট্রিক",
  "Value": "মান",
  "Binance Credential": "Binance ক্রেডেনশিয়াল",
  "Binance Network": "Binance নেটওয়ার্ক",
  "Step": "ধাপ",
  "Target": "টার্গেট",
  "Detail": "বিস্তারিত",
  "Email Delivery": "ইমেইল ডেলিভারি",
  "Storage": "স্টোরেজ",
  "Send a local-server test email to your account email?": "আপনার ইমেইলে টেস্ট মেইল পাঠাবেন?",
  "Test email sent": "টেস্ট ইমেইল পাঠানো হয়েছে",
  "All Statements": "সব স্টেটমেন্ট",
  "Back to Accounts": "অ্যাকাউন্টে ফিরুন",
  "How statements work": "স্টেটমেন্ট নিয়ম",
  "Live statement rule": "লাইভ স্টেটমেন্ট নিয়ম",
  "Statement Account": "স্টেটমেন্ট অ্যাকাউন্ট",
  "Filter": "ফিল্টার",
  "Current Balance": "বর্তমান ব্যালেন্স",
  "Total In": "মোট ইন",
  "Total Out": "মোট আউট",
  "Source Type": "সোর্স ধরন",
  "Direction": "দিক",
  "Before → After": "আগে → পরে",
  "View only": "শুধু দেখা",
  "Create Binance Order": "Binance অর্ডার তৈরি",
  "Create Offline Order": "অফলাইন অর্ডার তৈরি",
  "Sync Binance Orders": "Binance অর্ডার সিঙ্ক",
  "No orders in this tab.": "এই ট্যাবে অর্ডার নেই।",
  "Ongoing": "চলমান",
  "Fulfilled": "সম্পন্ন",
  "Lead:": "লিড:",
  "Price": "মূল্য",
  "Actual": "প্রকৃত",
  "Order": "অর্ডার",
  "No approval request yet.": "এখনো approval request নেই।",
  "No statement movement yet.": "এখনো স্টেটমেন্ট মুভমেন্ট নেই।",
  "Orders": "অর্ডার",
  "Unpaid": "আনপেইড",
  "Paid": "পেইড",
  "Appeal": "আপিল",
  "Lead": "লিড",
  "Chat": "চ্যাট",
  "Order actions": "অর্ডার অ্যাকশন",
  "Received Quantity": "প্রাপ্ত পরিমাণ",
  "Total Quantity": "মোট পরিমাণ",
  "Order Summary": "অর্ডার সারসংক্ষেপ",
  "No order in this range": "এই সময়ে অর্ডার নেই",
  "Digital Reports": "ডিজিটাল রিপোর্ট",
  "Completed Orders": "সম্পন্ন অর্ডার",
  "Offline Orders": "অফলাইন অর্ডার",
  "Statement In": "স্টেটমেন্ট ইন",
  "Statement Out": "স্টেটমেন্ট আউট",
  "Completed Splits": "সম্পন্ন স্প্লিট",
  "Partial Splits": "আংশিক স্প্লিট",
  "Statement Volume": "স্টেটমেন্ট ভলিউম",
  "Leave Count": "ছুটির সংখ্যা",
  "Accounts": "অ্যাকাউন্ট",
  "Offline In": "অফলাইন ইন",
  "Offline Out": "অফলাইন আউট",
  "Receive Capacity": "রিসিভ ক্যাপাসিটি",
  "Difference": "পার্থক্য",
  "Lead User": "লিড ইউজার",
  "Add Route": "রুট যোগ",
  "Routing Example": "রাউটিং উদাহরণ",
  "Priority 1 user": "Priority 1 ইউজার",
  "Capacity/limit ok?": "ক্যাপাসিটি/সীমা ঠিক?",
  "Assign": "অ্যাসাইন",
  "Payment Method Routing": "পেমেন্ট মেথড রাউটিং",
  "Priority": "অগ্রাধিকার",
  "Amount Range": "পরিমাণ সীমা",
  "Capacity Guard": "ক্যাপাসিটি গার্ড",
  "Max Active": "সর্বোচ্চ সক্রিয়",
  "first choice": "প্রথম পছন্দ",
  "ON: check capacity": "চালু: ক্যাপাসিটি চেক",
  "OFF: route only": "বন্ধ: শুধু রাউট",
  "Delete this routing rule?": "এই রাউটিং নিয়ম ডিলিট করবেন?",
  "Verification unavailable": "ভেরিফিকেশন পাওয়া যায়নি",
  "30d Trades": "৩০ দিনের ট্রেড",
  "30d Completion Rate": "৩০ দিনের সম্পন্ন হার",
  "Avg. Release Time": "গড় রিলিজ সময়",
  "Avg. Pay Time": "গড় পেমেন্ট সময়",
  "More": "আরও",
  "Trade": "ট্রেড",
  "Others": "অন্যান্য",
  "Low volume": "কম ভলিউম",
  "Current Password": "বর্তমান পাসওয়ার্ড",
  "New Password": "নতুন পাসওয়ার্ড",
  "Confirm New Password": "নতুন পাসওয়ার্ড নিশ্চিত করুন",
  "Email": "ইমেইল",
  "New 6 Digit Secret Code": "নতুন ৬ ডিজিট সিক্রেট কোড",
  "Security Verification OTP": "সিকিউরিটি ভেরিফিকেশন OTP",
  "Update Security": "সিকিউরিটি আপডেট",
  "Add to Home screen": "হোম স্ক্রিনে যোগ",
  "Install app": "অ্যাপ ইনস্টল",
  "Verified Merchant": "ভেরিফাইড মার্চেন্ট",
  "P2P Account": "P2P অ্যাকাউন্ট",
  "Merchant verified": "মার্চেন্ট ভেরিফাইড",
  "My P2P Account": "আমার P2P অ্যাকাউন্ট",
  "Received Feedback": "প্রাপ্ত ফিডব্যাক",
  "Custom Alerts": "কাস্টম অ্যালার্ট",
  "Payment Method(s)": "পেমেন্ট মেথড",
  "Blocked Users": "ব্লক করা ইউজার",
  "Recently Viewed": "সাম্প্রতিক দেখা",
  "Ad Sharing Code": "বিজ্ঞাপন শেয়ার কোড",
  "Activities": "কার্যক্রম",
  "P2P Help Center": "P2P হেল্প সেন্টার",
  "Add P2P To Home Screen": "P2P হোম স্ক্রিনে যোগ",
  "Merchant Portal": "মার্চেন্ট পোর্টাল",
  "Share profile": "প্রোফাইল শেয়ার",
  "Security settings": "সিকিউরিটি সেটিংস",
  "Sync selected API owner profile": "নির্বাচিত API owner প্রোফাইল সিঙ্ক",
  "Profile has not been synced yet.": "প্রোফাইল এখনো সিঙ্ক হয়নি।",
  "Positive Feedback": "পজিটিভ ফিডব্যাক",
  "Positive": "পজিটিভ",
  "Negative": "নেগেটিভ",
  "First Trade": "প্রথম ট্রেড",
  "Trading Counterparties": "ট্রেডিং কাউন্টারপার্টি",
  "All Trades": "সব ট্রেড",
  "Approx. 30d Volume": "আনুমানিক ৩০ দিনের ভলিউম",
  "Approx. Total Volume": "আনুমানিক মোট ভলিউম",
  "Payment Methods": "পেমেন্ট মেথড",
  "User No": "ইউজার নম্বর",
  "Anonymous User": "অজ্ঞাত ইউজার",
  "Mismatch Tolerance": "মিসম্যাচ টলারেন্স",
  "High Amount Approval Threshold": "বড় পরিমাণ approval সীমা",
  "Active Lock Seconds": "Active lock সেকেন্ড",
  "Max Proof Size Bytes": "সর্বোচ্চ প্রুফ সাইজ",
  "Default USDT Rate (fallback)": "ডিফল্ট USDT রেট",
  "Auto import Binance orders periodically": "নির্দিষ্ট সময় পর Binance অর্ডার import",
  "Auto-sync Seconds": "অটো-সিঙ্ক সেকেন্ড",
  "Auto-sync Rows": "অটো-সিঙ্ক সারি",
  "Open-order Detail Rows": "চলমান অর্ডারের বিস্তারিত সারি",
  "Server-side real-time order reconciliation": "সার্ভার-সাইড লাইভ অর্ডার মিল",
  "Dynamic presence & activity": "ডাইনামিক উপস্থিতি ও কার্যক্রম",
  "Activity Heartbeat Seconds": "অ্যাক্টিভিটি heartbeat সেকেন্ড",
  "Mark Idle After Seconds": "কত সেকেন্ডে idle",
  "Mark Offline After Seconds": "কত সেকেন্ডে offline",
  "Activity Retention Days": "অ্যাক্টিভিটি রাখার দিন",
  "Require email OTP at login": "লগইনে ইমেইল OTP প্রয়োজন",
  "Require 6 digit secret code": "৬ ডিজিট সিক্রেট কোড প্রয়োজন",
  "Local mode needs no SMTP configuration. It tries hosting PHP mail(), PHP CLI, sendmail, then the saved SMTP account as a fallback.": "Local mode-এ SMTP সেটআপ প্রয়োজন নেই।",
  "Delivery Mode": "ডেলিভারি মোড",
  "Local first + SMTP fallback": "আগে Local, পরে SMTP",
  "SMTP only": "শুধু SMTP",
  "PHP mail only": "শুধু PHP mail",
  "Sendmail only": "শুধু Sendmail",
  "From Email": "প্রেরকের ইমেইল",
  "From Name": "প্রেরকের নাম",
  "Reply-To Email": "Reply-To ইমেইল",
  "SMTP Host": "SMTP হোস্ট",
  "SMTP Port": "SMTP পোর্ট",
  "SMTP Encryption": "SMTP এনক্রিপশন",
  "SSL/TLS (usually port 465)": "SSL/TLS (সাধারণত 465)",
  "STARTTLS (usually port 587)": "STARTTLS (সাধারণত 587)",
  "SMTP Username": "SMTP ইউজারনেম",
  "SMTP Password": "SMTP পাসওয়ার্ড",
  "SMTP HELO Domain": "SMTP HELO ডোমেইন",
  "Clear saved SMTP password": "সেভ করা SMTP পাসওয়ার্ড মুছুন",
  "Require proof for final action": "ফাইনাল অ্যাকশনে প্রুফ প্রয়োজন",
  "Allow lead user final action": "লিড ইউজারকে ফাইনাল অ্যাকশন অনুমতি",
  "SMTP configured": "SMTP কনফিগার করা",
  "SMTP not configured": "SMTP কনফিগার করা নেই",
  "Saved — leave blank to keep": "সেভ আছে — রাখতে খালি রাখুন",
  "Enter SMTP password": "SMTP পাসওয়ার্ড দিন",
  "Settings saved securely.": "সেটিংস নিরাপদে সেভ হয়েছে।",
  "Release Verification": "রিলিজ ভেরিফিকেশন",
  "Binance + step-up": "Binance + অতিরিক্ত ভেরিফিকেশন",
  "Binance verification": "Binance ভেরিফিকেশন",
  "Require P2PFlow verification before Release": "রিলিজের আগে P2PFlow ভেরিফিকেশন প্রয়োজন",
  "Primary P2PFlow verification": "প্রাইমারি P2PFlow ভেরিফিকেশন",
  "Secondary P2PFlow verification": "সেকেন্ডারি P2PFlow ভেরিফিকেশন",
  "Automatic Fund Transfer Password": "অটোমেটিক Fund Transfer Password",
  "Fund Transfer Password": "Fund Transfer Password",
  "Clear saved password": "সেভ করা পাসওয়ার্ড মুছুন",
  "Binance Auto": "Binance Auto",
  "FIDO2 / Fingerprint": "FIDO2 / Fingerprint",
  "Google Authenticator": "Google Authenticator",
  "SMS / Mobile OTP": "SMS / Mobile OTP",
  "Email OTP": "ইমেইল OTP",
  "YubiKey": "YubiKey",
  "User Password": "ইউজার পাসওয়ার্ড",
  "6-digit Secret Code": "৬ ডিজিট সিক্রেট কোড",
  "None": "কোনোটিই নয়",
  "P2PFlow Verification": "P2PFlow ভেরিফিকেশন",
  "Change Verification System": "ভেরিফিকেশন সিস্টেম পরিবর্তন",
  "Verify": "ভেরিফাই",
  "Send Email OTP": "ইমেইল OTP পাঠান",
  "Test email accepted.": "টেস্ট ইমেইল গ্রহণ হয়েছে।",
  "Test email failed.": "টেস্ট ইমেইল ব্যর্থ।",
  "Database backup is complete. P2PFlow is restarting with the verified code.": "ডাটাবেস ব্যাকআপ সম্পন্ন। P2PFlow রিস্টার্ট হচ্ছে।",
  "Waiting for the service...": "সার্ভিস চালুর অপেক্ষা...",
  "Owner Password": "Owner পাসওয়ার্ড",
  "6 Digit Owner Secret": "Owner-এর ৬ ডিজিট সিক্রেট",
  "Private Repository": "প্রাইভেট রিপোজিটরি",
  "Read-only Token": "Read-only টোকেন",
  "Test": "পরীক্ষা",
  "Save Connection": "সংযোগ সেভ",
  "Copy the private key now.": "Private key এখনই কপি করুন।",
  "GitHub Secret Name": "GitHub Secret নাম",
  "Private Signing Key": "Private Signing Key",
  "Copy Key": "Key কপি",
  "Open GitHub Secret": "GitHub Secret খুলুন",
  "Check Now": "এখন চেক করুন",
  "Current version": "বর্তমান ভার্সন",
  "Last backup": "সর্বশেষ ব্যাকআপ",
  "No data loss:": "ডাটা নিরাপত্তা:",
  "No new release": "নতুন রিলিজ নেই",
  "Repository": "রিপোজিটরি",
  "Release signature": "রিলিজ সিগনেচার",
  "Installed versions": "ইনস্টল করা ভার্সন",
  "Installed": "ইনস্টল হয়েছে",
  "Roll Back": "রোলব্যাক",
  "Install": "ইনস্টল",
  "No version history yet.": "এখনো ভার্সন ইতিহাস নেই।",
  "Database backups": "ডাটাবেস ব্যাকআপ",
  "Label": "লেবেল",
  "Revision": "রিভিশন",
  "Created": "তৈরির সময়",
  "A backup will be created before the first installation.": "প্রথম ইনস্টলের আগে ব্যাকআপ তৈরি হবে।",
  "NOTE": "নোট",
  "Update guide": "আপডেট গাইড",
  "Commit and Push origin.": "Commit করে Push origin দিন।",
  "Press Update Now.": "Update Now চাপুন।",
  "Data safety": "ডাটা নিরাপত্তা",
  "Please wait...": "অপেক্ষা করুন...",
  "Roll Back Code": "কোড রোলব্যাক",
  "Install Update": "আপডেট ইনস্টল",
  "Testing...": "পরীক্ষা হচ্ছে...",
  "Connected. No release published yet.": "সংযুক্ত। এখনো রিলিজ প্রকাশ হয়নি।",
  "Private repository verified.": "প্রাইভেট রিপোজিটরি যাচাই হয়েছে।",
  "Repository is public.": "রিপোজিটরি পাবলিক।",
  "Save GitHub Connection": "GitHub সংযোগ সেভ",
  "GitHub connection saved.": "GitHub সংযোগ সেভ হয়েছে।",
  "GitHub Connection": "GitHub সংযোগ",
  "Saved - leave blank to keep it": "সেভ আছে - রাখতে খালি রাখুন",
  "Generate Signing Key": "Signing Key তৈরি",
  "Generate Key": "Key তৈরি",
  "Copy Signing Key Once": "Signing Key একবার কপি করুন",
  "Copy Signing Key": "Signing Key কপি",
  "Private signing key copied.": "Private signing key কপি হয়েছে।",
  "Verifying...": "যাচাই হচ্ছে...",
  "No published release exists yet.": "এখনো প্রকাশিত রিলিজ নেই।",
  "P2PFlow is already up to date.": "P2PFlow আপডেটেড আছে।",
  "Update Now": "এখন আপডেট",
  "System Update": "সিস্টেম আপডেট",
  "Your system is up to date": "সিস্টেম আপডেটেড আছে",
  "A verified GitHub release is available.": "যাচাইকৃত GitHub রিলিজ পাওয়া গেছে।",
  "Connected": "সংযুক্ত",
  "Not connected": "সংযুক্ত নয়",
  "Connection required": "সংযোগ প্রয়োজন",
  "Not created": "তৈরি হয়নি",
  "Created before installation": "ইনস্টলের আগে তৈরি",
  "Verified release from your private repository": "প্রাইভেট রিপোজিটরির যাচাইকৃত রিলিজ",
  "Verified": "যাচাইকৃত",
  "Ready": "প্রস্তুত",
  "Create User Role": "ইউজার রোল তৈরি",
  "Back to Users": "ইউজারে ফিরুন",
  "Permissions": "অনুমতি",
  "Locked": "লক",
  "Edit Role": "রোল এডিট",
  "Delete this role?": "এই রোল ডিলিট করবেন?",
  "Role deleted.": "রোল ডিলিট হয়েছে।",
  "Admin Panel": "অ্যাডমিন প্যানেল",
  "User Management": "ইউজার ব্যবস্থাপনা",
  "Total Users": "মোট ইউজার",
  "Wallet Balance": "ওয়ালেট ব্যালেন্স",
  "Add User + Login": "ইউজার ও লগইন যোগ",
  "User Roles": "ইউজার রোল",
  "Activity Monitor": "অ্যাক্টিভিটি মনিটর",
  "Today App Open": "আজ অ্যাপ খোলা",
  "Today Active": "আজ সক্রিয়",
  "Today Engaged": "আজ এনগেজড",
  "Cash": "ক্যাশ",
  "Last Seen": "সর্বশেষ দেখা",
  "Edit User / Permissions": "ইউজার / অনুমতি এডিট",
  "Users & Permissions": "ইউজার ও অনুমতি",
  "No login yet": "এখনো লগইন হয়নি",
  "no active page": "সক্রিয় পেজ নেই",
  "Only the required order number and payment ID are sent. Any additional Binance verification field will appear here when required.": "শুধু প্রয়োজনীয় অর্ডার নম্বর ও পেমেন্ট ID পাঠানো হয়।",
  "Each assigned user can complete their own part. If a co-user pays less, the short amount stays with the lead user automatically.": "প্রত্যেকে নিজের অংশ সম্পন্ন করবে; ঘাটতি লিড ইউজারের কাছে থাকবে।",
  "Each payment account has an Account User and a Personal, Agent or Merchant type. Agent Access controls who can use it.": "প্রতিটি অ্যাকাউন্টের ইউজার, ধরন ও Agent Access আছে।",
  "Binance confirms that Business is closed. Start Business, set Merchant Online and activate this advertisement now?": "Business চালু করে Merchant Online দিয়ে বিজ্ঞাপন সক্রিয় করবেন?",
  "Binance P2P merchant status is not active. Turn Business ON, Break OFF and Online ON, then publish again.": "Business ON, Break OFF ও Online ON করে আবার প্রকাশ করুন।",
  "Binance API key Trading is OFF. Enable Trading in Binance API Management, then publish this draft again.": "Binance API Trading চালু করে আবার প্রকাশ করুন।",
  "The buyer marked the order as paid. Confirm receipt in your payment account before releasing the asset.": "ক্রেতা পেইড মার্ক করেছে। অ্যাসেট রিলিজের আগে টাকা নিশ্চিত করুন।",
  "Delete this advertisement? It will be closed on Binance first and then removed from the dashboard.": "বিজ্ঞাপনটি Binance-এ বন্ধ করে ড্যাশবোর্ড থেকে সরাবেন?",
  "Clear the Binance account trading lock or abnormal account state before using merchant controls.": "Merchant control ব্যবহারের আগে Binance account lock সমাধান করুন।",
  "Break mode will pause advertisements and disable the other controls until Break is turned off.": "Break mode বিজ্ঞাপন ও কন্ট্রোল সাময়িক বন্ধ রাখবে।",
  "No split yet. Add payment split, select wallet/account, then update actual amount and proof.": "এখনো স্প্লিট নেই। স্প্লিট, অ্যাকাউন্ট, প্রকৃত পরিমাণ ও প্রুফ দিন।",
  "You have marked the order as paid, please wait for seller to confirm and release the asset.": "পেইড মার্ক হয়েছে। বিক্রেতার নিশ্চিতকরণ ও রিলিজের অপেক্ষা করুন।",
  "Hosting browser verification interrupted the API. Reloading the page once automatically...": "Hosting verification-এর কারণে API থেমেছে। পেজ রিলোড হচ্ছে...",
  "Browser blocked the custom sound. Click Test once after choosing the file, then try again.": "Browser সাউন্ড ব্লক করেছে। ফাইল বেছে Test চাপুন।",
  "Payment details have now been shared with the counterparty for the payment to be made.": "পেমেন্টের তথ্য কাউন্টারপার্টির সঙ্গে শেয়ার হয়েছে।",
  "No active payment account found. Add or activate an account from Payment Accounts first.": "সক্রিয় পেমেন্ট অ্যাকাউন্ট নেই। আগে অ্যাকাউন্ট যোগ বা চালু করুন।",
  "This payment account is not active. Hold or inactive accounts cannot be used in splits.": "এই পেমেন্ট অ্যাকাউন্ট সক্রিয় নয়।",
  "Payment-account access follows permissions and explicit account grants.": "পেমেন্ট অ্যাকাউন্ট অ্যাক্সেস শুধু পারমিশন ও স্পষ্ট অ্যাকাউন্ট গ্র্যান্ট অনুযায়ী হবে।",
  "Checked linked users can use this account only when their permissions also allow it.": "নির্বাচিত লিংকড ইউজার পারমিশন অনুমতি দিলেই এই অ্যাকাউন্ট ব্যবহার করতে পারবে।",
  "Co-agent work completed. Remaining and lead payment details updated in realtime.": "Co-agent কাজ সম্পন্ন; বাকি তথ্য আপডেট হয়েছে।",
  "Custom sound is too large for browser storage. Please use a file under 2.5 MB.": "সাউন্ড ফাইল ২.৫ MB-এর কম দিন।",
  "Before final action, actual amount, proof and mismatch rules will be checked.": "ফাইনাল অ্যাকশনের আগে পরিমাণ, প্রুফ ও mismatch চেক হবে।",
  "Delete this entry? Any linked BDT wallet movement will also be restored.": "এন্ট্রি ডিলিট করলে যুক্ত BDT wallet movement ফিরবে।",
  "Closing business will take active advertisements offline. Continue?": "Business বন্ধ করলে বিজ্ঞাপন offline হবে। চালিয়ে যাবেন?",
  "Advertisement closed on Binance and removed from the dashboard.": "বিজ্ঞাপন Binance-এ বন্ধ করে ড্যাশবোর্ড থেকে সরানো হয়েছে।",
  "Add a proof screenshot or transaction ID before saving Payment Split.": "Payment Split সেভের আগে প্রুফ বা Transaction ID দিন।",
  "Tap a number to send it and set it as this order's payment account.": "নম্বর চাপলে পাঠানো ও পেমেন্ট অ্যাকাউন্ট হিসেবে সেট হবে।",
  "Custom sound could not be played. Use a small MP3, WAV or OGG file.": "কাস্টম সাউন্ড চালেনি। ছোট audio file ব্যবহার করুন।",
  "Sending test email with the currently saved settings...": "সেভ করা সেটিংসে টেস্ট ইমেইল পাঠানো হচ্ছে...",
  "Upload a custom sound file first, or choose a built-in sound.": "কাস্টম sound file দিন বা built-in sound নিন।",
  "Seller has placed an order, please pay within the time limit.": "বিক্রেতা অর্ডার করেছে। সময়ের মধ্যে পেমেন্ট করুন।",
  "Amount must be greater than zero before saving Payment Split.": "Payment Split পরিমাণ শূন্যের বেশি হতে হবে।",
  "Unsupported files were skipped. Use image, MP4, WebM or MOV.": "অসমর্থিত ফাইল বাদ গেছে। Image, MP4, WebM বা MOV দিন।",
  "Your verification is complete. Please proceed with the payment.": "ভেরিফিকেশন সম্পন্ন। পেমেন্ট করুন।",
  "Please mark the order as paid after completing the transfer.": "ট্রান্সফার শেষে অর্ডার পেইড মার্ক করুন।",
  "Manager approval required. Request added to Approval Queue.": "Manager approval প্রয়োজন; রিকোয়েস্ট কিউতে গেছে।",
  "Enter one account number per line to build the serial list.": "প্রতি লাইনে একটি অ্যাকাউন্ট নম্বর দিন।",
  "Could not read this audio file. Please choose another file.": "Audio file পড়া যায়নি। অন্য ফাইল দিন।",
  "Add at least one account number.": "অন্তত একটি অ্যাকাউন্ট নম্বর দিন।",
  "Advertisement saved as a private draft.": "বিজ্ঞাপন private draft হিসেবে সেভ হয়েছে।",
  "Secret code must be exactly 6 digits.": "সিক্রেট কোড ঠিক ৬ ডিজিট হতে হবে।",
  "Enter the complete 6-digit email OTP.": "সম্পূর্ণ ৬ ডিজিট ইমেইল OTP দিন।",
  "You can request a new email OTP now.": "এখন নতুন ইমেইল OTP চাইতে পারবেন।",
  "Check your email and enter the OTP.": "ইমেইল দেখে OTP দিন।",
  "Image is still too large after compression. Use a smaller image.": "কমপ্রেসের পরও ছবি বড়। ছোট ছবি দিন।",
  "Only PNG, JPG, WebP, MP4, WebM or MOV media is allowed.": "শুধু PNG, JPG, WebP, MP4, WebM বা MOV চলবে।",
  "Image size must be 10MB or less.": "ছবির সাইজ ১০MB বা কম হতে হবে।",
  "Custom notification sound cleared.": "কাস্টম নোটিফিকেশন সাউন্ড মুছে গেছে।",
  "Additional Verification completed.": "অতিরিক্ত ভেরিফিকেশন সম্পন্ন।",
  "Payment numbers could not be loaded.": "পেমেন্ট নম্বর লোড হয়নি।",
  "Could not mark notifications as read.": "নোটিফিকেশন read মার্ক করা যায়নি।",
  "Could not save manual feedback.": "ম্যানুয়াল ফিডব্যাক সেভ হয়নি।",
  "Could not switch P2P API profile.": "P2P API প্রোফাইল বদলানো যায়নি।",
  "Payment number could not be sent.": "পেমেন্ট নম্বর পাঠানো যায়নি।",
  "Internal note could not be saved.": "ইন্টারনাল নোট সেভ হয়নি।",
  "Active co-agent assignment was not found.": "সক্রিয় co-agent assignment পাওয়া যায়নি।",
  "Binance counterparty stats synced.": "Binance কাউন্টারপার্টি stats সিঙ্ক হয়েছে।",
  "Approval request sent to manager:": "Manager-কে approval request পাঠানো হয়েছে:",
  "Advertisement created on Binance.": "Binance-এ বিজ্ঞাপন তৈরি হয়েছে।",
  "Advertisement published to Binance.": "Binance-এ বিজ্ঞাপন প্রকাশ হয়েছে।",
  "No payment account is available.": "কোনো পেমেন্ট অ্যাকাউন্ট নেই।",
  "No payment accounts have been added yet.": "এখনো পেমেন্ট অ্যাকাউন্ট যোগ হয়নি।",
  "No stored extension data found.": "Extension-এর সেভ করা ডাটা নেই।",
  "No feedback has been collected in this category.": "এই ক্যাটাগরিতে ফিডব্যাক নেই।",
  "No Binance API profile is assigned to this user.": "এই ইউজারের Binance API প্রোফাইল নেই।",
  "P2PFlow stores only the public verification key.": "P2PFlow শুধু public verification key রাখে।"
}
);


Object.assign(I18N_BN, {
  "Server and connection status.": "সার্ভার ও সংযোগ স্ট্যাটাস।",
  "API keys are stored encrypted.": "API key এনক্রিপ্টেড থাকে।",
  "Payment routing rules.": "পেমেন্ট রাউটিং নিয়ম।",
  "All business reports.": "সব ব্যবসার রিপোর্ট।",
  "Users and permissions.": "ইউজার ও অনুমতি।",
  "Capital, profit and accounting.": "মূলধন, লাভ ও হিসাব।",
  "Expense history.": "খরচের ইতিহাস।",
  "Income history.": "আয়ের ইতিহাস।",
  "Capital history.": "মূলধনের ইতিহাস।",
  "Daily closing history.": "দৈনিক ক্লোজিং ইতিহাস।",
  "Approval requests.": "অনুমোদন রিকোয়েস্ট।",
  "Application settings.": "অ্যাপ সেটিংস।",
  "System alerts.": "সিস্টেম অ্যালার্ট।",
  "Role permissions.": "রোল অনুমতি।",
  "User activity.": "ইউজার কার্যক্রম।",
  "Balance history.": "ব্যালেন্স ইতিহাস।",
  "Profile and security.": "প্রোফাইল ও সিকিউরিটি।",
  "Action history.": "অ্যাকশন ইতিহাস।",
  "Extension connection.": "Extension সংযোগ।",
  "Capacity Guard checks active account limits.": "Capacity Guard সক্রিয় অ্যাকাউন্ট সীমা চেক করে।",
  "Presence updates automatically.": "উপস্থিতি অটো আপডেট হয়।",
  "Work Status controls auto-assignment.": "কাজের অবস্থা অটো অ্যাসাইন নিয়ন্ত্রণ করে।",
  "Online status updates automatically.": "অনলাইন স্ট্যাটাস অটো আপডেট হয়।",
  "Open orders sync automatically.": "চলমান অর্ডার অটো সিঙ্ক হয়।",
  "Each transfer deducts its charge once.": "প্রতিটি ট্রান্সফারে চার্জ একবার কাটে।",
  "Payment details will appear after sync.": "সিঙ্কের পর পেমেন্ট তথ্য দেখাবে।",
  "Only code changes; business data stays.": "শুধু কোড বদলাবে; ব্যবসার ডাটা থাকবে।",
  "A backup is created before restart.": "রিস্টার্টের আগে ব্যাকআপ হবে।",
  "Token is stored encrypted.": "টোকেন এনক্রিপ্টেড থাকে।",
  "This key signs GitHub releases.": "এই key GitHub রিলিজ sign করে।",
  "Backup complete. Restarting P2PFlow.": "ব্যাকআপ সম্পন্ন। P2PFlow রিস্টার্ট হচ্ছে।",
  "Restart is slow. Check the hosting log.": "রিস্টার্ট ধীর। হোস্টিং লগ দেখুন।",
  "Push to GitHub, then check here.": "GitHub-এ push করে এখানে চেক করুন।",
  "Upload to GitHub, then check.": "GitHub-এ আপলোড করে চেক করুন।",
  "Business data stays in the database.": "ব্যবসার ডাটা ডাটাবেসে থাকবে।"
}
);

const UI_SHORT_COPY = {
  "Server connectivity, local mail, storage, session and Binance diagnostics without terminal access.": "Server and connection status.",
  "API keys are stored in the encrypted DB and are never shown again after saving.": "API keys are stored encrypted.",
  "Decide which user receives orders for each payment method using priority, amount range and capacity guard.": "Payment routing rules.",
  "Daily, monthly, yearly, lifetime and custom date range reports.": "All business reports.",
  "Employees, managers, auditors and exact permission rules in one admin panel.": "Users and permissions.",
  "Owner cash-flow profit and User/Agent performance — expenses, income, capital and closing are in separate subpages.": "Capital, profit and accounting.",
  "Expense totals, categories and transaction history.": "Expense history.",
  "Other business income categories and complete transaction history.": "Income history.",
  "Capital add, owner withdrawal/family expense and complete capital transaction history.": "Capital history.",
  "Automatic 23:59:59 snapshots, manual close controls and closing history.": "Daily closing history.",
  "Manager approval queue for high amount, mismatch and missing proof final actions.": "Approval requests.",
  "Approval, login verification, local mail, SMTP fallback, notification sound and activity controls.": "Application settings.",
  "Order assignment, security and system alerts.": "System alerts.",
  "Create role templates and assign permission rules to users.": "Role permissions.",
  "Live presence without reload, login duration, app-open time, engagement, idle/background time, page usage and audited work actions.": "User activity.",
  "Every balance movement shows source, before/after balance, order reference and note.": "Balance history.",
  "Binance API owner P2P information, feedback and login security.": "Profile and security.",
  "Immutable action history for payment split, statement, assignment and security events.": "Action history.",
  "Token, URL, pending tasks and locally collected P2P data": "Extension connection.",
  "The SMTP password is never returned to the browser or written to audit logs. It is stored only inside the encrypted database. In Local mode, SMTP remains the final automatic fallback when PHP mail/sendmail is unavailable.": "SMTP password is stored encrypted.",
  "Binance BUY paid mark reduces selected account balance through split actual entries. Binance SELL release increases selected account balance through received entries. Offline business entries are recorded separately.": "BUY deducts balance; SELL adds received balance.",
  "When Capacity Guard is ON, the system checks active account capacity. When OFF, assignment uses only method + priority; balance/limit is checked later on the split selection screen.": "Capacity Guard checks active account limits.",
  "Presence is monitored from heartbeat, visibility, focus and interaction. Auto-assignment is controlled by each Agent’s Work Status switch, not by online/offline presence.": "কাজের অবস্থা অটো অ্যাসাইন নিয়ন্ত্রণ করে; অনলাইন/অফলাইন উপস্থিতি করে না।",
  "Online state is automatic. Active means visible, focused and recently used; away means the page is in the background; idle means open without recent interaction.": "Online status updates automatically.",
  "The server refreshes every open Binance order detail even when no user is logged in. List and detail views receive the result through live events.": "Open orders sync automatically.",
  "Each split transfer calculates and deducts its own charge immediately. Manual actual charge entered on a split overrides the configured estimate.": "Each transfer deducts its charge once.",
  "Payment details are not available yet. The background sync will update this section automatically when Binance returns the selected payment method.": "Payment details will appear after sync.",
  "Only application code changes. Current orders, ledger, accounting and database records remain unchanged.": "Only code changes; business data stays.",
  "P2PFlow will finish active writes, create a database backup, activate the verified release and restart.": "A backup is created before restart.",
  "The read-only token is encrypted inside the application database.": "Token is stored encrypted.",
  "This key signs every production release created by GitHub Actions.": "This key signs GitHub releases.",
  "Database backup is complete. P2PFlow is restarting with the verified code.": "Backup complete. Restarting P2PFlow.",
  "Restart is taking longer than expected. Check the hosting application log, then reload this page.": "Restart is slow. Check the hosting log.",
  "Push the next version to GitHub, then press Check Now.": "Push to GitHub, then check here.",
  "Upload the next source version to GitHub and press Check Now.": "Upload to GitHub, then check.",
  "Orders, ledger, accounting, users and settings stay in the database. Code rollback never deletes later transactions.": "Business data stays in the database.",
  "If DNS is OK but HTTPS/fetch fails, send this health-check detail to hosting support. No API secret or OTP is shown here.": "Send this result to hosting support if the connection fails.",
  "Connect & Save validates the credential and performs a live Binance check before it is stored. Disable stops a credential from being used; Delete permanently removes its API key and secret from encrypted storage.": "সংযোগ ও সংরক্ষণের আগে তথ্য যাচাই এবং সরাসরি বিন্যান্স সংযোগ পরীক্ষা করে।",
  "For a bKash order, only bKash routing rules are checked. Nagad rules will not receive bKash orders.": "Only matching payment-method rules are used.",
  "Priority 1 is tried first, then Priority 2. If priority is same, the user with fewer active orders is selected first.": "Lower priority number is checked first.",
  "The user is assigned only when amount range, max active orders and capacity guard match. Otherwise the next route is tried.": "Limits and capacity are checked before assignment.",
  "Custom sound stays in this browser.": "Custom sound stays in this browser.",
  "Verify the counterparty before payment or release.": "Verify the counterparty before payment or release.",
  "": "",
  "No API credential is assigned.": "No API credential is assigned.",
  "Select the API profiles this user can access.": "Select the API profiles this user can access.",
  "Create an Agent first.": "Create an Agent first.",
  "Unchecked accounts remain unavailable unless explicitly granted.": "Unchecked accounts remain unavailable unless explicitly granted.",
  "Sync imports orders only; it never pays or releases.": "Sync imports orders only; it never pays or releases.",
  "No assigned payment account is available.": "No assigned payment account is available.",
  "Proof is required before the final action.": "Proof is required before the final action.",
  "Enter the completed amount and proof.": "Enter the completed amount and proof.",
  "API secrets are stored encrypted and never shown again.": "API secrets are stored encrypted and never shown again.",
  "Password, email and secret changes require verification through your current email.": "Email verification is required for security changes.",
  "Account balance is not edited directly. Every transaction creates a statement entry. Formula: <b>Opening + Receive/Topup - Send/Cashout/Expense ± Correction = Current Balance</b>.": "Every transaction creates a statement entry.",
  "Binance BUY paid mark reduces selected account balance through split actual entries. Binance SELL release increases selected account balance through received entries. Offline business entries are recorded separately.": "BUY deducts; SELL adds received balance.",
  "Used only to value BDT capital when no completed BUY actual yield exists.": "Used only when no completed BUY rate exists.",
  "Collected local data is shared by userNo for everyone who can view/manage orders. Old cache is purged daily at 11:59 PM server time.": "Data is shared by user number and old cache clears daily.",
  "Approval allows the selected final action. In Live API mode, the approved action will call Binance markOrderAsPaid or releaseCoin.": "Approval permits the selected final action.",
  "Manager is active — আপনি এই ফাংশনগুলো ব্যবহার করতে পারবেন না।": "Manager is active; advertisement controls are locked.",
  "Advertisement controls are available.": "Advertisement controls are ready.",
  "Adding counterparty requirements will reduce the exposure of your Ad.": "Conditions may reduce ad visibility.",
  "The SMTP password is never returned to the browser or written to audit logs. It is stored only inside the encrypted database. In Local mode, SMTP remains the final automatic fallback when PHP mail/sendmail is unavailable.": "SMTP password is stored encrypted.",
  "API Mode live হলে approved final action সরাসরি Binance C2C SAPI call করবে. API credential, payId এবং release auth code সঠিক না হলে action fail হবে; secret কখনো UI/audit-এ দেখানো হবে না.": "Live API actions require valid Binance credentials."
};

Object.assign(I18N_BN, {
  'Offline Business':'অফলাইন ব্যবসা',
  'Create Receipt Session':'রিসিভ সেশন তৈরি করুন',
  'Pending numbers stay reserved and cannot be used by another offline receipt session.':'পেন্ডিং নম্বরগুলো রিজার্ভ থাকবে এবং অন্য অফলাইন রিসিভ সেশনে ব্যবহার করা যাবে না।',
  'Requested':'রিকোয়েস্টেড',
  'Planned':'পরিকল্পিত',
  'Received':'রিসিভড',
  'Partially Received':'আংশিক রিসিভড',
  'Ready':'প্রস্তুত',
  'Finalized':'ফাইনাল হয়েছে',
  'Finalized Partial':'আংশিক ফাইনাল হয়েছে',
  'Create Offline Order':'অফলাইন অর্ডার তৈরি করুন',
  'Create Partial Order':'আংশিক অর্ডার তৈরি করুন',
  'Open Order':'অর্ডার খুলুন',
  'Create Offline Receipt Session':'অফলাইন রিসিভ সেশন তৈরি করুন',
  'Requested Amount':'রিকোয়েস্টেড অ্যামাউন্ট',
  'Per Number Limit':'প্রতি নম্বর লিমিট',
  'Reference':'রেফারেন্স',
  'Customer / Counterparty':'কাস্টমার / কাউন্টারপার্টি',
  'Search Number, Label or Serial':'নম্বর, লেবেল বা সিরিয়াল সার্চ করুন',
  'Find Eligible Numbers':'যোগ্য নম্বর খুঁজুন',
  'Reserve Numbers & Create Session':'নম্বর রিজার্ভ করে সেশন তৈরি করুন',
  'Receive Available':'রিসিভ অ্যাভেইলেবল',
  'Suggested':'প্রস্তাবিত',
  'No offline receipt session yet.':'এখনো কোনো অফলাইন রিসিভ সেশন নেই।',
  'No eligible unreserved payment number found in your permission scope.':'আপনার পারমিশন স্কোপে কোনো যোগ্য ও আনরিজার্ভড পেমেন্ট নম্বর পাওয়া যায়নি।',
  'Notifications':'নোটিফিকেশন',
  'Notification Preferences':'নোটিফিকেশন পছন্দ',
  'Choose which notification groups appear inside the panel and which are sent to your email.':'কোন নোটিফিকেশন প্যানেলে দেখাবেন এবং কোনগুলো ইমেইলে পাবেন তা নির্বাচন করুন।',
  'Save Preferences':'পছন্দ সেভ করুন',
  'Notification Group':'নোটিফিকেশন গ্রুপ',
  'In App':'অ্যাপে',
  'Email':'ইমেইল',
  'Required for security':'সিকিউরিটির জন্য বাধ্যতামূলক',
  'Notification History':'নোটিফিকেশন হিস্ট্রি',
  'Only notification categories enabled for this user are shown.':'এই ইউজারের জন্য চালু থাকা নোটিফিকেশন ক্যাটাগরিগুলোই দেখানো হচ্ছে।',
  'Category':'ক্যাটাগরি',
  'Read':'পড়া হয়েছে',
  'Unread':'অপঠিত',
  'Label':'লেবেল',
  'Serial Number':'সিরিয়াল নম্বর',
  'Starting Serial':'শুরুর সিরিয়াল',
  'Default Label':'ডিফল্ট লেবেল',
  'Apply Defaults':'ডিফল্ট প্রয়োগ করুন',
  'Account Preview':'অ্যাকাউন্ট প্রিভিউ',
  'Search number, label or serial':'নম্বর, লেবেল বা সিরিয়াল সার্চ করুন',
  'All payment accounts':'সব পেমেন্ট অ্যাকাউন্ট',
  'Your own and assigned payment accounts':'আপনার নিজস্ব ও অ্যাসাইনড পেমেন্ট অ্যাকাউন্ট',
  'Statement Entry':'স্টেটমেন্ট এন্ট্রি',
  'Manage own payment accounts':'নিজস্ব পেমেন্ট অ্যাকাউন্ট ম্যানেজ',
  'Manage all payment accounts':'সব পেমেন্ট অ্যাকাউন্ট ম্যানেজ',
  'Payment account statement adjustment':'পেমেন্ট অ্যাকাউন্ট স্টেটমেন্ট অ্যাডজাস্টমেন্ট',
  'Offline business receipt workflow':'অফলাইন ব্যবসার রিসিভ ওয়ার্কফ্লো',
  'Open Feedback Page':'ফিডব্যাক পেজ খুলুন',
  'Permission details':'পারমিশনের বিস্তারিত'
});

const I18N_BN_PATTERNS = [
  [/^Version\s+(.+)\s+is ready$/i, 'ভার্সন $1 প্রস্তুত'],
  [/^Version\s+(.+)$/i, 'ভার্সন $1'],
  [/^Installing version\s+(.+)$/i, 'ভার্সন $1 ইনস্টল হচ্ছে'],
  [/^Latest release:\s*(.+)$/i, 'সর্বশেষ রিলিজ: $1'],
  [/^Published\s+(.+)$/i, 'প্রকাশ: $1'],
  [/^Checked\s+(.+)$/i, 'চেক: $1'],
  [/^Schema\s+(.+)$/i, 'স্কিমা $1'],
  [/^(\d+)\s+accounts?$/i, '$1 অ্যাকাউন্ট'],
  [/^(\d+)\s+users?$/i, '$1 ইউজার'],
  [/^(\d+)\s+orders?$/i, '$1 অর্ডার'],
  [/^(\d+)\s+unread$/i, '$1 অপঠিত'],
  [/^(\d+)\s+reviews?$/i, '$1 রিভিউ'],
  [/^No newer published production release is currently available\.?$/i, 'নতুন রিলিজ নেই।'],
  [/^No new release found\.?$/i, 'নতুন রিলিজ পাওয়া যায়নি।'],
  [/^Release check complete\.?$/i, 'রিলিজ চেক সম্পন্ন।'],
  [/^Order\s+(.+)\s+updated$/i, 'অর্ডার $1 আপডেট হয়েছে'],
  [/^New Order\s+(.+)$/i, 'নতুন অর্ডার $1'],
  [/^Status:\s*(.+)\s*->\s*(.+)$/i, 'স্ট্যাটাস: $1 → $2'],
  [/^Connecting to\s+(.+)$/i, '$1-এ সংযোগ হচ্ছে'],
  [/^Request failed\s*\((.+)\)$/i, 'রিকোয়েস্ট ব্যর্থ ($1)'],
  [/^Network request failed for\s+(.+):/i, '$1 নেটওয়ার্ক রিকোয়েস্ট ব্যর্থ:'],
  [/^No\s+(.+)\s+found\.?$/i, 'কোনো $1 পাওয়া যায়নি।'],
  [/^(.+)\s+required\.?$/i, '$1 প্রয়োজন।'],
  [/^Positive\s*\((\d+)\)$/i, 'পজিটিভ ($1)'],
  [/^Negative\s*\((\d+)\)$/i, 'নেগেটিভ ($1)'],
  [/^(\d+)\s+transaction\(s\)$/i, '$1 লেনদেন'],
  [/^(\d+)\s+rows?$/i, '$1 সারি'],
  [/^(\d+)\s+active today\s*·\s*(\d+)\s+actions?$/i, 'আজ $1 সক্রিয় · $2 কাজ'],
  [/^(.+)\s+saved\.?$/i, '$1 সেভ হয়েছে।'],
  [/^(.+)\s+deleted\.?$/i, '$1 ডিলিট হয়েছে।'],
  [/^Trade:\s*(\d+)\s+Trades\s*\(([^)]*)\)$/i, 'ট্রেড: $1 ($2)'],
  [/^Owner Profit:\s*(.+)$/i, 'Owner লাভ: $1'],
  [/^(\d+)\s+active today\s*·\s*(\d+)\s+actions$/i, 'আজ $1 সক্রিয় · $2 কাজ'],
  [/^(\d+)\s+accounts\s*·\s*(.+)$/i, '$1 অ্যাকাউন্ট · $2'],
  [/^Agent\s+(\d+)$/i, 'এজেন্ট $1'],
  [/^User\s+(\d+)$/i, 'ইউজার $1'],
  [/^(\d+)\s+tier\(s\)$/i, '$1 স্তর'],
  [/^(\d+)\s+Minute\(s\)$/i, '$1 মিনিট'],
  [/^(\d+)\s+Day\(s\) ago$/i, '$1 দিন আগে'],
  [/^OTP digit\s+([1-6])$/i, 'OTP ঘর $1']
];

function compactUiText(text) {
  const raw = String(text ?? '');
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const short = UI_SHORT_COPY[trimmed];
  return short ? raw.replace(trimmed, short) : raw;
}

function translateBnPhrase(text) {
  const exact = I18N_BN[text];
  if (exact) return exact;
  const roleNames = { admin:'অ্যাডমিন', manager:'ম্যানেজার', agent:'এজেন্ট', auditor:'অডিটর', owner:'Owner' };
  const roleMatch = text.match(/^(.+?)\s+\/\s+(admin|manager|agent|auditor|owner)$/i);
  if (roleMatch) return `${roleMatch[1]} / ${roleNames[roleMatch[2].toLowerCase()]}`;
  const wrappedStatus = text.match(/^(.+?)\s+\((active|inactive|online|offline|idle|away|hold|limit_full|completed|pending)\)$/i);
  if (wrappedStatus) return `${wrappedStatus[1]} (${I18N_BN[wrappedStatus[2].toLowerCase()] || wrappedStatus[2]})`;
  for (const [pattern, replacement] of I18N_BN_PATTERNS) {
    if (pattern.test(text)) return text.replace(pattern, replacement);
  }
  return text;
}

function trText(text) {
  const compacted = compactUiText(text);
  const raw = String(compacted ?? '');
  const trimmed = raw.trim();
  if (!trimmed || state.lang !== 'bn') return raw;
  const translated = translateBnPhrase(trimmed);
  return translated === trimmed ? raw : raw.replace(trimmed, translated);
}

function languageRoot(root=document) {
  return root?.body || root || document;
}

function languageElements(root, selector) {
  const base = languageRoot(root);
  const out = [];
  if (base?.matches?.(selector)) out.push(base);
  if (base?.querySelectorAll) out.push(...base.querySelectorAll(selector));
  return out;
}

function applyLanguage(root=document) {
  if (!root || state.applyingLanguage) return;
  state.applyingLanguage = true;
  try {
    document.documentElement.lang = state.lang === 'bn' ? 'bn' : 'en';
    document.body.classList.toggle('lang-bn', state.lang === 'bn');
    document.body.classList.toggle('lang-en', state.lang !== 'bn');
    document.body.classList.add('compact-copy');
    const btn = document.querySelector('#langToggle');
    const loginBtn = document.querySelector('#loginLangToggle');
    [btn, loginBtn].filter(Boolean).forEach(toggle => {
      const isBn = state.lang === 'bn';
      toggle.setAttribute('aria-checked', isBn ? 'true' : 'false');
      toggle.classList.toggle('is-bn', isBn);
      toggle.setAttribute('title', isBn ? 'ইংরেজিতে যান' : 'বাংলায় পরিবর্তন করুন');
      toggle.setAttribute('aria-label', isBn ? 'ইংরেজিতে যান' : 'বাংলায় পরিবর্তন করুন');
    });

    const base = languageRoot(root);
    const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || ['SCRIPT','STYLE','TEXTAREA','INPUT','CODE','PRE'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const current = node.nodeValue;
      if (node.__i18nOriginal === undefined || current !== node.__i18nLastApplied) node.__i18nOriginal = current;
      const next = trText(node.__i18nOriginal);
      node.__i18nLastApplied = next;
      if (current !== next) node.nodeValue = next;
    });

    const attrSelectors = '[placeholder], [title], [aria-label], [data-label]';
    languageElements(base, attrSelectors).forEach(el => {
      el.__i18nAttrs = el.__i18nAttrs || {};
      for (const attr of ['placeholder','title','aria-label','data-label']) {
        if (!el.hasAttribute(attr)) continue;
        const current = el.getAttribute(attr) || '';
        const rec = el.__i18nAttrs[attr] || {};
        if (rec.original === undefined || current !== rec.lastApplied) rec.original = current;
        const next = trText(rec.original);
        rec.lastApplied = next;
        el.__i18nAttrs[attr] = rec;
        if (current !== next) el.setAttribute(attr, next);
      }
    });

    languageElements(base, 'input[type="button"][value], input[type="submit"][value]').forEach(el => {
      const current = el.value || '';
      if (el.__i18nValueOriginal === undefined || current !== el.__i18nValueLastApplied) el.__i18nValueOriginal = current;
      const next = trText(el.__i18nValueOriginal);
      el.__i18nValueLastApplied = next;
      if (current !== next) el.value = next;
    });

    const originalTitle = document.documentElement.dataset.i18nTitleOriginal || document.title;
    document.documentElement.dataset.i18nTitleOriginal = originalTitle;
    document.title = state.lang === 'bn' ? 'P2PFlow | অপারেশন প্যানেল' : 'P2PFlow | Operations Panel';
    syncLoginLanguage();
  } finally {
    state.applyingLanguage = false;
  }
}

let languageMutationObserver = null;
let languageMutationTimer = null;
function setupLanguageObserver() {
  if (languageMutationObserver || !document.body) return;
  languageMutationObserver = new MutationObserver(mutations => {
    if (state.applyingLanguage) return;
    const roots = new Set();
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) roots.add(node);
      else if (node.parentElement) roots.add(node.parentElement);
    }));
    if (!roots.size) return;
    clearTimeout(languageMutationTimer);
    languageMutationTimer = setTimeout(() => roots.forEach(node => applyLanguage(node)), 20);
  });
  languageMutationObserver.observe(document.body, { childList: true, subtree: true });
}

function setupLanguageControls() {
  ['#langToggle','#loginLangToggle'].forEach(sel => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.onclick = () => {
      state.lang = state.lang === 'bn' ? 'en' : 'bn';
      localStorage.setItem('crmLang', state.lang);
      applyLanguage();
      renderSidebarMeta();
      renderMobileBottomNav();
    };
  });
  setupLanguageObserver();
  applyLanguage();
}


function setConnectivityStatus(isOffline = false) {
  const status = $('#liveStatus');
  const offline = Boolean(isOffline);
  if (status) {
    status.textContent = state.lang === 'bn' ? 'অফলাইন' : 'Offline';
    status.classList.toggle('hidden', !offline);
    status.classList.toggle('offline', offline);
  }
  renderSidebarMeta();
}

function setupConnectivityStatus() {
  const sync = () => setConnectivityStatus(navigator.onLine === false);
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}

function notificationCenterItemHtml(item={}) {
  const kind = String(item.kind || 'notification');
  const orderId = Number(item.orderId || 0);
  const notificationId = Number(item.notificationId || item.id || 0);
  const normalizedChat = kind === 'chat' ? normalizeChatDisplayMessage(item.message || '', item.messageType || '') : null;
  const isSystemChat = Boolean(normalizedChat?.isSystem);
  const title = escapeHtml(isSystemChat ? (normalizedChat.systemTitle || chatLocaleText('System update', 'সিস্টেম আপডেট')) : (item.title || (kind === 'chat' ? 'New message' : 'Notification')));
  const message = escapeHtml(isSystemChat ? (normalizedChat.systemText || normalizedChat.text || '') : (normalizedChat?.text || item.message || ''));
  const count = Number(item.count || 0);
  const metaParts = [item.orderNo ? `#${escapeHtml(item.orderNo)}` : '', count > 1 ? `${count} unread` : '', item.createdAt ? fmt(item.createdAt) : ''].filter(Boolean);
  const meta = metaParts.join(' · ');
  const icon = kind === 'chat' ? '💬' : (String(item.type || '').includes('internal_note') ? '📝' : '🔔');
  const kindClass = kind === 'chat' ? 'is-chat' : 'is-notification';
  const copy = kind === 'chat'
    ? `<span class="notification-item-copy">
        <b class="notification-chat-user">${escapeHtml(isSystemChat ? chatLocaleText('Binance system', 'Binance সিস্টেম') : (item.userName || item.senderName || 'Counterparty'))}</b>
        <small class="notification-chat-label">${title}</small>
        <span class="notification-message-preview">${message}</span>
        <small class="notification-item-meta">${meta}</small>
      </span>`
    : `<span class="notification-item-copy"><b>${title}</b><span class="notification-message-preview">${message}</span><small class="notification-item-meta">${meta}</small></span>`;
  return `<button class="notification-item ${kindClass}" type="button" data-notification-kind="${escapeAttr(kind)}" data-notification-id="${notificationId || ''}" data-notification-order-id="${orderId || ''}">
    <span class="notification-item-icon" aria-hidden="true">${icon}</span>
    ${copy}
  </button>`;
}

function renderHeaderNotificationCenter(data={}) {
  const total = Math.max(0, Number(data.total || 0));
  const items = Array.isArray(data.items) ? data.items : [];
  state.notificationCenterData = { total, items };
  if (typeof refreshNavBadges === 'function') refreshNavBadges();
  const badge = $('#notificationBadge');
  const panel = $('#notificationPanel');
  const button = $('#notificationBtn');
  if (badge) {
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.classList.toggle('hidden', total <= 0);
  }
  if (button) button.setAttribute('aria-label', total > 0 ? `Notifications, ${total} unread` : 'Notifications');
  if (panel) {
    panel.innerHTML = `<div class="notification-panel-head">
        <b>Notifications</b>
        <div class="notification-panel-head-actions">
          <span>${total} unread</span>
          ${total > 0 ? '<button class="notification-mark-all" id="notificationMarkAllBtn" type="button">Mark all read</button>' : ''}
        </div>
      </div>
      <div class="notification-panel-list">${items.length ? items.map(notificationCenterItemHtml).join('') : '<div class="notification-empty">No new notifications</div>'}</div>
      <button class="notification-view-all" id="notificationViewAllBtn" type="button">View all alerts</button>`;
    panel.querySelectorAll('[data-notification-kind]').forEach(item => {
      item.onclick = async () => {
        const notificationId = Number(item.dataset.notificationId || 0);
        const orderId = Number(item.dataset.notificationOrderId || 0);
        const kind = item.dataset.notificationKind || 'notification';
        if (notificationId) {
          await api('/api/notifications', { method:'POST', body: JSON.stringify({ notificationId }), silent:true, noAutoReload:true }).catch(()=>{});
        }
        closeHeaderNotificationCenter();
        if (orderId) {
          if (kind === 'chat') state.pendingOpenChatOrderId = orderId;
          setRoute('orders', { orderId });
        } else {
          setRoute('notifications');
        }
        scheduleHeaderNotificationRefresh(100);
      };
    });
    const markAll = panel.querySelector('#notificationMarkAllBtn');
    if (markAll) markAll.onclick = async () => {
      markAll.disabled = true;
      try {
        await api('/api/notifications', { method:'POST', body: JSON.stringify({ markRead: true, includeChats: true }), silent:true, noAutoReload:true });
        await refreshHeaderNotificationCenter();
        if (state.page === 'notifications') await renderNotifications();
        notify('All notifications marked read.', 'ok');
      } catch (error) {
        markAll.disabled = false;
        notify(error?.message || 'Could not mark notifications as read.', 'error');
      }
    };
    const viewAll = panel.querySelector('#notificationViewAllBtn');
    if (viewAll) viewAll.onclick = () => { closeHeaderNotificationCenter(); setRoute('notifications'); };
    applyLanguage(panel);
  }
}

async function refreshHeaderNotificationCenter() {
  if (!state.user) return;
  try {
    const data = await api('/api/notification-center', { silent:true, noAutoReload:true });
    renderHeaderNotificationCenter(data);
  } catch (_) {}
}

function scheduleHeaderNotificationRefresh(delay=250) {
  clearTimeout(state.notificationRefreshTimer);
  state.notificationRefreshTimer = setTimeout(() => refreshHeaderNotificationCenter(), Math.max(0, Number(delay || 0)));
}

function closeHeaderNotificationCenter() {
  const panel = $('#notificationPanel');
  const button = $('#notificationBtn');
  if (panel) panel.classList.add('hidden');
  if (button) button.setAttribute('aria-expanded', 'false');
}

function setupHeaderNotificationCenter() {
  const center = $('#notificationCenter');
  const button = $('#notificationBtn');
  const panel = $('#notificationPanel');
  if (!center || !button || !panel || center.dataset.bound === '1') return;
  center.dataset.bound = '1';
  button.onclick = async e => {
    e.stopPropagation();
    const willOpen = panel.classList.contains('hidden');
    if (!willOpen) return closeHeaderNotificationCenter();
    await refreshHeaderNotificationCenter();
    panel.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
  };
  panel.onclick = e => e.stopPropagation();
  document.addEventListener('click', closeHeaderNotificationCenter);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHeaderNotificationCenter(); });
  refreshHeaderNotificationCenter();
  clearInterval(state.notificationPollTimer);
  state.notificationPollTimer = setInterval(refreshHeaderNotificationCenter, 20000);
}

let notificationAudioContext = null;
let notificationCustomAudio = null;
let notificationCustomAudioSrc = '';
const NOTIFICATION_SOUND_CHOICES = ['chime','bell','alert','soft','custom'];

function notificationMasterEnabled() {
  const config = state.pushConfig || {};
  return config.enabled === true && config.currentDeviceSubscribed === true;
}

function notificationCategoryEnabledOnDevice(category='orders') {
  if (!notificationMasterEnabled()) return false;
  const preferences = state.pushConfig?.preferences?.push || state.user?.notificationPreferences?.push || {};
  return preferences[String(category || 'orders')] !== false;
}

function notificationSoundChoice() {
  const value = localStorage.getItem('crmNotificationSound') || 'chime';
  return NOTIFICATION_SOUND_CHOICES.includes(value) ? value : 'chime';
}

function notificationCustomSoundData() {
  return localStorage.getItem('crmNotificationSoundCustomData') || '';
}

function notificationCustomSoundName() {
  return localStorage.getItem('crmNotificationSoundCustomName') || '';
}

function setNotificationSoundChoice(value) {
  const choice = NOTIFICATION_SOUND_CHOICES.includes(value) ? value : 'chime';
  localStorage.setItem('crmNotificationSound', choice);
  return choice;
}

function unlockNotificationAudio() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!notificationAudioContext) notificationAudioContext = new AudioContextClass();
    if (notificationAudioContext.state === 'suspended') notificationAudioContext.resume().catch(()=>{});
    return notificationAudioContext;
  } catch (_) {
    return null;
  }
}

function getCustomNotificationAudio() {
  const src = notificationCustomSoundData();
  if (!src) return null;
  if (!notificationCustomAudio || notificationCustomAudioSrc !== src) {
    notificationCustomAudioSrc = src;
    notificationCustomAudio = new Audio(src);
    notificationCustomAudio.preload = 'auto';
    notificationCustomAudio.volume = 0.9;
  }
  return notificationCustomAudio;
}

function playBuiltInNotificationSound(choice='chime') {
  const context = unlockNotificationAudio();
  if (!context) return;
  const patterns = {
    chime: [[659,0,.12,'sine',.09],[784,.14,.12,'sine',.08],[988,.28,.22,'sine',.075]],
    bell: [[880,0,.42,'sine',.08],[1760,.02,.24,'sine',.025]],
    alert: [[740,0,.11,'square',.045],[740,.17,.11,'square',.045],[988,.34,.16,'square',.04]],
    soft: [[523,0,.18,'sine',.045],[659,.18,.24,'sine',.04]]
  };
  const start = context.currentTime + .025;
  (patterns[choice] || patterns.chime).forEach(([frequency, offset, duration, wave, peak]) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start + offset);
    gain.gain.setValueAtTime(.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(peak, start + offset + .018);
    gain.gain.exponentialRampToValueAtTime(.0001, start + offset + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + duration + .03);
  });
}

function playCustomNotificationSound(showFailure=false) {
  const audio = getCustomNotificationAudio();
  if (!audio) {
    if (showFailure) notify('Upload a custom sound file first, or choose a built-in sound.', 'warn', 4500);
    return false;
  }
  try {
    audio.pause();
    audio.currentTime = 0;
    const result = audio.play();
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        if (showFailure) notify('Browser blocked the custom sound. Click Test once after choosing the file, then try again.', 'warn', 5000);
      });
    }
    return true;
  } catch (_) {
    if (showFailure) notify('Custom sound could not be played. Use a small MP3, WAV or OGG file.', 'warn', 5000);
    return false;
  }
}

function playNotificationSound(showFailure=false, options={}) {
  if (options.force !== true && !notificationCategoryEnabledOnDevice(options.category || 'orders')) return false;
  const choice = notificationSoundChoice();
  if (choice === 'custom') {
    if (playCustomNotificationSound(showFailure)) return true;
    if (showFailure) return false;
    playBuiltInNotificationSound('chime');
    return true;
  }
  playBuiltInNotificationSound(choice);
  return true;
}

function playOrderNotificationSoundOnce(orderKey, category='orders') {
  if (!notificationCategoryEnabledOnDevice(category)) return false;
  const key = String(orderKey || '').trim();
  if (key && state.seenOrderSoundKeys.has(key)) return false;
  if (key) {
    state.seenOrderSoundKeys.add(key);
    if (state.seenOrderSoundKeys.size > 300) state.seenOrderSoundKeys = new Set([...state.seenOrderSoundKeys].slice(-150));
  }
  return playNotificationSound(false, { category });
}

function notificationSoundSettingsHtml() {
  const choice = notificationSoundChoice();
  const customName = notificationCustomSoundName();
  return `<div class="full-row sound-settings-card">
    <div class="settings-section-head">
      <div><b>Notification Sound</b><span>Choose the sound used when the Notifications button is ON.</span></div>
      <button id="settingsNotificationSoundTest" type="button" class="secondary">Test Sound</button>
    </div>
    <div class="form-grid compact-grid">
      <div>
        <label>Sound Type</label>
        <select id="settingsNotificationSoundSelect" aria-label="Notification sound type">
          <option value="chime" ${choice==='chime'?'selected':''}>Chime</option>
          <option value="bell" ${choice==='bell'?'selected':''}>Bell</option>
          <option value="alert" ${choice==='alert'?'selected':''}>Alert</option>
          <option value="soft" ${choice==='soft'?'selected':''}>Soft</option>
          <option value="custom" ${choice==='custom'?'selected':''}>Custom uploaded sound</option>
        </select>
      </div>
      <div>
        <label>Custom Sound File</label>
        <input id="settingsNotificationSoundFile" type="file" accept="audio/*" />
      </div>
      <div class="full-row mini-actions">
        <button id="settingsNotificationSoundClear" type="button" class="secondary">Clear Custom Sound</button>
        <span id="settingsNotificationSoundStatus" class="sub">${customName ? `Custom file: ${escapeHtml(customName)}` : 'No custom sound selected.'}</span>
      </div>
    </div>
    <div class="notice sound-settings-note">Custom sound stays in this browser.</div>
  </div>`;
}

function refreshNotificationSoundSettingsPanel() {
  const select = $('#settingsNotificationSoundSelect');
  const status = $('#settingsNotificationSoundStatus');
  if (select) select.value = notificationSoundChoice();
  if (status) {
    const name = notificationCustomSoundName();
    status.textContent = name ? `Custom file: ${name}` : 'No custom sound selected.';
  }
}

function bindNotificationSoundSettings() {
  const select = $('#settingsNotificationSoundSelect');
  const test = $('#settingsNotificationSoundTest');
  const file = $('#settingsNotificationSoundFile');
  const clear = $('#settingsNotificationSoundClear');
  if (select) {
    select.onchange = () => {
      const choice = setNotificationSoundChoice(select.value);
      refreshNotificationSoundSettingsPanel();
      if (choice === 'custom' && !notificationCustomSoundData()) {
        notify('Custom selected. Now upload an audio file from this Settings section.', 'warn', 4500);
        return;
      }
      playNotificationSound(true, { force:true });
    };
  }
  if (test) test.onclick = () => playNotificationSound(true, { force:true });
  if (file) {
    file.onchange = async () => {
      const selected = file.files && file.files[0];
      if (!selected) return;
      if (selected.type && !selected.type.startsWith('audio/')) {
        notify('Please choose an audio file.', 'warn');
        file.value = '';
        return;
      }
      if (selected.size > 2.5 * 1024 * 1024) {
        notify('Custom sound is too large for browser storage. Please use a file under 2.5 MB.', 'warn', 5500);
        file.value = '';
        return;
      }
      try {
        const dataUrl = await toDataUrl(selected);
        localStorage.setItem('crmNotificationSoundCustomData', dataUrl);
        localStorage.setItem('crmNotificationSoundCustomName', selected.name || 'custom-sound');
        setNotificationSoundChoice('custom');
        notificationCustomAudio = null;
        notificationCustomAudioSrc = '';
        refreshNotificationSoundSettingsPanel();
        notify('Custom notification sound saved in this browser.', 'ok');
        playNotificationSound(true, { force:true });
      } catch (_) {
        notify('Could not read this audio file. Please choose another file.', 'danger');
      } finally {
        file.value = '';
      }
    };
  }
  if (clear) {
    clear.onclick = () => {
      localStorage.removeItem('crmNotificationSoundCustomData');
      localStorage.removeItem('crmNotificationSoundCustomName');
      if (notificationSoundChoice() === 'custom') setNotificationSoundChoice('chime');
      notificationCustomAudio = null;
      notificationCustomAudioSrc = '';
      refreshNotificationSoundSettingsPanel();
      notify('Custom notification sound cleared.', 'ok');
    };
  }
}

function setupNotificationSoundControls() {
  document.addEventListener('pointerdown', unlockNotificationAudio, { once:true, capture:true, passive:true });
  document.addEventListener('keydown', unlockNotificationAudio, { once:true, capture:true });
}

function trustedNotificationDeviceId() {
  return String(localStorage.getItem('p2pflowTrustedDeviceId') || '').trim();
}

function isIosWebKitDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandaloneWebApp() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches === true || navigator.standalone === true;
}

function backgroundNotificationSupported() {
  return Boolean(window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
}

function backgroundNotificationToggleHtml(options={}) {
  const config = state.pushConfig || {};
  const active = config.enabled === true && config.currentDeviceSubscribed === true;
  const compact = options.compact === true;
  const label = state.lang === 'bn'
    ? `নোটিফিকেশন ${active ? 'অন' : 'অফ'}`
    : `Notifications ${active ? 'ON' : 'OFF'}`;
  const title = state.lang === 'bn'
    ? (active ? 'নতুন অর্ডার ও P2P মেসেজের ব্রাউজার নোটিফিকেশন এবং সেট করা সাউন্ড চালু আছে।' : 'এই ডিভাইসে নতুন অর্ডার বা P2P মেসেজের ব্রাউজার নোটিফিকেশন ও অটোমেটিক সাউন্ড বন্ধ আছে।')
    : (active ? 'Browser notifications and the selected sound are ON for new orders and P2P messages.' : 'Browser notifications and automatic order/message sounds are OFF on this device.');
  return `<button type="button" class="background-notification-toggle ${compact ? 'compact' : ''} ${active ? 'is-on' : 'is-off'}" data-background-notification-toggle aria-pressed="${active ? 'true' : 'false'}" title="${escapeAttr(title)}" ${state.pushBusy ? 'disabled' : ''}><span class="background-notification-dot" aria-hidden="true"></span><span>${escapeHtml(label)}</span></button>`;
}

function updateBackgroundNotificationControls(root=document) {
  root.querySelectorAll?.('[data-background-notification-toggle]').forEach(button => {
    const config = state.pushConfig || {};
    const active = config.enabled === true && config.currentDeviceSubscribed === true;
    button.classList.toggle('is-on', active);
    button.classList.toggle('is-off', !active);
    button.disabled = Boolean(state.pushBusy);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.title = state.lang === 'bn'
      ? (active ? 'নতুন অর্ডার ও P2P মেসেজের ব্রাউজার নোটিফিকেশন এবং সেট করা সাউন্ড চালু আছে।' : 'এই ডিভাইসে নতুন অর্ডার বা P2P মেসেজের ব্রাউজার নোটিফিকেশন ও অটোমেটিক সাউন্ড বন্ধ আছে।')
      : (active ? 'Browser notifications and the selected sound are ON for new orders and P2P messages.' : 'Browser notifications and automatic order/message sounds are OFF on this device.');
    const label = button.querySelector('span:last-child');
    if (label) label.textContent = state.lang === 'bn' ? `নোটিফিকেশন ${active ? 'অন' : 'অফ'}` : `Notifications ${active ? 'ON' : 'OFF'}`;
  });
}

function bindBackgroundNotificationControls(root=document) {
  root.querySelectorAll?.('[data-background-notification-toggle]').forEach(button => {
    if (button.dataset.backgroundBound === '1') return;
    button.dataset.backgroundBound = '1';
    button.onclick = async () => {
      if (state.pushBusy) return;
      const active = state.pushConfig?.enabled === true && state.pushConfig?.currentDeviceSubscribed === true;
      try {
        if (active) await disableBackgroundNotifications();
        else await enableBackgroundNotifications();
      } catch (error) {
        notify(error.message || 'Background notifications could not be changed.', 'danger', 6500);
      }
    };
  });
}

function urlBase64ToUint8Array(value='') {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}

async function registerP2PFlowServiceWorker() {
  if (!backgroundNotificationSupported()) return null;
  if (state.serviceWorkerRegistration) return state.serviceWorkerRegistration;
  try {
    state.serviceWorkerRegistration = await navigator.serviceWorker.register('/sw.js', { scope:'/' });
    return state.serviceWorkerRegistration;
  } catch (_) {
    return null;
  }
}

async function loadBackgroundNotificationConfig(options={}) {
  if (!state.user) return null;
  try {
    const config = await api('/api/push', { silent: options.silent !== false, noAutoReload:true });
    state.pushConfig = config;
    state.user.backgroundNotificationsEnabled = config.enabled === true;
    const storedScope = localStorage.getItem('crmNotificationCredentialId');
    if (storedScope === null && config.currentDeviceNotificationCredentialId !== undefined) {
      state.notificationCredentialId = Number(config.currentDeviceNotificationCredentialId || 0);
    }
    state.lastSyncedNotificationCredentialId = Number(config.currentDeviceNotificationCredentialId || 0);
    updateBackgroundNotificationControls();
    return config;
  } catch (_) {
    if (!state.pushConfig) state.pushConfig = { enabled:false, currentDeviceSubscribed:false, serverEnabled:false };
    updateBackgroundNotificationControls();
    return state.pushConfig;
  }
}

function notificationDeviceName() {
  const platform = navigator.userAgentData?.platform || navigator.platform || 'Device';
  const browser = /edg/i.test(navigator.userAgent) ? 'Edge' : /firefox/i.test(navigator.userAgent) ? 'Firefox' : /chrome|crios/i.test(navigator.userAgent) ? 'Chrome' : /safari/i.test(navigator.userAgent) ? 'Safari' : 'Browser';
  return `${platform} · ${browser}`.slice(0, 120);
}

function activeNotificationCredentialScope() {
  if (state.page === 'orders') return Number(state.orderCredentialId || 0);
  if (state.page === 'ads') return Number(state.adsCredentialId || 0);
  return Number(state.notificationCredentialId || 0);
}

function notificationCredentialMatches(credentialId=0, category='orders') {
  if (!['orders','assignments','messages'].includes(String(category || '').toLowerCase())) return true;
  const scopeId = Number(activeNotificationCredentialScope() || 0);
  if (!scopeId) return true;
  return Number(credentialId || 0) === scopeId;
}

function notificationCredentialIdFromEvent(event={}) {
  return Number(event?.credentialId || event?.notification?.credentialId || 0) || 0;
}

function setNotificationCredentialScope(credentialId=0, options={}) {
  const next = Math.max(0, Number(credentialId || 0)) || 0;
  state.notificationCredentialId = next;
  if (next) localStorage.setItem('crmNotificationCredentialId', String(next));
  else localStorage.removeItem('crmNotificationCredentialId');
  if (options.sync === false || !state.user) return next;
  const deviceId = trustedNotificationDeviceId();
  const subscribed = state.pushConfig?.enabled === true && state.pushConfig?.currentDeviceSubscribed === true;
  if (!deviceId || !subscribed) return next;
  if (Number(state.lastSyncedNotificationCredentialId) === next && options.force !== true) return next;
  clearTimeout(state.notificationCredentialScopeSyncTimer);
  state.notificationCredentialScopeSyncTimer = setTimeout(async () => {
    try {
      const result = await api('/api/push/scope', {
        method:'PATCH', silent:true, noAutoReload:true,
        body:JSON.stringify({ deviceId, notificationCredentialId:next })
      });
      state.pushConfig = result;
      state.lastSyncedNotificationCredentialId = Number(result?.currentDeviceNotificationCredentialId ?? next) || 0;
      updateBackgroundNotificationControls();
    } catch (_) {}
  }, options.immediate ? 0 : 120);
  return next;
}

async function enableBackgroundNotifications() {
  if (state.pushBusy) return state.pushConfig;
  state.pushBusy = true;
  updateBackgroundNotificationControls();
  try {
    const deviceId = trustedNotificationDeviceId();
    if (!deviceId) throw new Error(state.lang === 'bn' ? 'Security পেজ থেকে এই ব্রাউজারটি আগে বন্ড/ট্রাস্টেড ডিভাইস করুন।' : 'Bond this browser as a trusted device from Security first.');
    if (!window.isSecureContext) throw new Error('Background notifications require HTTPS.');
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('This browser does not support background web notifications.');
    if (isIosWebKitDevice() && !isStandaloneWebApp()) throw new Error(state.lang === 'bn' ? 'iPhone/iPad-এ প্রথমে Share → Add to Home Screen করে P2PFlow খুলুন, তারপর নোটিফিকেশন অন করুন।' : 'On iPhone/iPad, add P2PFlow to the Home Screen and open it there before enabling notifications.');
    const config = state.pushConfig || await loadBackgroundNotificationConfig({ silent:true });
    if (config?.serverEnabled === false) throw new Error('Background notification service is disabled on the server.');
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notification permission was not granted in this browser.');
    const registration = await registerP2PFlowServiceWorker();
    if (!registration) throw new Error('The background notification worker could not be registered.');
    const ready = await navigator.serviceWorker.ready;
    let subscription = await ready.pushManager.getSubscription();
    if (!subscription) {
      const publicKey = String(config?.publicKey || '').trim();
      if (!publicKey) throw new Error('The server push public key is unavailable.');
      subscription = await ready.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:urlBase64ToUint8Array(publicKey) });
    }
    const result = await api('/api/push/subscribe', {
      method:'POST',
      body:JSON.stringify({ subscription:subscription.toJSON(), deviceId, deviceName:notificationDeviceName(), enabled:true, notificationCredentialId:activeNotificationCredentialScope() })
    });
    state.pushConfig = result;
    state.lastSyncedNotificationCredentialId = Number(result?.currentDeviceNotificationCredentialId ?? activeNotificationCredentialScope()) || 0;
    if (state.user) state.user.backgroundNotificationsEnabled = true;
    notify(state.lang === 'bn' ? 'এই ডিভাইসে নোটিফিকেশন ও সাউন্ড চালু হয়েছে।' : 'Notifications and sound are ON on this device.', 'ok');
    playNotificationSound(true, { force:true });
    return result;
  } finally {
    state.pushBusy = false;
    updateBackgroundNotificationControls();
  }
}

async function disableBackgroundNotifications() {
  if (state.pushBusy) return state.pushConfig;
  const previousConfig = state.pushConfig ? { ...state.pushConfig } : null;
  state.pushBusy = true;
  state.pushConfig = { ...(state.pushConfig || {}), currentDeviceSubscribed:false };
  updateBackgroundNotificationControls();
  try {
    const deviceId = trustedNotificationDeviceId();
    let endpoint = '';
    let subscription = null;
    try {
      const registration = state.serviceWorkerRegistration || await registerP2PFlowServiceWorker();
      subscription = registration ? await registration.pushManager.getSubscription() : null;
      endpoint = String(subscription?.endpoint || '');
    } catch (_) {}
    const result = await api('/api/push/subscribe', {
      method:'DELETE',
      body:JSON.stringify({ endpoint, deviceId })
    });
    if (subscription) await subscription.unsubscribe().catch(()=>false);
    state.pushConfig = result;
    if (state.user) state.user.backgroundNotificationsEnabled = result.enabled === true;
    try {
      if (notificationCustomAudio) {
        notificationCustomAudio.pause();
        notificationCustomAudio.currentTime = 0;
      }
    } catch (_) {}
    notify(state.lang === 'bn' ? 'এই ডিভাইসে নোটিফিকেশন ও সাউন্ড বন্ধ হয়েছে।' : 'Notifications and sound are OFF on this device.', 'ok');
    return result;
  } catch (error) {
    state.pushConfig = previousConfig;
    throw error;
  } finally {
    state.pushBusy = false;
    updateBackgroundNotificationControls();
  }
}


function notify(message, type='danger', timeout=3000) {
  const text = String(message || '').trim();
  if (!text) return;
  let wrap = document.querySelector('#toastWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toastWrap';
    document.body.appendChild(wrap);
  }
  const item = document.createElement('div');
  item.className = 'toast ' + type;
  const title = type === 'danger' ? 'Action blocked' : type === 'ok' ? 'Success' : 'Notice';
  item.innerHTML = `<b>${escapeHtml(trText(title))}</b><span>${escapeHtml(trText(text))}</span>`;
  wrap.appendChild(item);
  setTimeout(() => item.remove(), timeout);
}

function setFormMessage(id, message='', type='danger') {
  const el = document.querySelector(id);
  if (!el) return;
  el.className = 'form-message ' + type;
  el.textContent = trText(message || '');
}

function setSubmitState(form, ok, message='') {
  const btn = form?.querySelector('button[type="submit"]');
  if (btn) {
    btn.disabled = !ok;
    btn.title = ok ? '' : message;
  }
}
const PERMISSION_LABELS = {
  'dashboard.view': 'View dashboard',
  'orders.view': 'View orders',
  'orders.create': 'Create Binance/offline orders',
  'orders.assign': 'Order assign / reassign',
  'orders.split': 'Payment split add/update',
  'orders.final_action': 'Paid mark / release final action',
  'orders.quick_release': 'Quick release before paid mark',
  'approvals.manage': 'Approval queue and decisions',
  'binance.sync': 'Binance live order sync',
  'binance.chat': 'Binance P2P chat access',
  'p2p.profile.view': 'View own Binance P2P profile and feedback',
  'p2p.profile.sync': 'Sync own Binance P2P profile and feedback',
  'ads.view': 'View advertisements',
  'ads.manage': 'Create, edit and activate advertisements',
  'accounts.view': 'View payment accounts',
  'accounts.use': 'Use assigned payment accounts',
  'accounts.manage': 'Manage own payment accounts',
  'accounts.manage_all': 'Manage all payment accounts',
  'ledger.adjust': 'Payment account statement adjustment',
  'offline.transactions.manage': 'Offline business receipt workflow',
  'routing.manage': 'Payment routing manage',
  'agents.manage': 'User add/edit/permission manage',
  'roles.manage': 'User role template manage',
  'reports.view': 'View reports',
  'accounting.view': 'View business capital, profit and own/overall earnings',
  'accounting.manage': 'Add expenses, income and capital movements',
  'accounting.close': 'Sync Binance balance and close business day',
  'activity.view': 'View user presence and activity analytics',
  'audit.view': 'View audit logs',
  'settings.manage': 'Settings manage',
  'credentials.manage': 'Binance API credentials manage'
};

const PERMISSION_DESCRIPTIONS = Object.freeze({
  'dashboard.view': { en: 'Open the dashboard and view operational summary cards. It does not grant access to orders, accounting details, settings or other pages.', bn: 'ড্যাশবোর্ড ও অপারেশন সারাংশ দেখা যাবে। অর্ডার, অ্যাকাউন্টিং বিস্তারিত, সেটিংস বা অন্য পেজের অনুমতি এতে পাওয়া যাবে না।' },
  'orders.view': { en: 'View permitted order lists and details. Binance orders also require Orders View for the exact Binance account; Agents see only orders assigned to them.', bn: 'অনুমোদিত অর্ডার লিস্ট ও বিস্তারিত দেখা যাবে। Binance অর্ডারের জন্য নির্দিষ্ট Binance অ্যাকাউন্টেও Orders View দিতে হবে; Agent শুধু নিজের assigned অর্ডার দেখবে।' },
  'orders.create': { en: 'Create offline orders and create Binance orders for exact accounts that also have Orders Create granted. It does not allow assignment or final actions.', bn: 'Offline order এবং নির্দিষ্ট Binance অ্যাকাউন্টে Orders Create grant থাকলে Binance order তৈরি করা যাবে। এতে assign বা final action অনুমতি পাওয়া যাবে না।' },
  'orders.assign': { en: 'Assign or reassign an order to an Agent. Binance orders require the same permission on the exact account, and the target Agent must have Work Status ON and account access.', bn: 'অর্ডার Agent-কে assign বা reassign করা যাবে। Binance অর্ডারে নির্দিষ্ট অ্যাকাউন্টের একই permission লাগবে এবং target Agent-এর Work Status ON ও account access থাকতে হবে।' },
  'orders.split': { en: 'Add or update payment splits on accessible orders. Using a payment account still requires Payment Account Use and assignment to that account.', bn: 'অ্যাক্সেসযোগ্য অর্ডারে payment split add/update করা যাবে। Payment account ব্যবহার করতে আলাদাভাবে Payment Account Use এবং সেই account assignment লাগবে।' },
  'orders.final_action': { en: 'Perform paid-mark and release/final workflow where policy allows. Binance orders require this permission on the exact account and all proof/approval rules still apply.', bn: 'নীতি অনুযায়ী paid mark ও release/final workflow করা যাবে। Binance অর্ডারে নির্দিষ্ট অ্যাকাউন্টের permission এবং proof/approval-এর সব নিয়ম প্রযোজ্য থাকবে।' },
  'orders.quick_release': { en: 'Use the exceptional quick-release workflow before the normal paid-mark stage. Exact Binance-account permission, safety checks and approval limits still apply.', bn: 'স্বাভাবিক paid-mark ধাপের আগে exceptional quick release করা যাবে। নির্দিষ্ট Binance account permission, safety check ও approval limit প্রযোজ্য থাকবে।' },
  'approvals.manage': { en: 'Open the approval queue and approve or reject protected operational requests. It does not independently grant the underlying order or accounting action.', bn: 'Approval queue দেখা এবং protected request approve/reject করা যাবে। মূল order বা accounting action-এর permission এতে আলাদাভাবে পাওয়া যাবে না।' },
  'binance.sync': { en: 'View and synchronize live Binance orders for Binance accounts with the same account-level grant, including unassigned live orders. It does not grant chat, Ads or final actions.', bn: 'একই account-level grant থাকা Binance অ্যাকাউন্টের assigned ও unassigned live order দেখা এবং sync করা যাবে। Chat, Ads বা final action permission এতে পাওয়া যাবে না।' },
  'binance.chat': { en: 'Read, sync and send Binance P2P chat messages on accessible orders for exact accounts with Chat permission. It does not grant order final actions.', bn: 'অ্যাক্সেসযোগ্য অর্ডারে নির্দিষ্ট account Chat permission থাকলে Binance P2P message পড়া, sync ও পাঠানো যাবে। Final action permission এতে পাওয়া যাবে না।' },
  'p2p.profile.view': { en: 'View P2P profile, statistics and feedback for exact Binance accounts granted to the user. It does not perform a live sync.', bn: 'যে নির্দিষ্ট Binance account grant করা আছে তার P2P profile, statistics ও feedback দেখা যাবে। এতে live sync হবে না।' },
  'p2p.profile.sync': { en: 'Fetch and update P2P profile and feedback for exact Binance accounts with the same grant. View permission is implied for opening the result.', bn: 'একই grant থাকা নির্দিষ্ট Binance account-এর P2P profile ও feedback fetch/update করা যাবে। ফলাফল খোলার জন্য view access ব্যবহৃত হবে।' },
  'ads.view': { en: 'View advertisements and merchant status for exact Binance accounts with Ads View. It does not create, edit, publish or change merchant status.', bn: 'নির্দিষ্ট Binance account-এ Ads View থাকলে advertisement ও merchant status দেখা যাবে। Create, edit, publish বা merchant status change করা যাবে না।' },
  'ads.manage': { en: 'Create, edit, publish, disable or delete Ads and run Business/Online/Break actions for exact Binance accounts with Ads Manage. All-account actions affect only granted accounts.', bn: 'নির্দিষ্ট Binance account-এ Ads Manage থাকলে Ad create/edit/publish/disable/delete এবং Business/Online/Break action করা যাবে। All action শুধু granted account-গুলোতে কাজ করবে।' },
  'accounts.view': { en: 'Open Payment Accounts and view only accounts the user owns or has been assigned. Admin and Manager can view every payment account.', bn: 'Payment Accounts পেজ খুলে user নিজের অথবা তাকে assigned করা account-গুলো দেখতে পারবে। Admin ও Manager সব payment account দেখতে পারবে।' },
  'accounts.use': { en: 'Use owned or assigned active payment accounts in permitted order payment splits. It does not allow account creation, editing, access changes or balance adjustment.', bn: 'অনুমোদিত order payment split-এ নিজের বা assigned active payment account ব্যবহার করা যাবে। Account create/edit, access change বা balance adjustment করা যাবে না।' },
  'accounts.manage': { en: 'Create payment accounts under the logged-in user and manage only accounts owned by that user. Agents cannot use this permission to edit another user’s account. It does not grant payment-split use or statement adjustment.', bn: 'লগইন করা user-এর নামে payment account তৈরি এবং শুধু নিজের account manage করা যাবে। Agent এই permission দিয়ে অন্য user-এর account edit করতে পারবে না। Payment split use বা statement adjustment আলাদা permission।' },
  'accounts.manage_all': { en: 'Manage every payment account, change Account User and assign or remove Agent access. Admin and Manager always have this scope. Agents remain limited to their own accounts even if this permission is accidentally selected.', bn: 'সব payment account manage, Account User পরিবর্তন এবং Agent access assign/remove করা যাবে। Admin ও Manager সবসময় এই scope পাবে। ভুল করে permission selected হলেও Agent শুধু নিজের account-এ সীমাবদ্ধ থাকবে।' },
  'ledger.adjust': { en: 'Add top-up, cash-out, correction, expense, settlement and refund statement entries. Without Manage All Payment Accounts, adjustments are limited to the logged-in user’s own accounts.', bn: 'Top-up, cash-out, correction, expense, settlement ও refund statement entry করা যাবে। Manage All Payment Accounts না থাকলে শুধু লগইন user-এর নিজের account-এ adjustment করা যাবে।' },
  'offline.transactions.manage': { en: 'Create offline receipt sessions, reserve eligible payment numbers, mark full or partial amounts received, and finalize full or partial offline orders. Only payment accounts inside the user’s allowed scope are available.', bn: 'Offline receipt session তৈরি, eligible payment number reserve, full/partial received mark এবং full/partial offline order finalize করা যাবে। User-এর allowed scope-এর payment account-ই পাওয়া যাবে।' },
  'routing.manage': { en: 'Create and edit payment-method routing, priority, amount ranges and capacity rules used by automatic assignment. It does not bypass Work Status or account permissions.', bn: 'Auto assignment-এর payment-method routing, priority, amount range ও capacity rule create/edit করা যাবে। Work Status বা account permission bypass হবে না।' },
  'agents.manage': { en: 'Create and edit users, login access, global permissions, Binance-account permissions, Security Question setup and Agent operating limits. Delegation cannot exceed the editor’s own access.', bn: 'User create/edit, login access, global permission, Binance-account permission, Security Question ও Agent limit manage করা যাবে। Editor নিজের permission-এর বেশি grant করতে পারবে না।' },
  'roles.manage': { en: 'Create and edit reusable User Role templates and their global permissions. Assigning exact Binance accounts remains a separate per-user step.', bn: 'Reusable User Role template ও global permission create/edit করা যাবে। নির্দিষ্ট Binance account assignment আলাদা per-user ধাপ।' },
  'reports.view': { en: 'View operational reports and export permitted report data. It does not grant mutation rights in orders, accounts or accounting.', bn: 'Operational report দেখা এবং অনুমোদিত report data export করা যাবে। Order, account বা accounting পরিবর্তনের permission এতে নেই।' },
  'accounting.view': { en: 'View permitted accounting overview, capital, profit, income, expense and daily-close information. Agent visibility may be limited to allowed scope.', bn: 'অনুমোদিত accounting overview, capital, profit, income, expense ও daily close তথ্য দেখা যাবে। Agent-এর visibility নির্ধারিত scope অনুযায়ী সীমিত হতে পারে।' },
  'accounting.manage': { en: 'Create and manage business expense, income and capital movement entries. It does not grant daily closing or Binance-balance synchronization.', bn: 'Business expense, income ও capital movement entry create/manage করা যাবে। Daily closing বা Binance balance sync permission এতে নেই।' },
  'accounting.close': { en: 'Synchronize accounting Binance balances and create or force a business-day close. Accounting View is required to review the result.', bn: 'Accounting Binance balance sync এবং business day close/force close করা যাবে। ফলাফল দেখার জন্য Accounting View প্রয়োজন।' },
  'activity.view': { en: 'View user presence, active page, session time and activity analytics. Presence is monitoring only and no longer controls auto-assignment.', bn: 'User presence, active page, session time ও activity analytics দেখা যাবে। Presence শুধু monitoring; auto assignment নিয়ন্ত্রণ করে না।' },
  'audit.view': { en: 'View security and operational audit logs, including who performed protected actions. It does not grant permission to repeat those actions.', bn: 'Security ও operational audit log এবং কে protected action করেছে তা দেখা যাবে। সেই action করার permission এতে পাওয়া যাবে না।' },
  'settings.manage': { en: 'Change general operational, mail, security, sync and integration settings allowed by the Settings API. Software Update remains Owner-only.', bn: 'Settings API-তে অনুমোদিত general operation, mail, security, sync ও integration settings পরিবর্তন করা যাবে। Software Update শুধু Owner-এর জন্য।' },
  'credentials.manage': { en: 'Create and edit Binance API credentials and account configuration. This is highly sensitive and does not automatically grant operational access to those accounts.', bn: 'Binance API credential ও account configuration create/edit করা যাবে। এটি sensitive; credential যোগ করলেই operational account access স্বয়ংক্রিয়ভাবে পাওয়া যাবে না।' }
});

function permissionDescription(permission) {
  const item = PERMISSION_DESCRIPTIONS[permission] || {};
  return state.lang === 'bn' ? (item.bn || item.en || permission) : (item.en || item.bn || permission);
}
function permissionHelpHtml(permission) {
  const description = permissionDescription(permission);
  const label = (state.lang === 'bn' ? 'Permission-এর কাজ দেখুন: ' : 'Show permission details: ') + (PERMISSION_LABELS[permission] || permission);
  return `<button type="button" class="permission-help" data-permission-help="${escapeAttr(description)}" aria-label="${escapeAttr(label)}" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg></button>`;
}
function permissionOptionHtml(permission, checked=false, options={}) {
  const inputName = options.inputName || 'permissions';
  const dataAttributes = options.dataAttributes || '';
  return `<div class="permission-option${options.compact ? ' compact' : ''}"><label class="check"><input type="checkbox" name="${escapeAttr(inputName)}" ${dataAttributes} value="${escapeAttr(permission)}" ${checked ? 'checked' : ''}/> <span>${escapeHtml(PERMISSION_LABELS[permission] || permission)}</span></label>${permissionHelpHtml(permission)}</div>`;
}

let permissionTooltipElement = null;
let activePermissionHelpButton = null;
function setupPermissionHelpTooltips() {
  if (document.body.dataset.permissionTooltipsReady === '1') return;
  document.body.dataset.permissionTooltipsReady = '1';
  const hide = () => {
    if (activePermissionHelpButton) activePermissionHelpButton.setAttribute('aria-expanded', 'false');
    activePermissionHelpButton = null;
    if (!permissionTooltipElement) return;
    permissionTooltipElement.hidden = true;
    permissionTooltipElement.textContent = '';
  };
  const show = target => {
    const text = String(target?.dataset?.permissionHelp || '').trim();
    if (!text) return;
    if (!permissionTooltipElement) {
      permissionTooltipElement = document.createElement('div');
      permissionTooltipElement.className = 'permission-tooltip';
      permissionTooltipElement.setAttribute('role', 'tooltip');
      permissionTooltipElement.hidden = true;
      document.body.appendChild(permissionTooltipElement);
    }
    if (activePermissionHelpButton && activePermissionHelpButton !== target) activePermissionHelpButton.setAttribute('aria-expanded', 'false');
    activePermissionHelpButton = target;
    target.setAttribute('aria-expanded', 'true');
    permissionTooltipElement.textContent = text;
    permissionTooltipElement.hidden = false;
    permissionTooltipElement.style.left = '12px';
    permissionTooltipElement.style.top = '12px';
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = permissionTooltipElement.getBoundingClientRect();
    const margin = 10;
    let left = targetRect.right - tooltipRect.width;
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
    let top = targetRect.bottom + 8;
    if (top + tooltipRect.height > window.innerHeight - margin) top = Math.max(margin, targetRect.top - tooltipRect.height - 8);
    permissionTooltipElement.style.left = `${Math.round(left)}px`;
    permissionTooltipElement.style.top = `${Math.round(top)}px`;
  };
  document.addEventListener('focusin', event => {
    const target = event.target.closest?.('[data-permission-help]');
    if (target) show(target);
  });
  document.addEventListener('click', event => {
    const target = event.target.closest?.('[data-permission-help]');
    if (!target) return hide();
    event.preventDefault();
    event.stopPropagation();
    if (activePermissionHelpButton === target && permissionTooltipElement && !permissionTooltipElement.hidden) hide();
    else show(target);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hide();
  });
  window.addEventListener('resize', hide, { passive:true });
  window.addEventListener('scroll', hide, { passive:true, capture:true });
}

const fmt = iso => iso ? new Date(iso).toLocaleString() : '-';

function looksLikeHtml(text) { return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(String(text || '').slice(0, 500)); }
function htmlTitle(text) {
  const raw = String(text || '');
  const title = (raw.match(/<title[^>]*>(.*?)<\/title>/i) || [])[1] || (raw.match(/<h1[^>]*>(.*?)<\/h1>/i) || [])[1] || '';
  return title.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}
function isHostingChallengeHtml(text) {
  const sample = String(text || '').slice(0, 2000);
  return looksLikeHtml(sample) && /(checking your browser|just a moment|cf-browser-verification|cloudflare|ddos-guard|challenge-platform|attention required)/i.test(sample);
}
function challengeReloadKey(path) { return `crmApiChallengeReload:${path.split('?')[0]}`; }
function maybeReloadForChallenge(path, opts={}) {
  // Stable-shell rule: authenticated P2PFlow pages must never destroy the current
  // UI because an upstream host returned a temporary HTML/challenge response.
  // The API request may retry, but the browser shell stays mounted and the user
  // can keep scrolling/typing while connectivity recovers.
  return false;
}
function compactApiError(path, status, data, type) {
  if (data && typeof data === 'object') return data.error || data.message || `Request failed (${status})`;
  const text = String(data || '');
  if (looksLikeHtml(text)) {
    const title = htmlTitle(text);
    if (isHostingChallengeHtml(text)) {
      return `Hosting browser verification blocked the system response for ${path}${status ? ` (HTTP ${status})` : ''}${title ? `: ${title}` : ''}. If it keeps repeating after one auto-reload, wait a few seconds or open Health Check.`;
    }
    return `Server returned HTML instead of the expected response for ${path}${status ? ` (HTTP ${status})` : ''}${title ? `: ${title}` : ''}.`;
  }
  return text.slice(0, 500) || `Request failed (${status || 'network'})`;
}
function currentAppReturnUrl() {
  return `${location.pathname}${location.search}${location.hash}` || '/';
}
function redirectToLoginPage({ preserveRoute=true }={}) {
  if (/^\/login(?:\.html)?\/?$/i.test(location.pathname)) return;
  const next = preserveRoute ? currentAppReturnUrl() : '';
  const target = next ? `/login?next=${encodeURIComponent(next)}` : '/login';
  window.location.replace(target);
}

async function confirmSessionBeforeLogout() {
  const headers = { 'Accept':'application/json' };
  const trustedDeviceId = String(localStorage.getItem('p2pflowTrustedDeviceId') || '').trim();
  if (trustedDeviceId) headers['X-P2PFlow-Device-Id'] = trustedDeviceId;
  try {
    await new Promise(resolve => setTimeout(resolve, 180));
    const response = await fetch('/api/me', { credentials:'include', cache:'no-store', headers });
    if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) return false;
    const data = await response.json().catch(() => null);
    if (!data?.user || !data?.csrfToken) return false;
    state.user = data.user;
    state.csrfToken = data.csrfToken;
    state.orderAcceptance = data.orderAcceptance || state.orderAcceptance;
    return true;
  } catch (_) {
    return false;
  }
}

async function api(path, opts={}, attempt=0) {
  const silent = !!(opts.silent || opts.quiet);
  const fetchOpts = { ...opts };
  delete fetchOpts.silent;
  delete fetchOpts.quiet;
  const authRetried = fetchOpts._authRetried === true;
  const authRetryAllowed = fetchOpts.authRetry !== false;
  delete fetchOpts._authRetried;
  delete fetchOpts.authRetry;
  const method = (fetchOpts.method || 'GET').toUpperCase();
  const navigationScoped = fetchOpts.navigationScoped !== false;
  delete fetchOpts.navigationScoped;
  if (!fetchOpts.signal && method === 'GET' && navigationScoped && state.navigationController?.signal) fetchOpts.signal = state.navigationController.signal;
  const headers = { 'Accept': 'application/json', ...(fetchOpts.headers || {}) };
  const trustedDeviceId = String(localStorage.getItem('p2pflowTrustedDeviceId') || '').trim();
  if (trustedDeviceId) headers['X-P2PFlow-Device-Id'] = trustedDeviceId;
  if (fetchOpts.body !== undefined && !(fetchOpts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && state.csrfToken) headers['X-CSRF-Token'] = state.csrfToken;
  let res;
  try {
    res = await fetch(path, { credentials: 'include', cache: 'no-store', ...fetchOpts, method, headers });
  } catch (err) {
    if (err?.name === 'AbortError' || fetchOpts.signal?.aborted) {
      const cancelled = new Error('UI request cancelled');
      cancelled.name = 'AbortError';
      cancelled.code = 'UI_REQUEST_CANCELLED';
      cancelled.cancelled = true;
      throw cancelled;
    }
    if (attempt < 1) {
      await new Promise(r => setTimeout(r, 700));
      if (fetchOpts.signal?.aborted) { const cancelled = new Error('UI request cancelled'); cancelled.name='AbortError'; cancelled.code='UI_REQUEST_CANCELLED'; cancelled.cancelled=true; throw cancelled; }
      return api(path, { ...opts, signal:fetchOpts.signal, navigationScoped:false }, attempt + 1);
    }
    const msg = `Network request failed for ${path}: ${err.message || err}. Check server health / hosting connectivity.`;
    if (!silent) notify(msg, 'danger');
    throw new Error(msg);
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json().catch(() => ({})) : await res.text().catch(() => '');
  const htmlResponse = !type.includes('application/json') && looksLikeHtml(data);
  const hostingChallenge = htmlResponse && isHostingChallengeHtml(data);
  // A gateway 504 is already the result of a long upstream wait. Retrying it
  // automatically can multiply a 60-second proxy timeout into several minutes
  // and add more load while the upstream is unhealthy.
  const shouldRetryHtml = htmlResponse && (hostingChallenge || [0, 403, 429, 500, 502, 503].includes(res.status));
  if ((!res.ok || htmlResponse) && attempt < 2 && shouldRetryHtml) {
    await new Promise(r => setTimeout(r, hostingChallenge ? 1300 + attempt * 1400 : 700 + attempt * 800));
    if (fetchOpts.signal?.aborted) { const cancelled = new Error('UI request cancelled'); cancelled.name='AbortError'; cancelled.code='UI_REQUEST_CANCELLED'; cancelled.cancelled=true; throw cancelled; }
    return api(path, { ...opts, signal:fetchOpts.signal, navigationScoped:false }, attempt + 1);
  }
  if (!res.ok || htmlResponse) {
    if (res.status === 401 && path !== '/api/login' && path !== '/api/me' && authRetryAllowed && !authRetried) {
      const sessionStillValid = await confirmSessionBeforeLogout();
      if (sessionStillValid) return api(path, { ...opts, _authRetried:true, signal:fetchOpts.signal, navigationScoped:false }, 0);
    }
    if (res.status === 401 && path !== '/api/login') redirectToLoginPage();
    const msg = compactApiError(path, res.status, data, type);
    const err = new Error(msg);
    err.status = res.status;
    if (hostingChallenge) {
      err.hostingChallenge = true;
      err.autoReloadScheduled = maybeReloadForChallenge(path, opts);
    }
    if (!silent && !err.autoReloadScheduled) notify(msg, hostingChallenge ? 'warn' : 'danger');
    if (data && typeof data === 'object') {
      err.data = data;
      err.releaseRequirements = data.releaseRequirements || null;
    }
    throw err;
  }
  if (!type.includes('application/json')) {
    const msg = `Invalid server response for ${path}: expected JSON but got ${type || 'unknown content-type'}.`;
    if (!silent) notify(msg, 'danger');
    throw new Error(msg);
  }
  return data;
}



let loginVerificationActive = false;
let loginResendTimer = null;

function loginLocalized(en, bn) {
  return state.lang === 'bn' ? bn : en;
}

function syncLoginLanguage() {
  const buttonText = $('#loginBtnText');
  if (buttonText) buttonText.textContent = loginVerificationActive
    ? loginLocalized('Verify & Sign In', 'ভেরিফাই করে সাইন ইন করুন')
    : loginLocalized('Continue securely', 'নিরাপদে চালিয়ে যান');
}

function setLoginButtonBusy(busy) {
  const button = $('#loginBtn');
  if (!button) return;
  button.disabled = Boolean(busy);
  button.classList.toggle('is-loading', Boolean(busy));
  if (busy) {
    const label = $('#loginBtnText');
    if (label) label.textContent = loginVerificationActive
      ? loginLocalized('Verifying...', 'ভেরিফাই করা হচ্ছে...')
      : loginLocalized('Checking...', 'যাচাই করা হচ্ছে...');
  } else {
    syncLoginLanguage();
  }
}

function setLoginAlert(message, tone='info') {
  const alert = $('#otpHelp');
  if (!alert) return;
  const text = alert.querySelector('span');
  if (text) text.textContent = String(message || '');
  alert.classList.remove('login-alert-info','login-alert-warning','login-alert-danger','login-alert-success');
  const safeTone = ['warning','danger','success'].includes(tone) ? tone : 'info';
  alert.classList.add(`login-alert-${safeTone}`);
}

function syncEmailOtpValue() {
  const hidden = $('#emailOtpInput');
  if (!hidden) return '';
  const value = $$('.otp-digit', $('#emailOtpDigits')).map(input => input.value.replace(/\D/g, '').slice(0, 1)).join('');
  hidden.value = value;
  return value;
}

function clearEmailOtpInputs() {
  $$('.otp-digit', $('#emailOtpDigits')).forEach(input => { input.value = ''; });
  const hidden = $('#emailOtpInput');
  if (hidden) hidden.value = '';
}

function focusFirstEmptyOtpDigit() {
  const digits = $$('.otp-digit', $('#emailOtpDigits'));
  const target = digits.find(input => !input.value) || digits[digits.length - 1];
  if (target) target.focus({ preventScroll: true });
}

function setupEmailOtpInputs() {
  const container = $('#emailOtpDigits');
  if (!container || container.dataset.ready === 'true') return;
  container.dataset.ready = 'true';
  const digits = $$('.otp-digit', container);
  digits.forEach((input, index) => {
    input.addEventListener('input', () => {
      const clean = input.value.replace(/\D/g, '');
      input.value = clean.slice(-1);
      syncEmailOtpValue();
      if (input.value && digits[index + 1]) digits[index + 1].focus();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Backspace' && !input.value && digits[index - 1]) {
        digits[index - 1].value = '';
        syncEmailOtpValue();
        digits[index - 1].focus();
      }
      if (event.key === 'ArrowLeft' && digits[index - 1]) {
        event.preventDefault();
        digits[index - 1].focus();
      }
      if (event.key === 'ArrowRight' && digits[index + 1]) {
        event.preventDefault();
        digits[index + 1].focus();
      }
    });
    input.addEventListener('paste', event => {
      const pasted = (event.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      if (!pasted) return;
      event.preventDefault();
      digits.forEach((digit, digitIndex) => { digit.value = pasted[digitIndex] || ''; });
      syncEmailOtpValue();
      const next = digits[Math.min(pasted.length, digits.length) - 1];
      if (next) next.focus();
    });
  });
}

function setupLoginVisibilityButtons() {
  $$('[data-visibility-target]').forEach(button => {
    if (button.dataset.ready === 'true') return;
    button.dataset.ready = 'true';
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.visibilityTarget || '');
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', show ? 'true' : 'false');
      button.setAttribute('aria-label', show ? 'Hide value' : 'Show value');
      input.focus({ preventScroll: true });
    });
  });
}

function startLoginResendCooldown(seconds=30) {
  const button = $('#resendOtpBtn');
  const text = $('#otpTimerText');
  if (!button || !text) return;
  if (loginResendTimer) clearInterval(loginResendTimer);
  let remaining = Math.max(0, Number(seconds) || 0);
  const render = () => {
    if (remaining <= 0) {
      button.disabled = false;
      text.textContent = loginLocalized('You can request a new email OTP now.', 'এখন নতুন ইমেইল OTP চাইতে পারবেন।');
      if (loginResendTimer) clearInterval(loginResendTimer);
      loginResendTimer = null;
      return;
    }
    button.disabled = true;
    const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
    const ss = String(remaining % 60).padStart(2, '0');
    text.textContent = loginLocalized(`Resend available in ${mm}:${ss}`, `${mm}:${ss} পর আবার OTP পাঠাতে পারবেন`);
    remaining -= 1;
  };
  render();
  loginResendTimer = setInterval(render, 1000);
}

function setLoginVerificationStep(message, options={}) {
  loginVerificationActive = true;
  const card = $('.login-card', $('#login'));
  if (card) card.classList.add('is-verification');
  $('#otpPanel')?.classList.remove('hidden');
  $('#credentialVerifiedNote')?.classList.remove('hidden');
  $('#changeCredentialsBtn')?.classList.remove('hidden');
  ['#loginIdentity','#loginPassword'].forEach(selector => {
    const input = $(selector);
    if (!input) return;
    input.readOnly = true;
    input.closest('.login-input-shell')?.classList.add('is-readonly');
  });
  const secret = $('#loginSecretCode');
  if (secret) secret.required = true;
  const normalized = String(message || 'Check your email and enter the OTP.');
  const lower = normalized.toLowerCase();
  const tone = /incorrect|expired|required|wait|attempt/.test(lower) ? 'warning' : 'info';
  if (/expired/.test(lower)) clearEmailOtpInputs();
  setLoginAlert(normalized, tone);
  syncLoginLanguage();
  if (options.restartCooldown !== false) startLoginResendCooldown(Number(options.cooldownSeconds || 30));
  window.setTimeout(() => {
    if (/secret|pin/.test(lower)) $('#loginSecretCode')?.focus({ preventScroll: true });
    else focusFirstEmptyOtpDigit();
  }, 80);
}

function resetLoginVerificationStep(options={}) {
  loginVerificationActive = false;
  const card = $('.login-card', $('#login'));
  if (card) card.classList.remove('is-verification');
  $('#otpPanel')?.classList.add('hidden');
  $('#credentialVerifiedNote')?.classList.add('hidden');
  $('#changeCredentialsBtn')?.classList.add('hidden');
  ['#loginIdentity','#loginPassword'].forEach(selector => {
    const input = $(selector);
    if (!input) return;
    input.readOnly = false;
    input.closest('.login-input-shell')?.classList.remove('is-readonly');
  });
  const secret = $('#loginSecretCode');
  if (secret) {
    secret.required = false;
    if (options.clear !== false) secret.value = '';
  }
  if (options.clear !== false) clearEmailOtpInputs();
  if (loginResendTimer) clearInterval(loginResendTimer);
  loginResendTimer = null;
  const resendButton = $('#resendOtpBtn');
  if (resendButton) resendButton.disabled = false;
  const timerText = $('#otpTimerText');
  if (timerText) timerText.textContent = loginLocalized('A new code can be requested shortly.', 'কিছুক্ষণ পর নতুন কোড চাইতে পারবেন।');
  syncLoginLanguage();
  if (options.focus !== false) $('#loginIdentity')?.focus({ preventScroll: true });
}

function validateLoginFormForCurrentStep() {
  const identity = String($('#loginIdentity')?.value || '').trim();
  const password = String($('#loginPassword')?.value || '');
  if (!identity || !password) {
    $('#loginError').textContent = loginLocalized('Enter your username or Gmail and password.', 'ইউজারনেম বা জিমেইল এবং পাসওয়ার্ড লিখুন।');
    (!identity ? $('#loginIdentity') : $('#loginPassword'))?.focus();
    return false;
  }
  if (!loginVerificationActive) return true;
  const otp = syncEmailOtpValue();
  const secret = String($('#loginSecretCode')?.value || '').replace(/\D/g, '').slice(0, 6);
  if ($('#loginSecretCode')) $('#loginSecretCode').value = secret;
  if (!/^\d{6}$/.test(otp)) {
    $('#loginError').textContent = loginLocalized('Enter the complete 6-digit email OTP.', 'সম্পূর্ণ ৬ ডিজিট ইমেইল OTP লিখুন।');
    focusFirstEmptyOtpDigit();
    return false;
  }
  if (!/^\d{6}$/.test(secret)) {
    $('#loginError').textContent = loginLocalized('Enter your 6-digit security PIN / secret.', 'আপনার ৬ ডিজিট সিকিউরিটি পিন / সিক্রেট লিখুন।');
    $('#loginSecretCode')?.focus();
    return false;
  }
  return true;
}



function setupGlobalPullToRefresh() {
  if (window.__globalPullToRefreshSetup) return;
  window.__globalPullToRefreshSetup = true;
  const indicator = document.createElement('div');
  indicator.className = 'global-pull-refresh-indicator';
  indicator.textContent = 'Pull down to refresh';
  document.body.appendChild(indicator);
  let startY = 0;
  let currentY = 0;
  let pulling = false;
  const blockedTarget = target => Boolean(target?.closest?.('input,textarea,select,button,.modal-backdrop,.p2p-market-overlay,.notification-panel'));
  const reset = () => {
    pulling = false;
    startY = 0;
    currentY = 0;
    indicator.classList.remove('show', 'ready');
  };
  document.addEventListener('touchstart', event => {
    if (!state.user || state.page === 'p2p-market' || appScrollTop() > 0 || blockedTarget(event.target) || event.touches.length !== 1) return;
    pulling = true;
    startY = event.touches[0].clientY;
    currentY = startY;
  }, { passive: true });
  document.addEventListener('touchmove', event => {
    if (!pulling || event.touches.length !== 1) return;
    currentY = event.touches[0].clientY;
    const delta = Math.max(0, currentY - startY);
    if (delta > 14) {
      indicator.classList.add('show');
      indicator.classList.toggle('ready', delta > 90);
      indicator.textContent = delta > 90 ? 'Release to refresh' : 'Pull down to refresh';
    }
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (!pulling) return;
    const shouldRefresh = Math.max(0, currentY - startY) > 90;
    reset();
    if (shouldRefresh) routeFromLocation(false);
  }, { passive: true });
  document.addEventListener('touchcancel', reset, { passive: true });
}

async function init() {
  setupApplicationShellArchitecture();
  setupLanguageControls();
  setupNotificationSoundControls();
  setupPermissionHelpTooltips();
  setupResponsiveNavigation();
  setupSidebarScrollableNavigation();
  setupGlobalPullToRefresh();
  setupConnectivityStatus();

  window.addEventListener('popstate', () => { if (state.user) routeFromLocation(false); });
  window.addEventListener('hashchange', () => {
    if (!state.user) return;
    if (window.P2PFlowHistoryRouter?.legacyHashToRoute?.(location.hash || '')) routeFromLocation(false);
  });
  const logoutButton = $('#logoutBtn');
  if (logoutButton) logoutButton.onclick = async () => {
    await sendActivityEnd('logout').catch(()=>{});
    await api('/api/logout', { method:'POST', body:'{}', silent:true, noAutoReload:true }).catch(()=>{});
    window.location.replace('/login');
  };

  try {
    const bootstrap = await api('/api/bootstrap', { silent:true, noAutoReload:true, navigationScoped:false });
    state.bootstrap = bootstrap;
    state.user = bootstrap.user;
    state.csrfToken = bootstrap.csrfToken;
    state.orderAcceptance = bootstrap.orderAcceptance || null;
    await bootApp({ bootstrap });
  } catch {
    redirectToLoginPage();
  }
}

function showLogin() {
  stopActivityTracking(false);
  redirectToLoginPage();
}

async function bootApp(options={}) {
  $('#login')?.classList.add('hidden');
  $('#app')?.classList.remove('hidden');
  $('#userBadge').textContent = `${state.user.name} / ${state.user.role}`;
  state.bootstrap = options.bootstrap || state.bootstrap || await api('/api/bootstrap', { silent:true, noAutoReload:true, navigationScoped:false });
  if (state.bootstrap.csrfToken) state.csrfToken = state.bootstrap.csrfToken;
  state.orderAcceptance = state.bootstrap.orderAcceptance || state.orderAcceptance;
  renderNav();
  if (typeof updateOrderAcceptanceControl === 'function') updateOrderAcceptanceControl();
  registerP2PFlowServiceWorker().catch(()=>{});
  loadBackgroundNotificationConfig({ silent:true }).then(() => bindBackgroundNotificationControls()).catch(()=>{});
  setupHeaderNotificationCenter();
  startMobileBottomNavSync();
  startEvents();
  startActivityTracking();
  const legacyRoute = window.P2PFlowHistoryRouter?.legacyHashToRoute?.(location.hash || '');
  if (legacyRoute) {
    history.replaceState({ p2pflow:true, migratedFromHash:true }, '', canonicalRoutePath(legacyRoute));
  } else if (location.pathname === '/' || !window.P2PFlowHistoryRouter?.pathToRoute?.(location.pathname)) {
    const firstPage = canPage(state.page) ? state.page : (visiblePages()[0]?.[0] || 'dashboard');
    history.replaceState({ p2pflow:true }, '', routePath(firstPage));
  }
  await routeFromLocation();
}

const activityClient = {
  tabId: 'tab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10),
  instanceId: 'view_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10),
  lastAnyInteractionAt: Date.now(),
  lastMeaningfulAt: Date.now(),
  lastInteractionType: 'app_open',
  interactionSeq: 0,
  meaningfulSeq: 0,
  listenersBound: false,
  sending: false,
  stopped: true
};

function markActivityInteraction(type='interaction', meaningful=false) {
  const now = Date.now();
  activityClient.lastAnyInteractionAt = now;
  activityClient.lastInteractionType = String(type || 'interaction').slice(0, 40);
  activityClient.interactionSeq += 1;
  if (meaningful) {
    activityClient.lastMeaningfulAt = now;
    activityClient.meaningfulSeq += 1;
  }
}

function activityHeartbeatPayload(reason='timer') {
  const now = Date.now();
  return {
    tabId: activityClient.tabId,
    instanceId: activityClient.instanceId,
    page: state.page || 'unknown',
    orderId: state.currentOrderId || null,
    visible: document.visibilityState === 'visible',
    focused: document.hasFocus(),
    idleSeconds: Math.max(0, Math.floor((now - activityClient.lastAnyInteractionAt) / 1000)),
    engaged: now - activityClient.lastMeaningfulAt <= 120000,
    interactionType: activityClient.lastInteractionType || reason,
    interactionSeq: activityClient.interactionSeq,
    meaningfulSeq: activityClient.meaningfulSeq,
    reason,
    clientTime: new Date(now).toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  };
}

function scheduleActivityHeartbeat(delayMs=null) {
  if (state.activityTimer) clearTimeout(state.activityTimer);
  if (activityClient.stopped || !state.user) return;
  const delay = delayMs == null ? Math.max(5000, Number(state.activityHeartbeatSeconds || 15) * 1000) : Math.max(100, Number(delayMs));
  state.activityTimer = setTimeout(() => sendActivityHeartbeat('timer'), delay);
}

async function sendActivityHeartbeat(reason='timer') {
  if (activityClient.stopped || !state.user || activityClient.sending) return;
  activityClient.sending = true;
  try {
    const response = await api('/api/activity/heartbeat', { method:'POST', body: JSON.stringify(activityHeartbeatPayload(reason)), silent:true, noAutoReload:true });
    if (response?.config?.heartbeatSeconds) state.activityHeartbeatSeconds = Number(response.config.heartbeatSeconds) || 15;
    if (response?.presence?.status && $('#myPresenceState')) $('#myPresenceState').textContent = response.presence.status;
  } catch (_) {
  } finally {
    activityClient.sending = false;
    scheduleActivityHeartbeat();
  }
}

async function sendActivityEnd(reason='page_hidden') {
  if (!state.user || !state.csrfToken) return;
  const payload = { ...activityHeartbeatPayload(reason), reason };
  return fetch('/api/activity/end', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    keepalive: true,
    headers: {
      'Accept':'application/json',
      'Content-Type':'application/json',
      'X-CSRF-Token': state.csrfToken,
      ...(String(localStorage.getItem('p2pflowTrustedDeviceId') || '').trim() ? { 'X-P2PFlow-Device-Id': String(localStorage.getItem('p2pflowTrustedDeviceId') || '').trim() } : {})
    },
    body: JSON.stringify(payload)
  }).catch(()=>{});
}

function bindActivityListeners() {
  if (activityClient.listenersBound) return;
  activityClient.listenersBound = true;
  let lastPassiveMark = 0;
  const passiveMark = type => {
    const now = Date.now();
    if (now - lastPassiveMark < 3000) return;
    lastPassiveMark = now;
    markActivityInteraction(type, false);
  };
  document.addEventListener('pointerdown', () => markActivityInteraction('click', true), { capture:true, passive:true });
  document.addEventListener('keydown', () => markActivityInteraction('keyboard', true), { capture:true, passive:true });
  document.addEventListener('submit', () => markActivityInteraction('form_submit', true), true);
  document.addEventListener('change', () => markActivityInteraction('field_change', true), true);
  document.addEventListener('mousemove', () => passiveMark('mouse_move'), { passive:true });
  document.addEventListener('scroll', () => passiveMark('scroll'), { passive:true });
  document.addEventListener('touchstart', () => markActivityInteraction('touch', true), { capture:true, passive:true });
  document.addEventListener('visibilitychange', () => {
    markActivityInteraction(document.visibilityState === 'visible' ? 'tab_visible' : 'tab_hidden', false);
    if (document.visibilityState === 'visible') sendActivityHeartbeat('visibility').catch(()=>{});
    else sendActivityHeartbeat('hidden').catch(()=>{});
  });
  window.addEventListener('focus', () => { markActivityInteraction('window_focus', false); sendActivityHeartbeat('focus').catch(()=>{}); });
  window.addEventListener('blur', () => { markActivityInteraction('window_blur', false); sendActivityHeartbeat('blur').catch(()=>{}); });
  window.addEventListener('pagehide', () => { sendActivityEnd('pagehide'); });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    activityClient.tabId = 'tab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    activityClient.instanceId = 'view_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    startActivityTracking();
  });
}

function startActivityTracking() {
  bindActivityListeners();
  activityClient.stopped = false;
  markActivityInteraction('app_open', true);
  scheduleActivityHeartbeat(150);
}

function stopActivityTracking(sendEnd=true) {
  activityClient.stopped = true;
  if (state.activityTimer) clearTimeout(state.activityTimer);
  state.activityTimer = null;
  if (sendEnd) sendActivityEnd('tracking_stopped');
}

window.addEventListener('unhandledrejection', event => {
  if (isUiRequestCancelled(event.reason)) event.preventDefault();
});

function startEvents() {
  if (state.evt) state.evt.close();
  state.evt = new EventSource('/api/events', { withCredentials: true });
  state.evt.onopen = () => setConnectivityStatus(false);
  state.evt.onmessage = ev => {
    let event = {};
    try { event = JSON.parse(ev.data || '{}'); } catch {}
    setConnectivityStatus(false);
    handleServerEvent(event);
    const type = String(event.type || '');
    if (type === 'db_updated' && backgroundPatchAllowed(state.page) && !['ads','settings','p2p-market','chat'].includes(state.page) && !(state.page === 'orders' && state.currentOrderId)) {
      const active = document.activeElement;
      const editing = active && (['INPUT','TEXTAREA','SELECT'].includes(active.tagName) || active.isContentEditable);
      if (!editing) scheduleSmoothRefresh(320);
    }
    if (!type.startsWith('activity.')) {
      scheduleHeaderNotificationRefresh();
      scheduleMobileBottomNavRefresh(180);
    }
  };
  state.evt.onerror = () => setConnectivityStatus(navigator.onLine === false);
}

function eventOnceKey(key) {
  if (!key) return false;
  if (state.seenOrderEventKeys.has(key)) return true;
  state.seenOrderEventKeys.add(key);
  if (state.seenOrderEventKeys.size > 300) state.seenOrderEventKeys = new Set([...state.seenOrderEventKeys].slice(-150));
  return false;
}

function orderChangeNotice(change = {}) {
  const orderNo = change.orderNo || change.externalOrderNo || (change.orderId ? '#' + change.orderId : '');
  const statusText = String([change.externalStatus, change.status].filter(Boolean).join(' ')).toUpperCase();
  if (change.created) return { msg: `New order ${orderNo} received.`, type: 'ok' };
  if (!change.statusChanged) return null;
  if (/CANCEL/.test(statusText)) return { msg: `Order ${orderNo} cancelled.`, type: 'warn' };
  if (/WAIT_FOR_RELEASE|BUYER.*PAID|PAID_MARK|PAID/.test(statusText)) return { msg: `Order ${orderNo} paid marked.`, type: 'ok' };
  if (/QUICK_RELEASED|RELEASED|COMPLETED|FINISHED/.test(statusText) || ['released','completed'].includes(String(change.status || '').toLowerCase())) return { msg: `Order ${orderNo} completed/released.`, type: 'ok' };
  if (change.statusChanged) return { msg: `Order ${orderNo} status updated.`, type: 'ok' };
  return null;
}

function notifyOrderChange(change = {}, sourceType = '') {
  if (!notificationCredentialMatches(change.credentialId, 'orders')) return;
  const notice = orderChangeNotice(change);
  if (!notice) return;
  const key = [sourceType, change.orderId || change.id, change.orderNo || change.externalOrderNo, change.externalStatus, change.status, change.created ? 'new' : 'status'].join('|');
  if (eventOnceKey(key)) return;
  notify(notice.msg, notice.type, 3000);
  if (change.created) playOrderNotificationSoundOnce(change.orderId || change.id || change.orderNo || change.externalOrderNo, 'orders');
}

function handleServerEvent(event = {}) {
  if (!event || typeof event !== 'object') return;
  if (event.type === 'binance.account.features.updated'
    && (!Number(event.userId || 0) || Number(event.userId || 0) === Number(state.user?.id || 0))) {
    if (state.page === 'chat' && typeof renderChatInbox === 'function' && !modalOpen()) renderChatInbox({ preserveFocus:true }).catch(()=>{});
    else if (state.page === 'ads' && typeof scheduleAdsRealtimeRefresh === 'function') scheduleAdsRealtimeRefresh(80);
    else if (state.page === 'orders' && !state.currentOrderId && !modalOpen()) scheduleSmoothRefresh(80);
  }
  if (event.type === 'system.update.available') {
    if (state.bootstrap?.settings) {
      state.bootstrap.settings.updateAvailable = true;
      state.bootstrap.settings.updateAvailableVersion = event.version || '';
    }
    renderNav();
    if (state.page === 'system-update') scheduleSmoothRefresh(120);
  }
  if (String(event.type || '').startsWith('accounting.')) {
    if (isAccountingPage() && !modalOpen()) scheduleSmoothRefresh(120);
    if (state.page === 'dashboard') scheduleSmoothRefresh(220);
  }
  if (event.type === 'p2p.owner_profile.updated' || (event.type === 'p2p.extension.data_collected' && state.page === 'security')) {
    if (state.page === 'security') scheduleSmoothRefresh(160);
  }
  if (String(event.type || '').startsWith('ads.')) {
    if (state.page === 'ads') {
      if (modalOpen()) state.pendingAdsRefresh = true;
      else if (typeof scheduleAdsRealtimeRefresh === 'function') scheduleAdsRealtimeRefresh(80);
      else scheduleSmoothRefresh(120);
    }
  }
  if (/^(payment\.|order\.assignment\.)/.test(String(event.type || ''))) {
    if (Number(event.orderId || 0) === Number(state.currentOrderId || 0)) scheduleCurrentOrderReload(120);
    else if (state.page === 'orders') scheduleSmoothRefresh(180);
  }
  if (event.type === 'agent.order_acceptance.updated' || event.type === 'user.work_availability.updated') {
    const belongsToUser = Number(event.userId || 0) === Number(state.user?.id || 0) || Number(event.agentId || 0) === Number(state.user?.agentId || 0);
    if (belongsToUser) {
      const controlsAutoAssignment = event.controlsAutoAssignment !== undefined
        ? event.controlsAutoAssignment === true
        : state.orderAcceptance?.controlsAutoAssignment === true;
      const liveOrderAccess = event.liveOrderAccess !== undefined
        ? event.liveOrderAccess === true
        : state.orderAcceptance?.liveOrderAccess === true;
      state.orderAcceptance = {
        ...(state.orderAcceptance || {}),
        available: controlsAutoAssignment && !liveOrderAccess,
        controlsAutoAssignment,
        liveOrderAccess,
        accepting: event.accepting === true,
        workAvailable: event.accepting === true,
        assignable: event.assignable === true || state.orderAcceptance?.assignable === true,
        assignmentEligible: event.assignmentEligible === true,
        agentId: Number(event.agentId || state.user?.agentId || 0) || null,
        presenceStatus: event.presenceStatus || state.orderAcceptance?.presenceStatus || 'offline',
        updatedAt: event.updatedAt || event.at || null
      };
      if (typeof updateOrderAcceptanceControl === 'function') updateOrderAcceptanceControl();
    }
    if (['agents','routing','activity'].includes(state.page) && !modalOpen()) scheduleSmoothRefresh(150);
  }
  if (event.type === 'activity.presence.updated') {
    if (state.page === 'ads') {
      if (typeof scheduleAdsRealtimeRefresh === 'function') scheduleAdsRealtimeRefresh(event.changed ? 120 : 700);
    } else if (['activity','agents','dashboard'].includes(state.page)) {
      scheduleSmoothRefresh(event.changed ? 120 : 450);
    }
    return;
  }
  if (Array.isArray(event.changedOrders)) {
    event.changedOrders.forEach(o => notifyOrderChange(o, event.type));
    const current = event.changedOrders.find(o => Number(o.orderId || o.id) === Number(state.currentOrderId));
    if (current && state.page === 'orders' && state.currentOrderId) scheduleCurrentOrderReload(80);
    else if (event.changedOrders.length && state.page === 'orders' && !state.currentOrderId && !modalOpen()) {
      if (typeof applyOrderRealtimeChanges === 'function') applyOrderRealtimeChanges(event.changedOrders).catch(() => scheduleSmoothRefresh(80));
      else scheduleSmoothRefresh(80);
    }
  }
  if (event.type === 'order.created' && notificationCredentialMatches(event.credentialId, 'orders')) {
    const orderNo = event.orderNo || event.externalOrderNo || ('#' + event.orderId);
    const key = ['created', event.orderId, orderNo, event.at || ''].join('|');
    if (!eventOnceKey(key)) {
      notify(`New order ${orderNo} received.`, 'ok', 3000);
      playOrderNotificationSoundOnce(event.orderId || orderNo, 'orders');
    }
  }
  if (event.type === 'notification.created' && event.notification?.type === 'panel_sms_order_assigned') {
    const notification = event.notification;
    const belongsToUser = Number(notification.userId || 0) === Number(state.user?.id || 0) || Number(notification.agentId || 0) === Number(state.user?.agentId || 0);
    if (belongsToUser && notificationCredentialMatches(notification.credentialId, 'assignments')) playOrderNotificationSoundOnce(notification.orderId || notification.message, 'assignments');
  }
  if (event.type === 'order.additional_kyc.verified') {
    const orderNo = event.orderNo || event.externalOrderNo || ('#' + event.orderId);
    const key = ['additional-kyc', event.orderId, event.additionalKycVerify, event.at || ''].join('|');
    if (!eventOnceKey(key)) notify(`Order ${orderNo} additional verification completed.`, 'ok', 3000);
    if (Number(event.orderId) === Number(state.currentOrderId)) scheduleCurrentOrderReload(250);
    return;
  }
  if (event.type === 'order.final_action') {
    const change = { orderId: event.orderId, orderNo: event.orderNo, externalOrderNo: event.externalOrderNo, status: event.status, externalStatus: event.externalStatus };
    const action = String(event.action || '');
    const orderNo = change.orderNo || change.externalOrderNo || ('#' + event.orderId);
    const msg = action === 'paid_mark' ? `Order ${orderNo} paid marked.` : action.includes('release') ? `Order ${orderNo} released.` : `Order ${orderNo} completed.`;
    const key = ['final', event.orderId, action, event.externalStatus, event.status].join('|');
    if (!eventOnceKey(key)) notify(msg, 'ok', 3000);
    if (Number(event.orderId) === Number(state.currentOrderId)) scheduleCurrentOrderReload(450);
  }
  if (event.type === 'chat.message.received' && Number(event.incomingImported || event.imported || 0) > 0) {
    if (state.page === 'chat' && typeof renderChatInbox === 'function') {
      clearTimeout(state.chatInboxRefreshTimer);
      state.chatInboxRefreshTimer = setTimeout(() => renderChatInbox({ preserveFocus:true }).catch(()=>{}), 80);
    }
    const orderNo = event.orderNo || event.externalOrderNo || ('#' + event.orderId);
    const key = ['chat', event.orderId, event.latestMessageId || event.at || event.incomingImported].join('|');
    if (notificationCredentialMatches(event.credentialId, 'messages') && !eventOnceKey(key)) {
      notify(`New message on order ${orderNo}.`, 'ok', 3500);
      playOrderNotificationSoundOnce(key, 'messages');
    }
    if (Number(event.orderId) === Number(state.currentOrderId)) {
      scheduleCurrentOrderChatDelta(60);
      const chatVisible = !window.matchMedia('(max-width: 900px)').matches || document.body.classList.contains('order-chat-open');
      if (chatVisible) setTimeout(() => markOrderChatRead(event.orderId), 800);
    }
  }
  if (event.type === 'chat.message.sent' && Number(event.orderId) === Number(state.currentOrderId)) scheduleCurrentOrderChatDelta(40, { outgoing:true, forceScroll:true });
}

async function refreshCurrentOrderStateNonDestructive() {
  const orderId = Number(state.currentOrderId || 0);
  if (!orderId || state.page !== 'orders' || state.currentOrderSoftRefreshBusy) return;
  state.currentOrderSoftRefreshBusy = true;
  try {
    const updated = await api('/api/orders/' + orderId, { silent:true, noAutoReload:true });
    if (Number(state.currentOrderId || 0) !== orderId) return;
    const previous = state.currentOrder || {};
    state.currentOrder = { ...previous, ...updated };
    mergeCurrentOrderChatItems(updated.chats || [], { forceScroll:false });
    patchCurrentOrderDynamicFields(previous, state.currentOrder);
  } catch (_) {
    // A background state refresh must never disturb the operator's current viewport.
  } finally {
    state.currentOrderSoftRefreshBusy = false;
  }
}

function scheduleCurrentOrderReload(delay=450) {
  if (!state.currentOrderId || state.page !== 'orders') return;
  clearTimeout(state.currentOrderReloadTimer);
  state.currentOrderReloadTimer = setTimeout(() => {
    if (state.currentOrderId && !modalOpen()) refreshCurrentOrderStateNonDestructive().catch(()=>{});
  }, delay);
}

function modalOpen() { return !!document.querySelector('.modal-backdrop'); }

function scheduleSmoothRefresh(delay=350) {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => smoothRefreshCurrent(), delay);
}

async function smoothRefreshCurrent() {
  if (!state.user || modalOpen()) { state.pendingRefresh = true; return; }
  if (state.refreshing) { state.pendingRefresh = true; return; }
  if (state.page === 'orders' && state.currentOrderId) return;
  if (state.page === 'orders' && !state.currentOrderId && typeof renderOrders === 'function') {
    state.refreshing = true;
    try { await renderOrders({ background:true }); }
    catch (error) { if (!isUiRequestCancelled(error)) console.warn(error); }
    finally { state.refreshing = false; }
    return;
  }
  // True stable-shell policy: a generic realtime/database event is never allowed
  // to rebuild the application shell. Only explicitly approved pages may patch
  // their already-mounted data view, and the #content innerHTML gate morphs the
  // new client-side markup into existing nodes while preserving focus/scroll.
  if (!backgroundPatchAllowed(state.page)) return;
  const active = document.activeElement;
  const editing = active && document.getElementById('content')?.contains(active) && (['INPUT','TEXTAREA','SELECT'].includes(active.tagName) || active.isContentEditable);
  if (editing) { state.pendingRefresh = true; return; }
  const content = $('#content');
  state.refreshing = true;
  state.backgroundPatchDepth += 1;
  content?.classList.add('soft-updating');
  try {
    if (state.page === 'dashboard' && typeof renderDashboard === 'function') await renderDashboard({ background:true });
    else if (state.page === 'system-update' && typeof renderSystemUpdate === 'function') await renderSystemUpdate({ background:true });
    else if (state.page === 'activity' && typeof renderActivityMonitor === 'function') await renderActivityMonitor({ soft:true, background:true });
    else await renderPage(false);
  } catch (err) {
    if (!isUiRequestCancelled(err)) console.warn(err);
  } finally {
    state.backgroundPatchDepth = Math.max(0, state.backgroundPatchDepth - 1);
    content?.classList.remove('soft-updating');
    state.refreshing = false;
    if (state.pendingRefresh && !modalOpen()) { state.pendingRefresh = false; scheduleSmoothRefresh(180); }
  }
}

function visiblePages() { return pages.filter(p => hasPerm(PAGE_PERMISSIONS[p[0]]) && (p[0] !== 'system-update' || state.user.isOwner === true)); }
function canPage(page) { return visiblePages().some(p => p[0] === page); }

function stableRouteKey(route = {}) {
  return [String(route.page || ''), Number(route.orderId || 0), Number(route.ledgerAccountId || 0)].join(':');
}

function isUiRequestCancelled(error) {
  return Boolean(error && (error.cancelled === true || error.name === 'AbortError' || error.code === 'UI_REQUEST_CANCELLED'));
}

function setRoutePending(pending, label='Loading data…') {
  state.navigationPending = Boolean(pending);
  document.body.classList.toggle('route-pending', Boolean(pending));
  const content = $('#content');
  if (content) content.setAttribute('aria-busy', pending ? 'true' : 'false');
  const progress = $('#routeProgress');
  if (progress) {
    progress.setAttribute('aria-hidden', pending ? 'false' : 'true');
    const text = progress.querySelector('small');
    if (text) text.textContent = label || 'Loading data…';
  }
}

function abortPageRenderGuards(reason='navigation_changed') {
  const controllers = state.pageRenderControllers || {};
  Object.values(controllers).forEach(controller => {
    try { controller?.abort(reason); } catch (_) {}
  });
  state.pageRenderControllers = {};
}

function beginPageRenderGuard(key='page') {
  const name = String(key || 'page');
  const existing = state.pageRenderControllers?.[name];
  try { existing?.abort('superseded'); } catch (_) {}
  const controller = new AbortController();
  const seq = Number(state.pageRenderSeq?.[name] || 0) + 1;
  state.pageRenderSeq = { ...(state.pageRenderSeq || {}), [name]: seq };
  state.pageRenderControllers = { ...(state.pageRenderControllers || {}), [name]: controller };
  return { key:name, seq, controller, signal:controller.signal };
}

function pageRenderGuardCurrent(guard) {
  if (!guard || guard.signal?.aborted) return false;
  return Number(state.pageRenderSeq?.[guard.key] || 0) === Number(guard.seq || 0)
    && state.pageRenderControllers?.[guard.key] === guard.controller;
}

function beginNavigationScope(route = {}) {
  try { state.navigationController?.abort('navigation_changed'); } catch (_) {}
  abortPageRenderGuards('navigation_changed');
  const controller = new AbortController();
  const scope = {
    epoch: Number(state.navigationEpoch || 0) + 1,
    routeKey: stableRouteKey(route),
    controller,
    signal: controller.signal
  };
  state.navigationEpoch = scope.epoch;
  state.navigationController = controller;
  state.navigationRouteKey = scope.routeKey;
  setRoutePending(true);
  return scope;
}

function navigationScopeCurrent(scope) {
  return Boolean(scope && !scope.signal?.aborted
    && Number(scope.epoch) === Number(state.navigationEpoch)
    && String(scope.routeKey) === String(state.navigationRouteKey));
}

function finishNavigationScope(scope) {
  if (!navigationScopeCurrent(scope)) return;
  setRoutePending(false);
}

function stableLoadingShell(title='Loading') {
  return `<div class="stable-data-shell" data-stable-loading="1"><div class="stable-data-shell-head"><b>${escapeHtml(title)}</b><span>Connecting…</span></div><div class="stable-data-lines"><i></i><i></i><i></i></div></div>`;
}


const STABLE_ROUTE_CACHE_LIMIT = 10;
const STABLE_NODE_KEY_ATTRS = ['data-stable-key','data-order-id','data-chat-id','data-message-id','data-open-order-card','data-ads-account','data-account-id','data-agent-id','data-credential-id','data-route'];

function currentStateRouteKey() {
  return stableRouteKey({ page:state.page, orderId:state.currentOrderId, ledgerAccountId:state.ledgerAccountId });
}

function routeDisplayTitle(route = {}) {
  if (route.page === 'orders' && route.orderId) return `Order #${Number(route.orderId)}`;
  if (route.page === 'ledger' && route.ledgerAccountId) return 'Account Statement';
  return pages.find(item => item[0] === route.page)?.[1] || 'P2PFlow';
}

function routeStaticShellHtml(route = {}) {
  const title = routeDisplayTitle(route);
  const key = escapeAttr(stableRouteKey(route));
  const page = String(route.page || '');
  if (page === 'orders' && route.orderId) {
    return `<div class="fixed-route-shell fixed-route-order-shell" data-route-shell="${key}" data-page-shell="orders"><div class="fixed-route-shell-head"><strong>Order #${Number(route.orderId)}</strong><small>Connecting live order…</small></div><div class="fixed-route-order-grid"><section class="fixed-route-panel"><div class="fixed-route-mini-title">Order details</div><div class="fixed-route-lines"><i></i><i></i><i></i><i></i></div></section><section class="fixed-route-panel fixed-route-chat"><div class="fixed-route-mini-title">Messages</div><div class="fixed-route-chat-space"></div><div class="fixed-route-compose"></div></section></div></div>`;
  }
  if (page === 'dashboard') {
    return `<div class="fixed-route-shell" data-route-shell="${key}" data-page-shell="dashboard"><div class="fixed-route-shell-head"><strong>Dashboard</strong><small>Connecting live data…</small></div><div class="fixed-route-metric-grid">${'<i></i>'.repeat(4)}</div><div class="fixed-route-shell-grid"><section class="fixed-route-panel"><div class="fixed-route-mini-title">Method Capacity</div><div class="fixed-route-lines"><i></i><i></i><i></i></div></section><section class="fixed-route-panel"><div class="fixed-route-mini-title">Today</div><div class="fixed-route-lines"><i></i><i></i><i></i></div></section></div></div>`;
  }
  if (page === 'p2p-market') {
    return `<div class="fixed-route-shell" data-route-shell="${key}" data-page-shell="p2p-market"><div class="fixed-route-market-head"><strong>P2P</strong><span>BDT</span></div><div class="fixed-route-filter-row"><i></i><i></i><i></i><i></i></div><section class="fixed-route-panel fixed-route-list-panel"><div class="fixed-route-lines"><i></i><i></i><i></i><i></i><i></i></div></section></div>`;
  }
  if (page === 'orders') {
    return `<div class="fixed-route-shell" data-route-shell="${key}" data-page-shell="orders"><div class="fixed-route-shell-head"><strong>Orders</strong><small>Connecting live orders…</small></div><div class="fixed-route-tabs"><i></i><i></i><i></i><i></i></div><section class="fixed-route-panel fixed-route-list-panel"><div class="fixed-route-lines"><i></i><i></i><i></i><i></i><i></i></div></section></div>`;
  }
  if (page === 'chat') {
    return `<div class="fixed-route-shell" data-route-shell="${key}" data-page-shell="chat"><div class="fixed-route-shell-head"><strong>P2P Message</strong><small>Connecting conversations…</small></div><div class="fixed-route-search"></div><section class="fixed-route-panel fixed-route-list-panel"><div class="fixed-route-lines"><i></i><i></i><i></i><i></i></div></section></div>`;
  }
  if (page === 'ads') {
    return `<div class="fixed-route-shell" data-route-shell="${key}" data-page-shell="ads"><div class="fixed-route-shell-head"><strong>Advertisements</strong><small>Connecting live advertisements…</small></div><div class="fixed-route-tabs"><i></i><i></i><i></i></div><div class="fixed-route-filter-row"><i></i><i></i><i></i><i></i></div><div class="fixed-route-card-grid">${'<section></section>'.repeat(4)}</div></div>`;
  }
  if (page === 'settings') {
    return `<div class="fixed-route-shell" data-route-shell="${key}" data-page-shell="settings"><div class="fixed-route-shell-head"><strong>Settings</strong><small>Loading saved settings…</small></div><div class="fixed-route-settings-grid"><aside>${'<i></i>'.repeat(6)}</aside><section class="fixed-route-panel"><div class="fixed-route-lines"><i></i><i></i><i></i><i></i><i></i></div></section></div></div>`;
  }
  if (page === 'system-update') {
    return `<div class="fixed-route-shell" data-route-shell="${key}" data-page-shell="system-update"><div class="fixed-route-update-grid"><main><div class="fixed-route-update-hero"><strong>System Update</strong><span>Checking update status…</span></div><div class="fixed-route-metric-grid">${'<i></i>'.repeat(3)}</div><section class="fixed-route-panel"><div class="fixed-route-lines"><i></i><i></i><i></i></div></section><section class="fixed-route-panel"><div class="fixed-route-lines"><i></i><i></i></div></section></main><aside class="fixed-route-panel"><div class="fixed-route-mini-title">Update guide</div><div class="fixed-route-lines"><i></i><i></i><i></i><i></i><i></i></div></aside></div></div>`;
  }
  const sectionLabel = {
    'accounts':'Payment Accounts','offline-transactions':'Offline Business','ledger':'Account Statement','agents':'Users','user-roles':'User Roles','routing':'Routing','reports':'Reports','accounting':'Accounting','accounting-expenses':'Expense','accounting-income':'Business Income','accounting-capital':'Capital','accounting-closing':'Daily Closing','activity':'Activity Monitor','credentials':'API Credentials','health':'Health Check','p2p-extension':'Extension Bridge','p2p-profile':'P2P Profile','security':'Security','notifications':'Notifications','audit':'Audit Logs','approvals':'Approvals'
  }[page] || title;
  return `<div class="fixed-route-shell" data-route-shell="${key}" data-page-shell="${escapeAttr(page)}"><div class="fixed-route-shell-head"><strong>${escapeHtml(sectionLabel)}</strong><small>Connecting live data…</small></div><div class="fixed-route-tabs"><i></i><i></i><i></i></div><div class="fixed-route-shell-grid"><section class="fixed-route-panel"><div class="fixed-route-lines"><i></i><i></i><i></i><i></i></div></section><section class="fixed-route-panel"><div class="fixed-route-lines"><i></i><i></i><i></i></div></section></div></div>`;
}

function nativeContentInnerHtmlDescriptor() {
  return Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML') || Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerHTML');
}

function stableNodeKey(node) {
  if (!node || node.nodeType !== 1) return '';
  if (node.id) return `id:${node.id}`;
  for (const attr of STABLE_NODE_KEY_ATTRS) {
    const value = node.getAttribute?.(attr);
    if (value) return `${attr}:${value}`;
  }
  if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(node.tagName || '') && node.getAttribute('name')) return `name:${node.tagName}:${node.getAttribute('name')}`;
  return '';
}

function stableScrollableKey(node, index=0) {
  return stableNodeKey(node) || `${node.tagName || 'NODE'}:${node.className || ''}:${index}`;
}

function appScrollElement() {
  return window.P2PFlowViewport?.active?.() || document.getElementById('content') || document.scrollingElement;
}
function appScrollTop() { return Number(window.P2PFlowViewport?.top?.() ?? appScrollElement()?.scrollTop ?? 0); }
function appScrollLeft() { return Number(window.P2PFlowViewport?.left?.() ?? appScrollElement()?.scrollLeft ?? 0); }
function appScrollTo(options={}) {
  if (window.P2PFlowViewport?.to) return window.P2PFlowViewport.to(options);
  const el = appScrollElement();
  if (!el) return;
  const top = Number(options.top ?? el.scrollTop ?? 0), left = Number(options.left ?? el.scrollLeft ?? 0);
  if (typeof el.scrollTo === 'function') el.scrollTo({ top, left, behavior:options.behavior || 'auto' });
  else { el.scrollTop = top; el.scrollLeft = left; }
}
function appScrollBy(options={}) {
  if (window.P2PFlowViewport?.by) return window.P2PFlowViewport.by(options);
  const el = appScrollElement();
  if (!el) return;
  const top = Number(options.top || 0), left = Number(options.left || 0);
  if (typeof el.scrollBy === 'function') el.scrollBy({ top, left, behavior:options.behavior || 'auto' });
  else { el.scrollTop += top; el.scrollLeft += left; }
}
function appScrollNearBottom(distance=420) {
  if (window.P2PFlowViewport?.nearBottom) return window.P2PFlowViewport.nearBottom(distance);
  const el = appScrollElement();
  return Boolean(el && Number(el.clientHeight || 0) + Number(el.scrollTop || 0) >= Number(el.scrollHeight || 0) - Number(distance || 0));
}
function setupApplicationShellArchitecture() {
  if (state.routeHostManager) return state.routeHostManager;
  const viewport = document.getElementById('routeViewport');
  if (!viewport || !window.P2PFlowRouteHosts?.create) throw new Error('P2PFlow route-host runtime is unavailable.');
  state.routeHostManager = window.P2PFlowRouteHosts.create(viewport, { activeId:'content', maxHosts:12 });
  return state.routeHostManager;
}

function captureStableViewport(container) {
  const viewport = { x:Number(container?.scrollLeft || 0), y:Number(container?.scrollTop || 0), scroll:[], focus:null };
  const active = document.activeElement;
  if (active && container.contains(active)) {
    viewport.focus = {
      key:stableNodeKey(active),
      id:active.id || '',
      name:active.getAttribute?.('name') || '',
      start:typeof active.selectionStart === 'number' ? active.selectionStart : null,
      end:typeof active.selectionEnd === 'number' ? active.selectionEnd : null
    };
  }
  const candidates = [...container.querySelectorAll('[id], [data-stable-scroll], .chat-list, .table-wrap, .settings-nav, .p2p-market-shell')];
  const seen = new Set();
  candidates.forEach((node, index) => {
    if (node.scrollTop <= 0 && node.scrollLeft <= 0) return;
    const key = stableScrollableKey(node, index);
    if (seen.has(key)) return;
    seen.add(key);
    viewport.scroll.push({ key, top:node.scrollTop, left:node.scrollLeft });
  });
  return viewport;
}

function findStableNodeByKey(container, key) {
  if (!key) return null;
  if (key.startsWith('id:')) return container.querySelector(`#${CSS.escape(key.slice(3))}`);
  const sep = key.indexOf(':');
  if (sep > 0 && key.startsWith('data-')) {
    const attr = key.slice(0, sep);
    const value = key.slice(sep + 1);
    try { return container.querySelector(`[${attr}="${CSS.escape(value)}"]`); } catch (_) { return null; }
  }
  if (key.startsWith('name:')) {
    const parts = key.split(':');
    const tag = parts[1] || '*';
    const name = parts.slice(2).join(':');
    try { return container.querySelector(`${tag}[name="${CSS.escape(name)}"]`); } catch (_) { return null; }
  }
  return null;
}

function restoreStableViewport(container, viewport) {
  if (!viewport) return;
  requestAnimationFrame(() => {
    viewport.scroll.forEach(item => {
      const node = findStableNodeByKey(container, item.key);
      if (node) { node.scrollTop = item.top; node.scrollLeft = item.left; }
    });
    const focus = viewport.focus;
    if (focus) {
      let node = focus.key ? findStableNodeByKey(container, focus.key) : null;
      if (!node && focus.id) node = container.querySelector(`#${CSS.escape(focus.id)}`);
      if (!node && focus.name) node = container.querySelector(`[name="${CSS.escape(focus.name)}"]`);
      if (node && typeof node.focus === 'function') {
        node.focus({ preventScroll:true });
        if (focus.start !== null && typeof node.setSelectionRange === 'function') {
          try { node.setSelectionRange(focus.start, focus.end ?? focus.start); } catch (_) {}
        }
      }
    }
    if (container && typeof container.scrollTo === 'function') container.scrollTo({ top:viewport.y, left:viewport.x, behavior:'auto' });
    else if (container) { container.scrollTop = viewport.y; container.scrollLeft = viewport.x; }
  });
}

function syncStableAttributes(current, next) {
  const preserveValue = document.activeElement === current;
  const preserveOpen = current.tagName === 'DETAILS' && current.open;
  [...current.attributes].forEach(attr => {
    if (preserveValue && ['value','checked','selected'].includes(attr.name)) return;
    if (preserveOpen && attr.name === 'open') return;
    if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  });
  [...next.attributes].forEach(attr => {
    if (preserveValue && ['value','checked','selected'].includes(attr.name)) return;
    if (preserveOpen && attr.name === 'open') return;
    if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  });
  if (preserveOpen) current.open = true;
  if (!preserveValue) {
    if (current instanceof HTMLInputElement) {
      if (current.type === 'checkbox' || current.type === 'radio') current.checked = next.checked;
      else if (current.value !== next.value) current.value = next.value;
    } else if (current instanceof HTMLTextAreaElement || current instanceof HTMLSelectElement) {
      if (current.value !== next.value) current.value = next.value;
    }
  }
}

function morphStableNode(current, next) {
  if (!current || !next) return current;
  if (current.nodeType !== next.nodeType || (current.nodeType === 1 && current.tagName !== next.tagName)) {
    const replacement = next.cloneNode(true);
    current.replaceWith(replacement);
    return replacement;
  }
  if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return current;
  }
  syncStableAttributes(current, next);
  const currentChildren = [...current.childNodes];
  const keyed = new Map();
  currentChildren.forEach(child => { const key = stableNodeKey(child); if (key) keyed.set(key, child); });
  let cursor = current.firstChild;
  [...next.childNodes].forEach((nextChild, index) => {
    const key = stableNodeKey(nextChild);
    let match = key ? keyed.get(key) : null;
    if (!match && cursor && !stableNodeKey(cursor) && cursor.nodeType === nextChild.nodeType && (cursor.nodeType !== 1 || cursor.tagName === nextChild.tagName)) match = cursor;
    if (!match) {
      match = nextChild.cloneNode(true);
      current.insertBefore(match, cursor || null);
    } else if (match !== cursor) {
      current.insertBefore(match, cursor || null);
    }
    const morphed = morphStableNode(match, nextChild);
    cursor = morphed.nextSibling;
  });
  while (cursor) {
    const next = cursor.nextSibling;
    cursor.remove();
    cursor = next;
  }
  return current;
}

function stableMorphContent(container, html) {
  const descriptor = nativeContentInnerHtmlDescriptor();
  if (!descriptor?.set) return;
  const staging = document.createElement('div');
  descriptor.set.call(staging, String(html ?? ''));
  const viewport = captureStableViewport(container);
  const currentChildren = [...container.childNodes];
  const nextChildren = [...staging.childNodes];
  if (!currentChildren.length || !nextChildren.length || container.querySelector('[data-route-shell]')) {
    descriptor.set.call(container, String(html ?? ''));
    restoreStableViewport(container, viewport);
    return;
  }
  let cursor = container.firstChild;
  nextChildren.forEach(nextChild => {
    let match = cursor;
    const key = stableNodeKey(nextChild);
    if (key) match = [...container.childNodes].find(child => stableNodeKey(child) === key) || cursor;
    if (!match) {
      const clone = nextChild.cloneNode(true);
      container.appendChild(clone);
      cursor = clone.nextSibling;
      return;
    }
    if (match !== cursor) container.insertBefore(match, cursor || null);
    const morphed = morphStableNode(match, nextChild);
    cursor = morphed.nextSibling;
  });
  while (cursor) {
    const next = cursor.nextSibling;
    cursor.remove();
    cursor = next;
  }
  restoreStableViewport(container, viewport);
}

function installStableContentArchitecture(content = document.getElementById('content')) {
  const descriptor = nativeContentInnerHtmlDescriptor();
  if (!content || content.dataset.stableCommitInstalled === '1' || !descriptor?.get || !descriptor?.set) return;
  Object.defineProperty(content, 'innerHTML', {
    configurable:true,
    get() { return descriptor.get.call(this); },
    set(value) {
      const html = String(value ?? '');
      if (!html || !this.children.length || this.querySelector('[data-route-shell]')) descriptor.set.call(this, html);
      else stableMorphContent(this, html);
    }
  });
  content.dataset.stableCommitInstalled = '1';
}

function cacheActiveRouteView() {
  // v1.7.4 keeps the entire route host intact instead of moving/recreating page
  // children. Capturing is therefore only a scroll-state operation.
  state.routeHostManager?.captureActive?.();
}

function restoreCachedRouteView(routeKey) {
  if (!state.routeHostManager?.has?.(routeKey)) return false;
  const activation = state.routeHostManager.activate(routeKey);
  installStableContentArchitecture(activation.host);
  activation.host.dataset.routeKey = routeKey;
  return true;
}

function mountRouteStaticShell(route = {}, content = document.getElementById('content')) {
  const descriptor = nativeContentInnerHtmlDescriptor();
  if (!content || !descriptor?.set) return;
  descriptor.set.call(content, routeStaticShellHtml(route));
  content.dataset.routeKey = stableRouteKey(route);
  if (typeof content.scrollTo === 'function') content.scrollTo({ top:0, left:0, behavior:'auto' });
  else { content.scrollTop = 0; content.scrollLeft = 0; }
}

function backgroundPatchAllowed(page=state.page) {
  return ['dashboard','orders','system-update','accounting','accounting-expenses','accounting-income','accounting-capital','accounting-closing','activity','agents','routing','security'].includes(page);
}

function parseHashRoute() {
  const router = window.P2PFlowHistoryRouter;
  if (router?.legacyHashToRoute) return router.legacyHashToRoute(location.hash) || { page:'dashboard', orderId:null, ledgerAccountId:null };
  const raw = String(location.hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  const page = parts[0] || 'dashboard';
  const route = { page, orderId:null, ledgerAccountId:null };
  if (page === 'orders' && parts[1]) route.orderId = Number(parts[1]) || null;
  if (page === 'ledger' && parts[1] === 'account' && parts[2]) route.ledgerAccountId = Number(parts[2]) || null;
  return route;
}

function parseLocationRoute() {
  const router = window.P2PFlowHistoryRouter;
  if (router?.locationToRoute) return router.locationToRoute(location);
  return parseHashRoute();
}

function routePath(page, opts={}) {
  const route = {
    page,
    orderId: page === 'orders' ? Number(opts.orderId || 0) || null : null,
    ledgerAccountId: page === 'ledger' ? Number(opts.accountId || opts.ledgerAccountId || 0) || null : null
  };
  const routed = window.P2PFlowHistoryRouter?.routeToPath?.(route);
  if (routed) return routed;
  if (route.page === 'orders' && route.orderId) return `/orders/${route.orderId}`;
  if (route.page === 'ledger' && route.ledgerAccountId) return `/payments/statement/account/${route.ledgerAccountId}`;
  return `/${encodeURIComponent(String(route.page || 'dashboard'))}`;
}

function canonicalRoutePath(route={}) {
  return window.P2PFlowHistoryRouter?.routeToPath?.(route)
    || routePath(route.page || 'dashboard', { orderId:route.orderId, accountId:route.ledgerAccountId });
}

function migrateLegacyHashLocation() {
  const router = window.P2PFlowHistoryRouter;
  const legacy = router?.legacyHashToRoute?.(location.hash || '');
  if (!legacy) return null;
  const path = router.routeToPath(legacy);
  history.replaceState({ p2pflow:true, migratedFromHash:true }, '', path);
  return legacy;
}

function setRoute(page, opts={}) {
  const targetRoute = {
    page,
    orderId: page === 'orders' ? Number(opts.orderId || 0) || null : null,
    ledgerAccountId: page === 'ledger' ? Number(opts.accountId || opts.ledgerAccountId || 0) || null : null
  };
  const target = canonicalRoutePath(targetRoute);
  const current = canonicalRoutePath(parseLocationRoute());
  const legacyHash = Boolean(window.P2PFlowHistoryRouter?.legacyHashToRoute?.(location.hash || ''));
  if (!legacyHash && current === target && location.pathname === target) {
    if (opts.force === true) return routeFromLocation(opts.showLoading !== false);
    return Promise.resolve();
  }
  history.pushState({ p2pflow:true, route:targetRoute }, '', target);
  return routeFromLocation(opts.showLoading !== false);
}

async function routeFromLocation(showLoading=true) {
  setMobileNavigation(false, { restoreFocus:false });
  setupApplicationShellArchitecture();
  migrateLegacyHashLocation();
  const parsed = parseLocationRoute();
  const fallbackPage = visiblePages()[0]?.[0] || 'dashboard';
  const route = {
    ...parsed,
    page: canPage(parsed.page) ? parsed.page : fallbackPage
  };
  if (route.page !== parsed.page) {
    route.orderId = null;
    route.ledgerAccountId = null;
  }
  const canonicalPath = canonicalRoutePath(route);
  if (location.pathname !== canonicalPath || location.hash) {
    history.replaceState({ p2pflow:true, route }, '', canonicalPath);
  }

  const nextRouteKey = stableRouteKey(route);
  const previousPage = state.page;
  const previousRouteKey = state.activeContentRouteKey || currentStateRouteKey();
  const scope = beginNavigationScope(route);
  if (previousPage && previousPage !== route.page) deactivatePageRuntime(previousPage, route.page);

  // State switches before data fetching. This is what makes old async results
  // fail their route/page guards even on a slow connection.
  state.page = route.page;
  state.currentOrderId = route.orderId;
  state.ledgerAccountId = route.ledgerAccountId;
  state.activeContentRouteKey = nextRouteKey;

  const activation = state.routeHostManager.activate(nextRouteKey, {
    shellHtml: routeStaticShellHtml(route)
  });
  const contentHost = activation.host;
  installStableContentArchitecture(contentHost);
  contentHost.dataset.routeKey = nextRouteKey;
  contentHost.dataset.page = route.page;
  setRoutePending(true);
  setTitle(routeDisplayTitle(route), '');

  document.body.classList.toggle('p2p-market-active', state.page === 'p2p-market');
  document.body.classList.toggle('profile-mobile-active', state.page === 'p2p-profile');
  if (state.page !== 'p2p-profile') document.body.classList.remove('profile-payment-subpage-active');
  document.body.classList.toggle('chat-inbox-active', state.page === 'chat');
  if (state.page !== 'chat' && typeof stopChatInboxAutoRefresh === 'function') stopChatInboxAutoRefresh();
  document.body.classList.toggle('order-detail-active', state.page === 'orders' && !!state.currentOrderId);
  if (!(state.page === 'orders' && state.currentOrderId)) document.body.classList.remove('order-chat-open');
  if (state.activityViewTimer) clearTimeout(state.activityViewTimer);
  state.activityViewTimer = null;
  markActivityInteraction('navigation', true);
  scheduleActivityHeartbeat(200);
  renderNav();

  // Returning to an already-mounted route must feel instant. The route-host
  // retains its last usable DOM, event handlers and scroll position, so show it
  // immediately and revalidate data in the background instead of putting the
  // operator behind a network wait on every page switch.
  const reusableRouteView = !activation.created
    && Boolean(contentHost.children.length)
    && !contentHost.querySelector('[data-route-shell], [data-stable-loading="1"], .stable-data-error');
  if (reusableRouteView) {
    finishNavigationScope(scope);
    window.setTimeout(async () => {
      if (!navigationScopeCurrent(scope)) return;
      try {
        if (state.page === 'orders' && state.currentOrderId) await loadOrderDetail(state.currentOrderId, false, true, scope);
        else {
          stopChatAutoSync();
          stopOrderDetailAutoSync();
          await renderPage(false, scope);
        }
      } catch (error) {
        if (!isUiRequestCancelled(error) && navigationScopeCurrent(scope)) notify(error.message || 'Background data refresh failed.', 'warn', 3500);
      }
    }, 20);
    return;
  }

  try {
    if (state.page === 'orders' && state.currentOrderId) {
      await loadOrderDetail(state.currentOrderId, showLoading, true, scope);
    } else {
      stopChatAutoSync();
      stopOrderDetailAutoSync();
      await renderPage(showLoading, scope);
    }
    if (navigationScopeCurrent(scope) && showLoading !== false && activation.created) appScrollTo({ top:0, left:0, behavior:'auto' });
  } catch (error) {
    if (!isUiRequestCancelled(error) && navigationScopeCurrent(scope)) {
      const content = document.getElementById('content');
      const hasStableView = Boolean(content && content.children.length && !content.querySelector('[data-stable-loading="1"]'));
      notify(error.message || 'Data could not be loaded. The current screen was kept open.', 'warn', 5000);
      if (!hasStableView && content) content.innerHTML = `<div class="card stable-data-error"><b>Data temporarily unavailable</b><span>${escapeHtml(error.message || 'Please try again.')}</span></div>`;
    }
  } finally {
    finishNavigationScope(scope);
  }
}


const MOBILE_BOTTOM_NAV_ICONS = {
  p2p: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 7a4 4 0 1 0 0 .1M23 7a4 4 0 1 0 0 .1M5 24v-4.2c0-3.1 2.3-5.4 5.4-5.4h2.2M27 24v-4.2c0-3.1-2.3-5.4-5.4-5.4h-2.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M13 21.5h6M16 18.5v6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M4.5 3.5h4M3.5 4.5v4M27.5 3.5h-4M28.5 4.5v4M4.5 28.5h4M3.5 27.5v-4M27.5 28.5h-4M28.5 27.5v-4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>',
  orders: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 4.5h13.5v21H8z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="22.5" cy="22.5" r="6" fill="white" stroke="currentColor" stroke-width="2.2"/><path d="M22.5 19.2v3.7l2.5 1.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>',
  ads: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 14h6l12-7v18l-12-7H5z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><path d="M11 18l2 8H8l-1.5-8M26 12.5c1.7 1.8 1.7 5.2 0 7" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>',
  chat: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 6h22v15H14l-7 5v-5H5z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M9 11h14M9 15h10" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>',
  profile: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="9" r="5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M7 28v-5c0-4.5 3.5-7.5 9-7.5s9 3 9 7.5v5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
};

function mobileBottomNavTarget(id) {
  if (id === 'p2p') return canPage('p2p-market') ? 'p2p-market' : (canPage('dashboard') ? 'dashboard' : (canPage('orders') ? 'orders' : visiblePages()[0]?.[0]));
  if (id === 'orders') return canPage('orders') ? 'orders' : visiblePages()[0]?.[0];
  if (id === 'ads') return canPage('ads') ? 'ads' : visiblePages()[0]?.[0];
  if (id === 'chat') return canPage('chat') ? 'chat' : (canPage('orders') ? 'orders' : visiblePages()[0]?.[0]);
  if (id === 'profile') return canPage('p2p-profile') ? 'p2p-profile' : visiblePages()[0]?.[0];
  return visiblePages()[0]?.[0];
}

function mobileBottomNavActive(id) {
  if (id === 'p2p') return state.page === 'p2p-market';
  if (id === 'orders') return state.page === 'orders' && !document.body.classList.contains('order-chat-open');
  if (id === 'ads') return state.page === 'ads';
  if (id === 'chat') return state.page === 'chat' || (state.page === 'orders' && document.body.classList.contains('order-chat-open'));
  if (id === 'profile') return state.page === 'p2p-profile';
  return false;
}

function mobileBottomNavBadge(id) {
  const value = id === 'orders' ? Number(state.mobileNavCounts?.orders || 0) : id === 'chat' ? Number(state.mobileNavCounts?.chats || 0) : 0;
  if (value <= 0) return '';
  const text = value > 99 ? '99+' : String(value);
  return `<span class="mobile-bottom-nav-badge" aria-label="${value} ${id === 'chat' ? 'unread messages' : 'ongoing orders'}">${text}</span>`;
}

async function openMobileChatShortcut() {
  const target = mobileBottomNavTarget('chat');
  if (target) setRoute(target);
}

function renderMobileBottomNav() {
  const nav = $('#mobileBottomNav');
  if (!nav || !state.user) return;
  const items = [
    ['p2p', 'P2P'],
    ['orders', 'Orders'],
    ['ads', 'Ads'],
    ['chat', 'Chat'],
    ['profile', 'Profile']
  ];
  nav.innerHTML = items.map(([id, label]) => {
    const active = mobileBottomNavActive(id);
    return `<button type="button" data-mobile-bottom-nav="${id}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''} aria-label="${label}"><span class="mobile-bottom-nav-icon">${MOBILE_BOTTOM_NAV_ICONS[id]}${mobileBottomNavBadge(id)}</span><span class="mobile-bottom-nav-label">${label}</span></button>`;
  }).join('');
  nav.querySelectorAll('[data-mobile-bottom-nav]').forEach(button => {
    button.onclick = () => {
      const id = button.dataset.mobileBottomNav;
      setMobileNavigation(false, { restoreFocus:false });
      if (id === 'chat') return openMobileChatShortcut();
      const target = mobileBottomNavTarget(id);
      if (target) setRoute(target);
    };
  });
}

async function refreshMobileBottomNavCounts() {
  if (!state.user || state.mobileNavSyncBusy) return;
  state.mobileNavSyncBusy = true;
  try {
    const counts = await api('/api/navigation-counts', { silent:true, noAutoReload:true }).catch(() => state.mobileNavCounts || {});
    state.mobileNavCounts = {
      orders: Math.max(0, Number(counts?.orders || 0)),
      chats: Math.max(0, Number(counts?.chats || 0)),
      approvals: Math.max(0, Number(counts?.approvals || 0))
    };
    renderMobileBottomNav();
    refreshNavBadges();
  } finally {
    state.mobileNavSyncBusy = false;
  }
}

function scheduleMobileBottomNavRefresh(delay=250) {
  if (!state.user) return;
  clearTimeout(state.mobileNavSyncTimer);
  state.mobileNavSyncTimer = setTimeout(async () => {
    await refreshMobileBottomNavCounts();
    scheduleMobileBottomNavRefresh(15000);
  }, Math.max(0, Number(delay || 0)));
}

function startMobileBottomNavSync() {
  renderMobileBottomNav();
  scheduleMobileBottomNavRefresh(0);
}

function refreshNavBadges() {
  const nav = $('#nav');
  if (!nav) return;
  nav.querySelectorAll('[data-nav-page]').forEach(button => {
    let slot = button.querySelector('.nav-item-badge-slot');
    if (!slot) return;
    slot.innerHTML = navPageBadge(button.dataset.navPage);
  });
}

function renderNav() {
  const nav = $('#nav');
  if (!nav) return;
  // Runtime fingerprint for support/debugging. If a screenshot ever shows the
  // legacy flat menu while this marker is absent, the browser/proxy is serving
  // stale frontend JavaScript rather than the active release.
  nav.dataset.navigationModel = 'grouped-control-center';
  nav.dataset.uiRelease = '1.7.4';
  nav.innerHTML = '';
  const visible = visiblePages();
  const visibleIds = new Set(visible.map(([id]) => id));
  const pageLabels = new Map(visible.map(([id, label]) => [id, label]));
  const configuredIds = new Set(NAV_MENU_GROUPS.flatMap(group => group.items.map(item => item[0])));
  configuredIds.add('dashboard');

  const createPageButton = (id, label, iconName, extraClass='') => {
    if (!visibleIds.has(id)) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `nav-page-button ${extraClass} ${id === state.page ? 'active' : ''}`.trim();
    button.dataset.navPage = id;
    if (id === state.page) button.setAttribute('aria-current', 'page');
    button.innerHTML = `${navIcon(iconName)}<span class="nav-item-label">${escapeHtml(label || pageLabels.get(id) || id)}</span><span class="nav-item-badge-slot">${navPageBadge(id)}</span>`;
    button.onclick = () => {
      setMobileNavigation(false, { restoreFocus:false });
      if (usesMobileNavigation()) appScrollTo({ top:0, left:0, behavior:'auto' });
      setRoute(id);
    };
    return button;
  };

  const dashboard = createPageButton('dashboard', 'Dashboard', 'dashboard', 'nav-dashboard-button');
  if (dashboard) nav.appendChild(dashboard);

  const activeGroupId = NAV_MENU_GROUPS.find(group => group.items.some(([id]) => id === state.page))?.id || '';
  const savedGroupId = localStorage.getItem('crmOpenNavGroup') || '';
  const initialOpenGroupId = activeGroupId || savedGroupId;

  NAV_MENU_GROUPS.forEach(groupDef => {
    const allowedItems = groupDef.items.filter(([id]) => visibleIds.has(id));
    if (!allowedItems.length) return;
    const active = allowedItems.some(([id]) => id === state.page);
    const open = groupDef.id === initialOpenGroupId;
    const group = document.createElement('section');
    group.className = `nav-group nav-section ${active ? 'active' : ''} ${open ? 'open' : ''}`.trim();
    group.dataset.navGroup = groupDef.id;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nav-group-toggle';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.innerHTML = `${navIcon(groupDef.icon)}<span class="nav-item-label">${escapeHtml(groupDef.label)}</span><span class="nav-group-caret" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m6 8 4 4 4-4"/></svg></span>`;

    const submenu = document.createElement('div');
    submenu.className = 'nav-submenu';
    submenu.setAttribute('aria-hidden', open ? 'false' : 'true');
    const inner = document.createElement('div');
    inner.className = 'nav-submenu-inner';
    allowedItems.forEach(([id, label, iconName]) => {
      const item = createPageButton(id, label, iconName, 'nav-submenu-button');
      if (item) inner.appendChild(item);
    });
    submenu.appendChild(inner);

    toggle.onclick = () => {
      const opening = !group.classList.contains('open');
      nav.querySelectorAll('.nav-group.open').forEach(other => {
        if (other === group) return;
        other.classList.remove('open');
        other.querySelector('.nav-group-toggle')?.setAttribute('aria-expanded', 'false');
        other.querySelector('.nav-submenu')?.setAttribute('aria-hidden', 'true');
      });
      group.classList.toggle('open', opening);
      toggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
      submenu.setAttribute('aria-hidden', opening ? 'false' : 'true');
      if (opening) {
        localStorage.setItem('crmOpenNavGroup', groupDef.id);
        window.setTimeout(() => {
          const target = group.querySelector('.nav-page-button.active') || group;
          revealSidebarNavElement(target, 'smooth');
        }, 260);
      } else localStorage.removeItem('crmOpenNavGroup');
    };

    group.append(toggle, submenu);
    nav.appendChild(group);
  });

  // Permission-safe fallback for any future page that has not yet been added to NAV_MENU_GROUPS.
  const fallback = visible.filter(([id]) => !configuredIds.has(id));
  if (fallback.length) {
    const group = document.createElement('section');
    group.className = 'nav-group nav-section nav-fallback-group open';
    const inner = document.createElement('div');
    inner.className = 'nav-submenu nav-fallback-menu';
    const list = document.createElement('div');
    list.className = 'nav-submenu-inner';
    fallback.forEach(([id, label]) => {
      const item = createPageButton(id, label, 'dashboard', 'nav-submenu-button');
      if (item) list.appendChild(item);
    });
    inner.appendChild(list);
    group.appendChild(inner);
    nav.appendChild(group);
  }

  renderSidebarMeta();
  applyLanguage(nav);
  renderMobileBottomNav();
  window.requestAnimationFrame(() => {
    const activeItem = nav.querySelector('.nav-page-button.active');
    if (activeItem) revealSidebarNavElement(activeItem, 'auto');
  });

  // Fail visibly instead of silently falling back to the pre-v1.4 flat menu.
  // This assertion is intentionally presentation-only; it does not change any
  // page permission or routing rule.
  const expectedGroups = NAV_MENU_GROUPS.filter(groupDef =>
    groupDef.items.some(([id]) => visibleIds.has(id))
  ).length;
  const renderedGroups = nav.querySelectorAll('.nav-group').length;
  if (renderedGroups !== expectedGroups) {
    console.error('P2PFlow grouped navigation render mismatch', { expectedGroups, renderedGroups });
  }
}

function setTitle(title, subtitle='') {
  $('#pageTitle').textContent = title;
  const subtitleEl = $('#pageSubtitle');
  subtitleEl.textContent = subtitle;
  subtitleEl.classList.toggle('hidden', !String(subtitle || '').trim());
  applyLanguage(document.querySelector('.topbar') || document);
}

const PAGE_RUNTIME = Object.freeze({
  dashboard: { render:() => renderDashboard() },
  'p2p-market': { render:() => renderP2pMarket(), deactivate:() => { if (state.p2pMarketRefreshTimer) clearInterval(state.p2pMarketRefreshTimer); state.p2pMarketRefreshTimer = null; try { state.p2pMarketInfiniteObserver?.disconnect?.(); } catch (_) {} } },
  'p2p-profile': { render:() => renderP2PProfile() },
  orders: { render:() => renderOrders(), deactivate:() => { stopChatAutoSync(); stopOrderDetailAutoSync(); } },
  chat: { render:() => renderChatInbox(), deactivate:() => { if (typeof stopChatInboxAutoRefresh === 'function') stopChatInboxAutoRefresh(); } },
  ads: { render:() => renderAds(), deactivate:() => { if (state.adsLivePollTimer) clearInterval(state.adsLivePollTimer); state.adsLivePollTimer = null; } },
  approvals: { render:() => renderApprovals() },
  accounts: { render:() => renderAccounts() },
  'offline-transactions': { render:() => renderOfflineTransactions() },
  ledger: { render:() => renderLedger() },
  agents: { render:() => renderUsers() },
  'user-roles': { render:() => renderUserRoles() },
  routing: { render:() => renderRouting() },
  reports: { render:() => renderReports() },
  accounting: { render:() => renderAccounting(), deactivate:() => { if (state.accountingRefreshTimer) clearInterval(state.accountingRefreshTimer); state.accountingRefreshTimer = null; state.accountingLoading = false; } },
  'accounting-expenses': { render:() => renderAccountingExpenses(), deactivate:() => { if (state.accountingRefreshTimer) clearInterval(state.accountingRefreshTimer); state.accountingRefreshTimer = null; state.accountingLoading = false; } },
  'accounting-income': { render:() => renderAccountingIncome(), deactivate:() => { if (state.accountingRefreshTimer) clearInterval(state.accountingRefreshTimer); state.accountingRefreshTimer = null; state.accountingLoading = false; } },
  'accounting-capital': { render:() => renderAccountingCapital(), deactivate:() => { if (state.accountingRefreshTimer) clearInterval(state.accountingRefreshTimer); state.accountingRefreshTimer = null; state.accountingLoading = false; } },
  'accounting-closing': { render:() => renderAccountingClosing(), deactivate:() => { if (state.accountingRefreshTimer) clearInterval(state.accountingRefreshTimer); state.accountingRefreshTimer = null; state.accountingLoading = false; } },
  activity: { render:() => renderActivityMonitor() },
  credentials: { render:() => renderCredentials() },
  health: { render:() => renderHealth() },
  'system-update': { render:() => renderSystemUpdate() },
  settings: { render:() => renderSettings() },
  'p2p-extension': { render:() => renderP2pExtensionAdmin() },
  security: { render:() => renderSecurity() },
  notifications: { render:() => renderNotifications() },
  audit: { render:() => renderAudit() }
});

function deactivatePageRuntime(page, nextPage='') {
  if (!page || page === nextPage) return;
  try { PAGE_RUNTIME[page]?.deactivate?.(); } catch (error) { console.warn('Page deactivate failed', page, error); }
}

async function renderPage(showLoading=true, navigationScope=null) {
  if (state.page !== 'p2p-market' && state.p2pMarketRefreshTimer) {
    clearInterval(state.p2pMarketRefreshTimer);
    state.p2pMarketRefreshTimer = null;
  }
  if (state.page !== 'ads' && state.adsLivePollTimer) {
    clearInterval(state.adsLivePollTimer);
    state.adsLivePollTimer = null;
  }
  if (!isAccountingPage() && state.accountingRefreshTimer) {
    clearInterval(state.accountingRefreshTimer);
    state.accountingRefreshTimer = null;
    state.accountingLoading = false;
  }
  const content = $('#content');
  if (showLoading && content && !content.children.length) content.innerHTML = stableLoadingShell(state.page === 'orders' ? 'Orders' : (pages.find(p => p[0] === state.page)?.[1] || 'Loading'));
  try {
    const pageRuntime = PAGE_RUNTIME[state.page];
    if (!pageRuntime?.render) throw new Error(`Page module is unavailable: ${state.page}`);
    await pageRuntime.render();
    if (navigationScope && !navigationScopeCurrent(navigationScope)) return;
    applyLanguage(document.querySelector('#content') || document);
    if (showLoading !== false && usesMobileNavigation()) {
      requestAnimationFrame(() => $('#content')?.focus({ preventScroll: true }));
    }
  } catch (err) {
    if (isUiRequestCancelled(err) || (navigationScope && !navigationScopeCurrent(navigationScope))) return;
    const currentContent = $('#content');
    const hasStableView = Boolean(currentContent && currentContent.children.length && !currentContent.querySelector('[data-stable-loading="1"]'));
    if (hasStableView) {
      notify(err.hostingChallenge ? 'Connection verification interrupted this data request. The current screen was kept open.' : (err.message || 'Data refresh failed. The current screen was kept open.'), 'warn', 5000);
      return;
    }
    const body = `<div class="error">${escapeHtml(err.message)}</div>${err.hostingChallenge ? '<div class="mt-sm"><button class="secondary" data-route="health">Open Health Check</button></div>' : ''}`;
    if (currentContent) currentContent.innerHTML = `<div class="card stable-data-error">${body}</div>`;
    $$('[data-route]').forEach(el => el.onclick = () => setRoute(el.dataset.route));
    applyLanguage(document.querySelector('#content') || document);
  }
}



function dashMetric(title, value, icon, route='') {
  return `<div class="card metric-card clickable" ${route ? `data-route="${escapeAttr(route)}"` : ''}><div class="metric-icon">${escapeHtml(icon)}</div><span>${escapeHtml(title)}</span><b>${value}</b></div>`;
}

function methodDashCard(m) {
  const pct = Math.min(100, Math.round(numSafe(m.buyCapacity) / Math.max(1, numSafe(m.currentBalance)) * 100));
  const sellSub = m.binanceAssetCapacity ? `<div class="sub">SELL limited by Binance USDT: ${money(m.binanceAssetCapacity)}</div>` : '';
  return `<div class="method-card clickable" data-route="accounts"><div><b>${escapeHtml(m.name)}</b><span>${m.accountCount} accounts</span></div><div class="method-money">${money(m.currentBalance)}</div><div class="mini-row"><span>BUY</span><b>${money(m.buyCapacity)}</b></div><div class="mini-row"><span>SELL</span><b>${money(m.sellReceiveCapacity)}</b></div>${sellSub}<div class="progress"><span style="width:${pct}%"></span></div></div>`;
}

function numSafe(n) { return Number(n || 0); }

function metric(title, value, sub) { return `<div class="card"><div class="sub">${escapeHtml(title)}</div><div class="metric">${value}</div><div class="sub">${escapeHtml(sub)}</div></div>`; }





function openApprovalDecisionModal(id, decision) {
  const label = decision === 'approved' ? 'Approve Request' : 'Reject Request';
  modal(label, `<form id="approvalDecisionForm" class="form-grid"><input type="hidden" name="decision" value="${decision}"/><div class="full-row"><label>Decision Note</label><input name="note" value="${decision === 'approved' ? 'Approved after manager review' : 'Rejected after manager review'}" /></div><div class="full-row" id="approvalDecisionMessage"></div><div class="full-row"><button class="${decision === 'approved' ? 'success' : 'danger'}" type="submit">${label}</button></div></form>`);
  $('#approvalDecisionForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const obj = formObj(e.target);
      await api(`/api/approvals/${id}/decision`, { method: 'POST', body: JSON.stringify(obj) });
      notify('Approval request updated.', 'ok');
      closeModal();
      await renderApprovals();
    } catch (err) { setFormMessage('#approvalDecisionMessage', err.message || 'Decision failed', 'danger'); }
  };
}


function upperStatusText(o) { return String([o.externalStatus, o.status, o.rawStatus].filter(Boolean).join(' ')).toUpperCase(); }
function isCancelledOrder(o) { return /CANCEL/.test(upperStatusText(o)) || ['cancelled'].includes(String(o.status || '').toLowerCase()); }
function isFulfilledOrder(o) {
  const txt = upperStatusText(o);
  return isCancelledOrder(o) || /COMPLETED|FINISHED|RELEASED|BINANCE_RELEASED/.test(txt) || ['completed','released'].includes(String(o.status || '').toLowerCase());
}
function isOngoingOrder(o) { return !isFulfilledOrder(o); }
function orderTextExplicitlyUnpaid(txt='') {
  return /UNPAID|NOT[_\s-]*PAID|WAIT[_\s-]*FOR[_\s-]*PAYMENT|WAIT.*PAYMENT|PENDING.*PAYMENT/.test(String(txt || '').toUpperCase());
}
function orderPayGroup(o) {
  const txt = upperStatusText(o);
  if (/APPEAL|COMPLAIN|DISPUTE/.test(txt) || String(o.status || '').toLowerCase() === 'hold') return 'appeal';
  if (String(o.status || '').toLowerCase() === 'paid_marked') return 'paid';
  if (orderTextExplicitlyUnpaid(txt)) return 'unpaid';
  if (/WAIT_FOR_RELEASE|WAIT.*RELEASE|\bPAID\b|BUYER.*PAID|CONFIRM.*PAY/.test(txt)) return 'paid';
  return 'unpaid';
}
function binanceDisplayStatus(o) {
  if (isCancelledOrder(o)) return 'CANCELLED';
  const txt = upperStatusText(o);
  if (/APPEAL|COMPLAIN|DISPUTE/.test(txt)) return 'APPEAL';
  if (String(o.status || '').toLowerCase() === 'paid_marked') return 'PAID';
  if (orderTextExplicitlyUnpaid(txt)) return 'UNPAID';
  if (/WAIT_FOR_RELEASE|BUYER.*PAID|\bPAID\b|CONFIRM.*PAY/.test(txt)) return 'PAID';
  if (/COMPLETED|FINISHED|RELEASED/.test(txt) || ['completed','released'].includes(String(o.status || '').toLowerCase())) return 'COMPLETED';
  return 'UNPAID';
}

function orderCountdownStopLabel(o = {}) {
  if (isCancelledOrder(o)) return 'Cancelled';
  if (isFulfilledOrder(o)) return 'Completed';
  return '';
}

function orderCountdownHtml(o = {}, tag = 'b') {
  const safeTag = ['b', 'strong', 'span'].includes(String(tag)) ? String(tag) : 'b';
  const stopped = orderCountdownStopLabel(o);
  if (stopped) {
    const stateClass = isCancelledOrder(o) ? 'cancelled' : 'completed';
    return `<${safeTag} class="order-countdown-stopped ${stateClass}">${escapeHtml(stopped)}</${safeTag}>`;
  }
  return `<${safeTag} data-countdown="${escapeAttr(o.paymentDeadlineAt || '')}">${countdownText(o.paymentDeadlineAt)}</${safeTag}>`;
}

function isBuyerPaid(o) {
  return orderPayGroup(o) === 'paid' || String(o.status || '').toLowerCase() === 'paid_marked';
}

function isGenericPaymentDisplayName(name) {
  const s = String(name || '').trim().toLowerCase();
  return !s || ['binance pay method','binance method','payment method','syncing payment method','binance','unknown','-'].includes(s) || /^syncing/.test(s);
}

function displayPaymentMethodName(o = {}) {
  window.__paymentCache = window.__paymentCache || Object.create(null);
  const key = String(o.id || o.orderNo || o.externalOrderNo || '');
  const snapshot = o.payMethodSnapshot?.name || o.payMethodSnapshot?.methodName || o.payMethodSnapshot?.identifier || '';
  const method = o.method?.name || '';
  const raw = snapshot && (!method || isGenericPaymentDisplayName(method)) ? snapshot : (method || snapshot || o.payMethodSnapshot?.payType || '');
  if (raw && key) window.__paymentCache[key] = raw;
  if (!raw && key && window.__paymentCache[key]) return window.__paymentCache[key];
  return raw || '-';
}

function methodLabelHtml(o) {
  return `<span class="payment-method-highlight">${escapeHtml(displayPaymentMethodName(o))}</span>`;
}

function orderNumberLabelHtml(o) {
  const payId = o.binancePayId || o.payMethodSnapshot?.payId || o.customerPaymentDetails?.payId || '';
  return `<b>${escapeHtml(o.orderNo)}</b>${payId ? `<br/><span class="sub">Pay ID ${escapeHtml(payId)}</span>` : ''}<br/><span class="sub">${escapeHtml(o.externalStatus || '')}</span>`;
}

function safeWebUrl(value, options={}) {
  const raw = String(value || '').trim();
  if (!raw || /[\u0000-\u001f\u007f\\]/.test(raw)) return '';
  const allowRelative = options.allowRelative !== false;
  if (allowRelative && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  let parsed;
  try { parsed = new URL(raw); } catch { return ''; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
  return parsed.toString();
}
function safeBinanceUrl(value, fallback='https://p2p.binance.com/en') {
  const candidate = safeWebUrl(value, { allowRelative:false });
  if (candidate) {
    try {
      const parsed = new URL(candidate);
      const host = parsed.hostname.toLowerCase();
      if (parsed.protocol === 'https:' && (host === 'binance.com' || host.endsWith('.binance.com'))) return parsed.toString();
    } catch {}
  }
  return fallback ? safeWebUrl(fallback, { allowRelative:false }) : '';
}
function safeMediaUrl(value, kind='image') {
  const raw = String(value || '').trim();
  const web = safeWebUrl(raw, { allowRelative:true });
  if (web) return web;
  if (raw.startsWith('blob:')) {
    try { const parsed = new URL(raw); return parsed.origin === location.origin ? parsed.toString() : ''; } catch { return ''; }
  }
  if (kind === 'image' && /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(raw)) return raw;
  if (kind === 'video' && /^data:video\/(?:mp4|webm);base64,[a-z0-9+/=\s]+$/i.test(raw)) return raw;
  return '';
}
function isLikelyUrl(v) { return Boolean(safeWebUrl(v, { allowRelative:true })); }
function firstPaymentValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}
function paymentDetailCopyButton(value, label='Copy') {
  if (!String(value || '').trim()) return '';
  return `<button class="payment-copy-btn" type="button" data-copy-payment-value="${escapeAttr(value)}" aria-label="${escapeAttr(label)}">⧉</button>`;
}
function paymentDetailRowHtml(label, value, options={}) {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return '';
  const rowClass = options.wide ? ' wide' : '';
  const copyValue = options.copyValue !== undefined ? String(options.copyValue || '').trim() : cleanValue;
  return `<div class="payment-detail-row${rowClass}"><span>${escapeHtml(label)}</span><div><b>${escapeHtml(cleanValue)}</b>${options.copy === false || !copyValue ? '' : paymentDetailCopyButton(copyValue, `Copy ${label}`)}</div></div>`;
}
function plainAmountCopyValue(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return String(value || '').replace(/[^0-9.\-]/g, '');
  return String(n);
}
function orderAdditionalVerificationState(order={}) {
  const rawStatus = order.additionalKycVerify;
  const numeric = rawStatus === null || rawStatus === undefined || rawStatus === '' ? null : Number(rawStatus);
  const statusText = String(rawStatus ?? '').trim().toLowerCase();
  const verified = order.additionalVerificationVerified === true || numeric === 2 || /verified|complete|completed|passed|approved/.test(statusText);
  const required = order.additionalVerificationRequired === true || Number(order.takerAdditionalKycRequired || 0) === 1 || numeric === 1 || numeric === 2 || /pending|required|waiting|unverified/.test(statusText);
  return { required, verified, pending: required && !verified, status: verified ? 2 : (required ? 1 : 0) };
}

function additionalVerificationNoticeHtml(order={}) {
  if (!isRealBinanceOrder(order)) return '';
  const stateInfo = orderAdditionalVerificationState(order);
  if (!stateInfo.required) return '';
  if (stateInfo.pending) {
    return `<div class="card order-card additional-kyc-card pending">
      <div class="additional-kyc-icon" aria-hidden="true">✓</div>
      <div><h3>Additional Verification Pending</h3><p>Verify the counterparty before payment or release.</p><small></small></div>
    </div>`;
  }
  return ''; // Completed state is already clear from the normal order actions; keep the workspace uncluttered.
}

function accountTypeLabel(value) {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'agent') return 'Agent';
  if (type === 'merchant' || type === 'business') return 'Merchant';
  return 'Personal';
}

function selectedPaymentAccountHtml(order={}) {
  const accounts = Array.isArray(order.selectedPaymentAccounts) && order.selectedPaymentAccounts.length
    ? order.selectedPaymentAccounts
    : (order.selectedPaymentAccount ? [order.selectedPaymentAccount] : []);
  if (!accounts.length) return '';
  const rows = accounts.map(account => {
    const methodName = account.method?.name || account.method?.code || 'Payment account';
    const meta = [account.label ? `Label: ${account.label}` : '', account.serialNumber ? `Serial: ${account.serialNumber}` : '', account.accountName || '', accountTypeLabel(account.accountType)].filter(Boolean).join(' · ');
    return `<div class="selected-payment-account-row"><b>${escapeHtml(methodName)} · ${escapeHtml(account.accountNumber || '-')}</b><small>${escapeHtml(meta)}</small></div>`;
  }).join('');
  return `<div class="card order-card selected-payment-account-card">
    <div class="selected-payment-account-icon" aria-hidden="true">✓</div>
    <div class="selected-payment-account-copy"><span>${accounts.length > 1 ? 'Selected Payment Accounts' : 'Selected Payment Account'}</span>${rows}</div>
    <span class="badge ok">${accounts.length > 1 ? `${accounts.length} ACTIVE` : 'ACTIVE'}</span>
  </div>`;
}

function updateSelectedPaymentAccountSlot(order={}) {
  const slot = document.getElementById('selectedPaymentAccountSlot');
  if (slot) slot.innerHTML = selectedPaymentAccountHtml(order);
}

function orderQuickMessages(order={}) {
  const configured = Array.isArray(order.settings?.quickMessages) ? order.settings.quickMessages : [];
  const cleaned = configured.map(item => String(item || '').trim()).filter(Boolean).slice(0, 20);
  return cleaned.length ? cleaned : [
    'Please send your verification documents in this chat.',
    'Your verification is complete. Please proceed with the payment.',
    'Please mark the order as paid after completing the transfer.',
    'Payment received. I am checking the payment now.'
  ];
}

function paymentMethodToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function accountMatchesOrderMethod(account={}, order={}) {
  if (Number(account.paymentMethodId || 0) && Number(account.paymentMethodId) === Number(order.paymentMethodId || 0)) return true;
  const orderTokens = [displayPaymentMethodName(order), order.payMethodSnapshot?.name, order.payMethodSnapshot?.identifier, order.payMethodSnapshot?.payType].map(paymentMethodToken).filter(Boolean);
  const accountTokens = [account.method?.name, account.method?.code, account.method?.binanceIdentifier, account.method?.binancePayType].map(paymentMethodToken).filter(Boolean);
  return orderTokens.some(left => accountTokens.some(right => left === right || left.includes(right) || right.includes(left)));
}

function orderViewerSummary(o={}) {
  const summary = o.viewerSummary || o.summary || {};
  const fullAmount = Number(o.fiatAmount || o.amount || summary.orderAmount || 0);
  const scoped = Boolean(summary.isScoped && isAssignmentScopedClient());
  return {
    ...summary,
    isScoped: scoped,
    assignedAmount: scoped ? Number(summary.assignedAmount || 0) : fullAmount,
    viewerActual: scoped ? Number(summary.viewerActual || 0) : Number(summary.relevantActual || 0),
    viewerRemaining: scoped ? Number(summary.viewerRemaining || 0) : Number(summary.remaining || 0)
  };
}

function orderViewerAmount(o={}) {
  return orderViewerSummary(o).assignedAmount;
}

function finalActionSplitGateStateForOrder(order={}, finalAction='') {
  if (finalAction === 'complete') return { enabled:false, satisfied:true, relevantSplitCount:0, missingProofCount:0 };
  const serverState = order.finalActionSplitGate && typeof order.finalActionSplitGate === 'object' ? order.finalActionSplitGate : null;
  if (serverState) {
    return {
      enabled: serverState.enabled !== false,
      satisfied: serverState.satisfied === true,
      relevantSplitCount: Number(serverState.relevantSplitCount || 0),
      missingProofCount: Number(serverState.missingProofCount || 0),
      direction: serverState.direction || (String(order.type || '').toUpperCase() === 'BUY' ? 'send' : 'receive')
    };
  }
  const enabled = order.orderSource === 'offline' || order.settings?.requirePaymentSplitForFinalAction !== false;
  const direction = String(order.type || '').toUpperCase() === 'BUY' ? 'send' : 'receive';
  const relevant = (order.paymentSplits || []).filter(split => split.direction === direction && Number(split.actualAmount || 0) > 0);
  const proofRequired = order.settings?.paymentSplitProofRequired !== false;
  const missingProofCount = proofRequired ? relevant.filter(split => !split.hasProof).length : 0;
  return {
    enabled,
    direction,
    relevantSplitCount: relevant.length,
    missingProofCount,
    satisfied: !enabled || (relevant.length > 0 && missingProofCount === 0)
  };
}

async function markOrderPaidWithoutSplitPopup(order) {
  if (!order?.id) return;
  const buttons = $$('[id$=FinalActionBtn]').filter(button => !button.disabled);
  buttons.forEach(button => { button.disabled = true; button.dataset.directPaidBusy = '1'; });
  try {
    const updated = await api(`/api/orders/${order.id}/complete-action`, {
      method:'POST',
      body:JSON.stringify({
        action:'paid_mark',
        binanceOrderNumber:order.externalOrderNo || order.orderNo || '',
        payId:Number(order.binancePayId || 0) || undefined
      }),
      silent:true
    });
    if (updated?.approvalRequired) {
      notify('Manager approval is required before Mark as Paid.', 'warn', 5000);
      return updated;
    }
    notify('Order marked as paid.', 'ok', 2600);
    applyUpdatedCurrentOrder(updated, order.id);
    return updated;
  } catch (err) {
    if (err?.data?.order && typeof err.data.order === 'object') {
      Object.assign(order, err.data.order);
      state.currentOrder = order;
    }
    notify(err.message || 'Mark as Paid failed.', 'danger', 6000);
    return null;
  } finally {
    buttons.forEach(button => {
      if (button.dataset.directPaidBusy === '1') {
        delete button.dataset.directPaidBusy;
        button.disabled = false;
      }
    });
  }
}

function openOrderFinalActionFlow(order, finalAction) {
  const gate = finalActionSplitGateStateForOrder(order, finalAction);
  if (gate.enabled && !gate.satisfied) return openPaymentSplitActionModal(order, finalAction);
  // When Payment Split is disabled, BUY orders should behave like Binance:
  // Mark as Paid immediately. Do not make the operator confirm an empty modal.
  if (finalAction === 'paid_mark' && !gate.enabled) return markOrderPaidWithoutSplitPopup(order);
  if (finalAction === 'release' || finalAction === 'quick_release') return startReleaseFinalActionFlow(order, finalAction);
  return openFinalActionModal(order, finalAction);
}

function currentUserOrderAssignment(o={}) {
  if (!isAssignmentScopedClient() || !state.user?.agentId) return null;
  return (o.assignments || []).find(a => Number(a.agentId) === Number(state.user.agentId) && a.status !== 'left') || null;
}

function currentUserIsCoAgent(o={}) {
  const assignment = currentUserOrderAssignment(o);
  return Boolean(assignment && assignment.role === 'co_agent');
}

function viewerAssetQuantity(o={}, quantity=0) {
  const full = Number(o.fiatAmount || o.amount || 0);
  const viewer = orderViewerAmount(o);
  if (!full || !Number.isFinite(full) || viewer >= full) return Number(quantity || 0);
  return Number(quantity || 0) * Math.max(0, viewer / full);
}

function customerPaymentDetailsCard(o) {
  if (!isRealBinanceOrder(o)) return '';
  const snapshot = o.payMethodSnapshot || {};
  const synced = o.customerPaymentDetails || {};
  const selectedFallback = synced.selectedOnly ? {} : snapshot;
  const isBuy = String(o.type || '').toUpperCase() === 'BUY';
  const methodName = firstPaymentValue(synced.methodName, synced.name, selectedFallback.methodName, selectedFallback.name, selectedFallback.tradeMethodName, selectedFallback.identifier, displayPaymentMethodName(o), 'Payment Method');
  const payee = firstPaymentValue(synced.payee, selectedFallback.payee, selectedFallback.realName, selectedFallback.accountName);
  const payAccount = firstPaymentValue(synced.payAccount, selectedFallback.payAccount, selectedFallback.accountNo, selectedFallback.accountNumber, selectedFallback.walletNumber, selectedFallback.mobile);
  const payBank = firstPaymentValue(synced.payBank, selectedFallback.payBank, selectedFallback.bankName, selectedFallback.walletName, selectedFallback.payType);
  const paySubBank = firstPaymentValue(synced.paySubBank, selectedFallback.paySubBank, selectedFallback.branchName, selectedFallback.branch);
  const remark = firstPaymentValue(synced.remark, selectedFallback.remark, selectedFallback.remarks, selectedFallback.instruction);
  const payId = firstPaymentValue(synced.payId, selectedFallback.payId, o.binancePayId);
  const qrCodePath = firstPaymentValue(synced.qrCodePath, selectedFallback.qrCodePath);
  const hasDestination = Boolean(payee || payAccount || payBank || paySubBank || remark || payId || qrCodePath);
  const amountLabel = isBuy ? 'You Pay' : 'Expected Receive';
  const viewerAmount = orderViewerAmount(o);
  const amountValue = money(viewerAmount);
  const referenceValue = payId || o.orderNo || o.externalOrderNo || '';
  const detailRows = [
    paymentDetailRowHtml(amountLabel, amountValue, { copy:true, copyValue: plainAmountCopyValue(viewerAmount) }),
    paymentDetailRowHtml('Account / Wallet Number', payAccount),
    paymentDetailRowHtml('Account Name', payee),
    paymentDetailRowHtml('Bank / Wallet', payBank, { copy:false }),
    paymentDetailRowHtml('Branch / Sub Bank', paySubBank, { copy:false }),
    paymentDetailRowHtml('Remarks', remark, { wide:true }),
    paymentDetailRowHtml('Reference / Pay ID', referenceValue)
  ].filter(Boolean).join('');
  const qrUrl = safeMediaUrl(qrCodePath, 'image');
  const qr = qrCodePath ? `<div class="pay-qr payment-detail-qr">${qrUrl ? `<a href="${escapeAttr(qrUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escapeAttr(qrUrl)}" alt="Payment QR"/><span>Open QR / payment image</span></a>` : `<span>${escapeHtml(qrCodePath)}</span>`}</div>` : '';
  const err = o.lastBinancePaymentDetailError || o.lastBinanceDetailError || '';
  const errHtml = err && !hasDestination ? `<div class="notice danger-note mt-sm"><b>Payment detail sync error:</b> ${escapeHtml(err)}</div>` : '';
  const heading = isBuy ? `Transfer via: ${methodName}` : 'My Payment Method';
  const helper = isBuy ? 'Use these destination details before marking this order as paid.' : `Receive and verify payment through ${methodName}.`;
  return `<div class="card order-card customer-pay-card payment-flow-card ${hasDestination ? '' : 'muted-card'}">
    <div class="payment-flow-head">
      <div class="payment-step-number">1</div>
      <div><h3>${escapeHtml(heading)}</h3><p>${escapeHtml(helper)}</p></div>
    </div>
    ${hasDestination || methodName ? `<div class="payment-method-strip"><span>${escapeHtml(methodName)}</span>${badge(isBuy ? 'PAYMENT DESTINATION' : 'RECEIVE METHOD', isBuy ? 'blue' : 'ok')}</div>` : ''}
    ${detailRows ? `<div class="payment-detail-list">${detailRows}</div>${qr}` : '<div class="empty-state small">Payment details are not available yet. The background sync will update this section automatically when Binance returns the selected payment method.</div>'}
    ${errHtml}
  </div>`;
}
function canQuickRelease() { return hasPerm('orders.quick_release'); }

function finalActionButtons(o, finalAction, idPrefix='') {
  if (isFulfilledOrder(o)) return '';
  const assignment = currentUserOrderAssignment(o);
  if (isAssignmentScopedClient() && assignment?.role === 'co_agent') {
    if (['completed','partial_completed','left'].includes(String(assignment.status || ''))) return '';
    return `<button class="success co-agent-done-btn" id="${idPrefix}CoAgentDoneBtn">Done</button>`;
  }
  const verification = orderAdditionalVerificationState(o);
  if (verification.pending) {
    const verifyId = `${idPrefix}AdditionalKycVerifyBtn`;
    return `<button class="success additional-kyc-verify-btn" id="${verifyId}" title="Confirm Binance Additional Verification">Verified</button>`;
  }
  const finalId = `${idPrefix}FinalActionBtn`;
  const quickId = `${idPrefix}QuickReleaseBtn`;
  if (finalAction === 'complete') return `<button class="success" id="${finalId}">Complete Offline Order</button>`;
  if (finalAction === 'paid_mark') {
    if (isBuyerPaid(o)) return '';
    return `<button class="success" id="${finalId}">Mark as Paid</button>`;
  }
  if (finalAction === 'release') {
    const paid = isBuyerPaid(o);
    // Cached order status can lag behind Binance. The server refreshes the exact
    // order and runs checkIfCanReleaseCoin before any release mutation.
    const normalBtn = `<button class="success" id="${finalId}" title="${paid ? 'Release the paid order' : 'Refresh paid status with Binance, then release only if Binance allows it'}">${paid ? 'Release Coin' : 'Check Paid & Release'}</button>`;
    const quickBtn = canQuickRelease() ? `<button class="danger" id="${quickId}" title="Permission controlled release before paid mark">Quick Release</button>` : '';
    return normalBtn + quickBtn;
  }
  return '';
}

function bindCurrentOrderDynamicActionButtons(order) {
  const o = order || state.currentOrder;
  if (!o || state.page !== 'orders' || Number(state.currentOrderId || 0) !== Number(o.id || 0)) return;
  const finalAction = o.orderSource === 'offline' ? 'complete' : (o.type === 'BUY' ? 'paid_mark' : 'release');
  ['additionalKycVerifyBtn','mobileTopAdditionalKycVerifyBtn','chatTopAdditionalKycVerifyBtn'].forEach(id => {
    const button = $('#' + id);
    if (button) button.onclick = () => verifyOrderAdditionalKyc(o, button);
  });
  ['CoAgentDoneBtn','mobileTopCoAgentDoneBtn','chatTopCoAgentDoneBtn'].forEach(id => {
    const button = $('#' + id);
    if (button) button.onclick = () => openCoAgentDoneModal(o, currentUserOrderAssignment(o));
  });
  ['finalActionBtn','mobileTopFinalActionBtn','chatTopFinalActionBtn'].forEach(id => {
    const button = $('#' + id);
    if (button && !button.disabled) button.onclick = () => openOrderFinalActionFlow(o, finalAction);
  });
  ['quickReleaseBtn','mobileTopQuickReleaseBtn','chatTopQuickReleaseBtn'].forEach(id => {
    const button = $('#' + id);
    if (button) button.onclick = () => openOrderFinalActionFlow(o, 'quick_release');
  });
  $$('[data-update-split]').forEach(button => button.onclick = () => openUpdateSplitModal(o, Number(button.dataset.updateSplit)));
  $$('[data-delete-split]').forEach(button => button.onclick = () => deletePaymentSplit(o, Number(button.dataset.deleteSplit)));
  $$('[data-complete-agent]').forEach(button => button.onclick = () => openCompleteUserModal(o, Number(button.dataset.completeAgent)));
}

function patchCurrentOrderDynamicFields(previousOrder = {}, updatedOrder = {}) {
  const o = updatedOrder || {};
  if (!o.id || state.page !== 'orders' || Number(state.currentOrderId || 0) !== Number(o.id || 0)) return false;
  const assetSummary = orderAssetSummaryView(o);
  const displayedAssetQuantity = o.type === 'BUY' ? assetSummary.receiveQuantity : assetSummary.releaseQuantity;
  const viewerSummary = orderViewerSummary(o);
  const viewerFiatAmount = viewerSummary.assignedAmount;
  const viewerDisplayedAssetQuantity = viewerAssetQuantity(o, displayedAssetQuantity);
  const flowText = o.type === 'BUY'
    ? `Pay ${money(viewerFiatAmount)} and receive ${assetFmt(viewerDisplayedAssetQuantity, o.asset)} after fee`
    : `Release ${assetFmt(viewerDisplayedAssetQuantity, o.asset)} and receive ${money(viewerFiatAmount)}`;
  const statusText = binanceDisplayStatus(o);
  setTitle(statusText, orderCounterpartyNickname(o));

  const statusLine = $('#orderMobileStatusLine');
  if (statusLine) statusLine.innerHTML = `${escapeHtml(statusText)}${isFulfilledOrder(o) ? '' : ` · ${orderCountdownHtml(o, 'strong')}`}`;
  const mobileAmount = $('#orderMobileAmountValue');
  if (mobileAmount) mobileAmount.textContent = money(viewerFiatAmount);
  const mobileRemaining = $('#orderMobileRemainingValue');
  if (mobileRemaining) mobileRemaining.textContent = money(viewerSummary.viewerRemaining);
  const mobileActual = $('#orderMobileActualValue');
  if (mobileActual) mobileActual.textContent = `${o.type === 'BUY' ? 'Paid so far' : 'Received so far'}: ${money(viewerSummary.viewerActual)}`;
  const flow = $('#orderHeroFlowText');
  if (flow) flow.textContent = flowText;
  const statusBadge = $('#orderHeroStatusBadge');
  if (statusBadge) statusBadge.innerHTML = badge(statusText, isCancelledOrder(o) ? 'danger' : statusText === 'PAID' ? 'warn' : statusText === 'COMPLETED' ? 'ok' : 'blue');
  const heroAmount = $('#orderHeroPaymentAmount');
  if (heroAmount) heroAmount.textContent = money(viewerFiatAmount);
  const heroActual = $('#orderHeroActualAmount');
  if (heroActual) heroActual.textContent = money(viewerSummary.viewerActual);
  const heroRemaining = $('#orderHeroRemainingAmount');
  if (heroRemaining) heroRemaining.textContent = money(viewerSummary.viewerRemaining);
  const heroMeta = $('#orderHeroPaymentMeta');
  if (heroMeta) heroMeta.textContent = `${o.type === 'BUY' ? `Net ${assetFmt(assetSummary.receiveQuantity, o.asset)} · Total ${assetFmt(assetSummary.totalQuantity, o.asset)} · Fee ${assetFeeDisplay(o, assetSummary)}` : `Release ${assetFmt(assetSummary.releaseQuantity, o.asset)} · Total ${assetFmt(assetSummary.totalQuantity, o.asset)} · Fee ${assetFeeDisplay(o, assetSummary)}`} · ${o.fiatUnit || 'BDT'}`;

  const verificationSlot = $('#orderAdditionalVerificationSlot');
  if (verificationSlot) verificationSlot.innerHTML = additionalVerificationNoticeHtml(o);
  updateSelectedPaymentAccountSlot(o);
  const paymentDetails = $('#orderCustomerPaymentDetailsSlot');
  if (paymentDetails) paymentDetails.innerHTML = customerPaymentDetailsCard(o);
  const splitsCard = $('#orderSplitsCard');
  if (splitsCard) splitsCard.innerHTML = `<div class="section-head"><h3>Payment Splits</h3><span>${o.paymentSplits.length} ${o.paymentSplits.length === 1 ? 'entry' : 'entries'}</span></div>${o.paymentSplits.length ? `<div class="split-list">${o.paymentSplits.map(renderSplit).join('')}</div>` : '<div class="empty-state">No split yet. Add payment split, select wallet/account, then update actual amount and proof.</div>'}`;
  const assignedCard = $('#orderAssignedCard');
  if (assignedCard) assignedCard.innerHTML = `<div class="section-head"><h3>Assigned Users</h3><span>Lead + co-users progress</span></div>${table(['User','Role','Assigned','Actual','Direction','Status','Action'], (o.assignments || []).map(a => [a.agent?.name || ('#'+a.agentId), a.role, money(a.assignedAmount), money(a.actualAmount || 0), a.direction, badge(a.status, statusClass(a.status)), agentTaskAction(a, o)]))}<div class="sub mt-sm">Each assigned user can complete their own part. If a co-user pays less, the short amount stays with the lead user automatically.</div>`;
  const approvals = $('#orderApprovalsSlot');
  if (approvals) approvals.innerHTML = renderOrderApprovals(o);
  const statements = $('#orderStatementFeed');
  if (statements) statements.innerHTML = statementFeed(o.ledgers);

  const finalAction = o.orderSource === 'offline' ? 'complete' : (o.type === 'BUY' ? 'paid_mark' : 'release');
  const mobileActions = $('#orderMobileTopActions');
  if (mobileActions) mobileActions.innerHTML = finalActionButtons(o, finalAction, 'mobileTop');
  const chatActions = $('#orderChatTopActions');
  if (chatActions) chatActions.innerHTML = finalActionButtons(o, finalAction, 'chatTop');
  bindCurrentOrderDynamicActionButtons(o);
  startCountdownTimers();
  applyLanguage(document.querySelector('#content') || document);
  return true;
}

function applyUpdatedCurrentOrder(updatedOrder = {}, fallbackOrderId = 0) {
  const orderId = Number(updatedOrder?.id || fallbackOrderId || 0);
  if (!orderId || state.page !== 'orders' || Number(state.currentOrderId || 0) !== orderId) return false;
  const previous = state.currentOrder || {};
  const merged = { ...previous, ...(updatedOrder || {}) };
  state.currentOrder = merged;
  if (Array.isArray(updatedOrder?.chats)) mergeCurrentOrderChatItems(updatedOrder.chats, { forceScroll:false });
  return patchCurrentOrderDynamicFields(previous, merged);
}

function setOrderInternalNotePanel(open=false) {
  const panel = $('#orderInternalNotePanel');
  const button = $('#chatInternalNoteRailBtn');
  if (!panel) return;
  panel.classList.toggle('is-open', !!open);
  panel.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    setTimeout(() => {
      const notes = $('#internalNoteBox');
      if (notes) notes.scrollTop = notes.scrollHeight;
      panel.querySelector('textarea')?.focus({ preventScroll:true });
    }, 160);
  }
}

function closeMobileOrderChat() {
  document.body.classList.remove('order-chat-open');
  renderMobileBottomNav();
  setOrderInternalNotePanel(false);
  closeChatImageViewer();
  const panel = $('#orderChatPanel');
  const button = $('#mobileOrderChatBtn');
  if (panel) panel.setAttribute('aria-hidden', window.matchMedia('(max-width: 900px)').matches ? 'true' : 'false');
  if (button) button.setAttribute('aria-expanded', 'false');
}


async function markOrderChatRead(orderId) {
  const id = Number(orderId || 0);
  if (!id) return;
  try {
    await api('/api/chat-unread', { method:'POST', body: JSON.stringify({ orderId: id }), silent:true, noAutoReload:true });
    const badge = document.querySelector(`[data-unread-order-id="${id}"]`);
    if (badge) badge.remove();
    scheduleMobileBottomNavRefresh(80);
  } catch (_) {}
}

function bindOrderDetailChatPanel(order) {
  const panel = $('#orderChatPanel');
  const openBtn = $('#mobileOrderChatBtn');
  const closeBtn = $('#closeOrderChatBtn');
  const backdrop = $('#orderChatBackdrop');
  const internalOpenBtn = $('#chatInternalNoteRailBtn');
  const internalCloseBtn = $('#closeInternalNoteBtn');
  if (!panel) return;
  const mobileQuery = window.matchMedia('(max-width: 900px)');
  const syncMode = () => {
    if (!mobileQuery.matches) {
      document.body.classList.remove('order-chat-open');
      panel.setAttribute('aria-hidden', 'false');
      if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
    } else if (!document.body.classList.contains('order-chat-open')) {
      panel.setAttribute('aria-hidden', 'true');
    }
  };
  const open = () => {
    markOrderChatRead(order.id);
    if (!mobileQuery.matches) {
      panel.scrollIntoView({ behavior:'smooth', block:'start' });
      return;
    }
    document.body.classList.add('order-chat-open');
    renderMobileBottomNav();
    panel.setAttribute('aria-hidden', 'false');
    if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
    setTimeout(() => {
      const box = $('#chatBox') || $('#internalNoteBox');
      if (box) box.scrollTop = box.scrollHeight;
      bindChatImagePreviews(panel);
    }, 180);
  };
  if (openBtn) openBtn.onclick = open;
  if (closeBtn) closeBtn.onclick = closeMobileOrderChat;
  if (backdrop) backdrop.onclick = closeMobileOrderChat;
  if (internalOpenBtn) internalOpenBtn.onclick = () => setOrderInternalNotePanel(true);
  if (internalCloseBtn) internalCloseBtn.onclick = () => setOrderInternalNotePanel(false);
  if (state.orderChatEscapeHandler) document.removeEventListener('keydown', state.orderChatEscapeHandler);
  state.orderChatEscapeHandler = event => {
    if (event.key !== 'Escape') return;
    if (document.querySelector('.chat-image-viewer')) return;
    if ($('#orderInternalNotePanel')?.classList.contains('is-open')) setOrderInternalNotePanel(false);
    else if (document.body.classList.contains('order-chat-open')) closeMobileOrderChat();
  };
  document.addEventListener('keydown', state.orderChatEscapeHandler);
  if (state.orderChatMediaQuery && state.orderChatMediaHandler) state.orderChatMediaQuery.removeEventListener?.('change', state.orderChatMediaHandler);
  state.orderChatMediaQuery = mobileQuery;
  state.orderChatMediaHandler = syncMode;
  mobileQuery.addEventListener?.('change', syncMode);
  bindChatImagePreviews(panel);
  syncMode();
  if (!mobileQuery.matches) markOrderChatRead(order.id);
}




async function refreshOrdersFromButton(btn) {
  if (state.ordersRefreshBusy) return;
  state.ordersRefreshBusy = true;
  const old = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Refreshing...'; }
  try {
    await renderOrders({ manual: true });
  } catch (err) {
    if (isUiRequestCancelled(err)) return;
    if (err.hostingChallenge) {
      notify('Hosting verification interrupted the Orders request. The current screen was kept open; try again shortly.', 'warn');
      return;
    }
    notify(err.message || 'Could not refresh orders.', 'danger');
  } finally {
    state.ordersRefreshBusy = false;
    const liveBtn = $('#refreshBtn');
    if (liveBtn) { liveBtn.disabled = false; liveBtn.textContent = old || 'Refresh'; }
  }
}


async function verifyOrderAdditionalKyc(order, button=null) {
  if (!order || !order.id) return;
  const original = button ? button.textContent : '';
  if (button) { button.disabled = true; button.textContent = 'Verifying...'; }
  try {
    const updated = await api(`/api/orders/${order.id}/binance-additional-kyc-verify`, {
      method:'POST',
      body: JSON.stringify({ binanceOrderNumber: order.externalOrderNo || order.orderNo })
    });
    notify('Additional Verification completed.', 'ok');
    applyUpdatedCurrentOrder(updated, order.id);
  } catch (err) {
    notify(err.message || 'Additional Verification failed.', 'danger');
    if (button) { button.disabled = false; button.textContent = original || 'Verified'; }
  }
}

async function loadOrderDetail(id, showLoading=true, fromRoute=false, navigationScope=null) {
  const numericId = Number(id || 0);
  if (!numericId) return null;
  if (fromRoute && (state.page !== 'orders' || Number(state.currentOrderId || 0) !== numericId)) return null;
  if (navigationScope && !navigationScopeCurrent(navigationScope)) return null;
  const renderGuard = beginPageRenderGuard('order-detail');
  const previousOrderId = Number(state.currentOrderId || 0);
  const previousChatBox = $('#chatBox');
  const preserveExistingChatScroll = previousOrderId === Number(id) && previousChatBox && !chatBoxNearBottom(previousChatBox);
  state.currentOrderChatPreserveScrollTop = preserveExistingChatScroll ? Number(previousChatBox.scrollTop || 0) : null;
  state.currentOrderId = numericId;
  const restoreMobileChat = document.body.classList.contains('order-chat-open');
  const restoreInternalNotes = $('#orderInternalNotePanel')?.classList.contains('is-open') || false;
  document.body.classList.remove('order-chat-open');
  if (!fromRoute) {
    const orderPath = routePath('orders', { orderId:numericId });
    if (location.pathname !== orderPath || location.hash) history.replaceState({ p2pflow:true, route:{ page:'orders', orderId:numericId, ledgerAccountId:null } }, '', orderPath);
  }
  const content = $('#content');
  if (showLoading && content && !content.children.length) content.innerHTML = stableLoadingShell('Order');
  let o;
  try {
    o = await api('/api/orders/' + numericId, { signal:renderGuard.signal, navigationScoped:false, noAutoReload:true });
  } catch (error) {
    if (isUiRequestCancelled(error)) return null;
    throw error;
  }
  if (!pageRenderGuardCurrent(renderGuard) || state.page !== 'orders' || Number(state.currentOrderId || 0) !== numericId || (navigationScope && !navigationScopeCurrent(navigationScope))) return null;
  state.currentOrder = o;
  initializeCurrentOrderChatState(o.chats || []);
  const direction = o.type === 'BUY' ? 'send' : 'receive';
  const finalAction = o.orderSource === 'offline' ? 'complete' : (o.type === 'BUY' ? 'paid_mark' : 'release');
  const assetSummary = orderAssetSummaryView(o);
  const displayedAssetQuantity = o.type === 'BUY' ? assetSummary.receiveQuantity : assetSummary.releaseQuantity;
  const viewerSummary = orderViewerSummary(o);
  const viewerFiatAmount = viewerSummary.assignedAmount;
  const viewerDisplayedAssetQuantity = viewerAssetQuantity(o, displayedAssetQuantity);
  const flowText = o.type === 'BUY'
    ? `Pay ${money(viewerFiatAmount)} and receive ${assetFmt(viewerDisplayedAssetQuantity, o.asset)} after fee`
    : `Release ${assetFmt(viewerDisplayedAssetQuantity, o.asset)} and receive ${money(viewerFiatAmount)}`;
  const mobileOrderTitle = isCancelledOrder(o) ? 'Order Cancelled' : isFulfilledOrder(o) ? 'Order Completed' : (o.type === 'BUY' ? (isBuyerPaid(o) ? 'Waiting for Release' : 'Open for Payment') : 'Verify with Counterparty');
  const mobileCounterpartyNickname = orderCounterpartyNickname(o) || 'Counterparty';
  const mobileCounterpartyRealName = orderCounterpartyRealName(o) || mobileCounterpartyNickname;
  const mobileAmountLabel = o.type === 'BUY' ? 'Send Amount' : 'Receive Amount';
  const mobileRemainingLabel = o.type === 'BUY' ? 'Remaining Pay' : 'Remaining Receive';
  const mobileTopActions = finalActionButtons(o, finalAction, 'mobileTop');
  const chatTopActions = finalActionButtons(o, finalAction, 'chatTop');
  setTitle(binanceDisplayStatus(o), mobileCounterpartyNickname);
  if (!pageRenderGuardCurrent(renderGuard) || state.page !== 'orders' || Number(state.currentOrderId || 0) !== numericId || (navigationScope && !navigationScopeCurrent(navigationScope))) return null;
  $('#content').innerHTML = `
    <div class="order-page">
      <div class="order-floating-actions" id="orderFloatingActions">
        <button class="order-floating-trigger" id="orderFloatingMenuBtn" type="button" aria-controls="orderFloatingMenu" aria-expanded="false" aria-label="Open order actions" title="Order actions">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
        </button>
        <div class="order-floating-menu" id="orderFloatingMenu" role="menu" aria-hidden="true">
          <button class="ghost" id="floatingBackOrders" type="button" role="menuitem"><span aria-hidden="true">←</span> Back</button>
          <button class="secondary" id="floatingCoUserBtn" type="button" role="menuitem"><span aria-hidden="true">＋</span> Request Co-User</button>
          ${isAssignmentScopedClient() ? '<button class="warn" id="floatingLeaveBtn" type="button" role="menuitem"><span aria-hidden="true">↗</span> Leave Order</button>' : ''}
          ${hasPerm('orders.assign') ? '<button class="secondary" id="floatingAssignBtn" type="button" role="menuitem"><span aria-hidden="true">＋</span> Assign / Add User</button>' : ''}
        </div>
      </div>
      <header class="order-mobile-unified-head">
        <div class="order-mobile-unified-main">
          <button class="order-main-menu-btn" id="orderMainMenuBtn" type="button" aria-controls="sidebar" aria-label="Open main menu" title="Main menu"><span class="hamburger-bars" aria-hidden="true"></span></button>
          <button class="order-mobile-back" id="mobileBackOrders" type="button" aria-label="Back to orders">←</button>
          <div class="order-mobile-avatar">${escapeHtml(String(mobileCounterpartyNickname || 'C').charAt(0).toUpperCase())}</div>
          <div class="order-mobile-unified-identity">
            <b>${escapeHtml(mobileCounterpartyNickname)}</b>
            <span id="orderMobileStatusLine">${escapeHtml(binanceDisplayStatus(o))}${isFulfilledOrder(o) ? '' : ` · ${orderCountdownHtml(o, 'strong')}`}</span>
          </div>
          <button class="order-mobile-chat-btn" id="mobileOrderChatBtn" type="button" aria-controls="orderChatPanel" aria-expanded="false" aria-label="Open chat" title="Chat">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H8l-4 4V4zm4 5h8M8 12h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          ${isRealBinanceOrder(o) ? '<button class="order-mobile-p2p-btn" id="mobileP2pInfoBtn" type="button" aria-label="Open P2P information" title="P2P Info"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 10v6M12 7h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' : ''}
        </div>
        <div class="order-desktop-meta" aria-label="Order summary">
          <span><small>Order</small><b>${escapeHtml(o.orderNo || o.externalOrderNo || '-')}</b></span>
          <span><small>Trade</small><b>${escapeHtml(o.type || '-')} · ${escapeHtml(o.orderSource === 'offline' ? 'Offline' : 'Binance P2P')}</b></span>
          <span><small>Method</small><b>${escapeHtml(displayPaymentMethodName(o) || '-')}</b></span>
          <span><small>Rate</small><b>${o.orderSource === 'offline' ? '-' : money(o.rate)}</b></span>
          <span><small>${o.type === 'BUY' ? 'Net Receive' : 'Release'}</small><b>${assetFmt(displayedAssetQuantity, o.asset)}</b></span>
          <span><small>Total Quantity</small><b>${assetFmt(assetSummary.totalQuantity, o.asset)}</b></span>
          <span><small>Fee</small><b>${assetFeeDisplay(o, assetSummary)}</b></span>
          <span><small>Created</small><b>${fmt(o.createdAt)}</b></span>
        </div>
        <div class="order-mobile-amount-strip">
          <div><span>${escapeHtml(mobileAmountLabel)}</span><b id="orderMobileAmountValue">${money(viewerFiatAmount)}</b>${viewerSummary.isScoped ? `<small>${escapeHtml(viewerSummary.assignmentRole === 'co_agent' ? 'Co-agent allocation' : 'Lead allocation')}</small>` : ''}</div>
          <div><span>${escapeHtml(mobileRemainingLabel)}</span><b id="orderMobileRemainingValue">${money(viewerSummary.viewerRemaining)}</b><small id="orderMobileActualValue">${o.type === 'BUY' ? 'Paid so far' : 'Received so far'}: ${money(viewerSummary.viewerActual)}</small></div>
        </div>
        <div class="order-mobile-top-actions" id="orderMobileTopActions">${mobileTopActions}</div>
      </header>
      <section class="order-hero-panel">
        <div class="order-hero-main">
          <div class="order-eyebrow">
            ${badge(o.orderSource === 'offline' ? 'OFFLINE ORDER' : 'BINANCE P2P', o.orderSource === 'offline' ? 'warn' : 'blue')}
            ${badge(o.type, o.type === 'BUY' ? 'ok' : 'danger')}
            <span class="method-badge">${escapeHtml(displayPaymentMethodName(o) || 'No method')}</span>
            <span id="orderHeroStatusBadge">${badge(binanceDisplayStatus(o), isCancelledOrder(o) ? 'danger' : binanceDisplayStatus(o) === 'PAID' ? 'warn' : binanceDisplayStatus(o) === 'COMPLETED' ? 'ok' : 'blue')}</span>
          </div>
          <h2 class="order-hero-desktop-number">${escapeHtml(o.orderNo)}</h2>
          <h2 class="order-hero-mobile-name">${escapeHtml(mobileCounterpartyRealName)}</h2>
          <p id="orderHeroFlowText">${escapeHtml(flowText)}</p>
          ${orderQuantityBreakdownHtml(o, assetSummary)}
          <div class="order-hero-pills">
            <span>Order No. <b>${escapeHtml(o.orderNo || o.externalOrderNo || '-')}</b></span>
            <span>Rate <b>${o.orderSource === 'offline' ? '-' : money(o.rate)}</b></span>
            <span>Deadline ${orderCountdownHtml(o, 'b')}</span>
            <span>Created <b>${fmt(o.createdAt)}</b></span>
            ${o.type === 'BUY' ? '' : `<span>Will Release <b>${assetFmt(displayedAssetQuantity, o.asset)}</b></span>`}
          </div>
        </div>
        <div class="order-hero-amount-card">
          <span>Payment Summary</span>
          <b id="orderHeroPaymentAmount">${money(viewerFiatAmount)}</b>
          <small id="orderHeroPaymentMeta">${o.type === 'BUY' ? `Net ${assetFmt(assetSummary.receiveQuantity, o.asset)} · Total ${assetFmt(assetSummary.totalQuantity, o.asset)} · Fee ${assetFeeDisplay(o, assetSummary)}` : `Release ${assetFmt(assetSummary.releaseQuantity, o.asset)} · Total ${assetFmt(assetSummary.totalQuantity, o.asset)} · Fee ${assetFeeDisplay(o, assetSummary)}`} · ${escapeHtml(o.fiatUnit || 'BDT')}</small>
          <div class="order-hero-summary-grid">
            <div><span>${o.type === 'BUY' ? 'Paid So Far' : 'Received So Far'}</span><b id="orderHeroActualAmount">${money(viewerSummary.viewerActual)}</b></div>
            <div><span>Remaining</span><b id="orderHeroRemainingAmount">${money(viewerSummary.viewerRemaining)}</b></div>
          </div>
        </div>
      </section>

      <div class="order-workspace order-desktop-body mt">
        <div class="order-main-stack order-detail-stack">
          <div id="orderAdditionalVerificationSlot">${additionalVerificationNoticeHtml(o)}</div>
          <div id="selectedPaymentAccountSlot">${selectedPaymentAccountHtml(o)}</div>
          <div class="order-payment-immediate" id="orderCustomerPaymentDetailsSlot">${customerPaymentDetailsCard(o)}</div>

          <div class="card order-card splits-card" id="orderSplitsCard">
            <div class="section-head"><h3>Payment Splits</h3><span>${o.paymentSplits.length} ${o.paymentSplits.length === 1 ? 'entry' : 'entries'}</span></div>
            ${o.paymentSplits.length ? `<div class="split-list">${o.paymentSplits.map(renderSplit).join('')}</div>` : '<div class="empty-state">No split yet. Add payment split, select wallet/account, then update actual amount and proof.</div>'}
          </div>

          <div class="card order-card assigned-card" id="orderAssignedCard">
            <div class="section-head"><h3>Assigned Users</h3><span>Lead + co-users progress</span></div>
            ${table(['User','Role','Assigned','Actual','Direction','Status','Action'], o.assignments.map(a => [
              a.agent?.name || ('#'+a.agentId),
              a.role,
              money(a.assignedAmount),
              money(a.actualAmount || 0),
              a.direction,
              badge(a.status, statusClass(a.status)),
              agentTaskAction(a, o)
            ]))}
            <div class="sub mt-sm">Each assigned user can complete their own part. If a co-user pays less, the short amount stays with the lead user automatically.</div>
          </div>

          <div id="orderApprovalsSlot">${renderOrderApprovals(o)}</div>
        </div>

        <aside class="order-side-stack">
          <div class="order-chat-panel" id="orderChatPanel" aria-hidden="false">
            <header class="order-chat-sheet-head">
              <button class="order-chat-header-icon" id="closeOrderChatBtn" type="button" aria-label="Back to order">←</button>
              <div class="order-chat-header-identity">
                <span class="order-chat-header-avatar">${escapeHtml(String(mobileCounterpartyNickname || 'C').charAt(0).toUpperCase())}</span>
                <div><b>${escapeHtml(mobileCounterpartyNickname)}</b><span id="chatHeaderSyncStatus" class="sync-status live">Live</span></div>
              </div>
              ${isRealBinanceOrder(o) ? '<button class="order-chat-header-icon" id="chatP2pInfoBtn" type="button" aria-label="Open P2P information">ⓘ</button>' : '<span class="order-chat-header-spacer"></span>'}
            </header>
            <div class="order-chat-primary-actionbar" id="orderChatTopActions">${chatTopActions}</div>

            <div class="order-chat-panel-content">
              ${hasPerm('accounts.view') && hasPerm('orders.split') ? '<button class="order-chat-rail-btn left" id="chatPaymentSplitRailBtn" type="button" aria-label="Open payment split">≡</button>' : ''}
              ${isRealBinanceOrder(o) ? '<button class="order-chat-rail-btn right" id="chatInternalNoteRailBtn" type="button" aria-controls="orderInternalNotePanel" aria-expanded="false" aria-label="Open internal notes">›</button>' : ''}

              ${isRealBinanceOrder(o) && hasPerm('binance.chat') ? `<div class="card order-card chat-card order-live-chat-card">
                <div class="section-head chat-head chat-desktop-head"><h3>Binance C2C Chat</h3><div class="chat-head-actions"><span id="chatSyncStatus" class="sync-status live">Live</span><button class="secondary mini-action" id="p2pInfoBtn" type="button">P2P Info</button></div></div>
                <div class="chat" id="chatBox">${renderChatList(o.chats, 'binance')}</div>
                <button type="button" id="chatNewMessagesBtn" class="chat-new-messages" hidden>New messages ↓</button>
              </div>` : `<div class="card order-card chat-card order-live-chat-card">
                <div class="section-head chat-head chat-desktop-head"><h3>Internal Notes</h3><span>Private</span></div>
                <div class="chat" id="internalNoteBox">${renderChatList(o.chats, 'internal')}</div>
              </div>`}
            </div>

            <footer class="order-chat-fixed-footer">
              ${isRealBinanceOrder(o) && hasPerm('binance.chat') ? `<div class="chat-quick-panel" id="chatQuickPanel" aria-hidden="true">
                <div class="chat-quick-panel-head"><div><b id="chatQuickPanelTitle">Quick Message</b><span>${hasPerm('accounts.view') && hasPerm('accounts.use') ? 'Saved replies and payment numbers' : 'Saved replies'}</span></div><button id="closeChatQuickPanel" type="button" aria-label="Close quick messages">×</button></div>
                <div class="chat-quick-panel-body" id="chatQuickPanelBody"></div>
              </div>
              <div class="chat-attachment-tray" id="chatAttachmentTray" aria-hidden="true">
                <button class="chat-album-picker" id="chatCameraPicker" type="button">
                  <span class="chat-album-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 6.5 9.4 4h5.2L16 6.5h3A2 2 0 0 1 21 8.5v9A2 2 0 0 1 19 19H5a2 2 0 0 1-2-2v-8.5a2 2 0 0 1 2-2h3Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg></span>
                  <span><b>Camera</b><small>Take a photo now</small></span>
                </button>
                <button class="chat-album-picker" id="chatAlbumPicker" type="button">
                  <span class="chat-album-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="9" r="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="m5 17 4-4 3 3 2-2 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                  <span><b>Album</b><small>Photo or video · single or multiple</small></span>
                </button>
              </div>
              <div class="chat-media-preview" id="chatMediaPreview" aria-live="polite"></div>
              <form id="chatForm" class="chat-compose-pro">
                <button class="chat-compose-plus" id="chatAttachmentMenuBtn" type="button" aria-controls="chatAttachmentTray" aria-expanded="false" aria-label="Add photo or video">＋</button>
                <input id="chatCameraInput" type="file" name="camera" accept="image/*" capture="environment" hidden />
                <input id="chatMediaInput" type="file" name="media" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime" multiple hidden />
                <textarea name="message" rows="2" placeholder="Write a message"></textarea>
                <button class="chat-send-icon chat-compose-action" id="chatComposeActionBtn" type="button" aria-label="Quick messages" title="Quick messages">
                  <span class="chat-action-quick-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4V5zm4 4h6M9 12h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 3v4M15 5h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
                  <span class="chat-action-send-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m4 4 16 8-16 8 3-8-3-8zm3 8h13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                </button>
              </form>` : `<form id="internalNoteForm" class="chat-compose-pro internal-compose">
                <span class="chat-compose-plus disabled" aria-hidden="true">＋</span>
                <textarea name="message" rows="2" placeholder="Write internal note"></textarea>
                <button class="chat-send-icon" type="submit" aria-label="Save internal note">➤</button>
              </form>`}
            </footer>

            ${isRealBinanceOrder(o) ? `<aside class="order-internal-note-panel" id="orderInternalNotePanel" aria-hidden="true">
              <header><button class="order-chat-header-icon" id="closeInternalNoteBtn" type="button" aria-label="Close internal notes">←</button><div><b>Internal Notes</b><span>Private notes are not sent to Binance</span></div></header>
              <div class="order-internal-note-scroll"><div class="chat" id="internalNoteBox">${renderChatList(o.chats, 'internal')}</div></div>
              <form id="internalNoteForm" class="chat-compose-pro internal-compose">
                <span class="chat-compose-plus disabled" aria-hidden="true">＋</span>
                <textarea name="message" rows="2" placeholder="Write internal note"></textarea>
                <button class="chat-send-icon" type="submit" aria-label="Save internal note">➤</button>
              </form>
            </aside>` : ''}
          </div>

          <div class="card order-card statement-feed-card">
            <div class="section-head"><h3>Recent Statement Entries</h3><span>Wallet movement</span></div>
            <div id="orderStatementFeed">${statementFeed(o.ledgers)}</div>
          </div>
        </aside>
      </div>
      <button class="order-chat-backdrop" id="orderChatBackdrop" type="button" aria-label="Close messages"></button>
    </div>`;
  const setFloatingActionMenu = open => {
    const root = $('#orderFloatingActions');
    const trigger = $('#orderFloatingMenuBtn');
    const menu = $('#orderFloatingMenu');
    if (!root || !trigger || !menu) return;
    root.classList.toggle('is-open', !!open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  };
  if ($('#orderFloatingMenuBtn')) $('#orderFloatingMenuBtn').onclick = event => {
    event.stopPropagation();
    setFloatingActionMenu(!$('#orderFloatingActions')?.classList.contains('is-open'));
  };
  if ($('#orderFloatingActions')) $('#orderFloatingActions').onclick = event => event.stopPropagation();
  const closeFloatingMenu = () => setFloatingActionMenu(false);
  if (state.orderFloatingOutsideHandler) document.removeEventListener('click', state.orderFloatingOutsideHandler);
  if (state.orderFloatingEscapeHandler) document.removeEventListener('keydown', state.orderFloatingEscapeHandler);
  state.orderFloatingOutsideHandler = event => {
    const root = $('#orderFloatingActions');
    if (root && !root.contains(event.target)) closeFloatingMenu();
  };
  state.orderFloatingEscapeHandler = event => {
    if (event.key === 'Escape') closeFloatingMenu();
  };
  document.addEventListener('click', state.orderFloatingOutsideHandler);
  document.addEventListener('keydown', state.orderFloatingEscapeHandler);
  if ($('#floatingBackOrders')) $('#floatingBackOrders').onclick = () => { closeFloatingMenu(); closeMobileOrderChat(); setRoute('orders'); };
  if ($('#mobileBackOrders')) $('#mobileBackOrders').onclick = () => { closeMobileOrderChat(); setRoute('orders'); };
  if ($('#orderMainMenuBtn')) $('#orderMainMenuBtn').onclick = () => setMobileNavigation(true, { restoreFocus: true });
  bindOrderDetailChatPanel(o);
  const openChatFromOrderList = Number(state.pendingOpenChatOrderId || 0) === Number(o.id);
  if (openChatFromOrderList) {
    state.pendingOpenChatOrderId = null;
    setTimeout(() => {
      $('#mobileOrderChatBtn')?.click();
      markOrderChatRead(o.id);
      setTimeout(() => $('#chatForm textarea[name="message"]')?.focus({ preventScroll:true }), 180);
    }, 60);
  }
  if (restoreMobileChat && window.matchMedia('(max-width: 900px)').matches) {
    document.body.classList.add('order-chat-open');
    $('#orderChatPanel')?.setAttribute('aria-hidden', 'false');
    $('#mobileOrderChatBtn')?.setAttribute('aria-expanded', 'true');
    if (restoreInternalNotes) setOrderInternalNotePanel(true);
  }
  ['addSplitBtn','chatPaymentSplitRailBtn'].forEach(id => {
    const button = $('#' + id);
    if (button) button.onclick = () => openAddSplitModal(o);
  });
  if ($('#floatingCoUserBtn')) $('#floatingCoUserBtn').onclick = () => { closeFloatingMenu(); openCoUserModal(o); };
  if ($('#floatingLeaveBtn')) $('#floatingLeaveBtn').onclick = () => { closeFloatingMenu(); openLeaveModal(o); };
  if ($('#floatingAssignBtn')) $('#floatingAssignBtn').onclick = () => { closeFloatingMenu(); openAssignModal(o); };
  if ($('#syncBinanceChatBtn')) $('#syncBinanceChatBtn').onclick = () => syncCurrentBinanceChat(o);
  if ($('#syncP2pStatsBtn')) $('#syncP2pStatsBtn').onclick = () => syncCurrentBinanceStats(o);
  ['additionalKycVerifyBtn','mobileTopAdditionalKycVerifyBtn','chatTopAdditionalKycVerifyBtn'].forEach(id => {
    const button = $('#' + id);
    if (button) button.onclick = () => verifyOrderAdditionalKyc(o, button);
  });
  ['CoAgentDoneBtn','mobileTopCoAgentDoneBtn','chatTopCoAgentDoneBtn'].forEach(id => {
    const button = $('#' + id);
    if (button) button.onclick = () => openCoAgentDoneModal(o, currentUserOrderAssignment(o));
  });
  ['finalActionBtn','mobileTopFinalActionBtn','chatTopFinalActionBtn'].forEach(id => {
    const button = $('#' + id);
    if (button && !button.disabled) button.onclick = () => openOrderFinalActionFlow(o, finalAction);
  });
  ['quickReleaseBtn','mobileTopQuickReleaseBtn','chatTopQuickReleaseBtn'].forEach(id => {
    const button = $('#' + id);
    if (button) button.onclick = () => openOrderFinalActionFlow(o, 'quick_release');
  });
  bindCurrentOrderDynamicActionButtons(o);
  ['p2pInfoBtn','mobileP2pInfoBtn','chatP2pInfoBtn'].forEach(id => {
    const button = $('#' + id);
    if (button) button.onclick = () => openP2pInfoModal(o);
  });
  if ($('#syncBinanceChatInlineBtn')) $('#syncBinanceChatInlineBtn').onclick = () => autoSyncBinanceChat(o, false);
  const chatForm = $('#chatForm');
  if (chatForm) {
    const fileInput = $('#chatMediaInput');
    const cameraInput = $('#chatCameraInput');
    const attachmentBtn = $('#chatAttachmentMenuBtn');
    const attachmentTray = $('#chatAttachmentTray');
    const albumPicker = $('#chatAlbumPicker');
    const cameraPicker = $('#chatCameraPicker');
    const previewBox = $('#chatMediaPreview');
    const textarea = chatForm.querySelector('textarea[name="message"]');
    const actionBtn = $('#chatComposeActionBtn');
    const quickPanel = $('#chatQuickPanel');
    const quickPanelBody = $('#chatQuickPanelBody');
    const quickPanelTitle = $('#chatQuickPanelTitle');
    const closeQuickPanelBtn = $('#closeChatQuickPanel');
    let selectedMedia = [];
    let quickAccounts = [];
    let quickAccountsLoaded = false;
    let quickSelectedIds = new Set([...(Array.isArray(o.selectedPaymentAccountIds) ? o.selectedPaymentAccountIds : []), o.selectedPaymentAccountId || o.selectedPaymentAccount?.id].map(value => Number(value || 0)).filter(Boolean));

    const setAttachmentTray = open => {
      if (!attachmentTray || !attachmentBtn) return;
      attachmentTray.classList.toggle('is-open', !!open);
      attachmentTray.setAttribute('aria-hidden', open ? 'false' : 'true');
      attachmentBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    const setQuickPanel = (open, view='home') => {
      if (!quickPanel) return;
      quickPanel.classList.toggle('is-open', !!open);
      quickPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open && view === 'home') renderQuickHome();
    };
    const updateComposeAction = () => {
      if (!actionBtn) return;
      const sendMode = Boolean(String(textarea?.value || '').trim() || selectedMedia.length);
      actionBtn.classList.toggle('is-send-mode', sendMode);
      actionBtn.setAttribute('aria-label', sendMode ? 'Send message' : 'Quick messages');
      actionBtn.title = sendMode ? 'Send message' : 'Quick messages';
    };
    const renderSelectedMedia = () => {
      if (!previewBox) return;
      previewBox.innerHTML = selectedMedia.map((file, index) => {
        const isVideo = /^video\//i.test(file.type || '');
        const objectUrl = URL.createObjectURL(file);
        return `<div class="chat-media-chip"><div class="chat-media-thumb">${isVideo ? `<video src="${escapeAttr(objectUrl)}" muted playsinline preload="metadata"></video><span class="chat-media-kind">VIDEO</span>` : `<img src="${escapeAttr(objectUrl)}" alt="Selected media"/>`}</div><div><b>${escapeHtml(file.name)}</b><small>${Math.max(1, Math.round(file.size / 1024))} KB</small></div><button type="button" data-remove-chat-media="${index}" aria-label="Remove ${escapeAttr(file.name)}">×</button></div>`;
      }).join('');
      previewBox.classList.toggle('has-media', selectedMedia.length > 0);
      previewBox.querySelectorAll('[data-remove-chat-media]').forEach(button => button.onclick = () => {
        selectedMedia.splice(Number(button.dataset.removeChatMedia), 1);
        renderSelectedMedia();
      });
      updateComposeAction();
    };
    const renderQuickHome = () => {
      if (!quickPanelBody) return;
      if (quickPanelTitle) quickPanelTitle.textContent = 'Quick Message';
      const selectedAccounts = Array.isArray(o.selectedPaymentAccounts) && o.selectedPaymentAccounts.length ? o.selectedPaymentAccounts : (o.selectedPaymentAccount ? [o.selectedPaymentAccount] : []);
      const messages = orderQuickMessages(o);
      const canUsePaymentAccounts = hasPerm('accounts.view') && hasPerm('accounts.use');
      const selectedSummary = selectedAccounts.length > 1
        ? `Selected: ${selectedAccounts.length} numbers`
        : selectedAccounts.length === 1
          ? `Selected: ${escapeHtml(selectedAccounts[0].method?.name || '')} · ${escapeHtml(selectedAccounts[0].accountNumber || '')}`
          : 'Search saved payment accounts';
      quickPanelBody.innerHTML = `
        ${canUsePaymentAccounts ? `<button class="quick-payment-entry" id="openQuickPaymentNumbers" type="button">
          <span class="quick-payment-entry-icon" aria-hidden="true">#</span>
          <span><b>Payment Numbers</b><small>${selectedSummary}</small></span>
          <span aria-hidden="true">›</span>
        </button>` : ''}
        <div class="quick-message-section-title">Saved Messages</div>
        <div class="quick-saved-message-list">${messages.map((message, index) => `<button type="button" data-quick-message-index="${index}"><span>${escapeHtml(message)}</span><small>Insert into message box</small></button>`).join('')}</div>`;
      if (canUsePaymentAccounts) $('#openQuickPaymentNumbers')?.addEventListener('click', loadQuickAccounts);
      quickPanelBody.querySelectorAll('[data-quick-message-index]').forEach(button => button.onclick = () => {
        const message = messages[Number(button.dataset.quickMessageIndex)] || '';
        if (!message || !textarea) return;
        textarea.value = message;
        textarea.dispatchEvent(new Event('input', { bubbles:true }));
        setQuickPanel(false);
        textarea.focus({ preventScroll:true });
      });
    };
    const paymentAccountSerialSort = (a={}, b={}) => {
      const labelCmp = String(a.label || '').localeCompare(String(b.label || ''), undefined, { numeric:true, sensitivity:'base' });
      if (labelCmp) return labelCmp;
      const serialCmp = String(a.serialNumber || '').localeCompare(String(b.serialNumber || ''), undefined, { numeric:true, sensitivity:'base' });
      if (serialCmp) return serialCmp;
      return String(a.accountNumber || '').localeCompare(String(b.accountNumber || ''), undefined, { numeric:true, sensitivity:'base' });
    };
    const renderQuickAccounts = (query='') => {
      if (!quickPanelBody) return;
      if (quickPanelTitle) quickPanelTitle.textContent = 'Payment Numbers';
      const q = String(query || '').trim().toLowerCase();
      const eligible = quickAccounts
        .filter(account => String(account.status || '').toLowerCase() === 'active')
        .filter(account => accountMatchesOrderMethod(account, o));
      const visible = eligible
        .filter(account => !q || [account.accountNumber, account.accountName, account.label, account.serialNumber, account.method?.name, account.method?.code, account.ownerUser?.name, account.accountType].some(value => String(value || '').toLowerCase().includes(q)))
        .sort(paymentAccountSerialSort);
      const selectedEligible = eligible.filter(account => quickSelectedIds.has(Number(account.id))).sort(paymentAccountSerialSort);
      quickPanelBody.innerHTML = `
        <div class="quick-number-tools"><button class="quick-number-back" id="backQuickMessages" type="button" aria-label="Back">←</button><input id="quickNumberSearch" type="search" placeholder="Search number, label or serial" value="${escapeAttr(query)}" /></div>
        <div class="quick-number-hint">Select one or more numbers. Nothing is sent until you confirm.</div>
        <div class="quick-number-list">${visible.length ? visible.map(account => {
          const isPicked = quickSelectedIds.has(Number(account.id));
          const meta = [account.label ? `Label: ${account.label}` : '', account.serialNumber ? `Serial: ${account.serialNumber}` : ''].filter(Boolean).join(' · ');
          return `<button class="quick-number-row${isPicked ? ' is-selected is-picked' : ''}" type="button" data-quick-payment-account="${Number(account.id) || 0}" aria-pressed="${isPicked ? 'true' : 'false'}">
            <span class="quick-number-check" aria-hidden="true">${isPicked ? '✓' : ''}</span>
            <span class="quick-number-main"><strong>${escapeHtml(account.accountNumber || '-')}</strong><small>${escapeHtml(meta || account.method?.name || 'Payment account')}</small></span>
            <span class="quick-number-meta"><em>${escapeHtml(account.method?.name || '')}</em></span>
          </button>`;
        }).join('') : '<div class="empty-state small">No active payment number matches this order and search.</div>'}</div>
        <div class="quick-number-confirmbar"><span><b>${selectedEligible.length}</b> selected</span><div><button type="button" class="secondary" id="clearQuickPaymentNumbers" ${selectedEligible.length ? '' : 'disabled'}>Clear</button><button type="button" class="success" id="sendQuickPaymentNumbers" ${selectedEligible.length ? '' : 'disabled'}>Send Selected</button></div></div>`;
      $('#backQuickMessages')?.addEventListener('click', renderQuickHome);
      const search = $('#quickNumberSearch');
      if (search) {
        search.oninput = () => renderQuickAccounts(search.value);
        setTimeout(() => search.focus({ preventScroll:true }), 30);
      }
      quickPanelBody.querySelectorAll('[data-quick-payment-account]').forEach(button => button.onclick = () => {
        const paymentAccountId = Number(button.dataset.quickPaymentAccount || 0);
        if (!paymentAccountId) return;
        if (quickSelectedIds.has(paymentAccountId)) quickSelectedIds.delete(paymentAccountId);
        else quickSelectedIds.add(paymentAccountId);
        renderQuickAccounts(query);
      });
      $('#clearQuickPaymentNumbers')?.addEventListener('click', () => {
        quickSelectedIds.clear();
        renderQuickAccounts(query);
      });
      $('#sendQuickPaymentNumbers')?.addEventListener('click', async () => {
        const selected = eligible.filter(account => quickSelectedIds.has(Number(account.id))).sort(paymentAccountSerialSort);
        if (!selected.length) return;
        const numberList = selected.map(account => account.accountNumber || '').filter(Boolean);
        const confirmed = window.confirm(`Send ${selected.length} payment number${selected.length === 1 ? '' : 's'} to this Binance order?\n\n${numberList.join('\n')}`);
        if (!confirmed) return;
        const sendButton = $('#sendQuickPaymentNumbers');
        if (sendButton) { sendButton.disabled = true; sendButton.textContent = 'Sending…'; }
        try {
          const sent = await api(`/api/orders/${o.id}/binance-chat-send`, {
            method:'POST',
            body: JSON.stringify({ paymentAccountIds: selected.map(account => Number(account.id)), sendPaymentAccount:true, binanceOrderNumber: o.externalOrderNo || o.orderNo })
          });
          if (sent.order) {
            state.currentOrder = sent.order;
            Object.assign(o, sent.order);
            quickSelectedIds = new Set((sent.order.selectedPaymentAccountIds || []).map(Number));
            updateSelectedPaymentAccountSlot(sent.order);
          }
          mergeCurrentOrderChatItems(sent.order?.chats || [], { outgoing:true, forceScroll:true });
          notify(`${selected.length} payment number${selected.length === 1 ? '' : 's'} sent and selected.`, 'ok');
          setQuickPanel(false);
        } catch (err) {
          notify(err.message || 'Payment numbers could not be sent.', 'danger');
          renderQuickAccounts(query);
        }
      });
    };
    const loadQuickAccounts = async () => {
      if (!quickPanelBody) return;
      if (quickAccountsLoaded) return renderQuickAccounts('');
      if (quickPanelTitle) quickPanelTitle.textContent = 'Payment Numbers';
      quickPanelBody.innerHTML = '<div class="quick-panel-loading">Loading payment numbers…</div>';
      try {
        const data = await api('/api/payment-accounts');
        quickAccounts = Array.isArray(data.items) ? data.items : [];
        quickAccountsLoaded = true;
        renderQuickAccounts('');
      } catch (err) {
        quickPanelBody.innerHTML = `<div class="notice danger-note">${escapeHtml(err.message || 'Payment numbers could not be loaded.')}</div><button class="secondary" id="backQuickMessages" type="button">Back</button>`;
        $('#backQuickMessages')?.addEventListener('click', renderQuickHome);
      }
    };

    if (closeQuickPanelBtn) closeQuickPanelBtn.onclick = () => setQuickPanel(false);
    if (actionBtn) actionBtn.onclick = () => {
      if (actionBtn.classList.contains('is-send-mode')) {
        setQuickPanel(false);
        chatForm.requestSubmit();
      } else {
        setAttachmentTray(false);
        setQuickPanel(!quickPanel?.classList.contains('is-open'), 'home');
      }
    };
    if (textarea) textarea.addEventListener('input', () => {
      updateComposeAction();
      if (String(textarea.value || '').trim()) setQuickPanel(false);
    });
    if (attachmentBtn) attachmentBtn.onclick = () => {
      setQuickPanel(false);
      setAttachmentTray(!attachmentTray?.classList.contains('is-open'));
    };
    const addSelectedMedia = (files, { replace=false }={}) => {
      const next = Array.from(files || []);
      const allowed = next.filter(file => /^(image\/(png|jpe?g|webp)|video\/(mp4|webm|quicktime))$/i.test(file.type || ''));
      if (allowed.length !== next.length) notify('Unsupported files were skipped. Use image, MP4, WebM or MOV.', 'warn');
      const combined = replace ? allowed : [...selectedMedia, ...allowed];
      selectedMedia = combined.slice(0, 8);
      if (combined.length > 8) notify('You can send up to 8 media files at a time.', 'warn');
      setAttachmentTray(false);
      renderSelectedMedia();
    };
    if (albumPicker && fileInput) albumPicker.onclick = () => fileInput.click();
    if (cameraPicker && cameraInput) cameraPicker.onclick = () => cameraInput.click();
    if (fileInput) fileInput.onchange = () => {
      addSelectedMedia(fileInput.files);
      fileInput.value = '';
    };
    if (cameraInput) cameraInput.onchange = () => {
      addSelectedMedia(cameraInput.files);
      cameraInput.value = '';
    };
    chatForm.onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(chatForm);
      const message = String(fd.get('message') || '').trim();
      if (!message && !selectedMedia.length) return setQuickPanel(true, 'home');
      const submitHtml = actionBtn ? actionBtn.innerHTML : '';
      if (actionBtn) { actionBtn.disabled = true; actionBtn.setAttribute('aria-busy', 'true'); actionBtn.innerHTML = '…'; }
      try {
        let latestOrder = null;
        if (message) {
          const sent = await api(`/api/orders/${o.id}/binance-chat-send`, { method:'POST', body: JSON.stringify({ message, binanceOrderNumber: o.externalOrderNo || o.orderNo }) });
          latestOrder = sent.order || latestOrder;
        }
        for (let mediaIndex = 0; mediaIndex < selectedMedia.length; mediaIndex += 1) {
          const mediaFile = selectedMedia[mediaIndex];
          if (actionBtn) actionBtn.innerHTML = `${mediaIndex + 1}/${selectedMedia.length}`;
          const mediaDataUrl = await readChatMediaFileAsDataUrl(mediaFile);
          const sent = await api(`/api/orders/${o.id}/binance-chat-send`, { method:'POST', body: JSON.stringify({ mediaDataUrl, mediaName: mediaFile.name, mediaMime: mediaFile.type, binanceOrderNumber: o.externalOrderNo || o.orderNo }) });
          latestOrder = sent.order || latestOrder;
        }
        if (latestOrder) state.currentOrder = latestOrder;
        chatForm.reset();
        selectedMedia = [];
        renderSelectedMedia();
        setAttachmentTray(false);
        setQuickPanel(false);
        mergeCurrentOrderChatItems(latestOrder?.chats || [], { outgoing:true, forceScroll:true });
        setChatSyncStatus('Live', 'live');
      } catch (err) {
        notify(err.message || 'Message send failed', 'danger');
      } finally {
        if (actionBtn) { actionBtn.disabled = false; actionBtn.removeAttribute('aria-busy'); actionBtn.innerHTML = submitHtml; }
        updateComposeAction();
      }
    };
    renderQuickHome();
    updateComposeAction();
  }
  if ($('#internalNoteForm')) $('#internalNoteForm').onsubmit = async e => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const message = String(fd.get('message') || '').trim();
    if (!message) return;
    const submitBtn = form.querySelector('button[type="submit"]');
    const submitHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '…'; }
    try {
      const updated = await api(`/api/orders/${o.id}/chat`, { method:'POST', body: JSON.stringify({ message }) });
      form.reset();
      updateInternalNoteBox(updated.chats || []);
    } catch (err) {
      notify(err.message || 'Internal note could not be saved.', 'danger');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = submitHtml || '➤'; }
    }
  };
  bindChatImagePreviews($('#orderChatPanel') || document);
  bindChatScrollState();
  updateChatNewMessagesButton();
  startOrderDetailAutoSync(o);
  startChatAutoSync(o);
  $$('[data-update-split]').forEach(b => b.onclick = () => openUpdateSplitModal(o, Number(b.dataset.updateSplit)));
  $$('[data-delete-split]').forEach(b => b.onclick = () => deletePaymentSplit(o, Number(b.dataset.deleteSplit)));
  $$('[data-complete-agent]').forEach(b => b.onclick = () => openCompleteUserModal(o, Number(b.dataset.completeAgent)));
  applyLanguage(document.querySelector('#content') || document);
  if (state.page === 'orders' && Number(state.currentOrderId || 0) === numericId && isAssignmentScopedClient()) await api(`/api/orders/${o.id}/heartbeat`, { method:'POST', body:'{}', silent:true }).catch(()=>{});
  return o;
}




























function stepRows(steps=[]) {
  return steps.map(s => [
    escapeHtml(s.name || '-'),
    badge(s.ok ? 'OK' : 'Failed', s.ok ? 'ok' : 'danger'),
    escapeHtml(s.host || s.url || s.dir || s.path || s.binary || ''),
    escapeHtml(s.statusCode ? String(s.statusCode) : s.ms !== undefined ? `${s.ms}ms` : ''),
    `<pre class="mini-pre">${escapeHtml(formatHealthDetail(s))}</pre>`
  ]);
}
function formatHealthDetail(step) {
  const clone = { ...step };
  delete clone.name; delete clone.ok; delete clone.at; delete clone.host; delete clone.url; delete clone.dir; delete clone.path; delete clone.binary; delete clone.ms; delete clone.statusCode;
  return JSON.stringify(clone, null, 2).slice(0, 1200);
}
function healthCard(title, ok, body) {
  return `<div class="card"><h3>${escapeHtml(title)} ${badge(ok ? 'OK' : 'Needs attention', ok ? 'ok' : 'danger')}</h3>${body}</div>`;
}











function binanceP2pAccountDisplayName(value = {}) {
  return value.displayName
    || value.p2pUsername
    || value.nickname
    || value.ownerP2pNickname
    || value.binanceAccount?.displayName
    || value.binanceAccount?.p2pUsername
    || value.binanceAccount?.name
    || value.credentialDisplayName
    || value.credentialName
    || value.accountName
    || value.name
    || (value.id || value.credentialId ? `API ${value.id || value.credentialId}` : 'Binance account');
}

function defaultUserRoleProfileId(preferredSystemRole = 'agent') {
  const roles = Array.isArray(state.bootstrap?.userRoles) ? state.bootstrap.userRoles : [];
  if (!roles.length) return null;
  const enabledRoles = roles.filter(role => role.enabled !== false);
  const pool = enabledRoles.length ? enabledRoles : roles;
  const preferred = pool.find(role => String(role.systemRole || '').toLowerCase() === String(preferredSystemRole || 'agent').toLowerCase());
  return Number(preferred?.id || pool[0]?.id || 0) || null;
}

function roleProfileSelect(selectedId=null, preferredSystemRole='agent') {
  const roles = Array.isArray(state.bootstrap?.userRoles) ? state.bootstrap.userRoles : [];
  const requestedId = Number(selectedId || 0);
  const resolvedId = roles.some(role => Number(role.id) === requestedId)
    ? requestedId
    : defaultUserRoleProfileId(preferredSystemRole);
  if (!roles.length) return '<select name="userRoleId" id="userRoleSelect" disabled><option value="">No role available</option></select>';
  return `<select name="userRoleId" id="userRoleSelect">${roles.map(r => `<option value="${r.id}" data-system-role="${escapeAttr(r.systemRole)}" ${Number(resolvedId)===Number(r.id)?'selected':''}>${escapeHtml(r.name)}</option>`).join('')}</select>`;
}
function rolePermissions(roleId) {
  const r = (state.bootstrap.userRoles || []).find(x => Number(x.id) === Number(roleId));
  return r ? (r.permissions || []) : [];
}
function roleSystemRole(roleId) {
  const r = (state.bootstrap.userRoles || []).find(x => Number(x.id) === Number(roleId));
  return r ? r.systemRole : 'agent';
}
function defaultPermissionsForSystemRole(role='agent') {
  const all = state.bootstrap?.permissions || Object.keys(PERMISSION_LABELS);
  const value = String(role || 'agent').toLowerCase();
  if (value === 'admin') return [...all];
  if (value === 'manager') return all.filter(permission => permission !== 'credentials.manage');
  if (value === 'auditor') return ['dashboard.view','accounts.view','reports.view','activity.view','audit.view','orders.view','p2p.profile.view','ads.view'].filter(permission => all.includes(permission));
  return ['orders.view','orders.split','orders.final_action','binance.chat','p2p.profile.view','ads.view','ads.manage','accounts.view','accounts.use'].filter(permission => all.includes(permission));
}

function openRoleModal(role=null) {
  const isEdit = !!role;
  const selectedPerms = role?.permissions || defaultPermissionsForSystemRole(role?.systemRole || 'agent');
  modal(isEdit ? 'Edit User Role' : 'Create User Role', `
    <form id="roleForm" class="form-grid">
      <div><label>Role Name</label><input name="name" value="${escapeAttr(role?.name || '')}" required ${role?.locked ? 'readonly' : ''}/></div>
      <div><label>Permission Template Family</label><select name="systemRole" id="roleSystemRoleSelect" ${role?.locked ? 'disabled' : ''}><option value="agent" ${role?.systemRole==='agent'?'selected':''}>Employee / Agent</option><option value="manager" ${role?.systemRole==='manager'?'selected':''}>Manager</option><option value="auditor" ${role?.systemRole==='auditor'?'selected':''}>Auditor</option></select><small>Only chooses initial permission defaults. This label never grants access by itself.</small></div>
      <div class="full-row"><label>Description</label><input name="description" value="${escapeAttr(role?.description || '')}" /></div>
      <div class="full-row"><label>Effective Role Permissions</label>${permissionChecks(selectedPerms)}<small>These checked permissions are authoritative. Role name/template family has no runtime authority.</small></div>
      <div class="full-row" id="roleFormMessage"></div>
      <div class="full-row"><button type="submit">${isEdit ? 'Save Role' : 'Create Role'}</button></div>
    </form>`);
  const systemRoleSelect = $('#roleSystemRoleSelect');
  if (!isEdit && systemRoleSelect) systemRoleSelect.onchange = () => {
    const defaults = defaultPermissionsForSystemRole(systemRoleSelect.value);
    $$('#roleForm input[name="permissions"]').forEach(check => { check.checked = defaults.includes(check.value); });
  };
  $('#roleForm').onsubmit = async e => {
    e.preventDefault();
    const obj = formObj(e.target);
    if (role?.locked) obj.systemRole = role.systemRole;
    obj.permissions = selectedPermissions(e.target);
    try {
      await api(isEdit ? '/api/user-roles/' + role.id : '/api/user-roles', { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(obj) });
      notify(isEdit ? 'Role updated.' : 'Role created.', 'ok');
      closeModal();
      await refreshBootstrap();
      await renderUserRoles();
    } catch (err) { setFormMessage('#roleFormMessage', err.message || 'Role save failed', 'danger'); }
  };
}

function binanceCredentialPermissionMatrix(selectedRows = []) {
  const options = Array.isArray(state.binanceCredentialOptions) ? state.binanceCredentialOptions : (Array.isArray(state.p2pCredentialOptions) ? state.p2pCredentialOptions : []);
  const groups = Array.isArray(state.binanceAccountPermissionGroups) && state.binanceAccountPermissionGroups.length
    ? state.binanceAccountPermissionGroups
    : [
        { id: 'orders', label: 'Orders', permissions: ['orders.view','orders.create','orders.assign','orders.split','orders.final_action','orders.quick_release'] },
        { id: 'sync_chat', label: 'Sync & Chat', permissions: ['binance.sync','binance.chat'] },
        { id: 'ads', label: 'Advertisements', permissions: ['ads.view','ads.manage'] },
        { id: 'profile', label: 'P2P Profile', permissions: ['p2p.profile.view','p2p.profile.sync'] }
      ];
  const selected = new Map((selectedRows || []).map(row => [Number(row.credentialId), new Set(row.permissions || [])]));
  if (!options.length) return '<div class="notice small">No Binance API account is available. Add an API credential first.</div>';
  return `<div class="binance-permission-matrix">${options.map(item => {
    const credentialId = Number(item.id);
    const allowed = new Set(Array.isArray(item.permissions) ? item.permissions : []);
    const chosen = selected.get(credentialId) || new Set();
    return `<section class="binance-permission-account" data-binance-permission-account="${credentialId}">
      <div class="binance-permission-account-head">
        <div><b>${escapeHtml(binanceP2pAccountDisplayName(item))}</b><small>${escapeHtml(item.accountName && item.accountName !== binanceP2pAccountDisplayName(item) ? item.accountName : (item.status || ''))}${item.disabled ? ' · disabled' : ''}</small></div>
        <div class="actions compact"><button type="button" class="ghost" data-binance-account-all="${credentialId}">All</button><button type="button" class="ghost" data-binance-account-clear="${credentialId}">Clear</button></div>
      </div>
      <div class="binance-permission-groups">${groups.map(group => {
        const permissions = (group.permissions || []).filter(permission => allowed.has(permission));
        if (!permissions.length) return '';
        return `<div class="binance-permission-group"><span>${escapeHtml(group.label || group.id || '')}</span>${permissions.map(permission => permissionOptionHtml(permission, chosen.has(permission), { compact:true, inputName:'binanceCredentialPermission', dataAttributes:`data-credential-id="${credentialId}"` })).join('')}</div>`;
      }).join('')}</div>
    </section>`;
  }).join('')}</div>`;
}

function roleDefaultBinanceCredentialPermissions(roleId) {
  const rolePerms = new Set(rolePermissions(roleId));
  const options = Array.isArray(state.binanceCredentialOptions) ? state.binanceCredentialOptions : (Array.isArray(state.p2pCredentialOptions) ? state.p2pCredentialOptions : []);
  return options.filter(item => !item.disabled).map(item => ({
    credentialId: Number(item.id),
    permissions: (Array.isArray(item.permissions) ? item.permissions : []).filter(permission => rolePerms.has(permission))
  })).filter(row => row.credentialId && row.permissions.length);
}

function selectedBinanceCredentialPermissions(form) {
  const rows = new Map();
  form.querySelectorAll('input[name="binanceCredentialPermission"]:checked').forEach(input => {
    const credentialId = Number(input.dataset.credentialId || 0);
    if (!credentialId) return;
    if (!rows.has(credentialId)) rows.set(credentialId, []);
    rows.get(credentialId).push(input.value);
  });
  return [...rows.entries()].map(([credentialId, permissions]) => ({ credentialId, permissions }));
}

function syncBinancePermissionMatrixWithGlobalPermissions(form) {
  if (!form) return;
  const globalPermissions = new Set([...form.querySelectorAll('input[name="permissions"]:checked')].map(input => input.value));
  form.querySelectorAll('input[name="binanceCredentialPermission"]').forEach(input => {
    const globallyAllowed = globalPermissions.has(input.value);
    input.disabled = !globallyAllowed;
    if (!globallyAllowed) input.checked = false;
  });
}

function bindBinancePermissionMatrix(form) {
  if (!form) return;
  form.querySelectorAll('[data-binance-account-all]').forEach(button => button.onclick = () => {
    const credentialId = Number(button.dataset.binanceAccountAll || 0);
    form.querySelectorAll(`input[name="binanceCredentialPermission"][data-credential-id="${credentialId}"]:not(:disabled)`).forEach(input => { input.checked = true; });
  });
  form.querySelectorAll('[data-binance-account-clear]').forEach(button => button.onclick = () => {
    const credentialId = Number(button.dataset.binanceAccountClear || 0);
    form.querySelectorAll(`input[name="binanceCredentialPermission"][data-credential-id="${credentialId}"]`).forEach(input => { input.checked = false; });
  });
  form.querySelectorAll('input[name="permissions"]').forEach(input => input.addEventListener('change', () => syncBinancePermissionMatrixWithGlobalPermissions(form)));
  syncBinancePermissionMatrixWithGlobalPermissions(form);
}

function openUserModal(userItem=null) {
  const isEdit = !!userItem;
  const u = userItem?.user || {};
  const preferredSystemRole = String(u.role || 'agent').toLowerCase();
  const requestedRoleProfileId = Number(u.roleProfileId || 0);
  const roleProfileId = (state.bootstrap?.userRoles || []).some(role => Number(role.id) === requestedRoleProfileId)
    ? requestedRoleProfileId
    : defaultUserRoleProfileId(preferredSystemRole);
  const selectedPerms = isEdit ? (u.permissions || []) : rolePermissions(roleProfileId);
  const selectedCredentialPerms = isEdit ? (u.binanceCredentialPermissions || []) : roleDefaultBinanceCredentialPermissions(roleProfileId);
  const initialSystemRole = isEdit ? preferredSystemRole : roleSystemRole(roleProfileId);
  modal(isEdit ? 'Edit User / Permissions' : 'Add User + Login', `
    <form id="userForm" class="form-grid">
      <div><label>User / Employee Name</label><input name="name" value="${escapeAttr(userItem?.name || '')}" required /></div>
      <div><label>Presence</label><div class="dynamic-presence-box">${badge(userItem?.status || 'offline', statusClass(userItem?.status || 'offline'))}<span>Automatic — users cannot manually set online/offline.</span></div></div>
      <div><label>User Role</label>${roleProfileSelect(roleProfileId, preferredSystemRole)}</div>
      <input type="hidden" name="loginRole" id="loginRoleInput" value="${escapeAttr(initialSystemRole || 'agent')}" />
      <div><label>Username</label><input name="username" value="${escapeAttr(u.username || '')}" ${isEdit && u.username ? '' : 'required'} /></div>
      <div><label>Email for OTP</label><input name="email" type="email" value="${escapeAttr(u.email || '')}" placeholder="user@example.com" /></div>
      <div><label>Mobile / SMS Number</label><input name="mobile" value="${escapeAttr(userItem?.mobile || '')}" placeholder="optional" /></div>
      <div><label>${isEdit ? 'New Password (optional)' : 'Password'}</label><input name="password" type="password" minlength="12" maxlength="200" autocomplete="new-password" placeholder="Minimum 12 characters" ${isEdit ? '' : 'required'} /></div>
      <div><label>${isEdit ? 'New 6 Digit Secret (optional)' : '6 Digit Secret Code'}</label><input name="secretCode" inputmode="numeric" maxlength="6" ${isEdit ? 'placeholder="optional"' : 'required'} /></div>
      <fieldset class="full-row security-recovery-panel">
        <legend>Login Security & Recovery ${u.securityFallbackConfigured ? badge('Configured', 'ok') : badge('Not configured', 'warn')}</legend>
        <p>Set the Security Question here for this login. It is used only when Login OTP delivery fails.</p>
        <div class="form-grid compact-grid">
          <div class="full-row"><label>Security Question</label><input name="securityQuestion" minlength="8" maxlength="240" value="${escapeAttr(u.securityQuestion || '')}" placeholder="Example: What was the name of your first school?" /></div>
          <div><label>${u.securityFallbackConfigured ? 'New Security Answer (optional)' : 'Security Answer'}</label><input name="securityAnswer" type="password" minlength="8" maxlength="200" autocomplete="new-password" placeholder="${u.securityFallbackConfigured ? 'Leave blank to keep current answer' : 'Required when a question is set'}" /></div>
          <div><label class="check danger-check"><input type="checkbox" name="clearSecurityFallback" /> Remove Security Question fallback</label></div>
        </div>
        <div class="notice small">The answer is stored only as a one-way password hash. Recovery requires the correct answer and the existing 6 digit secret.</div>
      </fieldset>
      <div><label>Max Active Orders</label><input name="maxActiveOrders" type="number" min="0" step="1" value="${Number.isFinite(Number(userItem?.maxActiveOrders)) ? Number(userItem.maxActiveOrders) : 5}" /></div>
      <div><label>Max Release Amount</label><input name="maxReleaseAmount" type="number" min="0" step="0.01" value="${Number.isFinite(Number(userItem?.maxReleaseAmount)) ? Number(userItem.maxReleaseAmount) : 0}" /></div>
      <div><label class="check"><input type="checkbox" name="allowNewOrders" ${userItem?.allowNewOrders === false ? '' : 'checked'} /> Work Status ON — accept new orders even while offline</label></div>
      <div><label class="check"><input type="checkbox" name="assignmentAccountingEnabled" ${u.assignmentAccountingEnabled === false ? '' : 'checked'} /> Use Payment Account calculation for auto assignment</label><small>OFF = Order-only assignment. Routing and permissions still apply, but payment-account existence, balance and capacity do not block automatic assignment.</small></div>
      <div><label class="check"><input type="checkbox" name="smsEnabled" ${userItem?.smsEnabled === false ? '' : 'checked'} /> Panel SMS on order assignment</label></div>
      <div class="full-row profit-accounting-setting"><label class="check"><input type="checkbox" name="includeProfitInCompanyTotals" ${userItem?.includeProfitInCompanyTotals === false ? '' : 'checked'} /> Include this user's profit in company income and capital totals</label><small>Turn this off to keep the user's income visible in their individual report while excluding it from company totals.</small></div>
      <div class="full-row"><label>Global Permissions</label>${permissionChecks(selectedPerms)}<small>A Binance account grant below never bypasses these global permissions.</small></div>
      <div class="full-row"><label>Binance Account Permissions</label>${binanceCredentialPermissionMatrix(selectedCredentialPerms)}<small>Grant permissions separately for each Binance account. The user can only see or manage orders, ads, chat and profile data for the selected account.</small></div>
      <div class="full-row" id="userFormMessage"></div>
      <div class="full-row"><button type="submit">${isEdit ? 'Save User' : 'Create User'}</button></div>
    </form>`);
  const userForm = $('#userForm');
  if (!userForm) {
    notify('Could not open the user form. Refresh the page and try again.', 'danger', 6500);
    return;
  }
  const roleSelect = userForm.querySelector('#userRoleSelect');
  if (roleSelect) roleSelect.onchange = () => {
    const perms = rolePermissions(roleSelect.value);
    const loginRoleInput = userForm.querySelector('#loginRoleInput');
    if (loginRoleInput) loginRoleInput.value = roleSystemRole(roleSelect.value);
    userForm.querySelectorAll('input[name="permissions"]').forEach(ch => { ch.checked = perms.includes(ch.value); });
    syncBinancePermissionMatrixWithGlobalPermissions(userForm);
    // Role selection applies its account-scoped permissions to every enabled
    // Binance account by default. The editor can immediately untick any account
    // or permission before saving the user; the role label itself grants nothing.
    userForm.querySelectorAll('input[name="binanceCredentialPermission"]').forEach(input => {
      input.checked = !input.disabled && perms.includes(input.value);
    });
  };
  bindBinancePermissionMatrix(userForm);
  userForm.onsubmit = async e => {
    e.preventDefault();
    const obj = formObj(e.target);
    if (obj.password && String(obj.password).length < 12) { setFormMessage('#userFormMessage', 'Password must be at least 12 characters.', 'danger'); return; }
    if (obj.secretCode && !/^\d{6}$/.test(obj.secretCode)) { setFormMessage('#userFormMessage', 'Secret code must be exactly 6 digits.', 'danger'); return; }
    obj.clearSecurityFallback = e.target.clearSecurityFallback.checked;
    if (!obj.clearSecurityFallback && !u.securityFallbackConfigured && (String(obj.securityQuestion || '').trim() || String(obj.securityAnswer || '').trim())) {
      if (String(obj.securityQuestion || '').trim().length < 8 || String(obj.securityAnswer || '').trim().length < 8) { setFormMessage('#userFormMessage', 'Security Question and Security Answer must both be at least 8 characters.', 'danger'); return; }
    }
    obj.allowNewOrders = e.target.allowNewOrders.checked;
    obj.assignmentAccountingEnabled = e.target.assignmentAccountingEnabled.checked;
    obj.smsEnabled = e.target.smsEnabled.checked;
    obj.includeProfitInCompanyTotals = e.target.includeProfitInCompanyTotals.checked;
    obj.permissions = selectedPermissions(e.target);
    obj.binanceCredentialPermissions = selectedBinanceCredentialPermissions(e.target);
    try {
      await api(isEdit ? '/api/agents/' + userItem.id : '/api/agents', { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(obj) });
      notify(isEdit ? 'User updated.' : 'User created.', 'ok');
      closeModal();
      await renderUsers();
    } catch (err) { setFormMessage('#userFormMessage', err.message || 'User save failed', 'danger'); }
  };
}

function openRouteModal(route=null) {
  const isEdit = !!route;
  modal(isEdit ? 'Edit Routing Rule' : 'Add Routing Rule', `
    <form id="routeForm" class="form-grid">
      <div><label>Payment Method</label>${methodSelect(route?.paymentMethodId)}</div>
      <div><label>User / Employee</label>${agentSelect(route?.agentId)}</div>
      <div><label>Priority</label><input name="priority" type="number" min="1" step="1" value="${Number.isFinite(Number(route?.priority)) ? Number(route.priority) : 1}" /></div>
      <div><label>Max Active Orders</label><input name="maxActiveOrders" type="number" min="0" step="1" value="${Number.isFinite(Number(route?.maxActiveOrders)) ? Number(route.maxActiveOrders) : 0}" /></div>
      <div><label>Min Order Amount</label><input name="minOrderAmount" type="number" min="0" step="0.01" value="${Number.isFinite(Number(route?.minOrderAmount)) ? Number(route.minOrderAmount) : 0}" /></div>
      <div><label>Max Order Amount</label><input name="maxOrderAmount" type="number" min="0" step="0.01" value="${Number.isFinite(Number(route?.maxOrderAmount)) ? Number(route.maxOrderAmount) : 0}" /></div>
      <div><label class="check"><input type="checkbox" name="capacityGuard" ${route?.capacityGuard ? 'checked' : ''}/> Capacity guard</label></div>
      <div><label class="check"><input type="checkbox" name="enabled" ${route?.enabled === false ? '' : 'checked'}/> Enabled</label></div>
      <div class="full-row"><label>Note</label><input name="note" value="${escapeAttr(route?.note || '')}" /></div>
      <div class="full-row" id="routeFormMessage"></div>
      <div class="full-row"><button type="submit">${isEdit ? 'Save Route' : 'Create Route'}</button></div>
    </form>`);
  $('#routeForm').onsubmit = async e => {
    e.preventDefault();
    const obj = formObj(e.target);
    obj.capacityGuard = e.target.capacityGuard.checked;
    obj.enabled = e.target.enabled.checked;
    try {
      await api(isEdit ? '/api/routing/' + route.id : '/api/routing', { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(obj) });
      notify('Routing rule saved.', 'ok');
      closeModal();
      await renderRouting();
    } catch (err) { setFormMessage('#routeFormMessage', err.message || 'Route save failed', 'danger'); }
  };
}

function assignablePaymentAgents() {
  return (state.bootstrap?.agents || []);
}

function paymentAccountAgentAccessHtml(selectedIds=[]) {
  const selected = new Set((selectedIds || []).map(Number));
  const agents = assignablePaymentAgents();
  if (!agents.length) return '<div class="notice">Create an Agent first.</div>';
  return `<div class="payment-account-agent-grid">${agents.map(agent => `<label class="check payment-account-agent-check"><input type="checkbox" name="allowedAgentIds" value="${Number(agent.id)}" ${selected.has(Number(agent.id)) ? 'checked' : ''}/><span><b>${escapeHtml(agent.name || agent.user?.name || 'Agent')}</b><small>${escapeHtml(agent.user?.username || `Agent ID ${agent.id}`)}</small></span></label>`).join('')}</div>`;
}

function selectedAllowedAgentIds(form) {
  return [...form.querySelectorAll('input[name="allowedAgentIds"]:checked')].map(input => Number(input.value)).filter(Boolean);
}

function paymentAccountTypeSelect(selected='personal') {
  const type = String(selected || 'personal').toLowerCase();
  return `<select name="accountType"><option value="personal" ${type === 'personal' ? 'selected' : ''}>Personal</option><option value="agent" ${type === 'agent' ? 'selected' : ''}>Agent</option><option value="merchant" ${['merchant','business'].includes(type) ? 'selected' : ''}>Merchant</option></select>`;
}

function paymentAccountOwnerUsers() {
  return Array.isArray(state.bootstrap?.accountUsers) ? state.bootstrap.accountUsers : [];
}

function paymentAccountScopeManageAll() {
  return Boolean(state.paymentAccountScope?.manageAll ?? state.bootstrap?.paymentAccountScope?.manageAll);
}

function paymentAccountOwnerSelect(selectedId=null) {
  const users = paymentAccountOwnerUsers();
  const effectiveId = Number(selectedId ?? state.user?.id ?? 0);
  return `<select name="ownerUserId" required><option value="">Select user</option>${users.map(user => `<option value="${Number(user.id)}" data-role="${escapeAttr(user.role || '')}" data-agent-id="${Number(user.agentId || 0)}" ${effectiveId === Number(user.id) ? 'selected' : ''}>${escapeHtml(user.name || user.username || `User ${user.id}`)} (${escapeHtml(user.username || user.role || '')})</option>`).join('')}</select>`;
}

function paymentAccountOwnerField(selectedId=null, editable=paymentAccountScopeManageAll()) {
  const effectiveId = Number(selectedId ?? state.user?.id ?? 0);
  if (editable) return paymentAccountOwnerSelect(effectiveId);
  const user = paymentAccountOwnerUsers().find(item => Number(item.id) === effectiveId) || (Number(state.user?.id) === effectiveId ? state.user : null);
  const label = user ? `${user.name || user.username || `User ${effectiveId}`} (${user.username || user.role || ''})` : `User ${effectiveId}`;
  return `<input type="hidden" name="ownerUserId" value="${effectiveId}"/><input value="${escapeAttr(label)}" disabled aria-label="Account User"/>`;
}

function paymentAccountAgentAccessField(selectedIds=[], editable=paymentAccountScopeManageAll()) {
  if (!editable) return '<div class="notice small">This account remains under the selected Account User. The Manage All Payment Accounts permission is required to change other linked-user access.</div>';
  return paymentAccountAgentAccessHtml(selectedIds);
}

function syncPaymentAccountRuleVisibility(form) {
  if (!form) return;
  const accountType = String(form.querySelector('[name="accountType"]')?.value || 'personal').toLowerCase();
  form.querySelectorAll('[data-payment-rule-group]').forEach(group => {
    const target = String(group.dataset.paymentRuleGroup || 'personal');
    group.classList.toggle('hidden', target === 'agent' ? accountType !== 'agent' : accountType === 'agent');
  });
}

function syncPaymentAccountOwnerForm(form) {
  if (!form) return;
  const typeSelect = form.querySelector('[name="accountType"]');
  const ownerSelect = form.querySelector('[name="ownerUserId"]');
  // Account type controls transaction behavior. It is intentionally independent of the login user's role.
  if (typeSelect?.value === 'agent' && ownerSelect?.tagName === 'SELECT') {
    const ownerAgentId = Number(ownerSelect.selectedOptions[0]?.dataset.agentId || 0);
    if (ownerAgentId) {
      const accessCheck = form.querySelector(`input[name="allowedAgentIds"][value="${ownerAgentId}"]`);
      if (accessCheck) accessCheck.checked = true;
    }
  }
  syncPaymentAccountRuleVisibility(form);
}

function bindPaymentAccountOwnerForm(form) {
  if (!form) return;
  const typeSelect = form.querySelector('[name="accountType"]');
  const ownerSelect = form.querySelector('[name="ownerUserId"]');
  if (typeSelect) typeSelect.addEventListener('change', () => syncPaymentAccountOwnerForm(form));
  if (ownerSelect) ownerSelect.addEventListener('change', () => syncPaymentAccountOwnerForm(form));
  syncPaymentAccountOwnerForm(form);
}

function paymentAccountRuleClient(account={}, key='send_money') {
  const direct = account?.transactionRules?.[key];
  if (direct && typeof direct === 'object') return direct;
  const legacy = {
    mode:String(account.transactionChargeMode || 'none'),
    fixed:Math.max(0, Number(account.transactionChargeFixed || 0)),
    percent:Math.max(0, Number(account.transactionChargePercent || 0)),
    tiers:Array.isArray(account.transactionChargeTiers) ? account.transactionChargeTiers : []
  };
  return legacy;
}

function paymentRuleShortSummaryClient(rule={}) {
  const mode = String(rule?.mode || 'none');
  const fixed = Math.max(0, Number(rule?.fixed || 0));
  const percent = Math.max(0, Number(rule?.percent || 0));
  if (mode === 'fixed') return `${money(fixed)} fixed`;
  if (mode === 'percentage') return `${percent}%`;
  if (mode === 'fixed_percentage') return `${money(fixed)} + ${percent}%`;
  if (mode === 'tiered') return `${Array.isArray(rule?.tiers) ? rule.tiers.length : 0} tier(s)`;
  if (mode === 'manual') return 'Manual actual';
  return 'None';
}

function paymentAccountOrderRuleSummary(account={}, direction='send') {
  const accountType = String(account.accountType || '').toLowerCase();
  const normalizedDirection = String(direction || 'send').toLowerCase();
  if (accountType === 'agent') {
    const key = normalizedDirection === 'receive' ? 'receive_money' : 'cash_in';
    const title = key === 'receive_money' ? 'Received commission' : 'Cash In commission';
    return `${title}: ${paymentRuleShortSummaryClient(paymentAccountRuleClient(account, key))}`;
  }
  if (normalizedDirection !== 'send') return 'No receive charge';
  return `Send Money charge: ${paymentRuleShortSummaryClient(paymentAccountRuleClient(account, 'send_money'))}`;
}

function paymentRuleEditorHtml({ prefix, title, rule={}, kind='charge' }={}) {
  const mode = String(rule.mode || 'none');
  const tiers = Array.isArray(rule.tiers) ? JSON.stringify(rule.tiers) : '[]';
  const noun = kind === 'commission' ? 'Commission' : 'Charge';
  return `<section class="payment-rule-card">
    <div class="payment-rule-card-head"><b>${escapeHtml(title || noun)}</b><small>${kind === 'commission' ? 'Credited to balance' : 'Deducted from balance'}</small></div>
    <div class="payment-rule-grid">
      <label>Rule<select name="${prefix}Mode"><option value="none" ${mode==='none'?'selected':''}>None</option><option value="fixed" ${mode==='fixed'?'selected':''}>Fixed amount</option><option value="percentage" ${mode==='percentage'?'selected':''}>Percentage</option><option value="fixed_percentage" ${mode==='fixed_percentage'?'selected':''}>Fixed + percentage</option><option value="tiered" ${mode==='tiered'?'selected':''}>Tier-based</option><option value="manual" ${mode==='manual'?'selected':''}>Manual actual amount</option></select></label>
      <label>Fixed Amount (BDT)<input name="${prefix}Fixed" type="number" min="0" step="0.01" value="${escapeAttr(rule.fixed || 0)}" /></label>
      <label>Percentage (%)<input name="${prefix}Percent" type="number" min="0" max="100" step="0.0001" value="${escapeAttr(rule.percent || 0)}" /></label>
      <label class="payment-rule-tier">Tier Rules (JSON)<textarea name="${prefix}Tiers" rows="2" placeholder='[{"min":0,"max":5000,"fixed":5,"percent":0}]'>${escapeHtml(tiers)}</textarea></label>
    </div>
  </section>`;
}

function paymentAccountChargeFieldsHtml(account={}) {
  return `<div class="full-row payment-rule-groups">
    <div data-payment-rule-group="personal">
      <div class="payment-rule-group-title"><b>Personal / Merchant Charges</b><small>Send Money and Cash Out have separate rates.</small></div>
      ${paymentRuleEditorHtml({ prefix:'sendMoneyCharge', title:'Send Money Charge', rule:paymentAccountRuleClient(account, 'send_money'), kind:'charge' })}
      ${paymentRuleEditorHtml({ prefix:'cashOutCharge', title:'Cash Out Charge', rule:paymentAccountRuleClient(account, 'cash_out'), kind:'charge' })}
    </div>
    <div data-payment-rule-group="agent" class="hidden">
      <div class="payment-rule-group-title"><b>Agent Commissions</b><small>Received Money and Cash In have separate commission rates.</small></div>
      ${paymentRuleEditorHtml({ prefix:'receiveMoneyCommission', title:'Received Money Commission', rule:paymentAccountRuleClient(account, 'receive_money'), kind:'commission' })}
      ${paymentRuleEditorHtml({ prefix:'cashInCommission', title:'Cash In Commission', rule:paymentAccountRuleClient(account, 'cash_in'), kind:'commission' })}
    </div>
  </div>`;
}

function openAccountModal() {
  const manageAll = paymentAccountScopeManageAll();
  const defaultType = 'personal';
  modal('Add Payment Account', `
    <form id="accountForm" class="form-grid">
      <div><label>Payment Method</label>${methodSelect()}</div>
      <div><label>Account User</label>${paymentAccountOwnerField(state.user?.id, manageAll)}</div>
      <div><label>Account Type</label>${paymentAccountTypeSelect(defaultType)}</div>
      <div><label>Account Number</label><input name="accountNumber" required /></div>
      <div><label>Label</label><input name="label" maxlength="80" placeholder="Example: Office Phone 1" /></div>
      <div><label>Serial Number</label><input name="serialNumber" maxlength="80" placeholder="Example: SIM-001" title="Unique within the same Payment Method and Label. No Label is a separate fallback scope." /></div>
      <div><label>Account Name</label><input name="accountName" /></div>
      <div><label>Opening Balance</label><input name="currentBalance" type="number" min="0" step="any" value="0" /></div>
      <div><label>Status</label>${accountStatusSelect('active')}</div>
      ${paymentAccountChargeFieldsHtml({})}
      <div><label>Daily Receive Limit</label><input name="dailyReceiveLimit" type="number" min="0" value="50000" /></div>
      <div><label>Daily Send Limit</label><input name="dailySendLimit" type="number" min="0" value="50000" /></div>
      <div><label>Monthly Receive Limit</label><input name="monthlyReceiveLimit" type="number" min="0" value="300000" /></div>
      <div><label>Monthly Send Limit</label><input name="monthlySendLimit" type="number" min="0" value="300000" /></div>
      <div class="full-row"><label>Agent Access</label>${paymentAccountAgentAccessField([], manageAll)}</div>
      <div class="full-row" id="accountFormMessage"></div>
      <div class="full-row"><button type="submit">Create Account</button></div>
    </form>`);
  bindPaymentAccountOwnerForm($('#accountForm'));
  $('#accountForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const payload = formObj(e.target);
      if (manageAll) payload.allowedAgentIds = selectedAllowedAgentIds(e.target);
      await api('/api/payment-accounts', { method:'POST', body: JSON.stringify(payload) });
      notify('Payment account created.', 'ok');
      closeModal();
      await renderAccounts();
    } catch (err) { setFormMessage('#accountFormMessage', err.message || 'Account create failed', 'danger'); }
  };
}

function openEditAccountModal(id) {
  const account = (window.lastAccounts || []).find(a => Number(a.id) === Number(id));
  if (!account) return notify('Account not found. Refresh page and try again.', 'danger');
  if (!account.viewerCanManage) return notify('You do not have permission to edit this payment account.', 'danger');
  const manageAccess = account.viewerCanManageAccess === true;
  modal('Edit Payment Account', `
    <form id="editAccountForm" class="form-grid">
      <div><label>Payment Method</label>${methodSelect(account.paymentMethodId)}</div>
      <div><label>Account User</label>${paymentAccountOwnerField(account.ownerUserId, manageAccess)}</div>
      <div><label>Account Type</label>${paymentAccountTypeSelect(account.accountType)}</div>
      <div><label>Account Number</label><input name="accountNumber" value="${escapeAttr(account.accountNumber)}" required /></div>
      <div><label>Label</label><input name="label" maxlength="80" value="${escapeAttr(account.label || '')}" placeholder="Example: Office Phone 1" /></div>
      <div><label>Serial Number</label><input name="serialNumber" maxlength="80" value="${escapeAttr(account.serialNumber || '')}" placeholder="Example: SIM-001" title="Unique within the same Payment Method and Label. No Label is a separate fallback scope." /></div>
      <div><label>Account Name</label><input name="accountName" value="${escapeAttr(account.accountName || '')}" /></div>
      <div><label>Status</label>${accountStatusSelect(account.status)}</div>
      ${paymentAccountChargeFieldsHtml(account)}
      <div><label>Daily Receive Limit</label><input name="dailyReceiveLimit" type="number" min="0" value="${account.dailyReceiveLimit || 0}" /></div>
      <div><label>Daily Send Limit</label><input name="dailySendLimit" type="number" min="0" value="${account.dailySendLimit || 0}" /></div>
      <div><label>Monthly Receive Limit</label><input name="monthlyReceiveLimit" type="number" min="0" value="${account.monthlyReceiveLimit || 0}" /></div>
      <div><label>Monthly Send Limit</label><input name="monthlySendLimit" type="number" min="0" value="${account.monthlySendLimit || 0}" /></div>
      <div class="full-row"><label>Agent Access</label>${paymentAccountAgentAccessField(account.allowedAgentIds || [], manageAccess)}</div>
      <div class="full-row" id="editAccountMessage"></div>
      <div class="full-row"><button type="submit">Save Account</button></div>
    </form>`);
  bindPaymentAccountOwnerForm($('#editAccountForm'));
  $('#editAccountForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const payload = formObj(e.target);
      if (manageAccess) payload.allowedAgentIds = selectedAllowedAgentIds(e.target);
      await api('/api/payment-accounts/' + id, { method:'PATCH', body: JSON.stringify(payload) });
      notify('Payment account updated.', 'ok');
      closeModal();
      await renderAccounts();
    } catch (err) { setFormMessage('#editAccountMessage', err.message || 'Account update failed', 'danger'); }
  };
}

function bulkEditApplyField(form, checkboxName, fieldName, changes, transform = value => value) {
  const checkbox = form.querySelector(`[name="${checkboxName}"]`);
  if (!checkbox?.checked) return;
  const field = form.querySelector(`[name="${fieldName}"]`);
  changes[fieldName] = transform(field?.value ?? '');
}

function bulkPaymentRuleEditorHtml(prefix, title) {
  const cap = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  return `<section class="payment-rule-card bulk-payment-rule-card">
    <div class="payment-rule-card-head"><b>${escapeHtml(title)}</b><label class="check"><input type="checkbox" name="apply${cap}Mode" /> Apply rule</label></div>
    <div class="payment-rule-grid">
      <label>Rule<select name="${prefix}Mode"><option value="none">None</option><option value="fixed">Fixed amount</option><option value="percentage">Percentage</option><option value="fixed_percentage">Fixed + percentage</option><option value="tiered">Tier-based</option><option value="manual">Manual actual amount</option></select></label>
      <label>Fixed<input name="${prefix}Fixed" type="number" min="0" step="0.01" value="0" /></label>
      <label>Percent<input name="${prefix}Percent" type="number" min="0" max="100" step="0.0001" value="0" /></label>
      <label class="payment-rule-tier">Tier Rules<textarea name="${prefix}Tiers" rows="2">[]</textarea></label>
      <label class="check payment-rule-subapply"><input type="checkbox" name="apply${cap}Fixed" /> Apply fixed</label>
      <label class="check payment-rule-subapply"><input type="checkbox" name="apply${cap}Percent" /> Apply percent</label>
      <label class="check payment-rule-subapply"><input type="checkbox" name="apply${cap}Tiers" /> Apply tiers</label>
    </div>
  </section>`;
}

function applyBulkPaymentRule(form, changes, prefix) {
  const cap = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  bulkEditApplyField(form, `apply${cap}Mode`, `${prefix}Mode`, changes);
  bulkEditApplyField(form, `apply${cap}Fixed`, `${prefix}Fixed`, changes, Number);
  bulkEditApplyField(form, `apply${cap}Percent`, `${prefix}Percent`, changes, Number);
  bulkEditApplyField(form, `apply${cap}Tiers`, `${prefix}Tiers`, changes);
}

function openBulkEditAccountModal(ids=[]) {
  const selectedIds = Array.from(new Set((ids || []).map(Number).filter(Boolean)));
  const accounts = (window.lastAccounts || []).filter(account => selectedIds.includes(Number(account.id)) && account.viewerCanManage);
  if (!accounts.length) return notify('Select at least one manageable payment account.', 'danger');
  const manageAll = accounts.every(account => account.viewerCanManageAccess === true);
  modal(`Edit ${accounts.length} Payment Account${accounts.length === 1 ? '' : 's'}`, `
    <form id="bulkEditAccountForm" class="form-grid">
      <div class="full-row notice"><b>${accounts.length} selected</b><br>${accounts.map(account => escapeHtml(account.accountNumber || `#${account.id}`)).join(', ')}</div>
      <div class="bulk-edit-field"><label class="check"><input type="checkbox" name="applyStatus" /> Change Status</label>${accountStatusSelect('active')}</div>
      <div class="bulk-edit-field"><label class="check"><input type="checkbox" name="applyAccountType" /> Change Account Type</label>${paymentAccountTypeSelect(accounts[0]?.accountType || 'personal')}</div>
      <div class="bulk-edit-field"><label class="check"><input type="checkbox" name="applyLabel" /> Change Label</label><input name="label" maxlength="80" placeholder="Blank clears the Label" /></div>
      <div class="bulk-edit-field"><label class="check"><input type="checkbox" name="applyAccountName" /> Change Account Name</label><input name="accountName" maxlength="120" placeholder="Blank clears the Account Name" /></div>
      <div class="bulk-edit-field"><label class="check"><input type="checkbox" name="applySerialSequence" /> Regenerate Serial Sequence</label><input name="serialStart" maxlength="80" placeholder="Example: SIM-001" /></div>
      ${manageAll ? `<div class="bulk-edit-field"><label class="check"><input type="checkbox" name="applyOwnerUserId" /> Change Account User</label>${paymentAccountOwnerSelect(accounts[0]?.ownerUserId || state.user?.id)}</div>` : ''}
      <div class="bulk-edit-field"><label class="check"><input type="checkbox" name="applyDailyReceiveLimit" /> Daily Receive Limit</label><input name="dailyReceiveLimit" type="number" min="0" step="0.01" value="0" /></div>
      <div class="bulk-edit-field"><label class="check"><input type="checkbox" name="applyDailySendLimit" /> Daily Send Limit</label><input name="dailySendLimit" type="number" min="0" step="0.01" value="0" /></div>
      <div class="bulk-edit-field"><label class="check"><input type="checkbox" name="applyMonthlyReceiveLimit" /> Monthly Receive Limit</label><input name="monthlyReceiveLimit" type="number" min="0" step="0.01" value="0" /></div>
      <div class="bulk-edit-field"><label class="check"><input type="checkbox" name="applyMonthlySendLimit" /> Monthly Send Limit</label><input name="monthlySendLimit" type="number" min="0" step="0.01" value="0" /></div>
      <div class="full-row payment-rule-groups" data-bulk-payment-rules>
        <div data-payment-rule-group="personal">
          <div class="payment-rule-group-title"><b>Personal / Merchant Charges</b><small>Choose each rate independently.</small></div>
          ${bulkPaymentRuleEditorHtml('sendMoneyCharge', 'Send Money Charge')}
          ${bulkPaymentRuleEditorHtml('cashOutCharge', 'Cash Out Charge')}
        </div>
        <div data-payment-rule-group="agent" class="hidden">
          <div class="payment-rule-group-title"><b>Agent Commissions</b><small>Received Money and Cash In use separate commission rates.</small></div>
          ${bulkPaymentRuleEditorHtml('receiveMoneyCommission', 'Received Money Commission')}
          ${bulkPaymentRuleEditorHtml('cashInCommission', 'Cash In Commission')}
        </div>
      </div>
      ${manageAll ? `<div class="full-row bulk-edit-field"><label class="check"><input type="checkbox" name="applyAllowedAgentIds" /> Replace Agent Access</label>${paymentAccountAgentAccessHtml(accounts[0]?.allowedAgentIds || [])}</div>` : ''}
      <div class="full-row sub">Unchecked fields remain unchanged. The update is atomic: if one selected account fails validation, none are changed.</div>
      <div class="full-row" id="bulkEditAccountMessage"></div>
      <div class="full-row"><button type="submit">Update Selected Accounts</button></div>
    </form>`);
  const form = $('#bulkEditAccountForm');
  const accountTypeSelect = form.querySelector('[name="accountType"]');
  if (accountTypeSelect) accountTypeSelect.addEventListener('change', () => syncPaymentAccountRuleVisibility(form));
  syncPaymentAccountRuleVisibility(form);
  form.onsubmit = async event => {
    event.preventDefault();
    const changes = {};
    bulkEditApplyField(form, 'applyStatus', 'status', changes);
    bulkEditApplyField(form, 'applyAccountType', 'accountType', changes);
    bulkEditApplyField(form, 'applyLabel', 'label', changes);
    bulkEditApplyField(form, 'applyAccountName', 'accountName', changes);
    bulkEditApplyField(form, 'applyDailyReceiveLimit', 'dailyReceiveLimit', changes, Number);
    bulkEditApplyField(form, 'applyDailySendLimit', 'dailySendLimit', changes, Number);
    bulkEditApplyField(form, 'applyMonthlyReceiveLimit', 'monthlyReceiveLimit', changes, Number);
    bulkEditApplyField(form, 'applyMonthlySendLimit', 'monthlySendLimit', changes, Number);
    applyBulkPaymentRule(form, changes, 'sendMoneyCharge');
    applyBulkPaymentRule(form, changes, 'cashOutCharge');
    applyBulkPaymentRule(form, changes, 'receiveMoneyCommission');
    applyBulkPaymentRule(form, changes, 'cashInCommission');
    if (manageAll && form.applyOwnerUserId?.checked) changes.ownerUserId = Number(form.ownerUserId?.value || 0);
    if (manageAll && form.applyAllowedAgentIds?.checked) changes.allowedAgentIds = selectedAllowedAgentIds(form);
    const serialNumbers = {};
    if (form.applySerialSequence?.checked) {
      const seed = String(form.serialStart?.value || '').trim();
      if (!seed) return setFormMessage('#bulkEditAccountMessage', 'Enter a Starting Serial or uncheck Regenerate Serial Sequence.', 'danger');
      accounts.forEach((account, index) => { serialNumbers[account.id] = bulkSerialValue(seed, index); });
    }
    if (!Object.keys(changes).length && !Object.keys(serialNumbers).length) return setFormMessage('#bulkEditAccountMessage', 'Choose at least one field to edit.', 'danger');
    try {
      const result = await api('/api/payment-accounts/bulk', { method:'PATCH', body:JSON.stringify({ ids:accounts.map(account => account.id), changes, serialNumbers }) });
      notify(`${result.count || accounts.length} payment account(s) updated.`, 'ok');
      paymentAccountSelectedIdSet().clear();
      closeModal();
      await renderAccounts();
    } catch (error) {
      const details = Array.isArray(error?.data?.errors) ? error.data.errors.map(item => `${item.accountNumber || `#${item.accountId}`}: ${item.error}`).join('\n') : '';
      setFormMessage('#bulkEditAccountMessage', `${error.message || 'Bulk update failed.'}${details ? `\n${details}` : ''}`, 'danger');
    }
  };
}

async function deletePaymentAccounts(ids=[]) {
  const selectedIds = Array.from(new Set((ids || []).map(Number).filter(Boolean)));
  const accounts = (window.lastAccounts || []).filter(account => selectedIds.includes(Number(account.id)) && account.viewerCanDelete);
  if (!accounts.length) return notify('Select at least one deletable payment account.', 'danger');
  const labels = accounts.map(account => account.accountNumber || `#${account.id}`).join(', ');
  const confirmed = window.confirm(`Delete ${accounts.length} payment account${accounts.length === 1 ? '' : 's'}?\n\n${labels}\n\nBalance must be zero and no pending order/offline reservation may exist. Statement history will be preserved.`);
  if (!confirmed) return;
  try {
    const endpoint = accounts.length === 1 ? `/api/payment-accounts/${accounts[0].id}` : '/api/payment-accounts/bulk';
    const body = accounts.length === 1
      ? { reason:'Deleted from Payment Accounts' }
      : { ids:accounts.map(account => account.id), reason:'Bulk deleted from Payment Accounts' };
    const result = await api(endpoint, { method:'DELETE', body:JSON.stringify(body) });
    notify(`${result.count || 1} payment account(s) deleted.`, 'ok');
    accounts.forEach(account => paymentAccountSelectedIdSet().delete(Number(account.id)));
    await renderAccounts();
  } catch (error) {
    const details = Array.isArray(error?.data?.errors) ? error.data.errors.map(item => `${item.accountNumber || `#${item.accountId}`}: ${item.error}`).join('\n') : '';
    notify(`${error.message || 'Delete failed.'}${details ? `\n${details}` : ''}`, 'danger');
  }
}

function parseBulkAccountNumbers(value='') {
  return String(value || '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);
}

function currentBulkPreviewMap() {
  const map = new Map();
  $$('#bulkAccountPreview [data-bulk-account-row]').forEach(row => {
    map.set(String(row.dataset.accountNumber || ''), {
      balance: row.querySelector('[data-bulk-account-balance]')?.value || '0',
      label: row.querySelector('[data-bulk-account-label]')?.value || '',
      serialNumber: row.querySelector('[data-bulk-account-serial]')?.value || ''
    });
  });
  return map;
}

function bulkSerialValue(seed='', index=0) {
  const value = String(seed || '').trim();
  if (!value) return '';
  const match = value.match(/^(.*?)(\d+)$/);
  if (match) {
    const next = String(Number(match[2]) + index).padStart(match[2].length, '0');
    return `${match[1]}${next}`;
  }
  return index === 0 ? value : `${value}-${index + 1}`;
}

function normalizePaymentAccountSerialClientValue(value='') {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function bulkPaymentAccountSerialConflictDetails(items=[]) {
  const conflicts = new Map();
  const addConflict = (index, otherIndex) => {
    const item = items[index] || {};
    const current = conflicts.get(index) || {
      serialNumber: String(item.serialNumber || '').trim(),
      label: String(item.label || '').trim(),
      otherRows: []
    };
    if (!current.otherRows.includes(otherIndex + 1)) current.otherRows.push(otherIndex + 1);
    conflicts.set(index, current);
  };
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    const leftSerial = normalizePaymentAccountSerialClientValue(items[leftIndex]?.serialNumber);
    if (!leftSerial) continue;
    const leftLabel = normalizePaymentAccountSerialClientValue(items[leftIndex]?.label);
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      const rightSerial = normalizePaymentAccountSerialClientValue(items[rightIndex]?.serialNumber);
      if (leftSerial !== rightSerial) continue;
      const rightLabel = normalizePaymentAccountSerialClientValue(items[rightIndex]?.label);
      if (leftLabel === rightLabel) {
        addConflict(leftIndex, rightIndex);
        addConflict(rightIndex, leftIndex);
      }
    }
  }
  return conflicts;
}

function bulkPaymentAccountSerialConflictIndexes(items=[]) {
  return new Set(bulkPaymentAccountSerialConflictDetails(items).keys());
}

function bulkPaymentAccountSerialConflictText(detail={}) {
  const rows = Array.isArray(detail.otherRows) ? detail.otherRows.filter(Boolean).sort((a,b) => a-b) : [];
  const rowText = rows.length ? `Account ${rows.join(', ')}` : 'another account';
  const scopeText = String(detail.label || '').trim() ? `Label "${String(detail.label).trim()}"` : 'the no-Label scope';
  return `Serial "${String(detail.serialNumber || '').trim()}" duplicates ${rowText} inside ${scopeText}.`;
}

function updateBulkAccountSerialWarnings() {
  const rows = [...document.querySelectorAll('#bulkAccountPreview [data-bulk-account-row]')];
  const entries = rows.map(row => ({
    label: row.querySelector('[data-bulk-account-label]')?.value || '',
    serialNumber: row.querySelector('[data-bulk-account-serial]')?.value || ''
  }));
  const details = bulkPaymentAccountSerialConflictDetails(entries);
  rows.forEach((row, index) => {
    const detail = details.get(index) || null;
    row.classList.toggle('has-serial-error', Boolean(detail));
    const warning = row.querySelector('[data-bulk-serial-warning]');
    if (warning) {
      warning.classList.toggle('hidden', !detail);
      warning.textContent = detail ? bulkPaymentAccountSerialConflictText(detail) : '';
    }
  });
  return details;
}

function renderBulkAccountPreview({ applyDefaults=false } = {}) {
  const host = $('#bulkAccountPreview');
  if (!host) return;
  const numbers = parseBulkAccountNumbers($('#bulkAccountNumbers')?.value || '');
  const previous = currentBulkPreviewMap();
  const defaultBalance = $('#bulkDefaultOpeningBalance')?.value || '0';
  const defaultLabel = $('#bulkDefaultLabel')?.value || '';
  const serialStart = $('#bulkSerialStart')?.value || '';
  const duplicates = new Set(numbers.filter((number, index) => numbers.indexOf(number) !== index));
  const uniqueCount = new Set(numbers).size;
  $('#bulkAccountCount').textContent = String(numbers.length);
  $('#bulkAccountUniqueCount').textContent = String(uniqueCount);
  if (!numbers.length) {
    host.innerHTML = '<div class="empty bulk-account-empty">Enter one account number per line.</div>';
    return;
  }
  host.innerHTML = `<div class="bulk-account-preview-list">${numbers.map((number, index) => {
    const old = previous.get(number) || {};
    const balance = applyDefaults ? defaultBalance : (old.balance ?? defaultBalance);
    const label = applyDefaults ? defaultLabel : (old.label ?? defaultLabel);
    const serialNumber = applyDefaults ? bulkSerialValue(serialStart, index) : (old.serialNumber ?? bulkSerialValue(serialStart, index));
    return `<div class="bulk-account-preview-row bulk-account-preview-row-v2 ${duplicates.has(number) ? 'has-error' : ''}" data-bulk-account-row data-account-number="${escapeAttr(number)}">
      <span class="bulk-account-serial">${index + 1}</span>
      <div class="bulk-account-number"><b>${escapeHtml(number)}</b>${duplicates.has(number) ? '<small>Duplicate number</small>' : ''}<small data-bulk-serial-warning class="hidden">Duplicate serial in the same Label scope</small></div>
      <label><span>Label</span><input data-bulk-account-label maxlength="80" value="${escapeAttr(label)}" /></label>
      <label><span>Serial</span><input data-bulk-account-serial maxlength="80" value="${escapeAttr(serialNumber)}" title="Unique within the same Payment Method and Label. No Label is a separate fallback scope." /></label>
      <label><span>Opening Balance</span><input data-bulk-account-balance type="number" min="0" step="any" value="${escapeAttr(balance)}" /></label>
    </div>`;
  }).join('')}</div>`;
  host.querySelectorAll('[data-bulk-account-label],[data-bulk-account-serial]').forEach(input => input.addEventListener('input', updateBulkAccountSerialWarnings));
  updateBulkAccountSerialWarnings();
}

function openBulkAccountModal() {
  const manageAll = paymentAccountScopeManageAll();
  const defaultType = 'personal';
  modal('Bulk Add Payment Accounts', `
    <form id="bulkAccountForm" class="form-grid bulk-account-box-form">
      <div><label>Payment Method</label>${methodSelect()}</div>
      <div><label>Account User</label>${paymentAccountOwnerField(state.user?.id, manageAll)}</div>
      <div><label>Account Name</label><input name="accountName" /></div>
      <div><label>Account Type</label>${paymentAccountTypeSelect(defaultType)}</div>
      <div><label>Status</label>${accountStatusSelect('active')}</div>
      ${paymentAccountChargeFieldsHtml({})}
      <div><label>Daily Receive Limit</label><input name="dailyReceiveLimit" type="number" min="0" value="50000" /></div>
      <div><label>Daily Send Limit</label><input name="dailySendLimit" type="number" min="0" value="50000" /></div>
      <div><label>Monthly Receive Limit</label><input name="monthlyReceiveLimit" type="number" min="0" value="300000" /></div>
      <div><label>Monthly Send Limit</label><input name="monthlySendLimit" type="number" min="0" value="300000" /></div>
      <div class="full-row"><label>Agent Access</label>${paymentAccountAgentAccessField([], manageAll)}</div>
      <div class="full-row bulk-account-number-box">
        <div class="bulk-account-box-head"><label for="bulkAccountNumbers">Account Numbers</label><span><b id="bulkAccountCount">0</b> rows · <b id="bulkAccountUniqueCount">0</b> unique</span></div>
        <textarea id="bulkAccountNumbers" rows="9" spellcheck="false" placeholder="01300000001&#10;01300000002&#10;01300000003"></textarea>
      </div>
      <div class="full-row bulk-account-balance-tools bulk-account-default-tools">
        <label>Default Label <input id="bulkDefaultLabel" maxlength="80" placeholder="Office Phone 1" /></label>
        <label>Starting Serial <input id="bulkSerialStart" maxlength="80" placeholder="SIM-001" title="Serials are unique by Payment Method and Label. No Label is a separate fallback scope." /></label>
        <label>Default Opening Balance <input id="bulkDefaultOpeningBalance" type="number" min="0" step="any" value="0" /></label>
        <button type="button" class="secondary" id="bulkApplyDefaults">Apply Defaults</button>
      </div>
      <div class="full-row">
        <div class="bulk-account-preview-title"><b>Account Preview</b></div>
        <div id="bulkAccountPreview"></div>
      </div>
      <div class="full-row" id="bulkAccountMessage"></div>
      <div class="full-row"><button type="submit">Add Accounts</button></div>
    </form>`);
  bindPaymentAccountOwnerForm($('#bulkAccountForm'));
  const numbersInput = $('#bulkAccountNumbers');
  numbersInput.oninput = () => renderBulkAccountPreview();
  $('#bulkApplyDefaults').onclick = () => renderBulkAccountPreview({ applyDefaults:true });
  renderBulkAccountPreview();
  $('#bulkAccountForm').onsubmit = async e => {
    e.preventDefault();
    const numbers = parseBulkAccountNumbers(numbersInput.value);
    if (!numbers.length) return setFormMessage('#bulkAccountMessage', 'Add at least one account number.', 'danger');
    if (numbers.length > 500) return setFormMessage('#bulkAccountMessage', 'A maximum of 500 payment accounts can be added at once.', 'danger');
    if (new Set(numbers).size !== numbers.length) return setFormMessage('#bulkAccountMessage', 'Remove duplicate account numbers before saving.', 'danger');
    const common = formObj(e.target);
    if (manageAll) common.allowedAgentIds = selectedAllowedAgentIds(e.target);
    const rows = [...e.target.querySelectorAll('[data-bulk-account-row]')];
    const accounts = rows.map(row => ({
      accountNumber: row.dataset.accountNumber || '',
      label: row.querySelector('[data-bulk-account-label]')?.value || '',
      serialNumber: row.querySelector('[data-bulk-account-serial]')?.value || '',
      openingBalance: row.querySelector('[data-bulk-account-balance]')?.value || 0
    }));
    const serialConflicts = bulkPaymentAccountSerialConflictDetails(accounts);
    if (serialConflicts.size) {
      const [firstIndex, firstDetail] = serialConflicts.entries().next().value;
      return setFormMessage('#bulkAccountMessage', `Account ${Number(firstIndex) + 1}: ${bulkPaymentAccountSerialConflictText(firstDetail)} Different Labels—including a named Label and no Label—may reuse the same serial.`, 'danger');
    }
    try {
      const result = await api('/api/payment-accounts/bulk', { method:'POST', body: JSON.stringify({ common, accounts }) });
      notify(`${result.count || 0} payment account(s) added.`, 'ok');
      closeModal();
      await renderAccounts();
    } catch (err) {
      const details = Array.isArray(err?.data?.errors) ? err.data.errors.map(item => `Account ${item.row}: ${item.error}`).join('\n') : '';
      setFormMessage('#bulkAccountMessage', `${err.message || 'Bulk add failed.'}${details ? `\n${details}` : ''}`, 'danger');
    }
  };
}

function manualPaymentTransactionAdjustmentKindClient(account={}, type='') {
  const accountType = String(account.accountType || '').toLowerCase();
  const transactionType = String(type || '').toLowerCase();
  if (accountType === 'agent') return ['receive_money','cash_in'].includes(transactionType) ? 'commission' : 'none';
  return ['send_money','cash_out'].includes(transactionType) ? 'charge' : 'none';
}

function paymentAdjustmentRuleKeyClient(account={}, type='') {
  const accountType = String(account.accountType || '').toLowerCase();
  const transactionType = String(type || '').toLowerCase();
  if (accountType === 'agent') return ['receive_money','cash_in'].includes(transactionType) ? transactionType : '';
  return ['send_money','cash_out'].includes(transactionType) ? transactionType : '';
}

function configuredPaymentAdjustmentClient(account={}, amount=0, type='') {
  const base = Math.max(0, Number(amount || 0));
  const key = paymentAdjustmentRuleKeyClient(account, type);
  if (!key) return 0;
  const rule = paymentAccountRuleClient(account, key);
  const mode = String(rule.mode || 'none');
  const fixed = Math.max(0, Number(rule.fixed || 0));
  const percent = Math.max(0, Number(rule.percent || 0));
  if (!(base > 0)) return mode === 'manual' ? null : 0;
  if (mode === 'fixed') return fixed;
  if (mode === 'percentage') return base * percent / 100;
  if (mode === 'fixed_percentage') return fixed + (base * percent / 100);
  if (mode === 'tiered') {
    const tiers = Array.isArray(rule.tiers) ? rule.tiers : [];
    const tier = tiers.find(row => base >= Number(row?.min || 0) && (!(Number(row?.max || 0) > 0) || base <= Number(row.max)));
    return tier ? Math.max(0, Number(tier.fixed || 0)) + (base * Math.max(0, Number(tier.percent || 0)) / 100) : 0;
  }
  if (mode === 'manual') return null;
  return 0;
}

function syncManualPaymentTransactionForm(form, account, { resetOverride=false }={}) {
  if (!form) return;
  const type = form.type?.value || '';
  const amount = Number(form.amount?.value || 0);
  const kind = manualPaymentTransactionAdjustmentKindClient(account, type);
  const panel = form.querySelector('[data-manual-adjustment-panel]');
  const input = form.querySelector('[name="adjustmentAmount"]');
  const label = form.querySelector('[data-manual-adjustment-label]');
  const help = form.querySelector('[data-manual-adjustment-help]');
  if (!panel || !input || !label || !help) return;
  panel.classList.toggle('hidden', kind === 'none');
  input.disabled = kind === 'none';
  if (kind === 'none') {
    input.value = '0.00';
    input.dataset.dirty = 'false';
    help.textContent = 'No charge applies to this transaction type.';
    return;
  }
  label.textContent = kind === 'commission' ? 'Commission (BDT)' : 'Charge (BDT)';
  if (resetOverride) input.dataset.dirty = 'false';
  const configured = configuredPaymentAdjustmentClient(account, amount, type);
  if (String(paymentAccountRuleClient(account, paymentAdjustmentRuleKeyClient(account, type)).mode || 'none') === 'manual') {
    if (input.dataset.dirty !== 'true') input.value = '';
    input.required = true;
    help.textContent = `Manual ${kind} rule: enter the actual ${kind} amount.`;
  } else {
    input.required = false;
    if (input.dataset.dirty !== 'true') input.value = Number(configured || 0).toFixed(2);
    help.textContent = `${kind === 'commission' ? 'Commission is credited' : 'Charge is deducted'} immediately. Edit the box only to record an actual override.`;
  }
}

function openAdjustAccountModal(id) {
  const account = (window.lastAccounts || []).find(a => Number(a.id) === Number(id));
  if (!account) return notify('Account not found. Refresh page and try again.', 'danger');
  const isAgentAccount = String(account.accountType || '').toLowerCase() === 'agent';
  const transactionOptions = isAgentAccount
    ? '<option value="receive_money">Received Money (+)</option><option value="cash_in">Cash In (-)</option>'
    : '<option value="send_money">Send Money (-)</option><option value="receive_money">Receive Money (+)</option><option value="cash_out">Cash Out (-)</option><option value="bill_pay">Bill Pay (-)</option><option value="payment">Payment (-)</option><option value="mobile_recharge">Mobile Recharge (-)</option>';
  modal('Manual Balance Transaction', `
    <div class="kv"><b>Account</b><span>${escapeHtml(account.accountNumber)}</span><b>Type</b><span>${escapeHtml(accountTypeLabel(account.accountType))}</span><b>Current Balance</b><span>${money(account.currentBalance)}</span></div>
    <form id="adjustForm" class="form-grid">
      <div><label>Transaction Type</label><select name="type">${transactionOptions}</select></div>
      <div><label>Amount (BDT)</label><input name="amount" type="number" min="0.01" step="0.01" value="0" required /></div>
      <div data-manual-adjustment-panel><label data-manual-adjustment-label>${isAgentAccount ? 'Commission' : 'Charge'} (BDT)</label><input name="adjustmentAmount" type="number" min="0" step="0.01" data-dirty="false" /><small data-manual-adjustment-help></small></div>
      <div><label>Reference</label><input name="reference" maxlength="120" /></div>
      <div class="full-row"><label>Note</label><input name="note" maxlength="300" /></div>
      <div class="full-row notice small">${isAgentAccount ? 'Agent accounts use only Received Money and Cash In. Each can have its own commission rate.' : 'Personal and Merchant accounts use separate configured charges for Send Money and Cash Out.'}</div>
      <div class="full-row" id="adjustMessage"></div>
      <div class="full-row"><button type="submit">Save Transaction</button></div>
    </form>`);
  const form = $('#adjustForm');
  const adjustmentInput = form.querySelector('[name="adjustmentAmount"]');
  form.type.addEventListener('change', () => syncManualPaymentTransactionForm(form, account, { resetOverride:true }));
  form.amount.addEventListener('input', () => syncManualPaymentTransactionForm(form, account));
  adjustmentInput.addEventListener('input', () => { adjustmentInput.dataset.dirty = 'true'; });
  syncManualPaymentTransactionForm(form, account, { resetOverride:true });
  form.onsubmit = async event => {
    event.preventDefault();
    const kind = manualPaymentTransactionAdjustmentKindClient(account, form.type.value);
    const ruleKey = paymentAdjustmentRuleKeyClient(account, form.type.value);
    if (kind !== 'none' && String(paymentAccountRuleClient(account, ruleKey).mode || 'none') === 'manual' && String(adjustmentInput.value || '').trim() === '') {
      return setFormMessage('#adjustMessage', `Enter the actual ${kind} amount.`, 'danger');
    }
    const payload = formObj(form);
    if (kind === 'none') delete payload.adjustmentAmount;
    else if (String(adjustmentInput.value || '').trim() !== '') payload.adjustmentAmount = Number(adjustmentInput.value || 0);
    try {
      const result = await api('/api/payment-accounts/' + id + '/ledger', { method:'POST', body:JSON.stringify(payload) });
      const adjustment = Number(result.transaction?.adjustmentAmount || 0);
      const adjustmentText = adjustment > 0 ? ` ${kind === 'commission' ? 'Commission credited' : 'Charge deducted'}: ${money(adjustment)}.` : '';
      notify(`Manual transaction saved.${adjustmentText}`, 'ok');
      closeModal();
      await renderAccounts();
    } catch (error) { setFormMessage('#adjustMessage', error.message || 'Manual transaction failed', 'danger'); }
  };
}

function openCoUserModal(order) {
  modal('Request Co-User', `
    <form id="coUserForm" class="form-grid">
      <div><label>Required Amount</label><input name="requiredAmount" type="number" value="${order.summary?.remaining || order.amount}" /></div>
      <div class="full-row"><label>Reason</label><input name="reason" value="Need support for remaining amount" /></div>
      <div class="full-row" id="coUserMessage"></div>
      <div class="full-row"><button type="submit">Request / Auto Assign</button></div>
    </form>`);
  $('#coUserForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const updated = await api(`/api/orders/${order.id}/request-coagent`, { method:'POST', body: JSON.stringify(formObj(e.target)) });
      notify('Co-user request processed.', 'ok');
      closeModal();
      applyUpdatedCurrentOrder(updated, order.id);
    } catch (err) { setFormMessage('#coUserMessage', err.message || 'Co-user request failed', 'danger'); }
  };
}

function openLeaveModal(order) {
  modal('Leave Order', `
    <form id="leaveForm" class="form-grid">
      <div><label>Reason</label><select name="reason"><option>Limit not available</option><option>Account issue</option><option>Busy</option><option>Customer issue</option><option>Wrong assignment</option><option>Other</option></select></div>
      <div class="full-row"><label>Note</label><input name="note" /></div>
      <div class="full-row" id="leaveMessage"></div>
      <div class="full-row"><button class="warn" type="submit">Leave & Reassign</button></div>
    </form>`);
  $('#leaveForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const updated = await api(`/api/orders/${order.id}/leave`, { method:'POST', body: JSON.stringify(formObj(e.target)) });
      notify('Order left/reassigned.', 'ok');
      closeModal();
      applyUpdatedCurrentOrder(updated, order.id);
    } catch (err) { setFormMessage('#leaveMessage', err.message || 'Leave failed', 'danger'); }
  };
}

function openAssignModal(order) {
  modal('Assign / Add User', `
    <form id="assignForm" class="form-grid">
      <div><label>User / Employee</label>${agentSelect(order.leadAgentId)}</div>
      <div><label>Role</label><select name="role"><option value="lead">lead</option><option value="co_agent">co_agent</option></select></div>
      <div><label>Assigned Amount</label><input name="assignedAmount" type="number" value="${order.summary?.remaining || order.amount}" /></div>
      <div><label class="check"><input type="checkbox" name="forceLeaveCurrent" /> Force leave current assignments</label></div>
      <div class="full-row" id="assignMessage"></div>
      <div class="full-row"><button type="submit">Assign User</button></div>
    </form>`);
  $('#assignForm').onsubmit = async e => {
    e.preventDefault();
    const obj = formObj(e.target);
    obj.forceLeaveCurrent = e.target.forceLeaveCurrent.checked;
    try {
      const updated = await api(`/api/orders/${order.id}/assign`, { method:'POST', body: JSON.stringify(obj) });
      notify('Order assignment saved.', 'ok');
      closeModal();
      applyUpdatedCurrentOrder(updated, order.id);
    } catch (err) { setFormMessage('#assignMessage', err.message || 'Assign failed', 'danger'); }
  };
}


function openBinanceOrderSyncModal(credentialOptions = state.orderLiveCredentialOptions || [], selectedCredentialId = state.orderCredentialId || 0) {
  const options = (credentialOptions || []).filter(option => !option.disabled && Array.isArray(option.permissions) && option.permissions.includes('binance.sync'));
  const selectedId = options.some(option => Number(option.id) === Number(selectedCredentialId))
    ? Number(selectedCredentialId)
    : Number(options[0]?.id || 0);
  modal('Sync Binance Orders', `
    <form id="binanceOrderSyncForm" class="form-grid">
      <div class="full-row"><label>Binance Account</label><select name="credentialId" required ${options.length ? '' : 'disabled'}><option value="">Select account</option>${options.map(option => `<option value="${Number(option.id)}" ${Number(option.id) === selectedId ? 'selected' : ''}>${escapeHtml(binanceP2pAccountDisplayName(option))}</option>`).join('')}</select>${options.length ? '' : '<small class="danger-text">No enabled Binance account is assigned with Sync permission.</small>'}</div>
      <div><label>Page</label><input name="page" type="number" value="1" /></div>
      <div><label>Rows</label><input name="rows" type="number" value="20" max="100" /></div>
      <div><label>Trade Type</label><select name="tradeType"><option value="">All</option><option value="BUY">BUY</option><option value="SELL">SELL</option></select></div>
      <div><label>Order Status</label><select name="orderStatus"><option value="">All</option><option value="1">Wait Payment</option><option value="2">Wait Release</option><option value="3">Appeal</option><option value="4">Completed</option><option value="6">Cancelled</option><option value="7">System Cancelled</option></select></div>
      <div><label>Start Time</label><input name="startLocal" type="datetime-local" /></div>
      <div><label>End Time</label><input name="endLocal" type="datetime-local" /></div>
      <div class="full-row" id="binanceOrderSyncMessage"></div>
      <div class="full-row"><button class="success" type="submit" ${options.length ? '' : 'disabled'}>Run Live Sync</button></div>
    </form>`);
  $('#binanceOrderSyncForm').onsubmit = async e => {
    e.preventDefault();
    const obj = formObj(e.target);
    obj.credentialId = Number(obj.credentialId || 0);
    if (!obj.credentialId) return setFormMessage('#binanceOrderSyncMessage', 'Select the Binance account to sync.', 'danger');
    if (e.target.startLocal.value) obj.startDate = new Date(e.target.startLocal.value).getTime();
    if (e.target.endLocal.value) obj.endDate = new Date(e.target.endLocal.value).getTime();
    delete obj.startLocal; delete obj.endLocal;
    try {
      const result = await api('/api/binance/sync/orders', { method:'POST', body: JSON.stringify(obj) });
      state.orderCredentialId = obj.credentialId;
      localStorage.setItem('crmOrderCredentialId', String(obj.credentialId));
      notify(`Binance sync complete. Created ${result.created}, updated ${result.updated}, detail synced ${result.detailSynced || 0}, skipped ${result.skipped}.`, 'ok');
      closeModal();
      await refreshBootstrap();
      await renderOrders();
    } catch (err) { setFormMessage('#binanceOrderSyncMessage', err.message || 'Binance order sync failed', 'danger'); }
  };
}

async function syncCurrentBinanceDetail(order) {
  try {
    const updated = await api(`/api/orders/${order.id}/binance-refresh`, { method:'POST', body: JSON.stringify({ binanceOrderNumber: order.externalOrderNo || order.orderNo }) });
    notify('Binance order detail synced.', 'ok');
    applyUpdatedCurrentOrder(updated, order.id);
  } catch (err) { notify(err.message || 'Binance detail sync failed', 'danger'); }
}

async function syncCurrentBinanceStats(order) {
  try {
    const updated = await api(`/api/orders/${order.id}/binance-counterparty`, { method:'POST', body: JSON.stringify({ binanceOrderNumber: order.externalOrderNo || order.orderNo }) });
    notify('Binance counterparty stats synced.', 'ok');
    applyUpdatedCurrentOrder(updated, order.id);
  } catch (err) { notify(err.message || 'Binance stats sync failed', 'danger'); }
}

async function syncCurrentBinanceChat(order) {
  try {
    const updated = await api(`/api/orders/${order.id}/binance-chat-sync`, { method:'POST', body: JSON.stringify({ binanceOrderNumber: order.externalOrderNo || order.orderNo, page: 1, rows: 20, sort: 'desc' }) });
    if (Number(state.currentOrderId || 0) === Number(order.id)) {
      state.currentOrder = { ...(state.currentOrder || {}), ...updated };
      mergeCurrentOrderChatItems(updated.chats || [], { forceScroll:false });
    }
    notify('Binance chat messages synced.', 'ok');
  } catch (err) { notify(err.message || 'Binance chat sync failed', 'danger'); }
}


function orderReleaseVerificationPolicy(order = {}) {
  const policy = order.releaseVerificationPolicy && typeof order.releaseVerificationPolicy === 'object' ? order.releaseVerificationPolicy : {};
  const method = String(policy.binanceMethod || 'AUTO').toUpperCase();
  return {
    credentialId: Number(policy.credentialId || order.credentialId || 0) || null,
    credentialName: policy.credentialName || order.credentialDisplayName || order.credentialName || '',
    binanceMethod: ['AUTO','FIDO2','FUND_PWD','GOOGLE','SMS','EMAIL','YUBIKEY'].includes(method) ? method : 'AUTO',
    binanceMethodLabel: policy.binanceMethodLabel || ({AUTO:'Binance Auto',FIDO2:'FIDO2 / Fingerprint',FUND_PWD:'Fund Transfer Password',GOOGLE:'Google Authenticator',SMS:'SMS / Mobile OTP',EMAIL:'Email OTP',YUBIKEY:'YubiKey'}[method] || 'Binance Auto'),
    fundPasswordConfigured: policy.fundPasswordConfigured === true,
    autoFundPassword: policy.autoFundPassword === true,
    localVerificationEnabled: policy.localVerificationEnabled === true,
    localPrimary: String(policy.localPrimary || 'USER_PASSWORD').toUpperCase(),
    localPrimaryLabel: policy.localPrimaryLabel || ({USER_PASSWORD:'User Password',SECRET_CODE:'6-digit Secret Code',EMAIL_OTP:'Email OTP'}[String(policy.localPrimary || 'USER_PASSWORD').toUpperCase()] || 'User Password'),
    localSecondary: String(policy.localSecondary || 'NONE').toUpperCase(),
    localSecondaryLabel: policy.localSecondaryLabel || ({USER_PASSWORD:'User Password',SECRET_CODE:'6-digit Secret Code',EMAIL_OTP:'Email OTP',NONE:'None'}[String(policy.localSecondary || 'NONE').toUpperCase()] || 'None'),
    localAvailability: policy.localAvailability || {}
  };
}

function localFinalActionVerificationPanelHtml(policy = {}) {
  if (!policy.localVerificationEnabled) return '';
  const primary = policy.localPrimary || 'USER_PASSWORD';
  const hasSecondary = policy.localSecondary && policy.localSecondary !== 'NONE' && policy.localSecondary !== primary;
  return `<div id="localFinalActionVerificationPanel" class="full-row final-action-local-verify" data-primary="${escapeAttr(primary)}" data-secondary="${escapeAttr(policy.localSecondary || 'NONE')}">
    <div id="localFinalActionVerificationMethod"></div>
    <div class="final-action-local-actions">
      <button type="button" class="release-inline-link hidden" id="sendFinalActionEmailOtpBtn">Resend OTP</button>
      ${hasSecondary ? '<button type="button" class="release-inline-link hidden" id="changeFinalActionLocalVerificationBtn">Change verification method</button>' : ''}
    </div>
    <input type="hidden" name="localVerificationToken" id="localFinalActionVerificationToken" value="" />
    <div id="localFinalActionVerificationMessage" class="release-inline-message"></div>
  </div>`;
}

function localFinalActionMethodInputHtml(method, policy = {}) {
  const labelMap = { USER_PASSWORD:'User Password', SECRET_CODE:'6-digit Secret Code', EMAIL_OTP:'Email OTP' };
  const label = labelMap[method] || method;
  if (method === 'USER_PASSWORD') return `<div class="final-action-local-input"><label>${label}</label><input id="localFinalActionVerificationValue" type="password" autocomplete="current-password" placeholder="Enter your P2PFlow password" /></div>`;
  if (method === 'SECRET_CODE') return `<div class="final-action-local-input"><label>${label}</label><input id="localFinalActionVerificationValue" type="password" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6-digit Secret Code" /></div>`;
  if (method === 'EMAIL_OTP') return `<div class="final-action-local-input"><label>${label}</label><input id="localFinalActionVerificationValue" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="Enter the 6-digit OTP sent to your email" /></div>`;
  return `<div class="notice danger-note">This P2PFlow verification method is not available.</div>`;
}

function bindLocalFinalActionVerification(order, finalAction, policy, gateState) {
  const panel = $('#localFinalActionVerificationPanel');
  if (!panel || !policy.localVerificationEnabled) return;
  const primary = policy.localPrimary || 'USER_PASSWORD';
  const secondary = policy.localSecondary || 'NONE';
  gateState.method = primary;
  gateState.challengePromise = null;
  const methodBox = $('#localFinalActionVerificationMethod');
  const messageBox = '#localFinalActionVerificationMessage';
  const sendOtpBtn = $('#sendFinalActionEmailOtpBtn');
  const changeBtn = $('#changeFinalActionLocalVerificationBtn');
  const status = $('#localFinalActionVerificationStatus');
  const tokenInput = $('#localFinalActionVerificationToken');

  const methodLabel = method => ({USER_PASSWORD:'User Password',SECRET_CODE:'6-digit Secret Code',EMAIL_OTP:'Email OTP'}[method] || method);

  const startChallenge = async ({ resend = false } = {}) => {
    if (gateState.challengePromise) return gateState.challengePromise;
    const task = (async () => {
      const out = await api(`/api/orders/${order.id}/final-action-verification-start`, { method:'POST', body:JSON.stringify({ action:finalAction, method:gateState.method }), silent:true });
      gateState.challengeId = out.challengeId || '';
      if (gateState.method === 'EMAIL_OTP') setFormMessage(messageBox, `${resend ? 'New OTP sent' : 'OTP sent'} to ${out.emailMasked || 'your email'}.`, 'ok');
      return out;
    })();
    gateState.challengePromise = task;
    try { return await task; }
    finally { gateState.challengePromise = null; }
  };

  const renderMethod = ({ showFallback = false, autoSendOtp = true } = {}) => {
    gateState.challengeId = '';
    gateState.token = '';
    if (tokenInput) tokenInput.value = '';
    methodBox.innerHTML = localFinalActionMethodInputHtml(gateState.method, policy);
    if (sendOtpBtn) {
      sendOtpBtn.classList.toggle('hidden', gateState.method !== 'EMAIL_OTP');
      sendOtpBtn.disabled = false;
      sendOtpBtn.textContent = 'Resend Email OTP';
    }
    if (changeBtn) {
      const hasFallback = Boolean(secondary && secondary !== 'NONE' && secondary !== primary);
      changeBtn.classList.toggle('hidden', !hasFallback || !showFallback);
      changeBtn.disabled = false;
    }
    if (status) { status.textContent = 'Required'; status.className = 'badge warn'; }
    setFormMessage(messageBox, '', '');
    if (gateState.method === 'EMAIL_OTP' && autoSendOtp) {
      setTimeout(async () => {
        try { await startChallenge(); }
        catch (err) {
          if (changeBtn && err?.data?.canUseSecondary === true) changeBtn.classList.remove('hidden');
          setFormMessage(messageBox, err.message || 'Could not send Email OTP.', 'danger');
        }
      }, 30);
    }
  };

  gateState.reset = () => {
    gateState.method = primary;
    renderMethod();
  };

  gateState.verifyNow = async () => {
    if (gateState.token) return gateState.token;
    if (gateState.challengePromise) await gateState.challengePromise;
    if (!gateState.challengeId) await startChallenge();
    const input = $('#localFinalActionVerificationValue');
    const value = String(input?.value || '');
    if (!value.trim()) {
      const err = new Error(`Enter ${methodLabel(gateState.method)} first.`);
      setFormMessage(messageBox, err.message, 'danger');
      input?.focus();
      throw err;
    }
    try {
      const out = await api(`/api/orders/${order.id}/final-action-verification-verify`, { method:'POST', body:JSON.stringify({ action:finalAction, challengeId:gateState.challengeId, value }), silent:true });
      gateState.token = out.token || '';
      if (tokenInput) tokenInput.value = gateState.token;
      if (status) { status.textContent = 'Verified'; status.className = 'badge ok'; }
      setFormMessage(messageBox, 'Verified. Releasing...', 'ok');
      if (input) { input.value = ''; input.disabled = true; }
      if (sendOtpBtn) sendOtpBtn.disabled = true;
      if (changeBtn) changeBtn.disabled = true;
      return gateState.token;
    } catch (err) {
      const text = String(err?.message || 'P2PFlow verification failed.');
      if (/expired|does not belong|methods changed|start verification again/i.test(text)) gateState.challengeId = '';
      if (changeBtn && err?.data?.canUseSecondary === true) changeBtn.classList.remove('hidden');
      setFormMessage(messageBox, text, 'danger');
      input?.focus();
      throw err;
    }
  };

  if (sendOtpBtn) sendOtpBtn.onclick = async () => {
    sendOtpBtn.disabled = true;
    try {
      gateState.challengeId = '';
      await startChallenge({ resend:true });
    } catch (err) {
      if (changeBtn && err?.data?.canUseSecondary === true) changeBtn.classList.remove('hidden');
      setFormMessage(messageBox, err.message || 'Could not send Email OTP.', 'danger');
    } finally { sendOtpBtn.disabled = false; }
  };

  if (changeBtn) changeBtn.onclick = () => {
    const next = gateState.method === primary ? secondary : primary;
    if (!next || next === 'NONE') return;
    gateState.method = next;
    renderMethod({ showFallback:true });
  };
  renderMethod();
}

function paymentAccountBatchSort(a={}, b={}) {
  const labelCmp = String(a.label || '').localeCompare(String(b.label || ''), undefined, { numeric:true, sensitivity:'base' });
  if (labelCmp) return labelCmp;
  const serialCmp = String(a.serialNumber || '').localeCompare(String(b.serialNumber || ''), undefined, { numeric:true, sensitivity:'base' });
  if (serialCmp) return serialCmp;
  return String(a.accountNumber || '').localeCompare(String(b.accountNumber || ''), undefined, { numeric:true, sensitivity:'base' });
}

function selectedPaymentAccountIdsForOrder(order={}) {
  return Array.from(new Set([...(Array.isArray(order.selectedPaymentAccountIds) ? order.selectedPaymentAccountIds : []), order.selectedPaymentAccountId || order.selectedPaymentAccount?.id].map(value => Number(value || 0)).filter(Boolean)));
}

function selectedPaymentAccountsForSplit(order={}, accounts=[]) {
  const ids = selectedPaymentAccountIdsForOrder(order);
  return ids.map(id => accounts.find(account => Number(account.id) === Number(id))).filter(Boolean).sort(paymentAccountBatchSort);
}

function splitBatchSuggestedAmounts(accounts=[], direction='receive', total=0) {
  let remaining = Math.max(0, Number(total || 0));
  const out = new Map();
  [...accounts].sort(paymentAccountBatchSort).forEach(account => {
    const capacity = Math.max(0, capacityForAccount(account, direction));
    const amount = Math.min(remaining, capacity);
    out.set(Number(account.id), amount);
    remaining = Math.max(0, remaining - amount);
  });
  return out;
}

function splitBatchRowsHtml(accounts=[], amounts=new Map(), prefix='splitBatch') {
  return `<div class="full-row split-batch-list">${accounts.map(account => {
    const meta = [account.label ? `Label: ${account.label}` : '', account.serialNumber ? `Serial: ${account.serialNumber}` : '', account.method?.name || ''].filter(Boolean).join(' · ');
    return `<div class="split-batch-row" data-split-batch-account="${Number(account.id)}">
      <div class="split-batch-account"><b>${escapeHtml(account.accountNumber || '-')}</b><small>${escapeHtml(meta)}</small></div>
      <div class="split-batch-value"><label>Amount</label><input name="${prefix}Amount_${Number(account.id)}" data-split-batch-amount="${Number(account.id)}" type="number" min="0" step="0.01" value="${escapeAttr(amounts.get(Number(account.id)) || '')}" /></div>
      <div class="split-batch-value compact"><label>Charge / Commission</label><input name="${prefix}Charge_${Number(account.id)}" data-split-batch-charge="${Number(account.id)}" type="number" min="0" step="0.01" placeholder="Auto" /></div>
    </div>`;
  }).join('')}</div>`;
}

function collectSplitBatchItems(form, accounts=[], direction='receive') {
  return accounts.sort(paymentAccountBatchSort).map(account => {
    const amountInput = form.querySelector(`[data-split-batch-amount="${Number(account.id)}"]`);
    const chargeInput = form.querySelector(`[data-split-batch-charge="${Number(account.id)}"]`);
    const amount = Number(amountInput?.value || 0);
    return {
      paymentAccountId: Number(account.id),
      direction,
      amount,
      actualCharge: chargeInput && String(chargeInput.value || '').trim() !== '' ? Number(chargeInput.value) : null
    };
  }).filter(item => item.amount > 0);
}

async function openPaymentSplitActionModal(order, finalAction) {
  const label = finalAction === 'paid_mark' ? 'Mark as Paid' : finalAction === 'quick_release' ? 'Quick Release' : 'Release Coin';
  const direction = String(order.type || '').toUpperCase() === 'BUY' ? 'send' : 'receive';
  const viewerSummary = orderViewerSummary(order);
  let workingOrder = order;
  let currentRemaining = Math.max(0, Number(viewerSummary.viewerRemaining || 0));
  const proofRequired = order.settings?.paymentSplitProofRequired !== false;
  let accounts = [];
  const canUseAccounts = hasPerm('accounts.view') && hasPerm('accounts.use');
  if (canUseAccounts) {
    try {
      const response = await api('/api/payment-accounts?paymentMethodId=' + encodeURIComponent(order.paymentMethodId || ''));
      accounts = (response.items || []).filter(account => account.status === 'active' && accountMatchesOrderMethod(account, order)).sort(paymentAccountBatchSort);
    } catch (_) { accounts = []; }
  }
  const selectedAccounts = selectedPaymentAccountsForSplit(order, accounts);
  const batchMode = selectedAccounts.length > 1;
  const selectedAccountId = Number(selectedAccounts[0]?.id || order.selectedPaymentAccountId || order.selectedPaymentAccount?.id || accounts[0]?.id || 0);
  const batchAmounts = splitBatchSuggestedAmounts(selectedAccounts, direction, currentRemaining);
  const accountField = !canUseAccounts
    ? '<div class="full-row notice">You do not have permission to use a payment account.</div>'
    : batchMode
      ? `<div class="full-row notice"><b>${selectedAccounts.length} selected payment numbers</b><br/><small>Amounts are shown in Label / Serial order. Only rows with an amount greater than zero will be saved.</small></div>${splitBatchRowsHtml(selectedAccounts, batchAmounts, 'finalSplit')}`
      : `<div class="full-row"><label>Payment Account</label><select name="paymentAccountId" ${accounts.length ? '' : 'disabled'}>${accounts.map(account => `<option value="${Number(account.id)}" ${Number(account.id) === selectedAccountId ? 'selected' : ''}>${escapeHtml(account.accountNumber || '')} · ${escapeHtml([account.label, account.serialNumber].filter(Boolean).join(' · '))} · ${money(direction === 'send' ? account.sendAvailable : account.receiveAvailable)} available</option>`).join('')}</select>${accounts.length ? '' : '<small class="danger-text">No assigned payment account is available.</small>'}</div>
        <div class="full-row"><label>Amount</label><input name="amount" type="number" min="0" step="0.01" value="${escapeAttr(currentRemaining)}" /></div>
        <div><label>Actual Charge / Commission (Optional)</label><input name="actualCharge" type="number" min="0" step="0.01" placeholder="Uses account rule when empty" /></div>`;
  const relevantExisting = (order.paymentSplits || []).filter(split => split.direction === direction && Number(split.actualAmount || 0) > 0);
  const readyExisting = relevantExisting.filter(split => !proofRequired || split.hasProof);
  modal('Payment Split', `<div class="payment-split-action-summary"><span>${viewerSummary.isScoped ? 'Your Assigned Amount' : 'Order Amount'}</span><b>${money(viewerSummary.assignedAmount)}</b><small>${order.type === 'BUY' ? 'Payment' : 'Received'} · Remaining ${money(currentRemaining)}</small></div>
    <form id="paymentSplitActionForm" class="form-grid">
      <input type="hidden" name="action" value="${escapeAttr(finalAction)}" />
      <input type="hidden" name="direction" value="${escapeAttr(direction)}" />
      ${accountField}
      <div><label>Transaction ID</label><input name="transactionReference" maxlength="120" placeholder="Optional transaction / reference ID" /></div>
      <div><label>Proof Screenshot · ${proofRequired ? 'Mandatory' : 'Optional'}</label><input type="file" id="paymentSplitActionProof" accept="image/png,image/jpeg,image/webp" /><small>${proofRequired ? 'A proof screenshot is required before the final action.' : 'Proof can be attached, but it is not required.'}</small></div>
      <div class="full-row"><label>Note</label><input name="note" placeholder="Optional note" /></div>
      <div class="full-row" id="paymentSplitActionMessage">${readyExisting.length ? `<div class="okbox">${readyExisting.length} ready split(s) already saved.</div>` : ''}</div>
      <div class="full-row payment-split-action-buttons"><button type="button" class="secondary" id="savePaymentSplitActionBtn">Save Split</button><button type="button" class="success" id="submitPaymentFinalActionBtn">Continue to ${escapeHtml(label)}</button></div>
    </form>`);

  const form = $('#paymentSplitActionForm');
  const saveButton = $('#savePaymentSplitActionBtn');
  const finalButton = $('#submitPaymentFinalActionBtn');

  const relevantWorkingSplits = () => (workingOrder.paymentSplits || []).filter(split => split.direction === direction && Number(split.actualAmount || 0) > 0);
  const splitsReadyForFinalAction = () => {
    const splits = relevantWorkingSplits();
    return splits.length > 0 && (!proofRequired || splits.every(split => split.hasProof));
  };

  const attachProofToOneExistingSplitIfPossible = async (proof, reference, note) => {
    const missing = relevantWorkingSplits().filter(split => proofRequired ? !split.hasProof : false);
    if (!proof || missing.length !== 1 || !missing[0].viewerCanEdit) return false;
    const target = missing[0];
    const payload = {
      amount: Number(target.actualAmount || target.plannedAmount || 0),
      status: target.status || 'completed',
      transactionReference: reference || target.transactionReference || '',
      note: note || target.note || '',
      screenshotDataUrl: await toDataUrl(proof)
    };
    workingOrder = await api('/api/splits/' + target.id, { method:'PATCH', body: JSON.stringify(payload) });
    state.currentOrder = workingOrder;
    return true;
  };

  const saveSplit = async ({ silent = false } = {}) => {
    const obj = formObj(form);
    const proof = $('#paymentSplitActionProof')?.files?.[0];
    const reference = String(obj.transactionReference || '').trim();
    const note = obj.note || '';
    const proofDataUrl = proof ? await toDataUrl(proof) : '';
    let hasNewAmount = false;
    if (batchMode) {
      const items = collectSplitBatchItems(form, selectedAccounts, direction);
      hasNewAmount = items.length > 0;
      if (items.length) {
        const payload = { direction, items, transactionReference: reference, note };
        if (proofDataUrl) payload.screenshotDataUrl = proofDataUrl;
        workingOrder = await api(`/api/orders/${order.id}/splits-batch`, { method:'POST', body: JSON.stringify(payload) });
      }
    } else {
      const amount = Number(obj.amount || 0);
      hasNewAmount = amount > 0;
      if (amount > 0) {
        if (canUseAccounts && !Number(obj.paymentAccountId || 0)) throw new Error('Select an active payment account.');
        const payload = { direction, amount, actualCharge: obj.actualCharge, transactionReference: reference, note };
        if (Number(obj.paymentAccountId || 0)) payload.paymentAccountId = Number(obj.paymentAccountId);
        if (proofDataUrl) payload.screenshotDataUrl = proofDataUrl;
        workingOrder = await api(`/api/orders/${order.id}/splits`, { method:'POST', body: JSON.stringify(payload) });
      }
    }
    if (!hasNewAmount) {
      const attached = await attachProofToOneExistingSplitIfPossible(proof, reference, note);
      if (!attached && !relevantWorkingSplits().length) throw new Error('Enter an amount for at least one Payment Split.');
      if (!attached && proofRequired && relevantWorkingSplits().some(split => !split.hasProof)) throw new Error('Attach proof by editing each split that is missing a screenshot.');
    }
    state.currentOrder = workingOrder;
    currentRemaining = Number(orderViewerSummary(workingOrder).viewerRemaining || 0);
    if (!batchMode && form.elements.amount) form.elements.amount.value = currentRemaining;
    if (form.elements.transactionReference) form.elements.transactionReference.value = '';
    if ($('#paymentSplitActionProof')) $('#paymentSplitActionProof').value = '';
    setFormMessage('#paymentSplitActionMessage', `Payment Split saved. Remaining ${money(currentRemaining)}.`, 'ok');
    if (!silent) notify('Payment Split saved.', 'ok');
    return workingOrder;
  };

  saveButton.onclick = async () => {
    saveButton.disabled = true;
    try { await saveSplit(); }
    catch (err) { setFormMessage('#paymentSplitActionMessage', err.message || 'Payment Split save failed.', 'danger'); }
    finally { saveButton.disabled = false; }
  };

  finalButton.onclick = async () => {
    finalButton.disabled = true;
    saveButton.disabled = true;
    try {
      const reference = String(form.elements.transactionReference?.value || '').trim();
      const proof = $('#paymentSplitActionProof')?.files?.[0];
      const hasEnteredAmount = batchMode
        ? collectSplitBatchItems(form, selectedAccounts, direction).length > 0
        : Number(form.elements.amount?.value || 0) > 0;
      if (hasEnteredAmount || reference || proof) await saveSplit({ silent: true });
      const splits = relevantWorkingSplits();
      if (!splits.length) throw new Error(`Save a Payment Split before ${label}.`);
      if (proofRequired && splits.some(split => !split.hasProof)) throw new Error(`Attach a proof screenshot to every Payment Split before ${label}.`);
      workingOrder.finalActionSplitGate = {
        enabled: true,
        satisfied: true,
        direction,
        relevantSplitCount: splits.length,
        missingProofCount: 0
      };
      state.currentOrder = workingOrder;
      closeModal();
      setTimeout(() => openOrderFinalActionFlow(workingOrder, finalAction), 60);
    } catch (err) {
      setFormMessage('#paymentSplitActionMessage', err.message || `Payment Split is not ready for ${label}.`, 'danger');
    } finally {
      if ($('#submitPaymentFinalActionBtn')) $('#submitPaymentFinalActionBtn').disabled = false;
      if ($('#savePaymentSplitActionBtn')) $('#savePaymentSplitActionBtn').disabled = false;
    }
  };
}

function releaseVerificationRequirementMethod(policy = {}, requirements = null) {
  const configured = String(policy.binanceMethod || 'AUTO').toUpperCase();
  const fields = Array.isArray(requirements?.fields) ? requirements.fields : [];
  const names = new Set(fields.map(field => String(field.name || '').toLowerCase()));
  const authType = String(requirements?.hidden?.authType || '').toUpperCase();
  if (authType === 'FIDO2' || names.has('code') && /fido/i.test(fields.find(field => String(field.name || '').toLowerCase() === 'code')?.label || '')) return 'FIDO2';
  if (authType === 'FUND_PWD' || names.has('code') && /fund|password/i.test(fields.find(field => String(field.name || '').toLowerCase() === 'code')?.label || '')) return 'FUND_PWD';
  if (authType === 'GOOGLE' || names.has('googleverifycode')) return 'GOOGLE';
  if (authType === 'SMS' || names.has('mobileverifycode')) return 'SMS';
  if (names.has('emailverifycode')) return 'EMAIL';
  if (names.has('yubikeyverifycode')) return 'YUBIKEY';
  return configured !== 'AUTO' ? configured : 'AUTO';
}

function releaseVerificationPresentation(policy = {}, requirements = null) {
  const method = releaseVerificationRequirementMethod(policy, requirements);
  const autoChallenge = requirements?.hasSpecificRequirement === true;
  const map = {
    GOOGLE:{ title:'Authenticator App Verification', subtitle:'Enter the 6-digit code generated by the Authenticator App.', fieldLabel:'Authenticator App' },
    SMS:{ title:'SMS Verification', subtitle:'Enter the verification code sent to your mobile number.', fieldLabel:'SMS / Mobile OTP' },
    EMAIL:{ title:'Email Verification', subtitle:'Enter the verification code sent by Binance to your email.', fieldLabel:'Email OTP' },
    FUND_PWD:{ title:'Fund Transfer Password Verification', subtitle:'Enter your Binance Fund Transfer Password. P2PFlow encrypts it with the Binance C2C RSA public key before Release.', fieldLabel:'Fund Transfer Password' },
    FIDO2:{ title:'Passkey / FIDO2 Verification', subtitle:'Use the FIDO2 token or passkey verification data required by Binance for this release.', fieldLabel:'FIDO2 / Passkey' },
    YUBIKEY:{ title:'YubiKey Verification', subtitle:'Enter the YubiKey verification code required by Binance.', fieldLabel:'YubiKey' },
    AUTO:{ title:'Release Verification', subtitle:'Binance verification will be checked securely before the coin is released.', fieldLabel:'Binance verification' }
  };
  return { method, autoChallenge, ...(map[method] || map.AUTO) };
}

function releaseVerificationFieldsForScreen(policy = {}, requirements = null) {
  const method = releaseVerificationRequirementMethod(policy, requirements);
  const configured = String(policy.binanceMethod || 'AUTO').toUpperCase();
  const fields = [];
  const hidden = {};
  const add = (name, label, placeholder, type='text', inputmode='') => fields.push({ name, label, placeholder, type, inputmode });
  if (requirements?.hasSpecificRequirement) {
    Object.assign(hidden, requirements.hidden || {});
    const autoFund = method === 'FUND_PWD' && policy.fundPasswordConfigured;
    for (const field of (requirements.fields || [])) {
      if (method === 'FUND_PWD' && String(field.name || '') === 'code') {
        if (!autoFund) add('fundPassword', 'Fund Transfer Password', 'Enter your Binance Fund Transfer Password', 'password', '');
        hidden.authType = 'FUND_PWD';
        continue;
      }
      add(field.name, field.label || field.name, field.placeholder || 'Required by Binance', field.type || 'text', /google|mobile|email/i.test(field.name || '') ? 'numeric' : '');
    }
    return { method, fields, hidden, autoFund, challengeOverridesPreference:configured !== 'AUTO' && method !== configured };
  }
  if (configured === 'FUND_PWD') {
    hidden.authType = 'FUND_PWD';
    if (policy.fundPasswordConfigured) {
      return { method:'FUND_PWD', fields, hidden, autoFund:true, challengeOverridesPreference:false };
    }
    add('fundPassword', 'Fund Transfer Password', 'Enter your Binance Fund Transfer Password', 'password', '');
    return { method:'FUND_PWD', fields, hidden, autoFund:false, challengeOverridesPreference:false };
  }
  // Non-FUND_PWD methods keep the existing challenge-driven behavior.
  return { method:'AUTO', fields, hidden, autoFund:false, challengeOverridesPreference:false };
}

function releaseVerificationInputHtml(field = {}) {
  const numeric = field.inputmode === 'numeric';
  return `<div class="release-verify-field">
    <label>${escapeHtml(field.label || field.name)}</label>
    <div class="release-verify-input-wrap">
      <input name="${escapeAttr(field.name)}" type="${escapeAttr(field.type || 'text')}" ${numeric ? 'inputmode="numeric"' : ''} autocomplete="${field.type === 'password' ? 'off' : 'one-time-code'}" placeholder="${escapeAttr(field.placeholder || '')}" required />
      <button type="button" class="release-verify-paste" data-release-paste="${escapeAttr(field.name)}">Paste</button>
    </div>
  </div>`;
}

function bindReleaseVerificationPasteButtons(form) {
  form.querySelectorAll('[data-release-paste]').forEach(button => {
    button.onclick = async () => {
      const input = form.elements[button.dataset.releasePaste];
      if (!input) return;
      try {
        const text = await navigator.clipboard.readText();
        input.value = String(text || '').trim();
        input.focus();
      } catch (_) {
        input.focus();
        notify('Clipboard access is unavailable. Paste the code into the field.', 'warn');
      }
    };
  });
}

async function attemptReleaseDirect(order, finalAction='release', options={}) {
  const payload = {
    action: finalAction,
    binanceOrderNumber: order.externalOrderNo || order.orderNo || '',
    payId: Number(order.binancePayId || 0) || '',
    freshVerificationProbe: options.freshVerificationProbe !== false
  };
  if (options.localToken) payload.localVerificationToken = options.localToken;
  try {
    const updated = await api(`/api/orders/${order.id}/complete-action`, { method:'POST', body:JSON.stringify(payload), silent:true });
    if (updated.approvalRequired) {
      notify('Manager approval is required before Release.', 'warn');
      return;
    }
    notify('Coin released successfully.', 'ok');
    applyUpdatedCurrentOrder(updated, order.id);
  } catch (err) {
    if (err?.data?.order && typeof err.data.order === 'object') {
      Object.assign(order, err.data.order);
      state.currentOrder = order;
    }
    if (err?.data?.localVerificationRequired) {
      openReleaseVerificationPage(order, finalAction, { localOnly:true });
      return;
    }
    if (err?.data?.fundPasswordRequired) {
      openReleaseVerificationPage(order, finalAction, { localToken:options.localToken || '' });
      return;
    }
    if (err?.data?.verificationRequired === true && err?.data?.releaseRequirements?.hasSpecificRequirement === true) {
      openReleaseVerificationPage(order, finalAction, { requirements:err.data.releaseRequirements, localToken:options.localToken || '', retryMessage:err?.data?.verificationRejected ? (err.message || 'Verification failed. Enter a fresh code and try again.') : '' });
      return;
    }
    notify(err.message || 'Binance Release failed.', 'danger', 9000);
  }
}

function startReleaseFinalActionFlow(order, finalAction='release') {
  const policy = orderReleaseVerificationPolicy(order);
  // One-screen release: P2PFlow step-up (when configured), saved/manual FUND_PWD,
  // and the final Binance release are chained behind the same Release Coin button.
  if (policy.localVerificationEnabled) return openReleaseVerificationPage(order, finalAction);
  if (String(policy.binanceMethod || 'AUTO').toUpperCase() === 'FUND_PWD' && !policy.fundPasswordConfigured) {
    return openReleaseVerificationPage(order, finalAction);
  }
  return attemptReleaseDirect(order, finalAction, { freshVerificationProbe:true });
}

function openReleaseVerificationPage(order, finalAction='release', options={}) {
  const policy = orderReleaseVerificationPolicy(order);
  const requirements = options.requirements || null;
  const localOnly = options.localOnly === true;
  const presentation = localOnly
    ? { method:'LOCAL', autoChallenge:false, title:'P2PFlow Verification', subtitle:'Complete the configured P2PFlow verification before the Binance release check.', fieldLabel:'P2PFlow verification' }
    : releaseVerificationPresentation(policy, requirements);
  const fieldState = localOnly ? { method:'LOCAL', fields:[], hidden:{}, autoFund:false, challengeOverridesPreference:false } : releaseVerificationFieldsForScreen(policy, requirements);
  const localGateState = { token:String(options.localToken || ''), challengeId:'', method:policy.localPrimary || 'USER_PASSWORD' };
  const localAlreadyVerified = Boolean(localGateState.token);
  const hiddenHtml = Object.entries(fieldState.hidden || {}).map(([key,value]) => `<input type="hidden" name="${escapeAttr(key)}" value="${escapeAttr(value)}" />`).join('');
  const fieldsHtml = fieldState.fields.map(releaseVerificationInputHtml).join('');
  const localHtml = policy.localVerificationEnabled
    ? (localAlreadyVerified ? '' : localFinalActionVerificationPanelHtml(policy))
    : '';
  const submitText = finalAction === 'quick_release' ? 'Quick Release' : 'Release Coin';
  const hasLocalInput = policy.localVerificationEnabled && !localAlreadyVerified;
  const screenTitle = hasLocalInput
    ? (requirements?.hasSpecificRequirement || fieldsHtml ? 'Release Verification' : (policy.localPrimaryLabel || 'P2PFlow Verification'))
    : presentation.title;
  const screenSubtitle = hasLocalInput ? '' : presentation.subtitle;

  modal('Release Verification', `<div class="release-verify-shell release-verify-minimal">
    <div class="release-verify-topbar">
      <button type="button" class="release-verify-nav" data-release-verify-back aria-label="Back">←</button>
      <button type="button" class="release-verify-nav" data-release-verify-close aria-label="Close">×</button>
    </div>
    <div class="release-verify-main">
      <h2>${escapeHtml(screenTitle)}</h2>
      ${screenSubtitle ? `<p class="release-verify-subtitle">${escapeHtml(screenSubtitle)}</p>` : ''}
      <form id="releaseVerificationForm" class="release-verify-form">
        <input type="hidden" name="action" value="${escapeAttr(finalAction)}" />
        <input type="hidden" name="binanceOrderNumber" value="${escapeAttr(order.externalOrderNo || order.orderNo || '')}" />
        <input type="hidden" name="payId" value="${Number(order.binancePayId || 0) || ''}" />
        ${hiddenHtml}
        ${localHtml}
        ${fieldsHtml}
        <div id="releaseVerificationMessage" class="release-inline-message">${options.retryMessage ? `<div class="warn">${escapeHtml(options.retryMessage)}</div>` : ''}</div>
        <button type="submit" class="release-verify-submit">${submitText}</button>
      </form>
    </div>
  </div>`);
  const backdrop = document.querySelector('.modal-backdrop:last-of-type');
  const dialog = backdrop?.querySelector('.modal');
  if (backdrop) backdrop.classList.add('release-verification-backdrop');
  if (dialog) dialog.classList.add('release-verification-modal');
  const form = $('#releaseVerificationForm');
  backdrop?.querySelector('[data-release-verify-back]')?.addEventListener('click', () => closeModal(backdrop));
  backdrop?.querySelector('[data-release-verify-close]')?.addEventListener('click', () => closeModal(backdrop));
  bindReleaseVerificationPasteButtons(form);
  if (policy.localVerificationEnabled && !localAlreadyVerified) bindLocalFinalActionVerification(order, finalAction, policy, localGateState);

  form.onsubmit = async event => {
    event.preventDefault();
    const submit = form.querySelector('.release-verify-submit');
    submit.disabled = true;
    submit.textContent = 'Releasing...';
    setFormMessage('#releaseVerificationMessage', '', '');
    try {
      if (policy.localVerificationEnabled && !localGateState.token) {
        try { await localGateState.verifyNow(); }
        catch { return; }
      }
      if (localOnly) {
        const token = localGateState.token;
        closeModal(backdrop);
        setTimeout(() => attemptReleaseDirect(order, finalAction, { localToken:token, freshVerificationProbe:true }), 40);
        return;
      }
      const payload = formObj(form);
      if (localGateState.token) payload.localVerificationToken = localGateState.token;
      if (!requirements) payload.freshVerificationProbe = true;
      const updated = await api(`/api/orders/${order.id}/complete-action`, { method:'POST', body:JSON.stringify(payload), silent:true });
      if (updated.approvalRequired) {
        setFormMessage('#releaseVerificationMessage', 'Manager approval is required before Release.', 'warn');
        return;
      }
      notify('Coin released successfully.', 'ok');
      closeModal(backdrop);
      applyUpdatedCurrentOrder(updated, order.id);
    } catch (err) {
      if (err?.data?.order && typeof err.data.order === 'object') {
        Object.assign(order, err.data.order);
        state.currentOrder = order;
      }
      if (err?.data?.verificationRequired === true && err?.data?.releaseRequirements?.hasSpecificRequirement === true) {
        const nextRequirements = err.data.releaseRequirements;
        const token = localGateState.token;
        const nextMethod = releaseVerificationRequirementMethod(policy, nextRequirements);
        const sameVerificationScreen = !localOnly && nextMethod === fieldState.method && nextMethod !== 'AUTO';
        if (sameVerificationScreen) {
          const retryMessage = err?.data?.verificationRejected
            ? (err.message || `${releaseVerificationPresentation(policy, nextRequirements).fieldLabel || 'Verification'} was not accepted. Enter a fresh value and try again.`)
            : (err.message || 'Binance requires verification. Enter the required value and try again.');
          setFormMessage('#releaseVerificationMessage', retryMessage, 'danger');
          const firstField = Array.isArray(nextRequirements.fields) ? nextRequirements.fields[0] : null;
          const input = firstField?.name ? form.elements[firstField.name] : null;
          if (input && ['googleVerifyCode','mobileVerifyCode','emailVerifyCode','code','yubikeyVerifyCode'].includes(firstField.name)) input.value = '';
          input?.focus();
          return;
        }
        const retryMessage = err?.data?.verificationRejected ? (err.message || 'Verification failed. Enter a fresh code and try again.') : '';
        closeModal(backdrop);
        setTimeout(() => openReleaseVerificationPage(order, finalAction, { requirements:nextRequirements, localToken:token, retryMessage }), 50);
        return;
      }
      if (err?.data?.fundPasswordRequired) {
        setFormMessage('#releaseVerificationMessage', 'Enter the Binance Fund Transfer Password to continue.', 'warn');
        form.elements.fundPassword?.focus();
        return;
      }
      if (err?.data?.localVerificationRequired) {
        localGateState.token = '';
        if (typeof localGateState.reset === 'function') localGateState.reset();
      }
      const message = String(policy.binanceMethod || 'AUTO').toUpperCase() !== 'AUTO' && err?.data?.releaseRequirements
        ? 'Binance did not accept the configured Release Verification method. Open this Binance API account settings and choose the verification method Binance requires.'
        : (err.message || 'Release verification failed.');
      setFormMessage('#releaseVerificationMessage', message, 'danger');
    } finally {
      if (document.contains(submit)) { submit.disabled = false; submit.textContent = submitText; }
    }
  };
}

function openFinalActionModal(order, finalAction) {
  if (finalAction === 'release' || finalAction === 'quick_release') return startReleaseFinalActionFlow(order, finalAction);
  const label = finalAction === 'complete' ? 'Complete Offline Order' : 'Mark as Paid';
  const liveMode = order.settings?.apiMode === 'live' && order.orderSource !== 'offline' && finalAction !== 'complete';
  const isReleaseAction = false;
  const liveFields = liveMode ? `
    <input type="hidden" name="binanceOrderNumber" value="${escapeAttr(order.externalOrderNo || order.orderNo || '')}" />
    <input type="hidden" name="payId" value="${Number(order.binancePayId || 0) || ''}" />` : '';
  const privilegedDirectDecision = canOverrideOrderAssignmentClient();
  const splitGate = finalActionSplitGateStateForOrder(order, finalAction);
  const directNotice = !splitGate.enabled && finalAction !== 'complete'
    ? 'Payment Split requirement is disabled in Settings. This final action will run directly without opening or requiring a split.'
    : splitGate.satisfied && finalAction !== 'complete'
      ? 'Payment Split is already saved. This page only handles the final Binance action and any verification Binance requires.'
      : privilegedDirectDecision
        ? 'Your effective permissions allow a direct decision. This action will take effect immediately without assignment or a separate approval. Actor, time, action, issues and result will remain in Audit Log.'
        : 'Before final action, the configured split, proof and approval rules will be checked.';
  modal(label, `
    <div class="notice">${directNotice}</div>
    <form id="finalActionForm" class="form-grid">
      <input type="hidden" name="action" value="${finalAction}" />
      ${liveFields}
      <div class="full-row"><label>Note</label><input name="note" /></div>
      <div class="full-row" id="finalActionMessage"></div>
      <div class="full-row"><button class="success" type="submit">${label}</button></div>
    </form>`);


  $('#finalActionForm').onsubmit = async e => {
    e.preventDefault();
    const obj = formObj(e.target);
    try {
      const updated = await api(`/api/orders/${order.id}/complete-action`, { method:'POST', body: JSON.stringify(obj) });
      if (updated.approvalRequired) {
        const issueText = (updated.issues || []).map(i => i.code).join(', ');
        setFormMessage('#finalActionMessage', 'Approval request sent to manager: ' + issueText, 'warn');
        notify('Manager approval required. Request added to Approval Queue.', 'warn');
        setTimeout(() => { closeModal(); if (state.page === 'orders' && Number(state.currentOrderId || 0) === Number(order.id || 0)) refreshCurrentOrderStateNonDestructive().catch(()=>{}); }, 600);
        return;
      }
      notify(liveMode ? 'Final action completed with Binance live call.' : 'Final action completed.', 'ok');
      closeModal();
      applyUpdatedCurrentOrder(updated, order.id);
    } catch (err) {
      if (err?.data?.order && typeof err.data.order === 'object') {
        Object.assign(order, err.data.order);
        state.currentOrder = order;
      }
      setFormMessage('#finalActionMessage', err.message || 'Final action failed', 'danger');
    }
  };
}


function openCreateOrderModal(source='binance', credentialOptions = state.orderLiveCredentialOptions || [], selectedCredentialId = state.orderCredentialId || 0) {
  const isOffline = source === 'offline';
  const accountOptions = (credentialOptions || []).filter(option => !option.disabled && Array.isArray(option.permissions) && option.permissions.includes('orders.create'));
  const selectedId = accountOptions.some(option => Number(option.id) === Number(selectedCredentialId))
    ? Number(selectedCredentialId)
    : Number(accountOptions[0]?.id || 0);
  modal(isOffline ? 'Create Offline Order' : 'Create Binance Order', `
    <form id="createOrderForm" class="form-grid">
      <input type="hidden" name="orderSource" value="${isOffline ? 'offline' : 'binance'}" />
      ${isOffline ? '' : `<div class="full-row"><label>Binance Account</label><select name="credentialId" required ${accountOptions.length ? '' : 'disabled'}><option value="">Select account</option>${accountOptions.map(option => `<option value="${Number(option.id)}" ${Number(option.id) === selectedId ? 'selected' : ''}>${escapeHtml(binanceP2pAccountDisplayName(option))}</option>`).join('')}</select>${accountOptions.length ? '' : '<small class="danger-text">No enabled Binance account is assigned with Create Order permission.</small>'}</div>`}
      <div><label>Order No</label><input name="orderNo" value="${isOffline ? 'OFFLINE' : 'BINANCE'}-${Date.now()}" /></div>
      <div><label>Type</label><select name="type"><option value="BUY">BUY / pay out</option><option value="SELL">SELL / receive in</option></select></div>
      <div><label>Fiat Amount (BDT)</label><input name="amount" type="number" value="60000" /></div>
      <div><label>Payment Method</label>${methodSelect()}</div>
      <div><label>Asset / Purpose</label><input name="asset" value="${isOffline ? 'LOCAL_GOODS' : 'USDT'}" /></div>
      <div><label>Dollar/USDT Rate</label><input name="rate" type="number" step="0.01" value="${isOffline ? 1 : 121.50}" /></div>
      <div><label>USDT / Asset Amount</label><input name="assetAmount" type="number" step="0.01" placeholder="auto if empty" /></div>
      <div><label>Payment Time Limit (min)</label><input name="paymentTimeLimitMinutes" type="number" value="15" /></div>
      <div><label>Counterparty</label><input name="counterpartyName" placeholder="Supplier/customer name" /></div>
      <div class="full-row"><label>Note</label><input name="sourceNote" placeholder="Why this order exists" /></div>
      <div class="full-row" id="createOrderMessage"></div>
      <div class="full-row"><button type="submit" ${!isOffline && !accountOptions.length ? 'disabled' : ''}>Create and Auto Assign</button></div>
    </form>`);
  $('#createOrderForm').onsubmit = async e => {
    e.preventDefault();
    const obj = formObj(e.target);
    if (!isOffline) {
      obj.credentialId = Number(obj.credentialId || 0);
      if (!obj.credentialId) return setFormMessage('#createOrderMessage', 'Select the Binance account for this order.', 'danger');
    }
    try {
      const created = await api('/api/orders', { method:'POST', body: JSON.stringify(obj) });
      if (!isOffline) {
        state.orderCredentialId = obj.credentialId;
        localStorage.setItem('crmOrderCredentialId', String(obj.credentialId));
      }
      closeModal();
      setRoute('orders', { orderId: created.id });
    } catch (err) {
      setFormMessage('#createOrderMessage', err.message || 'Order creation failed.', 'danger');
    }
  };
}

function activeAssignmentForUser(order, agentId) {
  return (order.assignments || []).find(a => Number(a.agentId) === Number(agentId) && !['left','completed','partial_completed'].includes(a.status));
}

function plannedForUser(order, agentId, direction, excludeSplitId=null) {
  return (order.paymentSplits || [])
    .filter(s => Number(s.agentId) === Number(agentId) && s.direction === direction && Number(s.id) !== Number(excludeSplitId || 0))
    .reduce((sum, s) => sum + Number(s.plannedAmount || 0), 0);
}

function capacityForAccount(account, direction) {
  if (!account) return 0;
  return direction === 'send' ? Number(account.sendAvailable || 0) : Number(account.receiveAvailable || 0);
}

function splitValidationMessage({order, account, direction, amount, excludeSplitId=null}) {
  if (!account) return 'No active payment account found. Add or activate an account from Payment Accounts first.';
  if (account.status !== 'active') return 'This payment account is not active. Hold or inactive accounts cannot be used in splits.';
  if (amount <= 0) return 'Amount must be greater than 0.';
  const capacity = capacityForAccount(account, direction);
  if (amount > capacity) {
    return direction === 'send'
      ? `Amount is higher than the wallet available balance ${money(capacity)}.`
      : `Amount is higher than the receive limit left ${money(capacity)}.`;
  }
  if (!canOverrideOrderAssignmentClient()) {
    const assignmentAgentId = Number(state.user?.agentId || 0);
    const assignment = activeAssignmentForUser(order, assignmentAgentId);
    if (assignment) {
      const alreadyPlanned = plannedForUser(order, assignment.agentId, direction, excludeSplitId);
      const assignmentLeft = Math.max(0, Number(assignment.assignedAmount || 0) - alreadyPlanned);
      if (amount > assignmentLeft) return `Amount is higher than your assigned remaining ${money(assignmentLeft)}.`;
    } else {
      return 'You are not an assigned user for this order. You do not have split add/update permission.';
    }
  }
  return '';
}

async function openAddSplitModal(order) {
  const accountsResponse = await api('/api/payment-accounts?paymentMethodId=' + encodeURIComponent(order.paymentMethodId || ''));
  const direction = order.type === 'BUY' ? 'send' : 'receive';
  const defaultAmount = defaultSplitAmount(order);
  const activeAccounts = (accountsResponse.items || [])
    .filter(account => account.status === 'active' && accountMatchesOrderMethod(account, order))
    .sort(paymentAccountBatchSort);
  const selectedAccounts = selectedPaymentAccountsForSplit(order, activeAccounts);
  const batchMode = selectedAccounts.length > 1;
  const selectedAccountId = Number(selectedAccounts[0]?.id || order.selectedPaymentAccountId || order.selectedPaymentAccount?.id || activeAccounts[0]?.id || 0);
  const batchAmounts = splitBatchSuggestedAmounts(selectedAccounts, direction, defaultAmount);
  const proofRequired = order.settings?.paymentSplitProofRequired !== false;
  const accountInputHtml = batchMode
    ? `<div class="full-row notice"><b>${selectedAccounts.length} selected payment numbers</b><br/><small>Enter the received / sent amount beside each number. Rows are ordered by Label and Serial.</small></div>${splitBatchRowsHtml(selectedAccounts, batchAmounts, 'addSplit')}`
    : `<div class="full-row"><label>Payment Account</label><select name="paymentAccountId">${activeAccounts.map(account => `<option value="${Number(account.id)}" ${Number(account.id) === selectedAccountId ? 'selected' : ''}>${escapeHtml(account.accountNumber || '')} · ${escapeHtml([account.label, account.serialNumber].filter(Boolean).join(' · '))} · ${escapeHtml(account.method?.name || '')} · ${money(capacityForAccount(account, direction))} available</option>`).join('')}</select></div>
       <div class="full-row"><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" value="${escapeAttr(defaultAmount)}" /></div>
       <div><label>Actual Charge / Commission (Optional)</label><input name="actualCharge" type="number" min="0" step="0.01" placeholder="Uses selected account rule when empty" /></div>`;
  modal('Add Payment Split', `
    <div class="live-remaining" id="addSplitPreview"></div>
    <form id="splitForm" class="form-grid">
      <input type="hidden" name="direction" value="${escapeAttr(direction)}" />
      ${accountInputHtml}
      <div><label>Transaction ID</label><input name="transactionReference" maxlength="120" placeholder="Optional transaction / reference ID" /></div>
      <div><label>Proof Screenshot · ${proofRequired ? 'Mandatory before final action' : 'Optional'}</label><input type="file" id="addProofFile" accept="image/png,image/jpeg,image/webp" /></div>
      <div class="full-row"><label>Note</label><input name="note" placeholder="Optional" /></div>
      <div class="full-row" id="splitFormMessage"></div>
      <div class="full-row"><button type="submit">Save</button></div>
    </form>
    <section class="split-modal-history">
      <div class="section-head"><h3>Payment Split History</h3><span>${(order.paymentSplits || []).length} entries</span></div>
      ${(order.paymentSplits || []).length ? `<div class="split-list">${[...(order.paymentSplits || [])].reverse().map(renderSplit).join('')}</div>` : '<div class="empty-state small">No payment split history yet.</div>'}
    </section>`);
  const splitModal = [...document.querySelectorAll('.modal-backdrop')].at(-1);
  splitModal?.querySelectorAll('[data-update-split]').forEach(button => button.onclick = () => {
    closeModal();
    openUpdateSplitModal(order, Number(button.dataset.updateSplit));
  });
  splitModal?.querySelectorAll('[data-delete-split]').forEach(button => button.onclick = () => deletePaymentSplit(order, Number(button.dataset.deleteSplit)));
  const form = $('#splitForm');
  const accountSelect = form.querySelector('select[name="paymentAccountId"]');
  const amountInput = form.querySelector('input[name="amount"]');
  const getSelectedAccount = () => activeAccounts.find(account => Number(account.id) === Number(accountSelect?.value));
  const updateAddPreview = () => {
    let added = 0;
    let msg = '';
    if (batchMode) {
      const items = collectSplitBatchItems(form, selectedAccounts, direction);
      added = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      for (const item of items) {
        const account = selectedAccounts.find(row => Number(row.id) === Number(item.paymentAccountId));
        const rowMessage = splitValidationMessage({ order, account, direction, amount: Number(item.amount || 0) });
        if (rowMessage) { msg = `${account?.accountNumber || 'Payment account'}: ${rowMessage}`; break; }
      }
      if (!items.length) msg = 'Enter an amount beside at least one selected payment number.';
    } else {
      const account = getSelectedAccount();
      const amount = Number(amountInput?.value || 0);
      added = Math.max(0, amount);
      msg = splitValidationMessage({ order, account, direction, amount });
    }
    const projectedActual = Number(order.summary.relevantActual || 0) + added;
    const projectedRemaining = Math.max(0, Number(order.amount || 0) - projectedActual);
    $('#addSplitPreview').innerHTML = `<b>Selected:</b> ${money(added)} · <b>Remaining:</b> ${money(projectedRemaining)}`;
    setFormMessage('#splitFormMessage', msg, msg ? 'danger' : 'ok');
    setSubmitState(form, !msg, msg);
  };
  form.querySelectorAll('input[data-split-batch-amount], input[data-split-batch-charge], input[name="amount"], select[name="paymentAccountId"]').forEach(control => {
    ['input','change'].forEach(eventName => control.addEventListener(eventName, updateAddPreview));
  });
  updateAddPreview();
  form.onsubmit = async event => {
    event.preventDefault();
    try {
      const obj = formObj(form);
      const proof = $('#addProofFile')?.files?.[0];
      const proofDataUrl = proof ? await toDataUrl(proof) : '';
      let updated;
      if (batchMode) {
        const items = collectSplitBatchItems(form, selectedAccounts, direction);
        if (!items.length) throw new Error('Enter an amount beside at least one selected payment number.');
        const payload = { direction, items, transactionReference: obj.transactionReference || '', note: obj.note || '' };
        if (proofDataUrl) payload.screenshotDataUrl = proofDataUrl;
        updated = await api(`/api/orders/${order.id}/splits-batch`, { method:'POST', body: JSON.stringify(payload) });
      } else {
        const account = getSelectedAccount();
        const amount = Number(obj.amount || 0);
        const message = splitValidationMessage({ order, account, direction, amount });
        if (message) throw new Error(message);
        obj.direction = direction;
        if (proofDataUrl) obj.screenshotDataUrl = proofDataUrl;
        updated = await api(`/api/orders/${order.id}/splits`, { method:'POST', body: JSON.stringify(obj) });
      }
      notify(batchMode ? 'Payment splits saved.' : 'Payment split saved.', 'ok');
      closeModal();
      applyUpdatedCurrentOrder(updated, order.id);
    } catch (error) {
      setFormMessage('#splitFormMessage', error.message || 'Split save failed', 'danger');
    }
  };
}

async function deletePaymentSplit(order, splitId) {
  const split = (order.paymentSplits || []).find(item => Number(item.id) === Number(splitId));
  if (!split) return notify('Payment split was not found.', 'danger');
  if (!split.viewerCanDelete) return notify('You do not have permission to delete this Payment Split.', 'danger');
  const accountLabel = split.account?.restricted ? 'managed payment account' : (split.account?.accountNumber || 'payment account');
  const confirmed = window.confirm(`Delete this Payment Split?\n\n${accountLabel} · ${money(split.actualAmount)}\n\nThe wallet balance, daily/monthly limit usage and automatic charge/commission will be reversed. Statement and audit history will be kept.`);
  if (!confirmed) return;
  try {
    const updated = await api('/api/splits/' + splitId, { method:'DELETE' });
    notify('Payment split deleted. Balance and limits were restored.', 'ok');
    closeModal();
    applyUpdatedCurrentOrder(updated, order.id);
  } catch (err) {
    notify(err.message || 'Payment split delete failed.', 'danger');
  }
}

function openUpdateSplitModal(order, splitId) {
  const split = (order.paymentSplits || []).find(s => Number(s.id) === Number(splitId));
  if (!split) return notify('Payment split was not found.', 'danger');
  if (!split.viewerCanEdit) return notify('You do not have permission to edit this Payment Split.', 'danger');
  const relevant = split.direction === (order.type === 'BUY' ? 'send' : 'receive');
  const currentActual = Number(split.actualAmount || 0);
  const account = split.account || {};
  const direction = split.direction;
  const preserveManualAdjustment = split.transactionChargeMode === 'manual' || split.transactionChargeSource === 'manual_actual';
  const accountLabel = account.restricted ? 'Managed payment account' : (account.accountNumber || 'Payment account');
  modal('Edit Payment Split', `
    <div class="kv"><b>Account</b><span>${escapeHtml(accountLabel)}</span><b>Current Amount</b><span>${money(split.actualAmount)}</span></div>
    ${split.hasProof && safeWebUrl(split.proofUrl) ? `<div class="okbox"><a href="${escapeAttr(safeWebUrl(split.proofUrl))}" target="_blank" rel="noopener noreferrer">Existing proof attached</a></div>` : '<div class="notice">Add a proof screenshot or Transaction ID before the final action.</div>'}
    <div class="live-remaining" id="splitPreview"></div>
    <form id="updateSplitForm" class="form-grid">
      <div class="full-row"><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" value="${escapeAttr(split.actualAmount || split.plannedAmount)}" /></div>
      <div><label>Actual Charge / Commission</label><input name="actualCharge" type="number" min="0" step="0.01" value="${preserveManualAdjustment ? escapeAttr(split.transactionChargeAmount || 0) : ''}" placeholder="Leave empty to recalculate account rule" /><small>${preserveManualAdjustment ? 'Current manual value is preserved. Clear it to use the configured rule.' : `Current: ${money(split.transactionChargeAmount || 0)} · leave empty for automatic recalculation.`}</small></div>
      <div><label>Status</label><select name="status"><option value="completed" ${split.status === 'completed' ? 'selected' : ''}>completed</option><option value="partial" ${split.status === 'partial' ? 'selected' : ''}>partial</option><option value="short" ${split.status === 'short' ? 'selected' : ''}>short</option><option value="excess" ${split.status === 'excess' ? 'selected' : ''}>excess</option></select></div>
      <div><label>Transaction ID</label><input name="transactionReference" maxlength="120" value="${escapeAttr(split.transactionReference || '')}" placeholder="Transaction / reference ID" /></div>
      <div><label>Proof Screenshot</label><input type="file" id="proofFile" accept="image/png,image/jpeg,image/webp" /></div>
      <div class="full-row"><label>Note</label><input name="note" value="${escapeAttr(split.note || '')}" /></div>
      <div class="full-row" id="updateSplitMessage"></div>
      <div class="full-row actions between"><button type="submit">Save Changes</button>${split.viewerCanDelete ? '<button type="button" class="danger" id="deleteSplitFromEditBtn">Delete Split</button>' : ''}</div>
    </form>`);
  const form = $('#updateSplitForm');
  const amountInput = form.querySelector('input[name="amount"]');
  const updatePreview = () => {
    const nextActual = Number(amountInput.value || 0);
    const projectedActual = relevant ? (Number(order.summary.relevantActual || 0) - currentActual + nextActual) : Number(order.summary.relevantActual || 0);
    const projectedRemaining = Math.max(0, Number(order.amount || 0) - projectedActual);
    const delta = nextActual - currentActual;
    let msg = '';
    if (nextActual <= 0) msg = 'Amount must be greater than 0. Use Delete Split to remove it.';
    else if (direction === 'send' && delta > 0) {
      const sendLimit = Number(account.sendLimitAvailable ?? account.sendAvailable ?? 0);
      const balance = Number(account.currentBalance ?? 0);
      if (delta > sendLimit + 1e-9) msg = `Extra amount is higher than the send limit left ${money(sendLimit)}.`;
      else if (delta > balance + 1e-9) msg = `Wallet balance is not enough for the extra ${money(delta)}. Available ${money(balance)} before charge.`;
    } else if (direction === 'receive' && delta > 0) {
      const receiveLimit = Number(account.receiveLimitAvailable ?? account.receiveAvailable ?? 0);
      if (delta > receiveLimit + 1e-9) msg = `Extra amount is higher than the receive limit left ${money(receiveLimit)}.`;
    }
    $('#splitPreview').innerHTML = `<b>Remaining:</b> ${money(projectedRemaining)} <span>after save</span>${delta < 0 ? ` · ${money(Math.abs(delta))} limit/balance will be restored` : ''}`;
    setFormMessage('#updateSplitMessage', msg || 'Ready to save. Only the difference will adjust balance and limits.', msg ? 'danger' : 'ok');
    setSubmitState(form, !msg, msg);
  };
  amountInput.addEventListener('input', updatePreview);
  updatePreview();
  const deleteButton = $('#deleteSplitFromEditBtn');
  if (deleteButton) deleteButton.onclick = () => deletePaymentSplit(order, splitId);
  form.onsubmit = async e => {
    e.preventDefault();
    const obj = formObj(e.target);
    const nextActual = Number(obj.amount || 0);
    if (nextActual <= 0) {
      const msg = 'Amount must be greater than 0. Use Delete Split to remove it.';
      setFormMessage('#updateSplitMessage', msg, 'danger'); notify(msg, 'danger'); return;
    }
    try {
      const file = $('#proofFile').files[0];
      if (file) obj.screenshotDataUrl = await toDataUrl(file);
      const updated = await api('/api/splits/' + splitId, { method:'PATCH', body: JSON.stringify(obj) });
      notify('Payment split updated. Balance and limits were recalculated.', 'ok');
      closeModal();
      applyUpdatedCurrentOrder(updated, order.id);
    } catch (err) { setFormMessage('#updateSplitMessage', err.message || 'Payment split update failed', 'danger'); }
  };
}

function openCoAgentDoneModal(order, assignment = null) {
  const a = assignment || currentUserOrderAssignment(order);
  if (!a) return notify('Active co-agent assignment was not found.', 'danger');
  const assigned = Number(a.assignedAmount || 0);
  const actualDefault = Math.max(0, assigned - Number(a.actualAmount || 0)) || assigned;
  const proofRequired = order.settings?.paymentSplitProofRequired !== false;
  modal('Payment Split', `<div class="payment-split-action-summary"><span>Assigned Amount</span><b>${money(assigned)}</b><small>${escapeHtml(a.agent?.name || state.user?.name || 'Co-agent')} · ${escapeHtml(order.type === 'BUY' ? 'Payment' : 'Received')}</small></div>
    <div class="notice">Enter the completed amount. Proof is ${proofRequired ? 'mandatory' : 'optional'}.</div>
    <form id="coAgentDoneForm" class="form-grid">
      <div><label>Amount</label><input name="actualAmount" type="number" min="0.01" step="0.01" max="${escapeAttr(assigned)}" value="${escapeAttr(actualDefault)}" required /></div>
      <div><label>Actual Charge / Commission (Optional)</label><input name="actualCharge" type="number" min="0" step="0.01" placeholder="Uses account rule when empty" /></div>
      <div><label>Transaction ID</label><input name="transactionReference" maxlength="120" placeholder="Transaction / reference ID" /></div>
      <div class="full-row"><label>Proof Screenshot · ${proofRequired ? 'Mandatory' : 'Optional'}</label><input type="file" id="coAgentDoneProof" accept="image/png,image/jpeg,image/webp" /></div>
      <div class="full-row"><label>Note</label><input name="note" value="My assigned part is completed" /></div>
      <div class="full-row" id="coAgentDoneMessage"></div>
      <div class="full-row"><button class="success" type="submit">Done</button></div>
    </form>`);
  $('#coAgentDoneForm').onsubmit = async event => {
    event.preventDefault();
    const obj = formObj(event.target);
    const proof = $('#coAgentDoneProof')?.files?.[0];
    if (proofRequired && !proof) return setFormMessage('#coAgentDoneMessage', 'Attach a proof screenshot.', 'danger');
    try {
      if (proof) obj.screenshotDataUrl = await toDataUrl(proof);
      if (canOverrideOrderAssignmentClient()) obj.agentId = a.agentId;
      const updated = await api(`/api/orders/${order.id}/complete-agent-task`, { method:'POST', body: JSON.stringify(obj) });
      notify('Co-agent work completed. Remaining and lead payment details updated in realtime.', 'ok');
      closeModal();
      applyUpdatedCurrentOrder(updated, order.id);
    } catch (err) {
      setFormMessage('#coAgentDoneMessage', err.message || 'Done action failed.', 'danger');
    }
  };
}

function openCompleteUserModal(order, agentId) {
  const assignment = (order.assignments || []).find(a => Number(a.agentId) === Number(agentId));
  openCoAgentDoneModal(order, assignment);
}

async function refreshBootstrap() {
  state.bootstrap = await api('/api/bootstrap');
  state.user = state.bootstrap.user;
  state.csrfToken = state.bootstrap.csrfToken;
}

function openCredentialModal() {
  modal('Connect Binance API', `<div class="notice"><b>Automatic connection check</b><br>Enter the API Key and Secret Key. P2PFlow validates the signature builder and performs a live Binance C2C check before saving. The P2P username is detected automatically.</div><form id="credForm" class="form-grid"><div><label>Client Type</label><input name="clientType" value="web" /></div><div class="full-row"><label>API Key</label><input name="apiKey" autocomplete="off" required /></div><div class="full-row"><label>Secret Key</label><input name="secretKey" type="password" autocomplete="new-password" required /></div><div class="full-row" id="credentialConnectMessage"></div><div class="full-row"><button type="submit" id="credentialConnectSubmit">Connect & Save</button></div></form>`);
  $('#credForm').onsubmit = async e => {
    e.preventDefault();
    const button = $('#credentialConnectSubmit');
    if (button) { button.disabled = true; button.textContent = 'Validating & connecting...'; }
    setFormMessage('#credentialConnectMessage', 'Checking Binance API format and live C2C access. The credential will only be saved after the live check succeeds.', 'warn');
    try {
      const result = await api('/api/api-credentials', { method:'POST', body: JSON.stringify(formObj(e.target)) });
      notify(result.p2pUsername ? `Connected as ${result.p2pUsername}.` : 'Binance API connected and saved.', 'ok');
      closeModal();
      await refreshBootstrap();
      renderCredentials();
    } catch (err) {
      setFormMessage('#credentialConnectMessage', err.message || 'Binance API connection failed. The credential was not saved.', 'danger');
    } finally {
      if (button && document.contains(button)) { button.disabled = false; button.textContent = 'Connect & Save'; }
    }
  };
}

function assetFmt(n, asset='USDT') { return `${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${escapeHtml(asset || 'USDT')}`; }
function orderAssetSummaryView(order={}) {
  const round = value => Math.round(Number(value || 0) * 100000000) / 100000000;
  const provided = order.assetSummary || {};
  const type = String(order.type || provided.type || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
  const baseAmount = Math.max(0, Number(order.assetAmount || 0));
  const storedFee = Math.abs(Number(order.assetFee ?? order.commission ?? order.takerCommission ?? 0) || 0);
  const takerAmount = Math.max(0, Number(order.takerAmount || 0));
  let totalQuantity = Math.max(0, Number(provided.totalQuantity ?? order.totalAssetAmount ?? 0));
  let netQuantity = Math.max(0, Number(provided.netQuantity ?? order.netAssetAmount ?? 0));
  let fee = Math.max(0, Number(provided.fee ?? storedFee) || 0);
  if (!totalQuantity && baseAmount) totalQuantity = type === 'SELL' ? baseAmount + fee : baseAmount;
  if (!netQuantity && baseAmount) {
    if (type === 'BUY') netQuantity = takerAmount > 0 && takerAmount <= baseAmount ? takerAmount : Math.max(0, baseAmount - fee);
    else netQuantity = baseAmount;
  }
  if (!fee && totalQuantity >= netQuantity) fee = totalQuantity - netQuantity;
  totalQuantity = round(totalQuantity);
  netQuantity = round(netQuantity);
  fee = round(fee);
  return {
    type,
    totalQuantity,
    netQuantity,
    receiveQuantity: type === 'BUY' ? netQuantity : 0,
    releaseQuantity: type === 'SELL' ? netQuantity : 0,
    fee
  };
}
function assetFeeDisplay(order={}, summary=orderAssetSummaryView(order)) {
  const prefix = String(order.type || '').toUpperCase() === 'BUY' && Number(summary.fee || 0) > 0 ? '-' : '';
  return `${prefix}${assetFmt(summary.fee || 0, order.asset || 'USDT')}`;
}
function orderQuantityBreakdownHtml(order={}, summary=orderAssetSummaryView(order)) {
  const isBuy = String(order.type || '').toUpperCase() === 'BUY';
  const primaryLabel = isBuy ? 'Receive Quantity' : 'Total Quantity';
  const primaryValue = isBuy ? summary.receiveQuantity : summary.totalQuantity;
  const secondaryLabel = isBuy ? 'Total Quantity' : 'Release Quantity';
  const secondaryValue = isBuy ? summary.totalQuantity : summary.releaseQuantity;
  return `<div class="order-asset-breakdown ${isBuy ? 'buy' : 'sell'}">
    <div class="order-asset-primary"><span>${primaryLabel}</span><b>${assetFmt(primaryValue, order.asset)}</b></div>
    <div class="order-asset-branch"><span>${secondaryLabel}</span><b>${assetFmt(secondaryValue, order.asset)}</b></div>
    <div class="order-asset-branch fee"><span>Fee</span><b>${assetFeeDisplay(order, summary)}</b></div>
  </div>`;
}
function countdownText(deadline) {
  if (!deadline) return '-';
  const ms = new Date(deadline).getTime() - Date.now();
  if (!Number.isFinite(ms)) return '-';
  if (ms <= 0) return 'Expired';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
let countdownTick = null;
function stopCountdownTimers() {
  if (countdownTick) clearInterval(countdownTick);
  countdownTick = null;
}
function startCountdownTimers() {
  stopCountdownTimers();
  const update = () => {
    const nodes = $$('[data-countdown]');
    if (!nodes.length) {
      stopCountdownTimers();
      return false;
    }
    nodes.forEach(el => { el.textContent = countdownText(el.dataset.countdown); });
    return true;
  };
  if (!update()) return;
  countdownTick = setInterval(update, 1000);
}
function orderMetaCard(o) {
  return `<div class="card order-mini"><div class="section-head"><h3>Order Time & Rate</h3>${badge(o.externalStatus || o.status, statusClass(o.status))}</div>
    <div class="kv"><b>Created</b><span>${fmt(o.createdAt)}</span><b>Payment Deadline</b><span>${fmt(o.paymentDeadlineAt)}</span><b>Countdown</b><span>${orderCountdownHtml(o, 'b')}</span><b>Dollar/USDT Rate</b><span>${o.orderSource==='offline' ? '-' : money(o.rate)}</span></div></div>`;
}
function settlementCard(o) {
  const assetSummary = orderAssetSummaryView(o);
  const label = o.type === 'BUY' ? 'USDT Receive After Fee' : 'USDT Release / BDT Receive';
  const flow = o.type === 'BUY' ? `Pay ${money(o.fiatAmount || o.amount)} → Receive ${assetFmt(assetSummary.receiveQuantity, o.asset)}` : `Release ${assetFmt(assetSummary.releaseQuantity, o.asset)} → Receive ${money(o.fiatAmount || o.amount)}`;
  const cost = o.type === 'BUY' ? 'Cash Out / Cost' : 'Cash In / Received';
  return `<div class="card order-mini"><div class="section-head"><h3>P2P Amount</h3><span>${escapeHtml(label)}</span></div>
    <div class="big-flow">${flow}</div><div class="kv"><b>Fiat Amount</b><span>${money(o.fiatAmount || o.amount)} ${escapeHtml(o.fiatUnit || 'BDT')}</span><b>Total Quantity</b><span>${assetFmt(assetSummary.totalQuantity, o.asset)}</span><b>${o.type === 'BUY' ? 'Receive Quantity' : 'Release Quantity'}</b><span>${assetFmt(assetSummary.netQuantity, o.asset)}</span><b>Fee</b><span>${assetFeeDisplay(o, assetSummary)}</span><b>${cost}</b><span>${money(o.summary?.relevantActual || 0)} actual</span></div></div>`;
}
function fmtDash(v, suffix='') { return v === null || v === undefined || v === '' ? '-' : `${escapeHtml(v)}${suffix}`; }
function pctDash(v) { return v === null || v === undefined || v === '' ? '' : `${escapeHtml(v)}%`; }
function hasMetric(v) { return !(v === null || v === undefined || v === ''); }
function reviewWord(n) { return Number(n) === 1 ? 'Review' : 'Review(s)'; }
function feedbackScoreHtml(count, rate) {
  const hasCount = hasMetric(count);
  const hasRate = hasMetric(rate);
  if (!hasCount && !hasRate) return '-';
  if (hasCount && hasRate) return `${escapeHtml(count)}<small>${pctDash(rate)}</small>`;
  if (hasCount) return escapeHtml(count);
  return `<small>${pctDash(rate)}</small>`;
}
function feedbackSummaryHtml(c) {
  const total = hasMetric(c.feedbackTotalCount) ? c.feedbackTotalCount : ((hasMetric(c.positiveFeedback) && hasMetric(c.negativeFeedback)) ? Number(c.positiveFeedback) + Number(c.negativeFeedback) : null);
  const rate = hasMetric(c.feedbackRate) ? c.feedbackRate : c.positiveFeedbackRate;
  if (!hasMetric(total) && !hasMetric(rate)) return '';
  return `<div class="feedback-summary-pill"><span>👍</span><b>${hasMetric(rate) ? pctDash(rate) : '-'}</b><em>|</em><b>${hasMetric(total) ? escapeHtml(total) : '-'} ${reviewWord(total)}</b></div>`;
}
function boolText(v) { return v === true ? 'Yes' : v === false ? 'No' : '-'; }
function buySellDisplay(c) {
  const hasBuy = hasMetric(c.buyTrades);
  const hasSell = hasMetric(c.sellTrades);
  if (!hasBuy && !hasSell) return '-';
  return `Buy ${fmtDash(c.buyTrades)} | Sell ${fmtDash(c.sellTrades)}`;
}
function missingProfileFieldsHtml(c) {
  return '';
}
function p2pFeedbackMetricHtml(c) {
  const hasAny = hasMetric(c.feedbackTotalCount) || hasMetric(c.positiveFeedback) || hasMetric(c.negativeFeedback) || hasMetric(c.feedbackRate) || hasMetric(c.positiveFeedbackRate) || hasMetric(c.negativeFeedbackRate);
  if (!hasAny) return '';
  const total = hasMetric(c.feedbackTotalCount) ? c.feedbackTotalCount : ((hasMetric(c.positiveFeedback) && hasMetric(c.negativeFeedback)) ? Number(c.positiveFeedback) + Number(c.negativeFeedback) : null);
  const rate = hasMetric(c.feedbackRate) ? c.feedbackRate : c.positiveFeedbackRate;
  const label = c.lastFeedbackSource === 'chrome_extension_dom' ? 'P2P Feedback' : 'Manual Feedback';
  return `<div class="p2p-feedback-summary"><b>${escapeHtml(label)}</b><span>Positive <strong>${fmtDash(c.positiveFeedback)}</strong></span><span>Negative <strong>${fmtDash(c.negativeFeedback)}</strong></span><span>Total <strong>${fmtDash(total)}</strong></span><span>Rate <strong>${hasMetric(rate) ? pctDash(rate) : '-'}</strong></span></div>`;
}
function p2pLocalWaitState(o, c) {
  const status = String(o?.extensionP2pDataStatus || '').toLowerCase();
  if (['pending','claimed','running'].includes(status)) return 'waiting';
  if (status === 'collected' || c?.lastFeedbackSource === 'chrome_extension_dom' || o?.extensionP2pData) return 'collected';
  return 'idle';
}
function missingTextForState(state) {
  return state === 'waiting' ? '<span class="p2p-waiting">Waiting...</span>' : '<span class="p2p-missing">Missing</span>';
}
function statValue(v, suffix='', opts={}) {
  if (hasMetric(v)) return `${escapeHtml(v)}${suffix}`;
  if (opts.missing) return missingTextForState(opts.state || 'idle');
  return '-';
}
function p2pSocialValue(v, state) { return statValue(v, '', { missing:true, state }); }
function p2pInfoRow(label, valueHtml, sub='') {
  return `<div class="p2p-mobile-row"><span>${escapeHtml(label)}</span><b>${valueHtml}${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</b></div>`;
}
function p2pTabBtn(label, tab, activeTab, extra='') {
  const active = tab === activeTab;
  return `<button type="button" class="p2p-tab-btn ${active ? 'active' : ''}" data-p2p-info-tab="${escapeAttr(tab)}">${escapeHtml(label)}${extra ? ` ${extra}` : ''}</button>`;
}
function p2pFeedbackTypeBtn(label, type, activeType, count) {
  const active = type === activeType;
  return `<button type="button" class="p2p-feedback-type ${active ? 'active' : ''} ${type}" data-p2p-feedback-tab="${escapeAttr(type)}">${escapeHtml(label)} (${fmtDash(count)})</button>`;
}
function setP2pInfoTab(tab) {
  state.p2pInfoTab = tab === 'feedback' ? 'feedback' : (tab === 'ads' ? 'ads' : 'info');
  if (state.p2pInfoTab === 'feedback' && !['negative','positive'].includes(state.p2pFeedbackTab)) state.p2pFeedbackTab = 'negative';
  if (state.p2pInfoTab === 'feedback') state.p2pFeedbackTab = 'negative';
  if (state.currentOrder) renderP2pInfoIntoModal(state.currentOrder);
}
function setP2pFeedbackTab(type) {
  state.p2pInfoTab = 'feedback';
  state.p2pFeedbackTab = type === 'positive' ? 'positive' : 'negative';
  if (state.currentOrder) renderP2pInfoIntoModal(state.currentOrder);
}

function numberLikeForP2p(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const m = String(v).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function percentLikeForP2p(v) {
  const n = numberLikeForP2p(v);
  if (n === null) return null;
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  return Math.round(pct * 100) / 100;
}
function secondsToMinuteLikeForP2p(v) {
  const n = numberLikeForP2p(v);
  if (n === null) return null;
  return Math.round((n / 60) * 100) / 100;
}
function firstP2pMetric(sources, keys, transform = null) {
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    for (const key of keys) {
      if (src[key] !== null && src[key] !== undefined && src[key] !== '') {
        return transform ? transform(src[key]) : src[key];
      }
    }
  }
  return null;
}
function displayCounterpartyStats(o = {}) {
  const base = { ...(o.counterpartyStats || {}) };
  const raw = o.currentCounterpartyStats || o.currentCounterpartyStatsRaw || o.counterpartyCurrentStats || o.orderCounterpartyStats || {};
  const nestedRaw = raw && typeof raw === 'object' ? (raw.data || raw.orderStatistic?.data || raw.orderStatistic || raw) : {};
  const rawBinance = (() => {
    try {
      const parsed = typeof base.rawBinanceCounterpartyStats === 'string' ? JSON.parse(base.rawBinanceCounterpartyStats) : base.rawBinanceCounterpartyStats;
      return parsed?.orderStatistic?.data || parsed?.orderStatistic || parsed?.data || parsed || {};
    } catch (_) { return {}; }
  })();
  const sources = [base, raw, nestedRaw, rawBinance, o];
  const out = { ...base };
  const fill = (key, keys, transform = null) => {
    if (hasMetric(out[key])) return;
    const v = firstP2pMetric(sources, keys, transform);
    if (v !== null && v !== undefined && v !== '') out[key] = v;
  };
  fill('nickname', ['nickname','nickName','userName','counterpartyName']);
  fill('userNo', ['userNo','counterpartyUserNo','counterPartUserNo','encryptedUserNo','merchantNo','takerUserNo']);
  fill('thirtyDayTradeCount', ['thirtyDayTradeCount','completedOrderNumOfLatest30day','monthOrderCount','completedOrderNumOfLatest30Day'], numberLikeForP2p);
  fill('thirtyDayCompletionRate', ['thirtyDayCompletionRate','finishRateLatest30Day','monthFinishRate','finishRateLatest30day'], percentLikeForP2p);
  fill('avgReleaseTimeMinutes30d', ['avgReleaseTimeMinutes30d'], numberLikeForP2p);
  if (!hasMetric(out.avgReleaseTimeMinutes30d)) fill('avgReleaseTimeMinutes30d', ['avgReleaseTimeOfLatest30day','avgReleaseTimeLatest30Day','avgReleaseTime'], secondsToMinuteLikeForP2p);
  fill('avgPayTimeMinutes30d', ['avgPayTimeMinutes30d'], numberLikeForP2p);
  if (!hasMetric(out.avgPayTimeMinutes30d)) fill('avgPayTimeMinutes30d', ['avgPayTimeOfLatest30day','avgPayTimeLatest30Day','avgPayTime'], secondsToMinuteLikeForP2p);
  fill('registeredDays', ['registeredDays','registerDays'], numberLikeForP2p);
  fill('registerDays', ['registerDays','registeredDays'], numberLikeForP2p);
  fill('allTrades', ['allTrades','totalTradeCount','completedOrderNum','orderCount'], numberLikeForP2p);
  fill('totalTradeCount', ['totalTradeCount','completedOrderNum','allTrades','orderCount'], numberLikeForP2p);
  fill('buyTrades', ['buyTrades','completedBuyOrderNum','totalBuy','buyCount'], numberLikeForP2p);
  fill('sellTrades', ['sellTrades','completedSellOrderNum','totalSell','sellCount'], numberLikeForP2p);
  fill('firstTradeDays', ['firstTradeDays','firstOrderDays'], numberLikeForP2p);
  fill('tradingCounterparties', ['tradingCounterparties','counterpartyCount','counterpartyNum','counterpartyNumber'], numberLikeForP2p);
  fill('followersCount', ['followersCount','followerCount','followers','fansCount'], numberLikeForP2p);
  fill('followingCount', ['followingCount','following','followCount'], numberLikeForP2p);
  fill('adsCount', ['adsCount','adCount','advCount','advertisementCount'], numberLikeForP2p);
  fill('tradeTypeLabel', ['tradeTypeLabel','tradeType','userTradeType']);
  fill('online', ['online','isOnline','onlineStatus']);
  fill('verified', ['verified','kycVerified','kycPassed']);
  if (!Array.isArray(out.feedbackComments)) out.feedbackComments = [];
  return out;
}
function counterpartyCard(o) {
  const c = displayCounterpartyStats(o || {});
  const comments = Array.isArray(c.feedbackComments) ? c.feedbackComments : [];
  const positive = comments.filter(x => x.type === 'positive').slice(0, 50);
  const negative = comments.filter(x => x.type === 'negative').slice(0, 50);
  const localState = p2pLocalWaitState(o, c);
  const advertiserUrl = String(o.extensionAdvertiserUrl || o.manualFeedbackUrl || '').trim();
  const manualBtn = `<button type="button" class="ghost mini" data-open-counterparty-feedback="${Number(o.id || 0)}" ${safeBinanceUrl(advertiserUrl, '') ? '' : 'disabled'}>Open Feedback Page</button>`;
  const nick = c.nickname || o.counterpartyName || '-';
  const following = p2pSocialValue(c.followingCount, localState);
  const followers = p2pSocialValue(c.followersCount, localState);
  const ads = p2pSocialValue(c.adsCount, localState);
  const verified = c.verified === true || c.kycVerified === true ? 'Verified' : (c.verified === false || c.kycVerified === false ? 'Unverified' : (localState === 'waiting' ? 'Waiting...' : 'Verified user'));
  const feedbackTotal = hasMetric(c.feedbackTotalCount) ? c.feedbackTotalCount : ((hasMetric(c.positiveFeedback) && hasMetric(c.negativeFeedback)) ? Number(c.positiveFeedback) + Number(c.negativeFeedback) : null);
  const activeTab = ['info','ads','feedback'].includes(state.p2pInfoTab) ? state.p2pInfoTab : 'info';
  const activeFeedback = state.p2pFeedbackTab === 'positive' ? 'positive' : 'negative';
  const feedbackExtra = hasMetric(feedbackTotal) ? `(${feedbackTotal})` : `(${localState === 'waiting' ? 'Waiting' : 'Missing'})`;
  const adsTabExtra = hasMetric(c.adsCount) ? `(${c.adsCount})` : `(${localState === 'waiting' ? 'Waiting' : 'Missing'})`; 
  const allTradesMain = hasMetric(c.allTrades) ? `${escapeHtml(c.allTrades)} Time(s)` : statValue(c.allTrades, '', { missing:true, state: localState });
  const buySellSub = hasMetric(c.buyTrades) || hasMetric(c.sellTrades) ? `Buy ${fmtDash(c.buyTrades)} | Sell ${fmtDash(c.sellTrades)}` : (localState === 'waiting' ? 'Waiting...' : 'Missing');
  const riskLine = c.riskDepositMessage ? `<div class="p2p-risk-note"><b>Binance Risk Management</b><span>${escapeHtml(c.riskDepositMessage)}</span></div>` : '';
  const infoContent = `<div class="p2p-mobile-info">
      ${p2pInfoRow('30d Trades', statValue(c.thirtyDayTradeCount))}
      ${p2pInfoRow('30d Completion Rate', statValue(c.thirtyDayCompletionRate, '%'))}
      ${p2pInfoRow('Avg. Release Time', statValue(c.avgReleaseTimeMinutes30d, ' Minute(s)'))}
      ${p2pInfoRow('Avg. Pay Time', statValue(c.avgPayTimeMinutes30d, ' Minute(s)'))}
    </div>
    <div class="p2p-mobile-info p2p-mobile-info-secondary">
      ${p2pInfoRow('Trade Type', escapeHtml(c.tradeTypeLabel || '-'))}
      ${p2pInfoRow('Registered', statValue(c.registeredDays ?? c.registerDays, ' Day(s) ago'))}
      ${p2pInfoRow('First Trade', statValue(c.firstTradeDays, ' Day(s) ago', { missing:true, state: localState }))}
      ${p2pInfoRow('Trading Counterparties', statValue(c.tradingCounterparties, '', { missing:true, state: localState }))}
      ${p2pInfoRow('All Trades', allTradesMain, buySellSub)}
      ${p2pInfoRow('User No', escapeHtml(c.userNo || '-'))}
      ${p2pInfoRow('Online', boolText(c.online))}
    </div>
    ${riskLine}`;
  const adsContent = `<div class="p2p-mobile-info p2p-mobile-info-secondary">
      ${p2pInfoRow('Ads', ads)}
      ${p2pInfoRow('Following', following)}
      ${p2pInfoRow('Followers', followers)}
      ${p2pInfoRow('Verified', escapeHtml(verified))}
    </div>`;
  const activeList = activeFeedback === 'positive' ? positive : negative;
  const feedbackContent = `<div class="p2p-mobile-feedback-only">
      ${p2pFeedbackMetricHtml(c) || (localState === 'waiting' ? '<div class="p2p-feedback-summary"><b>P2P Feedback</b><span>Collecting <strong>Waiting...</strong></span></div>' : '<div class="p2p-feedback-summary"><b>P2P Feedback</b><span>Status <strong>Missing</strong></span></div>')}
      <div class="p2p-feedback-type-tabs">
        ${p2pFeedbackTypeBtn('Negative', 'negative', activeFeedback, c.negativeFeedback)}
        ${p2pFeedbackTypeBtn('Positive', 'positive', activeFeedback, c.positiveFeedback)}
      </div>
      ${feedbackList(`${activeFeedback === 'positive' ? 'Positive' : 'Negative'} Feedback (${fmtDash(activeFeedback === 'positive' ? c.positiveFeedback : c.negativeFeedback)})`, activeList, activeFeedback)}
    </div>`;
  const tabContent = activeTab === 'feedback' ? feedbackContent : (activeTab === 'ads' ? adsContent : infoContent);
  return `<div class="card order-mini counterparty-card p2p-mobile-card">
    <div class="p2p-mobile-top-actions">${manualBtn}</div>
    <div class="p2p-mobile-head">
      <h2>${escapeHtml(nick)}</h2>
      <div class="p2p-mobile-subline"><span>${escapeHtml(verified)}</span><em></em><span>${following} Following</span><em></em><span>${followers} Followers</span></div>
    </div>
    <div class="p2p-mobile-tabs">
      ${p2pTabBtn('Info', 'info', activeTab)}
      ${p2pTabBtn('Ads', 'ads', activeTab, adsTabExtra)}
      ${p2pTabBtn('Feedback', 'feedback', activeTab, feedbackExtra)}
    </div>
    ${tabContent}
    <div class="counterparty-sync-line p2p-clean-sync"><span>Stats sync: ${escapeHtml(fmt(c.syncedAt || o.lastCounterpartySyncedAt || ''))}</span>${o.lastCounterpartyStatsError ? `<b class="danger-text">${escapeHtml(o.lastCounterpartyStatsError)}</b>` : ''}</div>
  </div>`;
}

function feedbackList(title, list, cls) {
  return `<div class="feedback-panel ${cls}"><h4>${escapeHtml(title)}</h4>${list.length ? list.map(x => `<div class="feedback-comment"><b>${escapeHtml(x.by || 'P2P user')}</b><p>${escapeHtml(x.text || '')}</p><small>${escapeHtml([x.date, x.paymentMethod].filter(Boolean).join(' • '))}</small></div>`).join('') : '<div class="sub">No comment yet.</div>'}</div>`;
}

function feedbackPromptValue(label, currentValue) {
  const text = prompt(label, currentValue === null || currentValue === undefined || currentValue === '' ? '' : String(currentValue));
  if (text === null) return { cancelled: true };
  const trimmed = text.trim();
  return { cancelled: false, value: trimmed === '' ? null : Number(trimmed.replace(/%/g, '')) };
}

async function editCounterpartyFeedback(orderId) {
  const o = state.currentOrder && Number(state.currentOrder.id) === Number(orderId) ? state.currentOrder : null;
  const c = (o && o.counterpartyStats) || {};
  const p = feedbackPromptValue('Manual positive feedback count (blank = empty)', c.positiveFeedback);
  if (p.cancelled) return;
  const n = feedbackPromptValue('Manual negative feedback count (blank = empty)', c.negativeFeedback);
  if (n.cancelled) return;
  const t = feedbackPromptValue('Manual total feedback / review count (blank = auto)', c.feedbackTotalCount);
  if (t.cancelled) return;
  const pr = feedbackPromptValue('Manual positive feedback rate % (blank = empty)', c.positiveFeedbackRate || c.feedbackRate);
  if (pr.cancelled) return;
  const nr = feedbackPromptValue('Manual negative feedback rate % (blank = auto from positive rate, or empty)', c.negativeFeedbackRate);
  if (nr.cancelled) return;
  try {
    const updated = await api(`/api/orders/${orderId}/counterparty-feedback-manual`, { method:'POST', body: JSON.stringify({ positiveFeedback: p.value, negativeFeedback: n.value, feedbackTotalCount: t.value, positiveFeedbackRate: pr.value, negativeFeedbackRate: nr.value }) });
    state.currentOrder = updated;
    renderP2pInfoIntoModal(updated);
    notify('Manual feedback saved.', 'ok');
  } catch (err) {
    notify(err.message || 'Could not save manual feedback.', 'danger');
  }
}


function isSellOrderForExtension(o) {
  return String(o?.type || '').toUpperCase() === 'SELL';
}

function p2pExtensionStatusHtml(o) {
  const status = String(o?.extensionP2pDataStatus || '').toLowerCase();
  if (!['pending','claimed','running'].includes(status)) return '';
  return '<div class="p2p-collecting-note">Please wait, collecting missing P2P data...</div>';
}

function openCounterpartyFeedbackPage(orderId) {
  const order = state.currentOrder && Number(state.currentOrder.id) === Number(orderId) ? state.currentOrder : null;
  const rawUrl = String(order?.extensionAdvertiserUrl || order?.manualFeedbackUrl || '').trim();
  if (!safeBinanceUrl(rawUrl, '')) return notify('Advertiser feedback page is not available for this order yet.', 'warn');
  const opened = window.open(rawUrl, '_blank', 'noopener,noreferrer');
  if (!opened) notify('Allow pop-ups for this site, then click Open Feedback Page again.', 'warn');
}

function bindP2pInfoModalActions(box) {
  $$('[data-p2p-info-tab]', box).forEach(button => {
    button.onclick = () => setP2pInfoTab(button.dataset.p2pInfoTab || 'info');
  });
  $$('[data-p2p-feedback-tab]', box).forEach(button => {
    button.onclick = () => setP2pFeedbackTab(button.dataset.p2pFeedbackTab || 'negative');
  });
  $$('[data-open-counterparty-feedback]', box).forEach(button => {
    button.onclick = () => openCounterpartyFeedbackPage(Number(button.dataset.openCounterpartyFeedback || 0));
  });
}

function renderP2pInfoIntoModal(order) {
  const box = document.querySelector('.p2p-info-modal');
  if (!box) return;
  state.currentOrder = order;
  box.innerHTML = p2pExtensionStatusHtml(order) + counterpartyCard(order);
  bindP2pInfoModalActions(box);
}

async function pollP2pExtensionResult(orderId, taskId) {
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i += 1) {
    await new Promise(r => setTimeout(r, i < 5 ? 1500 : 2500));
    if (!document.querySelector('.p2p-info-modal')) return null;
    try {
      const latest = await api(`/api/orders/${orderId}`, { silent:true });
      state.currentOrder = latest;
      renderP2pInfoIntoModal(latest);
      if (latest.extensionP2pDataStatus === 'collected' && (!taskId || Number(latest.extensionP2pDataTaskId) === Number(taskId))) {
        return latest;
      }
      if (latest.extensionP2pDataStatus === 'failed') return latest;
    } catch (_) {}
  }
  return null;
}


function notifyP2pExtensionBridge(task) {
  if (!task || !task.id || !task.advertiserUrl) return;
  const requestId = `p2p_ext_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const handler = (event) => {
    const msg = event.data || {};
    if (event.source !== window || msg.type !== 'P2P_CRM_EXTENSION_ACK' || msg.requestId !== requestId) return;
    window.removeEventListener('message', handler);
  };
  window.addEventListener('message', handler);
  window.postMessage({ type:'P2P_CRM_EXTENSION_COLLECT', requestId, serverUrl: window.location.origin, task }, window.location.origin);
  setTimeout(() => { window.removeEventListener('message', handler); }, 15000);
}

async function requestP2pExtensionOnClick(order) {
  if (!isSellOrderForExtension(order)) return order;
  try {
    const res = await api(`/api/orders/${order.id}/p2p-extension-collect`, { method:'POST', silent:true, body: JSON.stringify({ reason:'p2p_info_click' }) });
    const latest = res.order || order;
    state.currentOrder = latest;
    renderP2pInfoIntoModal(latest);
    if (res.queued && res.task?.id) {
      notifyP2pExtensionBridge(res.task);
      pollP2pExtensionResult(order.id, res.task.id);
    }
    return latest;
  } catch (err) {
    // Keep official counterparty stats visible. Extension/local data is an optional missing-field fallback.
    return order;
  }
}

async function openP2pInfoModal(order) {
  state.p2pInfoTab = 'info';
  state.p2pFeedbackTab = 'negative';
  modal('P2P Info', '<div class="p2p-info-modal"></div>');
  let latest = order;
  state.currentOrder = latest;
  renderP2pInfoIntoModal(latest);

  // Show existing currentCounterpartyStats immediately. Official sync and extension collection run after render.
  (async () => {
    try {
      if (isRealBinanceOrder(order) && hasPerm('binance.sync')) {
        latest = await api(`/api/orders/${order.id}/binance-counterparty`, { method:'POST', silent:true, body: JSON.stringify({ binanceOrderNumber: order.externalOrderNo || order.orderNo }) });
        state.currentOrder = latest;
        renderP2pInfoIntoModal(latest);
      }
    } catch (err) {
      // Keep existing/currentCounterpartyStats visible even if live sync fails.
    }
    await requestP2pExtensionOnClick(state.currentOrder || latest);
  })();
}

function methodSelect(selectedId=null) { return `<select name="paymentMethodId">${state.bootstrap.paymentMethods.map(m => `<option value="${m.id}" ${Number(selectedId)===m.id?'selected':''}>${escapeHtml(m.name)}</option>`).join('')}</select>`; }
function agentSelect(selectedId=null) { return `<select name="agentId">${state.bootstrap.agents.map(a => `<option value="${a.id}" ${Number(selectedId)===a.id?'selected':''}>${escapeHtml(a.name)} (${escapeHtml(a.status)})</option>`).join('')}</select>`; }
function accountStatusSelect(selected='active') { return `<select name="status"><option value="active" ${selected==='active'?'selected':''}>active</option><option value="hold" ${selected==='hold'?'selected':''}>hold</option><option value="inactive" ${selected==='inactive'?'selected':''}>inactive</option></select>`; }
function permissionChecks(selected=[]) { const list = state.bootstrap.permissions || Object.keys(PERMISSION_LABELS); return `<div class="perm-grid">${list.map(permission => permissionOptionHtml(permission, selected.includes(permission))).join('')}</div>`; }
function selectedPermissions(form) { return Array.from(form.querySelectorAll('input[name="permissions"]:checked')).map(x => x.value); }
function defaultSplitAmount(order) {
  const fallback = Number(order.summary?.remaining || order.amount || 0);
  if (isAssignmentScopedClient()) {
    const mine = (order.assignments || []).find(a => Number(a.agentId) === Number(state.user.agentId) && !['left','completed','partial_completed'].includes(a.status));
    if (mine) {
      const left = Math.max(0, Number(mine.assignedAmount || 0) - Number(mine.actualAmount || 0));
      if (left > 0) return left;
    }
  }
  const lead = (order.assignments || []).find(a => Number(a.agentId) === Number(order.leadAgentId) && !['left','completed','partial_completed'].includes(a.status));
  if (lead) {
    const left = Math.max(0, Number(lead.assignedAmount || 0) - Number(lead.actualAmount || 0));
    if (left > 0) return left;
  }
  return fallback;
}

function canCompleteUserTask(a) { return canOverrideOrderAssignmentClient() || (isAssignmentScopedClient() && Number(state.user.agentId) === Number(a.agentId) && !['completed','partial_completed','left'].includes(a.status)); }
function agentTaskAction(a, order) {
  if (a.status === 'completed') return '<span class="badge ok">Done</span>';
  if (a.status === 'partial_completed') return '<span class="badge warn">Partial Done</span>';
  if (a.status === 'left') return '<span class="badge danger">Left</span>';
  if (a.role !== 'co_agent' || !canCompleteUserTask(a)) return '-';
  return `<button class="success" data-complete-agent="${a.agentId}">Done</button>`;
}

let modalSequence = 0;
const modalFocusStack = [];
function modalFocusable(dialog) {
  return [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
}
function modal(title, html) {
  const tpl = $('#modalTemplate').content.cloneNode(true);
  const backdrop = tpl.querySelector('.modal-backdrop');
  const dialog = tpl.querySelector('.modal');
  const heading = tpl.querySelector('h3');
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const headingId = `p2pflow-modal-title-${++modalSequence}`;
  heading.id = headingId;
  heading.textContent = title;
  dialog.setAttribute('aria-labelledby', headingId);
  tpl.querySelector('.modal-body').innerHTML = html;
  const record = { backdrop, dialog, previousFocus, keydown: null };
  record.keydown = event => {
    const top = modalFocusStack[modalFocusStack.length - 1];
    if (top !== record) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal(backdrop);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = modalFocusable(dialog);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  tpl.querySelector('.close-modal').onclick = () => closeModal(backdrop);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(backdrop); });
  document.body.appendChild(tpl);
  modalFocusStack.push(record);
  document.addEventListener('keydown', record.keydown);
  document.body.classList.add('modal-open');
  applyLanguage(backdrop);
  requestAnimationFrame(() => (modalFocusable(dialog)[0] || dialog).focus());
}
function closeModal(targetBackdrop = null) {
  const index = targetBackdrop
    ? modalFocusStack.findIndex(record => record.backdrop === targetBackdrop)
    : modalFocusStack.length - 1;
  const record = index >= 0 ? modalFocusStack[index] : null;
  if (record) {
    document.removeEventListener('keydown', record.keydown);
    modalFocusStack.splice(index, 1);
    record.backdrop.remove();
  } else {
    const fallback = document.querySelector('.modal-backdrop:last-of-type');
    if (fallback) fallback.remove();
  }
  document.body.classList.toggle('modal-open', modalFocusStack.length > 0 || Boolean(document.querySelector('.modal-backdrop')));
  const next = modalFocusStack[modalFocusStack.length - 1];
  const restore = next?.dialog || record?.previousFocus;
  if (restore && document.contains(restore) && typeof restore.focus === 'function') requestAnimationFrame(() => restore.focus());
  if (!modalFocusStack.length && typeof closeAdsSheet === 'function') closeAdsSheet();
  if (!modalFocusStack.length && state.pendingAdsRefresh && state.page === 'ads') {
    state.pendingAdsRefresh = false;
    scheduleSmoothRefresh(80);
  }
}

function formObj(form) {
  const obj = Object.fromEntries(new FormData(form));
  for (const k of Object.keys(obj)) {
    if (obj[k] === '') delete obj[k];
    else if (!isNaN(obj[k]) && ['amount','paymentMethodId','agentId','plannedAmount','actualAmount','requiredAmount','priority','currentBalance','dailyReceiveLimit','dailySendLimit','monthlyReceiveLimit','monthlySendLimit','assignedAmount','mismatchTolerance','highAmountApprovalThreshold','activeLockSeconds','maxProofSizeBytes','minOrderAmount','maxOrderAmount','maxActiveOrders','maxReleaseAmount','payId','binancePayId','page','rows','orderStatus','startDate','endDate','activityHeartbeatSeconds','activityIdleAfterSeconds','activityOfflineAfterSeconds','activityRetentionDays','accountingValuationRate','accountingCompanyDollarRate','accountingP2pBuyRate','accountingOpeningCryptoQuantity','accountingOpeningCryptoCostRate','accountingOpeningCapitalUsd','paymentAccountId','ownerUserId'].includes(k)) obj[k] = Number(obj[k]);
  }
  return obj;
}
function toDataUrl(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); }); }

function table(headers, rows) {
  const labels = headers.map(h => String(h).replace(/<[^>]*>/g, ''));
  const rowHtml = rows.length ? rows.map(row => {
    const cells = Array.isArray(row) ? row : (row.cells || []);
    const rowClass = Array.isArray(row) ? '' : cleanClass(row.rowClass || '');
    const openOrderId = Array.isArray(row) ? 0 : Number(row.openOrderId || 0);
    const rowAttrs = openOrderId ? ` data-open-order-card="${openOrderId}" tabindex="0" role="button"` : '';
    return `<tr${rowClass ? ` class="${escapeAttr(rowClass)}"` : ''}${rowAttrs}>${cells.map((c,i) => `<td data-label="${escapeAttr(labels[i] || '')}">${c ?? ''}</td>`).join('')}</tr>`;
  }).join('') : `<tr><td colspan="${headers.length}" class="sub">No data</td></tr>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rowHtml}</tbody></table></div>`;
}
function cleanClass(value='') { return String(value || '').split(/\s+/).filter(x => /^[a-zA-Z0-9_-]+$/.test(x)).join(' '); }
function ledgerBadgeClass(l) {
  if (['send','offline_purchase','expense','settlement_out','refund_out','cashout'].includes(l.type) || l.direction === 'send') return 'danger';
  if (['receive','offline_receive','settlement_in','refund_in','topup','opening'].includes(l.type) || l.direction === 'receive') return 'ok';
  return 'warn';
}
function reportCard(title, rows, action='') {
  return `<div class="report-card"><div class="report-card-head"><b>${escapeHtml(title)}</b>${action ? `<span>${action}</span>` : ''}</div>${rows.map(([k,v]) => `<div class="report-line"><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`).join('')}</div>`;
}
function exportReportCsv(data) {
  const lines = [['Section','Name','Metric','Value']];
  data.byAgent.forEach(a => [['Orders',a.orders],['Completed Splits',a.completedSplits],['BUY Sent',a.buySent],['SELL Received',a.sellReceived],['Leave Count',a.leaveCount],['Login Seconds',a.activity?.loginSeconds||0],['App Open Seconds',a.activity?.openSeconds||0],['Active Seconds',a.activity?.activeSeconds||0],['Engaged Seconds',a.activity?.engagedSeconds||0],['Idle Seconds',a.activity?.idleSeconds||0],['Background Seconds',a.activity?.hiddenSeconds||0],['Audited Actions',a.activity?.actions||0],['Engagement Rate',a.activity?.engagementRate||0]].forEach(([m,v]) => lines.push(['User',a.name,m,v])));
  data.byMethod.forEach(m => [['Accounts',m.accountCount||0],['BUY Sent',m.buySent],['SELL Received',m.sellReceived],['Balance',m.balance],['BUY Capacity',m.buyCapacity],['Receive Capacity',m.sellReceiveCapacity]].forEach(([k,v]) => lines.push(['Payment Account Method',m.name,k,v])));
  data.orders.forEach(o => [['Type',o.type],['Source',o.orderSource||'binance'],['Amount',o.amount],['Status',o.status],['Actual',o.summary.relevantActual],['Difference',o.summary.difference]].forEach(([k,v]) => lines.push(['Order',o.orderNo,k,v])));
  const csv = lines.map(r => r.map(x => '"' + String(x ?? '').replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'p2pflow-digital-report.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function badge(text, cls='') {
  const safeClass = String(cls || '').split(/\s+/).filter(token => /^[a-z0-9_-]{1,40}$/i.test(token)).join(' ');
  return `<span class="badge ${safeClass}">${escapeHtml(String(text || ''))}</span>`;
}
function statusClass(s) { return ['completed','released','paid_marked','success','active','assigned','ready','online'].includes(s) ? 'ok' : ['manager_queue','partial','partial_completed','short','busy','planned','idle','away'].includes(s) ? 'warn' : ['failed','cancelled','left','offline'].includes(s) ? 'danger' : 'blue'; }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(s) { return escapeHtml(s); }
function sumLocal(arr) { return arr.reduce((a,b)=>a+Number(b||0),0); }


async function copyTextFromUi(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try { copied = document.execCommand('copy') === true; } catch {}
  textarea.remove();
  return copied;
}

// Dynamic DOM morphing can replace order-detail buttons. Delegating from the
// document keeps Copy reliable after realtime patches without requiring a page
// reload or rebinding every replacement node.
document.addEventListener('click', async event => {
  const button = event.target?.closest?.('[data-copy-payment-value]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const value = String(button.dataset.copyPaymentValue || '').trim();
  if (!value || button.dataset.copyBusy === '1') return;
  button.dataset.copyBusy = '1';
  try {
    const copied = await copyTextFromUi(value);
    notify(copied ? 'Copied.' : 'Could not copy this value.', copied ? 'ok' : 'warn');
  } finally {
    delete button.dataset.copyBusy;
  }
}, true);

init();
