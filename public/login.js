'use strict';

// Standalone P2PFlow authentication client. It intentionally does not load the
// application router/realtime code, so an expired session stays on a stable URL.

const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => Array.from(root.querySelectorAll(selector));
let lang = localStorage.getItem('crmLang') || 'bn';
let loginMode = 'full'; // full | verification | trusted
let verificationActive = false;
let resendTimer = null;
let deviceRecord = null;
let recoveryOtpActive = false;

function t(en, bn) { return lang === 'bn' ? bn : en; }

function safeNextUrl() {
  try {
    const raw = String(new URLSearchParams(location.search).get('next') || '').trim();
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/#/dashboard';
    const parsed = new URL(raw, location.origin);
    if (parsed.origin !== location.origin || /^\/login(?:\.html)?\/?$/i.test(parsed.pathname)) return '/#/dashboard';
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/#/dashboard';
  } catch { return '/#/dashboard'; }
}

function looksLikeHtml(text) { return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(String(text || '').slice(0, 500)); }
function htmlTitle(text) {
  const raw = String(text || '');
  return ((raw.match(/<title[^>]*>(.*?)<\/title>/i) || [])[1] || (raw.match(/<h1[^>]*>(.*?)<\/h1>/i) || [])[1] || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}
function currentDeviceId() { return window.P2PFlowDeviceAuth?.getDeviceId?.() || ''; }

async function loginApi(path, opts={}) {
  let response;
  const deviceId = currentDeviceId();
  try {
    response = await fetch(path, {
      credentials: 'include', cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(deviceId ? { 'X-P2PFlow-Device-Id': deviceId } : {}),
        ...(opts.headers || {})
      },
      ...opts
    });
  } catch (error) {
    throw new Error(t(`Could not reach the server. ${error.message || ''}`.trim(), `সার্ভারের সাথে সংযোগ করা যায়নি। ${error.message || ''}`.trim()));
  }
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json().catch(() => ({})) : await response.text().catch(() => '');
  if (!response.ok) {
    if (data && typeof data === 'object') throw Object.assign(new Error(data.error || data.message || `HTTP ${response.status}`), { status: response.status, data });
    if (looksLikeHtml(data)) {
      const title = htmlTitle(data);
      throw Object.assign(new Error(t(
        `Server is temporarily unavailable${response.status ? ` (HTTP ${response.status})` : ''}${title ? `: ${title}` : ''}. This login page will not auto-reload.`,
        `সার্ভার সাময়িকভাবে পাওয়া যাচ্ছে না${response.status ? ` (HTTP ${response.status})` : ''}${title ? `: ${title}` : ''}। এই লগইন পেজ নিজে থেকে রিলোড হবে না।`
      )), { status: response.status });
    }
    throw Object.assign(new Error(String(data || `HTTP ${response.status}`).slice(0, 500)), { status: response.status });
  }
  if (!type.includes('application/json')) throw new Error(t('Unexpected server response. Please try again.', 'সার্ভার থেকে অপ্রত্যাশিত রেসপন্স এসেছে। আবার চেষ্টা করুন।'));
  return data;
}

function setError(message='') { const node = $('#loginError'); if (node) node.textContent = String(message || ''); }
function setAlert(message, tone='info') {
  const alert = $('#otpHelp'); if (!alert) return;
  const text = alert.querySelector('span'); if (text) text.textContent = String(message || '');
  alert.classList.remove('login-alert-info','login-alert-warning','login-alert-danger','login-alert-success');
  alert.classList.add(`login-alert-${['warning','danger','success'].includes(tone) ? tone : 'info'}`);
}
function setRecoveryMessage(message='', tone='info') {
  const box = $('#recoveryMessage'); if (!box) return;
  box.classList.toggle('hidden', !message);
  box.classList.remove('login-alert-info','login-alert-warning','login-alert-danger','login-alert-success');
  box.classList.add(`login-alert-${['warning','danger','success'].includes(tone) ? tone : 'info'}`);
  const span = box.querySelector('span'); if (span) span.textContent = String(message || '');
}

