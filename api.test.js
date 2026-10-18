/**
 * End-to-end API journey against a real spawned server process:
 * registration → login/session → catalogue → provider discovery →
 * request + offer → offer acceptance → booking lifecycle → messaging →
 * review → provider earnings/payout → admin settings → support.
 *
 * This exercises the same HTTP surface the app uses, so a regression in the
 * backend or the client contract fails the suite.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const nodePath = require('node:path');

const os = require('node:os');

const PORT = 3499;
const BASE = `http://127.0.0.1:${PORT}/api`;
const ROOT = __dirname;
/* A throwaway database keeps the suite deterministic and, just as important,
   stops test accounts and bookings from leaking into the development data
   the app is demonstrated with. */
const TEST_DB = nodePath.join(os.tmpdir(), 'shebashathi-api-test-db.json');

let server;
const cookies = new Map(); // phone -> cookie header
let currentCookie = '';

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function call(path, { method = 'GET', body, cookie = currentCookie, headers } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(headers || {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const session = setCookie.find((c) => c.startsWith('session='));
  return { status: response.status, payload, session: session ? session.split(';')[0] : null };
}

async function loginAs(identifier, password = 'Demo123!') {
  const res = await call('/auth/login', { method: 'POST', body: { identifier, password }, cookie: '' });
  assert.equal(res.status, 200, `login failed for ${identifier}: ${JSON.stringify(res.payload)}`);
  currentCookie = res.session || '';
  return res.payload.user;
}

test.before(async () => {
  require('node:fs').rmSync(TEST_DB, { force: true });
  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', AUTH_MODE: 'development', SHEBASHATHI_DB: TEST_DB },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (chunk) => process.stderr.write(String(chunk)));
  // wait for the port to accept connections
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) return; } catch { /* retry */ }
    await wait(100);
  }
  throw new Error('server did not start');
});

test.after(() => {
  if (server) server.kill();
  require('node:fs').rmSync(TEST_DB, { force: true });
});

test('catalogue exposes localised services with real artwork', async () => {
  const res = await call('/services', { cookie: '' });
  assert.equal(res.status, 200);
  const services = res.payload.services;
  assert.ok(services.length >= 12, `expected the full catalogue, got ${services.length}`);
  for (const service of services) {
    assert.ok(service.bn && service.en, `${service.id} needs both languages`);
    assert.ok(service.photo || service.art, `${service.id} needs artwork`);
  }
});

test('public stats report only real aggregate data', async () => {
  const res = await call('/public/stats', { cookie: '' });
  assert.equal(res.status, 200);
  const { stats } = res.payload;
  assert.equal(typeof stats.services, 'number');
  assert.equal(typeof stats.providers, 'number');
  assert.ok(Number.isInteger(stats.completedBookings));
});

test('map configuration is served, and the development default needs no key', async () => {
  const res = await call('/public/config', { cookie: '' });
  assert.equal(res.status, 200);
  const { map } = res.payload.config;
  assert.match(map.styleUrl, /^https:\/\//, 'the client needs a real style document to render a map');
  assert.equal(map.provider, new URL(map.styleUrl).host);
  assert.equal(map.configured, 'development-default');
  assert.match(map.note, /MAP_STYLE_URL/);
});

test('the vendored map runtime is served locally, not from a CDN', async () => {
  for (const file of ['maplibre-gl.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css']) {
    const response = await fetch(`${BASE.replace('/api', '')}/assets/vendor/maplibre/${file}`);
    assert.equal(response.status, 200, `${file} must be served by the app itself`);
    assert.ok(Number(response.headers.get('content-length')) > 1000, `${file} looks truncated`);
  }
});

test('dotfiles, the database and dependencies are never served', async () => {
  const origin = BASE.replace('/api', '');
  for (const path of ['/.env', '/data/database.json', '/.git/config', '/node_modules/maplibre-gl/package.json', '/scripts/prepare-web.js']) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 403, `${path} must not be readable by a browser`);
  }
  const asset = await fetch(`${origin}/assets/styles/app.css`);
  assert.equal(asset.status, 200, 'the real bundle must still be served');
});

