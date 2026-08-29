'use strict';

const state = { step: 1, existingState: false, loginUrl: '/login.html', databaseChecked: false, legacyAvailable: false, legacyImport: null, savedApplicationKeyAvailable: false };
const $ = id => document.getElementById(id);
const panels = [...document.querySelectorAll('[data-panel]')];
const steps = [...document.querySelectorAll('[data-step]')];

function value(id) { return $(id)?.value?.trim() || ''; }
function checked(id) { return Boolean($(id)?.checked); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
function safePublicBaseUrl(raw) {
  let parsed;
  try { parsed = new URL(String(raw || '').trim()); } catch { return ''; }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) return '';
  const hostname = parsed.hostname.toLowerCase();
  if (['localhost', 'localhost.localdomain', '127.0.0.1', '::1'].includes(hostname) || hostname.startsWith('127.')) return '';
  return parsed.origin;
}
function safeClaimUrl(raw) {
  try {
    const claim = new URL(String(raw || ''));
    const expected = new URL(safePublicBaseUrl(value('publicBaseUrl')));
    if (claim.protocol !== 'https:' || claim.origin !== expected.origin || claim.pathname !== '/setup/claim' || !claim.searchParams.get('token')) return '';
    return claim.href;
  } catch { return ''; }
}
function show(el, visible = true) { if (el) el.classList.toggle('hidden', !visible); }
function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) { button.dataset.label = button.textContent; button.textContent = label || 'অপেক্ষা করুন…'; button.disabled = true; button.classList.add('spinner'); }
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
    databaseMode: 'local', workspaceName: value('workspaceName') || 'P2PFlow Main Workspace',
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
  if (!response.ok) throw new Error(data.error || `রিকোয়েস্ট ব্যর্থ (${response.status})`);
  return data;
}
function validateStep() {
  message('');
  if (state.step === 1 && value('setupCode').length < 12) throw new Error('Hosting File Manager-এর সেটআপ কোড দিন।');
  if (state.step === 2 && !state.databaseChecked) throw new Error('Test the prepared local database first.');
  if (state.step === 3) {
    if (!value('ownerUsername') || !value('ownerName') || !value('ownerEmail')) throw new Error('Owner-এর ইউজারনেম, নাম ও ইমেইল দিন।');
    if ($('ownerPassword').value.length < 12) throw new Error('Owner পাসওয়ার্ড কমপক্ষে ১২ অক্ষরের হতে হবে।');
    if ($('ownerPassword').value !== $('ownerPasswordConfirm').value) throw new Error('দুইটি পাসওয়ার্ড মিলছে না।');
    if (!/^\d{6}$/.test($('ownerSecretCode').value) || /^(\d)\1{5}$/.test($('ownerSecretCode').value) || ['123456','654321','012345','543210'].includes($('ownerSecretCode').value)) throw new Error('ব্যক্তিগত ও ধারাবাহিক নয় এমন ৬ ডিজিট সিক্রেট দিন।');
  }
  if (state.step === 4 && !safePublicBaseUrl(value('publicBaseUrl'))) {
    throw new Error('ডোমেইনের root HTTPS URL দিন, যেমন https://panel.example.com।');
  }
}
function renderReview() {
  const p = payload();
  const databaseLabel = p.databaseMode === 'local' ? 'Local PostgreSQL (auto prepared)' : (p.databaseUrl ? 'Database URL provided' : `${p.databaseHost}:${p.databasePort}/${p.databaseName}`);
  const ownerLabel = `${p.ownerUsername} / ${p.ownerEmail}`;
  $('reviewBox').innerHTML = `<dl>
    <dt>ডাটাবেস ধরন</dt><dd>${p.databaseProvider === 'postgres' ? 'PostgreSQL' : 'MariaDB / MySQL'}</dd>
    <dt>ডাটাবেস</dt><dd>${escapeHtml(databaseLabel)}</dd>
    <dt>Database mode</dt><dd>Normalized relational database</dd>
    <dt>Workspace</dt><dd>${escapeHtml(p.workspaceName)}</dd>
    <dt>Owner</dt><dd>${escapeHtml(ownerLabel)}</dd>
    <dt>ইমেইল মেথড</dt><dd>${escapeHtml(p.mailDriver || 'local')}</dd>
    <dt>ওয়েবসাইট URL</dt><dd>${escapeHtml(safePublicBaseUrl(p.publicBaseUrl) || '-')}</dd>
  </dl>`;
}
async function testDatabase() {
  if (value('setupCode').length < 12) return message('Enter the setup code first.', 'error');
  const button = $('testDatabaseBtn');
  const box = $('databaseResult');
  setBusy(button, true, 'পরীক্ষা হচ্ছে…');
  show(box, true); box.className = 'result'; box.textContent = `${value('databaseProvider') === 'postgres' ? 'PostgreSQL' : 'MariaDB / MySQL'}-এ সংযোগ হচ্ছে…`;
  try {
    const data = await api('/setup/api/test-database', payload());
    state.databaseChecked = true;
    state.existingState = Number(data.database.existingUsers || 0) > 0;
    box.className = 'result success';
    box.textContent = state.existingState
      ? `Database connected, but it already contains ${data.database.existingUsers} user(s). Use a fresh database for first install.`
      : `Local ${data.database.provider || 'postgres'} database is connected and ready.`;
    show($('ownerFields'), true);
  } catch (error) {
    state.databaseChecked = false;
    box.className = 'result error'; box.textContent = error.message;
  } finally { setBusy(button, false); }
}
async function loadStatus() {
  try {
    const data = await api('/setup/api/status');
    $('setupCodeFile').textContent = data.setupCodeFile || 'Hosting panel-এর setup token';
    state.legacyAvailable = Boolean(data.legacyImport?.available);
    state.savedApplicationKeyAvailable = Boolean(data.savedApplicationKeyAvailable);
    $('legacyFileStatus').textContent = state.legacyAvailable
      ? 'পুরোনো encrypted database file পাওয়া গেছে।'
      : 'legacy-import/app.db.enc পাওয়া যায়নি। File Manager দিয়ে upload করে reload করুন।';
    const defaults = data.defaults || {};
    for (const [key, val] of Object.entries(defaults)) {
      if (!$(key)) continue;
      if (key === 'smtpSecure' || key === 'smtpStarttls') { $(key).checked = Boolean(val); continue; }
      if (!$(key).value || key === 'databaseProvider' || key === 'mailDriver') $(key).value = val;
    }
    show($('smtpFields'), value('mailDriver') === 'smtp');
    syncDatabaseProviderUi(false);
    const panel = document.querySelector('[data-panel="2"] .muted');
    if (panel) panel.textContent = 'The VPS installer already prepared a private local PostgreSQL database. No database password needs to be typed in the browser.';
    ['databaseUrl','databaseHost','databasePort','databaseName','databaseUser','databasePassword','databaseTable','databaseSsl','databaseSslRejectUnauthorized','appKey','importLegacy'].forEach(id => {
      const el = $(id); if (!el) return; const holder = el.closest('label'); if (holder) holder.classList.add('hidden');
    });
    const divider = document.querySelector('[data-panel="2"] .divider'); if (divider) divider.classList.add('hidden');
    const legacy = $('legacyHelp'); if (legacy) legacy.classList.add('hidden');
    if (data.startupFailure) message(`Previous startup failed: ${data.startupFailure.message || data.startupFailure.detail || data.startupFailure.code}`, 'error');
  } catch (error) { message(error.message, 'error'); }
}
async function install(event) {
  event.preventDefault();
  try { validateStep(); } catch (error) { return message(error.message, 'error'); }
  if (!checked('confirmInstall')) return message('ডাটাবেস তৈরি ও তথ্য নিরাপদে সেভ করার বিষয়টি নিশ্চিত করুন।', 'error');
  const button = $('installBtn');
  setBusy(button, true, 'P2PFlow ইনস্টল হচ্ছে…');
  try {
    const data = await api('/setup/api/save', payload());
    state.loginUrl = data.loginUrl || '/login.html';
    $('setupForm').classList.add('hidden');
    document.querySelector('.steps').classList.add('hidden');
    show($('completePanel'), true);
    const database = data.database || {};
    const applicationKeyRow = data.applicationKey
      ? `<dt>Permanent Application Key</dt><dd><code class="key-value">${escapeHtml(data.applicationKey)}</code><br><strong>কীটি password manager ও offline backup-এ সেভ করুন।</strong></dd>`
      : '';
    $('completeDetails').innerHTML = `<dl><dt>ডাটাবেস ধরন</dt><dd>${database.provider === 'postgres' ? 'PostgreSQL' : 'MariaDB / MySQL'}</dd><dt>ডাটাবেস</dt><dd>${escapeHtml(database.name || '-')}</dd><dt>ডাটাবেস ইউজার</dt><dd>${escapeHtml(database.user || '-')}</dd><dt>টেবিল</dt><dd>${escapeHtml(database.table || '-')}</dd><dt>ডাটা মোড</dt><dd>${data.importedLegacy ? 'পুরোনো ডাটা import হয়েছে' : (data.existingState ? 'বর্তমান ডাটা রাখা হয়েছে' : 'নতুন Owner ও ডাটাবেস')}</dd>${applicationKeyRow}</dl>`;
    $('claimOwnerLink').href = state.loginUrl; $('claimOwnerLink').textContent = 'Open login'; show($('claimOwnerLink'), true);
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
        window.location.href = state.loginUrl || '/login.html';
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
    ? 'Import-এর জন্য নতুন Owner তথ্য দিন। ব্যবসার ডাটা থাকবে।'
    : 'প্রথম Owner-এর তথ্য দিন। বর্তমান ডাটা থাকলে আগের Owner থাকবে।';
});
$('databaseProvider').addEventListener('change', () => syncDatabaseProviderUi(true));
$('mailDriver').addEventListener('change', () => show($('smtpFields'), value('mailDriver') === 'smtp'));
$('setupForm').addEventListener('submit', install);
$('checkRestartBtn').addEventListener('click', () => { window.location.href = state.loginUrl || '/login.html'; });
syncDatabaseProviderUi(false);
loadStatus();
