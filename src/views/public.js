/**
 * Public (unauthenticated) experience: landing, how it works, provider
 * recruitment and contact. All data shown is real (services and public
 * aggregate stats). No fabricated ratings or counts.
 */
import { api, ApiError } from '../api.js';
import { esc, icon, t, observeReveals, emptyState } from '../ui.js';
import { getState, setState } from '../store.js';
import { formatNumber } from '../i18n.js';
import { serviceName, serviceBlurb, serviceMedia } from '../ui.js';

export function categoryCard(service, { compact = false } = {}) {
  return `<button class="service-card" data-action="open-category" data-id="${esc(service.id)}" aria-label="${esc(serviceName(service))}">
    ${serviceMedia(service, { className: 'thumb' })}
    <span class="chip-ic">${icon(service.icon || 'Settings')}</span>
    <span class="body">
      <span class="name">${esc(serviceName(service))}</span>
      ${compact ? '' : `<span class="blurb clamp-2">${esc(serviceBlurb(service))}</span>`}
    </span>
  </button>`;
}

function statsRow(stats) {
  const items = [
    stats.services ? { v: formatNumber(stats.services), l: t('stats.services') } : null,
    stats.providers ? { v: formatNumber(stats.providers), l: t('stats.providers') } : null,
    stats.verifiedProviders ? { v: formatNumber(stats.verifiedProviders), l: t('stats.verified') } : null,
    stats.completedBookings ? { v: formatNumber(stats.completedBookings), l: t('stats.completed') } : null,
    stats.averageRating ? { v: `${formatNumber(stats.averageRating, { minimumFractionDigits: 1 })}★`, l: t('stats.rating') } : null
  ].filter(Boolean);
  if (!items.length) return '';
  return `<div class="hero-trust">${items.map((i) => `<div class="stat"><div class="v">${esc(i.v)}</div><div class="l">${esc(i.l)}</div></div>`).join('')}</div>`;
}

