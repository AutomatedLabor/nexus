# ATLAS — API Reference

> Every HTTP endpoint ATLAS exposes. Each entry was written by
> reading the matching route handler in `src/app/api/**/route.ts`
> and the shared types in `src/types/atlas.ts`. The endpoints are
> served under `/api/*` by Next.js 16 App Router Route Handlers and
> return JSON unless noted. The base URL in development is
> `http://localhost:3000`; in the Caddy self-host deploy, Caddy on
> `:81` reverse-proxies to the Next.js server on `:3000`.

## Conventions

- **Method:** GET for reads, POST for the two mutations
  (`/api/reports`, `/api/benchmarks/run`). No PUT, PATCH, or DELETE
  is exposed.
- **Query parameters** are parsed from `new URL(request.url).searchParams`
  and validated by zod schemas. Unknown parameters are ignored.
- **Request bodies** are JSON. `request.json()` failures return
  `400 invalid_json_body`.
- **Response envelopes.** List endpoints return one of:
  - `{ data, total, page, limit }` — paginated list (tools,
    capabilities, limits)
  - `{ data, total }` — non-paginated list (environments,
    benchmarks, reports)
  - `{ data: <object> }` — single object (environment by id,
    benchmark by id, created report, created run)
  - Raw `text/csv` or `application/json` — the export endpoint
- **Error shape.** Every error returns:
  ```json
  {
    "error": "snake_case_machine_code",
    "details": "human-readable message or zod issues array"
  }
  ```
  Status codes are `400` (validation), `404` (not found),
  `500` (internal/execution/parse failure). The benchmark runner
  additionally returns a `supported` array listing the four
  supported benchmark names on `unsupported_benchmark`.
- **`curl` examples** assume the dev server at
  `http://localhost:3000`. Replace the host for production.

---

## 1. `GET /api` (healthcheck)

Not in the ATLAS spec but present in the codebase as the root
`src/app/api/route.ts`. Returns a static greeting. Useful as a
liveness probe.

**Response 200:**
```json
{ "message": "Hello, world!" }
```

**curl:**
```bash
curl http://localhost:3000/api
```

---

## 2. `GET /api/stats`

Returns aggregate counts plus the most-recent benchmark run timestamp
and the average run duration across all `BenchmarkRun` rows. Used by
the dashboard's four stat cards.

**Query parameters:** none.

**Response 200:**
```json
{
  "environments": 1,
  "tools": 28,
  "capabilities": 15,
  "benchmarks": 10,
  "benchmarkRuns": 10,
  "limits": 10,
  "reports": 0,
  "lastRunAt": "2026-11-11T14:08:32.000Z",
  "avgRunMs": 161.979
}
```

| Field | Type | Description |
|-------|------|-------------|
| `environments` | number | `db.environment.count()` |
| `tools` | number | `db.tool.count()` |
| `capabilities` | number | `db.capability.count()` |
| `benchmarks` | number | `db.benchmark.count()` |
| `benchmarkRuns` | number | `db.benchmarkRun.count()` |
| `limits` | number | `db.limit.count()` |
| `reports` | number | `db.report.count()` |
| `lastRunAt` | string \| null | `createdAt` of most recent `BenchmarkRun`, ordered desc; `null` if no runs exist |
| `avgRunMs` | number \| null | `_avg.durationMs` over all runs; `null` if no runs |

**Error 500** `failed_to_compute_stats` — message in `details`.

**curl:**
```bash
curl -s http://localhost:3000/api/stats | jq
```

The handler runs all seven `count()` calls in parallel via
`Promise.all`, then issues a `findFirst` for the latest run and an
`aggregate` for the average — three round-trips total.

---

## 3. `GET /api/environments`

Returns every `Environment` with its related counts. Optionally
accepts `?id=<cuid>` to return a single environment with full nested
data (tools, capabilities, limits, and benchmarkRuns with their
benchmark included). The ATLAS UI only ever reads the first
environment (`data?.data?.[0]`) because the app is single-tenant, but
the list endpoint is general.

**Query parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `id` | string (cuid) | no | — | If present, return a single environment with full nested data instead of the list. |

**Response 200 (no `id`):**
```json
{
  "data": [
    {
      "id": "cm1abc...",
      "hostname": "c-6af44108-140d72b5-6bf513003f7a",
      "osName": "Debian GNU/Linux",
      "osVersion": "13 (trixie)",
      "kernel": "5.10.134-013.15.kangaroo.al8.x86_64",
      "cpuModel": "Intel(R) Xeon(R) Processor",
      "cpuCores": 2,
      "memoryMb": 4100,
      "swapMb": 0,
      "diskGb": 10,
      "container": "kata-container (KVM)",
      "publicIp": "8.212.10.159",
      "arch": "x86_64",
      "createdAt": "2026-11-11T14:00:00.000Z",
      "counts": {
        "tools": 28,
        "capabilities": 15,
        "benchmarkRuns": 10,
        "limits": 10
      }
    }
  ],
  "total": 1
}
```

