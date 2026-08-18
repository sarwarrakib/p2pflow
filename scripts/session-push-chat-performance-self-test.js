#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  base64urlEncode,
  generateVapidKeys,
  validateVapidKeys,
  encryptPayload,
  decryptPayloadForTest
} = require('../lib/webPush');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const server = read('app-server.js');
const app = read('public/app.js');
const index = read('public/index.html');
const sw = read('public/sw.js');
const manifest = JSON.parse(read('public/manifest.webmanifest'));
const orders = read('public/js/pages/orders.js');
const chat = read('public/js/pages/chat.js');
const ads = read('public/js/pages/ads.js');
const notifications = read('public/js/pages/notifications.js');
const css = read('public/style.css');
const fail = message => { throw new Error(`Session/push/chat performance self-test failed: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

assert(server.includes('const APP_SCHEMA_VERSION = 34;'), 'schema 34 is missing');
assert(server.includes('function sessionBindingHashV2') && server.includes('requestUaFamily(req)'), 'stable session binding v2 is missing');
const bindingV2 = (server.match(/function sessionBindingHashV2[\s\S]*?\n}/) || [''])[0];
assert(bindingV2 && !bindingV2.includes('requestIpPrefix'), 'session v2 still depends on the IP prefix');
assert(server.includes('const bindingVersion = 2;'), 'new sessions are not created with stable binding v2');
assert(server.includes("url.pathname === '/api/navigation-counts'"), 'combined navigation-count API is missing');
assert(server.includes("action === 'chat-delta'"), 'incremental order-chat endpoint is missing');
assert(server.includes("url.pathname === '/api/push'"), 'push API route is missing');
assert(server.includes('notificationPreferencesWithAllPushEnabled'), 'master notification ON does not enable every push category');

assert(index.includes('rel="manifest"') && index.includes('globalWorkAvailabilityToggle'), 'manifest or global work button is missing');
assert(manifest.start_url === '/#/orders' && manifest.display === 'standalone', 'PWA manifest is invalid');
assert(sw.includes("self.addEventListener('push'") && sw.includes('showNotification') && sw.includes("self.addEventListener('notificationclick'"), 'service worker push handlers are missing');
assert(app.includes('confirmSessionBeforeLogout') && app.includes('_authRetried:true'), 'transient 401 confirmation/retry is missing');
assert(app.includes('scheduleCurrentOrderChatDelta') && app.includes('/chat-delta?afterId='), 'incremental chat merge is missing');
const receivedHandler = (app.match(/if \(event\.type === 'chat\.message\.received'[\s\S]*?\n  }\n  if \(event\.type === 'chat\.message\.sent'/) || [''])[0];
assert(receivedHandler.includes('scheduleCurrentOrderChatDelta') && !receivedHandler.includes('scheduleCurrentOrderReload'), 'incoming chat still reloads the whole order page');
assert(chat.includes('preserveFocus:true') && chat.includes('chatThreadList'), 'chat inbox partial refresh is missing');
assert(index.includes('globalWorkAvailabilityToggle') && !orders.includes('orderAcceptanceButtonHtml') && !chat.includes('data-order-acceptance-toggle'), 'work status is not limited to the global header');
assert(server.includes("function userHasLiveOrderAccess") && server.includes("binanceCredentialIdsForUserPermission(user, 'binance.sync'"), 'live-order permission does not suppress the work control');
assert(chat.includes('backgroundNotificationToggleHtml({ compact:true })') && !notifications.includes('backgroundNotificationToggleHtml'), 'notification master control is not limited to the P2P Message page');
assert(app.includes('notificationCategoryEnabledOnDevice') && app.includes("subscription.unsubscribe()") && app.includes("method:'DELETE'"), 'notification OFF does not disable sound and remove this device push subscription');
assert(notifications.includes('data-notification-channel="push"'), 'background notification preferences are missing');
assert(css.includes('.background-notification-toggle') && css.includes('.chat-new-messages'), 'push/chat UI styles are missing');
assert(ads.includes('data = await api(adsPageUrl())'), 'Ads initial load is not using the cached fast path');

const receiver = crypto.createECDH('prime256v1');
const receiverPublicKey = receiver.generateKeys();
const authSecret = crypto.randomBytes(16);
const subscription = {
  endpoint: 'https://push.example.test/example',
  keys: {
    p256dh: base64urlEncode(receiverPublicKey),
    auth: base64urlEncode(authSecret)
  }
};
const payload = JSON.stringify({ title:'P2PFlow', body:'New order assigned', data:{ orderId:123 } });
const encrypted = encryptPayload(subscription, payload);
const decrypted = decryptPayloadForTest(receiver.getPrivateKey(), authSecret, encrypted.body);
assert(decrypted.payload.toString('utf8') === payload, 'RFC 8291/RFC 8188 push payload roundtrip failed');
const vapid = generateVapidKeys();
validateVapidKeys(vapid);

console.log(JSON.stringify({
  ok:true,
  schemaVersion:34,
  stableSessionBinding:true,
  combinedNavigationCounts:true,
  backgroundWebPush:true,
  pushCryptoRoundtrip:true,
  globalWorkStatus:true,
  incrementalChat:true,
  fastAdsInitialLoad:true
}, null, 2));
