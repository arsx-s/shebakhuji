/**
 * Authentication: login, registration, session restore and logout.
 * The store is the single source of truth, so public Sign in / Create account
 * controls are replaced the moment a session exists — no CSS hiding involved.
 */
import { api, ApiError, clearToken, errorKey, setToken } from '../api.js';
import { esc, icon, sheet, closeSheet, toast, setBusy, t } from '../ui.js';
import { getState, setState } from '../store.js';
import { getLang } from '../i18n.js';
import { homeFor } from '../shell.js';
import { destroyMap } from '../map.js';
import { go } from '../router.js';

const DEMO_ACCOUNTS = [
  { role: 'CUSTOMER', label: 'auth.demoCustomer', identifier: '01711000001' },
  { role: 'WORKER', label: 'auth.demoProvider', identifier: '01711000002' },
  { role: 'ADMIN', label: 'auth.demoAdmin', identifier: '01711000004' }
];
const DEMO_PASSWORD = 'Demo123!';

export function normaliseIdentifier(raw) {
  const value = String(raw || '').trim().toLowerCase();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const phone = /^01[3-9]\d{8}$/.test(value.replace(/^\+88/, '').replace(/^88/, ''));
  return { value, valid: email || phone, type: email ? 'email' : 'phone' };
}

function fieldError(name, message) {
  const input = document.querySelector(`[name="${name}"]`);
  if (!input) return;
  const field = input.closest('.field');
  field.classList.add('invalid');
  input.setAttribute('aria-invalid', 'true');
  let err = field.querySelector('.err');
  if (!err) { err = document.createElement('span'); err.className = 'err'; field.append(err); }
  err.innerHTML = `${icon('Circle_Warning')}<span>${esc(message)}</span>`;
}
function clearErrors(root) {
  root.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
  root.querySelectorAll('.err').forEach((e) => e.remove());
  root.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
}

export function openAuth(mode = 'login', { role = 'CUSTOMER', onClose } = {}) {
  const register = mode === 'register';
  let selectedRole = role === 'WORKER' ? 'WORKER' : 'CUSTOMER';

  const rolePicker = () => `
    <div class="field">
      <label>${esc(t('auth.role'))}</label>
      <div class="pill-choices" role="group">
        ${['CUSTOMER', 'WORKER'].map((r) => `
          <button type="button" class="choice" data-action="auth-role" data-role="${r}" aria-pressed="${selectedRole === r}">
            ${icon(r === 'WORKER' ? 'Suitcase' : 'User_01')}<span>${esc(t(r === 'WORKER' ? 'auth.roleProvider' : 'auth.roleCustomer'))}</span>
          </button>`).join('')}
      </div>
      <input type="hidden" name="role" value="${selectedRole}" />
    </div>`;

  const demo = `
    <div class="notice" style="flex-direction:column;align-items:stretch;gap:8px">
      <b>${esc(t('auth.demoHint'))}</b>
      <div class="row wrap" style="gap:8px">
        ${DEMO_ACCOUNTS.map((a) => `<button type="button" class="btn sm secondary" data-action="demo-fill" data-identifier="${a.identifier}">${esc(t(a.label))}</button>`).join('')}
      </div>
    </div>`;

  const body = `
    <form data-role="auth-form" novalidate>
      <div class="auth-error" aria-live="polite"></div>
      ${register ? rolePicker() : ''}
      ${register ? `
        <div class="field" style="margin-top:14px"><label for="auth-name">${esc(t('auth.name'))}</label>
          <input id="auth-name" name="name" autocomplete="name" required /></div>` : ''}
      <div class="field" style="margin-top:14px"><label for="auth-id">${esc(t('auth.identifier'))}</label>
        <input id="auth-id" name="identifier" autocomplete="username" inputmode="email" required placeholder="${esc(t('auth.identifierPh'))}" /></div>
      <div class="field"><label for="auth-pass">${esc(t('auth.password'))}</label>
        <input id="auth-pass" name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="8" /></div>
      ${register ? `
        <div class="form-row two">
          <div class="field"><label for="auth-district">${esc(t('auth.district'))}</label><input id="auth-district" name="district" value="Dhaka" /></div>
          <div class="field"><label for="auth-area">${esc(t('auth.area'))}</label><input id="auth-area" name="area" value="Dhanmondi" /></div>
        </div>` : ''}
      <button class="btn block lg" type="submit" style="margin-top:18px">${esc(t(register ? 'auth.registerTitle' : 'nav.signin'))}</button>
    </form>
    ${!register ? demo : ''}
    <p class="muted small" style="margin-top:14px;text-align:center">
      ${esc(t(register ? 'auth.haveAccount' : 'auth.noAccount'))}
      <button class="btn ghost sm" data-action="auth-switch" data-mode="${register ? 'login' : 'register'}">${esc(t(register ? 'nav.signin' : 'nav.register'))}</button>
    </p>`;

  const dialog = sheet({ title: t(register ? 'auth.registerTitle' : 'auth.signinTitle'), subtitle: t(register ? 'auth.registerSub' : 'auth.signinSub'), body, onClose });
  const form = dialog.body.querySelector('[data-role="auth-form"]');
  form.addEventListener('submit', (event) => submitAuth(event, { register }));
  return dialog;
}

