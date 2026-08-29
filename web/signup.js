'use strict';
const $ = s => document.querySelector(s);
let selectedPlan = 'starter';
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
async function jsonFetch(url, options={}) {
  const res = await fetch(url, { ...options, headers:{'Content-Type':'application/json',...(options.headers||{})} });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) { const e = new Error(data.message || data.detail || data.error || `HTTP ${res.status}`); e.status=res.status; throw e; }
  return data;
}
async function loadPlans(){
  try{
    const plans = await jsonFetch('/api/plans');
    const list = Array.isArray(plans) ? plans : [];
    if (list.length) selectedPlan = String(list[0].code || 'starter');
    $('#planGrid').innerHTML = list.map((p,i)=>`<label class="plan ${i===0?'selected':''}" data-plan="${esc(p.code)}"><input type="radio" name="planCode" value="${esc(p.code)}" ${i===0?'checked':''}><b>${esc(p.name)}</b><strong>৳${Number(p.monthlyPrice||0).toLocaleString()}<small>/mo</small></strong><span>Setup ৳${Number(p.setupFee||0).toLocaleString()}</span><span>${Number(p.maxUsers||0)||'Unlimited'} users · ${Number(p.maxExchangeAccounts||0)||'Unlimited'} APIs</span></label>`).join('') || '<div class="plan">No active plan is configured.</div>';
    document.querySelectorAll('[data-plan]').forEach(el=>el.onclick=()=>{selectedPlan=el.dataset.plan;document.querySelectorAll('[data-plan]').forEach(x=>x.classList.toggle('selected',x===el));el.querySelector('input').checked=true;});
  } catch(e){ $('#planGrid').innerHTML=`<div class="message error">${esc(e.message)}</div>`; }
}
$('#signupForm').addEventListener('submit', async e=>{
  e.preventDefault(); const form=e.currentTarget, btn=$('#signupBtn'), err=$('#signupError');
  err.hidden=true;
  if(!form.reportValidity()) return;
  const f=new FormData(form); const payload={Workspace:f.get('Workspace'),Name:f.get('Name'),Email:f.get('Email'),Username:f.get('Username'),Password:f.get('Password'),PlanCode:selectedPlan};
  btn.disabled=true; btn.textContent='Creating workspace…';
  try{ await jsonFetch('/api/public/signup',{method:'POST',body:JSON.stringify(payload)}); location.replace('/dashboard'); }
  catch(ex){err.textContent=ex.message;err.hidden=false;btn.disabled=false;btn.textContent='Create workspace';}
});
loadPlans();