The `counts` object is computed via Prisma's `_count: { select: { ... } }`
feature; the raw `_count` is stripped before serialization by setting
`_count: undefined` on each row.

**Response 200 (with `?id=<cuid>`):**
```json
{
  "data": {
    "id": "cm1abc...",
    "hostname": "...",
    "osName": "...",
    "...": "...",
    "tools": [ { "id": "...", "name": "node", "...": "..." } ],
    "capabilities": [ { "id": "...", "category": "filesystem", "...": "..." } ],
    "limits": [ { "id": "...", "resource": "memory", "...": "..." } ],
    "benchmarkRuns": [
      {
        "id": "...",
        "benchmark": { "id": "...", "name": "csv_generate_1m", "...": "..." },
        "durationMs": 291.832,
        "createdAt": "..."
      }
    ]
  }
}
```

**Errors:**
- `400 invalid_query` — `id` is not a string (per zod).
- `404 environment_not_found` — `id` did not match any row.
- `500 failed_to_fetch_environments` — internal error, message in `details`.

**curl:**
```bash
curl -s http://localhost:3000/api/environments | jq
curl -s "http://localhost:3000/api/environments?id=cm1abc123..." | jq
```

---

## 4. `GET /api/tools`

Paginated, searchable, filterable list of `Tool` rows. Each row
includes the parent environment's `hostname` so the table can
render a "host" column without an extra round-trip.

**Query parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `q` | string | no | — | Case-insensitive substring on `name` (SQLite `contains`). Trimmed before use. |
| `category` | string | no | — | Exact category match (e.g. `runtime`, `dev-tool`, `web`, `build-deploy`, `media`, `database`, `package-manager`). |
| `installed` | `"true"` \| `"false"` | no | — | Filter by the installed boolean. Any other value fails zod. |
| `page` | number (int ≥ 1) | no | `1` | 1-based page. Coerced from string by zod. |
| `limit` | number (int 1..200) | no | `50` | Page size, capped at 200 by zod. |

**Sort order:** `installed desc, name asc` — installed tools first,
alphabetical within each group. The endpoint issues `count` and
`findMany` in parallel via `Promise.all`.

**Response 200:**
```json
{
  "data": [
    {
      "id": "cm1tool1...",
      "name": "node",
      "category": "runtime",
      "version": "v24.22.2",
      "path": "/usr/bin/node",
      "installed": true,
      "environmentId": "cm1env1...",
      "createdAt": "2026-11-11T14:00:00.000Z",
      "environment": { "hostname": "c-6af44108-..." }
    }
  ],
  "total": 28,
  "page": 1,
  "limit": 50
}
```

**Errors:**
- `400 invalid_query` — zod failure; `details` is `parsed.error.issues`.
- `500 failed_to_fetch_tools` — internal error.

**curl:**
```bash
# All installed runtimes
curl -s "http://localhost:3000/api/tools?category=runtime&installed=true" | jq

# Search by name
curl -s "http://localhost:3000/api/tools?q=python" | jq

# Pagination
curl -s "http://localhost:3000/api/tools?page=2&limit=8" | jq
```

---

## 5. `GET /api/capabilities`

Paginated, filterable list of `Capability` rows. Capabilities include
both measured values (filesystem write speed, HTTP latency) and the
ten benchmark durations mirrored as capabilities by the seed script
so the dashboard's radar chart can plot everything from one table.

**Query parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `category` | string | no | — | Exact category match (`filesystem`, `network`, `benchmark`). |
| `environmentId` | string (cuid) | no | — | Exact environment id. |
| `page` | number (int ≥ 1) | no | `1` | 1-based page. |
| `limit` | number (int 1..200) | no | `50` | Page size, capped at 200. |

**Sort order:** `category asc, name asc`.

**Response 200:**
```json
{
  "data": [
    {
      "id": "cm1cap1...",
      "environmentId": "cm1env1...",
      "category": "filesystem",
      "name": "file_write_1000_files",
      "value": 0.28,
      "unit": "s",
      "details": "write 1000 small files via shell, ~3586 files/s (docs 02-filesystem.md)",
      "createdAt": "2026-11-11T14:00:00.000Z",
      "environment": { "hostname": "c-6af44108-..." }
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 50
}
```

**Errors:** `400 invalid_query`, `500 failed_to_fetch_capabilities`.

**curl:**
```bash
curl -s "http://localhost:3000/api/capabilities?category=filesystem" | jq
curl -s "http://localhost:3000/api/capabilities?limit=100" | jq
```

---

## 6. `GET /api/benchmarks`

