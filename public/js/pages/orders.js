// P2PFlow v1.5.25
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

function orderAccountSwitcherHtml(options = [], selectedId = 0) {
  return `<div class="binance-account-switcher order-account-switcher" role="tablist" aria-label="Binance P2P accounts">
    <button type="button" class="binance-account-tab ${selectedId ? '' : 'active'}" data-order-account="0" role="tab" aria-selected="${selectedId ? 'false' : 'true'}">All</button>
    ${options.map(option => `<button type="button" class="binance-account-tab ${Number(option.id) === Number(selectedId) ? 'active' : ''} ${option.disabled ? 'is-disabled' : ''}" data-order-account="${Number(option.id)}" role="tab" aria-selected="${Number(option.id) === Number(selectedId) ? 'true' : 'false'}" title="${escapeAttr(option.accountName || option.name || `API ${option.id}`)}">${escapeHtml(orderAccountDisplayName(option))}</button>`).join('')}
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
      yesButton.disabled = false;
      setFormMessage('#orderAcceptancePromptMessage', error.message || 'Could not enable work status.', 'danger');
    }
  };
}

async function renderOrders(opts={}) {
  setTitle('Orders');
  let requestedCredentialId = Number(state.orderCredentialId || 0);
  const orderUrl = () => `/api/orders${requestedCredentialId ? `?credentialId=${encodeURIComponent(requestedCredentialId)}` : ''}`;
  let data;
  try {
    data = await api(orderUrl(), { autoReloadOnChallenge: true });
  } catch (error) {
    if (!requestedCredentialId) throw error;
    requestedCredentialId = 0;
    state.orderCredentialId = 0;
    localStorage.removeItem('crmOrderCredentialId');
    data = await api('/api/orders', { autoReloadOnChallenge: true });
  }
  const unreadData = { counts: data.unreadCounts || {}, total: Number(data.unreadTotal || 0), latestByOrder: data.unreadLatestByOrder || {} };
  const credentialOptions = orderAccountOptions(data);
  const liveCredentialOptions = Array.isArray(data.liveCredentialOptions) ? data.liveCredentialOptions : [];
  if (requestedCredentialId && !credentialOptions.some(option => Number(option.id) === requestedCredentialId)) {
    requestedCredentialId = 0;
    state.orderCredentialId = 0;
    localStorage.removeItem('crmOrderCredentialId');
  }
  state.orderCredentialId = requestedCredentialId;
  setNotificationCredentialScope(requestedCredentialId, { sync:true });
  state.orderCredentialOptions = credentialOptions;
  state.orderLiveCredentialOptions = liveCredentialOptions;
  state.orderAcceptance = data.orderAcceptance || state.bootstrap?.orderAcceptance || state.orderAcceptance || null;
  const selectedCredential = credentialOptions.find(option => Number(option.id) === Number(requestedCredentialId)) || null;
  const selectedLiveCredential = liveCredentialOptions.find(option => Number(option.id) === Number(requestedCredentialId)) || null;
  const canCreateOffline = hasPerm('orders.create');
  const canCreateBinance = orderAccountHasPermission(selectedLiveCredential || selectedCredential, 'orders.create') && Boolean(selectedLiveCredential);
  const canSyncBinance = orderAccountHasPermission(selectedLiveCredential, 'binance.sync');
  const unreadCounts = unreadData?.counts || {};
  const visibleOrderItems = requestedCredentialId
    ? (data.items || []).filter(order => Number(order.credentialId || 0) === Number(requestedCredentialId))
    : (data.items || []);
  const items = [...visibleOrderItems].map(order => ({ ...order, unreadMessageCount: Number(unreadCounts[String(order.id)] || 0) }));
  // Keep the background refresh interval even though its visual status line is intentionally hidden.
  const autoSyncSeconds = Math.max(15, Number(state.bootstrap?.settings?.binanceAutoSyncSeconds || 30));
  const group = state.orderGroup === 'fulfilled' ? 'fulfilled' : 'ongoing';
  const previousSnapshot = state.orderSnapshot;
  const nextSnapshot = {};
  const orderRows = orders => orders.map(o => {
    const rowMeta = buildOrderListMeta(o, previousSnapshot, nextSnapshot);
    return { rowClass: rowMeta.rowClass, openOrderId: o.id, cells: [
      orderNumberLabelHtml(o),
      orderSourceAccountHtml(o),
      badge(o.type, o.type==='BUY'?'blue':'ok'),
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
  const selectedTabs = group === 'fulfilled' ? fulfilledTabs : ongoingTabs;
  if (!selectedTabs.some(t => t[0] === state.orderActiveTabs[group])) state.orderActiveTabs[group] = 'all';
  const activeTabKey = state.orderActiveTabs[group] || 'all';
  const orderMenuItems = [
    canCreateBinance ? '<button id="newOrderBtn" type="button"><span aria-hidden="true">＋</span><span>Create Binance Order</span></button>' : '',
    canCreateOffline ? '<button id="newOfflineOrderBtn" type="button"><span aria-hidden="true">▣</span><span>Create Offline Order</span></button>' : '',
    canSyncBinance ? '<button id="syncBinanceOrdersBtn" type="button"><span aria-hidden="true">↻</span><span>Sync Selected Account</span></button>' : '',
    '<button id="refreshBtn" type="button"><span aria-hidden="true">⟳</span><span>Refresh</span></button>'
  ].filter(Boolean).join('');
  const section = (tabs, scope) => `
    <div class="card order-section order-section-${scope}" data-order-scope="${scope}">
      <div class="order-tabs">${tabs.map(t => `<button class="order-tab ${t[0]===activeTabKey?'active':''}" data-tab-scope="${scope}" data-tab-key="${t[0]}">${t[1]} <b>${t[2].length}</b></button>`).join('')}</div>
      ${tabs.map(t => `<div class="order-tab-panel ${t[0]===activeTabKey?'active':''}" data-panel-scope="${scope}" data-panel-key="${t[0]}">${t[2].length ? `<div class="order-desktop-view">${table(tableHead, orderRows(t[2]))}</div><div class="order-mobile-view">${renderOrderMobileList(t[2], previousSnapshot, nextSnapshot)}</div>` : '<div class="empty-state">No orders in this tab.</div>'}</div>`).join('')}
    </div>`;
  $('#content').innerHTML = `
    <div class="page-account-strip order-account-strip">
      ${orderAccountSwitcherHtml(credentialOptions, requestedCredentialId)}
    </div>
    <div class="order-group-switch order-group-switch-with-menu">
      <div class="order-group-tabs">
        <button class="order-group-btn ${group==='ongoing'?'active':''}" data-order-group="ongoing">Ongoing <b>${ongoingTabs[0][2].length}</b></button>
        <button class="order-group-btn ${group==='fulfilled'?'active':''}" data-order-group="fulfilled">Fulfilled <b>${fulfilledTabs[0][2].length}</b></button>
      </div>
      <div class="order-page-menu">
        <button class="order-page-menu-trigger" id="orderPageMenuBtn" type="button" aria-label="Order actions" aria-haspopup="menu" aria-expanded="false" aria-controls="orderPageMenuPanel">⋮</button>
        <div class="order-page-menu-panel" id="orderPageMenuPanel" role="menu" hidden>${orderMenuItems}</div>
      </div>
    </div>
    ${section(selectedTabs, group)}`;
  state.orderSnapshot = nextSnapshot;
  $$('[data-order-account]').forEach(button => button.onclick = () => {
    state.orderCredentialId = Number(button.dataset.orderAccount || 0);
    if (state.orderCredentialId) localStorage.setItem('crmOrderCredentialId', String(state.orderCredentialId));
    else localStorage.removeItem('crmOrderCredentialId');
    setNotificationCredentialScope(state.orderCredentialId, { sync:true, immediate:true });
    state.orderSnapshot = null;
    renderOrders();
  });
  $('#refreshBtn').onclick = () => refreshOrdersFromButton($('#refreshBtn'));
  if (canSyncBinance && $('#syncBinanceOrdersBtn')) $('#syncBinanceOrdersBtn').onclick = () => openBinanceOrderSyncModal(liveCredentialOptions, requestedCredentialId);
  if (canCreateBinance && $('#newOrderBtn')) $('#newOrderBtn').onclick = () => openCreateOrderModal('binance', liveCredentialOptions, requestedCredentialId);
  if (canCreateOffline && $('#newOfflineOrderBtn')) $('#newOfflineOrderBtn').onclick = () => openCreateOrderModal('offline', liveCredentialOptions, requestedCredentialId);
  bindOrderPageMenu();
  $$('[data-order-group]').forEach(btn => btn.onclick = () => {
    state.orderGroup = btn.dataset.orderGroup || 'ongoing';
    localStorage.setItem('crmOrderGroup', state.orderGroup);
    renderOrders();
  });
  $$('[data-open-order-card]').forEach(card => {
    const openOrder = () => setRoute('orders', { orderId: Number(card.dataset.openOrderCard) });
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
    state.orderActiveTabs[scope] = key;
    try { localStorage.setItem(`crmOrderTab:${scope}`, key); } catch {}
    $$(`[data-tab-scope="${scope}"]`).forEach(x => x.classList.toggle('active', x.dataset.tabKey === key));
    $$(`[data-panel-scope="${scope}"]`).forEach(x => x.classList.toggle('active', x.dataset.panelKey === key));
  });
  startCountdownTimers();
  window.setTimeout(() => maybePromptOrderAcceptance(state.orderAcceptance || {}), 80);
  if (state.orderListRefreshTimer) clearTimeout(state.orderListRefreshTimer);
  state.orderListRefreshTimer = setTimeout(() => {
    if (state.page === 'orders' && !state.currentOrderId && !modalOpen()) scheduleSmoothRefresh(0);
  }, Math.max(5000, autoSyncSeconds * 1000));
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
      : '<br/><span class="badge warn">No evidence</span>';
  const restricted = state.user?.role === 'agent' || s.account?.restricted;
  const accountLabel = restricted ? 'Managed payment account' : (s.account?.accountNumber || 'System-managed account');
  const methodLabel = restricted ? '' : (s.account?.method?.name || '');
  return `<div class="split-row">
    <div class="toolbar compact">
      <div><b>${escapeHtml(accountLabel)}</b>${methodLabel ? ` - ${escapeHtml(methodLabel)}` : ''}<br/><span class="sub">${s.agent?.name ? `User: ${escapeHtml(s.agent.name)}` : ''}</span></div>
      ${state.user?.role === 'agent' ? '' : `<button data-update-split="${s.id}">Edit</button>`}
    </div>
    Amount: <b>${money(s.actualAmount)}</b> | Charge / commission: <b>${money(s.transactionChargeAmount || 0)}</b> | Status: ${badge(s.status, statusClass(s.status))}
    ${proof}
    ${s.note ? `<br/><span class="sub">Note: ${escapeHtml(s.note)}</span>` : ''}
  </div>`;
}
