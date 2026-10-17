/**
 * Syntax-check ES modules without a bundler.
 * Node parses `.mjs` as an ES module, so each source file is copied to a
 * temporary `.mjs` sibling and validated with `node --check`.
 */
const fs = require('node:fs');
const os = require('node:os');
const nodePath = require('node:path');
const { spawnSync } = require('node:child_process');

const root = nodePath.resolve(__dirname, '..');
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = nodePath.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
})(nodePath.join(root, 'src'));

const tmp = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'shebashathi-check-'));
let failures = 0;
for (const file of files) {
  const target = nodePath.join(tmp, nodePath.basename(file).replace(/\.js$/, '.mjs'));
  fs.copyFileSync(file, target);
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures += 1;
    console.error(`✗ ${nodePath.relative(root, file)}\n${result.stderr}`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
if (failures) { console.error(`${failures} file(s) failed syntax check`); process.exit(1); }
console.log(`✓ ${files.length} ES modules parsed successfully`);
