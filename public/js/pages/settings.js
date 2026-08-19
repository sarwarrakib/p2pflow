// P2PFlow v1.5.29
// Settings workspace: categorized navigation, compact email delivery and ordered failover routes.

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
  yandex:{host:'smtp.yandex.com',port:465,security:'starttls'},
  sendgrid:{host:'smtp.sendgrid.net',port:587,security:'starttls'},
  mailgun:{host:'smtp.mailgun.org',port:587,security:'starttls'},
  brevo:{host:'smtp-relay.brevo.com',port:587,security:'starttls'}
};

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
  const autoFund = profile.autoFundPassword === true;
  const fundConfigured = profile.fundPasswordConfigured === true;
  const name = profile.credentialName || profile.p2pUsername || `Binance Account ${credentialId}`;
  return `<article class="settings-release-profile" data-release-profile="${credentialId}">
    <div class="settings-release-profile-head">
      <div><b>${escapeHtml(name)}</b><small>API #${credentialId}${profile.disabled ? ' · Disabled' : ''}</small></div>
      <div>${badge(method === 'AUTO' ? 'Auto' : method, method === 'AUTO' ? 'muted' : 'ok')} ${fundConfigured ? badge('Fund password saved','ok') : badge('No fund password','muted')}</div>
    </div>
    <div class="settings-field-grid settings-release-grid">
      <div><label>Binance verification</label><select data-release-field="binanceMethod">${p2pflowReleaseMethodOptions(method)}</select></div>
      <div class="settings-inline-check settings-release-local-toggle"><label class="check"><input type="checkbox" data-release-field="localVerificationEnabled" ${localEnabled?'checked':''}/> Require P2PFlow verification before Release</label></div>
      <div><label>Primary P2PFlow verification</label><select data-release-field="localPrimary">${p2pflowLocalReleaseMethodOptions(profile.localPrimary || 'USER_PASSWORD')}</select></div>
      <div><label>Secondary P2PFlow verification</label><select data-release-field="localSecondary">${p2pflowLocalReleaseMethodOptions(profile.localSecondary || 'NONE', { allowNone:true })}</select></div>
    </div>
    <div class="settings-release-fund-box" data-release-fund-box>
      <div class="settings-option-row compact"><span><b>Automatic Fund Transfer Password</b><small>After the configured P2PFlow verification succeeds, the saved password is applied server-side. It is never returned to the browser.</small></span><input type="checkbox" data-release-field="autoFundPassword" ${autoFund?'checked':''}/></div>
      <div class="settings-field-grid">
        <div><label>Fund Transfer Password</label><input data-release-field="fundPassword" type="password" value="" placeholder="${fundConfigured ? 'Saved — leave blank to keep' : 'Enter fund transfer password'}" autocomplete="new-password" ${canManageFundPassword?'':'disabled'} /></div>
        <div class="settings-inline-check"><label class="check"><input type="checkbox" data-release-field="clearFundPassword" ${canManageFundPassword?'':'disabled'} /> Clear saved password</label></div>
      </div>
      ${canManageFundPassword ? '' : '<div class="settings-route-help">You can change verification preferences, but credentials.manage permission is required to save or clear the Fund Transfer Password.</div>'}
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

function p2pflowMailSystemOptions(selected = 'auto') {
  return P2PFLOW_EMAIL_SYSTEMS.map(([value,label]) => `<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('');
}

function p2pflowMailRouteStatus(route = {}, { primary = false } = {}) {
  const system = route.mailSendingSystem || 'auto';
  const systemLabel = route.mailSendingSystemLabel || (P2PFLOW_EMAIL_SYSTEMS.find(item => item[0] === system)?.[1] || system);
  const smtpSystem = !['auto','php','sendmail'].includes(system);
  if (!primary && route.enabled !== true) return badge('Off','muted');
  if (!smtpSystem) return badge(systemLabel,'ok');
  if (route.smtpConfigured) return badge('Ready','ok');
  const missing = Array.isArray(route.smtpMissingFields) && route.smtpMissingFields.length ? `: ${route.smtpMissingFields.join(', ')}` : '';
  return badge(`Needs setup${missing}`,'warn');
}