Returns all `Benchmark` definitions, each annotated with three
derived fields: `runCount` (number of `BenchmarkRun` rows),
`latestRunMs` (the duration of the most recent run), and
`latestRunAt` (the `createdAt` of the most recent run). The handler
uses Prisma's `include: { runs: { orderBy: { createdAt: 'desc' },
take: 1 } }` and `_count: { select: { runs: true } }` so a single
query produces both the latest run and the count.

**Query parameters:** none.

**Response 200:**
```json
{
  "data": [
    {
      "id": "cm1bnch1...",
      "name": "csv_generate_1m",
      "category": "filesystem",
      "description": "generate 1,000,000 integers to /tmp/atlas-1m.csv",
      "unit": "ms",
      "runCount": 1,
      "latestRunMs": 291.832,
      "latestRunAt": "2026-11-11T14:08:32.000Z"
    }
  ],
  "total": 10
}
```

**Errors:** `500 failed_to_fetch_benchmarks`.

**curl:**
```bash
curl -s http://localhost:3000/api/benchmarks | jq
```

---

## 7. `GET /api/benchmarks/[id]`

Returns a single `Benchmark` with all its `BenchmarkRun` rows ordered
newest-first. Each run includes its environment's `hostname`. The
Next.js 16 App Router signature is
`GET(request: Request, context: { params: Promise<{ id: string }> })` —
the `params` is awaited from a Promise.

**Path parameter:** `id` (cuid) — the Benchmark's id.

**Response 200:**
```json
{
  "data": {
    "id": "cm1bnch1...",
    "name": "csv_generate_1m",
    "category": "filesystem",
    "description": "generate 1,000,000 integers to /tmp/atlas-1m.csv",
    "unit": "ms",
    "runs": [
      {
        "id": "cm1run1...",
        "benchmarkId": "cm1bnch1...",
        "environmentId": "cm1env1...",
        "durationMs": 291.832,
        "throughput": null,
        "success": true,
        "details": "generate 1,000,000 integers to /tmp/atlas-1m.csv",
        "createdAt": "2026-11-11T14:08:32.000Z",
        "environment": { "hostname": "c-6af44108-..." }
      }
    ]
  }
}
```

**Errors:**
- `404 benchmark_not_found` — `id` did not match.
- `500 failed_to_fetch_benchmark` — internal error.

**curl:**
```bash
curl -s http://localhost:3000/api/benchmarks/cm1bnch1... | jq
```

---

## 8. `POST /api/benchmarks/run` (live benchmark runner)

The only mutating endpoint that performs real work. Spawns a
`python3` subprocess to run one of four supported benchmarks, parses
the printed duration in milliseconds from stdout, persists a
`BenchmarkRun` row, and returns the created row with `201`.

**Request body:**
```json
{ "name": "fib_recursive_30" }
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | yes | `z.string().min(1)` |

**Supported benchmarks:** The route handler maintains a
`BENCH_PYTHON` record with the four scripts that can be run live:

| Name | Work | Seeded duration |
|------|------|-----------------|
| `csv_generate_1m` | Write 1,000,000 CSV rows to `/tmp/atlas-1m.csv` | 291.832 ms |
| `sha256_10k` | Compute SHA-256 of 10,000 strings | 5.532 ms |
| `fib_recursive_30` | Recursive Fibonacci n=30 (~2.7M calls) | 122.778 ms |
| `matmul_100x100` | Pure-Python triple-loop 100×100 matmul (~1M MACs) | 64.154 ms |

Other seeded benchmark names (`read_sort_1m`, `json_generate_10k`,
`regex_match_1m`, `str_replace_1m`, `write_10k_files`,
`read_delete_10k_files`) appear in the list but cannot be run live —
the handler returns `400 unsupported_benchmark` for them.

**Execution.** `execFile('python3', ['-c', script], { timeout: 30_000,
maxBuffer: 10 * 1024 * 1024 })`. The 30-second timeout is the ATLAS
spec. Python writes a single line of stdout —
`f"{(e - s) * 1000:.3f}"` — and the handler parses it with
`parseFloat(lines[lines.length - 1])` (the last non-empty line, in
case the script logs anything else).

**Response 201:**
```json
{
  "data": {
    "id": "cm1run2...",
    "benchmarkId": "cm1bnch1...",
    "environmentId": "cm1env1...",
    "durationMs": 295.41,
    "throughput": null,
    "success": true,
    "details": "generate 1,000,000 integers to /tmp/atlas-1m.csv",
    "createdAt": "2026-11-11T15:01:42.123Z",
    "benchmark": {
      "id": "cm1bnch1...",
      "name": "csv_generate_1m",
      "category": "filesystem",
      "description": "...",
      "unit": "ms"
    },
    "environment": { "hostname": "c-6af44108-..." }
  }
}
```

