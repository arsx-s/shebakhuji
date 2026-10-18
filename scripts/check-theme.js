/**
 * Theme guard.
 *
 * The appearance system has one rule that is easy to break by accident: the two
 * dark token blocks (`[data-theme="dark"]` and the `system` block inside the
 * operating-system media query) must define exactly the same properties, and
 * every dark property must have a light counterpart in `:root`. When they drift,
 * one of the three appearance modes silently renders with the wrong colour —
 * exactly the half-themed result this design avoids.
 *
 * It also proves that the two theme colours the browser paints its own chrome
 * with (`meta[name=theme-color]`, updated by src/theme.js) are the real canvas
 * values from the tokens, and that index.html still applies the appearance
 * before the stylesheet loads.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'assets/styles/app.css'), 'utf8');
const themeJs = fs.readFileSync(path.join(root, 'src/theme.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const problems = [];

/* ---------- helpers -------------------------------------------------------- */
function blockAfter(source, marker) {
  const at = source.indexOf(marker);
  if (at < 0) return null;
  const open = source.indexOf('{', at);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

const properties = (block) => {
  const found = new Map();
  for (const line of String(block || '').split('\n')) {
    const match = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
    if (match) found.set(match[1], match[2].trim());
  }
  return found;
};

/* ---------- 1. the three token blocks -------------------------------------- */
const light = properties(blockAfter(css, ':root {'));
const dark = properties(blockAfter(css, ':root[data-theme="dark"]'));
const systemDark = properties(blockAfter(css, ':root[data-theme="system"]'));

if (!light.size) problems.push('could not read the light token block (:root)');
if (!dark.size) problems.push('could not read :root[data-theme="dark"]');
if (!systemDark.size) problems.push('could not read the system dark block inside the media query');

if (dark.size && systemDark.size) {
  for (const [name, value] of dark) {
    if (!systemDark.has(name)) problems.push(`dark block defines ${name} but the system dark block does not`);
    else if (systemDark.get(name) !== value) problems.push(`${name} differs between the two dark blocks (${value} vs ${systemDark.get(name)})`);
  }
  for (const name of systemDark.keys()) {
    if (!dark.has(name)) problems.push(`system dark block defines ${name} but the dark block does not`);
  }
}

if (light.size && dark.size) {
  for (const name of dark.keys()) {
    if (!light.has(name)) problems.push(`dark block defines ${name} with no light default in :root`);
  }
}

/* ---------- 2. browser chrome colours match the canvas --------------------- */
const declared = {};
const declaredMatch = themeJs.match(/THEME_COLORS\s*=\s*\{([^}]+)\}/);
if (declaredMatch) {
  for (const pair of declaredMatch[1].split(',')) {
    const [key, value] = pair.split(':').map((part) => (part || '').trim());
    if (key && value) declared[key.replace(/['"]/g, '')] = value.replace(/['"]/g, '');
  }
} else {
  problems.push('src/theme.js no longer declares THEME_COLORS');
}

for (const [mode, block] of [['light', light], ['dark', dark]]) {
  const canvas = block.get('--canvas');
  if (!canvas) { problems.push(`${mode} tokens do not define --canvas`); continue; }
  if (declared[mode] && declared[mode].toLowerCase() !== canvas.toLowerCase()) {
    problems.push(`THEME_COLORS.${mode} (${declared[mode]}) does not match the ${mode} --canvas (${canvas})`);
  }
}

/* ---------- 3. the no-flash boot path ------------------------------------- */
const themeMetas = html.match(/<meta name="theme-color"[^>]*>/g) || [];
if (themeMetas.length !== 1) problems.push(`index.html must have exactly one theme-color meta (found ${themeMetas.length})`);
if (/<meta name="theme-color"[^>]*media=/.test(themeMetas[0] || '')) {
  problems.push('the theme-color meta must not be media-scoped: src/theme.js updates the single tag instead');
}
if (!/shebashathi\.theme/.test(html)) problems.push('index.html no longer restores the stored theme before the stylesheet');
if (!/shebashathi\.motion/.test(html)) problems.push('index.html no longer restores the stored motion preference before the stylesheet');
const scriptAt = html.indexOf('shebashathi.theme');
const styleAt = html.indexOf('<link rel="stylesheet"');
if (scriptAt < 0 || styleAt < 0 || scriptAt > styleAt) {
  problems.push('the appearance script must run before the stylesheet link, or a reload flashes the wrong theme');
}

/* ---------- result --------------------------------------------------------- */
if (problems.length) {
  console.error(`✗ theme tokens inconsistent (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`✓ theme tokens consistent (${light.size} light, ${dark.size} dark, ${systemDark.size} system-dark)`);
