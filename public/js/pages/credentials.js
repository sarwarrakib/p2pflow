// P2PFlow v1.0.77
// Page module: credentials. Edit this file for the credentials page UI.

async function renderCredentials() {
  setTitle('API Credentials');
  const data = await api('/api/api-credentials');
  const statusClass = st => ['success','ready','live_success'].includes(st) ? 'ok' : ['failed','live_failed','disabled','deleted'].includes(st) ? 'danger' : 'warn';
  const actionButtons = c => {
    const id = escapeAttr(String(Number(c.id) || ''));
    if (!id) return '<span class="badge danger">Invalid credential</span>';
    const testBtns = c.disabled ? '' : `<button type="button" data-test-cred="${id}">Validate</button> <button type="button" class="secondary" data-live-test-cred="${id}">Live Check</button>`;
    const toggleBtn = c.disabled ? `<button type="button" class="secondary" data-enable-cred="${id}">Enable</button>` : `<button type="button" class="secondary" data-disable-cred="${id}">Disable</button>`;
    return `${testBtns} ${toggleBtn} <button type="button" class="danger" data-delete-cred="${id}">Delete</button>`;
  };
  $('#content').innerHTML = `<div class="toolbar"><div class="actions"><button id="addCredBtn">Add Binance API Credential</button><button class="secondary" id="openHealthBtn">Health Check</button>${hasPerm('binance.sync') ? '<button class="secondary" id="syncBinancePaymentMethodsBtn">Sync Binance Payment Methods</button>' : ''}</div></div><div class="card">${table(['Name','API Key','Secret','Client Type','Status','Last Checked','Message','Action'], data.items.map(c => [escapeHtml(c.name), escapeHtml(c.apiKeyMasked || '-'), 'Hidden forever', escapeHtml(c.clientType || '-'), badge(c.status || 'saved', statusClass(c.status)), fmt(c.lastLiveTestedAt || c.lastTestedAt), escapeHtml(c.liveTestMessage || c.lastTestMessage || (c.disabled ? 'Disabled; not used for Binance live actions.' : '-')), actionButtons(c)]))}</div><div class="notice">Validate checks format. Live Check tests Binance access.</div>`;
  $('#addCredBtn').onclick = () => openCredentialModal();
  $('#openHealthBtn').onclick = () => setRoute('health');
  if ($('#syncBinancePaymentMethodsBtn')) $('#syncBinancePaymentMethodsBtn').onclick = async () => { try { const r = await api('/api/binance/sync/payment-methods', { method:'POST', body:'{}' }); notify(`Payment methods synced. Created ${r.created}, updated ${r.updated}.`, 'ok'); await refreshBootstrap(); renderCredentials(); } catch (err) { notify(err.message || 'Payment method sync failed', 'danger'); } };
  $$('[data-test-cred]').forEach(b => b.onclick = async () => { alert((await api(`/api/api-credentials/${b.dataset.testCred}/test`, { method:'POST', body:'{}' })).message); renderCredentials(); });
  $$('[data-live-test-cred]').forEach(b => b.onclick = async () => { try { const r = await api(`/api/api-credentials/${b.dataset.liveTestCred}/live-test`, { method:'POST', body:'{}' }); alert(r.message); if (r.paymentMethodSync) await refreshBootstrap(); } catch (err) { alert(err.message || 'Live check failed'); } renderCredentials(); });
  $$('[data-disable-cred]').forEach(b => b.onclick = async () => { if (!confirm('Disable this API credential? Binance sync/action will not use it.')) return; const r = await api(`/api/api-credentials/${b.dataset.disableCred}/disable`, { method:'POST', body:'{}' }); notify(r.message || 'Credential disabled', 'ok'); renderCredentials(); });
  $$('[data-enable-cred]').forEach(b => b.onclick = async () => { if (!confirm('Enable this API credential? Run Validate/Live Check before live use.')) return; const r = await api(`/api/api-credentials/${b.dataset.enableCred}/enable`, { method:'POST', body:'{}' }); notify(r.message || 'Credential enabled', 'ok'); renderCredentials(); });
  $$('[data-delete-cred]').forEach(b => b.onclick = async () => { if (!confirm('Delete this API credential permanently? The secret key will be removed and cannot be recovered.')) return; const r = await api(`/api/api-credentials/${b.dataset.deleteCred}`, { method:'DELETE' }); notify(r.message || 'Credential deleted', 'ok'); renderCredentials(); });
}
