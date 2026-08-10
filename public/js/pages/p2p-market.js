// P2PFlow v1.4.16
// Live Binance-style P2P market advertisement browser.

function p2pMarketFmt(value, decimals = 2) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function p2pMarketPct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${p2pMarketFmt(n, 2)}%` : '-';
}

function p2pMarketMethodClass(name = '') {
  const key = String(name).toLowerCase();
  if (key.includes('bkash')) return 'bkash';
  if (key.includes('nagad')) return 'nagad';
  if (key.includes('rocket')) return 'rocket';
  if (key.includes('upay')) return 'upay';
  if (key.includes('bank')) return 'bank';
  return 'other';
}

function p2pMarketInitial(name = '') {
  const text = String(name || 'P').trim();
  return escapeHtml((text[0] || 'P').toUpperCase());
}


const P2P_MARKET_FILTER_STORAGE_VERSION = 1;
const P2P_MARKET_FILTER_DEFAULTS = Object.freeze({
  tradeType: 'BUY',
  asset: 'USDT',
  fiat: 'BDT',
  amount: '',
  payType: '',
  payTypes: [],
  publisherType: '',
  tradableOnly: false,
  merchantOnly: false,
  verifiedMerchantOnly: false,
  noVerificationRequired: false,
  paymentTime: 0,
  country: 'ALL',
  sortBy: 'price',
  saveFilter: false,
  page: 1,
  rows: 20
});

function p2pMarketFilterStorageKey() {
  const userRef = state.user?.id || state.user?.username || state.user?.email || 'default';
  return `manual-p2p-crm:p2p-market-filters:v${P2P_MARKET_FILTER_STORAGE_VERSION}:${String(userRef)}`;
}

function p2pMarketNormalizeFilters(source = {}) {
  const input = source && typeof source === 'object' ? source : {};
  const payTypes = Array.isArray(input.payTypes)
    ? input.payTypes
    : (input.payType ? [input.payType] : []);
  return {
    ...P2P_MARKET_FILTER_DEFAULTS,
    tradeType: String(input.tradeType || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
    asset: String(input.asset || 'USDT').toUpperCase(),
    fiat: String(input.fiat || 'BDT').toUpperCase(),
    amount: String(input.amount || '').trim(),
    payType: String(input.payType || '').trim(),
    payTypes: Array.from(new Set(payTypes.map(value => String(value || '').trim()).filter(Boolean))),
    publisherType: String(input.publisherType || '').trim(),
    tradableOnly: input.tradableOnly === true,
    merchantOnly: input.merchantOnly === true,
    verifiedMerchantOnly: input.verifiedMerchantOnly === true,
    noVerificationRequired: input.noVerificationRequired === true,
    paymentTime: Math.max(0, Number(input.paymentTime || 0) || 0),
    country: String(input.country || 'ALL').trim() || 'ALL',
    sortBy: ['price', 'trades', 'completion'].includes(String(input.sortBy || '').toLowerCase()) ? String(input.sortBy).toLowerCase() : 'price',
    saveFilter: input.saveFilter === true,
    page: Math.max(1, Number(input.page || 1) || 1),
    rows: 20
  };
}

function p2pMarketLoadSavedFilters() {
  if (state.p2pMarketPersistenceLoaded) return;
  state.p2pMarketPersistenceLoaded = true;
  const current = p2pMarketNormalizeFilters(state.p2pMarketFilters || {});
  try {
    const raw = localStorage.getItem(p2pMarketFilterStorageKey());
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && saved.saveFilter === true) {
      state.p2pMarketFilters = p2pMarketNormalizeFilters({ ...current, ...saved, page: 1 });
      return;
    }
  } catch {}
  state.p2pMarketFilters = current;
}

function p2pMarketPersistFilters() {
  const filters = p2pMarketNormalizeFilters(state.p2pMarketFilters || {});
  state.p2pMarketFilters = filters;
  try {
    if (filters.saveFilter) {
      localStorage.setItem(p2pMarketFilterStorageKey(), JSON.stringify({ ...filters, page: 1 }));
    } else {
      localStorage.removeItem(p2pMarketFilterStorageKey());
    }
  } catch {}
}

function p2pMarketCompactAmount(value, fiat = 'BDT') {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'Amount';
  let compact = '';
  if (amount >= 1000000) compact = `${Number((amount / 1000000).toFixed(amount % 1000000 ? 1 : 0))}M`;
  else if (amount >= 1000) compact = `${Number((amount / 1000).toFixed(amount % 1000 ? 1 : 0))}K`;
  else compact = amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(fiat || 'BDT').toUpperCase() === 'BDT' ? `Tk.${compact}` : `${compact} ${String(fiat || '').toUpperCase()}`;
}

function p2pMarketPaymentCatalog(data = state.p2pMarketData || {}) {
  const defaults = ['Bank Transfer', 'Nagad', 'Rocket', 'bKash', 'bKash Fast Payout', 'upay', 'Airtime Mobile Top-Up', 'Alipay', 'CIH Bank', 'Google Pay (GPay)', 'Lightning Nagad', 'Lightning bKash', 'Nagad Fast Payout', 'Perfect Money', 'Pyypl'];
  const live = Array.isArray(data.paymentMethods) ? data.paymentMethods : [];
  return Array.from(new Set([...defaults, ...live].filter(Boolean)));
}

function ensureP2pMarketState() {
  p2pMarketLoadSavedFilters();
  const f = state.p2pMarketFilters || (state.p2pMarketFilters = p2pMarketNormalizeFilters());
  if (!Array.isArray(f.payTypes)) {
    f.payTypes = f.payType ? [f.payType] : [];
  }
  if (typeof f.tradableOnly !== 'boolean') f.tradableOnly = false;
  if (typeof f.merchantOnly !== 'boolean') f.merchantOnly = false;
  if (typeof f.verifiedMerchantOnly !== 'boolean') f.verifiedMerchantOnly = false;
  if (typeof f.noVerificationRequired !== 'boolean') f.noVerificationRequired = false;
  if (typeof f.paymentTime !== 'number') f.paymentTime = Number(f.paymentTime || 0) || 0;
  if (!f.country) f.country = 'ALL';
  if (!f.sortBy) f.sortBy = 'price';
  if (typeof f.saveFilter !== 'boolean') f.saveFilter = false;
  state.p2pMarketUi = state.p2pMarketUi || {
    sheet: '',
    paymentSearch: '',
    paymentDraft: [...f.payTypes],
    amountDraft: String(f.amount || ''),
    filterDraft: null,
    orderContext: null,
    pullStartY: 0,
    pullCurrentY: 0,
    pulling: false
  };
  return { filters: f, ui: state.p2pMarketUi };
}

function p2pMarketSourceHtml() {
  return '<div class="p2p-market-source"><span class="p2p-market-source-live"><i class="p2p-market-live-dot"></i>Live</span><button type="button" id="p2pMarketRefreshBtn" class="p2p-market-refresh">Refresh</button></div>';
}

function p2pMarketResetInfiniteState() {
  if (state.p2pMarketInfiniteObserver) {
    try { state.p2pMarketInfiniteObserver.disconnect(); } catch {}
  }
  state.p2pMarketInfiniteObserver = null;
  state.p2pMarketPages = new Map();
  state.p2pMarketHasMore = true;
  state.p2pMarketNextPage = 1;
  state.p2pMarketData = null;
}

function p2pMarketStorePage(page, data = {}) {
  if (!(state.p2pMarketPages instanceof Map)) state.p2pMarketPages = new Map();
  state.p2pMarketPages.set(Math.max(1, Number(page || 1)), data);
}

function p2pMarketMergePages(fallback = {}) {
  const pages = state.p2pMarketPages instanceof Map
    ? [...state.p2pMarketPages.entries()].sort((a, b) => a[0] - b[0])
    : [];
  const items = [];
  const seen = new Set();
  const paymentMethods = new Set();
  let latest = fallback;
  pages.forEach(([, pageData]) => {
    latest = pageData || latest;
    (pageData?.paymentMethods || []).forEach(name => paymentMethods.add(name));
    (pageData?.items || []).forEach(item => {
      const key = String(item.advNo || `${item.advertiserNo || item.nickname || ''}:${item.price || ''}:${item.tradeType || ''}`);
      if (seen.has(key)) return;
      seen.add(key);
      items.push(item);
    });
  });
  return {
    ...latest,
    page: 1,
    rows: 20,
    total: items.length,
    items,
    paymentMethods: Array.from(paymentMethods),
    warnings: pages[0]?.[1]?.warnings || latest.warnings || []
  };
}

function p2pMarketBindInfiniteScroll() {
  const sentinel = $('#p2pMarketInfiniteSentinel');
  if (!sentinel || state.p2pMarketHasMore === false) return;
  if (state.p2pMarketInfiniteObserver) {
    try { state.p2pMarketInfiniteObserver.disconnect(); } catch {}
  }
  if ('IntersectionObserver' in window) {
    state.p2pMarketInfiniteObserver = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting);
      if (visible && state.page === 'p2p-market' && !state.p2pMarketLoading && state.p2pMarketHasMore !== false) {
        loadP2pMarket(true, { append: true, reset: false });
      }
    }, { root: null, rootMargin: '320px 0px', threshold: 0.01 });
    state.p2pMarketInfiniteObserver.observe(sentinel);
    return;
  }
  const onScroll = () => {
    if (state.page !== 'p2p-market' || state.p2pMarketLoading || state.p2pMarketHasMore === false) return;
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 420) {
      loadP2pMarket(true, { append: true, reset: false });
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true, once: true });
}

function p2pMarketSelectedPayments() {
  const { filters } = ensureP2pMarketState();
  return Array.from(new Set((filters.payTypes || []).map(value => String(value || '').trim()).filter(Boolean)));
}

function p2pMarketSetSelectedPayments(values = []) {
  const { filters } = ensureP2pMarketState();
  const next = Array.from(new Set((values || []).map(value => String(value || '').trim()).filter(Boolean)));
  filters.payTypes = next;
  filters.payType = next.length === 1 ? next[0] : '';
}

function p2pMarketPaymentLabel() {
  const selected = p2pMarketSelectedPayments();
  if (selected.length === 1) return { text: selected[0], active: true };
  return { text: 'Payment', active: selected.length > 1 };
}

function p2pMarketAmountLabel() {
  const { filters } = ensureP2pMarketState();
  return { text: p2pMarketCompactAmount(filters.amount, filters.fiat), active: !!filters.amount };
}

function p2pMarketCurrentActionText() {
  const { filters } = ensureP2pMarketState();
  return String(filters.tradeType || 'BUY').toUpperCase() === 'SELL' ? 'Sell' : 'Buy';
}

function p2pMarketMerchantBadge(item = {}) {
  if (!item.isMerchant) return '';
  const kind = item.merchantBadgeType === 'gold' ? 'gold' : 'blue';
  return `<span class="p2p-market-merchant-badge ${kind}" title="Merchant"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.6 5 12.4l1.4-1.4 2.8 2.8 8-8 1.4 1.4z"></path></svg></span>`;
}

