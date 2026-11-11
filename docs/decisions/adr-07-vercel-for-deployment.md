# ADR 07: Vercel for Deployment

Date: 2026-11-11
Status: Accepted

## Context

ATLAS is a Next.js 16 App Router application. The deployment target had
to satisfy four constraints. First, **native Next.js support**: the
build's `next build` output (`.next/standalone`, `.next/static`,
server functions, edge runtime, image optimization, ISR) had to be
understood by the platform without manual server configuration. Second,
**preview deploys per branch**: every PR should get its own URL for
review, and a subagent should be able to verify a deploy by hitting
the preview URL with `curl`. Third, **the Vercel CLI is already
installed**: the sandbox inventory in `docs/environment/03-software.md`
records `vercel` CLI 65.14.0 (native) at
`/home/z/.npm-global/bin/vercel`. `netlify`, `wrangler`, and `hugo`
are all NOT INSTALLED. So choosing a non-Vercel platform would have
meant installing another CLI in the sandbox, which is a friction the
build couldn't afford. Fourth, **edge runtime optionality**: the
`/api/stats` endpoint (a read-heavy, idempotent JSON shape) is a
candidate for the Edge Runtime, and only Vercel + Cloudflare support
Edge for Next.js Route Handlers natively.

The forces against Vercel were specific and worth naming. The
sandbox is on Alibaba Cloud (egress IP `8.212.10.159`, internal DNS
`100.100.2.136/.138`); Vercel is on AWS + GCP + Edge. Latency from
the Alibaba Cloud sandbox to Vercel's edge is real (the build verified
HTTPS to `api.vercel.com` returns 308 in 33 ms, but the deploy itself
uploads the `.next/standalone` bundle, which is ~30 MB and takes
seconds). The bigger constraint is **serverless limitations**: the
live-benchmark endpoint (`POST /api/benchmarks/run`) spawns a
`python3 -c '...'` subprocess with a 30 s timeout — that does not work
on Vercel's serverless functions, which don't ship `python3` and
can't spawn arbitrary subprocesses. SQLite also doesn't work on
Vercel serverless (no writable filesystem). So the deploy-to-Vercel
plan requires either disabling the live-benchmark endpoint in prod
or moving it to a worker.

## Decision

Use **Vercel as the primary deployment platform** for ATLAS, with a
**Caddy self-host as a documented fallback**. Specifically: the
`vercel` CLI 65.14 (already installed) is the deploy mechanism; the
repo (GitHub `AutomatedLabor/atlas`, created via REST API — see the
capability report §5) is the source of truth; `next.config.ts` has
`output: "standalone"` so a self-host is a one-step `cp -r .next/static
.next/standalone/.next/ && node .next/standalone/server.js` behind
Caddy (the `Caddyfile` is already in the repo root). For the
**serverless incompatibility**, the deploy plan is: (a) the
`/api/benchmarks/run` endpoint's `python3` spawn is gated behind a
`RUNTIME_ENV` env var — in prod (Vercel serverless), the endpoint
returns a 501 with a clear "live benchmarks disabled in serverless;
use the self-hosted Caddy deploy or the seeded data" message; (b)
the seeded `BenchmarkRun` rows from `seed-data/benchmarks.json` are
always present so the dashboard has data even when live runs are
disabled. The Prisma datasource in prod swaps to Postgres
(see ADR 02) — the dev SQLite file is local-only.

## Alternatives Considered

- **Self-host on Caddy from day one** — Caddy 2.8 is installed in the
  sandbox, the `Caddyfile` is already in the repo, and `output:
  "standalone"` makes a self-host a single command. This would
  preserve the `python3` subprocess and SQLite. Rejected as the
  *primary* deploy because (a) the sandbox is ephemeral (a
  kata-container that dies when the session ends), so a self-host
  inside the sandbox isn't a durable production deploy; (b) Vercel's
  preview deploys, automatic HTTPS, and edge network are worth the
  serverless tradeoff. **Self-host is the fallback**, not the primary.
- **Netlify** — supports Next.js but the support is more manual
  (Netlify's Next.js plugin is good but lags Vercel's native support
  by a release or two). The `netlify` CLI is NOT INSTALLED. Rejected.
- **Cloudflare Pages** — supports Next.js via `@cloudflare/next-on-pages`,
  but the support is partial (some App Router features are still
  experimental as of late 2025). The `wrangler` CLI is NOT INSTALLED.
  Rejected for v1; the team would revisit for the edge network alone.
- **Render / Railway / Fly.io** — PaaS options that run a Docker
  container. Would preserve the `python3` subprocess and SQLite. The
  `docker` CLI is NOT INSTALLED in the sandbox, so building a Docker
  image would have meant installing Docker or relying on the PaaS's
  build-from-source. Rejected for the added friction.
- **AWS Amplify / SST** — full control, more ops. Rejected as too
  much ops for a single-tenant dashboard.

## Consequences

**Positive.** Vercel is native to Next.js 16 — preview deploys per
branch, automatic HTTPS, edge network, instant rollback. The
`vercel` CLI is already installed, so the deploy is `vercel --prod`
once the project is linked. The standalone output means a self-host
fallback on Caddy is a one-step command and the same codebase runs
in both environments. Preview deploys let a verify subagent curl the
deployed URL to confirm the API responds, even when the main-session
tools are down.

**Negative.** **`/api/benchmarks/run` is disabled in Vercel serverless
prod** — Vercel functions don't ship `python3` and can't spawn
arbitrary subprocesses. Mitigated by the `RUNTIME_ENV` gate (returns
501 with a clear message) and by the seeded `BenchmarkRun` data so
the dashboard is never empty. **SQLite doesn't work in Vercel
serverless** — the prod datasource must be Postgres (see ADR 02),
which adds a managed-Postgres dependency (Vercel Postgres, Neon, or
Supabase). **Cold starts** on Vercel serverless functions are
~200–500 ms for the first request after idle — acceptable for a
dashboard, but noticeable on the first hit of `/api/stats`.
**Cost**: Vercel's free tier covers ATLAS's traffic easily, but
exceeding it (e.g., a benchmark-run flood from an unauthenticated
user — see ADR 06) could incur cost.

**Neutral.** The decision is reversible: the same codebase deploys
to Caddy (self-host, preserves `python3` + SQLite) or to Vercel
(serverless, swaps to Postgres + disables live benchmarks). The
`RUNTIME_ENV` env var is the single switch between the two modes.