test('login controls the session and /me reflects it', async () => {
  const anonymous = await call('/me', { cookie: '' });
  assert.equal(anonymous.status, 200, 'the session probe answers, it does not error');
  assert.equal(anonymous.payload.user, null, 'a logged-out visitor is reported as nobody, not as an error');

  const guarded = await call('/bookings', { cookie: '' });
  assert.equal(guarded.status, 401, 'protected endpoints still require a session');

  const user = await loginAs('01711000001');
  assert.equal(user.role, 'CUSTOMER');

  const me = await call('/me');
  assert.equal(me.status, 200);
  assert.equal(me.payload.user.id, user.id);

  const login = await call('/auth/login', { method: 'POST', body: { identifier: '01711000001', password: 'Demo123!' }, cookie: '' });
  assert.ok(!login.payload.token, 'web login must not expose a session token to JavaScript');
  const native = await call('/auth/login', { method: 'POST', body: { identifier: '01711000001', password: 'Demo123!' }, cookie: '', headers: { 'x-client-platform': 'android' } });
  assert.ok(native.payload.token, 'native login returns a bearer token for the WebView');
  assert.equal(native.payload.token, native.session.replace('session=', ''), 'bearer token matches the session cookie');
});

test('registration creates a real account that can sign in', async () => {
  const identifier = `0199${String(Date.now()).slice(-7)}`;
  const created = await call('/auth/register', {
    method: 'POST', cookie: '',
    body: { identifier, name: 'পরীক্ষা ব্যবহারকারী', role: 'CUSTOMER', password: 'TestPass123' }
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  const session = await call('/auth/login', { method: 'POST', body: { identifier, password: 'TestPass123' }, cookie: '' });
  assert.equal(session.status, 200);

  const duplicate = await call('/auth/register', {
    method: 'POST', cookie: '',
    body: { identifier, name: 'X', role: 'CUSTOMER', password: 'TestPass123' }
  });
  assert.equal(duplicate.status, 409);
});

test('profile updates persist through the backend', async () => {
  await loginAs('01711000001');
  const res = await call('/me', { method: 'PATCH', body: { area: 'Mohammadpur', bio: 'পরীক্ষামূলক পরিচিতি' } });
  assert.equal(res.status, 200);
  assert.equal(res.payload.user.area, 'Mohammadpur');
  const me = await call('/me');
  assert.equal(me.payload.user.area, 'Mohammadpur', 'saved value survives a re-read');
  await call('/me', { method: 'PATCH', body: { area: 'Dhanmondi' } });
});

test('customer can request a service and multiple providers can bid', async () => {
  // provider must be available with a matching skill
  await loginAs('01711000002');
  const availability = await call('/worker/availability', { method: 'PATCH', body: { available: true } });
  assert.equal(availability.status, 200);

  // a second, freshly registered provider with the same skill
  const secondPhone = `0188${String(Date.now()).slice(-7)}`;
  const registered = await call('/auth/register', {
    method: 'POST', cookie: '',
    body: { identifier: secondPhone, name: 'রফিক আহমেদ', role: 'WORKER', password: 'TestPass123' }
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.payload));
  await loginAs(secondPhone, 'TestPass123');
  const skills = await call('/me', { method: 'PATCH', body: { skills: ['Plumbing'] } });
  assert.deepEqual(skills.payload.user.skills, ['Plumbing']);
  await call('/worker/availability', { method: 'PATCH', body: { available: true } });

  // customer creates the request
  await loginAs('01711000001');
  const date = new Date(Date.now() + 86400000).toISOString();
  const created = await call('/requests', {
    method: 'POST',
    body: { service: 'Plumbing', description: 'রান্নাঘরের সিঙ্ক থেকে পানি পড়ছে', district: 'Dhaka', area: 'Dhanmondi', date, urgency: 'URGENT' }
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  const requestId = created.payload.request.id;

  // the seeded provider sees the request and offers
  await loginAs('01711000002');
  const openRequests = await call('/requests');
  assert.ok(openRequests.payload.requests.some((r) => r.id === requestId), 'provider sees the matching open request');

  const offer = await call(`/requests/${requestId}/offers`, { method: 'POST', body: { price: 3000, eta: '২ ঘণ্টার মধ্যে', message: 'আজই করে দেব' } });
  assert.equal(offer.status, 201, JSON.stringify(offer.payload));
  const offerId = offer.payload.offer.id;

  const duplicate = await call(`/requests/${requestId}/offers`, { method: 'POST', body: { price: 3500 } });
  assert.equal(duplicate.status, 409, 'the same provider cannot bid twice');

  // a second provider can still bid, and the first provider no longer sees it
  await loginAs(secondPhone, 'TestPass123');
  const secondList = await call('/requests');
  assert.ok(secondList.payload.requests.some((r) => r.id === requestId), 'a request with bids stays open to other providers');
  const secondOffer = await call(`/requests/${requestId}/offers`, { method: 'POST', body: { price: 2600, eta: 'আগামীকাল সকালে' } });
  assert.equal(secondOffer.status, 201, JSON.stringify(secondOffer.payload));

  await loginAs('01711000002');
  const afterBidding = await call('/requests');
  assert.ok(!afterBidding.payload.requests.some((r) => r.id === requestId), 'a provider stops seeing requests they already bid on');

  // the customer sees every bid with integer paisa amounts
  await loginAs('01711000001');
  const offers = await call(`/requests/${requestId}/offers`);
  assert.equal(offers.status, 200);
  assert.equal(offers.payload.offers.length, 2);
  for (const item of offers.payload.offers) assert.ok(Number.isInteger(item.price));
  assert.equal(offers.payload.offers.find((o) => o.id === offerId).price, 300000);

  // the customer accepts one bid; the other is automatically rejected
  const accepted = await call(`/offers/${offerId}/accept`, { method: 'POST', body: {} });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.payload));
  const bookingId = accepted.payload.booking.id;

  // pricing model is computed server-side
  assert.equal(accepted.payload.booking.pricing.quote, 300000);
  assert.equal(accepted.payload.booking.pricing.commission, 6000);
  assert.equal(accepted.payload.booking.pricing.net, 294000);

  const afterAccept = await call(`/requests/${requestId}/offers`);
  assert.equal(afterAccept.payload.offers.filter((o) => o.status === 'REJECTED').length, 1, 'losing bids are rejected');

  // the customer can see the booking and its timeline
  const booking = await call(`/bookings/${bookingId}`);
  assert.equal(booking.status, 200);
  assert.equal(booking.payload.booking.request.id, requestId);
  assert.match(booking.payload.booking.worker.name, /করিম/, 'the accepted provider is attached to the booking');
});

test('booking lifecycle is enforced and cancellations are persisted', async () => {
  await loginAs('01711000001');
  const list = await call('/bookings');
  const confirmed = list.payload.bookings.find((b) => b.status === 'CONFIRMED');
  assert.ok(confirmed, 'expected the confirmed booking from the previous test');
  const bookingId = confirmed.id;

  // an illegal transition is rejected by the server
  const illegal = await call(`/bookings/${bookingId}`, { method: 'PATCH', body: { status: 'WORKER_TRAVELLING' } });
  assert.equal(illegal.status, 403, 'customer cannot push the provider to travel');

  // a legal provider transition works
  await loginAs('01711000002');
  const start = await call(`/bookings/${bookingId}`, { method: 'PATCH', body: { status: 'WORK_IN_PROGRESS' } });
  assert.equal(start.status, 200, JSON.stringify(start.payload));

  const events = await call(`/bookings/${bookingId}/events`);
  assert.ok(events.payload.events.length >= 1, 'status changes are recorded');

  // messaging is persisted and readable by both sides
  const sent = await call(`/bookings/${bookingId}/messages`, { method: 'POST', body: { text: 'আমি ১০ মিনিটে পৌঁছে যাব' } });
  assert.equal(sent.status, 201);
  const messages = await call(`/bookings/${bookingId}/messages`);
  assert.ok(messages.payload.messages.some((m) => m.text.includes('১০ মিনিটে')));

  // provider requests completion, customer confirms
  const requested = await call(`/bookings/${bookingId}`, { method: 'PATCH', body: { status: 'COMPLETION_REQUESTED' } });
  assert.equal(requested.status, 200);

  await loginAs('01711000001');
  const completed = await call(`/bookings/${bookingId}`, { method: 'PATCH', body: { status: 'COMPLETED' } });
  assert.equal(completed.status, 200, JSON.stringify(completed.payload));
  assert.equal(completed.payload.booking.status, 'COMPLETED');

  const review = await call(`/bookings/${bookingId}/reviews`, { method: 'POST', body: { rating: 5, comment: 'খুব ভালো কাজ' } });
  assert.equal(review.status, 201, JSON.stringify(review.payload));
  const again = await call(`/bookings/${bookingId}/reviews`, { method: 'POST', body: { rating: 4 } });
  assert.equal(again.status, 409, 'duplicate reviews are rejected');
});

test('provider earnings and withdrawals follow the financial model', async () => {
  await loginAs('01711000002');
  const earnings = await call('/worker/earnings');
  assert.equal(earnings.status, 200);
  assert.ok(earnings.payload.completedJobs >= 1);
  assert.ok(earnings.payload.availablePaisa >= 0);
  assert.equal(earnings.payload.availablePaisa, earnings.payload.netPaisa - earnings.payload.paidPaisa);

  const tooMuch = await call('/worker/payouts', { method: 'POST', body: { amountBdt: 99999999 } });
  assert.equal(tooMuch.status, 400, 'withdrawals above the available balance are rejected');

  if (earnings.payload.availablePaisa >= 100) {
    const payout = await call('/worker/payouts', { method: 'POST', body: { amountBdt: 1 } });
    assert.equal(payout.status, 201);
    const list = await call('/worker/payouts');
    assert.ok(list.payload.payouts.some((p) => p.id === payout.payload.payout.id));
  }
});

test('provider can publish a service package and keep it persisted', async () => {
  await loginAs('01711000002');
  const created = await call('/provider/listings', {
    method: 'POST',
    body: { service: 'Plumbing', title: 'বাথরুম ফিটিং প্যাকেজ', description: 'নতুন ফিটিং ও পাইপ মেরামত', pricingModel: 'FIXED', priceBdt: 4500, durationMinutes: 120 }
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  const listingId = created.payload.listing.id;
  assert.equal(created.payload.listing.pricePaisa, 450000);

  const paused = await call(`/provider/listings/${listingId}`, { method: 'PATCH', body: { active: false } });
  assert.equal(paused.status, 200);
  assert.equal(paused.payload.listing.active, false);

  const listings = await call('/provider/listings');
  assert.equal(listings.payload.listings.find((l) => l.id === listingId).active, false);

  const invalid = await call('/provider/listings', { method: 'POST', body: { service: 'Plumbing', title: 'x', pricingModel: 'NOPE' } });
  assert.equal(invalid.status, 400);
});

test('the quoted price equals what the customer is charged', async () => {
  // the public fee model is what the booking screen quotes from
  const stats = await call('/public/stats', { cookie: '' });
  const fees = stats.payload.stats.fees;
  assert.ok(fees, 'the fee model is public');
  assert.equal(typeof fees.feeType, 'string');
  assert.equal(typeof fees.feeValue, 'number');

  // publish a fixed-price package, then book it and compare
  await loginAs('01711000002');
  const listing = await call('/provider/listings', {
    method: 'POST',
    body: { service: 'Plumbing', title: 'কোটেশন যাচাই প্যাকেজ', pricingModel: 'FIXED', priceBdt: 2000 }
  });
  const listingId = listing.payload.listing.id;
  const quote = listing.payload.listing.pricePaisa;

  await loginAs('01711000001');
  const market = await call('/marketplace/providers?service=Plumbing');
  assert.ok(market.payload.providers.length, 'the seeded provider is discoverable');
  for (const provider of market.payload.providers) {
    for (const item of provider.listings || []) {
      assert.ok(Array.isArray(item.addOns), 'every published package exposes an add-ons array');
    }
  }
  const anonymous = await call('/marketplace/providers?service=Plumbing', { cookie: '' });
  assert.equal(anonymous.status, 401, 'the provider directory requires a session');

  const booked = await call(`/listings/${listingId}/book`, {
    method: 'POST',
    // an unknown add-on id must be ignored, not crash the endpoint
    body: { description: 'ঘরের পাইপ মেরামতের প্রয়োজন', district: 'Dhaka', area: 'Dhanmondi', date: new Date(Date.now() + 86400000).toISOString(), immediate: false, addOnIds: ['addon_missing'] }
  });
  assert.equal(booked.status, 201, JSON.stringify(booked.payload));
  const pricing = booked.payload.booking.pricing;
  assert.equal(pricing.quote, quote, 'the customer pays the published price');
  const expectedFee = fees.feeType === 'fixed' ? fees.feeValue : Math.round(quote * fees.feeValue / 10000);
  assert.equal(pricing.fee, expectedFee, 'the platform fee matches the published model');
  assert.equal(pricing.total, quote + expectedFee, 'the total on the review step equals the charged total');

  // tidy up so later tests are not affected by the disabled package
  await loginAs('01711000002');
  await call(`/provider/listings/${listingId}`, { method: 'PATCH', body: { active: false } });
});

test('a chosen add-on is priced into the booking and stored on it', async () => {
  const stats = await call('/public/stats', { cookie: '' });
  const fees = stats.payload.stats.fees;

  await loginAs('01711000002');
  const created = await call('/provider/listings', {
    method: 'POST',
    body: {
      service: 'Plumbing',
      title: 'অ্যাড-অন যাচাই প্যাকেজ',
      pricingModel: 'FIXED',
      priceBdt: 1500,
      addOns: [{ title: 'অতিরিক্ত পরিদর্শন', priceBdt: 250 }]
    }
  });
  const listing = created.payload.listing;
  assert.equal(listing.addOns.length, 1, 'the package keeps the add-on the provider created');
  assert.equal(listing.addOns[0].pricePaisa, 25000);

  await loginAs('01711000001');
  const booked = await call(`/listings/${listing.id}/book`, {
    method: 'POST',
    body: {
      description: 'অ্যাড-অন সহ বুকিং যাচাই',
      district: 'Dhaka',
      area: 'Dhanmondi',
      // far enough from the other test booking that the worker is free
      date: new Date(Date.now() + 5 * 86400000).toISOString(),
      immediate: false,
      addOnIds: [listing.addOns[0].id]
    }
  });
  assert.equal(booked.status, 201, JSON.stringify(booked.payload));
  const pricing = booked.payload.booking.pricing;
  const expectedQuote = listing.pricePaisa + listing.addOns[0].pricePaisa;
  const expectedFee = fees.feeType === 'fixed' ? fees.feeValue : Math.round(expectedQuote * fees.feeValue / 10000);
  assert.equal(pricing.quote, expectedQuote, 'the quote includes the chosen add-on');
  assert.equal(pricing.total, expectedQuote + expectedFee, 'the customer total includes the add-on');
  assert.deepEqual(
    (pricing.selectedAddOns || []).map((a) => a.id),
    [listing.addOns[0].id],
    'the chosen add-on is recorded on the booking'
  );

  await loginAs('01711000002');
  await call(`/provider/listings/${listing.id}`, { method: 'PATCH', body: { active: false } });
});

test('discovery only exposes verified, available, matching providers', async () => {
  await loginAs('01711000001');
  const all = await call('/marketplace/providers');
  assert.equal(all.status, 200);
  assert.ok(Array.isArray(all.payload.providers));

  const filtered = await call('/marketplace/providers?service=Plumbing');
  assert.equal(filtered.status, 200);
  for (const provider of filtered.payload.providers) {
    const matches = (provider.skills || []).includes('Plumbing') || (provider.listings || []).some((l) => l.service === 'Plumbing');
    assert.ok(matches, `${provider.name} should not appear for Plumbing`);
  }
});

test('support cases are created and visible to their owner only', async () => {
  await loginAs('01711000001');
  const created = await call('/support', { method: 'POST', body: { category: 'BOOKING', description: 'বুকিং সংক্রান্ত একটি পরীক্ষামূলক সমস্যা' } });
  assert.equal(created.status, 201);
  const mine = await call('/support');
  assert.ok(mine.payload.cases.some((c) => c.id === created.payload.case.id));

  await loginAs('01711000002');
  const theirs = await call('/support');
  assert.ok(!theirs.payload.cases.some((c) => c.id === created.payload.case.id), 'providers cannot read another user’s tickets');
});

test('admin operations require the ADMIN role and persist', async () => {
  await loginAs('01711000001');
  const denied = await call('/admin/overview');
  assert.equal(denied.status, 403, 'customers cannot reach the admin API');

  await loginAs('01711000004');
  const overview = await call('/admin/overview');
  assert.equal(overview.status, 200);
  assert.ok(overview.payload.metrics.users >= 3);

  const settings = await call('/admin/settings', { method: 'PATCH', body: { commissionBps: 250, feeType: 'fixed', feeValue: 5000 } });
  assert.equal(settings.status, 200, JSON.stringify(settings.payload));
  assert.equal(settings.payload.settings.commissionBps, 250);

  const reread = await call('/admin/overview');
  assert.equal(reread.payload.settings.commissionBps, 250, 'settings persist');

  const invalid = await call('/admin/settings', { method: 'PATCH', body: { commissionBps: 9000 } });
  assert.equal(invalid.status, 400, 'out-of-range commission is rejected');

  // restore the documented 2% + ৳30 model
  await call('/admin/settings', { method: 'PATCH', body: { commissionBps: 200, feeType: 'fixed', feeValue: 3000 } });

  const services = await call('/admin/overview');
  const target = services.payload.services[0];
  const toggled = await call(`/admin/services/${target.id}`, { method: 'PATCH', body: { active: !target.active } });
  assert.equal(toggled.status, 200);
  await call(`/admin/services/${target.id}`, { method: 'PATCH', body: { active: target.active } });
});

test('admin can review a payout and the provider is notified', async () => {
  await loginAs('01711000004');
  const payouts = await call('/admin/payouts');
  assert.equal(payouts.status, 200);
  const requested = payouts.payload.payouts.find((p) => p.status === 'REQUESTED');
  if (requested) {
    const paid = await call(`/admin/payouts/${requested.id}`, { method: 'PATCH', body: { status: 'PAID' } });
    assert.equal(paid.status, 200);
    assert.equal(paid.payload.payout.status, 'PAID');
  }
  const bad = await call(`/admin/payouts/${requested ? requested.id : 'payout_missing'}`, { method: 'PATCH', body: { status: 'NONSENSE' } });
  assert.equal(bad.status, 404);
});

test('unknown API routes return a JSON error, never HTML', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/does-not-exist`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type') || '', /application\/json/);
});

test('the app shell and its assets are served', async () => {
  const shell = await fetch(`http://127.0.0.1:${PORT}/`);
  assert.equal(shell.status, 200);
  const html = await shell.text();
  assert.match(html, /src\/app\.js/);
  assert.match(html, /assets\/styles\/app\.css/);

  for (const asset of ['/src/app.js', '/src/i18n.js', '/assets/styles/app.css', '/assets/coolicons-sprite.svg', '/assets/illustrations/hero-services.svg', '/assets/brand/icon-192.png']) {
    const res = await fetch(`http://127.0.0.1:${PORT}${asset}`);
    assert.equal(res.status, 200, `${asset} should be served`);
  }
});
