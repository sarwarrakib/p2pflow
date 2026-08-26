#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (value, message) => { if (!value) throw new Error(`Performance merge v1.7.6 self-test failed: ${message}`); };

const pkg = JSON.parse(read('package.json'));
const server = read('app-server.js');
const app = read('public/app.js');
const index = read('public/index.html');
const preload = read('public/page-preload.js');
const orders = read('public/js/pages/orders.js');
const ads = read('public/js/pages/ads.js');
const accounting = read('public/js/pages/accounting.js');
const chat = read('public/js/pages/chat.js');
const market = read('public/js/pages/p2p-market.js');
const adapterSource = read('lib/binanceAdapter.js');

assert(pkg.version === '1.7.8', `expected 1.7.8 before release bump, got ${pkg.version}`);

// A-branch strengths: Binance rate/timeout control + durable-write protection.
assert(server.includes('requestPersistenceContext.getStore()') && server.includes('if (persistence && persistence.saveScheduled) return;'), 'duplicate durable checkpoint protection is missing');
assert(server.includes('saveDbCoalesced') && server.includes("reason:'binance_chat_realtime'"), 'realtime chat persistence coalescing is missing');
assert(server.includes('binanceRealtimeChatHealthy') && server.includes("skipped:'websocket_healthy'"), 'REST chat catch-up is not suppressed while WebSocket is healthy');
assert(server.includes('entry.ws.ping()') && server.includes("ws.on('pong'"), 'WebSocket half-open heartbeat detection is missing');
assert(server.includes('STATIC_ASSET_MEMORY_CACHE_LIMIT') && server.includes('BROTLI_PARAM_QUALITY'), 'raw/compressed hot-asset memory cache is missing');
assert(server.includes('performanceTuningV175Initialized') && server.includes('binanceOpenOrderDetailRows = 12'), 'bounded order-detail defaults are missing');
assert(server.includes('consumeBinanceRoutineDetailBudget') && server.includes('P2PFLOW_BINANCE_ROUTINE_DETAIL_BUDGET'), 'rapid routine detail budget is missing');
assert(adapterSource.includes('BINANCE_HTTP_GLOBAL_CONCURRENCY') && adapterSource.includes('BINANCE_HTTP_PER_KEY_CONCURRENCY'), 'shared Binance request gate is missing');
assert(adapterSource.includes('BINANCE_LOCAL_QUEUE_TIMEOUT') && adapterSource.includes('setSchedulerBackoff'), 'Binance queue timeout / 418-429 backoff is missing');

// B-branch strengths: heartbeat/write reduction, lazy boot and event selectivity.
assert(server.includes("const NON_DURABLE_MUTATION_PATHS = new Set([") && server.includes("'/api/activity/heartbeat'"), 'activity heartbeat still forces request-level durable flush');
assert(server.includes('session.activityLastPersistedAt >= 60000'), 'activity checkpoint is still too frequent');
assert(server.includes('function scheduleDbUpdatedBroadcast(') && server.includes('DB_UPDATED_COALESCE_MS'), 'generic db_updated coalescing is missing');
assert(server.includes("headers['X-P2PFlow-Response-Ms']"), 'response timing header is missing');
assert(server.includes("url.searchParams.get('group') || 'all'") && server.includes('groupCounts'), 'orders API active-group payload support is missing');
assert(index.includes('/page-preload.js?v=1.7.8'), 'active-route preload script is missing');
assert(!index.includes('/js/pages/orders.js?v=1.7.8') && !index.includes('/js/pages/ads.js?v=1.7.8'), 'page bundles are still eager on application boot');
assert(app.includes('const PAGE_MODULE_PATHS = Object.freeze({') && app.includes('await ensurePageModule(state.page)'), 'lazy page-module runtime is missing');
assert(preload.includes('P2PFlowPageModulePromises') && preload.includes('pathToRoute'), 'active page preload does not share the lazy-loader promise registry');
assert(app.includes("const notificationRelevant = type === 'notification.created'"), 'SSE notification refresh is not event-selective');
assert(app.includes("!['ads','settings','p2p-market','chat','orders','accounting'"), 'generic db_updated still rebuilds realtime-heavy pages');

