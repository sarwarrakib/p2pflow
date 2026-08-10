// P2PFlow v1.4.15
// Dedicated account/login security page. Binance P2P Profile lives on #/p2p-profile.

function securityStatusPill(label, enabled) {
  return `<span class="security-status-pill ${enabled ? 'ok' : 'muted'}"><b>${enabled ? '✓' : '–'}</b>${escapeHtml(label)}</span>`;
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
        ${securityStatusPill('Email OTP', data.emailOtpRequired !== false)}
        ${securityStatusPill('6 Digit Secret', data.secretCodeRequired !== false && data.secretCodeSet)}
        ${securityStatusPill('Protected changes', data.securityVerificationRequired !== false)}
      </div>
      <div class="notice small">This page controls P2PFlow login security only. Binance account profile, merchant statistics, feedback and P2P account information are available from <b>P2P Profile</b>.</div>
      ${canPage('p2p-profile') ? '<button type="button" class="secondary security-profile-link" id="openP2pProfileBtn">Open P2P Profile</button>' : ''}
    </section>

    <section class="card security-change-card">
      <div class="section-head"><div><h2>Security Settings</h2><p>Changing email, password or the 6 digit secret requires your current password and email verification.</p></div></div>
      <form id="securityForm" class="form-grid">
        <div class="full-row"><label>Current Password</label><input name="currentPassword" type="password" autocomplete="current-password" required></div>
        <div><label>New Password</label><input name="newPassword" type="password" autocomplete="new-password" placeholder="optional, min 8 chars"></div>
        <div><label>Confirm New Password</label><input name="confirmPassword" type="password" autocomplete="new-password"></div>
        <div><label>Email</label><input name="email" type="email" value="${escapeAttr(data.email || '')}"></div>
        <div><label>New 6 Digit Secret Code</label><input name="secretCode" inputmode="numeric" maxlength="6" placeholder="optional"></div>
        <div><label>Security Verification OTP</label><input name="securityOtp" inputmode="numeric" maxlength="6" placeholder="sent after first submit"></div>
        <div class="full-row"><div class="notice small">Email verification is required for security changes. Revert protection window: ${escapeHtml(String(data.revertWindowHours || 24))} hours.</div></div>
        <div class="full-row" id="securityMessage"></div>
        <div class="full-row"><button type="submit">Update Security</button></div>
      </form>
    </section>
  </div>`;

  $('#openP2pProfileBtn')?.addEventListener('click', () => setRoute('p2p-profile'));
  const form = $('#securityForm');
  if (form) form.onsubmit = async event => {
    event.preventDefault();
    const obj = Object.fromEntries(new FormData(form));
    if (obj.newPassword && obj.newPassword !== obj.confirmPassword) {
      setFormMessage('#securityMessage', 'New password and confirm password do not match.', 'danger');
      return;
    }
    if (obj.secretCode && !/^\d{6}$/.test(obj.secretCode)) {
      setFormMessage('#securityMessage', 'Secret code must be exactly 6 digits.', 'danger');
      return;
    }
    delete obj.confirmPassword;
    try {
      const result = await api('/api/me/security', { method:'PATCH', body:JSON.stringify(obj) });
      if (result.securityVerificationRequired) {
        setFormMessage('#securityMessage', result.message || 'Enter the verification OTP and submit again.', 'warn');
        return;
      }
      setFormMessage('#securityMessage', result.message || 'Security settings updated.', 'ok');
      notify('Security settings updated.', 'ok');
    } catch (err) {
      setFormMessage('#securityMessage', err.message || 'Security update failed.', 'danger');
    }
  };
  applyLanguage(content);
}
