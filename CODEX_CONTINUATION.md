# Continuation guide

## Completed

- Dependency-free mobile-first Bangla marketplace demo.
- Local demo auth, role dashboards, customer request → worker offer → customer acceptance → booking lifecycle.
- Integer-paisa pricing calculations, 2% worker commission, separately configurable customer fee.
- Local persistence and development seed accounts.
- Documentation of honest six-database integration status.
- Coolicons Free Iconset installed as the project icon source; use `icon()` in `app.js` for future UI icons.
- Master Artisan palette applied, Apple-style system font stack added, and local settings/reviews screens added.
- Login and registration now accept normalized Bangladesh phone numbers or validated email identifiers; demo identities have local email aliases. Request creation now stores optional validated latitude/longitude when the user supplies coordinates.
- Added `server.js`, `package.json`, `server.test.js`, `.gitignore`, and persistent `data/database.json` development storage. Backend exposes health, auth/session, services, requests, offers, bookings, worker availability/location, server pricing, and protected transition endpoints.

## Modified files

- `index.html`, `styles.css`, `app.js`, `README.md`, `DATABASE_ARCHITECTURE.md`.

## Validation still needed

`node --check app.js` passes. Open `index.html` in a browser and run the seeded customer/worker flow. Browser automation could not inspect the local `file://` page because the browser policy blocks that protocol. No package manager, linter, type-checker, database, server, or automated test suite exists yet because the repository was empty.

## Known limitations

- Authentication, authorization, storage, and pricing enforcement are client-side demo logic and are unsafe for production.
- No backend, database, upload handling, SMS/payment provider, recovery flow, reviews, disputes, or live external database adapter is implemented.
- Google/Apple/email/phone verification, realtime map availability, and true OTP delivery require a server, identity provider, websocket layer, and maps provider; the UI labels these integrations as setup-required rather than pretending they are active.
- Data belongs to the browser and can be reset by clearing site data.

## Next priority

1. Replace the JSON repository with SQLite migrations and connect the frontend fetch layer to the API; use `SHEBASHATHI_AUDIT.md` and `.env.example` as the baseline.
2. Move identity, authorisation, pricing, state transition and fee snapshot logic to transactional server APIs.
3. Add migrations, secure password hashing, sessions, tests, and seed command.
4. Implement reviews, disputes, notification persistence and admin audit logs.
