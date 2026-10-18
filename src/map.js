/**
 * MapLibre GL JS integration.
 *
 * One map instance for the whole session: creating a WebGL context per
 * navigation leaks GPU memory and re-downloads tiles, so this module owns the
 * single `maplibregl.Map`, hands its container to whichever view asks for it
 * and pauses rendering while it is detached.
 *
 * The library itself is vendored (assets/vendor/maplibre) and imported
 * dynamically, so the ~1.6 MB map bundle is only fetched when a customer
 * actually opens the map.
 *
 * No tiles, coordinates or workers are invented here. The style URL comes from
 * the server (`GET /api/public/config`, configured with `MAP_STYLE_URL`), the
 * customer's pin comes from the device geolocation API or from a tap on the
 * map, and worker pins come from `/api/discovery/workers`, which only returns
 * workers who are available and have shared a location recently.
 */
import { api } from './api.js';
import { getLang } from './i18n.js';

/* Resolved against this module's own URL, so the paths stay correct whether the
   app is served from the site root or from a nested Capacitor origin. */
const LIB_URL = new URL('../assets/vendor/maplibre/maplibre-gl.mjs', import.meta.url).href;
const CSS_URL = new URL('../assets/vendor/maplibre/maplibre-gl.css', import.meta.url).href;
const PLACE_KEY = 'shebashathi.place';
const DHAKA = { lng: 90.3742, lat: 23.7461 };
const DEFAULT_ZOOM = 12.4;

let libPromise = null;
let configPromise = null;
let instance = null; // { map, container, styleUrl, markers, ready, failed }
let status = { state: 'idle', detail: '' };

/* ---------- configuration ------------------------------------------------ */
export async function loadMapConfig(force = false) {
  if (!configPromise || force) {
    configPromise = api.publicConfig()
      .then((res) => (res && res.config && res.config.map) || { styleUrl: null, configured: 'unknown', note: '' })
      .catch(() => ({ styleUrl: null, configured: 'unreachable', note: '' }));
  }
  return configPromise;
}

