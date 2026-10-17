# Data architecture

The app currently persists to **`data/database.json`** via `server.js`, which
caches the parsed object in memory and rewrites the file on every change. This is
a real, server-side store — not browser `localStorage` — but it is a single-file
store, deliberately kept simple for the demo scale.

## Current behaviour

- Location: `data/database.json` (override with `SHEBASHATHI_DB`).
- Shape: `users`, `services`, `requests`, `offers`, `bookings`,
  `bookingEvents`, `messages`, `reviews`, `listings`, `supportCases`,
  `payouts`, `notifications`, `invoices`, `transactions`, `sessions`,
  `settings`, plus smaller collections.
- `normalizeDb()` backfills new fields on load (for example `addOns: []` and
  `active` on listings), so schema additions do not break existing data.
- Money is stored as integer **paisa**. Commission/fee settings live in
  `settings` and are published to clients through `/api/public/stats`.
- Backups: `data/backups/database-<timestamp>.json`, written by
  `scripts/clean-test-data.js` before it modifies anything.

## Known limitation

The JSON store has **no transaction isolation and no cross-process locking**.
Two server processes writing the same file will clobber each other, so run
exactly one process (`npm start`). The in-memory cache also means a change made
by another process is invisible until restart.

## Migration path

| System | Responsibility | Status |
|---|---|---|
| SQLite | Local/production relational store: users, requests, offers, bookings, pricing snapshots, ledger | Next step — not implemented |
| MySQL / Postgres | Production system of record with constraints, indexes, migrations, transactions | Planned |
| Object storage | Service photos and uploads | Not implemented |
| Redis | Sessions, pub/sub for realtime | Not implemented |

Migration order that keeps the app working:

1. Introduce a repository layer so `server.js` stops touching the parsed object
   directly.
2. Move each collection to SQLite behind that layer, one at a time, keeping the
   HTTP contract identical.
3. Wrap booking creation, offer acceptance and payout updates in transactions
   (they currently read-then-write and are not atomic).
4. Replace the file backups with database dumps.

Until then, treat concurrent multi-process access as unsupported.
