/**
 * Static guard for native form validation.
 *
 * A number input whose `step` does not divide evenly into its `min` silently
 * rejects the obvious values a person would type. `min="1" step="50"` accepts
 * 1, 51, 101 … and refuses 2500, so the browser blocks submission and the form
 * looks broken with no error message. This checks every `type="number"` input
 * in the front-end templates and fails the build if one can be tripped up.
 */
const fs = require('node:fs');
const nodePath = require('node:path');

const root = nodePath.resolve(__dirname, '..');
const srcDir = nodePath.join(root, 'src');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = nodePath.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const problems = [];
let checked = 0;

for (const file of walk(srcDir)) {
  const text = fs.readFileSync(file, 'utf8');
  const numbers = text.match(/<input\b[^>]*type="number"[^>]*>/g) || [];
  for (const tag of numbers) {
    checked += 1;
    const id = (tag.match(/id="([^"]*)"/) || [])[1] || '(no id)';
    const stepRaw = (tag.match(/step="([^"]*)"/) || [])[1];
    const minRaw = (tag.match(/min="([^"]*)"/) || [])[1];
    if (stepRaw === undefined || stepRaw === 'any') continue;
    const step = Number(stepRaw);
    const min = minRaw === undefined ? 0 : Number(minRaw);
    if (!Number.isFinite(step) || step <= 0) {
      problems.push(`${nodePath.relative(root, file)} :: ${id} has an invalid step="${stepRaw}"`);
      continue;
    }
    if (!Number.isFinite(min)) continue;
    // Values are min + n*step, so min must itself land on the step grid.
    if (min % step !== 0) {
      problems.push(
        `${nodePath.relative(root, file)} :: ${id} (min=${min}, step=${step}) accepts only ` +
        `${min + step}, ${min + step * 2} … and refuses round values like ${Math.ceil(min / step) * step + step}`
      );
    }
  }
}

if (problems.length) {
  console.error(`✗ ${problems.length} number input(s) would reject ordinary values:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`✓ ${checked} number inputs accept the values people actually type`);
