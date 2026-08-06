// v1.0.167: first-run recovery reuses the saved Application Key and software updates are Owner-only from Control Panel.
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
  orderDetailSyncTimer: null,
  currentOrderReloadTimer: null,
  pendingOpenChatOrderId: null,
  seenOrderEventKeys: new Set(),
  seenOrderSoundKeys: new Set(),
  orderListRefreshTimer: null,
  orderActiveTabs: { ongoing: localStorage.getItem('crmOrderTab:ongoing') || 'all', fulfilled: localStorage.getItem('crmOrderTab:fulfilled') || 'all' },
  reportFilter: { period: 'daily', start: '', end: '' },
  orderGroup: localStorage.getItem('crmOrderGroup') || 'ongoing',
  lang: localStorage.getItem('crmLang') || 'en',
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
  adsSearchTimer: null,
  mobileNavCounts: { orders: 0, chats: 0 },
  mobileNavSyncTimer: null,
  mobileNavSyncBusy: false,
  chatInboxSearch: '',
  chatInboxRefreshTimer: null,
  p2pMarketFilters: { tradeType:'BUY', asset:'USDT', fiat:'BDT', amount:'', payType:'', payTypes:[], publisherType:'', tradableOnly:false, merchantOnly:false, verifiedMerchantOnly:false, noVerificationRequired:false, paymentTime:0, country:'ALL', sortBy:'price', saveFilter:false, page:1, rows:20 },
  p2pMarketData: null,
  p2pMarketLoading: false,
  p2pMarketRefreshTimer: null,
  accountingRefreshTimer: null,
  accountingLoading: false
};

const pages = [
  ['dashboard', 'Dashboard', ['admin','manager','auditor']],
  ['p2p-market', 'P2P Market', ['admin','manager','agent','auditor']],
  ['orders', 'Orders', ['admin','manager','agent','auditor']],
  ['chat', 'P2P Message', ['admin','manager','agent','auditor']],
  ['ads', 'Advertisements', ['admin','manager','agent','auditor']],
  ['approvals', 'Approvals', ['admin','manager']],
  ['accounts', 'Payment Accounts', ['admin','manager','agent','auditor']],
  ['ledger', 'Account Statement', ['admin','manager','auditor']],
  ['agents', 'Users', ['admin','manager','auditor']],
  ['user-roles', 'User Roles', ['admin','manager']],
  ['routing', 'Routing', ['admin','manager']],
  ['reports', 'Reports', ['admin','manager','auditor']],
  ['accounting', 'Accounting Overview', ['admin','manager','agent','auditor']],
  ['accounting-expenses', 'Expense', ['admin','manager','agent','auditor']],
  ['accounting-income', 'Business Income', ['admin','manager','agent','auditor']],
  ['accounting-capital', 'Capital', ['admin','manager','agent','auditor']],
  ['accounting-closing', 'Daily Closing', ['admin','manager','agent','auditor']],
  ['activity', 'Activity Monitor', ['admin','manager','auditor']],
  ['credentials', 'API Credentials', ['admin']],
  ['health', 'Health Check', ['admin','manager']],
  ['system-update', 'System Update', ['admin']],
  ['settings', 'Settings', ['admin','manager']],
  ['p2p-extension', 'Extension Bridge', ['admin','manager']],
  ['security', 'Security', ['admin','manager','agent','auditor']],
  ['notifications', 'Panel SMS / Alerts', ['admin','manager','agent','auditor']],
  ['audit', 'Audit Logs', ['admin','manager','auditor']]
];


const PAGE_PERMISSIONS = {
  dashboard: 'dashboard.view',
  'p2p-market': 'orders.view',
  orders: 'orders.view',
  chat: 'orders.view',
  ads: 'ads.view',
  approvals: 'approvals.manage',
  binance: 'binance.sync',
  accounts: 'accounts.view',
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

function hasPerm(permission) {
  if (!permission) return true;
  if (!state.user) return false;
  if (state.user.role === 'admin') return true;
  return (state.user.permissions || []).includes(permission);
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
  const isImage = (type === 'image' || /\.(png|jpe?g|webp)(\?|$)/i.test(msg)) && /^(https?:\/\/|data:image\/|blob:|\/)/i.test(msg);
  const isVideo = (type === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(msg)) && /^(https?:\/\/|data:video\/|blob:|\/)/i.test(msg);
  const body = isImage
    ? `<button class="chat-image-button" type="button" data-chat-image-src="${escapeAttr(msg)}" aria-label="Open image full screen"><img class="chat-image" src="${escapeAttr(msg)}" alt="Chat image" loading="lazy"></button>`
    : isVideo
      ? `<video class="chat-video" src="${escapeAttr(msg)}" controls playsinline preload="metadata"></video>`
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
  const safeSrc = String(src || '').trim();
  if (!/^(https?:\/\/|data:image\/|blob:|\/)/i.test(safeSrc)) return;
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
function renderChatList(chats=[], source=null) {
  const filtered = source === 'binance'
    ? chats.filter(c => c.source === 'binance' || c.source === 'binance-outbound')
    : (source ? chats.filter(c => c.source === source || (source === 'internal' && !c.source)) : chats);
  const seen = new Set();
  const list = filtered.filter(c => {
    const normalized = normalizeChatDisplayMessage(chatRecordRaw(c), c.messageType || '', { order: state.currentOrder || {} });
    const isBinance = c.source === 'binance' || c.source === 'binance-outbound';
    const side = c.source === 'binance-outbound' || c.senderRole === 'me' ? 'me' : 'them';
    const bucket = Math.floor((Date.parse(c.createdAt || c.time || '') || 0) / (3 * 60 * 1000));
    const binId = c.binanceMessageId || c.messageId || c.msgId || c.uuid || '';
    const key = isBinance
      ? `${side}|${normalized.type || 'text'}|${normalized.text}|${bucket}`
      : (c.id || `${c.source || ''}|${c.senderName || ''}|${c.createdAt || ''}|${normalized.text}`);
    if (binId && seen.has(`id:${binId}`)) return false;
    if (seen.has(key)) return false;
    if (binId) seen.add(`id:${binId}`);
    seen.add(key);
    return true;
  }).sort((a,b) => new Date(a.createdAt || a.time || 0) - new Date(b.createdAt || b.time || 0));
  if (!list.length) return '<div class="empty-state small">No messages yet.</div>';
  const verificationCompleted = list.some(chatVerificationCompleted);
  const chatContext = { order: state.currentOrder || {}, verificationCompleted };
  return list.map(item => chatMessageHtml(item, chatContext)).join('');
}
function stopChatAutoSync() {
  if (state.chatSyncTimer) clearTimeout(state.chatSyncTimer);
  state.chatSyncTimer = null;
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
    updateChatBox(updated.chats || [], 'binance');
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
  const delay = state.chatSyncFailCount ? Math.min(60000, 15000 * Math.pow(2, Math.min(3, state.chatSyncFailCount - 1))) : 5000;
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
    if (box) box.scrollTop = box.scrollHeight;
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
    const maxDim = 1600;
    const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * ratio));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * ratio));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const preferred = /png/i.test(file.type || '') && file.size < 750 * 1024 ? 'image/png' : 'image/jpeg';
    let blob = await canvasToBlob(canvas, preferred, 0.84);
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
  if (file.size > 900 * 1024) {
    try {
      const compressed = await compressImageFileForChat(file);
      if (compressed && compressed.size && compressed.size < file.size) finalFile = new File([compressed], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: compressed.type || 'image/jpeg' });
    } catch {
      finalFile = file;
    }
  }
  if (finalFile.size > 4 * 1024 * 1024) throw new Error('Image is still too large after compression. Use a smaller image.');
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
      await loadOrderDetail(order.id, false, true);
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

function trText(text) {
  const raw = String(text ?? '');
  const trimmed = raw.trim();
  if (!trimmed || state.lang !== 'bn') return raw;
  const translated = I18N_BN[trimmed];
  if (!translated) return raw;
  return raw.replace(trimmed, translated);
}

function applyLanguage(root=document) {
  if (!root || state.applyingLanguage) return;
  state.applyingLanguage = true;
  document.documentElement.lang = state.lang === 'bn' ? 'bn' : 'en';
  document.body.classList.toggle('lang-bn', state.lang === 'bn');
  document.body.classList.toggle('lang-en', state.lang !== 'bn');
  const btn = document.querySelector('#langToggle');
  const loginBtn = document.querySelector('#loginLangToggle');
  [btn, loginBtn].filter(Boolean).forEach(toggle => {
    const isBn = state.lang === 'bn';
    toggle.setAttribute('aria-checked', isBn ? 'true' : 'false');
    toggle.classList.toggle('is-bn', isBn);
    toggle.setAttribute('title', isBn ? 'Switch to English' : 'বাংলায় পরিবর্তন করুন');
  });
  const walker = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || ['SCRIPT','STYLE','TEXTAREA','INPUT','OPTION'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    if (node.__i18nOriginal === undefined) node.__i18nOriginal = node.nodeValue;
    node.nodeValue = state.lang === 'bn' ? trText(node.__i18nOriginal) : node.__i18nOriginal;
  });
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
    if (!el.dataset.i18nPlaceholderOriginal) el.dataset.i18nPlaceholderOriginal = el.getAttribute('placeholder') || '';
    el.setAttribute('placeholder', state.lang === 'bn' ? trText(el.dataset.i18nPlaceholderOriginal) : el.dataset.i18nPlaceholderOriginal);
  });
  syncLoginLanguage();
  state.applyingLanguage = false;
}

function setupLanguageControls() {
  ['#langToggle','#loginLangToggle'].forEach(sel => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.onclick = () => {
      state.lang = state.lang === 'bn' ? 'en' : 'bn';
      localStorage.setItem('crmLang', state.lang);
      applyLanguage();
    };
  });
  applyLanguage();
}


