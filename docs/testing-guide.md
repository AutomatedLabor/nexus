# ATLAS — Testing & Verification Guide

> How to verify ATLAS without a real test suite. The project
> intentionally defers Vitest + Playwright to a future iteration;
> the current standard is a disciplined manual protocol anchored
> by `bun run lint`, `bunx tsc --noEmit`, a curl sweep of every
> endpoint, and a 10-point Agent Browser checklist for the
> frontend. This document is the playbook for that protocol and
> the proposal for the future automated suite.

## 1. Why testing philosophy matters for ATLAS

ATLAS is a capability-assessment tool. Its job is to tell the
operator — and the agent that runs inside the sandbox — what the
environment can and cannot do. The four stat cards on the dashboard
show numbers ("28 tools", "10 limits", "Avg Run 161.9 ms"). The
limits view shows hard boundaries ("memory 4100 MB", "swap 0 MB —
critical"). The reports endpoint generates documents that may end
up in a PR description or a postmortem.

If any of those numbers is wrong, the tool is worse than no tool.
A silent off-by-one in `/api/stats` that drops a benchmark run
makes the dashboard report 9 runs when there are 10. A bad
`csvEscape` in `/api/export` makes the CSV unreadable. A
`parseFloat` that silently returns `NaN` on the live benchmark
endpoint makes a run look like 0 ms. None of these crash the app;
all of them silently corrupt the assessment.

The verification strategy is therefore conservative: it favors
*trustworthy over clever*. We do not chase 100% line coverage with
mock-heavy unit tests, because mocks can lie about what the
database returns. We *do* run the real endpoints against the real
SQLite file with the real seed data, and we *do* render the real
frontend in a real browser and look at it. The trade-off is human
time per release; the payout is that the numbers on the dashboard
are the numbers in the database.

Three concrete consequences follow:

- **Every endpoint is curl-able.** No endpoint requires an
  authenticated session, a CSRF token, or a cookie. The seed
  leaves the database in a known state, so the curl output is
  deterministic. The curl sweep in §4 is part of the release
  checklist.
- **The TypeScript gate is manual but enforced.**
  `next.config.ts#typescript.ignoreBuildErrors: true` means a
  type error does not block `bun run build`. The mitigation is
  `bunx tsc --noEmit` in the PR checklist. Skipping it is a
  process violation, not a build failure.
- **The frontend is verified by looking at it.** The 10-point
  Agent Browser checklist in §5 is the manual smoke test for every
  PR that touches a view, a chart, or the layout shell. It is
  deliberately short — ten items take about 4 minutes — so it can
  be run on every PR without becoming a checklist nobody reads.

The honest gap is that none of this is automated in CI. The
future plan in §7 closes it: Vitest for hooks and components,
Playwright for the 10-point checklist, a `bun run test` script,
and a CI gate. Until that lands, the manual protocol below is
the standard.

## 2. Existing checks the project does ship

The repo has three concrete static checks. Run all three before
opening a PR.

### 2.1 `bun run lint`

Runs `eslint .` against the project using the flat config in
`eslint.config.mjs`. The config is `eslint-config-next/core-web-vitals`
plus `eslint-config-next/typescript` plus a deliberately relaxed
rules block (`@typescript-eslint/no-explicit-any: "off"`,
`@typescript-eslint/no-unused-vars: "off"`,
`react-hooks/exhaustive-deps: "off"`, etc.) — the project
prioritizes shipping over lint hygiene, and many of the disabled
rules would be noisy given the React 19 + Next 16 + Turbopack
combination. The ignore list skips `node_modules`, `.next`,
`out`, `build`, `next-env.d.ts`, `examples`, and `skills`.

```bash
bun run lint
```

A clean run produces no stdout. Any errors block the PR. The
intent is that lint errors are real errors (undefined refs,
syntax) rather than style nits.

### 2.2 `bunx tsc --noEmit`

Type-checks the project without emitting. This is the manual gate
that compensates for
`next.config.ts#typescript.ignoreBuildErrors: true`. Without
this, a type error in a route handler or a hook can ship to
production and only manifest at runtime (often as a 500 in an API
route or a blank screen in a view).

```bash
bunx tsc --noEmit
```

A clean run produces no stdout and exits 0. Typical errors to
watch for:

- Hook return type mismatches when an endpoint shape changes
  (e.g. `useBenchmark` returning `Benchmark` when the backend
  returns `{ data: Benchmark }`).
- Drift between the `AtlasView` union in `src/types/atlas.ts` and
  the `view === "..."` checks in `atlas-app.tsx`.
- Prisma client out of sync with `schema.prisma` — fix with
  `bun run db:generate`.

### 2.3 The three `tests/*.sh` shell scripts

These are not unit tests — they are Phase 0 environment
cartography scripts that were run once to produce
`docs/environment/*.md` and `seed-data/benchmarks.json`. They are
kept in the repo as the canonical record of how the sandbox was
measured. They are not part of the release checklist, but they
*are* the provenance of every number in the seed data. If you
change the sandbox and want fresh numbers, run them and overwrite
`seed-data/benchmarks.json`:

```bash
bash tests/python-runtime-build.sh        # builds the Python runtime probe
bash tests/database-runtime-build.sh      # builds the database probe
bash tests/python-runtime-container.sh    # runs the Python probe in the container
```

The 10 numbers in `seed-data/benchmarks.json` (e.g.
`csv_generate_1m: 291.832 ms`, `sha256_10k: 5.532 ms`,
`fib_recursive_30: 122.778 ms`, `matmul_100x100: 64.154 ms`) are
the output of `tests/python-runtime-container.sh` against the
seeded Debian 13 kata-container.

## 3. How to run the app and seed the database

Before any verification can run, the database must be seeded.
From a clean checkout:

```bash
# 1. Install deps
bun install

# 2. Configure DATABASE_URL (the dev default is the local file)
export DATABASE_URL="file:./db/custom.db"

# 3. Push the schema (idempotent, may drop data)
bunx prisma db push --accept-data-loss

# 4. Generate the Prisma client (also runs on postinstall)
bunx prisma generate

# 5. Seed the database with the canonical environment
bun run prisma/seed.ts

# 6. Start the dev server on :3000
bun run dev
```

The seed script (`prisma/seed.ts`) is idempotent — it calls
`deleteMany()` on every model in dependency order, then
re-inserts the canonical Environment, the 28 Tools (20 installed,
8 missing), 15 Capabilities (5 measured + 10 mirrored benchmarks),
10 Benchmarks + 10 BenchmarkRuns, and 10 Limits. The final
`console.table(counts)` output should show:

```
 environments: 1
 tools: 28
 capabilities: 15
 benchmarks: 10
 benchmarkRuns: 10
 limits: 10
 reports: 0
```

If any of those numbers is different, the seed did not run cleanly.
Re-run `bun run prisma/seed.ts` and check for errors.

## 4. The curl sweep — every endpoint, real responses

This is the API release gate. Run it against a freshly seeded
database on `localhost:3000`. Each line below is a real curl
invocation that hits a real endpoint; the `| jq` filter is for
human reading. The expected values are deterministic from the
seed.

### 4.1 Healthcheck

```bash
curl -s http://localhost:3000/api | jq
# { "message": "Hello, world!" }
```

### 4.2 Stats

```bash
curl -s http://localhost:3000/api/stats | jq
# Expected:
# {
#   "environments": 1,
#   "tools": 28,
#   "capabilities": 15,
#   "benchmarks": 10,
#   "benchmarkRuns": 10,
#   "limits": 10,
#   "reports": 0,
#   "lastRunAt": "<seed timestamp>",
#   "avgRunMs": 161.9788 (or similar)
# }
```

The `avgRunMs` is computed as the average of the 10 seeded
durations. From `seed-data/benchmarks.json`: 291.832 + 298.624 +
15.761 + 5.532 + 293.1 + 12.457 + 64.154 + 122.778 + 247.684 +
167.466 = 1619.388; divided by 10 = 161.9388. The exact number
depends on float precision in SQLite but should be within
±0.01 of that.

### 4.3 Environments

```bash
# List
curl -s http://localhost:3000/api/environments | jq '.total, (.data[0] | { hostname, osName, osVersion, kernel, cpuCores, memoryMb, swapMb, container, publicIp, arch, counts })'
# Expected:
# 1
# {
#   "hostname": "c-6af44108-140d72b5-6bf513003f7a",
#   "osName": "Debian GNU/Linux",
#   "osVersion": "13 (trixie)",
#   "kernel": "5.10.134-013.15.kangaroo.al8.x86_64",
#   "cpuCores": 2,
#   "memoryMb": 4100,
#   "swapMb": 0,
#   "container": "kata-container (KVM)",
#   "publicIp": "8.212.10.159",
#   "arch": "x86_64",
#   "counts": { "tools": 28, "capabilities": 15, "benchmarkRuns": 10, "limits": 10 }
# }

# Single env (capture the id first)
ENV_ID=$(curl -s http://localhost:3000/api/environments | jq -r '.data[0].id')
curl -s "http://localhost:3000/api/environments?id=$ENV_ID" | jq '.data | keys'
# Expected: ["arch","benchmarkRuns","capabilities","container","cpuCores","cpuModel","createdAt","diskGb","hostname","id","kernel","limits","memoryMb","osName","osVersion","publicIp","swapMb","tools"]

# Not found
curl -s "http://localhost:3000/api/environments?id=bogus" | jq
# Expected: { "error": "environment_not_found" }  (status 404)
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/environments?id=bogus"
# 404
```

### 4.4 Tools (with filters + pagination)

```bash
# All tools, count only
curl -s "http://localhost:3000/api/tools?limit=200" | jq '.total, (.data | length)'
# 28, 28

# Filter: installed runtimes
curl -s "http://localhost:3000/api/tools?category=runtime&installed=true" | jq '.data[].name'
# "node", "bun", "python3", "java"

# Filter: missing tools
curl -s "http://localhost:3000/api/tools?installed=false" | jq '.data[].name'
# "rust", "go", "ruby", "php", "clang", "sqlite3", "gh", "docker"

# Search: "python"
curl -s "http://localhost:3000/api/tools?q=python" | jq '.data[].name'
# "python3"

# Pagination: page 1 of 8-per-page
curl -s "http://localhost:3000/api/tools?page=1&limit=8" | jq '.page, .limit, .total, (.data | length)'
# 1, 8, 28, 8

# Invalid query (installed=maybe)
curl -s "http://localhost:3000/api/tools?installed=maybe" | jq
# Expected: { "error": "invalid_query", "details": [ { ... zod issues for installed ... } ] }  (status 400)
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/tools?installed=maybe"
# 400

# Limit over max (250 > 200)
curl -s "http://localhost:3000/api/tools?limit=250" | jq
# Expected: 400 invalid_query, with details mentioning limit max
```

### 4.5 Capabilities

```bash
# All
curl -s "http://localhost:3000/api/capabilities?limit=200" | jq '.total, (.data | length)'
# 15, 15

# By category
curl -s "http://localhost:3000/api/capabilities?category=filesystem" | jq '.data[].name'
# "file_write_1000_files", "large_file_100mb"

curl -s "http://localhost:3000/api/capabilities?category=network" | jq '.data[].name'
# "parallel_http_50", "http_latency_example_com", "dns_resolvers"

curl -s "http://localhost:3000/api/capabilities?category=benchmark" | jq '.total'
# 10
```

### 4.6 Benchmarks (list + detail)

```bash
# List
curl -s http://localhost:3000/api/benchmarks | jq '.total, (.data | map(.name) | sort)'
# 10, ["csv_generate_1m","fib_recursive_30","json_generate_10k","matmul_100x100","read_delete_10k_files","read_sort_1m","regex_match_1m","sha256_10k","str_replace_1m","write_10k_files"]

# A single benchmark with its runs
BENCH_ID=$(curl -s http://localhost:3000/api/benchmarks | jq -r '.data[] | select(.name == "csv_generate_1m") | .id')
curl -s "http://localhost:3000/api/benchmarks/$BENCH_ID" | jq '.data | { name, category, unit, runs_count: (.runs | length), latest_duration: .runs[0].durationMs }'
# Expected: { "name": "csv_generate_1m", "category": "filesystem", "unit": "ms", "runs_count": 1, "latest_duration": 291.832 }

# Not found
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/benchmarks/bogus"
# 404
```

### 4.7 Live benchmark run (POST)

This is the only endpoint that spawns a subprocess. Run it
against the sandbox where `python3` is on PATH (not on Vercel
serverless).

```bash
# Run sha256_10k (the fastest one — completes in <10ms)
curl -s -X POST http://localhost:3000/api/benchmarks/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"sha256_10k"}' | jq '.data | { name: .benchmark.name, durationMs, success, environment: .environment.hostname }'
# Expected: { "name": "sha256_10k", "durationMs": <a small number ~5-15>, "success": true, "environment": "c-6af44108-..." }

# Run fib_recursive_30
curl -s -X POST http://localhost:3000/api/benchmarks/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"fib_recursive_30"}' | jq '.data | { name: .benchmark.name, durationMs, success }'
# Expected: { "name": "fib_recursive_30", "durationMs": <~120-200>, "success": true }

# Try an unsupported benchmark name (read_sort_1m is seeded but not in BENCH_PYTHON)
curl -s -X POST http://localhost:3000/api/benchmarks/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"read_sort_1m"}' | jq
# Expected: { "error": "unsupported_benchmark", "details": "Benchmark 'read_sort_1m' cannot be run live.", "supported": ["csv_generate_1m","sha256_10k","fib_recursive_30","matmul_100x100"] }
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/benchmarks/run \
  -H 'Content-Type: application/json' -d '{"name":"read_sort_1m"}'
# 400

# Invalid body (missing name)
curl -s -X POST http://localhost:3000/api/benchmarks/run \
  -H 'Content-Type: application/json' -d '{}' | jq
# Expected: { "error": "invalid_body", "details": [<zod issues for name>] }
```

After a successful run, the `benchmarkRuns` count in `/api/stats`
should have incremented. Verify:

```bash
curl -s http://localhost:3000/api/stats | jq '.benchmarkRuns'
# Was 10; should now be 11 after one successful run
```

### 4.8 Limits

```bash
# All
curl -s http://localhost:3000/api/limits?limit=200" | jq '.total, (.data | length)'
# 10, 10

# Critical only
curl -s "http://localhost:3000/api/limits?severity=critical" | jq '.data[].resource'
# "swap"

# Hard only
curl -s "http://localhost:3000/api/limits?kind=hard" | jq '.data[].resource'
# "memory", "swap", "cpu_cores"

# Combined
curl -s "http://localhost:3000/api/limits?severity=critical&kind=hard" | jq '.data[].resource'
# "swap"
```

### 4.9 Reports

```bash
# List (empty initially)
curl -s http://localhost:3000/api/reports | jq '.total'
# 0

# Generate an HTML report
curl -s -X POST http://localhost:3000/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"title":"Smoke test report","format":"html"}' | jq '.data | { id, title, format, content_preview: (.content | .[0:80]) }'
# Expected: { "id": "<cuid>", "title": "Smoke test report", "format": "html", "content_preview": "<!doctype html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\"><title>Smoke test report</title>" }

# Generate a CSV report
curl -s -X POST http://localhost:3000/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"title":"CSV smoke","format":"csv"}' | jq -r '.data.content' | head -3
# benchmarkName,category,durationMs,success,details,createdAt
# csv_generate_1m,filesystem,291.832,true,generate 1,000,000 integers to /tmp/atlas-1m.csv,2026-11-11T...
# read_sort_1m,filesystem,298.624,true,...

# Generate a JSON report
curl -s -X POST http://localhost:3000/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"title":"JSON smoke","format":"json"}' | jq -r '.data.content' | jq '.stats.environment'
# Expected: { "hostname": "...", "osName": "...", "osVersion": "...", "kernel": "...", "cpuModel": "...", "cpuCores": 2, "memoryMb": 4100, "swapMb": 0 }

# List after generating 3 reports
curl -s http://localhost:3000/api/reports | jq '.total'
# 3
```

### 4.10 Export

```bash
# JSON export (saves to file)
curl -s "http://localhost:3000/api/export?format=json" -o /tmp/atlas-export.json
file /tmp/atlas-export.json
# /tmp/atlas-export.json: JSON data
jq '.benchmarkRuns | length, .limits | length' /tmp/atlas-export.json
# 10 (or 11 after a live run), 10

# CSV export (the Content-Disposition suggests a filename)
curl -s -OJ "http://localhost:3000/api/export?format=csv"
# Writes atlas-export.csv in the cwd
head -2 atlas-export.csv
# section,name,category,durationMs,success,environment,details,createdAt
# benchmarkRun,csv_generate_1m,filesystem,291.832,true,c-6af44108-...,"generate 1,000,000 integers to /tmp/atlas-1m.csv",2026-11-11T...
tail -3 atlas-export.csv
# ...limit rows, including the trailing newline

# Default format (no query param) is json
curl -s "http://localhost:3000/api/export" -o /tmp/atlas-default.json
file /tmp/atlas-default.json
# JSON data

# Invalid format
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/export?format=xml"
# 400
```

### 4.11 Sweep as a one-liner

For a quick smoke check, this one-liner exits 0 only if every
endpoint returns 2xx or the expected 4xx:

```bash
set -e
curl -fsS http://localhost:3000/api > /dev/null
curl -fsS http://localhost:3000/api/stats > /dev/null
curl -fsS http://localhost:3000/api/environments > /dev/null
curl -fsS "http://localhost:3000/api/tools?limit=200" > /dev/null
curl -fsS "http://localhost:3000/api/capabilities?limit=200" > /dev/null
curl -fsS http://localhost:3000/api/benchmarks > /dev/null
curl -fsS -X POST http://localhost:3000/api/benchmarks/run \
  -H 'Content-Type: application/json' -d '{"name":"sha256_10k"}' > /dev/null
curl -fsS "http://localhost:3000/api/limits?limit=200" > /dev/null
curl -fsS -X POST http://localhost:3000/api/reports \
  -H 'Content-Type: application/json' -d '{"title":"Sweep","format":"json"}' > /dev/null
curl -fsS "http://localhost:3000/api/export?format=json" > /dev/null
echo "sweep OK"
```

The `-f` flag fails curl on HTTP 4xx/5xx, so any non-2xx response
aborts the script. The expected total wall-clock is ~1 s plus
the benchmark run (~10 ms for sha256_10k).

## 5. The 10-point Agent Browser checklist (frontend)

This is the manual smoke test for every PR that touches
`src/components/atlas/**` or `src/app/**`. It runs in the Agent
Browser (or any modern Chromium) against the dev server. The
checklist is deliberately short — it takes about 4 minutes — and
should be passed before requesting review.

| # | Check | How to verify | Pass criterion |
|---|-------|---------------|----------------|
| 1 | Page renders not blank | Open `http://localhost:3000/` and snapshot | `<h1>` text "Dashboard" is present; no white screen |
| 2 | Sidebar has 6 nav items | Count `<button>` inside the sidebar `<aside>` | Exactly 6 buttons with labels: Dashboard, Environment, Benchmarks, Limits, Reports, Settings |
| 3 | Each view loads | Click each nav item in turn | Each view shows its own `<h1>` (Dashboard / Environment / Benchmarks / Limits Map / Reports / Settings) and renders without an `ErrorState` |
| 4 | Dashboard renders charts | On the dashboard, wait for queries to settle | `BenchmarkBarChart` shows ≥1 bar; `CapabilityRadar` shows ≥3 axes; `LimitsSeverityPie` shows 3 slices; `StatCard` values are non-zero (Benchmarks=10, Tools=28, Limits=10, Avg Run≈161) |
| 5 | Theme toggle works | Click the header theme dropdown → Dark, then Light, then System | `<html>` class flips between (no class), `dark`, and (no class based on system); visible background changes; no console errors |
| 6 | Responsive 375px hamburger | Resize viewport to 375px (iPhone SE width) | Sidebar `<aside>` is hidden; hamburger `<button aria-label="Open navigation menu">` is visible; clicking it opens the Sheet with the same 6 nav items |
| 7 | Sticky footer | Scroll the dashboard to the bottom | The footer (`ATLAS v1.0 · Autonomous Technical Limit Assessment System · ...`) is visible at the bottom; the hostname and public IP are shown (`Server c-6af44108-... · Globe 8.212.10.159`) |
| 8 | Live benchmark works | Navigate to Benchmarks, select `sha256_10k`, click "Run now" | After <2 s, a green `ResultCard` appears with a small duration in ms; a sonner toast "sha256_10k finished in X.XX ms" appears bottom-right |
| 9 | Report generation works | Navigate to Reports, fill title "Test", format HTML, click "Generate report" | A new row appears in the reports table; clicking "View" opens a Dialog showing the HTML content; a toast "Report Test generated as HTML" appears |
| 10 | Console clean | Open DevTools console; refresh | Zero `error` level messages; zero React hydration warnings; zero network 4xx/5xx (except possibly favicon) |

### 5.1 Running the checklist with the Agent Browser

If you have the Agent Browser skill available, the checklist
above can be scripted as a sequence of `snapshot`, `click`,
`evaluate`, and `resize` commands. The general pattern:

```
1. agent-browser navigate http://localhost:3000/
2. agent-browser snapshot              # check 1, 2, 4
3. agent-browser click "Environment"  # check 3 (one of six)
4. agent-browser snapshot
5. agent-browser click "Benchmarks"   # check 3, 8 setup
6. agent-browser click [the runner Select]
7. agent-browser click "sha256_10k"
8. agent-browser click "Run now"
9. agent-browser wait 1500
10. agent-browser snapshot             # check 8 — ResultCard + toast
11. agent-browser resize 375 667      # check 6
12. agent-browser snapshot             # hamburger visible, sidebar hidden
13. agent-browser click [hamburger]
14. agent-browser snapshot             # Sheet with 6 nav items
15. agent-browser evaluate "document.querySelector('html').className"   # check 5 baseline
16. agent-browser click [theme toggle dropdown trigger]
17. agent-browser click "Dark"
18. agent-browser evaluate "document.querySelector('html').className"   # check 5 → should contain 'dark'
19. agent-browser console              # check 10
```

The screenshots in `agent-ctx/` (e.g. `dashboard.png`,
`environment-view.png`, `benchmarks.png`, `limits-critical.png`,
`report-dialog.png`, `verify-dashboard.png`,
`verify-environment.png`, `verify-benchmarks.png`,
`verify-benchmarks-ran.png`, `verify-limits.png`,
`verify-limits-critical.png`, `verify-reports.png`) were produced
by this exact protocol during the Phase 6 verification pass.

### 5.2 Common failures and fixes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Blank page | `useViewStore` initialized before `QueryProvider` mounted; or a hook throws synchronously | Check the React DevTools component tree; verify `QueryProvider` wraps `AtlasApp` in `src/app/layout.tsx` |
| Console shows "Cannot read property 'data' of undefined" | A hook returned `undefined` because the query is `enabled: false` but the view tries to read `data.data` | Check the `useBenchmark(id)` hook — `enabled: !!id` means `data` is undefined until `id` is set |
| Console shows hydration mismatch | `<html>` missing `suppressHydrationWarning`; or a component reads `localStorage` during SSR | Verify `src/app/layout.tsx` has `suppressHydrationWarning` on `<html>`; the `ApiKeyManager` and `StatusPill` use `useEffect` to gate client-only reads |
| Charts show "No data" | React Query is loading and the chart's empty-state branch fired | Verify the query is actually firing (Network tab); verify the cache key matches between the view and the hook |
| Live benchmark button shows "Running…" forever | The subprocess timed out (30 s) or `python3` is not on PATH | Run `which python3` in the sandbox; if missing, run on a host with python3 (the Caddy self-host, not Vercel) |
| Toasts don't appear | The Sonner toaster isn't mounted at the root | Verify `src/app/layout.tsx` renders `<SonnerToaster position="bottom-right" richColors closeButton />` |
| Footer shows no hostname/IP | The `useEnvironments` query failed or returned no environments | `curl -s http://localhost:3000/api/environments | jq '.total'` — should be 1; if 0, run `bun run prisma/seed.ts` |

## 6. How to add a new benchmark

The seed data and the live runner are coupled. To add a new
benchmark end-to-end:

### 6.1 Add the Python script to the live runner

Edit `src/app/api/benchmarks/run/route.ts`. Add an entry to
`BENCH_PYTHON`:

```ts
const BENCH_PYTHON: Record<string, string> = {
  // ... existing entries ...
  json_serialize_10k: `
import json, time
N = 10_000
data = [{"i": i, "s": f"str-{i}"} for i in range(N)]
s = time.perf_counter()
json.dumps(data)
e = time.perf_counter()
print(f"{(e - s) * 1000:.3f}")
`,
};
```

Add a matching entry to `BENCH_DETAILS`:

```ts
const BENCH_DETAILS: Record<string, string> = {
  // ... existing entries ...
  json_serialize_10k: 'json.dumps 10,000 dicts',
};
```

### 6.2 Update the frontend `LIVE_RUNNABLE` set

Edit `src/components/atlas/views/benchmarks-view.tsx`. Add the new
name to the set:

```ts
const LIVE_RUNNABLE = new Set([
  "csv_generate_1m",
  "sha256_10k",
  "fib_recursive_30",
  "matmul_100x100",
  "json_serialize_10k",  // new
]);
```

Without this, the dropdown will show the new benchmark with "(view
only)" appended even though the backend can run it.

