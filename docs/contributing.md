# ATLAS — Contributing

This document is the onboarding guide for contributors. It covers: getting
the repo running locally, the code style the project enforces (and the
parts it doesn't), where new views/charts/hooks/lib/type definitions go,
the PR process, the 12-item review checklist, the release flow, and
concrete recipes for adding a new dashboard view and a new benchmark.

> The shorter `CONTRIBUTING.md` at the repo root is user-facing. This
> `docs/contributing.md` is the longer contributor-facing reference. Read
> both — they are complementary, not redundant.

---

## 1. Development setup

### 1.1 Prerequisites

- **Node 20+** (the sandbox runs Node 24.22.2; ATLAS works on 20.x or 22.x
  for production).
- **Bun 1.3+** — the supported package manager. `bun.lock` is committed.
  `npm` and `pnpm` work but are not the canonical install path and may
  resolve dependencies differently.
- **Python 3.10+** — only for the live-benchmark endpoint (`POST
  /api/benchmarks/run`). Not needed for read-only development.
- **Git 2.x**.

### 1.2 First-time clone

```bash
git clone https://github.com/AutomatedLabor/atlas.git
cd atlas
bun install
bun run db:push         # create db/custom.db from prisma/schema.prisma
bun run db:generate      # regenerate @prisma/client (postinstall does this automatically)
bun run prisma/seed.ts   # insert the canonical seed data
bun run dev              # start on http://localhost:3000
```

`package.json` defines `db:push` as `prisma db push --accept-data-loss`,
`db:generate` as `prisma generate`, and `db:migrate` as `prisma migrate
dev`. There is **no `db:seed` script** — the seed is run directly with
`bun run prisma/seed.ts` because it is a one-off TypeScript file, not a
Prisma CLI command.

The seed prints a `console.table` of final counts. Expected:

```
environments  1
tools         28
capabilities  15
benchmarks    10
benchmarkRuns 10
limits        10
reports       0
```

If any number is wrong, the seed is broken or the schema drifted. Re-run
`bun run db:push` and re-seed.

### 1.3 Day-to-day workflow

```bash
# Pull latest main
git checkout main && git pull

# Branch
git checkout -b feat/short-description

# Make changes. Run these in parallel terminals while developing:
bun run dev               # hot-reloading dev server (tee's to dev.log)
bunx tsc --noEmit         # type-check on save (or wire to your editor)

# When ready to PR:
bun run lint              # ESLint
bunx tsc --noEmit         # TypeScript strict check
bun run build             # full standalone build (catches server/client boundary issues)
# → then run the Agent Browser 10-point verification (see §4.4)
```

### 1.4 Reset to a known state

If the database or `node_modules` gets into a weird state:

```bash
# Database
rm db/custom.db
bun run db:push
bun run prisma/seed.ts

# Dependencies
rm -rf node_modules bun.lock
bun install
```

The seed is idempotent (it wipes all rows first via `deleteMany` on every
table, in the right order to respect foreign keys), so re-running it on
a populated DB is safe — but it will destroy any user-generated `Report`
rows.

---

## 2. Code style

The project's `tsconfig.json` has `"strict": true` (with
`"noImplicitAny": false` for the few legacy `any`-typed places).
`eslint.config.mjs` extends `eslint-config-next/core-web-vitals` and
`eslint-config-next/typescript` and then turns *off* a long list of
rules (`no-explicit-any`, `no-unused-vars`, `react-hooks/exhaustive-deps`,
`no-console`, etc.). The result is a permissive lint that almost never
fails on real code; `bunx tsc --noEmit` is the strictest check in the
project — run it before every PR.

### 2.1 Semicolons, quotes, indentation — the actual convention

The codebase is **mixed** along a clear line. Checking the actual files:

| Layer | Semicolons | Quotes | Indent | Example file |
|-------|-----------|--------|--------|--------------|
| Frontend components (`src/components/**`) | **Yes** | Double | 2 spaces | `src/components/atlas/views/dashboard-view.tsx` |
| Frontend hooks (`src/hooks/**`) | **Yes** | Double | 2 spaces | `src/hooks/atlas/index.ts` |
| `src/lib/api.ts`, `src/lib/view-store.ts`, `src/lib/query-provider.tsx`, `src/lib/theme-provider.tsx` | **Yes** | Double | 2 spaces | `src/lib/view-store.ts` |
| `src/app/layout.tsx`, `src/app/page.tsx` | **Yes** | Double | 2 spaces | `src/app/layout.tsx` |
| `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `eslint.config.mjs` | **Yes** | Double | 2 spaces | `next.config.ts` |
| API route handlers (`src/app/api/**/route.ts`) | **No** | Single | 2 spaces | `src/app/api/stats/route.ts` |
| `src/lib/db.ts` | **No** | Single | 2 spaces | `src/lib/db.ts` |
| `prisma/seed.ts` | **No** | Single | 2 spaces | `prisma/seed.ts` |

The split is: code scaffolded by `create-next-app` (frontend + config)
uses semicolons and double quotes; the API route handlers, the Prisma
client singleton, and the seed script were hand-written in a more
minimal style with no semicolons and single quotes. Both styles are
internally consistent within their files.

**The rule: match the surrounding file.** Do not introduce a third
style and do not mix styles within a single file. If you're editing a
frontend component, use semicolons and double quotes. If you're
editing an API route handler, use no semicolons and single quotes.
Prettier is not configured, so there is no formatter to enforce this —
it's a convention upheld in review.

| Rule | Convention |
|------|------------|
| Semicolons | Frontend: yes. API routes / db.ts / seed.ts: no. |
| Indent | 2 spaces everywhere |
| Quotes | Frontend: double. API routes / db.ts / seed.ts: single. |
| Trailing commas | Yes in multiline (both styles) |
| `'use client'` directive | At the top of every client component (one that uses hooks, state, event handlers, or browser-only APIs) |
| Imports | Group: external libs → `@/` aliases → relative. Each group alphabetical. |
| JSX | Always use parentheses for multiline JSX |
| TypeScript | Strict mode on; `noImplicitAny: false` for legacy `any` spots |
| Functional components | Function declarations, not arrow consts: `export function DashboardView() {}` not `export const DashboardView = () => {}` |
| Named exports | Yes — no default exports except `RootLayout` (Next.js requirement) and `Home` (`src/app/page.tsx`) |

### 2.2 Import grouping example

From `src/components/atlas/views/dashboard-view.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Activity, Cpu, Gauge, /* ... */ } from "lucide-react";
import { toast } from "sonner";
import { useStats, useBenchmarks, /* ... */ } from "@/hooks/atlas";
import { useViewStore } from "@/lib/view-store";
import { PageHeader } from "@/components/atlas/ui/page-header";
import { SectionCard } from "@/components/atlas/ui/section-card";
import { StatCard } from "@/components/atlas/charts/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
```

The order is: React hooks → external libs (alphabetical) → `@/hooks` →
`@/lib` → `@/components/atlas/*` → `@/components/ui/*`.

### 2.3 `'use client'` — only where needed

The root `src/app/layout.tsx` is a Server Component. `src/app/page.tsx`
renders `<AtlasApp/>`, which is a client component (the whole shell is
client because it uses Zustand, React Query, and hooks). Every file
under `src/components/atlas/`, `src/hooks/`, and `src/lib/query-provider.tsx`,
`src/lib/theme-provider.tsx`, `src/lib/view-store.ts` has `'use client'`
at the top.

Rule: **add `'use client'` only to files that use hooks, state, event
handlers, or browser-only APIs.** Server Components are the default;
client is opt-in. The current codebase is heavier on client components
than strictly necessary because the whole app shell is interactive —
that's a deliberate choice (single-page-app feel, see
`docs/decisions/adr-09-single-page-view-switching.md`), not a mistake.

### 2.4 shadcn/ui for primitives — never rebuild

shadcn/ui primitives (Button, Card, Dialog, Select, Table, etc.) live in
`src/components/ui/`. They are generated by `bunx shadcn add <name>`,
not hand-written. The `components.json` configures the New York variant
with the "neutral" base color and the lucide icon library.

If you need a new shadcn primitive:

```bash
bunx shadcn@latest add <name>
# writes to src/components/ui/<name>.tsx
```

**Never rebuild a primitive that shadcn already provides.** If you
need a `Toggle`, add the shadcn `Toggle` — don't write your own. If you
need a custom variant, extend the existing primitive via `cva` (the
`class-variance-authority` package, already a dependency) rather than
copying the component.

Do not hand-edit `src/components/ui/*` unless you have a specific
reason (and document it in the PR). The shadcn CLI overwrites on
re-add.

### 2.5 recharts for charts

All charts use `recharts` 2 via the shadcn `ChartContainer` wrapper in
`src/components/ui/chart.tsx`. The project's chart components live in
`src/components/atlas/charts/` (`benchmark-bar-chart.tsx`,
`capability-radar.tsx`, `limits-severity-pie.tsx`, `performance-timeline.tsx`,
`stat-card.tsx`, `mini-sparkline.tsx`, `boundary-gauge.tsx`,
`tools-category-bar.tsx`).

Do not introduce a second charting library (D3, visx, Chart.js, etc.).
recharts covers the dashboard's needs; a second library would double
the bundle cost for marginal benefit. If you need a chart recharts
can't do, build it as a custom SVG in a new file under
`src/components/atlas/charts/`.

### 2.6 Semantic Tailwind tokens — no raw colors

The project uses Tailwind 4 with shadcn/ui's semantic token system. The
tokens are defined as CSS variables in `src/app/globals.css` and
referenced via Tailwind utilities. **Use the tokens, not raw hex or
Tailwind palette names.**

| Use | Don't use |
|-----|-----------|
| `bg-background` | `bg-white`, `bg-slate-50`, `bg-[#f8fafc]` |
| `text-foreground` | `text-black`, `text-slate-900` |
| `bg-card` | `bg-white`, `bg-slate-100` |
| `bg-primary` / `text-primary` / `text-primary-foreground` | `bg-indigo-600`, `bg-blue-500`, `text-white` |
| `bg-muted` / `text-muted-foreground` | `bg-slate-100`, `text-slate-500` |
| `border-border` | `border-slate-200`, `border-gray-200` |
| `bg-sidebar` / `text-sidebar-foreground` | (sidebar-specific tokens) |
| `ring-ring` | `ring-slate-300` |
| `bg-destructive` / `text-destructive-foreground` | `bg-red-600`, `bg-rose-500` |

The semantic tokens switch correctly between light and dark themes via
`next-themes`. **Raw colors do not** — `bg-slate-100` is light-only and
will look wrong in dark mode.

The **one documented exception** is the severity tints in
`src/components/atlas/views/limits-view.tsx`:

```tsx
const severityMeta: Record<LimitSeverity, { ring: string; bg: string; text: string; ... }> = {
  critical: { ring: "ring-rose-500/30", bg: "bg-rose-500/5", text: "text-rose-600 dark:text-rose-400", ... },
  warning:  { ring: "ring-amber-500/30", bg: "bg-amber-500/5", text: "text-amber-600 dark:text-amber-400", ... },
  info:     { ring: "ring-slate-500/30", bg: "bg-slate-500/5", text: "text-slate-600 dark:text-slate-300", ... },
};
```

The rose / amber / slate palette here is **intentional** — there is no
"critical" / "warning" / "info" semantic token in the shadcn system, so
the view uses Tailwind palette colors with explicit `dark:` variants. If
you add a similar severity-coded UI, follow this pattern (palette color
+ explicit `dark:` variant) rather than introducing a new semantic
token.

---

## 3. Folder structure convention

| You want to add... | Put it in... | Naming |
|--------------------|--------------|--------|
| A new view | `src/components/atlas/views/<name>-view.tsx` | `<Name>View` (PascalCase), file name kebab-case with `-view` suffix |
| A new chart | `src/components/atlas/charts/<name>.tsx` | PascalCase component, kebab-case file |
| A new UI atom (ATLAS-specific, not shadcn) | `src/components/atlas/ui/<name>.tsx` | PascalCase component, kebab-case file |
| A new shadcn primitive | `src/components/ui/<name>.tsx` (via `bunx shadcn add`) | shadcn's naming |
| A new hook | `src/hooks/atlas/index.ts` (append to the existing file) | `useXxx` (camelCase) |
| A new Zustand store | `src/lib/<name>-store.ts` | `useXxxStore` |
| A new shared lib helper | `src/lib/<name>.ts` | camelCase or PascalCase as appropriate |
| A new type | `src/types/atlas.ts` (append to the existing file) | PascalCase interface / type alias |
| A new API route | `src/app/api/<name>/route.ts` | Next.js Route Handler convention |
| A new ADR | `docs/decisions/adr-NN-<kebab-title>.md` | See `docs/decisions/` for existing numbering |
| A new env doc | `docs/environment/NN-<kebab-title>.md` | Two-digit prefix, kebab-case |

### 3.1 Where new shadcn primitives go

shadcn/ui primitives (button, card, dialog, table, etc.) are *owned* —
they live in `src/components/ui/` and are generated by `bunx shadcn add
<name>`. The `components.json` configures the New York variant with the
"neutral" base color and the lucide icon library. Do not hand-edit
`src/components/ui/*` unless you have a specific reason (and document
it in the PR). The shadcn CLI overwrites on re-add.

### 3.2 Where new environment docs go

`docs/environment/` is the Phase 0 cartography. It is structured as
`NN-<kebab-title>.md` with `00-index.md` as the entry point. If you add a
new env probe (e.g., a GPU probe if the sandbox ever gets a GPU), create
`docs/environment/08-gpu.md` and add a row to the table in
`docs/environment/00-index.md`.

### 3.3 Where new ADRs go

If you make a decision worth recording (a new dependency, a new pattern,
a trade-off that future contributors need to know), create
`docs/decisions/adr-NN-<kebab-title>.md` with the template in
`docs/decisions/` (look at `adr-01` through `adr-11` for examples). Add
a row to the table in `docs/architecture.md` §9. ADRs should be at least
300 words — don't be terse; future you (or the next agent) will
appreciate the context.

---

## 4. PR process

### 4.1 Branch from main

```bash
git checkout main
git pull
git checkout -b feat/short-description   # or fix/, docs/, refactor/
```

Branch naming: `<type>/<short-description>` where type is one of `feat`,
`fix`, `docs`, `refactor`, `chore`, `perf`, `test`.

### 4.2 Commit messages

The project does not enforce Conventional Commits, but the convention is:

```
<type>(<scope>): <subject>

<body — optional, wrap at 72 chars>
```

Examples:

```
feat(api): add /api/benchmarks/run with python3 subprocess
fix(atlas-app): add TooltipProvider so sidebar tooltips render
docs: write capability-report.md
refactor(hooks): extract useStats into its own query key
```

Keep the subject line under 72 characters. Use the imperative mood
("add" not "added"). One logical change per commit.

### 4.3 One logical change per PR

If you find yourself writing "and also…" in the PR description, split
the PR. ATLAS PRs should be reviewable in one sitting. A PR that adds a
new view **and** refactors the view store **and** bumps a dependency
is three PRs.

### 4.4 Before requesting review

Run the full check suite locally:

```bash
bun run lint              # ESLint — must exit 0
bunx tsc --noEmit         # TypeScript strict — must exit 0
bun run build             # full standalone build — must succeed
```

`bun run lint` prints nothing on success and exits 0 (the eslint config
is permissive, but it does catch genuinely broken syntax). `bunx tsc
--noEmit` is the strictest type check — it catches type errors that
`next build` skips (because `next.config.ts` has `typescript: {
ignoreBuildErrors: true }`). **Always run `bunx tsc --noEmit`**; do not
rely on `bun run build` alone.

Then run the **Agent Browser 10-point verification** from
`docs/testing-guide.md` §3. The 10 points (paraphrased):

1. Dashboard renders with the 4 stat cards, 2 charts, limits pie,
   and recent activity feed.
2. Environment view renders the environment card, tools table (28 rows),
   and capabilities list (15 rows).
3. Benchmarks view renders the runner card, comparison chart, and the
   list of 10 benchmarks; selecting one shows the timeline.
4. A live benchmark run (`fib_recursive_30`) succeeds and the result
   card appears.
5. Limits view renders the memory boundary explorer, the severity pie,
   and the filterable list of 10 limits.
6. Reports view renders the "new report" dialog and the list; creating
   a report of each format (html/json/csv) succeeds and the content
   dialog shows the text.
7. Settings view renders the theme toggle and notification preferences.
8. Dark mode toggles correctly (via the header dropdown) across all
   views.
9. Responsive layout at 375 / 768 / 1280 px — no horizontal scroll, no
   overlapping elements.
10. Sticky footer intact; no console errors; no console warnings.

All 10 must pass. If any fails, fix before requesting review.

### 4.5 Update docs if your change affects them

- API surface → `docs/api-reference.md`
- Component set → `docs/component-library.md`
- Schema → `docs/architecture.md` §5 (ERD) and `docs/api-reference.md`
- New architectural decision → add an ADR in `docs/decisions/`
- Environment cartography → `docs/environment/`
- Security posture → `docs/security.md`
- Performance profile → `docs/performance-tuning.md`
- Deployment story → `docs/deployment-guide.md`

### 4.6 Push and open the PR

```bash
git push -u origin feat/short-description
# Open the PR on GitHub; link the issue with `Closes #NN`.
```

Vercel generates a preview URL for the PR — reviewers can see the change
without checking out the branch.

---

## 5. Review checklist (12 items)

Reviewers should confirm each of the following before approving:

1. **`bun run lint` is clean** (exits 0, no output).
2. **`bunx tsc --noEmit` is clean** (exits 0, no output) — this is the
   strictest type check, stricter than `bun run build`.
3. **No new page routes added.** The project uses a single `/` route
   with Zustand view switching — see
   `docs/decisions/adr-09-single-page-view-switching.md`. New views go
   under `src/components/atlas/views/` and are wired into
   `atlas-app.tsx`'s `view ===` switch, not into `src/app/<route>/`.
4. **Semantic Tailwind tokens are used** (`bg-background`,
   `text-foreground`, `bg-card`, `bg-primary`, `text-muted-foreground`,
   `border-border`, etc.) — **no raw colors** like `bg-slate-100` or
   `bg-indigo-600` except where the design intentionally uses a
   non-token color (e.g., the rose/amber/slate severity tints in
   `limits-view.tsx`, which use explicit `dark:` variants).
5. **Responsive is checked at 375 px, 768 px, 1280 px** (the standard
   3-view matrix from `docs/testing-guide.md` §3) — no horizontal
   scroll, no overlapping elements, no clipped content.
6. **Dark mode is checked** — the change renders correctly in both light
   and dark themes (toggle via the header dropdown; the `next-themes`
   `ThemeProvider` handles the swap).
7. **Accessibility**:
   - Buttons have `aria-label` if they're icon-only (see
     `app-header.tsx`'s `<Button aria-label="Toggle theme">`).
   - The active nav item has `aria-current="page"` (see
     `sidebar-nav.tsx`).
   - Charts have an `aria-label` on the container and an `sr-only`
     mirror where appropriate.
   - The keyboard tab order is sensible (no focus traps, no
     unreachable interactive elements, no `tabIndex` > 0).
   - Focus states are visible (`focus-visible:ring-2
     focus-visible:ring-ring` — see `sidebar-nav.tsx`).
8. **No `console.error` or `console.warn` in production code paths.**
   `console.log` is acceptable in the seed script and in temporary
   debugging; remove before merging.
9. **Sticky footer intact** — the `AppFooter` is rendered in
   `atlas-app.tsx` and should remain visible at the bottom of every
   view. Don't accidentally remove it when refactoring the shell.
10. **No new dependencies without justification.** Every new dep expands
    the supply-chain attack surface (see `docs/security.md` §6) and the
    bundle size. If a new dep is genuinely needed, explain why in the PR
    description and check `bun audit` afterward.
11. **Commit message is clear** and uses the imperative mood; the PR
    title matches the convention (`<type>(<scope>): <subject>`).
12. **Tests / verification documented.** There is no automated test
    suite today, but the PR description should document which of the
    10 Agent Browser verification points were run and the result. If a
    new test file is added under `tests/`, the reviewer should run it
    and confirm it passes.

---

## 6. Release process

### 6.1 Tag and push

The project uses SemVer: `vMAJOR.MINOR.PATCH`.

- **MAJOR**: breaking API or DB schema change (e.g., a column rename, a
  response shape change that removes a field).
- **MINOR**: new feature, new view, new benchmark, new endpoint.
  Backward compatible.
- **PATCH**: bug fix, doc update, dependency bump. Backward compatible.

To release:

```bash
git checkout main
git pull
git tag v1.0.1
git push origin v1.0.1
```

### 6.2 Vercel auto-deploys main

Vercel deploys every push to `main` automatically. There is no explicit
"release" deploy — the latest `main` is the latest production build. The
tag is bookkeeping for SemVer traceability and for the GitHub release
notes; it does not itself trigger a deploy.

### 6.3 Release notes

Create a GitHub release from the tag with notes generated from merged PR
titles since the last release. The notes should call out:

- Any new endpoint (with a link to `docs/api-reference.md`).
- Any schema change (with the migration command: `bun run db:push` or
  `bunx prisma migrate deploy`).
- Any new env var required.
- Any breaking change (call your PR a "breaking" PR — it should have
  been a MAJOR bump).

### 6.4 Rollback

If a release breaks, use Vercel's instant rollback (see
`docs/deployment-guide.md` §9.1) to revert to the previous deploy in
seconds, then fix forward with a `git revert` + push.

---

## 7. How to add a new dashboard view

Concrete recipe. Example: adding a new "Audit log" view.

### 7.1 Add the view to the type union

Edit `src/types/atlas.ts`:

```ts
export type AtlasView =
  | "dashboard"
  | "environment"
  | "benchmarks"
  | "limits"
  | "reports"
  | "settings"
  | "audit";  // ← new
```

The `AtlasView` type is the single source of truth for valid view
identifiers. The Zustand store in `src/lib/view-store.ts` imports it
(`import type { AtlasView } from "@/types/atlas";`) — no change needed
in `view-store.ts` itself, the store just uses the imported type.

### 7.2 Create the view component

Create `src/components/atlas/views/audit-view.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { PageHeader } from "@/components/atlas/ui/page-header";
import { SectionCard } from "@/components/atlas/ui/section-card";
// ... other imports as needed

export function AuditView() {
  // hooks here (useQuery, useState, etc.)
  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" description="All write operations on this ATLAS instance." />
      <SectionCard title="Recent events" description="Newest first">
        {/* ... */}
      </SectionCard>
    </div>
  );
}
```

Use the `'use client'` directive, fetch data via hooks (see §7.5), and
use the semantic Tailwind tokens (§2.6). Match the surrounding style —
this is a frontend file, so use semicolons and double quotes.

### 7.3 Wire it into the shell

Edit `src/components/atlas/atlas-app.tsx` — add the import and the
case in the `view ===` switch:

```tsx
import { AuditView } from "./views/audit-view";
// ... at the top with the other view imports

