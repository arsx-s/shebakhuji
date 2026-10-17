# সেবাসাথী · ShebaShathi

A bilingual (বাংলা / English) service-marketplace app for Bangladesh — customer
booking, provider work, marketplace offers, and an admin console, all backed by
a real HTTP API and a persisted data store.

- **Frontend** — dependency-free ES-module SPA (`src/`), served as static files.
- **Backend** — `server.js`, a single Node HTTP server with a JSON data store
  (`data/database.json`), sessions, and role-based authorisation.
- **Money** — integer paisa everywhere. Commission and customer fee come from the
  server (`/api/public/stats` → `stats.fees`), never hardcoded in the UI.

## Run locally

No dependencies are needed for the web app; Node 20+ is required.

```powershell
npm start
```

Open `http://localhost:3000`.

`AUTH_MODE=development` (the default) enables local password login and returns a
session cookie. Real SMS/email OTP delivery needs provider adapters and
credentials, and is not wired up.

### Demo accounts (development only)

| Role | Phone | Password |
|---|---|---|
| Customer | `01711000001` | `Demo123!` |
| Provider | `01711000002` | `Demo123!` |
| Admin | `01711000004` | `Demo123!` |

Seeded only when the database has no users, so real data is never overwritten.

## What actually works

- **Auth** — register/login/logout, HttpOnly cookie session, role guards, session
  restore on reload, password change.
- **Customer** — landing pages, explore with category/budget filters, service
  detail, booking wizard (service → schedule → address → review) with the real
  fee breakdown, activity list with status tabs, booking detail with timeline,
  cancel, chat, review.
- **Marketplace offers** — publish a request for open bidding, compare provider
  offers, accept one to create a booking.
- **Provider** — dashboard, availability toggle, open requests, quote an offer,
  job lifecycle transitions (`CONFIRMED → WORKER_TRAVELLING → WORKER_ARRIVED →
  WORK_IN_PROGRESS → COMPLETION_REQUESTED`), schedule, earnings with a live
  commission model, service listings, payout requests.
- **Admin** — overview metrics, commission settings, bookings, users and provider
  verification, service catalogue management, support cases, payout review.
- **Shared** — notifications, inbox/chat, profile, addresses, support cases,
  Bangla/English switch persisted across reloads, installable PWA with a working
  offline shell.

## Tests and checks

```powershell
npm run check   # syntax + module graph + asset references + form + markup guards
npm test        # node --test: unit, API integration, i18n coverage
```

`npm test` runs the API suite against a throwaway database (set `SHEBASHATHI_DB`),
so your development data is never touched.

Accessibility is verified with Lighthouse against a running server. Every route —
public pages, customer screens, the provider workspace and the admin console —
scores Accessibility 100, Best Practices 100 and SEO 100 with no listed failures.
The service worker self-registers on a clean load and serves the shell from cache
when the network is unavailable.

To remove records left in the development database by older, non-isolated test
runs or by manual browser QA:

```powershell
node scripts/clean-test-data.js                     # dry run, fixture markers
node scripts/clean-test-data.js --since=2026-10-18  # dry run, by date
node scripts/clean-test-data.js --since=2026-10-18 --apply
```

The script backs `data/database.json` up to `data/backups/` before writing.

## Android

See `ANDROID_BUILD.md`. The web bundle is prepared into `www/` with
`npm run web:prepare`; the native shell is managed by Capacitor.

## Honest boundaries

- The store is a single JSON file with an in-memory cache. **Run exactly one
  server process** — two processes writing the file clobber each other.
  A transactional database is the next real step; see `DATABASE_ARCHITECTURE.md`.
- Payments are recorded, not charged: no payment gateway is integrated, and the
  UI labels payment as "pay in cash / unpaid" rather than pretending otherwise.
- Maps show the booking address as an approximation, clearly labelled. No live
  GPS tracking or live ETA is claimed.
- Layout quality is verified at 320/390/768/desktop widths; screenshots and
  audits are manual, not part of CI.
