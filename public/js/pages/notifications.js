// P2PFlow v1.5.23
// User-controlled in-app and email notification preferences.

function notificationPreferenceRows(data={}) {
  const preferences = data.preferences || { inApp:{}, email:{}, push:{} };
  return (data.categories || []).map(category => {
    const mandatory = category.mandatory === true;
    const inApp = mandatory || preferences.inApp?.[category.id] !== false;
    const email = mandatory || preferences.email?.[category.id] !== false;
    const push = mandatory || preferences.push?.[category.id] !== false;
    return `<div class="notification-preference-row" data-notification-category="${escapeAttr(category.id)}">
      <div class="notification-preference-info">
        <b>${escapeHtml(category.label || category.id)}</b>
        <small>${escapeHtml(category.description || '')}</small>
        ${mandatory ? '<span class="badge warn">Required for security</span>' : ''}
      </div>
      <label class="notification-channel-toggle"><input type="checkbox" data-notification-channel="inApp" ${inApp ? 'checked' : ''} ${mandatory ? 'disabled' : ''}/><span>In App</span></label>
      <label class="notification-channel-toggle"><input type="checkbox" data-notification-channel="email" ${email ? 'checked' : ''} ${mandatory ? 'disabled' : ''}/><span>Email</span></label>
      <label class="notification-channel-toggle"><input type="checkbox" data-notification-channel="push" ${push ? 'checked' : ''} ${mandatory ? 'disabled' : ''}/><span>Background</span></label>
    </div>`;
  }).join('');
}

async function renderNotifications() {
  setTitle('Notifications');
  const data = await api('/api/notifications');
  state.pushConfig = data.backgroundNotifications || state.pushConfig;
  const rows = (data.items || []).map(n => [
    fmt(n.createdAt),
    escapeHtml((data.categories || []).find(category => category.id === n.category)?.label || n.category || n.type || ''),
    escapeHtml(n.message || ''),
    n.read === true || n.status === 'read' ? badge('Read') : badge('Unread', 'warn'),
    n.orderId ? `<button type="button" data-open-notification-order="${Number(n.orderId)}">Open Order</button>` : ''
  ]);
  $('#content').innerHTML = `<div class="notification-settings-page">
    <section class="card notification-preferences-card">
      <div class="section-head"><div><h3>Notification Preferences</h3><p>Choose in-app, email and background notification groups.</p></div><div class="notification-preference-actions"><button type="button" id="saveNotificationPreferences">Save Preferences</button></div></div>
      <div class="notification-channel-head"><span>Notification Group</span><span>In App</span><span>Email</span><span>Background</span></div>
      <div id="notificationPreferenceRows">${notificationPreferenceRows(data)}</div>
      <div id="notificationPreferencesMessage"></div>
    </section>
    <section class="card admin-card">
      <div class="section-head"><div><h3>Notification History</h3><p>Only notification categories enabled for this user are shown.</p></div><button type="button" id="markAlertsReadBtn" class="ghost">Mark all read</button></div>
      ${rows.length ? table(['Time','Category','Message','Status','Action'], rows) : '<div class="empty-state">No notifications yet.</div>'}
    </section>
  </div>`;

  $('#saveNotificationPreferences')?.addEventListener('click', async () => {
    const preferences = { inApp:{}, email:{}, push:{} };
    $$('[data-notification-category]').forEach(row => {
      const category = row.dataset.notificationCategory;
      for (const channel of ['inApp','email','push']) {
        const input = row.querySelector(`[data-notification-channel="${channel}"]`);
        preferences[channel][category] = input?.disabled ? true : input?.checked !== false;
      }
    });
    const button = $('#saveNotificationPreferences');
    if (button) button.disabled = true;
    try {
      const result = await api('/api/notifications', { method:'PATCH', body:JSON.stringify({ preferences }) });
      state.user.notificationPreferences = result.preferences || preferences;
      state.pushConfig = result.backgroundNotifications || state.pushConfig;
      updateBackgroundNotificationControls();
      setFormMessage('#notificationPreferencesMessage', result.message || 'Notification preferences saved.', 'ok');
      notify('Notification preferences saved.', 'ok');
      scheduleHeaderNotificationRefresh(50);
    } catch (err) {
      setFormMessage('#notificationPreferencesMessage', err.message || 'Could not save notification preferences.', 'danger');
    } finally {
      if (button) button.disabled = false;
    }
  });

  $('#markAlertsReadBtn')?.addEventListener('click', async () => {
    await api('/api/notifications', { method:'POST', body: JSON.stringify({ markRead: true, includeChats: true }) });
    notify('All notifications marked read.', 'ok');
    scheduleHeaderNotificationRefresh(50);
    renderNotifications();
  });
  $$('[data-open-notification-order]').forEach(button => {
    button.addEventListener('click', () => setRoute('orders', { orderId: Number(button.dataset.openNotificationOrder || 0) }));
  });
}
