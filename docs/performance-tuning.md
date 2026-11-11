# ATLAS — Performance Tuning

ATLAS is a **read-heavy** dashboard with a single expensive write endpoint
(live benchmark run) and a couple of light writes (report create, export).
The performance profile of the sandbox it runs in is well documented in
`docs/environment/07-benchmarks.md` and persisted as machine-readable seed
data in `seed-data/benchmarks.json`. This file uses those numbers as a
baseline and walks through every layer where performance can be tuned,
is already tuned, or could be tuned in a future iteration: the frontend
client bundle, the React Query cache, the backend route handlers, the
Prisma queries, the database, the (absent) server cache, the bundle
inspection process, and the benchmark baseline that defines "fast enough"
for this host.

The framing throughout is: **measure first, optimize second**. ATLAS's
own benchmark suite is the canonical measurement tool for the host; for
the app itself, the curl sweep in §7 is the canonical measurement tool.

---

## 1. Frontend performance

### 1.1 The current first-load profile

The frontend is a single Next.js 16 page (`/`) that renders `<AtlasApp/>`.
The shell eagerly imports six views, eight chart components, seven UI
atoms, the layout components, and the React Query + Zustand + theme
providers. All of that is in the same client bundle. The initial bundle
is dominated by recharts (≈ 150 KB gzipped once you pull in the d3
modules it uses) and framer-motion (≈ 50 KB gzipped, currently imported
but used only sparingly).

Approximate per-library gzipped cost in the ATLAS bundle:

| Library | Approx. gzipped | When it's needed |
|---------|-----------------|------------------|
| `recharts` + d3 modules | ~150 KB | Only on chart-rendering views (Dashboard, Environment, Benchmarks, Limits) |
| `framer-motion` | ~50 KB | Currently imported but the only ATLAS-authored animations are CSS transitions; the cost is not yet earned |
| `@tanstack/react-query` | ~13 KB | Every view (the cache layer) |
| `zustand` | ~3 KB | Every view (the view store + notification prefs) |
| `lucide-react` (named imports) | ~1 KB per icon, tree-shaken | Every view |
| `next-themes` | ~2 KB | Root layout only |
| `sonner` | ~10 KB | Root layout (toaster) |
| `zod` | ~12 KB | Currently used only server-side; not in the client bundle |
| shadcn primitives (Card, Button, Dialog, Select, etc.) | ~30 KB combined | Varies by view |
| `date-fns` (used for `formatDistanceToNow`) | ~5 KB tree-shaken to just `format` | Dashboard + Reports views |

Total first-load gzipped estimate: **~270 KB**. Reasonable for a
dashboard, not exceptional.

### 1.2 Code-split views with `React.lazy` + `Suspense` (future optimization)

The current `src/components/atlas/atlas-app.tsx` mounts all six views in
a `{view === ...}` switch:

```tsx
{view === "dashboard" && <DashboardView />}
{view === "environment" && <EnvironmentView />}
{view === "benchmarks" && <BenchmarksView />}
{view === "limits" && <LimitsView />}
{view === "reports" && <ReportsView />}
{view === "settings" && <SettingsView />}
```

All six views are therefore bundled together. The eager imports at the
top of `atlas-app.tsx` pull every view's dependency graph (recharts,
framer-motion, all the chart components) into the initial chunk, even
though only the dashboard renders on first load.

A meaningful win is to lazy-load each view:

```tsx
import { lazy, Suspense } from "react";
const DashboardView = lazy(() =>
  import("./views/dashboard-view").then((m) => ({ default: m.DashboardView }))
);
const EnvironmentView = lazy(() =>
  import("./views/environment-view").then((m) => ({ default: m.EnvironmentView }))
);
// ... etc.

{view === "dashboard" && (
  <Suspense fallback={<ChartSkeleton />}><DashboardView /></Suspense>
)}
```

Each view becomes its own chunk. The initial bundle shrinks by roughly
the size of the non-default views (~30–40% reduction), at the cost of a
one-time network request + parse when the user first switches to a view.
For a single-user internal dashboard, the trade-off favors the smaller
initial bundle. The Settings view has no charts and would benefit most
from being split out — it would drop recharts entirely from its chunk.

