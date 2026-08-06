// P2PFlow v1.0.167
// Business Accounting is separated into Overview, Expenses, Income, Capital and Daily Closing pages.

const ACCOUNTING_EXPENSE_CATEGORIES = [
  'Office & Administration', 'Salary & Allowance', 'Rent', 'Internet & Communication',
  'Software & Subscription', 'Equipment & Maintenance', 'Marketing', 'Travel & Transport',
  'Bank / Wallet Charge', 'Tax & Compliance', 'Food & Hospitality', 'Other Expense'
];
const ACCOUNTING_INCOME_CATEGORIES = [
  'Service Income', 'Commission Income', 'Refund / Reimbursement', 'Adjustment Income',
  'Asset Sale', 'Other Business Income'
];
const ACCOUNTING_CAPITAL_CATEGORIES = [
  'Owner Capital', 'Additional Investment', 'Owner Withdrawal', 'Family Expense',
  'Personal Draw', 'Capital Transfer', 'Other Capital Movement'
];
let accountingExpenseCategoriesCache = ACCOUNTING_EXPENSE_CATEGORIES.slice();

async function accountingLoadExpenseCategories(options={}) {
  const data = await api('/api/accounting/expense-categories?_=' + Date.now(), { silent: !!options.background, noAutoReload: true });
  accountingExpenseCategoriesCache = Array.isArray(data.items) && data.items.length ? data.items.slice() : ACCOUNTING_EXPENSE_CATEGORIES.slice();
  return data;
}

