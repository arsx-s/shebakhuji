/**
 * ShebaShathi API client.
 * Uses the HttpOnly session cookie on the web and a stored bearer token on
 * native platforms. All failures surface as ApiError with a stable `code`
 * that views map to a localised message.
 */
import { API_BASE, IS_NATIVE, TOKEN_KEY } from './config.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'generic' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

let token = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch { token = null; }

export function setToken(value) {
  token = value || null;
  try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}
export function getToken() { return token; }
export function clearToken() { setToken(null); }

/* ---------- error mapping ------------------------------------------------- */
const ERROR_KEYS = [
  [/invalid credentials|incorrect/i, 'auth.errCredentials'],
  [/already exists|already in use/i, 'auth.errExists'],
  [/not verified/i, 'auth.errUnverified'],
  [/disabled/i, 'auth.errDisabled'],
  [/unauthor|forbidden|access denied|permission/i, 'error.unauthorized'],
  [/network|fetch|failed to fetch/i, 'error.network']
];

export function errorKey(error) {
  if (!error) return 'auth.errGeneric';
  if (error instanceof ApiError) {
    if (error.status === 401) return 'auth.errCredentials';
    if (error.status === 403) return 'error.unauthorized';
    const found = ERROR_KEYS.find(([re]) => re.test(error.message || ''));
    return found ? found[1] : 'auth.errGeneric';
  }
  if (/failed to fetch|networkerror|load failed/i.test(error.message || '')) return 'error.network';
  return 'auth.errGeneric';
}

/* ---------- core request -------------------------------------------------- */
export async function request(path, { method = 'GET', body, signal, headers, timeout = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const init = { method, credentials: 'include', headers: { accept: 'application/json', ...(headers || {}) }, signal: signal || controller.signal };
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  if (IS_NATIVE) init.headers['x-client-platform'] = 'android';
  if (token) init.headers.authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') throw new ApiError('Request timed out', { status: 0, code: 'timeout' });
    throw new ApiError(error.message || 'Network error', { status: 0, code: 'network' });
  }
  clearTimeout(timer);

  let payload = null;
  const text = await response.text();
  if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }

  if (!response.ok) {
    throw new ApiError((payload && payload.error) || `Request failed (${response.status})`, { status: response.status, code: (payload && payload.error) || 'error' });
  }
  return payload || {};
}

export const get = (path, options) => request(path, { ...options, method: 'GET' });
export const post = (path, body, options) => request(path, { ...options, method: 'POST', body });
export const patch = (path, body, options) => request(path, { ...options, method: 'PATCH', body });
export const del = (path, options) => request(path, { ...options, method: 'DELETE' });

