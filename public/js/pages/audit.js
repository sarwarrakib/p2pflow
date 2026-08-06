// P2PFlow v1.0.51
// Page module: audit. Edit this file for the audit page UI.

async function renderAudit() {
  setTitle('Audit Logs', 'Immutable action history for payment split, statement, assignment and security events.');
  const data = await api('/api/audit-logs?limit=500');
  $('#content').innerHTML = `<div class="card">${table(['Time','User','Role','Action','Entity','Details'], data.items.map(l => [fmt(l.createdAt), escapeHtml(l.userName), l.role, escapeHtml(l.action), `${l.entityType} #${l.entityId}`, `<pre>${escapeHtml(JSON.stringify(l.details, null, 2))}</pre>`]))}</div>`;
}

