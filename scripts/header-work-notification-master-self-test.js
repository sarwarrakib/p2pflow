#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));
const server = read('app-server.js');
const app = read('public/app.js');
const index = read('public/index.html');
const orders = read('public/js/pages/orders.js');
const chat = read('public/js/pages/chat.js');
const notifications = read('public/js/pages/notifications.js');
const css = read('public/style.css');

const fail = message => { throw new Error(`Header work / notification master self-test failed: ${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };
const count = (source, value) => source.split(value).length - 1;

assert(pkg.version === '1.5.36', `expected v1.5.36, got ${pkg.version}`);
assert(count(index, 'data-order-acceptance-toggle') === 1, 'the header must contain the only Work Status button');
assert(index.includes('id="globalWorkAvailabilityToggle"'), 'global header Work Status control is missing');
assert(!orders.includes('orderAcceptanceButtonHtml') && !orders.includes('class="order-acceptance-toggle'), 'Orders list still renders a duplicate Work Status button');
assert(!chat.includes('data-order-acceptance-toggle'), 'P2P Message still renders a duplicate Work Status button');
assert(!app.includes('chat-availability-bar'), 'order-detail chat still renders Work/Notification controls');
assert(!css.includes('.chat-availability-bar'), 'obsolete order-detail chat control styles remain');

assert(server.includes('function userHasLiveOrderAccess'), 'live-order access helper is missing');
assert(server.includes("binanceCredentialIdsForUserPermission(user, 'binance.sync', { includeDisabled: true })"), 'effective account-scoped Live Order permission is not checked');
assert(server.includes('controlsAutoAssignment = Boolean(assignable && !liveOrderAccess)'), 'Work Status remains visible to Live Order users');
assert(server.includes('function broadcastOrderAcceptanceState') && server.includes('liveOrderAccess: next.liveOrderAccess'), 'realtime work state does not carry Live Order visibility');
assert(server.includes("reason: 'user_permissions_updated'") && server.includes("reason: 'role_permissions_updated'"), 'permission changes do not update the header Work Status immediately');

assert(chat.includes('backgroundNotificationToggleHtml({ compact:true })'), 'P2P Message notification master button is missing');
assert(app.includes("  chat: null,"), 'P2P Message page still requires Orders permission, so the sound/notification button is not available to every signed-in role');
assert(server.includes("const user = requireAuth(req, res); if (!user) return;") && server.includes("const orders = userHasPermission(user, 'orders.view') ? ordersAccessibleToUser(user) : [];"), 'chat inbox does not safely allow notification-only access without exposing orders');
assert(!notifications.includes('backgroundNotificationToggleHtml'), 'Notifications settings still duplicates the master button');
assert(app.includes('function notificationMasterEnabled()'), 'notification master state helper is missing');
assert(app.includes('function notificationCategoryEnabledOnDevice'), 'category-aware automatic sound gate is missing');
assert(app.includes("options.force !== true && !notificationCategoryEnabledOnDevice"), 'automatic sounds are not blocked while Notifications is OFF');
assert(app.includes('const NOTIFICATION_SOUND_CHOICES = [\'chime\',\'bell\',\'alert\',\'soft\',\'custom\'];'), 'sound selector still has an independent OFF mode');
assert(!app.includes('<option value="off"'), 'Settings still exposes a second sound OFF switch');
assert(app.includes('await subscription.unsubscribe().catch(()=>false)') && app.includes("method:'DELETE'"), 'Notifications OFF does not unsubscribe this device');
assert(app.includes('currentDeviceSubscribed:false') && app.includes('state.pushConfig = previousConfig'), 'Notifications OFF is not applied immediately or rolled back safely after failure');
assert(server.includes('user.backgroundNotificationsEnabled !== true') && server.includes('activePushSubscriptionsForUser'), 'server push is not gated by notification master state');

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  headerOnlyWorkStatus: true,
  liveOrderWorkHidden: true,
  chatOnlyNotificationMaster: true,
  soundAndBrowserNotificationsCoupled: true,
  perDevicePushDisable: true
}, null, 2));
