/**
 * Multi-step booking flow: service → location → job/package → schedule →
 * review → confirmation. Supports both fixed-price listings and
 * offer-based requests, with server-side pricing validation on submit.
 */
import { api, ApiError, errorKey } from '../api.js';
import {
  esc, icon, t, money, toast, register, navigate, setBusy, observeReveals,
  serviceName, serviceBlurb, serviceMedia
} from '../ui.js';
import { getState, setState, serviceById } from '../store.js';
import { formatDate, formatTime, formatNumber } from '../i18n.js';
import {
  attachMap, formatCoordinates, mapCapability, readPlace, requestDeviceLocation, savePlace, setPickMode
} from '../map.js';
import { refreshNotifications } from './auth.js';

const STEPS = ['service', 'details', 'time', 'review'];
const flow = {
  step: 0,
  serviceId: '',
  listingId: '',
  addOnIds: [],
  description: '',
  district: '',
  area: '',
  address: '',
  latitude: null,
  longitude: null,
  mapConfigured: null,
  saveAddress: false,
  urgency: 'NORMAL',
  mode: 'immediate',
  date: '',
  time: '10:00',
  notes: '',
  promoCode: '',
  discount: 0,
  forceOffers: false,
  properties: [],
  loading: true
};

function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function resetFlow() {
  flow.step = 0; flow.listingId = ''; flow.addOnIds = []; flow.description = '';
  flow.address = ''; flow.saveAddress = false; flow.urgency = 'NORMAL'; flow.mode = 'immediate';
  flow.date = todayISO(0); flow.time = '10:00'; flow.notes = ''; flow.promoCode = ''; flow.discount = 0;
  flow.forceOffers = false;
}

const el = () => document.getElementById('booking-root');

async function init(params, query) {
  const state = getState();
  const user = state.user;
  resetFlow();
  flow.serviceId = params.serviceId && params.serviceId !== 'any' ? params.serviceId : '';
  flow.listingId = query.listing || '';
  flow.forceOffers = query.mode === 'offers';
  flow.district = (user && user.district) || 'Dhaka';
  flow.area = (user && user.area) || '';
  /* The place chosen on the map home is this booking's service address unless
     the customer changes it here, so switching between map and list never
     loses the location they picked. */
  const savedPlace = readPlace();
  if (savedPlace && Number.isFinite(savedPlace.lat)) {
    flow.latitude = savedPlace.lat;
    flow.longitude = savedPlace.lng;
    if (savedPlace.area) flow.area = savedPlace.area;
    if (savedPlace.district) flow.district = savedPlace.district;
    if (!flow.address && savedPlace.label && savedPlace.source !== 'device') flow.address = savedPlace.label;
  }
  try { flow.mapConfigured = (await mapCapability()).configured; } catch { flow.mapConfigured = false; }
  if (flow.listingId && flow.serviceId) flow.step = 1;
  if (!state.services.length) { try { setState({ services: (await api.services()).services || [] }); } catch { /* ignore */ } }
  if (user) {
    try { flow.properties = (await api.properties()).properties || []; } catch { flow.properties = []; }
  }
  flow.loading = false;
  render();
}

function serviceChoices() {
  const state = getState();
  return state.services.map((s) => `
    <button class="choice-card" data-action="flow-service" data-id="${esc(s.id)}" aria-pressed="${flow.serviceId === s.id}">
      <div class="icon-badge">${icon(s.icon || 'Settings')}</div>
      <span class="grow"><b>${esc(serviceName(s))}</b><p class="muted small">${esc(serviceBlurb(s))}</p></span>
      ${flow.serviceId === s.id ? icon('Check') : ''}
    </button>`).join('');
}

async function listingsFor(serviceId) {
  if (!serviceId) return [];
  try {
    const res = await api.providers({ service: serviceId });
    return (res.providers || []).flatMap((p) => (p.listings || []).map((l) => ({ ...l, providerName: p.name, providerId: p.id })));
  } catch { return []; }
}

function stepService() {
  return `
    <p class="stepper-label">${esc(t('booking.chooseService'))}</p>
    <div class="stack-sm">${serviceChoices()}</div>
    <div class="row" style="margin-top:20px;justify-content:flex-end">
      <button class="btn lg" data-action="flow-next" ${flow.serviceId ? '' : 'disabled'}>${esc(t('booking.next'))}${icon('Arrow_Right_SM')}</button>
    </div>`;
}

