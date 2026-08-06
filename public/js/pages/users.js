// P2PFlow v1.0.80
// Page module: users. Edit this file for the users page UI.

async function renderUsers() {
  setTitle('Users & Permissions', 'Employees, managers, auditors and exact permission rules in one admin panel.');
  const agents = await api('/api/agents');
  const accounts = await api('/api/payment-accounts');
  state.bootstrap.agents = agents.items;
  state.p2pCredentialOptions = Array.isArray(agents.p2pCredentialOptions) ? agents.p2pCredentialOptions : [];
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
      <div class="actions"><button id="addUserBtn">Add User + Login</button><button class="secondary" id="goRolesBtn">User Roles</button>${hasPerm('activity.view') ? '<button class="ghost" id="goActivityBtn">Activity Monitor</button>' : ''}</div>
      <div class="sub">Presence updates live from heartbeat, visibility, focus and interaction. Active, online, idle and away users remain assignment-eligible; only offline users are excluded.</div>
    </div>
    <div class="report-cards wide">
      ${agents.items.map(a => {
        const aa = accounts.items.filter(x => x.agentId === a.id);
        const perms = a.user?.permissions || [];
        const p = a.presence || {};
        const today = a.activityToday || {};
        return `<div class="user-card">
          <div class="user-card-head"><div><b>${escapeHtml(a.name)}</b><span>${a.user ? escapeHtml(a.user.username) : 'No login yet'} · ${escapeHtml(p.page || 'no active page')}</span></div>${badge(a.status, statusClass(a.status))}</div>
          <div class="user-stats">
            <div><span>Permissions</span><b>${perms.length}</b></div>
            <div><span>Accounts</span><b>${aa.length}</b></div>
            <div><span>Today App Open</span><b>${activityDuration(today.openSeconds)}</b></div>
            <div><span>Today Active</span><b>${activityDuration(today.activeSeconds)}</b></div>
            <div><span>Today Engaged</span><b>${activityDuration(today.engagedSeconds)}</b></div>
            <div><span>Audited Actions</span><b>${escapeHtml(today.actions || 0)}</b></div>
            <div><span>Cash</span><b>${money(sumLocal(aa.map(x=>x.currentBalance)))}</b></div>
            <div><span>Last Seen</span><b class="activity-small-value">${escapeHtml(fmt(p.lastSeenAt))}</b></div>
          </div>
          <button data-edit-agent="${a.id}">Edit User / Permissions</button>
        </div>`;
      }).join('') || '<div class="empty-state">No users</div>'}
    </div>`;
  $('#addUserBtn').onclick = () => openUserModal();
  if ($('#goRolesBtn')) $('#goRolesBtn').onclick = () => setRoute('user-roles');
  if ($('#goActivityBtn')) $('#goActivityBtn').onclick = () => setRoute('activity');
  $$('[data-edit-agent]').forEach(b => b.onclick = () => openUserModal(agents.items.find(a => a.id === Number(b.dataset.editAgent))));
}
