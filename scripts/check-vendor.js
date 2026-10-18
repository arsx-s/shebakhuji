/**
 * Vendored dependency check.
 *
 * MapLibre is committed into assets/vendor/maplibre/ so the app can lazy-load
 * a real map without a CDN and without a bundler. The worker and the main
 * module must stay in step, so this check fails when the vendored copy is
 * missing or no longer matches the installed package version.
 */
const fs = require('node:fs');
const nodePath = require('node:path');

const root = nodePath.resolve(__dirname, '..');
const vendor = nodePath.join(root, 'assets', 'vendor', 'maplibre');
const installed = nodePath.join(root, 'node_modules', 'maplibre-gl', 'dist');
const FILES = ['maplibre-gl.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css'];

const problems = [];
for (const file of FILES) {
  const copy = nodePath.join(vendor, file);
  if (!fs.existsSync(copy) || fs.statSync(copy).size === 0) {
    problems.push(`assets/vendor/maplibre/${file} is missing — run \`npm run vendor:map\``);
    continue;
  }
  // node_modules is optional at check time (a fresh clone runs npm install),
  // but when it is present the vendored copy must not be stale.
  const source = nodePath.join(installed, file);
  if (fs.existsSync(source) && fs.statSync(source).size !== fs.statSync(copy).size) {
    problems.push(`assets/vendor/maplibre/${file} differs from node_modules — run \`npm run vendor:map\``);
  }
}

if (problems.length) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exit(1);
}
const size = FILES.reduce((total, file) => total + fs.statSync(nodePath.join(vendor, file)).size, 0);
console.log(`✓ vendored MapLibre build present (${FILES.length} files, ${Math.round(size / 1024)} KB)`);
