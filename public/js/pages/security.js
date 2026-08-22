// P2PFlow v1.5.37
// Dedicated account/login security page. Binance P2P Profile lives on #/p2p-profile.

function securityStatusPill(label, enabled) {
  return `<span class="security-status-pill ${enabled ? 'ok' : 'muted'}"><b>${enabled ? '✓' : '–'}</b>${escapeHtml(label)}</span>`;
}

function securityDeviceRows(devices = []) {
  if (!devices.length) return '<div class="empty">No trusted browsers yet. Complete one full login to trust this browser.</div>';
  return `<div class="security-device-list">${devices.map(device => `
    <div class="security-device-row ${device.current ? 'current' : ''}">
      <div>
        <b>${escapeHtml(device.name || 'Trusted browser')}${device.current ? ' · This device' : ''}</b>
        <small>Trusted until ${escapeHtml(device.expiresAt ? fmt(device.expiresAt) : '-')} · Last seen ${escapeHtml(device.lastSeenAt ? fmt(device.lastSeenAt) : '-')}</small>
      </div>
      <button type="button" class="danger ghost revoke-trusted-device" data-device-id="${escapeAttr(device.id || '')}">${device.current ? 'Remove trust' : 'Revoke'}</button>
    </div>`).join('')}</div>`;
}

