// P2PFlow v1.0.51
// Page module: ledger. Edit this file for the ledger page UI.

async function renderLedger() {
  const q = state.ledgerAccountId ? ('?accountId=' + state.ledgerAccountId) : '';
  setTitle('Account Statement', 'Every balance movement shows source, before/after balance, order reference and note.');
  const data = await api('/api/ledgers' + q);
  const accounts = await api('/api/payment-accounts').catch(() => ({items:[]}));
  const selected = accounts.items.find(a => Number(a.id) === Number(state.ledgerAccountId));
  const totalIn = data.items.filter(l => ['receive','topup'].includes(l.direction) || ['opening','topup','offline_receive','settlement_in','refund_in'].includes(l.type)).reduce((a,l)=>a+Math.abs(Number(l.amount||0)),0);
  const totalOut = data.items.filter(l => ['send','cashout'].includes(l.direction) || ['cashout','offline_purchase','expense','settlement_out','refund_out'].includes(l.type)).reduce((a,l)=>a+Math.abs(Number(l.amount||0)),0);
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
      <div class="card info-card"><h3>How statements work</h3><p>Account balance is not edited directly. Every transaction creates a statement entry. Formula: <b>Opening + Receive/Topup - Send/Cashout/Expense ± Correction = Current Balance</b>.</p></div>
      <div class="card info-card"><h3>Live statement rule</h3><p>Binance BUY paid mark reduces selected account balance through split actual entries. Binance SELL release increases selected account balance through received entries. Offline business entries are recorded separately.</p></div>
    </div>
    <div class="card mt">${table(['Time','Account','User','Source Type','Direction','Amount','Before → After','Order/Ref','Note'], data.items.map(l => [fmt(l.createdAt), escapeHtml(l.account?.accountNumber || ('#'+l.paymentAccountId)), escapeHtml(l.agent?.name || ''), badge(l.type || '', ledgerBadgeClass(l)), escapeHtml(l.direction || ''), money(l.amount), `${money(l.balanceBefore)} → ${money(l.balanceAfter)}`, l.order ? `<button data-open-order="${l.order.id}" class="secondary">${escapeHtml(l.order.orderNo)}</button>` : escapeHtml(l.reference || '-'), escapeHtml(l.note || '')]))}</div>`;
  $('#allLedgerBtn').onclick = () => setRoute('ledger');
  if ($('#backAccountsBtn')) $('#backAccountsBtn').onclick = () => setRoute('accounts');
  $$('[data-open-order]').forEach(b => b.onclick = () => setRoute('orders', { orderId: Number(b.dataset.openOrder) }));
}

