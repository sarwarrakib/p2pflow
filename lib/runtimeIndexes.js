'use strict';

// Lightweight in-process indexes for the legacy Node.js runtime.
// They never become a second source of truth: the application arrays remain
// authoritative and every cache is rebuilt automatically when an array is
// replaced or its length changes. IDs are treated as immutable, which matches
// the existing P2PFlow data model.

const idIndexCache = new WeakMap();
const groupIndexCache = new WeakMap();
const chatIndexCache = new WeakMap();
const ledgerIndexCache = new WeakMap();

function safeArray(value) { return Array.isArray(value) ? value : []; }
function numberKey(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}
function arraySignature(rows) {
  const list = safeArray(rows);
  const first = list[0] || null;
  const last = list[list.length - 1] || null;
  return `${list.length}:${numberKey(first && first.id)}:${numberKey(last && last.id)}`;
}

function idMap(rows) {
  const list = safeArray(rows);
  let cached = idIndexCache.get(list);
  const signature = arraySignature(list);
  if (cached && cached.signature === signature) return cached.map;
  const map = new Map();
  for (const row of list) {
    const id = numberKey(row && row.id);
    if (id) map.set(id, row);
  }
  idIndexCache.set(list, { signature, map });
  return map;
}

function lookupById(rows, id) {
  return idMap(rows).get(numberKey(id)) || undefined;
}

