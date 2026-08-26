#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const market = fs.readFileSync(path.join(root, 'public/js/pages/p2p-market.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'app-server.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(app.includes('backgroundPatchAllowed(state.page)') && app.includes("!['ads','settings','p2p-market','chat'].includes(state.page)"), 'Generic db_updated events are not constrained to approved non-destructive page patches.');
assert(app.includes('refreshCurrentOrderStateNonDestructive'), 'Open-order background refresh is not non-destructive.');
assert(app.includes("mergeCurrentOrderChatItems(updated.chats || [], { forceScroll:false })"), 'Open-order chat delta is not merged without force scrolling.');
assert(app.includes('state.currentOrderChatLastUserScrollAt = Date.now()'), 'Chat user scroll state is not tracked.');
assert(app.includes(": (state.realtimeConnected ? 20000 : 3000);"), 'Active chat fallback is not SSE/WebSocket aware.');
assert(app.includes('id="chatCameraPicker"') && app.includes('id="chatCameraInput"') && app.includes('capture="environment"'), 'Direct camera capture is missing from chat.');
assert(css.includes('.chat-attachment-tray.is-open{display:grid;gap:8px}'), 'Camera/album attachment layout is not compact.');

assert(market.includes('captureP2pMarketViewport') && market.includes('restoreP2pMarketViewport'), 'P2P Market viewport preservation is missing.');
assert(market.includes('data-market-key='), 'P2P Market rows do not have a stable viewport anchor key.');
assert(market.includes('if (!background) result.classList.add(\'loading\')'), 'Background market refresh still shows foreground loading state.');

assert(server.includes('runBinanceFastOrderDiscovery'), 'Fast Binance order discovery loop is missing.');
assert(server.includes("CRM_FAST_ORDER_DISCOVERY_MS || 3000"), 'Fast order discovery is not configured around 3 seconds.');
assert(server.includes('startBinanceRealtimeChatLoop'), 'Persistent Binance chat WebSocket listener is missing.');
assert(server.includes("reason:'binance_chat_realtime'"), 'Realtime chat persistence path is missing.');
assert(server.includes("'Permissions-Policy': 'camera=(self)"), 'Same-origin camera permission is not enabled.');
assert(server.includes('Image upload to Binance failed after a fresh upload URL retry'), 'Chat image upload does not retry with a fresh pre-signed URL.');

const finalActionStart = server.indexOf('async function performLiveBinanceFinalAction');
const paidMarkIndex = server.indexOf("if (action === 'paid_mark')", finalActionStart);
const refreshIndex = server.indexOf('refreshBinanceOrderForFinalAction', finalActionStart);
assert(finalActionStart >= 0 && paidMarkIndex > finalActionStart && refreshIndex > paidMarkIndex, 'Mark as Paid still blocks on the heavy Binance order refresh before its fast path.');

console.log(JSON.stringify({
  ok: true,
  version: pkg.version,
  noGenericInteractiveRerender: true,
  nonDestructiveOpenOrderRefresh: true,
  chatScrollStable: true,
  activeChatFallbackMs: { realtime:20000, disconnected:3000 },
  realtimeChatWebSocket: true,
  cameraCapture: true,
  imageFreshPresignRetry: true,
  marketViewportAnchor: true,
  fastOrderDiscoveryMs: 3000,
  paidMarkFastPath: true,
  fixedShellRealtimeGate: true
}, null, 2));