function setBusy(busy) {
  const button = $('#loginBtn'); if (!button) return;
  button.disabled = Boolean(busy); button.classList.toggle('is-loading', Boolean(busy));
  const label = $('#loginBtnText'); if (!label) return;
  if (busy) label.textContent = loginMode === 'trusted' ? t('Unlocking...', 'আনলক করা হচ্ছে...') : (verificationActive ? t('Verifying...', 'ভেরিফাই করা হচ্ছে...') : t('Checking...', 'যাচাই করা হচ্ছে...'));
  else label.textContent = loginMode === 'trusted' ? t('Unlock with Secret', 'সিক্রেট দিয়ে লগইন') : (verificationActive ? t('Verify & Sign In', 'ভেরিফাই করে সাইন ইন করুন') : t('Continue securely', 'নিরাপদে চালিয়ে যান'));
}

function syncOtpValue() {
  const hidden = $('#emailOtpInput'); if (!hidden) return '';
  const value = $$('.otp-digit', $('#emailOtpDigits')).map(input => input.value.replace(/\D/g, '').slice(0, 1)).join('');
  hidden.value = value; return value;
}
function clearOtp() { $$('.otp-digit', $('#emailOtpDigits')).forEach(input => { input.value = ''; }); if ($('#emailOtpInput')) $('#emailOtpInput').value = ''; }
function setupOtpInputs() {
  const digits = $$('.otp-digit', $('#emailOtpDigits'));
  digits.forEach((input, index) => {
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(-1); syncOtpValue(); if (input.value && digits[index + 1]) digits[index + 1].focus(); });
    input.addEventListener('keydown', event => {
      if (event.key === 'Backspace' && !input.value && digits[index - 1]) { digits[index - 1].value = ''; syncOtpValue(); digits[index - 1].focus(); }
      else if (event.key === 'ArrowLeft' && digits[index - 1]) { event.preventDefault(); digits[index - 1].focus(); }
      else if (event.key === 'ArrowRight' && digits[index + 1]) { event.preventDefault(); digits[index + 1].focus(); }
    });
    input.addEventListener('paste', event => {
      const value = (event.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6); if (!value) return;
      event.preventDefault(); digits.forEach((digit, i) => { digit.value = value[i] || ''; }); syncOtpValue(); (digits[Math.min(value.length, digits.length) - 1] || digits[0])?.focus();
    });
  });
}
function setupVisibilityButtons() {
  $$('[data-visibility-target]').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.visibilityTarget || ''); if (!input) return;
    const show = input.type === 'password'; input.type = show ? 'text' : 'password'; button.setAttribute('aria-pressed', show ? 'true' : 'false'); input.focus({ preventScroll:true });
  }));
}

function startCooldown(seconds=30) {
  const button = $('#resendOtpBtn'), text = $('#otpTimerText'); if (!button || !text) return;
  if (resendTimer) clearInterval(resendTimer); let remaining = Math.max(0, Number(seconds) || 0);
  const render = () => {
    if (remaining <= 0) { button.disabled = false; text.textContent = t('You can request a new email OTP now.', 'এখন নতুন ইমেইল OTP চাইতে পারবেন।'); if (resendTimer) clearInterval(resendTimer); resendTimer = null; return; }
    button.disabled = true; const mm = String(Math.floor(remaining / 60)).padStart(2,'0'), ss = String(remaining % 60).padStart(2,'0'); text.textContent = t(`Resend available in ${mm}:${ss}`, `${mm}:${ss} পর আবার OTP পাঠাতে পারবেন`); remaining -= 1;
  };
  render(); resendTimer = setInterval(render, 1000);
}