function p2pMarketPaymentMethodsHtml(item = {}) {
  const methods = (item.paymentMethods || []).map(method => {
    const name = method.name || method.identifier || 'Payment';
    return `<span class="p2p-market-method ${p2pMarketMethodClass(name)}">${escapeHtml(name)}</span>`;
  }).join('');
  return methods || '<span class="p2p-market-method other">Payment</span>';
}

function p2pMarketAdCard(item = {}, index = 0) {
  const currentSide = String(state.p2pMarketFilters?.tradeType || item.tradeType || 'BUY').toUpperCase();
  const action = currentSide === 'SELL' ? 'Sell' : 'Buy';
  const completion = item.completionRate === null || item.completionRate === undefined ? '-' : p2pMarketPct(item.completionRate);
  const positive = item.positiveRate === null || item.positiveRate === undefined ? '-' : p2pMarketPct(item.positiveRate);
  const verificationTag = item.requiresVerification ? '<div class="p2p-market-mini-tag">Verification</div>' : '';
  const max = Number(item.maxAmount || 0) > 0 ? p2pMarketFmt(item.maxAmount, item.fiatScale ?? 2) : 'No maximum';
  const payTime = Number(item.payTimeLimit || 0) > 0 ? `${Number(item.payTimeLimit)} min` : 'Flexible';
  const actionText = action;
  return `<article class="p2p-market-ad" data-market-index="${index}">
    <div class="p2p-market-ad-main">
      <div class="p2p-market-advertiser">
        <span class="p2p-market-avatar">${p2pMarketInitial(item.nickname)}<i></i></span>
        <div class="p2p-market-advertiser-copy">
          <div><strong>${escapeHtml(item.nickname || 'P2P Advertiser')}</strong>${p2pMarketMerchantBadge(item)}</div>
          <p><span>Trade: ${Number(item.tradeCount || 0).toLocaleString()} Trades (${completion})</span><em></em><span class="p2p-market-like">👍</span><span>${positive}</span></p>
        </div>
      </div>
      <div class="p2p-market-price"><small>Tk.</small><b>${p2pMarketFmt(item.price, item.priceScale ?? 2)}</b><span>/${escapeHtml(item.asset || 'USDT')}</span></div>
      <div class="p2p-market-limits"><span>Limit</span><b>${p2pMarketFmt(item.minAmount, item.fiatScale ?? 2)} - ${max} ${escapeHtml(item.fiat || 'BDT')}</b></div>
      <div class="p2p-market-limits"><span>Available</span><b>${p2pMarketFmt(item.available, 2)} ${escapeHtml(item.asset || 'USDT')}</b></div>
      ${verificationTag}
    </div>
    <aside class="p2p-market-ad-side">
      <div class="p2p-market-methods">${p2pMarketPaymentMethodsHtml(item)}</div>
      <div class="p2p-market-time"><span>◷</span>${escapeHtml(payTime)}</div>
      <button type="button" class="p2p-market-action ${action.toLowerCase()}" data-market-open="${index}" ${item.isTradable === false ? 'disabled' : ''}>${actionText}</button>
    </aside>
  </article>`;
}

