// P2PFlow v1.5.28
// Page module: ledger. Edit this file for the ledger page UI.

async function renderLedger() {
  if (state.page !== 'ledger') return;
  const q = state.ledgerAccountId ? ('?accountId=' + state.ledgerAccountId) : '';
  setTitle('Account Statement');
  const [data, accounts] = await Promise.all([
    api('/api/ledgers' + q),
    api('/api/payment-accounts').catch(() => ({items:[]}))
  ]);
  const selected = accounts.items.find(a => Number(a.id) === Number(state.ledgerAccountId));
  const totalIn = data.items.filter(l => ['receive','topup'].includes(l.direction) || ['opening','topup','offline_receive','settlement_in','refund_in','agent_transaction_commission'].includes(l.type)).reduce((a,l)=>a+Math.abs(Number(l.amount||0)),0);
  const totalOut = data.items.filter(l => ['send','cashout'].includes(l.direction) || ['cashout','offline_purchase','expense','settlement_out','refund_out','business_transfer_charge','agent_transaction_commission_reversal'].includes(l.type)).reduce((a,l)=>a+Math.abs(Number(l.amount||0)),0);
  $('#content').innerHTML = `
    <div class="toolbar">
      <div class="actions"><button class="ghost" id="allLedgerBtn">All Statements</button>${selected ? `<button class="ghost" id="backAccountsBtn">Back to Accounts</button>` : ''}</div>
      <div class="sub">${selected ? `Showing statement for ${escapeHtml(selected.accountNumber)} (${escapeHtml(selected.method?.name || '')})` : 'Showing latest 500 statement entries'}</div>
    </div>
    <div class="grid cards">
      ${metric('Statement Account', selected ? escapeHtml(selected.accountNumber) : 'All', 'Filter')}
      ${metric('Current Balance', selected ? money(selected.currentBalance) : '-', 'Statement calculated')}
      ${metric('Total In', money(totalIn), 'receive/opening/topup')}
      ${metric('Total Out', money(totalOut), 'send/cashout/expense')}
    </div>
    <div class="grid two mt">
      <div class="card info-card"><h3>How statements work</h3><p>Every transaction creates a statement entry. Manual fees are deducted separately and Agent commissions are credited separately, so the before/after balance remains fully auditable.</p></div>
      <div class="card info-card"><h3>Live statement rule</h3><p>BUY deducts; SELL adds received balance.</p></div>
    </div>
    <div class="card mt">${table(['Time','Account','User','Source Type','Direction','Amount','Before → After','Order/Ref','Note'], data.items.map(l => [fmt(l.createdAt), escapeHtml(l.account?.accountNumber || ('#'+l.paymentAccountId)), escapeHtml(l.agent?.name || ''), badge(l.type || '', ledgerBadgeClass(l)), escapeHtml(l.direction || ''), money(l.amount), `${money(l.balanceBefore)} → ${money(l.balanceAfter)}`, l.order ? `<button data-open-order="${Number(l.order.id || 0)}" class="secondary">${escapeHtml(l.order.orderNo)}</button>` : escapeHtml(l.reference || '-'), escapeHtml(l.note || '')]))}</div>`;
  $('#allLedgerBtn').onclick = () => setRoute('ledger');
  if ($('#backAccountsBtn')) $('#backAccountsBtn').onclick = () => setRoute('accounts');
  $$('[data-open-order]').forEach(b => b.onclick = () => setRoute('orders', { orderId: Number(b.dataset.openOrder) }));
}

