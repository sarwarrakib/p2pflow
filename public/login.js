'use strict';

// Standalone P2PFlow authentication client.
// Intentionally does not load the application router, page modules, realtime streams,
// or automatic page-reload logic. This keeps an expired session on a stable login URL.

const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => Array.from(root.querySelectorAll(selector));
const LOGIN_PATH = '/login';
let lang = localStorage.getItem('crmLang') || 'bn';
let verificationActive = false;
let resendTimer = null;

function t(en, bn) { return lang === 'bn' ? bn : en; }

function safeNextUrl() {
  try {
    const params = new URLSearchParams(location.search);
    const raw = String(params.get('next') || '').trim();
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/#/dashboard';
    const parsed = new URL(raw, location.origin);
    if (parsed.origin !== location.origin) return '/#/dashboard';
    if (/^\/login(?:\.html)?\/?$/i.test(parsed.pathname)) return '/#/dashboard';
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/#/dashboard';
  } catch {
    return '/#/dashboard';
  }
}

function looksLikeHtml(text) {
  return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(String(text || '').slice(0, 500));
}

function htmlTitle(text) {
  const raw = String(text || '');
  const title = (raw.match(/<title[^>]*>(.*?)<\/title>/i) || [])[1] || (raw.match(/<h1[^>]*>(.*?)<\/h1>/i) || [])[1] || '';
  return title.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

async function loginApi(path, opts={}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {})
      },
      ...opts
    });
  } catch (error) {
    throw new Error(t(
      `Could not reach the server. ${error.message || ''}`.trim(),
      `সার্ভারের সাথে সংযোগ করা যায়নি। ${error.message || ''}`.trim()
    ));
  }

  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '');

  if (!response.ok) {
    if (data && typeof data === 'object') throw Object.assign(new Error(data.error || data.message || `HTTP ${response.status}`), { status: response.status, data });
    if (looksLikeHtml(data)) {
      const title = htmlTitle(data);
      throw Object.assign(new Error(t(
        `Server is temporarily unavailable${response.status ? ` (HTTP ${response.status})` : ''}${title ? `: ${title}` : ''}. This login page will not auto-reload; try again when the server is ready.`,
        `সার্ভার সাময়িকভাবে পাওয়া যাচ্ছে না${response.status ? ` (HTTP ${response.status})` : ''}${title ? `: ${title}` : ''}। এই লগইন পেজ নিজে থেকে রিলোড হবে না; সার্ভার চালু হলে আবার চেষ্টা করুন।`
      )), { status: response.status });
    }
    throw Object.assign(new Error(String(data || `HTTP ${response.status}`).slice(0, 500)), { status: response.status });
  }

  if (!type.includes('application/json')) {
    throw new Error(t('Unexpected server response. Please try again.', 'সার্ভার থেকে অপ্রত্যাশিত রেসপন্স এসেছে। আবার চেষ্টা করুন।'));
  }
  return data;
}

function setBusy(busy) {
  const button = $('#loginBtn');
  if (!button) return;
  button.disabled = Boolean(busy);
  button.classList.toggle('is-loading', Boolean(busy));
  const label = $('#loginBtnText');
  if (label) label.textContent = busy
    ? (verificationActive ? t('Verifying...', 'ভেরিফাই করা হচ্ছে...') : t('Checking...', 'যাচাই করা হচ্ছে...'))
    : (verificationActive ? t('Verify & Sign In', 'ভেরিফাই করে সাইন ইন করুন') : t('Continue securely', 'নিরাপদে চালিয়ে যান'));
}

function setAlert(message, tone='info') {
  const alert = $('#otpHelp');
  if (!alert) return;
  const text = alert.querySelector('span');
  if (text) text.textContent = String(message || '');
  alert.classList.remove('login-alert-info','login-alert-warning','login-alert-danger','login-alert-success');
  const safeTone = ['warning','danger','success'].includes(tone) ? tone : 'info';
  alert.classList.add(`login-alert-${safeTone}`);
}

