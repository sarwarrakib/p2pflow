// P2PFlow v1.0.51
// Page module: user-roles. Edit this file for the user-roles page UI.

async function renderUserRoles() {
  setTitle('User Roles');
  const data = await api('/api/user-roles');
  state.bootstrap.userRoles = data.items;
  $('#content').innerHTML = `
    <div class="toolbar"><div class="actions"><button id="addRoleBtn">Create User Role</button><button class="secondary" id="backUsersBtn">Back to Users</button></div><div class="sub">Role templates control user access. Examples: Cashier, Night Manager, Auditor, Junior Employee.</div></div>
    <div class="report-cards wide mt">
      ${data.items.map(r => `<div class="user-card role-card">
        <div class="user-card-head"><div><b>${escapeHtml(r.name)}</b><span>${escapeHtml(r.description || '')}</span></div>${badge(r.systemRole, r.systemRole==='agent'?'blue':r.systemRole==='manager'?'ok':'warn')}</div>
        <div class="user-stats"><div><span>Permissions</span><b>${(r.permissions || []).length}</b></div><div><span>Locked</span><b>${r.locked ? 'Yes' : 'No'}</b></div></div>
        <div class="perm-preview">${(r.permissions || []).slice(0,8).map(p => `<span>${escapeHtml(PERMISSION_LABELS[p] || p)}</span>`).join('')}${(r.permissions||[]).length>8?'<span>...</span>':''}</div>
        <div class="actions"><button data-edit-role="${Number(r.id || 0)}">Edit Role</button>${r.locked ? '' : `<button class="warn" data-del-role="${Number(r.id || 0)}">Delete</button>`}</div>
      </div>`).join('')}
    </div>`;
  $('#addRoleBtn').onclick = () => openRoleModal();
  $('#backUsersBtn').onclick = () => setRoute('agents');
  $$('[data-edit-role]').forEach(b => b.onclick = () => openRoleModal(data.items.find(r => Number(r.id) === Number(b.dataset.editRole))));
  $$('[data-del-role]').forEach(b => b.onclick = async () => { if(confirm('Delete this role?')) { await api('/api/user-roles/' + b.dataset.delRole, { method:'DELETE' }); notify('Role deleted.', 'ok'); renderUserRoles(); } });
}

