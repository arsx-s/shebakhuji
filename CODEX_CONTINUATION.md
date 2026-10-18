# Continuation guide

Architecture, conventions and current status for whoever picks this up next.

## Layout

```
server.js              HTTP API + JSON store + dev seed (single process)
index.html             app shell, boot splash, PWA wiring
sw.js                  service worker: network-first for code/documents with a
                       cache fallback, cache-first for images, API untouched
manifest.webmanifest   PWA manifest
src/
  app.js               boots, owns the route table and the single render loop
  router.js            hash matching, param/query parsing, route listeners
  shell.js             public chrome, app chrome (app bar, side nav, bottom nav)
  ui.js                action bus, toasts, sheets (focus trap + focus return), tags, icon()
  api.js               fetch wrapper, ApiError, error→translation-key map
  store.js             tiny observable state (user, services, fees, online…)
  i18n.js               bn/en dictionaries, t(), number/date/currency formats
  config.js            API base URL resolution (web vs native)
  map.js               the one MapLibre instance: attach/re-parent, pick mode,
                       places, worker markers, language, honest status states
  views/               public, auth, customer, booking, account, provider, admin
assets/
  styles/app.css       the design system (tokens → components → overrides)
  coolicons-sprite.svg 885 symbols; icon('Name') inlines one
  illustrations/       original flat-vector art from scripts/generate-art.js
  photos/              service photography
  vendor/maplibre/     vendored MapLibre GL build (see scripts/vendor-map.js)
scripts/
  check-modules.js     parses every ES module
  check-assets.js      every referenced file and icon name must exist
  check-forms.js       number inputs must accept ordinary values
  check-blocks.js      no markup block is built and then never rendered
  check-vendor.js      the vendored map build is present and complete
  vendor-map.js        copies the MapLibre build from node_modules into assets/
  generate-art.js      regenerates illustrations/brand assets
  prepare-web.js       builds www/ for Capacitor (vendors the map first)
  clean-test-data.js   removes test/QA records (backs up first)
```

## Conventions

- **One painter.** `src/app.js`'s `render()` is the only code that resolves a
  route, runs the guard and paints. `router.js` only notifies listeners. Do not
  render from a view or a router callback.
- **Not ready, do not paint.** `render()` bails out until
  `store.ready` is true (set after `restoreSession()`). Painting earlier makes a
  guarded deep link look unauthorised and bounce the user to the landing page.
- **Actions, not dead buttons.** Views emit `data-action="name"`; handlers are
  registered with `register()` from `ui.js`. An unregistered action logs a
  warning, so a button that does nothing is visible in development.
- **No hardcoded money rules.** Read `store.fees` (loaded from
  `/api/public/stats`); the backend is the single source of truth.
- **Static keys, no dynamic translation keys.** Use lookup maps for values that
  arrive from the server (statuses, categories) so an unexpected value can render
  a translated fallback instead of a raw key. `i18n.test.js` enforces the common
  enums.
- **Accessible by construction.** Copper text uses `--copper-ink`, filled copper
  surfaces that carry white text use `--copper-dark`; never `--copper` for text on
  a light background. A section heading inside a page that has no `<h2>` is
  written `<h2 class="h3">` — same size, valid outline. Segmented tab strips use
  `role="tab"` + `aria-selected` (not `aria-pressed`); a non-interactive chip has
  no `aria-pressed`. Any `aria-label` must contain the element's visible text.
- **Assets are local.** No CDNs and no external fonts — a system font stack with
  Bengali fallbacks. `scripts/check-assets.js` fails the check on a missing file
  or icon name.
- **Money is paisa** (integers) everywhere, formatted with `money()`.

## Commands

| Command | Purpose |
|---|---|
| `npm start` | run the server on `http://localhost:3000` |
| `npm run check` | syntax, module graph, asset references, number-input guard |
| `npm test` | `node --test` (unit + API integration + i18n coverage) |
| `npm run art` | regenerate illustrations and brand assets |
| `npm run web:prepare` | build `www/` for Capacitor |
| `npm run android:prepare` / `android:build` | sync/prepare the native shell |
| `node scripts/clean-test-data.js [--since=<iso>] [--apply]` | tidy the dev store |

`npm test` isolates the API suite on a throwaway database via `SHEBASHATHI_DB`.

## Status — verified

- `npm run check` green: 15 ES modules parse, 19 sources reference only existing
  assets (442 sprite icons), 7 number inputs accept ordinary values, and 27
  markup blocks are all interpolated somewhere in their file.
- `npm test` green: 25/25 — server unit tests, isolated API integration tests
  (auth, quoting, add-on pricing, booking lifecycle, offers, payouts), and the
  i18n dictionary/enum coverage tests.
- Lighthouse green on 27 routes: Accessibility 100, Best Practices 100, SEO 100
  across the public pages, every customer screen, the provider workspace and the
  admin console. Run it against a route via the browser tooling; fix contrast,
  heading order and accessible-name issues rather than suppressing them.
- PWA shell verified: the app self-registers `sw.js` on a clean load, activates,
  caches 25 shell files, and a page reloaded with the network emulated offline
  loads its HTML/CSS from cache while API calls fail cleanly.
- Browser QA (manual, both languages, 320/390/768/desktop): no console errors, no
  broken images, no horizontal overflow, no raw translation keys.
- End-to-end flows exercised against the live server: booking wizard → fee review
  → confirm → provider lifecycle → customer completion → review; open-bidding
  request → provider offer → customer accept → booking; chat; admin console pages
  and the service toggle.

## Status — not done

- **Android APK not built.** `java`/`adb`/`gradle` missing and no SDK path in this
  environment. The web bundle and Capacitor sync can be prepared.
- **Single-process store.** No transactions, no locking.
- **No payment gateway and no SMS/email OTP.** These are labelled as
  unavailable in the UI rather than faked.
- **Maps are real, tracking is not.** MapLibre GL renders a configured style and
  shows only locations a person actually provided (a picked point, a saved
  address, a worker position the worker shared). There is no simulated movement,
  no ETA and no invented worker marker. Tiles require internet and are never
  cached, so offline the map says so.
- Automated browser tests are not in CI; the visual/behavioural pass is manual.

## Next priorities

1. Repository layer + SQLite with transactions around booking/offer/payout writes.
2. CI that runs `npm run check` and `npm test` on every change.
3. Playwright (or similar) smoke tests for the flows listed above, run headless.
4. Payment gateway adapter behind the existing invoice/transaction records.
5. Geocoding/search adapter so a picked point gets a real street address instead
   of raw coordinates (the client stores coordinates and never invents a name).