// In the switch:
{view === "audit" && <AuditView />}
```

### 7.4 Add the nav item

The `NAV_ITEMS` array lives in
`src/components/atlas/layout/sidebar-nav.tsx` (not `app-sidebar.tsx` —
that file just renders `<SidebarNav/>`). Edit `sidebar-nav.tsx`:

```tsx
import { ScrollText } from "lucide-react";
// ...
export const NAV_ITEMS: NavItem[] = [
  // ... existing 6 ...
  { view: "audit", label: "Audit Log", icon: ScrollText, description: "All write operations" },
];
```

The `AppHeader` automatically picks up the new item via
`NAV_ITEMS.find` for the breadcrumb (see `app-header.tsx`'s
`activeItem` lookup), and the `AppSidebar` renders it because
`SidebarNav` iterates `NAV_ITEMS`. No other wiring needed.

### 7.5 (Optional) Add the hook

If the view fetches new data, add a hook in `src/hooks/atlas/index.ts`
following the existing `useXxx` pattern:

```ts
export function useAuditLog() {
  return useQuery<AuditEntry[]>({
    queryKey: ["atlas", "audit"],
    queryFn: () => apiGet<AuditEntry[]>("/api/audit"),
    staleTime: 15_000,
  });
}
```

And add the `AuditEntry` type to `src/types/atlas.ts`.

### 7.6 (Optional) Add the API route

If the view consumes a new endpoint, create
`src/app/api/audit/route.ts` following the pattern of the other routes:
Zod query schema (single quotes, no semicolons — match the surrounding
file), Prisma query, `{ data, total }` envelope, 400/500 error shapes
(`{ error: string, details?: ... }`). See `docs/api-reference.md` for
the full contract.

### 7.7 Verify

Run the 10-point checklist from `docs/testing-guide.md` §3. The new nav
item should appear in the sidebar; clicking it should swap the main
content to the new view; the breadcrumb should read `ATLAS / Audit Log`;
the new view should render with no console errors in both light and
dark mode at 375 / 768 / 1280 px.

---

## 8. How to add a new benchmark

Three coordinated edits, also documented in `docs/testing-guide.md` §5.

### 8.1 Add the Python script

Edit `src/app/api/benchmarks/run/route.ts` — append to the
`BENCH_PYTHON` record and the matching `BENCH_DETAILS` record:

```ts
const BENCH_PYTHON: Record<string, string> = {
  // ... existing 4 (csv_generate_1m, sha256_10k, fib_recursive_30, matmul_100x100) ...
  my_new_bench: `
import time
N = 1000
s = time.perf_counter()
# ... do work with N ...
e = time.perf_counter()
print(f"{(e - s) * 1000:.3f}")
`,
};