function setConnectivityStatus(isOffline = false) {
  const status = $('#liveStatus');
  if (!status) return;
  const offline = Boolean(isOffline);
  status.textContent = state.lang === 'bn' ? 'অফলাইন' : 'Offline';
  status.classList.toggle('hidden', !offline);
  status.classList.toggle('offline', offline);
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
const NOTIFICATION_SOUND_CHOICES = ['chime','bell','alert','soft','custom','off'];

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

function playNotificationSound(showFailure=false) {
  const choice = notificationSoundChoice();
  if (choice === 'off') return;
  if (choice === 'custom') {
    if (playCustomNotificationSound(showFailure)) return;
    if (showFailure) return;
    playBuiltInNotificationSound('chime');
    return;
  }
  playBuiltInNotificationSound(choice);
}

function playOrderNotificationSoundOnce(orderKey) {
  const key = String(orderKey || '').trim();
  if (key && state.seenOrderSoundKeys.has(key)) return;
  if (key) {
    state.seenOrderSoundKeys.add(key);
    if (state.seenOrderSoundKeys.size > 300) state.seenOrderSoundKeys = new Set([...state.seenOrderSoundKeys].slice(-150));
  }
  playNotificationSound(false);
}

function notificationSoundSettingsHtml() {
  const choice = notificationSoundChoice();
  const customName = notificationCustomSoundName();
  return `<div class="full-row sound-settings-card">
    <div class="settings-section-head">
      <div><b>Notification Sound</b><span>New order/assignment alert sound is configured here, not in the dashboard header.</span></div>
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
          <option value="off" ${choice==='off'?'selected':''}>Off</option>
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
    <div class="notice sound-settings-note">Custom sound is saved in this browser only. Use a small MP3, WAV or OGG file for reliable playback.</div>
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
      if (choice !== 'off') playNotificationSound(true);
    };
  }
  if (test) test.onclick = () => playNotificationSound(true);
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
        playNotificationSound(true);
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
  item.innerHTML = `<b>${type === 'danger' ? 'Action blocked' : type === 'ok' ? 'Success' : 'Notice'}</b><span>${escapeHtml(text)}</span>`;
  wrap.appendChild(item);
  setTimeout(() => item.remove(), timeout);
}

function setFormMessage(id, message='', type='danger') {
  const el = document.querySelector(id);
  if (!el) return;
  el.className = 'form-message ' + type;
  el.textContent = message || '';
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
  'accounts.manage': 'Payment account add/edit/status',
  'ledger.adjust': 'Offline transaction / statement adjustment',
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
  if (opts.autoReloadOnChallenge === false || opts.noAutoReload) return false;
  if (state.apiChallengeReloading) return true;
  const key = challengeReloadKey(path);
  const now = Date.now();
  const last = Number(sessionStorage.getItem(key) || 0);
  if (now - last < 45000) return false;
  sessionStorage.setItem(key, String(now));
  state.apiChallengeReloading = true;
  notify('Hosting browser verification interrupted the API. Reloading the page once automatically...', 'warn', 2500);
  setTimeout(() => window.location.reload(), 900);
  return true;
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
async function api(path, opts={}, attempt=0) {
  const silent = !!(opts.silent || opts.quiet);
  const fetchOpts = { ...opts };
  delete fetchOpts.silent;
  delete fetchOpts.quiet;
  const method = (fetchOpts.method || 'GET').toUpperCase();
  const headers = { 'Accept': 'application/json', ...(fetchOpts.headers || {}) };
  if (fetchOpts.body !== undefined && !(fetchOpts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && state.csrfToken) headers['X-CSRF-Token'] = state.csrfToken;
  let res;
  try {
    res = await fetch(path, { credentials: 'include', cache: 'no-store', ...fetchOpts, method, headers });
  } catch (err) {
    if (attempt < 1) { await new Promise(r => setTimeout(r, 700)); return api(path, opts, attempt + 1); }
    const msg = `Network request failed for ${path}: ${err.message || err}. Check server health / hosting connectivity.`;
    if (!silent) notify(msg, 'danger');
    throw new Error(msg);
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json().catch(() => ({})) : await res.text().catch(() => '');
  const htmlResponse = !type.includes('application/json') && looksLikeHtml(data);
  const hostingChallenge = htmlResponse && isHostingChallengeHtml(data);
  const shouldRetryHtml = htmlResponse && (hostingChallenge || [0, 403, 429, 500, 502, 503, 504].includes(res.status));
  if ((!res.ok || htmlResponse) && attempt < 2 && shouldRetryHtml) {
    await new Promise(r => setTimeout(r, hostingChallenge ? 1300 + attempt * 1400 : 700 + attempt * 800));
    return api(path, opts, attempt + 1);
  }
  if (!res.ok || htmlResponse) {
    if (res.status === 401 && path !== '/api/login') showLogin();
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
    if (!state.user || state.page === 'p2p-market' || window.scrollY > 0 || blockedTarget(event.target) || event.touches.length !== 1) return;
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
  setupLanguageControls();
  setupNotificationSoundControls();
  setupResponsiveNavigation();
  setupGlobalPullToRefresh();
  setupConnectivityStatus();
  setupEmailOtpInputs();
  setupLoginVisibilityButtons();
  resetLoginVerificationStep({ clear: true, focus: false });

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#loginError').textContent = '';
    if (!validateLoginFormForCurrentStep()) return;
    syncEmailOtpValue();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd);
    setLoginButtonBusy(true);
    try {
      const data = await api('/api/login', { method: 'POST', body: JSON.stringify(payload), silent: true });
      if (data.otpRequired) {
        const message = data.message || 'Check your email and enter the OTP.';
        const restartCooldown = !loginVerificationActive || /sent|expired/i.test(message);
        setLoginVerificationStep(message, { restartCooldown });
        return;
      }
      state.user = data.user;
      state.csrfToken = data.csrfToken;
      setLoginAlert(loginLocalized('Verification successful. Opening your dashboard...', 'ভেরিফিকেশন সফল। ড্যাশবোর্ড খোলা হচ্ছে...'), 'success');
      await bootApp();
    } catch (err) {
      $('#loginError').textContent = err.message;
      if (!loginVerificationActive) {
        $('#loginPassword')?.focus({ preventScroll: true });
        $('#loginPassword')?.select();
      } else {
        setLoginAlert(err.message, err.status === 429 ? 'warning' : 'danger');
      }
    } finally {
      setLoginButtonBusy(false);
    }
  });

  $('#changeCredentialsBtn').addEventListener('click', () => {
    $('#loginError').textContent = '';
    resetLoginVerificationStep({ clear: true, focus: true });
  });

  $('#resendOtpBtn').addEventListener('click', async () => {
    if (!loginVerificationActive) return;
    const form = $('#loginForm');
    const payload = Object.fromEntries(new FormData(form));
    payload.emailOtp = '';
    payload.secretCode = '';
    payload.resendOtp = true;
    $('#loginError').textContent = '';
    const button = $('#resendOtpBtn');
    button.disabled = true;
    try {
      const data = await api('/api/login', { method: 'POST', body: JSON.stringify(payload), silent: true });
      clearEmailOtpInputs();
      setLoginVerificationStep(data.message || 'A new OTP was sent. Check your inbox and spam folder.', { restartCooldown: true });
      notify(data.message || 'A new OTP was sent.', 'ok');
    } catch (err) {
      $('#loginError').textContent = err.message;
      setLoginAlert(err.message, err.status === 429 ? 'warning' : 'danger');
      const waitMatch = String(err.message || '').match(/wait\s+(\d+)\s+seconds/i);
      if (waitMatch) startLoginResendCooldown(Number(waitMatch[1]));
      else button.disabled = false;
    }
  });
  window.addEventListener('hashchange', () => { if (state.user) routeFromLocation(); });
  $('#logoutBtn').onclick = async () => { await sendActivityEnd('logout').catch(()=>{}); await api('/api/logout', { method:'POST', body:'{}' }).catch(()=>{}); location.reload(); };
  try {
    const me = await api('/api/me', { silent: true });
    state.user = me.user;
    state.csrfToken = me.csrfToken;
    await bootApp();
  } catch { showLogin(); }
}

function showLogin() {
  stopActivityTracking(false);
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
  resetLoginVerificationStep({ clear: true, focus: false });
  const password = $('#loginPassword');
  if (password) password.value = '';
  $('#loginError').textContent = '';
  setupLanguageControls();
  applyLanguage();
  window.setTimeout(() => ($('#loginIdentity') || $('#loginPassword'))?.focus({ preventScroll: true }), 60);
}

async function bootApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#userBadge').textContent = `${state.user.name} / ${state.user.role}`;
  state.bootstrap = await api('/api/bootstrap');
  if (state.bootstrap.csrfToken) state.csrfToken = state.bootstrap.csrfToken;
  renderNav();
  setupHeaderNotificationCenter();
  startMobileBottomNavSync();
  startEvents();
  startActivityTracking();
  if (!location.hash) {
    history.replaceState(null, '', '#/' + (canPage(state.page) ? state.page : visiblePages()[0][0]));
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
    headers: { 'Accept':'application/json', 'Content-Type':'application/json', 'X-CSRF-Token': state.csrfToken },
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
    if (type === 'db_updated' && state.page !== 'ads' && !(state.page === 'orders' && state.currentOrderId)) {
      scheduleSmoothRefresh(260);
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
  const notice = orderChangeNotice(change);
  if (!notice) return;
  const key = [sourceType, change.orderId || change.id, change.orderNo || change.externalOrderNo, change.externalStatus, change.status, change.created ? 'new' : 'status'].join('|');
  if (eventOnceKey(key)) return;
  notify(notice.msg, notice.type, 3000);
  if (change.created) playOrderNotificationSoundOnce(change.orderId || change.id || change.orderNo || change.externalOrderNo);
}

function handleServerEvent(event = {}) {
  if (!event || typeof event !== 'object') return;
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
    if (current && state.page === 'orders' && state.currentOrderId) scheduleCurrentOrderReload(450);
  }
  if (event.type === 'order.created') {
    const orderNo = event.orderNo || event.externalOrderNo || ('#' + event.orderId);
    const key = ['created', event.orderId, orderNo, event.at || ''].join('|');
    if (!eventOnceKey(key)) {
      notify(`New order ${orderNo} received.`, 'ok', 3000);
      playOrderNotificationSoundOnce(event.orderId || orderNo);
    }
  }
  if (event.type === 'notification.created' && event.notification?.type === 'panel_sms_order_assigned') {
    const notification = event.notification;
    const belongsToUser = Number(notification.userId || 0) === Number(state.user?.id || 0) || Number(notification.agentId || 0) === Number(state.user?.agentId || 0);
    if (belongsToUser) playOrderNotificationSoundOnce(notification.orderId || notification.message);
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
    const orderNo = event.orderNo || event.externalOrderNo || ('#' + event.orderId);
    const key = ['chat', event.orderId, event.latestMessageId || event.at || event.incomingImported].join('|');
    if (!eventOnceKey(key)) {
      notify(`New message on order ${orderNo}.`, 'ok', 3500);
      playOrderNotificationSoundOnce(key);
    }
    if (Number(event.orderId) === Number(state.currentOrderId)) {
      scheduleCurrentOrderReload(450);
      const chatVisible = !window.matchMedia('(max-width: 900px)').matches || document.body.classList.contains('order-chat-open');
      if (chatVisible) setTimeout(() => markOrderChatRead(event.orderId), 800);
    }
  }
  if (event.type === 'chat.message.sent' && Number(event.orderId) === Number(state.currentOrderId)) scheduleCurrentOrderReload(600);
}

function scheduleCurrentOrderReload(delay=450) {
  if (!state.currentOrderId || state.page !== 'orders') return;
  clearTimeout(state.currentOrderReloadTimer);
  state.currentOrderReloadTimer = setTimeout(() => {
    if (state.currentOrderId && !modalOpen()) loadOrderDetail(state.currentOrderId, false, true).catch(()=>{});
  }, delay);
}

function modalOpen() { return !!document.querySelector('.modal-backdrop'); }

function scheduleSmoothRefresh(delay=350) {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => smoothRefreshCurrent(), delay);
}

async function smoothRefreshCurrent() {
  if (!state.user) return;
  if (modalOpen()) { state.pendingRefresh = true; return; }
  if (state.refreshing) { state.pendingRefresh = true; return; }
  // While an order is open, do not re-render the whole page on every SSE event.
  // Chat/detail background sync updates only the changed panels to keep the UI smooth like Binance.
  if (state.page === 'orders' && state.currentOrderId) return;
  const content = $('#content');
  const scrollY = window.scrollY;
  state.refreshing = true;
  content.classList.add('soft-updating');
  try {
    await renderPage(false);
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  } catch (err) {
    console.warn(err);
  } finally {
    setTimeout(() => content.classList.remove('soft-updating'), 120);
    state.refreshing = false;
    if (state.pendingRefresh && !modalOpen()) { state.pendingRefresh = false; scheduleSmoothRefresh(120); }
  }
}

function visiblePages() { return pages.filter(p => p[2].includes(state.user.role) && hasPerm(PAGE_PERMISSIONS[p[0]]) && (p[0] !== 'system-update' || state.user.isOwner === true)); }
function canPage(page) { return visiblePages().some(p => p[0] === page); }


function parseHashRoute() {
  const raw = String(location.hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  const page = parts[0] || 'dashboard';
  const route = { page, orderId: null, ledgerAccountId: null };
  if (page === 'orders' && parts[1]) route.orderId = Number(parts[1]) || null;
  if (page === 'ledger' && parts[1] === 'account' && parts[2]) route.ledgerAccountId = Number(parts[2]) || null;
  return route;
}

function routeHash(page, opts={}) {
  let hash = '#/' + page;
  if (page === 'orders' && opts.orderId) hash += '/' + Number(opts.orderId);
  if (page === 'ledger' && opts.accountId) hash += '/account/' + Number(opts.accountId);
  return hash;
}

function setRoute(page, opts={}) {
  const hash = routeHash(page, opts);
  if (location.hash === hash) return routeFromLocation(opts.showLoading !== false);
  location.hash = hash;
}

async function routeFromLocation(showLoading=true) {
  setMobileNavigation(false, { restoreFocus: false });
  if (showLoading !== false) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  const route = parseHashRoute();
  state.page = canPage(route.page) ? route.page : visiblePages()[0][0];
  state.currentOrderId = route.orderId;
  state.ledgerAccountId = route.ledgerAccountId;
  document.body.classList.toggle('p2p-market-active', state.page === 'p2p-market');
  document.body.classList.toggle('profile-mobile-active', state.page === 'security');
  document.body.classList.toggle('chat-inbox-active', state.page === 'chat');
  if (state.page !== 'chat' && typeof stopChatInboxAutoRefresh === 'function') stopChatInboxAutoRefresh();
  document.body.classList.toggle('order-detail-active', state.page === 'orders' && !!state.currentOrderId);
  if (!(state.page === 'orders' && state.currentOrderId)) document.body.classList.remove('order-chat-open');
  if (state.activityViewTimer) clearTimeout(state.activityViewTimer);
  state.activityViewTimer = null;
  markActivityInteraction('navigation', true);
  scheduleActivityHeartbeat(200);
  renderNav();
  if (state.page === 'orders' && state.currentOrderId) return loadOrderDetail(state.currentOrderId, showLoading, true);
  stopChatAutoSync();
  stopOrderDetailAutoSync();
  return renderPage(showLoading);
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
  if (id === 'profile') return canPage('security') ? 'security' : (canPage('settings') ? 'settings' : visiblePages()[0]?.[0]);
  return visiblePages()[0]?.[0];
}

function mobileBottomNavActive(id) {
  if (id === 'p2p') return state.page === 'p2p-market';
  if (id === 'orders') return state.page === 'orders' && !document.body.classList.contains('order-chat-open');
  if (id === 'ads') return state.page === 'ads';
  if (id === 'chat') return state.page === 'chat' || (state.page === 'orders' && document.body.classList.contains('order-chat-open'));
  if (id === 'profile') return ['security', 'settings'].includes(state.page);
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
    const [orders, unread] = await Promise.all([
      api('/api/orders', { silent:true, noAutoReload:true }).catch(() => ({ items:[] })),
      api('/api/chat-unread', { silent:true, noAutoReload:true }).catch(() => ({ total:0 }))
    ]);
    state.mobileNavCounts = {
      orders: (orders?.items || []).filter(order => isOngoingOrder(order)).length,
      chats: Math.max(0, Number(unread?.total || 0))
    };
    renderMobileBottomNav();
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

function renderNav() {
  const nav = $('#nav');
  nav.innerHTML = '';
  const visible = visiblePages();
  const accountingPages = visible.filter(([id]) => ACCOUNTING_PAGE_IDS.includes(id));
  const accountingVisible = accountingPages.length > 0;
  const accountingActive = isAccountingPage();
  const accountingOpen = accountingActive || localStorage.getItem('crmAccountingMenuOpen') !== '0';

  const appendPageButton = ([id, label], root=nav, extraClass='') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (id === 'system-update' && state.bootstrap?.settings?.updateAvailable) {
      const indicator = document.createElement('span');
      indicator.className = 'nav-update-indicator';
      indicator.textContent = 'Update';
      b.appendChild(indicator);
    }
    b.className = `${id === state.page ? 'active' : ''} ${extraClass}`.trim();
    b.dataset.navPage = id;
    b.onclick = () => {
      setMobileNavigation(false, { restoreFocus: false });
      if (usesMobileNavigation()) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      setRoute(id);
    };
    root.appendChild(b);
  };

  visible.forEach(page => {
    const [id] = page;
    if (ACCOUNTING_PAGE_IDS.includes(id)) {
      if (id !== accountingPages[0]?.[0]) return;
      const group = document.createElement('div');
      group.className = `nav-group accounting-nav-group ${accountingActive ? 'active' : ''}`;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = `nav-group-toggle ${accountingActive ? 'active' : ''}`;
      toggle.setAttribute('aria-expanded', accountingOpen ? 'true' : 'false');
      toggle.innerHTML = '<span>Business Accounting</span><span class="nav-group-caret" aria-hidden="true">⌄</span>';
      const submenu = document.createElement('div');
      submenu.className = `nav-submenu ${accountingOpen ? 'open' : ''}`;
      accountingPages.forEach(item => appendPageButton(item, submenu, 'nav-submenu-button'));
      toggle.onclick = () => {
        const open = !submenu.classList.contains('open');
        submenu.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        localStorage.setItem('crmAccountingMenuOpen', open ? '1' : '0');
      };
      group.append(toggle, submenu);
      nav.appendChild(group);
      return;
    }
    appendPageButton(page);
  });
  if (!accountingVisible) nav.querySelector('.accounting-nav-group')?.remove();
  applyLanguage(nav);
  renderMobileBottomNav();
}

function setTitle(title, subtitle='') {
  $('#pageTitle').textContent = title;
  const subtitleEl = $('#pageSubtitle');
  subtitleEl.textContent = subtitle;
  subtitleEl.classList.toggle('hidden', !String(subtitle || '').trim());
  applyLanguage(document.querySelector('.topbar') || document);
}

async function renderPage(showLoading=true) {
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
  if (showLoading) $('#content').innerHTML = '<div class="card skeleton">Loading...</div>';
  try {
    if (state.page === 'dashboard') await renderDashboard();
    else if (state.page === 'p2p-market') await renderP2pMarket();
    else if (state.page === 'orders') await renderOrders();
    else if (state.page === 'chat') await renderChatInbox();
    else if (state.page === 'approvals') await renderApprovals();
    else if (state.page === 'ads') await renderAds();
    else if (state.page === 'accounts') await renderAccounts();
    else if (state.page === 'ledger') await renderLedger();
    else if (state.page === 'agents') await renderUsers();
    else if (state.page === 'user-roles') await renderUserRoles();
    else if (state.page === 'routing') await renderRouting();
    else if (state.page === 'reports') await renderReports();
    else if (state.page === 'accounting') await renderAccounting();
    else if (state.page === 'accounting-expenses') await renderAccountingExpenses();
    else if (state.page === 'accounting-income') await renderAccountingIncome();
    else if (state.page === 'accounting-capital') await renderAccountingCapital();
    else if (state.page === 'accounting-closing') await renderAccountingClosing();
    else if (state.page === 'activity') await renderActivityMonitor();
    else if (state.page === 'credentials') await renderCredentials();
    else if (state.page === 'health') await renderHealth();
    else if (state.page === 'system-update') await renderSystemUpdate();
    else if (state.page === 'settings') await renderSettings();
    else if (state.page === 'p2p-extension') await renderP2pExtensionAdmin();
    else if (state.page === 'security') await renderSecurity();
    else if (state.page === 'notifications') await renderNotifications();
    else if (state.page === 'audit') await renderAudit();
    applyLanguage(document.querySelector('#content') || document);
    if (showLoading !== false && usesMobileNavigation()) {
      requestAnimationFrame(() => $('#content')?.focus({ preventScroll: true }));
    }
  } catch (err) {
    const body = err.autoReloadScheduled
      ? '<div class="notice warn"><b>Hosting verification detected.</b><br/>The page is reloading automatically. Please wait...</div>'
      : `<div class="error">${escapeHtml(err.message)}</div>${err.hostingChallenge ? '<div class="mt-sm"><button id="forceReloadBtn">Reload Now</button> <button class="secondary" data-route="health">Open Health Check</button></div>' : ''}`;
    $('#content').innerHTML = `<div class="card">${body}</div>`;
    if ($('#forceReloadBtn')) $('#forceReloadBtn').onclick = () => window.location.reload();
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
function orderPayGroup(o) {
  const txt = upperStatusText(o);
  if (/APPEAL|COMPLAIN|DISPUTE/.test(txt) || String(o.status || '').toLowerCase() === 'hold') return 'appeal';
  if (/WAIT_FOR_RELEASE|WAIT.*RELEASE|PAID|BUYER.*PAID|CONFIRM.*PAY/.test(txt) || String(o.status || '').toLowerCase() === 'paid_marked') return 'paid';
  return 'unpaid';
}
function binanceDisplayStatus(o) {
  if (isCancelledOrder(o)) return 'CANCELLED';
  const txt = upperStatusText(o);
  if (/APPEAL|COMPLAIN|DISPUTE/.test(txt)) return 'APPEAL';
  if (/WAIT_FOR_RELEASE|BUYER.*PAID|PAID|CONFIRM.*PAY/.test(txt) || String(o.status || '').toLowerCase() === 'paid_marked') return 'PAID';
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

function isLikelyUrl(v) { return /^https?:\/\//i.test(String(v || '')); }
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
      <div><h3>Additional Verification Pending</h3><p>Verify the counterparty first. Payment and release actions stay hidden until Binance confirms the verification.</p><small>Live sync checks Binance every few seconds. Completing verification in the Binance app will remove the Verified button automatically.</small></div>
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
  const account = order.selectedPaymentAccount;
  if (!account) return '';
  const methodName = account.method?.name || account.method?.code || 'Payment account';
  return `<div class="card order-card selected-payment-account-card">
    <div class="selected-payment-account-icon" aria-hidden="true">✓</div>
    <div class="selected-payment-account-copy"><span>Selected Payment Account</span><b>${escapeHtml(methodName)} · ${escapeHtml(account.accountNumber || '-')}</b><small>${escapeHtml(account.accountName || '')}${account.accountName ? ' · ' : ''}${escapeHtml(accountTypeLabel(account.accountType))}</small></div>
    <span class="badge ok">ACTIVE</span>
  </div>`;
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
  const scoped = Boolean(summary.isScoped && state.user?.role === 'agent');
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

function currentUserOrderAssignment(o={}) {
  if (state.user?.role !== 'agent' || !state.user?.agentId) return null;
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
  const qr = qrCodePath ? `<div class="pay-qr payment-detail-qr">${isLikelyUrl(qrCodePath) ? `<a href="${escapeAttr(qrCodePath)}" target="_blank" rel="noopener"><img src="${escapeAttr(qrCodePath)}" alt="Payment QR" onerror="this.style.display='none'"/><span>Open QR / payment image</span></a>` : `<span>${escapeHtml(qrCodePath)}</span>`}</div>` : '';
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
  if (state.user?.role === 'agent' && assignment?.role === 'co_agent') {
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
    const normalBtn = paid
      ? `<button class="success" id="${finalId}">Release Coin</button>`
      : `<button class="success" id="${finalId}" disabled title="Available after buyer marks paid">Waiting for Buyer Paid</button>`;
    const quickBtn = canQuickRelease() ? `<button class="danger" id="${quickId}" title="Permission controlled release before paid mark">Quick Release</button>` : '';
    return normalBtn + quickBtn;
  }
  return '';
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
    if (err.autoReloadScheduled) return;
    if (err.hostingChallenge) {
      notify('Hosting verification blocked the Orders API. Reloading once or wait a few seconds and try again.', 'warn');
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
    state.currentOrder = updated;
    notify('Additional Verification completed.', 'ok');
    await loadOrderDetail(order.id, false, true);
  } catch (err) {
    notify(err.message || 'Additional Verification failed.', 'danger');
    if (button) { button.disabled = false; button.textContent = original || 'Verified'; }
  }
}

async function loadOrderDetail(id, showLoading=true, fromRoute=false) {
  state.currentOrderId = id;
  const restoreMobileChat = document.body.classList.contains('order-chat-open');
  const restoreInternalNotes = $('#orderInternalNotePanel')?.classList.contains('is-open') || false;
  document.body.classList.remove('order-chat-open');
  if (!fromRoute && location.hash !== routeHash('orders', { orderId: id })) history.replaceState(null, '', routeHash('orders', { orderId: id }));
  if (showLoading) $('#content').innerHTML = '<div class="card">Loading order...</div>';
  let o = await api('/api/orders/' + id);
  state.currentOrder = o;
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
  $('#content').innerHTML = `
    <div class="order-page">
      <div class="order-floating-actions" id="orderFloatingActions">
        <button class="order-floating-trigger" id="orderFloatingMenuBtn" type="button" aria-controls="orderFloatingMenu" aria-expanded="false" aria-label="Open order actions" title="Order actions">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
        </button>
        <div class="order-floating-menu" id="orderFloatingMenu" role="menu" aria-hidden="true">
          <button class="ghost" id="floatingBackOrders" type="button" role="menuitem"><span aria-hidden="true">←</span> Back</button>
          <button class="secondary" id="floatingCoUserBtn" type="button" role="menuitem"><span aria-hidden="true">＋</span> Request Co-User</button>
          ${state.user.role==='agent' ? '<button class="warn" id="floatingLeaveBtn" type="button" role="menuitem"><span aria-hidden="true">↗</span> Leave Order</button>' : ''}
          ${['admin','manager'].includes(state.user.role) ? '<button class="secondary" id="floatingAssignBtn" type="button" role="menuitem"><span aria-hidden="true">＋</span> Assign / Add User</button>' : ''}
        </div>
      </div>
      <header class="order-mobile-unified-head">
        <div class="order-mobile-unified-main">
          <button class="order-main-menu-btn" id="orderMainMenuBtn" type="button" aria-controls="sidebar" aria-label="Open main menu" title="Main menu"><span class="hamburger-bars" aria-hidden="true"></span></button>
          <button class="order-mobile-back" id="mobileBackOrders" type="button" aria-label="Back to orders">←</button>
          <div class="order-mobile-avatar">${escapeHtml(String(mobileCounterpartyNickname || 'C').charAt(0).toUpperCase())}</div>
          <div class="order-mobile-unified-identity">
            <b>${escapeHtml(mobileCounterpartyNickname)}</b>
            <span>${escapeHtml(binanceDisplayStatus(o))}${isFulfilledOrder(o) ? '' : ` · ${orderCountdownHtml(o, 'strong')}`}</span>
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
          <div><span>${escapeHtml(mobileAmountLabel)}</span><b>${money(viewerFiatAmount)}</b>${viewerSummary.isScoped ? `<small>${escapeHtml(viewerSummary.assignmentRole === 'co_agent' ? 'Co-agent allocation' : 'Lead allocation')}</small>` : ''}</div>
          <div><span>${escapeHtml(mobileRemainingLabel)}</span><b>${money(viewerSummary.viewerRemaining)}</b><small>${o.type === 'BUY' ? 'Paid so far' : 'Received so far'}: ${money(viewerSummary.viewerActual)}</small></div>
        </div>
        <div class="order-mobile-top-actions">${mobileTopActions}</div>
      </header>
      <section class="order-hero-panel">
        <div class="order-hero-main">
          <div class="order-eyebrow">
            ${badge(o.orderSource === 'offline' ? 'OFFLINE ORDER' : 'BINANCE P2P', o.orderSource === 'offline' ? 'warn' : 'blue')}
            ${badge(o.type, o.type === 'BUY' ? 'blue' : 'ok')}
            <span class="method-badge">${escapeHtml(displayPaymentMethodName(o) || 'No method')}</span>
            ${badge(binanceDisplayStatus(o), isCancelledOrder(o) ? 'danger' : binanceDisplayStatus(o) === 'PAID' ? 'warn' : binanceDisplayStatus(o) === 'COMPLETED' ? 'ok' : 'blue')}
          </div>
          <h2 class="order-hero-desktop-number">${escapeHtml(o.orderNo)}</h2>
          <h2 class="order-hero-mobile-name">${escapeHtml(mobileCounterpartyRealName)}</h2>
          <p>${escapeHtml(flowText)}</p>
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
          <b>${money(viewerFiatAmount)}</b>
          <small>${o.type === 'BUY' ? `Net ${assetFmt(assetSummary.receiveQuantity, o.asset)} · Total ${assetFmt(assetSummary.totalQuantity, o.asset)} · Fee ${assetFeeDisplay(o, assetSummary)}` : `Release ${assetFmt(assetSummary.releaseQuantity, o.asset)} · Total ${assetFmt(assetSummary.totalQuantity, o.asset)} · Fee ${assetFeeDisplay(o, assetSummary)}`} · ${escapeHtml(o.fiatUnit || 'BDT')}</small>
          <div class="order-hero-summary-grid">
            <div><span>${o.type === 'BUY' ? 'Paid So Far' : 'Received So Far'}</span><b>${money(viewerSummary.viewerActual)}</b></div>
            <div><span>Remaining</span><b>${money(viewerSummary.viewerRemaining)}</b></div>
          </div>
        </div>
      </section>

      <div class="order-workspace order-desktop-body mt">
        <div class="order-main-stack order-detail-stack">
          ${additionalVerificationNoticeHtml(o)}
          ${selectedPaymentAccountHtml(o)}
          <div class="order-payment-immediate">${customerPaymentDetailsCard(o)}</div>

          <div class="card order-card splits-card">
            <div class="section-head"><h3>Payment Splits</h3><span>${o.paymentSplits.length} ${o.paymentSplits.length === 1 ? 'entry' : 'entries'}</span></div>
            ${o.paymentSplits.length ? `<div class="split-list">${o.paymentSplits.map(renderSplit).join('')}</div>` : '<div class="empty-state">No split yet. Add payment split, select wallet/account, then update actual amount and proof.</div>'}
          </div>

          <div class="card order-card assigned-card">
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

          ${renderOrderApprovals(o)}
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
            <div class="order-chat-primary-actionbar">${chatTopActions}</div>

            <div class="order-chat-panel-content">
              ${hasPerm('accounts.view') && ['admin','manager'].includes(state.user.role) ? '<button class="order-chat-rail-btn left" id="chatPaymentSplitRailBtn" type="button" aria-label="Open payment split">≡</button>' : ''}
              ${isRealBinanceOrder(o) ? '<button class="order-chat-rail-btn right" id="chatInternalNoteRailBtn" type="button" aria-controls="orderInternalNotePanel" aria-expanded="false" aria-label="Open internal notes">›</button>' : ''}

              ${isRealBinanceOrder(o) && hasPerm('binance.chat') ? `<div class="card order-card chat-card order-live-chat-card">
                <div class="section-head chat-head chat-desktop-head"><h3>Binance C2C Chat</h3><div class="chat-head-actions"><span id="chatSyncStatus" class="sync-status live">Live</span><button class="secondary mini-action" id="p2pInfoBtn" type="button">P2P Info</button></div></div>
                <div class="chat" id="chatBox">${renderChatList(o.chats, 'binance')}</div>
              </div>` : `<div class="card order-card chat-card order-live-chat-card">
                <div class="section-head chat-head chat-desktop-head"><h3>Internal Notes</h3><span>Private</span></div>
                <div class="chat" id="internalNoteBox">${renderChatList(o.chats, 'internal')}</div>
              </div>`}
            </div>

            <footer class="order-chat-fixed-footer">
              ${isRealBinanceOrder(o) && hasPerm('binance.chat') ? `<div class="chat-quick-panel" id="chatQuickPanel" aria-hidden="true">
                <div class="chat-quick-panel-head"><div><b id="chatQuickPanelTitle">Quick Message</b><span>${['admin','manager'].includes(state.user.role) ? 'Saved replies and payment numbers' : 'Saved replies'}</span></div><button id="closeChatQuickPanel" type="button" aria-label="Close quick messages">×</button></div>
                <div class="chat-quick-panel-body" id="chatQuickPanelBody"></div>
              </div>
              <div class="chat-attachment-tray" id="chatAttachmentTray" aria-hidden="true">
                <button class="chat-album-picker" id="chatAlbumPicker" type="button">
                  <span class="chat-album-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="9" r="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="m5 17 4-4 3 3 2-2 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                  <span><b>Album</b><small>Photo or video · single or multiple</small></span>
                </button>
              </div>
              <div class="chat-media-preview" id="chatMediaPreview" aria-live="polite"></div>
              <form id="chatForm" class="chat-compose-pro">
                <button class="chat-compose-plus" id="chatAttachmentMenuBtn" type="button" aria-controls="chatAttachmentTray" aria-expanded="false" aria-label="Add photo or video">＋</button>
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
            ${statementFeed(o.ledgers)}
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
    if (button && !button.disabled) button.onclick = () => finalAction === 'complete' ? openFinalActionModal(o, finalAction) : openPaymentSplitActionModal(o, finalAction);
  });
  ['quickReleaseBtn','mobileTopQuickReleaseBtn','chatTopQuickReleaseBtn'].forEach(id => {
    const button = $('#' + id);
    if (button) button.onclick = () => openPaymentSplitActionModal(o, 'quick_release');
  });
  ['p2pInfoBtn','mobileP2pInfoBtn','chatP2pInfoBtn'].forEach(id => {
    const button = $('#' + id);
    if (button) button.onclick = () => openP2pInfoModal(o);
  });
  $$('[data-copy-payment-value]').forEach(btn => btn.onclick = async () => {
    const value = String(btn.dataset.copyPaymentValue || '').trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      notify('Copied.', 'ok');
    } catch (_) {
      notify('Could not copy this value.', 'warn');
    }
  });
  if ($('#syncBinanceChatInlineBtn')) $('#syncBinanceChatInlineBtn').onclick = () => autoSyncBinanceChat(o, false);
  const chatForm = $('#chatForm');
  if (chatForm) {
    const fileInput = $('#chatMediaInput');
    const attachmentBtn = $('#chatAttachmentMenuBtn');
    const attachmentTray = $('#chatAttachmentTray');
    const albumPicker = $('#chatAlbumPicker');
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
      const selected = o.selectedPaymentAccount;
      const messages = orderQuickMessages(o);
      const canUsePaymentAccounts = hasPerm('accounts.view') && hasPerm('accounts.use') && state.user.role !== 'auditor';
      quickPanelBody.innerHTML = `
        ${canUsePaymentAccounts ? `<button class="quick-payment-entry" id="openQuickPaymentNumbers" type="button">
          <span class="quick-payment-entry-icon" aria-hidden="true">#</span>
          <span><b>Payment Numbers</b><small>${selected ? `Selected: ${escapeHtml(selected.method?.name || '')} · ${escapeHtml(selected.accountNumber || '')}` : 'Search all saved payment accounts'}</small></span>
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
    const renderQuickAccounts = (query='') => {
      if (!quickPanelBody) return;
      if (quickPanelTitle) quickPanelTitle.textContent = 'Payment Numbers';
      const q = String(query || '').trim().toLowerCase();
      const visible = quickAccounts
        .filter(account => String(account.status || '').toLowerCase() === 'active')
        .filter(account => !q || [account.accountNumber, account.accountName, account.method?.name, account.method?.code, account.agent?.name, account.accountType].some(value => String(value || '').toLowerCase().includes(q)))
        .sort((a, b) => {
          const selectedA = Number(a.id) === Number(o.selectedPaymentAccountId || o.selectedPaymentAccount?.id || 0) ? 1 : 0;
          const selectedB = Number(b.id) === Number(o.selectedPaymentAccountId || o.selectedPaymentAccount?.id || 0) ? 1 : 0;
          if (selectedA !== selectedB) return selectedB - selectedA;
          const matchA = accountMatchesOrderMethod(a, o) ? 1 : 0;
          const matchB = accountMatchesOrderMethod(b, o) ? 1 : 0;
          if (matchA !== matchB) return matchB - matchA;
          return String(a.accountNumber || '').localeCompare(String(b.accountNumber || ''));
        });
      quickPanelBody.innerHTML = `
        <div class="quick-number-tools"><button class="quick-number-back" id="backQuickMessages" type="button">←</button><input id="quickNumberSearch" type="search" placeholder="Search number, method or account name" value="${escapeAttr(query)}" /></div>
        <div class="quick-number-hint">Tap a number to send it and set it as this order's payment account.</div>
        <div class="quick-number-list">${visible.length ? visible.map(account => {
          const isMatch = accountMatchesOrderMethod(account, o);
          const isSelected = Number(account.id) === Number(o.selectedPaymentAccountId || o.selectedPaymentAccount?.id || 0);
          return `<button class="quick-number-row${isSelected ? ' is-selected' : ''}" type="button" data-quick-payment-account="${account.id}">
            <span class="quick-number-main"><b>${escapeHtml(account.method?.name || 'Payment account')}</b><strong>${escapeHtml(account.accountNumber || '-')}</strong><small>${escapeHtml(account.accountName || account.agent?.name || '')}</small></span>
            <span class="quick-number-meta"><em>${escapeHtml(accountTypeLabel(account.accountType))}</em>${isMatch ? '<i>MATCHED METHOD</i>' : ''}${isSelected ? '<i>SELECTED</i>' : ''}</span>
          </button>`;
        }).join('') : '<div class="empty-state small">No active payment number matches this search.</div>'}</div>`;
      $('#backQuickMessages')?.addEventListener('click', renderQuickHome);
      const search = $('#quickNumberSearch');
      if (search) {
        search.oninput = () => renderQuickAccounts(search.value);
        setTimeout(() => search.focus({ preventScroll:true }), 30);
      }
      quickPanelBody.querySelectorAll('[data-quick-payment-account]').forEach(button => button.onclick = async () => {
        const paymentAccountId = Number(button.dataset.quickPaymentAccount || 0);
        if (!paymentAccountId) return;
        const original = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="quick-number-main"><b>Sending payment number…</b><small>Please wait</small></span>';
        try {
          const sent = await api(`/api/orders/${o.id}/binance-chat-send`, {
            method:'POST',
            body: JSON.stringify({ paymentAccountId, sendPaymentAccount:true, binanceOrderNumber: o.externalOrderNo || o.orderNo })
          });
          state.currentOrder = sent.order || state.currentOrder;
          notify('Payment number sent and selected for this order.', 'ok');
          setQuickPanel(false);
          await loadOrderDetail(o.id, false, true);
        } catch (err) {
          button.disabled = false;
          button.innerHTML = original;
          notify(err.message || 'Payment number could not be sent.', 'danger');
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
    if (albumPicker && fileInput) albumPicker.onclick = () => fileInput.click();
    if (fileInput) fileInput.onchange = () => {
      const next = Array.from(fileInput.files || []);
      const allowed = next.filter(file => /^(image\/(png|jpe?g|webp)|video\/(mp4|webm|quicktime))$/i.test(file.type || ''));
      if (allowed.length !== next.length) notify('Unsupported files were skipped. Use image, MP4, WebM or MOV.', 'warn');
      selectedMedia = allowed.slice(0, 8);
      if (allowed.length > 8) notify('You can send up to 8 media files at a time.', 'warn');
      fileInput.value = '';
      setAttachmentTray(false);
      renderSelectedMedia();
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
        for (const mediaFile of selectedMedia) {
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
        updateChatBox(latestOrder?.chats || o.chats || [], 'binance');
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
  startOrderDetailAutoSync(o);
  startChatAutoSync(o);
  $$('[data-update-split]').forEach(b => b.onclick = () => openUpdateSplitModal(o, Number(b.dataset.updateSplit)));
  $$('[data-complete-agent]').forEach(b => b.onclick = () => openCompleteUserModal(o, Number(b.dataset.completeAgent)));
  applyLanguage(document.querySelector('#content') || document);
  if (state.user.role === 'agent') await api(`/api/orders/${o.id}/heartbeat`, { method:'POST', body:'{}' }).catch(()=>{});
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











function roleProfileSelect(selectedId=null) {
  const roles = state.bootstrap.userRoles || [];
  return `<select name="userRoleId" id="userRoleSelect">${roles.map(r => `<option value="${r.id}" data-system-role="${escapeAttr(r.systemRole)}" ${Number(selectedId)===Number(r.id)?'selected':''}>${escapeHtml(r.name)} (${escapeHtml(r.systemRole)})</option>`).join('')}</select>`;
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
      <div><label>System Role</label><select name="systemRole" id="roleSystemRoleSelect" ${role?.locked ? 'disabled' : ''}><option value="agent" ${role?.systemRole==='agent'?'selected':''}>Employee / Agent</option><option value="manager" ${role?.systemRole==='manager'?'selected':''}>Manager</option><option value="auditor" ${role?.systemRole==='auditor'?'selected':''}>Auditor</option></select></div>
      <div class="full-row"><label>Description</label><input name="description" value="${escapeAttr(role?.description || '')}" /></div>
      <div class="full-row"><label>Permissions</label>${permissionChecks(selectedPerms)}</div>
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

function p2pCredentialAccessChecks(selectedIds = []) {
  const options = Array.isArray(state.p2pCredentialOptions) ? state.p2pCredentialOptions : [];
  const selected = new Set((selectedIds || []).map(Number));
  if (!options.length) return '<div class="notice small">No Binance API credential is available to assign from this account.</div>';
  return `<div class="p2p-profile-credential-access-grid">${options.map(item => `<label class="check p2p-profile-credential-access-item"><input type="checkbox" name="allowedP2pCredentialIds" value="${Number(item.id)}" ${selected.has(Number(item.id)) ? 'checked' : ''}/><span><b>${escapeHtml(item.name || `API ${item.id}`)}</b><small>${escapeHtml(item.nickname || item.userNo || item.status || '')}</small></span></label>`).join('')}</div>`;
}

function selectedP2pCredentialIds(form) {
  return [...form.querySelectorAll('input[name="allowedP2pCredentialIds"]:checked')].map(input => Number(input.value)).filter(Boolean);
}

function openUserModal(userItem=null) {
  const isEdit = !!userItem;
  const u = userItem?.user || {};
  const selectedPerms = u.permissions || [];
  modal(isEdit ? 'Edit User / Permissions' : 'Add User + Login', `
    <form id="userForm" class="form-grid">
      <div><label>User / Employee Name</label><input name="name" value="${escapeAttr(userItem?.name || '')}" required /></div>
      <div><label>Presence</label><div class="dynamic-presence-box">${badge(userItem?.status || 'offline', statusClass(userItem?.status || 'offline'))}<span>Automatic — users cannot manually set online/offline.</span></div></div>
      <div><label>User Role</label>${roleProfileSelect(u.roleProfileId || 3)}</div>
      <input type="hidden" name="loginRole" id="loginRoleInput" value="${escapeAttr(u.role || 'agent')}" />
      <div><label>Username</label><input name="username" value="${escapeAttr(u.username || '')}" ${isEdit && u.username ? '' : 'required'} /></div>
      <div><label>Email for OTP</label><input name="email" type="email" value="${escapeAttr(u.email || '')}" placeholder="user@example.com" /></div>
      <div><label>Mobile / SMS Number</label><input name="mobile" value="${escapeAttr(userItem?.mobile || '')}" placeholder="optional" /></div>
      <div><label>${isEdit ? 'New Password (optional)' : 'Password'}</label><input name="password" type="password" ${isEdit ? '' : 'required'} /></div>
      <div><label>${isEdit ? 'New 6 Digit Secret (optional)' : '6 Digit Secret Code'}</label><input name="secretCode" inputmode="numeric" maxlength="6" ${isEdit ? 'placeholder="optional"' : 'required'} /></div>
      <div><label>Max Active Orders</label><input name="maxActiveOrders" type="number" value="${userItem?.maxActiveOrders || 5}" /></div>
      <div><label>Max Release Amount</label><input name="maxReleaseAmount" type="number" value="${userItem?.maxReleaseAmount || 0}" /></div>
      <div><label class="check"><input type="checkbox" name="allowNewOrders" ${userItem?.allowNewOrders === false ? '' : 'checked'} /> Allow new orders</label></div>
      <div><label class="check"><input type="checkbox" name="smsEnabled" ${userItem?.smsEnabled === false ? '' : 'checked'} /> Panel SMS on order assignment</label></div>
      <div><label class="check"><input type="checkbox" name="canRelease" ${userItem?.canRelease ? 'checked' : ''} /> Can release/final action</label></div>
      <div class="full-row"><label>Permissions</label>${permissionChecks(selectedPerms)}</div>
      <div class="full-row"><label>P2P API Profile Access</label>${p2pCredentialAccessChecks(u.allowedP2pCredentialIds || [])}<small>Admin can see every API profile automatically. Manager, Agent and Auditor can only see the API profiles checked here.</small></div>
      <div class="full-row" id="userFormMessage"></div>
      <div class="full-row"><button type="submit">${isEdit ? 'Save User' : 'Create User'}</button></div>
    </form>`);
  const roleSelect = $('#userRoleSelect');
  if (roleSelect) roleSelect.onchange = () => {
    const perms = rolePermissions(roleSelect.value);
    $('#loginRoleInput').value = roleSystemRole(roleSelect.value);
    $$('#userForm input[name="permissions"]').forEach(ch => { ch.checked = perms.includes(ch.value); });
  };
  $('#userForm').onsubmit = async e => {
    e.preventDefault();
    const obj = formObj(e.target);
    if (obj.secretCode && !/^\d{6}$/.test(obj.secretCode)) { setFormMessage('#userFormMessage', 'Secret code must be exactly 6 digits.', 'danger'); return; }
    obj.allowNewOrders = e.target.allowNewOrders.checked;
    obj.smsEnabled = e.target.smsEnabled.checked;
    obj.canRelease = e.target.canRelease.checked;
    obj.permissions = selectedPermissions(e.target);
    obj.allowedP2pCredentialIds = selectedP2pCredentialIds(e.target);
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
      <div><label>Priority</label><input name="priority" type="number" value="${route?.priority || 1}" /></div>
      <div><label>Max Active Orders</label><input name="maxActiveOrders" type="number" value="${route?.maxActiveOrders || 0}" /></div>
      <div><label>Min Order Amount</label><input name="minOrderAmount" type="number" value="${route?.minOrderAmount || 0}" /></div>
      <div><label>Max Order Amount</label><input name="maxOrderAmount" type="number" value="${route?.maxOrderAmount || 0}" /></div>
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
  return (state.bootstrap?.agents || []).filter(agent => !agent.user || agent.user.role === 'agent');
}

function paymentAccountAgentAccessHtml(selectedIds=[]) {
  const selected = new Set((selectedIds || []).map(Number));
  const agents = assignablePaymentAgents();
  if (!agents.length) return '<div class="notice">No Agent user exists yet. Create an Agent first, then grant account access.</div>';
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

function paymentAccountOwnerSelect(selectedId=null) {
  const users = paymentAccountOwnerUsers();
  return `<select name="ownerUserId" required><option value="">Select user</option>${users.map(user => `<option value="${Number(user.id)}" data-role="${escapeAttr(user.role || '')}" data-agent-id="${Number(user.agentId || 0)}" ${Number(selectedId) === Number(user.id) ? 'selected' : ''}>${escapeHtml(user.name || user.username || `User ${user.id}`)} (${escapeHtml(user.username || user.role || '')})</option>`).join('')}</select>`;
}

function syncPaymentAccountOwnerForm(form) {
  if (!form) return;
  const typeSelect = form.querySelector('[name="accountType"]');
  const ownerSelect = form.querySelector('[name="ownerUserId"]');
  if (!typeSelect || !ownerSelect) return;
  const isAgentType = typeSelect.value === 'agent';
  [...ownerSelect.options].forEach(option => {
    if (!option.value) return;
    option.disabled = isAgentType && option.dataset.role !== 'agent';
  });
  const selected = ownerSelect.selectedOptions[0];
  if (selected?.disabled) ownerSelect.value = '';
  if (isAgentType) {
    const ownerAgentId = Number(ownerSelect.selectedOptions[0]?.dataset.agentId || 0);
    if (ownerAgentId) {
      const accessCheck = form.querySelector(`input[name="allowedAgentIds"][value="${ownerAgentId}"]`);
      if (accessCheck) accessCheck.checked = true;
    }
  }
}

function bindPaymentAccountOwnerForm(form) {
  if (!form) return;
  const typeSelect = form.querySelector('[name="accountType"]');
  const ownerSelect = form.querySelector('[name="ownerUserId"]');
  if (typeSelect) typeSelect.addEventListener('change', () => syncPaymentAccountOwnerForm(form));
  if (ownerSelect) ownerSelect.addEventListener('change', () => syncPaymentAccountOwnerForm(form));
  syncPaymentAccountOwnerForm(form);
}

function paymentAccountChargeFieldsHtml(account={}) {
  const mode = String(account.transactionChargeMode || 'none');
  const applies = String(account.transactionChargeAppliesTo || 'send');
  const tiers = Array.isArray(account.transactionChargeTiers) ? JSON.stringify(account.transactionChargeTiers) : '[]';
  return `
    <div><label>Transfer Charge Rule</label><select name="transactionChargeMode">
      <option value="none" ${mode==='none'?'selected':''}>No charge</option>
      <option value="fixed" ${mode==='fixed'?'selected':''}>Fixed charge</option>
      <option value="percentage" ${mode==='percentage'?'selected':''}>Percentage charge</option>
      <option value="fixed_percentage" ${mode==='fixed_percentage'?'selected':''}>Fixed + percentage</option>
      <option value="tiered" ${mode==='tiered'?'selected':''}>Tier-based charge</option>
      <option value="manual" ${mode==='manual'?'selected':''}>Manual actual charge</option>
    </select></div>
    <div><label>Charge Applies To</label><select name="transactionChargeAppliesTo"><option value="send" ${applies==='send'?'selected':''}>Send</option><option value="receive" ${applies==='receive'?'selected':''}>Receive</option><option value="both" ${applies==='both'?'selected':''}>Both</option></select></div>
    <div><label>Fixed Charge (BDT)</label><input name="transactionChargeFixed" type="number" min="0" step="0.01" value="${escapeAttr(account.transactionChargeFixed || 0)}" /></div>
    <div><label>Percentage Charge (%)</label><input name="transactionChargePercent" type="number" min="0" max="100" step="0.0001" value="${escapeAttr(account.transactionChargePercent || 0)}" /></div>
    <div class="full-row"><label>Tier Rules (JSON)</label><textarea name="transactionChargeTiers" rows="3" placeholder='[{"min":0,"max":5000,"fixed":5,"percent":0}]'>${escapeHtml(tiers)}</textarea><small>Each split transfer calculates and deducts its own charge immediately. Manual actual charge entered on a split overrides the configured estimate.</small></div>`;
}

function openAccountModal() {
  modal('Add Payment Account', `
    <form id="accountForm" class="form-grid">
      <div class="full-row notice"><b>Central account management:</b> Admin and Manager can use every account. An Agent can only see and use accounts granted below.</div>
      <div><label>Payment Method</label>${methodSelect()}</div>
      <div><label>Account User</label>${paymentAccountOwnerSelect()}</div>
      <div><label>Account Type</label>${paymentAccountTypeSelect('personal')}</div>
      <div><label>Account Number</label><input name="accountNumber" required /></div>
      <div><label>Account Name</label><input name="accountName" /></div>
      <div><label>Opening Balance</label><input name="currentBalance" type="number" value="0" /></div>
      <div><label>Status</label>${accountStatusSelect('active')}</div>
      ${paymentAccountChargeFieldsHtml({})}
      <div><label>Daily Receive Limit</label><input name="dailyReceiveLimit" type="number" value="50000" /></div>
      <div><label>Daily Send Limit</label><input name="dailySendLimit" type="number" value="50000" /></div>
      <div><label>Monthly Receive Limit</label><input name="monthlyReceiveLimit" type="number" value="300000" /></div>
      <div><label>Monthly Send Limit</label><input name="monthlySendLimit" type="number" value="300000" /></div>
      <div class="full-row"><label>Agent Access</label>${paymentAccountAgentAccessHtml([])}<small>Leave every Agent unchecked to keep this account available only to Admin and Manager.</small></div>
      <div class="full-row" id="accountFormMessage"></div>
      <div class="full-row"><button type="submit">Create Account</button></div>
    </form>`);
  bindPaymentAccountOwnerForm($('#accountForm'));
  $('#accountForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const payload = formObj(e.target);
      payload.allowedAgentIds = selectedAllowedAgentIds(e.target);
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
  modal('Edit Account / Status', `
    <form id="editAccountForm" class="form-grid">
      <div class="full-row notice"><b>Central account management:</b> Admin and Manager always have access. Checked Agents can view and use this account.</div>
      <div><label>Payment Method</label>${methodSelect(account.paymentMethodId)}</div>
      <div><label>Account User</label>${paymentAccountOwnerSelect(account.ownerUserId)}</div>
      <div><label>Account Type</label>${paymentAccountTypeSelect(account.accountType)}</div>
      <div><label>Account Number</label><input name="accountNumber" value="${escapeAttr(account.accountNumber)}" /></div>
      <div><label>Account Name</label><input name="accountName" value="${escapeAttr(account.accountName || '')}" /></div>
      <div><label>Status</label>${accountStatusSelect(account.status)}</div>
      ${paymentAccountChargeFieldsHtml(account)}
      <div><label>Daily Receive Limit</label><input name="dailyReceiveLimit" type="number" value="${account.dailyReceiveLimit || 0}" /></div>
      <div><label>Daily Send Limit</label><input name="dailySendLimit" type="number" value="${account.dailySendLimit || 0}" /></div>
      <div><label>Monthly Receive Limit</label><input name="monthlyReceiveLimit" type="number" value="${account.monthlyReceiveLimit || 0}" /></div>
      <div><label>Monthly Send Limit</label><input name="monthlySendLimit" type="number" value="${account.monthlySendLimit || 0}" /></div>
      <div class="full-row"><label>Agent Access</label>${paymentAccountAgentAccessHtml(account.allowedAgentIds || [])}</div>
      <div class="full-row" id="editAccountMessage"></div>
      <div class="full-row"><button type="submit">Save Account</button></div>
    </form>`);
  bindPaymentAccountOwnerForm($('#editAccountForm'));
  $('#editAccountForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const payload = formObj(e.target);
      payload.allowedAgentIds = selectedAllowedAgentIds(e.target);
      await api('/api/payment-accounts/' + id, { method:'PATCH', body: JSON.stringify(payload) });
      notify('Payment account updated.', 'ok');
      closeModal();
      await renderAccounts();
    } catch (err) { setFormMessage('#editAccountMessage', err.message || 'Account update failed', 'danger'); }
  };
}

function parseBulkAccountNumbers(value='') {
  return String(value || '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);
}

function currentBulkBalanceMap() {
  const map = new Map();
  $$('#bulkAccountPreview [data-bulk-account-balance]').forEach(input => {
    map.set(String(input.dataset.accountNumber || ''), input.value);
  });
  return map;
}

function renderBulkAccountPreview({ applyDefault=false } = {}) {
  const host = $('#bulkAccountPreview');
  if (!host) return;
  const numbers = parseBulkAccountNumbers($('#bulkAccountNumbers')?.value || '');
  const previous = currentBulkBalanceMap();
  const defaultBalance = $('#bulkDefaultOpeningBalance')?.value || '0';
  const duplicates = new Set(numbers.filter((number, index) => numbers.indexOf(number) !== index));
  const uniqueCount = new Set(numbers).size;
  $('#bulkAccountCount').textContent = String(numbers.length);
  $('#bulkAccountUniqueCount').textContent = String(uniqueCount);
  if (!numbers.length) {
    host.innerHTML = '<div class="empty bulk-account-empty">Enter one account number per line to build the serial list.</div>';
    return;
  }
  host.innerHTML = `<div class="bulk-account-preview-list">${numbers.map((number, index) => {
    const balance = applyDefault ? defaultBalance : (previous.has(number) ? previous.get(number) : defaultBalance);
    return `<div class="bulk-account-preview-row ${duplicates.has(number) ? 'has-error' : ''}">
      <span class="bulk-account-serial">${index + 1}</span>
      <div class="bulk-account-number"><b>${escapeHtml(number)}</b>${duplicates.has(number) ? '<small>Duplicate number</small>' : ''}</div>
      <label><span>Opening Balance</span><input data-bulk-account-balance data-account-number="${escapeAttr(number)}" type="number" min="0" step="any" value="${escapeAttr(balance)}" /></label>
    </div>`;
  }).join('')}</div>`;
}

function openBulkAccountModal() {
  modal('Bulk Add Payment Accounts', `
    <form id="bulkAccountForm" class="form-grid bulk-account-box-form">
      <div><label>Payment Method</label>${methodSelect()}</div>
      <div><label>Account User</label>${paymentAccountOwnerSelect()}</div>
      <div><label>Account Name</label><input name="accountName" /></div>
      <div><label>Account Type</label>${paymentAccountTypeSelect('personal')}</div>
      <div><label>Status</label>${accountStatusSelect('active')}</div>
      ${paymentAccountChargeFieldsHtml({})}
      <div><label>Daily Receive Limit</label><input name="dailyReceiveLimit" type="number" min="0" value="50000" /></div>
      <div><label>Daily Send Limit</label><input name="dailySendLimit" type="number" min="0" value="50000" /></div>
      <div><label>Monthly Receive Limit</label><input name="monthlyReceiveLimit" type="number" min="0" value="300000" /></div>
      <div><label>Monthly Send Limit</label><input name="monthlySendLimit" type="number" min="0" value="300000" /></div>
      <div class="full-row"><label>Agent Access</label>${paymentAccountAgentAccessHtml([])}</div>
      <div class="full-row bulk-account-number-box">
        <div class="bulk-account-box-head"><label for="bulkAccountNumbers">Account Numbers</label><span><b id="bulkAccountCount">0</b> rows · <b id="bulkAccountUniqueCount">0</b> unique</span></div>
        <textarea id="bulkAccountNumbers" rows="9" spellcheck="false" placeholder="01300000001&#10;01300000002&#10;01300000003"></textarea>
      </div>
      <div class="full-row bulk-account-balance-tools">
        <label>Default Opening Balance <input id="bulkDefaultOpeningBalance" type="number" min="0" step="any" value="0" /></label>
        <button type="button" class="secondary" id="bulkApplyDefaultBalance">Apply to All</button>
      </div>
      <div class="full-row">
        <div class="bulk-account-preview-title"><b>Serial Account List</b></div>
        <div id="bulkAccountPreview"></div>
      </div>
      <div class="full-row" id="bulkAccountMessage"></div>
      <div class="full-row"><button type="submit">Add Accounts</button></div>
    </form>`);
  bindPaymentAccountOwnerForm($('#bulkAccountForm'));
  const numbersInput = $('#bulkAccountNumbers');
  numbersInput.oninput = () => renderBulkAccountPreview();
  $('#bulkApplyDefaultBalance').onclick = () => renderBulkAccountPreview({ applyDefault:true });
  renderBulkAccountPreview();
  $('#bulkAccountForm').onsubmit = async e => {
    e.preventDefault();
    const numbers = parseBulkAccountNumbers(numbersInput.value);
    if (!numbers.length) return setFormMessage('#bulkAccountMessage', 'Add at least one account number.', 'danger');
    if (numbers.length > 500) return setFormMessage('#bulkAccountMessage', 'A maximum of 500 payment accounts can be added at once.', 'danger');
    if (new Set(numbers).size !== numbers.length) return setFormMessage('#bulkAccountMessage', 'Remove duplicate account numbers before saving.', 'danger');
    const common = formObj(e.target);
    common.allowedAgentIds = selectedAllowedAgentIds(e.target);
    const balanceInputs = [...e.target.querySelectorAll('[data-bulk-account-balance]')];
    const accounts = numbers.map((accountNumber, index) => ({
      accountNumber,
      openingBalance: balanceInputs[index]?.value || 0
    }));
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

function openAdjustAccountModal(id) {
  const account = (window.lastAccounts || []).find(a => Number(a.id) === Number(id));
  if (!account) return notify('Account not found. Refresh page and try again.', 'danger');
  modal('Offline Transaction / Statement Adjustment', `
    <div class="kv"><b>Account</b><span>${escapeHtml(account.accountNumber)}</span><b>Current Balance</b><span>${money(account.currentBalance)}</span></div>
    <form id="adjustForm" class="form-grid">
      <div><label>Type</label><select name="type">
        <option value="offline_purchase">Offline Purchase (-)</option>
        <option value="expense">Business Expense (-)</option>
        <option value="cashout">Cash Out (-)</option>
        <option value="settlement_out">Settlement Out (-)</option>
        <option value="refund_out">Refund Out (-)</option>
        <option value="offline_receive">Offline Receive (+)</option>
        <option value="topup">Topup (+)</option>
        <option value="settlement_in">Settlement In (+)</option>
        <option value="refund_in">Refund In (+)</option>
        <option value="correction">Correction +/-</option>
      </select></div>
      <div><label>Amount</label><input name="amount" type="number" value="0" /></div>
      <div><label>Reference</label><input name="reference" /></div>
      <div class="full-row"><label>Note</label><input name="note" /></div>
      <div class="full-row" id="adjustMessage"></div>
      <div class="full-row"><button type="submit">Save Statement Entry</button></div>
    </form>`);
  $('#adjustForm').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/api/payment-accounts/' + id + '/ledger', { method:'POST', body: JSON.stringify(formObj(e.target)) });
      notify('Statement transaction saved.', 'ok');
      closeModal();
      await renderAccounts();
    } catch (err) { setFormMessage('#adjustMessage', err.message || 'Statement adjustment failed', 'danger'); }
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
      await loadOrderDetail(updated.id || order.id, false, true);
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
      await loadOrderDetail(updated.id || order.id, false, true);
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
      await loadOrderDetail(updated.id || order.id, false, true);
    } catch (err) { setFormMessage('#assignMessage', err.message || 'Assign failed', 'danger'); }
  };
}


function openBinanceOrderSyncModal() {
  modal('Sync Binance Orders', `
    <div class="notice">This imports live Binance C2C orders and then applies routing and assignment. It does not mark paid or release coin.</div>
    <form id="binanceOrderSyncForm" class="form-grid">
      <div><label>Page</label><input name="page" type="number" value="1" /></div>
      <div><label>Rows</label><input name="rows" type="number" value="20" max="100" /></div>
      <div><label>Trade Type</label><select name="tradeType"><option value="">All</option><option value="BUY">BUY</option><option value="SELL">SELL</option></select></div>
      <div><label>Order Status</label><select name="orderStatus"><option value="">All</option><option value="1">Wait Payment</option><option value="2">Wait Release</option><option value="3">Appeal</option><option value="4">Completed</option><option value="6">Cancelled</option><option value="7">System Cancelled</option></select></div>
      <div><label>Start Time</label><input name="startLocal" type="datetime-local" /></div>
      <div><label>End Time</label><input name="endLocal" type="datetime-local" /></div>
      <div class="full-row" id="binanceOrderSyncMessage"></div>
      <div class="full-row"><button class="success" type="submit">Run Live Sync</button></div>
    </form>`);
  $('#binanceOrderSyncForm').onsubmit = async e => {
    e.preventDefault();
    const obj = formObj(e.target);
    if (e.target.startLocal.value) obj.startDate = new Date(e.target.startLocal.value).getTime();
    if (e.target.endLocal.value) obj.endDate = new Date(e.target.endLocal.value).getTime();
    delete obj.startLocal; delete obj.endLocal;
    try {
      const result = await api('/api/binance/sync/orders', { method:'POST', body: JSON.stringify(obj) });
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
    await loadOrderDetail(updated.id || order.id, false, true);
  } catch (err) { notify(err.message || 'Binance detail sync failed', 'danger'); }
}

async function syncCurrentBinanceStats(order) {
  try {
    const updated = await api(`/api/orders/${order.id}/binance-counterparty`, { method:'POST', body: JSON.stringify({ binanceOrderNumber: order.externalOrderNo || order.orderNo }) });
    notify('Binance counterparty stats synced.', 'ok');
    await loadOrderDetail(updated.id || order.id, false, true);
  } catch (err) { notify(err.message || 'Binance stats sync failed', 'danger'); }
}

async function syncCurrentBinanceChat(order) {
  try {
    const updated = await api(`/api/orders/${order.id}/binance-chat-sync`, { method:'POST', body: JSON.stringify({ binanceOrderNumber: order.externalOrderNo || order.orderNo, page: 1, rows: 20, sort: 'desc' }) });
    notify('Binance chat messages synced.', 'ok');
    await loadOrderDetail(updated.id || order.id, false, true);
  } catch (err) { notify(err.message || 'Binance chat sync failed', 'danger'); }
}


function releaseRequirementFieldsHtml(req) {
  const fields = (req && Array.isArray(req.fields)) ? req.fields : [];
  const hidden = (req && req.hidden && typeof req.hidden === 'object') ? req.hidden : {};
  if (!fields.length && !Object.keys(hidden).length) {
    return `<div class="notice danger-note"><b>Binance did not specify an extra verification field.</b><br>${escapeHtml(req?.rawMessage || 'Please retry after syncing detail. If it repeats, share the raw release error with Binance support.')}</div>`;
  }
  const hiddenHtml = Object.entries(hidden).map(([k,v]) => `<input type="hidden" name="${escapeAttr(k)}" value="${escapeAttr(v)}" />`).join('');
  const fieldsHtml = fields.map(f => `<div><label>${escapeHtml(f.label || f.name)}</label><input name="${escapeAttr(f.name)}" type="${escapeAttr(f.type || 'text')}" autocomplete="${escapeAttr(f.autocomplete || 'one-time-code')}" placeholder="${escapeAttr(f.placeholder || 'Required by Binance')}" required /></div>`).join('');
  return `<div class="notice warn"><b>Binance needs extra verification.</b><br>Only the required field is shown below. Fill it and press Release again.</div>${hiddenHtml}<div class="form-grid mt-sm">${fieldsHtml}</div>`;
}

function showReleaseRequirementsInModal(err) {
  const box = $('#releaseDynamicFields');
  if (!box) return false;
  const req = err?.releaseRequirements || err?.data?.releaseRequirements || null;
  if (!req) return false;
  box.innerHTML = releaseRequirementFieldsHtml(req);
  box.classList.remove('hidden');
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return true;
}

async function openPaymentSplitActionModal(order, finalAction) {
  const label = finalAction === 'paid_mark' ? 'Mark as Paid' : finalAction === 'quick_release' ? 'Quick Release' : 'Release Coin';
  const direction = String(order.type || '').toUpperCase() === 'BUY' ? 'send' : 'receive';
  const viewerSummary = orderViewerSummary(order);
  let workingOrder = order;
  let currentRemaining = Math.max(0, Number(viewerSummary.viewerRemaining || 0));
  let accounts = [];
  const canUseAccounts = hasPerm('accounts.view') && hasPerm('accounts.use') && state.user?.role !== 'auditor';
  if (canUseAccounts) {
    try {
      const response = await api('/api/payment-accounts?paymentMethodId=' + encodeURIComponent(order.paymentMethodId || ''));
      accounts = (response.items || []).filter(account => account.status === 'active');
    } catch (_) { accounts = []; }
  }
  const selectedAccountId = Number(order.selectedPaymentAccountId || order.selectedPaymentAccount?.id || accounts[0]?.id || 0);
  const accountField = canUseAccounts ? `<div class="full-row"><label>Payment Account</label><select name="paymentAccountId" ${accounts.length ? '' : 'disabled'}>${accounts.map(account => `<option value="${Number(account.id)}" ${Number(account.id) === selectedAccountId ? 'selected' : ''}>${escapeHtml(account.accountNumber || '')} · ${escapeHtml(account.method?.name || '')} · ${money(direction === 'send' ? account.sendAvailable : account.receiveAvailable)} available</option>`).join('')}</select>${accounts.length ? '' : '<small class="danger-text">No active assigned payment account is available for this method.</small>'}</div>` : '<div class="full-row notice">You do not have permission to use a payment account.</div>';
  const liveMode = order.settings?.apiMode === 'live' && order.orderSource !== 'offline';
  const liveFields = liveMode ? `
    <input type="hidden" name="binanceOrderNumber" value="${escapeAttr(order.externalOrderNo || order.orderNo || '')}" />
    <input type="hidden" name="payId" value="${Number(order.binancePayId || 0) || ''}" />
    ${(finalAction === 'release' || finalAction === 'quick_release') ? '<div id="releaseDynamicFields" class="full-row hidden"></div>' : ''}` : '';
  const relevantExisting = (order.paymentSplits || []).filter(split => split.direction === direction && Number(split.actualAmount || 0) > 0);
  const evidencedExisting = relevantExisting.filter(split => split.hasEvidence || split.hasProof || split.hasTransactionReference);
  modal('Payment Split', `<div class="payment-split-action-summary"><span>${viewerSummary.isScoped ? 'Your Assigned Amount' : 'Order Amount'}</span><b>${money(viewerSummary.assignedAmount)}</b><small>${order.type === 'BUY' ? 'Payment' : 'Received'} · Remaining ${money(currentRemaining)}</small></div>
    <form id="paymentSplitActionForm" class="form-grid">
      <input type="hidden" name="action" value="${escapeAttr(finalAction)}" />
      <input type="hidden" name="direction" value="${escapeAttr(direction)}" />
      ${accountField}
      <div class="full-row"><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" value="${escapeAttr(currentRemaining)}" /></div>
      <div><label>Actual Transfer Charge (Optional)</label><input name="actualCharge" type="number" min="0" step="0.01" placeholder="Uses account rule when empty" /></div>
      <div><label>Transaction ID</label><input name="transactionReference" maxlength="120" placeholder="Transaction / reference ID" /></div>
      <div><label>Proof Screenshot</label><input type="file" id="paymentSplitActionProof" accept="image/png,image/jpeg,image/webp" /></div>
      <div class="full-row"><label>Note</label><input name="note" placeholder="Optional note" /></div>
      ${liveFields}
      <div class="full-row" id="paymentSplitActionMessage">${evidencedExisting.length ? `<div class="okbox">${evidencedExisting.length} evidenced split(s) already saved.</div>` : ''}</div>
      <div class="full-row payment-split-action-buttons"><button type="button" class="secondary" id="savePaymentSplitActionBtn">Save</button><button type="button" class="success" id="submitPaymentFinalActionBtn">${escapeHtml(label)}</button></div>
    </form>`);

  const form = $('#paymentSplitActionForm');
  const saveButton = $('#savePaymentSplitActionBtn');
  const finalButton = $('#submitPaymentFinalActionBtn');
  let splitSavedInModal = false;

  const hasCurrentEvidence = () => {
    const splits = (workingOrder.paymentSplits || []).filter(split => split.direction === direction && Number(split.actualAmount || 0) > 0);
    return splits.length > 0 && splits.every(split => split.hasEvidence || split.hasProof || split.hasTransactionReference);
  };

  const saveSplit = async ({ silent = false } = {}) => {
    const obj = formObj(form);
    const amount = Number(obj.amount || 0);
    const proof = $('#paymentSplitActionProof')?.files?.[0];
    const reference = String(obj.transactionReference || '').trim();
    if (amount <= 0) {
      if (hasCurrentEvidence()) return workingOrder;
      throw new Error('Amount must be greater than zero before saving Payment Split.');
    }
    if (!proof && !reference) throw new Error('Add a proof screenshot or transaction ID before saving Payment Split.');
    if (canUseAccounts && !Number(obj.paymentAccountId || 0)) throw new Error('Select an active payment account.');
    const payload = {
      direction,
      amount,
      actualCharge: obj.actualCharge,
      transactionReference: reference,
      note: obj.note || ''
    };
    if (Number(obj.paymentAccountId || 0)) payload.paymentAccountId = Number(obj.paymentAccountId);
    if (proof) payload.screenshotDataUrl = await toDataUrl(proof);
    workingOrder = await api(`/api/orders/${order.id}/splits`, { method:'POST', body: JSON.stringify(payload) });
    state.currentOrder = workingOrder;
    splitSavedInModal = true;
    currentRemaining = Number(orderViewerSummary(workingOrder).viewerRemaining || 0);
    form.elements.amount.value = currentRemaining;
    form.elements.transactionReference.value = '';
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
      const enteredAmount = Number(form.elements.amount?.value || 0);
      const enteredReference = String(form.elements.transactionReference?.value || '').trim();
      const enteredProof = $('#paymentSplitActionProof')?.files?.[0];
      if (enteredAmount > 0 || enteredReference || enteredProof) await saveSplit({ silent: true });
      if (!hasCurrentEvidence()) throw new Error(`Save an evidenced Payment Split before ${label}.`);
      const actionPayload = formObj(form);
      actionPayload.action = finalAction;
      const updated = await api(`/api/orders/${order.id}/complete-action`, { method:'POST', body: JSON.stringify(actionPayload) });
      if (updated.approvalRequired) {
        const issueText = (updated.issues || []).map(issue => issue.code).join(', ');
        setFormMessage('#paymentSplitActionMessage', 'Approval request sent to manager: ' + issueText, 'warn');
        notify('Manager approval required. Request added to Approval Queue.', 'warn');
        return;
      }
      notify(liveMode ? `${label} completed with Binance live call.` : `${label} completed.`, 'ok');
      closeModal();
      await loadOrderDetail(updated.id || order.id, false, true);
    } catch (err) {
      const shownReleaseFields = (finalAction === 'release' || finalAction === 'quick_release') && showReleaseRequirementsInModal(err);
      setFormMessage('#paymentSplitActionMessage', err.message || `${label} failed.`, shownReleaseFields ? 'warn' : 'danger');
    } finally {
      if ($('#submitPaymentFinalActionBtn')) $('#submitPaymentFinalActionBtn').disabled = false;
      if ($('#savePaymentSplitActionBtn')) $('#savePaymentSplitActionBtn').disabled = false;
    }
  };
}

function openFinalActionModal(order, finalAction) {
  const label = finalAction === 'complete' ? 'Complete Offline Order' : finalAction === 'paid_mark' ? 'Mark as Paid' : finalAction === 'quick_release' ? 'Quick Release' : 'Release Coin';
  const liveMode = order.settings?.apiMode === 'live' && order.orderSource !== 'offline' && finalAction !== 'complete';
  const liveFields = liveMode ? `
    <div class="full-row notice danger-note"><b>Live Binance Mode:</b> Binance order number and selected payment ID are taken from the synced order details.</div>
    ${(finalAction === 'release' || finalAction === 'quick_release') ? '<div class="full-row notice"><b>Direct Release:</b> Only the required order number and payment ID are sent. Any additional Binance verification field will appear here when required.</div>' : ''}
    <input type="hidden" name="binanceOrderNumber" value="${escapeAttr(order.externalOrderNo || order.orderNo || '')}" />
    <input type="hidden" name="payId" value="${Number(order.binancePayId || 0) || ''}" />
    ${(finalAction === 'release' || finalAction === 'quick_release') ? '<div id="releaseDynamicFields" class="full-row hidden"></div>' : ''}` : '';
  const privilegedDirectDecision = ['admin','manager'].includes(state.user.role);
  modal(label, `
    <div class="notice">${privilegedDirectDecision ? 'Admin/Manager direct decision: this action will take effect immediately without assignment or a separate approval. Actor, time, action, issues and result will remain in Audit Log.' : 'Before final action, actual amount, proof and mismatch rules will be checked.'}</div>
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
        setTimeout(() => { closeModal(); loadOrderDetail(order.id, false, true); }, 600);
        return;
      }
      notify(liveMode ? 'Final action completed with Binance live call.' : 'Final action completed.', 'ok');
      closeModal();
      await loadOrderDetail(updated.id || order.id, false, true);
    } catch (err) {
      const shownReleaseFields = (finalAction === 'release' || finalAction === 'quick_release') && showReleaseRequirementsInModal(err);
      setFormMessage('#finalActionMessage', err.message || 'Final action failed', shownReleaseFields ? 'warn' : 'danger');
    }
  };
}