function accountingMoney(value) {
  const n = Number(value || 0);
  return `${n < 0 ? '-' : ''}৳${Math.abs(n).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
}

function accountingNumber(value, digits=2) {
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function accountingProfitClass(value) {
  return Number(value || 0) < 0 ? 'negative' : Number(value || 0) > 0 ? 'positive' : 'neutral';
}

function accountingEntryTypeLabel(type) {
  return ({ expense:'Expense', income:'Income', capital_in:'Capital Added', capital_out:'Owner Withdrawal / Family Expense' })[type] || type;
}

function accountingOffsetLabel(minutes) {
  const value = Number(minutes || 0);
  const sign = value >= 0 ? '+' : '-';
  const abs = Math.abs(value);
  return `UTC${sign}${String(Math.floor(abs/60)).padStart(2,'0')}:${String(abs%60).padStart(2,'0')}`;
}

function accountingMetric(label, value, note='', tone='') {
  return `<div class="accounting-kpi ${escapeAttr(tone)}"><span>${escapeHtml(label)}</span><b>${value}</b>${note ? `<small>${escapeHtml(note)}</small>` : ''}</div>`;
}

function accountingTrendBars(rows=[]) {
  if (!rows.length) return '<div class="empty-state">Daily closing data will appear here.</div>';
  const values = rows.map(item => Math.abs(Number(item.netProfit || 0)));
  const max = Math.max(1, ...values);
  return `<div class="accounting-trend-bars">${rows.slice(-30).map(item => {
    const profit = Number(item.netProfit || 0);
    const height = Math.max(8, Math.round(Math.abs(profit) / max * 100));
    return `<div class="accounting-trend-item" title="${escapeAttr(item.businessDate)} · ${escapeAttr(accountingMoney(profit))}"><div class="accounting-trend-value ${profit < 0 ? 'loss' : 'profit'}" style="height:${height}%"></div><span>${escapeHtml(String(item.businessDate || '').slice(5))}</span></div>`;
  }).join('')}</div>`;
}

function accountingLiveBadge(data={}) {
  return `<span class="accounting-realtime-badge"><i></i>Live · ${escapeHtml(fmt(data.generatedAt || new Date().toISOString()))}</span>`;
}

function accountingEntryAmount(item={}) {
  const currency = String(item.currency || 'BDT').toUpperCase();
  if (currency === 'USDT' || currency === 'USD') return `${accountingNumber(item.amount, 8)} USDT`;
  return accountingMoney(item.amount);
}

function accountingPageFilter(pageId=state.page) {
  state.accountingFilters = state.accountingFilters || {};
  state.accountingFilters[pageId] = state.accountingFilters[pageId] || { period:'daily', start:'', end:'', search:'' };
  return state.accountingFilters[pageId];
}

function accountingQuery(filter, extra={}) {
  const qs = new URLSearchParams({ period: filter.period || 'daily', _: String(Date.now()) });
  if (filter.start) qs.set('start', filter.start);
  if (filter.end) qs.set('end', filter.end);
  if (filter.search) qs.set('search', filter.search);
  Object.entries(extra).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') qs.set(key, String(value));
  });
  return qs;
}

async function accountingLoadSummary(pageId, options={}) {
  const filter = accountingPageFilter(pageId);
  return api('/api/accounting?' + accountingQuery(filter).toString(), { silent: !!options.background, noAutoReload: true });
}

async function accountingLoadEntries(pageId, types, options={}) {
  const filter = accountingPageFilter(pageId);
  return api('/api/accounting/entries?' + accountingQuery(filter, { types, page:1, rows:500 }).toString(), { silent: !!options.background, noAutoReload: true });
}

async function accountingLoadCosts(pageId, options={}) {
  const filter = accountingPageFilter(pageId);
  return api('/api/accounting/cost-transactions?' + accountingQuery(filter, { page:1, rows:500 }).toString(), { silent: !!options.background, noAutoReload: true });
}

function accountingFilterToolbar(pageId, data={}, actions='') {
  const filter = accountingPageFilter(pageId);
  return `<div class="accounting-toolbar card mt">
    <form id="accountingFilterForm" class="accounting-filter-form accounting-filter-form-wide">
      <select name="period">
        <option value="daily" ${filter.period==='daily'?'selected':''}>Today</option>
        <option value="monthly" ${filter.period==='monthly'?'selected':''}>This Month</option>
        <option value="yearly" ${filter.period==='yearly'?'selected':''}>This Year</option>
        <option value="lifetime" ${filter.period==='lifetime'?'selected':''}>Lifetime</option>
        <option value="custom" ${filter.period==='custom'?'selected':''}>Custom</option>
      </select>
      <input type="date" name="start" value="${escapeAttr(filter.start || '')}" />
      <input type="date" name="end" value="${escapeAttr(filter.end || '')}" />
      <input type="search" name="search" value="${escapeAttr(filter.search || '')}" placeholder="Search category, note, account or order" />
      <button type="submit" class="secondary">View</button>
    </form>
    <div class="actions accounting-actions">${actions}</div>
  </div>`;
}

function accountingBindFilter(pageId, renderer) {
  const form = $('#accountingFilterForm');
  if (!form) return;
  form.onsubmit = event => {
    event.preventDefault();
    state.accountingFilters = state.accountingFilters || {};
    state.accountingFilters[pageId] = Object.fromEntries(new FormData(event.target));
    renderer();
  };
}

function accountingStartRefresh(pageId, renderer) {
  clearInterval(state.accountingRefreshTimer);
  state.accountingRefreshTimer = setInterval(() => {
    if (state.page === pageId && !document.hidden && !modalOpen()) renderer({ background:true });
  }, 3000);
}

function accountingRenderDone(pageId, renderer, options={}, restoreY=0) {
  if (options.background) requestAnimationFrame(() => window.scrollTo({ top: restoreY, left: 0, behavior: 'auto' }));
  accountingStartRefresh(pageId, renderer);
}

function accountingHero({ eyebrow, amountBdt, amountUsd, data, title, note, tone='' }) {
  return `<div class="accounting-hero realtime">
    <div class="accounting-hero-copy">
      <span class="dash-eyebrow">${escapeHtml(String(eyebrow || '').toUpperCase())}</span>
      <h2>${accountingMoney(amountBdt)}</h2>
      <p>${accountingNumber(amountUsd, 8)} ${escapeHtml(data.settings?.cryptoAsset || 'USDT')}</p>
      <div class="accounting-live-row">
        ${accountingLiveBadge(data)}
        <span>Automatically refreshes every 3 seconds</span>
        <span>${escapeHtml(data.range?.label || '')}</span>
      </div>
    </div>
    <div class="accounting-hero-profit ${tone || accountingProfitClass(amountBdt)}">
      <span>${escapeHtml(title || eyebrow || '')}</span>
      <b>${accountingMoney(amountBdt)}</b>
      <small>${escapeHtml(note || '')}</small>
    </div>
  </div>`;
}

function accountingCategoryGrid(items=[], valueKey='amountBdt', usdKey='amountUsd') {
  if (!items.length) return '<div class="empty-state">No category data in this period.</div>';
  return `<div class="accounting-category-grid">${items.map(item => `<div class="accounting-category-card">
    <div><b>${escapeHtml(item.category || 'General')}</b><span>${Number(item.count || 0)} transaction(s)</span></div>
    <strong>${accountingMoney(item[valueKey] || item.bdt || 0)}</strong>
    ${Number(item[usdKey] || item.usdt || item.capitalValueUsd || 0) ? `<small>${accountingNumber(item[usdKey] || item.usdt || item.capitalValueUsd || 0, 8)} USDT</small>` : ''}
  </div>`).join('')}</div>`;
}

function accountingAccountLabel(item={}) {
  if (item.paymentAccount) {
    return `${item.paymentAccount.method?.name || 'Account'} · ${item.paymentAccount.accountNumber || ''}`;
  }
  if (item.orderNo) return `Order ${item.orderNo}`;
  return '—';
}

function accountingDeleteButton(entryId, canManage) {
  if (!entryId || !canManage) return '';
  return `<button class="icon ghost" data-delete-accounting-entry="${Number(entryId)}" title="Delete">×</button>`;
}

async function accountingDeleteEntry(id, renderer) {
  if (!confirm('Delete this entry? Any linked BDT wallet movement will also be restored.')) return;
  await api('/api/accounting/entries/' + Number(id), { method:'DELETE' });
  notify('Entry deleted.', 'ok');
  await renderer();
}

function accountingBindDeleteButtons(renderer) {
  $$('[data-delete-accounting-entry]').forEach(button => {
    button.onclick = () => accountingDeleteEntry(button.dataset.deleteAccountingEntry, renderer).catch(error => notify(error.message, 'danger'));
  });
}

function accountingSyncButtonHandler(renderer) {
  const button = $('#accountingSyncBtn');
  if (!button) return;
  button.onclick = async event => {
    const current = event.currentTarget;
    current.disabled = true;
    current.textContent = 'Syncing...';
    try {
      await api('/api/accounting/sync-binance', { method:'POST', body:'{}' });
      notify('All connected Binance Funding Wallet balances synced.', 'ok');
      await renderer();
    } catch (error) {
      notify(error.message, 'danger');
    } finally {
      current.disabled = false;
      current.textContent = 'Sync All Binance';
    }
  };
}

function renderCurrentAccountingPage(options={}) {
  if (state.page === 'accounting-expenses') return renderAccountingExpenses(options);
  if (state.page === 'accounting-income') return renderAccountingIncome(options);
  if (state.page === 'accounting-capital') return renderAccountingCapital(options);
  if (state.page === 'accounting-closing') return renderAccountingClosing(options);
  return renderAccounting(options);
}

async function renderAccounting(options={}) {
  const pageId = 'accounting';
  if (state.accountingLoading) return;
  state.accountingLoading = true;
  const restoreY = options.background ? window.scrollY : 0;
  try {
    setTitle('Accounting Overview', 'Owner cash-flow profit and User/Agent performance — expenses, income, capital and closing are in separate subpages.');
    const data = await accountingLoadSummary(pageId, options);
    window.lastAccountingData = data;
    const s = data.summary || {};
    const p = data.permissions || {};
    const range = data.range || {};
    const binance = data.binance || {};
    const isAgent = s.scope === 'agent';
    const heroProfitBdt = isAgent ? s.replacementProfitBdt : s.ownerProfitBdt;
    const heroProfitUsd = isAgent ? s.replacementProfitUsd : s.ownerProfitUsd;
    const maxMethod = Math.max(1, ...(data.byMethod || []).map(item => Math.max(0, Number(item.balance || 0))));

    $('#content').innerHTML = `
      <div class="accounting-hero realtime">
        <div class="accounting-hero-copy">
          <span class="dash-eyebrow">${escapeHtml((isAgent ? `${s.scopeAgentName || 'My'} Performance Profit` : 'Owner Cash-flow Profit').toUpperCase())}</span>
          <h2>${accountingMoney(heroProfitBdt)}</h2>
          <p>${accountingNumber(heroProfitUsd, 8)} ${escapeHtml(data.settings.cryptoAsset)} × ${accountingMoney(s.companyDollarRate)} universal rate</p>
          <div class="accounting-live-row">
            ${accountingLiveBadge(data)}
            <span>Business day closes at 23:59:59 · ${escapeHtml(accountingOffsetLabel(data.settings.timezoneOffsetMinutes))}</span>
            ${s.pendingYieldMissing ? '<span class="accounting-sync-error">Pending cash cannot be valued until a completed BUY provides an actual net yield.</span>' : ''}
            ${binance.error ? `<span class="accounting-sync-error">${escapeHtml(binance.error)}</span>` : ''}
          </div>
        </div>
        <div class="accounting-hero-profit ${accountingProfitClass(heroProfitBdt)}">
          <span>${escapeHtml(range.label || 'Current')} ${isAgent ? 'Performance' : 'Owner'} Profit</span>
          <b>${accountingMoney(heroProfitBdt)}</b>
          <small>${isAgent ? `Actual replacement ${accountingNumber(s.replacementProfitUsd,8)} USDT` : `Current asset ${accountingNumber(s.ownerCurrentBusinessAssetUsd,8)} − adjusted capital ${accountingNumber(s.ownerAdjustedCapitalBaseUsd,8)} USDT`}</small>
        </div>
      </div>

      ${accountingFilterToolbar(pageId, data, `${p.canManage ? '<button id="accountingSettingsBtn" class="secondary">Settings</button>' : ''}${p.canClose ? '<button id="accountingSyncBtn" class="secondary">Sync All Binance</button>' : ''}`)}

      ${!isAgent ? `<div class="accounting-kpi-grid realtime mt">
        ${accountingMetric('Actual Binance Asset', `${accountingNumber(s.ownerActualBinanceUsd,8)} ${escapeHtml(data.settings.cryptoAsset)}`, `${binance.successfulCredentialCount || binance.accounts?.length || 0} connected account(s) synced`, 'crypto')}
        ${accountingMetric('Pending Operating Cash', accountingMoney(s.pendingOperatingCashBdt), `${accountingNumber(s.pendingEstimatedNetUsd,8)} estimated net USDT`, 'cash')}
        ${accountingMetric('Current Business Asset', `${accountingNumber(s.ownerCurrentBusinessAssetUsd,8)} USDT`, accountingMoney(s.ownerCurrentBusinessAssetBdt), 'capital')}
        ${accountingMetric('Adjusted Capital Base', `${accountingNumber(s.ownerAdjustedCapitalBaseUsd,8)} USDT`, 'Opening + capital in − owner withdrawal', 'capital')}
        ${accountingMetric('Owner Profit', `${accountingNumber(s.ownerProfitUsd,8)} USDT`, accountingMoney(s.ownerProfitBdt), accountingProfitClass(s.ownerProfitUsd))}
        ${accountingMetric('Latest Actual BUY Yield', `${accountingNumber(s.latestEffectiveBuyYieldPerBdt,10)} USDT/BDT`, s.latestEffectiveBuyOrderNo ? `Order ${s.latestEffectiveBuyOrderNo}` : 'No completed BUY yet', 'cash')}
      </div>` : `<div class="accounting-kpi-grid realtime mt">
        ${accountingMetric('Actual BUY Net', `${accountingNumber(s.liveBuyCrypto,8)} ${escapeHtml(data.settings.cryptoAsset)}`, `${accountingMoney(s.buyCost)} spent`, 'cash')}
        ${accountingMetric('Actual SELL Outflow', `${accountingNumber(s.liveSellCrypto,8)} ${escapeHtml(data.settings.cryptoAsset)}`, `${accountingMoney(s.sellRevenue)} received`, 'crypto')}
        ${accountingMetric('Operational Profit', `${accountingNumber(s.replacementOperationalProfitUsd,8)} ${escapeHtml(data.settings.cryptoAsset)}`, accountingMoney(s.replacementOperationalProfitBdt), accountingProfitClass(s.replacementOperationalProfitUsd))}
        ${accountingMetric('Carryover Adjustment', `${accountingNumber(s.carryoverAdjustmentUsd,8)} ${escapeHtml(data.settings.cryptoAsset)}`, 'Actual later BUY net − previous estimate', accountingProfitClass(s.carryoverAdjustmentUsd))}
        ${accountingMetric('Performance Profit', `${accountingNumber(s.replacementProfitUsd,8)} ${escapeHtml(data.settings.cryptoAsset)}`, accountingMoney(s.replacementProfitBdt), accountingProfitClass(s.replacementProfitUsd))}
      </div>`}

      ${!isAgent ? `<div class="accounting-main-grid mt">
        <section class="card accounting-panel">
          <div class="section-head"><div><h3>Owner Cash-flow Calculation</h3><span>Capital transactions are managed on the separate Capital page.</span></div></div>
          <div class="accounting-result-list">
            <div><span>Opening Capital</span><b>${accountingNumber(s.ownerOpeningCapitalUsd,8)} USDT</b></div>
            <div><span>Adjusted Capital Base</span><b>${accountingNumber(s.ownerAdjustedCapitalBaseUsd,8)} USDT</b></div>
            <div><span>All Binance Actual USDT</span><b>${accountingNumber(s.ownerActualBinanceUsd,8)} USDT</b></div>
            <div><span>Pending Estimated Net USDT</span><b>${accountingNumber(s.pendingEstimatedNetUsd,8)} USDT</b></div>
            <div><span>Current Business Asset</span><b>${accountingNumber(s.ownerCurrentBusinessAssetUsd,8)} USDT</b></div>
            <div><span>Owner Profit</span><b class="${accountingProfitClass(s.ownerProfitUsd)}">${accountingNumber(s.ownerProfitUsd,8)} USDT · ${accountingMoney(s.ownerProfitBdt)}</b></div>
          </div>
        </section>
        <section class="card accounting-panel">
          <div class="section-head"><div><h3>Profit Reconciliation</h3><span>Owner cash-flow and User/Agent performance remain separate.</span></div></div>
          <div class="accounting-result-list">
            <div><span>Owner Cash-flow Profit</span><b class="${accountingProfitClass(s.ownerProfitUsd)}">${accountingNumber(s.ownerProfitUsd,8)} USDT</b></div>
            <div><span>Sum of User/Agent Profit</span><b class="${accountingProfitClass(s.sumUserProfitUsd)}">${accountingNumber(s.sumUserProfitUsd,8)} USDT</b></div>
            <div><span>Difference / Unallocated Adjustment</span><b class="${accountingProfitClass(s.unallocatedAdjustmentUsd)}">${accountingNumber(s.unallocatedAdjustmentUsd,8)} USDT · ${accountingMoney(s.unallocatedAdjustmentBdt)}</b></div>
          </div>
        </section>
      </div>` : ''}

      <section class="card accounting-panel mt accounting-carryover-explain">
        <div class="section-head"><div><h3>User/Agent Performance</h3><span>${escapeHtml(range.label || '')}</span></div></div>
        <div class="accounting-result-list">
          <div><span>SELL Receipts</span><b>${accountingMoney(s.replacementSellReceipts)}</b></div>
          <div><span>Actual BUY Spend</span><b>${accountingMoney(s.buyCost)}</b></div>
          <div><span>Actual BUY Net Crypto</span><b>${accountingNumber(s.liveBuyCrypto,8)} ${escapeHtml(data.settings.cryptoAsset)}</b></div>
          <div><span>Actual SELL Crypto Outflow</span><b>${accountingNumber(s.liveSellCrypto,8)} ${escapeHtml(data.settings.cryptoAsset)}</b></div>
          <div><span>Pending Operating Cash</span><b>${accountingMoney(s.carryoverOutstandingFiat)}</b></div>
          <div><span>Pending Estimated Net</span><b>${accountingNumber(s.carryoverEstimatedNetQuantity,8)} ${escapeHtml(data.settings.cryptoAsset)}</b></div>
          <div><span>Operational Profit</span><b class="${accountingProfitClass(s.replacementOperationalProfitUsd)}">${accountingNumber(s.replacementOperationalProfitUsd,8)} ${escapeHtml(data.settings.cryptoAsset)}</b></div>
          <div><span>Carryover Adjustment</span><b class="${accountingProfitClass(s.carryoverAdjustmentUsd)}">${accountingNumber(s.carryoverAdjustmentUsd,8)} ${escapeHtml(data.settings.cryptoAsset)}</b></div>
          <div><span>User/Agent Profit</span><b class="${accountingProfitClass(s.replacementProfitUsd)}">${accountingNumber(s.replacementProfitUsd,8)} ${escapeHtml(data.settings.cryptoAsset)}</b></div>
        </div>
      </section>

      <section class="card accounting-panel mt">
        <div class="section-head"><div><h3>Daily User/Agent Breakdown</h3><span>${escapeHtml(range.label || '')}</span></div></div>
        ${table(['Date','BUY Net','SELL Outflow','BUY BDT','SELL BDT','Pending','Operational','Carryover','Profit'], (data.replacementDays || []).map(day => [
          escapeHtml(day.businessDate), accountingNumber(day.buyNetQuantity,8), accountingNumber(day.soldQuantity,8),
          accountingMoney(day.buyFiat), accountingMoney(day.sellFiat), accountingMoney(day.carryoverOutstandingFiat),
          `${accountingNumber(day.operationalProfitUsd,8)} USDT`, `${accountingNumber(day.carryoverAdjustmentUsd,8)} USDT`,
          `${accountingNumber(day.profitUsd,8)} USDT · ${accountingMoney(day.profitBdt)}`
        ]))}
      </section>

      <section class="card accounting-panel mt">
        <div class="section-head"><div><h3>${isAgent ? 'My Performance Result' : 'Agent-wise Performance Result'}</h3><span>Actual order performance; business expenses are maintained separately.</span></div></div>
        ${table(['Agent','Orders','BUY Net','SELL Outflow','BUY BDT','SELL BDT','Operational','Carryover','Profit USDT','Profit BDT'], (data.byAgent || []).map(item => [
          escapeHtml(item.name), item.orders, accountingNumber(item.buyCrypto,8), accountingNumber(item.sellCrypto,8),
          accountingMoney(item.buyVolume), accountingMoney(item.sellVolume), accountingNumber(item.operationalProfitUsd,8),
          accountingNumber(item.carryoverAdjustmentUsd,8), accountingNumber(item.profitUsd,8), accountingMoney(item.profitBdt)
        ]))}
      </section>

      ${!isAgent ? `<section class="card accounting-panel mt accounting-capital-panel">
        <div class="section-head"><div><h3>Pending Cash Distribution</h3><span>Estimated using the latest completed BUY actual net yield</span></div><b>${accountingMoney(s.cashBalance)}</b></div>
        <div class="accounting-method-list">
          ${(data.byMethod || []).map(item => { const usd = Number(item.balance || 0) * Number(s.latestEffectiveBuyYieldPerBdt || 0); const capital = usd * Number(s.companyDollarRate || 0); return `<div class="accounting-method-row"><div><b>${escapeHtml(item.name)}</b><span>${item.accountCount} accounts · ${accountingNumber(usd,8)} USDT</span></div><div class="accounting-method-bar"><span style="width:${Math.max(2, Math.round(Math.max(0, Number(item.balance || 0))/maxMethod*100))}%"></span></div><strong>${accountingMoney(capital)}</strong></div>`; }).join('') || '<div class="empty-state">No payment account balance found.</div>'}
        </div>
      </section>` : ''}`;

    accountingBindFilter(pageId, renderAccounting);
    if ($('#accountingSettingsBtn')) $('#accountingSettingsBtn').onclick = () => openAccountingSettingsModal(data);
    accountingSyncButtonHandler(renderAccounting);
    accountingRenderDone(pageId, renderAccounting, options, restoreY);
  } finally {
    state.accountingLoading = false;
  }
}

async function renderAccountingExpenses(options={}) {
  const pageId = 'accounting-expenses';
  if (state.accountingLoading) return;
  state.accountingLoading = true;
  const restoreY = options.background ? window.scrollY : 0;
  try {
    setTitle('Expense', 'Expense totals, categories and transaction history.');
    const [data, costs, categoryData] = await Promise.all([accountingLoadSummary(pageId, options), accountingLoadCosts(pageId, options), accountingLoadExpenseCategories(options)]);
    const s = data.summary || {};
    const p = data.permissions || {};
    const t = costs.totals || {};
    const totalBdt = Number(t.amountBdt ?? s.businessCosts?.totalBusinessCostBdt ?? 0);
    const totalUsd = Number(t.amountUsd || 0);
    $('#content').innerHTML = `
      ${accountingHero({ eyebrow:'Total Expense', amountBdt:totalBdt, amountUsd:totalUsd, data, title:data.range?.label || 'Expense Total', note:`${costs.total || 0} recorded cost transaction(s)`, tone:'negative' })}
      ${accountingFilterToolbar(pageId, data, p.canManage ? '<button id="accountingExpenseCategoriesBtn" class="secondary">Categories</button><button id="accountingAddExpenseBtn">Add Expense</button>' : '')}
      <div class="accounting-kpi-grid realtime mt">
        ${accountingMetric('Total Reported Cost', accountingMoney(totalBdt), `${accountingNumber(totalUsd,8)} USDT`, 'expense')}
        ${accountingMetric('Manual Expense BDT', accountingMoney(t.manualExpenseBdt), 'Manual entries', 'expense')}
        ${accountingMetric('Manual Expense USDT', `${accountingNumber(t.manualExpenseUsd,8)} USDT`, accountingMoney(Number(t.manualExpenseUsd || 0) * Number(s.companyDollarRate || 0)), 'expense')}
        ${accountingMetric('Transfer Charges', accountingMoney(t.transferChargeBdt), 'Automatic split-payment charges', 'expense')}
        ${accountingMetric('Binance Fees', `${accountingNumber(t.binanceFeeUsd,8)} USDT`, accountingMoney(Number(t.binanceFeeUsd || 0) * Number(s.companyDollarRate || 0)), 'crypto')}
        ${accountingMetric('Transactions', accountingNumber(costs.total,0), 'Manual, transfer and Binance cost records', 'cash')}
      </div>
      <section class="card accounting-panel mt">
        <div class="section-head"><div><h3>Expense Categories</h3><span>Manual expenses, payment charges and Binance fee categories</span></div></div>
        ${accountingCategoryGrid(costs.byCategory || [])}
      </section>
      <section class="card accounting-panel mt">
        <div class="section-head"><div><h3>Expense Transaction History</h3><span>Complete expense activity</span></div><b>${costs.total || 0}</b></div>
        ${table(['Date & Time','Source','Category','Account / Order','Agent','Note','BDT Value','USDT','Action'], (costs.items || []).map(item => [
          escapeHtml(fmt(item.createdAt || item.businessDate)),
          `<span class="badge ${item.source.includes('refund') ? 'ok' : item.source.includes('binance') ? 'blue' : 'danger'}">${escapeHtml(item.sourceLabel || item.source)}</span>`,
          escapeHtml(item.category || 'General'), escapeHtml(accountingAccountLabel(item)), escapeHtml(item.agent?.name || 'Company'),
          escapeHtml(item.note || '—'), `<b class="${Number(item.amountBdt || 0) < 0 ? 'positive' : 'negative'}">${accountingMoney(item.amountBdt)}</b>`,
          Number(item.amountUsd || 0) ? `${accountingNumber(item.amountUsd,8)} USDT` : '—', accountingDeleteButton(item.entryId, p.canManage)
        ]))}
      </section>
      `;

    accountingBindFilter(pageId, renderAccountingExpenses);
    if ($('#accountingExpenseCategoriesBtn')) $('#accountingExpenseCategoriesBtn').onclick = () => openExpenseCategoriesModal(categoryData, renderAccountingExpenses);
    if ($('#accountingAddExpenseBtn')) $('#accountingAddExpenseBtn').onclick = () => openAccountingEntryModal(data, { title:'Add Expense', submitLabel:'Save Expense', types:['expense'], defaultType:'expense' });
    accountingBindDeleteButtons(renderAccountingExpenses);
    accountingRenderDone(pageId, renderAccountingExpenses, options, restoreY);
  } finally {
    state.accountingLoading = false;
  }
}

async function renderAccountingIncome(options={}) {
  const pageId = 'accounting-income';
  if (state.accountingLoading) return;
  state.accountingLoading = true;
  const restoreY = options.background ? window.scrollY : 0;
  try {
    setTitle('Business Income', 'Other business income categories and complete transaction history.');
    const [data, entries] = await Promise.all([accountingLoadSummary(pageId, options), accountingLoadEntries(pageId, 'income', options)]);
    const p = data.permissions || {};
    const totals = entries.totals || {};
    const usdBdt = Number(totals.usdt || 0) * Number(data.summary?.companyDollarRate || 0);
    const totalBdt = Number(totals.bdt || 0) + usdBdt;
    $('#content').innerHTML = `
      ${accountingHero({ eyebrow:'Business Income', amountBdt:totalBdt, amountUsd:totals.usdt || 0, data, title:data.range?.label || 'Income Total', note:`${entries.total || 0} income transaction(s)`, tone:'positive' })}
      ${accountingFilterToolbar(pageId, data, p.canManage ? '<button id="accountingAddIncomeBtn">Add Income</button>' : '')}
      <div class="accounting-kpi-grid realtime mt">
        ${accountingMetric('Income BDT', accountingMoney(totals.bdt), `${entries.total || 0} transaction(s)`, 'positive')}
        ${accountingMetric('Income USDT', `${accountingNumber(totals.usdt,8)} USDT`, accountingMoney(usdBdt), 'positive')}
        ${accountingMetric('Combined Value', accountingMoney(totalBdt), 'Display value at universal rate', 'positive')}
      </div>
      <section class="card accounting-panel mt">
        <div class="section-head"><div><h3>Income Categories</h3><span>Category-wise transaction totals</span></div></div>
        ${accountingCategoryGrid(entries.byCategory || [], 'bdt', 'usdt')}
      </section>
      <section class="card accounting-panel mt">
        <div class="section-head"><div><h3>Income Transaction History</h3><span>Wallet/account movement is recorded immediately for BDT income.</span></div><b>${entries.total || 0}</b></div>
        ${table(['Date & Time','Category','Payment Account','Agent','Note','Amount','Entered By','Action'], (entries.items || []).map(item => [
          escapeHtml(fmt(item.createdAt || item.businessDate)), escapeHtml(item.category || 'General'), escapeHtml(accountingAccountLabel(item)),
          escapeHtml(item.agent?.name || 'Company'), escapeHtml(item.note || '—'), `<b class="positive">+${escapeHtml(accountingEntryAmount(item).replace('-',''))}</b>`,
          escapeHtml(item.createdByUser?.name || item.createdByUser?.username || '—'), accountingDeleteButton(item.id, p.canManage)
        ]))}
      </section>`;
    accountingBindFilter(pageId, renderAccountingIncome);
    if ($('#accountingAddIncomeBtn')) $('#accountingAddIncomeBtn').onclick = () => openAccountingEntryModal(data, { title:'Add Income', submitLabel:'Save Income', types:['income'], defaultType:'income' });
    accountingBindDeleteButtons(renderAccountingIncome);
    accountingRenderDone(pageId, renderAccountingIncome, options, restoreY);
  } finally {
    state.accountingLoading = false;
  }
}

async function renderAccountingCapital(options={}) {
  const pageId = 'accounting-capital';
  if (state.accountingLoading) return;
  state.accountingLoading = true;
  const restoreY = options.background ? window.scrollY : 0;
  try {
    setTitle('Capital', 'Capital add, owner withdrawal/family expense and complete capital transaction history.');
    const [data, entries] = await Promise.all([accountingLoadSummary(pageId, options), accountingLoadEntries(pageId, 'capital_in,capital_out', options)]);
    const s = data.summary || {};
    const p = data.permissions || {};
    const added = Number(entries.totals?.capitalInUsd || 0);
    const withdrawn = Number(entries.totals?.capitalOutUsd || 0);
    const addedBdt = (entries.items || []).filter(item => item.type === 'capital_in' && String(item.currency || 'BDT').toUpperCase() === 'BDT').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const withdrawnBdt = (entries.items || []).filter(item => item.type === 'capital_out' && String(item.currency || 'BDT').toUpperCase() === 'BDT').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    $('#content').innerHTML = `
      <div class="accounting-hero realtime">
        <div class="accounting-hero-copy">
          <span class="dash-eyebrow">CURRENT ADJUSTED CAPITAL BASE</span>
          <h2>${accountingNumber(s.ownerAdjustedCapitalBaseUsd,8)} USDT</h2>
          <p>${accountingMoney(Number(s.ownerAdjustedCapitalBaseUsd || 0) * Number(s.companyDollarRate || 0))}</p>
          <div class="accounting-live-row">${accountingLiveBadge(data)}</div>
        </div>
        <div class="accounting-hero-profit capital">
          <span>Current Business Asset</span>
          <b>${accountingNumber(s.ownerCurrentBusinessAssetUsd,8)} USDT</b>
          <small>Owner Profit: ${accountingNumber(s.ownerProfitUsd,8)} USDT · ${accountingMoney(s.ownerProfitBdt)}</small>
        </div>
      </div>
      ${accountingFilterToolbar(pageId, data, p.canManage ? '<button id="accountingOpeningCapitalBtn" class="secondary">Opening Capital</button><button id="accountingCapitalInBtn">Add Capital</button><button id="accountingCapitalOutBtn" class="danger">Withdraw Capital</button>' : '')}
      <div class="accounting-kpi-grid realtime mt">
        ${accountingMetric('Opening Capital', `${accountingNumber(s.ownerOpeningCapitalUsd,8)} USDT`, s.ownerOpeningCapitalSource || '', 'capital')}
        ${accountingMetric('Capital Added', `+${accountingNumber(added,8)} USDT`, `${accountingMoney(addedBdt)} original BDT`, 'positive')}
        ${accountingMetric('Capital Withdrawn', `−${accountingNumber(withdrawn,8)} USDT`, `${accountingMoney(withdrawnBdt)} original BDT`, 'negative')}
        ${accountingMetric('Adjusted Capital Base', `${accountingNumber(s.ownerAdjustedCapitalBaseUsd,8)} USDT`, 'Current capital base', 'capital')}
        ${accountingMetric('Current Business Asset', `${accountingNumber(s.ownerCurrentBusinessAssetUsd,8)} USDT`, accountingMoney(s.ownerCurrentBusinessAssetBdt), 'crypto')}
        ${accountingMetric('Owner Profit', `${accountingNumber(s.ownerProfitUsd,8)} USDT`, accountingMoney(s.ownerProfitBdt), accountingProfitClass(s.ownerProfitUsd))}
      </div>
      <div class="accounting-main-grid mt">
        <section class="card accounting-panel">
          <div class="section-head"><div><h3>Capital Summary</h3><span>${escapeHtml(data.range?.label || '')}</span></div></div>
          <div class="accounting-result-list">
            <div><span>Opening Capital</span><b>${accountingNumber(s.ownerOpeningCapitalUsd,8)} USDT</b></div>
            <div><span>Capital Added</span><b class="positive">+${accountingNumber(s.ownerCapitalInUsd,8)} USDT</b></div>
            <div><span>Owner Withdrawal / Family Expense</span><b class="negative">−${accountingNumber(s.ownerCapitalOutUsd,8)} USDT</b></div>
            <div><span>Adjusted Capital Base</span><b>${accountingNumber(s.ownerAdjustedCapitalBaseUsd,8)} USDT</b></div>
          </div>
        </section>
        <section class="card accounting-panel">
          <div class="section-head"><div><h3>Capital Categories</h3><span>Category-wise movement history</span></div></div>
          ${accountingCategoryGrid(entries.byCategory || [], 'bdt', 'capitalValueUsd')}
        </section>
      </div>
      <section class="card accounting-panel mt">
        <div class="section-head"><div><h3>Capital Transaction History</h3><span>Add, withdraw, family expense and personal draw records</span></div><b>${entries.total || 0}</b></div>
        ${table(['Date & Time','Movement','Category','Payment Account','Agent','Original Amount','Capital Value','Valuation','Note','Action'], (entries.items || []).map(item => [
          escapeHtml(fmt(item.createdAt || item.businessDate)), `<span class="badge ${item.type === 'capital_in' ? 'ok' : 'danger'}">${escapeHtml(accountingEntryTypeLabel(item.type))}</span>`,
          escapeHtml(item.category || 'Owner Capital'), escapeHtml(accountingAccountLabel(item)), escapeHtml(item.agent?.name || 'Company'),
          `<b class="${item.type === 'capital_in' ? 'positive' : 'negative'}">${item.type === 'capital_in' ? '+' : '−'}${escapeHtml(accountingEntryAmount(item).replace('-',''))}</b>`,
          `${accountingNumber(item.capitalValueUsd,8)} USDT`, escapeHtml(String(item.capitalValuationSource || 'direct').replaceAll('_',' ')),
          escapeHtml(item.note || '—'), accountingDeleteButton(item.id, p.canManage)
        ]))}
      </section>`;

    accountingBindFilter(pageId, renderAccountingCapital);
    if ($('#accountingOpeningCapitalBtn')) $('#accountingOpeningCapitalBtn').onclick = () => openOpeningCapitalModal(data);
    if ($('#accountingCapitalInBtn')) $('#accountingCapitalInBtn').onclick = () => openAccountingEntryModal(data, { title:'Add Capital', submitLabel:'Save Capital', types:['capital_in'], defaultType:'capital_in' });
    if ($('#accountingCapitalOutBtn')) $('#accountingCapitalOutBtn').onclick = () => openAccountingEntryModal(data, { title:'Withdraw Capital', submitLabel:'Save Withdrawal', types:['capital_out'], defaultType:'capital_out' });
    accountingBindDeleteButtons(renderAccountingCapital);
    accountingRenderDone(pageId, renderAccountingCapital, options, restoreY);
  } finally {
    state.accountingLoading = false;
  }
}

async function renderAccountingClosing(options={}) {
  const pageId = 'accounting-closing';
  if (state.accountingLoading) return;
  state.accountingLoading = true;
  const restoreY = options.background ? window.scrollY : 0;
  try {
    setTitle('Daily Closing', 'Automatic 23:59:59 snapshots, manual close controls and closing history.');
    const data = await accountingLoadSummary(pageId, options);
    const s = data.summary || {};
    const p = data.permissions || {};
    $('#content').innerHTML = `
      <div class="accounting-hero realtime">
        <div class="accounting-hero-copy">
          <span class="dash-eyebrow">DAILY BUSINESS CLOSING</span>
          <h2>${accountingNumber(s.ownerCurrentBusinessAssetUsd,8)} USDT</h2>
          <p>Current business asset to be locked as the next opening capital</p>
          <div class="accounting-live-row">${accountingLiveBadge(data)}<span>Scheduled: 23:59:59 · ${escapeHtml(accountingOffsetLabel(data.settings.timezoneOffsetMinutes))}</span><span>Automatic close: ${data.settings.autoClose ? 'Enabled' : 'Disabled'}</span></div>
        </div>
        <div class="accounting-hero-profit ${accountingProfitClass(s.ownerProfitBdt)}">
          <span>Current Owner Profit</span><b>${accountingMoney(s.ownerProfitBdt)}</b><small>${accountingNumber(s.ownerProfitUsd,8)} USDT</small>
        </div>
      </div>
      ${accountingFilterToolbar(pageId, data, `${p.canManage ? '<button id="accountingSettingsBtn" class="secondary">Settings</button>' : ''}${p.canClose ? '<button id="accountingSyncBtn" class="secondary">Sync All Binance</button><button id="accountingCloseBtn" class="dark">Close Day</button>' : ''}`)}
      <div class="accounting-kpi-grid realtime mt">
        ${accountingMetric('Closing Asset', `${accountingNumber(s.ownerCurrentBusinessAssetUsd,8)} USDT`, accountingMoney(s.ownerCurrentBusinessAssetBdt), 'capital')}
        ${accountingMetric('Adjusted Capital Base', `${accountingNumber(s.ownerAdjustedCapitalBaseUsd,8)} USDT`, 'Capital movements already applied', 'capital')}
        ${accountingMetric('Owner Profit', `${accountingNumber(s.ownerProfitUsd,8)} USDT`, accountingMoney(s.ownerProfitBdt), accountingProfitClass(s.ownerProfitUsd))}
        ${accountingMetric('User/Agent Profit', `${accountingNumber(s.sumUserProfitUsd,8)} USDT`, accountingMoney(s.sumUserProfitBdt), accountingProfitClass(s.sumUserProfitUsd))}
        ${accountingMetric('Unallocated Difference', `${accountingNumber(s.unallocatedAdjustmentUsd,8)} USDT`, accountingMoney(s.unallocatedAdjustmentBdt), accountingProfitClass(s.unallocatedAdjustmentUsd))}
        ${accountingMetric('Saved Closes', accountingNumber((data.closes || []).length,0), 'Latest closing snapshots', 'cash')}
      </div>
      <div class="accounting-main-grid mt">
        <section class="card accounting-panel">
          <div class="section-head"><div><h3>Closing Snapshot</h3><span>${escapeHtml(data.range?.label || '')}</span></div></div>
          <div class="accounting-result-list">
            <div><span>All Binance Actual USDT</span><b>${accountingNumber(s.ownerActualBinanceUsd,8)} USDT</b></div>
            <div><span>Pending Estimated Net USDT</span><b>${accountingNumber(s.pendingEstimatedNetUsd,8)} USDT</b></div>
            <div><span>Closing Current Business Asset</span><b>${accountingNumber(s.ownerCurrentBusinessAssetUsd,8)} USDT</b></div>
            <div><span>Next Day Opening Capital</span><b>${accountingNumber(s.ownerCurrentBusinessAssetUsd,8)} USDT</b></div>
          </div>
        </section>
        <section class="card accounting-panel">
          <div class="section-head"><div><h3>Owner Profit Trend</h3><span>Closed-day Owner cash-flow profit</span></div></div>
          ${accountingTrendBars(data.trend || [])}
        </section>
      </div>
      <section class="card accounting-panel mt">
        <div class="section-head"><div><h3>Daily Closing History</h3><span>Current asset, capital base, Owner profit and User/Agent reconciliation</span></div><b>${(data.closes || []).length}</b></div>
        ${table(['Business Date','Closed At','Current Asset','Capital Base','Owner Profit','User Profit','Difference','Source'], (data.closes || []).map(item => [
          escapeHtml(item.businessDate || ''), escapeHtml(fmt(item.closedAt || item.createdAt)),
          `${accountingNumber(item.ownerCurrentBusinessAssetUsd ?? item.totalUsdEquivalent,8)} USDT`, `${accountingNumber(item.ownerAdjustedCapitalBaseUsd ?? 0,8)} USDT`,
          `<b class="${accountingProfitClass(item.ownerProfitBdt ?? item.netProfit)}">${accountingNumber(item.ownerProfitUsd ?? 0,8)} USDT · ${accountingMoney(item.ownerProfitBdt ?? item.netProfit ?? 0)}</b>`,
          `${accountingNumber(item.sumUserProfitUsd ?? item.replacementProfitUsd ?? 0,8)} USDT`, `${accountingNumber(item.unallocatedAdjustmentUsd ?? 0,8)} USDT`, escapeHtml(item.source || 'auto')
        ]))}
      </section>`;

    accountingBindFilter(pageId, renderAccountingClosing);
    if ($('#accountingSettingsBtn')) $('#accountingSettingsBtn').onclick = () => openAccountingSettingsModal(data);
    if ($('#accountingCloseBtn')) $('#accountingCloseBtn').onclick = () => openAccountingCloseModal(data);
    accountingSyncButtonHandler(renderAccountingClosing);
    accountingRenderDone(pageId, renderAccountingClosing, options, restoreY);
  } finally {
    state.accountingLoading = false;
  }
}

function accountingCategoriesForType(type) {
  if (type === 'expense') return accountingExpenseCategoriesCache;
  if (type === 'income') return ACCOUNTING_INCOME_CATEGORIES;
  return ACCOUNTING_CAPITAL_CATEGORIES;
}

async function openAccountingEntryModal(data={}, options={}) {
  const [accountsData, agentsData, expenseCategoryData] = await Promise.all([
    api('/api/payment-accounts').catch(() => ({ items:[] })),
    api('/api/agents').catch(() => ({ items:[] })),
    accountingLoadExpenseCategories().catch(() => ({ items:ACCOUNTING_EXPENSE_CATEGORIES.slice() }))
  ]);
  if (Array.isArray(expenseCategoryData.items) && expenseCategoryData.items.length) accountingExpenseCategoriesCache = expenseCategoryData.items.slice();
  const types = Array.isArray(options.types) && options.types.length ? options.types : ['expense','income','capital_in','capital_out'];
  const defaultType = options.defaultType || types[0];
  const today = String(data.range?.businessDate || new Date().toISOString().slice(0,10));
  const typeField = types.length > 1
    ? `<div><label>Type</label><select name="type" required>${types.map(type => `<option value="${escapeAttr(type)}" ${type===defaultType?'selected':''}>${escapeHtml(accountingEntryTypeLabel(type))}</option>`).join('')}</select></div>`
    : `<input name="type" type="hidden" value="${escapeAttr(defaultType)}" />`;
  const categoryOptions = [...new Set(types.flatMap(accountingCategoriesForType))];
  modal(options.title || 'Add Accounting Entry', `<form id="accountingEntryForm" class="form-grid accounting-form">
    ${typeField}
    <div><label>Currency</label><select name="currency"><option value="BDT">BDT</option><option value="USDT">USDT</option></select></div>
    <div><label>Amount</label><input name="amount" type="number" min="0.00000001" step="0.00000001" required /></div>
    <div class="full-row accounting-category-entry-field"><label>Category</label><div class="accounting-inline-input"><select name="category" id="accountingCategorySelect" required>${categoryOptions.map(category => `<option value="${escapeAttr(category)}">${escapeHtml(category)}</option>`).join('')}</select>${types.includes('expense') ? '<button type="button" id="accountingNewExpenseCategoryBtn" class="secondary">New Category</button>' : ''}</div></div>
    ${types.includes('expense') ? '<div class="full-row accounting-inline-category-create hidden" id="accountingInlineExpenseCategory"><input id="accountingInlineExpenseCategoryName" maxlength="80" autocomplete="off" placeholder="Category name" /><button type="button" id="accountingInlineExpenseCategorySave">Save Category</button><button type="button" id="accountingInlineExpenseCategoryCancel" class="secondary">Cancel</button><div id="accountingInlineExpenseCategoryMessage"></div></div>' : ''}
    <div><label>Business Date</label><input name="businessDate" type="date" value="${escapeAttr(today)}" required /></div>
    <div id="capitalUsdEquivalentField"><label>Capital USDT Equivalent (Optional)</label><input name="capitalValueUsd" type="number" min="0" step="0.00000001" placeholder="Auto from latest actual BUY yield" /></div>
    <div id="accountingPaymentAccountField"><label>Payment Account</label><select name="paymentAccountId"><option value="">Select account</option>${(accountsData.items || []).map(item => `<option value="${item.id}">${escapeHtml(item.method?.name || '')} · ${escapeHtml(item.accountNumber)} · ${accountingMoney(item.currentBalance)}</option>`).join('')}</select><small>Required for BDT entries.</small></div>
    <div><label>Agent (Optional)</label><select name="agentId"><option value="">Company</option>${(agentsData.items || []).map(item => `<option value="${item.agentId || item.id}">${escapeHtml(item.name)}</option>`).join('')}</select></div>
    <div class="full-row"><label>Note / Reference</label><textarea name="note" rows="3"></textarea></div>
    <div class="full-row" id="accountingEntryMessage"></div>
    <div class="full-row"><button type="submit">${escapeHtml(options.submitLabel || 'Save')}</button></div>
  </form>`);
  const form = $('#accountingEntryForm');
  const syncFields = () => {
    const type = form.elements.type.value;
    const isBdt = form.currency.value === 'BDT';
    const isCapital = ['capital_in','capital_out'].includes(type);
    form.paymentAccountId.required = isBdt;
    $('#accountingPaymentAccountField').style.opacity = isBdt ? '1' : '.6';
    $('#capitalUsdEquivalentField').style.display = isCapital && isBdt ? '' : 'none';
    const categorySelect = $('#accountingCategorySelect');
    const currentCategory = categorySelect.value;
    categorySelect.innerHTML = accountingCategoriesForType(type).map(category => `<option value="${escapeAttr(category)}">${escapeHtml(category)}</option>`).join('');
    if ([...categorySelect.options].some(option => option.value === currentCategory)) categorySelect.value = currentCategory;
    const newCategoryButton = $('#accountingNewExpenseCategoryBtn');
    if (newCategoryButton) newCategoryButton.style.display = type === 'expense' ? '' : 'none';
    if (type !== 'expense' && $('#accountingInlineExpenseCategory')) $('#accountingInlineExpenseCategory').classList.add('hidden');
  };
  form.currency.onchange = syncFields;
  if (form.elements.type.tagName === 'SELECT') form.elements.type.onchange = syncFields;
  if ($('#accountingNewExpenseCategoryBtn')) $('#accountingNewExpenseCategoryBtn').onclick = () => {
    $('#accountingInlineExpenseCategory').classList.remove('hidden');
    $('#accountingInlineExpenseCategoryName').focus();
  };
  if ($('#accountingInlineExpenseCategoryCancel')) $('#accountingInlineExpenseCategoryCancel').onclick = () => {
    $('#accountingInlineExpenseCategory').classList.add('hidden');
    $('#accountingInlineExpenseCategoryName').value = '';
    setFormMessage('#accountingInlineExpenseCategoryMessage', '');
  };
  if ($('#accountingInlineExpenseCategorySave')) $('#accountingInlineExpenseCategorySave').onclick = async () => {
    const name = String($('#accountingInlineExpenseCategoryName').value || '').replace(/\s+/g, ' ').trim();
    try {
      const result = await api('/api/accounting/expense-categories', { method:'POST', body: JSON.stringify({ name }) });
      accountingExpenseCategoriesCache = result.items || accountingExpenseCategoriesCache;
      syncFields();
      const categorySelect = $('#accountingCategorySelect');
      if ([...categorySelect.options].some(option => option.value === (result.item || name))) categorySelect.value = result.item || name;
      $('#accountingInlineExpenseCategory').classList.add('hidden');
      $('#accountingInlineExpenseCategoryName').value = '';
      setFormMessage('#accountingInlineExpenseCategoryMessage', '');
      notify('Expense category saved.', 'ok');
    } catch (error) { setFormMessage('#accountingInlineExpenseCategoryMessage', error.message); }
  };
  syncFields();
  form.onsubmit = async event => {
    event.preventDefault();
    try {
      await api('/api/accounting/entries', { method:'POST', body: JSON.stringify(formObj(event.target)) });
      closeModal();
      notify(`${accountingEntryTypeLabel(form.elements.type.value)} saved.`, 'ok');
      await renderCurrentAccountingPage();
    } catch (error) {
      setFormMessage('#accountingEntryMessage', error.message);
    }
  };
}

function openExpenseCategoriesModal(data={}, renderer=renderAccountingExpenses) {
  const items = Array.isArray(data.items) ? data.items : accountingExpenseCategoriesCache;
  modal('Expense Categories', `<div class="accounting-category-manager">
    <form id="expenseCategoryManagerCreate" class="accounting-inline-input accounting-category-manager-create">
      <input name="name" maxlength="80" autocomplete="off" placeholder="New category name" required />
      <button type="submit">Add Category</button>
    </form>
    <div id="expenseCategoryManagerMessage"></div>
    <div id="expenseCategoryManagerList" class="accounting-category-manager-list">
      ${items.map(name => `<div><span>${escapeHtml(name)}</span><button type="button" class="icon ghost" data-delete-expense-category="${escapeAttr(name)}" title="Delete">×</button></div>`).join('')}
    </div>
  </div>`);
  $('#expenseCategoryManagerCreate').onsubmit = async event => {
    event.preventDefault();
    const name = String(new FormData(event.target).get('name') || '').replace(/\s+/g, ' ').trim();
    try {
      const result = await api('/api/accounting/expense-categories', { method:'POST', body: JSON.stringify({ name }) });
      accountingExpenseCategoriesCache = result.items || accountingExpenseCategoriesCache;
      closeModal();
      notify('Expense category saved.', 'ok');
      await renderer();
    } catch (error) { setFormMessage('#expenseCategoryManagerMessage', error.message); }
  };
  $$('[data-delete-expense-category]').forEach(button => {
    button.onclick = async () => {
      const name = button.dataset.deleteExpenseCategory;
      if (!confirm(`Delete Expense category "${name}"?`)) return;
      try {
        const result = await api('/api/accounting/expense-categories?name=' + encodeURIComponent(name), { method:'DELETE' });
        accountingExpenseCategoriesCache = result.items || accountingExpenseCategoriesCache;
        notify('Expense category deleted.', 'ok');
        closeModal();
        await renderer();
      } catch (error) { notify(error.message, 'danger'); }
    };
  });
}
function openOpeningCapitalModal(data={}) {
  const settings = data.settings || {};
  modal('Opening Capital', `<form id="openingCapitalForm" class="form-grid accounting-form">
    <div><label>Opening Owner Capital (USDT)</label><input name="accountingOpeningCapitalUsd" type="number" min="0" step="0.00000001" value="${escapeAttr(settings.openingCapitalUsd || 0)}" required /></div>
    <div><label>Accounting Start Date</label><input name="accountingOpeningDate" type="date" value="${escapeAttr(settings.openingDate || '')}" required /></div>
    <div class="full-row" id="openingCapitalMessage"></div>
    <div class="full-row"><button type="submit">Save Opening Capital</button></div>
  </form>`);
  $('#openingCapitalForm').onsubmit = async event => {
    event.preventDefault();
    try {
      await api('/api/accounting/opening-capital', { method:'PATCH', body: JSON.stringify(formObj(event.target)) });
      closeModal();
      notify('Opening capital saved.', 'ok');
      await renderAccountingCapital();
    } catch (error) { setFormMessage('#openingCapitalMessage', error.message); }
  };
}

function openAccountingSettingsModal(data={}) {
  const settings = data.settings || {};
  modal('Accounting Settings', `<form id="accountingSettingsForm" class="form-grid accounting-form">
    <div><label>Crypto Asset</label><select name="accountingCryptoAsset"><option value="USDT" ${settings.cryptoAsset==='USDT'?'selected':''}>USDT</option><option value="FDUSD" ${settings.cryptoAsset==='FDUSD'?'selected':''}>FDUSD</option><option value="USDC" ${settings.cryptoAsset==='USDC'?'selected':''}>USDC</option></select></div>
    <div><label>Universal Profit Rate (BDT)</label><input name="accountingCompanyDollarRate" type="number" min="0.0001" step="0.0001" value="${escapeAttr(settings.companyDollarRate || 118)}" required /></div>
    <div><label>Manual P2P BUY Rate (BDT)</label><input name="accountingP2pBuyRate" type="number" min="0" step="0.0001" value="${escapeAttr(settings.configuredP2pBuyRate || settings.p2pBuyRate || 0)}" /><small>Used only to value BDT capital when no completed BUY actual yield exists.</small></div>
    <div class="check-field"><label><input name="accountingAutoP2pBuyRate" type="checkbox" ${settings.autoP2pBuyRate?'checked':''}/> Prefer the latest completed BUY actual rate</label></div>
    <div><label>Business Timezone</label><select name="accountingTimezoneOffsetMinutes"><option value="360" ${Number(settings.timezoneOffsetMinutes)===360?'selected':''}>Bangladesh · UTC+06:00</option><option value="330" ${Number(settings.timezoneOffsetMinutes)===330?'selected':''}>India · UTC+05:30</option><option value="240" ${Number(settings.timezoneOffsetMinutes)===240?'selected':''}>UAE · UTC+04:00</option><option value="0" ${Number(settings.timezoneOffsetMinutes)===0?'selected':''}>UTC</option></select></div>
    <div class="check-field"><label><input name="accountingAutoClose" type="checkbox" ${settings.autoClose?'checked':''}/> Automatic close at 23:59:59</label></div>
    <div class="full-row" id="accountingSettingsMessage"></div>
    <div class="full-row"><button type="submit">Save Settings</button></div>
  </form>`);
  $('#accountingSettingsForm').onsubmit = async event => {
    event.preventDefault();
    const payload = formObj(event.target);
    payload.accountingAutoClose = event.target.accountingAutoClose.checked;
    payload.accountingAutoP2pBuyRate = event.target.accountingAutoP2pBuyRate.checked;
    payload.accountingTimezoneOffsetMinutes = Number(payload.accountingTimezoneOffsetMinutes || 360);
    try {
      await api('/api/accounting/settings', { method:'PATCH', body: JSON.stringify(payload) });
      closeModal();
      notify('Accounting settings saved.', 'ok');
      await renderCurrentAccountingPage();
    } catch (error) {
      setFormMessage('#accountingSettingsMessage', error.message);
    }
  };
}

function openAccountingCloseModal(data={}) {
  const date = String(data.range?.businessDate || new Date().toISOString().slice(0,10));
  modal('Close Business Day', `<form id="accountingCloseForm" class="form-grid accounting-form">
    <div class="full-row"><label>Business Date</label><input name="businessDate" type="date" value="${escapeAttr(date)}" required /></div>
    <div class="full-row check-field"><label><input name="syncBinance" type="checkbox" checked /> Sync actual USDT from every connected Binance account before close</label></div>
    <div class="full-row" id="accountingCloseMessage"></div>
    <div class="full-row"><button type="submit" class="dark">Close at Current Snapshot</button></div>
  </form>`);
  $('#accountingCloseForm').onsubmit = async event => {
    event.preventDefault();
    const payload = formObj(event.target);
    payload.syncBinance = event.target.syncBinance.checked;
    try {
      const result = await api('/api/accounting/close', { method:'POST', body: JSON.stringify(payload) });
      closeModal();
      notify(result.existing ? 'This day was already closed.' : 'Business day closed with Owner asset snapshot.', 'ok');
      await renderCurrentAccountingPage();
    } catch (error) {
      setFormMessage('#accountingCloseMessage', error.message);
    }
  };
}