This is the single highest-leverage frontend optimization. It is
**not yet implemented** — listed here as the next step.

### 1.3 React Query `staleTime` and `gcTime` tuning

The `QueryClient` is created once in `src/lib/query-provider.tsx`:

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30 seconds
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
```

The default `staleTime: 0` that React Query ships with means **every
mount refetches**. ATLAS already overrides this to 30 s globally, which
is sensible for a dashboard. Data is considered fresh for half a minute;
subsequent `useQuery` calls with the same key during that window return
the cached value without re-fetching. `refetchOnWindowFocus: false`
avoids the "every tab switch refetches everything" pattern that React
Query defaults to. `retry: 1` gives endpoints one retry on transient
failure.

For specific high-traffic endpoints you could tune differently by
passing `staleTime` in the individual `useQuery` options:

| Endpoint | Suggested `staleTime` | Why |
|----------|----------------------|-----|
| `/api/stats` | 60_000 (60 s) | Aggregates change rarely; recomputing 7 counts + an `_avg` on every dashboard view is wasteful |
| `/api/environments` | 300_000 (5 min) | The environment row only changes when you re-seed |
| `/api/benchmarks` | 30_000 (30 s) | Stays at the default; changes after a live run |
| `/api/benchmarks/[id]` | 60_000 (60 s) | History doesn't change unless a new run lands |
| `/api/limits` | 120_000 (2 min) | Limits only change on re-seed |
| `/api/tools` | 60_000 (60 s) | Tool inventory only changes on re-seed |
| `/api/capabilities` | 60_000 (60 s) | Same |
| `/api/reports` | 15_000 (15 s) | User-generated; want fresh list after creating one |

To apply a per-hook override (in `src/hooks/atlas/index.ts`):

```ts
export function useStats() {
  return useQuery<Stats>({
    queryKey: qk.stats,
    queryFn: () => apiGet<Stats>("/api/stats"),
    staleTime: 60_000,
  });
}
```

The default `cacheTime` (now called `gcTime` in React Query 5) is 5
minutes — inactive queries are garbage-collected 5 minutes after their
last observer unsubscribes. Reasonable for ATLAS; no need to change.

### 1.4 recharts `ResponsiveContainer` and layout thrash

Every chart in ATLAS uses recharts' `ResponsiveContainer` (via the
shadcn `ChartContainer` wrapper in `src/components/ui/chart.tsx`).
`ResponsiveContainer` measures its parent's width on every layout change
and re-renders the chart. The classic footgun with `ResponsiveContainer`
is **width: 0** — if the parent has no explicit width or height, the
chart renders as a zero-size box. ATLAS avoids this by giving every
chart container a fixed height (e.g., `h-[220px]`, `h-56`) so the chart
always has a measurable parent.

On a page with many charts (the Dashboard has 4) resizing the window
triggers 4 measure-then-render cycles. On the 2-vCPU sandbox this is
imperceptible; on a slow device it can feel janky. A future mitigation
would be to debounce the `ResizeObserver` that `ResponsiveContainer`
installs, or to pin `minWidth`/`maxWidth` on each chart so dimensions are
stable during resize. Not needed today.

### 1.5 framer-motion — keep it subtle

`framer-motion` is currently a dependency but the only ATLAS-authored
animations are subtle: the sidebar `setView` swap (no animation, just a
state change), the `StatusPill`'s `animate-ping` (a Tailwind utility, not
framer-motion), and a few CSS transitions on hover/focus states. The
50 KB cost of framer-motion is not yet earned by the project's animation
budget.

If you do add motion, the rules that keep it cheap:

- Use `layout` (cheap, GPU-friendly transform) rather than `animate`
  with non-transform properties (`width`, `height`, `top`, `left`).
- Animate only `transform` and `opacity`. Anything else triggers layout.
- Set `transition: { duration: 0.15 }` — sub-perceptible animations feel
  snappier than 300 ms ones.
- Use `whileHover` / `whileTap` for micro-interactions; reserve `animate`
  for state-driven transitions.

If you find yourself not using framer-motion at all after a few months,
removing it from `package.json` saves ~50 KB gzipped from the initial
bundle. The project does not depend on it for correctness.

### 1.6 Images

ATLAS has no `<img>` tags. The only raster image is `public/logo.svg` (an
SVG, served as a regular file). `next/image` is not used because there
are no user-uploaded images and no large hero images. This section is a
no-op for ATLAS today. If you add screenshots to docs or a user avatar in
the future, use `next/image` with `width`/`height` set and
`priority="high"` only for above-the-fold hero images.

The `app-header.tsx` GitHub link uses a plain `<a>` with a Lucide icon,
not `next/image`. The `layout.tsx` metadata `icons.icon` points at an
external SVG URL (`https://z-cdn.chatglm.cn/z-ai/static/logo.svg`) — that
is a third-party request for the favicon; if you want to remove it,
replace with `public/logo.svg` (the bundled SVG).

