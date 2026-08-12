// P2PFlow v1.5.11
// Page module: settings. Primary email system plus ordered automatic backup routes.

const P2PFLOW_EMAIL_SYSTEMS = [
  ['auto','Hosting Auto'],
  ['php','PHP mail'],
  ['sendmail','Sendmail'],
  ['gmail','Gmail'],
  ['outlook','Outlook / Microsoft'],
  ['yahoo','Yahoo'],
  ['zoho','Zoho'],
  ['icloud','iCloud'],
  ['aol','AOL'],
  ['fastmail','Fastmail'],
  ['gmx','GMX / Mail.com'],
  ['yandex','Yandex'],
  ['sendgrid','SendGrid'],
  ['mailgun','Mailgun'],
  ['brevo','Brevo'],
  ['smtp','Custom SMTP']
];
const P2PFLOW_MAX_MAIL_FALLBACKS = 3;
const P2PFLOW_SMTP_PRESETS = {
  gmail:{host:'smtp.gmail.com',port:587,security:'starttls'},
  outlook:{host:'smtp.office365.com',port:587,security:'starttls'},
  yahoo:{host:'smtp.mail.yahoo.com',port:465,security:'ssl'},
  zoho:{host:'smtp.zoho.com',port:465,security:'ssl'},
  icloud:{host:'smtp.mail.me.com',port:587,security:'starttls'},
  aol:{host:'smtp.aol.com',port:465,security:'ssl'},
  fastmail:{host:'smtp.fastmail.com',port:465,security:'ssl'},
  gmx:{host:'smtp.mail.com',port:587,security:'starttls'},
  yandex:{host:'smtp.yandex.com',port:465,security:'ssl'},
  sendgrid:{host:'smtp.sendgrid.net',port:587,security:'starttls'},
  mailgun:{host:'smtp.mailgun.org',port:587,security:'starttls'},
  brevo:{host:'smtp-relay.brevo.com',port:587,security:'starttls'}
};