### 6.3 Add to the seed (optional but recommended)

Edit `seed-data/benchmarks.json` to add a baseline run:

```json
{
  "name": "json_serialize_10k",
  "duration_ms": 12.3,
  "details": "json.dumps 10,000 dicts"
}
```

Then edit `prisma/seed.ts`'s `BENCH_CATEGORY` map:

```ts
const BENCH_CATEGORY: Record<string, string> = {
  // ... existing entries ...
  json_serialize_10k: 'serialization',
};
```

Re-seed:

```bash
bun run prisma/seed.ts
```

### 6.4 Verify

```bash
# The new benchmark appears in the list
curl -s http://localhost:3000/api/benchmarks | jq '.data[] | select(.name == "json_serialize_10k")'

# The new benchmark runs live
curl -s -X POST http://localhost:3000/api/benchmarks/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"json_serialize_10k"}' | jq '.data.durationMs'

# Unsupported names still error correctly
curl -s -X POST http://localhost:3000/api/benchmarks/run \
  -H 'Content-Type: application/json' -d '{"name":"nonexistent"}' | jq '.supported'
# Should include json_serialize_10k in the supported array
```

Then re-run the Agent Browser checklist point 8 with the new
benchmark name selected.

## 7. Mock strategies for React Query (for the future test suite)