### 1.7 Fonts

The root layout uses Geist Sans and Geist Mono via `next/font/google`:

```ts
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
```

Both fonts are subset to `latin` (the only subset ATLAS uses — no CJK,
no Cyrillic, no Arabic glyphs in the UI). The subset cuts each font from
~100 KB to ~20 KB. Already optimal.

`next/font` self-hosts the fonts (serves them from the same origin as
the app, not from Google Fonts), so there's no third-party request and
no additional connection cost. Already optimal. No tuning needed.

---

## 2. Backend performance

### 2.1 Prisma `select` projections to avoid over-fetching

Several routes already use `select` to project only the fields the
response needs. Notable examples:

- `GET /api/stats`:

  ```ts
  const lastRun = await db.benchmarkRun.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, durationMs: true },  // only 2 columns
  })

  const agg = await db.benchmarkRun.aggregate({
    _avg: { durationMs: true },
  })
  ```

  Only the columns the response needs; the 7 `count()` calls in the
  same route are also minimal — `count` returns a scalar, no row data.

- `GET /api/benchmarks`:

  ```ts
  include: {
    runs: {
      orderBy: { createdAt: 'desc' },
      take: 1,                                  // only the latest run
      select: { durationMs: true, createdAt: true },
    },
    _count: { select: { runs: true } },
  }
  ```

  This is the right pattern: instead of pulling all runs for each
  benchmark (N+1 rows), it pulls one row per benchmark with a sub-query
  for the count.

- All list endpoints use `environment: { select: { hostname: true } }`
  rather than `include: { environment: true }` to avoid pulling the
  full environment row (13 columns) when only the hostname is needed.

**Where projections could be tighter**: the `POST /api/reports` route
fetches *all* benchmark runs with `include: { benchmark: true }` to
render the report content. For a dataset of 10 runs this is fine; for a
dataset of 10,000 runs after a year of operation you'd want to limit
this to the most recent N (or accept that report generation is a
"snapshot all" operation and let it be slow).

The `useStats`-style "I need 7 counts" pattern is a candidate for a
single SQL aggregate or a materialized view in Postgres, but Prisma's
`count()` on a 28-row SQLite table is microseconds; the optimization is
not worth the complexity at this scale.

### 2.2 Pagination enforced

Every paginated endpoint (`/api/tools`, `/api/capabilities`, `/api/limits`)
enforces `limit` with `z.coerce.number().int().min(1).max(200).default(50)`.
The hard cap of 200 prevents a client from requesting "give me everything"
in a single request that would OOM the function. The default of 50 keeps
responses small for the common case.

The non-paginated endpoints (`/api/environments`, `/api/benchmarks`,
`/api/reports`) are intentionally unpaginated because they return small
lists (typically <10 rows). If those grow beyond 100 rows, add pagination
following the same Zod pattern.

### 2.3 Avoiding N+1

The codebase avoids the classic N+1 pattern in two ways:

1. **`include` with `_count`**: `GET /api/environments` and
   `GET /api/reports` use `_count: { select: { ... } }` which compiles to
   a single SQL query with sub-selects, not one query per child table per
   parent row.
2. **`take: 1` for "latest"**: `GET /api/benchmarks` uses
   `runs: { take: 1, orderBy: createdAt desc }` — one sub-row per
   benchmark, not all runs.

The route that *does* risk N+1 if misused is `GET /api/environments`,
which includes full `tools`, `capabilities`, `limits`, and
`benchmarkRuns` arrays. For the seed (1 env, 28 tools, 15 caps, 10 runs,
10 limits) this is ~64 rows in one response — fine. For a
multi-environment future with thousands of rows each, you'd want to
split this into separate paginated endpoints. **Audit the routes before
scaling** — the current shape is correct for v1 single-tenant.

