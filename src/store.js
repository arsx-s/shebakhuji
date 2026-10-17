/**
 * Minimal observable application store.
 * Holds session state, catalogue and notification data shared across views.
 */
const state = {
  ready: false,
  user: null,
  services: [],
  fees: null,
  notifications: [],
  unread: 0,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pending: false
};

const listeners = new Set();
let scheduled = false;

export function getState() { return state; }

export function setState(patch) {
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (state[key] !== value) { state[key] = value; changed = true; }
  }
  if (changed) schedule();
  return state;
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    for (const fn of listeners) { try { fn(state); } catch (error) { console.error('[store] listener failed', error); } }
  });
}

export function isAuthed() { return Boolean(state.user); }
export function role() { return state.user ? state.user.role : null; }
export function serviceById(id) { return state.services.find((s) => s.id === id) || null; }
export function serviceName(id) {
  const service = serviceById(id);
  return service ? (document.documentElement.lang === 'en' ? service.en || service.bn : service.bn || service.en) : id;
}
export function unreadCount() { return state.notifications.filter((n) => !n.read).length; }
