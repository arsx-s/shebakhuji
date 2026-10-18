/**
 * Shared UI primitives: escaping, icons, toasts, sheets, confirmations,
 * avatars, skeletons, empty states, status tags and a delegated action bus.
 *
 * Views render HTML strings and declare behaviour with `data-action="name"`.
 * The action bus resolves the name to a registered handler, so a missing
 * handler is a console warning instead of a silent dead button.
 */
import { getLang, money, t } from './i18n.js';

/* ---------- escaping & formatting ---------------------------------------- */
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const attr = (value) => esc(value).replace(/`/g, '&#96;');
export { money, t };

export function truncate(value, max = 140) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/* ---------- icons -------------------------------------------------------- */
export function icon(name, { label, className = 'ci' } = {}) {
  const safe = String(name || 'Info').replace(/[^A-Za-z0-9_\-]/g, '');
  const a11y = label ? ` role="img" aria-label="${attr(label)}"` : ' aria-hidden="true"';
  return `<svg class="${className}"${a11y} viewBox="0 0 24 24"><use href="./assets/coolicons-sprite.svg#${safe}"></use></svg>`;
}

/* ---------- avatar ------------------------------------------------------- */
const AVATAR_PALETTE = ['#2E4A7D', '#7D4A2E', '#2E7D5B', '#6B2E7D', '#7D2E3C', '#2E6B7D'];
function initial(name) {
  const clean = String(name || '').trim();
  return clean ? clean[0].toUpperCase() : '?';
}
function paletteFor(seed) {
  let sum = 0;
  for (const ch of String(seed || 'x')) sum = (sum + ch.codePointAt(0)) % 997;
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length];
}
export function avatar(user, { size = '' } = {}) {
  const name = user && user.name ? user.name : t('common.unknown');
  const remote = user && user.avatarDataUrl;
  const cls = `avatar${size ? ` ${size}` : ''}`;
  const style = remote ? `background-image:url('${attr(remote)}')` : `background:${paletteFor(name)}`;
  const inner = remote ? '' : esc(initial(name));
  return `<span class="${cls}" style="${style}" role="img" aria-label="${attr(name)}">${inner}</span>`;
}

/* ---------- status tags -------------------------------------------------- */
const STATUS_CLASS = {
  OPEN_FOR_OFFERS: 'open', OFFER_RECEIVED: 'open', OPEN: 'open',
  CONFIRMED: 'confirmed', AWARDED: 'confirmed',
  WORKER_TRAVELLING: 'progress', WORKER_ARRIVED: 'progress', WORK_IN_PROGRESS: 'progress', COMPLETION_REQUESTED: 'progress',
  COMPLETED: 'done', RESOLVED: 'done', PAID: 'done',
  CANCELLED: 'cancelled', DISPUTED: 'cancelled', REJECTED: 'cancelled', CLOSED: 'draft',
  SUBMITTED: 'draft', PENDING: 'draft', REQUESTED: 'draft', IN_REVIEW: 'progress'
};
export function statusTag(status) {
  const cls = STATUS_CLASS[status] || 'draft';
  return `<span class="tag ${cls}">${esc(t(`status.${status}`))}</span>`;
}
export function paymentTag(status) {
  const cls = status === 'PAID' ? 'done' : status === 'REFUNDED' ? 'progress' : 'open';
  return `<span class="tag ${cls}">${esc(t(`payment.${status}`))}</span>`;
}
export function stars(rating, count) {
  if (rating == null) return `<span class="muted small">${esc(t('common.new'))}</span>`;
  const value = Math.round(Number(rating) * 10) / 10;
  const label = count != null ? `${value} (${count})` : String(value);
  return `<span class="row" style="gap:4px;color:#B4761A"><span aria-hidden="true">★</span><b class="num">${esc(label)}</b></span>`;
}

/* ---------- service media ------------------------------------------------ */
export function serviceMedia(service, { className = 'thumb' } = {}) {
  const src = service && (service.photo || service.art);
  if (!src) return `<div class="${className}" style="display:grid;place-items:center;color:var(--muted)">${icon('Image_01')}</div>`;
  return `<img class="${className}" loading="lazy" decoding="async" alt="${attr(serviceName(service))}" src="./${attr(src)}" />`;
}
export function serviceName(service) {
  if (!service) return '';
  return getLang() === 'en' ? (service.en || service.bn) : (service.bn || service.en || service.id);
}
export function serviceBlurb(service) {
  if (!service) return '';
  return getLang() === 'en' ? (service.blurbEn || '') : (service.blurbBn || '');
}

/* ---------- toast -------------------------------------------------------- */
const TOAST_ICON = { success: 'Circle_Check', error: 'Circle_Warning', info: 'Info' };
export function toast(message, type = 'info', { duration = 3600 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(TOAST_ICON[type] || 'Info')}<span>${esc(message)}</span>`;
  root.append(el);
  const remove = () => { el.classList.add('out'); setTimeout(() => el.remove(), 240); };
  setTimeout(remove, duration);
  el.addEventListener('click', remove);
}

