'use strict';

const state = { step: 1, existingState: false, claimUrl: '', databaseChecked: false, legacyAvailable: false, legacyImport: null, savedApplicationKeyAvailable: false };
const $ = id => document.getElementById(id);
const panels = [...document.querySelectorAll('[data-panel]')];
const steps = [...document.querySelectorAll('[data-step]')];

function value(id) { return $(id)?.value?.trim() || ''; }
function checked(id) { return Boolean($(id)?.checked); }
function show(el, visible = true) { if (el) el.classList.toggle('hidden', !visible); }
function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) { button.dataset.label = button.textContent; button.textContent = label || 'Please wait…'; button.disabled = true; button.classList.add('spinner'); }
  else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; button.classList.remove('spinner'); }
}
function message(text, type = '') {
  const box = $('statusBanner');
  box.textContent = text || '';
  box.className = `banner${type ? ` ${type}` : ''}${text ? '' : ' hidden'}`;
}
function setStep(next) {
  state.step = Math.max(1, Math.min(5, next));
  panels.forEach(panel => panel.classList.toggle('active', Number(panel.dataset.panel) === state.step));
  steps.forEach(step => {
    const number = Number(step.dataset.step);
    step.classList.toggle('active', number === state.step);
    step.classList.toggle('done', number < state.step);
  });
  show($('backBtn'), state.step > 1);
  show($('nextBtn'), state.step < 5);
  if (state.step === 5) renderReview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function payload() {
  return {
    setupCode: value('setupCode'),
    databaseProvider: value('databaseProvider') || 'mysql', databaseUrl: value('databaseUrl'), databaseHost: value('databaseHost'), databasePort: value('databasePort'),
    databaseName: value('databaseName'), databaseUser: value('databaseUser'), databasePassword: $('databasePassword').value,
    databaseTable: value('databaseTable'), databaseSsl: value('databaseSsl') === 'true',
    databaseSslRejectUnauthorized: checked('databaseSslRejectUnauthorized'), appKey: $('appKey').value.trim(), importLegacy: checked('importLegacy'),
    ownerUsername: value('ownerUsername'), ownerName: value('ownerName'), ownerEmail: value('ownerEmail'),
    ownerPassword: $('ownerPassword').value, ownerPasswordConfirm: $('ownerPasswordConfirm').value,
    ownerSecretCode: $('ownerSecretCode').value.trim(), mailDriver: value('mailDriver'), mailFrom: value('mailFrom'),
    smtpHost: value('smtpHost'), smtpPort: value('smtpPort'), smtpUser: value('smtpUser'), smtpPass: $('smtpPass').value,
    smtpSecure: checked('smtpSecure'), smtpStarttls: checked('smtpStarttls'), publicBaseUrl: value('publicBaseUrl')
  };
}
async function api(path, body) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function validateStep() {
  message('');
  if (state.step === 1 && value('setupCode').length < 12) throw new Error('Enter the installation code from the hosting File Manager.');
  if (state.step === 2) {
    if (!value('databaseUrl')) {
      for (const id of ['databaseHost', 'databasePort', 'databaseName', 'databaseUser']) if (!value(id)) throw new Error('Complete all database fields or provide the full database URL.');
      if (!$('databasePassword').value) throw new Error('Database password is required.');
    }
    if (checked('importLegacy') && $('appKey').value.trim().length < 32 && !state.savedApplicationKeyAvailable) throw new Error('Old file-based data import requires the exact permanent Application Key from the previous installation. A key already saved on this server is reused automatically.');
  }
  if (state.step === 3 && !state.existingState) {
    if (!value('ownerUsername') || !value('ownerName') || !value('ownerEmail')) throw new Error('Complete the Owner username, name and email.');
    if ($('ownerPassword').value.length < 12) throw new Error('Owner password must contain at least 12 characters.');
    if ($('ownerPassword').value !== $('ownerPasswordConfirm').value) throw new Error('Owner password confirmation does not match.');
    if (!/^\d{6}$/.test($('ownerSecretCode').value) || /^(\d)\1{5}$/.test($('ownerSecretCode').value) || ['123456','654321','012345','543210'].includes($('ownerSecretCode').value)) throw new Error('Use a private non-repeating, non-sequential 6-digit secret.');
  }
}
function renderReview() {
  const p = payload();
  $('reviewBox').innerHTML = `<dl>
    <dt>Database type</dt><dd>${p.databaseProvider === 'postgres' ? 'PostgreSQL' : 'MariaDB / MySQL'}</dd>
    <dt>Database</dt><dd>${p.databaseUrl ? 'Connection URL provided' : `${p.databaseHost}:${p.databasePort}/${p.databaseName}`}</dd>
    <dt>Database table</dt><dd>${p.databaseTable || 'p2pflow_state'}</dd>
    <dt>Data mode</dt><dd>${p.importLegacy ? 'Import old file-based data into the selected database' : (state.existingState ? 'Use existing database data' : 'Create a new encrypted database')}</dd>
    <dt>Owner</dt><dd>${state.existingState && !p.importLegacy ? 'Preserved from the database' : `${p.ownerUsername} / ${p.ownerEmail}`}</dd>
    <dt>Email method</dt><dd>${p.mailDriver || 'local'}</dd>
    <dt>Public URL</dt><dd>${p.publicBaseUrl || 'Detected automatically'}</dd>
  </dl>`;
}
async function testDatabase() {
  validateStep();
  const button = $('testDatabaseBtn');
  const box = $('databaseResult');
  setBusy(button, true, 'Testing…');
  show(box, true); box.className = 'result'; box.textContent = `Connecting to ${value('databaseProvider') === 'postgres' ? 'PostgreSQL' : 'MariaDB / MySQL'}…`;
  try {
    const data = await api('/setup/api/test-database', payload());
    state.databaseChecked = true;
    state.existingState = Boolean(data.database.existingState);
    state.legacyImport = data.legacy || null;
    if (data.database.table) $('databaseTable').value = data.database.table;
    box.className = 'result success';
    box.textContent = data.legacy
      ? `Connected. Old data is ready to import: ${data.legacy.users} users, ${data.legacy.orders} orders, ${data.legacy.ledgers} ledger records, ${data.legacy.proofFiles} proofs and ${data.legacy.chatMedia} chat files.`
      : (state.existingState
        ? `Connected. Existing P2PFlow data found in ${data.database.table} (version ${data.database.storedVersion || 'unknown'}, revision ${data.database.storedRevision || 0}). The permanent Application Key saved on this server was verified automatically.`
        : `Connected to ${data.database.databaseName} as ${data.database.databaseUser}. The database is ready for a new installation.`);
    show($('ownerFields'), !state.existingState || checked('importLegacy'));
    $('ownerHelp').textContent = checked('importLegacy')
      ? 'Set the Owner username, email, password and secret that will replace the imported Owner login. All imported business data and history will remain.'
      : (state.existingState ? 'Existing application data was found. The current Owner account will be preserved.' : 'These values create the first Owner account.');
  } catch (error) {
    state.databaseChecked = false;
    box.className = 'result error'; box.textContent = error.message;
  } finally { setBusy(button, false); }
}
async function loadStatus() {
  try {
    const data = await api('/setup/api/status');
    $('setupCodeFile').textContent = data.setupCodeFile || 'the setup token configured in the hosting panel';
    state.legacyAvailable = Boolean(data.legacyImport?.available);
    state.savedApplicationKeyAvailable = Boolean(data.savedApplicationKeyAvailable);
    $('legacyFileStatus').textContent = state.legacyAvailable
      ? 'Old encrypted database file detected and ready to verify.'
      : 'No legacy-import/app.db.enc file is detected yet. Upload it with File Manager, then reload this page.';
    const defaults = data.defaults || {};
    for (const [key, val] of Object.entries(defaults)) if ($(key) && (!$(key).value || key === 'databaseProvider')) $(key).value = val;
    syncDatabaseProviderUi(false);
    if (data.startupFailure) message(`Previous startup could not complete: ${data.startupFailure.message || data.startupFailure.detail || data.startupFailure.code}`, 'error');
  } catch (error) { message(error.message, 'error'); }
}
async function install(event) {
  event.preventDefault();
  try { validateStep(); } catch (error) { return message(error.message, 'error'); }
  if (!checked('confirmInstall')) return message('Confirm that the database was created and the credentials were saved securely.', 'error');
  const button = $('installBtn');
  setBusy(button, true, 'Installing P2PFlow…');
  try {
    const data = await api('/setup/api/save', payload());
    state.claimUrl = data.claimUrl || '';
    $('setupForm').classList.add('hidden');
    document.querySelector('.steps').classList.add('hidden');
    show($('completePanel'), true);
    const applicationKeyRow = data.applicationKey
      ? `<dt>Permanent Application Key</dt><dd><code class="key-value">${data.applicationKey}</code><br><strong>Save this key now in a password manager and an offline backup. It is required to recover encrypted data.</strong></dd>`
      : '';
    $('completeDetails').innerHTML = `<dl><dt>Database type</dt><dd>${data.database.provider === 'postgres' ? 'PostgreSQL' : 'MariaDB / MySQL'}</dd><dt>Database</dt><dd>${data.database.name}</dd><dt>Database user</dt><dd>${data.database.user}</dd><dt>Table</dt><dd>${data.database.table}</dd><dt>Data mode</dt><dd>${data.importedLegacy ? 'Old file-based data imported' : (data.existingState ? 'Existing database data preserved; saved Application Key reused' : 'New Owner and database')}</dd>${applicationKeyRow}</dl>`;
    if (state.claimUrl) { $('claimOwnerLink').href = state.claimUrl; show($('claimOwnerLink'), true); }
    waitForRestart();
  } catch (error) {
    message(error.message, 'error');
    setBusy(button, false);
  }
}
async function waitForRestart() {
  let attempts = 0;
  const check = async () => {
    attempts += 1;
    try {
      const response = await fetch('/ready', { cache: 'no-store' });
      const data = await response.json();
      if (data.ok && !data.setupRequired && data.status !== 'setup_required') {
        window.location.href = state.claimUrl || '/';
        return;
      }
    } catch {}
    if (attempts < 40) setTimeout(check, 3000);
  };
  setTimeout(check, 2500);
}


function syncDatabaseProviderUi(force = false) {
  const provider = value('databaseProvider') || 'mysql';
  const port = $('databasePort');
  const url = $('databaseUrl');
  if (port && (force || !port.value || ['3306', '5432'].includes(port.value))) port.value = provider === 'postgres' ? '5432' : '3306';
  if (url) url.placeholder = provider === 'postgres'
    ? 'postgresql://user:password@host:5432/database'
    : 'mysql://user:password@host:3306/database';
  state.databaseChecked = false;
}
$('nextBtn').addEventListener('click', () => { try { validateStep(); setStep(state.step + 1); } catch (error) { message(error.message, 'error'); } });
$('backBtn').addEventListener('click', () => setStep(state.step - 1));
steps.forEach(step => step.addEventListener('click', () => { const n = Number(step.dataset.step); if (n <= state.step) setStep(n); }));
$('testDatabaseBtn').addEventListener('click', testDatabase);
$('importLegacy').addEventListener('change', () => {
  show($('legacyHelp'), checked('importLegacy'));
  state.databaseChecked = false;
  state.existingState = false;
  show($('ownerFields'), true);
  $('ownerHelp').textContent = checked('importLegacy')
    ? 'Set the Owner username, email, password and secret that will replace the imported Owner login. All imported business data and history will remain.'
    : 'These values create the first Owner account. Existing P2PFlow data keeps its current Owner login.';
});
$('databaseProvider').addEventListener('change', () => syncDatabaseProviderUi(true));
$('mailDriver').addEventListener('change', () => show($('smtpFields'), value('mailDriver') === 'smtp'));
$('setupForm').addEventListener('submit', install);
$('checkRestartBtn').addEventListener('click', () => { window.location.href = state.claimUrl || '/'; });
syncDatabaseProviderUi(false);
loadStatus();