function setError(message='') {
  const node = $('#loginError');
  if (node) node.textContent = String(message || '');
}

function syncOtpValue() {
  const hidden = $('#emailOtpInput');
  if (!hidden) return '';
  const value = $$('.otp-digit', $('#emailOtpDigits')).map(input => input.value.replace(/\D/g, '').slice(0, 1)).join('');
  hidden.value = value;
  return value;
}

function clearOtp() {
  $$('.otp-digit', $('#emailOtpDigits')).forEach(input => { input.value = ''; });
  if ($('#emailOtpInput')) $('#emailOtpInput').value = '';
}

function setupOtpInputs() {
  const digits = $$('.otp-digit', $('#emailOtpDigits'));
  digits.forEach((input, index) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(-1);
      syncOtpValue();
      if (input.value && digits[index + 1]) digits[index + 1].focus();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Backspace' && !input.value && digits[index - 1]) {
        digits[index - 1].value = '';
        syncOtpValue();
        digits[index - 1].focus();
      } else if (event.key === 'ArrowLeft' && digits[index - 1]) {
        event.preventDefault(); digits[index - 1].focus();
      } else if (event.key === 'ArrowRight' && digits[index + 1]) {
        event.preventDefault(); digits[index + 1].focus();
      }
    });
    input.addEventListener('paste', event => {
      const value = (event.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      if (!value) return;
      event.preventDefault();
      digits.forEach((digit, i) => { digit.value = value[i] || ''; });
      syncOtpValue();
      (digits[Math.min(value.length, digits.length) - 1] || digits[0])?.focus();
    });
  });
}

function setupVisibilityButtons() {
  $$('[data-visibility-target]').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.visibilityTarget || '');
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.setAttribute('aria-pressed', show ? 'true' : 'false');
    button.setAttribute('aria-label', show ? t('Hide value', 'লুকান') : t('Show value', 'দেখান'));
    input.focus({ preventScroll: true });
  }));
}

function startCooldown(seconds=30) {
  const button = $('#resendOtpBtn');
  const text = $('#otpTimerText');
  if (!button || !text) return;
  if (resendTimer) clearInterval(resendTimer);
  let remaining = Math.max(0, Number(seconds) || 0);
  const render = () => {
    if (remaining <= 0) {
      button.disabled = false;
      text.textContent = t('You can request a new email OTP now.', 'এখন নতুন ইমেইল OTP চাইতে পারবেন।');
      if (resendTimer) clearInterval(resendTimer);
      resendTimer = null;
      return;
    }
    button.disabled = true;
    const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
    const ss = String(remaining % 60).padStart(2, '0');
    text.textContent = t(`Resend available in ${mm}:${ss}`, `${mm}:${ss} পর আবার OTP পাঠাতে পারবেন`);
    remaining -= 1;
  };
  render();
  resendTimer = setInterval(render, 1000);
}

function setVerificationStep(message, { restartCooldown=true }={}) {
  verificationActive = true;
  $('.login-card')?.classList.add('is-verification');
  $('#otpPanel')?.classList.remove('hidden');
  $('#changeCredentialsBtn')?.classList.remove('hidden');
  $('#credentialVerifiedNote')?.classList.remove('hidden');
  ['#loginIdentity','#loginPassword'].forEach(selector => {
    const input = $(selector);
    if (!input) return;
    input.readOnly = true;
    input.closest('.login-input-shell')?.classList.add('is-readonly');
  });
  setAlert(message || t('Enter the email OTP.', 'ইমেইল OTP লিখুন।'), 'info');
  setBusy(false);
  if (restartCooldown) startCooldown(30);
  setTimeout(() => ($$('.otp-digit').find(input => !input.value) || $('#loginSecretCode'))?.focus({ preventScroll: true }), 30);
}

