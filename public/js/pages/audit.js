// P2PFlow v1.0.51
// Page module: audit. Edit this file for the audit page UI.

async function renderAudit() {
  setTitle('Audit Logs');
  const data = await api('/api/audit-logs?limit=500');
  $('#content').innerHTML = `<div class="card">${table(['Time','User','Role','Action','Entity','Details'], data.items.map(l => [fmt(l.createdAt), escapeHtml(l.userName), escapeHtml(l.role || ''), escapeHtml(l.action), `${escapeHtml(l.entityType || '')} #${escapeHtml(l.entityId ?? '')}`, `<pre>${escapeHtml(JSON.stringify(l.details, null, 2))}</pre>`]))}</div>`;
}

