/**
 * Provider (service professional) experience: work dashboard, incoming
 * requests and offers, schedule, earnings and withdrawals, and service
 * package management. All operations are persisted server-side.
 */
import { api, ApiError, errorKey } from '../api.js';
import {
  esc, icon, t, money, toast, sheet, closeSheet, setBusy, observeReveals,
  emptyState, avatar, register, navigate, statusTag, stars, serviceName
} from '../ui.js';
import { getState, setState, serviceById } from '../store.js';
import { formatDate, formatDateTime, formatTime, formatNumber, relativeDay } from '../i18n.js';
import { refreshNotifications } from './auth.js';
import { isOpen } from './customer.js';

/* The commission rate is whatever the admin has configured, fetched at boot,
   never a constant in the UI. */
function fees() { return getState().fees || { commissionBps: 0, feeType: 'fixed', feeValue: 0 }; }
const netOf = (paisa, commissionBps = 0) => Math.round(paisa * (10000 - commissionBps) / 10000);
const commissionRate = () => fees().commissionBps / 100;

function requireWorker() {
  const user = getState().user;
  if (!user) return '#/';
  if (user.role !== 'WORKER') return user.role === 'ADMIN' ? '#/admin' : '#/home';
  return null;
}

function customerName(booking) {
  return (booking.customer && booking.customer.name) || t('common.unknown');
}

/* Offer states are mapped explicitly so the translation keys stay static and
   checkable — never build a key by concatenation at render time. */
const OFFER_STATUS = { ACTIVE: 'status.OPEN', ACCEPTED: 'status.CONFIRMED', REJECTED: 'status.CANCELLED' };
const OFFER_TAG = { ACTIVE: 'open', ACCEPTED: 'done', REJECTED: 'cancelled' };

/* ======================= work dashboard ================================= */
export async function workView() {
  const redirect = requireWorker();
  if (redirect) return { redirect };
  const user = getState().user;
  const [bookings, requests, earnings] = await Promise.all([
    api.bookings().then((r) => r.bookings || []).catch(() => []),
    api.requests().then((r) => r.requests || []).catch(() => []),
    api.earnings().catch(() => null)
  ]);

  const activeJobs = bookings.filter((b) => isOpen(b.status));
  const today = new Date().toISOString().slice(0, 10);
  const todays = activeJobs.filter((b) => (b.request || {}).date && String((b.request || {}).date).slice(0, 10) === today);

  const body = `
    <div class="stack-lg">
      <div class="page-head">
        <div>
          <p class="eyebrow">${esc(t('provider.title'))}</p>
          <h1>${esc(user.name)}</h1>
          <div class="row wrap" style="gap:10px;margin-top:6px">
            ${user.verified ? `<span class="tag done">${icon('Shield_Check')}${esc(t('account.verifiedBadge'))}</span>` : `<span class="tag draft">${esc(t('account.unverifiedBadge'))}</span>`}
            ${stars(user.rating)}
          </div>
        </div>
        <div class="card flat" style="min-width:220px">
          <div class="row-between">
            <div><b>${esc(t('account.availability'))}</b><p class="muted small">${esc(t('account.availabilityNote'))}</p></div>
            <input type="checkbox" class="switch" data-action="toggle-availability" ${user.available ? 'checked' : ''} aria-label="${esc(t('account.availability'))}" />
          </div>
        </div>
      </div>

      <section class="grid grid-3">
        ${[
          { ic: 'Suitcase', v: activeJobs.length, l: t('provider.myJobs'), href: '#/schedule' },
          { ic: 'Bell_Notification', v: requests.length, l: t('provider.openRequests'), href: '#/requests' },
          { ic: 'Credit_Card_01', v: earnings ? money(earnings.availablePaisa) : '—', l: t('provider.earningsAvailable'), href: '#/earnings' }
        ].map((c) => `<a class="card reveal" href="${c.href}" style="text-decoration:none">
          <div class="icon-badge teal" style="margin-bottom:10px">${icon(c.ic)}</div>
          <div class="h2 num">${c.v}</div>
          <div class="muted small">${esc(c.l)}</div>
        </a>`).join('')}
      </section>

      <section class="reveal">
        <div class="section-head"><h2>${esc(t('provider.todayTitle'))}</h2><a class="btn ghost sm" href="#/schedule">${esc(t('common.seeAll'))}</a></div>
        ${todays.length ? `<div class="card">${todays.map(jobRow).join('')}</div>`
          : emptyState({ art: 'assets/illustrations/empty-bookings.svg', title: t('provider.noJobs'), body: t('provider.noRequestsBody') })}
      </section>

      <section class="reveal">
        <div class="section-head"><h2>${esc(t('provider.myJobs'))}</h2></div>
        ${activeJobs.length ? `<div class="card">${activeJobs.map(jobRow).join('')}</div>`
          : emptyState({ art: 'assets/illustrations/empty-bookings.svg', title: t('provider.noJobs') })}
      </section>

      <section class="reveal">
        <div class="section-head"><h2>${esc(t('provider.openRequests'))}</h2><a class="btn ghost sm" href="#/requests">${esc(t('common.seeAll'))}</a></div>
        ${requests.length ? `<div class="card">${requests.slice(0, 4).map(requestRow).join('')}</div>`
          : emptyState({ art: 'assets/illustrations/empty-providers.svg', title: t('provider.noRequests'), body: t('provider.noRequestsBody') })}
      </section>
    </div>`;
  return { body, chrome: 'app', active: 'work', after: () => observeReveals() };
}

