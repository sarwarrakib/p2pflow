// P2PFlow v1.5.18
// Offline business receipt sessions with payment-number reservation and partial finalization.

function offlineTransactionStatusBadge(status='') {
  const value = String(status || '').toLowerCase();
  const label = {
    pending: 'Pending',
    partially_received: 'Partially Received',
    ready: 'Ready',
    finalized: 'Finalized',
    finalized_partial: 'Finalized Partial',
    cancelled: 'Cancelled'
  }[value] || status || '-';
  const tone = value === 'ready' || value === 'finalized' ? 'ok' : value === 'cancelled' ? 'danger' : value === 'finalized_partial' || value === 'partially_received' ? 'warn' : 'blue';
  return badge(label, tone);
}

function offlineAllocationRows(transaction={}) {
  const active = ['pending','partially_received','ready'].includes(String(transaction.status || '').toLowerCase());
  return (transaction.allocations || []).map(allocation => {
    const account = allocation.account || {};
    const identity = [account.label ? `Label: ${account.label}` : '', account.serialNumber ? `Serial: ${account.serialNumber}` : ''].filter(Boolean).join(' · ');
    const canReceive = active && Number(allocation.remainingAmount || 0) > 0 && !account.restricted;
    return `<div class="offline-allocation-row" data-offline-allocation="${Number(allocation.id || 0)}">
      <div class="offline-allocation-account">
        <b>${escapeHtml(account.accountNumber || `Account ${allocation.paymentAccountId || ''}`)}</b>
        <small>${escapeHtml(identity || account.accountName || '')}</small>
        <span>${escapeHtml(account.method?.name || transaction.paymentMethod?.name || '')}</span>
      </div>
      <div><small>Planned</small><b>${money(allocation.plannedAmount)}</b></div>
      <div><small>Received</small><b>${money(allocation.receivedAmount)}</b></div>
      <div><small>Remaining</small><b>${money(allocation.remainingAmount)}</b></div>
      <div class="offline-receive-action">
        ${canReceive ? `<input type="number" min="0.01" step="0.01" max="${escapeAttr(allocation.remainingAmount)}" value="${escapeAttr(allocation.remainingAmount)}" data-offline-received-amount aria-label="Received amount"/><button type="button" data-mark-offline-received="${Number(transaction.id || 0)}" data-allocation-id="${Number(allocation.id || 0)}">Received</button>` : offlineTransactionStatusBadge(allocation.status)}
      </div>
    </div>`;
  }).join('');
}

function offlineTransactionCard(transaction={}) {
  const active = ['pending','partially_received','ready'].includes(String(transaction.status || '').toLowerCase());
  const fullReady = Number(transaction.totalReceived || 0) >= Number(transaction.requestedAmount || 0) && Number(transaction.requestedAmount || 0) > 0;
  return `<section class="card offline-transaction-card" data-offline-transaction-id="${Number(transaction.id || 0)}">
    <div class="section-head offline-transaction-head">
      <div>
        <div class="actions compact"><h3>${escapeHtml(transaction.referenceNo || `Offline ${transaction.id}`)}</h3>${offlineTransactionStatusBadge(transaction.status)}</div>
        <p>${escapeHtml(transaction.counterpartyName || 'Offline customer')} · ${escapeHtml(transaction.paymentMethod?.name || '')} · ${escapeHtml(fmt(transaction.createdAt))}</p>
      </div>
      <div class="offline-transaction-summary">
        <span><small>Requested</small><b>${money(transaction.requestedAmount)}</b></span>
        <span><small>Planned</small><b>${money(transaction.totalPlanned)}</b></span>
        <span><small>Received</small><b>${money(transaction.totalReceived)}</b></span>
      </div>
    </div>
    ${transaction.note ? `<div class="notice small">${escapeHtml(transaction.note)}</div>` : ''}
    <div class="offline-allocation-list">${offlineAllocationRows(transaction) || '<div class="empty-state">No reserved payment number.</div>'}</div>
    <div class="offline-transaction-actions actions end">
      ${active && transaction.canCancel ? `<button type="button" class="danger ghost" data-cancel-offline-transaction="${Number(transaction.id || 0)}">Cancel</button>` : ''}
      ${active && Number(transaction.totalReceived || 0) > 0 ? `<button type="button" class="${fullReady ? '' : 'secondary'}" data-finalize-offline-transaction="${Number(transaction.id || 0)}" data-allow-partial="${fullReady ? 'false' : 'true'}">${fullReady ? 'Create Offline Order' : `Create Partial Order (${money(transaction.totalReceived)})`}</button>` : ''}
      ${transaction.finalizedOrderId ? `<button type="button" class="secondary" data-open-offline-order="${Number(transaction.finalizedOrderId)}">Open Order</button>` : ''}
    </div>
  </section>`;
}

