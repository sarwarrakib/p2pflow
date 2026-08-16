// P2PFlow v1.0.51
// Page module: approvals. Edit this file for the approvals page UI.

async function renderApprovals() {
  setTitle('Approvals');
  const data = await api('/api/approvals?status=pending');
  const rows = data.items.map(a => {
    const issues = (a.issues || []).map(i => badge(i.code, i.code === 'high_amount' ? 'warn' : i.code === 'proof_missing' ? 'danger' : 'blue')).join(' ');
    return [
      `<b>${escapeHtml(a.orderNo || a.order?.orderNo || '-')}</b><br/><span class="sub">${escapeHtml(a.action || '')}</span>`,
      a.order ? `${badge(a.order.type, a.order.type==='BUY'?'blue':'ok')} ${money(a.order.amount)}<br/><span class="sub">Actual ${money(a.summarySnapshot?.relevantActual || a.order.summary?.relevantActual || 0)}</span>` : '-',
      issues || '-',
      `<b>${escapeHtml(a.requestedByName || a.requestedByUser?.name || '-')}</b><br/><span class="sub">${fmt(a.requestedAt)}</span>`,
      `<button data-open-order="${Number(a.orderId || 0)}" class="secondary">Open Order</button> <button data-approve="${Number(a.id || 0)}" class="success">Approve</button> <button data-reject="${Number(a.id || 0)}" class="danger">Reject</button>`
    ];
  });
  $('#content').innerHTML = `
    <div class="toolbar"><div class="actions"><button class="ghost" id="refreshApprovals">Refresh</button></div><div class="compact-stat">Pending: <b>${data.items.length}</b></div></div>
    <div class="card mt">
      <div class="section-head"><h3>Approval Queue</h3><span>${data.items.length}</span></div>
      ${table(['Order','Amount','Issues','Requested By','Actions'], rows)}
    </div>
    <div class="notice mt">Approval permits the selected final action.</div>`;
  $('#refreshApprovals').onclick = () => renderApprovals();
  $$('[data-open-order]').forEach(b => b.onclick = () => setRoute('orders', { orderId: Number(b.dataset.openOrder) }));
  $$('[data-approve]').forEach(b => b.onclick = () => openApprovalDecisionModal(Number(b.dataset.approve), 'approved'));
  $$('[data-reject]').forEach(b => b.onclick = () => openApprovalDecisionModal(Number(b.dataset.reject), 'rejected'));
}