function jobRow(booking) {
  const request = booking.request || {};
  const service = serviceById(request.service);
  return `<div class="list-item">
    <div class="row" style="align-items:flex-start">
      <div class="icon-badge ink">${icon((service && service.icon) || 'Settings')}</div>
      <div><b>${esc(serviceName(service) || request.service)}</b>
        <p class="muted small clamp-2">${esc(request.description)}</p>
        <p class="muted small">${esc(customerName(booking))} · ${esc(relativeDay(request.date))} ${esc(request.date ? formatTime(request.date) : '')}</p>
        <p class="muted small">${esc(t('provider.offerPreview'))}: <b>${esc(money(netOf((booking.pricing || {}).quote || 0, fees().commissionBps)))}</b></p>
      </div>
    </div>
    <div style="text-align:right;display:flex;flex-direction:column;gap:8px;align-items:flex-end">
      ${statusTag(booking.status)}
      <button class="btn sm" data-action="open-booking-detail" data-id="${esc(booking.id)}">${esc(t('activity.track'))}</button>
    </div>
  </div>`;
}

function requestRow(request) {
  const service = serviceById(request.service);
  return `<div class="list-item" data-request="${esc(request.id)}">
    <div class="row" style="align-items:flex-start">
      <div class="icon-badge">${icon((service && service.icon) || 'Settings')}</div>
      <div><b>${esc(serviceName(service) || request.service)}</b>
        <p class="muted small clamp-2">${esc(request.description)}</p>
        <p class="muted small">${esc([request.area, request.district].filter(Boolean).join(', '))} · ${esc(relativeDay(request.date))}</p>
      </div>
    </div>
    <button class="btn sm" data-action="open-offer" data-id="${esc(request.id)}" data-service="${esc(request.service)}">${esc(t('provider.sendOffer'))}</button>
  </div>`;
}

