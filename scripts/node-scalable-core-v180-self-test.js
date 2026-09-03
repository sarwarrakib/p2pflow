'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const server = fs.readFileSync(path.join(root, 'app-server.js'), 'utf8');
const {
  lookupById, rowsForNumberField, incomingChatsForOrder, c2cChatsForOrder,
  latestIncomingChat, hasExternalChatId, buildLedgerIndex
} = require('../lib/runtimeIndexes');
const { mapWithConcurrency } = require('../lib/asyncPool');
const { prepareWorkspaceScope } = require('../lib/workspaceScope');
const { prepareSegmentedState, hydrateSegmentedState } = require('../lib/stateSegmentation');

assert.strictEqual(pkg.version, '1.8.1', `expected v1.8.1, got ${pkg.version}`);
assert(server.includes('const APP_SCHEMA_VERSION = 39;'), 'schema 39 API-ready migration is missing');
assert(server.includes('BINANCE_ACCOUNT_SYNC_CONCURRENCY'), 'bounded multi-account Binance concurrency is missing');
assert(server.includes("saveDbCoalesced('binance_auto_order_sync'"), 'background Binance checkpoint coalescing is missing');
assert(server.includes("options.durability === 'relaxed'"), 'relaxed low-risk durability path is missing');

// ID/group indexes must follow append/replacement changes while preserving object references.
const rows = [{ id:1, orderId:10, value:'a' }, { id:2, orderId:10, value:'b' }];
assert.strictEqual(lookupById(rows, 2).value, 'b');
assert.strictEqual(rowsForNumberField(rows, 'orderId', 10).length, 2);
rows.push({ id:3, orderId:11, value:'c' });
assert.strictEqual(lookupById(rows, 3).value, 'c');
assert.strictEqual(rowsForNumberField(rows, 'orderId', 11).length, 1);

const chats = [
  { id:1, orderId:10, source:'binance', binanceMessageId:'m1', message:'hello', createdAt:'2026-08-31T00:00:00.000Z' },
  { id:2, orderId:10, source:'binance-outbound', binanceMessageId:'m2', message:'reply', createdAt:'2026-08-31T00:01:00.000Z' },
  { id:3, orderId:11, source:'binance', binanceMessageId:'m3', message:'other', createdAt:'2026-08-31T00:02:00.000Z' }
];
assert.strictEqual(incomingChatsForOrder(chats, 10).length, 1);
assert.strictEqual(c2cChatsForOrder(chats, 10).length, 2);
assert.strictEqual(latestIncomingChat(chats, 10).id, 1);
assert.strictEqual(hasExternalChatId(chats, 10, 'm2'), true);
chats.push({ id:4, orderId:10, source:'binance', binanceMessageId:'m4', message:'new', createdAt:'2026-08-31T00:03:00.000Z' });
assert.strictEqual(latestIncomingChat(chats, 10).id, 4, 'chat index did not invalidate after append');

const ledgers = [
  { id:1, paymentAccountId:5, orderId:10, direction:'receive', amount:100, createdAt:'2026-08-31T01:00:00.000Z' },
  { id:2, paymentAccountId:5, orderId:10, direction:'send', amount:25, createdAt:'2026-08-31T02:00:00.000Z' }
];
const ledgerOptions = {
  dayKey:'2026-08-31', monthKey:'2026-08',
  effect: row => row.direction === 'send' ? -Number(row.amount || 0) : Number(row.amount || 0),
  isLimitLedger: () => true,
  limitUsage: row => row.direction === 'send' ? { send:Number(row.amount || 0), receive:0 } : { send:0, receive:Number(row.amount || 0) }
};
let ledgerIndex = buildLedgerIndex(ledgers, ledgerOptions);
assert.strictEqual(ledgerIndex.balanceByAccount.get(5), 75);
assert.deepStrictEqual(ledgerIndex.usageByAccount.get(5), { todayReceived:100, todaySent:25, monthReceived:100, monthSent:25 });
ledgers.push({ id:3, paymentAccountId:5, orderId:11, direction:'receive', amount:10, createdAt:'2026-08-31T03:00:00.000Z' });
ledgerIndex = buildLedgerIndex(ledgers, ledgerOptions);
assert.strictEqual(ledgerIndex.balanceByAccount.get(5), 85, 'ledger index did not invalidate after append');
assert.strictEqual(ledgerIndex.byOrder.get(11).length, 1);

