/**
 * Settings: appearance, language, animation, notifications, privacy and
 * security, help, about and the legal pages.
 *
 * Everything on these screens does something real:
 *  - appearance writes the stored preference and re-maps the tokens at once
 *  - animation writes a preference that app.css and fx.js both honour
 *  - notification switches are saved to the user record, and the server stops
 *    creating a muted category at all (see addNotification in server.js)
 *  - the password change and session revocation call the real endpoints
 * Nothing here is a switch that only changes its own appearance: where a
 * capability does not exist (self-service account deletion, SMS/push
 * notifications) the screen says so instead of shipping a fake control.
 */
import { api, ApiError, clearToken } from '../api.js';
import {
  esc, icon, t, toast, confirm, setBusy, observeReveals, register
} from '../ui.js';
import { getState, setState } from '../store.js';
import { getLang, setLang, formatDateTime } from '../i18n.js';
import {
  getTheme, setTheme, resolvedTheme, THEMES,
  getMotion, setMotion, MOTIONS, prefersReducedMotion
} from '../theme.js';

const ROLE_KEY = { CUSTOMER: 'account.roleCUSTOMER', WORKER: 'account.roleWORKER', ADMIN: 'account.roleADMIN' };
const THEME_LABEL = { light: 'settings.themeLight', dark: 'settings.themeDark', system: 'settings.themeSystem' };
const THEME_BODY = { light: 'settings.themeLightBody', dark: 'settings.themeDarkBody', system: 'settings.themeSystemBody' };
const MOTION_LABEL = { system: 'settings.motionSystem', full: 'settings.motionFull', reduced: 'settings.motionReduced' };
const MOTION_BODY = { system: 'settings.motionSystemBody', full: 'settings.motionFullBody', reduced: 'settings.motionReducedBody' };
const NOTIFICATION_ROWS = [
  { id: 'bookings', label: 'settings.notifBookings', body: 'settings.notifBookingsBody' },
  { id: 'offers', label: 'settings.notifOffers', body: 'settings.notifOffersBody' },
  { id: 'messages', label: 'settings.notifMessages', body: 'settings.notifMessagesBody' },
  { id: 'payments', label: 'settings.notifPayments', body: 'settings.notifPaymentsBody' },
  { id: 'support', label: 'settings.notifSupport', body: 'settings.notifSupportBody' }
];

/* ---------- shared shell --------------------------------------------------- */
function page({ title, sub, back = '#/account', body }) {
  return {
    chrome: 'app',
    active: 'account',
    body: `<div class="stack-lg">
      <div class="page-head">
        <div>
          <a class="btn ghost sm" href="${back}">${icon('Arrow_Left_MD')}${esc(t('common.back'))}</a>
          <h1 style="margin-top:8px">${esc(title)}</h1>
          ${sub ? `<p class="muted">${esc(sub)}</p>` : ''}
        </div>
      </div>
      ${body}
    </div>`
  };
}

function row({ href, action, data, iconName, title, note, tag, badge }) {
  const inner = `<span class="row" style="align-items:flex-start">
      <span class="icon-badge ink">${icon(iconName)}</span>
      <span class="grow"><b>${esc(title)}</b>${note ? `<p class="muted small" style="margin:2px 0 0">${esc(note)}</p>` : ''}</span>
    </span>
    <span class="row" style="gap:8px">${tag ? `<span class="tag draft">${esc(tag)}</span>` : ''}${badge || ''}${icon('Chevron_Right')}</span>`;
  if (href) return `<a class="list-item" href="${href}" style="text-decoration:none">${inner}</a>`;
  return `<button class="list-item" style="width:100%;text-align:left" data-action="${action}"${data || ''}>${inner}</button>`;
}

/** Radio group. `<fieldset>` + real radios, so arrow keys and screen readers
    get the native behaviour instead of a hand-rolled "selected" state. */
