/**
 * Vendor the MapLibre GL JS browser build into assets/vendor/maplibre/.
 *
 * The app has no CDN and no bundler: every byte it runs must live in this
 * repository so the web app, the offline shell and the Capacitor bundle all
 * serve the exact same file. MapLibre ships an ES-module build plus a worker
 * that it resolves relative to `import.meta.url`, so the two files must stay
 * siblings.
 *
 * Run automatically by `npm run web:prepare` (and therefore by the Android
 * build), and manually with `npm run vendor:map` after upgrading the package.
 */
const fs = require('node:fs');
const nodePath = require('node:path');

const root = nodePath.resolve(__dirname, '..');
const source = nodePath.join(root, 'node_modules', 'maplibre-gl', 'dist');
const target = nodePath.join(root, 'assets', 'vendor', 'maplibre');

const FILES = ['maplibre-gl.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css'];

if (!fs.existsSync(source)) {
  console.error('MapLibre is not installed. Run `npm install` first.');
  process.exit(1);
}

fs.mkdirSync(target, { recursive: true });
let bytes = 0;
for (const file of FILES) {
  const from = nodePath.join(source, file);
  if (!fs.existsSync(from)) {
    console.error(`Missing dist file: ${file}`);
    process.exit(1);
  }
  fs.copyFileSync(from, nodePath.join(target, file));
  bytes += fs.statSync(from).size;
}

const version = JSON.parse(fs.readFileSync(nodePath.join(root, 'node_modules', 'maplibre-gl', 'package.json'), 'utf8')).version;
fs.writeFileSync(
  nodePath.join(target, 'VERSION'),
  `maplibre-gl ${version}\nCopied from node_modules by scripts/vendor-map.js. Do not edit.\nLicense: BSD-3-Clause (https://github.com/maplibre/maplibre-gl-js)\n`
);

console.log(`✓ vendored MapLibre ${version} (${Math.round(bytes / 1024)} KB) into assets/vendor/maplibre/`);