async function renderOfflineTransactions() {
  setTitle('Offline Business');
  const data = await api('/api/offline-transactions');
  const items = data.items || [];
  $('#content').innerHTML = `<div class="offline-transactions-page">
    <div class="toolbar">
      <div class="actions"><button type="button" id="newOfflineTransactionBtn">Create Receipt Session</button><button type="button" class="ghost" id="refreshOfflineTransactions">Refresh</button></div>
      <div class="sub">Pending numbers stay reserved and cannot be used by another offline receipt session.</div>
    </div>
    <div class="offline-transaction-list">${items.length ? items.map(offlineTransactionCard).join('') : '<div class="card empty-state">No offline receipt session yet.</div>'}</div>
  </div>`;

  $('#newOfflineTransactionBtn')?.addEventListener('click', openOfflineTransactionModal);
  $('#refreshOfflineTransactions')?.addEventListener('click', renderOfflineTransactions);
  $$('[data-mark-offline-received]').forEach(button => button.addEventListener('click', async () => {
    const transactionId = Number(button.dataset.markOfflineReceived || 0);
    const allocationId = Number(button.dataset.allocationId || 0);
    const row = button.closest('[data-offline-allocation]');
    const amount = Number(row?.querySelector('[data-offline-received-amount]')?.value || 0);
    if (!(amount > 0)) return notify('Enter the amount actually received.', 'warn');
    button.disabled = true;
    try {
      await api(`/api/offline-transactions/${transactionId}/receive`, { method:'POST', body:JSON.stringify({ allocationId, amount }) });
      notify('Received amount added to the payment account balance.', 'ok');
      await renderOfflineTransactions();
    } catch (err) {
      button.disabled = false;
      notify(err.message || 'Could not mark received.', 'danger');
    }
  }));
  $$('[data-finalize-offline-transaction]').forEach(button => button.addEventListener('click', async () => {
    const transactionId = Number(button.dataset.finalizeOfflineTransaction || 0);
    const allowPartial = button.dataset.allowPartial === 'true';
    const message = allowPartial
      ? 'The full requested amount has not arrived. Create an offline order only for the received amount and release unused reserved numbers?'
      : 'Create the completed offline order now?';
    if (!confirm(message)) return;
    button.disabled = true;
    try {
      const result = await api(`/api/offline-transactions/${transactionId}/finalize`, { method:'POST', body:JSON.stringify({ allowPartial }) });
      notify(`Offline order ${result.order?.orderNo || ''} created.`, 'ok');
      await renderOfflineTransactions();
    } catch (err) {
      button.disabled = false;
      notify(err.message || 'Could not create offline order.', 'danger');
    }
  }));
  $$('[data-cancel-offline-transaction]').forEach(button => button.addEventListener('click', async () => {
    const transactionId = Number(button.dataset.cancelOfflineTransaction || 0);
    if (!confirm('Cancel this receipt session and release all reserved numbers?')) return;
    await api(`/api/offline-transactions/${transactionId}/cancel`, { method:'POST', body:'{}' });
    notify('Offline receipt session cancelled.', 'ok');
    renderOfflineTransactions();
  }));
  $$('[data-open-offline-order]').forEach(button => button.addEventListener('click', () => setRoute('orders', { orderId:Number(button.dataset.openOfflineOrder || 0) })));
}

function offlineCandidateRows(data={}) {
  return (data.items || []).map((account, index) => {
    const suggested = Number(account.suggestedAmount || 0);
    const checked = suggested > 0;
    const identity = [account.label ? `Label: ${account.label}` : '', account.serialNumber ? `Serial: ${account.serialNumber}` : ''].filter(Boolean).join(' · ');
    return `<label class="offline-candidate-row">
      <input type="checkbox" name="offlinePaymentAccountIds" value="${Number(account.id || 0)}" ${checked ? 'checked' : ''}/>
      <span class="offline-candidate-index">${index + 1}</span>
      <span><b>${escapeHtml(account.accountNumber || '-')}</b><small>${escapeHtml(identity || account.accountName || '')}</small></span>
      <span><small>Receive Available</small><b>${money(account.receiveAvailable)}</b></span>
      <span><small>Suggested</small><b>${money(suggested)}</b></span>
    </label>`;
  }).join('');
}