function choices({ name, legend, options, value }) {
  return `<fieldset class="set-group">
    <legend class="sr-only">${esc(legend)}</legend>
    ${options.map((option) => `<label class="option">
      <input type="radio" name="${esc(name)}" value="${esc(option.value)}" ${option.value === value ? 'checked' : ''} />
      <span class="option-body">
        <span class="option-mark">${icon(option.icon || 'Check')}</span>
        <span class="grow"><b>${esc(t(option.label))}</b><span class="muted small">${esc(t(option.body))}</span></span>
      </span>
    </label>`).join('')}
  </fieldset>`;
}

/* ---------- settings landing ---------------------------------------------- */
export async function settingsView() {
  const state = getState();
  if (!state.user) return { redirect: '#/' };
  const prefs = state.user.notificationPrefs || {};
  const muted = NOTIFICATION_ROWS.filter((row_) => prefs[row_.id] === false).length;

  const body = `<div class="stack-lg">
    <div class="page-head">
      <div>
        <a class="btn ghost sm" href="#/account">${icon('Arrow_Left_MD')}${esc(t('common.back'))}</a>
        <h1 style="margin-top:8px">${esc(t('settings.title'))}</h1>
        <p class="muted">${esc(t('settings.sub'))}</p>
      </div>
    </div>

    <section class="reveal">
      <div class="section-head"><h2 class="h3">${esc(t('settings.appearance'))}</h2></div>
      <div class="card">
        <div class="list">
          ${row({ href: '#/settings/appearance', iconName: resolvedTheme() === 'dark' ? 'Moon' : 'Sun', title: t('settings.appearance'), note: t('settings.appearanceNote'), badge: `<span class="tag">${esc(t(THEME_LABEL[getTheme()]))}</span>` })}
          ${row({ href: '#/settings/language', iconName: 'Globe', title: t('settings.language'), note: t('settings.languageNote'), badge: `<span class="tag">${esc(getLang() === 'en' ? 'English' : 'বাংলা')}</span>` })}
          ${row({ href: '#/settings/motion', iconName: 'Settings', title: t('settings.motion'), note: t('settings.motionNote'), badge: prefersReducedMotion() ? `<span class="tag">${esc(t('settings.motionReduced'))}</span>` : '' })}
        </div>
      </div>
    </section>

    <section class="reveal">
      <div class="section-head"><h2 class="h3">${esc(t('settings.notifications'))}</h2></div>
      <div class="card">
        <div class="list">
          ${row({ href: '#/settings/notifications', iconName: 'Bell_Notification', title: t('settings.notifications'), note: t('settings.notificationsNote'), badge: muted ? `<span class="tag draft">${esc(String(muted))}</span>` : '' })}
        </div>
      </div>
    </section>

    <section class="reveal">
      <div class="section-head"><h2 class="h3">${esc(t('settings.privacy'))}</h2></div>
      <div class="card">
        <div class="list">
          ${row({ href: '#/account/addresses', iconName: 'Map_Pin', title: t('settings.places'), note: t('settings.placesNote') })}
          ${row({ href: '#/settings/privacy', iconName: 'Shield_Check', title: t('settings.privacy'), note: t('settings.privacyNote') })}
        </div>
      </div>
    </section>

    <section class="reveal">
      <div class="section-head"><h2 class="h3">${esc(t('settings.help'))}</h2></div>
      <div class="card">
        <div class="list">
          ${row({ href: '#/settings/help', iconName: 'Headphones', title: t('settings.help'), note: t('settings.helpNote') })}
          ${row({ href: '#/settings/about', iconName: 'Info', title: t('settings.about'), note: t('settings.aboutSub') })}
        </div>
      </div>
    </section>

    <section class="reveal">
      <button class="btn danger block lg" data-action="sign-out">${icon('Log_Out')}${esc(t('account.signout'))}</button>
    </section>
  </div>`;

  return { body, chrome: 'app', active: 'account', after: () => observeReveals() };
}