const BENCH_DETAILS: Record<string, string> = {
  // ... existing 4 ...
  my_new_bench: "compute 1000 things",
};
```

Constraints on the script:

- **Print exactly one number as the last non-empty line of stdout** —
  the duration in milliseconds. The route parses
  `parseFloat(lines[lines.length - 1])` where `lines` is the trimmed,
  filtered stdout lines. If the parse fails (`!Number.isFinite`), the
  route returns 500 `benchmark_parse_failed`.
- Use `time.perf_counter()` for timing (monotonic, high-resolution).
- **Finish within 30 s** — the `timeout: 30_000` hard cap kills the
  subprocess. The 30 s wall clock includes Python interpreter startup
  (~30 ms) plus your script.
- **Stdout under 10 MB** — the `maxBuffer: 10 * 1024 * 1024` cap. None
  of the existing benchmarks print more than a few hundred bytes; keep
  yours the same.
- The script is passed via `python3 -c <script>`, not a file. No file
  I/O is needed for the script itself (but you can write to `/tmp/` if
  your benchmark needs scratch space — see `csv_generate_1m` which
  writes to `/tmp/atlas-1m.csv`).

Match the surrounding style — this is an API route handler, so use
**no semicolons and single quotes**.

### 8.2 Add the seed row

The benchmark durations in the seed come from
`seed-data/benchmarks.json`. Add a row:

```jsonc
[
  // ... existing 10 ...
  { "name": "my_new_bench", "duration_ms": 42.123, "details": "compute 1000 things" }
]
```

Then edit `prisma/seed.ts` to add the category mapping (if the
benchmark belongs to a new category) in the `BENCH_CATEGORY` record:

```ts
const BENCH_CATEGORY: Record<string, string> = {
  // ... existing ...
  my_new_bench: 'compute',   // or 'filesystem', 'serialization', 'crypto', 'text'
};
```

The seed script reads `seed-data/benchmarks.json`, creates a
`Benchmark` row per entry, and a `BenchmarkRun` row with the
`duration_ms` from the JSON. It also mirrors each benchmark as a
`Capability` row (category `'benchmark'`) so the dashboard's capability
radar can plot it.

Re-seed:

```bash
bun run prisma/seed.ts
```

The seed is idempotent — it wipes all rows first, so the new benchmark
appears cleanly without duplicates.

### 8.3 Add to the UI's `LIVE_RUNNABLE` set

Edit `src/components/atlas/views/benchmarks-view.tsx`:

```tsx
const LIVE_RUNNABLE = new Set([
  "csv_generate_1m",
  "sha256_10k",
  "fib_recursive_30",
  "matmul_100x100",
  "my_new_bench",   // ← new
]);
```

The `LIVE_RUNNABLE` set controls which benchmarks get the "Live" badge
and which can be triggered from the **Run now** button. Benchmarks not
in the set are listed for inspection only (the seeded ones that aren't
runnable live — `read_sort_1m`, `json_generate_10k`, `regex_match_1m`,
`str_replace_1m`, `write_10k_files`, `read_delete_10k_files`).

### 8.4 Verify

```bash
bun run dev