async function stepDetails() {
  const saved = flow.properties.length ? `
    <div class="field">
      <label>${esc(t('account.addresses'))}</label>
      <div class="pill-choices">
        ${flow.properties.map((p) => `<button type="button" class="choice" data-action="flow-address" data-id="${esc(p.id)}" aria-pressed="${flow.area === p.area && flow.address === (p.address || '')}">${icon('Map_Pin')}<span>${esc(p.label)} · ${esc(p.area)}</span></button>`).join('')}
      </div>
    </div>` : '';

  const listings = await listingsFor(flow.serviceId);
  const selectedListing = listings.find((l) => l.id === flow.listingId);
  const packageBlock = (!flow.forceOffers && listings.length) ? `
    <div class="field">
      <label>${esc(t('booking.package'))}</label>
      <div class="stack-sm">
        ${listings.map((l) => `<button type="button" class="choice-card" data-action="flow-listing" data-id="${esc(l.id)}" aria-pressed="${flow.listingId === l.id}">
          <span class="grow"><b>${esc(l.title)}</b>
            <p class="muted small">${esc(l.providerName)} · ${l.pricePaisa != null ? esc(money(l.pricePaisa)) : esc(t('booking.quoteModel'))}</p></span>
          ${flow.listingId === l.id ? icon('Check') : ''}
        </button>`).join('')}
        <button type="button" class="choice-card" data-action="flow-listing" data-id="" aria-pressed="${!flow.listingId}">
          <span class="grow"><b>${esc(t('service.requestOffers'))}</b><p class="muted small">${esc(t('booking.quoteModelNote'))}</p></span>
          ${!flow.listingId ? icon('Check') : ''}
        </button>
      </div>
    </div>` : '';

  const addOnBlock = selectedListing && (selectedListing.addOns || []).length ? `
    <div class="field"><label>${esc(t('booking.addOns'))}</label>
      <div class="pill-choices">${selectedListing.addOns.map((a) => `<button type="button" class="choice" data-action="flow-addon" data-id="${esc(a.id)}" aria-pressed="${flow.addOnIds.includes(a.id)}">${esc(a.title)} · ${esc(money(a.pricePaisa))}</button>`).join('')}</div>
    </div>` : '';

  return `
    <div class="stack">
      ${packageBlock}
      ${addOnBlock}
      <div class="field"><label for="flow-desc">${esc(t('booking.describe'))}</label>
        <textarea id="flow-desc" data-field="description" minlength="12" placeholder="${esc(t('booking.describePh'))}">${esc(flow.description)}</textarea>
        <span class="hint">${esc(t('booking.describeMin'))}</span></div>
      ${saved}
      <div class="form-row two">
        <div class="field"><label for="flow-district">${esc(t('booking.district'))}</label>
          <input id="flow-district" data-field="district" value="${esc(flow.district)}" /></div>
        <div class="field"><label for="flow-area">${esc(t('booking.area'))}</label>
          <input id="flow-area" data-field="area" value="${esc(flow.area)}" placeholder="Dhanmondi" /></div>
      </div>
      <div class="field"><label for="flow-address">${esc(t('booking.address'))}</label>
        <input id="flow-address" data-field="address" value="${esc(flow.address)}" placeholder="${esc(t('booking.addressPh'))}" /></div>
      <div class="row-between" style="gap:12px">
        <label class="row" style="gap:10px"><input type="checkbox" data-field="saveAddress" ${flow.saveAddress ? 'checked' : ''} style="width:20px;height:20px" /> <span>${esc(t('booking.saveAddress'))}</span></label>
        <button type="button" class="btn ghost sm" data-action="flow-geolocate">${icon('Navigation')}${esc(t('map.useMyLocation'))}</button>
      </div>
      ${flow.mapConfigured ? `
        <div class="map-slot">
          <div class="map-slot__host" data-role="booking-map" data-state="${flow.latitude ? 'placed' : 'empty'}"></div>
          <button type="button" class="btn secondary sm map-slot__action" data-action="flow-pick">${icon('Map_Pin')}${esc(t('map.pinMode'))}</button>
        </div>
        <p class="muted small" style="display:flex;gap:6px;align-items:flex-start">
          ${icon(flow.latitude ? 'Circle_Check' : 'Info')}
          <span>${flow.latitude
            ? `${esc(t('map.pinPicked'))} · ${esc(formatCoordinates(flow.latitude, flow.longitude))}`
            : esc(t('map.pinHint'))}</span>
        </p>` : `
        <div class="notice">
          ${icon('Map_Pin')}
          <span><b>${esc(t('map.unavailableTitle'))}</b><br />${esc(t('map.unavailableBody'))}</span>
        </div>`}
      <div class="field"><label>${esc(t('booking.urgency'))}</label>
        <div class="pill-choices">
          <button type="button" class="choice" data-action="flow-urgency" data-value="NORMAL" aria-pressed="${flow.urgency === 'NORMAL'}">${icon('Clock')}${esc(t('booking.urgencyNormal'))}</button>
          <button type="button" class="choice" data-action="flow-urgency" data-value="URGENT" aria-pressed="${flow.urgency === 'URGENT'}">${icon('Alarm')}${esc(t('booking.urgencyUrgent'))}</button>
        </div></div>
      <div class="row" style="justify-content:space-between;margin-top:8px">
        <button class="btn ghost" data-action="flow-back">${icon('Arrow_Left_MD')}${esc(t('booking.back'))}</button>
        <button class="btn lg" data-action="flow-next">${esc(t('booking.next'))}${icon('Arrow_Right_SM')}</button>
      </div>
    </div>`;
}