/* ======================= requests ====================================== */
export async function requestsView() {
  const redirect = requireWorker();
  if (redirect) return { redirect };
  const user = getState().user;
  const [requests, myOffers] = await Promise.all([
    api.requests().then((r) => r.requests || []).catch(() => []),
    api.myOffers().then((r) => r.offers || []).catch(() => [])
  ]);
  const offered = new Set(myOffers.map((o) => o.requestId));

  const body = `
    <div class="stack-lg">
      <div class="page-head"><div><h1>${esc(t('provider.openRequests'))}</h1>
        <p class="muted">${esc(t('provider.openRequestsBody'))}</p></div></div>

      ${!user.available ? `<div class="notice">${icon('Info')}<span>${esc(t('account.availabilityNote'))}</span></div>` : ''}

      <section>
        ${requests.length ? `<div class="card">${requests.map((r) => offered.has(r.id)
          ? `<div class="list-item"><div class="row" style="align-items:flex-start">
               <div class="icon-badge ink">${icon('Check')}</div>
               <div><b>${esc(serviceName(serviceById(r.service)) || r.service)}</b>
                 <p class="muted small">${esc(r.description)}</p>
                 <span class="tag done">${esc(t('provider.offerSent'))}</span></div>
             </div></div>`
          : requestRow(r)).join('')}</div>`
          : emptyState({ art: 'assets/illustrations/empty-providers.svg', title: t('provider.noRequests'), body: t('provider.noRequestsBody') })}
      </section>

      <section>
        <div class="section-head"><h2>${esc(t('provider.sendOffer'))}</h2></div>
        ${myOffers.length ? `<div class="card">${myOffers.map((o) => {
          const r = o.request || {};
          const service = serviceById(r.service);
          return `<div class="list-item">
            <div><b>${esc(serviceName(service) || r.service)}</b>
              <p class="muted small clamp-2">${esc(r.description || '')}</p>
              <p class="muted small">${esc(formatDate(r.date))}</p></div>
            <div style="text-align:right">
              <div class="h3 num">${esc(money(o.price))}</div>
              <span class="tag ${OFFER_TAG[o.status] || 'open'}">${esc(t(OFFER_STATUS[o.status] || 'status.OPEN'))}</span>
            </div>
          </div>`;
        }).join('')}</div>` : emptyState({ art: 'assets/illustrations/empty-messages.svg', title: t('provider.noRequests') })}
      </section>
    </div>`;
  return { body, chrome: 'app', active: 'requests', after: () => observeReveals() };
}

function offerSheet(requestId, serviceId) {
  const service = serviceById(serviceId);
  const dialog = sheet({
    title: t('provider.sendOffer'),
    subtitle: serviceName(service) || serviceId,
    body: `<form data-role="offer-form">
      <div class="field"><label for="o-price">${esc(t('provider.yourQuote'))}</label>
        <input id="o-price" name="price" type="number" min="1" step="any" required placeholder="2500" />
        <span class="hint" data-role="net-hint"></span></div>
      <div class="field"><label for="o-eta">${esc(t('provider.eta'))}</label>
        <input id="o-eta" name="eta" placeholder="${esc(t('provider.etaPh'))}" /></div>
      <div class="field"><label for="o-message">${esc(t('provider.offerMessage'))}</label>
        <textarea id="o-message" name="message" maxlength="1000" placeholder="${esc(t('provider.offerMessagePh'))}"></textarea></div>
      <button class="btn block lg" type="submit" style="margin-top:16px">${esc(t('provider.sendOffer'))}</button>
    </form>`
  });
  const form = dialog.body.querySelector('[data-role="offer-form"]');
  const hint = form.querySelector('[data-role="net-hint"]');
  const price = form.querySelector('#o-price');
  price.addEventListener('input', () => {
    const value = Number(price.value || 0);
    hint.textContent = value > 0 ? `${t('provider.offerPreview')}: ${money(netOf(Math.round(value * 100), fees().commissionBps))} · ${t('provider.commission')} ${formatNumber(commissionRate())}%` : '';
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form));
    const priceBdt = Number(data.price);
    if (!priceBdt || priceBdt < 1) { toast(t('booking.errFields'), 'error'); return; }
    setBusy(button, true);
    try {
      await api.submitOffer(requestId, { price: priceBdt, eta: data.eta, message: data.message });
      closeSheet();
      toast(t('provider.offerSent'), 'success');
      refreshNotifications();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error instanceof ApiError && error.status === 409 ? t('provider.offerExists') : t(errorKey(error)), 'error');
    } finally { setBusy(button, false); }
  });
}

