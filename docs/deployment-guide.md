# ATLAS — Deployment Guide

ATLAS (Autonomous Technical Limit Assessment System) ships as a Next.js 16
standalone build. The canonical production target is **Vercel** (the
Next.js-native platform). The repository also bundles a `Caddyfile` for
self-hosting on any Node 20+ host with a static IP. This document covers:
prerequisites, local development, environment variables, the Vercel
deployment walk-through, custom security headers, two **known Vercel
limitations** (SQLite on an ephemeral filesystem, and the `python3`
benchmark subprocess), troubleshooting, rollback, and scaling.

The deployment story is intentionally boring — `bun install`, `bun run
build`, ship the `.next/standalone/` artifact — except for the two
limitations above, which are architectural and documented honestly with
mitigations rather than hand-waved.

---

## 1. Prerequisites

| Requirement        | Minimum | Recommended | Notes |
|--------------------|---------|-------------|-------|
| Node.js            | 20.x    | 24.x        | The development sandbox runs Node 24.22.2. Vercel's default Node 20.x is fine for ATLAS itself. |
| Bun                | 1.2     | 1.3.14      | The supported package manager. `bun.lock` is committed; `npm`/`pnpm` work but are not the canonical install path and may resolve differently. |
| Python 3           | 3.10    | 3.12.16     | Required only for `POST /api/benchmarks/run` (the live benchmark endpoint). Not needed for read-only deploys. **Not present in Vercel's default function image** — see §6.2. |
| SQLite             | bundled | bundled     | Prisma ships the SQLite engine; no separate install needed for dev. |
| Git                | 2.x     | 2.47.3      | For cloning and pushing. |
| GitHub account     | —       | —           | Repo lives at `github.com/AutomatedLabor/atlas`. |
| Vercel account     | —       | —           | For production. The Hobby tier covers ATLAS comfortably for an internal dashboard. |

Verify what's installed:

```bash
node --version     # should print v20.x or v24.x
bun --version      # 1.3.x
python3 --version  # Python 3.12.x (only needed for live benchmarks)
git --version
```

The sandbox the project was built in (see `docs/environment/01-os-hardware.md`
and `docs/environment/03-software.md`) runs Debian 13 trixie on a 2-vCPU
Intel Xeon kata-container with 4100 MB RAM and 0 swap. Node 24.22.2, Bun
1.3.14, Python 3.12.16, gcc 14.2, git 2.47.3, ffmpeg 7.1, pandoc 3.1,
graphviz 2.42, caddy 2.8, vercel CLI 65.14, and java 21 are installed.
Rust, go, ruby, php, clang, cmake, sqlite3, gh, and docker are **not**
installed — see `docs/environment/03-software.md` for the full inventory.

---

## 2. Local development

### 2.1 Clone and install

```bash
git clone https://github.com/AutomatedLabor/atlas.git
cd atlas
bun install
```

`bun install` resolves `bun.lock` and pulls everything: Next 16, React 19,
Prisma 6, React Query 5, Zustand 5, recharts 2, framer-motion 12,
next-themes, sonner, lucide-react, zod 4, plus 50+ shadcn/ui primitives and
their Radix dependencies. On the sandbox, cold `bun install` finishes in
~3 s; on a slower connection expect 30–60 s.

### 2.2 Configure the database

The dev database is a SQLite file. Set `DATABASE_URL` to an absolute path
inside the repo. The repo ships with a `.env` containing:

```
DATABASE_URL=file:/home/z/my-project/db/custom.db
```

If you cloned elsewhere, update the path to your checkout. For example:

```
DATABASE_URL=file:/Users/you/code/atlas/db/custom.db
```

> **The path must be absolute.** A relative `file:./db/custom.db` resolves
> against Prisma's working directory, which differs between `bun run dev`
> and `bun run prisma/seed.ts` and will silently create two different
> SQLite files. Use an absolute path to avoid this footgun.

Then create the schema and seed:

```bash
bun run db:push         # applies prisma/schema.prisma to db/custom.db
bun run db:generate      # regenerates @prisma/client (also runs on bun install via postinstall)
bun run prisma/seed.ts   # idempotent: wipes all rows, inserts the canonical seed
```

