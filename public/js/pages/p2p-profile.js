// P2PFlow v1.4.8
// Dedicated Binance-style P2P Profile workspace. Login security is kept on the separate Security page.

function profileMetricValue(value, suffix = '') {
  return hasMetric(value) ? `${escapeHtml(value)}${suffix}` : '-';
}

function profileNumber(value) {
  if (!hasMetric(value)) return '-';
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : escapeHtml(value);
}

function profilePercent(value) {
  return hasMetric(value) ? pctDash(value) : '-';
}

function profileTimeLabel(value, rawLabel = '') {
  if (rawLabel) return escapeHtml(rawLabel);
  if (!hasMetric(value)) return '-';
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} m` : escapeHtml(value);
}

function profileBtcValue(value) {
  if (!hasMetric(value)) return '-';
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toLocaleString(undefined, { maximumFractionDigits: 8 })} BTC` : escapeHtml(value);
}


function cleanProfileSyncError(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/Binance did not return every owner trading statistic[^.]*\.?/gi, '').trim();
}
function profileCoreStatsMissing(stats = {}) {
  return [stats.thirtyDayTradeCount, stats.thirtyDayCompletionRate, stats.avgReleaseTimeMinutes30d, stats.avgPayTimeMinutes30d].some(value => !hasMetric(value));
}

function profileInitial(value = '') {
  return escapeHtml((String(value || 'P').trim().slice(0, 1) || 'P').toUpperCase());
}

function profileFeedbackTotals(profile = {}) {
  const stats = profile.stats || {};
  const positive = hasMetric(stats.positiveFeedback) ? Number(stats.positiveFeedback) : (profile.feedbackRows?.positive || []).length;
  const negative = hasMetric(stats.negativeFeedback) ? Number(stats.negativeFeedback) : (profile.feedbackRows?.negative || []).length;
  const total = hasMetric(stats.feedbackTotalCount) ? Number(stats.feedbackTotalCount) : positive + negative;
  const rate = hasMetric(stats.feedbackRate) ? Number(stats.feedbackRate) : (hasMetric(stats.positiveFeedbackRate) ? Number(stats.positiveFeedbackRate) : null);
  return { positive, negative, total, rate };
}

function profileIsMerchant(profile = {}) {
  const raw = String(profile.status || '').trim();
  return /bronze|silver|gold|diamond|pro\s*merchant|merchant/i.test(raw) || profile.stats?.verified === true;
}

function profileMerchantLabel(profile = {}) {
  const raw = String(profile.status || '').trim();
  if (/bronze|silver|gold|diamond|pro\s*merchant|merchant/i.test(raw)) return raw;
  if (profile.stats?.verified === true) return 'Verified Merchant';
  return 'P2P Account';
}

function profileMerchantBadge(profile = {}) {
  if (!profileIsMerchant(profile)) return '';
  const raw = String(profile.status || '').toLowerCase();
  const tone = /gold|diamond|pro/.test(raw) ? 'gold' : 'bronze';
  return `<span class="mobile-profile-merchant-badge ${tone}" title="Merchant verified">◆</span>`;
}

function profileCredentialSwitchHtml(result = {}) {
  const options = Array.isArray(result.credentials) ? result.credentials : [];
  const selectedId = Number(result.selectedCredentialId || 0);
  const selected = options.find(item => Number(item.id) === selectedId) || options[0] || null;
  if (!selected) return '<div class="mobile-profile-api-empty">No Binance API profile is assigned to this user.</div>';
  const menu = options.length > 1 ? `<div id="mobileProfileCredentialMenu" class="mobile-profile-api-menu hidden">${options.map(item => `<button type="button" data-mobile-profile-credential="${Number(item.id)}" class="${Number(item.id) === Number(selected.id) ? 'active' : ''}"><span>${escapeHtml(item.name || `API ${item.id}`)}</span><small>${escapeHtml(item.nickname || item.userNo || item.status || '')}</small></button>`).join('')}</div>` : '';
  return `<div class="mobile-profile-api-switch-wrap"><button type="button" id="mobileProfileCredentialSwitchBtn" class="mobile-profile-api-switch ${options.length === 1 ? 'single' : ''}" ${options.length === 1 ? 'disabled' : ''}><span>${escapeHtml(selected.name || `API ${selected.id}`)}</span>${options.length > 1 ? '<b>⌄</b>' : ''}</button>${menu}</div>`;
}