/* ======================= schedule ====================================== */
export async function scheduleView() {
  const redirect = requireWorker();
  if (redirect) return { redirect };
  const bookings = await api.bookings().then((r) => r.bookings || []).catch(() => []);
  const scheduled = bookings
    .filter((b) => isOpen(b.status))
    .sort((a, b) => new Date((a.request || {}).date || 0) - new Date((b.request || {}).date || 0));

  const groups = new Map();
  for (const booking of scheduled) {
    const key = String(((booking.request || {}).date || '')).slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(booking);
  }

  const body = `
    <div class="stack-lg">
      <div class="page-head"><div><h1>${esc(t('nav.schedule'))}</h1><p class="muted">${esc(t('provider.myJobs'))}</p></div></div>
      ${groups.size ? Array.from(groups.entries()).map(([day, list]) => `
        <section class="reveal">
          <div class="section-head"><h2>${esc(relativeDay(day))}</h2><span class="muted small">${esc(formatDate(day))}</span></div>
          <div class="card">${list.map(jobRow).join('')}</div>
        </section>`).join('')
        : emptyState({ art: 'assets/illustrations/empty-bookings.svg', title: t('provider.noJobs'), body: t('provider.noRequestsBody'), action: `<a class="btn" href="#/requests">${esc(t('provider.openRequests'))}</a>` })}
    </div>`;
  return { body, chrome: 'app', active: 'schedule', after: () => observeReveals() };
}

/* ======================= earnings ====================================== */
export async function earningsView() {
  const redirect = requireWorker();
  if (redirect) return { redirect };
  let earnings = null;
  let payouts = [];
  try { earnings = await api.earnings(); } catch { earnings = null; }
  try { payouts = (await api.payouts()).payouts || []; } catch { payouts = []; }

  const body = `
    <div class="stack-lg">
      <div class="page-head"><div><h1>${esc(t('provider.earningsTitle'))}</h1><p class="muted">${esc(t('provider.commission'))}: ${esc(formatNumber(commissionRate()))}%</p></div></div>

      <section class="grid grid-3">
        ${[
          { v: earnings ? money(earnings.availablePaisa) : '—', l: t('provider.earningsAvailable'), ic: 'Credit_Card_02' },
          { v: earnings ? money(earnings.netPaisa) : '—', l: t('provider.earningsGross'), ic: 'Chart_Bar_Vertical_01' },
          { v: earnings ? money(earnings.paidPaisa) : '—', l: t('provider.earningsPaid'), ic: 'Credit_Card_02' }
        ].map((c) => `<div class="card reveal"><div class="icon-badge teal" style="margin-bottom:10px">${icon(c.ic)}</div>
          <div class="h2 num">${esc(c.v)}</div><div class="muted small">${esc(c.l)}</div></div>`).join('')}
      </section>

      <section class="card reveal">
        <div class="row-between">
          <div><b>${esc(t('provider.requestPayout'))}</b>
            <p class="muted small">${esc(t('provider.completedJobs'))}: ${esc(earnings ? earnings.completedJobs : 0)}</p></div>
          <button class="btn" data-action="open-payout" ${earnings && earnings.availablePaisa >= 100 ? '' : 'disabled'}>${icon('Credit_Card_01')}${esc(t('provider.requestPayout'))}</button>
        </div>
      </section>

      <section class="reveal">
        <div class="section-head"><h2>${esc(t('provider.payoutsTitle'))}</h2></div>
        ${payouts.length ? `<div class="card">${payouts.map((p) => `<div class="list-item">
          <div><b class="num">${esc(money(p.amount))}</b>
            <p class="muted small">${esc(formatDateTime(p.createdAt))}</p></div>
          <span class="tag ${p.status === 'PAID' ? 'done' : p.status === 'REJECTED' ? 'cancelled' : 'open'}">${esc(t(`status.${p.status === 'PAID' ? 'COMPLETED' : p.status === 'REJECTED' ? 'CANCELLED' : 'OPEN'}`))}</span>
        </div>`).join('')}</div>` : emptyState({ art: 'assets/illustrations/empty-bookings.svg', title: t('provider.noPayouts') })}
      </section>

      <section class="reveal">
        <div class="section-head"><h2>${esc(t('provider.completedJobs'))}</h2></div>
        ${earnings && earnings.jobs && earnings.jobs.length ? `<div class="card">${earnings.jobs.slice().reverse().map((b) => {
          const service = serviceById((b.request || {}).service);
          return `<div class="list-item"><div>
            <b>${esc(serviceName(service) || (b.requestId || ''))}</b>
            <p class="muted small">${esc(t('provider.offerPreview'))}: ${esc(money((b.pricing || {}).net || 0))}</p></div>
            <span class="tag done">${esc(t('status.COMPLETED'))}</span></div>`;
        }).join('')}</div>` : emptyState({ art: 'assets/illustrations/empty-bookings.svg', title: t('provider.noJobs') })}
      </section>
    </div>`;
  return { body, chrome: 'app', active: 'earnings', after: () => observeReveals() };
}