function stepTime() {
  return `
    <div class="stack">
      <div class="field"><label>${esc(t('booking.when'))}</label>
        <div class="pill-choices">
          <button type="button" class="choice" data-action="flow-mode" data-value="immediate" aria-pressed="${flow.mode === 'immediate'}">${icon('Alarm')}${esc(t('booking.modeImmediate'))}</button>
          <button type="button" class="choice" data-action="flow-mode" data-value="scheduled" aria-pressed="${flow.mode === 'scheduled'}">${icon('Calendar')}${esc(t('booking.modeScheduled'))}</button>
        </div></div>
      ${flow.mode === 'scheduled' ? `
        <div class="form-row two">
          <div class="field"><label for="flow-date">${esc(t('booking.date'))}</label>
            <input id="flow-date" type="date" data-field="date" min="${todayISO(0)}" value="${esc(flow.date)}" /></div>
          <div class="field"><label for="flow-time">${esc(t('booking.time'))}</label>
            <input id="flow-time" type="time" data-field="time" value="${esc(flow.time)}" /></div>
        </div>` : ''}
      <div class="field"><label for="flow-notes">${esc(t('booking.notes'))}</label>
        <input id="flow-notes" data-field="notes" value="${esc(flow.notes)}" /></div>
      <div class="row" style="justify-content:space-between;margin-top:8px">
        <button class="btn ghost" data-action="flow-back">${icon('Arrow_Left_MD')}${esc(t('booking.back'))}</button>
        <button class="btn lg" data-action="flow-next">${esc(t('booking.next'))}${icon('Arrow_Right_SM')}</button>
      </div>
    </div>`;
}

/* The platform fee shown to the customer comes from the live backend settings,
   so the quote on the review step always equals what the server charges. */
let feeModelCache = null;
async function feeModel() {
  const stored = getState().fees;
  if (stored) return stored;
  if (!feeModelCache) {
    feeModelCache = api.publicStats()
      .then((res) => (res.stats && res.stats.fees) || { feeType: 'fixed', feeValue: 0, commissionBps: 0 })
      .catch(() => ({ feeType: 'fixed', feeValue: 0, commissionBps: 0 }));
  }
  return feeModelCache;
}

function platformFee(quote, fees) {
  if (!fees) return 0;
  return fees.feeType === 'fixed' ? (fees.feeValue || 0) : Math.round(quote * (fees.feeValue || 0) / 10000);
}

