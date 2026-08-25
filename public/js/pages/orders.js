// P2PFlow v1.7.2
// Page module: orders. Edit this file for the orders page UI.

function orderAccountOptions(data = {}) {
  return Array.isArray(data.credentialOptions) ? data.credentialOptions : [];
}

function orderAccountHasPermission(option, permission) {
  return Boolean(option && !option.disabled && Array.isArray(option.permissions) && option.permissions.includes(permission));
}

function orderAccountDisplayName(value = {}) {
  return value.displayName || value.p2pUsername || value.nickname || value.binanceAccount?.displayName || value.binanceAccount?.p2pUsername || value.binanceAccount?.name || value.credentialDisplayName || value.credentialName || (value.id || value.credentialId ? `API ${value.id || value.credentialId}` : 'Unassigned account');
}

function orderSourceAccountHtml(order = {}) {
  if (order.orderSource === 'offline') return '<span class="binance-account-badge offline">Local</span>';
  return `<span class="binance-account-badge" title="${escapeAttr(order.binanceAccount?.accountName || order.credentialName || 'Binance P2P account')}">${escapeHtml(orderAccountDisplayName(order))}</span>`;
}

const ORDER_FILTER_STORAGE_VERSION = 1;
const ORDER_RENDER_BATCH_SIZE = 120;

function orderRenderLimitKey(scope, tabKey) {
  return `${String(scope || 'ongoing')}:${String(tabKey || 'all')}`;
}

function ensureOrderRenderLimits() {
  if (!state.orderRenderLimits || typeof state.orderRenderLimits !== 'object') state.orderRenderLimits = {};
  return state.orderRenderLimits;
}

function orderRenderLimit(scope, tabKey, total=0) {
  const limits = ensureOrderRenderLimits();
  const key = orderRenderLimitKey(scope, tabKey);
  const configured = Math.max(ORDER_RENDER_BATCH_SIZE, Number(limits[key] || ORDER_RENDER_BATCH_SIZE));
  return Math.min(Math.max(0, Number(total || 0)), configured);
}

function resetOrderRenderLimits(scope='', tabKey='') {
  if (!scope) {
    state.orderRenderLimits = {};
    return;
  }
  const limits = ensureOrderRenderLimits();
  delete limits[orderRenderLimitKey(scope, tabKey || state.orderActiveTabs?.[scope] || 'all')];
}

function growOrderRenderLimit(scope, tabKey, total=0) {
  const limits = ensureOrderRenderLimits();
  const key = orderRenderLimitKey(scope, tabKey);
  const current = Math.max(ORDER_RENDER_BATCH_SIZE, Number(limits[key] || ORDER_RENDER_BATCH_SIZE));
  limits[key] = Math.min(Math.max(0, Number(total || 0)), current + ORDER_RENDER_BATCH_SIZE);
  return limits[key];
}

function orderFilterStorageKey() {
  const userRef = state.user?.id || state.user?.username || state.user?.email || 'default';
  return `manual-p2p-crm:orders-filter:v${ORDER_FILTER_STORAGE_VERSION}:${String(userRef)}`;
}

function defaultOrderFilters() {
  return { credentialId:0, tradeType:'', paymentMethod:'', date:'' };
}

function normalizeOrderFilters(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const tradeType = String(source.tradeType || '').toUpperCase();
  return {
    credentialId: Math.max(0, Number(source.credentialId || 0) || 0),
    tradeType: ['BUY','SELL'].includes(tradeType) ? tradeType : '',
    paymentMethod: String(source.paymentMethod || '').trim(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(source.date || '')) ? String(source.date) : ''
  };
}

function ensureOrderFilters() {
  const userKey = orderFilterStorageKey();
  if (state.orderFiltersLoadedFor !== userKey) {
    state.orderFiltersLoadedFor = userKey;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(userKey) || 'null'); } catch {}
    state.orderFilters = normalizeOrderFilters(saved || defaultOrderFilters());
  }
  state.orderFilters = normalizeOrderFilters(state.orderFilters || defaultOrderFilters());
  return state.orderFilters;
}

function persistOrderFilters(filters = state.orderFilters) {
  const normalized = normalizeOrderFilters(filters || defaultOrderFilters());
  state.orderFilters = normalized;
  try { localStorage.setItem(orderFilterStorageKey(), JSON.stringify(normalized)); } catch {}
  return normalized;
}

function clearSavedOrderFilters() {
  state.orderFilters = defaultOrderFilters();
  try { localStorage.removeItem(orderFilterStorageKey()); } catch {}
  return state.orderFilters;
}

