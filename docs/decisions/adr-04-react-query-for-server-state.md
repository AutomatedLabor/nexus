# ADR 04: TanStack React Query for Server State

Date: 2026-11-11
Status: Accepted

## Context

ATLAS's frontend reads from 11 REST endpoints — `/api/stats`,
`/api/environments`, `/api/tools`, `/api/capabilities`,
`/api/benchmarks`, `/api/benchmarks/[id]`, `/api/benchmarks/run`,
`/api/limits`, `/api/reports`, `/api/export`, plus the dynamic
`/api/benchmarks/[id]` detail — and one of them (`/api/benchmarks/run`)
is a POST that triggers a real `python3` subprocess benchmark. The
dashboard shell shows stat cards that consume `/api/stats`, the
Benchmarks view renders a bar chart and a timeline from
`/api/benchmarks` plus the latest `BenchmarkRun`, the Limits view
renders a severity pie chart from `/api/limits`, and the Reports view
lists `Report` rows from `/api/reports` and lets the user generate a
new one. Across the six views, the same `useStats` query is consumed by
the Dashboard, the AppHeader's breadcrumb subtitle, and the
Benchmarks view's summary card — a textbook case for a shared cache.

The constraints on the server-state library were five. First,
**deduplication**: if two components mount `useStats()` in the same
render pass, only one HTTP request should fire. Second, **background
refetch**: the dashboard should silently refresh stats every 30 s
without a loading spinner. Third, **stale-while-revalidate**: a view
swap should render the cached data instantly and refetch in the
background. Fourth, **mutation support with cache invalidation**: when
the benchmark runner POSTs to `/api/benchmarks/run`, the result should
be persisted (handled by the API) and the `/api/benchmarks` list should
refetch on success. Fifth, **devtools**: a degraded-tools build regime
(see ADR 08) makes inspecting the cache visually invaluable for
debugging. The `@tanstack/react-query-devtools` panel was the single
most useful debugging surface when the main-session Bash tool was down.

The forces against were subtle: SWR is smaller and equally capable for
simple GETs; plain `useEffect + fetch` is "no library"; Zustand is
already in the project (but Zustand for server state is the wrong
shape — it's a client-state store, not a cache).

## Decision

Use **TanStack React Query 5** for all server state. Specifically: a
`QueryClient` singleton is created in `src/lib/query-provider.tsx` and
wrapped around `<AtlasApp/>` via a `"use client"` boundary; the
`QueryClientProvider` lives below the root server layout so the Server
Component shell stays server-rendered. Each data-fetching hook in
`src/hooks/atlas/` (e.g., `useStats`, `useEnvironments`, `useTools`,
`useCapabilities`, `useBenchmarks`, `useBenchmarkById`, `useLimits`,
`useReports`, `useRunBenchmark`) is a thin wrapper around `useQuery` /
`useMutation` with a queryKey that names the resource (e.g.,
`["stats"]`, `["benchmarks"]`, `["benchmarks", id]`). Default `staleTime`
is 30 s, `gcTime` is 5 min, and `refetchOnWindowFocus` is true. The
benchmark runner uses `useMutation` with `onSuccess: () =>
queryClient.invalidateQueries({ queryKey: ["benchmarks"] })` so the
Benchmarks view refetches after a run. The devtools panel is mounted
in dev only (gated on `process.env.NODE_ENV`).

## Alternatives Considered

- **SWR** — same conceptual model (stale-while-revalidate), smaller
  bundle (~5 KB vs React Query's ~13 KB), excellent DX. Rejected for
  two reasons: (a) React Query's `useMutation` + `invalidateQueries`
  pattern is cleaner than SWR's `mutate` for the benchmark-runner case;
  (b) the devtools panel is materially better and the degraded-tools
  build regime made that decisive. SWR would have been a fine choice
  and the team would revisit if bundle size became a problem.
- **Plain `useEffect + fetch`** — no library, no abstraction. Rejected
  because it gives no cache (every view swap refetches), no dedup
  (two components mounting the same query fire two requests), no
  background refetch, no retry-on-error, and no loading/error state
  ergonomics. The dashboard would feel slow and brittle.
- **Zustand for server state** — Zustand is in the project for client
  state (ADR 03), so it's tempting to also put server state there.
  Rejected as the wrong tool: Zustand doesn't dedupe requests, doesn't
  refetch in the background, doesn't garbage-collect stale entries, and
  requires hand-rolling every cache concern. Server state and client
  state are different problems; use the right tool for each.
- **RTK Query** — excellent if you're already on Redux Toolkit. We're
  not (see ADR 03), so pulling in RTK just for the query layer would
  bundle Redux + RTK for no other reason. Rejected.
- **Apollo Client / urql** — GraphQL clients; ATLAS is REST. Rejected.

## Consequences

**Positive.** Two components mounting `useStats()` in the same render
pass fire one HTTP request (dedup). A view swap renders the cached
data instantly and refetches in the background (stale-while-revalidate).
The benchmark runner's `useMutation` invalidates the benchmarks query
on success, so the Benchmarks view updates automatically after a run.
The devtools panel was the single most useful debugging surface during
the degraded-tools build regime — when the main-session Bash tool was
down, the panel showed that the requests were succeeding even when the
console output looked ambiguous. The hook wrappers in
`src/hooks/atlas/` give a clean typed API that the views consume
without touching `useQuery` directly.

**Negative.** The bundle cost is ~13 KB gzipped (vs ~5 KB for SWR or
~0 KB for `useEffect + fetch`). The `QueryClientProvider` requires a
`"use client"` boundary below the Server Component layout, which is
fine but is one more boundary to remember. The devtools panel adds
~5 KB and must be gated out of production. The queryKey convention
(`["benchmarks", id]`) requires discipline; an inconsistent key shape
breaks invalidation silently.

**Neutral.** React Query 5's API (the `merge` of `useQuery`'s
`onSuccess`/`onError` into the second arg, the renamed `cacheTime` to
`gcTime`) is stable and the migration from v4 is documented. The
`staleTime` of 30 s is a guess; real telemetry might argue for 10 s
or 60 s.
