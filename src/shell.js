/**
 * Application shell: public chrome and the authenticated app chrome.
 * Navigation adapts to authentication state and role, and re-renders
 * immediately when either changes because it is driven by the store.
 */
import { esc, icon, avatar } from './ui.js';
import { t, getLang } from './i18n.js';
import { getState, unreadCount } from './store.js';
import { readPlace } from './map.js';

export const NAV = {
  CUSTOMER: [
    { id: 'home', href: '#/home', icon: 'House_01', label: 'nav.home' },
    { id: 'services', href: '#/services', icon: 'Search_Magnifying_Glass', label: 'nav.services' },
    { id: 'activity', href: '#/activity', icon: 'List_Checklist', label: 'nav.activity' },
    { id: 'account', href: '#/account', icon: 'User_Circle', label: 'nav.account' }
  ],
  WORKER: [
    { id: 'work', href: '#/work', icon: 'Suitcase', label: 'nav.work' },
    { id: 'requests', href: '#/requests', icon: 'Bell_Notification', label: 'nav.requests' },
    { id: 'schedule', href: '#/schedule', icon: 'Calendar', label: 'nav.schedule' },
    { id: 'earnings', href: '#/earnings', icon: 'Chart_Bar_Vertical_01', label: 'nav.earnings' },
    { id: 'account', href: '#/account', icon: 'User_Circle', label: 'nav.account' }
  ],
  ADMIN: [
    { id: 'admin', href: '#/admin', icon: 'Chart_Pie', label: 'nav.overview' },
    { id: 'admin-bookings', href: '#/admin/bookings', icon: 'List_Checklist', label: 'nav.bookings' },
    { id: 'admin-users', href: '#/admin/users', icon: 'Users', label: 'nav.users' },
    { id: 'admin-support', href: '#/admin/support', icon: 'Headphones', label: 'nav.support' },
    { id: 'account', href: '#/account', icon: 'User_Circle', label: 'nav.account' }
  ]
};

export const homeFor = (role) => (role === 'ADMIN' ? '#/admin' : role === 'WORKER' ? '#/work' : '#/home');
export const navFor = (role) => NAV[role] || NAV.CUSTOMER;

/* The avatar shows the first letter upper-cased. Naming an element after the
   user therefore has to use the same casing, or a screen-reader label would not
   contain the visible initial (WCAG 2.5.3 / axe label-content-name-mismatch). */
const capitalised = (name) => {
  const clean = String(name || '').trim();
  return clean ? clean[0].toUpperCase() + clean.slice(1) : '';
};

export function brand({ href = '#/' } = {}) {
  const logo = getLang() === 'en' ? 'logo-en.svg' : 'logo-bn.svg';
  return `<a class="brand" href="${href}">
    <img class="brand-logo-sm" src="./assets/brand/${logo}" alt="${esc(t('brand.name'))}" height="28" />
    <span>${esc(t('brand.name'))}<span class="brand-sub">${esc(t('brand.tagline'))}</span></span>
  </a>`;
}

export function langButton({ variant = 'ghost' } = {}) {
  const next = getLang() === 'bn' ? 'English' : 'বাংলা';
  // The accessible name includes the visible word, so the two cannot disagree.
  const label = `${t('a11y.lang')} — ${next}`;
  return `<button class="btn ${variant} sm" data-action="toggle-lang" aria-label="${esc(label)}">${icon('Globe')}<span>${esc(next)}</span></button>`;
}

/* ---------- public chrome ------------------------------------------------ */
export function publicChrome({ body, active = '' } = {}) {
  const state = getState();
  const links = [
    { href: '#/services', label: 'nav.services', id: 'services' },
    { href: '#/how-it-works', label: 'nav.how', id: 'how' },
    { href: '#/providers', label: 'nav.providers', id: 'providers' },
    { href: '#/support', label: 'nav.support', id: 'support' }
  ];
  const actions = state.user
    ? `<a class="btn ghost sm hide-xs" href="${homeFor(state.user.role)}">${icon('Arrow_Right_SM')}${esc(t('nav.profile'))}</a>
       <a class="btn sm" href="${homeFor(state.user.role)}">${avatar(state.user, { size: 'sm' })}<span class="hide-sm">${esc(state.user.name.split(' ')[0])}</span></a>`
    : `<button class="btn ghost sm" data-action="open-login">${esc(t('nav.signin'))}</button>
       <button class="btn sm" data-action="open-register">${esc(t('nav.register'))}</button>`;

  return `
  <header class="topbar">
    <div class="container topbar-inner">
      ${brand()}
      <nav class="topnav" aria-label="Primary">
        ${links.map((l) => `<a href="${l.href}"${active === l.id ? ' aria-current="page" style="color:var(--primary-ink);border-color:var(--primary)"' : ''}>${esc(t(l.label))}</a>`).join('')}
      </nav>
      <div class="top-actions">
        ${langButton()}
        ${actions}
      </div>
    </div>
  </header>
  <main id="main" class="app-main">${body}</main>
  ${publicFooter()}`;
}