`package.json` defines `db:push` as `prisma db push --accept-data-loss`,
`db:generate` as `prisma generate`, and `db:migrate` as `prisma migrate
dev`. There is no `db:seed` script — the seed is run directly with
`bun run prisma/seed.ts` because it is a one-off TypeScript file, not a
Prisma CLI command.

The seed prints a `console.table` of final counts. Expected:

```
┌───────────────┬────────┐
│ (index)       │ Values │
├───────────────┼────────┤
│ environments  │ 1      │
│ tools         │ 28     │
│ capabilities  │ 15     │
│ benchmarks    │ 10     │
│ benchmarkRuns │ 10     │
│ limits        │ 10     │
│ reports       │ 0      │
└───────────────┴────────┘
```

If any count is wrong, the seed is broken or the schema has drifted.
Re-run `bun run db:push` and re-seed.

### 2.3 Start the dev server

```bash
bun run dev
# → next dev -p 3000 2>&1 | tee dev.log
# → Local: http://localhost:3000
```

Open `http://localhost:3000`. The dashboard renders within 2–3 s on
first compile (Next.js 16 + Turbopack). Subsequent compiles are sub-second.
The dev script tees output to `dev.log` for later inspection.

### 2.4 Production build locally

```bash
bun run build
# → next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/

bun run start
# → NODE_ENV=production bun .next/standalone/server.js 2>&1 | tee server.log
# → listens on port 3000
```

`next.config.ts` sets `output: "standalone"`, so `next build` produces a
self-contained `.next/standalone/` directory with its own `server.js` and
bundled `node_modules`. The `build` script copies `.next/static/` and
`public/` into the standalone tree so the server can serve static assets
without the parent `.next/` directory. This is the exact artifact Vercel
runs in production. Building locally is the fastest way to catch
"works-in-dev-fails-in-prod" issues before pushing.

---

## 3. Environment variables reference

| Name           | Required in dev | Required in prod | Default | Purpose |
|----------------|-----------------|------------------|---------|---------|
| `DATABASE_URL`  | yes             | yes              | `file:./db/custom.db` | Prisma connection string. `file:` for SQLite (dev), `postgresql://` for Vercel Postgres (prod), or `libsql://` for Turso. |
| `GITHUB_TOKEN`  | no              | optional (CI only) | — | Not read by the app today; reserved for CI automation that creates issues/PRs. |
| `VERCEL_TOKEN`  | no              | optional         | — | Used by `vercel deploy --token=$VERCEL_TOKEN` for non-interactive CLI deploys. Not read by the app. |

### 3.1 `.env.example`

Copy this block to `.env` and edit `DATABASE_URL`:

```bash
# --- ATLAS environment variables ---

# Prisma database connection.
#   Dev (SQLite):     file:/absolute/path/to/atlas/db/custom.db
#   Prod (Postgres):  postgresql://USER:PASS@HOST:5432/DB?schema=public
#                     &pgbouncer=true&connection_limit=1   (serverless)
#   Prod (Turso):     libsql://DB.turso.io?authToken=TOKEN
#                     (requires @prisma/adapter-libsql)
DATABASE_URL=file:/home/z/my-project/db/custom.db

# --- Optional (not read by the app) ---

# GitHub Personal Access Token (CI / automation only).
# GITHUB_TOKEN=

# Vercel CLI token (for non-interactive `vercel deploy`).
# VERCEL_TOKEN=

# Disable the live-benchmark endpoint in prod (see §6.2).
# ATLAS_LIVE_BENCHMARKS=true   # set only on dev / a worker that has python3

# Node environment (set automatically by `bun run start`; do not set in dev).
# NODE_ENV=production
```

### 3.2 What is NOT in the env

- **No auth secrets.** ATLAS v1 has no authentication (see `docs/security.md`
  §4 and `docs/decisions/adr-06-no-auth-v1.md`). When NextAuth is wired in
  v2, expect `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and provider tokens
  (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`) to land here.
- **No external API keys.** The Settings → API keys UI is browser-only
  (localStorage), not server-side. No env var is read for it.