function profileIcon(name) {
  const icons = {
    back: '<svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7"/></svg>',
    share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.5M8.2 13.2l7.5 4.5"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="m4 16-.7 4.7L8 20l10.5-10.5-4-4L4 16Z"/><path d="m12.8 7.2 4 4M3 22h18"/></svg>',
    feedback: '<svg viewBox="0 0 24 24"><path d="M7 11v9H4v-9h3Zm4-7-4 7v9h9.6a2 2 0 0 0 1.9-1.4l2-6A2 2 0 0 0 18.6 10H14l.7-3.6A2 2 0 0 0 12.8 4H11Z"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
    payment: '<svg viewBox="0 0 24 24"><path d="M5 6h14v12H5zM8 10h8M8 14h5"/></svg>',
    blocked: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m5.5 18.5 13-13"/></svg>',
    viewed: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
    code: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.5M8.2 13.2l7.5 4.5"/></svg>',
    activities: '<svg viewBox="0 0 24 24"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>',
    help: '<svg viewBox="0 0 24 24"><path d="M5 3h14v18H5zM9.5 9a2.5 2.5 0 1 1 4.1 1.9c-1 .8-1.6 1.2-1.6 2.4M12 17h.01"/></svg>',
    add: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    merchant: '<svg viewBox="0 0 24 24"><path d="M5 3h14v18H5zM8 7h8M8 11h3M14 11h2M8 15h8"/></svg>',
    chevron: '<svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>'
  };
  return icons[name] || '';
}

function profileActionRow(id, icon, label, value = '') {
  return `<button type="button" class="mobile-profile-action-row" data-profile-action="${escapeAttr(id)}">
    <span class="mobile-profile-action-icon">${profileIcon(icon)}</span>
    <span class="mobile-profile-action-label">${escapeHtml(label)}</span>
    ${value !== '' ? `<span class="mobile-profile-action-value">${escapeHtml(value)}</span>` : ''}
    <span class="mobile-profile-action-chevron">${profileIcon('chevron')}</span>
  </button>`;
}

function profileBoolLabel(value, yes = 'Yes', no = 'No') {
  if (value === true) return yes;
  if (value === false) return no;
  return '-';
}

function profileBusinessStatus(value) {
  const n = Number(value);
  if (n === 1) return 'Open';
  if (n === 2) return 'Closed';
  if (n === 3) return 'On Break';
  return hasMetric(value) ? String(value) : '-';
}

function profileAccountChips(profile = {}) {
  const account = profile.account || {};
  const chips = [];
  const push = (label, tone = '') => chips.push(`<span class="mobile-profile-account-chip ${tone}">${escapeHtml(label)}</span>`);
  if (hasMetric(account.userKycStatus)) push(`KYC ${account.userKycStatus}`, account.kycPassed === true ? 'ok' : 'warn');
  else if (account.kycPassed === true) push('KYC Passed', 'ok');
  if (account.isUserMobile === true || account.bindMobileStatus) push(`Mobile ${account.bindMobileStatus || 'Verified'}`, account.isUserMobile === true ? 'ok' : '');
  if (account.isUserGoogle === true) push('Google 2FA', 'ok');
  if (hasMetric(account.businessStatus)) push(`Business ${profileBusinessStatus(account.businessStatus)}`, Number(account.businessStatus) === 1 ? 'ok' : 'warn');
  if (profile.stats?.online === true) push('Online', 'ok');
  else if (profile.stats?.online === false) push('Offline');
  return chips.length ? `<div class="mobile-profile-account-strip">${chips.join('')}</div>` : '';
}