If the `Benchmark` definition for the requested `name` does not yet
exist (e.g. a user typed a name that isn't seeded), the handler
creates it with `category: 'compute'`, `description: BENCH_DETAILS[name]
?? ''`, and `unit: 'ms'`. The run is then attached to the first
environment (single-tenant assumption: `db.environment.findFirst()`).

**Errors:**
- `400 invalid_json_body` — body was not valid JSON.
- `400 invalid_body` — zod failure; `details` is `parsed.error.issues`; `supported` array attached.
- `400 unsupported_benchmark` — `name` is not in `BENCH_PYTHON`; `supported` array attached.
- `500 benchmark_execution_failed` — `execFile` threw; `details` is the error message, `stderr` attached.
- `500 benchmark_parse_failed` — stdout's last non-empty line was not a number; `stdout` and `stderr` attached.
- `500 no_environment_present` — the database has no `Environment` rows.
- `500 failed_to_run_benchmark` — catch-all.

**curl:**
```bash
# Run fib_recursive_30
curl -s -X POST http://localhost:3000/api/benchmarks/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"fib_recursive_30"}' | jq

# Try an unsupported name to see the supported array
curl -s -X POST http://localhost:3000/api/benchmarks/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"read_sort_1m"}'
# {"error":"unsupported_benchmark","details":"...","supported":["csv_generate_1m","sha256_10k","fib_recursive_30","matmul_100x100"]}
```

**Serverless caveat.** This endpoint will not work on Vercel
serverless: `python3` is not on PATH and `/tmp` is not guaranteed
writable across invocations. The error will be
`benchmark_execution_failed` with `details: "spawn python3 ENOENT"`.
The Caddy self-host deployment runs the same code in the sandbox
where `python3` is available. See [`architecture.md`](./architecture.md)
§6.

---

## 9. `GET /api/limits`

Paginated, filterable list of `Limit` rows. Limits are categorized
by `kind` (`hard`, `architectural`, `tool`, `filesystem`, `network`,
`tested`) and `severity` (`critical`, `warning`, `info`).

**Query parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `severity` | string | no | — | Exact severity match (`critical`, `warning`, `info`). |
| `kind` | string | no | — | Exact kind match (`hard`, `architectural`, `tool`, `filesystem`, `network`, `tested`). |
| `page` | number (int ≥ 1) | no | `1` | 1-based page. |
| `limit` | number (int 1..200) | no | `50` | Page size, capped at 200. |

**Sort order:** `severity asc, kind asc, resource asc`. Note that
`severity` is a string, so the alphabetical sort order is
`critical` < `info` < `warning` — not a severity rank.

**Response 200:**
```json
{
  "data": [
    {
      "id": "cm1lim1...",
      "environmentId": "cm1env1...",
      "resource": "swap",
      "limitValue": "0",
      "unit": "MB",
      "kind": "hard",
      "details": "free -h Swap: 0B — OOM killer has no buffer (docs 01)",
      "severity": "critical",
      "createdAt": "2026-11-11T14:00:00.000Z",
      "environment": { "hostname": "c-6af44108-..." }
    }
  ],
  "total": 10,
  "page": 1,
  "limit": 50
}
```

**Errors:** `400 invalid_query`, `500 failed_to_fetch_limits`.

**curl:**
```bash
curl -s "http://localhost:3000/api/limits?severity=critical" | jq
curl -s "http://localhost:3000/api/limits?kind=hard" | jq
```

---

## 10. `GET /api/reports`

Returns all `Report` rows ordered newest-first. Reports are
snapshots — they are not associated with an environment and are not
invalidated when the underlying data changes.

**Query parameters:** none.

**Response 200:**
```json
{
  "data": [
    {
      "id": "cm1rep1...",
      "title": "Weekly limits summary",
      "format": "html",
      "parameters": "{\"include\":[\"stats\",\"benchmarks\",\"limits\"]}",
      "content": "<!doctype html>...",
      "createdAt": "2026-11-11T15:30:00.000Z"
    }
  ],
  "total": 1
}
```

**Errors:** `500 failed_to_fetch_reports`.

**curl:**
```bash
curl -s http://localhost:3000/api/reports | jq
```

---

## 11. `POST /api/reports` (report generator)

Generates a `Report` row. The handler fetches the first
environment with counts, every `BenchmarkRun` with its benchmark,
and every `Limit`, then formats the content based on the requested
`format`.

**Request body:**
```json
{
  "title": "Weekly limits summary",
  "format": "html",
  "parameters": {
    "include": ["stats", "benchmarks", "limits"],
    "environmentId": "auto"
  }
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `title` | string | yes | `z.string().min(1).max(200)` |
| `format` | `"html"` \| `"json"` \| `"csv"` | yes | `z.enum(['html','json','csv'])` |
| `parameters` | object | no | `z.record(z.string(), z.unknown()).optional()`. Stored as `JSON.stringify(parameters ?? {})`. |

**Format semantics:**

- **`html`** — content is a complete HTML document with a `<title>`
  (the report title, HTML-escaped), a meta paragraph showing the
  environment hostname/OS/CPU/RAM, an `<h2>Benchmark Runs (N)</h2>`
  heading, and a `<table>` with columns `Name, Category, Duration
  (ms), OK, Details, Created At`. The `<style>` block sets a system
  font, 1px solid #ddd borders, and `th { background: #f4f4f5; }`.
  All user input is HTML-escaped (`<`, `>`, `&`).
- **`json`** — content is `JSON.stringify({ stats, runs, limits }, null, 2)`,
  where `stats` includes the environment summary (hostname, OS,
  kernel, CPU model, cores, memory, swap), tool/capability/limit
  counts, run count, and average run ms.
- **`csv`** — content is a single CSV document with header
  `benchmarkName,category,durationMs,success,details,createdAt`
  and one row per `BenchmarkRun`. Values containing commas, double
  quotes, or newlines are wrapped in double quotes with embedded
  quotes doubled (RFC 4180-style `csvEscape`). The `createdAt` is
  serialized as `r.createdAt.toISOString()`.

The `parameters` object is currently informational — the handler
always includes all data. It is stored on the `Report` row for
auditability.

**Response 201:**
```json
{
  "data": {
    "id": "cm1rep1...",
    "title": "Weekly limits summary",
    "format": "html",
    "parameters": "{\"include\":[\"stats\",\"benchmarks\",\"limits\"],\"environmentId\":\"auto\"}",
    "content": "<!doctype html>...",
    "createdAt": "2026-11-11T15:30:00.000Z"
  }
}
```

**Errors:**
- `400 invalid_json_body` — body was not valid JSON.
- `400 invalid_body` — zod failure; `details` is `parsed.error.issues`.
- `500 no_environment_present` — the database has no `Environment`.
- `500 failed_to_create_report` — catch-all.

**curl:**
```bash
# HTML report
curl -s -X POST http://localhost:3000/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"title":"Weekly limits summary","format":"html"}' | jq

# CSV report with parameters
curl -s -X POST http://localhost:3000/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"title":"Benchmarks only","format":"csv","parameters":{"include":["benchmarks"]}}' \
  | jq -r .data.content
```

---

## 12. `GET /api/export`

Downloads the full ATLAS dataset — all `BenchmarkRun` rows with
their benchmark and environment included, and all `Limit` rows with
their environment. Two formats: `csv` (a single CSV document with
two sections) or `json` (a structured object).

**Query parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `format` | `"csv"` \| `"json"` | no | `"json"` | Output format. |

**Response 200 (`format=json`):**

Content-Type: `application/json`.

```json
{
  "exportedAt": "2026-11-11T16:00:00.000Z",
  "benchmarkRuns": [
    {
      "id": "cm1run1...",
      "benchmarkId": "cm1bnch1...",
      "environmentId": "cm1env1...",
      "durationMs": 291.832,
      "throughput": null,
      "success": true,
      "details": "...",
      "createdAt": "...",
      "benchmark": { "id": "...", "name": "csv_generate_1m", "category": "filesystem", "description": "...", "unit": "ms" },
      "environment": { "hostname": "...", "osName": "...", "osVersion": "..." }
    }
  ],
  "limits": [
    {
      "id": "cm1lim1...",
      "environmentId": "cm1env1...",
      "resource": "swap",
      "limitValue": "0",
      "unit": "MB",
      "kind": "hard",
      "details": "...",
      "severity": "critical",
      "createdAt": "...",
      "environment": { "hostname": "..." }
    }
  ]
}
```

**Response 200 (`format=csv`):**

Content-Type: `text/csv; charset=utf-8`.
Content-Disposition: `attachment; filename="atlas-export.csv"`.

The CSV is a single document with two sections. The first has a
header row `section,name,category,durationMs,success,environment,details,createdAt`
followed by one row per `BenchmarkRun` (with `section=benchmarkRun`).
The second has a header row `section,resource,kind,limitValue,unit,severity,details,createdAt`
followed by one row per `Limit` (with `section=limit`). The
section column lets a downstream parser split the two halves.

```csv
section,name,category,durationMs,success,environment,details,createdAt
benchmarkRun,csv_generate_1m,filesystem,291.832,true,c-6af44108-...,generate 1,000,000 integers to /tmp/atlas-1m.csv,2026-11-11T14:08:32.000Z
...
section,resource,kind,limitValue,unit,severity,details,createdAt
limit,swap,hard,0,MB,critical,free -h Swap: 0B — OOM killer has no buffer (docs 01),2026-11-11T14:00:00.000Z
...
```

Note: the `details` field for `csv_generate_1m` contains a comma
("1,000,000"), so it is quoted by `csvEscape`. The two-column
layout and the trailing newline are intentional and are preserved
in the output.

**Errors:**
- `400 invalid_query` — `format` was neither `csv` nor `json`.
- `500 failed_to_export` — internal error.

**curl:**
```bash
# JSON export
curl -s http://localhost:3000/api/export?format=json | jq

# CSV export (save to file because Content-Disposition suggests a filename)
curl -s -OJ http://localhost:3000/api/export?format=csv
# writes atlas-export.csv

# Or pipe directly to a file:
curl -s 'http://localhost:3000/api/export?format=csv' -o atlas-export.csv
```

---

## 13. Error codes catalog

Every endpoint returns errors in the form
`{ error: <code>, details?: <message | issues>, ...extras }`. The
codes used across the API:

| Code | HTTP | Where | Cause |
|------|------|-------|-------|
| `invalid_query` | 400 | tools, capabilities, limits, environments(?id), export | Query param failed zod. `details` is `parsed.error.issues`. |
| `invalid_json_body` | 400 | benchmarks/run, reports | Body was not valid JSON. |
| `invalid_body` | 400 | benchmarks/run, reports | Body failed zod. `details` is `parsed.error.issues`. |
| `unsupported_benchmark` | 400 | benchmarks/run | `name` is not in `BENCH_PYTHON`. `supported` array attached. |
| `environment_not_found` | 404 | environments | `?id=<cuid>` did not match. |
| `benchmark_not_found` | 404 | benchmarks/[id] | `id` did not match. |
| `failed_to_compute_stats` | 500 | stats | Prisma error. |
| `failed_to_fetch_environments` | 500 | environments | Prisma error. |
| `failed_to_fetch_tools` | 500 | tools | Prisma error. |
| `failed_to_fetch_capabilities` | 500 | capabilities | Prisma error. |
| `failed_to_fetch_benchmarks` | 500 | benchmarks | Prisma error. |
| `failed_to_fetch_benchmark` | 500 | benchmarks/[id] | Prisma error. |
| `benchmark_execution_failed` | 500 | benchmarks/run | `execFile` threw (timeout, ENOENT, non-zero exit). `details` + `stderr` attached. |
| `benchmark_parse_failed` | 500 | benchmarks/run | stdout's last non-empty line was not a number. `stdout` + `stderr` attached. |
| `no_environment_present` | 500 | benchmarks/run, reports | The database has no `Environment` rows; the mutation needs a host. |
| `failed_to_run_benchmark` | 500 | benchmarks/run | Catch-all. |
| `failed_to_fetch_limits` | 500 | limits | Prisma error. |
| `failed_to_fetch_reports` | 500 | reports | Prisma error. |
| `failed_to_create_report` | 500 | reports | Prisma error or formatting threw. |
| `failed_to_export` | 500 | export | Prisma error. |

The client-side `ApiError` class in `src/lib/api.ts` reads the
`error` field as its `message` and attaches the full body as
`body`. Callers can read `e.message` for the snake_case code and
`e.body` for the full structured error.

---

## 14. Pagination guide

Three endpoints paginate: `/api/tools`, `/api/capabilities`,
`/api/limits`. They share the same shape:

- `page` — 1-based integer, default `1`, min `1`. Coerced from the
  query string by `z.coerce.number().int().min(1).default(1)`.
- `limit` — page size, default `50`, min `1`, max `200`. Coerced
  from the query string by `z.coerce.number().int().min(1).max(200).default(50)`.
- Response envelope: `{ data: T[], total: number, page: number,
  limit: number }`.

The handler issues `db.<model>.count({ where })` and
`db.<model>.findMany({ where, orderBy, skip: (page - 1) * limit,
take: limit, include })` in parallel via `Promise.all`, so a single
round-trip returns both the rows and the total. The client `DataTable`
component computes the page count as `Math.ceil(total / pageSize)`.

To fetch the next page:
```bash
curl -s "http://localhost:3000/api/tools?page=2&limit=8" | jq '.page, .total, (.data | length)'
```

To fetch every row in one request (capped at 200):
```bash
curl -s "http://localhost:3000/api/tools?limit=200" | jq '.total, (.data | length)'
```

The React Query hooks in `src/hooks/atlas/index.ts` bake the params
object into the query key — `["atlas", "tools", { q, category,
installed, page, limit }]` — so each filter combination is cached
independently. Changing the page creates a new cache entry; going
back to a previously visited page hits the cache and does not
re-fetch.

---

## 15. Filtering guide

### Tools (`/api/tools`)

| Param | Behavior |
|-------|----------|
| `q` | SQLite `contains` on `name`. The seed stores lowercased names so this is effectively case-insensitive. Trimmed before use; empty string is ignored. |
| `category` | Exact match. The seed categories are `runtime`, `dev-tool`, `web`, `build-deploy`, `media`, `database`, `package-manager`. |
| `installed` | `"true"` or `"false"` only (zod `z.enum(['true','false'])`). Any other value fails with `invalid_query`. |

Combined filters are AND-ed. Example: tools in `runtime` category
that are installed:
```bash
curl -s "http://localhost:3000/api/tools?category=runtime&installed=true" | jq '.data[].name'
# "node", "bun", "python3", "java"
```

### Capabilities (`/api/capabilities`)

| Param | Behavior |
|-------|----------|
| `category` | Exact match. Categories are `filesystem`, `network`, `benchmark` (the seed mirrors all 10 benchmark durations as capabilities). |
| `environmentId` | Exact match. Useful when more than one environment is registered; in the single-tenant seed, only one id is valid. |

### Limits (`/api/limits`)

| Param | Behavior |
|-------|----------|
| `severity` | Exact match. Values: `critical`, `warning`, `info`. |
| `kind` | Exact match. Values in the seed: `hard`, `architectural`, `tool`, `filesystem`, `network`, `tested`. |

Example: every critical hard limit:
```bash
curl -s "http://localhost:3000/api/limits?severity=critical&kind=hard" | jq '.data[].resource'
# "swap"
```

---

## 16. Live benchmark endpoint details

The `POST /api/benchmarks/run` endpoint is the only place where the
server does work beyond reading the database. The implementation
lives in `src/app/api/benchmarks/run/route.ts` and uses Node's
`child_process.execFile` (promisified). The four supported scripts
are inlined as template strings in `BENCH_PYTHON`:

- `csv_generate_1m` — opens `/tmp/atlas-1m.csv` for writing, uses the
  `csv` module to write a header row `['n']` and 1,000,000 rows
  `['1']` through `['1000000']`. Times the write loop only.
- `sha256_10k` — iterates 0..9999, computes
  `hashlib.sha256(f"string-{i}-hello-{i*i}".encode()).hexdigest()` and
  appends to a list (to prevent dead-code elimination). Times the
  loop.
- `fib_recursive_30` — recursive `fib(n) = fib(n-1) + fib(n-2)` with
  no memoization, called as `fib(30)`. About 2.7M calls.
- `matmul_100x100` — pure Python triple-loop matrix multiply on two
  100×100 matrices `A` and `B` written as list comprehensions.
  Hoists `Ai = A[i]; Ci = C[i]` and `Bk = B[k]` into outer loop
  variables to shave work in the inner loop. ~1M MACs.

All four scripts end with `print(f"{(e - s) * 1000:.3f}")`. The
handler reads the last non-empty line of stdout and parses it as a
float. If the parse succeeds, the duration is persisted as
`durationMs` on a new `BenchmarkRun`. The `success` field is always
`true` (failure modes return 500 before the row is created).

The 30-second timeout is enforced by `execFile`'s `timeout` option;
on timeout the promise rejects and the handler returns 500
`benchmark_execution_failed` with `details: "Command failed: ...\n
Timed out after 30000 ms"`.

The `maxBuffer: 10 * 1024 * 1024` (10 MB) option is set to allow the
CSV write benchmark's potential stdout buffering to fit. None of
the four scripts actually produce much stdout, but the buffer
protects against accidental log spam.

To add a new live benchmark:
1. Add the Python script to `BENCH_PYTHON` in
   `src/app/api/benchmarks/run/route.ts`.
2. Add a one-line description to `BENCH_DETAILS`.
3. (Optional) Add the same name to `prisma/seed.ts`'s
   `BENCH_CATEGORY` map and to `seed-data/benchmarks.json` so the
   benchmark has a historical seed run.
4. Restart the dev server — Next.js will recompile the route.

The `LIVE_RUNNABLE` set in
`src/components/atlas/views/benchmarks-view.tsx` is a *separate*
constant that the frontend uses to mark benchmarks as runnable in
the dropdown. It must be kept in sync with `BENCH_PYTHON` — adding
to one without the other means the run button will fire an
`unsupported_benchmark` error or the dropdown will show "view only"
on a benchmark the backend can actually run.

---

## 17. Export endpoint details

`GET /api/export` is the only endpoint that does not return a JSON
envelope (except for the `format=json` variant). The handler queries
all `BenchmarkRun` rows ordered `createdAt desc` with the parent
benchmark and environment included (`{ select: { hostname, osName,
osVersion } }`), and all `Limit` rows ordered by `severity asc,
resource asc` with the environment included (`{ select: { hostname } }`).

For `format=json`, the response is `NextResponse.json({ exportedAt,
benchmarkRuns, limits })` — no envelope, no `data` key. The
`exportedAt` field is a fresh ISO timestamp so the same export
called twice yields slightly different JSON (the timestamp
differs).

For `format=csv`, the response is `new NextResponse(csv, {
status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8',
'Content-Disposition': 'attachment; filename="atlas-export.csv"' } })`.
The CSV body is built with a custom `csvEscape` function that wraps
values containing commas, double quotes, or newlines in double
quotes (and doubles any embedded double quotes). The two sections
are concatenated with newlines.

The client `apiDownload` helper in `src/lib/api.ts` reads the
`Content-Disposition` header to extract the filename (regex:
`/filename="?([^";]+)"?/i`) and falls back to
`atlas-export.${format}`. It creates a Blob, an object URL, a
temporary `<a download>` element, clicks it, and revokes the URL
after 1 second. This means the download is browser-driven, not a
page navigation.

---

## 18. Report generation details

The `POST /api/reports` handler is the second of two mutations. It
gathers the same data the export endpoint gathers (plus the first
environment with counts) and formats it into one of three content
types. The format is chosen by the `format` field in the body; the
`parameters` object is stored as JSON but is otherwise not used to
filter the data — the handler always includes everything.

**HTML format.** The content is a full HTML document. Title and
meta-paragraph are HTML-escaped; the `details` field of each
benchmark run is escaped before being inserted into a `<td>`. The
`<table>` has six columns: `Name, Category, Duration (ms), OK,
Details, Created At`. The `OK` column shows `✓` or `✗` based on
`success`. The `Duration` column uses `r.durationMs.toFixed(3)`.
Inline `<style>` block gives the document a system font, a 1px
solid border, and `th { background: #f4f4f5; }`.

**JSON format.** The content is `JSON.stringify({ stats, runs,
limits }, null, 2)`. `stats` is an object with `environment`
(hostname, osName, osVersion, kernel, cpuModel, cpuCores, memoryMb,
swapMb), `toolCount`, `capabilityCount`, `limitCount`, `runCount`,
and `avgRunMs` (computed as a JS reduce over `runs`, not via
Prisma's aggregate). `runs` is the array of `BenchmarkRun` rows
with the parent `benchmark` included. `limits` is the array of
`Limit` rows.

**CSV format.** The content is a single CSV document with header
`benchmarkName,category,durationMs,success,details,createdAt` and
one row per `BenchmarkRun`. Uses the same `csvEscape` function as
the export endpoint. The `createdAt` field is serialized as an
ISO timestamp.

All three formats are stored as text in `Report.content`. The
client `ReportsView` opens a dialog with the content in a
`<pre>` block; for HTML reports the user would copy the content
into a `.html` file to render it (the dialog does not iframe the
HTML, intentionally, to avoid an XSS vector).

---

## 19. Sequencing notes

A few behaviors are worth recording for callers:

- **`/api/stats` issues three database round-trips.** The seven
  `count()` calls are batched via `Promise.all`, then a
  `findFirst` for the latest run, then an `aggregate` for the
  average. The whole thing resolves in milliseconds on the seed
  data; on a database with many runs it will be slower.
- **`/api/benchmarks` is one round-trip.** The latest run is
  fetched via `runs: { orderBy: { createdAt: 'desc' }, take: 1 }`
  and the count via `_count: { select: { runs: true } }`. Prisma
  issues a single SQL query with a LEFT JOIN.
- **`/api/environments` is one round-trip.** The `_count: { select:
  { tools, capabilities, benchmarkRuns, limits } }` feature
  produces a single SQL query with four sub-aggregates.
- **`/api/benchmarks/run` is one subprocess + two DB writes.** If
  the benchmark definition doesn't exist, it's created first; the
  run is then inserted. With the seed data, the definition already
  exists, so only the run insert happens.
- **`/api/reports` POST is two reads + one write.** Reads the
  environment with counts, every run with its benchmark, every
  limit; formats the content; inserts the Report row.

---

## 20. See also

- [`architecture.md`](./architecture.md) — how the route handlers
  fit into the larger system, sequence diagrams, ERD.
- [`component-library.md`](./component-library.md) — the React
  Query hooks that call these endpoints (`useStats`, `useTools`,
  `useCapabilities`, `useBenchmarks`, `useBenchmark`,
  `useLimits`, `useReports`, `useEnvironments`, `useRunBenchmark`,
  `useCreateReport`, `useExport`).
- [`testing-guide.md`](./testing-guide.md) — the curl sweep that
  exercises every endpoint in §21 of this doc is reproduced there
  as a runnable shell script.
- [`decisions/adr-11-live-benchmark-subprocess.md`](./decisions/) —
  the trade-offs of the live benchmark design.
- [`decisions/adr-02-prisma-sqlite.md`](./decisions/) — the
  database choice and its serverless caveats.
