# ADR 09: Single-Page View Switching via Zustand

Date: 2026-11-11
Status: Accepted

## Context

ATLAS exposes six top-level views — Dashboard, Environment Explorer,
Benchmark Suite, Limits Map, Report Generator, Settings — and the
team had to choose between two routing shapes. **Pattern A —
multi-page**: each view lives at its own URL (`/dashboard`,
`/environment`, `/benchmarks`, `/limits`, `/reports`, `/settings`),
one `src/app/<view>/page.tsx` per view, browser back/forward works
naturally, deep links work, per-view code splitting is automatic.
**Pattern B — single-page**: one route (`/`) renders `<AtlasApp/>`,
which uses a Zustand store (see ADR 03) to swap between views without
a route transition; the URL stays `/` throughout; view swaps are
instant (no RSC payload fetch, no hydration). The build mandate
named a single-page app at `/` with client-side view switching via
Zustand, so Pattern B was the mandated shape — but the tradeoffs
were real and this ADR records them honestly.

The constraints were four. First, **instant view swaps**: a
dashboard that the user clicks through dozens of times per session
should not incur a ~100 ms route-transition penalty per click (the
App Router fetches the new route's RSC payload and re-hydrates on
every navigation). Second, **shared cache**: the Dashboard's stat
cards, the AppHeader's breadcrumb subtitle, and the Benchmarks
view's summary card all consume `/api/stats`; with React Query (see
ADR 04) the cache is at the root `QueryClient`, so it survives a
route transition — but the components re-render from scratch on
each navigation, re-issuing any per-component work. Third,
**back-button semantics**: in Pattern B, the browser back button
does nothing (no history entry per view swap); in Pattern A, it
returns to the previous view naturally. Fourth, **deep linking**:
Pattern A gives you `/benchmarks?run=abc`; Pattern B does not.

The ATLAS use case is single-tenant, internal, and one-user, so
deep linking and back-button semantics are nice-to-have, not
requirements. The single-page shape also simplified the build under
a degraded-tools regime (see ADR 08): one `page.tsx`, one
`atlas-app.tsx` view switch, one `view-store.ts` Zustand store —
all writable by a subagent in one pass without iterative routing
debugging.

## Decision

Use **Pattern B — single-page with client view switching via
Zustand**. Specifically: one route (`/`) renders `<AtlasApp/>` from
`src/app/page.tsx`; a Zustand store `useViewStore` (in
`src/lib/view-store.ts`) holds `view: AtlasView` (default
`"dashboard"`) and `setView`; the `AtlasApp` shell renders the
active view via a `{view === "x" && <XView/>}` switch inside
`<main>`; the sidebar (desktop) and Sheet (mobile) call
`setView(name)` on click — no `router.push`, no URL change; the
`AppHeader` reads `view` from the store to compute the breadcrumb
("ATLAS / Active view label"); the active nav item gets
`aria-current="page"` for accessibility. The decision **explicitly
sacrifices** deep links, browser-back-button semantics, and
server-side rendering per view (the server renders the initial
`/` shell; the active view is chosen client-side after hydration).

## Alternatives Considered

- **Multi-page (one route per view)** — the canonical Next.js
  pattern. Pros: deep linking, back button, automatic code
  splitting per route. Cons: route transitions add ~100 ms of
  latency (network fetch + RSC hydration) per view swap — too much
  for a dashboard that should feel instant. Could have used
  `next/navigation`'s `router.prefetch` to hide the latency, but
  adds complexity. Also, the build mandate named single-page.
  Rejected.
- **URL hash routing (`/#/benchmarks`)** — same single `/` route,
  deep links work without server changes. Pros: deep linking,
  no server. Cons: feels like a SPA from 2015; requires a hash
  router (e.g., `use-hash-route`) and manual history plumbing;
  not the modern Next.js pattern. Rejected.
- **react-router inside Next.js** — would give client-side routing
  with deep links. Rejected as unnecessary: Next.js's App Router
  already has `next/navigation` for client navigation; pulling in
  react-router is a category error in a Next.js app.
- **Single-page with URL query string (`/?view=benchmarks`)** —
  keep single `/` but reflect the view in the query string. Pros:
  deep linking works (sort of). Cons: the URL still says `/` which
  is misleading; requires `useSearchParams` (which needs a Suspense
  boundary in the App Router) and history API plumbing. The team
  decided the marginal deep-linking value wasn't worth the
  plumbing. Rejected.
- **Hybrid — multi-page but with shared layout** — Next.js App
  Router supports nested layouts; the sidebar+header+footer would
  live in `src/app/layout.tsx` and each view would be its own page.
  Pros: same as multi-page; layout renders once. Cons: same
  route-transition cost as multi-page. Rejected.

## Consequences

**Positive.** View swaps are **instant** — no network fetch, no RSC
payload, no hydration; the active view's component mounts in the
same render pass as the Zustand state update. The React Query cache
is shared across views, so switching Dashboard → Benchmarks →
Dashboard within the 30-second `staleTime` issues zero new HTTP
requests. The shell renders once; views swap inside `<main>` with no
layout shift. The codebase is simpler — no `src/app/<view>/page.tsx`
files, no `useSearchParams`, no `next/navigation` imports for view
routing. Accessibility is straightforward: the active nav item has
`aria-current="page"`, the main region has `id="atlas-main"` for
skip-link targets.

**Negative.** **No deep links** — a user cannot bookmark
`/benchmarks`; only `/` exists. Mitigation: single-tenant, internal;
deep links are nice-to-have. **Browser back button does nothing** —
a user who clicked Dashboard → Benchmarks and hits back stays on
Benchmarks. **Initial server-rendered HTML is the dashboard** — a
user who navigates to `/` and immediately switches to Settings sees
the dashboard briefly, then Settings after hydration; invisible for
most users, a brief flash on slow connections. **All views bundled
together** (no automatic code splitting) — the bundle is ~270 KB
gzipped; `React.lazy` per view (see `docs/performance-tuning.md` §1.2)
could shrink the initial bundle to ~180 KB by splitting out the
chart-heavy views. Deferred.

**Neutral.** Adding a new view requires editing `atlas-app.tsx`'s
view switch, the `AtlasView` type union, the `NAV_ITEMS` array, and
the new view component — documented in `docs/contributing.md` §7.
Not bad, but more wiring than a single `app/<view>/page.tsx` would
require. The decision is reversible: a future version could add
per-view routes without removing the Zustand store.
