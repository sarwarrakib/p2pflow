// P2PFlow v1.7.5
// Binance-style P2P message inbox with per-CRM-user account controls layered on existing permissions.

function stopChatInboxAutoRefresh() {
  if (state.chatInboxRefreshTimer) clearTimeout(state.chatInboxRefreshTimer);
  state.chatInboxRefreshTimer = null;
}

function scheduleChatInboxAutoRefresh(delay=12000) {
  stopChatInboxAutoRefresh();
  state.chatInboxRefreshTimer = setTimeout(() => {
    if (state.page !== 'chat' || modalOpen()) return;
    renderChatInbox({ preserveFocus:true }).catch(() => {});
  }, Math.max(5000, Number(delay || 12000)));
}

function chatInboxTimeLabel(value) {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return '';
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const itemDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((dayStart - itemDayStart) / 86400000);
  if (dayDiff === 0) return date.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:false });
  if (dayDiff === 1) return 'Yesterday';
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  return date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'2-digit' });
}

function chatInboxInitial(name='') {
  const clean = String(name || '').trim();
  const match = clean.match(/[A-Za-z0-9]/);
  return (match ? match[0] : '?').toUpperCase();
}

function chatInboxPreview(item={}) {
  const normalized = normalizeChatDisplayMessage(item.lastMessage || '', item.messageType || '', { order:item });
  const text = normalized?.isSystem
    ? (normalized.systemText || normalized.text || normalized.systemTitle || 'System update')
    : (normalized?.text || item.lastMessage || 'Message');
  return `${item.isSelf ? 'You: ' : ''}${String(text || '').trim()}`;
}

function chatAccountDisplayName(account={}) {
  return String(account.name || account.p2pUsername || account.accountName || (account.id ? `API ${account.id}` : 'API Account'));
}

function normalizeChatAccountOptions(items=[]) {
  return (Array.isArray(items) ? items : []).map(item => ({
    ...item,
    id:Number(item.id || 0),
    featureControls:{
      orders:item.featureControls?.orders !== false,
      notifications:item.featureControls?.notifications !== false,
      advertisements:item.featureControls?.advertisements !== false
    }
  })).filter(item => item.id > 0);
}

function reconcileChatAccountSelection(options=state.chatAccountOptions || []) {
  const selected = Number(state.chatAccountCredentialId || 0);
  if (selected && !options.some(item => Number(item.id) === selected)) {
    state.chatAccountCredentialId = 0;
    try { localStorage.removeItem('crmChatAccountCredentialId'); } catch {}
  }
  return Number(state.chatAccountCredentialId || 0);
}

function chatAccountSelectorHtml(options=state.chatAccountOptions || []) {
  const selectedId = reconcileChatAccountSelection(options);
  const selected = options.find(item => Number(item.id) === selectedId);
  const label = selected ? chatAccountDisplayName(selected) : 'All Accounts';
  return `<div class="chat-account-picker" id="chatAccountPicker">
    <button type="button" class="chat-account-picker-trigger" id="chatAccountPickerBtn" aria-haspopup="menu" aria-expanded="${state.chatAccountMenuOpen ? 'true' : 'false'}">
      <span class="chat-account-picker-label">${escapeHtml(label)}</span>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg>
    </button>
    <div class="chat-account-picker-menu ${state.chatAccountMenuOpen ? '' : 'hidden'}" id="chatAccountPickerMenu" role="menu">
      <button type="button" class="chat-account-picker-row ${selectedId === 0 ? 'active' : ''}" data-chat-account-select="0" role="menuitem">
        <span><b>All Accounts</b><small>Show conversations from every connected account</small></span>
      </button>
      ${options.map(account => `<div class="chat-account-picker-row-wrap ${Number(account.id) === selectedId ? 'active' : ''}">
        <button type="button" class="chat-account-picker-row" data-chat-account-select="${Number(account.id)}" role="menuitem">
          <span><b>${escapeHtml(chatAccountDisplayName(account))}</b><small>${escapeHtml(account.p2pUsername || account.accountName || '')}</small></span>
        </button>
        ${account.canConfigure ? `<button type="button" class="chat-account-settings-btn" data-chat-account-settings="${Number(account.id)}" aria-label="Settings for ${escapeAttr(chatAccountDisplayName(account))}" title="Account settings">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.8 2.8-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1 1.6v.2h-4V21a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .4l-.1.1-2.8-2.8.1-.1a1.8 1.8 0 0 0 .4-2A1.8 1.8 0 0 0 3 14H2.8v-4H3a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.4-2l-.1-.1L6.9 4l.1.1a1.8 1.8 0 0 0 2 .4A1.8 1.8 0 0 0 10 3v-.2h4V3a1.8 1.8 0 0 0 1 1.5 1.8 1.8 0 0 0 2-.4l.1-.1 2.8 2.8-.1.1a1.8 1.8 0 0 0-.4 2A1.8 1.8 0 0 0 21 10h.2v4H21a1.8 1.8 0 0 0-1.6 1Z"/></svg>
        </button>` : ''}
      </div>`).join('')}
    </div>
  </div>`;
}

