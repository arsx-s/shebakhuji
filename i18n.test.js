const test = require('node:test');
const assert = require('node:assert/strict');

process.chdir(__dirname);

test('every interface string exists in both Bangla and English', async () => {
  const { dictionaries } = await import('./src/i18n.js');
  const bn = Object.keys(dictionaries.bn).sort();
  const en = Object.keys(dictionaries.en).sort();

  const missingInEn = bn.filter((key) => !(key in dictionaries.en));
  const missingInBn = en.filter((key) => !(key in dictionaries.bn));

  assert.deepEqual(missingInEn, [], `keys missing from English: ${missingInEn.join(', ')}`);
  assert.deepEqual(missingInBn, [], `keys missing from Bangla: ${missingInBn.join(', ')}`);
  assert.ok(bn.length > 300, `expected a substantial dictionary, found ${bn.length} keys`);
});

test('no translation renders a raw key or empty string', async () => {
  const { dictionaries } = await import('./src/i18n.js');
  for (const lang of ['bn', 'en']) {
    for (const [key, value] of Object.entries(dictionaries[lang])) {
      assert.ok(String(value).trim().length > 0, `${lang}:${key} is empty`);
      assert.notEqual(String(value).trim(), key, `${lang}:${key} renders the raw key`);
      // a value must never contain an untranslated dotted key pattern
      assert.ok(!/^[a-z]+(\.[a-zA-Z0-9_]+)+$/.test(String(value).trim()), `${lang}:${key} looks like a key: ${value}`);
    }
  }
});

test('translations interpolate placeholders and fall back safely', async () => {
  const { t } = await import('./src/i18n.js');
  assert.match(t('explore.results', { count: 7 }), /7/);
  assert.match(t('booking.step', { n: 2, total: 4 }), /2/);
  assert.equal(t('definitely.not.a.key'), 'Key');
});

test('every runtime status and category label used in the interface is translated', async () => {
  const { dictionaries } = await import('./src/i18n.js');
  // These values arrive from the server at runtime and are looked up with a
  // built key, so no source scan can catch a missing entry. The lists mirror
  // the enums in server.js and the option values in the forms.
  const bookingStatuses = [
    'OPEN', 'CONFIRMED', 'WORKER_TRAVELLING', 'WORKER_ARRIVED', 'WORK_IN_PROGRESS',
    'COMPLETION_REQUESTED', 'COMPLETED', 'CANCELLED', 'DISPUTED'
  ];
  const requestStatuses = ['OPEN_FOR_OFFERS', 'OFFER_RECEIVED', 'AWARDED'];
  const offerAndPayoutStatuses = ['OPEN', 'CONFIRMED', 'CANCELLED'];
  const paymentStatuses = ['UNPAID', 'PAID', 'REFUNDED'];
  const supportKeys = [
    'support.statusOpen', 'support.statusReview', 'support.statusResolved', 'support.statusClosed',
    'support.catBooking', 'support.catPayment', 'support.catProvider', 'support.catAccount', 'support.catOther'
  ];

  const wanted = [
    ...bookingStatuses.map((s) => `status.${s}`),
    ...requestStatuses.map((s) => `status.${s}`),
    ...offerAndPayoutStatuses.map((s) => `status.${s}`),
    ...paymentStatuses.map((s) => `payment.${s}`),
    ...supportKeys
  ];

  for (const key of new Set(wanted)) {
    for (const lang of ['bn', 'en']) {
      assert.ok(dictionaries[lang][key], `${lang} is missing a label for ${key}`);
    }
  }
});

test('currency and numbers follow the active locale', async () => {
  const { money, formatNumber, getLang, setLang } = await import('./src/i18n.js');
  setLang('en');
  assert.equal(money(250000), '৳2,500');
  assert.equal(money(123456), '৳1,234.56');
  assert.match(formatNumber(10), /10/);

  setLang('bn');
  const bengali = money(250000);
  assert.ok(bengali.startsWith('৳'), 'Bangla price keeps the taka sign');
  assert.match(bengali, /[০-৯]/, `Bangla price uses Bangla numerals, got ${bengali}`);
  assert.equal(getLang(), 'bn');
  setLang('en');
});