// Workspace preparation is intentionally single-workspace now, but all existing
// and newly appended legacy records receive an ownership key for later SaaS migration.
const state = { meta:{ createdAt:'2026-08-31T00:00:00.000Z' }, users:[{id:1}], orders:[{id:2}], chats:[], ledgers:[] };
prepareWorkspaceScope(state, { force:true });
assert.strictEqual(state.workspaces[0].id, 1);
assert.strictEqual(state.users[0].workspaceId, 1);
assert.strictEqual(state.orders[0].workspaceId, 1);
state.orders.push({ id:3 });
prepareWorkspaceScope(state);
assert.strictEqual(state.orders[1].workspaceId, 1, 'new appended record was not workspace-scoped');

(async () => {
  // High-growth append-only histories are stored as immutable full chunks plus
  // a small tail in the main encrypted state. A settings-only save therefore
  // does not stringify/rewrite the entire chat/ledger/audit history.
  const objects = new Map();
  let objectWrites = 0;
  const fakeStore = {
    async putObject(id, data) { if (!objects.has(id)) { objects.set(id, Buffer.from(data)); objectWrites += 1; } return { objectId:id }; },
    async getObject(id) { return objects.has(id) ? { data:objects.get(id) } : null; }
  };
  const largeState = {
    meta:{ schemaVersion:38 }, settings:{ appName:'P2PFlow' },
    chats:Array.from({length:1200}, (_,i) => ({ id:i+1, orderId:1, source:'binance', message:`m${i+1}` })),
    ledgers:Array.from({length:750}, (_,i) => ({ id:i+1, paymentAccountId:1, direction:'receive', amount:1 })),
    auditLogs:Array.from({length:520}, (_,i) => ({ id:i+1, action:'test' }))
  };
  const segmentCache = new Map();
  const segmented = await prepareSegmentedState(largeState, fakeStore, { chunkRows:500, cache:segmentCache });
  assert(!Object.prototype.hasOwnProperty.call(segmented.state, 'chats'), 'segmented main state still contains full chat history');
  assert.strictEqual(segmented.state.__p2pflowSegments.collections.chats.tail.length, 200);
  assert.strictEqual(segmented.state.__p2pflowSegments.collections.ledgers.tail.length, 250);
  assert.strictEqual(segmented.state.__p2pflowSegments.collections.auditLogs.tail.length, 20);
  const writesAfterFirst = objectWrites;
  largeState.settings.appName = 'P2PFlow Updated';
  const settingsOnly = await prepareSegmentedState(largeState, fakeStore, { chunkRows:500, cache:segmentCache });
  assert.strictEqual(objectWrites, writesAfterFirst, 'settings-only save rewrote sealed history chunks');
  const hydrated = await hydrateSegmentedState(JSON.parse(JSON.stringify(settingsOnly.state)), fakeStore);
  assert.strictEqual(hydrated.chats.length, 1200);
  assert.strictEqual(hydrated.ledgers.length, 750);
  assert.strictEqual(hydrated.auditLogs.length, 520);

  let active = 0;
  let peak = 0;
  const values = await mapWithConcurrency([1,2,3,4,5,6], 2, async value => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 8));
    active -= 1;
    return value * 2;
  });
  assert.deepStrictEqual(values, [2,4,6,8,10,12]);
  assert(peak <= 2, `concurrency cap exceeded: ${peak}`);
  console.log(JSON.stringify({ ok:true, version:pkg.version, schema:39, runtimeIndexes:true, boundedBinanceAccounts:true, workspaceFoundation:true, segmentedHistory:true, sealedObjectWrites:objectWrites, peakConcurrency:peak }));
})().catch(error => { console.error(error); process.exit(1); });