function mobileProfileMainHtml(data = {}, result = {}) {
  const profile = result.profile || {};
  const stats = profile.stats || {};
  const totals = profileFeedbackTotals(profile);
  const nickname = profile.nickname || data.user?.name || data.user?.username || 'My P2P Account';
  const riskDeposit = String(stats.riskDepositMessage || '').trim();
  const following = profileNumber(stats.followingCount);
  const followers = profileNumber(stats.followersCount);
  const tab = state.mobileProfileTab === 'others' ? 'others' : 'trade';
  const verified = stats.verified === true;
  const coreStatsMissing = profileCoreStatsMissing(stats);
  const profileWarning = cleanProfileSyncError(profile.lastError || '');
  const tradeRows = [
    profileActionRow('feedback', 'feedback', 'Received Feedback', totals.total || '-'),
    profileActionRow('alerts', 'bell', 'Custom Alerts'),
    profileActionRow('payment-methods', 'payment', 'Payment Method(s)', profileNumber(stats.paymentMethodsCount)),
    profileActionRow('blocked', 'blocked', 'Blocked Users'),
    profileActionRow('recent', 'viewed', 'Recently Viewed'),
    profileActionRow('share-code', 'code', 'Ad Sharing Code')
  ].join('');
  const othersRows = [
    profileActionRow('activities', 'activities', 'Activities'),
    profileActionRow('help', 'help', 'P2P Help Center'),
    profileActionRow('add-home', 'add', 'Add P2P To Home Screen'),
    profileActionRow('merchant-portal', 'merchant', 'Merchant Portal')
  ].join('');
  return `<section class="mobile-profile-page">
    <header class="mobile-profile-hero">
      <div class="mobile-profile-hero-pattern"></div>
      <div class="mobile-profile-hero-actions">
        <button type="button" class="mobile-profile-icon-btn" id="mobileProfileBackBtn" aria-label="Back">${profileIcon('back')}</button>
        <div class="mobile-profile-hero-actions-right">
          <button type="button" class="mobile-profile-icon-btn" id="mobileProfileShareBtn" aria-label="Share profile">${profileIcon('share')}</button>
          <button type="button" class="mobile-profile-icon-btn" id="mobileProfileSettingsBtn" aria-label="Security settings">${profileIcon('settings')}</button>
        </div>
      </div>
    </header>
    <div class="mobile-profile-content">
      <div class="mobile-profile-avatar">${profileInitial(nickname)}</div>
      ${profileCredentialSwitchHtml(result)}
      <div class="mobile-profile-title-row"><h1>${escapeHtml(nickname)}</h1>${profileMerchantBadge(profile)}${result.canSync ? `<button type="button" id="mobileProfileEditBtn" class="mobile-profile-edit-btn" aria-label="Sync selected API owner profile">${profileIcon('edit')}</button>` : ''}</div>
      <div class="mobile-profile-merchant-row"><span>${profileMerchantBadge(profile)}</span><b>${escapeHtml(profileMerchantLabel(profile))}</b>${riskDeposit ? `<i></i><span>${escapeHtml(riskDeposit)}</span>` : ''}</div>
      <div class="mobile-profile-social-row">${verified ? '<b>✓ Verified</b>' : '<b>Verification unavailable</b>'}<i></i><span>${following} Following</span><span>${followers} Followers</span></div>
      ${profileAccountChips(profile)}
      ${result.message ? `<div class="mobile-profile-access-note">${escapeHtml(result.message)}</div>` : ''}
      ${profileWarning ? `<div class="mobile-profile-access-note warning">${escapeHtml(profileWarning)}</div>` : ''}
      <div class="mobile-profile-stat-card">
        <div><strong>${profileNumber(stats.thirtyDayTradeCount)}</strong><span>30d Trades</span></div>
        <div><strong>${profilePercent(stats.thirtyDayCompletionRate)}</strong><span>30d Completion Rate</span></div>
        <div><strong>${profileTimeLabel(stats.avgReleaseTimeMinutes30d, stats.avgReleaseTimeLabel)}</strong><span>Avg. Release Time</span></div>
        <div><strong>${profileTimeLabel(stats.avgPayTimeMinutes30d, stats.avgPayTimeLabel)}</strong><span>Avg. Pay Time</span></div>
        <button type="button" id="mobileProfileMoreBtn">More <span>⌄</span></button>
      </div>
      <div class="mobile-profile-tabs" role="tablist">
        <button type="button" data-mobile-profile-tab="trade" class="${tab === 'trade' ? 'active' : ''}">Trade</button>
        <button type="button" data-mobile-profile-tab="others" class="${tab === 'others' ? 'active' : ''}">Others</button>
      </div>
      <div class="mobile-profile-action-list">${tab === 'trade' ? tradeRows : othersRows}</div>
      <div class="mobile-profile-sync-note">${profile.syncedAt ? `Last synced ${escapeHtml(fmt(profile.syncedAt))}` : 'Profile has not been synced yet.'}</div>
    </div>
  </section>`;
}