function p2pMarketVisibleItems(data = state.p2pMarketData || {}) {
  const { filters } = ensureP2pMarketState();
  let items = Array.isArray(data.items) ? [...data.items] : [];
  const selectedPayments = p2pMarketSelectedPayments().map(value => value.toLowerCase());
  if (selectedPayments.length) {
    items = items.filter(item => (item.paymentMethods || []).some(method => selectedPayments.includes(String(method.name || method.identifier || '').toLowerCase())));
  }
  if (filters.tradableOnly) items = items.filter(item => item.isTradable !== false);
  if (filters.merchantOnly) items = items.filter(item => item.isMerchant === true);
  if (filters.verifiedMerchantOnly) items = items.filter(item => item.verified === true || item.isMerchant === true);
  if (filters.noVerificationRequired) items = items.filter(item => item.requiresVerification !== true);
  if (Number(filters.paymentTime || 0) > 0) items = items.filter(item => Number(item.payTimeLimit || 0) === Number(filters.paymentTime || 0));
  if (filters.country && filters.country !== 'ALL') {
    const country = String(filters.country || '').toLowerCase();
    items = items.filter(item => [item.countryCode, item.countryName].some(value => String(value || '').toLowerCase() === country));
  }
  if (filters.sortBy === 'trades') items.sort((a, b) => Number(b.tradeCount || 0) - Number(a.tradeCount || 0));
  else if (filters.sortBy === 'completion') items.sort((a, b) => Number(b.completionRate || 0) - Number(a.completionRate || 0));
  else items.sort((a, b) => String(filters.tradeType || 'BUY').toUpperCase() === 'SELL' ? Number(b.price || 0) - Number(a.price || 0) : Number(a.price || 0) - Number(b.price || 0));
  return items;
}

function p2pMarketResultHtml(data = {}) {
  const items = p2pMarketVisibleItems(data);
  state.p2pMarketVisibleItems = items;
  const warnings = (data.warnings || []).map(text => `<div class="notice small warn">${escapeHtml(text)}</div>`).join('');
  const cards = items.length
    ? items.map(p2pMarketAdCard).join('')
    : `<div class="p2p-market-empty"><strong>No advertisements found</strong><span>Change the amount, payment method or filters and try again.</span></div>`;
  const hasMore = state.p2pMarketHasMore !== false;
  return `${warnings}
    <div class="p2p-market-list">${cards}</div>
    <div id="p2pMarketInfiniteSentinel" class="p2p-market-infinite-sentinel" aria-live="polite">
      ${hasMore ? '<span class="p2p-market-infinite-spinner"></span><small>Scroll down for more</small>' : '<small>All advertisements loaded</small>'}
    </div>`;
}

function p2pMarketFilterDraft() {
  const { filters, ui } = ensureP2pMarketState();
  if (!ui.filterDraft) {
    ui.filterDraft = {
      saveFilter: !!filters.saveFilter,
      tradableOnly: !!filters.tradableOnly,
      merchantOnly: !!filters.merchantOnly,
      verifiedMerchantOnly: !!filters.verifiedMerchantOnly,
      noVerificationRequired: !!filters.noVerificationRequired,
      amount: String(filters.amount || ''),
      paymentTime: Number(filters.paymentTime || 0) || 0,
      payTypes: [...p2pMarketSelectedPayments()],
      country: filters.country || 'ALL',
      sortBy: filters.sortBy || 'price'
    };
  }
  return ui.filterDraft;
}

