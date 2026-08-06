// P2PFlow v1.0.51
// Page module: health. Edit this file for the health page UI.

async function renderHealth() {
  setTitle('Health Check', 'Server connectivity, local mail, storage, session and Binance diagnostics without terminal access.');
  $('#content').innerHTML = '<div class="card skeleton">Running health checks...</div>';
  let data;
  try { data = await api('/api/health'); }
  catch (err) { $('#content').innerHTML = `<div class="card"><div class="error">${escapeHtml(err.message)}</div></div>`; return; }
  const binance = data.binance || { steps: [] };
  const mail = data.mail || { steps: [] };
  const storage = data.storage || { steps: [] };
  const cred = data.credential || {};
  const appRows = [
    ['App Version', data.app?.version || '-'],
    ['Node', data.app?.node || '-'],
    ['Platform', data.app?.platform || '-'],
    ['Uptime', `${data.app?.uptimeSeconds || 0}s`],
    ['Active Sessions', String(data.app?.sessionCount || 0)],
    ['API Mode', data.settings?.apiMode || '-'],
    ['Mail Driver', data.settings?.mailDriver || '-']
  ];
  const credRows = [
    ['Saved Credentials', String(cred.savedCredentialCount || 0)],
    ['Active Credential', cred.activeCredential ? cred.activeCredential.name : '-'],
    ['API Key', cred.activeCredential ? cred.activeCredential.apiKeyMasked : '-'],
    ['Credential Status', cred.activeCredential ? cred.activeCredential.status : '-'],
    ['Last Live Message', cred.activeCredential ? (cred.activeCredential.liveTestMessage || '-') : '-']
  ];
  $('#content').innerHTML = `
    <div class="toolbar"><div class="actions"><button id="rerunHealthBtn">Run Again</button><button class="secondary" id="binanceOnlyHealthBtn">Binance Network Only</button><button class="secondary" id="sendHealthMailBtn">Send Test Email</button></div></div>
    <div class="notice"><b>Diagnosis:</b> ${escapeHtml(binance.diagnosis || '-')}</div>
    <div class="grid two">
      ${healthCard('Application', true, table(['Metric','Value'], appRows.map(r => [escapeHtml(r[0]), escapeHtml(r[1])] )))}
      ${healthCard('Binance Credential', Boolean(cred.activeCredential), table(['Metric','Value'], credRows.map(r => [escapeHtml(r[0]), escapeHtml(r[1])] )))}
    </div>
    ${healthCard('Binance Network', binance.ok, table(['Step','Status','Target','Time/Status','Detail'], stepRows(binance.steps)))}
    ${healthCard('Email Delivery', mail.ok, table(['Step','Status','Target','Time/Status','Detail'], stepRows(mail.steps)))}
    ${healthCard('Storage', storage.ok, table(['Step','Status','Target','Time/Status','Detail'], stepRows(storage.steps)))}
    <div class="notice">If DNS is OK but HTTPS/fetch fails, send this health-check detail to hosting support. No API secret or OTP is shown here.</div>`;
  $('#rerunHealthBtn').onclick = () => renderHealth();
  $('#binanceOnlyHealthBtn').onclick = async () => {
    $('#content').insertAdjacentHTML('afterbegin', '<div class="notice" id="healthMiniRun">Running Binance network check...</div>');
    try {
      const r = await api('/api/health/binance');
      $('#healthMiniRun').outerHTML = `<div class="notice"><b>Binance diagnosis:</b> ${escapeHtml(r.diagnosis || '-')}<br>${table(['Step','Status','Target','Time/Status','Detail'], stepRows(r.steps || []))}</div>`;
    } catch (err) { $('#healthMiniRun').outerHTML = `<div class="error">${escapeHtml(err.message)}</div>`; }
  };
  $('#sendHealthMailBtn').onclick = async () => {
    if (!confirm('Send a local-server test email to your account email?')) return;
    try {
      const r = await api('/api/health/mail-test', { method:'POST', body: JSON.stringify({}) });
      notify(r.message || 'Test email sent', 'ok', 8000);
    } catch (err) {}
  };
  applyLanguage(document.querySelector('#content') || document);
}