function openCreateOrderModal(source='binance') {
  const isOffline = source === 'offline';
  modal(isOffline ? 'Create Offline Order' : 'Create Binance Order', `
    <div class="notice">${isOffline ? 'Offline orders are local business transactions. BUY reduces balance; SELL increases balance. Updating split actual creates order-linked statement entries.' : 'Create a Binance-linked order manually when it is not synced yet. Live API actions still require API credentials, payId and approval guards.'}</div>
    <form id="createOrderForm" class="form-grid">
      <input type="hidden" name="orderSource" value="${isOffline ? 'offline' : 'binance'}" />
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
      <div class="full-row"><button type="submit">Create and Auto Assign</button></div>
    </form>`);
  $('#createOrderForm').onsubmit = async e => { e.preventDefault(); const created = await api('/api/orders', { method:'POST', body: JSON.stringify(formObj(e.target)) }); closeModal(); setRoute('orders', { orderId: created.id }); };
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
  if (!['admin','manager'].includes(state.user.role)) {
    const assignmentAgentId = state.user.role === 'agent' ? state.user.agentId : (account.agent?.id || account.agentId);
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
  const accounts = await api('/api/payment-accounts?paymentMethodId=' + order.paymentMethodId);
  const direction = order.type === 'BUY' ? 'send' : 'receive';
  const defaultAmount = defaultSplitAmount(order);
  const selectedAccountId = Number(order.selectedPaymentAccountId || order.selectedPaymentAccount?.id || 0);
  const activeAccounts = accounts.items.filter(a => a.status === 'active').sort((a, b) => (Number(b.id) === selectedAccountId ? 1 : 0) - (Number(a.id) === selectedAccountId ? 1 : 0));
  modal('Add Payment Split', `
    <div class="live-remaining" id="addSplitPreview"></div>
    <form id="splitForm" class="form-grid">
      <input type="hidden" name="direction" value="${escapeAttr(direction)}" />
      <div class="full-row"><label>Payment Account</label><select name="paymentAccountId">${activeAccounts.map(a => `<option value="${a.id}" ${Number(a.id) === selectedAccountId ? 'selected' : ''}>${escapeHtml(a.accountNumber)} - ${escapeHtml(a.method?.name || '')} - System managed - ${escapeHtml(accountTypeLabel(a.accountType))} - balance ${money(a.currentBalance)} - send ${money(a.sendAvailable)} - receive ${money(a.receiveAvailable)} - charge ${escapeHtml(a.transactionChargeMode || 'none')}</option>`).join('')}</select></div>
      <div class="full-row"><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" value="${defaultAmount}" /></div>
      <div><label>Actual Transfer Charge (Optional)</label><input name="actualCharge" type="number" min="0" step="0.01" placeholder="Uses selected account rule when empty" /></div>
      <div><label>Proof Screenshot</label><input type="file" id="addProofFile" accept="image/png,image/jpeg,image/webp" /></div>
      <div><label>Note</label><input name="note" placeholder="Optional" /></div>
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
  const form = $('#splitForm');
  const amountInput = form.querySelector('input[name="amount"]');
  const accountSelect = form.querySelector('select[name="paymentAccountId"]');
  const getSelectedAccount = () => activeAccounts.find(a => Number(a.id) === Number(accountSelect?.value));
  const updateAddPreview = () => {
    const account = getSelectedAccount();
    const amount = Number(amountInput.value || 0);
    const projectedActual = Number(order.summary.relevantActual || 0) + Math.max(0, amount);
    const projectedRemaining = Math.max(0, Number(order.amount || 0) - projectedActual);
    const msg = splitValidationMessage({ order, account, direction, amount });
    $('#addSplitPreview').innerHTML = `<b>Remaining:</b> ${money(projectedRemaining)}`;
    setFormMessage('#splitFormMessage', msg, msg ? 'danger' : 'ok');
    setSubmitState(form, !msg, msg);
  };
  ['input','change'].forEach(evt => {
    amountInput.addEventListener(evt, updateAddPreview);
    if (accountSelect) accountSelect.addEventListener(evt, updateAddPreview);
  });
  updateAddPreview();
  form.onsubmit = async e => {
    e.preventDefault();
    const obj = formObj(e.target);
    const account = getSelectedAccount();
    const amount = Number(obj.amount || 0);
    const msg = splitValidationMessage({ order, account, direction, amount });
    if (msg) { setFormMessage('#splitFormMessage', msg, 'danger'); notify(msg, 'danger'); return; }
    try {
      const file = $('#addProofFile').files[0];
      if (file) obj.screenshotDataUrl = await toDataUrl(file);
      obj.direction = direction;
      const updated = await api(`/api/orders/${order.id}/splits`, { method:'POST', body: JSON.stringify(obj) });
      notify('Payment split saved.', 'ok');
      closeModal();
      await loadOrderDetail(updated.id || order.id, false, true);
    } catch (err) { setFormMessage('#splitFormMessage', err.message || 'Split save failed', 'danger'); }
  };
}

function openUpdateSplitModal(order, splitId) {
  const split = order.paymentSplits.find(s => s.id === splitId);
  const relevant = split.direction === (order.type === 'BUY' ? 'send' : 'receive');
  const currentActual = Number(split.actualAmount || 0);
  const account = split.account;
  const direction = split.direction;
  modal('Update Amount', `
    <div class="kv"><b>Account</b><span>${escapeHtml(split.account.accountNumber)}</span><b>Current Amount</b><span>${money(split.actualAmount)}</span></div>
    ${split.hasProof ? `<div class="okbox"><a href="${escapeAttr(split.proofUrl)}" target="_blank" rel="noopener">Existing proof attached</a></div>` : '<div class="notice">Proof screenshot is required before final action when proof setting is enabled.</div>'}
    <div class="live-remaining" id="splitPreview"></div>
    <form id="updateSplitForm" class="form-grid">
      <div class="full-row"><label>Amount</label><input name="amount" type="number" min="0.01" step="0.01" value="${split.actualAmount || split.plannedAmount}" /></div>
      <div><label>Actual Transfer Charge</label><input name="actualCharge" type="number" min="0" step="0.01" value="${escapeAttr(split.transactionChargeAmount || 0)}" /></div>
      <div><label>Status</label><select name="status"><option>completed</option><option>partial</option><option>short</option><option>excess</option></select></div>
      <div><label>Proof Screenshot</label><input type="file" id="proofFile" accept="image/png,image/jpeg,image/webp" /></div>
      <div class="full-row"><label>Note</label><input name="note" value="${escapeAttr(split.note || '')}" /></div>
      <div class="full-row" id="updateSplitMessage"></div>
      <div class="full-row"><button type="submit">Save</button></div>
    </form>`);
  const form = $('#updateSplitForm');
  const amountInput = form.querySelector('input[name="amount"]');
  const updatePreview = () => {
    const nextActual = Number(amountInput.value || 0);
    const projectedActual = relevant ? (Number(order.summary.relevantActual || 0) - currentActual + nextActual) : Number(order.summary.relevantActual || 0);
    const projectedRemaining = Math.max(0, Number(order.amount || 0) - projectedActual);
    const delta = nextActual - currentActual;
    let msg = '';
    if (nextActual <= 0) msg = 'Amount must be greater than 0.';
    else if (direction === 'send' && delta > Number(account.sendAvailable || 0)) msg = `Wallet balance is not enough. This update requires extra ${money(delta)} ; available ${money(account.sendAvailable || 0)}.`;
    $('#splitPreview').innerHTML = `<b>Live Remaining:</b> ${money(projectedRemaining)} <span>after save</span>`;
    setFormMessage('#updateSplitMessage', msg || 'Ready to save.', msg ? 'danger' : 'ok');
    setSubmitState(form, !msg, msg);
  };
  amountInput.addEventListener('input', updatePreview);
  updatePreview();
  form.onsubmit = async e => {
    e.preventDefault();
    const obj = formObj(e.target);
    const nextActual = Number(obj.amount || 0);
    if (nextActual <= 0) {
      const msg = 'Amount must be greater than 0.';
      setFormMessage('#updateSplitMessage', msg, 'danger'); notify(msg, 'danger'); return;
    }
    try {
      const file = $('#proofFile').files[0];
      if (file) obj.screenshotDataUrl = await toDataUrl(file);
      const updated = await api('/api/splits/' + splitId, { method:'PATCH', body: JSON.stringify(obj) });
      notify('Payment split updated.', 'ok');
      closeModal();
      await loadOrderDetail(updated.id || order.id, false, true);
    } catch (err) { setFormMessage('#updateSplitMessage', err.message || 'Payment split update failed', 'danger'); }
  };
}

function openCoAgentDoneModal(order, assignment = null) {
  const a = assignment || currentUserOrderAssignment(order);
  if (!a) return notify('Active co-agent assignment was not found.', 'danger');
  const assigned = Number(a.assignedAmount || 0);
  const actualDefault = Math.max(0, assigned - Number(a.actualAmount || 0)) || assigned;
  modal('Payment Split', `<div class="payment-split-action-summary"><span>Assigned Amount</span><b>${money(assigned)}</b><small>${escapeHtml(a.agent?.name || state.user?.name || 'Co-agent')} · ${escapeHtml(order.type === 'BUY' ? 'Payment' : 'Received')}</small></div>
    <div class="notice">Enter the completed amount and add a screenshot or transaction ID.</div>
    <form id="coAgentDoneForm" class="form-grid">
      <div><label>Amount</label><input name="actualAmount" type="number" min="0.01" step="0.01" max="${escapeAttr(assigned)}" value="${escapeAttr(actualDefault)}" required /></div>
      <div><label>Actual Transfer Charge (Optional)</label><input name="actualCharge" type="number" min="0" step="0.01" placeholder="Uses account rule when empty" /></div>
      <div><label>Transaction ID</label><input name="transactionReference" maxlength="120" placeholder="Transaction / reference ID" /></div>
      <div class="full-row"><label>Proof Screenshot</label><input type="file" id="coAgentDoneProof" accept="image/png,image/jpeg,image/webp" /></div>
      <div class="full-row"><label>Note</label><input name="note" value="My assigned part is completed" /></div>
      <div class="full-row" id="coAgentDoneMessage"></div>
      <div class="full-row"><button class="success" type="submit">Done</button></div>
    </form>`);
  $('#coAgentDoneForm').onsubmit = async event => {
    event.preventDefault();
    const obj = formObj(event.target);
    const proof = $('#coAgentDoneProof')?.files?.[0];
    if (!proof && !String(obj.transactionReference || '').trim()) return setFormMessage('#coAgentDoneMessage', 'Add a proof screenshot or transaction ID.', 'danger');
    try {
      if (proof) obj.screenshotDataUrl = await toDataUrl(proof);
      if (['admin','manager'].includes(state.user.role)) obj.agentId = a.agentId;
      const updated = await api(`/api/orders/${order.id}/complete-agent-task`, { method:'POST', body: JSON.stringify(obj) });
      notify('Co-agent work completed. Remaining and lead payment details updated in realtime.', 'ok');
      closeModal();
      await loadOrderDetail(updated.id || order.id, false, true);
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
  modal('Add Binance API Credential', `<div class="notice">API key and secret are stored encrypted in the configured database. After save, secret is never returned to the UI.</div><form id="credForm" class="form-grid"><div><label>Name</label><input name="name" value="Main Binance Account" /></div><div><label>Client Type</label><input name="clientType" value="web" /></div><div class="full-row"><label>API Key</label><input name="apiKey" /></div><div class="full-row"><label>Secret Key</label><input name="secretKey" type="password" /></div><div class="full-row"><button type="submit">Save Encrypted</button></div></form>`);
  $('#credForm').onsubmit = async e => { e.preventDefault(); await api('/api/api-credentials', { method:'POST', body: JSON.stringify(formObj(e.target)) }); closeModal(); renderCredentials(); };
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
  return `<button type="button" class="p2p-tab-btn ${active ? 'active' : ''}" onclick="setP2pInfoTab('${escapeAttr(tab)}')">${escapeHtml(label)}${extra ? ` ${extra}` : ''}</button>`;
}
function p2pFeedbackTypeBtn(label, type, activeType, count) {
  const active = type === activeType;
  return `<button type="button" class="p2p-feedback-type ${active ? 'active' : ''} ${type}" onclick="setP2pFeedbackTab('${escapeAttr(type)}')">${escapeHtml(label)} (${fmtDash(count)})</button>`;
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
  const manualBtn = `<button class="ghost mini" onclick="editCounterpartyFeedback(${Number(o.id || 0)})">Manual Feedback</button>`;
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
    const box = document.querySelector('.p2p-info-modal');
    if (box) box.innerHTML = counterpartyCard(updated);
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

function renderP2pInfoIntoModal(order) {
  const box = document.querySelector('.p2p-info-modal');
  if (!box) return;
  state.currentOrder = order;
  box.innerHTML = p2pExtensionStatusHtml(order) + counterpartyCard(order);
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
function accountStatusSelect(selected='active') { return `<select name="status"><option value="active" ${selected==='active'?'selected':''}>active</option><option value="hold" ${selected==='hold'?'selected':''}>hold</option><option value="limit_full" ${selected==='limit_full'?'selected':''}>limit_full</option><option value="inactive" ${selected==='inactive'?'selected':''}>inactive</option></select>`; }
function permissionChecks(selected=[]) { const list = state.bootstrap.permissions || Object.keys(PERMISSION_LABELS); return `<div class="perm-grid">${list.map(p => `<label class="check"><input type="checkbox" name="permissions" value="${p}" ${selected.includes(p)?'checked':''}/> ${escapeHtml(PERMISSION_LABELS[p] || p)}</label>`).join('')}</div>`; }
function selectedPermissions(form) { return Array.from(form.querySelectorAll('input[name="permissions"]:checked')).map(x => x.value); }
function defaultSplitAmount(order) {
  const fallback = Number(order.summary?.remaining || order.amount || 0);
  if (state.user?.role === 'agent') {
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

function canCompleteUserTask(a) { return ['admin','manager'].includes(state.user.role) || (state.user.role === 'agent' && Number(state.user.agentId) === Number(a.agentId) && !['completed','partial_completed','left'].includes(a.status)); }
function agentTaskAction(a, order) {
  if (a.status === 'completed') return '<span class="badge ok">Done</span>';
  if (a.status === 'partial_completed') return '<span class="badge warn">Partial Done</span>';
  if (a.status === 'left') return '<span class="badge danger">Left</span>';
  if (a.role !== 'co_agent' || !canCompleteUserTask(a)) return '-';
  return `<button class="success" data-complete-agent="${a.agentId}">Done</button>`;
}

function modal(title, html) {
  const tpl = $('#modalTemplate').content.cloneNode(true);
  tpl.querySelector('h3').textContent = title;
  tpl.querySelector('.modal-body').innerHTML = html;
  tpl.querySelector('.close-modal').onclick = closeModal;
  tpl.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });
  document.body.appendChild(tpl);
  document.body.classList.add('modal-open');
  applyLanguage(document.querySelector('.modal-backdrop:last-child') || document);
}
function closeModal() {
  $$('.modal-backdrop').forEach(x => x.remove());
  document.body.classList.remove('modal-open');
  if (typeof closeAdsSheet === 'function') closeAdsSheet();
  if (state.pendingAdsRefresh && state.page === 'ads') {
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

function badge(text, cls='') { return `<span class="badge ${cls}">${escapeHtml(String(text || ''))}</span>`; }
function statusClass(s) { return ['completed','released','paid_marked','success','active','assigned','ready','online'].includes(s) ? 'ok' : ['manager_queue','partial','partial_completed','short','busy','planned','idle','away'].includes(s) ? 'warn' : ['failed','cancelled','left','offline'].includes(s) ? 'danger' : 'blue'; }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(s) { return escapeHtml(s); }
function sumLocal(arr) { return arr.reduce((a,b)=>a+Number(b||0),0); }

init();


/* ===== PAYMENT METHOD UI IMPROVEMENT ===== */
function getPaymentIcon(type='') {
  type = (type || '').toLowerCase();
  if (type.includes('bank')) return '🏦';
  if (type.includes('bkash')) return '📱';
  if (type.includes('nagad')) return '🟠';
  if (type.includes('binance')) return '🟡';
  return '💳';
}

function renderPaymentBadge(order) {
  const method = order.paymentMethodName || order.payType || order.paymentMethod || 'Unknown';
  const icon = getPaymentIcon(method);
  return `<span class="payment-badge">${icon} ${method}</span>`;
}

/* NOTE: integrate renderPaymentBadge(order) inside order card rendering function */


/* ================= ENTERPRISE EVENT SYSTEM ================= */
window.CRM_EVENT_BUS = {
  listeners: {},
  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  },
  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }
};

/* ================= FIX: ORDER RENDER FLICKER ================= */
let __lastPaymentRender = {};

function stablePaymentMethod(orderId, method) {
  if (!method && __lastPaymentRender[orderId]) {
    return __lastPaymentRender[orderId];
  }
  __lastPaymentRender[orderId] = method;
  return method;
}

/* ================= ENTERPRISE NOTIFICATION SYSTEM ================= */
function crmNotify(message, type='info') {
  const el = document.createElement('div');
  el.className = 'crm-toast ' + type;
  el.innerText = message;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(()=>el.remove(), 300);
  }, 3000);
}

/* ================= BINANCE ORDER EVENT HOOKS ================= */
window.CRM_EVENT_BUS.on('order_update', (order) => {
  crmNotify(`Order ${order.orderNo} updated`, 'ok');
});

window.CRM_EVENT_BUS.on('order_new', (order) => {
  crmNotify(`New Order ${order.orderNo}`, 'info');
});

window.CRM_EVENT_BUS.on('order_status', (order) => {
  crmNotify(`Status: ${order.orderNo} -> ${order.status}`, 'warn');
});

/* ================= CRITICAL UI FIX HOOK ================= */
function emitOrderUpdate(order) {
  window.CRM_EVENT_BUS.emit('order_update', order);
}


/* ================= SSE CLIENT ================= */
let es;

function initStream(){
  // v1.0.50: disabled duplicate legacy SSE. Core startEvents() already handles realtime updates after login.
  return;
  try {
    es = new EventSource('/api/events');

    es.addEventListener('order_new', e=>{
      const d = JSON.parse(e.data);
      crmNotify('New Order ' + d.orderNo,'info');
    });

    es.addEventListener('order_update', e=>{
      const d = JSON.parse(e.data);
      crmNotify('Update ' + d.orderNo,'ok');
    });

    es.addEventListener('order_status', e=>{
      const d = JSON.parse(e.data);
      crmNotify(d.orderNo+' '+d.status,'warn');
    });
  } catch(e){}
}

document.addEventListener('DOMContentLoaded', initStream);

/* stable payment */
window.__payCache = window.__payCache || {};
function stablePay(order){
  if(!window.__payCache[order.id]) window.__payCache[order.id] = order.paymentMethodName;
  return window.__payCache[order.id];
}


/* ================= v1.0.46 CONTROL CLIENT ================= */

let ws;

function initControlStream(){
  // v1.0.50: disabled by default to avoid an extra failed websocket on every page load.
  if(!window.CRM_ENABLE_LEGACY_WS) return;
  try{
    ws = new WebSocket(location.origin.replace("http","ws"));

    ws.onmessage = (e)=>{
      try{
        const msg = JSON.parse(e.data);

        if(msg.type === "order_new"){
          crmNotify("NEW "+msg.orderNo,"info");
        }

        if(msg.type === "order_update"){
          crmNotify("UPDATE "+msg.orderNo,"ok");
        }

        if(msg.type === "risk_alert"){
          crmNotify("RISK "+msg.orderNo,"warn");
        }

      }catch(e){}
    }
  }catch(e){}
}

function getRiskBadge(order){
  const r = order.riskScore || 0;
  if(r > 70) return "🔴 HIGH RISK";
  if(r > 40) return "🟠 MEDIUM";
  return "🟢 LOW";
}

document.addEventListener("DOMContentLoaded", initControlStream);


/* ================= GOD MODE CLIENT ================= */

function getFraudBadge(score){
  if(score > 70) return "🔴 FRAUD RISK";
  if(score > 40) return "🟠 SUSPICIOUS";
  return "🟢 SAFE";
}

function attachOrderIntelligence(order){
  order.fraud = order.fraudScore || 0;
  order.risk = order.riskScore || 0;
  return order;
}

function renderGodMode(order){
  const f = order.fraudScore || 0;
  return `
    <div class="god-panel">
      <span>Risk: ${order.riskScore}</span>
      <span>Fraud: ${getFraudBadge(f)}</span>
    </div>
  `;
}


/* ================= FINAL BOSS UI v1.0.48 SAFE PATCH ================= */
function fixFlicker(order) {
  window.__paymentCache = window.__paymentCache || Object.create(null);
  if (!order) return 'Unknown';
  const key = String(order.id || order.orderNo || order.externalOrderNo || '');
  const value = displayPaymentMethodName(order) || order.paymentMethodName || order.payType || order.paymentMethod || '';
  if (value && value !== '-' && key) window.__paymentCache[key] = value;
  return (key && window.__paymentCache[key]) || value || 'Unknown';
}

function renderFinalOrder(order) {
  const risk = Number(order?.riskScore || order?.risk || 0);
  const pay = fixFlicker(order || {});
  return `
  <div class="order-card final">
    <div class="row">
      <b>Order:</b> ${escapeHtml(order?.orderNo || order?.externalOrderNo || order?.id || '-')}
    </div>
    <div class="row">
      <span class="pay">💳 ${escapeHtml(pay)}</span>
      <span class="risk">${risk > 70 ? '🔴 HIGH' : risk > 40 ? '🟠 MID' : '🟢 LOW'}</span>
    </div>
  </div>`;
}