# Verify the endpoint accepts the new name and returns a real duration:
curl -s -X POST http://localhost:3000/api/benchmarks/run \
  -H 'Content-Type: application/json' \
  -d '{"name":"my_new_bench"}' | jq '.data.durationMs'

# Verify it appears in the list:
curl -s http://localhost:3000/api/benchmarks | jq '.data[] | select(.name == "my_new_bench")'

# Verify the UI:
# → open http://localhost:3000, click Benchmarks, confirm "my_new_bench"
#   appears with the "Live" badge, click "Run now", confirm the result
#   card appears.
```

### 8.5 (Optional) Add a chart that visualizes the new benchmark

If the new benchmark warrants a new chart component, follow §3's
convention and add a `src/components/atlas/charts/<name>.tsx`. The chart
should consume `Benchmark[]` or `BenchmarkRun[]` types from
`src/types/atlas.ts`, accept the data as props, and use recharts (via
the shadcn `ChartContainer` wrapper) or custom SVG. Do not introduce a
second charting library.

---

## 9. Code of conduct

The project follows the standard "be kind, assume good faith, keep PRs
focused" rules from the existing `CONTRIBUTING.md` at the repo root.
There is no formal code of conduct document; the maintainer's contact is
in the repo for off-channel concerns.

---

## 10. Quick reference — the commands you'll run most

```bash
# Setup
bun install
bun run db:push
bun run prisma/seed.ts