function showAuthError(message) {
  const box = document.querySelector('.auth-error');
  if (!box) { toast(message, 'error'); return; }
  box.innerHTML = `<div class="notice err" role="alert">${icon('Circle_Warning')}<span>${esc(message)}</span></div>`;
}

async function submitAuth(event, { register }) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  clearErrors(form);
  const data = Object.fromEntries(new FormData(form));

  const identifier = normaliseIdentifier(data.identifier);
  if (!identifier.valid) { fieldError('identifier', t('auth.errIdentifier')); return; }
  if (register && String(data.name || '').trim().length < 2) { fieldError('name', t('auth.errName')); return; }
  if (String(data.password || '').length < 8) { fieldError('password', t('auth.errPassword')); return; }

  setBusy(button, true, t(register ? 'auth.creating' : 'auth.signingIn'));
  try {
    let result;
    if (register) {
      const created = await api.register({
        identifier: identifier.value,
        name: String(data.name).trim(),
        role: data.role === 'WORKER' ? 'WORKER' : 'CUSTOMER',
        password: data.password
      });
      await api.updateMe({ district: data.district || 'Dhaka', area: data.area || '', preferredLanguage: getLang() }).catch(() => {});
      const session = await api.login(identifier.value, data.password);
      if (session.token) setToken(session.token);
      result = { user: session.user || created.user };
      toast(t('auth.registerTitle') + ' ✓', 'success');
    } else {
      const session = await api.login(identifier.value, data.password);
      if (session.token) setToken(session.token);
      result = { user: session.user };
    }
    setState({ user: result.user });
    closeSheet();
    toast(`${t('brand.name')} — ${result.user.name}`, 'success');
    const target = homeFor(result.user.role);
    if (window.location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else go(target);
    refreshNotifications();
  } catch (error) {
    const key = error instanceof ApiError && error.status === 409 ? 'auth.errExists' : errorKey(error);
    showAuthError(t(key));
  } finally {
    setBusy(button, false);
  }
}

export async function restoreSession() {
  try {
    const res = await api.me();
    setState({ user: res.user });
    return res.user;
  } catch {
    setState({ user: null });
    return null;
  }
}

export async function refreshMe() {
  try { const res = await api.me(); setState({ user: res.user }); return res.user; } catch { return getState().user; }
}

export async function signOut() {
  try { await api.logout(); } catch { /* session already gone */ }
  clearToken();
  destroyMap(); // release the WebGL context: the next user gets a fresh map
  setState({ user: null, notifications: [] });
  toast(t('account.signedOut'), 'info');
  if (window.location.hash === '#/') window.dispatchEvent(new HashChangeEvent('hashchange'));
  else go('#/');
}

export async function refreshNotifications() {
  if (!getState().user) { setState({ notifications: [] }); return; }
  try {
    const res = await api.notifications();
    setState({ notifications: res.notifications || [] });
  } catch { /* ignore transient failures */ }
}