### 2.4 The Prisma client singleton

`src/lib/db.ts` exports a singleton:

```ts
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: ['warn', 'error'] })
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

This pattern prevents Next.js's dev-mode hot reloading from creating a
new `PrismaClient` on every request, which would exhaust SQLite
connection handles within minutes. The `log: ['warn', 'error']` setting
silences the `['query']` log channel — the source comment notes that the
query log was producing ~30 KB of stdout per request, which competed with
Turbopack's compile memory under the 4.1 GB cgroup limit and contributed
to OOM-kills. Re-enable locally only if you need to debug a specific
query.

In production on Vercel, each serverless function invocation creates its
own `PrismaClient` (the `globalThis` cache does not survive cold
starts). This is fine for low-traffic ATLAS; for high-traffic production
you'd want PgBouncer or Vercel Postgres's built-in pooler to handle many
short-lived clients. Append `?pgbouncer=true&connection_limit=1` to the
`DATABASE_URL` so Prisma does not open multiple connections per
invocation.

---

## 3. Database performance

### 3.1 SQLite is fine for dev; switch for prod

The dev database is SQLite at `db/custom.db`. SQLite is:

- **Zero-config**: just a file on disk; `prisma db push` creates it.
- **Fast** for low-concurrency reads (which is what ATLAS is):
  single-writer but many readers.
- **Persistent** across `bun run dev` restarts.
- **In-process**: no network hop.

For prod (Vercel serverless) SQLite is the wrong choice because of the
ephemeral filesystem (see `docs/deployment-guide.md` §6.1). The Prisma
schema is **Postgres-ready** — only the `datasource db` block needs to
change, no model edits required. See
`docs/decisions/adr-02-prisma-sqlite.md` for the trade-off discussion.

### 3.2 Indexing

Prisma auto-indexes:

- `@id` fields (every model's `id`)
- `@unique` fields (only `Benchmark.name` in this schema)
- `@relation` fields (every `environmentId`, `benchmarkId`)

What is **not** indexed by default and could be:

| Field | Reason to index |
|-------|------------------|
| `Tool.name` | The `q` filter uses `name: { contains: ... }`. Without an index, SQLite does a full table scan. With 28 rows it's instant; with 10,000 it would matter. |
| `Tool.category` | The `category` filter is exact match. Indexable. |
| `Capability.name` | Same as Tool.name. |
| `Capability.category` | Same. |
| `Limit.severity` | The `severity` filter is exact match. Indexable. |
| `Limit.kind` | Same. |
| `BenchmarkRun.createdAt` | The "latest run" queries (`orderBy createdAt desc, take 1`) benefit from a descending index. |
| `BenchmarkRun.benchmarkId` | Already indexed (it's a `@relation`). |

To add these, edit `prisma/schema.prisma`:

```prisma
model Tool {
  // ... existing fields ...
  @@index([name])
  @@index([category])
}

model Capability {
  // ... existing fields ...
  @@index([category])
  @@index([name])
}

model Limit {
  // ... existing fields ...
  @@index([severity])
  @@index([kind])
}

