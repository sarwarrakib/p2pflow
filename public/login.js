'use strict';

// Standalone P2PFlow authentication client. It intentionally does not load the
// application router/realtime code, so an expired session stays on a stable URL.

const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => Array.from(root.querySelectorAll(selector));
let lang = localStorage.getItem('crmLang') || 'bn';
let loginMode = 'full'; // full | verification | secret-only | fallback | owner-mail-outage | trusted
let verificationActive = false;
let secretOnlyActive = false;
let resendTimer = null;
let deviceRecord = null;
let recoveryOtpActive = false;
let recoveryMode = 'email';
let legacyUpgradeMode = false;
let securityFallbackActive = false;
let securityFallbackId = '';
let ownerMailOutageActive = false;
let ownerMailOutageId = '';

function t(en, bn) { return lang === 'bn' ? bn : en; }

function safeNextUrl() {
  try {
    const raw = String(new URLSearchParams(location.search).get('next') || '').trim();
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
    const parsed = new URL(raw, location.origin);
    if (parsed.origin !== location.origin || /^\/login(?:\.html)?\/?$/i.test(parsed.pathname)) return '/dashboard';
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/dashboard';
  } catch { return '/dashboard'; }
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
function setOwnerEmergencyEntry(show=false) {
  $('#ownerEmergencyEntry')?.classList.toggle('hidden', !show);
}
function looksLikeMailDeliveryFailure(error) {
  const text = `${String(error?.message || '')} ${String(error?.data?.error || '')} ${String(error?.data?.mailErrorCode || '')}`.toLowerCase();
  return /email|mail|smtp|gmail|outlook|sendmail|recipient|quota|rate limit|tls|ssl|network|timeout|535|550|delivery/.test(text);
}

function setBusy(busy) {
  const button = $('#loginBtn'); if (!button) return;
  button.disabled = Boolean(busy); button.classList.toggle('is-loading', Boolean(busy));
  const label = $('#loginBtnText'); if (!label) return;
  if (busy) label.textContent = loginMode === 'trusted' ? t('Unlocking...', 'আনলক করা হচ্ছে...') : (loginMode === 'fallback' ? t('Verifying fallback...', 'ফলব্যাক যাচাই করা হচ্ছে...') : (loginMode === 'owner-mail-outage' ? t('Opening emergency session...', 'ইমার্জেন্সি সেশন খোলা হচ্ছে...') : (loginMode === 'secret-only' ? t('Verifying PIN...', 'পিন যাচাই করা হচ্ছে...') : (verificationActive ? t('Verifying...', 'ভেরিফাই করা হচ্ছে...') : t('Checking...', 'যাচাই করা হচ্ছে...')))));
  else label.textContent = loginMode === 'trusted' ? t('Unlock with Secret', 'সিক্রেট দিয়ে লগইন') : (loginMode === 'fallback' ? t('Verify Answer & Sign In', 'উত্তর যাচাই করে সাইন ইন') : (loginMode === 'owner-mail-outage' ? t('Owner Emergency Sign In', 'ওনার ইমার্জেন্সি লগইন') : (loginMode === 'secret-only' ? t('Verify PIN & Sign In', 'পিন যাচাই করে সাইন ইন') : (verificationActive ? t('Verify & Sign In', 'ভেরিফাই করে সাইন ইন করুন') : t('Continue securely', 'নিরাপদে চালিয়ে যান')))));
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

function restoreEmailOtpUi() {
  $('#emailOtpDigits')?.classList.remove('hidden');
  $('.otp-resend-row')?.classList.remove('hidden');
  if ($('#verificationTitle')) $('#verificationTitle').textContent = t('Email verification code', 'ইমেইল ভেরিফিকেশন কোড');
  const note = $('#credentialVerifiedNote small'); if (note) note.textContent = t('Enter OTP and secret.', 'OTP এবং সিক্রেট লিখুন।');
}

function setVerificationStep(message, { restartCooldown=true }={}) {
  setOwnerEmergencyEntry(false);
  loginMode = 'verification'; verificationActive = true; secretOnlyActive = false; restoreEmailOtpUi();
  securityFallbackActive = false; securityFallbackId = ''; ownerMailOutageActive = false; ownerMailOutageId = ''; $('#securityFallbackPanel')?.classList.add('hidden'); $('#ownerMailOutagePanel')?.classList.add('hidden');
  $('#trustedDevicePanel')?.classList.add('hidden'); $('#credentialPanel')?.classList.remove('hidden'); $('#otpPanel')?.classList.remove('hidden');
  $('.login-card')?.classList.add('is-verification'); $('#changeCredentialsBtn')?.classList.remove('hidden'); $('#credentialVerifiedNote')?.classList.remove('hidden');
  ['#loginIdentity','#loginPassword'].forEach(selector => { const input=$(selector); if (input) { input.readOnly=true; input.closest('.login-input-shell')?.classList.add('is-readonly'); } });
  setAlert(message || t('Enter the email OTP.', 'ইমেইল OTP লিখুন।'), 'info'); if (restartCooldown) startCooldown(30); setBusy(false);
  setTimeout(() => ($$('.otp-digit').find(input => !input.value) || $('#loginSecretCode'))?.focus({ preventScroll:true }), 30);
}

function setSecretOnlyStep(message='') {
  setOwnerEmergencyEntry(false);
  loginMode = 'secret-only'; verificationActive = false; secretOnlyActive = true;
  securityFallbackActive = false; securityFallbackId = ''; ownerMailOutageActive = false; ownerMailOutageId = '';
  $('#trustedDevicePanel')?.classList.add('hidden'); $('#credentialPanel')?.classList.remove('hidden'); $('#otpPanel')?.classList.remove('hidden'); $('#securityFallbackPanel')?.classList.add('hidden'); $('#ownerMailOutagePanel')?.classList.add('hidden');
  $('#emailOtpDigits')?.classList.add('hidden'); $('.otp-resend-row')?.classList.add('hidden');
  if ($('#verificationTitle')) $('#verificationTitle').textContent = t('Security PIN', 'সিকিউরিটি পিন');
  const note = $('#credentialVerifiedNote small'); if (note) note.textContent = t('Enter your existing 6 digit secret.', 'আপনার বর্তমান ৬ ডিজিট সিক্রেট লিখুন।');
  $('.login-card')?.classList.add('is-verification'); $('.login-card')?.classList.remove('is-trusted'); $('#changeCredentialsBtn')?.classList.remove('hidden'); $('#credentialVerifiedNote')?.classList.remove('hidden');
  ['#loginIdentity','#loginPassword'].forEach(selector => { const input=$(selector); if (input) { input.readOnly=true; input.closest('.login-input-shell')?.classList.add('is-readonly'); } });
  clearOtp(); if ($('#loginSecretCode')) $('#loginSecretCode').value = '';
  if (resendTimer) clearInterval(resendTimer); resendTimer = null;
  setAlert(message || t('Email OTP is disabled. Enter your existing 6 digit Security PIN.', 'ইমেইল OTP বন্ধ আছে। আপনার বর্তমান ৬ ডিজিট সিকিউরিটি পিন লিখুন।'), 'info');
  setError(''); setBusy(false); setTimeout(() => $('#loginSecretCode')?.focus({ preventScroll:true }), 30);
}
function setSecurityFallbackStep(data={}) {
  setOwnerEmergencyEntry(false);
  loginMode = 'fallback'; verificationActive = false; secretOnlyActive = false; securityFallbackActive = true; securityFallbackId = String(data.fallbackId || ''); ownerMailOutageActive = false; ownerMailOutageId = ''; legacyUpgradeMode = false;
  $('#trustedDevicePanel')?.classList.add('hidden'); $('#credentialPanel')?.classList.remove('hidden'); $('#otpPanel')?.classList.add('hidden'); $('#securityFallbackPanel')?.classList.remove('hidden'); $('#ownerMailOutagePanel')?.classList.add('hidden');
  $('.login-card')?.classList.add('is-verification'); $('.login-card')?.classList.remove('is-trusted'); $('#changeCredentialsBtn')?.classList.remove('hidden'); $('#credentialVerifiedNote')?.classList.remove('hidden');
  ['#loginIdentity','#loginPassword'].forEach(selector => { const input=$(selector); if (input) { input.readOnly=true; input.closest('.login-input-shell')?.classList.add('is-readonly'); } });
  if ($('#securityFallbackQuestion')) $('#securityFallbackQuestion').textContent = String(data.securityQuestion || '-');
  if ($('#securityFallbackAnswer')) $('#securityFallbackAnswer').value = '';
  if ($('#securityFallbackSecretCode')) $('#securityFallbackSecretCode').value = '';
  const help = $('#securityFallbackHelp span'); if (help) help.textContent = String(data.message || t('Email OTP is unavailable. Use your Security Question fallback.', 'ইমেইল OTP পাঠানো যাচ্ছে না। Security Question fallback ব্যবহার করুন।'));
  if (resendTimer) clearInterval(resendTimer); resendTimer = null; setError(''); setBusy(false);
  setTimeout(() => $('#securityFallbackAnswer')?.focus({ preventScroll:true }), 40);
}

function setOwnerMailOutageStep(data={}) {
  setOwnerEmergencyEntry(false);
  loginMode = 'owner-mail-outage'; verificationActive = false; secretOnlyActive = false; securityFallbackActive = false; securityFallbackId = ''; ownerMailOutageActive = true; ownerMailOutageId = String(data.ownerMailOutageId || ''); legacyUpgradeMode = false;
  $('#trustedDevicePanel')?.classList.add('hidden'); $('#credentialPanel')?.classList.remove('hidden'); $('#otpPanel')?.classList.add('hidden'); $('#securityFallbackPanel')?.classList.add('hidden'); $('#ownerMailOutagePanel')?.classList.remove('hidden');
  $('.login-card')?.classList.add('is-verification'); $('.login-card')?.classList.remove('is-trusted'); $('#changeCredentialsBtn')?.classList.remove('hidden'); $('#credentialVerifiedNote')?.classList.remove('hidden');
  ['#loginIdentity','#loginPassword'].forEach(selector => { const input=$(selector); if (input) { input.readOnly=true; input.closest('.login-input-shell')?.classList.add('is-readonly'); } });
  if ($('#ownerMailOutageSecretCode')) $('#ownerMailOutageSecretCode').value = '';
  const help = $('#ownerMailOutageHelp span'); if (help) help.textContent = String(data.message || t('Email delivery failed. Owner Emergency Login is available.', 'ইমেইল পাঠানো ব্যর্থ হয়েছে। Owner Emergency Login ব্যবহার করা যাবে।'));
  if (resendTimer) clearInterval(resendTimer); resendTimer = null; setError(''); setBusy(false);
  setTimeout(() => $('#ownerMailOutageSecretCode')?.focus({ preventScroll:true }), 40);
}

function setFullLoginMode({ clear=false, focus=true, message='' }={}) {
  if (clear) setOwnerEmergencyEntry(false);
  loginMode = 'full'; verificationActive = false; secretOnlyActive = false; legacyUpgradeMode = false; restoreEmailOtpUi(); securityFallbackActive = false; securityFallbackId = ''; ownerMailOutageActive = false; ownerMailOutageId = '';
  $('#trustedDevicePanel')?.classList.add('hidden'); $('#credentialPanel')?.classList.remove('hidden'); $('#otpPanel')?.classList.add('hidden'); $('#securityFallbackPanel')?.classList.add('hidden'); $('#ownerMailOutagePanel')?.classList.add('hidden');
  $('.login-card')?.classList.remove('is-verification','is-trusted'); $('#changeCredentialsBtn')?.classList.add('hidden'); $('#credentialVerifiedNote')?.classList.add('hidden');
  ['#loginIdentity','#loginPassword'].forEach(selector => { const input=$(selector); if (input) { input.readOnly=false; input.closest('.login-input-shell')?.classList.remove('is-readonly'); } });
  if (clear) { clearOtp(); if ($('#loginSecretCode')) $('#loginSecretCode').value=''; if ($('#securityFallbackAnswer')) $('#securityFallbackAnswer').value=''; if ($('#securityFallbackSecretCode')) $('#securityFallbackSecretCode').value=''; if ($('#ownerMailOutageSecretCode')) $('#ownerMailOutageSecretCode').value=''; }
  if (resendTimer) clearInterval(resendTimer); resendTimer=null; if ($('#resendOtpBtn')) $('#resendOtpBtn').disabled=false;
  if (message) setError(message); setBusy(false); if (focus) $('#loginIdentity')?.focus({ preventScroll:true });
}
function setTrustedMode(info={}) {
  setOwnerEmergencyEntry(false);
  loginMode = 'trusted'; verificationActive = false; secretOnlyActive = false; securityFallbackActive = false; securityFallbackId = ''; ownerMailOutageActive = false; ownerMailOutageId = ''; legacyUpgradeMode = Boolean(info.legacyUpgrade);
  $('#credentialPanel')?.classList.add('hidden'); $('#otpPanel')?.classList.add('hidden'); $('#securityFallbackPanel')?.classList.add('hidden'); $('#ownerMailOutagePanel')?.classList.add('hidden'); $('#trustedDevicePanel')?.classList.remove('hidden');
  $('.login-card')?.classList.remove('is-verification'); $('.login-card')?.classList.add('is-trusted');
  $('#trustedDeviceAccountHint').textContent = info.accountHint ? `${t('Account', 'অ্যাকাউন্ট')}: ${info.accountHint}` : '';
  $('#trustedDeviceStatus').textContent = legacyUpgradeMode ? t('Secure this existing session', 'এই পুরোনো সেশনটি সুরক্ষিত করুন') : t('Trusted browser recognized', 'বিশ্বস্ত ডিভাইস শনাক্ত হয়েছে');
  if ($('#trustedSecretCode')) $('#trustedSecretCode').value=''; setError(''); setBusy(false);
  setTimeout(() => $('#trustedSecretCode')?.focus({ preventScroll:true }), 40);
}

function validateFull() {
  const identity=String($('#loginIdentity')?.value||'').trim(), password=String($('#loginPassword')?.value||'');
  if (!identity || !password) { setError(t('Enter your username or Gmail and password.', 'ইউজারনেম বা জিমেইল এবং পাসওয়ার্ড লিখুন।')); (!identity ? $('#loginIdentity') : $('#loginPassword'))?.focus(); return false; }
  if (loginMode === 'fallback') {
    const answer = String($('#securityFallbackAnswer')?.value || '').trim();
    const secret = String($('#securityFallbackSecretCode')?.value || '').replace(/\D/g,'').slice(0,6); if ($('#securityFallbackSecretCode')) $('#securityFallbackSecretCode').value = secret;
    if (!answer) { setError(t('Enter your Security Answer.', 'Security Answer লিখুন।')); $('#securityFallbackAnswer')?.focus(); return false; }
    if (secret.length !== 6) { setError(t('Enter your existing 6-digit security PIN / secret.', 'আপনার বর্তমান ৬ ডিজিট সিকিউরিটি পিন / সিক্রেট লিখুন।')); $('#securityFallbackSecretCode')?.focus(); return false; }
    if (!securityFallbackId) { setError(t('Security Question challenge expired. Start again.', 'Security Question challenge শেষ হয়েছে। আবার শুরু করুন।')); return false; }
    return true;
  }
  if (loginMode === 'owner-mail-outage') {
    const secret = String($('#ownerMailOutageSecretCode')?.value || '').replace(/\D/g,'').slice(0,6); if ($('#ownerMailOutageSecretCode')) $('#ownerMailOutageSecretCode').value = secret;
    if (secret.length !== 6) { setError(t('Enter your existing 6-digit security PIN / secret.', 'আপনার বর্তমান ৬ ডিজিট সিকিউরিটি পিন / সিক্রেট লিখুন।')); $('#ownerMailOutageSecretCode')?.focus(); return false; }
    if (!ownerMailOutageId) { setError(t('Owner Emergency Login challenge expired. Start again.', 'Owner Emergency Login challenge শেষ হয়েছে। আবার শুরু করুন।')); return false; }
    return true;
  }
  if (loginMode === 'secret-only') {
    const secret = String($('#loginSecretCode')?.value || '').replace(/\D/g,'').slice(0,6); if ($('#loginSecretCode')) $('#loginSecretCode').value = secret;
    if (secret.length !== 6) { setError(t('Enter your existing 6-digit security PIN / secret.', 'আপনার বর্তমান ৬ ডিজিট সিকিউরিটি পিন / সিক্রেট লিখুন।')); $('#loginSecretCode')?.focus(); return false; }
    return true;
  }
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
  setBusy(true);
  try {
    if (legacyUpgradeMode) {
      const enrollment = await enrollmentPayload();
      if (!enrollment) { setFullLoginMode({ message:t('This browser cannot create a secure device key. Use full login.', 'এই ব্রাউজার সিকিউর ডিভাইস কী তৈরি করতে পারছে না। ফুল লগইন করুন।') }); return; }
      const data = await loginApi('/api/login/device/upgrade', { method:'POST', body:JSON.stringify({ secretCode:$('#trustedSecretCode').value, deviceEnrollment:enrollment }) });
      if (data.ok) { window.location.replace(safeNextUrl()); return; }
    }
    if (!deviceRecord) deviceRecord = await window.P2PFlowDeviceAuth?.load?.();
    if (!deviceRecord) { setFullLoginMode({ message:t('Trusted browser key is missing. Use full login.', 'বিশ্বস্ত ডিভাইসের কী পাওয়া যায়নি। ফুল লগইন করুন।') }); return; }
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
  if (loginMode === 'fallback') {
    payload.emailOtp = ''; payload.resendOtp = false; payload.securityFallbackId = securityFallbackId;
    payload.securityAnswer = String($('#securityFallbackAnswer')?.value || '').trim();
    payload.secretCode = String($('#securityFallbackSecretCode')?.value || '').replace(/\D/g,'').slice(0,6);
  } else if (loginMode === 'owner-mail-outage') {
    payload.emailOtp = ''; payload.resendOtp = false; payload.ownerMailOutageId = ownerMailOutageId;
    payload.secretCode = String($('#ownerMailOutageSecretCode')?.value || '').replace(/\D/g,'').slice(0,6);
  }
  const enrollment = await enrollmentPayload(); if (enrollment) payload.deviceEnrollment=enrollment;
  setBusy(true);
  try {
    const data=await loginApi('/api/login',{method:'POST',body:JSON.stringify(payload)});
    if (data.securityFallbackRequired) { setSecurityFallbackStep(data); return; }
    if (data.ownerMailOutageRequired) { setOwnerMailOutageStep(data); return; }
    if (data.secretRequired) { setSecretOnlyStep(data.message); return; }
    if (data.otpRequired) {
      const baseMessage=data.message||t('Check your email and enter the OTP.','ইমেইল দেখে OTP লিখুন।');
      const deliveryHint=data.otpRecipient ? ` ${t('Recipient','প্রাপক')}: ${data.otpRecipient}${data.otpDriver ? ` · ${data.otpDriver}` : ''}` : '';
      const message=`${baseMessage}${deliveryHint}`;
      setVerificationStep(message,{restartCooldown:!verificationActive||/sent|expired/i.test(baseMessage)});
      return;
    }
    window.location.replace(safeNextUrl());
  } catch(error) {
    if (error.data?.securityFallbackExpired || error.data?.ownerMailOutageExpired) { setFullLoginMode({ clear:true, focus:true, message:error.message }); }
    else if (loginMode === 'fallback' || loginMode === 'owner-mail-outage') { setError(error.message); const help=$('#securityFallbackHelp span'); if(help) help.textContent=error.message; }
    else {
      setError(error.message);
      if (verificationActive) setAlert(error.message,error.status===429?'warning':'danger');
      else {
        if (loginMode === 'full' && looksLikeMailDeliveryFailure(error)) setOwnerEmergencyEntry(true);
        $('#loginPassword')?.focus({preventScroll:true}); $('#loginPassword')?.select();
      }
    }
  } finally { setBusy(false); }
}
async function startOwnerEmergencyLogin() {
  const identity = String($('#loginIdentity')?.value || '').trim();
  const password = String($('#loginPassword')?.value || '');
  if (!identity || !password) {
    setError(t('Enter the Owner username/email and password first.', 'আগে Owner ইউজারনেম/ইমেইল এবং পাসওয়ার্ড লিখুন।'));
    (!identity ? $('#loginIdentity') : $('#loginPassword'))?.focus({ preventScroll:true });
    return;
  }
  setError('');
  const button = $('#ownerEmergencyStartBtn'); if (button) button.disabled = true;
  try {
    const payload = { username: identity, password, ownerEmergencyStart: true };
    const data = await loginApi('/api/login', { method:'POST', body:JSON.stringify(payload) });
    if (data.securityFallbackRequired) { setSecurityFallbackStep(data); return; }
    if (data.ownerMailOutageRequired) { setOwnerMailOutageStep(data); return; }
    if (data.secretRequired) { setSecretOnlyStep(data.message); return; }
    if (data.otpRequired) {
      const baseMessage = data.message || t('The email route is working; use the OTP that was sent.', 'ইমেইল রুট কাজ করছে; পাঠানো OTP ব্যবহার করুন।');
      const deliveryHint = data.otpRecipient ? ` ${t('Recipient','প্রাপক')}: ${data.otpRecipient}${data.otpDriver ? ` · ${data.otpDriver}` : ''}` : '';
      setVerificationStep(`${baseMessage}${deliveryHint}`, { restartCooldown:true });
      return;
    }
    setError(t('Owner Emergency Login could not be started.', 'Owner Emergency Login শুরু করা যায়নি।'));
  } catch (error) {
    setError(error.message);
    if (looksLikeMailDeliveryFailure(error)) setOwnerEmergencyEntry(true);
  } finally {
    if (button) button.disabled = false;
  }
}
async function submitLogin(event) { event.preventDefault(); setError(''); if (loginMode==='trusted') return submitTrustedLogin(); return submitFullLogin(event.currentTarget); }

async function resendOtp() {
  if (!verificationActive) return; setError(''); const payload=Object.fromEntries(new FormData($('#loginForm'))); payload.emailOtp=''; payload.secretCode=''; payload.resendOtp=true;
  const enrollment=await enrollmentPayload(); if (enrollment) payload.deviceEnrollment=enrollment;
  const button=$('#resendOtpBtn'); if(button) button.disabled=true;
  try {
    const data=await loginApi('/api/login',{method:'POST',body:JSON.stringify(payload)});
    if (data.securityFallbackRequired) { clearOtp(); setSecurityFallbackStep(data); return; }
    if (data.ownerMailOutageRequired) { clearOtp(); setOwnerMailOutageStep(data); return; }
    clearOtp();
    const baseMessage=data.message||t('A new OTP was sent.','নতুন OTP পাঠানো হয়েছে।');
    const deliveryHint=data.otpRecipient ? ` ${t('Recipient','প্রাপক')}: ${data.otpRecipient}${data.otpDriver ? ` · ${data.otpDriver}` : ''}` : '';
    setVerificationStep(`${baseMessage}${deliveryHint}`,{restartCooldown:true});
  }
  catch(error){ setError(error.message); setAlert(error.message,error.status===429?'warning':'danger'); const wait=String(error.message||'').match(/wait\s+(\d+)\s+seconds/i); if(wait) startCooldown(Number(wait[1])); else if(button) button.disabled=false; }
}

function setRecoveryCodeMode(mode='email') {
  recoveryMode = mode === 'hosting' ? 'hosting' : 'email';
  const input = $('#recoveryOtp'), label = $('#recoveryCodeLabel');
  if (!input) return;
  if (recoveryMode === 'hosting') {
    input.type = 'text'; input.inputMode = 'text'; input.maxLength = 24; input.pattern = '[A-Za-z0-9_-]{8,24}'; input.placeholder = 'Hosting recovery code';
    if (label) label.textContent = t('Hosting Recovery Code', 'হোস্টিং রিকভারি কোড');
  } else {
    input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 6; input.pattern = '[0-9]{6}'; input.placeholder = '6 digit OTP';
    if (label) label.textContent = t('New Email OTP', 'নতুন ইমেইল OTP');
  }
}
function toggleRecovery(show) {
  const form=$('#emailRecoveryForm'); if(!form) return; form.classList.toggle('hidden',!show);
  if(show){ $('#recoveryIdentity').value=String($('#loginIdentity')?.value||'').trim(); $('#recoveryPassword').value=String($('#loginPassword')?.value||''); $('#recoveryIdentity')?.focus({preventScroll:true}); }
  else { recoveryOtpActive=false; recoveryMode='email'; form.reset(); $('#recoveryId').value=''; $('#recoveryOtpWrap').classList.add('hidden'); setRecoveryCodeMode('email'); setRecoveryMessage(''); }
}
async function submitEmailRecovery(event) {
  event.preventDefault(); setRecoveryMessage(''); const form=event.currentTarget; const payload=Object.fromEntries(new FormData(form));
  payload.secretCode=String(payload.secretCode||'').replace(/\D/g,'').slice(0,6);
  payload.recoveryOtp = recoveryMode === 'hosting' ? String(payload.recoveryOtp||'').trim().toUpperCase().slice(0,24) : String(payload.recoveryOtp||'').replace(/\D/g,'').slice(0,6);
  payload.recoveryMode = recoveryMode;
  const enrollment = await enrollmentPayload(); if (enrollment) payload.deviceEnrollment = enrollment;
  if(!payload.username||!payload.password||payload.secretCode.length!==6||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(payload.newEmail||''))){ setRecoveryMessage(t('Enter username, current password, 6 digit secret and a valid new email.','ইউজারনেম, বর্তমান পাসওয়ার্ড, ৬ ডিজিট সিক্রেট এবং সঠিক নতুন ইমেইল দিন।'),'danger'); return; }
  if(recoveryOtpActive){
    const validCode = recoveryMode === 'hosting' ? /^[A-Z0-9_-]{8,24}$/i.test(payload.recoveryOtp) : /^\d{6}$/.test(payload.recoveryOtp);
    if(!validCode){ setRecoveryMessage(recoveryMode==='hosting' ? t('Enter the Hosting Recovery Code generated by the Hosting Terminal command.','Hosting Terminal command থেকে তৈরি Hosting Recovery Code দিন।') : t('Enter the 6 digit OTP sent to the new email.','নতুন ইমেইলে পাঠানো ৬ ডিজিট OTP দিন।'),'danger'); return; }
  }
  const button=$('#recoverySubmitBtn'); button.disabled=true;
  try {
    const data=await loginApi('/api/login/recover-email',{method:'POST',body:JSON.stringify(payload)});
    if(data.recoveryOtpRequired){ recoveryOtpActive=true; recoveryMode=data.recoveryMode==='hosting'?'hosting':'email'; setRecoveryCodeMode(recoveryMode); $('#recoveryId').value=data.recoveryId||''; $('#recoveryOtpWrap').classList.remove('hidden'); button.textContent=recoveryMode==='hosting'?t('Confirm with Hosting Code','হোস্টিং কোড দিয়ে নিশ্চিত করুন'):t('Confirm corrected email','সঠিক ইমেইল নিশ্চিত করুন'); setRecoveryMessage(data.message,'warning'); $('#recoveryOtp')?.focus({preventScroll:true}); return; }
    setRecoveryMessage(data.message||t('Email corrected.','ইমেইল ঠিক হয়েছে।'),'success');
    recoveryOtpActive=false; $('#recoveryOtpWrap').classList.add('hidden');
    if (data.recoveredAndSignedIn) { setTimeout(()=>window.location.replace(safeNextUrl()),350); return; }
    await window.P2PFlowDeviceAuth?.forget?.(); deviceRecord=null; $('#loginIdentity').value=payload.username; $('#loginPassword').value=''; setFullLoginMode({focus:false});
  } catch(error){ setRecoveryMessage(error.message,error.status===429?'warning':'danger'); }
  finally{ button.disabled=false; if(!recoveryOtpActive) button.textContent=t('Send verification OTP','ভেরিফিকেশন OTP পাঠান'); }
}

const translations=[
  ['.login-eyebrow','Secure access','সুরক্ষিত অ্যাক্সেস'],['.login-brand p','P2P operations panel.','P2P অপারেশন প্যানেল।'],['#credentialStepIndicator b','Account','অ্যাকাউন্ট'],['#verificationStepIndicator b','Verify','ভেরিফাই'],['.credential-heading-row h2','Sign in','সাইন ইন'],['label[for="loginIdentity"]','User or Gmail','ইউজার অথবা জিমেইল'],['label[for="loginPassword"]','Password','পাসওয়ার্ড'],['#changeCredentialsBtn','Change','পরিবর্তন'],['#credentialVerifiedNote b','Password verified','পাসওয়ার্ড যাচাই হয়েছে'],['#credentialVerifiedNote small','Enter OTP and secret.','OTP এবং সিক্রেট লিখুন।'],['#verificationTitle','Email verification code','ইমেইল ভেরিফিকেশন কোড'],['label[for="loginSecretCode"]','Security PIN','সিকিউরিটি পিন'],['#resendOtpBtn','Resend OTP','OTP আবার পাঠান'],['.login-footer-note > span:last-child','Secure access','সুরক্ষিত অ্যাক্সেস'],['#emailRecoveryToggle','Setup email is wrong? Correct it','সেটআপের ইমেইল ভুল? এখানে ঠিক করুন'],['#useFullLoginBtn','Use full login','ফুল লগইন ব্যবহার করুন'],['#ownerMailOutageTitle','Owner Emergency Login','ওনার ইমার্জেন্সি লগইন'],['#ownerMailOutageDescription','Mail service is down. Confirm your existing 6 digit secret. Login email stays unchanged.','মেইল সার্ভিস বন্ধ। বর্তমান ৬ ডিজিট সিক্রেট নিশ্চিত করুন। লগইন ইমেইল অপরিবর্তিত থাকবে।'],['#ownerEmergencyStartBtn','Email sender down? Owner Emergency Login','ইমেইল সেন্ডার বন্ধ? Owner Emergency Login'],['label[for="ownerMailOutageSecretCode"]','Security PIN','সিকিউরিটি পিন']
];
function applyLanguage(){
  document.documentElement.lang=lang==='bn'?'bn':'en'; document.body.classList.toggle('lang-bn',lang==='bn'); document.body.classList.toggle('lang-en',lang!=='bn'); document.title=lang==='bn'?'P2PFlow | লগইন':'P2PFlow | Login';
  translations.forEach(([selector,en,bn])=>{const node=$(selector);if(node)node.textContent=t(en,bn);});
  if($('#loginIdentity')) $('#loginIdentity').placeholder=t('username or name@gmail.com','ইউজারনেম অথবা name@gmail.com');
  if($('#loginPassword')) $('#loginPassword').placeholder=t('Enter your password','পাসওয়ার্ড লিখুন');
  if($('#loginSecretCode')) $('#loginSecretCode').placeholder=t('6-digit secret','৬ ডিজিট সিক্রেট');
  if($('#trustedSecretCode')) $('#trustedSecretCode').placeholder=t('6-digit secret','৬ ডিজিট সিক্রেট');
  if($('#securityFallbackAnswer')) $('#securityFallbackAnswer').placeholder=t('Security answer','সিকিউরিটি উত্তর');
  if($('#securityFallbackSecretCode')) $('#securityFallbackSecretCode').placeholder=t('6-digit secret','৬ ডিজিট সিক্রেট');
  if($('#ownerMailOutageSecretCode')) $('#ownerMailOutageSecretCode').placeholder=t('6-digit secret','৬ ডিজিট সিক্রেট');
  const toggle=$('#loginLangToggle'); if(toggle) toggle.setAttribute('aria-checked',lang==='bn'?'true':'false');
  if (loginMode === 'secret-only') {
    if ($('#verificationTitle')) $('#verificationTitle').textContent = t('Security PIN', 'সিকিউরিটি পিন');
    const note = $('#credentialVerifiedNote small'); if (note) note.textContent = t('Enter your existing 6 digit secret.', 'আপনার বর্তমান ৬ ডিজিট সিক্রেট লিখুন।');
  }
  setBusy(false);
}

async function initLogin(){
  applyLanguage(); setupOtpInputs(); setupVisibilityButtons(); setFullLoginMode({clear:true,focus:false});
  $('#loginLangToggle')?.addEventListener('click',()=>{lang=lang==='bn'?'en':'bn';localStorage.setItem('crmLang',lang);applyLanguage();});
  $('#changeCredentialsBtn')?.addEventListener('click',()=>{setError('');setFullLoginMode({clear:true,focus:true});});
  $('#useFullLoginBtn')?.addEventListener('click',()=>setFullLoginMode({clear:true,focus:true}));
  $('#resendOtpBtn')?.addEventListener('click',resendOtp); $('#loginForm')?.addEventListener('submit',submitLogin);
  $('#ownerEmergencyStartBtn')?.addEventListener('click',startOwnerEmergencyLogin);
  $('#emailRecoveryToggle')?.addEventListener('click',()=>toggleRecovery($('#emailRecoveryForm')?.classList.contains('hidden'))); $('#recoveryCancelBtn')?.addEventListener('click',()=>toggleRecovery(false)); $('#emailRecoveryForm')?.addEventListener('submit',submitEmailRecovery);

  deviceRecord=await window.P2PFlowDeviceAuth?.load?.();
  try { await loginApi('/api/me'); window.location.replace(safeNextUrl()); return; }
  catch(error){ if(error.status && error.status!==401) setError(error.message); }

  try {
    const legacy=await loginApi('/api/login/device/legacy');
    if(legacy.legacySession){ setTrustedMode({ legacyUpgrade:true, accountHint:legacy.username, message:legacy.message }); return; }
  } catch(error){ if(error.status && error.status>=500) setError(error.message); }

  if(deviceRecord){
    try { const info=await loginApi('/api/login/device/challenge',{method:'POST',body:JSON.stringify({deviceId:deviceRecord.deviceId})}); if(info.trustedDevice){setTrustedMode(info);return;} }
    catch(error){ if(error.status && error.status>=500) setError(error.message); }
  }
  setFullLoginMode({focus:true});
}

document.addEventListener('DOMContentLoaded',initLogin);