/* ---------- library ----------------------------------------------------- */
function injectStylesheet() {
  if (document.querySelector('link[data-maplibre]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_URL;
  link.setAttribute('data-maplibre', '');
  document.head.append(link);
}

function loadLibrary() {
  if (!libPromise) {
    injectStylesheet();
    libPromise = import(/* @vite-ignore */ LIB_URL)
      .then((mod) => mod.default || mod)
      .catch((error) => {
        libPromise = null;
        throw error;
      });
  }
  return libPromise;
}

/* ---------- status ------------------------------------------------------ */
const statusListeners = new Set();
export function onMapStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
export function getMapStatus() { return status; }

function setStatus(state, detail = '') {
  status = { state, detail };
  for (const fn of statusListeners) { try { fn(status); } catch (error) { console.error('[map] status listener failed', error); } }
}

/* ---------- saved place -------------------------------------------------- */
export function readPlace() {
  try {
    const raw = localStorage.getItem(PLACE_KEY);
    if (!raw) return null;
    const place = JSON.parse(raw);
    return place && Number.isFinite(place.lat) && Number.isFinite(place.lng) ? place : null;
  } catch { return null; }
}

export function savePlace(place) {
  try { localStorage.setItem(PLACE_KEY, JSON.stringify({ ...place, updatedAt: new Date().toISOString() })); } catch { /* storage disabled */ }
  return place;
}

export function clearPlace() { try { localStorage.removeItem(PLACE_KEY); } catch { /* ignore */ } }

/** Human-readable pair of coordinates, used when no geocoder is configured. */
export function formatCoordinates(lat, lng) {
  const digits = (value) => Math.abs(value).toFixed(4);
  return `${digits(lat)}° ${lat >= 0 ? 'N' : 'S'}, ${digits(lng)}° ${lng >= 0 ? 'E' : 'W'}`;
}

/* ---------- geolocation -------------------------------------------------- */
/**
 * Ask the device for a position. Only ever called from an explicit button
 * press: the customer is told why before the browser prompt appears.
 */
export function requestDeviceLocation({ timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(Object.assign(new Error('unsupported'), { code: 'unsupported' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      }),
      (error) => reject(Object.assign(new Error(error.message || 'denied'), { code: error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable' })),
      { enableHighAccuracy: true, timeout, maximumAge: 30000 }
    );
  });
}

/* ---------- map instance ------------------------------------------------- */
/* Map labels follow the interface language. Only layers that label a *name*
   are touched: road-number shields and house numbers keep their own field, so
   switching language can never turn a route badge into a place name. */
function applyLabelLanguage(map) {
  const bn = getLang() === 'bn';
  const field = bn
    ? ['coalesce', ['get', 'name:bn'], ['get', 'name'], ['get', 'name:latin'], ['get', 'name:nonlatin'], ['get', 'name:en']]
    : ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name'], ['get', 'name:nonlatin']];
  try {
    for (const layer of map.getStyle().layers || []) {
      if (layer.type !== 'symbol' || !layer.layout || !layer.layout['text-field']) continue;
      if (!JSON.stringify(layer.layout['text-field']).includes('"name')) continue;
      try { map.setLayoutProperty(layer.id, 'text-field', field); } catch { /* layer rejects the expression */ }
    }
  } catch { /* style without symbol layers */ }
}

export function setMapLanguage() {
  if (!instance || !instance.ready) return;
  applyLabelLanguage(instance.map);
}

function markerElement({ kind = 'place', label = '' } = {}) {
  const el = document.createElement('div');
  el.className = kind === 'worker' ? 'map-marker map-marker--worker' : 'map-marker map-marker--place';
  if (label) el.setAttribute('title', label);
  return el;
}

function createInstance(maplibregl, styleUrl, center) {
  const container = document.createElement('div');
  container.className = 'map-canvas';
  container.setAttribute('data-role', 'map-canvas');
  const map = new maplibregl.Map({
    container,
    style: styleUrl,
    center: [center.lng, center.lat],
    zoom: DEFAULT_ZOOM,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    cooperativeGestures: false
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  instance = { maplibregl, map, container, markers: [], styleUrl, ready: false, failed: false, center };

  map.on('load', () => {
    instance.ready = true;
    applyLabelLanguage(map);
    redrawMarkers();
    setStatus('ready');
  });
  map.on('error', (event) => {
    const message = String((event && event.error && event.error.message) || '');
    if (message.includes('401') || message.includes('403') || message.includes('404') || /style/i.test(message)) {
      instance.failed = true;
      setStatus(instance.ready ? 'tiles-error' : 'unavailable', message);
    } else if (!instance.ready) {
      setStatus('tiles-error', message);
    }
  });
  map.on('click', (event) => {
    if (!instance.pickMode) return;
    applyPlaceToMap({ lat: event.lngLat.lat, lng: event.lngLat.lng, source: 'pin' });
    if (instance.onPick) instance.onPick({ lat: event.lngLat.lat, lng: event.lngLat.lng });
  });
  return instance;
}

/**
 * Attach the (single) map to the given host element. Safe to call on every
 * render: the container is moved instead of rebuilt.
 */
export async function attachMap(host, { center, interactive = true } = {}) {
  const config = await loadMapConfig();
  if (!host) return null;
  if (!config.styleUrl) {
    setStatus(config.configured === 'unreachable' ? 'config-unreachable' : 'unconfigured', config.note || '');
    return null;
  }
  let maplibregl;
  try {
    maplibregl = await loadLibrary();
  } catch (error) {
    setStatus('library-error', error.message);
    return null;
  }
  if (!instance) createInstance(maplibregl, config.styleUrl, center || readPlace() || DHAKA);
  if (!instance.place) { const saved = center || readPlace(); if (saved) instance.place = saved; }
  if (instance.container.parentElement !== host) host.append(instance.container);
  if (interactive) {
    instance.map.dragPan.enable();
    instance.map.scrollZoom.enable();
  }
  // A re-parented canvas reports a stale size, and a detached map is paused.
  requestAnimationFrame(() => {
    try { instance.map.resize(); instance.map.triggerRepaint(); } catch { /* map already removed */ }
  });
  if (instance.ready) setStatus('ready');
  return instance.map;
}

/** Pause rendering while the map is off screen (route changed, tab hidden). */
export function detachMap() {
  if (!instance) return;
  try { instance.map.stop(); } catch { /* already stopped */ }
}

export function destroyMap() {
  if (!instance) return;
  const { map, container } = instance;
  instance = null;
  try { map.remove(); } catch { /* already gone */ }
  container.remove();
  setStatus('idle');
}

export function getMap() { return instance ? instance.map : null; }

export function setPickMode(on, onPick) {
  if (!instance) return;
  instance.pickMode = Boolean(on);
  instance.onPick = onPick || null;
  instance.container.style.cursor = on ? 'crosshair' : '';
}

/* ---------- markers ----------------------------------------------------- */
function syncMarkers(points) {
  if (!instance) return;
  for (const marker of instance.markers) marker.remove();
  instance.markers = points.map((point) => {
    const element = markerElement(point);
    const marker = new instance.maplibregl.Marker({ element, anchor: point.kind === 'worker' ? 'center' : 'bottom' })
      .setLngLat([point.lng, point.lat]);
    try { marker.addTo(instance.map); } catch { /* map removed */ }
    return marker;
  });
}

/** Redraw every marker from the current place + the last real worker list. */
function redrawMarkers() {
  if (!instance) return;
  const place = instance.place;
  const points = [];
  if (place) points.push({ kind: 'place', lat: place.lat, lng: place.lng, label: place.label || '' });
  for (const worker of instance.workerPoints || []) {
    if (!Number.isFinite(worker.latitude) || !Number.isFinite(worker.longitude)) continue;
    const skills = (worker.skills || []).join(' · ');
    points.push({
      kind: 'worker',
      lat: worker.latitude,
      lng: worker.longitude,
      label: worker.name ? `${worker.name}${skills ? ` — ${skills}` : ''}` : ''
    });
  }
  syncMarkers(points);
}

function applyPlaceToMap(place) {
  if (!instance || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return;
  instance.place = place;
  redrawMarkers();
  setTimeout(() => {
    try {
      instance.map.easeTo({
        center: [place.lng, place.lat],
        zoom: Math.max(instance.map.getZoom(), DEFAULT_ZOOM),
        duration: prefersReducedMotion() ? 0 : 700
      });
    } catch { /* map removed */ }
  }, 0);
}

/* ---------- real worker positions --------------------------------------- */
/**
 * Plot workers that the backend has actually reported as available, nearby and
 * recently located. An empty array means "we do not know", never "no workers
 * exist", so the view shows an honest empty state instead of fake pins.
 */
export function renderWorkerMarkers(workers = []) {
  if (!instance) return;
  instance.workerPoints = workers;
  redrawMarkers();
}

export function focusPlace(place) {
  if (!instance || !place) return;
  applyPlaceToMap(place);
}

/** Drop the customer's own pin from the map (the saved place is cleared separately). */
export function clearMapPlace() {
  if (!instance) return;
  instance.place = null;
  redrawMarkers();
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ---------- capability probe ------------------------------------------- */
/** True when a style URL is configured and the library file is vendored. */
export async function mapCapability() {
  const config = await loadMapConfig();
  // `configured` is the boolean the views switch on. The server's own
  // descriptor — development-default, env, disabled or unreachable — is kept
  // separately as `source`, so the two can never overwrite each other.
  return { ...config, source: config.configured, configured: Boolean(config.styleUrl) };
}