function resetVerification({ clear=true, focus=true }={}) {
  verificationActive = false;
  $('.login-card')?.classList.remove('is-verification');
  $('#otpPanel')?.classList.add('hidden');
  $('#changeCredentialsBtn')?.classList.add('hidden');
  $('#credentialVerifiedNote')?.classList.add('hidden');
  ['#loginIdentity','#loginPassword'].forEach(selector => {
    const input = $(selector);
    if (!input) return;
    input.readOnly = false;
    input.closest('.login-input-shell')?.classList.remove('is-readonly');
  });
  if (clear) {
    clearOtp();
    if ($('#loginSecretCode')) $('#loginSecretCode').value = '';
  }
  if (resendTimer) clearInterval(resendTimer);
  resendTimer = null;
  if ($('#resendOtpBtn')) $('#resendOtpBtn').disabled = false;
  if ($('#otpTimerText')) $('#otpTimerText').textContent = t('A new code can be requested shortly.', 'কিছুক্ষণ পর নতুন কোড চাইতে পারবেন।');
  setBusy(false);
  if (focus) $('#loginIdentity')?.focus({ preventScroll: true });
}

function validate() {
  const identity = String($('#loginIdentity')?.value || '').trim();
  const password = String($('#loginPassword')?.value || '');
  if (!identity || !password) {
    setError(t('Enter your username or Gmail and password.', 'ইউজারনেম বা জিমেইল এবং পাসওয়ার্ড লিখুন।'));
    (!identity ? $('#loginIdentity') : $('#loginPassword'))?.focus();
    return false;
  }
  if (!verificationActive) return true;
  const otp = syncOtpValue();
  const secret = String($('#loginSecretCode')?.value || '').replace(/\D/g, '').slice(0, 6);
  if ($('#loginSecretCode')) $('#loginSecretCode').value = secret;
  if (otp.length !== 6) {
    setError(t('Enter the complete 6-digit email OTP.', 'সম্পূর্ণ ৬ ডিজিট ইমেইল OTP লিখুন।'));
    ($$('.otp-digit').find(input => !input.value) || $$('.otp-digit')[0])?.focus();
    return false;
  }
  if (secret.length !== 6) {
    setError(t('Enter your 6-digit security PIN / secret.', 'আপনার ৬ ডিজিট সিকিউরিটি পিন / সিক্রেট লিখুন।'));
    $('#loginSecretCode')?.focus();
    return false;
  }
  return true;
}

const translations = [
  ['.login-eyebrow','Secure access','সুরক্ষিত অ্যাক্সেস'],
  ['.login-brand p','P2P operations panel.','P2P অপারেশন প্যানেল।'],
  ['#credentialStepIndicator b','Account','অ্যাকাউন্ট'],
  ['#verificationStepIndicator b','Verify','ভেরিফাই'],
  ['.credential-heading-row h2','Sign in','সাইন ইন'],
  ['label[for="loginIdentity"]','User or Gmail','ইউজার অথবা জিমেইল'],
  ['label[for="loginPassword"]','Password','পাসওয়ার্ড'],
  ['#changeCredentialsBtn','Change','পরিবর্তন'],
  ['#credentialVerifiedNote b','Password verified','পাসওয়ার্ড যাচাই হয়েছে'],
  ['#credentialVerifiedNote small','Enter OTP and secret.','OTP এবং সিক্রেট লিখুন।'],
  ['#verificationTitle','Email verification code','ইমেইল ভেরিফিকেশন কোড'],
  ['label[for="loginSecretCode"]','Security PIN','সিকিউরিটি পিন'],
  ['#resendOtpBtn','Resend OTP','OTP আবার পাঠান'],
  ['.login-footer-note > span:last-child','Secure access','সুরক্ষিত অ্যাক্সেস']
];