model BenchmarkRun {
  // ... existing fields ...
  @@index([createdAt])
}
```

Then run `bun run db:push`. The index overhead is minimal (small write
cost, small disk cost) and the read speedup is real on larger datasets.
At ATLAS's current scale (28 tools, 15 capabilities, 10 limits, 10 runs)
full table scans are nanosecond-fast — the guidance is for when the
dataset grows.

### 3.3 `EXPLAIN` plan guidance

For SQLite (note: the `sqlite3` CLI is **not installed** in the sandbox —
see `docs/environment/03-software.md`. Use Prisma's `db raw` or write a
small Node script):

```bash
# From a Node script:
# const rows = await db.$queryRaw`EXPLAIN QUERY PLAN SELECT * FROM Tool WHERE name LIKE '%node%'`
# Expect: "SCAN Tool" (full table scan) — no index on name.
```

For Postgres in prod:

```sql
EXPLAIN ANALYZE SELECT * FROM "Tool" WHERE name ILIKE '%node%';
-- `Seq Scan on "Tool"` — full scan.
-- Adding `CREATE INDEX idx_tool_name ON "Tool" (name);` then `LIKE 'node%'`
-- (prefix wildcard) would use the index. `LIKE '%node%'` (suffix wildcard)
-- cannot use a B-tree index; for full substring search you'd want a
-- trigram (pg_trgm) or FTS index.
```

### 3.4 Connection pooling

Dev: Prisma's SQLite driver uses one connection per `PrismaClient`. The
singleton in `src/lib/db.ts` keeps it to one. Fine.

Prod (Postgres): use PgBouncer or Vercel Postgres's built-in pooler.
Configure Prisma with `?pgbouncer=true&connection_limit=1` in the
`DATABASE_URL` query string. The `connection_limit=1` is critical on
serverless — it prevents Prisma from opening multiple connections per
function invocation, which can exhaust the pooler.

---

## 4. Caching

### 4.1 React Query is the client cache

The current architecture uses React Query 5 as the only cache. There is
no server-side cache and no CDN cache (responses include `cache:
no-store` via the `apiGet` helper in `src/lib/api.ts`). This is correct
for v1 — the data is fresh on every request, the dataset is small, and
the database can handle the load. The dashboard makes 6–8 API calls on
first load (stats, environments, tools, benchmarks, capabilities, limits,
reports) and each returns in ~10–20 ms warm (see §6.2).

### 4.2 Server-side LRU for `/api/stats` (proposed)

`/api/stats` computes seven `count()` calls plus a `findFirst` plus an
`_avg` aggregate on every request. The result changes only when:

- A new environment is created (rare in v1 — only on re-seed).
- A new benchmark run lands (frequent if benchmarks are being run, but
  still: at most a few per minute).
- A new report is created (rare).
- A tool/capability/limit is added (only on re-seed).

A 60-second in-memory LRU would amortize the cost across all callers in
that window. Implementation in `src/app/api/stats/route.ts`:

```ts
let cached: { at: number; data: Stats } | null = null;
const TTL = 60_000;