/* ---------- appearance ----------------------------------------------------- */
export async function appearanceView() {
  const body = `<div class="stack-lg">
    <div class="card reveal">
      ${choices({
        name: 'theme', legend: t('settings.appearanceTitle'), value: getTheme(),
        options: THEMES.map((theme) => ({
          value: theme,
          label: THEME_LABEL[theme],
          body: THEME_BODY[theme],
          icon: theme === 'light' ? 'Sun' : theme === 'dark' ? 'Moon' : 'Settings'
        }))
      })}
      <p class="muted small" style="margin:14px 0 0" data-role="theme-state">${esc(t('settings.themeNow', { name: t(THEME_LABEL[resolvedTheme()]) }))}</p>
    </div>
    <p class="muted small">${esc(t('settings.appearanceSub'))}</p>
  </div>`;
  const view = page({ title: t('settings.appearanceTitle'), sub: t('settings.appearanceSub'), back: '#/settings', body });
  view.after = () => {
    observeReveals();
    document.querySelectorAll('input[name="theme"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        setTheme(input.value);
        const state = document.querySelector('[data-role="theme-state"]');
        if (state) state.textContent = t('settings.themeNow', { name: t(THEME_LABEL[resolvedTheme()]) });
      });
    });
  };
  return view;
}

/* ---------- language ------------------------------------------------------- */
export async function languageView() {
  const options = [
    { value: 'bn', label: 'settings.langBn', body: 'settings.langBnBody', icon: 'Globe' },
    { value: 'en', label: 'settings.langEn', body: 'settings.langEnBody', icon: 'Globe' }
  ];
  const body = `<div class="stack-lg">
    <div class="card reveal">
      <fieldset class="set-group">
        <legend class="sr-only">${esc(t('settings.languageTitle'))}</legend>
        ${options.map((option) => `<label class="option">
          <input type="radio" name="lang" value="${option.value}" ${getLang() === option.value ? 'checked' : ''} />
          <span class="option-body">
            <span class="option-mark">${icon(option.icon)}</span>
            <span class="grow"><b>${esc(t(option.label))}</b><span class="muted small">${esc(t(option.body))}</span></span>
          </span>
        </label>`).join('')}
      </fieldset>
    </div>
    <p class="muted small">${esc(t('settings.languageSub'))}</p>
  </div>`;
  const view = page({ title: t('settings.languageTitle'), sub: t('settings.languageSub'), back: '#/settings', body });
  view.after = () => {
    observeReveals();
    document.querySelectorAll('input[name="lang"]').forEach((input) => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        /* Same two calls the account screen's `set-lang` action makes: the
           interface switches immediately and the choice is stored on the user
           record, so it survives a reinstall and follows the account. */
        setLang(input.value);
        api.updateMe({ preferredLanguage: input.value }).catch(() => {});
      });
    });
  };
  return view;
}

/* ---------- animation ------------------------------------------------------ */
export async function motionView() {
  const body = `<div class="stack-lg">
    <div class="card reveal">
      ${choices({
        name: 'motion', legend: t('settings.motionTitle'), value: getMotion(),
        options: MOTIONS.map((value) => ({ value, label: MOTION_LABEL[value], body: MOTION_BODY[value], icon: 'Settings' }))
      })}
    </div>
    <p class="muted small">${esc(t('settings.motionSub'))}</p>
  </div>`;
  const view = page({ title: t('settings.motionTitle'), sub: t('settings.motionSub'), back: '#/settings', body });
  view.after = () => {
    observeReveals();
    document.querySelectorAll('input[name="motion"]').forEach((input) => {
      input.addEventListener('change', () => { if (input.checked) setMotion(input.value); });
    });
  };
  return view;
}

