/**
 * Removes data created by the integration test suite from the development
 * database, then recomputes derived values (provider ratings).
 *
 * The suite runs against a throwaway database (SHEBASHATHI_DB), so this script
 * only exists to tidy up databases that were polluted before that isolation
 * was added. It matches on the exact fixtures the tests create, backs the
 * database up first, and prints everything it removes.
 *
 *   node scripts/clean-test-data.js                      # dry run
 *   node scripts/clean-test-data.js --apply              # write changes
 *   node scripts/clean-test-data.js --since=2026-10-18   # anything created on/after
 *
 * --since also removes records created by manual browser QA, which share no
 * fixture names with the test suite. Records without a createdAt are kept.
 */
const fs = require('node:fs');
const nodePath = require('node:path');

const root = nodePath.resolve(__dirname, '..');
const dbPath = process.env.SHEBASHATHI_DB ? nodePath.resolve(process.env.SHEBASHATHI_DB) : nodePath.join(root, 'data', 'database.json');
const apply = process.argv.includes('--apply');
const sinceArg = process.argv.find((a) => a.startsWith('--since='));
const since = sinceArg ? new Date(sinceArg.slice('--since='.length)).getTime() : null;

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

/** True when a record carries a createdAt at or after the --since instant. */
const createdSince = (item) => {
  if (!since || !item || !item.createdAt) return false;
  const at = new Date(item.createdAt).getTime();
  return Number.isFinite(at) && at >= since;
};

const TEST_NAMES = new Set(['পরীক্ষা ব্যবহারকারী', 'রফিক আহমেদ']);
const TEST_REQUEST_TEXT = 'রান্নাঘরের সিঙ্ক থেকে পানি পড়ছে';
const TEST_LISTING_TITLE = 'বাথরুম ফিটিং প্যাকেজ';
const TEST_CASE_TEXT = 'বুকিং সংক্রান্ত একটি পরীক্ষামূলক সমস্যা';

const seededIds = new Set(['customer-1', 'worker-1', 'admin-1']);

const testUserIds = new Set(
  db.users
    .filter((u) => !seededIds.has(u.id) && (TEST_NAMES.has(u.name) || /^(0199|0188)/.test(String(u.phone || ''))))
    .map((u) => u.id)
);
const testRequestIds = new Set(db.requests.filter((r) => r.description === TEST_REQUEST_TEXT).map((r) => r.id));
const testBookingIds = new Set(db.bookings.filter((b) => testRequestIds.has(b.requestId)).map((b) => b.id));
const testListingIds = new Set(db.listings.filter((l) => l.title === TEST_LISTING_TITLE).map((l) => l.id));
const testCaseIds = new Set((db.supportCases || []).filter((c) => c.description === TEST_CASE_TEXT).map((c) => c.id));
const testPayoutIds = new Set(
  (db.payouts || [])
    .filter((p) => p.amount === 100 && ['REQUESTED', 'PAID'].includes(p.status) && String(p.createdAt || '') >= '2026-10-17')
    .map((p) => p.id)
);

if (since) {
  for (const u of db.users) if (!seededIds.has(u.id) && createdSince(u)) testUserIds.add(u.id);
  for (const r of db.requests) if (createdSince(r)) testRequestIds.add(r.id);
  for (const b of db.bookings) if (createdSince(b)) testBookingIds.add(b.id);
  for (const l of db.listings) if (createdSince(l)) testListingIds.add(l.id);
  for (const c of db.supportCases || []) if (createdSince(c)) testCaseIds.add(c.id);
  for (const p of db.payouts || []) if (createdSince(p)) testPayoutIds.add(p.id);
}

const removed = {};
function prune(key, predicate) {
  if (!Array.isArray(db[key])) return;
  const before = db[key].length;
  db[key] = db[key].filter((item) => !predicate(item));
  removed[key] = before - db[key].length;
}

prune('users', (u) => testUserIds.has(u.id));
prune('requests', (r) => testRequestIds.has(r.id));
prune('offers', (o) => testRequestIds.has(o.requestId) || testUserIds.has(o.workerId) || createdSince(o));
prune('bookings', (b) => testBookingIds.has(b.id));
prune('bookingEvents', (e) => testBookingIds.has(e.bookingId) || createdSince(e));
prune('messages', (m) => testBookingIds.has(m.bookingId) || createdSince(m));
prune('reviews', (r) => testBookingIds.has(r.bookingId) || createdSince(r));
prune('listings', (l) => testListingIds.has(l.id) || testUserIds.has(l.workerId));
prune('supportCases', (c) => testCaseIds.has(c.id) || testUserIds.has(c.customerId));
prune('payouts', (p) => testPayoutIds.has(p.id) || testUserIds.has(p.workerId));
prune('notifications', (n) => testUserIds.has(n.userId) || testRequestIds.has(n.entityId) || testBookingIds.has(n.entityId) || createdSince(n));
prune('invoices', (i) => testBookingIds.has(i.bookingId) || createdSince(i));
prune('transactions', (t) => testBookingIds.has(t.bookingId) || createdSince(t));
prune('favorites', (f) => testUserIds.has(f.userId) || createdSince(f));
/* Sessions are just logins; clearing them is safe and removes stale tokens. */
if (Array.isArray(db.sessions)) { removed.sessions = db.sessions.length; db.sessions = []; }

/* Provider ratings are derived from reviews, so recompute them. */
for (const user of db.users.filter((u) => u.role === 'WORKER')) {
  const byWorker = db.reviews.filter((r) => {
    const booking = db.bookings.find((b) => b.id === r.bookingId);
    return booking && booking.workerId === user.id;
  });
  const average = byWorker.length ? Math.round((byWorker.reduce((sum, r) => sum + r.rating, 0) / byWorker.length) * 10) / 10 : null;
  user.rating = average;
  user.ratingCount = byWorker.length;
}

console.log(`${apply ? 'Applying to' : 'Dry run on'} ${dbPath}`);
for (const [key, count] of Object.entries(removed)) {
  if (count) console.log(`  - ${key}: ${count} removed (now ${db[key].length})`);
}
console.log('Remaining:', Object.entries(db).filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => `${k}=${v.length}`).join(' '));
console.log('Providers:', db.users.filter((u) => u.role === 'WORKER').map((u) => `${u.name} (${u.rating ?? '—'})`).join(', '));

if (apply) {
  const backupDir = nodePath.join(root, 'data', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = nodePath.join(backupDir, `database-${stamp}.json`);
  fs.copyFileSync(dbPath, backup);
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log('Backup written to', nodePath.relative(root, backup));
  console.log('Database updated.');
} else {
  console.log('\nDry run only. Re-run with --apply to write.');
}