/* ======================= full-page auth (first screen) =================== */
export function authView() {
  const user = getState().user;
  if (user) return { redirect: homeFor(user.role) };

  const floating = [
    { ic: '\u{1F527}', delay: 0 },
    { ic: '\u{1F528}', delay: 0.4 },
    { ic: '\u{1F3A8}', delay: 0.8 },
    { ic: '\u{1F4A1}', delay: 1.2 },
    { ic: '\u{1F50C}', delay: 1.6 },
    { ic: '\u{2699}\u{FE0F}', delay: 2.0 },
    { ic: '\u{1F6B0}', delay: 2.4 },
    { ic: '\u{2744}\u{FE0F}', delay: 2.8 },
    { ic: '\u{1F9F9}', delay: 3.2 },
    { ic: '\u{1F9F4}', delay: 3.6 }
  ];
  const positions = [
    { top: '5%', left: '50%' },
    { top: '15%', left: '78%' },
    { top: '38%', left: '93%' },
    { top: '65%', left: '90%' },
    { top: '85%', left: '72%' },
    { top: '92%', left: '45%' },
    { top: '83%', left: '20%' },
    { top: '60%', left: '8%' },
    { top: '35%', left: '10%' },
    { top: '15%', left: '28%' }
  ];

  const body = `
  <div class="auth-screen">
    <div class="auth-card">
      <div class="auth-illustration">
        <div class="auth-badge">
          <span class="auth-badge__pct">%</span>
          <span class="auth-badge__label">OFFERS</span>
        </div>
        ${floating.map((f, i) => `
          <div class="auth-float" style="top:${positions[i].top};left:${positions[i].left};animation-delay:${f.delay}s">
            <span>${f.ic}</span>
          </div>`).join('')}
      </div>

      <h1 class="auth-title">Book reliable services for your home.</h1>

      <form data-role="auth-form" novalidate class="auth-form">
        <div class="auth-error" aria-live="polite"></div>
        <div class="auth-phone-row">
          <div class="auth-country">
            <span class="auth-flag">\u{1F1E7}\u{1F1E9}</span>
            <span class="auth-code">+880</span>
            <i class="auth-chevron">${icon('Chevron_Down')}</i>
          </div>
          <div class="auth-phone-input">
            <input id="auth-phone" name="identifier" type="tel" autocomplete="username" inputmode="tel"
              placeholder="+880 1XXXXXXXXX" required />
            <i class="auth-user-icon">${icon('User_01')}</i>
          </div>
        </div>
        <div class="auth-field">
          <label for="auth-pass">${esc(t('auth.password'))}</label>
          <input id="auth-pass" name="password" type="password" autocomplete="current-password" required minlength="8" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" />
        </div>
        <button type="submit" class="auth-continue" data-role="auth-submit">
          ${esc(t('auth.continue'))}
        </button>
      </form>

      <div class="auth-divider"><span>${esc(t('auth.or'))}</span></div>

      <div class="auth-social">
        <button type="button" class="auth-social-btn" data-provider="Apple" disabled aria-disabled="true">
          Continue with Apple
        </button>
        <button type="button" class="auth-social-btn" data-provider="Google" disabled aria-disabled="true">
          Continue with Google
        </button>
        <button type="button" class="auth-social-btn" data-provider="Email" data-action="auth-email">
          ${icon('Mail')} Continue with email
        </button>
      </div>

      <div class="auth-divider"><span>${esc(t('auth.or'))}</span></div>

      <div class="auth-find">
        <button type="button" class="auth-find-btn" data-action="find-account">
          ${icon('Search_Magnifying_Glass')} Find my account
        </button>
      </div>

      <p class="auth-legal">
        You consent to receive a verification code by text or WhatsApp. Message and data rates may apply.
      </p>
    </div>
  </div>`;

  return { body, chrome: 'public', active: '', full: true, after: () => wireAuth() };
}

function wireAuth() {
  const form = document.querySelector('[data-role="auth-form"]');
  if (form) form.addEventListener('submit', (event) => submitAuth(event, { register: false }));
  document.querySelectorAll('[data-provider]').forEach((btn) => {
    btn.addEventListener('click', () => {
      toast(t('auth.providerUnavailable'), 'info');
    });
  });
  const findBtn = document.querySelector('[data-action="find-account"]');
  if (findBtn) findBtn.addEventListener('click', () => {
    toast(t('auth.recoveryUnavailable'), 'info');
  });
}