function p2pMarketFilterSheetHtml() {
  const draft = p2pMarketFilterDraft();
  const amountChips = [['900','Tk.900'], ['5000','Tk.5K'], ['30000','Tk.30K'], ['50000','Tk.50K']];
  const paymentTimes = [0, 15, 30, 45, 60, 120, 180, 360];
  const countries = [
    { value: 'ALL', label: 'All' },
    { value: 'Armenia', label: 'Armenia' },
    { value: 'Austria', label: 'Austria' },
    { value: 'Bangladesh', label: 'Bangladesh' },
    { value: 'Egypt', label: 'Egypt' },
    { value: 'India', label: 'India' }
  ];
  const paymentButtons = p2pMarketPaymentCatalog().map(name => `<button type="button" class="p2p-market-option-chip ${draft.payTypes.includes(name) ? 'active' : ''}" data-filter-payment="${escapeAttr(name)}">${escapeHtml(name)}</button>`).join('');
  return `<div class="p2p-market-overlay open full" id="p2pMarketOverlayBackdrop"><div class="p2p-market-sheet full-sheet" role="dialog" aria-modal="true">
    <div class="p2p-market-filter-screen-head"><button type="button" class="p2p-market-back plain" id="p2pMarketFilterBackBtn" aria-label="Back">←</button><h3>Filter</h3></div>
    <div class="p2p-market-filter-scroll">
      <div class="p2p-market-switch-row"><span>Save filter for next use <small>ⓘ</small></span><button type="button" class="p2p-market-switch ${draft.saveFilter ? 'on' : ''}" data-filter-toggle="saveFilter"><i></i></button></div>
      <section class="p2p-market-filter-section">
        <h4>Ad Type</h4>
        <div class="p2p-market-switch-list">
          <div class="p2p-market-switch-row"><span>Tradable Ads Only <small>ⓘ</small></span><button type="button" class="p2p-market-switch ${draft.tradableOnly ? 'on' : ''}" data-filter-toggle="tradableOnly"><i></i></button></div>
          <div class="p2p-market-switch-row"><span>Pro Merchant Ads only</span><button type="button" class="p2p-market-switch ${draft.merchantOnly ? 'on' : ''}" data-filter-toggle="merchantOnly"><i></i></button></div>
          <div class="p2p-market-switch-row"><span>Verified Merchant Ads only</span><button type="button" class="p2p-market-switch ${draft.verifiedMerchantOnly ? 'on' : ''}" data-filter-toggle="verifiedMerchantOnly"><i></i></button></div>
          <div class="p2p-market-switch-row"><span>Ads With No Verification Required <small>ⓘ</small></span><button type="button" class="p2p-market-switch ${draft.noVerificationRequired ? 'on' : ''}" data-filter-toggle="noVerificationRequired"><i></i></button></div>
          <div class="p2p-market-switch-row"><span>Advertisers You've Traded With <small>ⓘ</small></span><button type="button" class="p2p-market-switch disabled"><i></i></button></div>
          <div class="p2p-market-switch-row"><span>Advertisers You Follow <small>ⓘ</small></span><button type="button" class="p2p-market-switch disabled"><i></i></button></div>
        </div>
      </section>
      <section class="p2p-market-filter-section">
        <h4>Amount</h4>
        <div class="p2p-market-amount-input-wrap"><input id="p2pMarketFilterAmountInput" type="number" min="0" step="0.01" value="${escapeAttr(draft.amount || '')}" placeholder="Enter total amount" inputmode="decimal"><span>BDT</span></div>
        <div class="p2p-market-quick-row">${amountChips.map(([value, label]) => `<button type="button" class="p2p-market-quick-chip ${String(draft.amount || '') === value ? 'active' : ''}" data-filter-amount="${value}">${label}</button>`).join('')}</div>
      </section>
      <section class="p2p-market-filter-section">
        <h4>Payment Time Limit (minutes)</h4>
        <div class="p2p-market-chip-grid time">${paymentTimes.map(value => `<button type="button" class="p2p-market-quick-chip ${Number(draft.paymentTime || 0) === value ? 'active' : ''}" data-filter-time="${value}">${value === 0 ? 'All' : value}</button>`).join('')}</div>
      </section>
      <section class="p2p-market-filter-section">
        <div class="p2p-market-section-head-inline"><h4>Payment Method(s) <small>ⓘ</small></h4><span>All</span></div>
        <div class="p2p-market-chip-grid">${`<button type="button" class="p2p-market-option-chip ${draft.payTypes.length ? '' : 'active'}" data-filter-payment-all="1">All</button>` + paymentButtons}</div>
      </section>
      <section class="p2p-market-filter-section">
        <div class="p2p-market-section-head-inline"><h4>Country/Region <small>ⓘ</small></h4><span>All</span></div>
        <div class="p2p-market-chip-grid">${countries.map(country => `<button type="button" class="p2p-market-option-chip ${draft.country === country.value ? 'active' : ''}" data-filter-country="${escapeAttr(country.value)}">${escapeHtml(country.label)}</button>`).join('')}</div>
      </section>
      <section class="p2p-market-filter-section sort">
        <h4>Sort by</h4>
        <label class="p2p-market-radio-row"><span>Price</span><input type="radio" name="p2pMarketSortBy" value="price" ${draft.sortBy === 'price' ? 'checked' : ''}></label>
        <label class="p2p-market-radio-row"><span>Trades</span><input type="radio" name="p2pMarketSortBy" value="trades" ${draft.sortBy === 'trades' ? 'checked' : ''}></label>
        <label class="p2p-market-radio-row"><span>Completion</span><input type="radio" name="p2pMarketSortBy" value="completion" ${draft.sortBy === 'completion' ? 'checked' : ''}></label>
      </section>
    </div>
    <div class="p2p-market-sheet-actions sticky"><button type="button" class="ghost" id="p2pMarketFilterResetBtn">Reset</button><button type="button" class="primary" id="p2pMarketFilterConfirmBtn">Confirm</button></div>
  </div></div>`;
}