function profileDetailRow(label, value, sub = '') {
  return `<div class="mobile-profile-detail-row"><span>${escapeHtml(label)}</span><div><strong>${escapeHtml(value)}</strong>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</div></div>`;
}

function mobileProfileDetailsHtml(data = {}, result = {}) {
  const profile = result.profile || {};
  const stats = profile.stats || {};
  const account = profile.account || {};
  const summary = profile.orderSummary || {};
  const nickname = profile.nickname || data.user?.name || data.user?.username || 'My P2P Account';
  const totals = profileFeedbackTotals(profile);
  const allTrades = hasMetric(stats.allTrades) ? stats.allTrades : stats.totalTradeCount;
  const registeredDays = hasMetric(stats.registeredDays) ? stats.registeredDays : (hasMetric(stats.registerDays) ? stats.registerDays : account.registerDays);
  const verificationText = Array.isArray(profile.verifications) && profile.verifications.length ? profile.verifications.join(', ') : '-';
  return `<section class="mobile-profile-subpage">
    <header class="mobile-profile-subpage-head"><button type="button" id="mobileProfileSubBackBtn" class="mobile-profile-icon-btn">${profileIcon('back')}</button><h1>${escapeHtml(nickname)}</h1><span></span></header>
    <div class="mobile-profile-detail-list">
      ${profileDetailRow('Nickname', nickname)}
      ${profile.userNo ? profileDetailRow('User No', profile.userNo) : ''}
      ${profile.merchantNo ? profileDetailRow('Merchant No', profile.merchantNo) : ''}
      ${profileDetailRow('Merchant / Account Status', profile.status || profileMerchantLabel(profile))}
      ${profileDetailRow('Business Status', profileBusinessStatus(account.businessStatus))}
      ${profileDetailRow('KYC Status', account.userKycStatus || profileBoolLabel(account.kycPassed, 'Passed', 'Not Passed'), account.kycTypeLabel || '')}
      ${account.kycFullName ? profileDetailRow('KYC Full Name', account.kycFullName) : ''}
      ${profileDetailRow('KYC Country', account.countryCode || '-')}
      ${profileDetailRow('Verifications', verificationText)}
      ${profileDetailRow('Mobile Verification', profileBoolLabel(account.isUserMobile), account.bindMobileStatus || '')}
      ${profileDetailRow('Google 2FA', profileBoolLabel(account.isUserGoogle))}
      ${profileDetailRow('P2P Agreement Confirmed', profileBoolLabel(account.fiatProtocolConfirm))}
      ${profileDetailRow('Sub Account', profileBoolLabel(account.isSubUser))}
      ${profileDetailRow('Nickname Configured', profileBoolLabel(account.existsNickname))}
      ${profileDetailRow('Complaint Limit Exceeded', hasMetric(account.overComplained) ? (Number(account.overComplained) === 1 ? 'Yes' : 'No') : '-')}
      ${profileDetailRow('30d Trades', hasMetric(stats.thirtyDayTradeCount) ? `${profileNumber(stats.thirtyDayTradeCount)} Time(s)` : '-')}
      ${profileDetailRow('30d Completion Rate', profilePercent(stats.thirtyDayCompletionRate))}
      ${profileDetailRow('Avg. Release Time', hasMetric(stats.avgReleaseTimeMinutes30d) ? `${profileNumber(stats.avgReleaseTimeMinutes30d)} Minute(s)` : (stats.avgReleaseTimeLabel || '-'))}
      ${profileDetailRow('Avg. Pay Time', hasMetric(stats.avgPayTimeMinutes30d) ? `${profileNumber(stats.avgPayTimeMinutes30d)} Minute(s)` : (stats.avgPayTimeLabel || '-'))}
      ${profileDetailRow('Positive Feedback', totals.rate === null ? '-' : profilePercent(totals.rate))}
      ${profileDetailRow('Positive', profileNumber(totals.positive))}
      ${profileDetailRow('Negative', profileNumber(totals.negative))}
      ${profileDetailRow('Feedback Total', profileNumber(totals.total))}
      ${profileDetailRow('Registered', hasMetric(registeredDays) ? `${profileNumber(registeredDays)} Day(s) ago` : (profile.joinedOn || '-'))}
      ${profileDetailRow('First Trade', hasMetric(stats.firstTradeDays) ? `${profileNumber(stats.firstTradeDays)} Day(s) ago` : '-')}
      ${profileDetailRow('Trading Counterparties', profileNumber(stats.tradingCounterparties))}
      ${profileDetailRow('All Trades', hasMetric(allTrades) ? `${profileNumber(allTrades)} Time(s)` : '-', (hasMetric(stats.buyTrades) || hasMetric(stats.sellTrades)) ? `Buy ${profileNumber(stats.buyTrades)} | Sell ${profileNumber(stats.sellTrades)}` : '')}
      ${profileDetailRow('Approx. 30d Volume', profileBtcValue(stats.thirtyDayVolumeBtc), (hasMetric(stats.buyVolumeBtc30d) || hasMetric(stats.sellVolumeBtc30d)) ? `Buy ${profileBtcValue(stats.buyVolumeBtc30d)} | Sell ${profileBtcValue(stats.sellVolumeBtc30d)}` : '')}
      ${profileDetailRow('Approx. Total Volume', profileBtcValue(stats.totalVolumeBtc), (hasMetric(stats.buyVolumeBtc) || hasMetric(stats.sellVolumeBtc)) ? `Buy ${profileBtcValue(stats.buyVolumeBtc)} | Sell ${profileBtcValue(stats.sellVolumeBtc)}` : '')}
      ${profileDetailRow('Followers', profileNumber(stats.followersCount))}
      ${profileDetailRow('Following', profileNumber(stats.followingCount))}
      ${profileDetailRow('Advertisements', profileNumber(stats.adsCount))}
      ${profileDetailRow('Payment Methods', profileNumber(stats.paymentMethodsCount))}
      ${profileDetailRow('Paid Orders', profileNumber(summary.buyerPayedCount))}
      ${profileDetailRow('Trading Orders', profileNumber(summary.tradingCount))}
      ${profileDetailRow('In Process Orders', profileNumber(summary.inProcessCount))}
      ${profileDetailRow('Appeal Orders', profileNumber(summary.inAppealCount))}
      ${profileDetailRow('API Profile', profile.credentialName || '-')}
      ${profileDetailRow('Extension Status', profile.extensionStatus || (result.extensionEnabled ? 'Ready' : 'Disabled'))}
      ${profileDetailRow('Data Source', profile.source || '-')}
      ${profileDetailRow('Last Synced', profile.syncedAt ? fmt(profile.syncedAt) : '-')}
    </div>
  </section>`;
}

