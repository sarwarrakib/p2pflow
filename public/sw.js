'use strict';

// P2PFlow v1.5.25: notification master uses per-device Push subscription state.

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

function pushPayload(event) {
  if (!event.data) return {};
  try { return event.data.json() || {}; }
  catch (_) {
    try { return { body: event.data.text() }; }
    catch (_) { return {}; }
  }
}

self.addEventListener('push', event => {
  const payload = pushPayload(event);
  const title = String(payload.title || 'P2PFlow notification');
  const options = {
    body: String(payload.body || 'You have a new P2PFlow update.'),
    tag: String(payload.tag || `p2pflow-${Date.now()}`),
    renotify: payload.renotify !== false,
    requireInteraction: payload.requireInteraction === true,
    silent: false,
    vibrate: Array.isArray(payload.vibrate) ? payload.vibrate : [220, 100, 220],
    data: payload.data && typeof payload.data === 'object' ? payload.data : { url: '/#/notifications' },
    timestamp: Date.parse(payload.data?.createdAt || '') || Date.now()
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(String(event.notification.data?.url || '/#/notifications'), self.location.origin).toString();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    for (const client of windows) {
      if (!client.url.startsWith(self.location.origin)) continue;
      if ('navigate' in client) {
        try { await client.navigate(target); } catch (_) {}
      }
      if ('focus' in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
    return null;
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
