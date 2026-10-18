/**
 * Customer experience: home, explore/discovery, service detail, activity,
 * booking tracking (with provider messaging and reviews) and offer comparison.
 * Everything reads from and writes to the real backend.
 */
import { api, ApiError, errorKey } from '../api.js';
import {
  esc, icon, t, money, toast, sheet, closeSheet, confirm, setBusy, observeReveals,
  emptyState, errorState, skeletonList, skeletonCards, statusTag, paymentTag, stars,
  serviceMedia, serviceName, serviceBlurb, avatar, register, navigate, truncate
} from '../ui.js';
import { getState, setState, serviceById } from '../store.js';
import { formatDate, formatDateTime, formatTime, relativeDay, formatNumber } from '../i18n.js';
import {
  attachMap, detachMap, focusPlace, getMapStatus, mapCapability, onMapStatus, readPlace,
  renderWorkerMarkers, setMapLanguage, formatCoordinates
} from '../map.js';
import { categoryCard } from './public.js';
import { refreshNotifications } from './auth.js';

const OPEN_STATUSES = ['CONFIRMED', 'WORKER_TRAVELLING', 'WORKER_ARRIVED', 'WORK_IN_PROGRESS', 'COMPLETION_REQUESTED'];
export const isOpen = (s) => OPEN_STATUSES.includes(s);

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return t('home.greetingMorning');
  if (hour < 17) return t('home.greetingAfternoon');
  return t('home.greetingEvening');
}

function locationLine(user) {
  return [user && user.area, user && user.district].filter(Boolean).join(', ');
}

/* ======================= provider card ================================== */
function cheapest(listings = []) {
  const priced = listings.filter((l) => l.pricePaisa != null);
  if (!priced.length) return null;
  return priced.reduce((min, l) => (l.pricePaisa < min.pricePaisa ? l : min), priced[0]);
}

export function providerCard(provider) {
  const price = cheapest(provider.listings);
  const skills = (provider.skills || []).slice(0, 3).map((s) => serviceName(serviceById(s) || { id: s, bn: s, en: s }));
  return `<button class="provider-card" data-action="view-provider" data-id="${esc(provider.id)}" style="text-align:left;width:100%">
    ${avatar(provider)}
    <span class="grow" style="min-width:0">
      <span class="row" style="gap:6px">
        <b>${esc(provider.name)}</b>
        ${provider.verified ? `<span class="tag done" title="${esc(t('account.verifiedBadge'))}">${icon('Shield_Check')}${esc(t('account.verifiedBadge'))}</span>` : ''}
      </span>
      <span class="muted small clamp-2" style="display:block">${esc(skills.join(' · ') || provider.bio || '')}</span>
      <span class="row" style="gap:10px;margin-top:4px">
        ${stars(provider.rating)}
        ${price ? `<span class="small"><b>${esc(money(price.pricePaisa))}</b> <span class="muted">${esc(t('explore.from'))}</span></span>` : ''}
        ${provider.available ? `<span class="tag progress">${icon('Radio_Fill')}${esc(t('provider.active'))}</span>` : ''}
      </span>
    </span>
    ${icon('Chevron_Right')}
  </button>`;
}

/* ======================= home (discovery) ==============================
   A normal scrolling home. The compact map preview shows — and opens — the
   place a service will happen at; everything below it is real data: the
   category catalogue the server serves, providers who are genuinely
   available near the chosen place, and the customer's own completed jobs.
   There are no invented statistics and no decorative map.
   ======================================================================== */
let stopStatusListener = null;

const placeText = (place) => {
  if (!place) return t('map.noLocation');
  if (place.label) return place.label;
  return Number.isFinite(place.lat) ? formatCoordinates(place.lat, place.lng) : t('map.noLocation');
};

/* The status strip under the sheet header. map.js owns the state, the view
   only paints it, so a style or tile failure appears without a re-render —
   re-rendering would throw the map away. */
function paintMapStatus(status) {
  const slot = document.querySelector('[data-role="map-status-slot"]');
  if (!slot) return;
  // When the whole pane already explains that the map is off, repeating it in
  // the sheet is noise.
  if (document.querySelector('.map-unavailable')) { slot.innerHTML = ''; return; }
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (!online) {
    slot.innerHTML = `<div class="map-status">${icon('Info')}<span>${esc(t('map.offline'))}</span></div>`;
    return;
  }
  if (!status || status.state === 'ready' || status.state === 'idle' || status.state === 'pending') { slot.innerHTML = ''; return; }
  const unconfigured = status.state === 'unconfigured';
  const errored = !unconfigured && status.state !== 'tiles-error';
  const key = status.state === 'tiles-error' ? 'map.tilesError' : unconfigured ? 'map.unconfigured' : 'map.unavailableBody';
  slot.innerHTML = `<div class="map-status${errored ? ' err' : ''}">${icon(errored ? 'Circle_Warning' : 'Info')}<span>${esc(t(key))}</span></div>`;
}

function nearbyRow(worker) {
  const skills = (worker.skills || []).slice(0, 3).map((s) => serviceName(serviceById(s) || { id: s, bn: s, en: s }));
  const distance = worker.distanceKm != null ? t('map.nearbyDistance', { km: formatNumber(worker.distanceKm, { maximumFractionDigits: 1 }) }) : '';
  return `<button class="map-list-item" data-action="view-provider" data-id="${esc(worker.id)}">
    ${avatar(worker)}
    <span class="grow" style="min-width:0">
      <span class="row" style="gap:6px">
        <b>${esc(worker.name || t('common.unknown'))}</b>
        ${worker.verified ? `<span class="tag done">${icon('Shield_Check')}${esc(t('account.verifiedBadge'))}</span>` : ''}
      </span>
      <span class="muted small clamp-2" style="display:block">${esc(skills.join(' · '))}</span>
      <span class="row" style="gap:10px;margin-top:4px">
        ${stars(worker.rating)}
        ${distance ? `<span class="small muted num">${esc(distance)}</span>` : ''}
      </span>
    </span>
    ${icon('Chevron_Right')}
  </button>`;
}