function orderFilterDateValue(value) {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function orderFilterPaymentMethod(order = {}) {
  return String(displayPaymentMethodName(order) || order.method?.name || '').trim();
}

function applyOrderFilters(items = [], filters = ensureOrderFilters()) {
  const f = normalizeOrderFilters(filters);
  return (items || []).filter(order => {
    if (f.credentialId && Number(order.credentialId || 0) !== Number(f.credentialId)) return false;
    if (f.tradeType && String(order.type || '').toUpperCase() !== f.tradeType) return false;
    if (f.paymentMethod && orderFilterPaymentMethod(order) !== f.paymentMethod) return false;
    if (f.date && orderFilterDateValue(order.createdAt || order.updatedAt) !== f.date) return false;
    return true;
  });
}

function orderFilterActiveCount(filters = ensureOrderFilters()) {
  const f = normalizeOrderFilters(filters);
  return Number(Boolean(f.credentialId)) + Number(Boolean(f.tradeType)) + Number(Boolean(f.paymentMethod)) + Number(Boolean(f.date));
}

function orderPaymentFilterOptions(items = []) {
  return Array.from(new Set((items || []).map(orderFilterPaymentMethod).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function orderFilterMenuHtml(data = {}, filters = ensureOrderFilters()) {
  const f = normalizeOrderFilters(filters);
  const credentials = orderAccountOptions(data);
  const payments = orderPaymentFilterOptions(data.items || []);
  const activeCount = orderFilterActiveCount(f);
  return `<div class="order-filter-menu ${activeCount ? 'has-active-filter' : ''}">
    <button class="order-filter-trigger" id="orderFilterBtn" type="button" aria-label="Filter orders" aria-haspopup="dialog" aria-expanded="false" aria-controls="orderFilterPanel" title="Filter orders">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.5h17L14 13v5.2l-4 2.3V13L3.5 5.5Z"></path></svg>
      ${activeCount ? `<span class="order-filter-count" aria-label="${activeCount} active filters">${activeCount}</span>` : '<span class="order-filter-market-dot" aria-hidden="true"></span>'}
    </button>
    <div class="order-filter-panel" id="orderFilterPanel" role="dialog" aria-label="Order filters" hidden>
      <form id="orderFilterForm" class="order-filter-form">
        <div class="order-filter-head"><b>Filter Orders</b><button type="button" id="orderFilterCloseBtn" aria-label="Close filters">×</button></div>
        <label><span>API Account</span><select name="credentialId"><option value="0">All API Accounts</option>${credentials.map(option => `<option value="${Number(option.id)}" ${Number(f.credentialId) === Number(option.id) ? 'selected' : ''}>${escapeHtml(orderAccountDisplayName(option))}</option>`).join('')}</select></label>
        <label><span>Buy / Sell</span><select name="tradeType"><option value="" ${!f.tradeType ? 'selected' : ''}>All</option><option value="BUY" ${f.tradeType === 'BUY' ? 'selected' : ''}>Buy</option><option value="SELL" ${f.tradeType === 'SELL' ? 'selected' : ''}>Sell</option></select></label>
        <label><span>Payment Method</span><select name="paymentMethod"><option value="" ${!f.paymentMethod ? 'selected' : ''}>All Payment Methods</option>${payments.map(name => `<option value="${escapeAttr(name)}" ${f.paymentMethod === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label>
        <label><span>Date</span><input type="date" name="date" value="${escapeAttr(f.date)}" /></label>
        <div class="order-filter-note">Save keeps this filter for your next visit on this browser.</div>
        <div class="order-filter-actions"><button type="button" class="ghost" id="orderFilterResetBtn">Reset</button><button type="button" class="secondary" id="orderFilterApplyBtn">Apply</button><button type="button" id="orderFilterSaveBtn">Save</button></div>
      </form>
    </div>
  </div>`;
}

function workAvailabilityLabel(status = {}) {
  const accepting = status.accepting === true;
  return state.lang === 'bn'
    ? `কাজ: ${accepting ? 'অন' : 'বিরতি'}`
    : `Work: ${accepting ? 'ON' : 'PAUSED'}`;
}

function workAvailabilityTitle(status = {}) {
  const accepting = status.accepting === true;
  const presence = status.presenceStatus || 'offline';
  if (state.lang === 'bn') {
    if (status.assignable) return `${accepting ? 'অন থাকলে offline হলেও অনুমোদিত নতুন অর্ডার auto assign হতে পারে।' : 'বিরতিতে থাকলে online হলেও নতুন অর্ডার assign হবে না।'} উপস্থিতি: ${presence}`;
    return `${accepting ? 'কাজের জন্য প্রস্তুত হিসেবে দেখাবে।' : 'কাজ থেকে বিরত হিসেবে দেখাবে।'} উপস্থিতি: ${presence}`;
  }
  if (status.assignable) return `${accepting ? 'When ON, permitted new orders may auto-assign even while offline.' : 'When paused, new orders will not assign even while online.'} Presence: ${presence}`;
  return `${accepting ? 'Shown as ready for work.' : 'Shown as paused from work.'} Presence: ${presence}`;
}

function updateOrderAcceptanceControl() {
  const current = state.orderAcceptance || {};
  document.querySelectorAll('[data-order-acceptance-toggle]').forEach(button => {
    const visible = current.available === true && current.controlsAutoAssignment !== false && current.liveOrderAccess !== true;
    if (!visible) {
      button.classList.add('hidden');
      return;
    }
    button.classList.remove('hidden');
    const accepting = current.accepting === true;
    button.classList.toggle('is-on', accepting);
    button.classList.toggle('is-off', !accepting);
    button.disabled = Boolean(state.orderAcceptanceBusy);
    button.setAttribute('aria-pressed', accepting ? 'true' : 'false');
    button.title = workAvailabilityTitle(current);
    const label = button.querySelector('span:last-child');
    if (label) label.textContent = workAvailabilityLabel(current);
  });
  bindOrderAcceptanceControl();
}

async function setOrderAcceptance(accepting, options={}) {
  if (state.orderAcceptanceBusy) return state.orderAcceptance;
  state.orderAcceptanceBusy = true;
  document.querySelectorAll('[data-order-acceptance-toggle]').forEach(button => { button.disabled = true; });
  try {
    const result = await api('/api/me/order-acceptance', { method:'PATCH', body: JSON.stringify({ accepting: Boolean(accepting) }) });
    state.orderAcceptance = result;
    state.orderAcceptancePromptShown = true;
    updateOrderAcceptanceControl();
    if (!options.silent) notify(result.accepting ? (state.lang === 'bn' ? 'কাজের অবস্থা অন হয়েছে।' : 'Work status is ON.') : (state.lang === 'bn' ? 'কাজের অবস্থা বিরতিতে গেছে।' : 'Work status is PAUSED.'), 'ok');
    return result;
  } catch (error) {
    if (isUiRequestCancelled(error)) return;
    if (!options.silent) notify(error.message || 'Could not update work status.', 'danger', 6000);
    throw error;
  } finally {
    state.orderAcceptanceBusy = false;
    updateOrderAcceptanceControl();
  }
}

function bindOrderAcceptanceControl(root=document) {
  root.querySelectorAll?.('[data-order-acceptance-toggle]').forEach(button => {
    if (button.dataset.workBound === '1') return;
    button.dataset.workBound = '1';
    button.onclick = async () => {
      const next = !(state.orderAcceptance?.accepting === true);
      try { await setOrderAcceptance(next); } catch {}
    };
  });
}

function maybePromptOrderAcceptance(status = {}) {
  if (!status.available || status.accepting || state.orderAcceptancePromptShown || modalOpen()) return;
  state.orderAcceptancePromptShown = true;
  const isBn = state.lang === 'bn';
  modal(isBn ? 'কাজের অবস্থা' : 'Work Status', `
    <div class="order-acceptance-prompt">
      <p>${isBn ? 'স্যার, আপনি কি এখন কাজ করতে চান?' : 'Are you ready to work now?'}</p>
      <div id="orderAcceptancePromptMessage" class="form-message"></div>
      <div class="actions end"><button type="button" class="secondary" id="declineOrderAcceptance">${isBn ? 'না' : 'No'}</button><button type="button" id="confirmOrderAcceptance">${isBn ? 'হ্যাঁ' : 'Yes'}</button></div>
    </div>`);
  const noButton = $('#declineOrderAcceptance');
  const yesButton = $('#confirmOrderAcceptance');
  if (noButton) noButton.onclick = () => closeModal();
  if (yesButton) yesButton.onclick = async () => {
    yesButton.disabled = true;
    try {
      await setOrderAcceptance(true, { silent:true });
      closeModal();
      notify(isBn ? 'কাজের অবস্থা অন হয়েছে।' : 'Work status is ON.', 'ok');
    } catch (error) {
    if (isUiRequestCancelled(error)) return;
      yesButton.disabled = false;
      setFormMessage('#orderAcceptancePromptMessage', error.message || 'Could not enable work status.', 'danger');
    }
  };
}

async function applyOrderRealtimeChanges(changes=[]) {
  if (state.page !== 'orders' || state.currentOrderId || !Array.isArray(changes) || !changes.length) return false;
  const data = state.ordersListData;
  if (!data || !Array.isArray(data.items)) {
    renderOrders({ background:true }).catch(()=>{});
    return false;
  }
  const byId = new Map(data.items.map(item => [Number(item.id), item]));
  const hydrateIds = [];
  for (const change of changes) {
    const id = Number(change.orderId || change.id || 0);
    if (!id) continue;
    const current = byId.get(id);
    if (!current || change.created) {
      hydrateIds.push(id);
      continue;
    }
    if (change.status) current.status = change.status;
    if (change.externalStatus) current.externalStatus = change.externalStatus;
    if (change.type) current.type = change.type;
    if (change.amount !== undefined) current.amount = Number(change.amount || current.amount || 0);
    if (change.credentialId) current.credentialId = Number(change.credentialId);
    if (change.credentialName) current.credentialName = change.credentialName;
    if (change.methodName) {
      current.method = { ...(current.method || {}), name:change.methodName };
      current.payMethodSnapshot = { ...(current.payMethodSnapshot || {}), name:change.methodName };
    }
    current.updatedAt = change.at || new Date().toISOString();
  }
  if (hydrateIds.length) {
    const fresh = await Promise.all([...new Set(hydrateIds)].map(id => api(`/api/orders/${id}/list-view`, { silent:true, noAutoReload:true, navigationScoped:false }).catch(()=>null)));
    for (const result of fresh) {
      const item = result?.item;
      if (!item?.id) continue;
      const existingIndex = data.items.findIndex(row => Number(row.id) === Number(item.id));
      if (existingIndex >= 0) data.items[existingIndex] = item;
      else data.items.unshift(item);
      if (result.unreadCount) data.unreadCounts = { ...(data.unreadCounts || {}), [String(item.id)]:Number(result.unreadCount) };
      if (result.latestUnread) data.unreadLatestByOrder = { ...(data.unreadLatestByOrder || {}), [String(item.id)]:result.latestUnread };
    }
  }
  data.items.sort((a,b) => (Date.parse(b.createdAt || b.updatedAt || '') || 0) - (Date.parse(a.createdAt || a.updatedAt || '') || 0));
  state.ordersListData = data;
  await renderOrders({ prefetchedData:data, background:true });
  return true;
}

async function renderOrders(opts={}) {
  if (state.page !== 'orders') return;
  setTitle('Orders');
  const renderGuard = beginPageRenderGuard('orders-list');
  const backgroundRefresh = opts.background === true;
  let data;
  try {
    // The Orders page always loads the complete permission-scoped local list.
    // API account is now a fast client-side filter instead of a page selector,
    // so changing filters never waits on another network request.
    data = opts.prefetchedData || await api('/api/orders', {
      autoReloadOnChallenge:false,
      noAutoReload:true,
      signal:renderGuard.signal,
      navigationScoped:false
    });
  } catch (error) {
    if (isUiRequestCancelled(error)) return;
    throw error;
  }
  if (!pageRenderGuardCurrent(renderGuard) || state.page !== 'orders' || state.currentOrderId) return;
  state.ordersListData = data;

  const unreadData = {
    counts:data.unreadCounts || {},
    total:Number(data.unreadTotal || 0),
    latestByOrder:data.unreadLatestByOrder || {}
  };
  const credentialOptions = orderAccountOptions(data);
  const liveCredentialOptions = Array.isArray(data.liveCredentialOptions) ? data.liveCredentialOptions : [];
  let filters = ensureOrderFilters();
  if (filters.credentialId && !credentialOptions.some(option => Number(option.id) === Number(filters.credentialId))) {
    filters = normalizeOrderFilters({ ...filters, credentialId:0 });
    state.orderFilters = filters;
  }
  if (state.orderCredentialId && !liveCredentialOptions.some(option => Number(option.id) === Number(state.orderCredentialId))) {
    state.orderCredentialId = 0;
    localStorage.removeItem('crmOrderCredentialId');
  }
  // Orders notifications are no longer scoped by a page-level account
  // selector. Keep the notification feed on all accessible accounts.
  setNotificationCredentialScope(0, { sync:true });
  state.orderCredentialOptions = credentialOptions;
  state.orderLiveCredentialOptions = liveCredentialOptions;
  state.orderAcceptance = data.orderAcceptance || state.bootstrap?.orderAcceptance || state.orderAcceptance || null;

  const canCreateOffline = hasPerm('orders.create');
  const canCreateBinance = liveCredentialOptions.some(option => orderAccountHasPermission(option, 'orders.create'));
  const canSyncBinance = liveCredentialOptions.some(option => orderAccountHasPermission(option, 'binance.sync'));
  const unreadCounts = unreadData.counts || {};
  const allItems = (data.items || []).map(order => ({
    ...order,
    unreadMessageCount:Number(unreadCounts[String(order.id)] || 0)
  }));
  const items = applyOrderFilters(allItems, filters);
  const autoSyncSeconds = Math.max(15, Number(state.bootstrap?.settings?.binanceAutoSyncSeconds || 30));
  const group = state.orderGroup === 'fulfilled' ? 'fulfilled' : 'ongoing';
  const previousSnapshot = state.orderSnapshot;
  const nextSnapshot = {};

  const orderRows = orders => orders.map(o => {
    const rowMeta = buildOrderListMeta(o, previousSnapshot, nextSnapshot);
    return { rowClass:rowMeta.rowClass, openOrderId:o.id, cells:[
      orderNumberLabelHtml(o),
      orderSourceAccountHtml(o),
      badge(o.type, o.type === 'BUY' ? 'ok' : 'danger'),
      methodLabelHtml(o),
      `${money(o.amount)}<br/><span class="sub">${assetFmt(o.assetAmount, o.asset)}</span>`,
      o.orderSource === 'offline' ? '-' : `${money(o.rate).replace('৳','৳ ')} / ${escapeHtml(o.asset || 'USDT')}`,
      `<span class="sub">${fmt(o.createdAt)}</span><br/>${orderCountdownHtml(o, 'b')}`,
      badge(binanceDisplayStatus(o), statusClass(o.status)),
      isFulfilledOrder(o) ? '<span class="sub">View only</span>' : escapeHtml(o.leadAgent?.name || '-'),
      `${money(o.summary.relevantActual)} / ${money(o.amount)}<br/><span class="sub">Remaining ${money(o.summary.remaining)}</span>`,
      orderChatButtonHtml(o)
    ]};
  });
  const tableHead = ['Order','Source','Type','Method','Fiat / USDT','Rate','Time','Status','Lead','Actual','Chat'];
  const ongoingTabs = [
    ['all','All', items.filter(o => isOngoingOrder(o))],
    ['unpaid','Unpaid', items.filter(o => isOngoingOrder(o) && orderPayGroup(o) === 'unpaid')],
    ['paid','Paid', items.filter(o => isOngoingOrder(o) && orderPayGroup(o) === 'paid')],
    ['appeal','Appeal', items.filter(o => isOngoingOrder(o) && orderPayGroup(o) === 'appeal')]
  ];
  const fulfilledTabs = [
    ['all','All', items.filter(o => isFulfilledOrder(o))],
    ['completed','Completed', items.filter(o => isFulfilledOrder(o) && !isCancelledOrder(o))],
    ['cancelled','Cancelled', items.filter(o => isFulfilledOrder(o) && isCancelledOrder(o))]
  ];
  const tabGroups = { ongoing:ongoingTabs, fulfilled:fulfilledTabs };
  Object.entries(tabGroups).forEach(([scope, tabs]) => {
    if (!tabs.some(tab => tab[0] === state.orderActiveTabs[scope])) state.orderActiveTabs[scope] = 'all';
  });

  const orderMenuItems = [
    canCreateBinance ? '<button id="newOrderBtn" type="button"><span aria-hidden="true">＋</span><span>Create Binance Order</span></button>' : '',
    canCreateOffline ? '<button id="newOfflineOrderBtn" type="button"><span aria-hidden="true">▣</span><span>Create Offline Order</span></button>' : '',
    canSyncBinance ? '<button id="syncBinanceOrdersBtn" type="button"><span aria-hidden="true">↻</span><span>Sync Binance Orders</span></button>' : '',
    '<button id="refreshBtn" type="button"><span aria-hidden="true">⟳</span><span>Refresh</span></button>'
  ].filter(Boolean).join('');

  const section = (tabs, scope) => {
    const activeTabKey = state.orderActiveTabs[scope] || 'all';
    const activeTab = tabs.find(tab => tab[0] === activeTabKey) || tabs[0] || ['all','All',[]];
    const totalVisible = activeTab[2].length;
    const renderLimit = orderRenderLimit(scope, activeTab[0], totalVisible);
    const renderedItems = activeTab[2].slice(0, renderLimit);
    const remaining = Math.max(0, totalVisible - renderedItems.length);
    const hidden = scope !== group;
    const listHtml = renderedItems.length
      ? `<div class="order-desktop-view">${table(tableHead, orderRows(renderedItems))}</div><div class="order-mobile-view">${renderOrderMobileList(renderedItems, previousSnapshot, nextSnapshot)}</div>`
      : '<div class="empty-state">No orders in this tab.</div>';
    const loadMoreHtml = remaining ? `<div class="order-list-more-wrap"><button type="button" class="order-list-more" data-order-load-more="${scope}" data-order-load-more-tab="${activeTab[0]}" data-order-load-more-total="${totalVisible}">Load more <b>${Math.min(ORDER_RENDER_BATCH_SIZE, remaining)}</b><small>${remaining} remaining</small></button></div>` : '';
    return `<div class="card order-section order-section-${scope}" data-order-scope="${scope}" ${hidden ? 'hidden' : ''} aria-hidden="${hidden ? 'true' : 'false'}">
      <div class="order-tabs">${tabs.map(tab => `<button class="order-tab ${tab[0] === activeTab[0] ? 'active' : ''}" data-tab-scope="${scope}" data-tab-key="${tab[0]}">${tab[1]} <b>${tab[2].length}</b></button>`).join('')}</div>
      <div class="order-tab-panel active" data-panel-scope="${scope}" data-panel-key="${activeTab[0]}">${listHtml}${loadMoreHtml}</div>
    </div>`;
  };

  const ordersPageHtml = `
    <div class="order-group-switch order-group-switch-with-menu">
      <div class="order-group-tabs">
        <button class="order-group-btn ${group === 'ongoing' ? 'active' : ''}" data-order-group="ongoing" aria-selected="${group === 'ongoing' ? 'true' : 'false'}">Ongoing <b>${ongoingTabs[0][2].length}</b></button>
        <button class="order-group-btn ${group === 'fulfilled' ? 'active' : ''}" data-order-group="fulfilled" aria-selected="${group === 'fulfilled' ? 'true' : 'false'}">Fulfilled <b>${fulfilledTabs[0][2].length}</b></button>
      </div>
      <div class="order-page-tools">
        ${orderFilterMenuHtml(data, filters)}
        <div class="order-page-menu">
          <button class="order-page-menu-trigger" id="orderPageMenuBtn" type="button" aria-label="Order actions" aria-haspopup="menu" aria-expanded="false" aria-controls="orderPageMenuPanel">⋮</button>
          <div class="order-page-menu-panel" id="orderPageMenuPanel" role="menu" hidden>${orderMenuItems}</div>
        </div>
      </div>
    </div>
    ${section(ongoingTabs, 'ongoing')}
    ${section(fulfilledTabs, 'fulfilled')}`;

  if (!pageRenderGuardCurrent(renderGuard) || state.page !== 'orders' || state.currentOrderId) return;
  const content = $('#content');
  const canStablePatch = backgroundRefresh
    && content?.querySelector('[data-order-scope="ongoing"]')
    && content?.querySelector('[data-order-scope="fulfilled"]');
  if (canStablePatch) {
    const scrollY = appScrollTop();
    const staging = document.createElement('div');
    staging.innerHTML = ordersPageHtml;
    ['ongoing','fulfilled'].forEach(scope => {
      const nextSection = staging.querySelector(`[data-order-scope="${scope}"]`);
      const currentSection = content.querySelector(`[data-order-scope="${scope}"]`);
      if (nextSection && currentSection) currentSection.innerHTML = nextSection.innerHTML;
      if (currentSection) {
        const isActive = scope === (state.orderGroup === 'fulfilled' ? 'fulfilled' : 'ongoing');
        currentSection.hidden = !isActive;
        currentSection.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      }
    });
    staging.querySelectorAll('[data-order-group]').forEach(nextButton => {
      const currentButton = content.querySelector(`[data-order-group="${nextButton.dataset.orderGroup}"]`);
      if (currentButton) currentButton.innerHTML = nextButton.innerHTML;
    });
    // Restore synchronously so a live refresh never overwrites a user's next
    // scroll gesture on a later animation frame.
    appScrollTo({ top:scrollY, left:0, behavior:'auto' });
  } else if (content) {
    if (opts.fastCommit === true) {
      const preservedScrollY = opts.preserveScroll === true ? appScrollTop() : 0;
      const staging = document.createElement('div');
      staging.innerHTML = ordersPageHtml;
      content.replaceChildren(...staging.childNodes);
      appScrollTo({ top:preservedScrollY, left:0, behavior:'auto' });
    } else {
      content.innerHTML = ordersPageHtml;
    }
  }

  state.orderSnapshot = nextSnapshot;
  const modalCredentialId = Number(filters.credentialId || state.orderCredentialId || 0);
  $('#refreshBtn').onclick = () => refreshOrdersFromButton($('#refreshBtn'));
  if (canSyncBinance && $('#syncBinanceOrdersBtn')) $('#syncBinanceOrdersBtn').onclick = () => openBinanceOrderSyncModal(liveCredentialOptions, modalCredentialId);
  if (canCreateBinance && $('#newOrderBtn')) $('#newOrderBtn').onclick = () => openCreateOrderModal('binance', liveCredentialOptions, modalCredentialId);
  if (canCreateOffline && $('#newOfflineOrderBtn')) $('#newOfflineOrderBtn').onclick = () => openCreateOrderModal('offline', liveCredentialOptions, modalCredentialId);
  bindOrderFilterMenu(data);
  bindOrderPageMenu();

  $$('[data-order-group]').forEach(btn => btn.onclick = () => {
    const nextGroup = btn.dataset.orderGroup === 'fulfilled' ? 'fulfilled' : 'ongoing';
    state.orderGroup = nextGroup;
    localStorage.setItem('crmOrderGroup', nextGroup);
    // Both groups are already in the DOM. Switching is a class/hidden toggle,
    // not a complete Orders render, so Ongoing <-> Fulfilled is immediate even
    // with a large order history.
    $$('[data-order-group]').forEach(button => {
      const active = button.dataset.orderGroup === nextGroup;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    $$('[data-order-scope]').forEach(sectionNode => {
      const active = sectionNode.dataset.orderScope === nextGroup;
      sectionNode.hidden = !active;
      sectionNode.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
  });

  $$('[data-open-order-card]').forEach(card => {
    const openOrder = () => setRoute('orders', { orderId:Number(card.dataset.openOrderCard) });
    card.onclick = event => {
      if (event.target.closest('button,a,input,select,textarea,label')) return;
      openOrder();
    };
    card.onkeydown = event => {
      if (!['Enter',' '].includes(event.key) || event.target.closest('button,a,input,select,textarea,label')) return;
      event.preventDefault();
      openOrder();
    };
  });
  $$('[data-open-order-chat]').forEach(button => button.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    const orderId = Number(button.dataset.openOrderChat || 0);
    if (!orderId) return;
    state.pendingOpenChatOrderId = orderId;
    setRoute('orders', { orderId });
  });
  $$('[data-tab-scope]').forEach(btn => btn.onclick = () => {
    const scope = btn.dataset.tabScope;
    const key = btn.dataset.tabKey;
    if (!scope || !key || state.orderActiveTabs[scope] === key) return;
    state.orderActiveTabs[scope] = key;
    resetOrderRenderLimits(scope, key);
    try { localStorage.setItem(`crmOrderTab:${scope}`, key); } catch {}
    renderOrders({ prefetchedData:data, fastCommit:true, preserveScroll:true }).catch(error => {
      if (!isUiRequestCancelled(error)) notify(error.message || 'Could not switch order tab.', 'danger');
    });
  });

  if (state.orderLoadMoreObserver) {
    try { state.orderLoadMoreObserver.disconnect(); } catch {}
    state.orderLoadMoreObserver = null;
  }
  const loadMoreButtons = $$('[data-order-load-more]');
  loadMoreButtons.forEach(button => button.onclick = () => {
    if (button.dataset.loading === '1') return;
    button.dataset.loading = '1';
    const scope = button.dataset.orderLoadMore || 'ongoing';
    const key = button.dataset.orderLoadMoreTab || 'all';
    const total = Number(button.dataset.orderLoadMoreTotal || 0);
    growOrderRenderLimit(scope, key, total);
    renderOrders({ prefetchedData:data, fastCommit:true, preserveScroll:true }).catch(error => {
      if (!isUiRequestCancelled(error)) notify(error.message || 'Could not load more orders.', 'danger');
    });
  });
  if (loadMoreButtons.length && 'IntersectionObserver' in window) {
    state.orderLoadMoreObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const button = entry.target;
        if (entry.isIntersecting && button && button.dataset.loading !== '1') button.click();
      });
    }, { root:null, rootMargin:'280px 0px' });
    loadMoreButtons.forEach(button => state.orderLoadMoreObserver.observe(button));
  }
  startCountdownTimers();
  window.setTimeout(() => maybePromptOrderAcceptance(state.orderAcceptance || {}), 80);
  if (state.orderListRefreshTimer) clearTimeout(state.orderListRefreshTimer);
  state.orderListRefreshTimer = setTimeout(() => {
    if (state.page === 'orders' && !state.currentOrderId && !modalOpen()) scheduleSmoothRefresh(0);
  }, Math.max(5000, autoSyncSeconds * 1000));
}

function bindOrderFilterMenu(data = {}) {
  const trigger = $('#orderFilterBtn');
  const panel = $('#orderFilterPanel');
  const form = $('#orderFilterForm');
  if (!trigger || !panel || !form) return;
  if (state.orderFilterOutsideHandler) document.removeEventListener('pointerdown', state.orderFilterOutsideHandler, true);
  if (state.orderFilterEscapeHandler) document.removeEventListener('keydown', state.orderFilterEscapeHandler, true);

  const close = () => {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.remove('active');
  };
  const open = () => {
    const actionPanel = $('#orderPageMenuPanel');
    const actionTrigger = $('#orderPageMenuBtn');
    if (actionPanel) actionPanel.hidden = true;
    if (actionTrigger) {
      actionTrigger.setAttribute('aria-expanded', 'false');
      actionTrigger.classList.remove('active');
    }
    const rect = trigger.getBoundingClientRect();
    panel.style.top = `${Math.max(8, Math.min(window.innerHeight - 88, rect.bottom + 7))}px`;
    panel.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('active');
  };
  const formFilters = () => normalizeOrderFilters({
    credentialId:Number(form.elements.credentialId?.value || 0),
    tradeType:form.elements.tradeType?.value || '',
    paymentMethod:form.elements.paymentMethod?.value || '',
    date:form.elements.date?.value || ''
  });
  const applyAndRender = async (save) => {
    state.orderFilters = formFilters();
    if (save) persistOrderFilters(state.orderFilters);
    state.orderSnapshot = null;
    resetOrderRenderLimits();
    close();
    await renderOrders({ prefetchedData:data, fastCommit:true, preserveScroll:true });
  };

  trigger.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    panel.hidden ? open() : close();
  };
  if ($('#orderFilterCloseBtn')) $('#orderFilterCloseBtn').onclick = close;
  if ($('#orderFilterApplyBtn')) $('#orderFilterApplyBtn').onclick = () => applyAndRender(false).catch(error => {
    if (!isUiRequestCancelled(error)) notify(error.message || 'Could not apply order filter.', 'danger');
  });
  if ($('#orderFilterSaveBtn')) $('#orderFilterSaveBtn').onclick = () => applyAndRender(true).then(() => notify('Order filter saved.', 'ok')).catch(error => {
    if (!isUiRequestCancelled(error)) notify(error.message || 'Could not save order filter.', 'danger');
  });
  if ($('#orderFilterResetBtn')) $('#orderFilterResetBtn').onclick = () => {
    clearSavedOrderFilters();
    state.orderSnapshot = null;
    resetOrderRenderLimits();
    close();
    renderOrders({ prefetchedData:data, fastCommit:true, preserveScroll:true }).catch(error => {
      if (!isUiRequestCancelled(error)) notify(error.message || 'Could not reset order filter.', 'danger');
    });
  };
  state.orderFilterOutsideHandler = event => {
    if (!panel.hidden && !event.target.closest('.order-filter-menu')) close();
  };
  state.orderFilterEscapeHandler = event => {
    if (event.key === 'Escape' && !panel.hidden) {
      close();
      trigger.focus({ preventScroll:true });
    }
  };
  document.addEventListener('pointerdown', state.orderFilterOutsideHandler, true);
  document.addEventListener('keydown', state.orderFilterEscapeHandler, true);
}

function bindOrderPageMenu() {
  const trigger = $('#orderPageMenuBtn');
  const panel = $('#orderPageMenuPanel');
  if (!trigger || !panel) return;
  if (state.orderPageMenuOutsideHandler) document.removeEventListener('pointerdown', state.orderPageMenuOutsideHandler, true);
  if (state.orderPageMenuEscapeHandler) document.removeEventListener('keydown', state.orderPageMenuEscapeHandler, true);
  const close = () => {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.remove('active');
  };
  const open = () => {
    const filterPanel = $('#orderFilterPanel');
    const filterTrigger = $('#orderFilterBtn');
    if (filterPanel) filterPanel.hidden = true;
    if (filterTrigger) {
      filterTrigger.setAttribute('aria-expanded', 'false');
      filterTrigger.classList.remove('active');
    }
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.classList.add('active');
  };
  trigger.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    panel.hidden ? open() : close();
  };
  panel.querySelectorAll('button').forEach(button => button.addEventListener('click', close));
  state.orderPageMenuOutsideHandler = event => {
    if (!panel.hidden && !event.target.closest('.order-page-menu')) close();
  };
  state.orderPageMenuEscapeHandler = event => {
    if (event.key === 'Escape' && !panel.hidden) {
      close();
      trigger.focus();
    }
  };
  document.addEventListener('pointerdown', state.orderPageMenuOutsideHandler, true);
  document.addEventListener('keydown', state.orderPageMenuEscapeHandler, true);
}

function buildOrderListMeta(o, previousSnapshot, nextSnapshot) {
  const key = String(o.id || o.orderNo || o.externalOrderNo || '');
  const rowState = { status: binanceDisplayStatus(o), externalStatus: o.externalStatus || '', method: displayPaymentMethodName(o) };
  const prev = previousSnapshot ? previousSnapshot[key] : null;
  nextSnapshot[key] = rowState;
  const changed = !!(prev && (prev.status !== rowState.status || prev.externalStatus !== rowState.externalStatus));
  return { key, rowClass: previousSnapshot && !prev ? 'order-row-new' : (changed ? 'order-row-updated' : '') };
}

function getOrderListCounterparty(o) {
  const stats = o.counterpartyStats || {};
  return o.counterpartyName || stats.nickname || o.counterpartyNickname || o.nickName || o.userName || o.userNo || o.counterpartyUserNo || 'Counterparty';
}

function orderChatButtonHtml(order) {
  const unread = Math.max(0, Number(order?.unreadMessageCount || 0));
  const countText = unread > 99 ? '99+' : String(unread);
  return `<button class="order-list-chat-btn" type="button" data-open-order-chat="${Number(order?.id || 0)}" aria-label="Open messages${unread ? `, ${unread} unread` : ''}" title="Messages">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v10H9l-4 4V5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 9h8M8 12h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    ${unread ? `<span class="order-list-unread" data-unread-order-id="${Number(order?.id || 0)}">${countText}</span>` : ''}
  </button>`;
}

function renderOrderMobileList(orders, previousSnapshot, nextSnapshot) {
  return `<div class="order-mobile-list">${orders.map(o => renderOrderMobileCard(o, previousSnapshot, nextSnapshot)).join('')}</div>`;
}

function renderOrderMobileCard(o, previousSnapshot, nextSnapshot) {
  const meta = buildOrderListMeta(o, previousSnapshot, nextSnapshot);
  const type = String(o.type || '').toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
  const sideClass = type === 'BUY' ? 'buy' : 'sell';
  const qtyLabel = type === 'BUY' ? 'Received Quantity' : 'Total Quantity';
  const counterparty = getOrderListCounterparty(o);
  const timeText = fmt(o.createdAt || '');
  const countdown = countdownText(o.paymentDeadlineAt);
  const liveText = isFulfilledOrder(o) ? timeText : `${timeText}${countdown && countdown !== '-' ? ` · ${countdown}` : ''}`;
  const actualText = `${money(o.summary?.relevantActual || 0)} / ${money(o.amount || 0)}`;
  const actualSub = `Remaining ${money(o.summary?.remaining || 0)}`;
  const statusText = binanceDisplayStatus(o);
  const paymentText = displayPaymentMethodName(o);
  const leadName = o.leadAgent?.name || '';
  return `<article class="order-mobile-card ${sideClass} ${cleanClass(meta.rowClass)}" data-open-order-card="${o.id}" tabindex="0" role="button" aria-label="Open order ${escapeAttr(o.orderNo || o.externalOrderNo || o.id)}">
    <div class="order-mobile-header">
      <div class="order-mobile-title"><span class="order-mobile-type ${sideClass}">${type === 'BUY' ? 'Buy' : 'Sell'}</span><b>${escapeHtml(o.asset || 'USDT')}</b></div>
      <div class="order-mobile-status">${badge(statusText, statusClass(o.status))}</div>
    </div>
    <div class="order-mobile-context">
      <span class="order-mobile-source">${orderSourceAccountHtml(o)}</span>
      <span class="order-mobile-method">${escapeHtml(paymentText || 'N/A')}</span>
      ${leadName ? `<span class="order-mobile-mini-sub">Lead: <b>${escapeHtml(leadName)}</b></span>` : ''}
    </div>
    <div class="order-mobile-grid">
      <div class="order-mobile-row order-mobile-row-amount"><span>Amount</span><b>${money(o.amount || 0)}</b></div>
      <div class="order-mobile-row"><span>Price</span><b>${o.orderSource === 'offline' ? '-' : money(o.rate || 0)}</b></div>
      <div class="order-mobile-row"><span>${escapeHtml(qtyLabel)}</span><b>${assetFmt(o.assetAmount || 0, o.asset || 'USDT')}</b></div>
      <div class="order-mobile-row order-mobile-row-actual"><span>Actual</span><b>${actualText}<small>${actualSub}</small></b></div>
      <div class="order-mobile-row order-mobile-row-order"><span>Order</span><b class="order-mobile-order-no">${escapeHtml(o.orderNo || o.externalOrderNo || '-')}</b></div>
    </div>
    <div class="order-mobile-footer">
      <div class="order-mobile-counterparty-wrap">
        <div class="order-mobile-user-pill"><span>${escapeHtml(counterparty)}</span></div>
        ${orderChatButtonHtml(o)}
      </div>
      <small class="order-mobile-time">${escapeHtml(liveText)}</small>
    </div>
  </article>`;
}

function summaryTile(title, value, sub) {
  return `<div class="summary-tile"><span>${escapeHtml(title)}</span><b>${value}</b><small>${escapeHtml(sub)}</small></div>`;
}

function renderOrderApprovals(order) {
  const approvals = order.approvals || [];
  if (!approvals.length && !hasPerm('approvals.manage')) return '';
  const body = approvals.length ? approvals.slice().reverse().map(a => {
    const issues = (a.issues || []).map(i => `<span class="badge ${i.code === 'proof_missing' ? 'danger' : i.code === 'high_amount' ? 'warn' : 'blue'}">${escapeHtml(i.code)}</span>`).join(' ');
    return `<div class="approval-row"><div><b>${escapeHtml(a.action || '')}</b> ${badge(a.status, statusClass(a.status))}<br/><span class="sub">${issues}</span><br/><small>${escapeHtml(a.requestedByName || '')} · ${fmt(a.requestedAt)}</small></div><div>${a.status === 'pending' && hasPerm('approvals.manage') ? `<button data-approve="${a.id}" class="success">Approve</button> <button data-reject="${a.id}" class="danger">Reject</button>` : `<span class="sub">${escapeHtml(a.decisionNote || '')}</span>`}</div></div>`;
  }).join('') : '<div class="empty-state small">No approval request yet.</div>';
  setTimeout(() => {
    $$('[data-approve]').forEach(b => b.onclick = () => openApprovalDecisionModal(Number(b.dataset.approve), 'approved'));
    $$('[data-reject]').forEach(b => b.onclick = () => openApprovalDecisionModal(Number(b.dataset.reject), 'rejected'));
  }, 0);
  return `<div class="card order-card approvals-card"><div class="section-head"><h3>Approvals</h3><span>${approvals.filter(a => a.status === 'pending').length} pending</span></div><div class="approval-list">${body}</div></div>`;
}

function statementFeed(ledgers=[]) {
  if (!ledgers.length) return '<div class="empty-state small">No statement movement yet.</div>';
  return `<div class="statement-feed">${ledgers.slice(-8).reverse().map(l => `<div class="statement-item ${ledgerBadgeClass(l)}"><div><b>${escapeHtml(l.account?.accountNumber || ('#'+l.paymentAccountId))}</b><span>${escapeHtml(l.type || l.direction)} · ${fmt(l.createdAt)}</span></div><div><b>${money(l.amount)}</b><span>${money(l.balanceBefore)} → ${money(l.balanceAfter)}</span></div></div>`).join('')}</div>`;
}

function renderSplit(s) {
  const proof = s.hasProof
    ? `<br/><a class="pill-link" href="${escapeAttr(safeWebUrl(s.proofUrl))}" target="_blank" rel="noopener noreferrer">View proof</a>`
    : s.hasTransactionReference
      ? '<br/><span class="badge ok">Transaction ID saved</span>'
      : '<br/><span class="badge warn">No proof</span>';
  const restricted = Boolean(s.account?.restricted);
  const accountLabel = restricted ? 'Managed payment account' : (s.account?.accountNumber || 'System-managed account');
  const accountMeta = restricted ? '' : [
    s.account?.label ? `Label: ${s.account.label}` : '',
    s.account?.serialNumber ? `Serial: ${s.account.serialNumber}` : '',
    s.account?.method?.name || ''
  ].filter(Boolean).join(' · ');
  const editIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z"></path><path d="m13.5 6.5 4 4"></path></svg>';
  const deleteIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="m7 7 1 13h8l1-13"></path><path d="M10 11v5M14 11v5"></path></svg>';
  const actions = `${s.viewerCanEdit ? `<button type="button" class="split-icon-btn" data-update-split="${s.id}" aria-label="Edit payment split" title="Edit payment split">${editIcon}</button>` : ''}${s.viewerCanDelete ? `<button type="button" class="split-icon-btn danger" data-delete-split="${s.id}" aria-label="Delete payment split" title="Delete payment split">${deleteIcon}</button>` : ''}`;
  return `<div class="split-row">
    <div class="toolbar compact split-account-toolbar">
      <div class="split-account-identity"><b>${escapeHtml(accountLabel)}</b>${accountMeta ? `<small>${escapeHtml(accountMeta)}</small>` : ''}${s.agent?.name ? `<small>User: ${escapeHtml(s.agent.name)}</small>` : ''}</div>
      <div class="split-amount-side"><span>${money(s.actualAmount)}</span>${actions ? `<div class="split-row-actions">${actions}</div>` : ''}</div>
    </div>
    <span class="sub">Charge / commission: <b>${money(s.transactionChargeAmount || 0)}</b> · Status: ${badge(s.status, statusClass(s.status))}</span>
    ${proof}
    ${s.note ? `<br/><span class="sub">Note: ${escapeHtml(s.note)}</span>` : ''}
  </div>`;
}

