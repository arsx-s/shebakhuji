const test = require('node:test');
const assert = require('node:assert/strict');
const { pricing, normalizeIdentifier, distanceKm, transition, recurringDates } = require('./server');
test('pricing preserves the Shebashathi financial model', () => { const p = pricing(100000); assert.deepEqual({ commission: p.commission, net: p.net, fee: p.fee, total: p.total, gross: p.gross }, { commission: 2000, net: 98000, fee: 3000, total: 103000, gross: 5000 }); });
test('identifiers normalize Bangladesh phones and emails', () => { assert.deepEqual(normalizeIdentifier('+8801711000001'), { type: 'phone', value: '01711000001' }); assert.deepEqual(normalizeIdentifier(' Rafi@Example.com '), { type: 'email', value: 'rafi@example.com' }); assert.equal(normalizeIdentifier('invalid'), null); });
test('worker discovery distance and booking lifecycle are bounded', () => { assert.ok(distanceKm(23.8103, 90.4125, 23.8203, 90.4225) > 0); assert.doesNotThrow(() => transition('CONFIRMED', 'WORKER_TRAVELLING')); assert.throws(() => transition('COMPLETED', 'WORK_IN_PROGRESS'), /Invalid booking transition/); });
test('recurring schedules create real weekly and monthly occurrences', () => { assert.equal(recurringDates('2026-01-01T10:00:00+06:00', 'WEEKLY', 3).length, 3); assert.equal(new Date(recurringDates('2026-01-01T10:00:00+06:00', 'MONTHLY', 2)[1]).getUTCMonth(), 1); });

test('map configuration names its own source and can be switched off', () => {
  const { mapConfig } = require('./server');
  const previous = process.env.MAP_STYLE_URL;
  try {
    delete process.env.MAP_STYLE_URL;
    const fallback = mapConfig();
    assert.equal(fallback.configured, 'development-default');
    assert.match(fallback.styleUrl, /^https:\/\//, 'the development default must be a real style document');
    assert.match(fallback.note, /MAP_STYLE_URL/, 'the note must say exactly what to configure');

    process.env.MAP_STYLE_URL = 'none';
    assert.equal(mapConfig().styleUrl, null, '`none` must switch the map off instead of guessing');
    assert.equal(mapConfig().configured, 'disabled');

    process.env.MAP_STYLE_URL = 'https://tiles.example.com/style.json';
    assert.equal(mapConfig().styleUrl, 'https://tiles.example.com/style.json');
    assert.equal(mapConfig().provider, 'tiles.example.com');

    process.env.MAP_STYLE_URL = 'not a url';
    assert.equal(mapConfig().styleUrl, null, 'an unusable style URL must not be handed to the client');
  } finally {
    if (previous === undefined) delete process.env.MAP_STYLE_URL; else process.env.MAP_STYLE_URL = previous;
  }
});
