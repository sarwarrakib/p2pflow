// P2PFlow v2.0.8 — platform Super Admin control plane.
async function renderSuperAdmin() {
  if (state.page !== 'super-admin') return;
  setTitle('Super Admin', 'Platform tenants, subscriptions, billing and reconciliation');
  if (!state.user?.isSuperAdmin) { $('#content').innerHTML = '<div class="card"><div class="error">Super Admin access required.</div></div>'; return; }
  $('#content').innerHTML = '<div class="card skeleton">Loading platform control plane…</div>';
  try {
    const [summary, tenantsR, plansR, invoicesR, paymentsR, reconR, eventsR] = await Promise.all([
      api('/api/superadmin/summary'), api('/api/superadmin/tenants'), api('/api/superadmin/plans'), api('/api/superadmin/invoices'), api('/api/superadmin/payments'), api('/api/superadmin/reconciliation?status=open'), api('/api/superadmin/billing-events')
    ]);
    if (state.page !== 'super-admin') return;
    const tenants = tenantsR?.items || [];
    const plans = Array.isArray(plansR) ? plansR : (plansR?.items || []);
    const invoices = invoicesR?.items || [];
    const payments = paymentsR?.items || [];
    const reconciliation = reconR?.items || [];
    const events = eventsR?.items || [];
    const planByCode = new Map(plans.map(p => [String(p.code), p]));
    const statusOptions = (current) => ['active','pending_payment','past_due','suspended','disabled'].map(v => `<option value="${v}" ${current===v?'selected':''}>${v.replaceAll('_',' ')}</option>`).join('');
    const tenantRows = tenants.map(t => [
      `#${t.id}`,
      `<b>${escapeHtml(t.name)}</b><br><small>${escapeHtml(t.slug || '')}</small>`,
      escapeHtml(t.plan || '-'),
      `${t.users || 0} / ${t.exchangeAccounts || 0}`,
      badge(t.subscriptionStatus || '-', statusClass(t.subscriptionStatus || '')),
      badge(t.status || '-', statusClass(t.status || '')),
      `<div class="inline-actions"><select data-tenant-status="${t.id}">${statusOptions(String(t.status || 'active'))}</select><button class="small secondary" data-tenant-detail="${t.id}">Details</button><button class="small secondary" data-tenant-plan="${t.id}">Plan</button></div>`
    ]);
    const invoiceRows = invoices.slice(0,100).map(i => [
      `#${i.id}`, escapeHtml(i.tenant || '-'), escapeHtml(i.invoiceType || i.type || '-'), `${escapeHtml(i.currency || 'BDT')} ${Number(i.amount || 0).toLocaleString()}`, badge(i.status || '-', statusClass(i.status || '')), fmt(i.dueAt || i.createdAt), String(i.status).toLowerCase() !== 'paid' ? `<button class="small" data-mark-paid="${i.id}">Mark Paid</button>` : ''
    ]);
    const planRows = plans.map(p => [
      escapeHtml(p.code), `<b>${escapeHtml(p.name)}</b>`, `৳${Number(p.monthlyPrice || 0).toLocaleString()}`, `৳${Number(p.setupFee || 0).toLocaleString()}`, Number(p.maxUsers || 0) || '∞', Number(p.maxExchangeAccounts || 0) || '∞', badge(p.status || 'active', statusClass(p.status || 'active')), `<button class="small secondary" data-edit-plan="${Number(p.id)}" data-plan-code="${escapeAttr(p.code)}">Edit</button>`
    ]);
    const reconRows = reconciliation.slice(0,100).map(x => [
      `#${x.id}`, escapeHtml(x.tenant || `Tenant #${x.tenantId || '-'}`), escapeHtml(x.provider || '-'), escapeHtml(x.issueType || '-'), x.invoiceId ? `#${x.invoiceId}` : '-', fmt(x.createdAt), `<button class="small" data-resolve-recon="${x.id}">Resolve</button>`
    ]);
    const eventRows = events.slice(0,30).map(e => [
      `#${e.id}`, escapeHtml(e.provider || '-'), escapeHtml(e.eventType || '-'), e.tenantId ? `#${e.tenantId}` : '-', badge(e.status || '-', statusClass(e.status || '')), String(e.attemptCount || 0), fmt(e.createdAt)
    ]);

    $('#content').innerHTML = `
      <div class="dash-hero"><div><span class="dash-eyebrow">Platform Control Plane</span><h2>P2PFlow Super Admin</h2><p>Every workspace, API account, subscription, invoice, webhook and reconciliation issue in one control plane.</p></div><div class="dash-hero-amount"><span>MRR</span><b>৳${Number(summary.mrr || 0).toLocaleString()}</b><small>ARR ৳${Number(summary.arr || 0).toLocaleString()} · v${escapeHtml(summary.version || '')}</small></div></div>
      <div class="grid cards dash-metrics mt">
        ${dashMetric('Workspaces', String(summary.tenants || 0), '◫')}
        ${dashMetric('Active Workspaces', String(summary.activeTenants || 0), '✓')}
        ${dashMetric('Users', String(summary.users || 0), '◎')}
        ${dashMetric('API Accounts', String(summary.exchangeAccounts || 0), '⇄')}
        ${dashMetric('Past Due / Suspended', String(summary.pastDueSubscriptions || 0), '!')}
        ${dashMetric('Overdue Invoices', String(summary.overdueInvoices || 0), '⏱')}
        ${dashMetric('Open Reconciliation', String(summary.openReconciliationIssues || 0), '≋')}
        ${dashMetric('Collected Revenue', `৳${Number(summary.totalRevenue || 0).toLocaleString()}`, '৳')}
      </div>
      <div id="superTenantDetailCard" class="card mt" hidden></div>
      <div class="card mt"><div class="section-head"><h3>Workspaces</h3><span>${tenants.length}</span></div>${tenantRows.length ? table(['ID','Workspace','Plan','Users / APIs','Subscription','Status','Control'], tenantRows) : '<div class="empty-state">No workspaces</div>'}</div>
      <div class="grid two mt">
        <div class="card"><div class="section-head"><h3>Plans</h3><button class="small" id="createPlanBtn">Create Plan</button></div>${planRows.length ? table(['Code','Name','Monthly','Setup','Users','API Accounts','Status','Action'], planRows) : '<div class="empty-state">No plans</div>'}</div>
        <div class="card"><div class="section-head"><h3>Recent Payments</h3><span>${payments.length}</span></div>${payments.length ? table(['Tenant','Provider','Amount','Status','Date'], payments.slice(0,50).map(p => [escapeHtml(p.tenant || '-'), escapeHtml(p.provider || '-'), `${escapeHtml(p.currency || 'BDT')} ${Number(p.amount || 0).toLocaleString()}`, badge(p.status || '-', statusClass(p.status || '')), fmt(p.createdAt)])) : '<div class="empty-state">No payments</div>'}</div>
      </div>
      <div class="card mt"><div class="section-head"><h3>Invoices</h3><span>${invoices.length}</span></div>${invoiceRows.length ? table(['Invoice','Workspace','Type','Amount','Status','Due','Action'], invoiceRows) : '<div class="empty-state">No invoices</div>'}</div>
      <div class="grid two mt"><div class="card"><div class="section-head"><h3>Open Billing Reconciliation</h3><span>${reconciliation.length}</span></div>${reconRows.length ? table(['ID','Workspace','Provider','Issue','Invoice','Created','Action'], reconRows) : '<div class="empty-state">No open reconciliation issues</div>'}</div><div class="card"><div class="section-head"><h3>Recent Billing Webhooks</h3><span>${events.length}</span></div>${eventRows.length ? table(['ID','Provider','Event','Tenant','Status','Attempts','Created'], eventRows) : '<div class="empty-state">No billing events</div>'}</div></div>`;

    const showTenantDetail = async (tenantId) => {
      const card = $('#superTenantDetailCard');
      card.hidden = false;
      card.innerHTML = '<div class="skeleton">Loading workspace…</div>';
      try {
        const d = await api(`/api/superadmin/tenants/${Number(tenantId)}`);
        const t = d.tenant || {}, sub = d.subscription || {}, p = sub.plan || {}, usage = d.usage || {}, ent = d.entitlements || {};
        const entRows = Object.entries(ent).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `<span class="billing-entitlement ${v === false ? 'off' : ''}"><b>${escapeHtml(k)}</b><small>${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : String(v))}</small></span>`).join('');
        card.innerHTML = `<div class="section-head"><div><h3>${escapeHtml(t.name || 'Workspace')} <small>#${Number(t.id || tenantId)}</small></h3><span>${escapeHtml(t.slug || '')}</span></div><div class="inline-actions"><button class="small secondary" data-entitlement-set="${tenantId}">Set Override</button><button class="small secondary" data-entitlement-remove="${tenantId}">Remove Override</button><button class="small" data-create-invoice="${tenantId}">Create Invoice</button><button class="small secondary" id="closeTenantDetail">Close</button></div></div><div class="grid cards dash-metrics"><div class="card"><span class="sub">Tenant Status</span><b>${escapeHtml(t.status || '-')}</b></div><div class="card"><span class="sub">Subscription</span><b>${escapeHtml(sub.status || '-')}</b></div><div class="card"><span class="sub">Plan</span><b>${escapeHtml(p.name || '-')}</b></div><div class="card"><span class="sub">Users / API Accounts</span><b>${Number(usage.users || 0)} / ${Number(usage.exchangeAccounts || 0)}</b></div></div><div class="section-head mt"><h4>Effective Entitlements</h4><span>${Object.keys(ent).length}</span></div><div class="billing-entitlements">${entRows || '<span class="sub">No explicit entitlements</span>'}</div><div class="grid two mt"><div><h4>Latest invoices</h4>${(d.invoices || []).length ? table(['ID','Type','Amount','Status'], (d.invoices || []).slice(0,8).map(i => [`#${i.id}`, escapeHtml(i.invoiceType || i.type || '-'), `${escapeHtml(i.currency || 'BDT')} ${Number(i.amount || 0).toLocaleString()}`, badge(i.status || '-', statusClass(i.status || ''))])) : '<div class="empty-state">No invoices</div>'}</div><div><h4>Latest payments</h4>${(d.payments || []).length ? table(['ID','Provider','Amount','Status'], (d.payments || []).slice(0,8).map(x => [`#${x.id}`, escapeHtml(x.provider || '-'), `${escapeHtml(x.currency || 'BDT')} ${Number(x.amount || 0).toLocaleString()}`, badge(x.status || '-', statusClass(x.status || ''))])) : '<div class="empty-state">No payments</div>'}</div></div>`;
        $('#closeTenantDetail').onclick = () => { card.hidden = true; };
        $('[data-entitlement-set]', card).onclick = async () => {
          const key = prompt('Entitlement key (example: orders, max_daily_orders)'); if (!key) return;
          const raw = prompt('Override value as JSON', 'true'); if (raw === null) return;
          let value; try { value = JSON.parse(raw); } catch { notify('Value must be valid JSON', 'error'); return; }
          const reason = prompt('Reason for override', 'Super Admin override') || '';
          await api(`/api/superadmin/tenants/${tenantId}/entitlements/${encodeURIComponent(key)}`, { method:'PUT', body:JSON.stringify({ value, reason }) });
          notify('Entitlement override saved', 'ok'); await showTenantDetail(tenantId);
        };
        $('[data-entitlement-remove]', card).onclick = async () => {
          const key = prompt('Entitlement override key to remove'); if (!key) return;
          await api(`/api/superadmin/tenants/${tenantId}/entitlements/${encodeURIComponent(key)}`, { method:'DELETE' });
          notify('Entitlement override removed', 'ok'); await showTenantDetail(tenantId);
        };
        $('[data-create-invoice]', card).onclick = async () => {
          const amount = Number(prompt('Invoice amount', '0') || 0); if (!(amount > 0)) return;
          const type = prompt('Invoice type', 'manual') || 'manual';
          const dueDays = Number(prompt('Due in days', '7') || 7);
          await api(`/api/superadmin/tenants/${tenantId}/invoices`, { method:'POST', body:JSON.stringify({ amount, type, dueDays }) });
          notify('Invoice created', 'ok'); await showTenantDetail(tenantId);
        };
        card.scrollIntoView({ behavior:'smooth', block:'start' });
      } catch (err) { card.innerHTML = `<div class="error">${escapeHtml(err.message || 'Workspace details failed')}</div>`; }
    };

    $$('[data-tenant-detail]').forEach(btn => btn.onclick = () => showTenantDetail(btn.dataset.tenantDetail));
    $$('[data-tenant-status]').forEach(el => el.onchange = async () => {
      el.disabled = true;
      try { await api(`/api/superadmin/tenants/${Number(el.dataset.tenantStatus)}`, { method:'PATCH', body:JSON.stringify({ status:el.value }) }); notify('Workspace status updated','ok'); }
      catch (err) { notify(err.message || 'Update failed','error'); await renderSuperAdmin(); }
      finally { el.disabled = false; }
    });
    $$('[data-tenant-plan]').forEach(btn => btn.onclick = async () => {
      const current = tenants.find(t => String(t.id) === String(btn.dataset.tenantPlan));
      const codes = plans.map(p => p.code).join(', ');
      const planCode = prompt(`Plan code (${codes})`, current?.plan ? String([...planByCode.values()].find(p => p.name === current.plan)?.code || '') : '');
      if (!planCode) return;
      try { await api(`/api/superadmin/tenants/${Number(btn.dataset.tenantPlan)}`, { method:'PATCH', body:JSON.stringify({ planCode }) }); notify('Workspace plan updated','ok'); await renderSuperAdmin(); }
      catch (err) { notify(err.message || 'Plan update failed','error'); }
    });
    $$('[data-mark-paid]').forEach(btn => btn.onclick = async () => {
      if (!confirm(`Mark invoice #${btn.dataset.markPaid} as paid? This can activate or renew the subscription.`)) return;
      btn.disabled = true;
      try { await api(`/api/superadmin/invoices/${Number(btn.dataset.markPaid)}/mark-paid`, { method:'POST', body:'{}' }); notify('Invoice marked paid','ok'); await renderSuperAdmin(); }
      catch (err) { notify(err.message || 'Payment update failed','error'); btn.disabled = false; }
    });
    $$('[data-resolve-recon]').forEach(btn => btn.onclick = async () => {
      const note = prompt('Resolution note', 'Reviewed and reconciled'); if (note === null) return;
      btn.disabled = true;
      try { await api(`/api/superadmin/reconciliation/${Number(btn.dataset.resolveRecon)}/resolve`, { method:'POST', body:JSON.stringify({ status:'resolved', note }) }); notify('Reconciliation resolved','ok'); await renderSuperAdmin(); }
      catch (err) { notify(err.message || 'Resolve failed','error'); btn.disabled = false; }
    });
    $$('[data-edit-plan]').forEach(btn => btn.onclick = async () => {
      const p = plans.find(x => Number(x.id) === Number(btn.dataset.editPlan)); if (!p) return;
      const monthlyPrice = Number(prompt('Monthly price', String(p.monthlyPrice || 0))); if (!Number.isFinite(monthlyPrice)) return;
      const setupFee = Number(prompt('Setup fee', String(p.setupFee || 0))); if (!Number.isFinite(setupFee)) return;
      const maxUsers = Number(prompt('Maximum users (0 = unlimited)', String(p.maxUsers || 0))); if (!Number.isFinite(maxUsers)) return;
      const maxExchangeAccounts = Number(prompt('Maximum API accounts (0 = unlimited)', String(p.maxExchangeAccounts || 0))); if (!Number.isFinite(maxExchangeAccounts)) return;
      const status = prompt('Plan status: active / inactive / archived', String(p.status || 'active')); if (!status) return;
      const eraw = prompt('Entitlements JSON', JSON.stringify(p.entitlements || { all_features:true }, null, 2)); if (eraw === null) return;
      let entitlements; try { entitlements = JSON.parse(eraw); } catch { notify('Invalid entitlement JSON','error'); return; }
      try { await api(`/api/superadmin/plans/${Number(p.id)}`, { method:'PATCH', body:JSON.stringify({ monthlyPrice, setupFee, maxUsers, maxExchangeAccounts, status, entitlements }) }); notify('Plan updated','ok'); await renderSuperAdmin(); }
      catch (err) { notify(err.message || 'Plan update failed','error'); }
    });
    const createPlanBtn = $('#createPlanBtn');
    if (createPlanBtn) createPlanBtn.onclick = async () => {
      const code = prompt('Plan code (example: pro)'); if (!code) return;
      const name = prompt('Plan name', code.toUpperCase()); if (!name) return;
      const monthlyPrice = Number(prompt('Monthly price (BDT)', '0') || 0);
      const setupFee = Number(prompt('One-time setup fee (BDT)', '0') || 0);
      const maxUsers = Number(prompt('Maximum users (0 = unlimited)', '10') || 0);
      const maxExchangeAccounts = Number(prompt('Maximum Binance API accounts (0 = unlimited)', '5') || 0);
      const entitlements = { all_features:true, orders:true, ads:true, chat:true, p2p_profile:true, api_credentials:true, payment_accounts:true, routing:true, notifications:true, reports:true, accounting:true, approvals:true, extension:true, market:true, system_update:true };
      try { await api('/api/superadmin/plans', { method:'POST', body:JSON.stringify({ code, name, monthlyPrice, setupFee, maxUsers, maxExchangeAccounts, entitlements }) }); notify('Plan created','ok'); await renderSuperAdmin(); }
      catch (err) { notify(err.message || 'Plan creation failed','error'); }
    };
  } catch (err) {
    if (isUiRequestCancelled(err)) return;
    $('#content').innerHTML = `<div class="card"><div class="error">${escapeHtml(err.message || 'Super Admin could not be loaded')}</div></div>`;
  }
}