function p2pMarketPaymentSheetHtml() {
  const { ui } = ensureP2pMarketState();
  const search = String(ui.paymentSearch || '').trim().toLowerCase();
  const selected = Array.isArray(ui.paymentDraft) ? ui.paymentDraft : [];
  const methods = p2pMarketPaymentCatalog().filter(name => !search || String(name).toLowerCase().includes(search));
  return `<div class="p2p-market-overlay open" id="p2pMarketOverlayBackdrop"><div class="p2p-market-sheet bottom-sheet" role="dialog" aria-modal="true">
    <div class="p2p-market-sheet-grab"></div>
    <div class="p2p-market-sheet-body compact">
      <h3>Pay With <small>ⓘ</small></h3>
      <div class="p2p-market-search-box"><input id="p2pMarketPaymentSearch" type="search" placeholder="Search" value="${escapeAttr(ui.paymentSearch || '')}"></div>
      <div class="p2p-market-chip-grid">
        <button type="button" class="p2p-market-option-chip ${selected.length ? '' : 'active'}" data-payment-all="1">All</button>
        ${methods.map(name => `<button type="button" class="p2p-market-option-chip ${selected.includes(name) ? 'active' : ''}" data-payment-method="${escapeAttr(name)}">${escapeHtml(name)}</button>`).join('')}
      </div>
      <div class="p2p-market-sheet-actions"><button type="button" class="ghost" id="p2pMarketPaymentResetBtn">Reset</button><button type="button" class="primary" id="p2pMarketPaymentConfirmBtn">Confirm</button></div>
    </div>
  </div></div>`;
}

function p2pMarketAmountSheetHtml() {
  const { ui, filters } = ensureP2pMarketState();
  const currentSide = String(state.p2pMarketFilters?.tradeType || ui.orderContext?.tradeType || 'BUY').toUpperCase();
  const action = currentSide === 'SELL' ? 'Sell' : 'Buy';
  const title = `I Want to ${action}`;
  const amount = escapeAttr(ui.amountDraft || '');
  const chips = [['900','Tk.900'], ['5000','Tk.5K'], ['30000','Tk.30K'], ['50000','Tk.50K']];
  const subtitle = ui.orderContext ? `<p class="p2p-market-sheet-sub">${escapeHtml(ui.orderContext.nickname || '')} · Tk.${p2pMarketFmt(ui.orderContext.price, ui.orderContext.priceScale ?? 2)} / ${escapeHtml(ui.orderContext.asset || filters.asset || 'USDT')}</p>` : '';
  return `<div class="p2p-market-overlay open" id="p2pMarketOverlayBackdrop"><div class="p2p-market-sheet bottom-sheet" role="dialog" aria-modal="true">
    <div class="p2p-market-sheet-grab"></div>
    <div class="p2p-market-sheet-body compact">
      <h3>${title}</h3>
      ${subtitle}
      <div class="p2p-market-amount-input-wrap"><input id="p2pMarketAmountSheetInput" type="number" min="0" step="0.01" value="${amount}" placeholder="Enter total amount" inputmode="decimal"><span>${escapeHtml(filters.fiat || 'BDT')}</span></div>
      <div class="p2p-market-quick-row">${chips.map(([value, label]) => `<button type="button" class="p2p-market-quick-chip ${String(ui.amountDraft || '') === value ? 'active' : ''}" data-sheet-amount="${value}">${label}</button>`).join('')}</div>
      <div class="p2p-market-sheet-actions"><button type="button" class="ghost" id="p2pMarketAmountResetBtn">Reset</button><button type="button" class="primary" id="p2pMarketAmountConfirmBtn">Confirm</button></div>
    </div>
  </div></div>`;
}

function renderP2pMarketOverlay() {
  const root = $('#p2pMarketOverlayRoot');
  if (!root) return;
  const { ui } = ensureP2pMarketState();
  if (ui.sheet === 'payment') root.innerHTML = p2pMarketPaymentSheetHtml();
  else if (ui.sheet === 'amount') root.innerHTML = p2pMarketAmountSheetHtml();
  else if (ui.sheet === 'filter') root.innerHTML = p2pMarketFilterSheetHtml();
  else root.innerHTML = '';
  document.body.classList.toggle('p2p-market-sheet-open', !!ui.sheet);
  bindP2pMarketOverlayActions();
}

function closeP2pMarketOverlay() {
  const { ui } = ensureP2pMarketState();
  ui.sheet = '';
  ui.paymentSearch = '';
  ui.filterDraft = null;
  ui.orderContext = null;
  document.body.classList.remove('p2p-market-sheet-open');
  renderP2pMarketOverlay();
}

function openP2pMarketPaymentSheet() {
  const { ui } = ensureP2pMarketState();
  ui.sheet = 'payment';
  ui.paymentDraft = [...p2pMarketSelectedPayments()];
  ui.paymentSearch = '';
  renderP2pMarketOverlay();
}

function openP2pMarketAmountSheet(item = null) {
  const { filters, ui } = ensureP2pMarketState();
  ui.sheet = 'amount';
  ui.orderContext = item || null;
  ui.amountDraft = String(filters.amount || '');
  renderP2pMarketOverlay();
}

function openP2pMarketFilterSheet() {
  const { ui } = ensureP2pMarketState();
  ui.sheet = 'filter';
  ui.filterDraft = null;
  renderP2pMarketOverlay();
}

