/**
 * ShebaShathi art generator.
 * Produces the original illustration library, brand mark and launcher assets.
 * Run with: node scripts/generate-art.js
 *
 * Everything is generated from one flat-vector visual language so the artwork
 * stays consistent: rounded geometry, indigo/copper/teal palette, diverse
 * human figures with varied tones, and no external dependencies or CDNs.
 */
const fs = require('node:fs');
const nodePath = require('node:path');
const zlib = require('node:zlib');

const ROOT = nodePath.resolve(__dirname, '..');
const ILL = nodePath.join(ROOT, 'assets', 'illustrations');
const BRAND = nodePath.join(ROOT, 'assets', 'brand');
fs.mkdirSync(ILL, { recursive: true });
fs.mkdirSync(BRAND, { recursive: true });

/* ---------- palette ------------------------------------------------------ */
const C = {
  ink: '#141B2E', ink2: '#26304A', inkSoft: '#3B4763',
  copper: '#C8703F', copperDark: '#A5542A', copperSoft: '#F3DCCE',
  teal: '#17705C', tealSoft: '#CDE7DE',
  canvas: '#F7F5F2', surface: '#FFFFFF',
  line: '#E1DDD6', muted: '#8C939F',
  skinA: '#F2C9A0', skinB: '#DE9E6A', skinC: '#9A5F33', skinD: '#6B3D1F',
  hairA: '#2B2118', hairB: '#4A2E1A', hairC: '#101318',
  ok: '#1F7A54', warn: '#C98A16', info: '#2A5C9A'
};