export async function landing() {
  const state = getState();
  let stats = state.publicStats || null;
  if (!stats) {
    try { const res = await api.publicStats(); stats = res.stats; setState({ publicStats: stats }); } catch { stats = null; }
  }
  const services = state.services.length ? state.services : (await loadServices());
  const featured = services.slice(0, 10);

  const body = `
  <div class="container welcome">
    <section class="hero welcome-hero reveal">
      <div class="welcome-hero__media">
        <img src="./assets/photos/home-cleaning.jpg" alt="" width="1600" height="1067" />
      </div>
      <div class="welcome-hero__scrim" aria-hidden="true"></div>
      <div class="welcome-hero__body">
        <div class="welcome-hero__brand">
          <span class="brand-mark">${icon('Map_Pin')}</span>
          <span class="welcome-hero__name">${esc(t('brand.name'))}<small>${esc(t('landing.eyebrow'))}</small></span>
        </div>
        <h1 class="display">${esc(t('landing.headline'))}</h1>
        <p>${esc(t('landing.sub'))}</p>
        <form class="hero-search" data-role="hero-search">
          <div class="searchbar">
            ${icon('Search_Magnifying_Glass')}
            <input name="q" type="search" placeholder="${esc(t('landing.searchPlaceholder'))}" aria-label="${esc(t('landing.searchPlaceholder'))}" />
            <button class="btn" type="submit">${esc(t('landing.searchBtn'))}</button>
          </div>
        </form>
        <div class="welcome-actions">
          <button class="btn lg" data-action="open-register">${icon('Calendar_Add')}${esc(t('landing.ctaPrimary'))}</button>
          <button class="btn secondary lg" data-action="open-login">${icon('User_01')}${esc(t('nav.signin'))}</button>
          <button class="btn glass-dark lg" data-action="open-register" data-role="WORKER">${icon('Suitcase')}${esc(t('landing.ctaSecondary'))}</button>
        </div>
        <div class="welcome-trust">
          ${[['Shield_Check', 'landing.trustVerified'], ['Tag', 'landing.trustClear'], ['Headphones', 'landing.trustSupport']].map(([ic, key]) => `
            <span class="pill glass-dark">${icon(ic)}<span>${esc(t(key))}</span></span>`).join('')}
        </div>
        ${stats ? statsRow(stats) : ''}
      </div>
    </section>

    <section class="section reveal" id="services">
      <div class="section-head">
        <div>
          <h2>${esc(t('landing.categoriesTitle'))}</h2>
          <p class="muted">${esc(t('landing.categoriesSub'))}</p>
        </div>
        <a class="btn ghost" href="#/explore">${esc(t('landing.viewAll'))} ${icon('Arrow_Right_SM')}</a>
      </div>
      <div class="grid grid-cat stagger">
        ${featured.map((s) => categoryCard(s)).join('') || emptyState({ art: 'assets/illustrations/empty-search.svg', title: t('service.notFound') })}
      </div>
    </section>

    <section class="section reveal" id="how">
      <div class="section-head"><div><h2>${esc(t('landing.howTitle'))}</h2><p class="muted">${esc(t('landing.howSub'))}</p></div></div>
      <div class="steps three">
        ${[['step1', 'Calendar_Check'], ['step2', 'Map_Pin'], ['step3', 'Circle_Check']].map(([key, ic]) => `
          <article class="step reveal">
            <span class="n"></span>
            <div><div class="icon-badge" style="margin-bottom:8px">${icon(ic)}</div>
            <h3>${esc(t(`landing.${key}Title`))}</h3>
            <p class="muted">${esc(t(`landing.${key}Body`))}</p></div>
          </article>`).join('')}
      </div>
    </section>

    <section class="section reveal" id="trust">
      <div class="section-head"><div><h2>${esc(t('landing.trustTitle'))}</h2></div></div>
      <div class="grid grid-3">
        ${[['Shield_Check', 'trustVerified'], ['Tag', 'trustClear'], ['Headphones', 'trustSupport']].map(([ic, key]) => `
          <article class="card reveal">
            <div class="icon-badge teal" style="margin-bottom:10px">${icon(ic)}</div>
            <h3>${esc(t(`landing.${key}`))}</h3>
            <p class="muted">${esc(t(`landing.${key}Body`))}</p>
          </article>`).join('')}
      </div>
    </section>

    <section class="section reveal" id="providers">
      <div class="card" style="display:grid;gap:20px;align-items:center;grid-template-columns:1fr;padding:28px">
        <div>
          <h2>${esc(t('landing.providerTitle'))}</h2>
          <p class="muted" style="margin:10px 0 16px;max-width:56ch">${esc(t('landing.providerBody'))}</p>
          <a class="btn lg" href="#/register?role=WORKER">${icon('User_Add')}${esc(t('landing.providerCta'))}</a>
        </div>
        <img class="illus" src="./assets/illustrations/provider-onboarding.svg" alt="" width="520" height="400" loading="lazy" />
      </div>
    </section>

    <section class="section reveal" id="support">
      <div class="card" style="display:grid;gap:20px;align-items:center;grid-template-columns:1fr;padding:28px">
        <div>
          <h2>${esc(t('landing.supportTitle'))}</h2>
          <p class="muted" style="margin:10px 0 16px;max-width:56ch">${esc(t('landing.supportBody'))}</p>
          <div class="row wrap">
            <a class="btn" href="#/support">${icon('Headphones')}${esc(t('support.title'))}</a>
            <a class="btn secondary" href="tel:+8809610000000">${icon('Phone')}+880 9610 000 000</a>
          </div>
        </div>
        <img class="illus" src="./assets/illustrations/support.svg" alt="" width="520" height="400" loading="lazy" />
      </div>
    </section>
  </div>`;

  return { body, chrome: 'public', active: '', after: () => observeReveals() };
}

export async function loadServices() {
  try {
    const [res, stats] = await Promise.all([
      api.services(),
      api.publicStats().catch(() => null)
    ]);
    const fees = stats && stats.stats ? stats.stats.fees : null;
    setState({ services: res.services || [], publicStats: (stats && stats.stats) || getState().publicStats, fees: fees || null });
    return res.services || [];
  } catch { return getState().services; }
}