function publicFooter() {
  return `
  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          ${brand()}
          <p class="muted small" style="margin-top:10px;max-width:34ch">${esc(t('landing.sub'))}</p>
        </div>
        <div>
          <h2>${esc(t('nav.services'))}</h2>
          <a href="#/services?category=Home%20Cleaning">${esc(t('nav.services'))}</a>
          <a href="#/services">${esc(t('landing.categoriesTitle'))}</a>
          <a href="#/book/Other%20Services">${esc(t('booking.title'))}</a>
        </div>
        <div>
          <h2>${esc(t('nav.providers'))}</h2>
          <a href="#/register?role=WORKER">${esc(t('landing.providerCta'))}</a>
          <a href="#/how-it-works">${esc(t('nav.how'))}</a>
          <a href="#/support">${esc(t('nav.support'))}</a>
        </div>
        <div>
          <h2>${esc(t('nav.support'))}</h2>
          <a href="#/support">${esc(t('support.title'))}</a>
          <a href="#/terms">${esc(t('legal.termsTitle'))}</a>
          <a href="#/privacy">${esc(t('legal.privacyTitle'))}</a>
          <a href="tel:+8809610000000">+880 9610 000 000</a>
          <a href="mailto:support@shebashathi.com.bd">support@shebashathi.com.bd</a>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} ${esc(t('brand.name'))}. ${esc(t('brand.tagline'))}</span>
        <span class="row" style="gap:12px">${langButton({ variant: 'ghost' })}</span>
      </div>
    </div>
  </footer>`;
}

/* ---------- app chrome -------------------------------------------------- */
function appbar(state) {
  const user = state.user;
  const unread = unreadCount();
  /* The chosen service location is shared with the map home through the map
     session, so the bar and the map can never disagree. */
  const place = readPlace();
  const location = (place && place.label) || (user && (user.area || user.district)) || '';
  return `
  <header class="appbar">
    <div class="container appbar-inner">
      <div class="hide-sm">${brand({ href: homeFor(user.role) })}</div>
      <a class="brand show-sm" href="${homeFor(user.role)}" style="font-size:17px">
        <span class="brand-mark" style="width:32px;height:32px">${icon('Map_Pin')}</span>
      </a>
      <a class="loc grow" href="${user.role === 'CUSTOMER' ? '#/location' : '#/account'}" style="text-decoration:none">
        ${icon('Map_Pin')}
        <span class="grow">
          <small>${esc(t('home.locationTitle'))}</small>
          <b class="clamp-2" data-role="appbar-place">${esc(location || t('home.locationDefault'))}</b>
        </span>
      </a>
      <div class="row" style="gap:6px">
        ${langButton({ variant: 'ghost' })}
        <a class="btn ghost icon bell" href="#/inbox" aria-label="${esc(unread ? `${t('a11y.notifications')} · ${unread > 99 ? '99+' : unread}` : t('a11y.notifications'))}">
          ${icon('Bell_Notification')}
          ${unread ? `<span class="badge">${esc(unread > 99 ? '99+' : unread)}</span>` : ''}
        </a>
        <a class="btn ghost icon" href="#/account" aria-label="${esc(`${capitalised(user.name)} — ${t('nav.account')}`)}">${avatar(user, { size: 'sm' })}</a>
      </div>
    </div>
  </header>`;
}

function sidebar(state, active) {
  const items = navFor(state.user.role);
  const secondary = [];
  if (state.user.role === 'CUSTOMER') {
    secondary.push({ id: 'addresses', href: '#/account/addresses', icon: 'Map_Pin', label: 'account.addresses' });
    secondary.push({ id: 'support', href: '#/account/support', icon: 'Headphones', label: 'account.support' });
  }
  if (state.user.role === 'WORKER') {
    secondary.push({ id: 'listings', href: '#/listings', icon: 'Shopping_Bag_01', label: 'provider.listingsTitle' });
  }
  if (state.user.role === 'ADMIN') {
    secondary.push({ id: 'admin-services', href: '#/admin/services', icon: 'Layers', label: 'admin.servicesTitle' });
    secondary.push({ id: 'admin-payouts', href: '#/admin/payouts', icon: 'Credit_Card_02', label: 'admin.payoutsTitle' });
  }
  const link = (item) => `<a href="${item.href}" class="${active === item.id ? 'active' : ''}"${active === item.id ? ' aria-current="page"' : ''}>${icon(item.icon)}<span>${esc(t(item.label))}</span></a>`;
  return `<aside class="sidebar">
    <nav class="sidenav" aria-label="${esc(t('a11y.menu'))}">
      ${items.map(link).join('')}
      <div class="nav-sec">${esc(t('nav.account'))}</div>
      ${secondary.map(link).join('')}
      <a href="#" data-action="sign-out">${icon('Log_Out')}<span>${esc(t('nav.signout'))}</span></a>
    </nav>
  </aside>`;
}

function bottomNav(state, active) {
  return `<nav class="bottom-nav" aria-label="${esc(t('a11y.menu'))}">
    ${navFor(state.user.role).map((item) => `
      <button data-action="nav" data-href="${item.href}" class="${active === item.id ? 'active' : ''}"${active === item.id ? ' aria-current="page"' : ''}>
        ${icon(item.icon)}<span>${esc(t(item.label))}</span>
      </button>`).join('')}
  </nav>`;
}

export function appChrome({ body, active = '', full = false } = {}) {
  const state = getState();
  /* A full-bleed view (the map-first home) owns the whole viewport: no
     container padding and no desktop side navigation, because the map has to
     reach the edges of the screen the way a native app's map does. */
  if (full) {
    return `
    ${appbar(state)}
    <main id="main" class="app-main app-main--full">${body}</main>
    <div class="spacer-nav"></div>
    ${bottomNav(state, active)}`;
  }
  return `
    ${appbar(state)}
    <div class="container" style="padding-top:24px">
      <div class="shell">
        ${sidebar(state, active)}
        <main id="main" class="app-main">${body}</main>
      </div>
    </div>
    <div class="spacer-nav"></div>
    ${bottomNav(state, active)}`;
}
