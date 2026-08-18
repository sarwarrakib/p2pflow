// P2PFlow v1.5.23
// Restored FULL advertisement update payload with no-updateMode compatibility retry.

const ADS_COUNTRY_CODES = ["BD","US","GB","IN","PK","AE","SA","TR","NG","KE","GH","ZA","MY","SG","ID","PH","TH","VN","AU","CA","DE","FR","IT","ES","NL","BE","PT","JP","KR","CN","HK","TW","BR","MX","AR","CO","PE","CL","EG","MA","DZ","TN","QA","KW","BH","OM","LK","NP","AW","AF","AO","AI","AX","AL","AD","AM","AS","AQ","TF","AG","AT","AZ","BI","BJ","BQ","BF","BG","BS","BA","BL","BY","BZ","BM","BO","BB","BN","BT","BV","BW","CF","CC","CH","CI","CM","CD","CG","CK","KM","CV","CR","CU","CW","CX","KY","CY","CZ","DJ","DM","DK","DO","EC","ER","EH","EE","ET","FI","FJ","FK","FO","FM","GA","GE","GG","GI","GN","GP","GM","GW","GQ","GR","GD","GL","GT","GF","GU","GY","HM","HN","HR","HT","HU","IM","IO","IE","IR","IQ","IS","IL","JM","JE","JO","KZ","KG","KH","KI","KN","LA","LB","LR","LY","LC","LI","LS","LT","LU","LV","MO","MF","MC","MD","MG","MV","MH","MK","ML","MT","MM","ME","MN","MP","MZ","MR","MS","MQ","MU","MW","YT","NA","NC","NE","NF","NI","NU","NO","NR","NZ","PA","PN","PW","PG","PL","PR","KP","PY","PS","PF","RE","RO","RU","RW","SD","SN","GS","SH","SJ","SB","SL","SV","SM","SO","PM","RS","SS","ST","SR","SK","SI","SE","SZ","SX","SC","SY","TC","TD","TG","TJ","TK","TM","TL","TO","TT","TV","TZ","UG","UA","UM","UY","UZ","VA","VC","VE","VG","VI","VU","WF","WS","YE","ZM","ZW"];
const ADS_TAG_OPTIONS = [
  'Additional KYC required',
  'Personal account only',
  'Exact amount required',
  'No third-party payment',
  'Payment reference required',
  'Fast payment',
  'Verified users only'
];

function adNumber(value, digits = 2) {
  const n = Number(value || 0);
  return Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 8) })
    : '0.00';
}

function adInputNumber(value, maxDigits = 8) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const text = n.toFixed(maxDigits).replace(/\.?0+$/, '');
  return text || '0';
}

function adEditableAmount(ad = {}) {
  if (ad.editableAmount !== undefined && ad.editableAmount !== null) return Number(ad.editableAmount || 0);
  if (ad.surplusAmount !== undefined && ad.surplusAmount !== null) return Number(ad.surplusAmount || 0);
  return Number(ad.initAmount || 0);
}

function adStatusLabel(ad = {}) {
  const value = String(ad.status || '').toLowerCase();
  if (value === 'online') return 'Online';
  if (value === 'closed') return 'Closed';
  if (value === 'private') return 'Private';
  return 'Offline';
}

function adStatusBadgeClass(ad = {}) {
  const status = String(ad.status || '').toLowerCase();
  if (status === 'online') return 'ok';
  if (status === 'closed') return 'danger';
  if (status === 'private') return 'blue';
  return 'warn';
}

function adTradeMethodNames(ad = {}) {
  const methods = Array.isArray(ad.tradeMethods) ? ad.tradeMethods : [];
  return methods.map(m => m.tradeMethodName || m.name || m.identifier || m.payType).filter(Boolean);
}

function adsCredentialOptions(data = {}) {
  return Array.isArray(data.credentialOptions) ? data.credentialOptions : [];
}

function adsAccountHasPermission(option, permission) {
  return Boolean(option && !option.disabled && Array.isArray(option.permissions) && option.permissions.includes(permission));
}

function adsAccountDisplayName(value = {}) {
  return value.displayName || value.p2pUsername || value.nickname || value.binanceAccount?.displayName || value.binanceAccount?.p2pUsername || value.binanceAccount?.name || value.credentialDisplayName || value.credentialName || (value.id || value.credentialId ? `API ${value.id || value.credentialId}` : 'Unassigned account');
}

function adsPaymentMethodsForCredential(data = {}, credentialId = 0) {
  const id = Number(credentialId || 0);
  const scoped = id ? data.paymentMethodsByCredential?.[String(id)] : null;
  const methods = Array.isArray(scoped) ? scoped : (Array.isArray(data.paymentMethods) ? data.paymentMethods : []);
  return methods.filter(method => method && method.enabled !== false && method.availableForCredential !== false);
}

function adsPaymentDataForCredential(data = {}, credentialId = 0) {
  return { ...data, paymentMethods: adsPaymentMethodsForCredential(data, credentialId) };
}

function adsAccountSwitcherHtml(options = [], selectedId = 0) {
  return `<div class="binance-account-switcher ads-account-switcher" role="tablist" aria-label="Binance P2P accounts">
    <button type="button" class="binance-account-tab ${selectedId ? '' : 'active'}" data-ads-account="0" role="tab" aria-selected="${selectedId ? 'false' : 'true'}">All</button>
    ${options.map(option => `<button type="button" class="binance-account-tab ${Number(option.id) === Number(selectedId) ? 'active' : ''} ${option.disabled ? 'is-disabled' : ''}" data-ads-account="${Number(option.id)}" role="tab" aria-selected="${Number(option.id) === Number(selectedId) ? 'true' : 'false'}" title="${escapeAttr(option.accountName || option.name || `API ${option.id}`)}">${escapeHtml(adsAccountDisplayName(option))}</button>`).join('')}
  </div>`;
}

function adsMerchantControlsForCredential(data = {}, credentialId = 0) {
  const id = Number(credentialId || 0);
  if (!id) return data.merchantControls || {};
  return data.merchantControlsByCredential?.[String(id)]
    || (data.merchantControlTargets || []).find(target => Number(target.id) === id)?.merchantControls
    || {};
}

function adsAccountTarget(data = {}, credentialId = 0) {
  const id = Number(credentialId || 0);
  return (data.merchantControlTargets || []).find(target => Number(target.id) === id)
    || adsCredentialOptions(data).find(option => Number(option.id) === id)
    || null;
}

function adsCapabilityForAdvertisement(ad = {}, data = {}) {
  const option = adsAccountTarget(data, ad.credentialId);
  const controls = adsMerchantControlsForCredential(data, ad.credentialId);
  const canManage = adsAccountHasPermission(option, 'ads.manage') && option?.canManage !== false && option?.configured !== false;
  return {
    canManage,
    breakMode: controls.break?.enabled === true,
    businessClosed: controls.mode?.id === 'business_closed',
    reason: canManage ? '' : 'Ads Manage permission is not assigned for this account.'
  };
}

function adsSelectedAccount(data = {}) {
  const selectedId = Number(state.adsCredentialId || data.selectedCredentialId || 0);
  return adsCredentialOptions(data).find(option => Number(option.id) === selectedId) || null;
}

function adsPageUrl(extra = {}) {
  const params = new URLSearchParams();
  const credentialId = Number(state.adsCredentialId || 0);
  if (credentialId) params.set('credentialId', String(credentialId));
  Object.entries(extra || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false || value === '') return;
    params.set(key, value === true ? '1' : String(value));
  });
  const query = params.toString();
  return `/api/ads${query ? `?${query}` : ''}`;
}

function adCardHtml(ad = {}, capability = {}) {
  const online = String(ad.status || '').toLowerCase() === 'online';
  const methods = adTradeMethodNames(ad);
  const canManage = !!capability.canManage && String(ad.status || '').toLowerCase() !== 'closed';
  const controlsAvailable = canManage && !capability.breakMode;
  const canToggle = controlsAvailable;
  const totalAmount = Number(ad.surplusAmount ?? ad.initAmount ?? 0);
  const type = String(ad.tradeType || 'BUY').toUpperCase();
  const pricePrefix = String(ad.fiatUnit || 'BDT').toUpperCase() === 'BDT' ? 'Tk.' : `${escapeHtml(ad.fiatUnit || '')} `;
  return `<article class="crm-ad-card" data-ad-card="${Number(ad.id || 0)}">
    <div class="crm-ad-card-head">
      <div><div class="crm-ad-title"><span class="${type === 'BUY' ? 'buy' : 'sell'}">${escapeHtml(type === 'BUY' ? 'Buy' : 'Sell')}</span> ${escapeHtml(ad.asset || 'USDT')} <small>With</small> ${escapeHtml(ad.fiatUnit || 'BDT')}</div><span class="binance-account-badge" title="${escapeAttr(ad.binanceAccount?.accountName || ad.credentialName || 'Binance P2P account')}">${escapeHtml(adsAccountDisplayName(ad))}</span></div>
      <div class="crm-ad-card-actions">
        ${badge(adStatusLabel(ad), adStatusBadgeClass(ad))}
        <label class="ad-toggle" title="${escapeAttr(canToggle ? (online ? 'Pause advertisement' : 'Activate advertisement') : (capability.breakMode && !online ? 'Turn Break off before activating advertisements.' : (capability.reason || 'Advertisement controls locked')))}">
          <input type="checkbox" data-ad-toggle="${Number(ad.id || 0)}" ${online ? 'checked' : ''} ${canToggle ? '' : 'disabled'} />
          <span></span>
        </label>
        <button class="ad-more-btn" type="button" data-edit-ad="${Number(ad.id || 0)}" ${controlsAvailable ? '' : 'disabled'} aria-label="Edit advertisement">⋮</button>
      </div>
    </div>
    <div class="crm-ad-price"><span>${pricePrefix}</span><b>${adNumber(ad.price, 2)}</b></div>
    <div class="crm-ad-summary">
      <div><span>Total amount</span><b>${adNumber(totalAmount, 2)} ${escapeHtml(ad.asset || 'USDT')}</b></div>
      <div><span>Limit</span><b>${Number(ad.minSingleTransAmount || 0).toLocaleString('en-US')} - ${Number(ad.maxSingleTransAmount || 0).toLocaleString('en-US')} ${escapeHtml(ad.fiatUnit || 'BDT')}</b></div>
    </div>
    <div class="crm-ad-methods">${methods.length ? methods.map(name => `<span><i></i>${escapeHtml(name)}</span>`).join('') : '<span class="muted">No payment method</span>'}</div>
    <div class="crm-ad-footer"><span>Ad No. ${escapeHtml(ad.advNo || 'Draft')}</span><span>${ad.lastSyncedAt ? `Synced ${escapeHtml(fmt(ad.lastSyncedAt))}` : `Updated ${escapeHtml(fmt(ad.updatedAt || ad.createdAt))}`}</span></div>
  </article>`;
}