- **No CDN or cache config.** There is no Redis, no KV, no Edge Config in
  v1. React Query is the only cache.

---

## 4. Vercel deployment — step by step

### 4.1 Connect the repo

1. Sign in to Vercel at `vercel.com`.
2. **Add New… → Project**.
3. Import the `AutomatedLabor/atlas` repository (or your fork).
4. Vercel auto-detects Next.js. Confirm:
   - **Framework preset**: Next.js
   - **Build command**: `next build` (or `bun run build` — both work; the
     latter also copies static assets into the standalone tree, which
     Vercel's Next.js builder does for you anyway).
   - **Output directory**: `.next` (auto-detected).
   - **Install command**: `bun install` (Vercel should pick this up from
     `bun.lock`; if it does not, set it explicitly under "Install Command").
5. Under **Settings → Environment Variables**, add `DATABASE_URL`. **Do
   not use a `file:` URL here** — see §6.1 below. Use one of:
   - **Vercel Postgres** (recommended): Vercel dashboard → Storage →
     Connect Database → Postgres. Copy the resulting `postgresql://...`
     URL. Append `?pgbouncer=true&connection_limit=1` for serverless
     safety (see `docs/performance-tuning.md` §3.4).
   - **Turso** (libSQL, SQLite-over-network): use
     `@prisma/adapter-libsql` per the Prisma + Turso docs.
   - **Neon**, **Supabase**, or any other serverless Postgres provider —
     the Prisma schema is provider-agnostic.
6. Click **Deploy**.

### 4.2 Apply the schema to the production database

Vercel's build runs `prisma generate` (via the `@prisma/client` postinstall
hook) but does **not** run `prisma db push` or `prisma migrate`. Apply the
schema once, locally, against the prod database:

```bash
# Option A — db push (acceptable for first-time setup):
DATABASE_URL='postgresql://...' bunx prisma db push

# Option B — generate a real migration SQL file and apply it via psql:
DATABASE_URL='postgresql://...' bunx prisma migrate diff \
  --from-empty --to-schema-datamodel prisma/schema.prisma --script > init.sql
psql "$DATABASE_URL" -f init.sql
```

`db push` is fine for a brand-new database. Once you have production data,
switch to `prisma migrate` so schema changes are versioned and reviewable.

### 4.3 Seed the production database

The seed script (`prisma/seed.ts`) is not run by Vercel. Run it once,
locally, against the prod DB:

```bash
DATABASE_URL='postgresql://...' bun run prisma/seed.ts
```

This inserts the canonical environment row (Debian 13, 2 vCPU, 4100 MB
RAM, egress IP `8.212.10.159`), 28 tools, 15 capabilities, 10 benchmarks +
10 runs, and 10 limits. If your prod environment differs from the sandbox,
edit `prisma/seed.ts` and run a separate `seed.prod.ts` — **do not commit
prod-specific environment values to the public repo**.

### 4.4 First deploy verification

After the first deploy completes:

1. Visit the Vercel preview URL. The dashboard should render with the
   seeded data.
2. Click through all 6 views (Dashboard, Environment, Benchmarks, Limits,
   Reports, Settings). All should load without console errors.
3. On the Benchmarks view, select `fib_recursive_30`, click **Run now**.
   **Expected on Vercel serverless**: the request fails with
   `benchmark_execution_failed` and `details` mentioning `ENOENT` for
   `python3`. This is the documented limitation — see §6.2.
4. Visit `/api/stats` directly — should return JSON with `environments,
   tools, capabilities, benchmarks, ...`.
5. Visit `/api/export?format=csv` — should download `atlas-export.csv`.

### 4.5 Production domain

To attach a custom domain:

1. Vercel dashboard → Project → Settings → Domains.
2. Add the domain (e.g., `atlas.yourdomain.com`).
3. Update DNS at your registrar per Vercel's instructions (CNAME or A
   record).
4. Vercel provisions TLS automatically via Let's Encrypt.

ATLAS uses relative paths (`/api/...`) everywhere, so it works at any
origin without configuration.

---

## 5. Custom security headers