/* ---------- svg helpers -------------------------------------------------- */
const svg = (w, h, body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"${extra}>${body}</svg>`;
const rect = (x, y, w, h, fill, r = 0, opacity = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${opacity !== 1 ? ` opacity="${opacity}"` : ''}/>`;
const circle = (cx, cy, r, fill, opacity = 1) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${opacity !== 1 ? ` opacity="${opacity}"` : ''}/>`;
const ellipse = (cx, cy, rx, ry, fill, opacity = 1) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${opacity !== 1 ? ` opacity="${opacity}"` : ''}/>`;
const path = (d, fill = 'none', stroke = 'none', sw = 0, cap = 'round') => `<path d="${d}" fill="${fill}"${stroke !== 'none' ? ` stroke="${stroke}" stroke-width="${sw}" stroke-linecap="${cap}" stroke-linejoin="round"` : ''}/>`;
const line = (x1, y1, x2, y2, stroke, sw = 6) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
const group = (body, transform = '') => `<g${transform ? ` transform="${transform}"` : ''}>${body}</g>`;

/** A simple standing human figure. */
function person({ x = 0, y = 0, scale = 1, skin = C.skinB, hair = C.hairA, shirt = C.copper, pants = C.ink2, pose = 'stand', hairStyle = 'short' } = {}) {
  const parts = [];
  parts.push(circle(0, -46, 15, skin));                                  // head
  if (hairStyle === 'short') parts.push(path(`M-15 -50 a15 15 0 0 1 30 0 q-15 -8 -30 0 Z`, hair));
  if (hairStyle === 'bun') { parts.push(path(`M-15 -49 a15 15 0 0 1 30 0 q-15 -9 -30 0 Z`, hair)); parts.push(circle(0, -64, 8, hair)); }
  if (hairStyle === 'long') parts.push(path(`M-17 -50 a17 16 0 0 1 34 0 l1 22 q-5 -3 -6 -16 q-11 5 -23 0 q-1 13 -6 16 Z`, hair));
  if (hairStyle === 'hijab') parts.push(path(`M-16 -50 a16 16 0 0 1 32 0 l3 26 q-6 3 -7 -14 h-24 q-1 17 -7 14 Z`, shirt));
  if (hairStyle === 'hijab') parts.push(circle(0, -46, 12, skin));
  parts.push(rect(-15, -32, 30, 44, shirt, 13));                          // torso
  if (pose === 'work') {
    parts.push(rect(-31, -28, 12, 30, shirt, 6, 1), circle(-25, 0, 5.5, skin));   // arm reaching
    parts.push(rect(19, -30, 12, 26, shirt, 6), circle(25, -5, 5.5, skin));
  } else if (pose === 'phone') {
    parts.push(rect(-30, -28, 12, 34, shirt, 6), circle(-25, 4, 5.5, skin));
    parts.push(rect(18, -32, 12, 30, shirt, 6), circle(20, -4, 5.5, skin));
    parts.push(rect(16, -8, 13, 19, C.ink, 4));                            // phone
    parts.push(rect(18, -6, 9, 13, C.info, 2));
  } else if (pose === 'wave') {
    parts.push(rect(-30, -30, 12, 26, shirt, 6), circle(-25, -6, 5.5, skin));
    parts.push(rect(18, -58, 12, 34, shirt, 6), circle(24, -60, 6, skin));
  } else {
    parts.push(rect(-29, -28, 12, 34, shirt, 6), circle(-24, 4, 5.5, skin));
    parts.push(rect(17, -28, 12, 34, shirt, 6), circle(22, 4, 5.5, skin));
  }
  parts.push(rect(-14, 8, 12, 34, pants, 6), rect(2, 8, 12, 34, pants, 6)); // legs
  parts.push(rect(-18, 40, 17, 9, C.ink, 4), rect(1, 40, 17, 9, C.ink, 4)); // shoes
  return group(parts.join(''), `translate(${x} ${y}) scale(${scale})`);
}

/* ---------- brand mark --------------------------------------------------- */
function brandMark(size, { background = true } = {}) {
  const s = size / 64;
  const inner = [
    circle(32, 26, 14.5, C.copper),
    path('M32 47 C22.5 35.5 19 30.5 19 25.5 a13 13 0 1 1 26 0 c0 5 -3.5 10 -13 21.5 Z', C.copper),
    circle(32, 25, 7.6, C.surface),
    path('M27.4 25.2 l3.1 3.2 l6.3 -6.6', 'none', C.copperDark, 2.6),
    circle(45, 45, 3.4, C.teal)
  ].join('');
  const body = background
    ? rect(0, 0, 64, 64, C.ink, 16) + group(inner, `translate(0 2)`)
    : group(inner, `translate(0 2)`);
  return svg(64, 64, body);
}

/* ---------- scene helpers ------------------------------------------------ */
const scene = (w, h, body, bg = C.canvas) => svg(w, h, rect(0, 0, w, h, bg) + body);
const softBlob = (cx, cy, rx, ry, fill, opacity = 1) => ellipse(cx, cy, rx, ry, fill, opacity);
const floatCard = (x, y, w, h, label = C.surface) => group(rect(x, y, w, h, C.surface, 14) + rect(x + 12, y + 12, w - 24, 9, label, 4), `rotate(-2 ${x + w / 2} ${y + h / 2})`);
const star = (cx, cy, r, fill) => path(`M${cx} ${cy - r} L${cx + r * 0.29} ${cy - r * 0.31} L${cx + r} ${cy - r * 0.24} L${cx + r * 0.45} ${cy + r * 0.26} L${cx + r * 0.62} ${cy + r} L${cx} ${cy + r * 0.62} L${cx - r * 0.62} ${cy + r} L${cx - r * 0.45} ${cy + r * 0.26} L${cx - r} ${cy - r * 0.24} L${cx - r * 0.29} ${cy - r * 0.31} Z`, fill);
const checkBadge = (cx, cy, r, fill = C.ok) => group(circle(cx, cy, r, fill) + path(`M${cx - r * 0.42} ${cy + r * 0.02} l${r * 0.3} ${r * 0.32} l${r * 0.56} -${r * 0.62}`, 'none', C.surface, Math.max(3, r * 0.24)));
const pin = (cx, cy, s, fill = C.copper) => path(`M${cx} ${cy + 22 * s} C${cx - 13 * s} ${cy + 6 * s} ${cx - 15 * s} ${cy - 2 * s} ${cx - 15 * s} ${cy - 6 * s} a15 15 0 1 1 ${30 * s} 0 c0 ${4 * s} ${-2 * s} ${12 * s} ${-15 * s} ${28 * s} Z`, fill);

/* ---------- illustrations ------------------------------------------------ */
const art = {};

/* Landing hero: a calm domestic scene with a provider and a customer. */
art['hero-services'] = scene(640, 520, [
  softBlob(160, 130, 190, 150, C.copperSoft),
  softBlob(520, 420, 170, 140, C.tealSoft),
  // room
  rect(74, 250, 492, 190, C.surface, 26),
  rect(74, 250, 492, 12, C.line, 6),
  rect(120, 292, 150, 108, '#EAF1F7', 12),
  rect(120, 292, 150, 108, 'none', 12),
  line(195, 292, 195, 400, C.line, 6), line(120, 346, 270, 346, C.line, 6),
  rect(400, 300, 120, 100, '#F1EEE8', 12),
  rect(420, 318, 34, 82, C.ink2, 6), rect(466, 318, 34, 82, C.ink2, 6),
  // plant
  rect(438, 372, 44, 58, C.copperDark, 10),
  path('M460 372 q-30 -18 -34 -54 q30 6 34 40 Z', C.teal),
  path('M460 372 q26 -22 26 -58 q-30 12 -26 44 Z', C.teal),
  // provider at work
  person({ x: 250, y: 400, scale: 1.22, skin: C.skinC, hair: C.hairB, shirt: C.copper, pants: C.ink, pose: 'work' }),
  // customer with phone
  person({ x: 470, y: 404, scale: 1.16, skin: C.skinA, hair: C.hairC, shirt: C.teal, pants: C.ink2, pose: 'phone', hairStyle: 'bun' }),
  // floating proof cards
  floatCard(40, 44, 168, 70),
  star(72, 79, 13, C.warn),
  rect(94, 62, 92, 10, C.ink2, 5), rect(94, 80, 60, 9, C.line, 4),
  floatCard(430, 92, 176, 76),
  checkBadge(468, 130, 17, C.ok),
  rect(494, 112, 96, 10, C.ink2, 5), rect(494, 130, 64, 9, C.line, 4),
  // pin
  pin(576, 336, 1.5, C.copper),
  circle(576, 330, 6, C.surface)
].join(''));

/* Empty: no bookings yet */
art['empty-bookings'] = scene(520, 400, [
  softBlob(160, 120, 130, 100, C.copperSoft),
  softBlob(390, 300, 120, 96, C.tealSoft),
  rect(140, 96, 250, 210, C.surface, 20),
  rect(140, 96, 250, 46, C.ink, 20),
  rect(140, 122, 250, 20, C.ink),
  rect(172, 78, 10, 40, C.copper, 5), rect(348, 78, 10, 40, C.copper, 5),
  ...[0, 1, 2].map((i) => rect(172 + i * 62, 170, 44, 10, C.line, 5)),
  ...[0, 1, 2, 3].map((i) => rect(172 + (i % 3) * 62, 200 + Math.floor(i / 3) * 46, 44, 32, i === 4 ? C.copperSoft : '#F1EEE8', 8)),
  checkBadge(348, 268, 24, C.copper),
  person({ x: 430, y: 300, scale: 1.1, skin: C.skinB, hair: C.hairB, shirt: C.teal, pants: C.ink2, pose: 'wave', hairStyle: 'long' })
].join(''));

/* Empty: no search results */
art['empty-search'] = scene(520, 400, [
  softBlob(180, 130, 140, 110, C.tealSoft),
  rect(120, 110, 200, 150, C.surface, 16),
  rect(142, 132, 120, 12, C.line, 6), rect(142, 156, 156, 10, C.line, 5),
  rect(142, 186, 90, 46, '#F1EEE8', 10),
  rect(300, 150, 190, 140, C.surface, 16),
  rect(322, 172, 120, 12, C.line, 6), rect(322, 196, 146, 10, C.line, 5),
  rect(322, 226, 90, 44, '#F1EEE8', 10),
  group(circle(300, 268, 62, 'none') + path('M300 206 a62 62 0 1 0 0 124 a62 62 0 1 0 0 -124', C.surface, C.ink, 12), ''),
  circle(300, 268, 62, 'rgba(255,255,255,.75)'),
  path('M258 310 l-40 40', 'none', C.ink, 16),
  path('M278 250 q22 -18 44 0', 'none', C.muted, 9)
].join(''));

/* Empty: no providers in area */
art['empty-providers'] = scene(520, 400, [
  softBlob(260, 180, 200, 150, C.copperSoft),
  rect(96, 92, 328, 224, C.surface, 22),
  ...[0, 1, 2, 3, 4].map((i) => line(96, 138 + i * 44, 424, 138 + i * 44, '#F1EEE8', 6)),
  ...[0, 1, 2, 3, 4, 5].map((i) => line(140 + i * 50, 92, 140 + i * 50, 316, '#F1EEE8', 6)),
  path('M96 92 h328 v224 h-328 Z', 'none', C.line, 2),
  pin(180, 170, 1, C.copper), circle(180, 164, 5, C.surface),
  pin(390, 240, 1, C.muted), circle(390, 234, 5, C.surface),
  path('M300 150 q20 -16 40 0 t40 0', 'none', C.ink, 7),
  person({ x: 400, y: 340, scale: 1.15, skin: C.skinD, hair: C.hairB, shirt: C.teal, pants: C.ink, pose: 'wave', hairStyle: 'long' })
].join(''));

/* Empty: no messages */
art['empty-messages'] = scene(520, 400, [
  softBlob(170, 130, 140, 110, C.tealSoft),
  softBlob(370, 300, 130, 100, C.copperSoft),
  rect(120, 110, 210, 132, C.surface, 22),
  path('M160 242 l-18 32 l44 -14 Z', C.surface),
  rect(146, 140, 130, 12, C.line, 6), rect(146, 164, 158, 10, C.line, 5), rect(146, 186, 100, 10, C.line, 5),
  rect(240, 216, 40, 34, C.copper, 12),
  rect(200, 250, 200, 120, C.ink, 22),
  path('M362 370 l18 30 l-44 -14 Z', C.ink),
  rect(226, 278, 120, 11, 'rgba(255,255,255,.45)', 6), rect(226, 300, 148, 10, 'rgba(255,255,255,.3)', 5), rect(226, 322, 96, 10, 'rgba(255,255,255,.3)', 5)
].join(''));

/* Offline / recoverable error */
art['offline'] = scene(520, 400, [
  softBlob(260, 190, 200, 140, '#EDEAE4'),
  path('M170 230 a70 70 0 0 1 130 -30 a54 54 0 0 1 96 20 a46 46 0 0 1 -10 88 h-200 a52 52 0 0 1 -16 -78 Z', C.surface),
  path('M170 230 a70 70 0 0 1 130 -30 a54 54 0 0 1 96 20 a46 46 0 0 1 -10 88 h-200 a52 52 0 0 1 -16 -78 Z', 'none', C.line, 3),
  path('M186 258 l148 0', 'none', C.muted, 8),
  path('M232 268 l-16 26 M262 268 l-16 26 M292 268 l-16 26', 'none', C.copper, 6),
  circle(400, 214, 30, C.copper), rect(392, 200, 16, 22, C.surface, 4), line(400, 226, 400, 232, C.surface, 5)
].join(''));

/* Booking success */
art['success'] = scene(520, 400, [
  softBlob(260, 190, 190, 150, C.tealSoft),
  circle(260, 180, 92, C.surface), circle(260, 180, 92, C.ok, 0),
  path('M260 88 a92 92 0 1 1 0 184 a92 92 0 1 1 0 -184', 'none', C.ok, 8),
  path('M216 182 l32 34 l60 -70', 'none', C.ok, 18),
  star(150, 110, 16, C.warn), star(372, 96, 12, C.copper), star(396, 300, 14, C.warn), star(132, 288, 11, C.teal),
  person({ x: 110, y: 340, scale: 0.95, skin: C.skinA, hair: C.hairC, shirt: C.teal, pants: C.ink2, pose: 'wave', hairStyle: 'bun' })
].join(''));

/* Provider onboarding */
art['provider-onboarding'] = scene(520, 400, [
  softBlob(180, 140, 150, 120, C.copperSoft),
  softBlob(400, 300, 130, 100, C.tealSoft),
  person({ x: 230, y: 300, scale: 1.5, skin: C.skinB, hair: C.hairB, shirt: C.copper, pants: C.ink, pose: 'work' }),
  rect(330, 120, 140, 96, C.surface, 16),
  rect(350, 142, 66, 11, C.line, 5), rect(350, 162, 100, 10, C.line, 5), rect(350, 182, 46, 16, C.ok, 6),
  rect(60, 210, 118, 80, C.ink, 16),
  rect(78, 232, 70, 10, 'rgba(255,255,255,.4)', 5), rect(78, 252, 48, 10, 'rgba(255,255,255,.3)', 5),
  circle(96, 300, 14, C.warn), circle(140, 306, 14, C.warn), circle(118, 286, 14, C.warn)
].join(''));

/* Support */
art['support'] = scene(520, 400, [
  softBlob(260, 180, 200, 140, C.tealSoft),
  person({ x: 190, y: 320, scale: 1.35, skin: C.skinA, hair: C.hairB, shirt: C.teal, pants: C.ink2, pose: 'wave' }),
  path('M120 300 a70 70 0 0 1 140 0', 'none', C.ink, 14),
  rect(112, 292, 26, 52, C.ink, 12), rect(242, 292, 26, 52, C.ink, 12),
  path('M268 320 q46 0 46 -44', 'none', C.ink, 10), circle(314, 272, 12, C.copper),
  rect(316, 120, 150, 92, C.surface, 18),
  path('M342 210 l-16 30 l40 -14 Z', C.surface),
  rect(342, 148, 84, 11, C.line, 5), rect(342, 168, 106, 10, C.line, 5), rect(342, 188, 60, 10, C.line, 5)
].join(''));

/* Project / quotation flow */
art['project-quote'] = scene(520, 400, [
  softBlob(180, 130, 140, 110, C.copperSoft),
  rect(120, 96, 240, 250, C.surface, 18),
  rect(150, 128, 120, 13, C.ink2, 6), rect(150, 156, 176, 10, C.line, 5), rect(150, 178, 150, 10, C.line, 5),
  ...[0, 1, 2].map((i) => line(150, 212 + i * 34, 330, 212 + i * 34, '#F1EEE8', 5)),
  rect(150, 258, 100, 46, C.copperSoft, 10), rect(262, 258, 68, 46, C.tealSoft, 10),
  rect(268, 180, 190, 150, C.surface, 16),
  rect(292, 206, 96, 12, C.line, 6), rect(292, 230, 140, 10, C.line, 5),
  rect(292, 254, 70, 13, C.warn, 6), rect(292, 278, 110, 10, C.line, 5),
  checkBadge(430, 316, 20, C.ok),
  person({ x: 440, y: 340, scale: 1, skin: C.skinC, hair: C.hairA, shirt: C.copper, pants: C.ink, pose: 'phone' })
].join(''));

/* Category art: tutoring */
const catFrame = (id, inner) => scene(400, 300, [
  softBlob(120, 90, 120, 96, C.copperSoft),
  softBlob(310, 230, 110, 90, C.tealSoft),
  inner
].join(''));

art['cat-tutoring'] = catFrame('tutoring', [
  rect(96, 84, 208, 140, C.surface, 16),
  rect(96, 84, 208, 16, C.ink, 16),
  line(200, 100, 200, 224, C.line, 6),
  ...[0, 1, 2, 3].map((i) => line(120, 126 + i * 24, 184, 126 + i * 24, '#F1EEE8', 5)),
  ...[0, 1, 2].map((i) => line(216, 126 + i * 24, 284, 126 + i * 24, '#F1EEE8', 5)),
  person({ x: 260, y: 262, scale: 1.05, skin: C.skinB, hair: C.hairB, shirt: C.teal, pants: C.ink2, pose: 'work' }),
  circle(330, 110, 26, C.warn), path('M330 96 l6 13 l14 2 l-10 10 l3 14 l-13 -7 l-13 7 l3 -14 l-10 -10 l14 -2 Z', C.surface)
].join(''));

art['cat-renovation'] = catFrame('renovation', [
  rect(96, 150, 90, 90, C.surface, 10), rect(196, 130, 70, 110, C.surface, 10),
  rect(276, 168, 60, 72, C.surface, 10),
  ...[0, 1].map((i) => line(110, 170 + i * 22, 172, 170 + i * 22, '#F1EEE8', 5)),
  ...[0, 1].map((i) => line(208, 152 + i * 22, 258, 152 + i * 22, '#F1EEE8', 5)),
  path('M60 240 h280', 'none', C.ink, 8),
  person({ x: 320, y: 250, scale: 1.1, skin: C.skinD, hair: C.hairA, shirt: C.copper, pants: C.ink, pose: 'work' }),
  rect(30, 190, 46, 40, C.warn, 8)
].join(''));

art['cat-office'] = catFrame('office', [
  rect(80, 96, 240, 150, C.surface, 16),
  rect(80, 96, 240, 20, C.ink, 16),
  ...[0, 1, 2, 3].map((i) => rect(102 + i * 58, 132, 44, 30, '#F1EEE8', 8)),
  rect(102, 178, 148, 46, '#EDF1F5', 10),
  person({ x: 300, y: 258, scale: 1.15, skin: C.skinA, hair: C.hairC, shirt: C.ink2, pants: C.ink, pose: 'phone' }),
  line(40, 250, 360, 250, C.line, 8)
].join(''));

art['cat-other'] = catFrame('other', [
  circle(200, 140, 74, C.surface), circle(200, 140, 74, 'none'),
  ...[0, 1, 2, 3, 4, 5].map((i) => {
    const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
    const x = 200 + Math.cos(a) * 48; const y = 140 + Math.sin(a) * 48;
    return circle(x, y, 9, i % 2 ? C.copper : C.teal);
  }),
  circle(200, 140, 22, C.ink),
  person({ x: 100, y: 268, scale: 0.95, skin: C.skinC, hair: C.hairB, shirt: C.copper, pants: C.ink, pose: 'wave', hairStyle: 'long' }),
  person({ x: 310, y: 268, scale: 0.95, skin: C.skinA, hair: C.hairC, shirt: C.teal, pants: C.ink2, pose: 'wave', hairStyle: 'bun' })
].join(''));

/* Onboarding (public first-run) */
art['onboarding'] = scene(560, 420, [
  softBlob(180, 120, 150, 120, C.copperSoft),
  softBlob(400, 320, 140, 110, C.tealSoft),
  rect(150, 110, 260, 220, C.surface, 22),
  rect(150, 110, 260, 14, C.ink, 22),
  ...[0, 1, 2].map((i) => rect(178, 150 + i * 56, 60, 44, [C.copperSoft, C.tealSoft, '#EDF1F5'][i], 10)),
  ...[0, 1, 2].map((i) => rect(252, 158 + i * 56, 130, 12, C.line, 6) + rect(252, 178 + i * 56, 96, 10, '#F1EEE8', 5)),
  checkBadge(410, 300, 30, C.ok)
].join(''));

/* ---------- write illustrations ----------------------------------------- */
for (const [name, content] of Object.entries(art)) {
  fs.writeFileSync(nodePath.join(ILL, `${name}.svg`), content);
}

/* keep the legacy filenames referenced by older bundles working */
fs.writeFileSync(nodePath.join(ILL, 'service-home.svg'), art['hero-services']);
fs.writeFileSync(nodePath.join(ILL, 'project.svg'), art['project-quote']);
fs.writeFileSync(nodePath.join(ILL, 'empty-bookings.svg'), art['empty-bookings']);

/* ---------- brand svg --------------------------------------------------- */
fs.writeFileSync(nodePath.join(BRAND, 'icon.svg'), brandMark(64));
fs.writeFileSync(nodePath.join(BRAND, 'mark.svg'), brandMark(64, { background: false }));
fs.writeFileSync(nodePath.join(BRAND, 'splash.svg'), svg(1080, 1920, rect(0, 0, 1080, 1920, C.canvas) + group(rect(0, 0, 64, 64, 'none') + brandMark(64).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''), 'translate(410 800) scale(4.05)') + path('M360 1120 q180 60 360 0', 'none', C.copper, 10)));

/* ---------- PNG rasteriser (dependency free) ---------------------------- */
/** Signed-distance helpers for analytic anti-aliasing of simple shapes. */
function makeCanvas(w, h, bg) {
  const data = Buffer.alloc(w * h * 4);
  const [r, g, b] = hexToRgb(bg);
  for (let i = 0; i < w * h; i += 1) { data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255; }
  return { w, h, data };
}
function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
function blend(canvas, x, y, color, alpha) {
  if (alpha <= 0 || x < 0 || y < 0 || x >= canvas.w || y >= canvas.h) return;
  const a = Math.min(1, alpha);
  const i = (y * canvas.w + x) * 4;
  const [r, g, b] = color;
  canvas.data[i] = Math.round(canvas.data[i] * (1 - a) + r * a);
  canvas.data[i + 1] = Math.round(canvas.data[i + 1] * (1 - a) + g * a);
  canvas.data[i + 2] = Math.round(canvas.data[i + 2] * (1 - a) + b * a);
  canvas.data[i + 3] = 255;
}
function roundedRect(canvas, x, y, w, h, radius, hex, alpha = 1) {
  const color = hexToRgb(hex);
  for (let py = Math.floor(y); py < Math.ceil(y + h); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + w); px += 1) {
      const dx = Math.max(x + radius - px - 0.5, 0, px + 0.5 - (x + w - radius));
      const dy = Math.max(y + radius - py - 0.5, 0, py + 0.5 - (y + h - radius));
      const d = Math.hypot(dx, dy) - radius;
      blend(canvas, px, py, color, Math.min(1, 0.5 - d) * alpha);
    }
  }
}
function circleFill(canvas, cx, cy, r, hex, alpha = 1) {
  const color = hexToRgb(hex);
  const min = Math.max(0, Math.floor(cx - r - 1)); const max = Math.min(canvas.w - 1, Math.ceil(cx + r + 1));
  const minY = Math.max(0, Math.floor(cy - r - 1)); const maxY = Math.min(canvas.h - 1, Math.ceil(cy + r + 1));
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = min; px <= max; px += 1) {
      const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - r;
      blend(canvas, px, py, color, Math.min(1, 0.5 - d) * alpha);
    }
  }
}
function png(canvas) {
  const raw = Buffer.alloc((canvas.w * 4 + 1) * canvas.h);
  for (let y = 0; y < canvas.h; y += 1) {
    raw[y * (canvas.w * 4 + 1)] = 0;
    canvas.data.copy(raw, y * (canvas.w * 4 + 1) + 1, y * canvas.w * 4, (y + 1) * canvas.w * 4);
  }
  const chunk = (type, body) => {
    const out = Buffer.alloc(8 + body.length + 4);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, 'ascii');
    body.copy(out, 8);
    out.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, 'ascii'), body])) >>> 0, 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.w, 0); ihdr.writeUInt32BE(canvas.h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
let crcTable = null;
function crc(buf) {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** Draw the brand mark into a square canvas. */
function iconCanvas(size, { bleed = 0 } = {}) {
  const canvas = makeCanvas(size, size, '#00000000');
  const s = size / 64; const o = bleed * size;
  // transparent background handled by clearing alpha
  for (let i = 3; i < canvas.data.length; i += 4) canvas.data[i] = 0;
  if (bleed === 0) roundedRect(canvas, 0, 0, size, size, 16 * s, C.ink);
  const pinCx = size / 2; const pinTop = size * 0.16;
  circleFill(canvas, pinCx, pinTop + 15.5 * s, 15.5 * s, C.copper);
  // pin tail
  for (let t = 0; t <= 1; t += 0.002) {
    const y = pinTop + 15.5 * s + t * 24 * s;
    const r = 15.5 * s * (1 - t) * (1 - t * 0.35);
    circleFill(canvas, pinCx, y, Math.max(1, r), C.copper);
  }
  circleFill(canvas, pinCx, pinTop + 15.5 * s, 8.1 * s, C.surface);
  // check mark inside the pin
  for (let t = 0; t <= 1; t += 0.004) {
    const x = pinCx - 5.6 * s + t * 4.2 * s; const y = pinTop + 15.8 * s + Math.abs(t - 0.5) * 0 ;
    circleFill(canvas, x, pinTop + 15.3 * s + t * 2.2 * s * 0, 1.7 * s, C.copperDark);
  }
  for (let t = 0; t <= 1; t += 0.004) {
    circleFill(canvas, pinCx - 5.2 * s + t * 3.2 * s, pinTop + 15.6 * s + t * 2.6 * s, 1.8 * s, C.copperDark);
    circleFill(canvas, pinCx - 2 * s + t * 7.6 * s, pinTop + 18.2 * s - t * 5.6 * s, 1.8 * s, C.copperDark);
  }
  circleFill(canvas, size * 0.71, size * 0.72, 3.5 * s, C.teal);
  return canvas;
}
function splashCanvas(w, h) {
  const canvas = makeCanvas(w, h, C.canvas);
  const size = Math.round(Math.min(w, h) * 0.34);
  const mark = iconCanvas(size);
  const ox = Math.round((w - size) / 2); const oy = Math.round(h / 2 - size / 2 - h * 0.04);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const i = (y * size + x) * 4;
    const a = mark.data[i + 3] / 255;
    if (a > 0) blend(canvas, ox + x, oy + y, [mark.data[i], mark.data[i + 1], mark.data[i + 2]], a);
  }
  // subtle copper arc beneath the mark
  const cx = w / 2; const cy = oy + size + size * 0.55; const r = size * 0.9;
  for (let a = Math.PI * 1.15; a <= Math.PI * 1.85; a += 0.002) {
    circleFill(canvas, cx + Math.cos(a) * r, cy + Math.sin(a) * r, size * 0.022, C.copper, 0.9);
  }
  return canvas;
}

fs.writeFileSync(nodePath.join(BRAND, 'icon-192.png'), png(iconCanvas(192)));
fs.writeFileSync(nodePath.join(BRAND, 'icon-512.png'), png(iconCanvas(512)));
fs.writeFileSync(nodePath.join(BRAND, 'splash.png'), png(splashCanvas(1080, 1920)));

/* ---------- Android launcher + splash ---------------------------------- */
const ANDROID_RES = nodePath.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const mipmapSizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const foregroundSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
if (fs.existsSync(ANDROID_RES)) {
  for (const [density, size] of Object.entries(mipmapSizes)) {
    const dir = nodePath.join(ANDROID_RES, `mipmap-${density}`);
    if (!fs.existsSync(dir)) continue;
    fs.writeFileSync(nodePath.join(dir, 'ic_launcher.png'), png(iconCanvas(size)));
    fs.writeFileSync(nodePath.join(dir, 'ic_launcher_round.png'), png(iconCanvas(size)));
  }
  for (const [density, size] of Object.entries(foregroundSizes)) {
    const dir = nodePath.join(ANDROID_RES, `mipmap-${density}`);
    if (!fs.existsSync(dir)) continue;
    fs.writeFileSync(nodePath.join(dir, 'ic_launcher_foreground.png'), png(iconCanvas(size, { bleed: 0.22 })));
  }
  const splashDirs = [
    ['drawable', [1080, 1920]], ['drawable-port-mdpi', [320, 480]], ['drawable-port-hdpi', [480, 800]],
    ['drawable-port-xhdpi', [720, 1280]], ['drawable-port-xxhdpi', [960, 1600]], ['drawable-port-xxxhdpi', [1280, 1920]],
    ['drawable-land-mdpi', [480, 320]], ['drawable-land-hdpi', [800, 480]], ['drawable-land-xhdpi', [1280, 720]],
    ['drawable-land-xxhdpi', [1600, 960]], ['drawable-land-xxxhdpi', [1920, 1280]]
  ];
  for (const [dir, [w, h]] of splashDirs) {
    const full = nodePath.join(ANDROID_RES, dir);
    if (!fs.existsSync(full)) continue;
    fs.writeFileSync(nodePath.join(full, 'splash.png'), png(splashCanvas(w, h)));
  }
}

console.log(`Art generated: ${Object.keys(art).length} illustrations, brand mark, PNG icons, Android launcher and splash assets.`);
