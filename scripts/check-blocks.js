/**
 * Guard against "computed but never rendered" UI blocks.
 *
 * A view often builds an optional chunk of markup like:
 *
 *   const addOnBlock = selectedListing && something ? `...` : '';
 *   return `<div class="stack">${packageBlock}</div>`;
 *
 * If the interpolation is forgotten, the code still parses, the tests still
 * pass and the page still looks fine — the section is simply never shown, and
 * the feature behind it (choosing add-ons, in the bug this check was written
 * for) is unreachable from the UI.
 *
 * This check walks every `src/` module, finds local names assigned a template
 * literal (or a ternary ending in one), and requires each name to appear at
 * least once more inside a template interpolation in the same file.
 */
const fs = require('node:fs');
const nodePath = require('node:path');

const root = nodePath.resolve(__dirname, '..');
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = nodePath.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
})(nodePath.join(root, 'src'));

/* const name = `...`  or  const name = cond ? `...` : `...` */
const DECLARATION = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*`/g;

let failures = 0;
let checked = 0;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const names = new Set();
  let match;
  DECLARATION.lastIndex = 0;
  while ((match = DECLARATION.exec(source)) !== null) names.add(match[1]);

  for (const name of names) {
    checked += 1;
    /* A name that occurs only where it is declared is dead markup: it is never
       interpolated, returned, spread into an object or passed to a helper. */
    const occurrences = source.match(new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`, 'g')) || [];
    if (occurrences.length < 2) {
      failures += 1;
      console.error(`✗ ${nodePath.relative(root, file)}: "${name}" is built from a template but never used`);
    }
  }
}

if (failures) { console.error(`${failures} unused markup block(s)`); process.exit(1); }
console.log(`✓ ${checked} markup blocks are interpolated somewhere in their file`);
