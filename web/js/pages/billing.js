// P2PFlow v2.0.8 — workspace subscription, entitlements and billing lifecycle.
async function renderBilling() {
  if (state.page !== 'billing') return;
  setTitle('Subscription & Billing', 'Workspace plan, usage, entitlements and invoices');
  $('#content').innerHTML = '<div class="card skeleton">Loading subscription…</div>';
  try {
    const [data, plans] = await Promise.all([api('/api/billing'), api('/api/plans')]);
    if (state.page !== 'billing') return;
    const sub = data.subscription || {};
    const plan = sub.plan || {};
    const usage = data.usage || {};
    const entitlements = data.entitlements || plan.entitlements || {};
    const invoices = Array.isArray(data.invoices) ? data.invoices : [];
    const payments = Array.isArray(data.payments) ? data.payments : [];
    const checkout = data.checkout || {};
    const provider = String(checkout.defaultProvider || 'manual').toLowerCase();
    const canManage = Boolean(state.user?.isOwner || state.user?.isSuperAdmin || hasPerm('billing.manage'));
    const planList = Array.isArray(plans) ? plans : (plans?.items || []);
    const subStatus = String(sub.status || data.tenant?.status || 'none').toLowerCase();

    const usageLine = (used, max) => {
      const u = Number(used || 0), m = Number(max || 0);
      const pct = m > 0 ? Math.min(100, Math.round((u / m) * 100)) : 0;
      return `<div class="billing-usage"><div><b>${u}</b><span> / ${m > 0 ? m : 'Unlimited'}</span></div><div class="billing-meter"><i style="width:${pct}%"></i></div></div>`;
    };
    const entitlementRows = Object.entries(entitlements)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `<span class="billing-entitlement ${value === false ? 'off' : ''}"><b>${escapeHtml(key.replaceAll('_', ' '))}</b><small>${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : String(value))}</small></span>`)
      .join('');
    const planCards = planList.map(p => {
      const active = String(p.code) === String(plan.code);
      const features = Object.entries(p.entitlements || {}).filter(([, v]) => v === true).map(([k]) => k).slice(0, 6);
      return `<article class="card billing-plan-card ${active ? 'active' : ''}"><div class="section-head"><h3>${escapeHtml(p.name)}</h3>${active ? badge('Current','ok') : ''}</div><div class="billing-price"><b>৳${Number(p.monthlyPrice || 0).toLocaleString()}</b><span>/ month</span></div><p class="sub">One-time setup: ৳${Number(p.setupFee || 0).toLocaleString()}</p><div class="billing-plan-limits"><span>${Number(p.maxUsers || 0) || 'Unlimited'} users</span><span>${Number(p.maxExchangeAccounts || 0) || 'Unlimited'} API accounts</span></div>${features.length ? `<div class="billing-feature-mini">${features.map(f => `<span>${escapeHtml(f.replaceAll('_',' '))}</span>`).join('')}</div>` : ''}${canManage && !active ? `<button data-change-plan="${escapeAttr(p.code)}">Switch to ${escapeHtml(p.name)}</button>` : ''}</article>`;
    }).join('');

    let warning = '';
    if (['pending_setup','pending_payment','unpaid'].includes(subStatus)) warning = `<div class="notice danger mt"><b>Payment required.</b> Complete the outstanding invoice to activate all workspace features.</div>`;
    else if (subStatus === 'past_due') warning = `<div class="notice warning mt"><b>Subscription past due.</b> Grace period ends ${fmt(sub.graceUntil)}. Pay before this time to prevent automatic suspension.</div>`;
    else if (subStatus === 'suspended') warning = `<div class="notice danger mt"><b>Subscription suspended.</b> Operational features remain blocked until billing is reconciled.</div>`;
    else if (sub.cancelAtPeriodEnd) warning = `<div class="notice warning mt"><b>Cancellation scheduled.</b> Access continues until ${fmt(sub.currentPeriodEnd)} unless you resume the subscription.</div>`;

    const invoiceTable = invoices.length ? table(['Invoice','Type','Amount','Status','Due','Action'], invoices.map(i => [
      `#${i.id}`,
      escapeHtml(i.invoiceType || i.type || '-'),
      `${escapeHtml(i.currency || checkout.currency || 'BDT')} ${Number(i.amount || 0).toLocaleString()}`,
      badge(i.status || '-', statusClass(i.status || '')),
      fmt(i.dueAt || i.createdAt),
      canManage && ['pending','overdue'].includes(String(i.status).toLowerCase()) ? `<button class="small secondary" data-billing-pay="${Number(i.id)}">Pay / Checkout</button>` : ''
    ])) : '<div class="empty-state">No invoices</div>';
    const paymentTable = payments.length ? table(['Payment','Provider','Amount','Status','Date'], payments.map(p => [
      `#${p.id}`,
      escapeHtml(p.provider || '-'),
      `${escapeHtml(p.currency || checkout.currency || 'BDT')} ${Number(p.amount || 0).toLocaleString()}`,
      badge(p.status || '-', statusClass(p.status || '')),
      fmt(p.createdAt)
    ])) : '<div class="empty-state">No payments</div>';

    $('#content').innerHTML = `
      <div class="dash-hero"><div><span class="dash-eyebrow">Workspace Billing</span><h2>${escapeHtml(data.tenant?.name || 'P2PFlow Workspace')}</h2><p>Subscription lifecycle, usage limits, entitlements, invoices and payments.</p></div><div class="dash-hero-amount"><span>Current Plan</span><b>${escapeHtml(plan.name || 'No plan')}</b><small>${escapeHtml(sub.status || data.tenant?.status || '-')}</small></div></div>
      ${warning}
      <div class="grid cards dash-metrics mt">
        ${dashMetric('Monthly Price', `৳${Number(plan.monthlyPrice || 0).toLocaleString()}`, '৳')}
        ${dashMetric('Setup Fee', `৳${Number(plan.setupFee || 0).toLocaleString()}`, '◎')}
        <div class="card"><span class="sub">Users</span>${usageLine(usage.users, usage.maxUsers ?? plan.maxUsers)}</div>
        <div class="card"><span class="sub">Binance API Accounts</span>${usageLine(usage.exchangeAccounts, usage.maxExchangeAccounts ?? plan.maxExchangeAccounts)}</div>
      </div>
      <div class="card mt"><div class="section-head"><div><h3>Subscription Lifecycle</h3><span class="sub">Billing provider: ${escapeHtml(provider)}</span></div><div class="inline-actions">${canManage && sub.id && !sub.cancelAtPeriodEnd && ['active','past_due'].includes(subStatus) ? '<button class="small secondary" id="billingCancelBtn">Cancel at period end</button>' : ''}${canManage && sub.id && sub.cancelAtPeriodEnd ? '<button class="small" id="billingResumeBtn">Resume subscription</button>' : ''}</div></div><div class="billing-lifecycle-grid"><div><span>Period start</span><b>${fmt(sub.currentPeriodStart)}</b></div><div><span>Period end</span><b>${fmt(sub.currentPeriodEnd)}</b></div><div><span>Setup paid</span><b>${fmt(sub.setupFeePaidAt)}</b></div><div><span>Next invoice</span><b>${fmt(sub.nextInvoiceAt)}</b></div><div><span>Past due since</span><b>${fmt(sub.pastDueSince)}</b></div><div><span>Grace until</span><b>${fmt(sub.graceUntil)}</b></div></div></div>
      <div class="card mt"><div class="section-head"><h3>Effective Entitlements</h3><span>${Object.keys(entitlements).length} rules</span></div><div class="billing-entitlements">${entitlementRows || '<span class="sub">Legacy unrestricted plan — no explicit entitlement map.</span>'}</div></div>
      <div class="mt"><div class="section-head"><h3>Available Plans</h3><span>${planList.length} plans</span></div><div class="grid cards billing-plan-grid">${planCards || '<div class="card">No active plans configured.</div>'}</div></div>
      <div class="grid two mt"><div class="card"><div class="section-head"><h3>Invoices</h3><span>${invoices.length}</span></div>${invoiceTable}</div><div class="card"><div class="section-head"><h3>Payments</h3><span>${payments.length}</span></div>${paymentTable}</div></div>
      <div class="notice mt"><b>Payment confirmation is server-side.</b> Hosted checkout only redirects the browser; plan activation happens after a validated, idempotent billing webhook or Super Admin reconciliation.</div>`;

    $$('[data-change-plan]').forEach(btn => btn.onclick = async () => {
      const code = btn.dataset.changePlan;
      if (!confirm(`Change this workspace to ${code}? A setup/monthly invoice may be created immediately.`)) return;
      btn.disabled = true;
      try { await api('/api/billing/change-plan', { method:'POST', body:JSON.stringify({ planCode:code }) }); notify('Plan updated', 'ok'); await renderBilling(); }
      catch (err) { if (!isUiRequestCancelled(err)) notify(err.message || 'Plan change failed', 'error'); btn.disabled = false; }
    });
    $$('[data-billing-pay]').forEach(btn => btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await api('/api/billing/checkout', { method:'POST', body:JSON.stringify({ invoiceId:Number(btn.dataset.billingPay), provider }) });
        if (r.checkoutUrl) {
          notify('Redirecting to secure checkout…', 'info');
          window.location.assign(r.checkoutUrl);
          return;
        }
        notify(r.instructions || (r.alreadyPaid ? 'Invoice is already paid.' : 'Checkout request created'), r.alreadyPaid ? 'ok' : 'info', 10000);
      } catch (err) { if (!isUiRequestCancelled(err)) notify(err.message || 'Checkout failed', 'error'); }
      finally { btn.disabled = false; }
    });
    const cancelBtn = $('#billingCancelBtn');
    if (cancelBtn) cancelBtn.onclick = async () => {
      if (!confirm('Schedule cancellation at the end of the current billing period?')) return;
      cancelBtn.disabled = true;
      try { await api('/api/billing/cancel', { method:'POST', body:'{}' }); notify('Cancellation scheduled', 'ok'); await renderBilling(); }
      catch (err) { notify(err.message || 'Cancellation failed', 'error'); cancelBtn.disabled = false; }
    };
    const resumeBtn = $('#billingResumeBtn');
    if (resumeBtn) resumeBtn.onclick = async () => {
      resumeBtn.disabled = true;
      try { await api('/api/billing/resume', { method:'POST', body:'{}' }); notify('Subscription resumed', 'ok'); await renderBilling(); }
      catch (err) { notify(err.message || 'Resume failed', 'error'); resumeBtn.disabled = false; }
    };
  } catch (err) {
    if (isUiRequestCancelled(err)) return;
    $('#content').innerHTML = `<div class="card"><div class="error">${escapeHtml(err.message || 'Billing could not be loaded')}</div></div>`;
  }
}
