/**
 * The dedicated location picker.
 *
 * One job: choose the place a service should happen. The map fills the screen,
 * a fixed centre pin names the point under it, and the coordinates handed back
 * are read from `map.getCenter()` rather than from a screen position — so what
 * the pin covers is exactly what is saved.
 *
 * Address search and reverse lookup need a real geocoding provider
 * (`MAP_GEOCODE_URL`, proxied by the server). When that is not configured the
 * screen says so plainly and keeps the manual path (the map plus typed area and
 * district) fully usable. It never invents a place name.
 */
import { api, ApiError } from '../api.js';
import {
  esc, icon, t, toast, setBusy, observeReveals, register, navigate
} from '../ui.js';
import { getState } from '../store.js';
import { onRouteChange } from '../router.js';
import {
  attachMap, detachMap, requestDeviceLocation, savePlace, readPlace,
  setCenterPinMode, setMapView, zoomBy, formatCoordinates, onMapStatus, mapCapability, clearPlace
} from '../map.js';

let unsubscribeStatus = null;
let unsubscribeRoute = null;
let geocodeReady = null;
let reverseTimer = null;
let resultRows = [];

/* The picker keeps its own draft until Confirm is pressed, so panning around
   never rewrites the place the rest of the app is using. */
let draft = null;
let decimals = { district: '', area: '', label: '' };

async function geocodingEnabled() {
  if (!geocodeReady) {
    geocodeReady = api.publicConfig()
      .then((res) => Boolean(res && res.config && res.config.geocoding && res.config.geocoding.enabled))
      .catch(() => false);
  }
  return geocodeReady;
}

const place = () => draft || readPlace() || null;

/* ---------- the view ------------------------------------------------------- */
export async function locationPickerView(params, query = {}) {
  const state = getState();
  if (!state.user) return { redirect: '#/' };
  const existing = readPlace();
  const center = existing || { lat: 23.7461, lng: 90.3742 };
  draft = existing ? { ...existing } : { lat: center.lat, lng: center.lng, label: '', district: state.user.district || '', area: state.user.area || '', source: 'pin' };
  decimals = { district: draft.district || '', area: draft.area || '', label: draft.label || '' };
  const capability = await mapCapability();
  const canSearch = capability.configured ? await geocodingEnabled() : false;
  const next = typeof query.next === 'string' && /^\/[A-Za-z0-9\-_/?=&%.]*$/.test(query.next) ? query.next : '/home';

  const body = `<div class="loc-picker">
    <div class="loc-picker__map" data-role="map-host" data-state="${capability.configured ? 'loading' : 'unavailable'}">
      <div class="loc-picker__top">
        <a class="btn secondary icon" href="#${esc(next)}" aria-label="${esc(t('a11y.close'))}">${icon('Arrow_Left_MD')}</a>
        <form class="grow row" data-role="geo-search" style="gap:8px;align-items:stretch">
          <div class="field grow" style="margin:0">
            <label class="sr-only" for="geo-q">${esc(t('picker.searchPh'))}</label>
            <input id="geo-q" name="q" type="search" placeholder="${esc(t('picker.searchPh'))}"
              ${canSearch ? '' : 'disabled'} aria-describedby="geo-search-note" />
          </div>
          <button class="btn" type="submit" ${canSearch ? '' : 'disabled'}>${icon('Search_Magnifying_Glass')}<span class="sr-only">${esc(t('picker.search'))}</span></button>
        </form>
      </div>
      <div class="loc-picker__zoom">
        <button class="btn secondary icon" data-action="picker-zoom-in" aria-label="${esc(t('map.zoomIn'))}">${icon('Add_Plus')}</button>
        <button class="btn secondary icon" data-action="picker-zoom-out" aria-label="${esc(t('map.zoomOut'))}">${icon('Remove_Minus')}</button>
        <button class="btn secondary icon" data-action="picker-locate" aria-label="${esc(t('map.useMyLocation'))}">${icon('Navigation')}</button>
      </div>
    </div>

    <div class="loc-picker__card">
      <div class="row-between" style="align-items:flex-start;gap:12px">
        <div class="grow">
          <b data-role="picker-label">${esc(place().label || t('map.locationUnknown'))}</b>
          <p class="muted small loc-picker__coords" data-role="picker-coords">${esc(formatCoordinates(place().lat, place().lng))}</p>
        </div>
        <span class="tag">${esc(t('picker.selected'))}</span>
      </div>
      <p class="muted tiny" id="geo-search-note" style="margin:10px 0 0" data-role="picker-note">${esc(canSearch ? t('picker.centerHint') : capability.configured ? t('picker.searchUnavailable') : t('picker.mapFailed'))}</p>

      <div class="loc-picker__results" data-role="geo-results" hidden></div>

      <hr class="divider" />

      <div class="form-row two">
        <div class="field"><label for="p-district">${esc(t('map.district'))}</label>
          <input id="p-district" name="district" value="${esc(decimals.district)}" /></div>
        <div class="field"><label for="p-area">${esc(t('map.area'))}</label>
          <input id="p-area" name="area" value="${esc(decimals.area)}" /></div>
      </div>
      <div class="field"><label for="p-label">${esc(t('map.manualTitle'))}</label>
        <input id="p-label" name="label" value="${esc(decimals.label)}" placeholder="${esc(t('picker.searchPh'))}" /></div>

      <div class="row" style="margin-top:16px;gap:10px">
        <button class="btn secondary" style="flex:1" data-action="picker-locate">${icon('Navigation')}${esc(t('map.useMyLocation'))}</button>
        <button class="btn" style="flex:1.3" data-action="picker-confirm" data-next="${esc(next)}">${icon('Check')}${esc(t('picker.useThis'))}</button>
      </div>
      <p class="muted tiny" style="margin:12px 0 0">${esc(t('map.privacy'))}</p>
    </div>
  </div>`;

  return {
    body,
    chrome: 'app',
    active: 'home',
    full: true,
    after: () => mount({ center: place(), capability, canSearch })
  };
}