function mobileProfilePaymentMethodsHtml(data = {}, result = {}) {
  const profile = result.profile || {};
  const nickname = profile.nickname || data.user?.name || data.user?.username || 'My P2P Account';
  const rows = Array.isArray(profile.paymentMethods) ? profile.paymentMethods : [];
  const summary = profile.orderSummary || {};
  return `<section class="mobile-profile-subpage">
    <header class="mobile-profile-subpage-head"><button type="button" id="mobileProfileSubBackBtn" class="mobile-profile-icon-btn">${profileIcon('back')}</button><h1>Payment Method(s)</h1><span></span></header>
    <div class="mobile-profile-order-summary">
      <div><strong>${profileNumber(summary.buyerPayedCount)}</strong><span>Paid orders</span></div>
      <div><strong>${profileNumber(summary.tradingCount)}</strong><span>Trading</span></div>
      <div><strong>${profileNumber(summary.inProcessCount)}</strong><span>In process</span></div>
      <div><strong>${profileNumber(summary.inAppealCount)}</strong><span>Appeal</span></div>
    </div>
    <div class="mobile-profile-payment-list">${rows.length ? rows.map(row => `<div class="mobile-profile-payment-item"><b>${escapeHtml(row.tradeMethodName || row.tradeMethodShortName || row.payType || row.identifier || 'Payment Method')}</b>${row.payAccount ? `<span>${escapeHtml(row.payAccount)}</span>` : ''}${row.payBank ? `<small>${escapeHtml(row.payBank)}${row.paySubBank ? ` · ${escapeHtml(row.paySubBank)}` : ''}</small>` : ''}<small>${escapeHtml([row.identifier, row.payType].filter(Boolean).join(' · '))}</small></div>`).join('') : `<div class="mobile-profile-feedback-empty">No configured Binance P2P payment method was returned for ${escapeHtml(nickname)}.</div>`}</div>
  </section>`;
}