function openOfflineTransactionModal() {
  modal('Create Offline Receipt Session', `
    <form id="offlineTransactionForm" class="form-grid offline-transaction-form">
      <div><label>Requested Amount</label><input name="requestedAmount" type="number" min="0.01" step="0.01" value="1000000" required /></div>
      <div><label>Per Number Limit</label><input name="perAccountLimit" type="number" min="0.01" step="0.01" value="50000" required /></div>
      <div><label>Payment Method</label>${methodSelect()}</div>
      <div><label>Reference</label><input name="referenceNo" placeholder="Optional auto reference" /></div>
      <div><label>Customer / Counterparty</label><input name="counterpartyName" /></div>
      <div><label>Search Number, Label or Serial</label><input id="offlineCandidateSearch" placeholder="Optional" /></div>
      <div class="full-row"><label>Note</label><input name="note" /></div>
      <div class="full-row actions"><button type="button" class="secondary" id="findOfflineCandidates">Find Eligible Numbers</button><span id="offlineCandidateSummary" class="sub"></span></div>
      <div class="full-row" id="offlineCandidateList"><div class="empty-state">Enter the amount and click Find Eligible Numbers.</div></div>
      <div class="full-row" id="offlineTransactionMessage"></div>
      <div class="full-row"><button type="submit" id="createOfflineTransactionBtn" disabled>Reserve Numbers & Create Session</button></div>
    </form>`);
  const form = $('#offlineTransactionForm');
  let candidateData = { items:[] };
  const loadCandidates = async () => {
    const values = formObj(form);
    const query = new URLSearchParams({
      amount: values.requestedAmount || '0',
      perAccountLimit: values.perAccountLimit || '0',
      paymentMethodId: values.paymentMethodId || '0',
      search: $('#offlineCandidateSearch')?.value || ''
    });
    const button = $('#findOfflineCandidates');
    button.disabled = true;
    try {
      candidateData = await api(`/api/offline-transactions/candidates?${query.toString()}`);
      $('#offlineCandidateList').innerHTML = candidateData.items?.length ? `<div class="offline-candidate-list">${offlineCandidateRows(candidateData)}</div>` : '<div class="empty-state">No eligible unreserved payment number found in your permission scope.</div>';
      $('#offlineCandidateSummary').textContent = `${candidateData.items?.length || 0} eligible · Suggested ${money(candidateData.suggestedTotal || 0)}${Number(candidateData.uncoveredAmount || 0) > 0 ? ` · Uncovered ${money(candidateData.uncoveredAmount)}` : ''}`;
      $('#createOfflineTransactionBtn').disabled = !(candidateData.items || []).some(item => Number(item.suggestedAmount || 0) > 0);
    } catch (err) {
      setFormMessage('#offlineTransactionMessage', err.message || 'Could not find eligible numbers.', 'danger');
    } finally { button.disabled = false; }
  };
  $('#findOfflineCandidates').onclick = loadCandidates;
  form.onsubmit = async event => {
    event.preventDefault();
    const payload = formObj(form);
    payload.paymentAccountIds = [...form.querySelectorAll('input[name="offlinePaymentAccountIds"]:checked')].map(input => Number(input.value)).filter(Boolean);
    if (!payload.paymentAccountIds.length) return setFormMessage('#offlineTransactionMessage', 'Select at least one eligible payment number.', 'danger');
    const button = $('#createOfflineTransactionBtn');
    button.disabled = true;
    try {
      await api('/api/offline-transactions', { method:'POST', body:JSON.stringify(payload) });
      notify('Offline receipt session created and payment numbers reserved.', 'ok');
      closeModal();
      await renderOfflineTransactions();
    } catch (err) {
      button.disabled = false;
      setFormMessage('#offlineTransactionMessage', err.message || 'Could not create offline receipt session.', 'danger');
    }
  };
}