/* ---------- behaviour ------------------------------------------------------ */
async function mount({ center, capability, canSearch }) {
  observeReveals();
  const host = document.querySelector('[data-role="map-host"]');
  const note = document.querySelector('[data-role="picker-note"]');

  /* One status subscription per mount: without this every visit would add
     another listener to the single shared map instance. */
  if (unsubscribeStatus) { unsubscribeStatus(); unsubscribeStatus = null; }
  unsubscribeStatus = onMapStatus((status) => {
    if (!host) return;
    if (status.state === 'ready') host.dataset.state = 'ready';
    else if (status.state === 'unconfigured' || status.state === 'library-error' || status.state === 'config-unreachable' || status.state === 'unavailable') {
      host.dataset.state = 'unavailable';
      if (note && !canSearch) note.textContent = t('picker.mapFailed');
    }
  });

  const form = document.querySelector('[data-role="geo-search"]');
  if (form) form.addEventListener('submit', onSearch);

  if (!capability.configured) return;

  const map = await attachMap(host, { center });
  if (!map) return;
  setCenterPinMode(true, (coords) => {
    draft = { ...(draft || {}), lat: coords.lat, lng: coords.lng };
    paintDraft();
    scheduleReverse(coords);
  });

  /* Typing into the manual fields is the fallback that always works, so the
     draft follows the inputs as well as the map. */
  ['district', 'area', 'label'].forEach((key) => {
    const input = document.querySelector(`#p-${key}`);
    if (!input) return;
    input.addEventListener('input', () => {
      decimals[key] = input.value;
      draft = { ...(draft || {}), [key]: input.value };
      if (key === 'label') paintDraft();
    });
  });
}

function paintDraft() {
  const current = place();
  if (!current) return;
  const label = document.querySelector('[data-role="picker-label"]');
  const coords = document.querySelector('[data-role="picker-coords"]');
  const districtInput = document.querySelector('#p-district');
  const areaInput = document.querySelector('#p-area');
  const labelInput = document.querySelector('#p-label');
  if (label && Number.isFinite(current.lat)) label.textContent = current.label || t('map.locationUnknown');
  if (coords && Number.isFinite(current.lat)) coords.textContent = formatCoordinates(current.lat, current.lng);
  if (districtInput && shouldSync(districtInput, current.district)) districtInput.value = current.district || '';
  if (areaInput && shouldSync(areaInput, current.area)) areaInput.value = current.area || '';
  if (labelInput && shouldSync(labelInput, current.label)) labelInput.value = current.label || '';
}

/* Only overwrite a field the person has not edited by hand. */
const shouldSync = (input, value) => document.activeElement !== input && input.value !== (value || '');

/** Reverse lookup, debounced, and only when a provider is configured. */
function scheduleReverse(coords) {
  if (reverseTimer) clearTimeout(reverseTimer);
  const note = document.querySelector('[data-role="picker-note"]');
  reverseTimer = setTimeout(async () => {
    const enabled = await geocodingEnabled();
    if (!enabled) {
      draft = { ...(draft || {}), ...coords, label: draft.label || '' };
      if (note) note.textContent = t('picker.searchUnavailable');
      return;
    }
    try {
      const res = await api.geoReverse(coords.lat, coords.lng);
      const result = res && res.result;
      if (!result) return;
      draft = { ...(draft || {}), ...coords, label: result.label || draft.label, area: result.area || draft.area, district: result.district || draft.district };
      paintDraft();
    } catch { /* keep the coordinates; the person can type the area */ }
  }, 650);
}