function chatAccountSettingsModal(account={}) {
  const controls = account.featureControls || {};
  modal(`${chatAccountDisplayName(account)} Settings`, `<form id="chatAccountSettingsForm" class="chat-account-settings-form">
    <p class="sub">These switches apply only to your CRM user for this Binance account. They do not stop the account's Binance synchronization for other users. Existing permissions always remain authoritative.</p>
    <label class="chat-account-setting-row"><span><b>Orders</b><small>Show and receive this account's orders for your CRM user when your existing order permission allows them. Turning this off does not stop system-wide Binance order sync.</small></span><input type="checkbox" name="orders" ${controls.orders !== false ? 'checked' : ''}/></label>
    <label class="chat-account-setting-row"><span><b>Notifications</b><small>Mute or allow only your CRM user's enabled in-app, email and push notifications from this account. Orders still work normally, and the Chat notification master switch can still mute everything.</small></span><input type="checkbox" name="notifications" ${controls.notifications !== false ? 'checked' : ''}/></label>
    <label class="chat-account-setting-row"><span><b>Advertisement</b><small>Show and manage this account in Ads only for your CRM user, subject to your existing advertisement permissions. Background Binance Ads sync continues for the system.</small></span><input type="checkbox" name="advertisements" ${controls.advertisements !== false ? 'checked' : ''}/></label>
    <div id="chatAccountSettingsMessage" class="form-message"></div>
    <div class="actions end"><button type="button" class="secondary" id="chatAccountSettingsCancel">Cancel</button><button type="submit" id="chatAccountSettingsSave">Save</button></div>
  </form>`);
  $('#chatAccountSettingsCancel').onclick = () => closeModal();
  $('#chatAccountSettingsForm').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const save = $('#chatAccountSettingsSave');
    save.disabled = true;
    try {
      const requestedControls = {
        orders:form.elements.orders.checked,
        notifications:form.elements.notifications.checked,
        advertisements:form.elements.advertisements.checked
      };
      const result = await api('/api/chat-account-controls', {
        method:'PATCH',
        body:JSON.stringify({ credentialId:Number(account.id), featureControls:requestedControls })
      });
      state.chatAccountOptions = normalizeChatAccountOptions(result.items || state.chatAccountOptions);
      const changedFeatures = Array.isArray(result.changedFeatures) ? result.changedFeatures : [];
      if (changedFeatures.includes('orders')) {
        state.orderSnapshot = null;
        try { state.routeHostManager?.drop?.('orders'); } catch {}
        if (state.page === 'orders' && !state.currentOrderId && typeof renderOrders === 'function') renderOrders().catch(()=>{});
      }
      closeModal();
      notify('API account settings saved.', 'ok');
      renderChatInbox({ preserveFocus:true, force:true }).catch(()=>{});
    } catch (error) {
      save.disabled = false;
      setFormMessage('#chatAccountSettingsMessage', error.message || 'Could not save account settings.', 'danger');
    }
  };
}

