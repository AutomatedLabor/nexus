# ADR 06: No Authentication in v1

Date: 2026-11-11
Status: Accepted

## Context

ATLAS is a single-tenant internal dashboard: one developer (or a small
team) looking at one environment — the sandbox in which the agent ran.
The data is read-heavy (the dashboard loads environments, tools,
capabilities, benchmarks, limits, and reports; the only mutations are
"trigger a benchmark run" and "generate a report"). The data is not
sensitive in a meaningful way: it's a snapshot of the sandbox's CPU,
memory, filesystem, and benchmark numbers, all of which are
non-secret. The deployment target is Vercel, where adding authentication
means either (a) Vercel's deployment protection (a Vercel-branded
login wall in front of the whole app) or (b) an in-app auth layer
(NextAuth/Auth.js, a session cookie, a database users table, an OAuth
provider). The build was scoped to deliver a working dashboard in one
session under a degraded-tools regime (see ADR 08); auth was not on the
critical path.

The constraints were four. First, **speed of delivery**: every hour
spent wiring OAuth, a users table, a session cookie, a CSRF token, and
a login UI was an hour not spent on the dashboard, the charts, the
benchmark runner, and the docs. Second, **single-user reality**: there
is no user base to onboard, no roles to enforce, no multi-tenancy to
partition data by. Third, **read-heavy workload**: even if a malicious
actor reached the dashboard, the worst they could do is trigger a
benchmark run (consuming ~300 ms of CPU) or generate a report (a DB
write). The blast radius is small. Fourth, **the deployment will be
protected at the Vercel layer**: Vercel's deployment protection
(Password / Trusted IPs / Vercel Authentication) is a single toggle
that puts the whole deploy behind a login wall without any
application code — this is the cheapest path to "not public" when the
time comes.

The forces in favor of auth-from-day-one were correctness (every app
should be auth-by-default) and future-proofing (no painful retrofit
later). The forces against were the scope and the fact that no users
exist yet.

## Decision

Ship **v1 with no authentication**. The API endpoints are open; the
frontend has no login UI; there is no session cookie; there is no
users table in the Prisma schema. The gap is documented here and in
the security doc (`docs/security.md`), with a concrete plan to close
it before any public exposure. Specifically: (a) for internal use,
the Vercel deploy will be protected with Vercel's deployment
protection (one toggle, no code) — this is the v1.5 mitigation if
the deploy needs to be shared with a teammate; (b) for any
wider exposure, the team will add Auth.js (the Next.js-ecosystem
default, formerly NextAuth) with an OAuth provider (GitHub or
Google), a `User` model in the Prisma schema, a session cookie, and
middleware that gates `/api/*` writes (POST to `/api/benchmarks/run`
and POST to `/api/reports`) behind an authenticated session. Reads
could remain open if the data stays non-sensitive. The
`docs/security.md` doc enumerates the threat model and the v2 auth
plan in detail.

## Alternatives Considered

- **NextAuth / Auth.js from day one** — the in-app auth layer. Would
  give a real `User` model, a session, an OAuth provider, and a
  login UI. Rejected for v1 because (a) no users exist yet to onboard,
  (b) the OAuth provider requires a registered client ID and secret
  (a setup task that takes longer than the dashboard itself), (c)
  every API endpoint would need a session check, adding latency and
  complexity for zero current users. The cost is concrete; the
  benefit is hypothetical.
- **API-key middleware** — a static `x-api-key` header checked by
  middleware. Simpler than OAuth, no UI, no users table. Rejected as
  premature: a single static key is a weak control (it leaks via
  browser devtools on first use), and there's no user to give the
  key to. The marginal security over "no auth, but the deploy is
  Vercel-protected" is small.
- **HTTP Basic Auth in front of the whole app** — a `middleware.ts`
  that checks `Authorization: Basic`. Rejected because Basic Auth
  over anything but HTTPS is a clear-text password, and the UX is
  terrible (the browser's native dialog, no logout). Vercel's
  deployment protection does this job better.
- **Vercel deployment protection only** — the cheapest mitigation:
  turn on Vercel's deployment protection (Password or Trusted IPs) on
  the deploy. This is the v1.5 plan, not a v1 alternative — it's the
  fallback, not the primary decision.
- **mTLS / client certificates** — overkill for a single-tenant
  dashboard. Rejected.

## Consequences

**Positive.** The build shipped faster — auth is one of the most
time-consuming features to wire correctly (OAuth client registration,
session strategy, CSRF, redirect URLs, dev vs prod callback URLs).
No users table means the Prisma schema stays at seven models instead
of eight. No session middleware means every API endpoint is one
`await prisma.X.findMany()` call instead of `getSession()` +
`prisma.X.findMany({ where: { userId } })`. The dashboard feels
instant because there's no session check in the critical path.

**Negative.** **The API is open.** Anyone who can reach the Vercel
deploy URL can read all the data, trigger benchmark runs, and
generate reports. The blast radius is bounded (the worst case is a
benchmark run consuming ~300 ms of CPU per call, or a flood of
report-generation writes filling the DB), but it's real. **Must add
auth before any public exposure.** The `docs/security.md` doc
enumerates the threat model and the v2 plan; the team's standing
commitment is that no production deploy with real users goes up
without Auth.js wired. **No audit trail** — without a `User` model
and a session, there's no way to attribute a benchmark run or a
report generation to an actor.

**Neutral.** The v2 auth retrofit is scoped (~1 day of work: Auth.js
setup, GitHub OAuth app, `User` model, migration, middleware on
write endpoints, login UI). The Prisma schema is shaped so that
adding `userId` to `BenchmarkRun` and `Report` is a one-field
migration. The decision is reversible without a rewrite.
