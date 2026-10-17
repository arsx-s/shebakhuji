const fs = require('node:fs');
const nodePath = require('node:path');

const root = nodePath.resolve(__dirname, '..');
const out = nodePath.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const files = ['index.html', 'manifest.webmanifest', 'sw.js'];
for (const file of files) fs.copyFileSync(nodePath.join(root, file), nodePath.join(out, file));

for (const dir of ['assets', 'src']) {
  fs.cpSync(nodePath.join(root, dir), nodePath.join(out, dir), { recursive: true });
}
// src/package.json only exists to tell Node the browser modules are ESM.
fs.rmSync(nodePath.join(out, 'src', 'package.json'), { force: true });

/* Native builds must never ship the emulator address. When
   SHEBASHATHI_API_BASE is provided, rewrite the compiled config for the
   native bundle. Development builds keep 10.0.2.2 (the Android emulator's
   alias for the host machine) and say so in the log. */
const configPath = nodePath.join(out, 'src', 'config.js');
const apiBase = process.env.SHEBASHATHI_API_BASE;
if (apiBase) {
  const source = fs.readFileSync(configPath, 'utf8');
  fs.writeFileSync(configPath, source.replace(
    /export const NATIVE_API_BASE = '[^']*';/,
    `export const NATIVE_API_BASE = '${apiBase.replace(/'/g, "\\'")}';`
  ));
  console.log(`Native API base set to ${apiBase}`);
} else {
  console.log('Native API base left at the emulator default (http://10.0.2.2:3000/api). Set SHEBASHATHI_API_BASE for a release build.');
}

const missing = [];
for (const file of [...files, 'src/app.js', 'assets/styles/app.css', 'assets/coolicons-sprite.svg']) {
  if (!fs.existsSync(nodePath.join(out, file))) missing.push(file);
}
if (missing.length) {
  console.error(`Prepared bundle is incomplete: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`Prepared ${out}`);
