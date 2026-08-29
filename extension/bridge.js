// P2PFlow v2 extension bridge. It never exposes the saved extension token to a page.
window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const msg = event.data || {};
  if (!msg || msg.type !== 'P2P_CRM_EXTENSION_COLLECT') return;
  const task = msg.task || {};
  let advertiser;
  try { advertiser = new URL(String(task.advertiserUrl || '')); } catch (_) { return; }
  if (advertiser.protocol !== 'https:' || advertiser.hostname !== 'c2c.binance.com' || !advertiser.pathname.includes('/advertiserDetail') || !advertiser.searchParams.get('advertiserNo')) return;
  let server;
  try { server = new URL(String(msg.serverUrl || location.origin)); } catch (_) { return; }
  if (server.origin !== location.origin) return;
  chrome.runtime.sendMessage({ type: 'START_CRM_TASK_DIRECT', task, serverUrl: server.origin }, (response) => {
    window.postMessage({ type: 'P2P_CRM_EXTENSION_ACK', requestId: msg.requestId || '', response: response || { ok: false, error: chrome.runtime.lastError?.message || 'No extension response' } }, location.origin);
  });
});
