# Database architecture

The current MVP stores only browser demo data in `localStorage`; no database integration is claimed as active.

| System | Intended responsibility | Readiness |
|---|---|---|
| SQLite | Local development relational database for users, requests, offers, bookings, pricing snapshots, and tests | Planned for backend phase |
| MySQL | Production relational system of record; constraints, indexes, migrations, transactions and financial ledger | Planned for backend phase |
| MongoDB | Optional support cases, flexible portfolio metadata and document snapshots | Adapter boundary planned |
| DynamoDB | Optional high-volume idempotency keys and denormalized reads | Adapter boundary planned; no AWS access required locally |
| Cassandra | Optional append-only event/time-series stream | Adapter boundary planned |
| Oracle Database | Optional enterprise relational adapter, never required for local development | Adapter boundary planned |

## Rules

MySQL is the intended financial and booking authority. MongoDB, DynamoDB, and Cassandra must not become duplicate authoritative ledgers. SQLite and MySQL need separate concurrency and migration testing. Each optional integration must remain disabled until configuration and live integration tests are present.
