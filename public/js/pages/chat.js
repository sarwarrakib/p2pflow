// P2PFlow v1.5.24
// Binance-style P2P message inbox. Threads open the corresponding order chat.

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
        <small class="chat-thread-order">${escapeHtml(item.orderNo || '')}</small>
      </span>
      <span class="chat-thread-meta">
        <time datetime="${escapeAttr(item.createdAt || '')}">${escapeHtml(chatInboxTimeLabel(item.createdAt))}</time>
        ${unread ? `<span class="chat-thread-unread">${unreadLabel}</span>` : ''}
      </span>
    </button>`;
  }).join('');
}

function filterChatInboxItems(items=[], query='') {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter(item => [
    item.counterpartyName,
    item.counterpartyRealName,
    item.orderNo,
    item.lastMessage,
    chatInboxPreview(item)
  ].some(value => String(value || '').toLowerCase().includes(q)));
}

async function renderChatInbox(options={}) {
  setTitle('P2P Message');
  const active = document.activeElement;
  const hadSearchFocus = options.preserveFocus && active?.id === 'chatInboxSearch';
  const selectionStart = hadSearchFocus ? active.selectionStart : null;
  const data = await api('/api/chat-inbox', { silent:Boolean(options.preserveFocus), noAutoReload:Boolean(options.preserveFocus) });
  const items = data?.items || [];
  const visible = filterChatInboxItems(items, state.chatInboxSearch);
  const existingList = $('#chatThreadList');
  if (options.preserveFocus && existingList && state.page === 'chat') {
    const page = existingList.closest('.chat-inbox-page');
    const pageScrollTop = page?.scrollTop || 0;
    const windowScrollY = window.scrollY || 0;
    existingList.innerHTML = renderChatInboxThreads(visible);
    const summary = $('#chatInboxSummary');
    if (summary) summary.innerHTML = `<span>${items.length} conversation${items.length === 1 ? '' : 's'}</span>${Number(data?.totalUnread || 0) ? `<b>${Number(data.totalUnread)} unread</b>` : ''}`;
    bindChatInboxThreadClicks();
    bindBackgroundNotificationControls(page || document);
    if (page) page.scrollTop = pageScrollTop;
    requestAnimationFrame(() => window.scrollTo({ top:windowScrollY, left:0, behavior:'auto' }));
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
      ${backgroundNotificationToggleHtml({ compact:true })}
    </div>
    <div class="chat-inbox-search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16.5 16.5 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input id="chatInboxSearch" type="search" autocomplete="off" placeholder="Search" value="${escapeAttr(state.chatInboxSearch || '')}" aria-label="Search P2P messages" />
      ${state.chatInboxSearch ? '<button id="clearChatInboxSearch" type="button" aria-label="Clear search">×</button>' : ''}
    </div>
    <div class="chat-inbox-summary" id="chatInboxSummary"><span>${items.length} conversation${items.length === 1 ? '' : 's'}</span>${Number(data?.totalUnread || 0) ? `<b>${Number(data.totalUnread)} unread</b>` : ''}</div>
    <div class="chat-thread-list" id="chatThreadList">${renderChatInboxThreads(visible)}</div>
  </div>`;

  const search = $('#chatInboxSearch');
  if (search) {
    search.oninput = () => {
      state.chatInboxSearch = search.value;
      const filtered = filterChatInboxItems(items, state.chatInboxSearch);
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
    renderChatInbox({ preserveFocus:true });
  };
  bindChatInboxThreadClicks();
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
