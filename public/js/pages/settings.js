// P2PFlow v1.0.108
// Page module: settings. Mail credentials are saved inside the encrypted database.

async function renderSettings() {
  setTitle('Settings');
  const data = await api('/api/settings');
  const s = data.settings;
  const smtpSecurity = s.smtpSecure ? 'ssl' : (s.smtpStarttls ? 'starttls' : 'none');
  $('#content').innerHTML = `<div class="card"><form id="settingsForm" class="form-grid">
    <div><label>Mismatch Tolerance</label><input name="mismatchTolerance" type="number" value="${s.mismatchTolerance}" /></div>
    <div><label>High Amount Approval Threshold</label><input name="highAmountApprovalThreshold" type="number" value="${s.highAmountApprovalThreshold}" /></div>
    <div><label>Active Lock Seconds</label><input name="activeLockSeconds" type="number" value="${s.activeLockSeconds}" /></div>
    <div><label>Max Proof Size Bytes</label><input name="maxProofSizeBytes" type="number" value="${s.maxProofSizeBytes}" /></div>
    <div><label>API Mode</label><select name="apiMode"><option value="live-disabled" ${s.apiMode==='live-disabled'?'selected':''}>live-disabled</option><option value="live" ${s.apiMode==='live'?'selected':''}>live</option></select></div>
    <div><label>Binance USDT Available (SELL capacity)</label><input name="binanceUsdtAvailable" type="number" step="0.00000001" value="${s.binanceUsdtAvailable || 0}" /></div>
    <div><label>Default USDT Rate (fallback)</label><input name="defaultUsdtRate" type="number" step="0.01" value="${s.defaultUsdtRate || 0}" /></div>
    <div><label class="check"><input type="checkbox" name="binanceAutoOrderSync" ${s.binanceAutoOrderSync!==false?'checked':''}/> Auto import Binance orders periodically</label></div>
    <div><label>Auto-sync Seconds</label><input name="binanceAutoSyncSeconds" type="number" min="15" max="300" value="${s.binanceAutoSyncSeconds || 15}" /></div>
    <div><label>Auto-sync Rows</label><input name="binanceAutoSyncRows" type="number" min="5" max="100" value="${s.binanceAutoSyncRows || 30}" /></div>
    <div><label>Open-order Detail Rows</label><input name="binanceOpenOrderDetailRows" type="number" min="5" max="100" value="${s.binanceOpenOrderDetailRows || 100}" /></div>
    <div class="full-row"><div class="okbox"><b>Server-side real-time order reconciliation</b><br/>The server refreshes every open Binance order detail even when no user is logged in. List and detail views receive the result through live events.</div></div>
    <div class="full-row"><div class="okbox"><b>Dynamic presence & activity</b><br/>Online state is automatic. Active means visible, focused and recently used; away means the page is in the background; idle means open without recent interaction.</div></div>
    <div><label>Activity Heartbeat Seconds</label><input name="activityHeartbeatSeconds" type="number" min="5" max="60" value="${s.activityHeartbeatSeconds || 15}" /></div>
    <div><label>Mark Idle After Seconds</label><input name="activityIdleAfterSeconds" type="number" min="30" max="3600" value="${s.activityIdleAfterSeconds || 60}" /></div>
    <div><label>Mark Offline After Seconds</label><input name="activityOfflineAfterSeconds" type="number" min="20" max="600" value="${s.activityOfflineAfterSeconds || 45}" /></div>
    <div><label>Activity Retention Days</label><input name="activityRetentionDays" type="number" min="30" max="1095" value="${s.activityRetentionDays || 180}" /></div>
    <div><label class="check"><input type="checkbox" name="requireEmailOtp" ${s.requireEmailOtp!==false?'checked':''}/> Require email OTP at login</label></div>
    <div><label class="check"><input type="checkbox" name="requireLoginSecretCode" ${s.requireLoginSecretCode!==false?'checked':''}/> Require 6 digit secret code</label></div>

    <div class="full-row settings-section-head"><div><b>Email Delivery</b><span>Local mode uses hosting PHP/sendmail first. If the host blocks the sender quota, a complete authenticated SMTP configuration is required for immediate fallback.</span></div><span>${s.smtpConfigured ? badge('SMTP configured','ok') : badge(`SMTP incomplete${Array.isArray(s.smtpMissingFields) && s.smtpMissingFields.length ? `: ${s.smtpMissingFields.join(', ')}` : ''}`,'warn')}</span></div>
    <div><label>Delivery Mode</label><select name="mailDriver">
      <option value="local" ${(s.mailDriver||'local')==='local'?'selected':''}>Local first + SMTP fallback</option>
      <option value="smtp" ${s.mailDriver==='smtp'?'selected':''}>SMTP only</option>
      <option value="php" ${s.mailDriver==='php'?'selected':''}>PHP mail only</option>
      <option value="sendmail" ${s.mailDriver==='sendmail'?'selected':''}>Sendmail only</option>
    </select></div>
    <div><label>From Email</label><input name="mailFrom" type="email" value="${escapeAttr(s.mailFrom || '')}" placeholder="no-reply@your-domain.com" autocomplete="email" /></div>
    <div><label>From Name</label><input name="mailFromName" value="${escapeAttr(s.mailFromName || 'P2PFlow')}" /></div>
    <div><label>Reply-To Email</label><input name="mailReplyTo" type="email" value="${escapeAttr(s.mailReplyTo || '')}" placeholder="optional" /></div>
    <div><label>SMTP Host</label><input name="smtpHost" value="${escapeAttr(s.smtpHost || '')}" placeholder="smtp.example.com" autocomplete="off" /></div>
    <div><label>SMTP Port</label><input name="smtpPort" type="number" min="1" max="65535" value="${Number(s.smtpPort || 587)}" /></div>
    <div><label>SMTP Encryption</label><select name="smtpSecurity">
      <option value="ssl" ${smtpSecurity==='ssl'?'selected':''}>SSL/TLS (usually port 465)</option>
      <option value="starttls" ${smtpSecurity==='starttls'?'selected':''}>STARTTLS (usually port 587)</option>
      <option value="none" ${smtpSecurity==='none'?'selected':''}>None</option>
    </select></div>
    <div><label>SMTP Username</label><input name="smtpUser" value="${escapeAttr(s.smtpUser || '')}" autocomplete="username" /></div>
    <div><label>SMTP Password</label><input name="smtpPassword" type="password" value="" placeholder="${s.smtpPasswordConfigured ? 'Saved — leave blank to keep' : 'Enter SMTP password'}" autocomplete="new-password" /></div>
    <div><label>SMTP HELO Domain</label><input name="smtpHelo" value="${escapeAttr(s.smtpHelo || 'localhost')}" placeholder="your-domain.com" /></div>
    <div><label class="check"><input type="checkbox" name="clearSmtpPassword" /> Clear saved SMTP password</label></div>
    <div class="full-row"><div class="notice small">SMTP password is stored encrypted.</div></div>
    <div class="full-row settings-section-head"><div><b>Automated Email</b><span>These switches control OTP-related security alerts, order mail and notification-center email delivery. Test Email does not depend on these switches.</span></div></div>
    <div><label class="check"><input type="checkbox" name="sendNotificationEmail" ${s.sendNotificationEmail!==false?'checked':''}/> Email notification-center alerts</label></div>
    <div><label class="check"><input type="checkbox" name="sendOrderEmail" ${s.sendOrderEmail!==false?'checked':''}/> Order assignment / attention emails</label></div>
    <div><label class="check"><input type="checkbox" name="sendSecurityChangeEmail" ${s.sendSecurityChangeEmail!==false?'checked':''}/> Security change emails</label></div>
    <div><label class="check"><input type="checkbox" name="sendLoginFailureEmail" ${s.sendLoginFailureEmail!==false?'checked':''}/> Failed-login security emails</label></div>
    <div class="full-row"><div class="notice small"><b>Login OTP:</b> the OTP switch above applies to full login. A recognized trusted browser intentionally uses its device key + 6-digit secret without sending an OTP; choose <b>Use full login</b> on the login page when you want the email OTP path.</div></div>

    ${typeof notificationSoundSettingsHtml === 'function' ? notificationSoundSettingsHtml() : ''}
    <div><label class="check"><input type="checkbox" name="requireProofForFinalAction" ${s.requireProofForFinalAction?'checked':''}/> Require proof for final action</label></div>
    <div><label class="check"><input type="checkbox" name="allowAgentFinalAction" ${s.allowAgentFinalAction?'checked':''}/> Allow lead user final action</label></div>
    <div class="full-row actions"><button type="submit">Save Settings</button><button type="button" class="secondary" id="settingsTestMailBtn">Test Active Mail</button><button type="button" class="secondary" id="settingsTestSmtpBtn">Test SMTP</button><button type="button" class="secondary" id="settingsTestLocalMailBtn">Test Local Mail</button></div>
  </form><div id="settingsMailResult"></div><div class="notice">Live API actions require valid Binance credentials.</div></div>`;

  $('#settingsForm').onsubmit = async e => {
    e.preventDefault();
    const obj = formObj(e.target);
    obj.requireProofForFinalAction = e.target.requireProofForFinalAction.checked;
    obj.binanceAutoOrderSync = e.target.binanceAutoOrderSync.checked;
    obj.allowAgentFinalAction = e.target.allowAgentFinalAction.checked;
    obj.requireEmailOtp = e.target.requireEmailOtp.checked;
    obj.requireLoginSecretCode = e.target.requireLoginSecretCode.checked;
    obj.sendNotificationEmail = e.target.sendNotificationEmail.checked;
    obj.sendOrderEmail = e.target.sendOrderEmail.checked;
    obj.sendSecurityChangeEmail = e.target.sendSecurityChangeEmail.checked;
    obj.sendLoginFailureEmail = e.target.sendLoginFailureEmail.checked;
    obj.clearSmtpPassword = e.target.clearSmtpPassword.checked;
    obj.smtpSecure = e.target.smtpSecurity.value === 'ssl';
    obj.smtpStarttls = e.target.smtpSecurity.value === 'starttls';
    delete obj.smtpSecurity;
    await api('/api/settings', { method:'PATCH', body: JSON.stringify(obj) });
    notify('Settings saved securely.', 'ok');
    renderSettings();
  };

  const runMailTest = async (driver, label) => {
    const box = $('#settingsMailResult');
    box.innerHTML = `<div class="notice">${escapeHtml(label)}...</div>`;
    try {
      const r = await api('/api/health/mail-test', { method:'POST', body: JSON.stringify({ driver }) });
      box.innerHTML = `<div class="okbox">${escapeHtml(r.message || 'Test email accepted.')}</div>`;
    } catch (err) {
      box.innerHTML = `<div class="error">${escapeHtml(err.message || 'Test email failed.')}</div>`;
    }
  };
  $('#settingsTestMailBtn').onclick = () => runMailTest('active', 'Testing the currently selected mail route');
  $('#settingsTestSmtpBtn').onclick = () => runMailTest('smtp', 'Testing authenticated SMTP directly');
  $('#settingsTestLocalMailBtn').onclick = () => runMailTest('local', 'Testing local PHP/sendmail without SMTP fallback');
  if (typeof bindNotificationSoundSettings === 'function') bindNotificationSoundSettings();
}