async function pricingModel() {
  if (flow.listingId) {
    try {
      const listings = await listingsFor(flow.serviceId);
      const listing = listings.find((l) => l.id === flow.listingId);
      if (!listing) return null;
      const addOns = (listing.addOns || []).filter((a) => flow.addOnIds.includes(a.id));
      const quote = (listing.pricePaisa || 0) + addOns.reduce((sum, a) => sum + a.pricePaisa, 0);
      const fees = await feeModel();
      return { kind: 'listing', listing, quote, addOns, fee: platformFee(quote, fees), fees };
    } catch { return null; }
  }
  return { kind: 'request', quote: null, addOns: [], fee: 0 };
}

async function reviewBlock() {
  const service = serviceById(flow.serviceId);
  const model = await pricingModel();
  const subtotal = model && model.quote != null ? model.quote : null;
  const fee = model && model.kind === 'listing' ? (model.fee || 0) : 0;
  const total = subtotal != null ? subtotal + fee - flow.discount : null;

  return `
    <div class="stack">
      <div class="card flat">
        <div class="row-between"><span class="muted small">${esc(t('service.overview'))}</span><b>${esc(serviceName(service) || flow.serviceId)}</b></div>
        <hr class="divider" />
        <div class="row-between"><span class="muted small">${esc(t('booking.describe'))}</span><b style="max-width:60%;text-align:right">${esc(flow.description)}</b></div>
        <hr class="divider" />
        <div class="row-between"><span class="muted small">${esc(t('booking.address'))}</span><b style="text-align:right">${esc([flow.address, flow.area, flow.district].filter(Boolean).join(', '))}</b></div>
        ${flow.latitude ? `<hr class="divider" />
        <div class="row-between"><span class="muted small">${esc(t('map.coordinates'))}</span><b class="num" style="text-align:right">${esc(formatCoordinates(flow.latitude, flow.longitude))}</b></div>` : ''}
        <hr class="divider" />
        <div class="row-between"><span class="muted small">${esc(t('booking.when'))}</span><b>${flow.mode === 'immediate' ? esc(t('booking.modeImmediate')) : `${esc(formatDate(flow.date))} · ${esc(formatTime(`2000-01-01T${flow.time}`))}`}</b></div>
      </div>

      ${model && model.kind === 'listing' ? `
        <div class="breakdown">
          <div class="row-between"><span>${esc(t('booking.serviceFee'))}</span><b>${esc(money(model.listing.pricePaisa || 0))}</b></div>
          ${model.addOns.map((a) => `<div class="row-between"><span>${esc(a.title)}</span><b>${esc(money(a.pricePaisa))}</b></div>`).join('')}
          ${fee ? `<div class="row-between"><span>${esc(t('booking.platformFee'))}</span><b>${esc(money(fee))}</b></div>` : ''}
          ${flow.discount ? `<div class="row-between"><span>${esc(t('booking.discount'))}</span><b>−${esc(money(flow.discount))}</b></div>` : ''}
          <div class="row-between total"><span>${esc(t('booking.total'))}</span><b>${esc(money(total))}</b></div>
        </div>
        ${model.fees && model.fees.commissionBps ? `<p class="muted tiny">${esc(t('booking.feeNote', { rate: formatNumber(model.fees.commissionBps / 100) }))}</p>` : ''}
        <div class="row" style="gap:8px">
          <input class="input" data-field="promoCode" placeholder="${esc(t('booking.promoPh'))}" value="${esc(flow.promoCode)}" style="flex:1" />
          <button type="button" class="btn secondary" data-action="flow-promo">${esc(t('booking.applyPromo'))}</button>
        </div>`
        : `<div class="notice">${icon('Info')}<span>${esc(t('booking.quoteModelNote'))}</span></div>`}

      <label class="row" style="gap:10px;align-items:flex-start">
        <input type="checkbox" data-field="terms" style="width:20px;height:20px;margin-top:3px" />
        <span class="small">${esc(t('booking.terms'))}</span>
      </label>

      <div class="row" style="justify-content:space-between;margin-top:8px">
        <button class="btn ghost" data-action="flow-back">${icon('Arrow_Left_MD')}${esc(t('booking.back'))}</button>
        <button class="btn lg" data-action="flow-submit">${icon('Check')}${esc(t('booking.confirm'))}</button>
      </div>
    </div>`;
}