function refreshP2pMarketFilterButtons() {
  const paymentMeta = p2pMarketPaymentLabel();
  const amountMeta = p2pMarketAmountLabel();
  const paymentChip = $('#p2pMarketPaymentChip');
  const paymentText = $('#p2pMarketPaymentChipLabel');
  if (paymentChip && paymentText) {
    paymentText.textContent = paymentMeta.text;
    paymentChip.classList.toggle('active', paymentMeta.active);
  }
  const amountChip = $('#p2pMarketAmountChip');
  const amountText = $('#p2pMarketAmountChipLabel');
  if (amountChip && amountText) {
    amountText.textContent = amountMeta.text;
    amountChip.classList.toggle('active', amountMeta.active);
  }
}

function bindP2pMarketResultActions() {
  $('#p2pMarketRefreshBtn')?.addEventListener('click', () => loadP2pMarket(true, { background: false, reset: true }));
  $$('[data-market-open]').forEach(button => button.onclick = () => {
    const item = state.p2pMarketVisibleItems?.[Number(button.dataset.marketOpen)];
    if (item) openP2pMarketAmountSheet(item);
  });
  p2pMarketBindInfiniteScroll();
}

function bindP2pMarketOverlayActions() {
  const root = $('#p2pMarketOverlayRoot');
  if (!root || !root.firstElementChild) return;
  $('#p2pMarketOverlayBackdrop')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeP2pMarketOverlay();
  });

  $('#p2pMarketPaymentSearch')?.addEventListener('input', event => {
    ensureP2pMarketState().ui.paymentSearch = event.target.value;
    renderP2pMarketOverlay();
  });
  $$('[data-payment-method]').forEach(button => button.onclick = () => {
    const { ui } = ensureP2pMarketState();
    const value = button.dataset.paymentMethod;
    ui.paymentDraft = Array.isArray(ui.paymentDraft) ? [...ui.paymentDraft] : [];
    if (ui.paymentDraft.includes(value)) ui.paymentDraft = ui.paymentDraft.filter(item => item !== value);
    else ui.paymentDraft.push(value);
    renderP2pMarketOverlay();
  });
  $$('[data-payment-all]').forEach(button => button.onclick = () => {
    ensureP2pMarketState().ui.paymentDraft = [];
    renderP2pMarketOverlay();
  });
  $('#p2pMarketPaymentResetBtn')?.addEventListener('click', () => {
    ensureP2pMarketState().ui.paymentDraft = [];
    renderP2pMarketOverlay();
  });
  $('#p2pMarketPaymentConfirmBtn')?.addEventListener('click', () => {
    const { ui, filters } = ensureP2pMarketState();
    p2pMarketSetSelectedPayments(ui.paymentDraft || []);
    filters.page = 1;
    p2pMarketPersistFilters();
    closeP2pMarketOverlay();
    refreshP2pMarketFilterButtons();
    loadP2pMarket(true, { background: false });
  });

  $('#p2pMarketAmountSheetInput')?.addEventListener('input', event => {
    ensureP2pMarketState().ui.amountDraft = event.target.value;
  });
  $$('[data-sheet-amount]').forEach(button => button.onclick = () => {
    ensureP2pMarketState().ui.amountDraft = button.dataset.sheetAmount;
    renderP2pMarketOverlay();
  });
  $('#p2pMarketAmountResetBtn')?.addEventListener('click', () => {
    ensureP2pMarketState().ui.amountDraft = '';
    renderP2pMarketOverlay();
  });
  $('#p2pMarketAmountConfirmBtn')?.addEventListener('click', () => {
    const { filters, ui } = ensureP2pMarketState();
    filters.amount = String(ui.amountDraft || '').trim();
    filters.page = 1;
    p2pMarketPersistFilters();
    closeP2pMarketOverlay();
    refreshP2pMarketFilterButtons();
    loadP2pMarket(true, { background: false });
  });

  $('#p2pMarketFilterBackBtn')?.addEventListener('click', closeP2pMarketOverlay);
  $$('[data-filter-toggle]').forEach(button => button.onclick = () => {
    const draft = p2pMarketFilterDraft();
    const key = button.dataset.filterToggle;
    draft[key] = !draft[key];
    renderP2pMarketOverlay();
  });
  $('#p2pMarketFilterAmountInput')?.addEventListener('input', event => {
    p2pMarketFilterDraft().amount = event.target.value;
  });
  $$('[data-filter-amount]').forEach(button => button.onclick = () => {
    p2pMarketFilterDraft().amount = button.dataset.filterAmount;
    renderP2pMarketOverlay();
  });
  $$('[data-filter-time]').forEach(button => button.onclick = () => {
    p2pMarketFilterDraft().paymentTime = Number(button.dataset.filterTime || 0) || 0;
    renderP2pMarketOverlay();
  });
  $$('[data-filter-payment]').forEach(button => button.onclick = () => {
    const draft = p2pMarketFilterDraft();
    const value = button.dataset.filterPayment;
    draft.payTypes = Array.isArray(draft.payTypes) ? [...draft.payTypes] : [];
    if (draft.payTypes.includes(value)) draft.payTypes = draft.payTypes.filter(item => item !== value);
    else draft.payTypes.push(value);
    renderP2pMarketOverlay();
  });
  $$('[data-filter-payment-all]').forEach(button => button.onclick = () => {
    p2pMarketFilterDraft().payTypes = [];
    renderP2pMarketOverlay();
  });
  $$('[data-filter-country]').forEach(button => button.onclick = () => {
    p2pMarketFilterDraft().country = button.dataset.filterCountry;
    renderP2pMarketOverlay();
  });
  $$('input[name="p2pMarketSortBy"]').forEach(input => input.onchange = () => {
    if (input.checked) p2pMarketFilterDraft().sortBy = input.value;
  });
  $('#p2pMarketFilterResetBtn')?.addEventListener('click', () => {
    const { ui } = ensureP2pMarketState();
    ui.filterDraft = {
      saveFilter: false,
      tradableOnly: false,
      merchantOnly: false,
      verifiedMerchantOnly: false,
      noVerificationRequired: false,
      amount: '',
      paymentTime: 0,
      payTypes: [],
      country: 'ALL',
      sortBy: 'price'
    };
    renderP2pMarketOverlay();
  });
  $('#p2pMarketFilterConfirmBtn')?.addEventListener('click', () => {
    const { filters, ui } = ensureP2pMarketState();
    const draft = p2pMarketFilterDraft();
    filters.saveFilter = !!draft.saveFilter;
    filters.tradableOnly = !!draft.tradableOnly;
    filters.merchantOnly = !!draft.merchantOnly;
    filters.verifiedMerchantOnly = !!draft.verifiedMerchantOnly;
    filters.noVerificationRequired = !!draft.noVerificationRequired;
    filters.amount = String(draft.amount || '').trim();
    filters.paymentTime = Number(draft.paymentTime || 0) || 0;
    filters.country = draft.country || 'ALL';
    filters.sortBy = draft.sortBy || 'price';
    p2pMarketSetSelectedPayments(draft.payTypes || []);
    filters.page = 1;
    p2pMarketPersistFilters();
    ui.filterDraft = null;
    closeP2pMarketOverlay();
    refreshP2pMarketFilterButtons();
    loadP2pMarket(true, { background: false });
  });
}