async function onSearch(event) {
  event.preventDefault();
  const input = event.currentTarget.querySelector('input[name="q"]');
  const q = String(input.value || '').trim();
  const results = document.querySelector('[data-role="geo-results"]');
  const note = document.querySelector('[data-role="picker-note"]');
  const button = event.currentTarget.querySelector('button[type="submit"]');
  if (!results) return;
  if (q.length < 3) { results.hidden = true; return; }
  setBusy(button, true, '');
  try {
    const res = await api.geoSearch(q);
    const rows = (res && res.results) || [];
    resultRows = rows;
    if (!rows.length) {
      results.hidden = false;
      results.innerHTML = `<p class="muted small">${esc(t('picker.searchEmpty'))}</p>`;
      return;
    }
    results.hidden = false;
    results.innerHTML = rows.map((row, index) => `<button type="button" class="list-item" style="width:100%;text-align:left" data-action="picker-result" data-index="${index}">
      <span class="row" style="align-items:flex-start"><span class="icon-badge ink">${icon('Map_Pin')}</span>
      <span class="grow"><b>${esc(row.area || row.label.split(',')[0] || row.label)}</b>
      <span class="muted small" style="display:block">${esc(row.label)}</span></span></span>${icon('Chevron_Right')}
    </button>`).join('');
    if (note) note.textContent = t('picker.results');
  } catch (error) {
    if (error instanceof ApiError && error.status === 501) {
      if (note) note.textContent = t('picker.searchUnavailable');
      const field = document.querySelector('#geo-q');
      if (field) field.disabled = true;
    } else {
      if (note) note.textContent = t('picker.searchFailed');
    }
    results.hidden = true;
  } finally { setBusy(button, false); }
}

/* ---------- actions -------------------------------------------------------- */
register('picker-zoom-in', () => zoomBy(1));
register('picker-zoom-out', () => zoomBy(-1));

register('picker-locate', async (data, event, el) => {
  setBusy(el, true, t('map.locating'));
  try {
    const position = await requestDeviceLocation();
    setMapView(position.lat, position.lng, { zoom: 15 });
    draft = { ...(draft || {}), lat: position.lat, lng: position.lng, source: 'device' };
    paintDraft();
    scheduleReverse({ lat: position.lat, lng: position.lng });
    toast(t('map.found'), 'success');
  } catch (error) {
    const GEO_ERROR_KEY = { denied: 'map.err.denied', timeout: 'map.err.timeout', unsupported: 'map.err.unsupported' };
    toast(t(GEO_ERROR_KEY[(error && error.code) || ''] || 'map.err.unavailable'), 'error');
  } finally { setBusy(el, false); }
});

register('picker-result', (data) => {
  const row = resultRows[Number(data.index)];
  if (!row) return;
  setMapView(row.lat, row.lng, { zoom: 15 });
  draft = { ...(draft || {}), lat: row.lat, lng: row.lng, label: row.label, area: row.area || '', district: row.district || '', source: 'search' };
  paintDraft();
  const results = document.querySelector('[data-role="geo-results"]');
  if (results) results.hidden = true;
});

register('picker-confirm', (data) => {
  const current = place();
  if (!current || !Number.isFinite(current.lat) || !Number.isFinite(current.lng)) {
    toast(t('picker.confirmLocate'), 'error');
    return;
  }
  const district = (document.querySelector('#p-district') || {}).value || current.district || '';
  const area = (document.querySelector('#p-area') || {}).value || current.area || '';
  const label = (document.querySelector('#p-label') || {}).value || current.label || '';
  savePlace({
    label: String(label).trim() || [area, district].filter(Boolean).join(', ') || formatCoordinates(current.lat, current.lng),
    district: String(district).trim(),
    area: String(area).trim(),
    lat: current.lat,
    lng: current.lng,
    source: current.source || 'pin'
  });
  draft = null;
  toast(t('map.saved'), 'success');
  navigate(`#${data.next || '/home'}`);
});

/* Clearing the saved place is offered where a place exists. */
register('picker-clear', () => {
  clearPlace();
  draft = null;
  toast(t('map.cleared'), 'info');
  window.dispatchEvent(new HashChangeEvent('hashchange'));
});

/* The map is paused when the picker is left; app.js calls detachMap before each
   paint, and the centre pin is switched off here so a later view never inherits
   a picker-only pin. */
export function leavePicker() {
  setCenterPinMode(false);
  if (unsubscribeStatus) { unsubscribeStatus(); unsubscribeStatus = null; }
  if (reverseTimer) { clearTimeout(reverseTimer); reverseTimer = null; }
  resultRows = [];
  detachMap();
}

/* Self-contained teardown: the module watches the route rather than making the
   app's render loop aware of one view's internals. */
unsubscribeRoute = onRouteChange(() => {
  if (!window.location.hash.startsWith('#/location')) leavePicker();
});
