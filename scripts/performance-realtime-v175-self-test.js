#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'app-server.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const ads = fs.readFileSync(path.join(root, 'public/js/pages/ads.js'), 'utf8');
const accounting = fs.readFileSync(path.join(root, 'public/js/pages/accounting.js'), 'utf8');
const adapterSource = fs.readFileSync(path.join(root, 'lib/binanceAdapter.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(pkg.version === '1.7.6', `expected 1.7.6, got ${pkg.version}`);
assert(server.includes('requestPersistenceContext.getStore()') && server.includes('if (persistence && persistence.saveScheduled) return;'), 'Mutation responses can still enqueue a duplicate whole-state save.');
assert(server.includes('saveDbCoalesced') && server.includes("reason:'binance_chat_realtime'"), 'Realtime chat checkpoint coalescing is missing.');
assert(server.includes('binanceRealtimeChatHealthy') && server.includes("skipped:'websocket_healthy'"), 'REST chat polling is not suppressed when WebSocket is healthy.');
assert(server.includes('entry.ws.ping()') && server.includes("ws.on('pong'"), 'Realtime chat heartbeat/half-open detection is missing.');
assert(server.includes('STATIC_ASSET_MEMORY_CACHE_LIMIT') && server.includes('brotliCompress'), 'Hot static asset memory/Brotli cache is missing.');
assert(server.includes('performanceTuningV175Initialized') && server.includes('binanceOpenOrderDetailRows = 12'), 'Legacy heavy order-detail defaults are not tuned.');
assert(server.includes('consumeBinanceRoutineDetailBudget') && server.includes('P2PFLOW_BINANCE_ROUTINE_DETAIL_BUDGET'), 'Rapid smart-detail budget is missing.');
assert(adapterSource.includes('BINANCE_HTTP_GLOBAL_CONCURRENCY') && adapterSource.includes('BINANCE_HTTP_PER_KEY_CONCURRENCY'), 'Binance request concurrency gate is missing.');
assert(adapterSource.includes('BINANCE_LOCAL_QUEUE_TIMEOUT') && adapterSource.includes('setSchedulerBackoff'), 'Binance queue timeout/rate-limit backoff is missing.');
assert(app.includes('realtimeConnected: false') && app.includes('(state.realtimeConnected ? 20000 : 3000)'), 'Browser chat fallback is not realtime-channel aware.');
assert(app.includes("page: 1, rows: 20, sort: 'desc'"), 'Browser chat REST fallback is not using the documented compact page size.');
assert(ads.includes('state.realtimeConnected ? 15000 : 5000'), 'Ads safety polling is not SSE aware.');
assert(accounting.includes('state.realtimeConnected ? 15000 : 5000'), 'Accounting safety polling is not SSE aware.');

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
    const requests = Array.from({ length:6 }, (_, index) => callSignedSapiPath({
      apiKey:'test-api-key', secretKey:'test-secret-key', endpointName:`test-${index}`,
      method:'GET', path:'/sapi/v1/test', dryRun:false, timeoutMs:1000
    }));
    await Promise.all(requests);
    assert(maxActive <= 2, `per-key scheduler exceeded concurrency: ${maxActive}`);
    const stats = schedulerStats();
    assert(stats.active === 0 && stats.queued === 0, 'scheduler did not drain cleanly');
    return { maxActive, configuredPerKey:stats.perKeyConcurrency, configuredGlobal:stats.globalConcurrency };
  } finally {
    global.fetch = originalFetch;
    if (previous.global === undefined) delete process.env.P2PFLOW_BINANCE_HTTP_CONCURRENCY; else process.env.P2PFLOW_BINANCE_HTTP_CONCURRENCY = previous.global;
    if (previous.perKey === undefined) delete process.env.P2PFLOW_BINANCE_HTTP_PER_KEY_CONCURRENCY; else process.env.P2PFLOW_BINANCE_HTTP_PER_KEY_CONCURRENCY = previous.perKey;
    if (previous.queue === undefined) delete process.env.P2PFLOW_BINANCE_HTTP_MAX_QUEUE; else process.env.P2PFLOW_BINANCE_HTTP_MAX_QUEUE = previous.queue;
  }
}

schedulerConcurrencyCheck().then(scheduler => {
  console.log(JSON.stringify({
    ok:true,
    version:pkg.version,
    durabilityWrites:'single-confirmed-checkpoint',
    realtimeChat:'websocket-first-rest-fallback',
    browserChatFallbackMs:{ realtime:20000, disconnected:3000 },
    orderDetailDefaults:{ autoSyncSeconds:30, openDetailRows:12, rapidRoutineBudget:8 },
    staticAssets:'memory+br+gzip',
    binanceScheduler:scheduler,
    slowRequestTelemetry:true
  }, null, 2));
}).catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
