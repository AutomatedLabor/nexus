# ADR 03: Zustand for Client View-Switching State

Date: 2026-11-11
Status: Accepted

## Context

ATLAS is a single-page Next.js 16 app at `/` with six views — Dashboard,
Environment Explorer, Benchmark Suite, Limits Map, Report Generator,
Settings — that swap client-side without a route transition (see ADR 09
for the single-page decision). The shell `<AtlasApp/>` reads the active
view from a Zustand store, renders the matching view component inside
`<main>`, and updates the sidebar's `aria-current` indicator. The state
in question is small — a single `view: AtlasView` string and a `setView`
action — but the choice of state library had to satisfy three
constraints. First, **no provider boilerplate**: the App Router's root
`layout.tsx` is a Server Component and cannot host a React Context
provider directly (Context only works in client components); wrapping
the shell in a provider would require an extra `"use client"` boundary.
Second, **hooks-based, ergonomic**: the sidebar, the header, and
`AtlasApp` all need to read `view`, and the sidebar needs to call
`setView`; the API should be `const view = useViewStore(s => s.view)`
rather than a `useContext` + prop-drill. Third, **minimal bundle
footprint**: recharts, framer-motion, and the shadcn/ui primitives
already push the client bundle to ~270 KB gzipped; the view store
should not add measurably.

The team had prior experience with React Context (re-render storms when
the store grows), Redux Toolkit (excellent but overkill for one string),
and Jotai (atomic and elegant but a different mental model). The
sandbox's build itself ran under a degraded-tools regime (the main
session's Bash/Read/Write/Edit/LS/Glob/Grep went down mid-build with
`context deadline exceeded` errors — see ADR 08), so the choice had to
be one that a subagent could implement correctly without iterative
debugging on the main session. Zustand's small API surface (one
`create` call, one hook) made it the lowest-risk pick.

## Decision

Use **Zustand 5** for client view-switching state. The store lives at
`src/lib/view-store.ts`, is created with `create<AtlasViewStore>()`,
holds `view: AtlasView` (defaulting to `"dashboard"`) and
`setView: (v: AtlasView) => void`, and is consumed via selector hooks
(`useViewStore(s => s.view)`, `useViewStore(s => s.setView)`) so
components only re-render when the slice they read changes. No
provider component is needed; the store is a module-level singleton.
The `AtlasView` type is a TypeScript union defined in
`src/types/atlas.ts` and exported alongside the store, so the sidebar's
`NAV_ITEMS` array, the shell's view switch, and the store all share one
type. Zustand 5 is selected over Zustand 4 for the improved
TypeScript inference and the smaller `create<T>()` syntax (no
middleware wrapper needed for a store this simple).

## Alternatives Considered

- **React Context** — the canonical React answer. Rejected for two
  reasons: (a) the root layout is a Server Component, so a Context
  provider would need a separate `"use client"` wrapper component,
  adding a file and a boundary; (b) any consumer of the Context re-renders
  when the value changes, even if it only reads a slice — for one
  string this doesn't matter today, but as soon as the store grows to
  hold `sidebarCollapsed` or `theme`, every consumer re-renders on
  every change. Zustand's selector-based subscription avoids this by
  default.
- **Redux Toolkit** — the industry default for non-trivial apps.
  Rejected as overkill: a single string of state doesn't need slices,
  reducers, middleware, or the RTK Query integration. The bundle cost
  (~12 KB gzipped for RTK vs ~3 KB for Zustand) is also non-trivial
  given the existing bundle pressure.
- **URL search params (e.g., `?view=benchmarks`)** — would make the
  store the URL itself, giving deep links for free. Rejected because
  the single-page decision (ADR 09) explicitly sacrifices deep links;
  plumbing `useSearchParams` + history API for one string adds
  complexity without a corresponding user benefit. Also, in the
  App Router, `useSearchParams` requires a Suspense boundary.
- **Jotai** — atomic state model, very ergonomic. Rejected only
  because the team had more Zustand muscle memory and the store was
  too small to justify learning a new model under a degraded-tools
  build regime.
- **Nanostores / Valtio** — both excellent and smaller than Zustand,
  but less ecosystem support and the marginal bundle saving (~1 KB)
  didn't justify the unfamiliarity.

## Consequences

**Positive.** No provider boilerplate — the store is a module-level
singleton, imported by any client component that needs it. Selector
hooks mean the sidebar (which reads `view` and `setView`) re-renders
only when `view` changes, not on unrelated updates. The store is
~3 KB gzipped added to the client bundle. Zustand 5's TypeScript
inference is excellent; the `create<AtlasViewStore>()` call gives
typed `useViewStore` without middleware. The store is testable in
isolation (no React tree needed).

**Negative.** Zustand's singleton store is **per-page-load**: a
full-page refresh resets `view` to `"dashboard"`. This is acceptable
for ATLAS (single-tenant, no deep links) but would be a bug in a
multi-user app. The store is also **not synced to the URL**, so the
browser back button doesn't return to the previous view (documented in
ADR 09). DevTools for Zustand exist but require a separate middleware
(`zustand/middleware/devtools`) — not wired in v1.

**Neutral.** The store has no async, no middleware, no persistence; if
ATLAS grows to need `persist` (e.g., remember last view in
`localStorage`), the middleware is a one-line addition. Zustand 5 is
stable and the API has not changed in a way that would break this store.