/* ======================= listings ====================================== */
export async function listingsView() {
  const redirect = requireWorker();
  if (redirect) return { redirect };
  const state = getState();
  const services = state.services.length ? state.services : await api.services().then((r) => { setState({ services: r.services || [] }); return r.services || []; }).catch(() => []);
  let listings = [];
  try { listings = (await api.listings()).listings || []; } catch { listings = []; }

  const body = `
    <div class="stack-lg">
      <div class="page-head">
        <div><h1>${esc(t('provider.listingsTitle'))}</h1><p class="muted">${esc(t('account.providerTitle'))}</p></div>
        <button class="btn" data-action="new-listing">${icon('Add_Plus')}${esc(t('provider.newListing'))}</button>
      </div>
      ${listings.length ? `<div class="grid grid-2">${listings.map((l) => {
        const service = serviceById(l.service);
        return `<article class="card reveal">
          <div class="row-between">
            <div class="row" style="gap:10px;align-items:flex-start">
              <div class="icon-badge">${icon((service && service.icon) || 'Settings')}</div>
              <div><b>${esc(l.title)}</b><p class="muted small">${esc(serviceName(service) || l.service)}</p></div>
            </div>
            <b class="h3 num">${l.pricePaisa != null ? esc(money(l.pricePaisa)) : esc(t('booking.quoteModel'))}</b>
          </div>
          ${l.description ? `<p class="muted small" style="margin-top:10px">${esc(l.description)}</p>` : ''}
          <div class="row-between" style="margin-top:14px">
            <span class="tag ${l.active ? 'done' : 'draft'}">${esc(t(l.active ? 'provider.active' : 'provider.paused'))}</span>
            <button class="btn ghost sm" data-action="toggle-listing" data-id="${esc(l.id)}" data-active="${l.active ? '1' : '0'}">${esc(t('admin.toggleActive'))}</button>
          </div>
        </article>`;
      }).join('')}</div>` : emptyState({ art: 'assets/illustrations/empty-providers.svg', title: t('provider.noListings'), action: `<button class="btn" data-action="new-listing">${esc(t('provider.newListing'))}</button>` })}
    </div>
    <div id="listing-root"></div>`;
  return { body, chrome: 'app', active: 'listings', after: () => observeReveals() };
}