/* ---------- domain endpoints --------------------------------------------- */
export const api = {
  health: () => get('/health'),
  publicStats: () => get('/public/stats'),
  publicConfig: () => get('/public/config'),
  /* Real worker positions, only for customers, only when the worker is
     available and has shared a location in the last 30 minutes. */
  discoveryWorkers: ({ service, latitude, longitude } = {}) => {
    const params = new URLSearchParams();
    if (service) params.set('service', service);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      params.set('latitude', String(latitude));
      params.set('longitude', String(longitude));
    }
    const qs = params.toString();
    return get(`/discovery/workers${qs ? `?${qs}` : ''}`);
  },

  services: () => get('/services'),
  providers: (query = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => { if (v != null && v !== '') params.set(k, v); });
    const qs = params.toString();
    return get(`/marketplace/providers${qs ? `?${qs}` : ''}`);
  },
  provider: (id) => get(`/providers/${encodeURIComponent(id)}`),

  me: () => get('/me'),
  updateMe: (body) => patch('/me', body),
  changePassword: (currentPassword, newPassword) => post('/me/password', { currentPassword, newPassword }),
  sessions: () => get('/me/sessions'),
  revokeOtherSessions: () => post('/me/sessions/revoke', {}),
  deleteAccount: (password) => post('/me/delete', { password }),
  geoSearch: (q) => get(`/geo/search?q=${encodeURIComponent(q)}`),
  geoReverse: (latitude, longitude) => get(`/geo/reverse?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`),
  login: (identifier, password) => post('/auth/login', { identifier, password }),
  register: (body) => post('/auth/register', body),
  logout: () => post('/auth/logout', {}),

  notifications: () => get('/notifications'),
  readNotification: (id) => patch(`/notifications/${id}`, {}),

  requests: () => get('/requests'),
  request: (id) => get(`/requests/${id}/offers`),
  createRequest: (body) => post('/requests', body),
  cancelRequest: (id) => patch(`/requests/${id}`, { status: 'CANCELLED' }),
  offers: (requestId) => get(`/requests/${requestId}/offers`),
  submitOffer: (requestId, body) => post(`/requests/${requestId}/offers`, body),
  acceptOffer: (offerId) => post(`/offers/${offerId}/accept`, {}),
  myOffers: () => get('/worker/offers'),

  bookings: () => get('/bookings'),
  booking: (id) => get(`/bookings/${id}`),
  bookingEvents: (id) => get(`/bookings/${id}/events`),
  bookingMessages: (id) => get(`/bookings/${id}/messages`),
  sendMessage: (id, text) => post(`/bookings/${id}/messages`, { text }),
  transitionBooking: (id, status) => patch(`/bookings/${id}`, { status }),
  review: (id, body) => post(`/bookings/${id}/reviews`, body),
  applyPromotion: (id, code) => post(`/bookings/${id}/promotion`, { code }),
  bookListing: (listingId, body) => post(`/listings/${listingId}/book`, body),

  favorites: () => get('/favorites'),
  addFavorite: (providerId) => post('/favorites', { providerId }),
  removeFavorite: (id) => del(`/favorites/${id}`),
  reviews: (providerId) => get(`/reviews${providerId ? `?providerId=${encodeURIComponent(providerId)}` : ''}`),

  properties: () => get('/properties'),
  createProperty: (body) => post('/properties', body),

  listings: () => get('/provider/listings'),
  createListing: (body) => post('/provider/listings', body),
  updateListing: (id, body) => patch(`/provider/listings/${id}`, body),

  availability: (available) => patch('/worker/availability', { available }),
  shareLocation: (latitude, longitude) => patch('/worker/location', { latitude, longitude }),
  earnings: () => get('/worker/earnings'),
  payouts: () => get('/worker/payouts'),
  requestPayout: (amountBdt) => post('/worker/payouts', { amountBdt }),

  invoices: () => get('/invoices'),
  promotions: () => get('/promotions'),
  validatePromotion: (code, subtotalBdt) => post('/promotions/validate', { code, subtotalBdt }),

  supportCases: () => get('/support'),
  createSupportCase: (body) => post('/support', body),

  adminOverview: () => get('/admin/overview'),
  opsOverview: () => get('/ops/overview'),
  adminSupport: () => get('/admin/support'),
  adminPayouts: () => get('/admin/payouts'),
  adminProviders: () => get('/admin/providers'),
  adminCompliance: () => get('/admin/compliance'),
  updateSettings: (body) => patch('/admin/settings', body),
  updateService: (id, body) => patch(`/admin/services/${id}`, body),
  updateUser: (id, body) => patch(`/admin/users/${id}`, body),
  updateSupportCase: (id, status) => patch(`/admin/support/${id}`, { status }),
  updatePayout: (id, status) => patch(`/admin/payouts/${id}`, { status }),
  reviewCompliance: (id, status, reason) => patch(`/admin/compliance/${id}`, { status, reason })
};

/* ---------- server-sent events ------------------------------------------- */
export function openEventStream(onEvent) {
  if (typeof EventSource === 'undefined') return () => {};
  let source;
  try {
    source = new EventSource(`${API_BASE}/events`, { withCredentials: true });
  } catch { return () => {}; }
  const handle = (event) => {
    try { onEvent(JSON.parse(event.data)); } catch { /* ignore malformed */ }
  };
  source.addEventListener('ready', () => {});
  source.addEventListener('message', handle);
  source.addEventListener('notification', handle);
  source.addEventListener('booking_status', handle);
  source.addEventListener('error', () => { /* browser retries */ });
  return () => source.close();
}
