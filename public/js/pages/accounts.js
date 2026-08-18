// P2PFlow v1.5.22
// Permission-scoped payment accounts with owner, label and serial search.

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

function paymentAccountIdentityHtml(account={}) {
  const meta = [];
  if (account.label) meta.push(`Label: ${escapeHtml(account.label)}`);
  if (account.serialNumber) meta.push(`Serial: ${escapeHtml(account.serialNumber)}`);
  if (account.accountName) meta.push(escapeHtml(account.accountName));
  return `<b>${escapeHtml(account.accountNumber || '-')}</b>${meta.length ? `<br><span class="sub">${meta.join(' · ')}</span>` : ''}`;
}

async function renderAccounts() {
  const isAgent = state.user.role === 'agent';
  const canCreate = hasPerm('accounts.manage');
  const search = String(state.paymentAccountSearch || '').trim();
  setTitle('Payment Accounts');
  const data = await api(`/api/payment-accounts${search ? `?search=${encodeURIComponent(search)}` : ''}`);
  window.lastAccounts = data.items || [];
  state.paymentAccountScope = data.scope || state.bootstrap?.paymentAccountScope || {};

  const headers = ['Account Number','Method','Account User','Type','Access','Transfer Charge','Balance','Receive Left','Send Available','Usage Today','Status','Action'];
  const rows = (data.items || []).map(account => {
    const assigned = Array.isArray(account.allowedAgents) ? account.allowedAgents : [];
    const accessHtml = account.viewerCanManageAccess
      ? (assigned.length
        ? assigned.map(agent => `<span class="account-agent-pill">${escapeHtml(agent.name || `Agent ${agent.id}`)}</span>`).join('')
        : '<span class="sub">No Agent access</span>')
      : (account.ownerUserId === state.user.id
        ? '<b>Owner</b><br><span class="sub">Your payment account</span>'
        : '<b>Assigned</b><br><span class="sub">Allowed for your user</span>');
    const actionButtons = [];
    if (account.viewerCanAdjust) actionButtons.push(`<button type="button" data-adjust-account="${Number(account.id || 0)}">Statement Entry</button>`);
    actionButtons.push(`<button type="button" class="secondary" data-statement-account="${Number(account.id || 0)}">Statement</button>`);
    if (account.viewerCanManage) actionButtons.push(`<button type="button" class="secondary" data-edit-account="${Number(account.id || 0)}">Edit</button>`);
    const owner = account.ownerUser || null;
    const ownerHtml = owner
      ? `<b>${escapeHtml(owner.name || owner.username || `User ${owner.id}`)}</b><br><span class="sub">${escapeHtml(owner.username || '')}${owner.username ? ' · ' : ''}${escapeHtml(owner.role || '')}</span>`
      : '<span class="badge warn">Unassigned</span>';
    return [
      paymentAccountIdentityHtml(account),
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
      `<div class="actions">${actionButtons.join('')}</div>`
    ];
  });

  const scopeText = state.paymentAccountScope?.manageAll
    ? 'All payment accounts'
    : (isAgent ? 'Your own and assigned payment accounts' : 'Payment accounts inside your access scope');
  $('#content').innerHTML = `
    <div class="toolbar payment-account-toolbar">
      <div class="actions">${canCreate ? '<button type="button" id="newAccountBtn">Add Account</button><button type="button" class="secondary" id="bulkAccountBtn">Bulk Add</button>' : ''}<button type="button" class="ghost" id="refreshAccounts">Refresh</button></div>
      <form id="paymentAccountSearchForm" class="inline-search" role="search">
        <input id="paymentAccountSearchInput" value="${escapeAttr(search)}" placeholder="Search number, label or serial" autocomplete="off" />
        <button type="submit" class="secondary">Search</button>
        ${search ? '<button type="button" class="ghost" id="clearPaymentAccountSearch">Clear</button>' : ''}
      </form>
      <div class="sub">${escapeHtml(scopeText)} · ${Number(data.items?.length || 0)} result(s)</div>
    </div>
    <div class="card">${rows.length ? table(headers, rows) : '<div class="empty-state">No payment account found in your access scope.</div>'}</div>`;

  $('#refreshAccounts')?.addEventListener('click', () => renderAccounts());
  $('#paymentAccountSearchForm')?.addEventListener('submit', event => {
    event.preventDefault();
    state.paymentAccountSearch = $('#paymentAccountSearchInput')?.value || '';
    renderAccounts();
  });
  $('#clearPaymentAccountSearch')?.addEventListener('click', () => { state.paymentAccountSearch = ''; renderAccounts(); });
  if (canCreate) {
    $('#newAccountBtn')?.addEventListener('click', () => openAccountModal());
    $('#bulkAccountBtn')?.addEventListener('click', () => openBulkAccountModal());
  }
  $$('[data-adjust-account]').forEach(button => button.addEventListener('click', () => openAdjustAccountModal(Number(button.dataset.adjustAccount))));
  $$('[data-statement-account]').forEach(button => button.addEventListener('click', () => setRoute('ledger', { accountId: Number(button.dataset.statementAccount) })));
  $$('[data-edit-account]').forEach(button => button.addEventListener('click', () => openEditAccountModal(Number(button.dataset.editAccount))));
}
