# ATLAS — Component Library

> Every ATLAS-specific component (not the shadcn primitives in
> `src/components/ui/`). Each entry was written by reading the
> source file under `src/components/atlas/` and the hooks in
> `src/hooks/atlas/index.ts`. For the shadcn primitives themselves,
> see the [shadcn/ui docs](https://ui.shadcn.com/). This document
> covers: the layout shell, the six views, the eight charts, the
> seven UI helpers, the eleven React Query hooks, and the two
> Zustand stores.

The component layer is split into three groups:

```
src/components/atlas/
├── atlas-app.tsx              ← the shell
├── layout/                    ← shell chrome (sidebar, header, footer)
│   ├── app-sidebar.tsx
│   ├── app-header.tsx
│   ├── app-footer.tsx
│   └── sidebar-nav.tsx
├── views/                     ← the six top-level views
│   ├── dashboard-view.tsx
│   ├── environment-view.tsx
│   ├── benchmarks-view.tsx
│   ├── limits-view.tsx
│   ├── reports-view.tsx
│   └── settings-view.tsx
├── charts/                    ← recharts + two custom SVG
│   ├── stat-card.tsx
│   ├── mini-sparkline.tsx
│   ├── benchmark-bar-chart.tsx
│   ├── capability-radar.tsx
│   ├── limits-severity-pie.tsx
│   ├── tools-category-bar.tsx
│   ├── performance-timeline.tsx
│   └── boundary-gauge.tsx
└── ui/                        ← ATLAS-specific UI atoms
    ├── section-card.tsx
    ├── data-table.tsx
    ├── page-header.tsx
    ├── empty-state.tsx
    ├── error-state.tsx
    ├── loading-skeleton.tsx
    └── status-badge.tsx
```

Conventions:
- Every interactive component is `"use client"`.
- Styling uses Tailwind 4 utility classes plus the project's
  shadcn tokens (`bg-background`, `text-foreground`,
  `text-muted-foreground`, `bg-muted`, `border`, `bg-card`,
  `bg-sidebar`, `text-sidebar-foreground`, `bg-primary`,
  `text-primary-foreground`, `bg-destructive`).
- Class composition uses `cn()` from `src/lib/utils.ts`, which is
  `clsx` + `tailwind-merge`.
- Charts use recharts 2 wrapped in shadcn's `ChartContainer` so
  they pick up the project's `--chart-1..4` CSS variables. Two
  charts (`MiniSparkline`, `BoundaryGauge`) are hand-rolled SVG
  because recharts has no built-in sparkline or semicircle gauge.
- Every chart has an `aria-label` and a hidden `<ul class="sr-only">`
  mirroring the data for screen readers.

---

## 1. Layout — `atlas-app.tsx`

**Path:** `src/components/atlas/atlas-app.tsx`
**Purpose:** The single-page shell. Reads the active view from the
`useViewStore` Zustand store and renders the matching view
component inside a `<main id="atlas-main">`. Wraps everything in a
`TooltipProvider` so tooltips work in any view. Layout is a flex
column that splits into a sidebar + main area on `md` and wider.

**Props:** none (it reads state from Zustand).

**Behavior:**
- Subscribes to `useViewStore((s) => s.view)` — re-renders on any
  view change.
- Renders `<AppSidebar />` (hidden on mobile via `md:flex`).
- Renders `<AppHeader />`, the `<main>` with the active view, and
  `<AppFooter />` inside a `flex-1 flex-col` container.
- The main area has `tabIndex={-1}` so it can receive focus as a
  skip-link target.

**Usage:**
```tsx
import { AtlasApp } from "@/components/atlas/atlas-app";

export default function Home() {
  return <AtlasApp />;
}
```

This is exactly what `src/app/page.tsx` does — the entire
user-facing application is `<AtlasApp />` mounted at `/`.

---

## 2. Layout — `app-sidebar.tsx`

**Path:** `src/components/atlas/layout/app-sidebar.tsx`
**Purpose:** The persistent desktop sidebar. Hidden below `md`
(`hidden md:flex md:flex-col`); the mobile equivalent is the Sheet
inside `AppHeader`. Renders the `BrandLogo` at the top, the
`SidebarNav` in a scrollable middle, and a "ATLAS v1.0 / Agent
capability telemetry" footer.

**Exports:**
- `AppSidebar()` — the sidebar `<aside>`.
- `BrandLogo({ className, ...props })` — a logo block with a
  violet rounded square containing a `lucide-react` `Activity` icon
  and the "ATLAS" wordmark plus the "Autonomous Tech Limits"
  subtitle. Reused by the mobile sheet in `AppHeader`.

**Usage:**
```tsx
import { AppSidebar } from "@/components/atlas/layout/app-sidebar";
// rendered by AtlasApp — typically not used directly
```

---

## 3. Layout — `app-header.tsx`

**Path:** `src/components/atlas/layout/app-header.tsx`
**Purpose:** Sticky top header. Contains the mobile hamburger
(`md:hidden`) that opens a Sheet with the same `SidebarNav`, a
breadcrumb ("ATLAS / <active view label>"), a live status pill
with a 30-second-ticking clock, a GitHub button, and the theme
toggle dropdown.

**Internal components:** `StatusPill` (live dot + clock that
updates every 30 s), `ThemeToggle` (dropdown with Light/Dark/
System using `next-themes`'s `useTheme()`).

**Behavior:**
- Reads `view` from `useViewStore` to compute the breadcrumb via
  `NAV_ITEMS.find((i) => i.view === view)`.
- The `Sheet` is controlled by local `useState`; on navigate the
  `onNavigate` callback closes it.
- The `ThemeToggle` waits for `mounted` before reading `theme`
  to avoid SSR hydration mismatch (the `next-themes` pattern).

**Usage:** rendered by `AtlasApp`. Not used directly.

---

## 4. Layout — `app-footer.tsx`

**Path:** `src/components/atlas/layout/app-footer.tsx`
**Purpose:** Footer with the environment hostname (lucide
`Server` icon) and public IP (`Globe` icon) pulled from
`useEnvironments().data?.data?.[0]`, plus a "Docs" link and a
copyright line. The hostname and IP only render if the query
returned an environment.

**Hooks used:** `useEnvironments()` — reads `["atlas",
"environments"]`. This is the only place outside the environment
view itself that reads the environment, so the footer issues the
fetch on first paint (or hits the cache if the environment view
already loaded).

**Usage:** rendered by `AtlasApp`. Not used directly.

---

## 5. Layout — `sidebar-nav.tsx`

**Path:** `src/components/atlas/layout/sidebar-nav.tsx`
**Purpose:** The actual nav buttons. Exports the `NAV_ITEMS`
constant (used by both the sidebar and the header for the
breadcrumb) and the `SidebarNav` component. The six nav items:

| `view` | `label` | `icon` | `description` |
|--------|---------|--------|---------------|
| `dashboard` | Dashboard | `LayoutDashboard` | Overview of agent limits & performance |
| `environment` | Environment | `Server` | Hardware, tools, and capabilities |
| `benchmarks` | Benchmarks | `Gauge` | Run and analyze benchmarks |
| `limits` | Limits | `AlertOctagon` | Resource & capability limits |
| `reports` | Reports | `FileText` | Generate and export reports |
| `settings` | Settings | `Settings` | App preferences |

**Props:** `onNavigate?: () => void` — called after `setView`, used
by the mobile Sheet to close itself on click.

**Behavior:** each button calls `setView(item.view)` then
`onNavigate?.()`. The active item gets `bg-primary/10 text-primary`
and `aria-current="page"`. Inactive items get
`text-foreground/70 hover:bg-muted`.

**Usage:**
```tsx
import { SidebarNav, NAV_ITEMS } from "@/components/atlas/layout/sidebar-nav";
// SidebarNav is used by AppSidebar and AppHeader
// NAV_ITEMS is read by AppHeader for the breadcrumb
```

---

## 6. View — `dashboard-view.tsx`

**Path:** `src/components/atlas/views/dashboard-view.tsx`
**Purpose:** The default landing view. Renders four `StatCard`s
(Benchmarks, Tools Mapped, Limits Found, Avg Run), a
`BenchmarkBarChart`, a `CapabilityRadar`, a `LimitsSeverityPie`, an
`ActivityFeed` (six most-recent benchmark runs), and a Quick
Actions card with three buttons.

**Hooks used:**
- `useStats()` → `["atlas", "stats"]` — feeds the four stat cards.
- `useBenchmarks()` → `["atlas", "benchmarks"]` — feeds the bar
  chart, the activity feed, and a synthetic sparkline built from
  the latest durations.
- `useCapabilities({ limit: 100 })` →
  `["atlas", "capabilities", { limit: 100 }]` — feeds the radar.
- `useLimits({ limit: 100 })` →
  `["atlas", "limits", { limit: 100 }]` — feeds the pie chart and
  the "X critical" hint on the Limits stat card.
- `useExport()` — mutation that triggers a CSV/JSON download.
- `useViewStore((s) => s.setView)` — for the "New Report" and "Run
  Benchmark" buttons which jump to other views.

**Internal components:**
- `ActivityFeed` — six most-recent benchmarks with `latestRunAt`,
  sorted by `createdAt` desc, formatted with `date-fns`
  `formatDistanceToNow({ addSuffix: true })`.

**Usage:**
```tsx
import { DashboardView } from "@/components/atlas/views/dashboard-view";
// rendered by AtlasApp when view === "dashboard"
```

---

## 7. View — `environment-view.tsx`

**Path:** `src/components/atlas/views/environment-view.tsx`
**Purpose:** The "Environment Explorer". Renders eight `InfoTile`
hardware cards (CPU, Memory, Disk, Kernel, Container, Public IP,
Hostname, Counts), a `ToolsCategoryBar` chart, a filterable
`DataTable` of tools (search + category select + installed select),
and a section of capability cards grouped by category.

**Hooks used:**
- `useEnvironments()` → first env via `data?.data?.[0]`.
- `useTools({ q, category, installed, page, limit: 8 })` → the
  visible page in the table. Page size is 8.
- `useTools({ limit: 200 })` (separate query, separate cache key)
  → all tools for the category chart. The chart needs every tool
  so the bars aren't truncated by pagination.
- `useCapabilities({ limit: 100 })` → all capabilities, grouped
  client-side by `category` via `useMemo`.

**Local state:**
- `q`, `category`, `installed`, `page` — filter state. The
  `updateFilter` helper resets the page to 1 when any filter
  changes (otherwise the user could land on an empty page after
  narrowing).

**Internal components:**
- `InfoTile({ icon, label, value, hint })` — small Card with an
  icon row, a large value, and a hint line.

**Usage:** rendered by `AtlasApp` when `view === "environment"`.

---

## 8. View — `benchmarks-view.tsx`

**Path:** `src/components/atlas/views/benchmarks-view.tsx`
**Purpose:** The "Benchmark Suite". Renders a runner card with a
Select dropdown (all benchmarks; the four live-runnable ones are
implicitly allowed, the rest are marked "view only" in the
dropdown), a comparison `BenchmarkBarChart`, a list of all
benchmarks with a click-to-select detail panel, and a
`PerformanceTimeline` chart for the selected benchmark's run
history.

**Hooks used:**
- `useBenchmarks()` → the list and the comparison chart.
- `useBenchmark(activeId)` → `["atlas", "benchmark", id]`. `enabled`
  is `!!id`, so the query does not fire until a benchmark is
  selected. The first benchmark in the list is used as a default
  if none is selected (`selectedId ?? benchmarks[0]?.id`).
- `useRunBenchmark()` — mutation that POSTs to
  `/api/benchmarks/run` and on success invalidates `["atlas"]`,
  `["atlas", "benchmarks"]`, and `["atlas", "stats"]`.
- `useNotificationPrefs()` — reads `toastOnBenchmarkComplete`; if
  true, fires a sonner toast on success.

**Local constants:**
- `LIVE_RUNNABLE` — a `Set<string>` with the four live-runnable
  benchmark names. **Must be kept in sync with `BENCH_PYTHON` in
  the route handler** — adding a benchmark to the backend without
  this set means the frontend will mark it "view only" in the
  dropdown even though the run button would work.

**Internal components:**
- `ResultCard({ run, name })` — a green-bordered Card shown after a
  successful run with the duration in ms, optional throughput, and
  a "Success" badge.

**Usage:** rendered by `AtlasApp` when `view === "benchmarks"`.

---

## 9. View — `limits-view.tsx`

**Path:** `src/components/atlas/views/limits-view.tsx`
**Purpose:** The "Limits Map". Renders a "Memory boundary explorer"
with a Slider (0–8192 MB, step 64) and a `BoundaryGauge` showing
the requested vs hard limit (defaults to 4100 MB if no `memory`
limit row is found, otherwise parsed from the limit's
`limitValue`), a `LimitsSeverityPie`, and a filterable list of
`LimitCard`s (by severity and kind).

**Hooks used:**
- `useLimits({ severity, kind, limit: 100 })` →
  `["atlas", "limits", { severity, kind, limit: 100 }]`. The
  `kinds` for the filter dropdown are derived client-side from
  the returned data.

**Local state:**
- `severity`, `kind` — filter strings (empty = all).
- `sliderValue` — the slider position in MB, initialized to 2048.
- `memoryLimitMb` — `useMemo`d from the limits data; reads the
  `memory` row's `limitValue` and parses as int (fallback 4100).

**Internal components:**
- `LimitCard({ limit })` — a Card colored by severity
  (`severityMeta` map: critical → rose, warning → amber, info →
  slate). Shows the resource name, severity badge, kind badge,
  limit value with unit, and the details text.

**Usage:** rendered by `AtlasApp` when `view === "limits"`.

---

## 10. View — `reports-view.tsx`

**Path:** `src/components/atlas/views/reports-view.tsx`
**Purpose:** The "Report Generator". Renders a "New report" form
(title Input, format Select, parameters Textarea pre-filled with a
sample JSON), a `DataTable` of existing reports, an export card
with two buttons (CSV/JSON), and a `<Dialog>` to view a report's
content.

**Hooks used:**
- `useReports()` → `["atlas", "reports"]`.
- `useCreateReport()` — mutation that POSTs to `/api/reports` and
  on success invalidates `["atlas", "reports"]` and
  `["atlas", "stats"]`.
- `useExport()` — mutation that triggers a download via
  `apiDownload`.
- `useNotificationPrefs()` — `toastOnReportReady` and
  `toastOnExport` toggles.

**Local state:**
- `title`, `format` (`"html" | "json" | "csv"`), `parameters`
  (string; the user types JSON and it's parsed on submit).
- `openReport` — the report being viewed in the dialog.

**Validation:** the `parameters` textarea is parsed with
`JSON.parse`; if it fails or the result isn't a plain object, a
sonner toast error is shown and the submit is aborted.

**Usage:** rendered by `AtlasApp` when `view === "reports"`.

---

## 11. View — `settings-view.tsx`

**Path:** `src/components/atlas/views/settings-view.tsx`
**Purpose:** The "Settings" view. Renders five sections in a 2-col
grid: Appearance (theme), Data source (read-only display of API
base URL `/api`, 30s polling, 1 retry), API keys (client-only
localStorage manager), Notifications (three Switch toggles), and
About (ATLAS v1.0 with a link to GitHub).

**Hooks used:**
- `useTheme()` from `next-themes` (for the theme buttons).
- `useNotificationPrefs()` (for the toggles).

**Local state / storage:**
- The `ApiKeyManager` reads/writes `localStorage` under the key
  `atlas:api-keys`. Each key has `{ id, label, value, createdAt }`.
  Keys are masked as `xxxx....••••••....xxxx` in the UI. This is a
  **client-only mock** — keys never leave the browser; the
  documented comment in the section header says "Mock — client
  only."

**Internal components:**
- `ThemeControls` — three buttons (Light/Dark/System) using
  `setTheme()` from next-themes; reads `theme` after `mounted` to
  avoid hydration mismatch.
- `ApiKeyManager` — add/remove keys in localStorage with sonner
  toasts.
- `NotificationControls` — three switches bound to
  `useNotificationPrefs` keys.

**Usage:** rendered by `AtlasApp` when `view === "settings"`.

---

## 12. Chart — `stat-card.tsx`

**Path:** `src/components/atlas/charts/stat-card.tsx`
**Purpose:** A KPI card with a label, a large value, an optional
unit, an icon, an accent color, an optional hint, an optional
delta (% change with up/down arrow), and an optional `MiniSparkline`.

**Props:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `label` | string | yes | — | Uppercase, muted-foreground, top of card |
| `value` | string \| number | yes | — | The big number, `tabular-nums` |
| `unit` | string | no | — | Suffix after the value (e.g. `"ms"`) |
| `icon` | `LucideIcon` | yes | — | Rendered in the accent square |
| `accent` | `"emerald" \| "rose" \| "amber" \| "slate" \| "violet" \| "teal"` | no | `"slate"` | Background + text color of the icon square |
| `delta` | `{ value: number; positiveIsGood?: boolean }` | no | — | Shows "+/-N.N% vs prev" with up/down arrow. The arrow color depends on `positiveIsGood`. |
| `spark` | `number[]` | no | — | If length > 1, renders a `MiniSparkline` next to the delta. Sparkline color matches `good`. |
| `hint` | string | no | — | Small muted line under the value |
| `className` | string | no | — | Additional classes on the Card |

**Usage:**
```tsx
import { StatCard } from "@/components/atlas/charts/stat-card";
import { Gauge } from "lucide-react";

<StatCard
  label="Benchmarks"
  value={10}
  icon={Gauge}
  accent="violet"
  hint="10 total runs"
  delta={{ value: 12.5, positiveIsGood: true }}
  spark={[8, 9, 7, 10, 11, 12]}
/>
```

The `accentMap` defines the six accent classes (e.g.
`"bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"`). The
delta logic: `good = (delta.value >= 0) === (positiveIsGood ?? true)`;
if `positiveIsGood` is false (e.g. for "Avg Run" where lower is
better), a positive delta renders in red.

---

## 13. Chart — `mini-sparkline.tsx`

**Path:** `src/components/atlas/charts/mini-sparkline.tsx`
**Purpose:** A tiny inline sparkline. Hand-rolled SVG — 112×32
viewBox, polyline + filled polygon for the area, plus a dot at the
last point. Uses `currentColor` so it inherits text color.

**Props:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `values` | `number[]` | yes | — | At least 2 points; returns `null` if fewer |
| `className` | string | no | — | Apply text color (e.g. `text-emerald-500`) |
| `aria-label` | string | no | `"Sparkline trend"` | For the SVG's `role="img"` |

**Usage:**
```tsx
import { MiniSparkline } from "@/components/atlas/charts/mini-sparkline";

<MiniSparkline values={[5, 7, 4, 8, 6, 9]} className="text-emerald-500 h-8 w-28" />
```

The implementation maps each value to a point in the 112×32 viewBox
with a 2px pad. The polyline uses `strokeLinejoin="round"` and the
area polygon is filled with `currentColor` at opacity 0.12. The
last point gets a small circle (r=2.4).

---

## 14. Chart — `benchmark-bar-chart.tsx`

**Path:** `src/components/atlas/charts/benchmark-bar-chart.tsx`
**Purpose:** Horizontal bar chart showing the latest run duration
per benchmark (lower is better). Used on the dashboard and on the
benchmarks view's "Benchmark comparison" section.

**Props:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `benchmarks` | `Benchmark[]` | yes | — | Filters to those with `latestRunMs !== null`; sorts bars by duration desc. |

**Data shape:** Each `Benchmark` is mapped to `{ name, duration }`
where `duration` is `Number((latestRunMs ?? 0).toFixed(2))`. Bars
with no `latestRunMs` are excluded.

**Responsive behavior:** Uses shadcn's `ChartContainer` with
`className="h-64 w-full"`. The `BarChart` is `layout="vertical"`
(so bars run horizontally), with `YAxis type="category"
dataKey="name" width={120}` and `XAxis type="number" unit="ms"`.
Bars get `radius={[0,4,4,0]}` for rounded right corners and a
`LabelList` on the right showing `N.Nms`.

**Empty state:** returns a centered "No benchmark data yet." div
if all benchmarks have null `latestRunMs`.

**Usage:**
```tsx
import { BenchmarkBarChart } from "@/components/atlas/charts/benchmark-bar-chart";

<BenchmarkBarChart benchmarks={benchmarksQ.data?.data ?? []} />
```

---

## 15. Chart — `capability-radar.tsx`

**Path:** `src/components/atlas/charts/capability-radar.tsx`
**Purpose:** Radar chart of normalized capability scores 0–100.
Used on the dashboard.

**Props:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `capabilities` | `Capability[]` | yes | — | Filtered to numeric capabilities with unit `ms`, `count`, or `s`; sliced to first 8. |
| `max` | number | no | — | Currently unused in the implementation (declared in the interface, not destructured). |

**Data transformation:** for latency capabilities (`unit === "ms"`
or `s`), the score is `1000 / Math.max(value, 1)` so faster = bigger.
For `count` capabilities, the score is the raw value. Each score is
then normalized to 0–100 by dividing by `maxScore` across the
plotted axes. The tooltip shows both the normalized score and the
raw value with its unit.

**Empty state:** returns "Not enough numeric capabilities to
chart." if fewer than 3 capabilities are picked.

**Responsive behavior:** `ChartContainer` with
`className="mx-auto h-64 w-full"`; `RadarChart` with
`outerRadius="72%"`. The `PolarAngleAxis` ticks use 10px font.

**Usage:**
```tsx
import { CapabilityRadar } from "@/components/atlas/charts/capability-radar";

<CapabilityRadar capabilities={capabilitiesQ.data?.data ?? []} />
```

---

## 16. Chart — `limits-severity-pie.tsx`

**Path:** `src/components/atlas/charts/limits-severity-pie.tsx`
**Purpose:** Donut chart showing the count of limits by severity
(critical / warning / info). Used on the dashboard and the limits
view.

**Props:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `limits` | `Limit[]` | yes | — | Counted by severity into `{ critical, warning, info }`. Zero-count slices are filtered out. |

**Colors:** `chartConfig` maps `critical` → `#f43f5e` (rose),
`warning` → `#f59e0b` (amber), `info` → `#64748b` (slate). These
are hardcoded rather than using the `--chart-N` CSS variables
because the three severities have semantic color meanings that
should not shift with the theme.

**Responsive behavior:** `ChartContainer` with
`className="mx-auto h-56 w-full"`; `PieChart` with `innerRadius={48}
outerRadius={80} paddingAngle={2}`. A `ChartLegend` is rendered
below the pie. The total count is shown in a centered text line
under the chart.

**Empty state:** returns "No limits recorded." centered.

**Usage:**
```tsx
import { LimitsSeverityPie } from "@/components/atlas/charts/limits-severity-pie";

<LimitsSeverityPie limits={limitsQ.data?.data ?? []} />
```

---

## 17. Chart — `tools-category-bar.tsx`

**Path:** `src/components/atlas/charts/tools-category-bar.tsx`
**Purpose:** Vertical bar chart showing tool counts per category.
Used on the environment view.

**Props:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `tools` | `Tool[]` | yes | — | Grouped by `category` into `{ total, installed }`. Bars sorted by total desc. |

**Data shape:** A `Map<string, { total, installed }>` is built from
the tools array; the chart plots only the `total` series. The
tooltip distinguishes total vs installed via the formatter.

**Responsive behavior:** `ChartContainer` with `className="h-56
w-full"`; `BarChart` with `XAxis dataKey="category"` and a `YAxis`
that disallows decimals. Bars get `radius={[4,4,0,0]}` for rounded
tops.

**Empty state:** returns "No tools data." centered.

**Usage:**
```tsx
import { ToolsCategoryBar } from "@/components/atlas/charts/tools-category-bar";

<ToolsCategoryBar tools={allToolsForChart.data?.data ?? []} />
```

---

## 18. Chart — `performance-timeline.tsx`

**Path:** `src/components/atlas/charts/performance-timeline.tsx`
**Purpose:** Line chart of a single benchmark's run history
(duration in ms over run number). Used on the benchmarks view's
"Performance history" panel.

**Props:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `runs` | `BenchmarkRun[]` | yes | — | Sorted by `createdAt` asc and indexed 1..N. |

**Data shape:** each run becomes `{ index, createdAt, duration,
success }`. The X-axis is the run index (1-based), the Y-axis is
duration in ms. The tooltip formatter shows the duration and the
run's `createdAt` as a localized string.

**Responsive behavior:** `ChartContainer` with `className="h-56
w-full"`; `LineChart` with `type="monotone"` line, small dots
(r=3), and active dots (r=5). The X-axis has a "Run #" label inside
the bottom.

**Empty state:** returns "No benchmark runs recorded yet. Run a
benchmark to populate this chart." centered.

**Usage:**
```tsx
import { PerformanceTimeline } from "@/components/atlas/charts/performance-timeline";

<PerformanceTimeline runs={detailQ.data?.runs ?? []} />
```

---

## 19. Chart — `boundary-gauge.tsx`

**Path:** `src/components/atlas/charts/boundary-gauge.tsx`
**Purpose:** A semicircle SVG gauge that shows `value` out of `max`
with a hard `limit` marker drawn as a tick. Used on the limits view
for the memory boundary explorer. Hand-rolled SVG (not recharts)
because recharts lacks a semicircle gauge.

**Props:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `value` | number | yes | — | The current requested value (e.g. slider position). Clamped to `[0, max]`. |
| `max` | number | yes | — | The gauge full scale. |
| `limit` | number | yes | — | The hard limit. Drawn as a tick at the corresponding angle. |
| `unit` | string | no | `"MB"` | Suffix for the displayed value and labels. |
| `label` | string | no | `"Memory"` | Used in the `aria-label`. |
| `className` | string | no | — | Wrapper classes. |

**Rendering:** A 280×160 viewBox SVG with the gauge centered at
`(140, 144)`, radius 110. The arc starts at 180° and ends at 0°.
Four arc paths are drawn:
1. The full track in `var(--muted)`.
2. The below-limit portion of the value in `var(--chart-2)`.
3. The over-limit portion of the value (if any) in `#f43f5e`.
4. The remaining within-limit idle in `var(--chart-2)` at opacity
   0.25.
5. The over-limit warning zone (limit → max) in `#f43f5e` at
   opacity 0.25.
A line tick marks the hard limit position. A needle (polygon
+ base circle) points to the current value. A central text shows
the clamped value with unit and the percent of capacity.

**Accessibility:** `role="img"` with a verbose `aria-label`
describing the value, max, limit, and percent.

**Usage:**
```tsx
import { BoundaryGauge } from "@/components/atlas/charts/boundary-gauge";

<BoundaryGauge value={sliderValue} max={8192} limit={memoryLimitMb} unit="MB" label="Memory" />
```

---

## 20. UI helper — `section-card.tsx`

**Path:** `src/components/atlas/ui/section-card.tsx`
**Purpose:** A wrapper Card with optional title, description, and
action node in the header. Used everywhere a view needs a titled
section.

**Props:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `title` | `ReactNode` | no | — | Title in the CardHeader. If absent, no header renders. |
| `description` | `ReactNode` | no | — | Muted text under the title. |
| `action` | `ReactNode` | no | — | Right-aligned node in the header (typically a Button or Badge). |
| `className` | string | no | — | Classes for the outer Card. |
| `contentClassName` | string | no | — | Classes for the CardContent. |
| `children` | `ReactNode` | yes | — | The body content. |

**Usage:**
```tsx
import { SectionCard } from "@/components/atlas/ui/section-card";

<SectionCard title="All benchmarks" description="10 suites registered" action={<Badge>Live</Badge>}>
  <ul>...</ul>
</SectionCard>
```

The header only renders if `title` or `action` is truthy, so a
title-less section is fine.

---

## 21. UI helper — `data-table.tsx`

**Path:** `src/components/atlas/ui/data-table.tsx`
**Purpose:** Generic typed table with optional pagination. Used by
the environment view (tools) and the reports view (reports list).

**Props (generic `<T>`):**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `columns` | `Column<T>[]` | yes | — | Column definitions. Each `{ key, header, cell, className?, width? }`. |
| `data` | `T[]` | yes | — | The rows. |
| `rowKey` | `(row: T, i: number) => string` | yes | — | Stable key extractor. |
| `page` | number | no | `1` | Current 1-based page. |
| `pageSize` | number | no | — | Page size. |
| `total` | number | no | — | Total row count. |
| `onPageChange` | `(page: number) => void` | no | — | If provided, pagination controls render. |
| `empty` | `ReactNode` | no | `"No data."` | Shown in the body when `data.length === 0`. |
| `className` | string | no | — | Table wrapper classes. |

**Pagination:** `totalPages = Math.max(1, Math.ceil(total / pageSize))`.
The footer shows "X–Y of Z" and Prev/Next buttons. The Next
button is disabled when `currentPage >= totalPages`.

**Usage:**
```tsx
import { DataTable, type Column } from "@/components/atlas/ui/data-table";

const columns: Column<Tool>[] = [
  { key: "name", header: "Name", cell: (t) => <span>{t.name}</span> },
  { key: "category", header: "Category", cell: (t) => <Badge>{t.category}</Badge> },
];

<DataTable columns={columns} data={tools} rowKey={(t) => t.id} page={page} pageSize={8} total={total} onPageChange={setPage} />
```

---

## 22. UI helper — `page-header.tsx`

**Path:** `src/components/atlas/ui/page-header.tsx`
**Purpose:** The title row at the top of every view. Renders an `h1`
with the title and a muted description, plus an optional actions
slot (typically a row of buttons).

**Props:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `title` | string | yes | — | The `h1` text. |
| `description` | string | no | — | Muted text under the title. |
| `actions` | `ReactNode` | no | — | A row of buttons/badges on the right (wraps on small screens). |
| `className` | string | no | — | Wrapper classes. |

**Usage:**
```tsx
import { PageHeader } from "@/components/atlas/ui/page-header";

<PageHeader title="Dashboard" description="Real-time overview of agent capabilities." actions={<Button>Run</Button>} />
```

---

## 23. UI helper — `empty-state.tsx`

**Path:** `src/components/atlas/ui/empty-state.tsx`
**Purpose:** Centered dashed-border empty placeholder. Used when a
list or grid is empty (no tools match filters, no limits, no
reports, no environment registered, etc.).

**Props:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `icon` | `ReactNode` | no | — | Optional icon in a muted circle. |
| `title` | string | yes | — | The bold line. |
| `description` | string | no | — | Muted paragraph under the title. |
| `action` | `ReactNode` | no | — | Optional action (e.g. a "Clear filters" button). |
| `className` | string | no | — | Wrapper classes. |

**Usage:**
```tsx
import { EmptyState } from "@/components/atlas/ui/empty-state";
import { Search } from "lucide-react";

<EmptyState icon={<Search className="size-5" />} title="No tools match your filters" description="Try clearing search or category filters." />
```

---

## 24. UI helper — `error-state.tsx`

**Path:** `src/components/atlas/ui/error-state.tsx`
**Purpose:** Centered destructive-bordered error placeholder with an
optional Retry button. Used by every view when its query is in an
error state.

**Props:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `message` | string | no | `"Something went wrong loading this data."` | The bold line. |
| `onRetry` | `() => void` | no | — | If provided, renders a "Retry" button that calls it. |
| `className` | string | no | — | Wrapper classes. |
| `icon` | `ReactNode` | no | `<AlertTriangle />` | Override the icon. |

**Behavior:** the wrapper has `role="alert"`. The retry button
calls `onRetry`; views typically pass `() => query.refetch()`.

**Usage:**
```tsx
import { ErrorState } from "@/components/atlas/ui/error-state";

{query.isError && <ErrorState message="Failed to load tools" onRetry={() => query.refetch()} />}
```

---

## 25. UI helper — `loading-skeleton.tsx`

**Path:** `src/components/atlas/ui/loading-skeleton.tsx`
**Purpose:** Four skeleton components used while queries are
loading. Exports `StatCardSkeleton`, `TableSkeleton`,
`CardGridSkeleton`, `ChartSkeleton`. All use shadcn's `Skeleton`
atom underneath.

**Exports:**

| Component | Props | Renders |
|-----------|-------|---------|
| `StatCardSkeleton` | `className?` | A card-shaped skeleton matching `StatCard`'s layout (label + icon, value, hint). |
| `TableSkeleton` | `rows?: number = 6`, `cols?: number = 4` | A header row + `rows` body rows, each with `cols` skeleton cells. |
| `CardGridSkeleton` | `count?: number = 6`, `className?` | A responsive grid (1/2/3 cols) of card skeletons. |
| `ChartSkeleton` | `className?`, `height?: number = 240` | A skeleton matching a section card with a chart inside. |

**Usage:**
```tsx
import { StatCardSkeleton, ChartSkeleton } from "@/components/atlas/ui/loading-skeleton";

{query.isLoading ? <StatCardSkeleton /> : <StatCard ... />}
{query.isLoading ? <ChartSkeleton height={220} /> : <BenchmarkBarChart ... />}
```

---

## 26. UI helper — `status-badge.tsx`

**Path:** `src/components/atlas/ui/status-badge.tsx`
**Purpose:** Four small badge components for status display.

**Exports:**

| Component | Props | Renders |
|-----------|-------|---------|
| `ToolStatusBadge` | `installed: boolean` | Green "Installed" badge with `CheckCircle2` if installed, red "Missing" with `XCircle` if not. |
| `SeverityBadge` | `severity: LimitSeverity` | Outlined badge with `AlertOctagon`/`AlertTriangle`/`Info` and "Critical"/"Warning"/"Info". Colored rose/amber/slate. |
| `KindBadge` | `kind: string` | Muted outlined badge with the kind string verbatim. |
| `FormatBadge` | `format: string` | Outlined badge with the format uppercased; colored emerald for HTML, amber for JSON, slate for CSV. |

**Usage:**
```tsx
import { ToolStatusBadge, SeverityBadge, FormatBadge } from "@/components/atlas/ui/status-badge";

<ToolStatusBadge installed={t.installed} />
<SeverityBadge severity={l.severity} />
<FormatBadge format="html" />
```

---

## 27. Hooks — `src/hooks/atlas/index.ts`

Eleven React Query hooks plus one mutation. Every query hook uses
the typed `apiGet` helper from `src/lib/api.ts` and returns a
`UseQueryResult<T>` (or `UseMutationResult<T, Error, ...>` for the
mutations).

The query keys all live in the `qk` object and follow the
convention `["atlas", <resource>, <params?>]`:

| Hook | Query key | Params | Returns | Used by |
|------|-----------|--------|---------|---------|
| `useStats()` | `["atlas","stats"]` | none | `Stats` | DashboardView (stat cards), ReportsView (none directly, but invalidated on create) |
| `useEnvironments()` | `["atlas","environments"]` | none | `EnvironmentsResponse` | EnvironmentView (first env), AppFooter (hostname + IP) |
| `useTools(params)` | `["atlas","tools",params]` | `{ q?, category?, installed?, page?, limit? }` | `PaginatedResponse<Tool>` | EnvironmentView (table + chart) |
| `useCapabilities(params)` | `["atlas","capabilities",params]` | `{ category?, environmentId?, page?, limit? }` | `PaginatedResponse<Capability>` | EnvironmentView (caps by category), DashboardView (radar) |
| `useBenchmarks()` | `["atlas","benchmarks"]` | none | `PaginatedResponse<Benchmark>` | DashboardView (bar chart, activity feed), BenchmarksView (list, comparison chart) |
| `useBenchmark(id)` | `["atlas","benchmark",id]` | `id: string \| null \| undefined` (enabled if truthy) | `BenchmarkDetail` | BenchmarksView (selected benchmark's run history) |
| `useLimits(params)` | `["atlas","limits",params]` | `{ severity?, kind?, page?, limit? }` | `PaginatedResponse<Limit>` | DashboardView (pie), LimitsView (list + pie) |
| `useReports()` | `["atlas","reports"]` | none | `PaginatedResponse<Report>` | ReportsView (table) |
| `useRunBenchmark()` | (mutation) | `{ name: string }` | `BenchmarkRun` | BenchmarksView (runner button). On success: invalidates `["atlas","benchmarks"]`, `["atlas","stats"]`, `["atlas"]`. |
| `useCreateReport()` | (mutation) | `CreateReportInput { title, format, parameters? }` | `Report` | ReportsView (form). On success: invalidates `["atlas","reports"]`, `["atlas","stats"]`. |
| `useExport()` | (mutation) | `"csv" \| "json"` | `void` | DashboardView, ReportsView. Triggers a browser download via `apiDownload`. |

**The response-unwrap pattern.** The backend wraps single objects
in `{ data: <object> }` but the seed/list endpoints return arrays
under `data`. The `useBenchmark` and `useRunBenchmark` /
`useCreateReport` hooks defensively unwrap: `res.data ?? res`. This
makes the hooks tolerant to either shape if the backend ever
flattens its responses.

**The `enabled` pattern.** `useBenchmark(id)` sets `enabled: !!id`
so the query does not fire until a benchmark is selected. This is
important — the first paint of the benchmarks view has no selected
id and the query would 404.

**Invalidation.** Both mutations invalidate the broad `["atlas"]`
prefix after a success, so any view that mounted before the
mutation (e.g. the dashboard) will re-fetch on its next focus.

---

## 28. View store — `src/lib/view-store.ts`

**Path:** `src/lib/view-store.ts`
**Purpose:** Two Zustand stores. Neither is persisted; both reset
on refresh.

### `useViewStore`

State shape:

```ts
interface ViewState {
  view: AtlasView;          // "dashboard" | "environment" | "benchmarks" | "limits" | "reports" | "settings"
  setView: (v: AtlasView) => void;
}
```

Initial value: `{ view: "dashboard", setView: ... }`. The store is
created with `create<ViewState>((set) => ({ view: "dashboard",
setView: (v) => set({ view: v }) }))`.

The `AtlasView` union is defined in `src/types/atlas.ts`:

```ts
export type AtlasView =
  | "dashboard"
  | "environment"
  | "benchmarks"
  | "limits"
  | "reports"
  | "settings";
```

**Subscribers:** `atlas-app.tsx` (renders the active view),
`sidebar-nav.tsx` (reads `view`, calls `setView`), `app-header.tsx`
(reads `view` for the breadcrumb), `dashboard-view.tsx` (calls
`setView` to jump to benchmarks/reports).

### `useNotificationPrefs`

State shape:

```ts
interface NotificationPrefs {
  toastOnBenchmarkComplete: boolean;
  toastOnReportReady: boolean;
  toastOnExport: boolean;
  setPref: (k: keyof NotificationPrefs, v: boolean) => void;
}
```

Initial values: all three booleans are `true`. The `setPref`
function does `set({ [k]: v } as Partial<NotificationPrefs>)`.

**Subscribers:** `benchmarks-view.tsx` (toast on run complete),
`reports-view.tsx` (toast on report ready, toast on export),
`settings-view.tsx` (`NotificationControls` switches).

**Usage:**
```tsx
import { useViewStore, useNotificationPrefs } from "@/lib/view-store";

const view = useViewStore((s) => s.view);
const setView = useViewStore((s) => s.setView);
setView("benchmarks");

const prefs = useNotificationPrefs();
prefs.setPref("toastOnExport", false);
```

The selector pattern (`useViewStore((s) => s.view)`) is used instead
of `useViewStore()` to limit re-renders to components that actually
depend on the changed field. The Zustand v5 `create` API takes a
single function and returns a hook; subscribing with a selector
returns just the slice you asked for.

---

## 29. The provider wrappers

Three providers wrap the app at the root layout in
`src/app/layout.tsx`:

- **`ThemeProvider`** (`src/lib/theme-provider.tsx`) — wraps
  `next-themes`'s `NextThemesProvider` with `attribute="class"`,
  `defaultTheme="system"`, `enableSystem`,
  `disableTransitionOnChange`. The class is applied to `<html>`,
  which has `suppressHydrationWarning` set in the layout.
- **`QueryProvider`** (`src/lib/query-provider.tsx`) — creates a
  single `QueryClient` per browser session via
  `useState(() => new QueryClient({...}))`. Default options:
  `{ queries: { staleTime: 30_000, refetchOnWindowFocus: false,
  retry: 1 } }`. Wraps `QueryClientProvider`.
- **`SonnerToaster`** (from `@/components/ui/sonner`) — mounted with
  `position="bottom-right" richColors closeButton` at the root
  layout (outside the views) so toasts work in any view.

These three are mounted once in the root layout, so every view
inherits them. The `AtlasApp` shell additionally wraps its
content in a `TooltipProvider` (`delayDuration={150}`) so
tooltips work across views.

---

## 30. The `cn` helper and shadcn primitives

The `cn` function in `src/lib/utils.ts` is `twMerge(clsx(inputs))`.
Every ATLAS component uses it for conditional classes. The shadcn
primitives in `src/components/ui/` are the generated New York
style: `Button`, `Card`, `Input`, `Select`, `Badge`, `Dialog`,
`Sheet`, `DropdownMenu`, `Slider`, `Switch`, `Separator`, `Label`,
`Table`, `ScrollArea`, `Tooltip`, `Sonner`, etc. ATLAS-specific
components wrap these primitives but never replace them; if a
primitive is missing, the right move is `bunx shadcn add <name>`
rather than hand-rolling one (per
[`contributing.md`](./contributing.md)).

---

## 31. Adding a new view

The recipe (also documented in `contributing.md`):

1. Add the view name to the `AtlasView` union in
   `src/types/atlas.ts`.
2. Create `src/components/atlas/views/<name>-view.tsx` exporting a
   `<Name>View` component.
3. Add a row to `NAV_ITEMS` in `src/components/atlas/layout/sidebar-nav.tsx`
   with a `view`, `label`, `icon`, and `description`.
4. Add a line to the `view === "<name>" && <Name>View` switch in
   `src/components/atlas/atlas-app.tsx`.
5. If the view needs data, add a hook to
   `src/hooks/atlas/index.ts` with a `["atlas", "<resource>", ...]`
   query key. Add a route handler under
   `src/app/api/<resource>/route.ts` if needed.

No router file, no `useSearchParams`, no `next/navigation` import —
the single-page shell handles everything via Zustand. See ADR-09
for the full trade-off discussion.

---

## 32. See also

- [`architecture.md`](./architecture.md) — how the components fit
  into the larger system, including the view navigation sequence
  diagram.
- [`api-reference.md`](./api-reference.md) — the JSON shapes the
  hooks expect; especially the `{ data, total, page, limit }`
  envelope and the `{ data: <object> }` single-object shape.
- [`decisions/adr-03-zustand-view-state.md`](./decisions/) — why
  Zustand over Redux/Context for the view store.
- [`decisions/adr-04-react-query-server-state.md`](./decisions/) —
  why React Query over SWR or bare `useEffect+fetch`.
- [`decisions/adr-05-recharts.md`](./decisions/) — why recharts
  and the two custom SVG charts.
- [`decisions/adr-10-shadcn-new-york.md`](./decisions/) — why
  shadcn New York over the default style or a different component
  library.