function progress() {
  const labels = ['booking.stepService', 'booking.stepDetails', 'booking.stepTime', 'booking.stepReview'];
  return `
    <div class="progress-steps">${STEPS.map((_, i) => `<span class="ps ${i < flow.step ? 'done' : i === flow.step ? 'now' : ''}"></span>`).join('')}</div>
    <p class="stepper-label">${esc(t('booking.step', { n: formatNumber(flow.step + 1), total: formatNumber(STEPS.length) }))} · ${esc(t(labels[flow.step]))}</p>`;
}

async function render() {
  const root = el();
  if (!root) return;
  const state = getState();
  const header = `
    <div class="page-head">
      <div><a class="btn ghost sm" href="#/explore">${icon('Arrow_Left_MD')}${esc(t('common.back'))}</a>
        <h1 style="margin-top:8px">${esc(t('booking.title'))}</h1></div>
    </div>
    ${progress()}`;

  let content = '';
  if (flow.loading) content = `<div class="card">${['w80', 'w60', 'w40'].map((w) => `<div class="sk line ${w}"></div>`).join('')}</div>`;
  else if (flow.step === 0) content = `<div class="card">${stepService()}</div>`;
  else if (flow.step === 1) content = `<div class="card">${await stepDetails()}</div>`;
  else if (flow.step === 2) content = `<div class="card">${stepTime()}</div>`;
  else content = `<div class="card">${await reviewBlock()}</div>`;

  root.innerHTML = header + content;
  observeReveals(root);
  root.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('input', () => { flow[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.value; });
    input.addEventListener('change', () => { flow[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.value; });
  });
  mountBookingMap();
}

/* The address step shows the same single MapLibre instance the map home uses:
   one WebGL context for the whole session, re-parented into the wizard. */
function applyBookingPick(coords) {
  flow.latitude = coords.lat;
  flow.longitude = coords.lng;
  // The chosen point becomes the session's service location, so the map home
  // and the app bar agree with what the wizard will send to the server.
  savePlace({ lat: coords.lat, lng: coords.lng, area: flow.area, district: flow.district, source: 'pin' });
  toast(`${t('map.pinPicked')} — ${formatCoordinates(coords.lat, coords.lng)}`, 'success');
  render();
}

async function mountBookingMap() {
  const host = document.querySelector('[data-role="booking-map"]');
  if (!host || !flow.mapConfigured) return;
  const map = await attachMap(host, {}).catch(() => null);
  if (!map) { host.dataset.state = 'unavailable'; return; }
  setPickMode(true, applyBookingPick);
}

