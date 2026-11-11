# ADR 02: Prisma + SQLite for Dev, Postgres-Ready for Prod

Date: 2026-11-11
Status: Accepted

## Context

ATLAS persists seven entities: `Environment`, `Tool`, `Capability`,
`Benchmark`, `BenchmarkRun`, `Limit`, and `Report`. The data access
layer had to satisfy four constraints imposed by the sandbox and the
delivery model. First, **zero-config local dev**: the sandbox has no
`psql`, `mysql`, `redis-cli`, `mongosh`, or `sqlite3` CLI on PATH (all
NOT INSTALLED per `docs/environment/03-software.md`), so any database
that required a separate server process or a CLI to inspect would have
slowed iteration to a crawl. Second, **a typed schema** that the
TypeScript frontend could import directly, so the API layer and the UI
shared one source of truth for the shape of `BenchmarkRun`. Third,
**provider portability**: dev uses a file on disk, but production (when
ATLAS deploys to Vercel) cannot write a SQLite file to the serverless
filesystem, so the schema must be ready to swap to Postgres with a
one-line `provider` change. Fourth, **migration history**: the seed
script (`prisma/seed.ts`) had to be re-runnable end to end against a
fresh DB without manual SQL.

The sandbox's filesystem profile made SQLite attractive: `/tmp` and the
project tree are writable, file I/O is fast (100 MB bulk write at 2.7 GB/s,
1000 small files in 0.28 s per `docs/environment/02-filesystem.md`), and
the root overlay has 6.0 GB free. A SQLite file at `prisma/dev.db` (or
`db/custom.db` as actually wired) lives on that fast overlay and survives
across `bun run dev` restarts. Prisma 6 generates a typed client that
the Route Handlers import as `@/lib/db`, and the same `schema.prisma` is
used to seed, migrate, and query — one schema, one source of truth.

The forces against were real: Prisma's runtime is a native `.node`
binding that needs `serverExternalPackages` config under Turbopack;
SQLite has single-writer concurrency limits (irrelevant for ATLAS, which
is single-tenant); and raw SQL would have given finer control over
indexes. The forces in favor — typed client, migration tooling,
provider swap, seed script — outweighed.

## Decision

Adopt **Prisma 6 with the SQLite provider for development and a
Postgres-ready schema for production**. Specifically: `schema.prisma`
declares `provider = "sqlite"` for the dev datasource (the file lives at
`db/custom.db`); the schema itself is provider-agnostic (no SQLite-only
column types, no `PRAGMA` declarations in the schema); all seven models
use `@id @default(cuid())` so IDs are portable across providers;
`prisma/seed.ts` is re-runnable via `bun run db:seed` and populates the
Environment row from the real sandbox values captured in
`docs/environment/01-os-hardware.md`; `src/lib/db.ts` exports a singleton
`PrismaClient` to avoid connection exhaustion in dev. To go to
Postgres in prod: change the `datasource` block's `provider` to
`"postgresql"`, set the `DATABASE_URL` env var to the Postgres URL, run
`bunx prisma migrate deploy`, and deploy. No application code changes.

## Alternatives Considered

- **Raw SQL with `better-sqlite3`** — fastest, fewest moving parts, but
  no typed client (the API handlers would have hand-written row
  mappers), no migration tooling, and a Postgres swap would mean
  rewriting every query. Rejected for the maintenance cost.
- **Drizzle ORM** — lighter than Prisma, SQL-first, has a typed client.
  Rejected because the migration tooling is less mature than Prisma's
  and the team had more Prisma experience. Drizzle is a fine choice and
  the team would revisit if bundle size became a problem (Prisma's
  client is ~80 KB gzipped; Drizzle is ~10 KB).
- **Mongoose + a MongoDB instance** — wrong shape for ATLAS (no
  document model needed; relations are first-class here). Rejected.
  Also MongoDB isn't installed in the sandbox.
- **No ORM, in-memory store seeded from JSON** — would work for a demo
  but loses persistence across server restarts and can't scale to
  Vercel. Rejected.

## Consequences

**Positive.** Zero-config dev: `bunx prisma migrate dev` creates and
migrates the SQLite file in one step; no server to start, no port to
manage. The typed client means the API handlers and the UI share one
source of truth — a `BenchmarkRun` row's shape is defined once in
`schema.prisma`. The seed script is deterministic and re-runnable,
making demo environments reproducible. Provider swap to Postgres is a
one-line `provider` change plus a `migrate deploy` — no application
diff. Prisma Studio (`bunx prisma studio`) gives a GUI for inspecting
the dev DB even though the `sqlite3` CLI is absent from the sandbox.

**Negative.** **Dev/prod schema drift risk**: if a developer uses a
SQLite-only feature (e.g., `PRAGMA journal_mode = WAL`) outside the
schema, that won't translate to Postgres. Mitigated by the rule that
all schema concerns live in `schema.prisma`, not in ad-hoc SQL. The
Prisma client is ~80 KB gzipped, which is non-trivial for a serverless
function. The native `.node` binding requires `serverExternalPackages`
config in `next.config.ts`. SQLite's single-writer lock is a non-issue
for ATLAS (one user) but would be a hard blocker for a multi-tenant
product.

**Neutral.** Prisma 6 is the current major version; the upgrade path
from 5 to 6 was already navigated in this build. The CUID ID strategy
is portable but CUID2 is now preferred — a future schema migration
could swap ID generators without a breaking change.