function applyLanguage() {
  document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
  document.body.classList.toggle('lang-bn', lang === 'bn');
  document.body.classList.toggle('lang-en', lang !== 'bn');
  document.title = lang === 'bn' ? 'P2PFlow | লগইন' : 'P2PFlow | Login';
  translations.forEach(([selector, en, bn]) => {
    const node = $(selector);
    if (node) node.textContent = t(en, bn);
  });
  if ($('#loginIdentity')) $('#loginIdentity').placeholder = t('username or name@gmail.com', 'ইউজারনেম অথবা name@gmail.com');
  if ($('#loginPassword')) $('#loginPassword').placeholder = t('Enter your password', 'পাসওয়ার্ড লিখুন');
  if ($('#loginSecretCode')) $('#loginSecretCode').placeholder = t('6-digit secret', '৬ ডিজিট সিক্রেট');
  const toggle = $('#loginLangToggle');
  if (toggle) toggle.setAttribute('aria-checked', lang === 'bn' ? 'true' : 'false');
  if (!verificationActive) resetVerification({ clear:false, focus:false });
  else setBusy(false);
}

async function submitLogin(event) {
  event.preventDefault();
  setError('');
  if (!validate()) return;
  syncOtpValue();
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  setBusy(true);
  try {
    const data = await loginApi('/api/login', { method:'POST', body:JSON.stringify(payload) });
    if (data.otpRequired) {
      const message = data.message || t('Check your email and enter the OTP.', 'ইমেইল দেখে OTP লিখুন।');
      setVerificationStep(message, { restartCooldown: !verificationActive || /sent|expired/i.test(message) });
      return;
    }
    setAlert(t('Verification successful. Opening your dashboard...', 'ভেরিফিকেশন সফল। ড্যাশবোর্ড খোলা হচ্ছে...'), 'success');
    window.location.replace(safeNextUrl());
  } catch (error) {
    setError(error.message);
    if (verificationActive) setAlert(error.message, error.status === 429 ? 'warning' : 'danger');
    else {
      $('#loginPassword')?.focus({ preventScroll: true });
      $('#loginPassword')?.select();
    }
  } finally {
    setBusy(false);
  }
}

async function resendOtp() {
  if (!verificationActive) return;
  setError('');
  const payload = Object.fromEntries(new FormData($('#loginForm')));
  payload.emailOtp = '';
  payload.secretCode = '';
  payload.resendOtp = true;
  const button = $('#resendOtpBtn');
  if (button) button.disabled = true;
  try {
    const data = await loginApi('/api/login', { method:'POST', body:JSON.stringify(payload) });
    clearOtp();
    setVerificationStep(data.message || t('A new OTP was sent.', 'নতুন OTP পাঠানো হয়েছে।'), { restartCooldown:true });
  } catch (error) {
    setError(error.message);
    setAlert(error.message, error.status === 429 ? 'warning' : 'danger');
    const wait = String(error.message || '').match(/wait\s+(\d+)\s+seconds/i);
    if (wait) startCooldown(Number(wait[1]));
    else if (button) button.disabled = false;
  }
}

async function initLogin() {
  applyLanguage();
  setupOtpInputs();
  setupVisibilityButtons();
  resetVerification({ clear:true, focus:false });
  $('#loginLangToggle')?.addEventListener('click', () => {
    lang = lang === 'bn' ? 'en' : 'bn';
    localStorage.setItem('crmLang', lang);
    applyLanguage();
  });
  $('#changeCredentialsBtn')?.addEventListener('click', () => { setError(''); resetVerification({ clear:true, focus:true }); });
  $('#resendOtpBtn')?.addEventListener('click', resendOtp);
  $('#loginForm')?.addEventListener('submit', submitLogin);

  // If a valid session already exists, do not keep the user on the login page.
  try {
    await loginApi('/api/me');
    window.location.replace(safeNextUrl());
    return;
  } catch (error) {
    // 401 is the expected state for a login page. Other errors are shown but never trigger reload loops.
    if (error.status && error.status !== 401) setError(error.message);
  }
  setTimeout(() => ($('#loginIdentity') || $('#loginPassword'))?.focus({ preventScroll:true }), 60);
}

document.addEventListener('DOMContentLoaded', initLogin);