When the Vitest suite lands, the React Query hooks need to be
tested in isolation. Two viable strategies:

### 7.1 Provide a real `QueryClient` and prefetch the data

The cleanest approach is to render the hook with a real
`QueryClient` that has the data pre-cached via `prefetchQuery`.
This avoids mocking `fetch` entirely; the test reads from the
cache and never hits the network.

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useStats } from "@/hooks/atlas";

test("useStats returns cached data", async () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  await qc.prefetchQuery({
    queryKey: ["atlas", "stats"],
    queryFn: () => Promise.resolve({
      environments: 1, tools: 28, capabilities: 15,
      benchmarks: 10, benchmarkRuns: 10, limits: 10,
      reports: 0, lastRunAt: null, avgRunMs: 161.94,
    }),
  });

  const { result } = renderHook(() => useStats(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.tools).toBe(28);
});
```

Pros: tests the real hook + real cache + real React lifecycle. Cons:
the `queryFn` in the prefetch is the mock; if the hook's `queryFn`
shape drifts from the prefetch, the test still passes (the cache
hit short-circuits the hook's `queryFn`).

### 7.2 MSW (Mock Service Worker) for end-to-end hook tests

For tests that should exercise the real `apiGet` helper and the
real `fetch` call, MSW intercepts the network request and returns
a canned response. This is closer to an integration test.

```ts
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTools } from "@/hooks/atlas";