function listingSheet() {
  const services = getState().services;
  const dialog = sheet({
    title: t('provider.newListing'),
    body: `<form data-role="listing-form">
      <div class="field"><label for="l-service">${esc(t('nav.services'))}</label>
        <select id="l-service" name="service" required>
          ${services.map((s) => `<option value="${esc(s.id)}">${esc(serviceName(s))}</option>`).join('')}
        </select></div>
      <div class="field"><label for="l-title">${esc(t('provider.listingTitle'))}</label>
        <input id="l-title" name="title" required maxlength="160" /></div>
      <div class="field"><label for="l-desc">${esc(t('provider.listingDesc'))}</label>
        <textarea id="l-desc" name="description" maxlength="2000"></textarea></div>
      <div class="form-row two">
        <div class="field"><label for="l-model">${esc(t('provider.pricingModel'))}</label>
          <select id="l-model" name="pricingModel">
            <option value="FIXED">${esc(t('provider.modelFixed'))}</option>
            <option value="QUOTE">${esc(t('provider.modelQuote'))}</option>
            <option value="CONSULTATION">${esc(t('provider.modelConsult'))}</option>
          </select></div>
        <div class="field"><label for="l-price">${esc(t('provider.price'))}</label>
          <input id="l-price" name="priceBdt" type="number" min="0" step="any" /></div>
      </div>
      <div class="field"><label for="l-duration">${esc(t('provider.duration'))}</label>
        <input id="l-duration" name="durationMinutes" type="number" min="15" step="15" value="60" /></div>
      <button class="btn block lg" type="submit" style="margin-top:16px">${esc(t('common.save'))}</button>
    </form>`
  });
  dialog.body.querySelector('[data-role="listing-form"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (data.pricingModel === 'QUOTE') data.priceBdt = undefined;
    setBusy(button, true);
    try {
      await api.createListing({
        service: data.service, title: data.title, description: data.description,
        pricingModel: data.pricingModel,
        priceBdt: data.priceBdt === undefined || data.priceBdt === '' ? undefined : Number(data.priceBdt),
        durationMinutes: Number(data.durationMinutes || 60)
      });
      closeSheet();
      toast(t('provider.listingCreated'), 'success');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) { toast(t(errorKey(error)), 'error'); } finally { setBusy(button, false); }
  });
}

function payoutSheet(availablePaisa) {
  const dialog = sheet({
    title: t('provider.requestPayout'),
    body: `<form data-role="payout-form">
      <div class="field"><label for="po-amount">${esc(t('provider.payoutAmount'))}</label>
        <input id="po-amount" name="amountBdt" type="number" min="1" max="${Math.floor(availablePaisa / 100)}" step="1" required />
        <span class="hint">${esc(t('provider.earningsAvailable'))}: ${esc(money(availablePaisa))}</span></div>
      <button class="btn block lg" type="submit" style="margin-top:16px">${esc(t('provider.requestPayout'))}</button>
    </form>`
  });
  dialog.body.querySelector('[data-role="payout-form"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(button, true);
    try {
      await api.requestPayout(Number(data.amountBdt));
      closeSheet();
      toast(t('provider.payoutRequested'), 'success');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error instanceof ApiError && error.status === 400 ? t('provider.payoutInvalid') : t(errorKey(error)), 'error');
    } finally { setBusy(button, false); }
  });
}

/* ======================= registrations ================================== */
register('open-offer', (data) => offerSheet(data.id, data.service));
register('new-listing', () => listingSheet());
register('open-payout', async () => {
  const earnings = await api.earnings().catch(() => null);
  if (!earnings || earnings.availablePaisa < 100) { toast(t('provider.payoutInvalid'), 'error'); return; }
  payoutSheet(earnings.availablePaisa);
});
register('toggle-listing', async (data, event, el) => {
  const active = data.active !== '1';
  setBusy(el, true);
  try {
    await api.updateListing(data.id, { active });
    toast(t(active ? 'provider.active' : 'provider.paused'), 'success');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (error) { toast(t(errorKey(error)), 'error'); } finally { setBusy(el, false); }
});
