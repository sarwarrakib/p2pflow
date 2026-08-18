// P2PFlow v1.5.24
// Permission-scoped payment accounts with multi-select, bulk edit and safe delete.

function paymentAccountChargeLabel(account={}) {
  const mode = String(account.transactionChargeMode || 'none');
  const fixed = Number(account.transactionChargeFixed || 0);
  const percent = Number(account.transactionChargePercent || 0);
  const isAgentAccount = String(account.accountType || '').toLowerCase() === 'agent';
  let label = isAgentAccount ? 'No commission' : 'No charge';
  if (mode === 'fixed') label = `${money(fixed)} fixed`;
  else if (mode === 'percentage') label = `${percent}%`;
  else if (mode === 'fixed_percentage') label = `${money(fixed)} + ${percent}%`;
  else if (mode === 'tiered') label = `${(account.transactionChargeTiers || []).length} tier(s)`;
  else if (mode === 'manual') label = 'Manual actual';
  const scope = isAgentAccount ? 'Money in + money out' : 'Send Money + Cash Out';
  return `${escapeHtml(label)}<br><span class="sub">${escapeHtml(scope)}</span>`;
}

function paymentAccountIdentityHtml(account={}) {
  const meta = [];
  if (account.label) meta.push(`Label: ${escapeHtml(account.label)}`);
  if (account.serialNumber) meta.push(`Serial: ${escapeHtml(account.serialNumber)}`);
  if (account.accountName) meta.push(escapeHtml(account.accountName));
  return `<b>${escapeHtml(account.accountNumber || '-')}</b>${meta.length ? `<br><span class="sub">${meta.join(' · ')}</span>` : ''}`;
}

function paymentAccountSelectedIdSet() {
  if (!(state.selectedPaymentAccountIds instanceof Set)) state.selectedPaymentAccountIds = new Set();
  return state.selectedPaymentAccountIds;
}

function syncPaymentAccountBulkActions() {
  const selected = paymentAccountSelectedIdSet();
  const visibleManageableIds = new Set((window.lastAccounts || []).filter(item => item.viewerCanManage).map(item => Number(item.id)));
  [...selected].forEach(id => { if (!visibleManageableIds.has(Number(id))) selected.delete(Number(id)); });
  const count = selected.size;
  const countNode = $('#selectedPaymentAccountCount');
  if (countNode) countNode.textContent = String(count);
  const editButton = $('#bulkEditAccountsBtn');
  const deleteButton = $('#bulkDeleteAccountsBtn');
  if (editButton) editButton.disabled = count === 0;
  if (deleteButton) deleteButton.disabled = count === 0;
  const allBoxes = [...document.querySelectorAll('[data-select-payment-account]')];
  const selectableBoxes = allBoxes.filter(box => !box.disabled);
  const allSelected = selectableBoxes.length > 0 && selectableBoxes.every(box => selected.has(Number(box.value)));
  const selectAllButton = $('#selectAllAccountsBtn');
  if (selectAllButton) selectAllButton.textContent = allSelected ? 'Clear Selection' : 'Select All';
  allBoxes.forEach(box => { box.checked = selected.has(Number(box.value)); });
}

async function renderAccounts() {
  const isAgent = state.user.role === 'agent';
  const canCreate = hasPerm('accounts.manage');
  const search = String(state.paymentAccountSearch || '').trim();
  setTitle('Payment Accounts');
  const data = await api(`/api/payment-accounts${search ? `?search=${encodeURIComponent(search)}` : ''}`);
  window.lastAccounts = data.items || [];
  state.paymentAccountScope = data.scope || state.bootstrap?.paymentAccountScope || {};

  const manageable = (data.items || []).filter(account => account.viewerCanManage);
  const selected = paymentAccountSelectedIdSet();
  const visibleIds = new Set(manageable.map(account => Number(account.id)));
  [...selected].forEach(id => { if (!visibleIds.has(Number(id))) selected.delete(Number(id)); });

  const headers = ['Select','Account Number','Method','Account User','Type','Access','Charge / Commission','Balance','Receive Left','Send Available','Usage Today','Status','Action'];
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
    if (account.viewerCanAdjust) actionButtons.push(`<button type="button" data-adjust-account="${Number(account.id || 0)}">Manual Transaction</button>`);
    actionButtons.push(`<button type="button" class="secondary" data-statement-account="${Number(account.id || 0)}">Statement</button>`);
    if (account.viewerCanManage) actionButtons.push(`<button type="button" class="secondary" data-edit-account="${Number(account.id || 0)}">Edit</button>`);
    if (account.viewerCanDelete) actionButtons.push(`<button type="button" class="danger" data-delete-account="${Number(account.id || 0)}">Delete</button>`);
    const owner = account.ownerUser || null;
    const ownerHtml = owner
      ? `<b>${escapeHtml(owner.name || owner.username || `User ${owner.id}`)}</b><br><span class="sub">${escapeHtml(owner.username || '')}${owner.username ? ' · ' : ''}${escapeHtml(owner.role || '')}</span>`
      : '<span class="badge warn">Unassigned</span>';
    return [
      account.viewerCanManage
        ? `<label class="payment-account-select"><input type="checkbox" data-select-payment-account value="${Number(account.id)}" ${selected.has(Number(account.id)) ? 'checked' : ''} aria-label="Select ${escapeAttr(account.accountNumber || 'payment account')}" /></label>`
        : '<span class="sub">—</span>',
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
    ${manageable.length ? `<div class="card payment-account-bulk-bar">
      <div><b><span id="selectedPaymentAccountCount">${selected.size}</span> selected</b><span class="sub">Bulk changes apply only after every selected account passes validation.</span></div>
      <div class="actions"><button type="button" class="ghost" id="selectAllAccountsBtn">Select All</button><button type="button" class="secondary" id="bulkEditAccountsBtn" ${selected.size ? '' : 'disabled'}>Edit Selected</button><button type="button" class="danger" id="bulkDeleteAccountsBtn" ${selected.size ? '' : 'disabled'}>Delete Selected</button></div>
    </div>` : ''}
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
  $$('[data-select-payment-account]').forEach(box => box.addEventListener('change', () => {
    const id = Number(box.value);
    if (box.checked) selected.add(id); else selected.delete(id);
    syncPaymentAccountBulkActions();
  }));
  $('#selectAllAccountsBtn')?.addEventListener('click', () => {
    const selectable = [...document.querySelectorAll('[data-select-payment-account]')].filter(box => !box.disabled);
    const allSelected = selectable.length > 0 && selectable.every(box => selected.has(Number(box.value)));
    selectable.forEach(box => { const id = Number(box.value); if (allSelected) selected.delete(id); else selected.add(id); });
    syncPaymentAccountBulkActions();
  });
  $('#bulkEditAccountsBtn')?.addEventListener('click', () => openBulkEditAccountModal([...selected]));
  $('#bulkDeleteAccountsBtn')?.addEventListener('click', () => deletePaymentAccounts([...selected]));
  $$('[data-adjust-account]').forEach(button => button.addEventListener('click', () => openAdjustAccountModal(Number(button.dataset.adjustAccount))));
  $$('[data-statement-account]').forEach(button => button.addEventListener('click', () => setRoute('ledger', { accountId: Number(button.dataset.statementAccount) })));
  $$('[data-edit-account]').forEach(button => button.addEventListener('click', () => openEditAccountModal(Number(button.dataset.editAccount))));
  $$('[data-delete-account]').forEach(button => button.addEventListener('click', () => deletePaymentAccounts([Number(button.dataset.deleteAccount)])));
  syncPaymentAccountBulkActions();
}