function setVerificationStep(message, { restartCooldown=true }={}) {
  loginMode = 'verification'; verificationActive = true;
  $('#trustedDevicePanel')?.classList.add('hidden'); $('#credentialPanel')?.classList.remove('hidden'); $('#otpPanel')?.classList.remove('hidden');
  $('.login-card')?.classList.add('is-verification'); $('#changeCredentialsBtn')?.classList.remove('hidden'); $('#credentialVerifiedNote')?.classList.remove('hidden');
  ['#loginIdentity','#loginPassword'].forEach(selector => { const input=$(selector); if (input) { input.readOnly=true; input.closest('.login-input-shell')?.classList.add('is-readonly'); } });
  setAlert(message || t('Enter the email OTP.', 'ইমেইল OTP লিখুন।'), 'info'); if (restartCooldown) startCooldown(30); setBusy(false);
  setTimeout(() => ($$('.otp-digit').find(input => !input.value) || $('#loginSecretCode'))?.focus({ preventScroll:true }), 30);
}
function setFullLoginMode({ clear=false, focus=true, message='' }={}) {
  loginMode = 'full'; verificationActive = false;
  $('#trustedDevicePanel')?.classList.add('hidden'); $('#credentialPanel')?.classList.remove('hidden'); $('#otpPanel')?.classList.add('hidden');
  $('.login-card')?.classList.remove('is-verification','is-trusted'); $('#changeCredentialsBtn')?.classList.add('hidden'); $('#credentialVerifiedNote')?.classList.add('hidden');
  ['#loginIdentity','#loginPassword'].forEach(selector => { const input=$(selector); if (input) { input.readOnly=false; input.closest('.login-input-shell')?.classList.remove('is-readonly'); } });
  if (clear) { clearOtp(); if ($('#loginSecretCode')) $('#loginSecretCode').value=''; }
  if (resendTimer) clearInterval(resendTimer); resendTimer=null; if ($('#resendOtpBtn')) $('#resendOtpBtn').disabled=false;
  if (message) setError(message); setBusy(false); if (focus) $('#loginIdentity')?.focus({ preventScroll:true });
}
function setTrustedMode(info={}) {
  loginMode = 'trusted'; verificationActive = false;
  $('#credentialPanel')?.classList.add('hidden'); $('#otpPanel')?.classList.add('hidden'); $('#trustedDevicePanel')?.classList.remove('hidden');
  $('.login-card')?.classList.remove('is-verification'); $('.login-card')?.classList.add('is-trusted');
  $('#trustedDeviceAccountHint').textContent = info.accountHint ? `${t('Account', 'অ্যাকাউন্ট')}: ${info.accountHint}` : '';
  $('#trustedDeviceStatus').textContent = t('Trusted browser recognized', 'বিশ্বস্ত ডিভাইস শনাক্ত হয়েছে');
  if ($('#trustedSecretCode')) $('#trustedSecretCode').value=''; setError(''); setBusy(false);
  setTimeout(() => $('#trustedSecretCode')?.focus({ preventScroll:true }), 40);
}

function validateFull() {
  const identity=String($('#loginIdentity')?.value||'').trim(), password=String($('#loginPassword')?.value||'');
  if (!identity || !password) { setError(t('Enter your username or Gmail and password.', 'ইউজারনেম বা জিমেইল এবং পাসওয়ার্ড লিখুন।')); (!identity ? $('#loginIdentity') : $('#loginPassword'))?.focus(); return false; }
  if (!verificationActive) return true;
  const otp=syncOtpValue(), secret=String($('#loginSecretCode')?.value||'').replace(/\D/g,'').slice(0,6); if ($('#loginSecretCode')) $('#loginSecretCode').value=secret;
  if (otp.length!==6) { setError(t('Enter the complete 6-digit email OTP.', 'সম্পূর্ণ ৬ ডিজিট ইমেইল OTP লিখুন।')); return false; }
  if (secret.length!==6) { setError(t('Enter your 6-digit security PIN / secret.', 'আপনার ৬ ডিজিট সিকিউরিটি পিন / সিক্রেট লিখুন।')); $('#loginSecretCode')?.focus(); return false; }
  return true;
}
function validateTrusted() {
  const secret=String($('#trustedSecretCode')?.value||'').replace(/\D/g,'').slice(0,6); if ($('#trustedSecretCode')) $('#trustedSecretCode').value=secret;
  if (secret.length!==6) { setError(t('Enter your 6-digit security PIN / secret.', 'আপনার ৬ ডিজিট সিকিউরিটি পিন / সিক্রেট লিখুন।')); $('#trustedSecretCode')?.focus(); return false; }
  return true;
}