Vercel does not apply security headers by default for Next.js apps. The
recommended way to add them is the `headers()` function in
`next.config.ts`. The current `next.config.ts` is minimal:

```ts
const nextConfig: NextConfig = {
  output: "standalone",
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};
```

**It does not yet define `headers()`.** The recommended addition (see
`docs/security.md` §3 for the threat-model rationale):

```ts
const nextConfig: NextConfig = {
  output: "standalone",
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options",        value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",     value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            // Tailwind injects a small amount of inline style at runtime;
            // use 'unsafe-inline' for style-src until a nonce-based
            // approach is wired in.
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';",
          },
        ],
      },
    ];
  },
};
```

These five headers cover the basics:

- **`X-Frame-Options: DENY`** — prevents the dashboard from being
  embedded in an iframe (clickjacking protection).
- **`X-Content-Type-Options: nosniff`** — stops browsers from MIME-
  sniffing responses.
- **`Referrer-Policy: strict-origin-when-cross-origin`** — sends the
  full referrer for same-origin requests and only the origin for
  cross-origin requests.
- **`Permissions-Policy: camera=(), microphone=(), geolocation=()`** —
  denies these browser capabilities to the page. ATLAS uses none of
  them.
- **`Content-Security-Policy`** — restricts script/style/img/font/connect
  sources to `'self'` (with the inline exception noted above).

### 5.1 Self-hosted headers via Caddy

For deployments behind the included `Caddyfile`, add the same headers in
Caddy:

```caddy
atlas.yourdomain.com {
  header {
    X-Frame-Options "DENY"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
  }
  reverse_proxy localhost:3000
}
```

Caddy provisions TLS automatically via Let's Encrypt.

---

## 6. Known limitations on Vercel serverless

ATLAS has two architectural choices that do not translate cleanly to
Vercel serverless. Both are documented honestly with mitigations rather
than hand-waved.

### 6.1 SQLite is not serverless-friendly

A SQLite database is a single file. On Vercel serverless:

- The function filesystem is **ephemeral**. A `file:` URL points at a
  build-time snapshot; writes (e.g., `POST /api/benchmarks/run` creating
  a `BenchmarkRun`) do not persist across cold starts. The next
  invocation may see a fresh container with the build-time DB.
- Multiple concurrent invocations are not guaranteed to share the same
  filesystem, so concurrent writes can be silently lost.

**Mitigation**: switch `DATABASE_URL` to Vercel Postgres, Turso
(libSQL), Neon, or Supabase. The Prisma schema is **Postgres-ready** —
only the `datasource db` block needs to change. No model edits are
required because the schema uses only cross-database-compatible column
types (`String`, `Int`, `Float`, `Boolean`, `DateTime`, `@id`, `@unique`,
`@relation`, `@default(now())`, `@default(cuid())`).

