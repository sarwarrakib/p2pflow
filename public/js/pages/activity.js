// P2PFlow v1.0.80
// v1.0.79 dynamic user presence, session and live activity analytics.

function activityDuration(value=0) {
  const total = Math.max(0, Math.round(Number(value || 0)));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function activityTopPages(pages={}) {
  const rows = Object.entries(pages || {}).sort((a,b) => Number(b[1]?.openSeconds || 0) - Number(a[1]?.openSeconds || 0)).slice(0, 4);
  return rows.length ? rows.map(([name, item]) => `${escapeHtml(name)} ${activityDuration(item.openSeconds)}`).join('<br/>') : '-';
}

function activityUserLabel(row={}) {
  return escapeHtml(row.agentName || row.user?.name || row.user?.username || ('#' + (row.user?.id || '')));
}

async function renderActivityMonitor(options={}) {
  setTitle('Activity Monitor');
  const filter = state.activityFilter || { period:'daily', start:'', end:'', userId:'' };
  const qs = new URLSearchParams({ period: filter.period || 'daily' });
  if (filter.start) qs.set('start', filter.start);
  if (filter.end) qs.set('end', filter.end);
  if (filter.userId) qs.set('userId', filter.userId);
  const data = await api('/api/activity/users?' + qs.toString(), { silent: !!options.soft });
  const users = data.users || [];
  const liveCount = users.filter(row => row.presence?.status !== 'offline').length;
  const activeCount = users.filter(row => row.presence?.status === 'active').length;
  const idleCount = users.filter(row => ['idle','away'].includes(row.presence?.status)).length;
  const totalActions = users.reduce((sum, row) => sum + Number(row.summary?.actions || 0), 0);
  const periodLabel = { daily:'Daily', monthly:'Monthly', yearly:'Yearly', lifetime:'Lifetime', custom:'Custom' }[data.range?.period] || 'Daily';
  $('#content').innerHTML = `
    <div class="activity-privacy notice"><b>Tracking scope:</b> ${escapeHtml(data.notice || '')}</div>
    <div class="report-filter card mt">
      <div><h3>Presence & Activity</h3><p>${escapeHtml(periodLabel)} · ${escapeHtml(data.range?.label || '')} · heartbeat ${escapeHtml(data.config?.heartbeatSeconds || 15)}s</p></div>
      <form id="activityFilterForm" class="report-filter-form">
        <select name="period">
          <option value="daily" ${filter.period==='daily'?'selected':''}>Daily</option>
          <option value="monthly" ${filter.period==='monthly'?'selected':''}>Monthly</option>
          <option value="yearly" ${filter.period==='yearly'?'selected':''}>Yearly</option>
          <option value="lifetime" ${filter.period==='lifetime'?'selected':''}>Lifetime</option>
          <option value="custom" ${filter.period==='custom'?'selected':''}>Custom</option>
        </select>
        <input name="start" type="date" value="${escapeAttr(filter.start || '')}" />
        <input name="end" type="date" value="${escapeAttr(filter.end || '')}" />
        <select name="userId"><option value="">All users</option>${(data.availableUsers || []).map(user => `<option value="${Number(user.id || 0)}" ${String(filter.userId)===String(user.id)?'selected':''}>${escapeHtml(user.name || user.username || ('#' + user.id))}</option>`).join('')}</select>
        <button type="submit">Apply</button>
        <button type="button" class="secondary" id="activityRefreshBtn">Refresh</button>
      </form>
    </div>
    <div class="grid cards mt activity-metrics">
      ${metric('Online Now', liveCount, `${activeCount} active`)}
      ${metric('Active Now', activeCount, 'visible + focused + recent interaction')}
      ${metric('Idle / Away', idleCount, 'open but idle/background')}
      ${metric('Audited Actions', totalActions, periodLabel)}
    </div>
    <div class="card mt">
      <div class="section-head"><h3>User Summary</h3><span>${users.length} users</span></div>
      ${table(['User','Live State','Current Page','Login','App Open','Active','Engaged','Idle','Background','Interactions','Actions','Sessions','Engagement'], users.map(row => {
        const p = row.presence || {};
        const s = row.summary || {};
        return [
          `${activityUserLabel(row)}<br/><span class="sub">${escapeHtml(row.user?.username || '')}</span>`,
          `${badge(p.status || 'offline', statusClass(p.status || 'offline'))}<br/><span class="sub">Seen ${escapeHtml(fmt(p.lastSeenAt))}${p.lastWorkAt ? `<br/>Work ${escapeHtml(fmt(p.lastWorkAt))}` : ''}</span>`,
          `${escapeHtml(p.page || '-')} ${p.orderId ? `<br/><span class="sub">Order #${escapeHtml(p.orderId)}</span>` : ''}`,
          activityDuration(s.loginSeconds),
          activityDuration(s.openSeconds),
          activityDuration(s.activeSeconds),
          activityDuration(s.engagedSeconds),
          activityDuration(s.idleSeconds),
          activityDuration(s.hiddenSeconds),
          escapeHtml(s.interactions || 0),
          escapeHtml(s.actions || 0),
          escapeHtml(s.sessions || 0),
          `${escapeHtml(s.engagementRate || 0)}%<br/><span class="sub">${activityTopPages(s.pages)}</span>`
        ];
      }))}
    </div>
    <div class="card mt">
      <div class="section-head"><h3>Session History</h3><span>Latest ${Math.min(300, (data.sessions || []).length)}</span></div>
      ${table(['User','Login','End','State','Login Time','App Open','Active','Engaged','Idle','Hidden','Interactions','Actions','Last Page','IP','Device'], (data.sessions || []).map(session => [
        `${escapeHtml(session.userName || session.username || '')}<br/><span class="sub">${escapeHtml(session.role || '')}</span>`,
        escapeHtml(fmt(session.loginAt)),
        session.endedAt ? `${escapeHtml(fmt(session.endedAt))}<br/><span class="sub">${escapeHtml(session.closeReason || '')}</span>` : 'Open',
        badge(session.status || 'offline', statusClass(session.status || 'offline')),
        activityDuration(session.loginSeconds),
        activityDuration(session.openSeconds),
        activityDuration(session.activeSeconds),
        activityDuration(session.engagedSeconds),
        activityDuration(session.idleSeconds),
        activityDuration(session.hiddenSeconds),
        escapeHtml(session.interactionCount || 0),
        escapeHtml(session.actionCount || 0),
        escapeHtml(session.lastPage || '-'),
        `<span class="sub">${escapeHtml(session.ip || '-')}</span>`,
        `<span class="sub activity-device">${escapeHtml(session.userAgent || '-')}</span>`
      ]))}
    </div>
    <div class="card mt">
      <div class="section-head"><h3>Recent Audited Work</h3><span>Successful server actions</span></div>
      ${table(['Time','User','Action','Entity'], (data.recentActions || []).map(item => [
        escapeHtml(fmt(item.createdAt)),
        escapeHtml(item.userName || ('#' + item.userId)),
        escapeHtml(item.action || ''),
        `${escapeHtml(item.entityType || '-')} ${item.entityId != null ? '#' + escapeHtml(item.entityId) : ''}`
      ]))}
    </div>`;

  $('#activityFilterForm').onsubmit = event => {
    event.preventDefault();
    state.activityFilter = Object.fromEntries(new FormData(event.target));
    renderActivityMonitor();
  };
  $('#activityRefreshBtn').onclick = () => renderActivityMonitor();
  if (state.activityViewTimer) clearTimeout(state.activityViewTimer);
  state.activityViewTimer = setTimeout(() => {
    if (state.page === 'activity' && !modalOpen()) renderActivityMonitor({ soft:true }).catch(()=>{});
  }, 5000);
}