async function enrollmentPayload() {
  if (!window.P2PFlowDeviceAuth?.supported?.()) return null;
  deviceRecord = deviceRecord || await window.P2PFlowDeviceAuth.ensure();
  if (!deviceRecord) return null;
  return { deviceId:deviceRecord.deviceId, name:deviceRecord.name, publicKeyJwk:deviceRecord.publicKeyJwk };
}

async function submitTrustedLogin() {
  if (!validateTrusted()) return;
  if (!deviceRecord) deviceRecord = await window.P2PFlowDeviceAuth?.load?.();
  if (!deviceRecord) { setFullLoginMode({ message:t('Trusted browser key is missing. Use full login.', 'বিশ্বস্ত ডিভাইসের কী পাওয়া যায়নি। ফুল লগইন করুন।') }); return; }
  setBusy(true);
  try {
    const challenge = await loginApi('/api/login/device/challenge', { method:'POST', body:JSON.stringify({ deviceId:deviceRecord.deviceId }) });
    if (!challenge.trustedDevice || !challenge.signingPayload) { setFullLoginMode({ message:t('Full login is required on this browser.', 'এই ডিভাইসে ফুল লগইন প্রয়োজন।') }); return; }
    const signature = await window.P2PFlowDeviceAuth.sign(deviceRecord, challenge.signingPayload);
    const data = await loginApi('/api/login/device', { method:'POST', body:JSON.stringify({ deviceId:deviceRecord.deviceId, challengeId:challenge.challengeId, signature, secretCode:$('#trustedSecretCode').value }) });
    if (data.trustedDevice) window.location.replace(safeNextUrl());
  } catch (error) {
    if (error.data?.fullLoginRequired) setFullLoginMode({ message:error.message });
    else setError(error.message);
  } finally { setBusy(false); }
}

async function submitFullLogin(form) {
  if (!validateFull()) return;
  syncOtpValue(); const payload=Object.fromEntries(new FormData(form));
  const enrollment = await enrollmentPayload(); if (enrollment) payload.deviceEnrollment=enrollment;
  setBusy(true);
  try {
    const data=await loginApi('/api/login',{method:'POST',body:JSON.stringify(payload)});
    if (data.otpRequired) { const message=data.message||t('Check your email and enter the OTP.','ইমেইল দেখে OTP লিখুন।'); setVerificationStep(message,{restartCooldown:!verificationActive||/sent|expired/i.test(message)}); return; }
    window.location.replace(safeNextUrl());
  } catch(error) {
    setError(error.message); if (verificationActive) setAlert(error.message,error.status===429?'warning':'danger'); else { $('#loginPassword')?.focus({preventScroll:true}); $('#loginPassword')?.select(); }
  } finally { setBusy(false); }
}
async function submitLogin(event) { event.preventDefault(); setError(''); if (loginMode==='trusted') return submitTrustedLogin(); return submitFullLogin(event.currentTarget); }