Edit `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

Then:

```bash
bun run db:generate         # regenerate @prisma/client for postgres
DATABASE_URL='postgresql://...' bunx prisma db push
DATABASE_URL='postgresql://...' bun run prisma/seed.ts
```

See `docs/decisions/adr-02-prisma-sqlite.md` for the SQLite-vs-Postgres
trade-off discussion.

### 6.2 The live benchmark subprocess will fail

`POST /api/benchmarks/run` calls
`child_process.execFile('python3', ['-c', script])` with
`{ timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }`. On Vercel serverless:

- `python3` is **not in the default Node function image** (the image has
  Node, not Python). `execFile` will throw `ENOENT`.
- Even with a custom image, Vercel function timeouts (10 s on Hobby, up
  to 60 s on Pro, up to 800 s on Enterprise with Fluid Compute) may be
  shorter than the 30 s subprocess timeout, so the function can be killed
  before the subprocess completes.

**Mitigations** (pick one):

1. **Disable the endpoint in prod.** Guard the route with an env check:

   ```ts
   if (process.env.ATLAS_LIVE_BENCHMARKS !== "true") {
     return NextResponse.json(
       { error: "live_benchmarks_disabled_in_prod" },
       { status: 501 },
     );
   }
   ```

   Set `ATLAS_LIVE_BENCHMARKS=true` only on dev (or a worker that has
   `python3`). The UI's **Run now** button should hide or disable itself
   when the endpoint returns 501 — a small frontend tweak.

2. **Move the endpoint to a dedicated worker.** Use Vercel Functions with
   a custom runtime image (Docker-based via `vercel.json`'s
   `functions[route].runtime` field) that includes Python 3, or deploy a
   small separate service (Fly.io machine, Railway service, AWS Lambda
   with a Python layer) and have the Next.js route proxy to it. This is
   the v2 plan; see `docs/decisions/adr-11-live-benchmark-subprocess.md`.

3. **Run benchmarks in a scheduled process outside Vercel.** A GitHub
   Action cron that runs `prisma/seed.ts`-style benchmark scripts on a
   real host, posts the results to the prod database via a small
   `POST /api/benchmark-runs` ingest endpoint, and the Next.js app only
   reads them. This is the cleanest model for a "scheduled assessment"
   workflow.

Until one of these is implemented, the Benchmarks view works for
inspection (list, comparison chart, timeline, history) but the **Run
now** button returns 501 or 500 on Vercel serverless. The 6 seeded
benchmark runs remain visible and the dashboard still renders.

### 6.3 Visual summary

```mermaid
flowchart LR
  Browser[Browser] -->|HTTPS| Vercel[Vercel edge]
  Vercel --> Fn[Next.js function\nNode 20+]
  Fn -->|reads/writes| PG[(Vercel Postgres\nor Turso libSQL)]
  Fn -.->|POST /api/benchmarks/run\nFAILS: no python3| X[501 / 500]
  Worker[Benchmark worker\nFly / Lambda / GH Action] -.->|ingest results| PG
  Fn -->|reads only| Stats[/api/stats\n/api/benchmarks\n/api/limits...]
```

---

## 7. Self-hosting with Caddy

The repo includes a `Caddyfile` that reverse-proxies `localhost:3000`.
This is the pattern used in the ATLAS sandbox itself (where `bun run
dev` runs the app and Caddy on `:81` proxies to it).

```bash
# 1. Build
bun run build

# 2. Start the standalone server (or `bun run dev` for live development)
bun run start &
# or: bun .next/standalone/server.js &

# 3. Start Caddy
caddy run --config Caddyfile &

# 4. Visit http://localhost:81
```

The `Caddyfile` also includes a `@transform_port_query` matcher that lets
you override the upstream port via `?XTransformPort=3001` for testing
alternate ports — useful when running two builds side-by-side.

For a real self-hosted deployment, edit the `Caddyfile` to use your
domain and enable automatic HTTPS (Caddy provisions TLS via Let's
Encrypt). See §5.1 for the headers block.

The self-hosted path also sidesteps the §6.2 limitation: a real host has
`python3` and can run the benchmark subprocess directly. If you
self-host, keep `ATLAS_LIVE_BENCHMARKS=true` and the live endpoint works.

---

## 8. Troubleshooting

### 8.1 Prisma client not generated

**Symptom**: `Error: @prisma/client did not initialize yet. Please run
prisma generate or migrate your database to match your schema.`

**Cause**: `@prisma/client` ships the schema-generated code in
`node_modules/.prisma/client`. If the schema changed and `prisma
generate` was not run, the client has the old schema.

**Fix**:

```bash
bun run db:generate
# then restart the dev server
```

`@prisma/client`'s postinstall script runs `prisma generate` on `bun
install`, so this only fails if you edited `prisma/schema.prisma` without
re-installing or re-generating.

### 8.2 Seed fails

**Symptom**: `[atlas-seed] FATAL: ...`.

**Cause**: `DATABASE_URL` not set, pointing to a non-existent directory,
or relative (resolves differently between Prisma CLI and the seed
script). Or the schema was not pushed yet.

**Fix**:

```bash
echo $DATABASE_URL          # confirm it is set and absolute
bun run db:push             # create the schema
bun run db:generate         # regenerate the client
bun run prisma/seed.ts      # re-seed
```

### 8.3 Dev server port conflict

**Symptom**: `Error: listen EADDRINUSE: address already in use :::3000`.

**Cause**: another process (often a previous `bun run dev` that did not
cleanly exit) is holding the port.

**Fix**:

```bash
pgrep -af "next dev"
kill <pid>
# or, more aggressively:
pkill -f "next dev"
```

`package.json` hardcodes `next dev -p 3000`. To use a different port, run
`bunx next dev -p 3001` directly (bypassing the script).

### 8.4 Build fails on Vercel

**Symptom**: Vercel build log shows `prisma:validate` or
`PrismaClientInitializationError`.

**Cause**: `DATABASE_URL` is missing, empty, or pointing at a `file:`
URL (which does not work on serverless).

**Fix**:

1. In Vercel → Project → Settings → Environment Variables, confirm
   `DATABASE_URL` is set to a `postgresql://...` URL.