function p2pMarketQueryString(refresh = false, page = 1) {
  const { filters } = ensureP2pMarketState();
  const params = new URLSearchParams({
    tradeType: filters.tradeType || 'BUY',
    asset: filters.asset || 'USDT',
    fiat: filters.fiat || 'BDT',
    page: String(Math.max(1, Number(page || 1) || 1)),
    rows: '20',
    sort: filters.sortBy || 'price'
  });
  if (filters.amount) params.set('amount', String(filters.amount));
  const selectedPayments = p2pMarketSelectedPayments();
  if (selectedPayments.length) params.set('payTypes', selectedPayments.join(','));
  if (filters.merchantOnly) params.set('publisherType', 'merchant');
  if (filters.tradableOnly) params.set('tradableOnly', '1');
  if (filters.verifiedMerchantOnly) params.set('verifiedMerchantOnly', '1');
  if (filters.noVerificationRequired) params.set('noVerificationRequired', '1');
  if (Number(filters.paymentTime || 0) > 0) params.set('paymentTime', String(Number(filters.paymentTime || 0)));
  if (filters.country && filters.country !== 'ALL') params.set('country', filters.country);
  if (refresh) params.set('refresh', '1');
  params.set('_', String(Date.now()));
  return params.toString();
}

async function loadP2pMarket(refresh = false, options = {}) {
  if (state.p2pMarketLoading) return;
  const result = $('#p2pMarketResults');
  if (!result) return;

  const background = !!options.background;
  const append = !!options.append;
  const shouldReset = options.reset === true || (!append && !background && options.reset !== false);
  if (shouldReset) p2pMarketResetInfiniteState();

  const page = append
    ? Math.max(1, Number(state.p2pMarketNextPage || 1))
    : Math.max(1, Number(options.page || 1));
  const top = $('#p2pMarketResultsTop');

  state.p2pMarketLoading = true;
  result.classList.add('loading');
  if (!background && !append && !state.p2pMarketData) {
    result.innerHTML = '<div class="p2p-market-loading"><span></span><span></span><span></span></div>';
  } else if (append) {
    const sentinel = $('#p2pMarketInfiniteSentinel');
    if (sentinel) sentinel.innerHTML = '<span class="p2p-market-infinite-spinner"></span><small>Loading 20 more...</small>';
  }

  try {
    const data = await api(`/api/p2p-market?${p2pMarketQueryString(refresh, page)}`, { silent: true, noAutoReload: true });
    const previousHasMore = state.p2pMarketHasMore;
    const previousNextPage = state.p2pMarketNextPage;
    p2pMarketStorePage(page, data);
    const pageHasMore = data.hasMore !== false && Number(data.rawCount ?? data.items?.length ?? 0) >= 20;
    if (background && page === 1 && state.p2pMarketPages instanceof Map && state.p2pMarketPages.size > 1) {
      state.p2pMarketHasMore = previousHasMore;
      state.p2pMarketNextPage = previousNextPage;
    } else {
      state.p2pMarketHasMore = pageHasMore;
      state.p2pMarketNextPage = pageHasMore ? page + 1 : page;
    }
    state.p2pMarketData = p2pMarketMergePages(data);
    state.p2pMarketFilters.page = 1;
    state.p2pMarketFilters.rows = 20;

    if (top) top.innerHTML = p2pMarketSourceHtml();
    result.innerHTML = p2pMarketResultHtml(state.p2pMarketData);
    bindP2pMarketResultActions();
    if (top) applyLanguage(top);
    applyLanguage(result);
  } catch (err) {
    if (!append) {
      if (top) top.innerHTML = p2pMarketSourceHtml();
      result.innerHTML = `<div class="p2p-market-empty error-state"><strong>Could not load Binance advertisements</strong><span>${escapeHtml(err.message || 'Unknown error')}</span><button id="p2pMarketRetryBtn" type="button">Try Again</button></div>`;
      $('#p2pMarketRetryBtn')?.addEventListener('click', () => loadP2pMarket(true, { background: false, reset: true }));
    } else {
      state.p2pMarketHasMore = true;
      const sentinel = $('#p2pMarketInfiniteSentinel');
      if (sentinel) sentinel.innerHTML = '<button type="button" id="p2pMarketLoadMoreRetry" class="ghost">Retry loading more</button>';
      $('#p2pMarketLoadMoreRetry')?.addEventListener('click', () => loadP2pMarket(true, { append: true }));
    }
  } finally {
    result.classList.remove('loading');
    state.p2pMarketLoading = false;
  }
}

