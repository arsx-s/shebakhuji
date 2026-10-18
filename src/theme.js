/**
 * Appearance: light / dark / system.
 *
 * The choice lives in one place (`shebashathi.theme`) and is applied to
 * `<html data-theme>` so every token in app.css re-maps at once. `system`
 * follows the operating system, including while the app is open, which is why
 * the media query is listened to rather than read once.
 *
 * index.html repeats a three-line version of this before the stylesheet loads
 * so a reload never flashes the wrong theme; this module is the single source
 * of truth afterwards (`applyTheme` is idempotent, so the two agree).
 */

const KEY = 'shebashathi.theme';
export const THEMES = ['light', 'dark', 'system'];
export const THEME_KEY = KEY;

/* Theme colours for the browser/OS chrome. They are the raw canvas values of
   the token blocks in app.css, because a meta tag cannot read a custom
   property. `scripts/check-theme.js` keeps the three in step. */
export const THEME_COLORS = { light: '#F6F6F7', dark: '#0B0B0D' };

const media = () => (typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null);

let listeners = [];

const read = () => {
  try {
    const value = localStorage.getItem(KEY);
    return THEMES.includes(value) ? value : 'dark';
  } catch { return 'dark'; }
};

let current = read();

export const getTheme = () => current;
export const isSystemTheme = () => current === 'system';

/** The theme actually on screen once `system` is resolved. */
export function resolvedTheme() {
  if (current !== 'system') return current;
  const mq = media();
  return mq && mq.matches ? 'dark' : 'light';
}

function paintMeta() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[resolvedTheme()]);
}

/** Idempotent: safe to call from boot, from Settings and from the OS listener. */
export function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = current;
  root.style.colorScheme = resolvedTheme();
  paintMeta();
}

export function onThemeChange(handler) {
  listeners.push(handler);
  return () => { listeners = listeners.filter((fn) => fn !== handler); };
}

export function setTheme(value) {
  if (!THEMES.includes(value)) return;
  current = value;
  try { localStorage.setItem(KEY, value); } catch { /* private mode: the session still follows the choice */ }
  applyTheme();
  listeners.forEach((handler) => handler(current, resolvedTheme()));
}

export function initTheme() {
  applyTheme();
  const mq = media();
  if (mq && typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', () => {
      if (current !== 'system') return;
      applyTheme(); // the OS flipped while we were following it
      listeners.forEach((handler) => handler(current, resolvedTheme()));
    });
  }
  /* <html lang> is owned by i18n (`applyToDocument`); the theme deliberately
     does not touch it, so there is only ever one writer of that attribute. */
  return current;
}

/* ---------- motion ---------------------------------------------------------
   `shebashathi.motion` is `system` | `full` | `reduced`. Reduced motion is a
   preference, not a cosmetic switch: `html[data-motion="reduced"]` turns off
   the entrance animations in app.css, `prefersReducedMotion()` stops the
   scripted effects in fx.js before they start, and nothing that carries
   information is only reachable through movement. */
const MOTION_KEY = 'shebashathi.motion';
export const MOTIONS = ['system', 'full', 'reduced'];

const motionMedia = () => (typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null);

const readMotion = () => {
  try {
    const value = localStorage.getItem(MOTION_KEY);
    return MOTIONS.includes(value) ? value : 'system';
  } catch { return 'system'; }
};

let motion = readMotion();
let motionListeners = [];

export const getMotion = () => motion;

/** True when the person (or their phone) asked for less movement. */
export function prefersReducedMotion() {
  if (motion === 'reduced') return true;
  if (motion === 'full') return false;
  const mq = motionMedia();
  return Boolean(mq && mq.matches);
}

export function applyMotion() {
  document.documentElement.dataset.motion = prefersReducedMotion() ? 'reduced' : 'full';
}

export function onMotionChange(handler) {
  motionListeners.push(handler);
  return () => { motionListeners = motionListeners.filter((fn) => fn !== handler); };
}

export function setMotion(value) {
  if (!MOTIONS.includes(value)) return;
  motion = value;
  try { localStorage.setItem(MOTION_KEY, value); } catch { /* the session still follows the choice */ }
  applyMotion();
  motionListeners.forEach((handler) => handler(motion));
}

export function initMotion() {
  applyMotion();
  const mq = motionMedia();
  if (mq && typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', () => {
      if (motion !== 'system') return;
      applyMotion();
      motionListeners.forEach((handler) => handler(motion));
    });
  }
  return motion;
}
