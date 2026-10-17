/**
 * ShebaShathi application bootstrap.
 * Owns the store → DOM render loop, the route table, session lifecycle,
 * language switching, notification polling and global actions.
 */
import { api, openEventStream } from './api.js';
import { getState, setState, subscribe } from './store.js';
import { getLang, initLang, onLangChange, setLang, t } from './i18n.js';
import { bindActions, icon, register, toast, observeReveals, closeSheet } from './ui.js';
import { route, setFallback, startRouter, resolve, currentRoute, onRouteChange } from './router.js';
import { publicChrome, appChrome, homeFor } from './shell.js';

/* view modules register their own actions on import */
import { landing, howItWorks, providersPage, publicSupport, notFoundPublic, loadServices } from './views/public.js';
import { openAuth, restoreSession, refreshNotifications, signOut } from './views/auth.js';
import {
  homeView, exploreView, serviceView, activityView, bookingDetailView,
  offersView, providerProfileView
} from './views/customer.js';
import { bookingView } from './views/booking.js';
import { accountView, addressesView, supportView, inboxView } from './views/account.js';
import { workView, requestsView, scheduleView, earningsView, listingsView } from './views/provider.js';
import { adminView, adminBookingsView, adminUsersView, adminServicesView, adminSupportView, adminPayoutsView } from './views/admin.js';

const root = () => document.getElementById('app');

/* ---------- guards ------------------------------------------------------- */
export function requireAuth() {
  const state = getState();
  if (!state.ready) return null; // wait for session restore
  return state.user ? null : '#/';
}
function requireRole(role) {
  const state = getState();
  if (!state.ready) return null;
  if (!state.user) return '#/';
  return state.user.role === role ? null : homeFor(state.user.role);
}

/* ---------- route table -------------------------------------------------- */
function routes() {
  // public
  route('/', () => (getState().user ? { redirect: homeFor(getState().user.role) } : landing()));
  route('/how-it-works', howItWorks);
  route('/providers', providersPage);
  route('/support', publicSupport);

  // shared
  route('/explore', exploreView);
  route('/service/:id', serviceView);
  route('/book/:serviceId', bookingView, { guard: requireAuth });
  route('/provider/:id', providerProfileView);

  // customer
  route('/home', homeView, { guard: () => requireRole('CUSTOMER') });
  route('/activity', activityView, { guard: requireAuth });
  route('/booking/:id', bookingDetailView, { guard: requireAuth });
  route('/offers/:requestId', offersView, { guard: requireAuth });
  route('/inbox', inboxView, { guard: requireAuth });
  route('/account', accountView, { guard: requireAuth });
  route('/account/addresses', addressesView, { guard: requireAuth });
  route('/account/support', supportView, { guard: requireAuth });

  // provider
  route('/work', workView, { guard: () => requireRole('WORKER') });
  route('/requests', requestsView, { guard: () => requireRole('WORKER') });
  route('/schedule', scheduleView, { guard: () => requireRole('WORKER') });
  route('/earnings', earningsView, { guard: () => requireRole('WORKER') });
  route('/listings', listingsView, { guard: () => requireRole('WORKER') });

  // admin
  route('/admin', adminView, { guard: () => requireRole('ADMIN') });
  route('/admin/bookings', adminBookingsView, { guard: () => requireRole('ADMIN') });
  route('/admin/users', adminUsersView, { guard: () => requireRole('ADMIN') });
  route('/admin/services', adminServicesView, { guard: () => requireRole('ADMIN') });
  route('/admin/payouts', adminPayoutsView, { guard: () => requireRole('ADMIN') });
  route('/admin/support', adminSupportView, { guard: () => requireRole('ADMIN') });

  setFallback(() => notFoundPublic());
}

/* ---------- render loop -------------------------------------------------- */
let renderToken = 0;

/**
 * The single place that paints the DOM. It resolves the current hash, applies
 * the route guard, then calls the handler. Every trigger — hashchange, sign
 * in/out, language switch, polling — funnels through here, so what is on
 * screen always matches the URL.
 */
async function render() {
  // Before the session is restored the user is unknown, so a guarded route
  // would look unauthorised and bounce a deep link back to the landing page.
  // boot() paints once, after restoreSession() resolves.
  if (!getState().ready) return;
  const token = ++renderToken;
  const view = await resolve();
  if (!view) return;
  if (view.guard) {
    const redirect = await view.guard(view);
    if (token !== renderToken) return;
    if (redirect && redirect !== window.location.hash) { window.location.hash = redirect; return; }
  }
  if (token !== renderToken) return;
  if (!view.handler) { root().innerHTML = ''; return; }
  const params = view.params || {};
  const query = view.query || {};
  let result;
  try {
    result = await view.handler(params, query, view);
  } catch (error) {
    console.error('[app] view failed', error);
    const state = getState();
    result = {
      body: `<div class="container" style="padding-top:40px">${errorBlock(error)}</div>`,
      chrome: state.user ? 'app' : 'public',
      active: ''
    };
  }
  if (token !== renderToken) return; // a newer navigation won
  if (!result) return;
  if (result.redirect) {
    if (window.location.hash !== result.redirect) window.location.hash = result.redirect;
    return;
  }
  const body = result.body || '';
  root().innerHTML = result.chrome === 'app' ? appChrome({ body, active: result.active }) : publicChrome({ body, active: result.active });
  document.title = `${t('brand.name')} — ${t('brand.tagline')}`;
  observeReveals();
  if (typeof result.after === 'function') result.after();
  // move focus for screen readers without yanking the viewport on hash-only nav
  const main = document.getElementById('main');
  if (main) main.setAttribute('tabindex', '-1');
}

