// P2PFlow v1.7.2
// Fast filtered payment accounts with transaction-specific charges/commissions and compact actions.

function paymentAccountRuleSummary(rule={}, fallback='None') {
  const mode = String(rule?.mode || 'none');
  const fixed = Number(rule?.fixed || 0);
  const percent = Number(rule?.percent || 0);
  if (mode === 'fixed') return `${money(fixed)} fixed`;
  if (mode === 'percentage') return `${percent}%`;
  if (mode === 'fixed_percentage') return `${money(fixed)} + ${percent}%`;
  if (mode === 'tiered') return `${Array.isArray(rule?.tiers) ? rule.tiers.length : 0} tier(s)`;
  if (mode === 'manual') return 'Manual actual';
  return fallback;
}

function paymentAccountChargeLabel(account={}) {
  const isAgentAccount = String(account.accountType || '').toLowerCase() === 'agent';
  if (isAgentAccount) {
    const receive = paymentAccountRuleClient(account, 'receive_money');
    const cashIn = paymentAccountRuleClient(account, 'cash_in');
    return `<b>Received:</b> ${escapeHtml(paymentAccountRuleSummary(receive, 'No commission'))}<br><b>Cash In:</b> ${escapeHtml(paymentAccountRuleSummary(cashIn, 'No commission'))}`;
  }
  const send = paymentAccountRuleClient(account, 'send_money');
  const cashOut = paymentAccountRuleClient(account, 'cash_out');
  return `<b>Send:</b> ${escapeHtml(paymentAccountRuleSummary(send, 'No charge'))}<br><b>Cash Out:</b> ${escapeHtml(paymentAccountRuleSummary(cashOut, 'No charge'))}`;
}

function paymentAccountIdentityHtml(account={}) {
  const meta = [];
  if (account.label) meta.push(`Label: ${escapeHtml(account.label)}`);
  if (account.serialNumber) meta.push(`Serial: ${escapeHtml(account.serialNumber)}`);
  if (account.accountName) meta.push(escapeHtml(account.accountName));
  return `<b>${escapeHtml(account.accountNumber || '-')}</b>${meta.length ? `<br><span class="sub">${meta.join(' · ')}</span>` : ''}`;
}

function paymentAccountIcon(name='edit') {
  const common = 'viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const paths = {
    add:'<path d="M12 5v14M5 12h14"/>',
    bulk:'<path d="M8 6h11M8 12h11M8 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    refresh:'<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 7l-2 4M5.5 15A7 7 0 0 0 18 17l2-4"/>',
    select:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 2.5 2.5L16 9"/>',
    edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    delete:'<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
    statement:'<path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6M9 18h4"/>',
    transaction:'<path d="M7 7h11l-3-3M17 17H6l3 3"/><path d="M18 7l-3 3M6 17l3-3"/>',
    clear:'<path d="M6 6l12 12M18 6 6 18"/>'
  };
  return `<svg ${common}>${paths[name] || paths.edit}</svg>`;
}

function paymentAccountIconButton({icon='edit', title='', attrs='', className='ghost'}={}) {
  return `<button type="button" class="icon-action-btn ${className}" ${attrs} title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">${paymentAccountIcon(icon)}</button>`;
}

function paymentAccountSelectedIdSet() {
  if (!(state.selectedPaymentAccountIds instanceof Set)) state.selectedPaymentAccountIds = new Set();
  return state.selectedPaymentAccountIds;
}

function paymentAccountVisibleCheckboxes() {
  return [...document.querySelectorAll('[data-select-payment-account]')].filter(box => !box.disabled && box.closest('tr')?.hidden !== true);
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
  const selectableBoxes = paymentAccountVisibleCheckboxes();
  const allSelected = selectableBoxes.length > 0 && selectableBoxes.every(box => selected.has(Number(box.value)));
  const selectAllButton = $('#selectAllAccountsBtn');
  if (selectAllButton) {
    selectAllButton.title = allSelected ? 'Clear visible selection' : 'Select all visible accounts';
    selectAllButton.setAttribute('aria-label', selectAllButton.title);
    selectAllButton.classList.toggle('is-active', allSelected);
  }
  allBoxes.forEach(box => { box.checked = selected.has(Number(box.value)); });
}