function syncFields() {
  document.querySelectorAll('#booking-root [data-field]').forEach((input) => {
    flow[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.value;
  });
}

function confirmScreen(booking, mode) {
  const root = el();
  root.innerHTML = `
    <div class="card" style="text-align:center;padding:40px 24px">
      <img src="./assets/illustrations/success.svg" alt="" style="width:min(100%,320px);margin:0 auto 10px" />
      <h1>${esc(t('booking.doneTitle'))}</h1>
      <p class="muted" style="margin:10px auto 18px;max-width:44ch">${esc(mode === 'request' ? t('booking.createdOffer') : t('booking.doneBody'))}</p>
      <div class="row" style="justify-content:center">
        ${booking ? `<a class="btn lg" href="#/booking/${esc(booking.id)}">${esc(t('booking.viewBooking'))}</a>` : ''}
        <a class="btn secondary lg" href="#/activity">${esc(t('activity.title'))}</a>
      </div>
    </div>`;
}

export async function bookingView(params, query = {}) {
  const state = getState();
  const body = `<div id="booking-root"><div class="card"><div class="sk line w60"></div></div></div>`;
  return {
    body,
    chrome: state.user ? 'app' : 'public',
    active: 'explore',
    after: () => { init(params, query); }
  };
}

/* ---------- registrations ------------------------------------------------ */
register('flow-service', (data) => { flow.serviceId = data.id; flow.listingId = ''; flow.addOnIds = []; render(); });
register('flow-listing', (data) => { flow.listingId = data.id || ''; flow.addOnIds = []; render(); });
register('flow-addon', (data) => {
  flow.addOnIds = flow.addOnIds.includes(data.id) ? flow.addOnIds.filter((x) => x !== data.id) : [...flow.addOnIds, data.id];
  render();
});
register('flow-urgency', (data) => { flow.urgency = data.value; render(); });
register('flow-mode', (data) => { flow.mode = data.value; render(); });
register('flow-address', (data) => {
  const property = flow.properties.find((p) => p.id === data.id);
  if (!property) return;
  flow.district = property.district || flow.district;
  flow.area = property.area || '';
  flow.address = property.address || '';
  render();
});
register('flow-back', () => { syncFields(); flow.step = Math.max(0, flow.step - 1); render(); });
register('flow-next', () => {
  syncFields();
  if (flow.step === 0 && !flow.serviceId) { toast(t('booking.chooseService'), 'error'); return; }
  if (flow.step === 1) {
    if (String(flow.description || '').trim().length < 12) { toast(t('booking.describeMin'), 'error'); return; }
    if (!flow.district || !flow.area) { toast(t('booking.errFields'), 'error'); return; }
  }
  if (flow.step === 2 && flow.mode === 'scheduled' && !flow.date) { toast(t('booking.errFields'), 'error'); return; }
  flow.step = Math.min(STEPS.length - 1, flow.step + 1);
  render();
});

register('flow-geolocate', async (data, event, el) => {
  const button = el || document.querySelector('[data-action="flow-geolocate"]');
  setBusy(button, true);
  toast(t('map.locating'), 'info');
  try {
    const position = await requestDeviceLocation();
    flow.latitude = position.lat;
    flow.longitude = position.lng;
    savePlace({ lat: position.lat, lng: position.lng, label: t('map.currentLocation'), area: flow.area, district: flow.district, source: 'device' });
    toast(t('map.found'), 'success');
    render();
  } catch (error) {
    toast(t(`map.err.${error.code || 'unavailable'}`), 'error');
  } finally { setBusy(button, false); }
});

register('flow-pick', () => {
  setPickMode(true, applyBookingPick);
  toast(t('map.pinHint'), 'info');
});

register('flow-promo', async () => {
  syncFields();
  const code = String(flow.promoCode || '').trim();
  if (!code) return;
  const model = await pricingModel();
  if (!model || model.quote == null) return;
  try {
    const res = await api.validatePromotion(code, model.quote / 100);
    flow.discount = res.discountPaisa || 0;
    toast(t('booking.promoOk'), 'success');
  } catch { flow.discount = 0; toast(t('booking.promoBad'), 'error'); }
  render();
});

register('flow-submit', async (data, event, button) => {
  syncFields();
  const state = getState();
  if (!state.user) { toast(t('booking.loginFirst'), 'info'); navigate('#/'); return; }
  if (state.user.role !== 'CUSTOMER') { toast(t('booking.customerOnly'), 'error'); return; }
  if (!flow.terms) { toast(t('booking.termsRequired'), 'error'); return; }

  const scheduledAt = flow.mode === 'immediate' ? new Date().toISOString() : new Date(`${flow.date}T${flow.time || '10:00'}:00`).toISOString();
  setBusy(button, true, t('booking.confirming'));
  try {
    let booking = null;
    let mode = 'request';
    if (flow.saveAddress && flow.address) {
      await api.createProperty({ label: flow.address.slice(0, 40) || t('account.addressLabel'), kind: 'HOME', district: flow.district, area: flow.area, address: flow.address }).catch(() => {});
    }
    if (flow.listingId && !flow.forceOffers) {
      const res = await api.bookListing(flow.listingId, {
        description: flow.description, district: flow.district, area: flow.area,
        date: scheduledAt, immediate: flow.mode === 'immediate', addOnIds: flow.addOnIds,
        latitude: flow.latitude ?? null, longitude: flow.longitude ?? null
      });
      booking = res.booking; mode = 'listing';
    } else {
      const res = await api.createRequest({
        service: flow.serviceId, description: flow.description, district: flow.district,
        area: flow.area, date: scheduledAt, urgency: flow.urgency,
        latitude: flow.latitude ?? null, longitude: flow.longitude ?? null
      });
      booking = res.request;
    }
    toast(t('booking.created'), 'success');
    refreshNotifications();
    confirmScreen(booking, mode);
  } catch (error) {
    toast(error instanceof ApiError ? t(errorKey(error)) : t('booking.errFailed'), 'error');
    setBusy(button, false);
  }
});