function bindChatAccountPicker(root=document) {
  const trigger = root.querySelector?.('#chatAccountPickerBtn');
  const menu = root.querySelector?.('#chatAccountPickerMenu');
  if (trigger && menu) trigger.onclick = event => {
    event.stopPropagation();
    state.chatAccountMenuOpen = !state.chatAccountMenuOpen;
    menu.classList.toggle('hidden', !state.chatAccountMenuOpen);
    trigger.setAttribute('aria-expanded', state.chatAccountMenuOpen ? 'true' : 'false');
  };
  root.querySelectorAll?.('[data-chat-account-select]').forEach(button => button.onclick = () => {
    state.chatAccountCredentialId = Math.max(0, Number(button.dataset.chatAccountSelect || 0));
    try { localStorage.setItem('crmChatAccountCredentialId', String(state.chatAccountCredentialId)); } catch {}
    state.chatAccountMenuOpen = false;
    renderChatInbox({ preserveFocus:true, localOnly:true }).catch(()=>{});
  });
  root.querySelectorAll?.('[data-chat-account-settings]').forEach(button => button.onclick = event => {
    event.preventDefault(); event.stopPropagation();
    const account = state.chatAccountOptions.find(item => Number(item.id) === Number(button.dataset.chatAccountSettings));
    if (account) chatAccountSettingsModal(account);
  });
}

function renderChatInboxThreads(items=[]) {
  if (!items.length) return '<div class="chat-inbox-empty"><div aria-hidden="true">💬</div><b>No messages yet</b><span>Binance P2P conversations will appear here.</span></div>';
  return items.map(item => {
    const unread = Math.max(0, Number(item.unreadCount || 0));
    const unreadLabel = unread > 99 ? '99+' : String(unread);
    const name = item.counterpartyName || item.counterpartyRealName || 'Counterparty';
    const preview = chatInboxPreview(item);
    return `<button class="chat-thread-item ${unread ? 'unread' : ''}" type="button" data-open-chat-thread="${Number(item.orderId || 0)}" aria-label="Open chat with ${escapeAttr(name)}${unread ? `, ${unread} unread messages` : ''}">
      <span class="chat-thread-avatar" aria-hidden="true">${escapeHtml(chatInboxInitial(name))}</span>
      <span class="chat-thread-copy">
        <b class="chat-thread-name">${escapeHtml(name)}</b>
        <span class="chat-thread-preview">${escapeHtml(preview || 'Message')}</span>
        <small class="chat-thread-order">${escapeHtml(item.orderNo || '')}${item.credentialName ? ` · ${escapeHtml(item.credentialName)}` : ''}</small>
      </span>
      <span class="chat-thread-meta">
        <time datetime="${escapeAttr(item.createdAt || '')}">${escapeHtml(chatInboxTimeLabel(item.createdAt))}</time>
        ${unread ? `<span class="chat-thread-unread">${unreadLabel}</span>` : ''}
      </span>
    </button>`;
  }).join('');
}

function filterChatInboxItems(items=[], query='', credentialId=state.chatAccountCredentialId) {
  const selectedId = Math.max(0, Number(credentialId || 0));
  const accountFiltered = selectedId ? items.filter(item => Number(item.credentialId || 0) === selectedId) : items;
  const q = String(query || '').trim().toLowerCase();
  if (!q) return accountFiltered;
  return accountFiltered.filter(item => [
    item.counterpartyName,
    item.counterpartyRealName,
    item.orderNo,
    item.credentialName,
    item.lastMessage,
    chatInboxPreview(item)
  ].some(value => String(value || '').toLowerCase().includes(q)));
}

function chatInboxApplyData(data={}, options={}) {
  if (Array.isArray(data.accountOptions)) {
    state.chatAccountOptions = normalizeChatAccountOptions(data.accountOptions);
    reconcileChatAccountSelection(state.chatAccountOptions);
  }
  if (Array.isArray(data.items)) state.chatInboxItems = data.items;
  const items = Array.isArray(state.chatInboxItems) ? state.chatInboxItems : [];
  const visible = filterChatInboxItems(items, state.chatInboxSearch, state.chatAccountCredentialId);
  return { items, visible };
}