2. Trigger a redeploy (Deployments → most recent → Redeploy).

If the build fails at the `next build` step (not Prisma):

- Check the Node version (Vercel → Settings → General → Node.js Version).
  Use 20.x or 22.x; ATLAS has not been tested on 18.x.
- If the error is `Cannot find module 'sharp'`, that is a transitive
  dependency that occasionally fails to install on Vercel; re-run the
  deploy. If it persists, add `sharp` to `package.json` dependencies
  explicitly.
- If Prisma's postinstall did not run, add a `postinstall` script:
  `"postinstall": "prisma generate"` to `package.json`. This is usually
  unnecessary — Prisma's default install already runs `prisma generate`.

### 8.5 Hydration mismatch

**Symptom**: console warning `Hydration failed because the initial UI
does not match what was rendered on the server`.

**Cause**: most often the next-themes SSR path. The root `<html>` tag
has `suppressHydrationWarning` to silence this for the theme class. If
the warning appears for other components, find the dynamic value
(`Date.now()`, `Math.random()`, `new Date()` in render, or a
`typeof window !== "undefined"` check) and wrap it in `useEffect` +
`useState`. `ThemeToggle` and `StatusPill` already use this pattern.

### 8.6 `next dev` crashes with OOM

**Symptom**: the dev server prints `Killed` or `JavaScript heap out of
memory`.

**Cause**: the sandbox has 4.1 GiB RAM and 0 swap. Turbopack + Prisma
client + a few rounds of recompilation can exhaust it. The
`src/lib/db.ts` source comment documents this exact issue and disables
Prisma's `['query']` log channel for that reason (it was producing ~30 KB
of stdout per request and competing with Turbopack for memory).

**Fix**:

```bash
NODE_OPTIONS=--max-old-space-size=3072 bun run dev
# 3072 MB leaves ~1 GB for the OS and other processes on a 4 GB sandbox.
```

For Vercel this is not an issue — serverless functions have their own
memory budget (default 1024 MB, configurable up to 3008 MB on Hobby).

---

## 9. Rollback

### 9.1 Vercel instant rollback

Vercel keeps every deploy; rollback is one click:

1. Vercel dashboard → Project → Deployments.
2. Find the last known-good deploy (the green one before the broken one).
3. Click the `⋯` menu → **Instant Rollback**.

Vercel switches the production alias to the previous build in seconds.
No rebuild is needed. The previous build's environment variables are
reused.

### 9.2 Git revert + redeploy

For a code-level rollback:

```bash
git revert <bad-commit-sha>
git push origin main
# Vercel auto-deploys from main → new deploy with the revert applied
```

For a multi-commit revert, use `git revert <oldest-bad>..HEAD` (creates
one revert commit per commit being undone). Vercel deploys the result.

### 9.3 Database rollback

Prisma's `db push` and `migrate dev` are forward-only dev tools, not prod
rollback tools. For prod:

- Take a **backup** before any schema change (`pg_dump` for Postgres,
  `cp db/custom.db db/custom.db.bak` for SQLite in dev).
- If a migration breaks the prod DB, restore from backup, then deploy the
  fixed code.

ATLAS has no automatic backup story in v1. The seed is the closest thing
to a "fresh state" — `bun run prisma/seed.ts` wipes and recreates the
canonical data, losing any user-generated reports or runs. Treat the
seed as destructive.