export async function howItWorks() {
  const body = `
  <div class="container" style="padding-top:32px;max-width:960px">
    <p class="eyebrow">${esc(t('landing.howTitle'))}</p>
    <h1>${esc(t('landing.howSub'))}</h1>
    <div class="steps three" style="margin-top:28px">
      ${[['step1', 'Calendar_Check'], ['step2', 'Map_Pin'], ['step3', 'Circle_Check']].map(([key, ic]) => `
        <article class="step reveal"><span class="n"></span><div>
          <div class="icon-badge" style="margin-bottom:8px">${icon(ic)}</div>
          <h2 class="h3">${esc(t(`landing.${key}Title`))}</h2><p class="muted">${esc(t(`landing.${key}Body`))}</p>
        </div></article>`).join('')}
    </div>
    <div class="grid grid-3" style="margin-top:24px">
      ${[['Shield_Check', 'trustVerified'], ['Tag', 'trustClear'], ['Headphones', 'trustSupport']].map(([ic, key]) => `
        <article class="card reveal"><div class="icon-badge teal" style="margin-bottom:10px">${icon(ic)}</div>
        <h2 class="h3">${esc(t(`landing.${key}`))}</h2><p class="muted">${esc(t(`landing.${key}Body`))}</p></article>`).join('')}
    </div>
    <div class="card reveal" style="margin-top:28px;text-align:center">
      <img class="illus" src="./assets/illustrations/success.svg" alt="" style="max-width:420px;margin:0 auto 10px" loading="lazy" />
      <h2>${esc(t('landing.ctaPrimary'))}</h2>
      <p class="muted" style="margin:8px auto 18px;max-width:44ch">${esc(t('landing.sub'))}</p>
      <button class="btn lg" data-action="start-booking">${icon('Calendar_Add')}${esc(t('landing.ctaPrimary'))}</button>
    </div>
  </div>`;
  return { body, chrome: 'public', active: 'how', after: () => observeReveals() };
}

export async function providersPage() {
  const body = `
  <div class="container" style="padding-top:32px;max-width:1000px">
    <div class="card" style="display:grid;gap:22px;grid-template-columns:1fr;padding:28px;align-items:center">
      <div>
        <p class="eyebrow">${esc(t('nav.providers'))}</p>
        <h1>${esc(t('landing.providerTitle'))}</h1>
        <p class="muted" style="margin:12px 0 18px;max-width:56ch">${esc(t('landing.providerBody'))}</p>
        <a class="btn lg" href="#/register?role=WORKER">${icon('User_Add')}${esc(t('landing.providerCta'))}</a>
      </div>
      <img class="illus" src="./assets/illustrations/provider-onboarding.svg" alt="" width="520" height="400" />
    </div>
    <div class="grid grid-3" style="margin-top:28px">
      ${[['Suitcase', 'landing.step1Title', 'landing.step1Body'], ['Calendar_Check', 'landing.step2Title', 'landing.step2Body'], ['Credit_Card_01', 'provider.earningsTitle', 'provider.earningsAvailable']].map(([ic, title, bodyKey]) => `
        <article class="card reveal"><div class="icon-badge" style="margin-bottom:10px">${icon(ic)}</div>
        <h2 class="h3">${esc(t(title))}</h2><p class="muted">${esc(t(bodyKey))}</p></article>`).join('')}
    </div>
  </div>`;
  return { body, chrome: 'public', active: 'providers', after: () => observeReveals() };
}

export async function publicSupport() {
  const state = getState();
  const body = `
  <div class="container" style="padding-top:32px;max-width:900px">
    <div class="card" style="display:grid;gap:22px;grid-template-columns:1fr;padding:28px;align-items:center">
      <div>
        <p class="eyebrow">${esc(t('nav.support'))}</p>
        <h1>${esc(t('landing.supportTitle'))}</h1>
        <p class="muted" style="margin:12px 0 18px;max-width:56ch">${esc(t('landing.supportBody'))}</p>
        <div class="row wrap">
          <a class="btn" href="tel:+8809610000000">${icon('Phone')}+880 9610 000 000</a>
          <a class="btn secondary" href="mailto:support@shebasathi.com.bd">${icon('Mail')}support@shebasathi.com.bd</a>
        </div>
      </div>
      <img class="illus" src="./assets/illustrations/support.svg" alt="" width="520" height="400" />
    </div>
    ${state.user
      ? `<div class="card reveal" style="margin-top:24px">
           <h2>${esc(t('support.new'))}</h2>
           <p class="muted">${esc(t('support.sub'))}</p>
           <a class="btn" style="margin-top:14px" href="#/account/support">${icon('Headphones')}${esc(t('support.title'))}</a>
         </div>`
      : `<div class="card reveal" style="margin-top:24px;text-align:center">
           <h2 class="h3">${esc(t('auth.signinSub'))}</h2>
           <div class="row" style="justify-content:center;margin-top:14px">
             <button class="btn" data-action="open-login">${esc(t('nav.signin'))}</button>
             <button class="btn secondary" data-action="open-register">${esc(t('nav.register'))}</button>
           </div>
         </div>`}
  </div>`;
  return { body, chrome: 'public', active: 'support', after: () => observeReveals() };
}

export function notFoundPublic() {
  return { body: `<div class="container" style="padding-top:60px">${emptyState({ art: 'assets/illustrations/empty-search.svg', title: t('error.notFound'), action: `<a class="btn" href="#/">${esc(t('nav.home'))}</a>` })}</div>`, chrome: 'public', active: '' };
}