/* ---------- notifications -------------------------------------------------- */
export async function notificationsView() {
  const state = getState();
  if (!state.user) return { redirect: '#/' };
  const prefs = state.user.notificationPrefs || {};
  const body = `<div class="stack-lg">
    <div class="card reveal">
      ${NOTIFICATION_ROWS.map((entry) => `
        <div class="set-row">
          <div class="set-row__text">
            <b id="n-${entry.id}-t">${esc(t(entry.label))}</b>
            <p class="muted small" id="n-${entry.id}-d">${esc(t(entry.body))}</p>
          </div>
          <input type="checkbox" class="switch" id="n-${entry.id}" data-action="notif-toggle"
            data-category="${entry.id}" ${prefs[entry.id] === false ? '' : 'checked'}
            aria-labelledby="n-${entry.id}-t" aria-describedby="n-${entry.id}-d" />
        </div>`).join('<hr class="divider" />')}
    </div>
    <div class="notice">${icon('Info')}<span>${esc(t('settings.notifChannelNote'))}</span></div>
    <p class="muted small">${esc(t('settings.notifSub'))}</p>
  </div>`;
  const view = page({ title: t('settings.notifTitle'), sub: t('settings.notifSub'), back: '#/settings', body });
  view.after = () => observeReveals();
  return view;
}

/* ---------- privacy & security --------------------------------------------- */
export async function privacyView() {
  const state = getState();
  if (!state.user) return { redirect: '#/' };
  let sessions = null;
  let failed = false;
  try { sessions = (await api.sessions()).sessions || []; } catch { failed = true; }
  const active = sessions ? sessions.filter((s) => !s.expired) : [];
  const others = active.filter((s) => !s.current).length;

  const sessionBlock = failed
    ? `<div class="notice">${icon('Info')}<span>${esc(t('error.network'))}</span></div>`
    : `<p class="muted small">${esc(t('settings.sessionsActive', { count: active.length }))}</p>
       ${sessions.slice(0, 4).map((session) => `<p class="muted tiny" style="margin:4px 0 0">
          ${icon(session.current ? 'Check' : 'Clock')} ${esc(formatDateTime(session.createdAt))}${session.current ? ` · ${esc(t('settings.sessionThis'))}` : ''}</p>`).join('')}
       ${others > 0 ? `<div class="row" style="margin-top:12px"><button class="btn secondary" data-action="revoke-sessions">${icon('Log_Out')}${esc(t('settings.signOutAll'))}</button></div>
       <p class="muted small" style="margin-top:8px">${esc(t('settings.signOutAllBody'))}</p>` : ''}`;

  const body = `<div class="stack-lg">
    <section class="card reveal">
      <h2 class="h3">${esc(t('settings.changePassword'))}</h2>
      <p class="muted small">${esc(t('settings.changePasswordBody'))}</p>
      <form data-role="password-form" autocomplete="off" style="margin-top:14px">
        <div class="field"><label for="pw-current">${esc(t('settings.currentPassword'))}</label>
          <input id="pw-current" name="currentPassword" type="password" required autocomplete="current-password" /></div>
        <div class="field"><label for="pw-new">${esc(t('settings.newPassword'))}</label>
          <input id="pw-new" name="newPassword" type="password" required minlength="8" autocomplete="new-password" /></div>
        <div class="row" style="justify-content:flex-end;margin-top:14px">
          <button class="btn" type="submit">${icon('Shield_Check')}${esc(t('settings.changePassword'))}</button>
        </div>
      </form>
    </section>

    <section class="card reveal">
      <h2 class="h3">${esc(t('settings.signOutAll'))}</h2>
      ${sessionBlock}
    </section>

    <section class="card reveal">
      <div class="row-between" style="align-items:flex-start;gap:12px">
        <div>
          <b>${esc(t('settings.deleteAccount'))}</b>
          <p class="muted small" style="margin:4px 0 0">${esc(t('settings.deleteAccountBody'))}</p>
        </div>
        <button class="btn danger sm" data-action="delete-account">${esc(t('settings.deleteAccount'))}</button>
      </div>
    </section>

    <section class="card reveal">
      <div class="list">
        ${row({ href: '#/terms', iconName: 'Document_Text', title: t('settings.legalTerms') })}
        ${row({ href: '#/privacy', iconName: 'Shield_Check', title: t('settings.legalPrivacy') })}
      </div>
    </section>
  </div>`;

  const view = page({ title: t('settings.privacyTitle'), sub: t('settings.privacySub'), back: '#/settings', body });
  view.after = () => {
    observeReveals();
    const form = document.querySelector('[data-role="password-form"]');
    if (form) form.addEventListener('submit', changePassword);
  };
  return view;
}