/* ---------- overlay sheets ---------------------------------------------- */
let activeOverlay = null;
export function closeSheet() {
  if (!activeOverlay) return;
  const { scrim, onClose, returnFocus } = activeOverlay;
  activeOverlay = null;
  scrim.remove();
  document.removeEventListener('keydown', onKeydown);
  // Focus goes back to whatever opened the dialog, so keyboard users are not
  // dropped at the top of the page (WCAG 2.4.3).
  if (returnFocus && document.contains(returnFocus) && typeof returnFocus.focus === 'function') {
    try { returnFocus.focus(); } catch { /* the trigger was re-rendered away */ }
  }
  if (onClose) onClose();
}

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function onKeydown(event) {
  if (!activeOverlay) return;
  if (event.key === 'Escape') { closeSheet(); return; }
  if (event.key !== 'Tab') return;
  // Keep Tab inside the dialog: a modal that leaks focus into the page behind
  // is a dead end for keyboard and screen-reader users.
  const items = [...activeOverlay.scrim.querySelectorAll(TABBABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const current = document.activeElement;
  const inside = activeOverlay.scrim.contains(current);
  if (event.shiftKey && (current === first || !inside)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (current === last || !inside)) { event.preventDefault(); first.focus(); }
}

/**
 * Open a bottom sheet (mobile) / modal (desktop).
 * @returns {{close:Function, body:HTMLElement, root:HTMLElement}}
 */
export function sheet({ title, subtitle, body = '', footer = '', onClose, dismissible = true } = {}) {
  closeSheet();
  const returnFocus = document.activeElement;
  const root = document.getElementById('overlay-root') || document.body;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${attr(title || 'ShebaShathi')}">
      ${title ? `<div class="sheet-head"><div><h2 class="h2">${esc(title)}</h2>${subtitle ? `<p class="muted small">${esc(subtitle)}</p>` : ''}</div><button class="btn ghost icon" data-action="sheet-close" aria-label="${attr(t('a11y.close'))}">${icon('Close_MD')}</button></div>` : ''}
      <div class="sheet-body"></div>
      ${footer ? `<div class="sheet-footer">${footer}</div>` : ''}
    </div>`;
  const bodyEl = scrim.querySelector('.sheet-body');
  bodyEl.innerHTML = body;
  scrim.addEventListener('click', (event) => {
    if (event.target === scrim && dismissible) closeSheet();
  });
  root.append(scrim);
  document.addEventListener('keydown', onKeydown);
  activeOverlay = { scrim, onClose, returnFocus };
  const focusable = scrim.querySelector('input, select, textarea, button:not([data-action="sheet-close"])');
  if (focusable) setTimeout(() => focusable.focus(), 60);
  return { root: scrim, body: bodyEl, close: closeSheet };
}

/** Promise-based confirmation dialog. */
export function confirm({ title, body = '', confirmLabel, cancelLabel, danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (settled) return; settled = true; closeSheet(); resolve(value); };
    sheet({
      title,
      body: `<p class="muted">${esc(body)}</p>`,
      footer: `<div class="sheet-actions"><button class="btn secondary" data-action="confirm-no">${esc(cancelLabel || t('common.cancel'))}</button><button class="btn ${danger ? 'danger' : ''}" data-action="confirm-yes">${esc(confirmLabel || t('common.confirm'))}</button></div>`,
      onClose: () => finish(false)
    });
    register('confirm-yes', () => finish(true), { once: true });
    register('confirm-no', () => finish(false), { once: true });
  });
}

/* ---------- busy state --------------------------------------------------- */
export function setBusy(button, busy, busyLabel) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.dataset.label || button.textContent;
    button.setAttribute('aria-busy', 'true');
    button.disabled = true;
    if (busyLabel) button.textContent = busyLabel;
  } else {
    button.removeAttribute('aria-busy');
    button.disabled = false;
    if (button.dataset.label) { button.textContent = button.dataset.label; delete button.dataset.label; }
  }
}

/* ---------- skeletons & empties ----------------------------------------- */
export function skeletonList(count = 3, rows = 2) {
  return Array.from({ length: count }, () => `
    <div class="list-item">
      <div class="row grow"><div class="sk avatar"></div><div class="grow">${Array.from({ length: rows }, (_, i) => `<div class="sk line ${i === rows - 1 ? 'w60' : 'w80'}"></div>`).join('')}</div></div>
    </div>`).join('');
}
export function skeletonCards(count = 4, kind = 'service') {
  return Array.from({ length: count }, () => kind === 'service'
    ? `<div class="card pad-0"><div class="sk thumb"></div><div style="padding:16px"><div class="sk line w60"></div><div class="sk line w40"></div></div></div>`
    : `<div class="card"><div class="row"><div class="sk avatar"></div><div class="grow"><div class="sk line w60"></div><div class="sk line w80"></div></div></div></div>`).join('');
}
export function emptyState({ art, title, body, action }) {
  return `<div class="empty">
    ${art ? `<img src="./${attr(art)}" alt="" loading="lazy" />` : ''}
    <h2>${esc(title)}</h2>
    ${body ? `<p>${esc(body)}</p>` : ''}
    ${action || ''}
  </div>`;
}
export function errorState({ title, body, retry = true }) {
  return `<div class="empty">
    <img src="./assets/illustrations/offline.svg" alt="" loading="lazy" />
    <h2>${esc(title || t('error.title'))}</h2>
    <p>${esc(body || t('error.network'))}</p>
    ${retry ? `<button class="btn" data-action="retry">${icon('Arrow_Reload_02')}${esc(t('common.retry'))}</button>` : ''}
  </div>`;
}

/* ---------- reveal on scroll -------------------------------------------- */
let revealObserver = null;
export function observeReveals(root = document) {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targets = root.querySelectorAll('.reveal:not(.in)');
  if (prefersReduced || !('IntersectionObserver' in window)) { targets.forEach((el) => el.classList.add('in')); return; }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('in'); revealObserver.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  }
  targets.forEach((el) => revealObserver.observe(el));
}

/* ---------- delegated action bus ---------------------------------------- */
const actions = new Map();
export function register(name, handler, { once = false } = {}) {
  actions.set(name, once ? (dataset, event, el) => { actions.delete(name); return handler(dataset, event, el); } : handler);
}
export function unregister(name) { actions.delete(name); }
export function bindActions() {
  if (bindActions._bound) return;
  bindActions._bound = true;
  document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const name = el.dataset.action;
    const handler = actions.get(name);
    if (!handler) { console.warn(`[ui] no handler registered for action "${name}"`); return; }
    if (el.tagName === 'A' && el.getAttribute('href') === '#') event.preventDefault();
    if (el.hasAttribute('disabled') || el.getAttribute('aria-busy') === 'true') return;
    try { handler({ ...el.dataset }, event, el); } catch (error) { console.error(`[ui] action "${name}" failed`, error); toast(t('auth.errGeneric'), 'error'); }
  });
}
export function navigate(hash) {
  if (window.location.hash === hash) { window.dispatchEvent(new HashChangeEvent('hashchange')); return; }
  window.location.hash = hash;
}