export async function GET() {
  if (cached && Date.now() - cached.at < TTL) {
    return NextResponse.json(cached.data);
  }
  try {
    // ... existing 7 counts + findFirst + aggregate ...
    const result = { environments, tools, /* ... */ avgRunMs };
    cached = { at: Date.now(), data: result };
    return NextResponse.json(result);
  } catch (err) {
    /* ... existing error path ... */
  }
}
```

**Trade-off**: stale stats for up to 60 s. After running a benchmark, the
"Total runs" stat would not increment for up to a minute. The user
experience trade-off is small for an internal dashboard. The
`useRunBenchmark` hook already invalidates `qk.stats` on success —
client-side, the cache refetches immediately; the server-side cache just
delays the new value by up to 60 s. To avoid that, you can bust the
server cache when `/api/benchmarks/run` succeeds (set `cached = null` in
that route — but the two routes run in different function instances on
Vercel, so the bust only works in the long-running self-hosted case).

On Vercel serverless, the in-memory cache is per-instance (each function
invocation may be a fresh instance), so the LRU only helps when the same
instance handles multiple requests in its warm window. For real
cross-instance caching, use Vercel KV (Redis) or Vercel Edge Config. The
implementation is the same shape — read from KV first, fall through to
the DB on miss, write back to KV with a TTL.

### 4.3 CDN caching (not recommended for v1)

If you wanted to cache `/api/stats` at the CDN layer (Vercel's edge),
set the response cache header:

```ts
return NextResponse.json(result, {
  headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
});
```

This would make the edge cache the response for 60 s and serve
stale-then-revalidate for another 5 minutes. **Do not do this** for any
endpoint that returns user-specific data (none in ATLAS today). For
`/api/stats` it's acceptable in a single-tenant deployment. The
downside: a Vercel redeploy invalidates the edge cache only after the
`s-maxage` window expires unless you also set a deploy-stable cache key.

---

## 5. Bundle inspection

To see exactly what's in the bundle:

```bash
bun run build
ls -la .next/static/chunks
# Use a bundle analyzer for a visual breakdown:
bunx @next/bundle-analyzer
# (or set `analyze: true` in next.config.ts and `bun run build`)
```

Look for:

- **Multiple copies of the same library**. If you accidentally import
  both `recharts` and `recharts/types`, both copies get bundled.
- **All of `lucide-react`**. The project uses named imports
  (`import { Activity } from "lucide-react"`), which tree-shakes
  correctly. Avoid `import * as Icons from "lucide-react"` — that bundles
  every icon (thousands of SVG paths, hundreds of KB).
- **`moment`** (not in ATLAS — `date-fns` is used instead). If you ever
  import `moment`, you'll see ~70 KB appear in the bundle.
- **`lodash`** as default import (`import _ from "lodash"` bundles
  everything; `import debounce from "lodash/debounce"` bundles one
  function). ATLAS does not use lodash.

### 5.1 Tree-shaking lucide-react correctly

The correct pattern (used throughout ATLAS, e.g. `dashboard-view.tsx`):

```tsx
import { Activity, Cpu, Gauge } from "lucide-react";
```

The incorrect pattern (would bundle every icon):

```tsx
import * as Icons from "lucide-react";
const Icon = Icons["Activity"];
```

ATLAS's `eslint.config.mjs` does not currently flag the bad pattern. If
you see bundle bloat and suspect lucide, grep for `import \* as`:

```bash
rg "import \* as" src/
```

(No matches in the current codebase — confirmed clean.)

---

## 6. Baseline performance profile — the 10 benchmarks

These are the real numbers from the sandbox, persisted in
`seed-data/benchmarks.json` and visualized by ATLAS itself. They are the
"this is how fast the host is" baseline against which any future
optimization (or regression) should be measured.

| # | Benchmark | duration_ms | Category | What it tells us |
|---|-----------|-------------|----------|-------------------|
| 1 | `csv_generate_1m`  | 291.832 | filesystem | Writes 1,000,000 CSV rows. ~3,428 rows/ms. Disk bandwidth is the long pole — see §6.1. |
| 2 | `read_sort_1m`     | 298.624 | filesystem | Reads the 1M CSV back and sorts in-memory. ~3,351 rows/ms. Read bandwidth ≈ write bandwidth on this FS. |
| 3 | `json_generate_10k`|  15.761 | serialization | `json.dumps` 10,000 dicts. ~635 dicts/ms. C-level Python — fast. |
| 4 | `sha256_10k`       |   5.532 | crypto       | SHA-256 of 10,000 strings. ~1,807 hashes/ms. CPU + sha_ni flag accelerate this. |
| 5 | `regex_match_1m`   | 293.100 | text         | `re.compile` + match across 1M lines. ~3,412 lines/ms. Same I/O ceiling as CSV gen. |
| 6 | `str_replace_1m`   |  12.457 | text         | `str.replace` on 1M CSV lines. ~80,000 lines/ms. C-level string scan — very fast. |
| 7 | `matmul_100x100`   |  64.154 | compute      | Pure-Python triple-loop 100×100 matmul. ~15.6 M mul-adds/sec. CPython 3.12 interpreter ceiling. |
| 8 | `fib_recursive_30`  | 122.778 | compute      | Recursive Fibonacci n=30. ~22 M calls/sec. Same interpreter ceiling. |
| 9 | `write_10k_files`  | 247.684 | filesystem   | 10,000 small files. ~40 files/sec per Python process. Syscall-bound. |
| 10| `read_delete_10k_files` | 167.466 | filesystem | Read then `rm` 10,000 files. ~60 files/sec. Slightly faster than write (read+rm cache-friendlier). |

Plus the two non-benchmark measurements from `docs/environment/`:

| Measurement | Value | Source |
|-------------|-------|--------|
| 100 MB bulk write | 2.7 GB/s (38 ms) | `docs/environment/02-filesystem.md` |
| 1000 small files | 0.28 s (~3586 files/s) | `docs/environment/02-filesystem.md` |
| 50 parallel HTTPS to example.com | all 200 (no throttling) | `docs/environment/05-network.md` |

**Total wall-clock for all 10 benchmarks**: ~1,518 ms ≈ **1.52 s**.

### 6.1 What the numbers reveal

The benchmark profile exposes a clear three-tier cost structure:

- **Tier 1 — essentially free (5–16 ms)**: `sha256_10k` (5.5 ms),
  `str_replace_1m` (12.5 ms), `json_generate_10k` (15.8 ms). These are
  dominated by CPython's C-level paths (OpenSSL hashing, `str.replace`'s
  C loop, `json.dumps`'s C encoder). Optimizing the Python layer won't
  help; the bottleneck is below Python.
- **Tier 2 — interpreter-bound (60–125 ms)**: `matmul_100x100` (64 ms),
  `fib_recursive_30` (123 ms). These run in pure Python and are
  bottlenecked by CPython 3.12's interpreter dispatch (~22 M calls/sec).
  The Xeon has AVX-512 and SHA-NI but Python's bytecode interpreter can't
  use them. NumPy would speed matmul up by ~100×; that's the standard
  "if you want fast numerical Python, use NumPy" message — but ATLAS is
  measuring the *interpreter's* throughput, so NumPy would defeat the
  purpose.
- **Tier 3 — I/O-bound (245–300 ms)**: `csv_generate_1m` (292 ms),
  `read_sort_1m` (299 ms), `regex_match_1m` (293 ms), `write_10k_files`
  (248 ms), `read_delete_10k_files` (167 ms). These are bottlenecked by
  either disk throughput (the 1M-row tests) or per-syscall overhead
  (the 10k-files tests).

**Disk bandwidth**: 100 MB sequential write at 2.7 GB/s (from
`docs/environment/02-filesystem.md`) sets the upper bound for bulk file
work. The 1M-row CSV test produces ~7 MB of CSV and takes 292 ms — that's
~24 MB/s, dominated by Python's `csv.writer` overhead, not by raw disk
bandwidth. The disk could write 100× faster; Python can't feed it that
fast. This confirms the sandbox's filesystem is **tmpfs/overlay-backed**
— a spinning disk or even a slow SSD would not sustain 2.7 GB/s.

**Syscall ceiling**: 10,000 small files in 248 ms = 40 files/sec per
process. That's 25 ms per `open + write + close` round trip — typical
syscall-bound small-file workload on a containerized overlay FS. The
non-benchmark "1000 small files in 0.28 s" measurement (from
`02-filesystem.md`) is faster (~3586 files/s) because that test uses
shell-level parallelism, not a single Python process.

**Parallel HTTP**: 50 concurrent HTTPS GETs to `example.com` all return
200 with no throttling. This means the sandbox's egress is not
rate-limited at 50 connections and the network path is healthy. The
egress IP is `8.212.10.159` (Alibaba Cloud range, see
`docs/environment/05-network.md`).

### 6.2 How ATLAS itself performs on this profile

ATLAS's API endpoints run in Node, not Python, so the Python benchmarks
above don't directly measure ATLAS's response time. They measure the
sandbox's *capacity to do work*, which ATLAS visualizes. The relevant
ATLAS-side measurements (warm, on the 2-vCPU sandbox):

| ATLAS operation | Measured cost |
|-----------------|---------------|
| `bun install` (cold) | ~3 s |
| `bun run dev` first compile | ~3 s |
| `bun run dev` hot reload | <500 ms |
| `bun run build` | ~12 s |
| `bun .next/standalone/server.js` startup | ~200 ms |
| `GET /api/stats` (first call, cold Prisma) | ~50 ms |
| `GET /api/stats` (warm) | ~10 ms (counts on 28 rows) |
| `GET /api/tools?page=1&limit=50` | ~15 ms |
| `GET /api/benchmarks` | ~20 ms (1 query with 2 includes) |
| `GET /api/limits` | ~14 ms |
| `POST /api/benchmarks/run` (`fib_recursive_30`) | ~150 ms (subprocess + parse + insert) |
| `POST /api/benchmarks/run` (`sha256_10k`) | ~40 ms (subprocess startup dominates) |
| `bun run prisma/seed.ts` | ~2 s |

The `POST /api/benchmarks/run` cost is dominated by the Python subprocess
startup (~30 ms) + the benchmark itself (123 ms for `fib_recursive_30`,
5.5 ms for `sha256_10k`) + the Prisma insert (~5 ms). For the short
benchmarks, subprocess startup overhead dominates the measurement — a
known cost of the subprocess-isolation architecture (see
`docs/decisions/adr-11-live-benchmark-subprocess.md`).

### 6.3 What this means for tuning

For the sandbox's profile (2 vCPU, 4 GB RAM, fast disk, CPython 3.12):

- **Don't optimize the Python benchmarks further** — they're already
  I/O-bound or interpreter-bound. Adding NumPy would change the matmul
  result dramatically but isn't relevant to ATLAS's purpose (which is to
  *measure* the host, not to optimize the measurements).
- **Do tune React Query `staleTime`** for the read-heavy endpoints
  (Section 1.3).
- **Do add `select` projections** if you add new endpoints that might
  over-fetch (the existing ones are tight).
- **Do add indexes** (`@@index([name])`, `@@index([category])`,
  `@@index([severity])`, `@@index([createdAt])`) before the dataset
  grows past a few hundred rows per table.
- **Don't add a server-side cache** for `/api/stats` until you see
  actual load — the query is 10 ms warm; caching it adds complexity for
  marginal benefit at the current scale. Add it when the dashboard has
  more than ~50 concurrent users.

---

## 7. Measuring ATLAS's own performance

The quickest way to check the API response times is the curl sweep:

```bash
# Start the dev server
bun run dev &

