/**
 * Motion effects, ported from React Bits (https://reactbits.dev) to plain
 * vanilla DOM because this frontend has no React runtime — the whole app is a
 * dependency-free ES-module SPA and rebuilding it in React just to host a
 * component library would have thrown away working routes, auth and MapLibre
 * lifecycle code for no product gain. The effects below keep the originals'
 * behaviour and names, and are the exact places where React Bits components
 * would have been mounted:
 *
 *   BlurText      -> `data-fx="blur-text"`   (welcome headline, section titles)
 *   CountUp       -> `data-fx="count-up"`    (real stats and real price totals)
 *   AnimatedList  -> `data-fx="stagger"`     (service, category and activity lists)
 *   ShinyText     -> `data-fx="shiny"`       (primary call-to-action sheen)
 *   ClickSpark    -> `installClickSpark()`   (global tap feedback)
 *
 * Every effect is inert and instant when reduced motion is preferred, and none
 * of them owns information: text, prices and controls are in the DOM and
 * usable before, during and after an effect runs.
 */
import { money } from './i18n.js';
import { esc } from './ui.js';
import { prefersReducedMotion } from './theme.js';

/* ---------- helpers -------------------------------------------------------- */

const WORDS = (value) => String(value ?? '').split(/(\s+)/).filter((part) => part.length);

function post(element, html) {
  /* Replacing innerHTML on a text-only node set is safe: these attributes are
     only ever used on headings and prices the view rendered from t()/money(). */
  element.innerHTML = html;
}

/* ---------- BlurText ------------------------------------------------------- */

function blurText(element) {
  const text = element.dataset.fxText || element.textContent;
  const words = WORDS(text).filter((part) => part.trim().length);
  if (!words.length) return;
  if (prefersReducedMotion()) { post(element, esc(text)); return; }
  post(element, words
    .map((word, index) => `<span class="fx-word" style="--fx-i:${index}">${esc(word)}</span>`)
    .join(' '));
}

/* ---------- CountUp -------------------------------------------------------- */

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

function formatCount(element, value) {
  if (element.dataset.fxFormat === 'money') return money(value);
  return new Intl.NumberFormat(element.dataset.fxLang === 'bn' ? 'bn-BD' : 'en-US').format(value);
}

function countUp(element) {
  const target = Number(element.dataset.fxValue || 0);
  const final = formatCount(element, target);
  if (prefersReducedMotion() || !Number.isFinite(target) || target === 0) { element.textContent = final; return; }
  const duration = Math.min(1400, 420 + Math.log10(Math.abs(target) + 10) * 320);
  const started = performance.now();
  const step = (time) => {
    const progress = Math.min(1, (time - started) / duration);
    const value = Math.round(target * easeOutCubic(progress));
    element.textContent = formatCount(element, value);
    if (progress < 1) requestAnimationFrame(step);
    else element.textContent = final; // settle on the exact server value
  };
  element.textContent = formatCount(element, 0);
  requestAnimationFrame(step);
}

/* ---------- AnimatedList --------------------------------------------------- */

function stagger(element) {
  if (prefersReducedMotion()) return;
  const children = Array.from(element.children);
  const limit = Number(element.dataset.fxLimit || 14);
  children.slice(0, limit).forEach((child, index) => {
    child.classList.add('fx-in');
    child.style.setProperty('--fx-i', String(Math.min(index, 12)));
  });
}

/* ---------- ShinyText ------------------------------------------------------ */

function shiny(element) {
  if (prefersReducedMotion()) return;
  element.classList.add('fx-shiny');
}

/* ---------- ClickSpark ----------------------------------------------------- */

let sparkCleanup = null;

/** One canvas for the session; pointer-events stay off so nothing is blocked. */
export function installClickSpark() {
  if (sparkCleanup || prefersReducedMotion()) return () => {};
  if (typeof document === 'undefined') return () => {};
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-spark';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return () => {}; }

  let sparks = [];
  let running = false;
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  const resize = () => {
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  };
  resize();

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const remaining = [];
    for (const spark of sparks) {
      const t = (performance.now() - spark.at) / spark.duration;
      if (t >= 1) continue;
      remaining.push(spark);
      const eased = easeOutCubic(t);
      const radius = 6 * dpr + eased * 13 * dpr;
      const alpha = (1 - t) * 0.55;
      /* Monochrome: the spark reads on light and dark surfaces because it
         borrows the resolved primary ink colour rather than a brand hue. */
      ctx.strokeStyle = spark.ink;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.6 * dpr;
      ctx.lineCap = 'round';
      for (let i = 0; i < 8; i += 1) {
        const angle = (Math.PI / 4) * i + 0.4;
        const from = radius * 0.45;
        const to = radius;
        ctx.beginPath();
        ctx.moveTo(spark.x + Math.cos(angle) * from, spark.y + Math.sin(angle) * from);
        ctx.lineTo(spark.x + Math.cos(angle) * to, spark.y + Math.sin(angle) * to);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    sparks = remaining;
    if (sparks.length) requestAnimationFrame(draw);
    else { running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
  };

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#111114';
    sparks.push({ x: event.clientX * dpr, y: event.clientY * dpr, at: performance.now(), duration: 380, ink });
    if (sparks.length > 6) sparks = sparks.slice(-6);
    if (!running) { running = true; requestAnimationFrame(draw); }
  };

  const stop = () => {
    if (sparkCleanup) { sparkCleanup(); sparkCleanup = null; }
    canvas.remove();
  };

  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('resize', resize);
  sparkCleanup = () => {
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('resize', resize);
    sparks = [];
  };
  return stop;
}

/* ---------- the one entry point views do not have to know about ------------ */

let observer = null;

function run(element) {
  if (element.dataset.fxDone === '1') return;
  element.dataset.fxDone = '1';
  switch (element.dataset.fx) {
    case 'blur-text': blurText(element); break;
    case 'count-up': countUp(element); break;
    case 'stagger': stagger(element); break;
    case 'shiny': shiny(element); break;
    default: break;
  }
}

/** Called after every paint, exactly like `observeReveals`. */
export function applyFx(root = document) {
  const nodes = root.querySelectorAll ? root.querySelectorAll('[data-fx]') : [];
  if (!nodes.length) return;
  const reduce = prefersReducedMotion();
  if (reduce || typeof IntersectionObserver === 'undefined') { nodes.forEach(run); return; }
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        run(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  }
  nodes.forEach((node) => {
    if (node.dataset.fxDone === '1') return;
    /* Anything already on screen runs immediately so the first view is never
       blank while the observer settles. */
    const box = node.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) run(node);
    else observer.observe(node);
  });
}

/** A price or stat a view updates in place (e.g. after choosing a package). */
export function refreshCount(element) {
  if (!element) return;
  delete element.dataset.fxDone;
  run(element);
}