async function resendOtp() {
  if (!verificationActive) return; setError(''); const payload=Object.fromEntries(new FormData($('#loginForm'))); payload.emailOtp=''; payload.secretCode=''; payload.resendOtp=true;
  const enrollment=await enrollmentPayload(); if (enrollment) payload.deviceEnrollment=enrollment;
  const button=$('#resendOtpBtn'); if(button) button.disabled=true;
  try { const data=await loginApi('/api/login',{method:'POST',body:JSON.stringify(payload)}); clearOtp(); setVerificationStep(data.message||t('A new OTP was sent.','নতুন OTP পাঠানো হয়েছে।'),{restartCooldown:true}); }
  catch(error){ setError(error.message); setAlert(error.message,error.status===429?'warning':'danger'); const wait=String(error.message||'').match(/wait\s+(\d+)\s+seconds/i); if(wait) startCooldown(Number(wait[1])); else if(button) button.disabled=false; }
}

function toggleRecovery(show) {
  const form=$('#emailRecoveryForm'); if(!form) return; form.classList.toggle('hidden',!show);
  if(show){ $('#recoveryIdentity').value=String($('#loginIdentity')?.value||'').trim(); $('#recoveryPassword').value=String($('#loginPassword')?.value||''); $('#recoveryIdentity')?.focus({preventScroll:true}); }
  else { recoveryOtpActive=false; form.reset(); $('#recoveryId').value=''; $('#recoveryOtpWrap').classList.add('hidden'); setRecoveryMessage(''); }
}
async function submitEmailRecovery(event) {
  event.preventDefault(); setRecoveryMessage(''); const form=event.currentTarget; const payload=Object.fromEntries(new FormData(form));
  payload.secretCode=String(payload.secretCode||'').replace(/\D/g,'').slice(0,6); payload.recoveryOtp=String(payload.recoveryOtp||'').replace(/\D/g,'').slice(0,6);
  if(!payload.username||!payload.password||payload.secretCode.length!==6||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(payload.newEmail||''))){ setRecoveryMessage(t('Enter username, current password, 6 digit secret and a valid new email.','ইউজারনেম, বর্তমান পাসওয়ার্ড, ৬ ডিজিট সিক্রেট এবং সঠিক নতুন ইমেইল দিন।'),'danger'); return; }
  if(recoveryOtpActive && payload.recoveryOtp.length!==6){ setRecoveryMessage(t('Enter the 6 digit OTP sent to the new email.','নতুন ইমেইলে পাঠানো ৬ ডিজিট OTP দিন।'),'danger'); return; }
  const button=$('#recoverySubmitBtn'); button.disabled=true;
  try {
    const data=await loginApi('/api/login/recover-email',{method:'POST',body:JSON.stringify(payload)});
    if(data.recoveryOtpRequired){ recoveryOtpActive=true; $('#recoveryId').value=data.recoveryId||''; $('#recoveryOtpWrap').classList.remove('hidden'); button.textContent=t('Confirm corrected email','সঠিক ইমেইল নিশ্চিত করুন'); setRecoveryMessage(data.message,'info'); $('#recoveryOtp')?.focus({preventScroll:true}); return; }
    setRecoveryMessage(data.message||t('Email corrected. Full login is required.','ইমেইল ঠিক হয়েছে। এখন ফুল লগইন করুন।'),'success');
    await window.P2PFlowDeviceAuth?.forget?.(); deviceRecord=null; recoveryOtpActive=false; $('#recoveryOtpWrap').classList.add('hidden'); $('#loginIdentity').value=payload.username; $('#loginPassword').value=''; setFullLoginMode({focus:false});
  } catch(error){ setRecoveryMessage(error.message,error.status===429?'warning':'danger'); }
  finally{ button.disabled=false; if(!recoveryOtpActive) button.textContent=t('Send verification OTP','ভেরিফিকেশন OTP পাঠান'); }
}