function errorBlock(error) {
  return `<div class="empty">
    <img src="./assets/illustrations/offline.svg" alt="" />
    <h2>${t('error.title')}</h2>
    <p>${t('error.network')}</p>
    <button class="btn" data-action="retry">${icon('Arrow_Reload_02')}${t('common.retry')}</button>
    <p class="muted tiny">${String(error && error.message ? error.message : '')}</p>
  </div>`;
}

/* ---------- global actions ---------------------------------------------- */
function registerGlobalActions() {
  register('nav', (data) => { window.location.hash = data.href; });
  register('open-login', () => openAuth('login'));
  register('open-register', () => openAuth('register', { role: 'CUSTOMER' }));
  register('auth-switch', (data) => openAuth(data.mode));
  register('auth-role', (data, event, el) => {
    el.parentElement.querySelectorAll('.choice').forEach((c) => c.setAttribute('aria-pressed', String(c === el)));
    const hidden = el.closest('.field').querySelector('input[name="role"]');
    if (hidden) hidden.value = data.role;
  });
  register('demo-fill', (data) => {
    const form = document.querySelector('[data-role="auth-form"]');
    if (!form) return;
    form.querySelector('[name="identifier"]').value = data.identifier;
    form.querySelector('[name="password"]').value = 'Demo123!';
    form.querySelector('[name="identifier"]').focus();
  });
  register('toggle-lang', () => setLang(getLang() === 'bn' ? 'en' : 'bn'));
  register('sheet-close', () => closeSheet());
  register('retry', () => { window.dispatchEvent(new HashChangeEvent('hashchange')); });

  // search forms (hero + explore + home)
  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-role="search-form"], [data-role="hero-search"]');
    if (!form) return;
    event.preventDefault();
    const q = new FormData(form).get('q') || '';
    window.location.hash = `#/explore?q=${encodeURIComponent(String(q))}`;
  });

  // explore filter form
  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-role="explore-filters"]');
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    const params = new URLSearchParams();
    ['q', 'area', 'budget', 'sort'].forEach((k) => { const v = String(data.get(k) || '').trim(); if (v) params.set(k, v); });
    if (data.get('available')) params.set('available', '1');
    const existing = new URLSearchParams((window.location.hash.split('?')[1] || '')).get('category');
    if (existing) params.set('category', existing);
    window.location.hash = `#/explore?${params.toString()}`;
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.matches('[data-role="chat-form"] input')) {
      event.target.form.requestSubmit();
    }
  });
}

/* ---------- boot --------------------------------------------------------- */
async function boot() {
  initLang();
  bindActions();
  routes();
  registerGlobalActions();

  // store subscribers: re-render on auth/session change, and keep the
  // realtime stream in step with the session
  let lastUser = undefined;
  subscribe((state) => {
    if (state.user !== lastUser) {
      lastUser = state.user;
      if (state.user) startRealtime(); else stopRealtimeStream();
      render();
    }
  });
  onLangChange(() => render());
  onRouteChange(() => render());

  const offlineBanner = () => {
    const online = navigator.onLine;
    setState({ online });
    if (!online) toast(t('error.offline'), 'info');
    render();
  };
  window.addEventListener('online', offlineBanner);
  window.addEventListener('offline', offlineBanner);

  await loadServices();
  await restoreSession();
  setState({ ready: true });
  // startRouter resolves the current hash and notifies listeners, which paints.
  await startRouter();

  await refreshNotifications();
  startNotificationPolling();
  registerServiceWorker();
}

/* Offline shell. Skipped on file:// (Capacitor bundles the app locally) and
   on plain-HTTP origins where service workers are not permitted. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const { protocol, hostname } = window.location;
  const secure = protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '10.0.2.2';
  if (!secure) return;
  const register = () => navigator.serviceWorker.register('./sw.js')
    .catch((error) => console.warn('[sw] registration skipped:', error.message));
  /* boot() awaits session restore, so by the time we get here the `load` event
     has usually already fired and a `load` listener would never run. */
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/* Server-sent events keep notifications fresh on the web; the polling timer
   above remains the portable fallback (native WebView has no EventSource).
   Only opened once a session exists, so a logged-out visitor never triggers
   an unauthorised request. */
let stopRealtime = null;
function startRealtime() {
  if (stopRealtime) return;
  stopRealtime = openEventStream((event) => {
    if (!getState().user) return;
    if (event && (event.type === 'notification' || event.userId)) refreshNotifications();
  });
}
function stopRealtimeStream() {
  if (!stopRealtime) return;
  stopRealtime();
  stopRealtime = null;
}

let pollTimer = null;
function startNotificationPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const state = getState();
    if (!state.user || document.hidden) return;
    await refreshNotifications();
    // refresh an open tracking screen so status changes appear
    const current = currentRoute();
    if (current && current.pattern === '/booking/:id') render();
  }, 25000);
}

/* Re-render when returning to the tab so statuses are fresh. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const state = getState();
  if (!state.user) return;
  refreshNotifications();
  const current = currentRoute();
  if (current && (current.pattern === '/booking/:id' || current.pattern === '/activity' || current.pattern === '/inbox')) render();
});

window.addEventListener('error', (event) => {
  console.error('[uncaught]', event.error || event.message);
});

boot();
