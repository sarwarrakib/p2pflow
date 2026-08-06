// P2PFlow v1.0.51
// Page module: routing. Edit this file for the routing page UI.

async function renderRouting() {
  setTitle('Payment Method Routing', 'Decide which user receives orders for each payment method using priority, amount range and capacity guard.');
  const data = await api('/api/routing');
  $('#content').innerHTML = `<div class="toolbar"><div class="actions"><button id="addRouteBtn">Add Route</button></div><div class="sub">Priority 1 is tried first, then Priority 2. If priority is same, the user with fewer active orders is selected first.</div></div>
    <div class="grid three mt-sm">
      <div class="card info-card"><h3>1. Method match</h3><p>For a bKash order, only bKash routing rules are checked. Nagad rules will not receive bKash orders.</p></div>
      <div class="card info-card"><h3>2. Priority</h3><p><b>Priority 1</b> is tried first. If User A = 1 and User B = 2, User A is checked first.</p></div>
      <div class="card info-card"><h3>3. Guard rules</h3><p>The user is assigned only when amount range, max active orders and capacity guard match. Otherwise the next route is tried.</p></div>
    </div>
    <div class="card mt"><h3>Routing Example</h3><div class="route-flow"><span>New bKash order ৳60,000</span><b>→</b><span>bKash rules only</span><b>→</b><span>Priority 1 user</span><b>→</b><span>Capacity/limit ok?</span><b>→</b><span>Assign</span></div><div class="notice">When Capacity Guard is ON, the system checks active account capacity. When OFF, assignment uses only method + priority; balance/limit is checked later on the split selection screen.</div></div>
    <div class="card mt">${table(['Method','User','Priority','Amount Range','Capacity Guard','Max Active','Enabled','Note','Action'], data.items.map(r => [
      r.method?.name || '',
      r.agent?.name || '',
      `<b>${r.priority}</b><br/><span class="sub">${Number(r.priority)===1?'first choice':'fallback'}</span>`,
      `${money(r.minOrderAmount || 0)} - ${r.maxOrderAmount ? money(r.maxOrderAmount) : 'No max'}`,
      badge(r.capacityGuard ? 'ON: check capacity' : 'OFF: route only', r.capacityGuard ? 'ok' : 'warn'),
      r.maxActiveOrders || 'No limit',
      badge(r.enabled?'enabled':'disabled', r.enabled?'ok':'warn'),
      escapeHtml(r.note || ''),
      `<div class="actions"><button data-edit-route="${r.id}">Edit</button><button class="danger" data-del-route="${r.id}">Delete</button></div>`
    ]))}</div>`;
  $('#addRouteBtn').onclick = () => openRouteModal();
  $$('[data-edit-route]').forEach(b => b.onclick = () => openRouteModal(data.items.find(r => r.id === Number(b.dataset.editRoute))));
  $$('[data-del-route]').forEach(b => b.onclick = async () => { if(confirm('Delete this routing rule?')) { await api('/api/routing/' + b.dataset.delRoute, { method:'DELETE' }); renderRouting(); } });
}