function nearbyPanel({ workers, failed }) {
  if (failed) {
    return `<div class="stack-sm">
      <h2 class="h3">${esc(t('map.nearbyTitle'))}</h2>
      <div class="notice err">${icon('Circle_Warning')}<span>${esc(t('map.nearbyFailed'))}</span></div>
      <button class="btn secondary sm" data-action="retry">${icon('Arrow_Reload_02')}${esc(t('common.retry'))}</button>
    </div>`;
  }
  if (!workers.length) {
    return `<h2 class="h3" style="margin-bottom:8px">${esc(t('map.nearbyTitle'))}</h2>
      ${emptyState({ art: 'assets/illustrations/empty-providers.svg', title: t('map.nearbyEmpty'), body: t('map.nearbyEmptyBody'), action: `<button class="btn" data-action="start-booking">${esc(t('explore.requestInstead'))}</button>` })}`;
  }
  return `<div class="row-between" style="margin-bottom:10px">
      <h2 class="h3">${esc(t('map.nearbyTitle'))}</h2>
      <span class="tag progress">${icon('Radio_Fill')}${esc(t('map.nearbyCount', { count: formatNumber(workers.length) }))}</span>
    </div>
    <p class="muted small" style="margin-bottom:12px">${esc(t('map.nearbySub'))}</p>
    <div>${workers.map(nearbyRow).join('')}</div>`;
}

export async function homeView() {
  const state = getState();
  const user = state.user;
  if (!user) return { redirect: '#/' };
  if (user.role !== 'CUSTOMER') return { redirect: user.role === 'WORKER' ? '#/work' : '#/admin' };

  const services = state.services.length ? state.services : await api.services().then((r) => { setState({ services: r.services || [] }); return r.services || []; }).catch(() => []);

  const place = readPlace();
  const [bookings, capability] = await Promise.all([
    api.bookings().then((r) => r.bookings || []).catch(() => []),
    mapCapability()
  ]);

  let workers = [];
  let nearbyFailed = false;
  try {
    const res = await api.discoveryWorkers(place ? { latitude: place.lat, longitude: place.lng } : {});
    workers = res.workers || [];
  } catch { nearbyFailed = true; }

  const active = bookings.find((b) => isOpen(b.status));
  const recent = bookings.filter((b) => b.status === 'COMPLETED').slice(0, 4);

  const body = `
  <div class="stack-lg">
    <section class="reveal">
      <div class="row-between" style="align-items:flex-start">
        <div>
          <p class="eyebrow">${esc(greeting())}</p>
          <h1 style="margin-top:2px">${esc(user.name)}</h1>
          <p class="muted small">${esc(t('home.whereTo'))}</p>
        </div>
        <a class="btn ghost icon sm" href="#/account/addresses" aria-label="${esc(t('account.addresses'))}">${icon('Bookmark')}</a>
      </div>
      <form class="search-card" data-role="search-form" role="search">
        ${icon('Search_Magnifying_Glass')}
        <label class="sr-only" for="home-q">${esc(t('home.searchServicePh'))}</label>
        <input id="home-q" name="q" type="search" placeholder="${esc(t('home.searchServicePh'))}" />
        <button class="btn sm pill" type="submit">${esc(t('landing.searchBtn'))}</button>
      </form>
    </section>

    <section class="reveal">
      <div class="map-preview" data-role="home-map"${capability.configured ? '' : ' data-state="unavailable"'}>
        <div class="map-preview__map">
          <div class="map-host" data-role="map-host"></div>
          <div data-role="map-status-slot"></div>
          ${capability.configured ? '' : `<div class="map-unavailable map-unavailable--compact">
            <div class="icon-badge" style="margin:0 auto 8px">${icon('Map_Pin')}</div>
            <b>${esc(t('map.unavailableTitle'))}</b>
            <p class="muted tiny">${esc(capability.note || t('map.unconfigured'))}</p>
          </div>`}
          <a class="map-preview__expand" href="#/location" aria-label="${esc(t('picker.openFull'))}">${icon('Expand')}</a>
        </div>
        <div class="map-preview__bar">
          <span class="icon-badge ink">${icon('Map_Pin')}</span>
          <span class="grow" style="min-width:0">
            <b class="clamp-1">${esc(placeText(place))}</b>
            <span class="muted tiny" style="display:block">${esc(t('home.mapTitle'))}</span>
          </span>
          <a class="btn sm" href="#/location">${esc(t('common.change'))}</a>
        </div>
      </div>
    </section>

    ${active ? activeBookingCard(active) : ''}

    <section class="reveal">
      <div class="section-head" style="margin-bottom:var(--s-3)">
        <h2 class="h3">${esc(t('home.categoriesTitle'))}</h2>
        <a class="btn ghost sm" href="#/services">${esc(t('common.seeAll'))}</a>
      </div>
      <div class="grid grid-cat" data-fx="stagger">${services.map((s) => categoryCard(s, { compact: true })).join('')}</div>
    </section>

    <section class="reveal">
      ${nearbyPanel({ workers, failed: nearbyFailed })}
    </section>

    <section class="reveal">
      <div class="section-head" style="margin-bottom:var(--s-3)">
        <h2 class="h3">${esc(t('map.recentTitle'))}</h2>
        ${recent.length ? `<a class="btn ghost sm" href="#/activity?tab=completed">${esc(t('common.seeAll'))}</a>` : ''}
      </div>
      ${recent.length
        ? `<div>${recent.map(bookingRow).join('')}</div>`
        : emptyState({ art: 'assets/illustrations/empty-bookings.svg', title: t('activity.noBookings'), body: t('activity.noBookingsBody'), action: `<button class="btn" data-action="start-booking">${esc(t('activity.browse'))}</button>` })}
    </section>

    <section class="reveal">
      <div class="row wrap" style="gap:10px">
        <button class="btn secondary" data-action="start-booking">${icon('Add_Plus')}${esc(t('explore.requestInstead'))}</button>
        <a class="btn ghost" href="#/services">${icon('More_Grid_Small')}${esc(t('home.browseAll'))}</a>
      </div>
    </section>

    <p class="map-privacy">${icon('Shield_Check')} ${esc(t('map.privacy'))}</p>
  </div>`;

  return {
    body,
    chrome: 'app',
    active: 'home',
    after: () => {
      observeReveals();
      paintMapStatus(getMapStatus());
      if (stopStatusListener) stopStatusListener();
      stopStatusListener = onMapStatus(paintMapStatus);
      const host = document.querySelector('[data-role="map-host"]');
      const center = place && Number.isFinite(place.lat) ? { lat: place.lat, lng: place.lng } : undefined;
      attachMap(host, { center }).then((map) => {
        if (!map) { setStatusSlotFromCapability(capability); return; }
        setMapLanguage(); // the interface language may have changed since the map loaded
        if (workers.length) renderWorkerMarkers(workers);
        if (place) focusPlace(place);
      }).catch(() => { /* the status strip already reports it */ });
    }
  };
}

function setStatusSlotFromCapability(capability) {
  const host = document.querySelector('[data-role="map-host"]');
  if (host) host.dataset.state = 'unavailable';
  paintMapStatus({ state: capability.configured ? 'unavailable' : 'unconfigured' });
}


/* ---------- provider card (unchanged) ----------------------------------- */

