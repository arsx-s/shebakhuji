/**
 * Asset integrity check.
 * Every local asset referenced from the HTML, the views and the stylesheet
 * must exist on disk, so a missing illustration, photo or icon sprite fails
 * the build instead of rendering a broken image at runtime.
 */
const fs = require('node:fs');
const nodePath = require('node:path');

const root = nodePath.resolve(__dirname, '..');
const problems = [];

function walk(dir, filter, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'www' || entry.name === 'android') continue;
    const full = nodePath.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

const sources = [
  nodePath.join(root, 'index.html'),
  nodePath.join(root, 'manifest.webmanifest'),
  nodePath.join(root, 'sw.js'),
  ...walk(nodePath.join(root, 'src'), (f) => f.endsWith('.js')),
  ...walk(nodePath.join(root, 'assets', 'styles'), (f) => f.endsWith('.css'))
];

const assetPattern = /['"(](?:\.{1,2}\/)*(assets\/[A-Za-z0-9_\-./]+\.(?:svg|png|jpg|jpeg|webp|css|mjs|woff2?))['")]/g;

for (const source of sources) {
  const text = fs.readFileSync(source, 'utf8');
  for (const match of text.matchAll(assetPattern)) {
    const rel = match[1];
    if (!fs.existsSync(nodePath.join(root, rel))) {
      problems.push(`${nodePath.relative(root, source)} → missing ${rel}`);
    }
  }
}

/* Every service record needs artwork: either a photo or an illustration. */
const server = fs.readFileSync(nodePath.join(root, 'server.js'), 'utf8');
for (const match of server.matchAll(/(?:photo|art): '([^']+)'/g)) {
  if (!fs.existsSync(nodePath.join(root, match[1]))) problems.push(`server.js catalog → missing ${match[1]}`);
}

/* Icon names used with icon('Name') should exist in the sprite. */
const sprite = fs.readFileSync(nodePath.join(root, 'assets', 'coolicons-sprite.svg'), 'utf8');
const symbolIds = new Set([...sprite.matchAll(/<symbol[^>]*id="([^"]+)"/g)].map((m) => m[1]));
const knownMissingIcons = new Set();
function checkIcons(file, text) {
  for (const pattern of [/icon\(\s*'([A-Za-z0-9_\-]+)'/g, /icon:\s*'([A-Za-z0-9_\-]+)'/g, /ic:\s*'([A-Za-z0-9_\-]+)'/g]) {
    for (const match of text.matchAll(pattern)) {
      if (!symbolIds.has(match[1]) && !knownMissingIcons.has(match[1])) {
        knownMissingIcons.add(match[1]);
        problems.push(`${nodePath.relative(root, file)} → icon "${match[1]}" not in sprite`);
      }
    }
  }
}
for (const source of sources.filter((f) => f.endsWith('.js'))) checkIcons(source, fs.readFileSync(source, 'utf8'));
checkIcons(nodePath.join(root, 'server.js'), server);

if (problems.length) {
  console.error(`✗ ${problems.length} asset problem(s):`);
  for (const problem of problems) console.error('  ' + problem);
  process.exit(1);
}
console.log(`✓ ${sources.length} sources referenced only existing assets (${symbolIds.size} sprite icons)`);