function normalizePaymentAccountFilterValue(value='') {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function applyPaymentAccountFilters() {
  const search = normalizePaymentAccountFilterValue($('#paymentAccountSearchInput')?.value || '');
  const accountType = normalizePaymentAccountFilterValue($('#paymentAccountTypeFilter')?.value || '');
  const label = String($('#paymentAccountLabelFilter')?.value || '');
  const methodId = String($('#paymentAccountMethodFilter')?.value || '');
  state.paymentAccountFilters = { search, accountType, label, methodId };
  let visibleCount = 0;
  document.querySelectorAll('[data-payment-account-row]').forEach(marker => {
    const matchesSearch = !search || normalizePaymentAccountFilterValue(marker.dataset.search || '').includes(search);
    const matchesType = !accountType || normalizePaymentAccountFilterValue(marker.dataset.accountType || '') === accountType;
    const matchesLabel = !label || String(marker.dataset.labelKey || '') === label;
    const matchesMethod = !methodId || String(marker.dataset.methodId || '') === methodId;
    const visible = matchesSearch && matchesType && matchesLabel && matchesMethod;
    const row = marker.closest('tr');
    if (row) row.hidden = !visible;
    if (visible) visibleCount += 1;
  });
  const countNode = $('#paymentAccountVisibleCount');
  if (countNode) countNode.textContent = String(visibleCount);
  const empty = $('#paymentAccountFilteredEmpty');
  if (empty) empty.hidden = visibleCount !== 0;
  syncPaymentAccountBulkActions();
}

function paymentAccountFilterOptionHtml(items=[], selected='', placeholder='All') {
  return `<option value="">${escapeHtml(placeholder)}</option>${items.map(item => {
    const value = String(item.value ?? item.id ?? '');
    const label = String(item.label ?? item.name ?? value);
    return `<option value="${escapeAttr(value)}" ${String(selected) === value ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('')}`;
}

async function renderAccounts() {
  if (state.page !== 'accounts') return;
  const canCreate = hasPerm('accounts.manage');
  const filters = state.paymentAccountFilters || { search:'', accountType:'', label:'', methodId:'' };
  setTitle('Payment Accounts');
  // Load the permitted scope once; filtering is then instant in the browser while the user types.
  const data = await api('/api/payment-accounts');
  window.lastAccounts = data.items || [];
  state.paymentAccountScope = data.scope || state.bootstrap?.paymentAccountScope || {};

  const manageable = (data.items || []).filter(account => account.viewerCanManage);
  const selected = paymentAccountSelectedIdSet();
  const manageableIds = new Set(manageable.map(account => Number(account.id)));
  [...selected].forEach(id => { if (!manageableIds.has(Number(id))) selected.delete(Number(id)); });

  const filterOptions = data.filterOptions || {};
  const paymentMethods = (filterOptions.paymentMethods || []).map(item => ({ value:String(item.id), label:item.name || item.code || `Method ${item.id}` }));
  const accountTypes = (filterOptions.accountTypes || ['personal','merchant','agent']).map(value => ({ value, label:accountTypeLabel(value) }));
  const labels = (filterOptions.labels || []).map(item => typeof item === 'string'
    ? { value:item || '__NO_LABEL__', label:item || 'No Label' }
    : { value:String(item.value ?? item.label ?? '__NO_LABEL__'), label:String(item.label || 'No Label') });

  const headers = ['Select','Account Number','Method','Account User','Type','Access','Charge / Commission','Balance','Receive Left','Send Available','Usage Today','Status','Action'];
  const rows = (data.items || []).map(account => {
    const assigned = Array.isArray(account.allowedAgents) ? account.allowedAgents : [];
    const accessHtml = account.viewerCanManageAccess
      ? (assigned.length ? assigned.map(agent => `<span class="account-agent-pill">${escapeHtml(agent.name || `Agent ${agent.id}`)}</span>`).join('') : '<span class="sub">No Agent access</span>')
      : (account.ownerUserId === state.user.id ? '<b>Owner</b><br><span class="sub">Your payment account</span>' : '<b>Assigned</b><br><span class="sub">Allowed for your user</span>');
    const actionButtons = [];
    if (account.viewerCanAdjust) actionButtons.push(paymentAccountIconButton({ icon:'transaction', title:'Manual Transaction', attrs:`data-adjust-account="${Number(account.id || 0)}"` }));
    actionButtons.push(paymentAccountIconButton({ icon:'statement', title:'Statement', attrs:`data-statement-account="${Number(account.id || 0)}"` }));
    if (account.viewerCanManage) actionButtons.push(paymentAccountIconButton({ icon:'edit', title:'Edit Account', attrs:`data-edit-account="${Number(account.id || 0)}"` }));
    if (account.viewerCanDelete) actionButtons.push(paymentAccountIconButton({ icon:'delete', title:'Delete Account', attrs:`data-delete-account="${Number(account.id || 0)}"`, className:'danger' }));
    const owner = account.ownerUser || null;
    const ownerHtml = owner ? `<b>${escapeHtml(owner.name || owner.username || `User ${owner.id}`)}</b><br><span class="sub">${escapeHtml(owner.username || '')}${owner.username ? ' · ' : ''}${escapeHtml(owner.role || '')}</span>` : '<span class="badge warn">Unassigned</span>';
    const searchText = [account.accountNumber, account.accountName, account.label, account.serialNumber, account.method?.name, account.method?.code, owner?.name, owner?.username, account.accountType].filter(Boolean).join(' ');
    const labelKey = account.label ? String(account.label) : '__NO_LABEL__';
    const marker = `<span data-payment-account-row data-search="${escapeAttr(searchText)}" data-account-type="${escapeAttr(account.accountType || '')}" data-label-key="${escapeAttr(labelKey)}" data-method-id="${Number(account.paymentMethodId || 0)}"></span>`;
    return [
      account.viewerCanManage ? `${marker}<label class="payment-account-select"><input type="checkbox" data-select-payment-account value="${Number(account.id)}" ${selected.has(Number(account.id)) ? 'checked' : ''} aria-label="Select ${escapeAttr(account.accountNumber || 'payment account')}" /></label>` : `${marker}<span class="sub">—</span>`,
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
      `<div class="actions compact-icon-actions">${actionButtons.join('')}</div>`
    ];
  });

  const scopeText = state.paymentAccountScope?.manageAll ? 'All payment accounts' : (isAgent ? 'Your own and assigned payment accounts' : 'Payment accounts inside your access scope');
  $('#content').innerHTML = `
    <div class="toolbar payment-account-toolbar payment-account-toolbar-v2">
      <div class="actions compact-icon-actions">
        ${canCreate ? paymentAccountIconButton({ icon:'add', title:'Add Account', attrs:'id="newAccountBtn"' }) + paymentAccountIconButton({ icon:'bulk', title:'Bulk Add Accounts', attrs:'id="bulkAccountBtn"' }) : ''}
        ${paymentAccountIconButton({ icon:'refresh', title:'Refresh Accounts', attrs:'id="refreshAccounts"' })}
      </div>
      <div class="payment-account-filterbar">
        <div class="payment-account-search-wrap"><input id="paymentAccountSearchInput" value="${escapeAttr(filters.search || '')}" placeholder="Search number, label, serial or user" autocomplete="off" />${filters.search ? paymentAccountIconButton({ icon:'clear', title:'Clear Search', attrs:'id="clearPaymentAccountSearch"' }) : ''}</div>
        <select id="paymentAccountTypeFilter" aria-label="Filter account type">${paymentAccountFilterOptionHtml(accountTypes, filters.accountType, 'All Types')}</select>
        <select id="paymentAccountLabelFilter" aria-label="Filter label">${paymentAccountFilterOptionHtml(labels, filters.label, 'All Labels')}</select>
        <select id="paymentAccountMethodFilter" aria-label="Filter payment method">${paymentAccountFilterOptionHtml(paymentMethods, filters.methodId, 'All Methods')}</select>
      </div>
      <div class="sub">${escapeHtml(scopeText)} · <span id="paymentAccountVisibleCount">${Number(data.items?.length || 0)}</span> / ${Number(data.items?.length || 0)}</div>
    </div>
    ${manageable.length ? `<div class="card payment-account-bulk-bar">
      <div><b><span id="selectedPaymentAccountCount">${selected.size}</span> selected</b><span class="sub">Only permitted accounts can be edited or deleted.</span></div>
      <div class="actions compact-icon-actions">${paymentAccountIconButton({ icon:'select', title:'Select all visible accounts', attrs:'id="selectAllAccountsBtn"' })}${paymentAccountIconButton({ icon:'edit', title:'Edit Selected', attrs:`id="bulkEditAccountsBtn" ${selected.size ? '' : 'disabled'}` })}${paymentAccountIconButton({ icon:'delete', title:'Delete Selected', attrs:`id="bulkDeleteAccountsBtn" ${selected.size ? '' : 'disabled'}`, className:'danger' })}</div>
    </div>` : ''}
    <div class="card payment-account-table-card">${rows.length ? table(headers, rows) : '<div class="empty-state">No payment account found in your access scope.</div>'}<div class="empty-state" id="paymentAccountFilteredEmpty" hidden>No payment account matches these filters.</div></div>`;

  $('#refreshAccounts')?.addEventListener('click', () => renderAccounts());
  $('#paymentAccountSearchInput')?.addEventListener('input', applyPaymentAccountFilters);
  ['paymentAccountTypeFilter','paymentAccountLabelFilter','paymentAccountMethodFilter'].forEach(id => $('#' + id)?.addEventListener('change', applyPaymentAccountFilters));
  $('#clearPaymentAccountSearch')?.addEventListener('click', () => { const input = $('#paymentAccountSearchInput'); if (input) input.value = ''; applyPaymentAccountFilters(); input?.focus(); });
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
    const selectable = paymentAccountVisibleCheckboxes();
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
  applyPaymentAccountFilters();
}