function groupByNumberField(rows, field) {
  const list = safeArray(rows);
  let byField = groupIndexCache.get(list);
  if (!byField) {
    byField = new Map();
    groupIndexCache.set(list, byField);
  }
  const fieldName = String(field || '');
  const signature = arraySignature(list);
  const cached = byField.get(fieldName);
  if (cached && cached.signature === signature) return cached.map;
  const map = new Map();
  for (const row of list) {
    const key = numberKey(row && row[fieldName]);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  byField.set(fieldName, { signature, map });
  return map;
}

function rowsForNumberField(rows, field, value) {
  return groupByNumberField(rows, field).get(numberKey(value)) || [];
}

function buildChatIndex(chats) {
  const list = safeArray(chats);
  const signature = arraySignature(list);
  const cached = chatIndexCache.get(list);
  if (cached && cached.signature === signature) return cached.index;

  const allByOrder = new Map();
  const incomingByOrder = new Map();
  const c2cByOrder = new Map();
  const externalIdsByOrder = new Map();
  const latestIncomingByOrder = new Map();
  const latestC2cByOrder = new Map();

  const newer = (candidate, current) => {
    if (!current) return true;
    const nextTime = Date.parse(candidate && (candidate.createdAt || candidate.importedAt) || '') || 0;
    const currentTime = Date.parse(current && (current.createdAt || current.importedAt) || '') || 0;
    return nextTime > currentTime || (nextTime === currentTime && numberKey(candidate && candidate.id) > numberKey(current && current.id));
  };

  for (const chat of list) {
    const orderId = numberKey(chat && chat.orderId);
    if (!allByOrder.has(orderId)) allByOrder.set(orderId, []);
    allByOrder.get(orderId).push(chat);

    const source = String(chat && chat.source || '').toLowerCase();
    if (source === 'binance') {
      if (!incomingByOrder.has(orderId)) incomingByOrder.set(orderId, []);
      incomingByOrder.get(orderId).push(chat);
      if (newer(chat, latestIncomingByOrder.get(orderId))) latestIncomingByOrder.set(orderId, chat);
    }
    if (source === 'binance' || source === 'binance-outbound') {
      if (!c2cByOrder.has(orderId)) c2cByOrder.set(orderId, []);
      c2cByOrder.get(orderId).push(chat);
      if (newer(chat, latestC2cByOrder.get(orderId))) latestC2cByOrder.set(orderId, chat);
    }
    const externalId = String(chat && chat.binanceMessageId || '').trim();
    if (externalId) {
      if (!externalIdsByOrder.has(orderId)) externalIdsByOrder.set(orderId, new Set());
      externalIdsByOrder.get(orderId).add(externalId);
    }
  }

  const index = { allByOrder, incomingByOrder, c2cByOrder, externalIdsByOrder, latestIncomingByOrder, latestC2cByOrder };
  chatIndexCache.set(list, { signature, index });
  return index;
}

function chatsForOrder(chats, orderId) {
  return buildChatIndex(chats).allByOrder.get(numberKey(orderId)) || [];
}
function incomingChatsForOrder(chats, orderId) {
  return buildChatIndex(chats).incomingByOrder.get(numberKey(orderId)) || [];
}
function c2cChatsForOrder(chats, orderId) {
  return buildChatIndex(chats).c2cByOrder.get(numberKey(orderId)) || [];
}
function latestIncomingChat(chats, orderId) {
  return buildChatIndex(chats).latestIncomingByOrder.get(numberKey(orderId)) || null;
}
function latestC2cChat(chats, orderId) {
  return buildChatIndex(chats).latestC2cByOrder.get(numberKey(orderId)) || null;
}
function hasExternalChatId(chats, orderId, externalId) {
  const id = String(externalId || '').trim();
  if (!id) return false;
  return Boolean(buildChatIndex(chats).externalIdsByOrder.get(numberKey(orderId))?.has(id));
}

function buildLedgerIndex(ledgers, options = {}) {
  const list = safeArray(ledgers);
  const dayKey = String(options.dayKey || '');
  const monthKey = String(options.monthKey || '');
  const signature = `${arraySignature(list)}:${dayKey}:${monthKey}`;
  const cached = ledgerIndexCache.get(list);
  if (cached && cached.signature === signature) return cached.index;

  const effect = typeof options.effect === 'function' ? options.effect : (() => 0);
  const limitUsage = typeof options.limitUsage === 'function' ? options.limitUsage : (() => ({ send: 0, receive: 0 }));
  const isLimitLedger = typeof options.isLimitLedger === 'function' ? options.isLimitLedger : (() => false);
  const balanceByAccount = new Map();
  const usageByAccount = new Map();
  const byAccount = new Map();
  const byOrder = new Map();

  const ensureUsage = accountId => {
    let usage = usageByAccount.get(accountId);
    if (!usage) {
      usage = { todayReceived: 0, todaySent: 0, monthReceived: 0, monthSent: 0 };
      usageByAccount.set(accountId, usage);
    }
    return usage;
  };

  for (const ledger of list) {
    const accountId = numberKey(ledger && ledger.paymentAccountId);
    balanceByAccount.set(accountId, Number(balanceByAccount.get(accountId) || 0) + Number(effect(ledger) || 0));
    if (!byAccount.has(accountId)) byAccount.set(accountId, []);
    byAccount.get(accountId).push(ledger);

    const orderId = numberKey(ledger && ledger.orderId);
    if (orderId) {
      if (!byOrder.has(orderId)) byOrder.set(orderId, []);
      byOrder.get(orderId).push(ledger);
    }

    if (!isLimitLedger(ledger)) continue;
    const created = String(ledger && ledger.createdAt || '');
    const usageEffect = limitUsage(ledger) || { send: 0, receive: 0 };
    const usage = ensureUsage(accountId);
    if (monthKey && created.slice(0, 7) === monthKey) {
      usage.monthSent += Number(usageEffect.send || 0);
      usage.monthReceived += Number(usageEffect.receive || 0);
    }
    if (dayKey && created.slice(0, 10) === dayKey) {
      usage.todaySent += Number(usageEffect.send || 0);
      usage.todayReceived += Number(usageEffect.receive || 0);
    }
  }

  const index = { balanceByAccount, usageByAccount, byAccount, byOrder };
  ledgerIndexCache.set(list, { signature, index });
  return index;
}

function runtimeIndexStats(state = {}) {
  const chats = safeArray(state.chats);
  const ledgers = safeArray(state.ledgers);
  const orders = safeArray(state.orders);
  const chatIndex = buildChatIndex(chats);
  return {
    orders: orders.length,
    chats: chats.length,
    chatOrders: chatIndex.allByOrder.size,
    ledgers: ledgers.length,
    idIndexes: 'lazy',
    sourceOfTruth: 'application-arrays'
  };
}

module.exports = {
  lookupById,
  groupByNumberField,
  rowsForNumberField,
  buildChatIndex,
  chatsForOrder,
  incomingChatsForOrder,
  c2cChatsForOrder,
  latestIncomingChat,
  latestC2cChat,
  hasExternalChatId,
  buildLedgerIndex,
  runtimeIndexStats
};
