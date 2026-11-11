# ATLAS — Security

ATLAS is a **read-heavy** dashboard with a small number of write endpoints
(`POST /api/benchmarks/run`, `POST /api/reports`, and the download `GET
/api/export`). The most sensitive threat surfaces are: (a) the live
benchmark subprocess, which spawns a Python interpreter on every request
and is a CPU-DoS vector if abused; (b) report content, which is persisted
to the database and rendered back to the user (XSS risk if rendered as
HTML); (c) the export endpoint, which can exfiltrate the full dataset;
and (d) the **complete absence of authentication**, which is currently by
design and documented here as a deliberate v1 gap with a remediation
plan.

This document is the **threat model**, the **security measures in
place**, the **measures missing**, the **incident response plan**, the
**dependency audit process**, and a **10-item hardening checklist** for
the next iteration.

---

## 1. Threat model

### 1.1 What ATLAS is

ATLAS is a single-page Next.js 16 dashboard that visualizes telemetry
about its own sandbox host: the OS, hardware, installed tools, benchmark
durations, and architectural limits. The seed data includes the public
egress IP (`8.212.10.159`), the hostname
(`c-6af44108-140d72b5-6bf513003f7a`), the kernel version
(`5.10.134-013.15.kangaroo.al8.x86_64`), and a list of which tools are
*not* installed (e.g., `no_docker`, `no_rust`, `no_gh_cli`). The frontend
exposes all of this in the Environment and Limits views. The data is
**deliberately** displayed — it is the product. None of it is PII; all of
it is already published in `docs/environment/` in the public repo.

### 1.2 The asset inventory

| Asset | Sensitivity | Where it lives | Exposed to |
|-------|-------------|----------------|------------|
| Environment metadata (hostname, kernel, CPU, public IP) | Low — internal telemetry, already public in `docs/environment/` | `Environment` table | Anyone who can reach the dashboard |
| Tool inventory (installed versions, paths) | Low | `Tool` table | Anyone who can reach the dashboard |
| Capabilities (file IO throughput, HTTP latency) | Low | `Capability` table | Anyone who can reach the dashboard |
| Benchmark durations | Low | `BenchmarkRun` table | Anyone who can reach the dashboard |
| Limits (memory cap, no-docker, egress IP) | Low | `Limit` table | Anyone who can reach the dashboard |
| Reports (user-generated snapshots) | Low-medium (could contain notes a user wrote) | `Report` table | Anyone who can reach the dashboard |
| `DATABASE_URL` (Postgres prod) | High (contains DB credentials) | Vercel env var | Vercel project maintainers only |
| `ATLAS_LIVE_BENCHMARKS` flag | Low | Vercel env var | Vercel project maintainers only |

There are no passwords, no API tokens, no PII, no payment data, no health
data anywhere in the schema or the seed.

### 1.3 The threat actors