function bindP2pMarketPullToRefresh() {
  const shell = $('#p2pMarketShell');
  const hint = $('#p2pMarketPullHint');
  if (!shell || !hint) return;
  const { ui } = ensureP2pMarketState();
  const finish = (trigger = false) => {
    if (!ui.pulling) return;
    const delta = Math.max(0, Number(ui.pullCurrentY || 0) - Number(ui.pullStartY || 0));
    hint.classList.remove('show', 'ready');
    if (trigger && delta > 80) renderP2pMarket();
    ui.pulling = false;
    ui.pullStartY = 0;
    ui.pullCurrentY = 0;
  };
  shell.addEventListener('touchstart', event => {
    if (window.scrollY > 0 || state.p2pMarketLoading) return;
    ui.pulling = true;
    ui.pullStartY = event.touches[0].clientY;
    ui.pullCurrentY = ui.pullStartY;
  }, { passive: true });
  shell.addEventListener('touchmove', event => {
    if (!ui.pulling) return;
    ui.pullCurrentY = event.touches[0].clientY;
    const delta = Math.max(0, ui.pullCurrentY - ui.pullStartY);
    if (delta > 12) {
      hint.classList.add('show');
      hint.classList.toggle('ready', delta > 80);
      hint.textContent = delta > 80 ? 'Release to refresh' : 'Pull down to refresh';
    }
  }, { passive: true });
  shell.addEventListener('touchend', () => finish(true));
  shell.addEventListener('touchcancel', () => finish(false));
}

async function renderP2pMarket() {
  ensureP2pMarketState();
  setTitle('P2P Market');
  const f = state.p2pMarketFilters;
  f.page = 1;
  f.rows = 20;
  p2pMarketResetInfiniteState();
  const paymentMeta = p2pMarketPaymentLabel();
  const amountMeta = p2pMarketAmountLabel();
  $('#content').innerHTML = `<section class="p2p-market-shell" id="p2pMarketShell">
    <div id="p2pMarketPullHint" class="p2p-market-pull-hint">Pull down to refresh</div>
    <div id="p2pMarketResultsTop">${p2pMarketSourceHtml()}</div>
    <div class="p2p-market-mobile-head">
      <button type="button" id="p2pMarketBackBtn" class="p2p-market-back" aria-label="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg></button>
      <h2>P2P</h2>
      <div class="p2p-market-fiat-box"><select id="p2pMarketFiat" name="fiat" aria-label="Fiat currency">${['BDT','USD','EUR','GBP','AED','INR'].map(value => `<option value="${value}" ${f.fiat === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>
    </div>
    <div class="p2p-market-filter-wrap">
      <div class="p2p-market-primary-filter">
        <div class="p2p-market-side-toggle" role="group" aria-label="Trade side">
          <button type="button" data-market-side="BUY" class="${f.tradeType === 'BUY' ? 'active' : ''}">Buy</button>
          <button type="button" data-market-side="SELL" class="${f.tradeType === 'SELL' ? 'active' : ''}">Sell</button>
        </div>
      </div>
      <div class="p2p-market-secondary-filter">
        <label class="p2p-market-chip-select asset"><span class="p2p-market-coin">₮</span><select id="p2pMarketAsset" name="asset" aria-label="Asset">${['USDT','USDC','FDUSD','BTC','ETH','BNB'].map(value => `<option value="${value}" ${f.asset === value ? 'selected' : ''}>${value}</option>`).join('')}</select><i aria-hidden="true"></i></label>
        <button type="button" class="p2p-market-chip-select ${amountMeta.active ? 'active' : ''}" id="p2pMarketAmountChip"><span id="p2pMarketAmountChipLabel">${escapeHtml(amountMeta.text)}</span><i aria-hidden="true"></i></button>
        <button type="button" class="p2p-market-chip-select ${paymentMeta.active ? 'active' : ''}" id="p2pMarketPaymentChip"><span id="p2pMarketPaymentChipLabel">${escapeHtml(paymentMeta.text)}</span><i aria-hidden="true"></i></button>
        <button type="button" class="p2p-market-filter-button" id="p2pMarketFilterBtn" aria-label="Filters"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.5h17L14 13v5.2l-4 2.3V13L3.5 5.5Z"></path></svg><span></span></button>
      </div>
    </div>
    <div id="p2pMarketResults"></div>
    <div id="p2pMarketOverlayRoot"></div>
  </section>`;

  $('#p2pMarketBackBtn').onclick = () => setRoute(canPage('dashboard') ? 'dashboard' : visiblePages()[0]?.[0]);
  $$('[data-market-side]').forEach(button => button.onclick = () => {
    const { filters } = ensureP2pMarketState();
    filters.tradeType = button.dataset.marketSide;
    filters.page = 1;
    p2pMarketPersistFilters();
    $$('[data-market-side]').forEach(item => item.classList.toggle('active', item === button));
    loadP2pMarket(true, { background: false });
  });
  $('#p2pMarketAsset').onchange = () => {
    const { filters } = ensureP2pMarketState();
    filters.asset = $('#p2pMarketAsset').value;
    filters.page = 1;
    p2pMarketPersistFilters();
    loadP2pMarket(true, { background: false });
  };
  $('#p2pMarketFiat').onchange = () => {
    const { filters } = ensureP2pMarketState();
    filters.fiat = $('#p2pMarketFiat').value;
    filters.page = 1;
    p2pMarketPersistFilters();
    refreshP2pMarketFilterButtons();
    loadP2pMarket(true, { background: false });
  };
  $('#p2pMarketAmountChip').onclick = () => openP2pMarketAmountSheet();
  $('#p2pMarketPaymentChip').onclick = openP2pMarketPaymentSheet;
  $('#p2pMarketFilterBtn').onclick = openP2pMarketFilterSheet;

  bindP2pMarketPullToRefresh();
  clearInterval(state.p2pMarketRefreshTimer);
  state.p2pMarketRefreshTimer = setInterval(() => {
    if (state.page === 'p2p-market' && !document.hidden) loadP2pMarket(true, { background: true });
  }, 5000);
  refreshP2pMarketFilterButtons();
  renderP2pMarketOverlay();
  await loadP2pMarket(true, { background: false });
}
