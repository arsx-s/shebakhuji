# Shebashathi audit — 2026-10-16

## Repository

The repository contains a static HTML/CSS/JavaScript MVP and no package manifest, Git metadata, server, database, migration system, or automated test suite.

## Working in the current MVP

- Bangla-first responsive marketplace UI.
- Customer, worker, and admin demo roles selected through browser UI.
- Customer request creation with service, date, district, area, urgency, and description.
- Worker matching by seeded skill identifiers and offer submission.
- Customer offer selection and integer-paisa pricing calculation.
- Booking progression from confirmed work through completion.
- Local browser persistence and seed credentials.
- Coolicons sprite, Master Artisan palette, responsive layout, settings and review screens.

## Partial or demo-only

- Authentication stores demo passwords and sessions in browser storage; it is not secure authentication.
- Authorization is frontend JavaScript and is not server-enforced.
- Data is local to one browser; there is no shared database or concurrent-user behavior.
- Settings and reviews are local UI flows without an audit ledger or moderation backend.
- Worker location and map screens are documented placeholders; no map provider, geocoding, realtime channel, or coordinate persistence is active.
- External avatar is a presentation asset only.

## Missing or broken for production

- No backend API, sessions, password hashing, OTP delivery, email/SMS adapters, provider verification, or account recovery.
- No authoritative Bangladesh division/district/upazila/thana dataset or searchable dependent selectors.
- No uploaded image validation/storage, notifications service, payment gateway, refunds, disputes, or server-side booking state machine.
- No MySQL/SQLite schema, migrations, transactions, audit logs, or six-database adapters.
- No lint, type-check, unit, integration, or end-to-end test runner.

## Prioritized next work

1. Scaffold a small TypeScript backend with SQLite development storage and MySQL-compatible migrations.
2. Move auth, role checks, pricing, offer acceptance, booking transitions, and reviews to transactional server APIs.
3. Import and document an authoritative Bangladesh administrative dataset with stable IDs and searchable dependent selectors.
4. Add a replaceable MapLibre-compatible map provider, manual pin selection, privacy-safe markers, and persisted coordinates.
5. Add development OTP adapters plus real provider adapters, rate limits, secure sessions, and tests.
6. Add realtime request/offer updates only after the authoritative backend exists.

## Verification performed

`node --check app.js` passes. The local `file://` page could not be inspected through browser automation because the browser policy blocks that protocol; serve it over HTTP for manual browser testing.
