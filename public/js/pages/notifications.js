// P2PFlow v1.0.102
// Page module: notifications. Edit this file for the notifications page UI.

async function renderNotifications() {
  setTitle('Panel SMS / Alerts', 'Order assignment, security and system alerts.');
  const data = await api('/api/notifications');
  const rows = (data.items || []).map(n => [
    fmt(n.createdAt),
    escapeHtml(n.type || ''),
    escapeHtml(n.message || ''),
    escapeHtml(n.smsChannel || n.audience || ''),
    n.orderId ? `<button onclick="setRoute('orders',{orderId:${Number(n.orderId)}})">Open Order</button>` : ''
  ]);
  $('#content').innerHTML = `<div class="card admin-card">
    <div class="section-head"><h3>Panel SMS / Alerts</h3><button id="markAlertsReadBtn" class="ghost">Mark all read</button></div>
    ${rows.length ? table(['Time','Type','Message','Channel','Action'], rows) : '<div class="empty-state">No panel alerts yet.</div>'}
  </div>`;
  const btn = $('#markAlertsReadBtn');
  if (btn) btn.onclick = async () => { await api('/api/notifications', { method:'POST', body: JSON.stringify({ markRead: true, includeChats: true }) }); notify('All notifications marked read.', 'ok'); scheduleHeaderNotificationRefresh(50); renderNotifications(); };
}