# Develop
bun run dev
bunx tsc --noEmit
bun run lint

# Build
bun run build
bun run start

# Test (manual today)
# → see docs/testing-guide.md §3 (the 10-point Agent Browser checklist)
# → see docs/testing-guide.md §4 (the curl sweep)

# Database
bun run db:push          # apply schema
bun run db:generate       # regen Prisma client
bun run db:migrate        # create a Prisma migration (use `migrate dev` for dev)
bun run db:reset          # drop + recreate (destructive — read the prompt)

# Deploy
git push origin main      # auto-deploys via Vercel
# Rollback: Vercel dashboard → Deployments → ⋯ → Instant Rollback
```

---

## Cross-references

- **Architecture** — `docs/architecture.md`
- **API reference** — `docs/api-reference.md`
- **Component library** — `docs/component-library.md`
- **Testing guide (Agent Browser protocol + curl sweep)** — `docs/testing-guide.md`
- **Deployment guide (Vercel + headers + rollback)** — `docs/deployment-guide.md`
- **Security (incl. no-auth gap + checklist)** — `docs/security.md`
- **Performance tuning (incl. baseline profile)** — `docs/performance-tuning.md`
- **Decisions (ADRs)** — `docs/decisions/`
- **Single-page view switching ADR** — `docs/decisions/adr-09-single-page-view-switching.md`
- **Zustand view state ADR** — `docs/decisions/adr-03-zustand-view-state.md`
- **Live benchmark subprocess ADR** — `docs/decisions/adr-11-live-benchmark-subprocess.md`
- **Environment cartography** — `docs/environment/00-index.md`
- **Capability report (the self-assessment)** — `docs/capability-report.md`
