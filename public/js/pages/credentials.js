// P2PFlow v1.7.4
// API credentials: automatic connect validation, P2P username identity, compact actions and per-account Release Verification settings.

const P2PFLOW_BINANCE_RELEASE_VERIFICATION_METHODS = [
  ['AUTO','Binance Auto'],
  ['FIDO2','FIDO2 / Fingerprint'],
  ['FUND_PWD','Fund Transfer Password'],
  ['GOOGLE','Google Authenticator'],
  ['SMS','SMS / Mobile OTP'],
  ['EMAIL','Email OTP'],
  ['YUBIKEY','YubiKey']
];
const P2PFLOW_LOCAL_RELEASE_VERIFICATION_METHODS = [
  ['USER_PASSWORD','User Password'],
  ['SECRET_CODE','6-digit Secret Code'],
  ['EMAIL_OTP','Email OTP']
];

function p2pflowReleaseMethodOptions(selected = 'AUTO') {
  return P2PFLOW_BINANCE_RELEASE_VERIFICATION_METHODS.map(([value,label]) => `<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('');
}

function p2pflowLocalReleaseMethodOptions(selected = 'USER_PASSWORD', { allowNone = false } = {}) {
  const list = allowNone ? [['NONE','None'], ...P2PFLOW_LOCAL_RELEASE_VERIFICATION_METHODS] : P2PFLOW_LOCAL_RELEASE_VERIFICATION_METHODS;
  return list.map(([value,label]) => `<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('');
}

function p2pflowReleaseVerificationProfileHtml(profile = {}, canManageFundPassword = false) {
  const credentialId = Number(profile.credentialId || 0);
  const method = String(profile.binanceMethod || 'AUTO');
  const localEnabled = profile.localVerificationEnabled === true;
  const fundConfigured = profile.fundPasswordConfigured === true;
  const name = profile.p2pUsername || profile.credentialName || `Binance Account ${credentialId}`;
  return `<article class="credential-release-profile settings-release-profile" data-release-profile="${credentialId}">
    <div class="settings-release-profile-head">
      <div><b>${escapeHtml(name)}</b><small>Release Verification · API #${credentialId}${profile.disabled ? ' · Disabled' : ''}</small></div>
      <div>${badge(method === 'AUTO' ? 'Auto' : method, method === 'AUTO' ? 'muted' : 'ok')} ${fundConfigured ? badge('Fund password saved','ok') : ''}</div>
    </div>
    <div class="settings-callout warn"><b>Binance remains the final authority.</b><span>Binance Auto/Google/SMS/FIDO2 keep the existing challenge-driven flow. Fund Transfer Password uses Binance's RSA-encrypted FUND_PWD release flow when selected.</span></div>
    <div class="settings-field-grid settings-release-grid">
      <div><label>Binance verification</label><select data-release-field="binanceMethod">${p2pflowReleaseMethodOptions(method)}</select></div>
      <div class="settings-inline-check settings-release-local-toggle"><label class="check"><input type="checkbox" data-release-field="localVerificationEnabled" ${localEnabled?'checked':''}/> Require P2PFlow verification before Release</label></div>
      <div><label>Primary P2PFlow verification</label><select data-release-field="localPrimary">${p2pflowLocalReleaseMethodOptions(profile.localPrimary || 'USER_PASSWORD')}</select></div>
      <div><label>Secondary P2PFlow verification</label><select data-release-field="localSecondary">${p2pflowLocalReleaseMethodOptions(profile.localSecondary || 'NONE', { allowNone:true })}</select></div>
    </div>
    <div class="settings-release-fund-box" data-release-fund-box>
      <div class="settings-option-row compact"><span><b>Saved Fund Transfer Password</b><small>If saved, the password stays in the server-side encrypted secret vault and is never returned to the browser. FUND_PWD Release uses it automatically after Binance RSA/OAEP-SHA256 encryption. If P2PFlow verification is enabled, Primary/Secondary verification must pass first. If no password is saved, Release asks for it at that time.</small></span></div>
      <div class="settings-field-grid">
        <div><label>Fund Transfer Password</label><input data-release-field="fundPassword" type="password" value="" placeholder="${fundConfigured ? 'Saved — leave blank to keep' : 'Enter fund transfer password'}" autocomplete="new-password" ${canManageFundPassword?'':'disabled'} /></div>
        <div class="settings-inline-check"><label class="check"><input type="checkbox" data-release-field="clearFundPassword" ${canManageFundPassword?'':'disabled'} /> Clear saved password</label></div>
      </div>
    </div>
  </article>`;
}

function p2pflowRefreshReleaseVerificationCards() {
  document.querySelectorAll('[data-release-profile]').forEach(card => {
    const method = card.querySelector('[data-release-field="binanceMethod"]')?.value || 'AUTO';
    const fundBox = card.querySelector('[data-release-fund-box]');
    if (fundBox) fundBox.classList.toggle('hidden', method !== 'FUND_PWD');
  });
}

function credentialActionIcon(kind) {
  const paths = {
    settings:'<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.4 3.5a6.7 6.7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a8.4 8.4 0 0 0-1.8-1L15.6 3h-4l-.4 3a8.4 8.4 0 0 0-1.8 1L7 6 5 9.4 7 11a6.7 6.7 0 0 0 0 2l-2 1.6L7 18l2.4-1a8.4 8.4 0 0 0 1.8 1l.4 3h4l.4-3a8.4 8.4 0 0 0 1.8-1l2.5 1 2-3.4-2-1.6c0-.3.1-.7.1-1Z"/>',
    pause:'<path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z"/>',
    play:'<path d="m8 5 11 7-11 7V5Z"/>',
    trash:'<path d="M8 8h8l-.6 11H8.6L8 8Zm2-3h4l1 1h3v2H6V6h3l1-1Z"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[kind] || ''}</svg>`;
}

function credentialIconButton(kind, attr, id, label, className='') {
  return `<button type="button" class="credential-icon-btn ${className}" ${attr}="${escapeAttr(id)}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}">${credentialActionIcon(kind)}</button>`;
}

function credentialDisplayName(c={}) {
  return c.ownerP2pNickname || c.displayName || c.name || `Binance Account ${Number(c.id || 0)}`;
}

function openCredentialReleaseVerificationModal(credential = {}) {
  const profile = {
    ...(credential.releaseVerificationPolicy || {}),
    credentialId:Number(credential.id || 0),
    credentialName:credentialDisplayName(credential),
    p2pUsername:credential.ownerP2pNickname || credentialDisplayName(credential),
    disabled:credential.disabled === true
  };
  modal('Release Verification', `<form id="credentialReleaseVerificationForm" class="credential-release-form">
    ${p2pflowReleaseVerificationProfileHtml(profile, true)}
    <div id="credentialReleaseVerificationMessage"></div>
    <div class="credential-release-savebar"><button type="submit">Save Release Verification</button></div>
  </form>`);
  const dialog = document.querySelector('.modal-backdrop:last-of-type .modal');
  if (dialog) dialog.classList.add('credential-release-modal');
  const card = document.querySelector('[data-release-profile]');
  const methodSelect = card?.querySelector('[data-release-field="binanceMethod"]');
  if (methodSelect) methodSelect.onchange = p2pflowRefreshReleaseVerificationCards;
  p2pflowRefreshReleaseVerificationCards();
  $('#credentialReleaseVerificationForm').onsubmit = async event => {
    event.preventDefault();
    const get = name => card?.querySelector(`[data-release-field="${name}"]`);
    const payload = {
      binanceMethod:get('binanceMethod')?.value || 'AUTO',
      localVerificationEnabled:get('localVerificationEnabled')?.checked === true,
      localPrimary:get('localPrimary')?.value || 'USER_PASSWORD',
      localSecondary:get('localSecondary')?.value || 'NONE',
      fundPassword:get('fundPassword')?.value || '',
      clearFundPassword:get('clearFundPassword')?.checked === true
    };
    if (payload.localVerificationEnabled && payload.localSecondary !== 'NONE' && payload.localPrimary === payload.localSecondary) {
      return setFormMessage('#credentialReleaseVerificationMessage', 'Primary and Secondary verification must be different.', 'danger');
    }
    const submit = event.submitter;
    if (submit) submit.disabled = true;
    try {
      await api(`/api/api-credentials/${Number(credential.id)}/release-verification`, { method:'PATCH', body:JSON.stringify(payload) });
      notify('Release Verification settings saved for this Binance account.', 'ok');
      closeModal();
      renderCredentials();
    } catch (err) {
    if (isUiRequestCancelled(err)) return;
      setFormMessage('#credentialReleaseVerificationMessage', err.message || 'Could not save Release Verification settings.', 'danger');
    } finally {
      if (submit) submit.disabled = false;
    }
  };
}

async function renderCredentials() {
  if (state.page !== 'credentials') return;
  setTitle('API Credentials');
  const data = await api('/api/api-credentials');
  const items = Array.isArray(data.items) ? data.items : [];
  const statusClass = st => ['success','ready','live_success'].includes(st) ? 'ok' : ['failed','live_failed','disabled','deleted'].includes(st) ? 'danger' : 'warn';
  const actionButtons = c => {
    const id = String(Number(c.id) || '');
    if (!id) return '<span class="badge danger">Invalid credential</span>';
    const settings = credentialIconButton('settings', 'data-release-settings-cred', id, 'Release Verification settings');
    const toggle = c.disabled
      ? credentialIconButton('play', 'data-enable-cred', id, 'Enable Binance API account')
      : credentialIconButton('pause', 'data-disable-cred', id, 'Disable Binance API account');
    const remove = credentialIconButton('trash', 'data-delete-cred', id, 'Delete Binance API account', 'danger');
    return `<div class="credential-icon-actions">${settings}${toggle}${remove}</div>`;
  };
  const rows = items.map(c => {
    const accountName = credentialDisplayName(c);
    const identityMeta = [c.ownerP2pUserNo ? `User No: ${c.ownerP2pUserNo}` : '', c.ownerP2pProfileLastSyncAt ? `Synced ${fmt(c.ownerP2pProfileLastSyncAt)}` : ''].filter(Boolean).join(' · ');
    const accountCell = `<div class="credential-account-name"><b>${escapeHtml(accountName)}</b>${identityMeta ? `<small>${escapeHtml(identityMeta)}</small>` : ''}</div>`;
    const connection = c.liveTestMessage || c.lastTestMessage || (c.disabled ? 'Disabled; not used for Binance live actions.' : 'Connected');
    return [accountCell, escapeHtml(c.apiKeyMasked || '-'), badge(c.status || 'saved', statusClass(c.status)), fmt(c.lastLiveTestedAt || c.lastTestedAt), escapeHtml(connection), actionButtons(c)];
  });
  $('#content').innerHTML = `<div class="credentials-page">
    <div class="toolbar credentials-toolbar"><div class="actions"><button id="addCredBtn">Add Binance API Credential</button><button class="secondary" id="openHealthBtn">Health Check</button>${hasPerm('binance.sync') ? '<button class="secondary" id="syncBinancePaymentMethodsBtn">Sync Payment Methods</button>' : ''}</div></div>
    <div class="card credentials-card">${table(['P2P Account','API Key','Status','Last Connected','Connection','Actions'], rows)}</div>
    <div class="notice">Connect & Save automatically validates the credential and performs a live Binance C2C check before the credential is stored. The P2P username is synced automatically after connection.</div>
  </div>`;
  $('#addCredBtn').onclick = () => openCredentialModal();
  $('#openHealthBtn').onclick = () => setRoute('health');
  if ($('#syncBinancePaymentMethodsBtn')) $('#syncBinancePaymentMethodsBtn').onclick = async () => { try { const r = await api('/api/binance/sync/payment-methods', { method:'POST', body:'{}' }); notify(`Payment methods synced. Created ${r.created}, updated ${r.updated}.`, 'ok'); await refreshBootstrap(); renderCredentials(); } catch (err) {
    if (isUiRequestCancelled(err)) return; notify(err.message || 'Payment method sync failed', 'danger'); } };
  $$('[data-release-settings-cred]').forEach(button => button.onclick = () => {
    const credential = items.find(item => Number(item.id) === Number(button.dataset.releaseSettingsCred));
    if (credential) openCredentialReleaseVerificationModal(credential);
  });
  $$('[data-disable-cred]').forEach(b => b.onclick = async () => { if (!confirm('Disable this Binance API account? Binance sync/action will not use it.')) return; const r = await api(`/api/api-credentials/${b.dataset.disableCred}/disable`, { method:'POST', body:'{}' }); notify(r.message || 'Credential disabled', 'ok'); renderCredentials(); });
  $$('[data-enable-cred]').forEach(b => b.onclick = async () => { if (!confirm('Enable this Binance API account?')) return; const r = await api(`/api/api-credentials/${b.dataset.enableCred}/enable`, { method:'POST', body:'{}' }); notify(r.message || 'Credential enabled', 'ok'); renderCredentials(); });
  $$('[data-delete-cred]').forEach(b => b.onclick = async () => { if (!confirm('Delete this API credential permanently? The secret key will be removed and cannot be recovered.')) return; const r = await api(`/api/api-credentials/${b.dataset.deleteCred}`, { method:'DELETE' }); notify(r.message || 'Credential deleted', 'ok'); renderCredentials(); });
}