---

## 10. Scaling

### 10.1 Database

The current bottleneck for "many users, many environments" is the single
SQLite file. Scaling paths:

1. **Postgres (single instance)**: switch `DATABASE_URL`, no app changes.
   Comfortable up to ~1000 concurrent users for a read-heavy dashboard.
2. **Postgres + read replica**: route `GET /api/stats` and other
   read-heavy endpoints to a read replica; keep writes on the primary.
   Requires Prisma's read-replica support or a small wrapper in
   `src/lib/db.ts`.
3. **Connection pooling**: on Vercel serverless, each function invocation
   opens a Prisma client. Use PgBouncer or Vercel Postgres's built-in
   pool to avoid connection exhaustion. The `src/lib/db.ts` singleton
   helps within a single invocation but not across invocations. Append
   `?pgbouncer=true&connection_limit=1` to the `DATABASE_URL`.

### 10.2 Caching

ATLAS does not server-side cache today. React Query is the cache on the
client (`staleTime: 30_000`, see `src/lib/query-provider.tsx`). For prod
with many users, an in-memory LRU on `/api/stats` (which changes rarely)
would amortize the seven `count()` calls plus the `_avg` aggregation. A
60-second TTL is safe — see `docs/performance-tuning.md` §4.2 for the
proposed implementation. Trade-off: stale stats for up to 60 s after a
new benchmark run lands. For a single-tenant internal dashboard this is
acceptable; for a multi-tenant dashboard with per-user stats it is not.

### 10.3 Live benchmark endpoint

This endpoint is the most expensive (spawns a Python process, takes up
to 30 s). In a multi-tenant future it must be:

- **Rate-limited** per IP / per API key.
- **Queued** (return 202 Accepted + a job ID, poll for the result).
- **Offloaded** to a worker pool (not the same function that handles
  web requests).

For v1 (single user, internal tool) none of this is needed. The 30 s
subprocess timeout is the only protection today.

### 10.4 Bundle size

The production bundle is roughly ~270–350 KB gzipped (recharts +
framer-motion + react-dom + the shadcn primitives ATLAS uses).
Code-splitting per view with `React.lazy` would cut the initial bundle
by ~30% — recharts is only needed for chart-rendering views and the
Settings view uses none of it. See `docs/performance-tuning.md` §1.2 for
the proposed implementation.

---

## 11. Quick reference — the deploy checklist

```bash
# 0. On your machine, in a clean clone:
bun install
bun run db:push
bun run db:generate
bun run prisma/seed.ts
bun run dev
# → visit http://localhost:3000, click through the 6 views

# 1. Commit & push to main:
git add -A && git commit -m "vX.Y.Z" && git push origin main

# 2. (Vercel auto-deploys from main. Wait for the green checkmark.)

# 3. Apply schema to prod DB (one time only):
DATABASE_URL='postgresql://...' bunx prisma db push

# 4. Seed prod (one time only):
DATABASE_URL='postgresql://...' bun run prisma/seed.ts

# 5. Verify prod:
curl -s https://atlas.yourdomain.com/api/stats | jq
# visit https://atlas.yourdomain.com, click through the 6 views
# expect: live benchmark "Run now" returns 501/500 until §6.2 mitigation is applied
```

---

## Cross-references

- **Architecture** — `docs/architecture.md` (deployment topology diagram)
- **Environment cartography** — `docs/environment/00-index.md` (the
  actual sandbox the project was built in)
- **Prisma + SQLite ADR** — `docs/decisions/adr-02-prisma-sqlite.md`
- **Live benchmark ADR** — `docs/decisions/adr-11-live-benchmark-subprocess.md`
- **Vercel deploy ADR** — `docs/decisions/adr-07-vercel-deploy.md`
- **No-auth ADR** — `docs/decisions/adr-06-no-auth-v1.md`
- **Security (incl. headers + threat model)** — `docs/security.md`
- **Performance tuning (incl. baseline + cache proposal)** — `docs/performance-tuning.md`
- **Testing (incl. the manual 10-point checklist)** — `docs/testing-guide.md`
