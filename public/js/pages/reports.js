// P2PFlow v1.4.10
// Page module: reports. Edit this file for the reports page UI.

async function renderReports() {
  setTitle('Digital Reports');
  const rf = state.reportFilter || { period: 'daily', start: '', end: '' };
  const qs = new URLSearchParams();
  qs.set('period', rf.period || 'daily');
  if (rf.start) qs.set('start', rf.start);
  if (rf.end) qs.set('end', rf.end);
  const data = await api('/api/reports?' + qs.toString());
  window.lastReport = data;
  const summary = data.summary || {};
  const range = data.range || {};
  const periodLabel = { daily:'Daily', monthly:'Monthly', yearly:'Yearly', lifetime:'Lifetime', custom:'Custom' }[range.period] || 'Daily';
  $('#content').innerHTML = `
    <div class="report-filter card">
      <div>
        <h3>Customizable Report</h3>
        <p>Period: <b>${escapeHtml(periodLabel)}</b> · ${escapeHtml(range.label || '')}</p>
      </div>
      <form id="reportFilterForm" class="report-filter-form">
        <select name="period">
          <option value="daily" ${rf.period==='daily'?'selected':''}>Daily</option>
          <option value="monthly" ${rf.period==='monthly'?'selected':''}>Monthly</option>
          <option value="yearly" ${rf.period==='yearly'?'selected':''}>Yearly</option>
          <option value="lifetime" ${rf.period==='lifetime'?'selected':''}>Lifetime</option>
          <option value="custom" ${rf.period==='custom'?'selected':''}>Custom</option>
        </select>
        <input name="start" type="date" value="${escapeAttr(rf.start || '')}" />
        <input name="end" type="date" value="${escapeAttr(rf.end || '')}" />
        <button type="submit">Generate</button>
        <button type="button" class="secondary" id="printReportBtn">Print / PDF</button>
        <button type="button" class="ghost" id="exportReportBtn">Export CSV</button>
      </form>
    </div>
    <div class="grid cards mt">
      ${metric('Orders', summary.orders || 0, `${periodLabel} records`)}
      ${metric('BUY Sent', money(summary.buySent || 0), 'split actual')}
      ${metric('SELL Received', money(summary.sellReceived || 0), 'split actual')}
      ${metric('Current Balance', money(summary.currentBalance || 0), 'statement-calculated')}
    </div>
    <div class="grid cards mt">
      ${metric('Completed Orders', summary.completedOrders || 0, 'paid/released/completed')}
      ${metric('Offline Orders', summary.offlineOrders || 0, 'local business')}
      ${metric('Statement In', money(summary.ledgerIn || 0), 'receive/topup/offline in')}
      ${metric('Statement Out', money(summary.ledgerOut || 0), 'send/expense/offline out')}
    </div>
    <div class="report-section mt"><h3>User / Employee Report</h3><div class="report-cards">${data.byAgent.map(a => reportCard(a.name, [['Orders', a.orders], ['Completed Splits', a.completedSplits], ['Partial Splits', a.partialSplits || 0], ['BUY Sent', money(a.buySent)], ['SELL Received', money(a.sellReceived)], ['Statement Volume', money(a.ledgerVolume || 0)], ['Leave Count', a.leaveCount], ['Login Time', activityDuration(a.activity?.loginSeconds)], ['App Open', activityDuration(a.activity?.openSeconds)], ['Active', activityDuration(a.activity?.activeSeconds)], ['Engaged', activityDuration(a.activity?.engagedSeconds)], ['Idle', activityDuration(a.activity?.idleSeconds)], ['Background', activityDuration(a.activity?.hiddenSeconds)], ['Audited Actions', a.activity?.actions || 0], ['Engagement', `${a.activity?.engagementRate || 0}%`]])).join('')}</div></div>
    <div class="report-section mt"><h3>Payment Account Report</h3><div class="report-cards">${data.byMethod.map(m => reportCard(m.name, [['Accounts', m.accountCount || 0], ['BUY Sent', money(m.buySent)], ['SELL Received', money(m.sellReceived)], ['Offline In', money(m.offlineIn || 0)], ['Offline Out', money(m.offlineOut || 0)], ['Current Balance', money(m.balance)], ['BUY Capacity', money(m.buyCapacity)], ['Receive Capacity', money(m.sellReceiveCapacity)]])).join('') || '<div class="empty-state">No payment account is available.</div>'}</div></div>
    <div class="report-section mt"><h3>Order Summary</h3><div class="report-cards wide">${data.orders.map(o => reportCard(o.orderNo, [['Source', o.orderSource || 'binance'], ['Type', o.type], ['Amount', money(o.amount)], ['Status', o.status], ['Actual', money(o.summary.relevantActual)], ['Difference', money(o.summary.difference)], ['Lead User', o.leadAgent?.name || '-']], `<button data-open-order="${o.id}">Open</button>`)).join('') || '<div class="empty-state">No order in this range</div>'}</div></div>`;
  $('#reportFilterForm').onsubmit = e => {
    e.preventDefault();
    const obj = Object.fromEntries(new FormData(e.target));
    state.reportFilter = obj;
    renderReports();
  };
  $('#printReportBtn').onclick = () => window.print();
  $('#exportReportBtn').onclick = () => exportReportCsv(data);
  $$('[data-open-order]').forEach(b => b.onclick = () => setRoute('orders', { orderId: Number(b.dataset.openOrder) }));
}