function p2pflowFallbackRouteHtml(route = {}, slot = 1) {
  const system = route.mailSendingSystem || 'auto';
  const security = route.smtpSecure ? 'ssl' : (route.smtpStarttls ? 'starttls' : 'none');
  const shouldOpen = route.enabled === true && !route.smtpConfigured && !['auto','php','sendmail'].includes(system);
  return `
    <article class="settings-mail-route" data-mail-route="fallback-${slot}">
      <div class="settings-mail-route-head">
        <div class="settings-mail-route-title">
          <span class="settings-route-index">${slot}</span>
          <div><b>Backup ${slot}</b><small>Used only if every earlier route cannot deliver.</small></div>
        </div>
        <div class="settings-mail-route-head-actions">
          ${p2pflowMailRouteStatus(route)}
          <label class="settings-switch" title="Enable backup route ${slot}"><input type="checkbox" name="fallback${slot}Enabled" ${route.enabled===true?'checked':''}/><span></span></label>
        </div>
      </div>
      <div class="settings-mail-route-quick">
        <div><label>Provider</label><select name="fallback${slot}System" id="fallback${slot}System">${p2pflowMailSystemOptions(system)}</select></div>
        <div><label>From Email</label><input name="fallback${slot}MailFrom" type="email" value="${escapeAttr(route.mailFrom || '')}" placeholder="optional" autocomplete="email" /></div>
        <button type="button" class="secondary settings-route-test" id="settingsTestFallback${slot}Btn">Test</button>
      </div>
      <details class="settings-route-details" ${shouldOpen ? 'open' : ''}>
        <summary>Connection & sender details</summary>
        <div class="settings-field-grid settings-route-detail-grid">
          <div><label>From Name</label><input name="fallback${slot}MailFromName" value="${escapeAttr(route.mailFromName || '')}" placeholder="P2PFlow" /></div>
          <div><label>Reply-To Email</label><input name="fallback${slot}MailReplyTo" type="email" value="${escapeAttr(route.mailReplyTo || '')}" placeholder="optional" /></div>
          <div><label>Envelope From</label><input name="fallback${slot}MailEnvelopeFrom" type="email" value="${escapeAttr(route.mailEnvelopeFrom || '')}" placeholder="optional" /></div>
          <div><label>SMTP Host</label><input name="fallback${slot}SmtpHost" value="${escapeAttr(route.smtpHost || '')}" placeholder="smtp.example.com" autocomplete="off" /></div>
          <div><label>SMTP Port</label><input name="fallback${slot}SmtpPort" type="number" min="1" max="65535" value="${Number(route.smtpPort || 587)}" /></div>
          <div><label>Encryption</label><select name="fallback${slot}SmtpSecurity">
            <option value="ssl" ${security==='ssl'?'selected':''}>SSL/TLS · 465</option>
            <option value="starttls" ${security==='starttls'?'selected':''}>STARTTLS · 587</option>
            <option value="none" ${security==='none'?'selected':''}>None</option>
          </select></div>
          <div><label>SMTP Username</label><input name="fallback${slot}SmtpUser" value="${escapeAttr(route.smtpUser || '')}" autocomplete="username" /></div>
          <div><label>SMTP Password / App Password</label><input name="fallback${slot}SmtpPassword" type="password" value="" placeholder="${route.smtpPasswordConfigured ? 'Saved — leave blank to keep' : 'Enter SMTP password'}" autocomplete="new-password" /></div>
          <div><label>SMTP HELO Domain</label><input name="fallback${slot}SmtpHelo" value="${escapeAttr(route.smtpHelo || 'localhost')}" placeholder="your-domain.com" /></div>
          <div class="settings-inline-check"><label class="check"><input type="checkbox" name="fallback${slot}ClearSmtpPassword" /> Clear saved password</label></div>
        </div>
      </details>
    </article>`;
}

function p2pflowSettingsPanel(id, title, description, content) {
  return `<section class="settings-panel" data-settings-panel="${id}">
    <div class="settings-panel-head"><div><h2>${title}</h2><p>${description}</p></div></div>
    <div class="settings-panel-body">${content}</div>
  </section>`;
}