function activeBookingCard(booking) {
  const request = booking.request || {};
  const service = serviceById(request.service);
  return `<section class="reveal">
    <div class="card" style="border-color:var(--primary);box-shadow:var(--sh-3)">
      <div class="row-between">
        <span class="eyebrow">${esc(t('home.activeTitle'))}</span>
        ${statusTag(booking.status)}
      </div>
      <div class="row" style="margin-top:10px;gap:14px;align-items:flex-start">
        <div class="icon-badge">${icon((service && service.icon) || 'Settings')}</div>
        <div class="grow">
          <h2 class="h3" style="margin:0">${esc(serviceName(service) || request.service)}</h2>
          <p class="muted small">${esc(relativeDay(request.date))} · ${esc(money(booking.pricing && booking.pricing.total))}</p>
          <p class="muted small">${booking.worker ? esc(booking.worker.name) : esc(t('track.unassigned'))}</p>
        </div>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn" data-action="open-booking-detail" data-id="${esc(booking.id)}">${esc(t('activity.track'))}</button>
        <button class="btn secondary" data-action="open-chat" data-id="${esc(booking.id)}">${icon('Chat')}${esc(t('activity.message'))}</button>
      </div>
    </div>
  </section>`;
}

function bookingRow(booking) {
  const request = booking.request || {};
  const service = serviceById(request.service);
  return `<div class="list-item">
    <div class="row grow" style="align-items:flex-start">
      <div class="icon-badge ink">${icon((service && service.icon) || 'Settings')}</div>
      <div class="grow" style="min-width:0">
        <b>${esc(serviceName(service) || request.service)}</b>
        <p class="muted small clamp-2">${esc(request.description || '')}</p>
        <p class="muted small">${esc(formatDate(request.date))} · ${esc(money(booking.pricing && booking.pricing.total))}</p>
      </div>
    </div>
    <div style="text-align:right">
      ${statusTag(booking.status)}
      <div style="margin-top:8px"><button class="btn ghost sm" data-action="open-booking-detail" data-id="${esc(booking.id)}">${esc(t('common.seeAll'))}</button></div>
    </div>
  </div>`;
}

/* ======================= explore ======================================== */
export async function exploreView(params, query = {}) {
  const state = getState();
  const services = state.services.length ? state.services : await api.services().then((r) => { setState({ services: r.services || [] }); return r.services || []; }).catch(() => []);
  const filters = {
    q: query.q || '',
    category: query.category || '',
    area: query.area || '',
    budget: query.budget ? Number(query.budget) : '',
    availableOnly: query.available === '1',
    sort: query.sort || 'rating'
  };

  let providers = [];
  let failed = false;
  if (state.user) {
    try {
      const res = await api.providers({ q: filters.q, service: filters.category });
      providers = res.providers || [];
    } catch { failed = true; }
  }

  const serviceMatches = services.filter((s) => {
    if (!filters.q) return false;
    const hay = `${s.id} ${s.bn || ''} ${s.en || ''}`.toLowerCase();
    return hay.includes(filters.q.toLowerCase());
  });

  let filtered = providers.map((p) => ({ ...p, minPrice: cheapest(p.listings) ? cheapest(p.listings).pricePaisa : null }));
  if (filters.availableOnly) filtered = filtered.filter((p) => p.available);
  if (filters.category) filtered = filtered.filter((p) => (p.skills || []).includes(filters.category) || (p.listings || []).some((l) => l.service === filters.category));
  if (filters.area) filtered = filtered.filter((p) => `${p.area || ''} ${p.district || ''} ${(p.skills || []).join(' ')}`.toLowerCase().includes(filters.area.toLowerCase()));
  if (filters.budget) filtered = filtered.filter((p) => p.minPrice != null && p.minPrice <= filters.budget * 100);
  if (filters.sort === 'price') filtered.sort((a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity));
  else filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));

  const body = `
    <div class="stack-lg">
      <section>
        <h1>${esc(t('explore.title'))}</h1>
        <p class="muted">${esc(t('explore.sub'))}</p>
        <form data-role="explore-filters" style="margin-top:16px">
          <div class="searchbar" style="max-width:640px">
            ${icon('Search_Magnifying_Glass')}
            <input name="q" type="search" value="${esc(filters.q)}" placeholder="${esc(t('home.searchPh'))}" />
            <button class="btn" type="submit">${esc(t('landing.searchBtn'))}</button>
          </div>
          <div class="pill-choices" style="margin-top:14px" role="group" aria-label="${esc(t('explore.filterCategory'))}">
            <button type="button" class="choice" data-action="filter-category" data-category="" aria-pressed="${!filters.category}">${esc(t('explore.allCategories'))}</button>
            ${services.map((s) => `<button type="button" class="choice" data-action="filter-category" data-category="${esc(s.id)}" aria-pressed="${filters.category === s.id}">${icon(s.icon || 'Settings')}<span>${esc(serviceName(s))}</span></button>`).join('')}
          </div>
          <div class="form-row two" style="margin-top:14px;max-width:640px">
            <div class="field"><label for="f-area">${esc(t('explore.filterArea'))}</label>
              <input id="f-area" name="area" value="${esc(filters.area)}" placeholder="Dhanmondi" /></div>
            <div class="field"><label for="f-budget">${esc(t('explore.maxBudget'))}</label>
              <input id="f-budget" name="budget" type="number" min="0" step="50" value="${esc(filters.budget)}" placeholder="5000" /></div>
          </div>
          <div class="row wrap" style="margin-top:12px">
            <label class="row" style="gap:8px"><input type="checkbox" name="available" value="1" ${filters.availableOnly ? 'checked' : ''} style="width:20px;height:20px" /> <span>${esc(t('explore.availableOnly'))}</span></label>
            <div class="row" style="gap:8px;margin-left:auto">
              <label class="small muted" for="f-sort">${esc(t('explore.sort'))}</label>
              <select id="f-sort" name="sort" class="input" style="min-height:40px;width:auto">
                <option value="rating" ${filters.sort === 'rating' ? 'selected' : ''}>${esc(t('explore.sortRating'))}</option>
                <option value="price" ${filters.sort === 'price' ? 'selected' : ''}>${esc(t('explore.sortPrice'))}</option>
              </select>
            </div>
            <button class="btn ghost sm" type="button" data-action="clear-filters">${esc(t('explore.clear'))}</button>
          </div>
        </form>
      </section>

      ${serviceMatches.length ? `
        <section>
          <div class="section-head"><h2>${esc(t('nav.services'))}</h2></div>
          <div class="grid grid-cat">${serviceMatches.map((s) => categoryCard(s, { compact: true })).join('')}</div>
        </section>` : ''}

      <section>
        <div class="section-head">
          <h2>${esc(t('explore.results', { count: formatNumber(filtered.length) }))}</h2>
        </div>
        ${!state.user
          ? emptyState({ art: 'assets/illustrations/empty-providers.svg', title: t('auth.signinSub'), action: `<button class="btn" data-action="open-login">${esc(t('nav.signin'))}</button>` })
          : failed
            ? errorState({ retry: false })
            : filtered.length
              ? `<div class="grid grid-2 stagger">${filtered.map(providerCard).join('')}</div>`
              : emptyState({ art: 'assets/illustrations/empty-providers.svg', title: t('explore.noResults'), body: t('explore.noResultsBody'), action: `<button class="btn" data-action="start-booking">${esc(t('explore.requestInstead'))}</button>` })}
      </section>
    </div>`;
  return { body, chrome: 'app', active: 'explore', after: () => observeReveals() };
}