const translations=[
  ['.login-eyebrow','Secure access','সুরক্ষিত অ্যাক্সেস'],['.login-brand p','P2P operations panel.','P2P অপারেশন প্যানেল।'],['#credentialStepIndicator b','Account','অ্যাকাউন্ট'],['#verificationStepIndicator b','Verify','ভেরিফাই'],['.credential-heading-row h2','Sign in','সাইন ইন'],['label[for="loginIdentity"]','User or Gmail','ইউজার অথবা জিমেইল'],['label[for="loginPassword"]','Password','পাসওয়ার্ড'],['#changeCredentialsBtn','Change','পরিবর্তন'],['#credentialVerifiedNote b','Password verified','পাসওয়ার্ড যাচাই হয়েছে'],['#credentialVerifiedNote small','Enter OTP and secret.','OTP এবং সিক্রেট লিখুন।'],['#verificationTitle','Email verification code','ইমেইল ভেরিফিকেশন কোড'],['label[for="loginSecretCode"]','Security PIN','সিকিউরিটি পিন'],['#resendOtpBtn','Resend OTP','OTP আবার পাঠান'],['.login-footer-note > span:last-child','Secure access','সুরক্ষিত অ্যাক্সেস'],['#emailRecoveryToggle','Setup email is wrong? Correct it','সেটআপের ইমেইল ভুল? এখানে ঠিক করুন'],['#useFullLoginBtn','Use full login','ফুল লগইন ব্যবহার করুন']
];
function applyLanguage(){
  document.documentElement.lang=lang==='bn'?'bn':'en'; document.body.classList.toggle('lang-bn',lang==='bn'); document.body.classList.toggle('lang-en',lang!=='bn'); document.title=lang==='bn'?'P2PFlow | লগইন':'P2PFlow | Login';
  translations.forEach(([selector,en,bn])=>{const node=$(selector);if(node)node.textContent=t(en,bn);});
  if($('#loginIdentity')) $('#loginIdentity').placeholder=t('username or name@gmail.com','ইউজারনেম অথবা name@gmail.com');
  if($('#loginPassword')) $('#loginPassword').placeholder=t('Enter your password','পাসওয়ার্ড লিখুন');
  if($('#loginSecretCode')) $('#loginSecretCode').placeholder=t('6-digit secret','৬ ডিজিট সিক্রেট');
  if($('#trustedSecretCode')) $('#trustedSecretCode').placeholder=t('6-digit secret','৬ ডিজিট সিক্রেট');
  const toggle=$('#loginLangToggle'); if(toggle) toggle.setAttribute('aria-checked',lang==='bn'?'true':'false'); setBusy(false);
}

async function initLogin(){
  applyLanguage(); setupOtpInputs(); setupVisibilityButtons(); setFullLoginMode({clear:true,focus:false});
  $('#loginLangToggle')?.addEventListener('click',()=>{lang=lang==='bn'?'en':'bn';localStorage.setItem('crmLang',lang);applyLanguage();});
  $('#changeCredentialsBtn')?.addEventListener('click',()=>{setError('');setFullLoginMode({clear:true,focus:true});});
  $('#useFullLoginBtn')?.addEventListener('click',()=>setFullLoginMode({clear:true,focus:true}));
  $('#resendOtpBtn')?.addEventListener('click',resendOtp); $('#loginForm')?.addEventListener('submit',submitLogin);
  $('#emailRecoveryToggle')?.addEventListener('click',()=>toggleRecovery($('#emailRecoveryForm')?.classList.contains('hidden'))); $('#recoveryCancelBtn')?.addEventListener('click',()=>toggleRecovery(false)); $('#emailRecoveryForm')?.addEventListener('submit',submitEmailRecovery);

  deviceRecord=await window.P2PFlowDeviceAuth?.load?.();
  try { await loginApi('/api/me'); window.location.replace(safeNextUrl()); return; }
  catch(error){ if(error.status && error.status!==401) setError(error.message); }

  if(deviceRecord){
    try { const info=await loginApi('/api/login/device/challenge',{method:'POST',body:JSON.stringify({deviceId:deviceRecord.deviceId})}); if(info.trustedDevice){setTrustedMode(info);return;} }
    catch(error){ if(error.status && error.status>=500) setError(error.message); }
  }
  setFullLoginMode({focus:true});
}

document.addEventListener('DOMContentLoaded',initLogin);