async function renderSecurity() {
  setTitle('Security');
  const data = await api('/api/me/security');
  const content = $('#content');
  content.innerHTML = `<div class="security-page">
    <section class="card security-overview-card">
      <div class="security-overview-head">
        <div class="security-overview-avatar">${escapeHtml((String(data.user?.name || data.user?.username || 'U').trim().slice(0,1) || 'U').toUpperCase())}</div>
        <div><h2>${escapeHtml(data.user?.name || data.user?.username || 'User')}</h2><p>${escapeHtml(data.email || 'No email configured')}</p></div>
      </div>
      <div class="security-status-row">
        ${securityStatusPill('Email OTP on full login', data.emailOtpRequired !== false)}
        ${securityStatusPill('6 Digit Secret', data.secretCodeRequired !== false && data.secretCodeSet)}
        ${securityStatusPill('Security Question Fallback', data.securityFallbackConfigured === true)}
        ${securityStatusPill('Device-bound sessions', true)}
      </div>
      <div class="notice small">After one full login, this browser can sign in with only the 6 digit secret for up to ${escapeHtml(String(data.trustedDeviceTtlDays || 30))} days. A copied session cookie alone is not accepted for normal API access.</div>
      ${canPage('p2p-profile') ? '<button type="button" class="secondary security-profile-link" id="openP2pProfileBtn">Open P2P Profile</button>' : ''}
    </section>

    <section class="card security-change-card">
      <div class="section-head"><div><h2>Trusted Devices</h2><p>Remove any browser you no longer use. Removing the current browser forces one full login again.</p></div></div>
      ${securityDeviceRows(data.trustedDevices || [])}
    </section>

    <section class="card security-change-card">
      <div class="section-head"><div><h2>Login Security Question Fallback</h2><p>Used only when full-login Email OTP cannot be sent. The answer is never stored as plaintext.</p></div>${data.securityFallbackConfigured ? badge('Configured','ok') : badge('Not configured','warn')}</div>
      ${data.securityQuestionFallbackEnabled === false ? '<div class="notice small">The global fallback switch is currently disabled in Settings. You can still configure your question now.</div>' : '<div class="okbox small">If Login OTP delivery fails, sign-in will require the correct Security Answer + your existing 6 digit secret. Challenge lifetime: 5 minutes, maximum 5 attempts.</div>'}
      <form id="securityFallbackForm" class="form-grid">
        <div class="full-row"><label>Security Question</label><input name="securityQuestion" minlength="8" maxlength="240" value="${escapeAttr(data.securityQuestion || '')}" placeholder="Example: What private phrase do I use for recovery?" required></div>
        <div><label>${data.securityFallbackConfigured ? 'New Security Answer (optional)' : 'Security Answer'}</label><input name="securityAnswer" type="password" minlength="8" maxlength="200" autocomplete="new-password" placeholder="${data.securityFallbackConfigured ? 'Leave blank to keep current answer' : 'Required'}"></div>
        <div><label>Current Password</label><input name="currentPassword" type="password" autocomplete="current-password" required></div>
        <div><label>Current 6 Digit Secret</label><input name="currentSecretCode" type="password" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></div>
        <div><label class="check"><input type="checkbox" name="clearSecurityFallback" /> Remove Security Question fallback</label></div>
        <div class="full-row"><div class="notice small">This fallback-only setting is verified with your current password + current 6 digit secret and does not depend on email delivery.</div></div>
        <div class="full-row" id="securityFallbackMessage"></div>
        <div class="full-row"><button type="submit">Save Security Question</button></div>
      </form>
    </section>

    <section class="card security-change-card">
      <div class="section-head"><div><h2>Correct Setup Email</h2><p>If the email entered during setup was wrong, verify your username, password and secret. The recovery OTP is sent only to the new email.</p></div></div>
      <form id="securityEmailRecoveryForm" class="form-grid">
        <div><label>Username</label><input name="username" value="${escapeAttr(data.user?.username || '')}" autocomplete="username" required></div>
        <div><label>Current Password</label><input name="password" type="password" autocomplete="current-password" required></div>
        <div><label>Current 6 Digit Secret</label><input name="secretCode" type="password" inputmode="numeric" maxlength="6" required></div>
        <div><label>Correct Gmail / Email</label><input name="newEmail" type="email" autocomplete="email" required></div>
        <div id="securityRecoveryOtpWrap" class="hidden"><label id="securityRecoveryCodeLabel">New Email OTP</label><input name="recoveryOtp" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div>
        <input name="recoveryId" type="hidden">
        <div class="full-row" id="securityRecoveryMessage"></div>
        <div class="full-row"><button type="submit" id="securityRecoveryBtn">Send OTP to New Email</button></div>
      </form>
    </section>

    <section class="card security-change-card">
      <div class="section-head"><div><h2>Security Settings</h2><p>Changing email, password or the 6 digit secret requires your current password and verification through the currently saved email.</p></div></div>
      <form id="securityForm" class="form-grid">
        <div class="full-row"><label>Current Password</label><input name="currentPassword" type="password" autocomplete="current-password" required></div>
        <div><label>New Password</label><input name="newPassword" type="password" minlength="12" maxlength="200" autocomplete="new-password" placeholder="optional, min 12 chars"></div>
        <div><label>Confirm New Password</label><input name="confirmPassword" type="password" minlength="12" maxlength="200" autocomplete="new-password"></div>
        <div><label>Email</label><input name="email" type="email" value="${escapeAttr(data.email || '')}"></div>
        <div><label>New 6 Digit Secret Code</label><input name="secretCode" inputmode="numeric" maxlength="6" placeholder="optional"></div>
        <div><label>Security Verification OTP</label><input name="securityOtp" inputmode="numeric" maxlength="6" placeholder="sent after first submit"></div>
        <div class="full-row"><div class="notice small">A successful security change revokes trusted devices and existing sessions. You will complete one full login again.</div></div>
        <div class="full-row" id="securityMessage"></div>
        <div class="full-row"><button type="submit">Update Security</button></div>
      </form>
    </section>
  </div>`;

  $('#openP2pProfileBtn')?.addEventListener('click', () => setRoute('p2p-profile'));

  $$('.revoke-trusted-device', content).forEach(button => button.addEventListener('click', async () => {
    const deviceId = button.dataset.deviceId || '';
    if (!deviceId || !confirm('Revoke this trusted browser?')) return;
    try {
      const result = await api(`/api/me/security/trusted-device/${encodeURIComponent(deviceId)}`, { method:'DELETE' });
      if (result.currentDeviceRevoked) {
        await window.P2PFlowDeviceAuth?.forget?.();
        window.location.replace('/login');
        return;
      }
      notify(result.message || 'Trusted browser revoked.', 'ok');
      await renderSecurity();
    } catch (err) { notify(err.message || 'Could not revoke trusted browser.', 'danger'); }
  }));

  const fallbackForm = $('#securityFallbackForm');
  if (fallbackForm) fallbackForm.onsubmit = async event => {
    event.preventDefault();
    const obj = Object.fromEntries(new FormData(fallbackForm));
    obj.currentSecretCode = String(obj.currentSecretCode || '').replace(/\D/g, '').slice(0, 6);
    obj.clearSecurityFallback = fallbackForm.clearSecurityFallback.checked;
    if (obj.currentSecretCode.length !== 6) return setFormMessage('#securityFallbackMessage', 'Enter your current 6 digit secret.', 'danger');
    if (!obj.clearSecurityFallback && String(obj.securityQuestion || '').trim().length < 8) return setFormMessage('#securityFallbackMessage', 'Security Question must be at least 8 characters.', 'danger');
    if (!obj.clearSecurityFallback && !data.securityFallbackConfigured && String(obj.securityAnswer || '').trim().length < 8) return setFormMessage('#securityFallbackMessage', 'Security Answer must be at least 8 characters.', 'danger');
    try {
      const result = await api('/api/me/security/fallback', { method:'PATCH', body:JSON.stringify(obj) });
      setFormMessage('#securityFallbackMessage', result.message || 'Security Question fallback updated.', 'ok');
      notify(result.message || 'Security Question fallback updated.', 'ok');
      setTimeout(() => renderSecurity(), 350);
    } catch (err) { setFormMessage('#securityFallbackMessage', err.message || 'Security Question update failed.', 'danger'); }
  };

  const recoveryForm = $('#securityEmailRecoveryForm');
  let recoveryOtpActive = false;
  let recoveryMode = 'email';
  const setSecurityRecoveryMode = mode => {
    recoveryMode = mode === 'hosting' ? 'hosting' : 'email';
    const input = recoveryForm?.elements?.recoveryOtp;
    const label = $('#securityRecoveryCodeLabel');
    if (!input) return;
    if (recoveryMode === 'hosting') {
      input.inputMode = 'text'; input.maxLength = 24; input.pattern = '[A-Za-z0-9_-]{8,24}';
      if (label) label.textContent = 'Hosting Recovery Code';
    } else {
      input.inputMode = 'numeric'; input.maxLength = 6; input.pattern = '[0-9]{6}';
      if (label) label.textContent = 'New Email OTP';
    }
  };
  if (recoveryForm) recoveryForm.onsubmit = async event => {
    event.preventDefault();
    const obj = Object.fromEntries(new FormData(recoveryForm));
    obj.secretCode = String(obj.secretCode || '').replace(/\D/g, '').slice(0, 6);
    obj.recoveryOtp = recoveryMode === 'hosting' ? String(obj.recoveryOtp || '').trim().toUpperCase().slice(0, 24) : String(obj.recoveryOtp || '').replace(/\D/g, '').slice(0, 6);
    obj.recoveryMode = recoveryMode;
    try {
      const device = await window.P2PFlowDeviceAuth?.ensure?.();
      if (device) obj.deviceEnrollment = { deviceId:device.deviceId, name:device.name, publicKeyJwk:device.publicKeyJwk };
    } catch {}
    if (obj.secretCode.length !== 6) return setFormMessage('#securityRecoveryMessage', 'Enter your current 6 digit secret.', 'danger');
    if (recoveryOtpActive) {
      const valid = recoveryMode === 'hosting' ? /^[A-Z0-9_-]{8,24}$/i.test(obj.recoveryOtp) : /^\d{6}$/.test(obj.recoveryOtp);
      if (!valid) return setFormMessage('#securityRecoveryMessage', recoveryMode === 'hosting' ? 'Enter the Hosting Recovery Code generated by the Hosting Terminal command.' : 'Enter the 6 digit OTP sent to the new email.', 'danger');
    }
    try {
      const result = await api('/api/login/recover-email', { method:'POST', body:JSON.stringify(obj) });
      if (result.recoveryOtpRequired) {
        recoveryOtpActive = true;
        setSecurityRecoveryMode(result.recoveryMode || 'email');
        recoveryForm.elements.recoveryId.value = result.recoveryId || '';
        $('#securityRecoveryOtpWrap')?.classList.remove('hidden');
        $('#securityRecoveryBtn').textContent = recoveryMode === 'hosting' ? 'Confirm with Hosting Code' : 'Confirm Correct Email';
        setFormMessage('#securityRecoveryMessage', result.message || 'Verification is required.', 'warn');
        recoveryForm.elements.recoveryOtp?.focus();
        return;
      }
      setFormMessage('#securityRecoveryMessage', result.message || 'Email corrected.', 'ok');
      if (result.recoveredAndSignedIn) {
        setTimeout(() => window.location.replace('/#/security'), 400);
        return;
      }
      await window.P2PFlowDeviceAuth?.forget?.();
      setTimeout(() => window.location.replace('/login'), 500);
    } catch (err) { setFormMessage('#securityRecoveryMessage', err.message || 'Email recovery failed.', 'danger'); }
  };

  const form = $('#securityForm');
  if (form) form.onsubmit = async event => {
    event.preventDefault();
    const obj = Object.fromEntries(new FormData(form));
    if (obj.newPassword && String(obj.newPassword).length < 12) return setFormMessage('#securityMessage', 'New password must be at least 12 characters.', 'danger');
    if (obj.newPassword && obj.newPassword !== obj.confirmPassword) return setFormMessage('#securityMessage', 'New password and confirm password do not match.', 'danger');
    if (obj.secretCode && !/^\d{6}$/.test(obj.secretCode)) return setFormMessage('#securityMessage', 'Secret code must be exactly 6 digits.', 'danger');
    delete obj.confirmPassword;
    try {
      const result = await api('/api/me/security', { method:'PATCH', body:JSON.stringify(obj) });
      if (result.securityVerificationRequired) return setFormMessage('#securityMessage', result.message || 'Enter the verification OTP and submit again.', 'warn');
      setFormMessage('#securityMessage', result.message || 'Security settings updated.', 'ok');
      if (result.fullLoginRequired) {
        await window.P2PFlowDeviceAuth?.forget?.();
        setTimeout(() => window.location.replace('/login'), 500);
        return;
      }
      notify('Security settings updated.', 'ok');
    } catch (err) { setFormMessage('#securityMessage', err.message || 'Security update failed.', 'danger'); }
  };
  applyLanguage(content);
}