/* ======================= service detail ================================= */
export async function serviceView(params) {
  const id = params.id;
  const state = getState();
  if (!state.services.length) await api.services().then((r) => setState({ services: r.services || [] })).catch(() => {});
  const service = serviceById(id) || state.services.find((s) => s.id === id);
  if (!service) return { body: emptyState({ art: 'assets/illustrations/empty-search.svg', title: t('service.notFound'), action: `<a class="btn" href="#/explore">${esc(t('nav.explore'))}</a>` }), chrome: state.user ? 'app' : 'public', active: 'explore' };

  let providers = [];
  if (state.user) { try { const res = await api.providers({ service: id }); providers = res.providers || []; } catch { providers = []; } }

  const body = `
    <div class="stack-lg">
      <div class="card pad-0" style="overflow:hidden">
        ${serviceMedia(service, { className: 'media-img' })}
        <div style="padding:24px">
          <div class="row" style="gap:10px">
            <div class="icon-badge">${icon(service.icon || 'Settings')}</div>
            <div><h1>${esc(serviceName(service))}</h1><p class="muted">${esc(serviceBlurb(service))}</p></div>
          </div>
          <div class="row" style="margin-top:18px">
            <button class="btn lg" data-action="open-booking" data-service="${esc(service.id)}">${icon('Calendar_Add')}${esc(t('service.bookNow'))}</button>
            <button class="btn secondary lg" data-action="open-booking" data-service="${esc(service.id)}" data-mode="offers">${icon('Chat_Conversation')}${esc(t('service.requestOffers'))}</button>
          </div>
          <div class="notice" style="margin-top:16px">${icon('Info')}<span>${esc(t('service.offersNote'))}</span></div>
        </div>
      </div>

      <section>
        <div class="section-head"><h2>${esc(t('service.providersTitle'))}</h2></div>
        ${providers.length
          ? `<div class="grid grid-2">${providers.map(providerCard).join('')}</div>`
          : emptyState({ art: 'assets/illustrations/empty-providers.svg', title: t('explore.noResults'), body: t('explore.noResultsBody'), action: `<button class="btn" data-action="open-booking" data-service="${esc(service.id)}">${esc(t('explore.requestInstead'))}</button>` })}
      </section>
    </div>`;
  return { body, chrome: state.user ? 'app' : 'public', active: 'explore', after: () => observeReveals() };
}

