# Shebashathi (সেবাসাথী)

A Bangla-first, mobile-friendly local demo for a Bangladesh service marketplace. It demonstrates the connected marketplace flow: authentication, customer requests, worker offers, offer selection, pricing transparency, booking progression, and administration.

## Run locally

Install no dependencies, then run the backend and static app together:

```powershell
npm start
```

Open `http://localhost:3000`. The server creates `data/database.json` on first run and seeds development accounts. `AUTH_MODE=development` is the local-only mode; real SMS/email OTP delivery still requires provider adapters and credentials.

Demo credentials (development only):

| Role | Phone | Password |
|---|---|---|
| Customer | `01711000001` | `Demo123!` |
| Worker | `01711000002` | `Demo123!` |
| Admin | `01711000004` | `Demo123!` |

## Current implementation

- Coolicons Free Iconset is the project-wide icon source. Its local SVG sprite and attribution are in `assets/`.
- Visual tokens use the Master Artisan palette: Deep Indigo `#1E2538`, Burnished Copper `#C87A53`, Warm Alabaster `#F9F8F6`, and Slate Stone `#6C7A89`. The interface uses Apple system font stacks with Bengali fallbacks and avoids emoji.
- Bangla-first responsive UI with English service identifiers internally.
- Bangladesh mobile-number validation during registration.
- Browser-session login and local persistence via `localStorage`; this is a prototype persistence layer, not production authentication.
- Customer requests; worker skill matching and quotations; customer selection.
- Server-equivalent rules are modelled in browser code for demo purposes only.
- Exact integer-paisa pricing: worker commission defaults to 2%, customer fee defaults to ৳30.
- Booking states: `OPEN_FOR_OFFERS`, `CONFIRMED`, `WORK_IN_PROGRESS`, `COMPLETION_REQUESTED`, and `COMPLETED`.
- Admin fee configuration and worker overview.
- Node HTTP backend with persistent development storage, sessions, role-protected request/offer/booking endpoints, server-side pricing, availability, and coordinate validation.

## Production architecture required next

The current backend foundation uses a persistent JSON development store to avoid adding an unverified native database dependency. Production should replace the repository with SQLite/MySQL migrations while preserving the API and domain rules.

See [SHEBASHATHI_AUDIT.md](./SHEBASHATHI_AUDIT.md), [.env.example](./.env.example), [DATABASE_ARCHITECTURE.md](./DATABASE_ARCHITECTURE.md), and [CODEX_CONTINUATION.md](./CODEX_CONTINUATION.md).