async function renderChatInbox(options={}) {
  if (state.page !== 'chat') return;
  setTitle('P2P Message');
  const active = document.activeElement;
  const hadSearchFocus = options.preserveFocus && active?.id === 'chatInboxSearch';
  const selectionStart = hadSearchFocus ? active.selectionStart : null;
  let data = { items:state.chatInboxItems || [], accountOptions:state.chatAccountOptions || [] };
  if (!options.localOnly) {
    data = await api('/api/chat-inbox', { silent:Boolean(options.preserveFocus), noAutoReload:Boolean(options.preserveFocus) });
  }
  const { items, visible } = chatInboxApplyData(data, options);
  const totalUnread = visible.reduce((sum, item) => sum + Math.max(0, Number(item.unreadCount || 0)), 0);
  const existingList = $('#chatThreadList');
  if (options.preserveFocus && existingList && state.page === 'chat') {
    const page = existingList.closest('.chat-inbox-page');
    const pageScrollTop = page?.scrollTop || 0;
    const windowScrollY = appScrollTop() || 0;
    existingList.innerHTML = renderChatInboxThreads(visible);
    const summary = $('#chatInboxSummary');
    if (summary) summary.innerHTML = `<span>${visible.length} conversation${visible.length === 1 ? '' : 's'}</span>${totalUnread ? `<b>${totalUnread} unread</b>` : ''}`;
    const controls = $('.chat-page-controls');
    if (controls) controls.innerHTML = `${chatAccountSelectorHtml(state.chatAccountOptions)}${backgroundNotificationToggleHtml({ compact:true })}`;
    bindChatInboxThreadClicks();
    bindChatAccountPicker(page || document);
    bindBackgroundNotificationControls(page || document);
    if (page) page.scrollTop = pageScrollTop;
    appScrollTo({ top:windowScrollY, left:0, behavior:'auto' });
    if (hadSearchFocus) {
      const search = $('#chatInboxSearch');
      search?.focus({ preventScroll:true });
      if (search && selectionStart !== null) search.setSelectionRange(selectionStart, selectionStart);
    }
    scheduleChatInboxAutoRefresh();
    return;
  }
  $('#content').innerHTML = `<div class="chat-inbox-page">
    <div class="chat-page-controls">
      ${chatAccountSelectorHtml(state.chatAccountOptions)}
      ${backgroundNotificationToggleHtml({ compact:true })}
    </div>
    <div class="chat-inbox-search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16.5 16.5 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input id="chatInboxSearch" type="search" autocomplete="off" placeholder="Search" value="${escapeAttr(state.chatInboxSearch || '')}" aria-label="Search P2P messages" />
      ${state.chatInboxSearch ? '<button id="clearChatInboxSearch" type="button" aria-label="Clear search">×</button>' : ''}
    </div>
    <div class="chat-inbox-summary" id="chatInboxSummary"><span>${visible.length} conversation${visible.length === 1 ? '' : 's'}</span>${totalUnread ? `<b>${totalUnread} unread</b>` : ''}</div>
    <div class="chat-thread-list" id="chatThreadList">${renderChatInboxThreads(visible)}</div>
  </div>`;

  const search = $('#chatInboxSearch');
  if (search) {
    search.oninput = () => {
      state.chatInboxSearch = search.value;
      const filtered = filterChatInboxItems(items, state.chatInboxSearch, state.chatAccountCredentialId);
      $('#chatThreadList').innerHTML = renderChatInboxThreads(filtered);
      bindChatInboxThreadClicks();
    };
    if (hadSearchFocus) {
      search.focus({ preventScroll:true });
      if (selectionStart !== null) search.setSelectionRange(selectionStart, selectionStart);
    }
  }
  if ($('#clearChatInboxSearch')) $('#clearChatInboxSearch').onclick = () => {
    state.chatInboxSearch = '';
    renderChatInbox({ preserveFocus:true, localOnly:true });
  };
  bindChatInboxThreadClicks();
  bindChatAccountPicker($('#content') || document);
  bindBackgroundNotificationControls($('#content') || document);
  scheduleChatInboxAutoRefresh();
}

function bindChatInboxThreadClicks() {
  $$('[data-open-chat-thread]').forEach(button => {
    button.onclick = () => {
      const orderId = Number(button.dataset.openChatThread || 0);
      if (!orderId) return;
      state.pendingOpenChatOrderId = orderId;
      setRoute('orders', { orderId });
    };
  });
}