/* ======================= activity ======================================= */
export async function activityView(params, query = {}) {
  const state = getState();
  if (!state.user) return { redirect: '#/' };
  const tab = query.tab || 'all';

  const [bookings, requests] = await Promise.all([
    api.bookings().then((r) => r.bookings || []).catch(() => []),
    api.requests().then((r) => r.requests || []).catch(() => [])
  ]);

  const openRequests = requests.filter((r) => ['OPEN_FOR_OFFERS', 'OFFER_RECEIVED'].includes(r.status));
  const filtered = bookings.filter((b) => {
    if (tab === 'active') return isOpen(b.status);
    if (tab === 'completed') return b.status === 'COMPLETED';
    if (tab === 'cancelled') return b.status === 'CANCELLED';
    return true;
  });

  const tabs = [
    ['all', 'activity.tabAll'], ['active', 'activity.tabActive'],
    ['completed', 'activity.tabCompleted'], ['cancelled', 'activity.tabCancelled']
  ];

  const body = `
    <div class="stack-lg">
      <div class="page-head">
        <div><h1>${esc(t('activity.title'))}</h1><p class="muted">${esc(t('activity.sub'))}</p></div>
        <button class="btn" data-action="start-booking">${icon('Add_Plus')}${esc(t('booking.title'))}</button>
      </div>

      <div class="segmented" role="tablist">
        ${tabs.map(([id, key]) => `<button role="tab" aria-selected="${tab === id}" data-action="activity-tab" data-tab="${id}">${esc(t(key))}</button>`).join('')}
      </div>

      ${openRequests.length ? `
        <section>
          <div class="section-head"><h2>${esc(t('activity.requestOpen'))}</h2></div>
          <div class="card">
            ${openRequests.map((r) => {
              const service = serviceById(r.service);
              const count = r.offerCount != null ? r.offerCount : null;
              return `<div class="list-item">
                <div class="row grow" style="align-items:flex-start">
                  <div class="icon-badge ink">${icon((service && service.icon) || 'Settings')}</div>
                  <div class="grow" style="min-width:0"><b>${esc(serviceName(service) || r.service)}</b>
                    <p class="muted small clamp-2">${esc(r.description)}</p>
                    <p class="muted small">${esc(formatDate(r.date))} · ${esc(r.area || '')}</p></div>
                </div>
                <div style="text-align:right">
                  ${statusTag(r.status)}
                  <div class="row" style="margin-top:8px;gap:6px;justify-content:flex-end">
                    <button class="btn ghost sm" data-action="open-offers" data-id="${esc(r.id)}">${esc(t('activity.compareOffers'))}</button>
                    <button class="btn ghost sm" data-action="cancel-request" data-id="${esc(r.id)}">${esc(t('activity.cancel'))}</button>
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </section>` : ''}

      <section>
        <div class="section-head"><h2>${esc(t('nav.bookings'))}</h2></div>
        ${filtered.length ? `<div class="card">${filtered.map(bookingActionRow).join('')}</div>`
          : emptyState({ art: 'assets/illustrations/empty-bookings.svg', title: t('activity.noBookings'), body: t('activity.noBookingsBody'), action: `<button class="btn" data-action="start-booking">${esc(t('activity.browse'))}</button>` })}
      </section>
    </div>`;
  return { body, chrome: 'app', active: 'activity', after: () => observeReveals() };
}

function bookingActionRow(booking) {
  const request = booking.request || {};
  const service = serviceById(request.service);
  const actions = [];
  if (isOpen(booking.status)) {
    actions.push(`<button class="btn sm" data-action="open-booking-detail" data-id="${esc(booking.id)}">${esc(t('activity.track'))}</button>`);
    actions.push(`<button class="btn secondary sm" data-action="open-chat" data-id="${esc(booking.id)}">${icon('Chat')}${esc(t('activity.message'))}</button>`);
  }
  if (booking.status === 'COMPLETION_REQUESTED') {
    actions.push(`<button class="btn teal sm" data-action="confirm-completion" data-id="${esc(booking.id)}">${icon('Check')}${esc(t('track.confirmCompletion'))}</button>`);
  }
  if (booking.status === 'COMPLETED') {
    actions.push(`<button class="btn sm" data-action="review-booking" data-id="${esc(booking.id)}">${icon('Star')}${esc(t('activity.review'))}</button>`);
    actions.push(`<button class="btn secondary sm" data-action="rebook" data-service="${esc(request.service || '')}">${icon('Arrow_Reload_02')}${esc(t('activity.rebook'))}</button>`);
  }
  if (booking.status === 'CANCELLED') {
    actions.push(`<button class="btn secondary sm" data-action="rebook" data-service="${esc(request.service || '')}">${icon('Arrow_Reload_02')}${esc(t('activity.rebook'))}</button>`);
  }
  return `<div class="list-item">
    <div class="row grow" style="align-items:flex-start">
      <div class="icon-badge ink">${icon((service && service.icon) || 'Settings')}</div>
      <div class="grow" style="min-width:0">
        <b>${esc(serviceName(service) || request.service)}</b>
        <p class="muted small clamp-2">${esc(request.description || '')}</p>
        <p class="muted small">${esc(formatDate(request.date))} · ${esc(money(booking.pricing && booking.pricing.total))}${booking.worker ? ` · ${esc(booking.worker.name)}` : ''}</p>
      </div>
    </div>
    <div style="text-align:right;display:flex;flex-direction:column;gap:8px;align-items:flex-end">
      ${statusTag(booking.status)}
      ${actions.slice(0, 2).join('')}
    </div>
  </div>`;
}

/* ======================= booking detail / tracking ====================== */
const LIFECYCLE = ['CONFIRMED', 'WORKER_TRAVELLING', 'WORKER_ARRIVED', 'WORK_IN_PROGRESS', 'COMPLETION_REQUESTED', 'COMPLETED'];

function timeline(status) {
  const index = LIFECYCLE.indexOf(status);
  const cancelled = status === 'CANCELLED' || status === 'DISPUTED';
  return `<div class="timeline">
    ${LIFECYCLE.map((step, i) => {
      const cls = cancelled ? (i === 0 ? 'done' : '') : i < index ? 'done' : i === index ? 'now' : '';
      return `<div class="tl-item ${cls}">
        <div class="tl-rail"><span class="tl-dot"></span>${i < LIFECYCLE.length - 1 ? '<span class="tl-line"></span>' : ''}</div>
        <div class="tl-body"><b>${esc(t(`status.${step}`))}</b></div>
      </div>`;
    }).join('')}
  </div>`;
}

export async function bookingDetailView(params) {
  const state = getState();
  if (!state.user) return { redirect: '#/' };
  let booking;
  try { booking = (await api.booking(params.id)).booking; } catch (error) {
    return { body: emptyState({ art: 'assets/illustrations/offline.svg', title: t('error.title'), body: error.message, action: `<a class="btn" href="#/activity">${esc(t('activity.title'))}</a>` }), chrome: 'app', active: 'activity' };
  }
  const request = booking.request || {};
  const service = serviceById(request.service);
  const isCustomer = booking.customerId === state.user.id;
  const other = isCustomer ? booking.worker : booking.customer;
  const hasCoords = Number.isFinite(request.latitude) && Number.isFinite(request.longitude);
  let events = [];
  try { events = (await api.bookingEvents(params.id)).events || []; } catch { events = []; }

  const actions = [];
  if (other) actions.push(`<button class="btn secondary sm" data-action="open-chat" data-id="${esc(booking.id)}">${icon('Chat')}${esc(t('track.chat'))}</button>`);
  if (other && other.phone) actions.push(`<a class="btn secondary sm" href="tel:${esc(other.phone)}">${icon('Phone')}${esc(t('track.call'))}</a>`);
  if (isOpen(booking.status)) actions.push(`<button class="btn ghost sm" data-action="cancel-booking" data-id="${esc(booking.id)}">${esc(t('track.cancelRequest'))}</button>`);
  if (isCustomer && booking.status === 'COMPLETION_REQUESTED') actions.push(`<button class="btn teal sm" data-action="confirm-completion" data-id="${esc(booking.id)}">${icon('Check')}${esc(t('status.COMPLETED'))}</button>`);
  if (isCustomer && booking.status === 'COMPLETED' && !booking.review) actions.push(`<button class="btn sm" data-action="review-booking" data-id="${esc(booking.id)}">${icon('Star')}${esc(t('activity.review'))}</button>`);
  actions.push(`<button class="btn ghost sm" data-action="open-support" data-booking="${esc(booking.id)}">${icon('Headphones')}${esc(t('track.support'))}</button>`);

  const workerActions = !isCustomer ? workerTransitionActions(booking) : '';

  const body = `
    <div class="stack-lg">
      <div class="page-head">
        <div>
          <a class="btn ghost sm" href="#/activity">${icon('Arrow_Left_MD')}${esc(t('common.back'))}</a>
          <h1 style="margin-top:8px">${esc(serviceName(service) || request.service)}</h1>
          <p class="muted small">${esc(t('track.reference'))}: <b class="num">${esc(booking.id)}</b></p>
        </div>
        ${statusTag(booking.status)}
      </div>

      <div class="grid grid-3" style="align-items:start">
        <div class="card reveal" style="grid-column:span 2">
          <div class="row-between"><h2 class="h3">${esc(t('track.statusTitle'))}</h2>${paymentTag(booking.paymentStatus)}</div>
          <div style="margin-top:14px">${timeline(booking.status)}</div>
          ${booking.worker ? `
            <hr class="divider" />
            <div class="row">
              ${avatar(booking.worker, { size: 'lg' })}
              <div class="grow">
                <b>${esc(booking.worker.name)}</b>
                <p class="muted small">${esc((booking.worker.skills || []).map((s) => serviceName(serviceById(s) || { id: s, bn: s, en: s })).join(' · '))}</p>
                ${stars(booking.worker.rating)}
              </div>
            </div>` : `<div class="notice" style="margin-top:14px">${icon('Info')}<span>${esc(t('track.unassigned'))} — ${esc(t('track.matchNote'))}</span></div>`}
          <div class="row wrap" style="margin-top:16px">${actions.join('')}</div>
          ${workerActions}
        </div>

        <div class="card reveal">
          <h2 class="h3">${esc(t('booking.pricing'))}</h2>
          <div class="breakdown" style="margin-top:12px">
            <div class="row-between"><span>${esc(t('booking.serviceFee'))}</span><b>${esc(money(booking.pricing.quote))}</b></div>
            <div class="row-between"><span>${esc(t('booking.platformFee'))}</span><b>${esc(money(booking.pricing.fee))}</b></div>
            ${booking.pricing.discount ? `<div class="row-between"><span>${esc(t('booking.discount'))}</span><b>−${esc(money(booking.pricing.discount))}</b></div>` : ''}
            <div class="row-between total"><span>${esc(t('booking.total'))}</span><b>${esc(money(booking.pricing.total))}</b></div>
          </div>
          <hr class="divider" />
          <div class="stack-sm small">
            <div class="row-between"><span class="muted">${esc(t('track.scheduled'))}</span><b>${esc(formatDateTime(request.date))}</b></div>
            <div class="row-between"><span class="muted">${esc(t('track.location'))}</span><b style="text-align:right">${esc([request.area, request.district].filter(Boolean).join(', '))}</b></div>
          </div>
        </div>
      </div>

      <div class="card reveal">
        <h2 class="h3">${esc(t('track.locationTitle'))}</h2>
        <div class="stack-sm small" style="margin-top:12px">
          <div class="row-between"><span class="muted">${esc(t('track.location'))}</span><b style="text-align:right">${esc([request.area, request.district].filter(Boolean).join(', ') || '—')}</b></div>
          ${hasCoords ? `<div class="row-between"><span class="muted">${esc(t('map.coordinates'))}</span><b class="num" style="text-align:right">${esc(formatCoordinates(request.latitude, request.longitude))}</b></div>` : ''}
        </div>
        <p class="muted small" style="margin-top:10px">${esc(hasCoords ? t('track.coordsNote') : t('track.areaNote'))}</p>
        ${hasCoords ? `<button type="button" class="btn secondary block" style="margin-top:12px" data-action="view-booking-map" data-id="${esc(booking.id)}">${icon('Map_Pin')}${esc(t('track.showOnMap'))}</button>` : ''}
      </div>

      ${booking.review ? `
      <div class="card reveal">
        <h2 class="h3">${esc(t('track.yourReview'))}</h2>
        <div class="list-item" style="margin-top:10px">
          <div><b class="num">${'★'.repeat(Math.max(1, Math.min(5, Number(booking.review.rating) || 0)))}</b>
            ${booking.review.comment ? `<p class="muted small">${esc(booking.review.comment)}</p>` : ''}
            <p class="muted small">${esc(formatDateTime(booking.review.createdAt))}</p></div>
        </div>
      </div>` : ''}

      <div class="card reveal">
        <h2 class="h3">${esc(t('track.eventsTitle'))}</h2>
        ${events.length ? `<div class="list">${events.slice().reverse().map((e) => `<div class="list-item">
          <div><b>${esc(t(`status.${e.to}`))}</b><p class="muted small">${esc(formatDateTime(e.createdAt))}</p></div>
          ${e.reason ? `<span class="muted small">${esc(e.reason)}</span>` : ''}
        </div>`).join('')}</div>` : `<p class="muted small">${esc(t('track.noEvents'))}</p>`}
      </div>
    </div>`;
  return { body, chrome: 'app', active: isCustomer ? 'activity' : 'work', after: () => observeReveals() };
}

function workerTransitionActions(booking) {
  const map = {
    CONFIRMED: [['WORKER_TRAVELLING', 'provider.onTheWay'], ['WORK_IN_PROGRESS', 'provider.startWork']],
    WORKER_TRAVELLING: [['WORKER_ARRIVED', 'provider.arrived'], ['WORK_IN_PROGRESS', 'provider.startWork']],
    WORKER_ARRIVED: [['WORK_IN_PROGRESS', 'provider.startWork']],
    WORK_IN_PROGRESS: [['COMPLETION_REQUESTED', 'provider.requestCompletion']],
    COMPLETION_REQUESTED: []
  };
  const list = map[booking.status] || [];
  if (!list.length) return '';
  return `<div class="row wrap" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line)">
    ${list.map(([status, key]) => `<button class="btn sm" data-action="transition-booking" data-id="${esc(booking.id)}" data-status="${status}">${esc(t(key))}</button>`).join('')}
  </div>`;
}

/* ======================= offers comparison ============================== */
export async function offersView(params) {
  const state = getState();
  if (!state.user) return { redirect: '#/' };
  let offers = [];
  let error = null;
  try { offers = (await api.offers(params.requestId)).offers || []; } catch (e) { error = e; }

  if (error) {
    return { body: emptyState({ art: 'assets/illustrations/offline.svg', title: t('error.title'), body: e_key(error), action: `<a class="btn" href="#/activity">${esc(t('activity.title'))}</a>` }), chrome: 'app', active: 'activity' };
  }

  const body = `
    <div class="stack-lg">
      <div class="page-head">
        <div><a class="btn ghost sm" href="#/activity">${icon('Arrow_Left_MD')}${esc(t('common.back'))}</a>
          <h1 style="margin-top:8px">${esc(t('activity.compareOffers'))}</h1>
          <p class="muted small">${esc(t('service.offersNote'))}</p></div>
      </div>
      ${offers.length ? `<div class="grid grid-2">${offers.map(offerCard).join('')}</div>`
        : emptyState({ art: 'assets/illustrations/empty-messages.svg', title: t('activity.requestOpen'), body: t('service.offersNote') })}
    </div>`;
  return { body, chrome: 'app', active: 'activity', after: () => observeReveals() };
}

function e_key(error) {
  return error instanceof ApiError ? error.message : t('error.network');
}

function offerCard(offer) {
  const worker = offer.worker || {};
  const pricing = offer.pricing || {};
  return `<article class="card">
    <div class="row">
      ${avatar(worker, { size: 'lg' })}
      <div class="grow">
        <div class="row" style="gap:6px"><b>${esc(worker.name || t('common.unknown'))}</b>
          ${worker.verified ? `<span class="tag done">${icon('Shield_Check')}${esc(t('account.verifiedBadge'))}</span>` : ''}</div>
        <p class="muted small">${esc((worker.skills || []).map((s) => serviceName(serviceById(s) || { id: s, bn: s, en: s })).join(' · '))}</p>
        ${stars(worker.rating)}
      </div>
      <div style="text-align:right"><div class="h2 num">${esc(money(offer.price))}</div>
        ${offer.eta ? `<span class="muted small">${esc(offer.eta)}</span>` : ''}</div>
    </div>
    ${offer.message ? `<p style="margin-top:12px">${esc(offer.message)}</p>` : ''}
    <div class="row" style="margin-top:14px"><button class="btn" data-action="accept-offer" data-id="${esc(offer.id)}">${icon('Check')}${esc(t('common.select'))}</button></div>
  </article>`;
}

/* ======================= provider public profile ======================== */
export async function providerProfileView(params) {
  const state = getState();
  let provider = null;
  try { provider = (await api.provider(params.id)).provider; } catch { provider = null; }
  if (!provider) return { body: emptyState({ art: 'assets/illustrations/empty-providers.svg', title: t('explore.noResults'), action: `<a class="btn" href="#/explore">${esc(t('nav.explore'))}</a>` }), chrome: state.user ? 'app' : 'public', active: 'explore' };

  let reviews = [];
  if (state.user) { try { reviews = (await api.reviews(provider.id)).reviews || []; } catch { reviews = []; } }

  const body = `
    <div class="stack-lg">
      <a class="btn ghost sm" href="#/explore">${icon('Arrow_Left_MD')}${esc(t('common.back'))}</a>
      <div class="card reveal">
        <div class="row" style="align-items:flex-start">
          ${avatar(provider, { size: 'lg' })}
          <div class="grow">
            <div class="row" style="gap:8px"><h1>${esc(provider.name)}</h1>
              ${provider.verified ? `<span class="tag done">${icon('Shield_Check')}${esc(t('account.verifiedBadge'))}</span>` : `<span class="tag draft">${esc(t('account.unverifiedBadge'))}</span>`}</div>
            <p class="muted">${esc(provider.bio || '')}</p>
            <div class="row" style="gap:12px;margin-top:6px">
              ${stars(provider.rating)}
              ${provider.available ? `<span class="tag progress">${icon('Radio_Fill')}${esc(t('provider.active'))}</span>` : ''}
            </div>
            <div class="pill-choices" style="margin-top:12px">
              ${(provider.skills || []).map((s) => `<span class="choice static">${esc(serviceName(serviceById(s) || { id: s, bn: s, en: s }))}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>

      ${(provider.listings || []).length ? `
        <section>
          <div class="section-head"><h2>${esc(t('provider.listingsTitle'))}</h2></div>
          <div class="grid grid-2">
            ${provider.listings.map((l) => {
              const service = serviceById(l.service);
              return `<article class="card">
                <div class="row-between"><div class="row" style="gap:10px">
                  <div class="icon-badge">${icon((service && service.icon) || 'Settings')}</div>
                  <div><b>${esc(l.title)}</b><p class="muted small">${esc(serviceName(service) || l.service)}</p></div>
                </div><b class="h3 num">${l.pricePaisa != null ? esc(money(l.pricePaisa)) : esc(t('booking.quoteModel'))}</b></div>
                ${l.description ? `<p class="muted small" style="margin-top:10px">${esc(truncate(l.description, 180))}</p>` : ''}
                ${(l.addOns || []).length ? `<div class="pill-choices" style="margin-top:10px">${l.addOns.map((a) => `<span class="choice">${esc(a.title)} · ${esc(money(a.pricePaisa))}</span>`).join('')}</div>` : ''}
                ${l.pricePaisa != null ? `<button class="btn" style="margin-top:14px" data-action="open-booking" data-service="${esc(l.service)}" data-listing="${esc(l.id)}">${icon('Calendar_Add')}${esc(t('service.bookNow'))}</button>`
                  : `<button class="btn secondary" style="margin-top:14px" data-action="start-booking" data-service="${esc(l.service)}">${icon('Chat_Conversation')}${esc(t('service.getQuote'))}</button>`}
              </article>`;
            }).join('')}
          </div>
        </section>` : ''}

      <section>
        <div class="section-head"><h2>${esc(t('common.rating'))}</h2></div>
        ${reviews.length ? `<div class="card">${reviews.slice(0, 8).map((r) => `<div class="list-item">
          <div><div class="row" style="gap:8px"><b>${stars(r.rating)}</b></div>
          ${r.comment ? `<p style="margin-top:6px">${esc(r.comment)}</p>` : ''}
          <p class="muted tiny">${esc(formatDate(r.createdAt))}</p></div>
        </div>`).join('')}</div>`
          : emptyState({ art: 'assets/illustrations/empty-messages.svg', title: t('activity.noBookings'), body: t('landing.trustSupportBody') })}
      </section>
    </div>`;
  return { body, chrome: state.user ? 'app' : 'public', active: 'explore', after: () => observeReveals() };
}

/* ======================= chat sheet ===================================== */
export async function openChat(bookingId) {
  const dialog = sheet({ title: t('inbox.title'), body: `<div class="chat" data-role="chat"><div class="sk line w60"></div><div class="sk line w40"></div></div>
    <form data-role="chat-form" class="row" style="margin-top:12px;gap:8px">
      <input class="input" name="text" placeholder="${esc(t('inbox.sendPh'))}" maxlength="1000" style="flex:1" autocomplete="off" />
      <button class="btn icon" type="submit" aria-label="${esc(t('inbox.send'))}">${icon('Paper_Plane')}</button>
    </form>` });
  const chat = dialog.body.querySelector('[data-role="chat"]');
  const form = dialog.body.querySelector('[data-role="chat-form"]');
  const me = getState().user;
  let booking = null;

  const render = (messages) => {
    chat.innerHTML = messages.length
      ? messages.map((m) => `<div class="msg ${m.senderId === me.id ? 'mine' : ''}">${esc(m.text)}<small>${esc(formatTime(m.createdAt))}</small></div>`).join('')
      : `<p class="muted small">${esc(t('inbox.emptyChat'))}</p>`;
    chat.scrollTop = chat.scrollHeight;
  };

  try {
    booking = (await api.booking(bookingId)).booking;
    const res = await api.bookingMessages(bookingId);
    render(res.messages || []);
  } catch { chat.innerHTML = `<p class="muted small">${esc(t('error.network'))}</p>`; }

  const closed = booking && ['COMPLETED', 'CANCELLED'].includes(booking.status);
  if (closed) { form.querySelector('input').disabled = true; form.querySelector('button').disabled = true; chat.insertAdjacentHTML('afterend', `<p class="muted small">${esc(t('inbox.readOnly'))}</p>`); }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = form.querySelector('input');
    const text = input.value.trim();
    if (!text) return;
    const button = form.querySelector('button');
    setBusy(button, true);
    try {
      await api.sendMessage(bookingId, text);
      input.value = '';
      const res = await api.bookingMessages(bookingId);
      render(res.messages || []);
    } catch (error) { toast(t(errorKey(error)), 'error'); } finally { setBusy(button, false); }
  });
  return dialog;
}

/* ======================= review sheet ================================== */
export function openReview(bookingId) {
  const dialog = sheet({
    title: t('track.rateTitle'),
    body: `<form data-role="review-form">
      <div class="field"><label>${esc(t('common.rating'))}</label>
        <div class="pill-choices" role="group" aria-label="${esc(t('common.rating'))}">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="choice" data-action="review-star" data-value="${n}" aria-pressed="${n === 5}">${n} ★</button>`).join('')}
        </div>
        <input type="hidden" name="rating" value="5" /></div>
      <div class="field"><label for="review-comment">${esc(t('track.rateComment'))}</label>
        <textarea id="review-comment" name="comment" maxlength="500" placeholder="${esc(t('booking.notes'))}"></textarea></div>
      <button class="btn block lg" type="submit">${esc(t('track.rateSubmit'))}</button>
    </form>`
  });
  dialog.body.querySelector('[data-role="review-form"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(button, true);
    try {
      await api.review(bookingId, { rating: Number(data.rating), comment: data.comment });
      closeSheet();
      toast(t('track.rateThanks'), 'success');
      refreshNotifications();
      if (window.location.hash.startsWith('#/booking/')) window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error instanceof ApiError && error.status === 409 ? t('track.rateAlready') : t(errorKey(error)), 'error');
    } finally { setBusy(button, false); }
  });
}

/* ======================= action registrations =========================== */
register('view-provider', (data) => navigate(`#/provider/${data.id}`));
register('open-category', (data) => navigate(`#/explore?category=${encodeURIComponent(data.id)}`));
register('filter-category', (data) => {
  const form = document.querySelector('[data-role="explore-filters"]');
  const params = new URLSearchParams(new FormData(form));
  params.set('category', data.category);
  params.delete('area'); params.delete('budget');
  navigate(`#/explore?${params.toString()}`);
});
register('clear-filters', () => navigate('#/explore'));
register('activity-tab', (data) => navigate(`#/activity?tab=${data.tab}`));
register('start-booking', () => navigate('#/book/any'));
register('open-booking', (data) => navigate(`#/book/${encodeURIComponent(data.service || 'any')}${data.listing ? `?listing=${encodeURIComponent(data.listing)}` : ''}`));
register('open-booking-detail', (data) => navigate(`#/booking/${data.id}`));
register('open-offers', (data) => navigate(`#/offers/${data.id}`));
register('rebook', (data) => navigate(`#/book/${encodeURIComponent(data.service || 'any')}`));
register('open-chat', (data) => openChat(data.id));
register('open-support', (data) => navigate(`#/account/support${data.booking ? `?booking=${data.booking}` : ''}`));
register('review-booking', (data) => openReview(data.id));

register('review-star', (data, event, el) => {
  const group = el.parentElement;
  group.querySelectorAll('.choice').forEach((c) => c.setAttribute('aria-pressed', String(c === el)));
  group.parentElement.querySelector('input[name="rating"]').value = data.value;
});

register('cancel-booking', async (data) => {
  const ok = await confirm({ title: t('track.cancelConfirmTitle'), body: t('track.cancelConfirmBody'), confirmLabel: t('track.cancelYes'), danger: true });
  if (!ok) return;
  try {
    await api.transitionBooking(data.id, 'CANCELLED');
    toast(t('track.cancelled'), 'info');
    refreshNotifications();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (error) { toast(t(errorKey(error)), 'error'); }
});

register('cancel-request', async (data) => {
  const ok = await confirm({ title: t('track.cancelConfirmTitle'), body: t('track.cancelConfirmBody'), confirmLabel: t('track.cancelYes'), danger: true });
  if (!ok) return;
  try { await api.cancelRequest(data.id); toast(t('track.cancelled'), 'info'); window.dispatchEvent(new HashChangeEvent('hashchange')); }
  catch (error) { toast(t(errorKey(error)), 'error'); }
});

register('confirm-completion', async (data) => {
  try { await api.transitionBooking(data.id, 'COMPLETED'); toast(t('activity.tabCompleted') + ' ✓', 'success'); refreshNotifications(); window.dispatchEvent(new HashChangeEvent('hashchange')); }
  catch (error) { toast(t(errorKey(error)), 'error'); }
});

register('accept-offer', async (data, event, el) => {
  const ok = await confirm({ title: t('provider.yourQuote'), body: t('service.offersNote'), confirmLabel: t('common.confirm') });
  if (!ok) return;
  setBusy(el, true);
  try {
    const res = await api.acceptOffer(data.id);
    toast(t('booking.created'), 'success');
    refreshNotifications();
    navigate(`#/booking/${res.booking.id}`);
  } catch (error) { toast(t(errorKey(error)), 'error'); } finally { setBusy(el, false); }
});

register('transition-booking', async (data, event, el) => {
  setBusy(el, true);
  try {
    await api.transitionBooking(data.id, data.status);
    toast(t(`status.${data.status}`), 'success');
    refreshNotifications();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (error) { toast(t(errorKey(error)), 'error'); } finally { setBusy(el, false); }
});

/* ======================= map actions ==================================== */
/* ======================= map actions ====================================
   Choosing the place services are booked for lives in the dedicated picker
   (see src/views/location.js): a full-height map with a centre pin, address
   search when a geocoding provider is configured, and manual area/district
   entry when it is not. The home preview links there rather than growing a
   second, weaker copy of the same flow. */

/* A booking keeps its own location. The map is the same session instance, shown
   in a sheet and moved to the booking's real coordinates — nothing is drawn from
   a template, and when no coordinates were shared there is no map to show. */
register('view-booking-map', async (data) => {
  let booking;
  try { booking = (await api.booking(data.id)).booking; } catch (error) { toast(errorKey(error), 'error'); return; }
  const request = booking.request || {};
  if (!Number.isFinite(request.latitude) || !Number.isFinite(request.longitude)) { toast(t('track.noExactLocation'), 'info'); return; }
  const label = [request.area, request.district].filter(Boolean).join(', ');
  const dialog = sheet({
    title: t('track.locationTitle'),
    subtitle: label,
    body: `<div class="map-slot map-slot--sheet"><div class="map-slot__host" data-role="booking-view-map"></div></div>`,
    onClose: () => detachMap()
  });
  const host = dialog.body.querySelector('[data-role="booking-view-map"]');
  const place = { lat: request.latitude, lng: request.longitude, label };
  const map = await attachMap(host, { center: { lat: place.lat, lng: place.lng } }).catch(() => null);
  if (!map) {
    host.dataset.state = 'unavailable';
    host.innerHTML = `<div class="map-unavailable"><p><b>${esc(t('map.unavailableTitle'))}</b></p><p>${esc(t('map.unavailableBody'))}</p></div>`;
    return;
  }
  focusPlace(place);
});