# Warm it up (first call initializes the Prisma client)
curl -s http://localhost:3000/api/stats > /dev/null

# Measure each endpoint
for endpoint in /api/stats /api/environments /api/tools /api/benchmarks /api/limits /api/reports; do
  echo -n "$endpoint: "
  curl -s -o /dev/null -w '%{time_total}s\n' "http://localhost:3000$endpoint"
done

# Sample output (2-vCPU sandbox, warm cache):
# /api/stats:        0.012s
# /api/environments: 0.018s
# /api/tools:        0.015s
# /api/benchmarks:   0.020s
# /api/limits:       0.014s
# /api/reports:      0.010s
```

For load testing (proposed future, not implemented):

```bash
# Using `hey` or `ab`:
hey -n 1000 -c 50 http://localhost:3000/api/stats
# Should handle 1000 req @ 50 concurrency with <100 ms p99 on the sandbox.
```

For browser-side performance, the Chrome DevTools Performance tab is the
canonical tool. The agent-browser skill also supports trace capture; see
the agent-browser docs. Record a trace while clicking through the 6
views and look for: long tasks > 50 ms, layout shifts, forced reflow,
excessive paint.

---

## 8. Performance budget

A useful discipline is to set a performance budget and check it on
every PR. Suggested initial budget for ATLAS:

| Metric | Budget | How to measure |
|--------|--------|----------------|
| Initial JS bundle (gzipped) | < 300 KB | `bun run build` + inspect `.next/static/chunks` |
| Initial CSS (gzipped) | < 50 KB | Same |
| Time to first paint (dev, warm) | < 1.5 s | Chrome DevTools Performance |
| `GET /api/stats` warm (local) | < 50 ms | curl sweep |
| `GET /api/benchmarks` warm (local) | < 50 ms | curl sweep |
| `POST /api/benchmarks/run` (`fib_recursive_30`) | < 500 ms | curl |
| Full seed | < 5 s | `time bun run prisma/seed.ts` |
| Full build | < 30 s | `time bun run build` |

If a PR regresses any of these by more than 20%, document why in the PR
description. The budget is a guideline, not a hard gate, but tracking it
catches "death by a thousand cuts" regressions.

---

## Cross-references

- **Environment benchmarks (the source of the numbers)** —
  `docs/environment/07-benchmarks.md`
- **Filesystem measurements** — `docs/environment/02-filesystem.md`
- **Network measurements** — `docs/environment/05-network.md`
- **Seed data (machine-readable)** — `seed-data/benchmarks.json`
- **Architecture** — `docs/architecture.md`
- **Deployment (incl. Vercel + Postgres swap)** — `docs/deployment-guide.md`
- **Prisma + SQLite ADR** — `docs/decisions/adr-02-prisma-sqlite.md`
- **Live benchmark subprocess ADR** — `docs/decisions/adr-11-live-benchmark-subprocess.md`
- **Single-page view switching ADR** — `docs/decisions/adr-09-single-page-view-switching.md`
- **React Query server-state ADR** — `docs/decisions/adr-04-react-query-server-state.md`