// Merged behavior: active-group first paint + hidden-group post-paint hydration.
assert(orders.includes('function scheduleInactiveOrderGroupHydration') && orders.includes('mergeOrderGroupPayloads'), 'Orders post-paint history hydration is missing');
assert(orders.includes('renderOrders({ group:nextGroup') && orders.includes('sectionNode.hidden = !active;'), 'Orders does not have lazy fallback plus instant hydrated switching');

// Realtime-first fallbacks stay quiet when healthy, fast when disconnected.
assert(app.includes('realtimeConnected: false') && app.includes('(state.realtimeConnected ? 20000 : 3000)'), 'open-order chat fallback is not realtime-channel aware');
assert(app.includes("page: 1, rows: 20, sort: 'desc'"), 'open-order chat REST fallback is not compact');
assert(ads.includes('state.realtimeConnected ? 30000 : 5000'), 'Ads safety refresh is not merged realtime/fallback aware');
assert(accounting.includes('state.realtimeConnected ? 30000 : 5000'), 'Accounting safety refresh is not merged realtime/fallback aware');
assert(chat.includes('state.realtimeConnected ? 30000 : 8000'), 'Chat inbox fallback is not merged realtime/fallback aware');
assert(market.includes('}, 8000);'), 'P2P market refresh is not bounded');

async function schedulerConcurrencyCheck() {
  const previous = {
    global: process.env.P2PFLOW_BINANCE_HTTP_CONCURRENCY,
    perKey: process.env.P2PFLOW_BINANCE_HTTP_PER_KEY_CONCURRENCY,
    queue: process.env.P2PFLOW_BINANCE_HTTP_MAX_QUEUE
  };
  process.env.P2PFLOW_BINANCE_HTTP_CONCURRENCY = '3';
  process.env.P2PFLOW_BINANCE_HTTP_PER_KEY_CONCURRENCY = '2';
  process.env.P2PFLOW_BINANCE_HTTP_MAX_QUEUE = '100';
  const adapterPath = require.resolve('../lib/binanceAdapter');
  delete require.cache[adapterPath];
  let active = 0;
  let maxActive = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 25));
    active -= 1;
    return new Response(JSON.stringify({ code:'000000', success:true, data:{} }), { status:200, headers:{ 'content-type':'application/json' } });
  };
  try {
    const { callSignedSapiPath, schedulerStats } = require('../lib/binanceAdapter');
    await Promise.all(Array.from({ length:6 }, (_, index) => callSignedSapiPath({
      apiKey:'test-api-key', secretKey:'test-secret-key', endpointName:`test-${index}`,
      method:'GET', path:'/sapi/v1/test', dryRun:false, timeoutMs:1000
    })));
    assert(maxActive <= 2, `per-key scheduler exceeded concurrency: ${maxActive}`);
    const stats = schedulerStats();
    assert(stats.active === 0 && stats.queued === 0, 'scheduler did not drain cleanly');
    return { maxActive, configuredPerKey:stats.perKeyConcurrency, configuredGlobal:stats.globalConcurrency };
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      const envKey = key === 'global' ? 'P2PFLOW_BINANCE_HTTP_CONCURRENCY' : key === 'perKey' ? 'P2PFLOW_BINANCE_HTTP_PER_KEY_CONCURRENCY' : 'P2PFLOW_BINANCE_HTTP_MAX_QUEUE';
      if (value === undefined) delete process.env[envKey]; else process.env[envKey] = value;
    }
  }
}

schedulerConcurrencyCheck().then(scheduler => {
  console.log(JSON.stringify({
    ok:true,
    version:pkg.version,
    boot:'active-page-preload+lazy-modules',
    orders:'active-group-first-paint+post-paint-hydration',
    durability:'single-checkpoint+non-durable-heartbeat',
    dbUpdatedCoalesced:true,
    realtimeChat:'websocket-first-rest-fallback',
    browserChatFallbackMs:{ realtime:20000, disconnected:3000 },
    safetyPollingMs:{ adsRealtime:30000, adsDisconnected:5000, accountingRealtime:30000, accountingDisconnected:5000, chatInboxRealtime:30000, chatInboxDisconnected:8000, p2pMarket:8000 },
    orderDetailDefaults:{ autoSyncSeconds:30, openDetailRows:12, rapidRoutineBudget:8 },
    staticAssets:'raw+br+gzip-lru',
    binanceScheduler:scheduler,
    slowRequestTelemetry:true
  }, null, 2));
}).catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