function p2pflowMailSystemOptions(selected = 'auto') {
  return P2PFLOW_EMAIL_SYSTEMS.map(([value,label]) => `<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('');
}
function p2pflowFallbackRouteHtml(route = {}, slot = 1) {
  const system = route.mailSendingSystem || 'auto';
  const security = route.smtpSecure ? 'ssl' : (route.smtpStarttls ? 'starttls' : 'none');
  const systemLabel = route.mailSendingSystemLabel || (P2PFLOW_EMAIL_SYSTEMS.find(item => item[0] === system)?.[1] || system);
  const smtpSystem = !['auto','php','sendmail'].includes(system);
  const status = route.enabled === true
    ? (smtpSystem ? (route.smtpConfigured ? badge('Ready','ok') : badge(`Incomplete${Array.isArray(route.smtpMissingFields) && route.smtpMissingFields.length ? `: ${route.smtpMissingFields.join(', ')}` : ''}`,'warn')) : badge(systemLabel,'ok'))
    : badge('Disabled','muted');
  return `
    <div class="full-row settings-section-head"><div><b>Backup Email Route ${slot}</b><span>Used only when every earlier route fails with a provider, authentication, quota, sender, network or explicit delivery rejection.</span></div><span>${status}</span></div>
    <div><label class="check"><input type="checkbox" name="fallback${slot}Enabled" ${route.enabled===true?'checked':''}/> Enable backup route ${slot}</label></div>
    <div><label>Email System</label><select name="fallback${slot}System" id="fallback${slot}System">${p2pflowMailSystemOptions(system)}</select></div>
    <div><label>From Email</label><input name="fallback${slot}MailFrom" type="email" value="${escapeAttr(route.mailFrom || '')}" placeholder="optional — SMTP username can be used" autocomplete="email" /></div>
    <div><label>From Name</label><input name="fallback${slot}MailFromName" value="${escapeAttr(route.mailFromName || '')}" placeholder="P2PFlow" /></div>
    <div><label>Reply-To Email</label><input name="fallback${slot}MailReplyTo" type="email" value="${escapeAttr(route.mailReplyTo || '')}" placeholder="optional" /></div>
    <div><label>Envelope From</label><input name="fallback${slot}MailEnvelopeFrom" type="email" value="${escapeAttr(route.mailEnvelopeFrom || '')}" placeholder="optional" /></div>
    <div><label>SMTP Host</label><input name="fallback${slot}SmtpHost" value="${escapeAttr(route.smtpHost || '')}" placeholder="smtp.example.com" autocomplete="off" /></div>
    <div><label>SMTP Port</label><input name="fallback${slot}SmtpPort" type="number" min="1" max="65535" value="${Number(route.smtpPort || 587)}" /></div>
    <div><label>SMTP Encryption</label><select name="fallback${slot}SmtpSecurity">
      <option value="ssl" ${security==='ssl'?'selected':''}>SSL/TLS (usually port 465)</option>
      <option value="starttls" ${security==='starttls'?'selected':''}>STARTTLS (usually port 587)</option>
      <option value="none" ${security==='none'?'selected':''}>None</option>
    </select></div>
    <div><label>SMTP Username</label><input name="fallback${slot}SmtpUser" value="${escapeAttr(route.smtpUser || '')}" autocomplete="username" /></div>
    <div><label>SMTP Password / App Password</label><input name="fallback${slot}SmtpPassword" type="password" value="" placeholder="${route.smtpPasswordConfigured ? 'Saved — leave blank to keep' : 'Enter SMTP password'}" autocomplete="new-password" /></div>
    <div><label>SMTP HELO Domain</label><input name="fallback${slot}SmtpHelo" value="${escapeAttr(route.smtpHelo || 'localhost')}" placeholder="your-domain.com" /></div>
    <div><label class="check"><input type="checkbox" name="fallback${slot}ClearSmtpPassword" /> Clear saved backup password</label></div>
    <div class="full-row actions"><button type="button" class="secondary" id="settingsTestFallback${slot}Btn">Test Backup Route ${slot}</button></div>`;
}

async function renderSettings() {
  setTitle('Settings');
  const data = await api('/api/settings');
  const s = data.settings;
  const mailSystem = s.mailSendingSystem || 'auto';
  const smtpSecurity = s.smtpSecure ? 'ssl' : (s.smtpStarttls ? 'starttls' : 'none');
  const selectedSystemLabel = s.mailSendingSystemLabel || (P2PFLOW_EMAIL_SYSTEMS.find(item => item[0] === mailSystem)?.[1] || mailSystem);
  const smtpSystem = !['auto','php','sendmail'].includes(mailSystem);
  const fallbackRoutes = Array.isArray(s.mailFallbackRoutes) ? s.mailFallbackRoutes : [];
  const fallbackRoutesHtml = Array.from({ length: P2PFLOW_MAX_MAIL_FALLBACKS }, (_, index) => p2pflowFallbackRouteHtml(fallbackRoutes[index] || {}, index + 1)).join('');
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
    <div class="full-row"><label class="check"><input type="checkbox" name="loginSecurityQuestionFallbackEnabled" ${s.loginSecurityQuestionFallbackEnabled!==false?'checked':''}/> Enable Security Question fallback when Login OTP cannot be sent</label><div class="notice small">Fallback is available only for users who have configured a Security Question + hashed answer. Login then requires the correct answer and the user's existing 6 digit secret.</div></div>

    <div class="full-row settings-section-head"><div><b>Primary Email Sending System</b><span>This route is always tried first for Login OTP, recovery/security verification, order email, notification email and every other site email.</span></div><span>${smtpSystem ? (s.smtpConfigured ? badge('SMTP configured','ok') : badge(`SMTP incomplete${Array.isArray(s.smtpMissingFields) && s.smtpMissingFields.length ? `: ${s.smtpMissingFields.join(', ')}` : ''}`,'warn')) : badge(selectedSystemLabel,'ok')}</span></div>
    <div><label>Primary Email System</label><select name="mailSendingSystem" id="mailSendingSystemSelect">${p2pflowMailSystemOptions(mailSystem)}</select></div>
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
    <div><label>SMTP Password / App Password</label><input name="smtpPassword" type="password" value="" placeholder="${s.smtpPasswordConfigured ? 'Saved — leave blank to keep' : 'Enter SMTP password'}" autocomplete="new-password" /></div>
    <div><label>SMTP HELO Domain</label><input name="smtpHelo" value="${escapeAttr(s.smtpHelo || 'localhost')}" placeholder="your-domain.com" /></div>
    <div><label>Mail Test Recipient</label><input id="settingsMailTestRecipient" name="mailTestRecipient" type="email" value="" placeholder="optional — defaults to your login email" autocomplete="email" /></div>
    <div><label class="check"><input type="checkbox" name="clearSmtpPassword" /> Clear saved SMTP password</label></div>
    <div class="full-row"><div class="notice small">Selecting Gmail, Outlook/Microsoft, Yahoo, Zoho, iCloud, AOL, Fastmail, GMX/Mail.com, Yandex, SendGrid, Mailgun or Brevo automatically presets SMTP host, port and encryption. Credentials remain under your control. SMTP password is stored encrypted.</div></div>
    <div class="full-row"><div class="notice small"><b>SMTP last verified:</b> ${escapeHtml(s.smtpLastVerifiedAt ? fmt(s.smtpLastVerifiedAt) : 'not verified')} · <b>Login OTP route last verified:</b> ${escapeHtml(s.loginOtpRouteLastVerifiedAt ? fmt(s.loginOtpRouteLastVerifiedAt) : 'not verified')}</div></div>

    <div class="full-row settings-section-head"><div><b>Automatic Mail Failover</b><span>Primary is tried first, then each enabled backup route in order. Recipient rejection is not retried on another provider, and an ambiguous disconnect after SMTP DATA is not retried to avoid duplicate emails.</span></div><span>${badge(`${Number(s.mailFailoverEnabledCount || 0)} backup${Number(s.mailFailoverEnabledCount || 0) === 1 ? '' : 's'} enabled`, Number(s.mailFailoverEnabledCount || 0) ? 'ok' : 'muted')}</span></div>
    ${fallbackRoutesHtml}

    <div class="full-row settings-section-head"><div><b>Automated Email</b><span>These switches control security alerts, order mail and notification-center email delivery. Login OTP uses the same primary + backup failover chain above.</span></div></div>
    <div><label class="check"><input type="checkbox" name="sendNotificationEmail" ${s.sendNotificationEmail!==false?'checked':''}/> Email notification-center alerts</label></div>
    <div><label class="check"><input type="checkbox" name="sendOrderEmail" ${s.sendOrderEmail!==false?'checked':''}/> Order assignment / attention emails</label></div>
    <div><label class="check"><input type="checkbox" name="sendSecurityChangeEmail" ${s.sendSecurityChangeEmail!==false?'checked':''}/> Security change emails</label></div>
    <div><label class="check"><input type="checkbox" name="sendLoginFailureEmail" ${s.sendLoginFailureEmail!==false?'checked':''}/> Failed-login security emails</label></div>
    <div class="full-row"><div class="notice small"><b>Login OTP:</b> a recognized trusted browser intentionally uses its device key + 6-digit secret without sending an OTP; choose <b>Use full login</b> on the login page when you want to exercise the email OTP path.</div></div>

    ${typeof notificationSoundSettingsHtml === 'function' ? notificationSoundSettingsHtml() : ''}
    <div><label class="check"><input type="checkbox" name="requireProofForFinalAction" ${s.requireProofForFinalAction?'checked':''}/> Require proof for final action</label></div>
    <div><label class="check"><input type="checkbox" name="allowAgentFinalAction" ${s.allowAgentFinalAction?'checked':''}/> Allow lead user final action</label></div>
    <div class="full-row actions"><button type="submit">Save Settings</button><button type="button" class="secondary" id="settingsTestMailBtn">Test Full Mail Chain</button><button type="button" class="secondary" id="settingsTestLoginOtpBtn">Test Login OTP Failover</button><button type="button" class="secondary" id="settingsTestSmtpBtn">Test SMTP</button><button type="button" class="secondary" id="settingsTestLocalMailBtn">Test Local Mail</button></div>
  </form><div id="settingsMailResult"></div><div class="notice">Live API actions require valid Binance credentials.</div></div>`;

  const systemSelect = $('#mailSendingSystemSelect');
  if (systemSelect) systemSelect.onchange = () => {
    const preset = P2PFLOW_SMTP_PRESETS[systemSelect.value];
    if (!preset) return;
    const form = $('#settingsForm');
    form.smtpHost.value = preset.host;
    form.smtpPort.value = preset.port;
    form.smtpSecurity.value = preset.security;
  };

  for (let slot = 1; slot <= P2PFLOW_MAX_MAIL_FALLBACKS; slot += 1) {
    const select = $(`#fallback${slot}System`);
    if (!select) continue;
    select.onchange = () => {
      const preset = P2PFLOW_SMTP_PRESETS[select.value];
      if (!preset) return;
      const form = $('#settingsForm');
      form[`fallback${slot}SmtpHost`].value = preset.host;
      form[`fallback${slot}SmtpPort`].value = preset.port;
      form[`fallback${slot}SmtpSecurity`].value = preset.security;
    };
  }

  $('#settingsForm').onsubmit = async e => {
    e.preventDefault();
    const obj = formObj(e.target);
    obj.requireProofForFinalAction = e.target.requireProofForFinalAction.checked;
    obj.binanceAutoOrderSync = e.target.binanceAutoOrderSync.checked;
    obj.allowAgentFinalAction = e.target.allowAgentFinalAction.checked;
    obj.requireEmailOtp = e.target.requireEmailOtp.checked;
    obj.requireLoginSecretCode = e.target.requireLoginSecretCode.checked;
    obj.loginSecurityQuestionFallbackEnabled = e.target.loginSecurityQuestionFallbackEnabled.checked;
    obj.sendNotificationEmail = e.target.sendNotificationEmail.checked;
    obj.sendOrderEmail = e.target.sendOrderEmail.checked;
    obj.sendSecurityChangeEmail = e.target.sendSecurityChangeEmail.checked;
    obj.sendLoginFailureEmail = e.target.sendLoginFailureEmail.checked;
    obj.clearSmtpPassword = e.target.clearSmtpPassword.checked;
    obj.smtpSecure = e.target.smtpSecurity.value === 'ssl';
    obj.smtpStarttls = e.target.smtpSecurity.value === 'starttls';
    obj.mailFallbackRoutes = Array.from({ length: P2PFLOW_MAX_MAIL_FALLBACKS }, (_, index) => {
      const slot = index + 1;
      const security = e.target[`fallback${slot}SmtpSecurity`].value;
      const route = {
        enabled: e.target[`fallback${slot}Enabled`].checked,
        mailSendingSystem: e.target[`fallback${slot}System`].value,
        mailFrom: e.target[`fallback${slot}MailFrom`].value,
        mailFromName: e.target[`fallback${slot}MailFromName`].value,
        mailReplyTo: e.target[`fallback${slot}MailReplyTo`].value,
        mailEnvelopeFrom: e.target[`fallback${slot}MailEnvelopeFrom`].value,
        smtpHost: e.target[`fallback${slot}SmtpHost`].value,
        smtpPort: e.target[`fallback${slot}SmtpPort`].value,
        smtpSecure: security === 'ssl',
        smtpStarttls: security === 'starttls',
        smtpUser: e.target[`fallback${slot}SmtpUser`].value,
        smtpPassword: e.target[`fallback${slot}SmtpPassword`].value,
        smtpHelo: e.target[`fallback${slot}SmtpHelo`].value,
        clearSmtpPassword: e.target[`fallback${slot}ClearSmtpPassword`].checked
      };
      for (const suffix of ['Enabled','System','MailFrom','MailFromName','MailReplyTo','MailEnvelopeFrom','SmtpHost','SmtpPort','SmtpSecurity','SmtpUser','SmtpPassword','SmtpHelo','ClearSmtpPassword']) delete obj[`fallback${slot}${suffix}`];
      return route;
    });
    delete obj.smtpSecurity;
    delete obj.mailTestRecipient;
    await api('/api/settings', { method:'PATCH', body: JSON.stringify(obj) });
    notify('Settings saved securely.', 'ok');
    renderSettings();
  };

  const runMailTest = async (driver, label) => {
    const box = $('#settingsMailResult');
    box.innerHTML = `<div class="notice">${escapeHtml(label)}...</div>`;
    const email = String($('#settingsMailTestRecipient')?.value || '').trim();
    try {
      const r = await api('/api/health/mail-test', { method:'POST', body: JSON.stringify({ driver, ...(email ? { email } : {}) }) });
      const delivered = r.systemLabel || r.system || r.driver || '';
      const failover = r.failoverUsed ? `<br/><small>Failover used — delivered via ${escapeHtml(delivered)}${r.routeRole ? ` (${escapeHtml(r.routeRole)})` : ''}</small>` : (delivered ? `<br/><small>Delivered via ${escapeHtml(delivered)}</small>` : '');
      const failedRoutes = Array.isArray(r.failedRoutes) && r.failedRoutes.length ? `<br/><small>Earlier failed routes: ${escapeHtml(r.failedRoutes.map(item => `${item.routeRole || ''}:${item.system || ''}:${item.code || ''}`).join(' | '))}</small>` : '';
      box.innerHTML = `<div class="okbox">${escapeHtml(r.message || 'Test email accepted.')}${r.to ? `<br/><small>Recipient: ${escapeHtml(r.to)}</small>` : ''}${failover}${failedRoutes}</div>`;
    } catch (err) {
      const data = err?.data || {};
      const stage = data.smtpStage ? `SMTP stage: ${data.smtpStage}${data.smtpCode ? ` · code ${data.smtpCode}` : ''}` : '';
      const detail = data.detail ? String(data.detail) : '';
      box.innerHTML = `<div class="error"><b>${escapeHtml(data.error || err.message || 'Test email failed.')}</b>${stage ? `<br/><small>${escapeHtml(stage)}</small>` : ''}${detail ? `<br/><small>${escapeHtml(detail)}</small>` : ''}</div>`;
    }
  };
  $('#settingsTestMailBtn').onclick = () => runMailTest('selected', 'Testing primary + automatic backup email routes');
  $('#settingsTestLoginOtpBtn').onclick = () => runMailTest('login-otp', 'Testing the exact primary + backup chain used by Login OTP');
  $('#settingsTestSmtpBtn').onclick = () => runMailTest('smtp', 'Testing authenticated SMTP directly');
  $('#settingsTestLocalMailBtn').onclick = () => runMailTest('local', 'Testing local PHP/sendmail without SMTP fallback');
  for (let slot = 1; slot <= P2PFLOW_MAX_MAIL_FALLBACKS; slot += 1) {
    const button = $(`#settingsTestFallback${slot}Btn`);
    if (button) button.onclick = () => runMailTest(`fallback-${slot}`, `Testing backup email route ${slot} directly`);
  }
  if (typeof bindNotificationSoundSettings === 'function') bindNotificationSoundSettings();
}