function p2pflowActivateSettingsSection(section) {
  const desired = String(section || 'general');
  const buttons = [...document.querySelectorAll('[data-settings-section]')];
  const panels = [...document.querySelectorAll('[data-settings-panel]')];
  const exists = panels.some(panel => panel.dataset.settingsPanel === desired);
  const active = exists ? desired : 'general';
  buttons.forEach(button => {
    const selected = button.dataset.settingsSection === active;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
  panels.forEach(panel => panel.classList.toggle('active', panel.dataset.settingsPanel === active));
  try { localStorage.setItem('p2pflow.settings.section', active); } catch (_) {}
}

async function renderSettings() {
  setTitle('Settings');
  const data = await api('/api/settings');
  const s = data.settings;
  const mailSystem = s.mailSendingSystem || 'auto';
  const smtpSecurity = s.smtpSecure ? 'ssl' : (s.smtpStarttls ? 'starttls' : 'none');
  const selectedSystemLabel = s.mailSendingSystemLabel || (P2PFLOW_EMAIL_SYSTEMS.find(item => item[0] === mailSystem)?.[1] || mailSystem);
  const fallbackRoutes = Array.isArray(s.mailFallbackRoutes) ? s.mailFallbackRoutes : [];
  const fallbackRoutesHtml = Array.from({ length: P2PFLOW_MAX_MAIL_FALLBACKS }, (_, index) => p2pflowFallbackRouteHtml(fallbackRoutes[index] || {}, index + 1)).join('');
  const enabledBackups = Number(s.mailFailoverEnabledCount || 0);
  const primaryStatus = p2pflowMailRouteStatus(s, { primary:true });
  const releaseVerificationProfiles = Array.isArray(data.releaseVerificationProfiles) ? data.releaseVerificationProfiles : [];
  const canManageFundPassword = data.canManageFundPassword === true;

  const generalPanel = p2pflowSettingsPanel('general', 'General', 'Core business rules and final-action controls.', `
    <div class="settings-field-grid">
      <div><label>Mismatch Tolerance</label><input name="mismatchTolerance" type="number" value="${s.mismatchTolerance}" /></div>
      <div><label>High Amount Approval Threshold</label><input name="highAmountApprovalThreshold" type="number" value="${s.highAmountApprovalThreshold}" /></div>
      <div><label>Active Lock Seconds</label><input name="activeLockSeconds" type="number" value="${s.activeLockSeconds}" /></div>
      <div><label>Max Proof Size Bytes</label><input name="maxProofSizeBytes" type="number" value="${s.maxProofSizeBytes}" /></div>
      <div><label>API Mode</label><select name="apiMode"><option value="live-disabled" ${s.apiMode==='live-disabled'?'selected':''}>Live disabled</option><option value="live" ${s.apiMode==='live'?'selected':''}>Live</option></select></div>
    </div>
    <div class="settings-option-list">
      <label class="settings-option-row"><span><b>Require Payment Split before Mark Paid / Release</b><small>ON: the split workflow opens first and a completed split is required. OFF: Mark Paid / Release runs directly, whether a split exists or not.</small></span><input type="checkbox" name="requirePaymentSplitForFinalAction" ${s.requirePaymentSplitForFinalAction!==false?'checked':''}/></label>
      <div class="settings-option-row"><span><b>Payment Split Proof</b><small>Choose whether a proof screenshot is mandatory before completing a split-gated final action.</small></span><select name="paymentSplitProofRequired" aria-label="Payment Split Proof requirement"><option value="mandatory" ${s.paymentSplitProofRequired!==false?'selected':''}>Mandatory</option><option value="optional" ${s.paymentSplitProofRequired===false?'selected':''}>Optional</option></select></div>
      <label class="settings-option-row"><span><b>Allow lead user final action</b><small>Lead users can complete the permitted final action.</small></span><input type="checkbox" name="allowAgentFinalAction" ${s.allowAgentFinalAction?'checked':''}/></label>
    </div>`);

  const binancePanel = p2pflowSettingsPanel('binance', 'Binance & Sync', 'Balances, automatic order import and server-side reconciliation.', `
    <div class="settings-callout ok"><b>Server-side reconciliation is always working</b><span>Open Binance order details keep refreshing even when nobody is logged in.</span></div>
    <div class="settings-field-grid">
      <div><label>Binance USDT Available</label><input name="binanceUsdtAvailable" type="number" step="0.00000001" value="${s.binanceUsdtAvailable || 0}" /></div>
      <div><label>Default USDT Rate</label><input name="defaultUsdtRate" type="number" step="0.01" value="${s.defaultUsdtRate || 0}" /></div>
      <div><label>Auto-sync Seconds</label><input name="binanceAutoSyncSeconds" type="number" min="15" max="300" value="${s.binanceAutoSyncSeconds || 15}" /></div>
      <div><label>Auto-sync Rows</label><input name="binanceAutoSyncRows" type="number" min="5" max="100" value="${s.binanceAutoSyncRows || 30}" /></div>
      <div><label>Open-order Detail Rows</label><input name="binanceOpenOrderDetailRows" type="number" min="5" max="100" value="${s.binanceOpenOrderDetailRows || 100}" /></div>
    </div>
    <div class="settings-option-list">
      <label class="settings-option-row"><span><b>Auto import Binance orders</b><small>Periodically imports the latest orders in the background.</small></span><input type="checkbox" name="binanceAutoOrderSync" ${s.binanceAutoOrderSync!==false?'checked':''}/></label>
    </div>`);

  const releaseVerificationPanel = p2pflowSettingsPanel('release-verification', 'Release Verification', 'Choose the preferred Binance release verification per API account and optionally add a P2PFlow step-up gate.', `
    <div class="settings-callout warn"><b>Binance still decides whether a verification method is accepted.</b><span>The selected method controls which documented field P2PFlow shows and sends. Binance Auto keeps the existing behavior and follows the verification requirement returned by Binance. FIDO2 is exposed as the documented API auth type; this package does not invent an undocumented browser fingerprint assertion flow. Voice/phone-call verification is not a selectable authType in the supplied C2C SAPI v7.4, so use Binance Auto for any unlisted server-side challenge.</span></div>
    <div class="settings-callout"><b>Primary + Secondary P2PFlow verification</b><span>Choose User Password, 6-digit Secret Code or Email OTP. If Primary fails, the operator can click Change Verification System and complete the configured Secondary method.</span></div>
    <div class="settings-release-profile-list">
      ${releaseVerificationProfiles.length ? releaseVerificationProfiles.map(profile => p2pflowReleaseVerificationProfileHtml(profile, canManageFundPassword)).join('') : '<div class="notice">Add a Binance API Credential first. Release verification preferences are stored per Binance account.</div>'}
    </div>`);

  const securityPanel = p2pflowSettingsPanel('security', 'Login & Security', 'Keep the normal login path simple and define recovery behavior here.', `
    <div class="settings-option-list">
      <label class="settings-option-row"><span><b>Email OTP at login</b><small>Send an email OTP during full login.</small></span><input type="checkbox" name="requireEmailOtp" ${s.requireEmailOtp!==false?'checked':''}/></label>
      <label class="settings-option-row"><span><b>6-digit Secret Code</b><small>Require the existing security PIN during login.</small></span><input type="checkbox" name="requireLoginSecretCode" ${s.requireLoginSecretCode!==false?'checked':''}/></label>
      <label class="settings-option-row"><span><b>Security Question fallback</b><small>Only used when Login OTP cannot be sent and the user has configured a question and hashed answer.</small></span><input type="checkbox" name="loginSecurityQuestionFallbackEnabled" ${s.loginSecurityQuestionFallbackEnabled!==false?'checked':''}/></label>
    </div>
    <div class="settings-callout"><b>Trusted browser behavior</b><span>A recognized trusted browser can use its device key + 6-digit secret without sending an OTP. Use Full Login when you specifically want to test email OTP.</span></div>`);

  const emailPanel = p2pflowSettingsPanel('email', 'Email Delivery', 'One primary route with compact automatic backups. Expand only the route you need to edit.', `
    <div class="settings-email-summary">
      <div><span>Primary</span><b>${escapeHtml(selectedSystemLabel)}</b><small>${primaryStatus}</small></div>
      <div><span>Backups</span><b>${enabledBackups} / ${P2PFLOW_MAX_MAIL_FALLBACKS}</b><small>${enabledBackups ? 'Automatic failover active' : 'Primary only'}</small></div>
      <div><span>SMTP verified</span><b>${escapeHtml(s.smtpLastVerifiedAt ? fmt(s.smtpLastVerifiedAt) : 'Not yet')}</b><small>Login OTP: ${escapeHtml(s.loginOtpRouteLastVerifiedAt ? fmt(s.loginOtpRouteLastVerifiedAt) : 'not verified')}</small></div>
    </div>

    <div class="settings-mail-chain" aria-label="Email delivery order">
      <span class="primary">Primary</span><i>→</i><span>Backup 1</span><i>→</i><span>Backup 2</span><i>→</i><span>Backup 3</span>
    </div>

    <article class="settings-mail-route primary" data-mail-route="primary">
      <div class="settings-mail-route-head">
        <div class="settings-mail-route-title"><span class="settings-route-index">P</span><div><b>Primary route</b><small>Always tried first for every site email.</small></div></div>
        <div class="settings-mail-route-head-actions">${primaryStatus}</div>
      </div>
      <div class="settings-mail-route-quick primary-quick">
        <div><label>Provider</label><select name="mailSendingSystem" id="mailSendingSystemSelect">${p2pflowMailSystemOptions(mailSystem)}</select></div>
        <div><label>From Email</label><input name="mailFrom" type="email" value="${escapeAttr(s.mailFrom || '')}" placeholder="no-reply@your-domain.com" autocomplete="email" /></div>
      </div>
      <details class="settings-route-details" ${!s.smtpConfigured && !['auto','php','sendmail'].includes(mailSystem) ? 'open' : ''}>
        <summary>Connection & sender details</summary>
        <div class="settings-field-grid settings-route-detail-grid">
          <div><label>From Name</label><input name="mailFromName" value="${escapeAttr(s.mailFromName || 'P2PFlow')}" /></div>
          <div><label>Reply-To Email</label><input name="mailReplyTo" type="email" value="${escapeAttr(s.mailReplyTo || '')}" placeholder="optional" /></div>
          <div><label>SMTP Host</label><input name="smtpHost" value="${escapeAttr(s.smtpHost || '')}" placeholder="smtp.example.com" autocomplete="off" /></div>
          <div><label>SMTP Port</label><input name="smtpPort" type="number" min="1" max="65535" value="${Number(s.smtpPort || 587)}" /></div>
          <div><label>Encryption</label><select name="smtpSecurity">
            <option value="ssl" ${smtpSecurity==='ssl'?'selected':''}>SSL/TLS · 465</option>
            <option value="starttls" ${smtpSecurity==='starttls'?'selected':''}>STARTTLS · 587</option>
            <option value="none" ${smtpSecurity==='none'?'selected':''}>None</option>
          </select></div>
          <div><label>SMTP Username</label><input name="smtpUser" value="${escapeAttr(s.smtpUser || '')}" autocomplete="username" /></div>
          <div><label>SMTP Password / App Password</label><input name="smtpPassword" type="password" value="" placeholder="${s.smtpPasswordConfigured ? 'Saved — leave blank to keep' : 'Enter SMTP password'}" autocomplete="new-password" /></div>
          <div><label>SMTP HELO Domain</label><input name="smtpHelo" value="${escapeAttr(s.smtpHelo || 'localhost')}" placeholder="your-domain.com" /></div>
          <div class="settings-inline-check"><label class="check"><input type="checkbox" name="clearSmtpPassword" /> Clear saved SMTP password</label></div>
        </div>
        <div class="settings-route-help">Popular providers automatically preset host, port and encryption. Passwords remain stored encrypted.</div>
      </details>
    </article>

    <div class="settings-subsection-head"><div><b>Automatic backups</b><span>Only the compact route row is shown. Open Connection details when you actually need to edit it.</span></div>${badge(`${enabledBackups} enabled`, enabledBackups ? 'ok' : 'muted')}</div>
    <div class="settings-mail-route-list">${fallbackRoutesHtml}</div>
    <details class="settings-route-details settings-failover-safety"><summary>Failover safety</summary><div class="settings-route-help">Recipient rejection is not retried on another provider. An ambiguous disconnect after SMTP DATA is not retried to avoid duplicate emails.</div></details>

    <div class="settings-mail-test-card">
      <div class="settings-subsection-head"><div><b>Test delivery</b><span>Use one recipient to test the real chain without hunting through the page.</span></div></div>
      <div class="settings-test-row">
        <div><label>Mail Test Recipient</label><input id="settingsMailTestRecipient" name="mailTestRecipient" type="email" value="" placeholder="optional — defaults to your login email" autocomplete="email" /></div>
        <div class="actions"><button type="button" class="secondary" id="settingsTestMailBtn">Test Full Chain</button><button type="button" class="secondary" id="settingsTestLoginOtpBtn">Test Login OTP</button></div>
      </div>
      <details class="settings-route-details settings-low-level-tests"><summary>Low-level mail tests</summary><div class="actions"><button type="button" class="secondary" id="settingsTestSmtpBtn">Test SMTP directly</button><button type="button" class="secondary" id="settingsTestLocalMailBtn">Test local PHP/sendmail</button></div></details>
      <div id="settingsMailResult"></div>
    </div>`);

  const notificationsPanel = p2pflowSettingsPanel('notifications', 'Notifications', 'Choose which emails are automatic and configure the browser alert sound.', `
    <div class="settings-option-list">
      <label class="settings-option-row"><span><b>Notification-center email</b><small>Email notification-center alerts.</small></span><input type="checkbox" name="sendNotificationEmail" ${s.sendNotificationEmail!==false?'checked':''}/></label>
      <label class="settings-option-row"><span><b>Order email</b><small>Order assignment and attention emails.</small></span><input type="checkbox" name="sendOrderEmail" ${s.sendOrderEmail!==false?'checked':''}/></label>
      <label class="settings-option-row"><span><b>Security change email</b><small>Send alerts when security settings change.</small></span><input type="checkbox" name="sendSecurityChangeEmail" ${s.sendSecurityChangeEmail!==false?'checked':''}/></label>
      <label class="settings-option-row"><span><b>Failed-login email</b><small>Send security alerts for failed login attempts.</small></span><input type="checkbox" name="sendLoginFailureEmail" ${s.sendLoginFailureEmail!==false?'checked':''}/></label>
    </div>
    ${typeof notificationSoundSettingsHtml === 'function' ? notificationSoundSettingsHtml() : ''}`);

  const activityPanel = p2pflowSettingsPanel('activity', 'Presence & Activity', 'Tune online, away, idle and retention timing without mixing it with email or security.', `
    <div class="settings-callout ok"><b>Dynamic presence is automatic</b><span>Active means visible and recently used; away means background; idle means open without recent interaction.</span></div>
    <div class="settings-field-grid">
      <div><label>Activity Heartbeat Seconds</label><input name="activityHeartbeatSeconds" type="number" min="5" max="60" value="${s.activityHeartbeatSeconds || 15}" /></div>
      <div><label>Mark Idle After Seconds</label><input name="activityIdleAfterSeconds" type="number" min="30" max="3600" value="${s.activityIdleAfterSeconds || 60}" /></div>
      <div><label>Mark Offline After Seconds</label><input name="activityOfflineAfterSeconds" type="number" min="20" max="600" value="${s.activityOfflineAfterSeconds || 45}" /></div>
      <div><label>Activity Retention Days</label><input name="activityRetentionDays" type="number" min="30" max="1095" value="${s.activityRetentionDays || 180}" /></div>
    </div>`);

  $('#content').innerHTML = `<div class="settings-workspace">
    <div class="settings-hero">
      <div><span class="settings-eyebrow">Control center</span><h2>Settings</h2><p>Everything is grouped by purpose. Open one section, change what you need, save once.</p></div>
      <div class="settings-hero-status"><span>${primaryStatus}</span><small>${enabledBackups ? `${enabledBackups} mail backup${enabledBackups === 1 ? '' : 's'} ready` : 'Primary mail route only'}</small></div>
    </div>
    <div class="settings-layout">
      <aside class="settings-nav" role="tablist" aria-label="Settings sections">
        <button type="button" data-settings-section="general"><span>General</span><small>Rules & actions</small></button>
        <button type="button" data-settings-section="binance"><span>Binance & Sync</span><small>Orders & balance</small></button>
        <button type="button" data-settings-section="release-verification"><span>Release Verification</span><small>Binance + step-up</small></button>
        <button type="button" data-settings-section="security"><span>Login & Security</span><small>OTP & recovery</small></button>
        <button type="button" data-settings-section="email"><span>Email Delivery</span><small>Primary & backups</small></button>
        <button type="button" data-settings-section="notifications"><span>Notifications</span><small>Email & sound</small></button>
        <button type="button" data-settings-section="activity"><span>Presence & Activity</span><small>Online timing</small></button>
      </aside>
      <form id="settingsForm" class="settings-form">
        <div class="settings-panel-stack">${generalPanel}${binancePanel}${releaseVerificationPanel}${securityPanel}${emailPanel}${notificationsPanel}${activityPanel}</div>
        <div class="settings-savebar"><div><b>Unsaved changes stay on this screen</b><span>Save once after editing any section.</span></div><button type="submit">Save Settings</button></div>
      </form>
    </div>
    <div class="settings-footer-note">Live API actions require valid Binance credentials.</div>
  </div>`;

  [...document.querySelectorAll('[data-settings-section]')].forEach(button => {
    button.onclick = () => p2pflowActivateSettingsSection(button.dataset.settingsSection);
  });
  let initialSection = 'general';
  try { initialSection = localStorage.getItem('p2pflow.settings.section') || 'general'; } catch (_) {}
  p2pflowActivateSettingsSection(initialSection);
  document.querySelectorAll('[data-release-field="binanceMethod"]').forEach(select => { select.onchange = p2pflowRefreshReleaseVerificationCards; });
  p2pflowRefreshReleaseVerificationCards();

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
    obj.requirePaymentSplitForFinalAction = e.target.requirePaymentSplitForFinalAction.checked;
    obj.paymentSplitProofRequired = e.target.paymentSplitProofRequired.value === 'mandatory';
    obj.requireProofForFinalAction = obj.paymentSplitProofRequired;
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
    let releaseProfileValidationError = '';
    obj.binanceReleaseVerificationProfiles = [...document.querySelectorAll('[data-release-profile]')].map(card => {
      const get = name => card.querySelector(`[data-release-field="${name}"]`);
      const profile = {
        credentialId: Number(card.dataset.releaseProfile || 0),
        binanceMethod: get('binanceMethod')?.value || 'AUTO',
        localVerificationEnabled: get('localVerificationEnabled')?.checked === true,
        localPrimary: get('localPrimary')?.value || 'USER_PASSWORD',
        localSecondary: get('localSecondary')?.value || 'NONE',
        autoFundPassword: get('autoFundPassword')?.checked === true,
        fundPassword: get('fundPassword')?.value || '',
        clearFundPassword: get('clearFundPassword')?.checked === true
      };
      if (!releaseProfileValidationError && profile.localVerificationEnabled && profile.localPrimary === profile.localSecondary && profile.localSecondary !== 'NONE') releaseProfileValidationError = `Binance account #${profile.credentialId}: Primary and Secondary verification must be different.`;
      if (!releaseProfileValidationError && profile.autoFundPassword && profile.binanceMethod !== 'FUND_PWD') releaseProfileValidationError = `Binance account #${profile.credentialId}: Select Fund Transfer Password before enabling automatic password use.`;
      if (!releaseProfileValidationError && profile.autoFundPassword && !profile.localVerificationEnabled) releaseProfileValidationError = `Binance account #${profile.credentialId}: Enable P2PFlow verification before automatic Fund Transfer Password use.`;
      return profile;
    });
    if (releaseProfileValidationError) { notify(releaseProfileValidationError, 'danger'); return; }
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
      box.innerHTML = `<div class="error settings-mail-test-error"><b>${escapeHtml(data.error || err.message || 'Test email failed.')}</b>${stage ? `<br/><small>${escapeHtml(stage)}</small>` : ''}${detail ? `<br/><small>${escapeHtml(detail)}</small>` : ''}</div>`;
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
