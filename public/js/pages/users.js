// P2PFlow v1.5.34
// Page module: users. Edit this file for the users page UI.

async function renderUsers() {
  setTitle('Users & Permissions');
  const agents = await api('/api/agents');
  const accounts = await api('/api/payment-accounts');
  state.bootstrap.agents = agents.items;
  state.binanceCredentialOptions = Array.isArray(agents.binanceCredentialOptions) ? agents.binanceCredentialOptions : (Array.isArray(agents.p2pCredentialOptions) ? agents.p2pCredentialOptions : []);
  state.p2pCredentialOptions = state.binanceCredentialOptions;
  state.binanceAccountPermissions = Array.isArray(agents.binanceAccountPermissions) ? agents.binanceAccountPermissions : [];
  state.binanceAccountPermissionGroups = Array.isArray(agents.binanceAccountPermissionGroups) ? agents.binanceAccountPermissionGroups : [];
  const totalBalance = sumLocal(accounts.items.map(x => x.currentBalance));
  const onlineUsers = agents.items.filter(a => a.status !== 'offline').length;
  const activeUsers = agents.items.filter(a => a.status === 'active').length;
  $('#content').innerHTML = `
    <div class="admin-hero user-admin-hero">
      <div>
        <span class="dash-eyebrow">Admin Panel</span>
        <h2>User Management</h2>
        <p>Manage all users, managers, auditors, employees, logins and permissions here.</p>
      </div>
      <div class="admin-quick-stats">
        <div><span>Total Users</span><b>${agents.items.length}</b></div>
        <div><span>Online Now</span><b>${onlineUsers} <small>(${activeUsers} active)</small></b></div>
        <div><span>Wallet Balance</span><b>${money(totalBalance)}</b></div>
      </div>
    </div>
    <div class="toolbar mt">
      <div class="actions"><button type="button" id="addUserBtn">Add User + Login</button><button type="button" class="secondary" id="goRolesBtn">User Roles</button>${hasPerm('activity.view') ? '<button type="button" class="ghost" id="goActivityBtn">Activity Monitor</button>' : ''}</div>
    </div>
    <div class="report-cards wide">
      ${agents.items.map(a => {
        const aa = accounts.items.filter(x => x.agentId === a.id);
        const perms = a.user?.permissions || [];
        const accountGrants = a.user?.binanceCredentialPermissions || [];
        const grantedActions = accountGrants.reduce((total, row) => total + (row.permissions || []).length, 0);
        const p = a.presence || {};
        const today = a.activityToday || {};
        const orderOnlyAssignment = state.bootstrap?.settings?.requirePaymentAccountCapacityForAutoAssignment === false || a.user?.assignmentAccountingEnabled === false;
        return `<div class="user-card">
          <div class="user-card-head"><div><b>${escapeHtml(a.name)}</b><span>${a.user ? escapeHtml(a.user.username) : 'No login yet'} · ${escapeHtml(p.page || 'no active page')}</span></div>${badge(a.status, statusClass(a.status))}</div>
          <div class="user-stats">
            <div><span>Global Permissions</span><b>${perms.length}</b></div>
            <div><span>Binance Accounts</span><b>${accountGrants.length} <small>(${grantedActions} grants)</small></b></div>
            <div><span>Security Question</span><b>${a.user?.securityFallbackConfigured ? '<span class="text-ok">Set</span>' : '<span class="text-warn">Not set</span>'}</b></div>
            <div><span>Work Status</span><b>${a.orderAcceptance?.accepting ? '<span class="text-ok">ON</span>' : '<span class="text-warn">OFF</span>'}</b></div>
            <div><span>Assignment Mode</span><b>${orderOnlyAssignment ? '<span class="text-warn">Order-only</span>' : '<span class="text-ok">Accounting-aware</span>'}</b></div>
            <div><span>Profit Accounting</span><b>${a.includeProfitInCompanyTotals === false ? '<span class="text-warn">Individual only</span>' : '<span class="text-ok">Company total</span>'}</b></div>
            <div><span>Payment Accounts</span><b>${aa.length}</b></div>
            <div><span>Today App Open</span><b>${activityDuration(today.openSeconds)}</b></div>
            <div><span>Today Active</span><b>${activityDuration(today.activeSeconds)}</b></div>
            <div><span>Today Engaged</span><b>${activityDuration(today.engagedSeconds)}</b></div>
            <div><span>Audited Actions</span><b>${escapeHtml(today.actions || 0)}</b></div>
            <div><span>Cash</span><b>${money(sumLocal(aa.map(x=>x.currentBalance)))}</b></div>
            <div><span>Last Seen</span><b class="activity-small-value">${escapeHtml(fmt(p.lastSeenAt))}</b></div>
          </div>
          <button type="button" data-edit-agent="${Number(a.id || 0)}">Edit User / Permissions</button>
        </div>`;
      }).join('') || '<div class="empty-state">No users</div>'}
    </div>`;
  const bindUserAction = (selector, handler) => {
    const button = $(selector);
    if (!button) return;
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      try {
        handler(event);
      } catch (error) {
        console.error('User action failed', error);
        notify(error?.message || 'Could not complete the user action.', 'danger', 6500);
      }
    });
  };
  bindUserAction('#addUserBtn', () => openUserModal(null));
  bindUserAction('#goRolesBtn', () => setRoute('user-roles'));
  bindUserAction('#goActivityBtn', () => setRoute('activity'));
  $$('[data-edit-agent]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    const userItem = agents.items.find(agent => Number(agent.id) === Number(button.dataset.editAgent));
    if (!userItem) return notify('User could not be found.', 'danger', 5000);
    openUserModal(userItem);
  }));
}
