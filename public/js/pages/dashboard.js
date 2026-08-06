// P2PFlow v1.0.111
// Page module: dashboard. Edit this file for the dashboard page UI.

async function renderDashboard() {
  setTitle('Dashboard', '');
  const data = await api('/api/dashboard');
  const topUsers = data.byAgent.slice(0, 6);
  const methodCards = data.byMethod.map(methodDashCard).join('') || '<div class="sub">No payment accounts have been added yet.</div>';
  const alerts = data.notifications.slice(0, 5).map(n => `<div class="alert-item"><b>${escapeHtml(n.type)}</b><span>${escapeHtml(n.message)}</span><small>${fmt(n.createdAt)}</small></div>`).join('') || '<div class="empty-state">No alerts</div>';
  $('#content').innerHTML = `
    <div class="dash-hero">
      <div>
        <span class="dash-eyebrow">Live Control</span>
        <h2>Operations Dashboard</h2>
        <p>Cash, capacity, users and pending work in one clean view.</p>
      </div>
      <div class="dash-hero-amount">
        <span>Total Balance</span>
        <b>${money(data.totals.totalCashBalance)}</b>
      </div>
    </div>

    <div class="grid cards dash-metrics mt">
      ${data.business && canPage('accounting') ? dashMetric('Business Capital', money(data.business.summary.totalCapital), '◈', 'accounting') : dashMetric('Cash Balance', money(data.totals.totalCashBalance), '💼', 'accounts')}
      ${data.business && canPage('accounting') ? dashMetric('Today Net Profit', money(data.business.summary.netProfit), '◎', 'accounting') : ''}
      ${dashMetric('BUY Capacity', money(data.totals.buyCapacity), '↗', 'accounts')}
      ${dashMetric('SELL Capacity', money(data.totals.sellReceiveCapacity), '↘', 'accounts')}
      ${dashMetric('Pending', String(data.totals.pendingOrders), '⏱', 'orders')}
      ${hasPerm('approvals.manage') ? dashMetric('Approvals', String(data.totals.pendingApprovals || 0), '✓', 'approvals') : ''}
    </div>

    <div class="dash-main mt">
      <div class="card dash-card large">
        <div class="section-head"><h3>Method Capacity</h3><span>Live</span></div>
        <div class="method-grid">${methodCards}</div>
      </div>
      <div class="card dash-card">
        <div class="section-head"><h3>Today</h3><span>${fmt(data.lastUpdated)}</span></div>
        <div class="today-stack">
          ${data.business ? `<div><span>Gross Profit</span><b>${money(data.business.summary.grossProfit)}</b></div><div><span>Expense</span><b>${money(data.business.summary.expenses)}</b></div>` : ''}
          <div><span>BUY Sent</span><b>${money(data.totals.buySentToday)}</b></div>
          <div><span>SELL Received</span><b>${money(data.totals.sellReceivedToday)}</b></div>
          <div><span>Hold Queue</span><b>${data.totals.holdOrders}</b></div>
          ${hasPerm('approvals.manage') ? `<div><span>Approval Queue</span><b>${data.totals.pendingApprovals || 0}</b></div>` : ''}
        </div>
      </div>
    </div>

    <div class="grid two mt">
      <div class="card dash-card">
        <div class="section-head"><h3>Users</h3><span>${topUsers.length} shown</span></div>
        <div class="agent-list">
          ${topUsers.map(a => `<div class="agent-row"><div><b>${escapeHtml(a.name)} ${badge(a.status, statusClass(a.status))}</b><span>${escapeHtml(a.presence?.page || 'no active page')} · ${a.accountCount} accounts</span></div><div><b>${activityDuration(a.activityToday?.activeSeconds || 0)}</b><span>active today · ${escapeHtml(a.activityToday?.actions || 0)} actions</span></div></div>`).join('') || '<div class="empty-state">No users</div>'}
        </div>
      </div>
      <div class="card dash-card">
        <div class="section-head"><h3>Alerts</h3><span>${data.notifications.length}</span></div>
        <div class="alert-list">${alerts}</div>
      </div>
    </div>`;
  $$('[data-route]').forEach(el => el.onclick = () => setRoute(el.dataset.route));
}