function applyAdsFilters(items = []) {
  const filters = state.adsFilters || {};
  const search = String(filters.search || '').trim().toLowerCase();
  return items.filter(ad => {
    if (filters.asset && String(ad.asset || '').toUpperCase() !== String(filters.asset).toUpperCase()) return false;
    if (filters.fiat && String(ad.fiatUnit || '').toUpperCase() !== String(filters.fiat).toUpperCase()) return false;
    if (filters.tradeType && String(ad.tradeType || '').toUpperCase() !== String(filters.tradeType).toUpperCase()) return false;
    if (filters.status && String(ad.status || '').toLowerCase() !== String(filters.status).toLowerCase()) return false;
    if (search) {
      const haystack = [ad.advNo, ad.asset, ad.fiatUnit, ad.tradeType, ad.remarks, ...adTradeMethodNames(ad)].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function adsLiveStatus(data = {}) {
  if (!data.liveMode) return '<span class="ads-live-chip off"><i></i>Draft</span>';
  if (!data.credentialConfigured) return '<span class="ads-live-chip error"><i></i>API missing</span>';
  return '<span class="ads-live-chip"><i></i>Live</span>';
}

function adsMerchantControlStatus(control = {}, type = '') {
  if (control.mixed === true || control.status === 'mixed') return 'Mixed';
  if (control.enabled === null || control.enabled === undefined || control.status === 'unknown') return 'Unknown';
  if (type === 'online') return control.enabled ? 'Online' : 'Offline';
  if (type === 'break') return control.enabled ? 'On break' : 'Working';
  return control.enabled ? 'Open' : 'Closed';
}

function adsApiCreateReadinessNotice(data = {}) {
  if (!data.liveMode || !data.credentialConfigured) return '';
  const readiness = data.apiCreateReadiness || {};
  if (readiness.tradingStatus?.locked === true) {
    return '<div class="notice danger ads-api-readiness"><b>Binance API trading is locked</b><br>Wait for Binance to unlock trading or resolve the restriction before creating an advertisement.</div>';
  }
  if (readiness.accountStatus?.normal === false) {
    return `<div class="notice danger ads-api-readiness"><b>Binance account is not active</b><br>Current account status: ${escapeHtml(readiness.accountStatus?.status || 'unknown')}.</div>`;
  }
  // The generic Spot/Margin permission value is diagnostic only for C2C ads.
  // Binance's /ads/post response remains authoritative.
  return '';
}

function adsMerchantControls(data = {}, capability = {}) {
  if (!data.liveMode || !data.credentialConfigured) return '';
  const controls = data.merchantControls || {
    business: { enabled: null, status: 'unknown' },
    online: data.merchantOnline || { enabled: null, status: 'unknown' },
    break: { enabled: null, status: 'unknown' }
  };
  const rows = [
    { key: 'business', title: 'Business' },
    { key: 'online', title: 'Online' },
    { key: 'break', title: 'Break' }
  ];
  const breakOn = controls.break?.enabled === true || controls.break?.anyEnabled === true;
  const tradeBlocked = Boolean(data.selectedCredentialId) && (data.apiCreateReadiness?.tradingStatus?.locked === true || data.apiCreateReadiness?.accountStatus?.normal === false);
  return `<section class="ads-merchant-inline ${controls.syncError ? 'has-sync-error' : ''}" id="adsMerchantControls">
    ${rows.map(row => {
      const control = controls[row.key] || {};
      const mixed = control.mixed === true || control.status === 'mixed';
      const unknown = !mixed && (control.enabled === null || control.enabled === undefined || control.status === 'unknown');
      const checked = control.enabled === true || (mixed && row.key === 'break' && control.anyEnabled === true);
      const disabled = !capability.canManage || tradeBlocked || (breakOn && row.key !== 'break');
      const statusText = adsMerchantControlStatus(control, row.key);
      const quality = control.verified ? 'verified' : (unknown || mixed ? 'unknown' : 'accepted');
      return `<div class="ads-merchant-inline-item ${checked ? 'is-on' : ''} ${unknown ? 'is-unknown' : ''} ${mixed ? 'is-mixed' : ''} ${row.key === 'break' && checked ? 'is-break' : ''}" title="${escapeAttr(`${row.title}: ${statusText}`)}">
        <span class="ads-merchant-inline-label"><i class="${quality}"></i>${escapeHtml(row.title)}</span>
        <label class="ad-toggle merchant-control-toggle">
          <input type="checkbox" data-merchant-control="${escapeAttr(row.key)}" ${checked ? 'checked' : ''} ${mixed ? 'data-mixed="1"' : ''} ${disabled ? 'disabled' : ''} aria-label="${escapeAttr(row.title)}" />
          <span></span>
        </label>
      </div>`;
    }).join('')}
  </section>`;
}

function adsRealtimeSignature(data = {}) {
  const controls = data.merchantControls || {};
  const controlsByCredential = data.merchantControlsByCredential || {};
  return JSON.stringify({
    selectedCredentialId: Number(data.selectedCredentialId || 0),
    ads: (data.items || []).map(ad => [ad.id, ad.credentialId, ad.advNo, ad.status, ad.price, ad.surplusAmount, ad.initAmount, ad.updatedAt, ad.lastSyncedAt]),
    controls: ['business','online','break'].map(key => [controls[key]?.enabled, controls[key]?.mixed, controls[key]?.anyEnabled, controls[key]?.verified, controls[key]?.lastError || '']),
    controlsByCredential: Object.keys(controlsByCredential).sort((a, b) => Number(a) - Number(b)).map(key => {
      const value = controlsByCredential[key] || {};
      return [Number(key), ['business','online','break'].map(control => [value[control]?.enabled, value[control]?.verified, value[control]?.lastError || '']), value.mode?.id || 'unknown'];
    }),
    mode: controls.mode?.id || 'unknown',
    apiCreateReadiness: [data.apiCreateReadiness?.permission?.tradeEnabled, data.apiCreateReadiness?.tradingStatus?.locked, data.apiCreateReadiness?.accountStatus?.normal, data.apiCreateReadiness?.error || ''],
    capability: [data.capability?.canManage, data.capability?.credentialId],
    lastSyncError: data.lastSyncError || ''
  });
}

async function refreshAdsRealtime(force = false) {
  if (state.page !== 'ads' || !state.user || modalOpen()) return;
  if (state.adsRealtimeBusy) return;
  state.adsRealtimeBusy = true;
  try {
    const data = await api(adsPageUrl(force ? { refreshLive: 1, refreshMerchant: 1 } : {}));
    const signature = adsRealtimeSignature(data);
    if (force || signature !== state.adsRealtimeSignature) await renderAds(data);
  } catch (_) {
    // SSE remains the primary channel. Polling is only a quiet fallback.
  } finally {
    state.adsRealtimeBusy = false;
  }
}

function scheduleAdsRealtimeRefresh(delay = 120) {
  clearTimeout(state.adsRealtimeRefreshTimer);
  state.adsRealtimeRefreshTimer = setTimeout(() => refreshAdsRealtime(false), Math.max(0, Number(delay || 0)));
}

function startAdsRealtimePolling() {
  clearInterval(state.adsLivePollTimer);
  state.adsLivePollTimer = setInterval(() => {
    if (state.page === 'ads' && document.visibilityState === 'visible' && !modalOpen()) refreshAdsRealtime(false);
  }, 5000);
}

async function renderAds(prefetchedData = null) {
  setTitle('My Ads', '');
  state.adsFilters = state.adsFilters || { asset: '', fiat: '', tradeType: '', status: '', search: '' };
  let data = prefetchedData;
  if (!data) {
    try {
      data = await api(adsPageUrl());
    } catch (error) {
      if (!state.adsCredentialId) throw error;
      state.adsCredentialId = 0;
      localStorage.removeItem('crmAdsCredentialId');
      data = await api('/api/ads');
    }
  }

  let credentialOptions = adsCredentialOptions(data);
  let selectedCredentialId = Number(state.adsCredentialId || data.selectedCredentialId || 0);
  if (selectedCredentialId && !credentialOptions.some(option => Number(option.id) === selectedCredentialId)) {
    selectedCredentialId = 0;
    state.adsCredentialId = 0;
    localStorage.removeItem('crmAdsCredentialId');
    if (data.selectedCredentialId) data = await api('/api/ads');
    credentialOptions = adsCredentialOptions(data);
  }
  if (selectedCredentialId && Number(data.selectedCredentialId || 0) !== selectedCredentialId) {
    state.adsCredentialId = selectedCredentialId;
    data = await api(adsPageUrl());
    credentialOptions = adsCredentialOptions(data);
  }

  state.adsCredentialId = selectedCredentialId;
  const selectedOption = credentialOptions.find(option => Number(option.id) === selectedCredentialId) || null;
  const selectedTarget = selectedOption ? adsAccountTarget(data, selectedCredentialId) : null;
  const exactManagePermission = adsAccountHasPermission(selectedOption, 'ads.manage');
  const allManageTargets = (data.merchantControlTargets || credentialOptions).filter(option => adsAccountHasPermission(option, 'ads.manage') && option.canManage !== false && option.configured !== false);
  const serverCapability = data.capability || {};
  const capability = selectedOption ? {
    ...serverCapability,
    credentialSelected: true,
    credentialId: Number(selectedOption.id),
    canManage: Boolean(exactManagePermission && selectedTarget?.canManage !== false && selectedTarget?.configured !== false && serverCapability.canManage !== false),
    reason: exactManagePermission ? serverCapability.reason || '' : 'Ads Manage permission is not assigned for this account.'
  } : {
    ...serverCapability,
    credentialSelected: false,
    credentialId: null,
    canManage: Boolean(allManageTargets.length && serverCapability.canManage !== false),
    manageableAccountCount: allManageTargets.length,
    reason: allManageTargets.length ? '' : 'No permitted account is available for Ads management.'
  };
  const visibleItems = selectedCredentialId
    ? (data.items || []).filter(item => Number(item.credentialId || 0) === selectedCredentialId)
    : (data.items || []);
  data = {
    ...data,
    items: visibleItems,
    credentialOptions,
    selectedCredentialId: selectedCredentialId || null,
    credentialConfigured: selectedOption
      ? Boolean(!selectedOption.disabled && selectedTarget?.configured !== false && data.credentialConfigured !== false)
      : Boolean(data.credentialConfigured),
    capability
  };
  state.adsData = data;
  state.adsRealtimeSignature = adsRealtimeSignature(data);

  const items = applyAdsFilters(data.items || []);
  const aggregateBreakOn = data.merchantControls?.break?.enabled === true || data.merchantControls?.break?.anyEnabled === true;
  const scopedCapability = {
    ...capability,
    breakMode: aggregateBreakOn,
    businessClosed: data.merchantControls?.mode?.id === 'business_closed'
  };
  const assets = data.assets || [...new Set((data.items || []).map(ad => String(ad.asset || '').toUpperCase()).filter(Boolean))];
  const fiats = data.fiats || [...new Set((data.items || []).map(ad => String(ad.fiatUnit || '').toUpperCase()).filter(Boolean))];
  const canManualSync = Boolean(selectedOption && exactManagePermission && data.liveMode && !selectedOption.disabled && selectedTarget?.configured !== false);
  const canCreate = Boolean(selectedOption && scopedCapability.canManage && !scopedCapability.breakMode);

  $('#content').innerHTML = `<section class="ads-page screenshot-layout compact-ads-page">
    <div class="page-account-strip ads-account-strip">
      ${adsAccountSwitcherHtml(credentialOptions, selectedCredentialId)}
    </div>
    <div class="ads-page-head compact">
      <div class="ads-sync-line">${adsLiveStatus(data)} ${data.lastSyncAt ? `<small>${escapeHtml(fmt(data.lastSyncAt))}</small>` : ''}</div>
      <div class="ads-page-actions">
        <button class="ads-sync-icon" id="syncAdsBtn" type="button" ${canManualSync ? '' : 'disabled'} title="Sync selected account">↻</button>
        <button class="ads-create-icon" id="createAdBtn" type="button" ${canCreate ? '' : 'disabled'} title="Create advertisement">＋</button>
      </div>
    </div>
    ${selectedOption ? adsApiCreateReadinessNotice(data) : ''}
    ${credentialOptions.length ? adsMerchantControls(data, scopedCapability) : ''}
    <div class="ads-filter-bar screenshot-filters">
      <select id="adsAssetFilter"><option value="">Cryptos</option>${assets.map(v => `<option value="${escapeAttr(v)}" ${state.adsFilters.asset === v ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select>
      <select id="adsFiatFilter"><option value="">Currency</option>${fiats.map(v => `<option value="${escapeAttr(v)}" ${state.adsFilters.fiat === v ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select>
      <select id="adsTypeFilter"><option value="">Types</option><option value="BUY" ${state.adsFilters.tradeType === 'BUY' ? 'selected' : ''}>Buy</option><option value="SELL" ${state.adsFilters.tradeType === 'SELL' ? 'selected' : ''}>Sell</option></select>
      <select id="adsStatusFilter"><option value="">Status</option><option value="online" ${state.adsFilters.status === 'online' ? 'selected' : ''}>Online</option><option value="offline" ${state.adsFilters.status === 'offline' ? 'selected' : ''}>Offline</option><option value="private" ${state.adsFilters.status === 'private' ? 'selected' : ''}>Private</option><option value="closed" ${state.adsFilters.status === 'closed' ? 'selected' : ''}>Closed</option></select>
    </div>
    <input class="ads-search-line" id="adsSearch" value="${escapeAttr(state.adsFilters.search || '')}" placeholder="Search ad number or payment method" />
    <div class="ads-grid screenshot-cards">${items.length ? items.map(ad => adCardHtml(ad, adsCapabilityForAdvertisement(ad, data))).join('') : '<div class="ads-no-more">No advertisements found.</div>'}</div>
    ${data.lastSyncError ? `<div class="notice warn">${escapeHtml(data.lastSyncError)}</div>` : ''}
  </section>`;

  $$('[data-ads-account]').forEach(button => button.onclick = () => {
    state.adsCredentialId = Number(button.dataset.adsAccount || 0);
    if (state.adsCredentialId) localStorage.setItem('crmAdsCredentialId', String(state.adsCredentialId));
    else localStorage.removeItem('crmAdsCredentialId');
    state.adsData = null;
    state.adsRealtimeSignature = '';
    renderAds();
  });

  const rerenderWithFilters = () => {
    state.adsFilters = {
      asset: $('#adsAssetFilter')?.value || '',
      fiat: $('#adsFiatFilter')?.value || '',
      tradeType: $('#adsTypeFilter')?.value || '',
      status: $('#adsStatusFilter')?.value || '',
      search: $('#adsSearch')?.value || ''
    };
    renderAds(state.adsData);
  };
  ['adsAssetFilter', 'adsFiatFilter', 'adsTypeFilter', 'adsStatusFilter'].forEach(id => { if ($('#' + id)) $('#' + id).onchange = rerenderWithFilters; });
  if ($('#adsSearch')) $('#adsSearch').oninput = () => {
    clearTimeout(state.adsSearchTimer);
    state.adsSearchTimer = setTimeout(rerenderWithFilters, 180);
  };

  if ($('#syncAdsBtn')) $('#syncAdsBtn').onclick = async () => {
    if (!selectedCredentialId) return;
    const button = $('#syncAdsBtn');
    button.disabled = true;
    try {
      const result = await api('/api/ads/sync', { method:'POST', silent:true, body: JSON.stringify({ credentialId: selectedCredentialId, rows: data.autoSyncRows || 50, syncCatalog: true, forceCatalog: true }) });
      notify(`Synced ${result.created || 0} new and ${result.updated || 0} updated ads.`, 'ok');
      const fresh = await api(adsPageUrl({ refreshMerchant: 1 }));
      await renderAds(fresh);
    } catch (error) {
      notify(error.message || 'Advertisement sync failed.', 'danger', 7000);
      button.disabled = false;
    }
  };
  if ($('#createAdBtn')) $('#createAdBtn').onclick = () => openAdvertisementEditor(null, data);

  $$('[data-merchant-control]').forEach(input => {
    if (input.dataset.mixed === '1') input.indeterminate = true;
    input.onchange = async () => {
      const control = String(input.dataset.merchantControl || '');
      const enabled = Boolean(input.checked);
      const applyToAll = !selectedCredentialId;
      const currentControl = data.merchantControls?.[control] || {};
      const restore = () => {
        const mixed = currentControl.mixed === true || currentControl.status === 'mixed';
        input.checked = currentControl.enabled === true || (control === 'break' && mixed && currentControl.anyEnabled === true);
        input.indeterminate = mixed;
      };
      state.adsMerchantCommandBusy = state.adsMerchantCommandBusy || new Set();
      if (state.adsMerchantCommandBusy.size || state.adsMerchantCommandBusy.has(control)) {
        restore();
        return;
      }
      const breakOn = data.merchantControls?.break?.enabled === true || data.merchantControls?.break?.anyEnabled === true;
      if (breakOn && control !== 'break') {
        restore();
        notify('Turn Break off first.', 'warn', 4500);
        return;
      }
      state.adsMerchantCommandBusy.add(control);
      $$('[data-merchant-control], [data-ad-toggle], [data-edit-ad], #createAdBtn, #syncAdsBtn').forEach(node => { node.disabled = true; });
      try {
        const scopeText = applyToAll ? 'all permitted accounts' : adsAccountDisplayName(selectedOption || {});
        if (control === 'business' && !enabled) {
          const approved = await confirmAdsAction('Close Business?', `Close Business for ${scopeText}?`, 'Close Business');
          if (!approved) { restore(); return; }
        }
        if (control === 'break' && enabled) {
          const approved = await confirmAdsAction('Start Break?', `Start Break for ${scopeText}?`, 'Start Break');
          if (!approved) { restore(); return; }
        }
        const result = await api('/api/ads/merchant-control', {
          method: 'POST',
          silent: true,
          body: JSON.stringify({
            credentialId: selectedCredentialId || null,
            applyToAll,
            control,
            enabled,
            requestId: `merchant-${selectedCredentialId || 'all'}-${control}-${enabled ? 1 : 0}-${Date.now()}`
          })
        });
        const fresh = await api(adsPageUrl({ refreshMerchant: 1 }));
        await renderAds(fresh);
        const actionName = control === 'business' ? 'Business' : (control === 'break' ? 'Break' : 'Online');
        if (result.batch) {
          const tone = result.failureCount ? 'warn' : 'ok';
          notify(`${actionName} ${enabled ? 'ON' : 'OFF'} · ${result.successCount}/${result.targetCount} accounts`, tone, result.failureCount ? 7000 : 3500);
        } else {
          notify(`${actionName} ${enabled ? 'ON' : 'OFF'}`, 'ok', 3500);
        }
      } catch (err) {
        restore();
        const fresh = await api(adsPageUrl({ refreshMerchant: 1 })).catch(() => null);
        if (fresh) await renderAds(fresh);
        notify(err.message || 'Could not update Binance merchant control.', err?.data?.noticeOnly ? 'warn' : 'danger', 7000);
      } finally {
        state.adsMerchantCommandBusy.delete(control);
      }
    };
  });

  $$('[data-edit-ad]').forEach(btn => btn.onclick = () => {
    const ad = (data.items || []).find(item => Number(item.id) === Number(btn.dataset.editAd));
    if (ad && adsCapabilityForAdvertisement(ad, data).canManage) openAdvertisementEditor(ad, data);
  });

  $$('[data-ad-toggle]').forEach(input => input.onchange = async () => {
    const ad = (data.items || []).find(item => Number(item.id) === Number(input.dataset.adToggle));
    if (!ad) return;
    const adCapability = adsCapabilityForAdvertisement(ad, data);
    if (!adCapability.canManage) {
      input.checked = !input.checked;
      return;
    }
    const activating = Boolean(input.checked);
    const adKey = String(ad.id || ad.advNo || 'unknown');
    const adControls = adsMerchantControlsForCredential(data, ad.credentialId);
    state.adsStatusCommandBusy = state.adsStatusCommandBusy || new Set();
    if (state.adsStatusCommandBusy.has(adKey) || state.adsMerchantCommandBusy?.size) {
      input.checked = !activating;
      return;
    }
    if (adControls.break?.enabled === true) {
      input.checked = false;
      notify('Break is active for this account.', 'warn', 5000);
      return;
    }
    state.adsStatusCommandBusy.add(adKey);
    input.disabled = true;
    try {
      let autoStartMerchant = false;
      if (activating) {
        const businessOff = adControls.business?.enabled !== true;
        const onlineOff = adControls.online?.enabled !== true;
        if (businessOff || onlineOff) {
          const approved = await confirmAdsAction('Activate Advertisement?', `Start Business and set ${adsAccountDisplayName(ad)} Online?`, 'Continue & Activate');
          if (!approved) { input.checked = false; return; }
          autoStartMerchant = true;
        }
      }
      const next = activating ? 'online' : 'offline';
      const sendStatus = shouldAutoStart => api(`/api/ads/${ad.id}/status`, {
        method: 'POST',
        silent: true,
        body: JSON.stringify({ credentialId: Number(ad.credentialId), status: next, autoStartMerchant: Boolean(shouldAutoStart), requestId: `ad-${ad.credentialId}-${adKey}-${next}-${Date.now()}` })
      });
      let result;
      try {
        result = await sendStatus(autoStartMerchant);
      } catch (statusError) {
        if (activating && statusError?.data?.businessClosed) {
          const approved = await confirmAdsAction('Business is Closed', `Start Business, set ${adsAccountDisplayName(ad)} Online and activate this ad?`, 'Start & Activate');
          if (!approved) {
            input.checked = false;
            const fresh = await api(adsPageUrl({ refreshMerchant: 1 }));
            await renderAds(fresh);
            return;
          }
          result = await sendStatus(true);
        } else {
          throw statusError;
        }
      }
      const fresh = await api(adsPageUrl({ refreshMerchant: 1 }));
      await renderAds(fresh);
      if (result?.notice) notify(result.notice, result.noticeType === 'warning' ? 'warn' : 'ok', 6500);
      else notify(next === 'online' ? 'Advertisement activated.' : 'Advertisement paused.', 'ok');
    } catch (err) {
      input.checked = !activating;
      const fresh = await api(adsPageUrl({ refreshMerchant: 1 })).catch(() => null);
      if (fresh) await renderAds(fresh);
      notify(err?.data?.notice || err.message || 'Could not change advertisement status.', err?.data?.noticeOnly ? 'warn' : 'danger', 7000);
    } finally {
      state.adsStatusCommandBusy.delete(adKey);
    }
  });

  startAdsRealtimePolling();
  if (data.liveMode && data.credentialConfigured) {
    const refreshScope = selectedCredentialId ? String(selectedCredentialId) : 'all';
    if (state.adsInitialLiveRefreshScope !== refreshScope) {
      state.adsInitialLiveRefreshScope = refreshScope;
      setTimeout(() => refreshAdsRealtime(false), 700);
    }
  }
}

function closeAdsSheet() {
  $$('.ads-sheet-backdrop').forEach(node => node.remove());
}

function openAdsSheet(title, bodyHtml, onReady) {
  closeAdsSheet();
  const wrap = document.createElement('div');
  wrap.className = 'ads-sheet-backdrop';
  wrap.innerHTML = `<section class="ads-bottom-sheet" role="dialog" aria-modal="true"><div class="ads-sheet-handle"></div><header><h3>${escapeHtml(title)}</h3><button type="button" data-close-ads-sheet>×</button></header><div class="ads-sheet-body">${bodyHtml}</div></section>`;
  wrap.addEventListener('click', event => { if (event.target === wrap) closeAdsSheet(); });
  document.body.appendChild(wrap);
  wrap.querySelector('[data-close-ads-sheet]')?.addEventListener('click', closeAdsSheet);
  if (typeof onReady === 'function') onReady(wrap);
  return wrap;
}

function confirmAdsAction(title, message, confirmLabel = 'Continue') {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      closeAdsSheet();
      resolve(Boolean(value));
    };
    const sheet = openAdsSheet(title, `<div class="ads-action-confirm"><p>${escapeHtml(message)}</p><div class="ads-action-confirm-buttons"><button type="button" class="ghost" data-confirm-no>Cancel</button><button type="button" data-confirm-yes>${escapeHtml(confirmLabel)}</button></div></div>`);
    sheet.querySelector('[data-confirm-no]')?.addEventListener('click', () => finish(false));
    sheet.querySelector('[data-confirm-yes]')?.addEventListener('click', () => finish(true));
    sheet.querySelector('[data-close-ads-sheet]')?.addEventListener('click', () => finish(false));
    sheet.addEventListener('click', event => { if (event.target === sheet) finish(false); });
  });
}

function paymentMethodMatchesTrade(method = {}, trade = {}) {
  const methodTokens = [method.binanceIdentifier, method.binancePayType, method.code, method.name].map(v => String(v || '').toLowerCase()).filter(Boolean);
  const tradeTokens = [trade.identifier, trade.payType, trade.tradeMethodName].map(v => String(v || '').toLowerCase()).filter(Boolean);
  if (Number(method.binancePayId || 0) && Number(trade.payId || 0) && Number(method.binancePayId) === Number(trade.payId)) return true;
  return tradeTokens.some(token => methodTokens.includes(token));
}

function resolvedAdPaymentIds(ad = {}, data = {}) {
  const available = adsPaymentMethodsForCredential(data, ad.credentialId || data.selectedCredentialId || state.adsCredentialId || 0);
  const ids = new Set((ad.paymentMethodIds || []).map(Number).filter(Number.isFinite));
  for (const trade of (ad.tradeMethods || [])) {
    const match = available.find(method => paymentMethodMatchesTrade(method, trade));
    if (match) ids.add(Number(match.id));
  }
  return [...ids].slice(0, 5);
}

function countryName(code) {
  if (code === 'ALL') return 'All Region(s)';
  try {
    state.adsCountryNames = state.adsCountryNames || new Intl.DisplayNames(['en'], { type: 'region' });
    return state.adsCountryNames.of(code) || code;
  } catch (_) { return code; }
}

function selectedRegionLabel(regions = []) {
  const list = Array.isArray(regions) && regions.length ? regions : ['ALL'];
  if (list.includes('ALL')) return 'All Region(s)';
  if (list.length === 1) return countryName(list[0]);
  if (list.length <= 3) return list.map(countryName).join(', ');
  return `${list.slice(0, 2).map(countryName).join(', ')} +${list.length - 2}`;
}

function adRateForTrade(overview = {}, tradeType = 'BUY') {
  const rates = Array.isArray(overview.rates) ? overview.rates : [];
  const preferred = rates.find(row => ['p2pZone', ''].includes(String(row.area || ''))) || rates[0] || {};
  const key = String(tradeType).toUpperCase() === 'SELL' ? 'makerSellCommissionRate' : 'makerBuyCommissionRate';
  const fallbackKey = String(tradeType).toUpperCase() === 'SELL' ? 'makerSellBaseCommissionRate' : 'makerBuyBaseCommissionRate';
  const rate = Number(preferred[key] ?? preferred[fallbackKey] ?? 0);
  return Number.isFinite(rate) ? Math.max(0, rate) : 0;
}

function percentRate(value) {
  const rate = Number(value || 0);
  return `${(rate * 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}%`;
}

function openPaymentMethodSheet(data, selectedIds, onApply) {
  const methods = Array.isArray(data.paymentMethods) ? data.paymentMethods : [];
  const draft = new Set([...selectedIds].map(Number));
  openAdsSheet('Payment Method', `<div class="ads-sheet-note">Select up to 5 methods. Only selected methods will appear on this advertisement.</div>
    <div class="ads-sheet-list payment-list">${methods.length ? methods.map(method => `<label class="ads-sheet-option"><input type="checkbox" value="${Number(method.id)}" ${draft.has(Number(method.id)) ? 'checked' : ''}><span><b>${escapeHtml(method.name || method.code || 'Payment Method')}</b><small>${escapeHtml(method.binanceIdentifier || method.binancePayType || method.code || '')}${method.payAccount ? ` · ${escapeHtml(method.payAccount)}` : (method.accountPreview?.accountNumber ? ` · ${escapeHtml(method.accountPreview.accountNumber)}` : '')}</small></span></label>`).join('') : '<div class="notice warn">No payment method is linked to this Binance account. Sync its P2P Profile first.</div>'}</div>
    <button type="button" class="ads-sheet-apply" data-apply-payment>Apply</button>`, sheet => {
      sheet.querySelectorAll('input[type="checkbox"]').forEach(box => box.onchange = () => {
        const id = Number(box.value);
        if (box.checked && draft.size >= 5 && !draft.has(id)) {
          box.checked = false;
          notify('Select a maximum of 5 payment methods.', 'warn');
          return;
        }
        if (box.checked) draft.add(id); else draft.delete(id);
      });
      sheet.querySelector('[data-apply-payment]')?.addEventListener('click', () => {
        onApply([...draft]);
        closeAdsSheet();
      });
    });
}

function openTermsTagSheet(selected, onApply) {
  const draft = new Set(selected);
  openAdsSheet('Terms Tags (Optional)', `<div class="ads-sheet-note">Select up to 3 tags. “Additional KYC required” controls the Additional KYC rule.</div>
    <div class="ads-sheet-list">${ADS_TAG_OPTIONS.map(tag => `<label class="ads-sheet-option"><input type="checkbox" value="${escapeAttr(tag)}" ${draft.has(tag) ? 'checked' : ''}><span><b>${escapeHtml(tag)}</b></span></label>`).join('')}</div>
    <button type="button" class="ads-sheet-apply" data-apply-tags>Apply</button>`, sheet => {
      sheet.querySelectorAll('input[type="checkbox"]').forEach(box => box.onchange = () => {
        const tag = box.value;
        if (box.checked && draft.size >= 3 && !draft.has(tag)) {
          box.checked = false;
          notify('Select a maximum of 3 tags.', 'warn');
          return;
        }
        if (box.checked) draft.add(tag); else draft.delete(tag);
      });
      sheet.querySelector('[data-apply-tags]')?.addEventListener('click', () => {
        onApply([...draft]);
        closeAdsSheet();
      });
    });
}

function openRegionSheet(selectedRegions, onApply) {
  const draft = new Set(selectedRegions?.length ? selectedRegions : ['ALL']);
  openAdsSheet('Display to Users In', `<input class="ads-sheet-search" data-country-search placeholder="Search country">
    <div class="ads-sheet-list country-list" data-country-list>
      <label class="ads-sheet-option" data-country-row="all region"><input type="checkbox" value="ALL" ${draft.has('ALL') ? 'checked' : ''}><span><b>All Region(s)</b><small>Show the advertisement in every supported region</small></span></label>
      ${ADS_COUNTRY_CODES.map(code => `<label class="ads-sheet-option" data-country-row="${escapeAttr(`${code} ${countryName(code)}`.toLowerCase())}"><input type="checkbox" value="${code}" ${draft.has(code) ? 'checked' : ''}><span><b>${escapeHtml(countryName(code))}</b><small>${escapeHtml(code)}</small></span></label>`).join('')}
    </div>
    <button type="button" class="ads-sheet-apply" data-apply-regions>Apply</button>`, sheet => {
      const boxes = [...sheet.querySelectorAll('input[type="checkbox"]')];
      boxes.forEach(box => box.onchange = () => {
        if (box.value === 'ALL' && box.checked) {
          draft.clear(); draft.add('ALL');
          boxes.forEach(other => { if (other !== box) other.checked = false; });
        } else {
          draft.delete('ALL');
          const allBox = boxes.find(other => other.value === 'ALL');
          if (allBox) allBox.checked = false;
          if (box.checked) draft.add(box.value); else draft.delete(box.value);
          if (!draft.size) { draft.add('ALL'); if (allBox) allBox.checked = true; }
        }
      });
      const search = sheet.querySelector('[data-country-search]');
      if (search) search.oninput = () => {
        const q = search.value.trim().toLowerCase();
        sheet.querySelectorAll('[data-country-row]').forEach(row => row.hidden = q && !row.dataset.countryRow.includes(q));
      };
      sheet.querySelector('[data-apply-regions]')?.addEventListener('click', () => {
        onApply([...draft]);
        closeAdsSheet();
      });
    });
}

function renderSelectedPaymentMethods(container, data, selectedIds, ad) {
  if (!container) return;
  const methods = Array.isArray(data.paymentMethods) ? data.paymentMethods : [];
  const selected = selectedIds.map(id => methods.find(method => Number(method.id) === Number(id))).filter(Boolean);
  const tradeMethods = Array.isArray(ad?.tradeMethods) ? ad.tradeMethods : [];
  container.innerHTML = selected.length ? selected.map(method => {
    const trade = tradeMethods.find(item => paymentMethodMatchesTrade(method, item)) || {};
    const detail = trade.payAccount || method.payAccount || method.accountPreview?.accountNumber || '';
    const bank = trade.payBank || method.payBank || method.accountPreview?.accountName || '';
    return `<article class="ads-selected-method"><div><i></i><b>${escapeHtml(method.name || method.code || 'Payment Method')}</b><small>${escapeHtml(detail)}</small><small>${escapeHtml(bank)}</small></div><button type="button" data-remove-method="${Number(method.id)}">×</button></article>`;
  }).join('') : '<div class="ads-empty-selection">No payment method selected.</div>';
}

function openFeeRateSheet(overview, tradeType, amount, asset) {
  const rows = Array.isArray(overview?.rates) ? overview.rates : [];
  const sourceRaw = String(overview?.source || 'configured');
  const sourceLabel = /binance/i.test(sourceRaw) ? 'Binance' : 'Configured';
  const current = adRateForTrade(overview, tradeType);
  const fee = Number(amount || 0) * current;
  openAdsSheet('Current Ad Fee Rates', `<div class="ads-fee-summary"><span>Applied maker rate</span><b>${percentRate(current)}</b><small>Estimated fee: ${adNumber(fee, 8)} ${escapeHtml(asset || 'USDT')}</small></div>
    <div class="ads-fee-table"><div class="head"><span>Area / Fiat</span><span>Buy maker</span><span>Sell maker</span></div>${rows.length ? rows.map(row => `<div><span>${escapeHtml(row.area || 'P2P')} · ${escapeHtml(row.fiat || '')}</span><span>${percentRate(row.makerBuyCommissionRate ?? row.makerBuyBaseCommissionRate)}</span><span>${percentRate(row.makerSellCommissionRate ?? row.makerSellBaseCommissionRate)}</span></div>`).join('') : '<div><span>No live fee row returned</span><span>-</span><span>-</span></div>'}</div>
    ${overview?.warning ? `<div class="notice warn">${escapeHtml(overview.warning)}</div>` : ''}
    <div class="ads-sheet-note">Source: ${escapeHtml(sourceLabel)}. Rates refresh when asset, fiat or ad side changes.</div>`);
}

function openAdvertisementEditor(ad = null, data = {}) {
  const isEdit = !!ad;
  const tradeType = String(ad?.tradeType || 'BUY').toUpperCase();
  const defaultStatus = String(ad?.status || 'offline').toLowerCase();
  let selectedMethodIds = resolvedAdPaymentIds(ad || {}, data);
  let selectedTags = Array.isArray(ad?.termsTags) ? [...ad.termsTags] : [];
  if (Number(ad?.takerAdditionalKycRequired || 0) === 1 && !selectedTags.some(tag => /additional[ _-]*kyc/i.test(tag))) selectedTags.unshift('Additional KYC required');
  selectedTags = [...new Set(selectedTags)].slice(0, 3);
  let selectedRegions = Array.isArray(ad?.regions) && ad.regions.length ? [...ad.regions] : (String(ad?.region || 'ALL').split(',').map(v => v.trim()).filter(Boolean));
  if (!selectedRegions.length) selectedRegions = ['ALL'];
  let feeOverview = null;
  let currentRate = Number(ad?.commissionRate || data.defaultCommissionRate || 0);
  const manageCredentialOptions = adsCredentialOptions(data).filter(option => adsAccountHasPermission(option, 'ads.manage'));
  let editorCredentialId = Number(ad?.credentialId || data.selectedCredentialId || state.adsCredentialId || 0);
  if (!manageCredentialOptions.some(option => Number(option.id) === editorCredentialId)) editorCredentialId = Number(manageCredentialOptions[0]?.id || 0);
  if (!editorCredentialId) {
    notify('No enabled Binance account is assigned with Ads Manage permission.', 'warn', 6000);
    return;
  }
  const editorCredential = manageCredentialOptions.find(option => Number(option.id) === editorCredentialId) || null;

  const assetOptions = [...new Set([...(data.assets || []), ad?.asset || 'USDT'].filter(Boolean).map(v => String(v).toUpperCase()))];
  const fiatOptions = [...new Set([...(data.fiats || []), ad?.fiatUnit || 'BDT'].filter(Boolean).map(v => String(v).toUpperCase()))];

  modal(isEdit ? 'Edit Advertisement' : 'Create Advertisement', `<form id="advertisementForm" class="ads-editor-form screenshot-editor">
    <section class="ads-edit-identity">
      <div>
        ${isEdit ? `<div class="ads-fixed-side ${tradeType === 'BUY' ? 'buy' : 'sell'}"><b>${tradeType === 'BUY' ? 'Buy' : 'Sell'}</b> <span data-pair-asset>${escapeHtml(ad?.asset || 'USDT')}</span> With <span data-pair-fiat>${escapeHtml(ad?.fiatUnit || 'BDT')}</span></div>` : `<div class="ads-create-side-tabs"><label><input type="radio" name="tradeType" value="BUY" checked><span class="buy">Buy</span></label><label><input type="radio" name="tradeType" value="SELL"><span class="sell">Sell</span></label></div>`}
        ${ad?.advNo ? `<small>Ad Number</small><div class="ads-ad-number">${escapeHtml(ad.advNo)}</div>` : '<small>New advertisement</small>'}
      </div>
      ${badge(adStatusLabel(ad || { status: defaultStatus }), adStatusBadgeClass(ad || { status: defaultStatus }))}
    </section>

    <section class="ads-field-section ads-account-field">
      <label class="ads-label">Binance Account</label>
      ${isEdit
        ? `<input type="hidden" name="credentialId" value="${editorCredentialId}"><div class="ads-fixed-account"><span class="binance-account-badge">${escapeHtml(adsAccountDisplayName(editorCredential || ad || { credentialId: editorCredentialId }))}</span></div>`
        : `<select name="credentialId" class="ads-full-selector" required>${manageCredentialOptions.map(option => `<option value="${Number(option.id)}" ${Number(option.id) === editorCredentialId ? 'selected' : ''}>${escapeHtml(adsAccountDisplayName(option))}</option>`).join('')}</select>`}
    </section>

    <section class="ads-field-section">
      <div class="ads-pair-row">
        <label><span>Crypto Asset</span><select name="asset" required>${assetOptions.map(v => `<option value="${escapeAttr(v)}" ${String(ad?.asset || 'USDT').toUpperCase() === v ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select></label>
        <label><span>Fiat Currency</span><select name="fiatUnit" required>${fiatOptions.map(v => `<option value="${escapeAttr(v)}" ${String(ad?.fiatUnit || 'BDT').toUpperCase() === v ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select></label>
      </div>
    </section>

    <section class="ads-field-section">
      <label class="ads-label">Fixed</label>
      <div class="ads-price-box"><button type="button" tabindex="-1">−</button><input name="price" type="number" min="0" step="0.00000001" value="${escapeAttr(ad?.price || '')}" required><button type="button" tabindex="-1">＋</button></div>
      <input type="hidden" name="priceType" value="${Number(ad?.priceType || 1)}">
      ${ad?.price ? `<div class="ads-reference-lines"><span>Your Price <b>${escapeHtml(ad?.fiatUnit === 'BDT' ? 'Tk.' : ad?.fiatUnit || '')}${adNumber(ad.price, 2)}</b></span></div>` : ''}
    </section>

    <section class="ads-field-section ads-total-amount-section">
      <label class="ads-label">Total amount</label>
      <div class="ads-unit-input ads-total-amount-input">
        <input name="initAmount" type="number" min="0" step="0.00000001" value="${escapeAttr(adInputNumber(adEditableAmount(ad || {})))}" required>
        <button type="button" class="ads-max-amount-button" id="adAmountMaxBtn" hidden>MAX</button>
        <span data-asset-unit>${escapeHtml(ad?.asset || 'USDT')}</span>
      </div>
      <div class="ads-available-balance" id="adAvailableBalance" hidden><span>Available</span><b>Checking...</b></div>
    </section>

    <section class="ads-field-section">
      <label class="ads-label">Order Limit <span class="info-dot">i</span></label>
      <div class="ads-order-limit-row"><div class="ads-unit-input"><input name="minSingleTransAmount" type="number" min="0" step="0.01" value="${escapeAttr(ad?.minSingleTransAmount || '')}" required><span data-fiat-unit>${escapeHtml(ad?.fiatUnit || 'BDT')}</span></div><em>~</em><div class="ads-unit-input"><input name="maxSingleTransAmount" type="number" min="0" step="0.01" value="${escapeAttr(ad?.maxSingleTransAmount || '')}" required><span data-fiat-unit>${escapeHtml(ad?.fiatUnit || 'BDT')}</span></div></div>
    </section>

    <section class="ads-field-section">
      <div class="ads-section-heading"><div><label class="ads-label">Payment Method</label><small>Select up to 5 methods.</small></div><button type="button" class="ads-add-button" id="addAdPaymentMethod">＋ Add</button></div>
      <div id="selectedAdPaymentMethods" class="ads-selected-methods"></div>
    </section>

    <section class="ads-field-section">
      <label class="ads-label">Payment Time Limit <span class="info-dot">i</span></label>
      <select name="payTimeLimit" class="ads-full-selector"><option value="15" ${Number(ad?.payTimeLimit || 15) === 15 ? 'selected' : ''}>15 Min</option><option value="30" ${Number(ad?.payTimeLimit || 0) === 30 ? 'selected' : ''}>30 Min</option><option value="60" ${Number(ad?.payTimeLimit || 0) === 60 ? 'selected' : ''}>1 H</option><option value="180" ${Number(ad?.payTimeLimit || 0) === 180 ? 'selected' : ''}>3 H</option></select>
    </section>

    <section class="ads-field-section">
      <label class="ads-label">Terms Tags (Optional)</label>
      <button type="button" class="ads-full-selector button-selector" id="chooseAdTermsTags"><span id="adTermsTagsLabel">${selectedTags.length ? escapeHtml(selectedTags.join(', ')) : 'Add tags'}</span><b>⌄</b></button>
      <small>Select up to 3 tags. Additional KYC is configured here.</small>
      <div class="ads-tag-preview" id="adTagPreview"></div>
    </section>

    <section class="ads-field-section">
      <label class="ads-label">Terms (Optional)</label>
      <textarea name="remarks" maxlength="1000" rows="12" placeholder="Trade Terms">${escapeHtml(ad?.remarks || '')}</textarea>
      <small class="ads-char-count" data-count-for="remarks">${String(ad?.remarks || '').length}/1000</small>
    </section>

    <section class="ads-field-section">
      <label class="ads-label">Auto-reply (Optional)</label>
      <textarea name="autoReplyMsg" maxlength="1000" rows="9" placeholder="Automatic reply">${escapeHtml(ad?.autoReplyMsg || '')}</textarea>
      <small class="ads-char-count" data-count-for="autoReplyMsg">${String(ad?.autoReplyMsg || '').length}/1000</small>
    </section>

    <section class="ads-field-section">
      <label class="ads-label">Counterparty Conditions</label><p class="sub">Conditions may reduce ad visibility.</p>
      <div class="ads-condition-list screenshot-conditions">
        <label><input type="checkbox" name="registeredRequired" ${Number(ad?.buyerRegDaysLimit || 0) > 0 ? 'checked' : ''}><span>Registered</span><input name="buyerRegDaysLimit" type="number" min="0" value="${escapeAttr(ad?.buyerRegDaysLimit || 0)}"><small>Day(s) ago</small></label>
        <label><input type="checkbox" name="holdingRequired" ${Number(ad?.buyerBtcPositionLimit || 0) > 0 ? 'checked' : ''}><span>Holdings more than</span><input name="buyerBtcPositionLimit" type="number" min="0" step="0.00000001" value="${escapeAttr(ad?.buyerBtcPositionLimit || 0)}"><small>BTC</small></label>
        <label><input type="checkbox" name="nonMerchant" ${Number(ad?.userTradeType || 0) === 9 ? 'checked' : ''}><span>Non-merchant</span></label>
      </div>
    </section>

    <section class="ads-field-section">
      <label class="ads-label">Display to Users In <span class="info-dot">i</span></label>
      <button type="button" class="ads-full-selector button-selector" id="chooseAdRegions"><span id="adRegionsLabel">${escapeHtml(selectedRegionLabel(selectedRegions))}</span><b>⌄</b></button>
    </section>

    <section class="ads-field-section">
      <label class="ads-label">Status</label>
      <div class="ads-status-options vertical"><label><input type="radio" name="status" value="online" ${defaultStatus === 'online' ? 'checked' : ''}><span>Online</span></label><label><input type="radio" name="status" value="offline" ${defaultStatus === 'offline' ? 'checked' : ''}><span>Offline</span></label><label><input type="radio" name="status" value="private" ${defaultStatus === 'private' ? 'checked' : ''}><span>Private</span></label></div>
    </section>

    <div class="ads-editor-sticky screenshot-sticky">
      <button type="button" class="ads-fee-trigger" id="adFeeTrigger"><span id="adFeeLabel">${tradeType === 'SELL' ? 'Reserved Fee' : 'Estimated Fee'}</span><b id="adEstimatedFee">${adNumber(ad?.estimatedFee || 0, 8)} ${escapeHtml(ad?.asset || 'USDT')}</b><small id="adFeePercent">${percentRate(currentRate)}</small></button>
      ${ad?.publishPending || ad?.lastPublishError ? `<div class="notice warn ads-draft-warning"><b>Draft</b><br>${escapeHtml(ad?.apiTradePermissionRequired ? 'Binance API key Trading is OFF. Enable Trading in Binance API Management, then publish this draft again.' : (ad?.apiTradingLocked ? 'Binance API trading is locked. Resolve the restriction, then publish this draft again.' : (ad?.merchantStatusRequired ? 'Binance P2P merchant status is not active. Turn Business ON, Break OFF and Online ON, then publish again.' : (ad?.binancePermissionRequired ? (ad?.createPermissionDeniedAfterPreflight ? 'Binance rejected Create Advertisement (83749) even after Trade permission and active merchant preflight. The /ads/post privilege must be enabled or repaired by Binance CS.' : 'Binance Private P2P Advertisement Create API permission is required (83749).') : ad?.lastPublishError || 'This advertisement is not published to Binance yet.'))))}${ad?.createPrivilegeDiagnostic ? '<br><button type="button" class="link-button ads-copy-create-diagnostic" id="copyAdCreateDiagnosticBtn">Copy Binance CS Details</button>' : ''}</div>` : ''}
      <div id="advertisementFormMessage"></div>
      <div class="ads-editor-action-row">
        ${isEdit ? '<button type="button" class="danger ads-delete-button" id="deleteAdvertisementBtn">Delete</button>' : ''}
        ${isEdit && !ad?.advNo ? '<button type="button" class="secondary ads-publish-button" id="publishAdvertisementBtn">Publish to Binance</button>' : ''}
        <button type="submit" class="ads-save-button">${isEdit ? 'Save' : 'Create Advertisement'}</button>
      </div>
    </div>
  </form>`);

  const dialog = document.querySelector('.modal-backdrop:last-child .modal');
  if (dialog) dialog.classList.add('ads-editor-modal', 'screenshot-modal');
  const form = $('#advertisementForm');
  if (!form) return;
  const currentCredentialId = () => Number(form.elements.credentialId?.value || editorCredentialId || 0);
  const currentPaymentData = () => adsPaymentDataForCredential(data, currentCredentialId());
  const refreshEditorAccount = async () => {
    const credentialId = currentCredentialId();
    if (credentialId) {
      state.adsCredentialId = credentialId;
      localStorage.setItem('crmAdsCredentialId', String(credentialId));
    }
    state.adsData = null;
    state.adsRealtimeSignature = '';
    try {
      const fresh = await api(adsPageUrl({ refreshMerchant: 1 }), { silent:true, noAutoReload:true });
      await renderAds(fresh);
    } catch (refreshError) {
      notify(`Advertisement was saved, but the list refresh failed: ${refreshError.message || 'refresh failed'}`, 'warn', 7000);
      renderAds().catch(() => {});
    }
  };

  const selectedContainer = $('#selectedAdPaymentMethods');
  const tagPreview = $('#adTagPreview');
  const renderMethods = () => {
    renderSelectedPaymentMethods(selectedContainer, currentPaymentData(), selectedMethodIds, ad || {});
    selectedContainer?.querySelectorAll('[data-remove-method]').forEach(button => button.onclick = () => {
      selectedMethodIds = selectedMethodIds.filter(id => Number(id) !== Number(button.dataset.removeMethod));
      renderMethods();
    });
  };
  const renderTags = () => {
    if ($('#adTermsTagsLabel')) $('#adTermsTagsLabel').textContent = selectedTags.length ? selectedTags.join(', ') : 'Add tags';
    if (tagPreview) tagPreview.innerHTML = selectedTags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('');
  };
  renderMethods(); renderTags();

  $('#addAdPaymentMethod').onclick = () => openPaymentMethodSheet(currentPaymentData(), selectedMethodIds, ids => { selectedMethodIds = ids; renderMethods(); });
  $('#chooseAdTermsTags').onclick = () => openTermsTagSheet(selectedTags, tags => { selectedTags = tags; renderTags(); scheduleFeeRefresh(); });
  $('#chooseAdRegions').onclick = () => openRegionSheet(selectedRegions, regions => {
    selectedRegions = regions;
    if ($('#adRegionsLabel')) $('#adRegionsLabel').textContent = selectedRegionLabel(selectedRegions);
  });

  const currentTradeType = () => isEdit ? tradeType : (form.querySelector('input[name="tradeType"]:checked')?.value || 'BUY');
  let availableSellBalance = null;
  let balanceRequestId = 0;
  const availableBalanceRow = $('#adAvailableBalance');
  const maxAmountButton = $('#adAmountMaxBtn');

  const renderAvailableSellBalance = (payload = null, loading = false) => {
    const isSell = currentTradeType() === 'SELL';
    if (availableBalanceRow) availableBalanceRow.hidden = !isSell;
    if (maxAmountButton) maxAmountButton.hidden = !isSell;
    if (!isSell) {
      availableSellBalance = null;
      return;
    }
    const asset = String(form.elements.asset?.value || 'USDT').toUpperCase();
    const value = payload?.available;
    if (loading) {
      availableSellBalance = null;
      if (availableBalanceRow) availableBalanceRow.innerHTML = `<span>Available</span><b>Checking ${escapeHtml(asset)} balance...</b>`;
      if (maxAmountButton) maxAmountButton.disabled = true;
      return;
    }
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      availableSellBalance = null;
      if (availableBalanceRow) availableBalanceRow.innerHTML = `<span>Available</span><b class="is-unavailable">Unavailable</b>${payload?.warning ? `<small>${escapeHtml(payload.warning)}</small>` : ''}`;
      if (maxAmountButton) maxAmountButton.disabled = true;
      return;
    }
    availableSellBalance = Math.max(0, Number(value));
    if (availableBalanceRow) availableBalanceRow.innerHTML = `<span>Available</span><b>${adNumber(availableSellBalance, 2)} ${escapeHtml(asset)}</b>`;
    if (maxAmountButton) maxAmountButton.disabled = false;
  };

  const refreshAvailableSellBalance = async (force = false) => {
    const requestId = ++balanceRequestId;
    if (currentTradeType() !== 'SELL') return renderAvailableSellBalance();
    renderAvailableSellBalance(null, true);
    const asset = String(form.elements.asset?.value || 'USDT').toUpperCase();
    try {
      const result = await api(`/api/ads/asset-balance?credentialId=${encodeURIComponent(currentCredentialId())}&asset=${encodeURIComponent(asset)}${force ? '&force=1' : ''}`);
      if (requestId !== balanceRequestId) return;
      renderAvailableSellBalance(result, false);
    } catch (error) {
      if (requestId !== balanceRequestId) return;
      renderAvailableSellBalance({ available: null, warning: error.message || 'Balance check failed.' }, false);
    }
  };

  if (maxAmountButton) maxAmountButton.onclick = () => {
    if (!Number.isFinite(Number(availableSellBalance))) return;
    form.elements.initAmount.value = adInputNumber(availableSellBalance);
    form.elements.initAmount.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const updatePairLabels = () => {
    const asset = String(form.elements.asset.value || 'USDT').toUpperCase();
    const fiat = String(form.elements.fiatUnit.value || 'BDT').toUpperCase();
    form.querySelectorAll('[data-pair-asset]').forEach(el => el.textContent = asset);
    form.querySelectorAll('[data-pair-fiat]').forEach(el => el.textContent = fiat);
    form.querySelectorAll('[data-asset-unit]').forEach(el => el.textContent = asset);
    form.querySelectorAll('[data-fiat-unit]').forEach(el => el.textContent = fiat);
    if ($('#adFeeLabel')) $('#adFeeLabel').textContent = currentTradeType() === 'SELL' ? 'Reserved Fee' : 'Estimated Fee';
  };

  const updateEstimatedFee = () => {
    const amount = Number(form.elements.initAmount?.value || 0);
    const fee = amount * Number(currentRate || 0);
    if ($('#adEstimatedFee')) $('#adEstimatedFee').textContent = `${adNumber(fee, 8)} ${String(form.elements.asset?.value || 'USDT').toUpperCase()}`;
    if ($('#adFeePercent')) $('#adFeePercent').textContent = percentRate(currentRate);
  };

  let feeTimer;
  const refreshFee = async () => {
    const asset = String(form.elements.asset.value || 'USDT').toUpperCase();
    const fiat = String(form.elements.fiatUnit.value || 'BDT').toUpperCase();
    const side = currentTradeType();
    try {
      feeOverview = await api(`/api/ads/fee-rates?credentialId=${encodeURIComponent(currentCredentialId())}&asset=${encodeURIComponent(asset)}&fiat=${encodeURIComponent(fiat)}&tradeType=${encodeURIComponent(side)}`);
      currentRate = adRateForTrade(feeOverview, side);
      updateEstimatedFee();
    } catch (_) { updateEstimatedFee(); }
  };
  const scheduleFeeRefresh = () => { clearTimeout(feeTimer); feeTimer = setTimeout(refreshFee, 180); };
  form.elements.asset.onchange = () => { updatePairLabels(); scheduleFeeRefresh(); refreshAvailableSellBalance(true); };
  form.elements.fiatUnit.onchange = () => { updatePairLabels(); scheduleFeeRefresh(); };
  form.elements.initAmount.oninput = updateEstimatedFee;
  form.querySelectorAll('input[name="tradeType"]').forEach(input => input.onchange = () => { updatePairLabels(); scheduleFeeRefresh(); refreshAvailableSellBalance(true); });
  if (!isEdit && form.elements.credentialId) form.elements.credentialId.onchange = () => {
    editorCredentialId = currentCredentialId();
    const availableIds = new Set(adsPaymentMethodsForCredential(data, editorCredentialId).map(method => Number(method.id)));
    selectedMethodIds = selectedMethodIds.filter(id => availableIds.has(Number(id)));
    renderMethods();
    feeOverview = null;
    scheduleFeeRefresh();
    refreshAvailableSellBalance(true);
  };
  form.querySelectorAll('textarea[maxlength]').forEach(area => area.oninput = () => {
    const counter = form.querySelector(`[data-count-for="${area.name}"]`);
    if (counter) counter.textContent = `${area.value.length}/${area.maxLength}`;
  });
  $('#adFeeTrigger').onclick = async () => {
    if (!feeOverview) await refreshFee();
    openFeeRateSheet(feeOverview || { source: 'configured', rates: [] }, currentTradeType(), Number(form.elements.initAmount.value || 0), form.elements.asset.value);
  };
  updatePairLabels(); updateEstimatedFee(); scheduleFeeRefresh(); refreshAvailableSellBalance(true);

  if ($('#deleteAdvertisementBtn')) $('#deleteAdvertisementBtn').onclick = async () => {
    const message = ad?.advNo
      ? 'Delete this advertisement? It will be closed on Binance first and then removed from the dashboard.'
      : 'Delete this draft?';
    if (!confirm(message)) return;
    const button = $('#deleteAdvertisementBtn');
    button.disabled = true;
    try {
      await api(`/api/ads/${ad.id}`, { method:'DELETE', silent:true });
      notify(ad?.advNo ? 'Advertisement closed on Binance and removed from the dashboard.' : 'Advertisement draft deleted.', 'ok');
      closeModal();
      await refreshEditorAccount();
    } catch (err) {
      setFormMessage('#advertisementFormMessage', err.message || 'Advertisement delete failed.', 'danger');
      button.disabled = false;
    }
  };

  if ($('#copyAdCreateDiagnosticBtn')) $('#copyAdCreateDiagnosticBtn').onclick = async () => {
    const diagnostic = ad?.createPrivilegeDiagnostic || {};
    const supportText = [
      'Binance P2P Advertisement Create API issue',
      `Endpoint: ${diagnostic.endpoint || '/sapi/v1/c2c/ads/post'}`,
      `Error: ${diagnostic.code || '83749'} - ${diagnostic.message || 'You do not have permission, please contact customer service'}`,
      `Attempted at: ${diagnostic.attemptedAt || ad?.updatedAt || '-'}`,
      `API Trade enabled: ${diagnostic.apiCreateReadiness?.permission?.tradeEnabled === true ? 'yes' : (diagnostic.apiCreateReadiness?.permission?.tradeEnabled === false ? 'no' : 'unknown')}`,
      `API trading locked: ${diagnostic.apiCreateReadiness?.tradingStatus?.locked === true ? 'yes' : (diagnostic.apiCreateReadiness?.tradingStatus?.locked === false ? 'no' : 'unknown')}`,
      `Account status: ${diagnostic.apiCreateReadiness?.accountStatus?.status || 'unknown'}`,
      `Merchant active verified: ${diagnostic.merchantOnlinePreflight?.ready === true && diagnostic.merchantOnlinePreflight?.verified === true ? 'yes' : 'no/unknown'}`,
      `Online status: ${diagnostic.merchantStatus?.onlineStatus ?? 'unknown'}`,
      `Business status: ${diagnostic.merchantStatus?.businessStatus ?? 'unknown'}`,
      `Break status: ${diagnostic.merchantStatus?.breakStatus ?? 'unknown'}`,
      `Fiat protocol confirmed: ${diagnostic.merchantStatus?.fiatProtocolConfirm ?? 'unknown'}`,
      `Client types tried: ${(diagnostic.clientTypesTried || []).join(', ') || 'unknown'}`,
      `Request: ${diagnostic.requestSummary?.tradeType || ad?.tradeType || '-'} ${diagnostic.requestSummary?.asset || ad?.asset || '-'} / ${diagnostic.requestSummary?.fiatUnit || ad?.fiatUnit || '-'}`,
      '',
      'API Trading permission and active merchant status were verified before calling /sapi/v1/c2c/ads/post. If 83749 still occurs, please enable or repair the create-ad privilege for this merchant UID/API key.'
    ].join('\n');
    try {
      await navigator.clipboard.writeText(supportText);
      notify('Binance CS details copied.', 'ok');
    } catch (_) {
      window.prompt('Copy these details for Binance CS:', supportText);
    }
  };

  if ($('#publishAdvertisementBtn')) $('#publishAdvertisementBtn').onclick = async () => {
    const button = $('#publishAdvertisementBtn');
    button.disabled = true;
    button.textContent = 'Publishing...';
    try {
      await api(`/api/ads/${ad.id}/publish`, { method:'POST', body: JSON.stringify({ credentialId: currentCredentialId() }), silent:true });
      notify('Advertisement published to Binance.', 'ok');
      closeModal();
      await refreshEditorAccount();
    } catch (err) {
      setFormMessage('#advertisementFormMessage', err.message || 'Binance publish failed. The draft was preserved.', 'danger');
      button.disabled = false;
      button.textContent = 'Publish to Binance';
    }
  };

  form.onsubmit = async event => {
    event.preventDefault();
    if (!selectedMethodIds.length) return setFormMessage('#advertisementFormMessage', 'Select at least one payment method.', 'danger');
    if (selectedMethodIds.length > 5) return setFormMessage('#advertisementFormMessage', 'Select a maximum of 5 payment methods.', 'danger');
    const fd = new FormData(form);
    const obj = Object.fromEntries(fd.entries());
    obj.tradeType = currentTradeType();
    obj.credentialId = currentCredentialId();
    if (!obj.credentialId) return setFormMessage('#advertisementFormMessage', 'Select the Binance account for this advertisement.', 'danger');
    obj.paymentMethodIds = selectedMethodIds.map(Number);
    obj.termsTags = selectedTags;
    obj.additionalKyc = selectedTags.some(tag => /additional[ _-]*kyc/i.test(tag));
    obj.regions = selectedRegions;
    for (const key of ['price', 'initAmount', 'minSingleTransAmount', 'maxSingleTransAmount', 'payTimeLimit', 'priceType', 'buyerRegDaysLimit', 'buyerBtcPositionLimit']) obj[key] = Number(obj[key] || 0);
    obj.registeredRequired = fd.has('registeredRequired');
    obj.holdingRequired = fd.has('holdingRequired');
    obj.nonMerchant = fd.has('nonMerchant');
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = isEdit ? 'Saving...' : 'Creating...';
    try {
      const result = await api(isEdit ? `/api/ads/${ad.id}` : '/api/ads', { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(obj), silent:true });
      if (!isEdit && result?.warning) {
        notify(result.published ? 'Advertisement created on Binance.' : String(result.warning || 'Advertisement saved as a private draft.'), result.published ? 'ok' : 'warn', 8000);
      } else {
        notify(isEdit ? 'Advertisement updated.' : 'Advertisement created.', 'ok');
      }
      closeModal();
      await refreshEditorAccount();
    } catch (err) {
      setFormMessage('#advertisementFormMessage', err.message || 'Advertisement action failed.', 'danger');
      submit.disabled = false;
      submit.textContent = isEdit ? 'Save' : 'Create Advertisement';
    }
  };
}