const server = setupServer(
  http.get("http://localhost:3000/api/tools", ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json({
      data: [{ id: "t1", name: "node", category: "runtime", version: "v24", path: "/usr/bin/node", installed: true, environmentId: "e1", createdAt: "2026-01-01T00:00:00.000Z", environment: { hostname: "h" } }],
      total: 1,
      page: 1,
      limit: 50,
    });
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test("useTools returns tools from MSW", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useTools({}), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.data[0].name).toBe("node");
});
```

Pros: tests the real `apiGet` URL construction and the real
response unwrapping. Cons: requires MSW setup, a JS DOM
environment, and careful handler cleanup.

### 7.3 Recommendation

Use **MSW** for hooks that exercise the API contract
(`useStats`, `useTools`, `useCapabilities`, `useBenchmarks`,
`useBenchmark`, `useLimits`, `useReports`, `useRunBenchmark`,
`useCreateReport`, `useExport`). Use **prefetchQuery** for
component tests where the focus is on the rendering logic, not
the network. The two strategies are complementary, not
alternatives.

## 8. Testing the live benchmark endpoint specifically

The `POST /api/benchmarks/run` endpoint has more failure modes
than any other. A future test suite should cover:

- **Happy path.** POST with `{"name":"sha256_10k"}`, expect 201
  with a `data.durationMs` that is a finite number.
- **Unsupported name.** POST with `{"name":"read_sort_1m"}`, expect
  400 with `error: "unsupported_benchmark"` and a `supported`
  array containing exactly the four supported names.
- **Invalid body.** POST with `{}`, expect 400 with
  `error: "invalid_body"`.
- **Invalid JSON.** POST with body `"not json"`, expect 400 with
  `error: "invalid_json_body"`.
- **Subprocess timeout.** Mock `execFile` to reject with a
  timeout error, expect 500 with `error:
  "benchmark_execution_failed"`.
- **Parse failure.** Mock `execFile` to resolve with stdout
  `"not a number"`, expect 500 with `error:
  "benchmark_parse_failed"` and the raw stdout attached.
- **No environment.** Drop the `Environment` table before the
  request, expect 500 with `error: "no_environment_present"`.

For Node-side route handler tests, use Vitest's `vi.mock` to
replace `node:child_process.execFile` with a controllable
stub, and `vi.mock("@/lib/db")` to replace the Prisma client.

## 9. The future automated test plan

The current manual protocol is the standard; the project does
not ship a Vitest or Playwright suite in v1. The future plan,
deliberately scoped so it can land in a single PR:

### 9.1 Tooling

- **Vitest** for unit and component tests. Fast, native TypeScript,
  native ESM, plays well with Next.js.
- **@testing-library/react** for component tests; render hooks
  via `@testing-library/react`'s `renderHook`.
- **MSW** (`msw/node`) for HTTP interception in hook tests.
- **Playwright** for the 10-point Agent Browser checklist. Each
  checklist item becomes one `test()` block; the test suite
  replaces the manual snapshot diff.
- **@vitest/coverage-v8** for coverage reports (no istanbul
  instrumentation cost).

### 9.2 Repository layout

```
tests/
├── shell/                        # the existing cartography scripts
│   ├── python-runtime-build.sh
│   ├── database-runtime-build.sh
│   └── python-runtime-container.sh
├── unit/                         # new — Vitest unit tests
│   ├── api.test.ts               # apiGet, apiPost, apiDownload, ApiError
│   ├── view-store.test.ts        # useViewStore, useNotificationPrefs
│   └── lib/
│       ├── csv-escape.test.ts    # the csvEscape helper used by reports + export
│       └── normalize.test.ts    # any pure data-shape helpers
├── hooks/                        # new — Vitest + MSW hook tests
│   ├── use-stats.test.ts
│   ├── use-tools.test.ts
│   ├── use-capabilities.test.ts
│   ├── use-benchmarks.test.ts
│   ├── use-benchmark.test.ts
│   ├── use-limits.test.ts
│   ├── use-reports.test.ts
│   ├── use-run-benchmark.test.ts
│   ├── use-create-report.test.ts
│   └── use-export.test.ts
├── routes/                      # new — Vitest route handler tests
│   ├── stats.test.ts
│   ├── environments.test.ts
│   ├── tools.test.ts
│   ├── capabilities.test.ts
│   ├── benchmarks.test.ts
│   ├── benchmarks-run.test.ts    # mocks execFile + db
│   ├── limits.test.ts
│   ├── reports.test.ts
│   └── export.test.ts
└── e2e/                          # new — Playwright tests
    ├── dashboard.spec.ts         # checks 1, 4
    ├── nav.spec.ts               # checks 2, 3
    ├── theme.spec.ts             # check 5
    ├── responsive.spec.ts        # check 6
    ├── footer.spec.ts            # check 7
    ├── benchmark-run.spec.ts     # check 8
    ├── report-generate.spec.ts   # check 9
    └── console.spec.ts           # check 10