async function changePassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  setBusy(button, true, t('common.saving'));
  try {
    const result = await api.changePassword(data.currentPassword, data.newPassword);
    form.reset();
    toast(`${t('settings.passwordChanged')}${result && result.sessionsEnded ? ` · ${t('settings.signOutAllDone')}` : ''}`, 'success');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) toast(t('settings.currentPassword') + ' — ' + t('auth.errCredentials'), 'error');
    else toast(t('auth.errGeneric'), 'error');
  } finally { setBusy(button, false); }
}

/* ---------- help ----------------------------------------------------------- */
const FAQ = [
  { q: 'help.q1', a: 'help.a1' },
  { q: 'help.q2', a: 'help.a2' },
  { q: 'help.q3', a: 'help.a3' },
  { q: 'help.q4', a: 'help.a4' }
];

export async function helpView() {
  const body = `<div class="stack-lg">
    <section class="card reveal">
      <h2 class="h3">${esc(t('settings.helpTitle'))}</h2>
      <p class="muted small">${esc(t('settings.helpSub'))}</p>
      <div class="row" style="margin-top:14px;gap:10px;flex-wrap:wrap">
        <a class="btn" href="#/account/support">${icon('Headphones')}${esc(t('support.new'))}</a>
        <a class="btn secondary" href="#/support">${icon('Chat_Conversation')}${esc(t('nav.support'))}</a>
      </div>
    </section>
    <section class="reveal">
      <div class="section-head"><h2 class="h3">${esc(t('help.title'))}</h2></div>
      <div class="card">
        ${FAQ.map((item) => `<details class="faq">
          <summary>${esc(t(item.q))}</summary>
          <p class="muted small">${esc(t(item.a))}</p>
        </details>`).join('')}
      </div>
    </section>
  </div>`;
  const view = page({ title: t('settings.helpTitle'), sub: t('settings.helpSub'), back: '#/settings', body });
  view.after = () => observeReveals();
  return view;
}

/* ---------- about ---------------------------------------------------------- */
export async function aboutView() {
  let config = null;
  try { config = (await api.publicConfig()).config || null; } catch { config = null; }
  const native = typeof window !== 'undefined' && window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform();
  const platform = native
    ? (window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'ios' ? t('settings.platformIos') : t('settings.platformAndroid'))
    : t('settings.platformWeb');
  const map = config && config.map;
  const version = (config && config.version) || t('settings.appVersionUnknown');

  const body = `<div class="stack-lg">
    <section class="card reveal">
      <dl class="kv">
        <div><dt>${esc(t('settings.version'))}</dt><dd>${esc(String(version))}</dd></div>
        <div><dt>${esc(t('settings.platform'))}</dt><dd>${esc(platform)}</dd></div>
        <div><dt>${esc(t('settings.mapProvider'))}</dt><dd>${esc(map && map.provider ? map.provider : t('settings.mapNotConfigured'))}</dd></div>
        <div><dt>${esc(t('settings.attribution'))}</dt><dd>${esc((map && map.attribution) || '—')}</dd></div>
      </dl>
    </section>
    <section class="card reveal">
      <div class="list">
        ${row({ href: '#/terms', iconName: 'Document_Text', title: t('settings.legalTerms') })}
        ${row({ href: '#/privacy', iconName: 'Shield_Check', title: t('settings.legalPrivacy') })}
        ${row({ href: '#/settings/help', iconName: 'Headphones', title: t('settings.help') })}
      </div>
    </section>
    <p class="muted tiny">${esc(t('legal.draftNote'))}</p>
  </div>`;
  const view = page({ title: t('settings.aboutTitle'), sub: t('settings.aboutSub'), back: '#/settings', body });
  view.after = () => observeReveals();
  return view;
}