function profileFeedbackRow(row = {}, sentiment = 'positive') {
  const positive = sentiment === 'positive';
  const name = row.by || 'Anonymous User';
  const meta = [row.date, row.paymentMethod].filter(Boolean).join('  |  ');
  return `<article class="mobile-profile-feedback-row">
    <div class="mobile-profile-feedback-head"><span class="mobile-profile-feedback-avatar">${profileInitial(name)}</span><div><h3>${escapeHtml(name)}</h3>${meta ? `<p>${escapeHtml(meta)}</p>` : ''}</div><span class="mobile-profile-feedback-more">${profileIcon('more')}</span></div>
    <div class="mobile-profile-feedback-body"><span class="mobile-profile-feedback-vote ${positive ? 'positive' : 'negative'}">${positive ? '👍' : '👎'}</span>${row.lowVolume ? '<small>Low volume</small>' : ''}${row.text ? `<p>${escapeHtml(row.text)}</p>` : ''}</div>
  </article>`;
}

function mobileProfileFeedbackHtml(data = {}, result = {}) {
  const profile = result.profile || {};
  const stats = profile.stats || {};
  const totals = profileFeedbackTotals(profile);
  const nickname = profile.nickname || data.user?.name || data.user?.username || 'My P2P Account';
  const active = ['all', 'positive', 'negative'].includes(state.mobileProfileFeedbackTab) ? state.mobileProfileFeedbackTab : 'all';
  const positiveRows = (profile.feedbackRows?.positive || []).map(row => ({ ...row, _sentiment: 'positive' }));
  const negativeRows = (profile.feedbackRows?.negative || []).map(row => ({ ...row, _sentiment: 'negative' }));
  let rows = active === 'positive' ? positiveRows : active === 'negative' ? negativeRows : [...positiveRows, ...negativeRows].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const rate = totals.rate === null ? '-' : profilePercent(totals.rate);
  return `<section class="mobile-profile-subpage feedback-page">
    <header class="mobile-profile-subpage-head"><button type="button" id="mobileProfileSubBackBtn" class="mobile-profile-icon-btn">${profileIcon('back')}</button><h1>${escapeHtml(nickname)}</h1><span></span></header>
    <div class="mobile-profile-feedback-summary"><span class="mobile-profile-feedback-avatar large">${profileInitial(nickname)}</span><b>👍 ${rate}</b></div>
    <div class="mobile-profile-feedback-tabs">
      <button type="button" data-mobile-feedback-tab="all" class="${active === 'all' ? 'active' : ''}">All</button>
      <button type="button" data-mobile-feedback-tab="positive" class="${active === 'positive' ? 'active' : ''}">Positive (${profileNumber(totals.positive)})</button>
      <button type="button" data-mobile-feedback-tab="negative" class="${active === 'negative' ? 'active' : ''}">Negative (${profileNumber(totals.negative)})</button>
    </div>
    <div class="mobile-profile-feedback-list">${rows.length ? rows.map(row => profileFeedbackRow(row, row._sentiment)).join('') : '<div class="mobile-profile-feedback-empty">No feedback has been collected in this category.</div>'}</div>
  </section>`;
}