```

### 9.3 `package.json` scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:all": "bun run lint && bunx tsc --noEmit && bun run test && bun run test:e2e"
  }
}
```

`bun run test` becomes the canonical test command. `bun run
test:all` is the full pre-release gate: lint, type-check, unit
tests, e2e. The `test:e2e` script needs a running dev server
(Playwright's `webServer` config can start one automatically).

### 9.4 CI gate

The CI workflow adds three jobs:

1. **lint** — `bun run lint`. ~5 s. Fails on any error.
2. **typecheck** — `bunx tsc --noEmit`. ~10 s. Fails on any type
   error. This is the manual gate today; the CI job promotes it
   to a block.
3. **test** — `bun run test`. ~30 s for unit + hooks + routes
   (Vitest). The Playwright e2e is a separate job because it needs
   a browser binary; it runs on PRs that touch `src/components/**`
   or `src/app/**` (path-filtered).

Coverage is reported but not gated in v1 of the test plan. A
follow-up PR can add a coverage floor (e.g. 70% on
`src/app/api/**` and `src/hooks/atlas/**`).

### 9.5 What the test plan does NOT cover

Honest scope cuts:

- **Visual regression** (Chromatic, Percy, Playwright
  screenshot diff) — out of scope. The 10-point checklist is the
  visual gate.
- **Performance regression** — out of scope. The 10 seeded
  benchmark durations are baselines; a future PR could add a
  Performance test that fails if a benchmark runs >2× slower
  than the baseline.
- **Accessibility audit** (axe-core) — out of scope but easy to
  add to the Playwright suite via `@axe-core/playwright`. The
  shell already has `aria-current`, `aria-label`, `role="img"`,
  and `sr-only` lists on every chart; an axe pass should be
  clean.
- **Load testing** — out of scope. ATLAS is single-user.

## 10. The release checklist

Bringing it together — the pre-release checklist that replaces
the absent CI gate until §9.3 lands:

1. **Lint clean.** `bun run lint` exits 0.
2. **Type-check clean.** `bunx tsc --noEmit` exits 0.
3. **Database seeded.** `bun run prisma/seed.ts` runs to
   completion with the expected counts (1 / 28 / 15 / 10 / 10 / 10 / 0).
4. **Curl sweep passes.** §4.11 one-liner exits 0.
5. **Agent Browser checklist passes.** §5 all 10 items green.
6. **Live benchmark still works.** `sha256_10k` runs in <100 ms
   against the sandbox (not Vercel).
7. **Export roundtrip.** `/api/export?format=csv` produces a
   file with the right headers and content; `format=json`
   parses cleanly with `jq`.
8. **Report generation roundtrip.** A report generated as HTML
   opens in a browser and renders the benchmark table.
9. **No new console errors.** DevTools console is clean across
   all six views.
10. **Docs updated.** If the PR touches the API, the
    `api-reference.md` is updated. If it touches a component,
    `component-library.md` is updated. If it touches the
    verification protocol, this file is updated.

A PR that passes all 10 is mergeable. A PR that fails any one is
blocked until the failure is fixed or the checklist item is
explicitly waived in the PR description with a reason.

## 11. See also

- [`architecture.md`](./architecture.md) — how the components
  being tested fit together.
- [`api-reference.md`](./api-reference.md) — every endpoint's
  contract, including error shapes; the curl sweep in §4 of
  this doc is the executable subset.
- [`component-library.md`](./component-library.md) — every
  component and hook; the hook tests in §7 will exercise these
  directly.
- [`decisions/adr-11-live-benchmark-subprocess.md`](./decisions/)
  — the design being tested in §8.
- [`deployment-guide.md`](./deployment-guide.md) — the
  production environment that the curl sweep runs against.
- [`contributing.md`](./contributing.md) — the PR process that
  the release checklist plugs into.