/* ---------- legal ---------------------------------------------------------- */
function legalPage({ title, paragraphs }) {
  const signedIn = Boolean(getState().user);
  return {
    chrome: signedIn ? 'app' : 'public',
    active: signedIn ? 'account' : '',
    body: `<div class="container stack-lg" style="padding-top:24px">
      <div class="page-head">
        <div>
          ${signedIn ? `<a class="btn ghost sm" href="#/settings">${icon('Arrow_Left_MD')}${esc(t('common.back'))}</a>` : ''}
          <h1 style="margin-top:8px">${esc(title)}</h1>
        </div>
      </div>
      <section class="card prose reveal">
        ${paragraphs.map((key) => `<p>${esc(t(key))}</p>`).join('')}
      </section>
      <p class="muted small">${esc(t('legal.draftNote'))}</p>
    </div>`
  };
}

export async function termsView() {
  const view = legalPage({ title: t('legal.termsTitle'), paragraphs: ['legal.termsP1', 'legal.termsP2', 'legal.termsP3', 'legal.termsP4', 'legal.termsP5'] });
  view.after = () => observeReveals();
  return view;
}

export async function privacyPolicyView() {
  const view = legalPage({ title: t('legal.privacyTitle'), paragraphs: ['legal.privacyP1', 'legal.privacyP2', 'legal.privacyP3', 'legal.privacyP4', 'legal.privacyP5'] });
  view.after = () => observeReveals();
  return view;
}

/* ---------- actions -------------------------------------------------------- */register('notif-toggle', async (data, event, el) => {
  const wanted = el.checked;
  const category = data.category;
  el.disabled = true;
  try {
    const result = await api.updateMe({ notificationPrefs: { [category]: wanted } });
    const user = getState().user;
    setState({ user: { ...user, notificationPrefs: result.notificationPrefs || result.user.notificationPrefs || {} } });
    toast(t('settings.notifSaved'), 'success');
  } catch (error) {
    el.checked = !wanted;
    toast(t('settings.notifFailed'), 'error');
  } finally { el.disabled = false; }
});

register('delete-account', async () => {
  const ok = await confirm({
    title: t('settings.deleteAccount'),
    body: t('settings.deleteAccountBody'),
    confirmLabel: t('settings.deleteAccount'),
    danger: true
  });
  if (!ok) return;
  // Use an in-app dialog instead of window.prompt
  const dialog = sheet({
    title: t('settings.deleteAccount'),
    subtitle: t('settings.deleteAccountBody'),
    body: `<form data-role="delete-account-form" novalidate>
      <div class="field"><label for="del-pw">${esc(t('settings.currentPassword'))}</label>
        <input id="del-pw" name="password" type="password" required minlength="8" autocomplete="current-password" /></div>
      <div class="row" style="justify-content:flex-end;margin-top:14px">
        <button class="btn danger" type="submit">${esc(t('settings.deleteAccount'))}</button>
      </div>
    </form>`,
    onClose: () => {}
  });
  const form = dialog.body.querySelector('[data-role="delete-account-form"]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const pw = new FormData(form).get('password');
    if (!pw) return;
    setBusy(btn, true, t('common.loading'));
    try {
      await api.deleteAccount(String(pw));
      toast(t('settings.accountDeleted'), 'success');
      clearToken();
      setState({ user: null, notifications: [] });
      closeSheet();
      navigate('#/');
    } catch (error) {
      toast(error instanceof ApiError ? error.message : t('auth.errGeneric'), 'error');
    } finally {
      setBusy(btn, false);
    }
  });
});
register('revoke-sessions', async () => {
  const ok = await confirm({ title: t('settings.signOutAll'), body: t('settings.signOutAllBody'), confirmLabel: t('settings.signOutAll') });
  if (!ok) return;
  try {
    await api.revokeOtherSessions();
    toast(t('settings.signOutAllDone'), 'success');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (error) { toast(t('auth.errGeneric'), 'error'); }
});
