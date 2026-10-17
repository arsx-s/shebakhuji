/**
 * Hash router with guard support.
 * Patterns use ':param' segments, e.g. '/booking/:id'.
 */
const routes = [];
let fallback = null;
let current = null;
const listeners = new Set();

export function route(pattern, handler, { guard } = {}) {
  const segments = pattern.split('/').filter(Boolean);
  routes.push({ pattern, segments, handler, guard });
}

export function setFallback(handler) { fallback = handler; }

export function parse(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart || '/';
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { path, query };
}

export function resolve(hash = window.location.hash) {
  const { path, query } = parse(hash);
  const segments = path.split('/').filter(Boolean);
  for (const entry of routes) {
    if (entry.segments.length !== segments.length) continue;
    const params = {};
    let matched = true;
    for (let i = 0; i < entry.segments.length; i += 1) {
      const pattern = entry.segments[i];
      if (pattern.startsWith(':')) params[pattern.slice(1)] = decodeURIComponent(segments[i]);
      else if (pattern !== segments[i]) { matched = false; break; }
    }
    if (matched) return { ...entry, params, query, path };
  }
  return { handler: fallback, segments: [], params: {}, query, path, pattern: null, notFound: true };
}

export function currentRoute() { return current; }

export function onRouteChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export async function go(hash) {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  if (window.location.hash === target) { await handleChange(); return; }
  window.location.hash = target;
}

/**
 * Resolve the current hash and tell every listener about it.
 *
 * The router deliberately does NOT invoke route handlers: exactly one place
 * (the app's render loop) paints the DOM, so navigation cannot leave the
 * screen showing the previous view.
 */
async function handleChange() {
  const resolved = resolve();
  const previous = current;
  current = resolved;
  for (const fn of listeners) { try { fn(resolved, previous); } catch (error) { console.error('[router] listener failed', error); } }
}

export function startRouter() {
  window.addEventListener('hashchange', () => { handleChange(); });
  return handleChange();
}
