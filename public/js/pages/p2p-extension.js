async function renderP2pExtensionAdmin() {
  setTitle('Extension Bridge', 'Token, URL, pending tasks and locally collected P2P data');
  const data = await api('/api/p2p-extension/admin/list');
  const copyBtn = (id, label) => `<button class="secondary mini-action" data-copy="${escapeAttr(id)}">${escapeHtml(label)}</button>`;
  const tokenId = 'p2pExtTokenValue';
  const urlId = 'p2pExtUrlValue';
  const tasks = data.tasks || [];
  const cache = data.cache || [];
  $('#content').innerHTML = `
    <div class="grid two">
      <div class="card">
        <div class="section-head"><h3>Extension API</h3><span>${data.enabled ? 'Enabled' : 'Disabled'}</span></div>
        <div class="kv">
          <b>Server URL</b><span id="${urlId}">${escapeHtml(data.serverUrlHint || location.origin)}</span>
          <b>Extension Token</b><span id="${tokenId}" class="mono-token">${escapeHtml(data.token || '')}</span>
          <b>Poll Seconds</b><span>${escapeHtml(data.pollSeconds || '-')}</span>
          <b>Advertiser URL Template</b><span>${escapeHtml(data.advertiserDetailUrlTemplate || '')}</span>
        </div>
        <div class="mt-sm">${copyBtn(urlId, 'Copy URL')} ${copyBtn(tokenId, 'Copy Token')} <button class="secondary mini-action" id="refreshP2pExtAdmin">Refresh</button></div>
      </div>
      <div class="card">
        <div class="section-head"><h3>Summary</h3><span>Daily cache</span></div>
        <div class="metric-grid compact">
          ${metric('Tasks', escapeHtml(tasks.length), 'Pending/claimed/completed')}
          ${metric('Stored Users', escapeHtml(cache.length), 'Shared for all users')}
        </div>
        <div class="notice mt-sm">Collected local data is shared by userNo for everyone who can view/manage orders. Old cache is purged daily at 11:59 PM server time.</div>
      </div>
    </div>
    <div class="card mt-lg">
      <div class="section-head"><h3>Extension Tasks</h3><button class="danger mini-action" id="deleteAllP2pTasks">Delete All Tasks</button></div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Status</th><th>User No</th><th>Name</th><th>Attempts</th><th>Updated</th><th>Error</th><th>Action</th></tr></thead><tbody>
        ${tasks.length ? tasks.map(t => `<tr><td>${escapeHtml(t.id)}</td><td>${escapeHtml(t.status)}</td><td class="mono-token small-token">${escapeHtml(t.userNo || '-')}</td><td>${escapeHtml(t.counterpartyName || '-')}</td><td>${escapeHtml(t.attempts || 0)}</td><td>${escapeHtml(fmt(t.updatedAt || t.createdAt))}</td><td>${escapeHtml(t.lastError || '-')}</td><td>${String(t.status || '').toLowerCase()==='failed' ? `<button class="secondary mini-action" data-retry-task="${escapeAttr(t.id)}">Retry</button> ` : ''}<button class="danger mini-action" data-del-task="${escapeAttr(t.id)}">Delete</button></td></tr>`).join('') : '<tr><td colspan="8" class="empty-state small">No extension task found.</td></tr>'}
      </tbody></table></div>
    </div>
    <div class="card mt-lg">
      <div class="section-head"><h3>Stored Local P2P Data</h3><button class="danger mini-action" id="deleteAllP2pCache">Delete All Stored Data</button></div>
      <div class="table-wrap"><table><thead><tr><th>User No</th><th>Name</th><th>Trades</th><th>Feedback</th><th>Social</th><th>Collected</th><th>Warnings</th><th>Action</th></tr></thead><tbody>
        ${cache.length ? cache.map(x => `<tr><td class="mono-token small-token">${escapeHtml(x.userNo || '-')}</td><td>${escapeHtml(x.advertiserName || '-')}</td><td>${escapeHtml(fmtDash(x.allTrades))}<br/><span class="sub">Buy ${escapeHtml(fmtDash(x.buyTrades))} | Sell ${escapeHtml(fmtDash(x.sellTrades))}</span></td><td>Total ${escapeHtml(fmtDash(x.feedbackReviews))}<br/><span class="sub">Positive ${escapeHtml(fmtDash(x.positiveFeedback))} | Negative ${escapeHtml(fmtDash(x.negativeFeedback))} | Rows ${escapeHtml(x.feedbackRows || 0)}</span></td><td><span class="sub">Followers ${escapeHtml(fmtDash(x.followersCount))} / Following ${escapeHtml(fmtDash(x.followingCount))} / Ads ${escapeHtml(fmtDash(x.adsCount))}</span></td><td>${escapeHtml(fmt(x.collectedAt))}<br/><span class="sub">Expires ${escapeHtml(fmt(x.expiresAt))}</span></td><td>${escapeHtml((x.warnings || []).join(' | ') || '-')}</td><td><button class="danger mini-action" data-del-cache="${escapeAttr(x.id)}">Delete</button></td></tr>`).join('') : '<tr><td colspan="8" class="empty-state small">No stored extension data found.</td></tr>'}
      </tbody></table></div>
    </div>`;
  $$('[data-copy]').forEach(btn => btn.onclick = async () => {
    const el = document.getElementById(btn.dataset.copy);
    const txt = el ? el.textContent.trim() : '';
    try { await navigator.clipboard.writeText(txt); notify('Copied.', 'ok'); }
    catch { prompt('Copy value', txt); }
  });
  $('#refreshP2pExtAdmin').onclick = () => renderP2pExtensionAdmin();
  $('#deleteAllP2pTasks').onclick = () => deleteP2pExtensionAdminItem('task', 'all');
  $('#deleteAllP2pCache').onclick = () => deleteP2pExtensionAdminItem('cache', 'all');
  $$('[data-del-task]').forEach(btn => btn.onclick = () => deleteP2pExtensionAdminItem('task', btn.dataset.delTask));
  $$('[data-retry-task]').forEach(btn => btn.onclick = () => retryP2pExtensionTask(btn.dataset.retryTask));
  $$('[data-del-cache]').forEach(btn => btn.onclick = () => deleteP2pExtensionAdminItem('cache', btn.dataset.delCache));
}
async function retryP2pExtensionTask(id) {
  await api('/api/p2p-extension/admin/retry-task', { method:'POST', body: JSON.stringify({ id:Number(id) }) });
  notify('Task retry queued.', 'ok');
  await renderP2pExtensionAdmin();
}
async function deleteP2pExtensionAdminItem(type, id) {
  const label = type === 'task' ? 'task' : 'stored data';
  if (!confirm(id === 'all' ? `Delete all extension ${label}?` : `Delete this extension ${label}?`)) return;
  await api(`/api/p2p-extension/admin/delete-${type === 'task' ? 'task' : 'cache'}`, { method:'POST', body: JSON.stringify(id === 'all' ? { all:true } : { id:Number(id) }) });
  notify('Deleted.', 'ok');
  await renderP2pExtensionAdmin();
}
