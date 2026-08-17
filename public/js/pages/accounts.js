// P2PFlow v1.5.17
// Payment accounts: centrally managed, agent-scoped access, compact box-based bulk add.


function paymentAccountChargeLabel(account={}) {
  const mode = String(account.transactionChargeMode || 'none');
  const fixed = Number(account.transactionChargeFixed || 0);
  const percent = Number(account.transactionChargePercent || 0);
  const applies = String(account.transactionChargeAppliesTo || 'send');
  let label = 'No charge';
  if (mode === 'fixed') label = `${money(fixed)} fixed`;
  else if (mode === 'percentage') label = `${percent}%`;
  else if (mode === 'fixed_percentage') label = `${money(fixed)} + ${percent}%`;
  else if (mode === 'tiered') label = `${(account.transactionChargeTiers || []).length} tier(s)`;
  else if (mode === 'manual') label = 'Manual actual';
  return `${escapeHtml(label)}<br><span class="sub">${escapeHtml(applies)}</span>`;
}

async function renderAccounts() {
  const isAgent = state.user.role === 'agent';
  const canManage = hasPerm('accounts.manage');
  const canAdjust = hasPerm('ledger.adjust');
  const canViewStatement = hasPerm('accounts.view');
  setTitle('Payment Accounts');
  const data = await api('/api/payment-accounts');
  window.lastAccounts = data.items || [];
  const actionHeader = (canManage || canViewStatement) ? ['Action'] : [];
  const headers = ['Account Number','Method','Account User','Type','Agent Access','Transfer Charge','Balance','Receive Left','Send Available','Usage Today','Status', ...actionHeader];
  const rows = (data.items || []).map(account => {
    const assigned = Array.isArray(account.allowedAgents) ? account.allowedAgents : [];
    const accessHtml = isAgent && !canManage
      ? '<b>You</b><br><span class="sub">Assigned access</span>'
      : assigned.length
        ? assigned.map(agent => `<span class="account-agent-pill">${escapeHtml(agent.name || `Agent ${agent.id}`)}</span>`).join('')
        : '<span class="sub">Admin / Manager only</span>';
    const actionButtons = [];
    if (canAdjust) actionButtons.push(`<button data-adjust-account="${Number(account.id || 0)}">Offline Txn</button>`);
    if (canViewStatement) actionButtons.push(`<button class="secondary" data-statement-account="${Number(account.id || 0)}">Statement</button>`);
    if (canManage) actionButtons.push(`<button class="secondary" data-edit-account="${Number(account.id || 0)}">Edit / Access</button>`);
    const owner = account.ownerUser || null;
    const ownerHtml = owner
      ? `<b>${escapeHtml(owner.name || owner.username || `User ${owner.id}`)}</b><br><span class="sub">${escapeHtml(owner.username || '')}${owner.username ? ' · ' : ''}${escapeHtml(owner.role || '')}</span>`
      : '<span class="badge warn">Unassigned</span>';
    return [
      `<b>${escapeHtml(account.accountNumber)}</b><br><span class="sub">${escapeHtml(account.accountName || '')}</span>`,
      escapeHtml(account.method?.name || ''),
      ownerHtml,
      badge(accountTypeLabel(account.accountType), account.accountType === 'agent' ? 'blue' : account.accountType === 'merchant' ? 'warn' : ''),
      accessHtml,
      paymentAccountChargeLabel(account),
      money(account.currentBalance),
      money(account.receiveAvailable),
      money(account.sendAvailable),
      `In ${money(account.usage?.todayReceived || 0)} / Out ${money(account.usage?.todaySent || 0)}`,
      badge(account.status, account.status === 'active' ? 'ok' : account.status === 'inactive' ? 'danger' : 'warn'),
      ...(actionHeader.length ? [`<div class="actions">${actionButtons.join('') || '-'}</div>`] : [])
    ];
  });
  $('#content').innerHTML = `
    <div class="toolbar payment-account-toolbar">
      <div class="actions">${canManage ? '<button type="button" id="newAccountBtn">Add Account</button><button type="button" class="secondary" id="bulkAccountBtn">Bulk Add</button>' : ''}<button type="button" class="ghost" id="refreshAccounts">Refresh</button></div>
      <div class="sub">${isAgent && !canManage ? 'Your assigned accounts only.' : ''}</div>
    </div>
    <div class="card">${table(headers, rows)}</div>`;
  $('#refreshAccounts').onclick = () => renderAccounts();
  if (canManage) {
    $('#newAccountBtn').onclick = () => openAccountModal();
    $('#bulkAccountBtn').onclick = () => openBulkAccountModal();
  }
  $$('[data-adjust-account]').forEach(button => button.onclick = () => openAdjustAccountModal(Number(button.dataset.adjustAccount)));
  $$('[data-statement-account]').forEach(button => button.onclick = () => setRoute('ledger', { accountId: Number(button.dataset.statementAccount) }));
  $$('[data-edit-account]').forEach(button => button.onclick = () => openEditAccountModal(Number(button.dataset.editAccount)));
}
