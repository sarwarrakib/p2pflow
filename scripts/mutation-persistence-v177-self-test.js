#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { PostgresStateStore } = require('../lib/postgresStateStore');
const { MySqlStateStore } = require('../lib/mysqlStateStore');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (value, message) => { if (!value) throw new Error(`Mutation persistence v1.7.7 self-test failed: ${message}`); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runTicketScenario(Store, label) {
  const store = new Store({
    appKey:'0123456789abcdef0123456789abcdef',
    appVersion:'1.7.7',
    connectionString: label === 'postgres' ? 'postgres://unused/unused' : 'mysql://unused/unused'
  });
  const state = { value:0 };
  const writes = [];
  store.writeState = async (snapshot, reason) => {
    const captured = Number(snapshot.value || 0);
    await delay(55);
    store.currentRevision += 1;
    writes.push({ captured, reason, at:Date.now() });
  };

  state.value = 1;
  store.scheduleSave(() => state, 'background_initial');
  await delay(8);
  state.value = 2;
  const mutationStartedAt = Date.now();
  const mutationPromise = store.scheduleSave(() => state, 'user_settings_patch');

  let noiseStoppedAt = 0;
  const noise = setInterval(() => {
    state.value += 1;
    store.scheduleSave(() => state, 'background_noise').catch(() => {});
  }, 12);
  const stopNoise = setTimeout(() => {
    clearInterval(noise);
    noiseStoppedAt = Date.now();
  }, 320);

  await mutationPromise;
  const mutationResolvedAt = Date.now();
  assert(mutationResolvedAt - mutationStartedAt < 220, `${label} mutation waited ${mutationResolvedAt - mutationStartedAt}ms for unrelated background queue`);
  assert(!noiseStoppedAt || mutationResolvedAt < noiseStoppedAt, `${label} mutation did not resolve before background noise stopped`);
  assert(store.persistedSaveTicket >= 2, `${label} mutation durability ticket was not persisted`);

  await new Promise(resolve => setTimeout(resolve, 340));
  clearTimeout(stopNoise);
  clearInterval(noise);
  await store.flush(() => state);
  assert(store.persistedSaveTicket === store.saveTicketCounter, `${label} flush did not drain all scheduled tickets`);
  assert(writes.length >= 2, `${label} expected at least two coalesced writes`);
  return {
    provider:label,
    mutationWaitMs:mutationResolvedAt - mutationStartedAt,
    writes:writes.length,
    tickets:store.saveTicketCounter
  };
}

(async () => {
  const pkg = JSON.parse(read('package.json'));
  const server = read('app-server.js');
  const chat = read('public/js/pages/chat.js');
  assert(pkg.version === '1.7.8', `expected 1.7.8, got ${pkg.version}`);
  assert(server.includes('requestPersistence.lastSavePromise = promise'), 'request-scoped durability promise is not recorded');
  assert(server.includes('function requestMutationDurabilityPromise(req, status)'), 'request-specific mutation durability barrier is missing');
  const sendJsonSection = server.slice(server.indexOf('function sendJson('), server.indexOf('function readBody('));
  assert(!sendJsonSection.includes('flushDatabaseSave()'), 'HTTP mutation response still waits for global database queue drain');
  assert(server.includes('prewarmHotStaticAssets') && server.includes('STATIC_PREWARM_RELATIVE_PATHS'), 'cold-start static cache prewarm is missing');
  assert(chat.includes("save.textContent = 'Saving…'") && chat.includes("setFormMessage('#chatAccountSettingsMessage', 'Saving account settings…'"), 'chat settings save feedback is missing');

  const results = [];
  results.push(await runTicketScenario(PostgresStateStore, 'postgres'));
  results.push(await runTicketScenario(MySqlStateStore, 'mysql'));
  console.log(JSON.stringify({
    ok:true,
    version:pkg.version,
    fix:'request-scoped-durability-ticket',
    gateway504:'global-flush-starvation-removed',
    coldStart:'static-hot-cache-prewarm',
    results
  }, null, 2));
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