async function renderP2PProfile() {
  setTitle('P2P Profile');
  state.mobileProfileView = state.mobileProfileView || 'main';
  state.mobileProfileTab = state.mobileProfileTab || 'trade';
  state.mobileProfileFeedbackTab = state.mobileProfileFeedbackTab || 'all';
  const selectedQuery = Number(state.mobileProfileCredentialId || 0) ? `?credentialId=${Number(state.mobileProfileCredentialId)}` : '';
  const data = { user: state.user || {} };
  let p2pResult = await api(`/api/me/p2p-profile${selectedQuery}`).catch(err => ({ forbidden: true, error: err.message || 'P2P profile access is not enabled for this role.', profile: {}, credentials: [] }));
  if (p2pResult.selectedCredentialId) state.mobileProfileCredentialId = Number(p2pResult.selectedCredentialId);

  const render = () => {
    const content = $('#content');
    if (!content) return;
    if (state.mobileProfileView === 'details') content.innerHTML = mobileProfileDetailsHtml(data, p2pResult);
    else if (state.mobileProfileView === 'payments') content.innerHTML = mobileProfilePaymentMethodsHtml(data, p2pResult);
    else if (state.mobileProfileView === 'feedback') content.innerHTML = mobileProfileFeedbackHtml(data, p2pResult);
    else content.innerHTML = mobileProfileMainHtml(data, p2pResult);
    bindProfileActions();
    applyLanguage(content);
  };

  const loadCredentialProfile = async credentialId => {
    const id = Number(credentialId || 0);
    if (!id) return;
    const out = await api(`/api/me/p2p-profile?credentialId=${id}`);
    p2pResult = out;
    state.mobileProfileCredentialId = Number(out.selectedCredentialId || id);
    state.mobileProfileView = 'main';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const selectedSyncAt = Date.parse(out?.profile?.syncedAt || '') || 0;
    const selectedMissingCoreStats = profileCoreStatsMissing(out?.profile?.stats || {});
    if (out.canSync && out.credentialAvailable && (selectedMissingCoreStats || !selectedSyncAt || Date.now() - selectedSyncAt > 10 * 60 * 1000)) {
      setTimeout(() => syncProfile().catch(err => notify(err.message || 'P2P profile sync failed.', 'warn', 5000)), 120);
    }
  };

  const syncProfile = async () => {
    const credentialId = Number(p2pResult.selectedCredentialId || state.mobileProfileCredentialId || 0);
    if (!credentialId) throw new Error('No permitted Binance API profile is available.');
    const out = await api('/api/me/p2p-profile', { method: 'POST', body: JSON.stringify({ credentialId }) });
    p2pResult = out;
    state.mobileProfileCredentialId = Number(out.selectedCredentialId || credentialId);
    notify(out.queuedExtension ? 'API owner profile synced. Detailed feedback collection was queued in the Chrome extension.' : 'API owner P2P profile synced.', 'ok', 4500);
    render();
  };


  const showUnavailable = label => modal(label, `<div class="notice">${escapeHtml(label)} is shown in the profile interface, but the current connected Binance documented data does not expose this section in the panel yet.</div>`);

  const bindProfileActions = () => {
    $('#mobileProfileBackBtn')?.addEventListener('click', () => setRoute(canPage('p2p-market') ? 'p2p-market' : visiblePages()[0]?.[0]));
    $('#mobileProfileSubBackBtn')?.addEventListener('click', () => { state.mobileProfileView = 'main'; render(); });
    $('#mobileProfileMoreBtn')?.addEventListener('click', () => { state.mobileProfileView = 'details'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    $('#mobileProfileSettingsBtn')?.addEventListener('click', () => { if (canPage('security')) setRoute('security'); else notify('Security page is not available for this role.', 'warn'); });
    $('#mobileProfileEditBtn')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.classList.add('syncing');
      try { await syncProfile(); }
      catch (err) { notify(err.message || 'P2P profile sync failed.', 'danger', 6000); }
      finally { if (button?.isConnected) { button.disabled = false; button.classList.remove('syncing'); } }
    });
    $('#mobileProfileCredentialSwitchBtn')?.addEventListener('click', () => $('#mobileProfileCredentialMenu')?.classList.toggle('hidden'));
    $$('[data-mobile-profile-credential]').forEach(button => button.onclick = async () => {
      try { await loadCredentialProfile(button.dataset.mobileProfileCredential); }
      catch (err) { notify(err.message || 'Could not switch P2P API profile.', 'danger', 5000); }
    });
    $('#mobileProfileShareBtn')?.addEventListener('click', async () => {
      const profile = p2pResult.profile || {};
      const shareData = { title: profile.nickname || 'P2P Profile', text: `${profile.nickname || 'P2P Profile'}${profile.userNo ? ` · User No ${profile.userNo}` : ''}`, url: p2pResult.advertiserUrl || location.href };
      try {
        if (navigator.share) await navigator.share(shareData);
        else if (navigator.clipboard) { await navigator.clipboard.writeText(shareData.url); notify('Profile link copied.', 'ok'); }
        else showUnavailable('Share Profile');
      } catch (err) {
        if (err?.name !== 'AbortError') notify(err.message || 'Could not share profile.', 'warn');
      }
    });
    $$('[data-mobile-profile-tab]').forEach(button => button.onclick = () => { state.mobileProfileTab = button.dataset.mobileProfileTab; render(); });
    $$('[data-mobile-feedback-tab]').forEach(button => button.onclick = () => { state.mobileProfileFeedbackTab = button.dataset.mobileFeedbackTab; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    $$('[data-profile-action]').forEach(button => button.onclick = () => {
      const action = button.dataset.profileAction;
      if (action === 'feedback') { state.mobileProfileView = 'feedback'; state.mobileProfileFeedbackTab = 'all'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      if (action === 'alerts') { if (canPage('notifications')) setRoute('notifications'); else showUnavailable('Custom Alerts'); return; }
      if (action === 'payment-methods') { state.mobileProfileView = 'payments'; render(); window.scrollTo({ top:0, behavior:'smooth' }); return; }
      if (action === 'activities') { if (canPage('activity')) setRoute('activity'); else showUnavailable('Activities'); return; }
      if (action === 'merchant-portal') { if (canPage('ads')) setRoute('ads'); else showUnavailable('Merchant Portal'); return; }
      if (action === 'add-home') {
        modal('Add P2P To Home Screen', '<div class="notice">Open your browser menu and choose <b>Add to Home screen</b> or <b>Install app</b> to create a shortcut.</div>');
        return;
      }
      const labels = { blocked: 'Blocked Users', recent: 'Recently Viewed', 'share-code': 'Ad Sharing Code', help: 'P2P Help Center' };
      showUnavailable(labels[action] || 'Profile Section');
    });
  };

  render();

  const selectedCredentialId = Number(p2pResult.selectedCredentialId || 0);
  const lastSyncMs = Date.parse(p2pResult?.profile?.syncedAt || '') || 0;
  const missingCoreStats = profileCoreStatsMissing(p2pResult?.profile?.stats || {});
  const autoSyncDue = !p2pResult.forbidden && p2pResult.canSync && p2pResult.credentialAvailable && selectedCredentialId && (missingCoreStats || !lastSyncMs || Date.now() - lastSyncMs > 10 * 60 * 1000);
  state.ownP2pAutoSyncAtByCredential = state.ownP2pAutoSyncAtByCredential || {};
  const lastAutoAttempt = Number(state.ownP2pAutoSyncAtByCredential[selectedCredentialId] || 0);
  if (autoSyncDue && (!lastAutoAttempt || Date.now() - lastAutoAttempt > 10 * 60 * 1000)) {
    state.ownP2pAutoSyncAtByCredential[selectedCredentialId] = Date.now();
    setTimeout(() => syncProfile().catch(() => {}), 180);
  }
}