| Actor | Capability | Likelihood for v1 | Mitigation |
|-------|------------|-------------------|------------|
| Casual visitor (URL leaked) | Read all data; trigger benchmark runs; create reports | High if URL is shared | §4 (auth gap) + §2.4 (rate limiting absent) |
| Scripted attacker | Volume-abuse the benchmark endpoint (CPU DoS); exfiltrate all data via `/api/export` | Medium | §2.1 (30s timeout) + §2.3 (pagination caps) + §4 (auth) |
| Insider (intended user) | All of the above, by design | High (it's the user) | N/A — this is the intended use |
| Supply-chain attacker (compromised npm dep) | Arbitrary code execution at build/run time | Low per dep, non-trivial in aggregate | §6 (dependency audit) |
| Vercel platform compromise | Read env vars, intercept requests | Very low | Out of scope — trust the platform |

### 1.4 The four named threats

**T1 — Abusive benchmark runs (CPU DoS).** `POST /api/benchmarks/run`
spawns `python3 -c <script>` with a 30-second timeout. Each request
consumes up to 30 s of CPU on a 2-vCPU host. An attacker who can hit the
endpoint can submit hundreds of requests per second (Vercel function
concurrency caps help, but locally on the sandbox there is no cap). The
30 s timeout protects each individual request from running forever; it
does not prevent volume. **Mitigation in place**: 30 s subprocess timeout
(`src/app/api/benchmarks/run/route.ts`, `timeout: 30_000`). **Mitigation
missing**: per-IP / per-key rate limiting; a job queue; authentication.
See §4.2 for the v2 plan.

**T2 — Report content XSS.** The `Report` model has a `content` string
column. The `POST /api/reports` endpoint builds the content for HTML
reports using string interpolation, but it **escapes `<`, `>`, `&`**
before inserting user-controlled values (the report `title` and the run
`details`). The frontend renders report content as a text node
(`{openReport?.content ?? "(no content)"}` in `reports-view.tsx` line
~286), **not** as HTML — so even a malicious `content` string is shown as
text, not executed. The `format: 'html'` report is a downloadable HTML
document (the `Content-Type` is text/html if served as a file); a user
who downloads and opens it would render the HTML, but the only
user-controlled fields in the HTML are the title and run details, both
of which are HTML-escaped at generation time. **Mitigation in place**:
HTML-escape at generation; text-node rendering in the UI; no
`dangerouslySetInnerHTML` in ATLAS-authored code. **Mitigation missing**:
a strict CSP header (see `docs/deployment-guide.md` §5).

**T3 — Data exfiltration via export.** `GET /api/export?format=csv|json`
returns the full `BenchmarkRun` and `Limit` dataset in one response. For
the seed (10 runs + 10 limits) this is a few KB; for a year of operation
it could be MBs. The endpoint has no pagination and no auth. An attacker
who can reach the URL can download the entire dataset in one request.
**Mitigation in place**: same-origin only (no CORS headers, so a
browser on another origin can't read the response — but a server-side
attacker or a `curl` can). **Mitigation missing**: auth; rate limiting;
a size cap. The data is non-sensitive (T3 is mostly an availability
concern, not a confidentiality concern) so this is low priority.

**T4 — Unauthorized API access (the auth gap).** There is no
authentication on any endpoint. Anyone who can reach the deployed URL
can read all data and trigger benchmark runs. This is **deliberate for
v1** (single-tenant internal dashboard, URL not advertised) and is
documented as a deferred decision in
`docs/decisions/adr-06-no-auth-v1.md`. The `next-auth` package is in
`package.json` (`^4.24.11`) but **not imported anywhere in `src/`** —
it's dead weight, kept for the v2 wiring to be a smaller diff. See §4
for the remediation plan.

```mermaid
flowchart TB
  Internet[Internet] --> Vercel[Vercel function\nno auth]
  Vercel -->|read| DB[(Postgres / SQLite)]
  Vercel -->|write run| Py[python3 subprocess\n30s timeout]
  Py -->|stdout ms| Vercel
  Vercel -->|content| Reports[Report table\nescaped at gen]
  Reports -->|text node| Browser[Browser\nno dangerouslySetInnerHTML]
  Vercel -->|full dataset| Export[/api/export\nno auth, no rate limit]

  style Vercel fill:#fef3c7
  style Py fill:#fee2e2
  style Export fill:#fee2e2
  style Reports fill:#dcfce7
  style Browser fill:#dcfce7
```

Yellow = gap documented here; red = active risk; green = mitigated.

---

## 2. Security measures implemented

### 2.1 Zod input validation on every write endpoint

Every endpoint that accepts a body or non-trivial query string validates
it with a Zod schema before touching the database:

| Endpoint | Schema | What it rejects |
|----------|--------|-----------------|
| `POST /api/benchmarks/run` | `z.object({ name: z.string().min(1) })` | Empty / missing `name` (then a second gate: the `BENCH_PYTHON[name]` lookup rejects unsupported names with 400 `unsupported_benchmark`) |
| `POST /api/reports` | `z.object({ title: z.string().min(1).max(200), format: z.enum(['html','json','csv']), parameters: z.record(z.string(), z.unknown()).optional() })` | Missing title, title > 200 chars, format not in the enum |
| `GET /api/tools` | `z.object({ q: z.string().optional(), category: z.string().optional(), installed: z.enum(['true','false']).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) })` | Non-integer page/limit, limit > 200, installed not in enum |
| `GET /api/capabilities` | Same shape as tools | Same |
| `GET /api/limits` | Same shape, with `severity` / `kind` string filters | Same |
| `GET /api/export` | `z.object({ format: z.enum(['csv','json']).default('json') })` | Format not in enum |

The Zod schemas are the first line of defense — malformed input is
rejected with a 400 and a structured `{ error, details }` body before any
database query runs. The error response shape is consistent across all
routes: `{ error: string, details?: ... }` for 400s and 500s.

### 2.2 30-second timeout on the benchmark subprocess

`src/app/api/benchmarks/run/route.ts` spawns the Python subprocess with:

```ts
const res = await execFileP('python3', ['-c', script], {
  timeout: 30_000,
  maxBuffer: 10 * 1024 * 1024,
})
```

The `timeout: 30_000` kills the subprocess after 30 seconds of wall
clock. This protects against: infinite loops in a buggy benchmark, a
malicious script that tries to run forever, and accidental resource
exhaustion. The `maxBuffer: 10 * 1024 * 1024` caps stdout at 10 MB so a
script that prints excessively can't OOM the Node process. None of the
4 supported benchmarks print more than a few hundred bytes; the cap is
defensive.

The script is passed via `python3 -c <script>` (a string argument), not
`python3 <file>`, so there is no file-write attack surface. The script
content comes from the hardcoded `BENCH_PYTHON` record in the route
file — there is no way for a request body to inject arbitrary Python.
The only user-controlled value that reaches the subprocess is the
benchmark `name`, which is looked up in `BENCH_PYTHON`; an unsupported
name is rejected with 400 before the subprocess is spawned.

### 2.3 Pagination caps prevent huge responses

Every paginated endpoint caps `limit` at 200 (`z.coerce.number().int()
.min(1).max(200).default(50)`). This prevents a client from requesting
"give me everything" in a single response that would OOM the function or
hang the database. The default of 50 keeps responses small for the common
case. A client can still page through the full dataset with repeated
`?page=N` requests, but each response is bounded.

The non-paginated endpoints (`/api/environments`, `/api/benchmarks`,
`/api/reports`) are intentionally unpaginated because they return small
lists. If those grow beyond ~100 rows, add pagination following the same
Zod pattern.

### 2.4 Prisma parameterized queries — no SQL injection

All database access goes through Prisma's query builder
(`db.tool.findMany`, `db.benchmarkRun.create`, etc.). Prisma compiles
these to parameterized SQL — user input is passed as bind parameters,
never string-interpolated into the query. The `where` objects built in
the route handlers (e.g., `where.name = { contains: q.trim() }`) are
Prisma query objects, not raw SQL strings.

There are no `$queryRaw` or `$executeRaw` calls in the codebase (grep
confirms). The only raw-ish access is the `_avg` aggregate, which is also
a typed Prisma operation, not raw SQL. **SQL injection is not a vector
in this codebase** as long as Prisma is used correctly.

### 2.5 No `dangerouslySetInnerHTML` in ATLAS-authored code

A grep for `dangerouslySetInnerHTML` across `src/` finds exactly one
match: `src/components/ui/chart.tsx` (the shadcn/ui chart wrapper). It is
used to inject a `<style>` tag with CSS variable definitions derived
from a static `THEMES` constant — **not user input**. This is shadcn/ui's
standard chart-theming pattern and is safe. It is **not** ATLAS-authored
code; it is owned by the shadcn CLI and regenerated on `bunx shadcn add
chart`.

ATLAS-authored code (anything under `src/components/atlas/`,
`src/app/`, `src/hooks/`, `src/lib/`) uses **no** `dangerouslySetInnerHTML`,
**no** `innerHTML`, **no** `eval`, and **no** `new Function`. Report
content is rendered as a text node in the Reports view dialog:
`{openReport?.content ?? "(no content)"}` — React escapes the string,
so even a `content` value containing `<script>alert(1)</script>` is
shown as literal text, not executed.

### 2.6 Same-origin — CORS not needed

The frontend and the API are served from the same origin (the Next.js
app at `/` and the route handlers at `/api/*`). There is no cross-origin
fetch from the browser. The `apiGet` / `apiPost` helpers in
`src/lib/api.ts` use relative paths (`/api/...`). There is no `Access-
Control-Allow-Origin` header in any response because none is needed.

A `curl` from another origin can still read the JSON (CORS is a
browser-enforced mechanism, not a server-side access control). The
mitigation for "an attacker with a script on another origin can read
the data" is the same as T4 — auth — not CORS.

### 2.7 Recommended CSP header

A Content-Security-Policy header is the browser-side complement to the
server-side measures above. The recommended CSP for ATLAS (see
`docs/deployment-guide.md` §5 for the exact `next.config.ts` snippet):

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self';
frame-ancestors 'none';
```

The `'unsafe-inline'` for `script-src` and `style-src` is needed because
Tailwind injects a small amount of inline style at runtime and Next.js
can inline small scripts for hydration. A stricter, nonce-based CSP is
possible with Next.js's built-in nonce support but is not wired in v1.

`frame-ancestors 'none'` is the CSP equivalent of `X-Frame-Options: DENY`
and prevents the dashboard from being embedded in an iframe
(clickjacking). Both are set in the recommended headers block.

---

## 3. Authentication architecture

### 3.1 Current state: NONE

ATLAS v1 has no authentication. All endpoints (read and write) are open
to anyone who can reach the deployed URL. This is a **deliberate,
documented decision** — see `docs/decisions/adr-06-no-auth-v1.md`. The
rationale:

- The data is non-sensitive (no PII, no secrets; the egress IP and
  kernel version are already public in `docs/environment/`).
- The deployment URL is not advertised (private Vercel preview or
  internal Caddy host).
- The single-tenant assumption for v1 is "one user is looking at one
  environment's data."
- There are no DELETE endpoints — an attacker can't destroy data, only
  create spurious benchmark runs / reports.

The mitigations in place (Zod validation, 30 s subprocess timeout,
pagination caps) protect against the worst abuse vectors but do not
provide access control.

### 3.2 The gap

The gap is real: anyone who finds the URL can read all data and trigger
benchmark runs. For a non-sensitive internal dashboard on a private URL
this is acceptable. For any deployment where the URL could be guessed or
indexed (e.g., a Vercel preview URL that leaks via a screenshot, a DNS
record that's enumerable), this is a vulnerability. The ADR explicitly
says: **revisit before any v1.x deployment to a non-private URL**.

### 3.3 The v2 plan

The `next-auth` package is already in `package.json` (`^4.24.11`) but
not imported. The v2 wiring plan:

1. **Add a NextAuth configuration** at `src/lib/auth.ts` with:
   - **GitHub OAuth** as the primary provider (the team is GitHub-based;
     `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` in env).
   - **Credentials provider** for API-key auth (for agents / scripts
     that don't have a browser; the key is validated against a static
     list in env or a future `ApiKey` Prisma model).
2. **Add `src/middleware.ts`** that gates `/api/*` behind a valid
   session or API key. Leave `GET` endpoints open if read-only public
   access is desired; gate `POST` endpoints strictly.
3. **Add a login page** at `/api/auth/signin` (NextAuth's default) and a
   "Sign in" button in `app-header.tsx`. Logout via NextAuth's
   `/api/auth/signout`.
4. **Add an `AuditLog` Prisma model** + write a log row for every POST
   (actor, action, timestamp, payload hash). This addresses the "no
   audit trail" cost in the ADR.
5. **Add `NEXTAUTH_URL`, `NEXTAUTH_SECRET`** to the env var table (see
   `docs/deployment-guide.md` §3).
6. **Add a `User` model** to `prisma/schema.prisma` with a foreign key
   from `Report` (and future `ApiKey`). Multi-tenancy is blocked on
   this step — until users exist, "which user owns which environment"
   is undefined.

The v2 auth surface is estimated at 1–2 days of work. The ADR keeps
`next-auth` in `package.json` so the v2 diff is small.

### 3.4 Stopgap: Vercel Password Protection

For a v1.5 deploy that needs to be private but doesn't want to wait for
v2 auth, Vercel Pro offers **Vercel Password Protection** — a one-click
toggle that puts HTTP Basic Auth in front of the whole deploy. This is
the right move for a "deploy and forget" internal dashboard and requires
no code changes in ATLAS. The downside: browser basic-auth dialogs are
clunky and there's no logout button. For a longer-lived internal deploy,
Cloudflare Access or Vercel's team SSO are better stopgaps.

---

## 4. Data protection

### 4.1 No PII

The Prisma schema (`prisma/schema.prisma`) has no PII columns. The
`Environment` model stores hostname, OS, kernel, CPU, memory, swap,
disk, container, public IP, and arch — all infrastructure metadata. The
`Tool` model stores name, category, version, path. The `Capability`,
`Benchmark`, `BenchmarkRun`, `Limit`, `Report` models store only
technical measurements and (for `Report`) a user-supplied `title` and
`parameters` object.

There is no `User` table, no email column, no name column, no address
column, no payment column. ATLAS does not collect PII because it has no
users in v1.

### 4.2 The "intentionally exposed" fields

The frontend deliberately displays the public egress IP
(`8.212.10.159`), the hostname, the kernel version, and the list of
tools that are not installed. These are infrastructure facts about the
sandbox, not secrets. They are already published in `docs/environment/`
in the public GitHub repo. Showing them in the dashboard is the
product — it's the "agent capability telemetry" that ATLAS exists to
visualize.

If you fork ATLAS for an environment where these facts *are* sensitive
(e.g., an internal staging host whose hostname you don't want public),
edit `prisma/seed.ts` to omit them and edit the Environment view to hide
them behind a feature flag. The current seed hardcodes the sandbox
values; a prod seed should reflect the prod environment's actual
sensitivity.

### 4.3 Secrets in env vars

The only secret in the system is the `DATABASE_URL` (which contains
Postgres credentials in prod). It lives in the Vercel project's
environment variables, visible only to project maintainers. It is never
logged, never returned in any API response, never serialized into a
report. The `src/lib/db.ts` singleton reads it at module load and
passes it to Prisma; it does not appear in any other code path.

The optional `GITHUB_TOKEN` and `VERCEL_TOKEN` (see
`docs/deployment-guide.md` §3) are CI/automation tokens, not read by the
app, and follow the same handling: Vercel env vars, never logged.

---

## 5. Incident response

### 5.1 Benchmark hang

**Scenario**: a benchmark subprocess runs longer than expected (a
buggy script, an infinite loop, or a malicious name that slips past the
`BENCH_PYTHON` gate — currently not possible, but defense in depth).

**Response**: the 30 s `timeout` in `execFileP` kills the subprocess.
The route catches the `execFile` error and returns 500 with
`benchmark_execution_failed` and the error message. The Node process
itself is not affected — the subprocess is isolated. No action needed
beyond the automatic kill.

If the Node process itself hangs (not the subprocess — e.g., a Prisma
query that never returns), Vercel's function-level timeout (10 s Hobby,
60 s Pro) kills the function. The user sees a 504 or a function-error
page. Restart is automatic on the next invocation.

### 5.2 Database corruption

**Scenario**: the SQLite file is corrupted (disk error, interrupted
write, a `prisma db push` that ran while the dev server was mid-query).

**Response (dev)**: delete the file and re-seed.

```bash
rm db/custom.db
bun run db:push
bun run prisma/seed.ts
```

The seed is idempotent (it wipes all rows first), so re-running it on a
fresh file is safe. Any user-generated `Report` rows are lost — there is
no backup story in v1. If you have reports you want to keep, dump them
to JSON via `/api/export?format=json` before deleting the file.

**Response (prod, Postgres)**: restore from the most recent `pg_dump`
backup. ATLAS has no automatic backup story; schedule one with
`pg_dump` + S3 (or use Vercel Postgres's built-in backups on Pro).

### 5.3 Bad Vercel deploy

**Scenario**: a deploy introduces a regression (broken build, runtime
error on the dashboard, broken API endpoint).

**Response**: Vercel instant rollback (see
`docs/deployment-guide.md` §9.1):

1. Vercel dashboard → Project → Deployments.
2. Find the last known-good deploy.
3. Click `⋯` → **Instant Rollback**.

Vercel switches the production alias to the previous build in seconds.
No rebuild is needed. Then fix forward: `git revert <bad-commit>`,
`git push origin main`, Vercel auto-deploys the revert.

### 5.4 Report abuse

**Scenario**: an attacker creates thousands of spurious reports via
`POST /api/reports`, filling the `Report` table.

**Response**: there is no rate limit on `POST /api/reports` in v1, so
this is possible. Mitigation: delete the reports via a one-off Prisma
script (`await db.report.deleteMany({ where: { ... } })`) or re-seed
(`bun run prisma/seed.ts` wipes the `Report` table). Add rate limiting
and auth in v2 (see §4.2). This is a known gap, not an incident
requiring escalation.

### 5.5 Subprocess escape attempt

**Scenario**: an attacker tries to inject arbitrary Python via the
benchmark endpoint.

**Response**: not possible in v1. The `name` field is looked up in the
hardcoded `BENCH_PYTHON` record; an unsupported name returns 400 before
the subprocess is spawned. There is no way for a request body to
influence the Python script content. If a future refactor adds
user-supplied script content, this becomes a critical vector — the
`BENCH_PYTHON` lookup must remain the gate.

---

## 6. Dependency audit

### 6.1 The command

```bash
bun audit            # prints vulnerabilities in the lockfile
bun audit --json     # machine-readable
```

`bun audit` queries the npm advisory database for known
vulnerabilities in the dependencies listed in `bun.lock`. A clean run
prints "0 vulnerabilities" and exits 0. Run it on every PR that touches
`package.json` and on a weekly cron.

### 6.2 The dependency posture

ATLAS's dependencies are mainstream and well-maintained:

- **Next.js 16** (Vercel) — the framework; security patches ship weekly.
- **React 19** (Meta) — the UI library; patches ship as needed.
- **Prisma 6** (Prisma) — the ORM; patches ship monthly.
- **@tanstack/react-query 5** (Tanner Linsley) — server state; active.
- **zustand 5** (Poimandres) — client state; active.
- **recharts 2** (recharts) — charts; active.
- **framer-motion 12** (Framer/Microsoft) — animation; active.
- **next-themes** (Paco) — theme switching; small, stable.
- **sonner** (Emil Kowalski) — toasts; active.
- **lucide-react** (lucide) — icons; active.
- **zod 4** (Colin McDonnell) — schema validation; active.
- **shadcn/ui primitives** (Radix UI + shadcn) — UI atoms; Radix is
  active, shadcn is regen-on-add.
- **next-auth 4** (NextAuth.js) — auth; **not imported in v1**, dead
  weight kept for v2.

The transitive dependency tree is large (Radix UI pulls in many
packages, Next pulls in webpack/edge-runtime chunks) but every named
dependency is a mainstream, audited package. There are no
obscure/single-maintainer dependencies in the critical path.

### 6.3 Supply-chain risk

The `bun audit` command catches known vulnerabilities. It does not
catch: a compromised package publish (e.g., a maintainer's npm token is
stolen and a malicious version is published), a typosquatted package
accidentally installed, or a malicious postinstall script. Mitigations:

- Use `bun install` (which respects `bun.lock` and refuses to silently
  change versions).
- Pin major versions in `package.json` (the `^` ranges are wide; if you
  want stricter pinning, use `"~1.2.3"` or exact versions).
- Review the diff of `bun.lock` on every PR that touches
  `package.json`.
- Enable npm's "audit log" or a similar supply-chain tool if you adopt
  this project for production use.

### 6.4 Removing the dead `next-auth` dep

If v2 auth does not land within a reasonable window, removing
`next-auth` from `package.json` shrinks the supply-chain surface by one
package. The ADR (`adr-06-no-auth-v1.md`) explicitly accepts the dead
weight for v2-ready convenience; if v2 slips, remove it.

---

## 7. Compliance

ATLAS is an internal tool. It does not process PII, payment data, or
health data. There is no GDPR, HIPAA, PCI-DSS, or SOC 2 compliance
obligation for v1.

If ATLAS is adopted for a context where one of these applies (e.g., a
regulated industry, a public-facing deployment, processing of customer
data), the v2 auth work (§3.3) and an audit-log model (§3.3 step 4)
become prerequisites, not optional. This document does not constitute
legal or compliance advice.

---

## 8. Security checklist for future hardening

Ten concrete items, roughly in priority order, for the next hardening
pass:

1. **Add authentication.** Wire `next-auth` v4 with GitHub OAuth +
   credentials provider; add `src/middleware.ts` to gate `POST` endpoints
   strictly and `GET` endpoints optionally. This is the single highest-
   impact item — it closes T4 and shrinks T1, T3 in one move. See §3.3.
2. **Add rate limiting on `POST /api/benchmarks/run` and `POST
   /api/reports`.** A per-IP or per-key cap (e.g., 10 runs/minute) closes
   T1. Use Vercel's edge rate limiting or a small in-memory token bucket
   in the route handler (the latter only works for self-hosted long-run
   instances; on serverless you need a shared store like Vercel KV).
3. **Add the security headers block to `next.config.ts`.** The five
   headers in `docs/deployment-guide.md` §5 (X-Frame-Options DENY,
   X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy,
   CSP) are not yet set. This is a one-commit change with no runtime cost.
4. **Add an `AuditLog` Prisma model** and write a row on every POST
   (actor, action, timestamp, payload hash). This addresses the "no
   audit trail" cost in the no-auth ADR and is a prerequisite for any
   compliance regime.
5. **Tighten the benchmark endpoint's Zod schema** from
   `z.string().min(1)` to `z.enum(['csv_generate_1m', 'sha256_10k',
   'fib_recursive_30', 'matmul_100x100'])`. The current permissive
   schema relies on the `BENCH_PYTHON[name]` lookup as the gate; a
   future refactor could accidentally remove the lookup. An enum schema
   makes the contract explicit at the type level.
6. **Add a `Vercel Password Protection` toggle** (or Cloudflare Access)
   as a stopgap for v1.x deploys that need to be private but don't want
   to wait for v2 auth. One-click, no code changes.
7. **Add a `bun audit` step to CI** (when CI exists) and a weekly cron.
   Fail the build on `critical` or `high` vulnerabilities. Document the
   remediation SLA (e.g., 7 days for high, 1 day for critical).
8. **Add a size cap to `/api/export`**. For a year of operation the
   export could be MBs. Add a `?limit=N` parameter and a hard cap (e.g.,
   10,000 rows per section) so a single request can't OOM the function.
9. **Move benchmark execution off the request path.** Even with rate
   limiting, a 30 s synchronous request is fragile. Return 202 Accepted
   + a job ID, run the benchmark in a worker (Vercel Function with a
   custom image that includes Python, or a separate service), and have
   the client poll `GET /api/benchmark-runs/[jobId]` for the result.
   This is the v2 plan in `docs/decisions/adr-11-live-benchmark-subprocess.md`.
10. **Remove `next-auth` from `package.json` if v2 auth slips more than
    a quarter.** Dead dependencies are supply-chain surface area with no
    benefit. The ADR keeps it for v2-ready convenience; if v2 slips, cut
    it and re-add when actually needed.

Each item is independently shippable; none block the others. Items 1,
2, 3 are the highest-leverage; items 5, 8, 10 are the smallest diffs.

---

## 9. Quick reference — the security posture

| Surface | Status | Where documented |
|---------|--------|------------------|
| Input validation | All write endpoints Zod-validated | §2.1 |
| Subprocess timeout | 30 s hard cap | §2.2 |
| Pagination caps | `limit` max 200 | §2.3 |
| SQL injection | Prisma parameterized queries; no raw SQL | §2.4 |
| XSS in reports | HTML-escape at gen; text-node rendering; no `dangerouslySetInnerHTML` in ATLAS code | §2.5 |
| CORS | Same-origin; no CORS headers needed | §2.6 |
| CSP header | Recommended but not yet set | §2.7, `docs/deployment-guide.md` §5 |
| Authentication | NONE in v1 (documented gap) | §3, `docs/decisions/adr-06-no-auth-v1.md` |
| Authorization | NONE in v1 (same gap) | §3 |
| Rate limiting | NONE in v1 | §1.4 T1, §8 item 2 |
| Audit log | NONE in v1 | §3.3 step 4, §8 item 4 |
| PII | None collected | §4.1 |
| Secrets | `DATABASE_URL` in Vercel env; never logged | §4.3 |
| Dependency audit | `bun audit` (manual) | §6 |
| Compliance | N/A for v1 | §7 |

---

## Cross-references

- **No-auth ADR** — `docs/decisions/adr-06-no-auth-v1.md`
- **Live benchmark subprocess ADR** — `docs/decisions/adr-11-live-benchmark-subprocess.md`
- **Prisma + SQLite ADR** — `docs/decisions/adr-02-prisma-sqlite.md`
- **Deployment guide (security headers, Vercel limitations, rollback)** — `docs/deployment-guide.md`
- **Performance tuning (rate-limiting-adjacent caching, baseline profile)** — `docs/performance-tuning.md`
- **Architecture (asset inventory context)** — `docs/architecture.md`
- **Environment cartography (what data is "already public")** — `docs/environment/00-index.md`
- **Software inventory (what's installed = attack surface)** — `docs/environment/03-software.md`
