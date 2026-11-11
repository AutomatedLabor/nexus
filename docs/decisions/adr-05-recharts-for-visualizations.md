# ADR 05: recharts for Visualizations

Date: 2026-11-11
Status: Accepted

## Context

ATLAS renders eight distinct chart surfaces across the six views: a
`capability-radar` (radar/spider) on the Dashboard, a
`performance-timeline` (line chart) on Benchmarks, a `benchmark-bar-chart`
(horizontal bars) on Benchmarks, a `tools-category-bar` (vertical bars)
on Environment, a `limits-severity-pie` (donut) on Limits, a
`boundary-gauge` (radial gauge) on Dashboard, and `mini-sparkline` plus
`stat-card` micro-charts on the Dashboard's stat grid. Each chart has
to be responsive (the dashboard is used at 1280 px and 375 px alike),
themeable (light and dark, driven by `next-themes` and Tailwind 4
semantic tokens), and declarative enough that a subagent could write
the component correctly on the first pass without iterative visual
debugging — the latter constraint is sharp because the main-session
Bash tool went down mid-build (see ADR 08), and visual debugging via
screenshot comparison had to be done by a separate verify subagent.

The constraints were five. First, **React-native rendering**: the
charts must be real DOM (SVG) so they re-render with React state
changes, can be styled with CSS variables, and compose with
framer-motion enter animations. Canvas-based libraries don't
integrate with React's reconciler. Second, **declarative JSX**: the
chart spec should be a tree of components (`<BarChart><XAxis/><Bar/>
</BarChart>`) rather than an imperative API (`chart.data(...)`). Third,
**sensible defaults**: a `min`/`max` for each axis, a default tooltip,
a default legend, a default color cycle — so a subagent writing the
chart for the first time doesn't have to tune 20 props to get a
readable result. Fourth, **responsive container**: the chart must
fill its parent and re-render on resize. Fifth, **bundle cost**:
charts are the single biggest bundle contributor after the framework
itself; the choice has to be defensible.

## Decision

Use **recharts 2.x** for all ATLAS visualizations. Each chart is a
dedicated component under `src/components/atlas/charts/`:
`stat-card.tsx`, `mini-sparkline.tsx`, `capability-radar.tsx`,
`performance-timeline.tsx`, `benchmark-bar-chart.tsx`,
`tools-category-bar.tsx`, `limits-severity-pie.tsx`,
`boundary-gauge.tsx`. Each chart wraps its content in
`<ResponsiveContainer width="100%" height={N}>` so it fills its parent
`<SectionCard>` and re-renders on viewport resize. Colors are read
from Tailwind 4 CSS variables (`--chart-1` through `--chart-5`) so
the same chart re-themes when `next-themes` flips light/dark. The
`<Tooltip>` and `<Legend>` use the shadcn/ui `ChartContainer` +
`ChartTooltip` wrapper from `src/components/ui/chart.tsx` for a
consistent look with the rest of the dashboard. Enter animations
are recharts' defaults (no framer-motion wiring on the chart itself);
the surrounding `<SectionCard>` uses framer-motion for the card-level
fade-in.

## Alternatives Considered

- **visx (by Airbnb)** — lower-level, fully composable, ~30 KB
  gzipped for the components ATLAS would use. Rejected because visx
  is "bring your own axis, bring your own tooltip, bring your own
  legend" — a subagent writing the first chart would have shipped 200
  lines of axis/tooltip plumbing instead of 20 lines of `<BarChart>`.
  The right tool for a design-system team; the wrong tool for a
  degraded-tools build regime.
- **D3 directly** — the gold standard for custom viz. Rejected
  because D3 is imperative (`d3.select(...).data(...).enter()`) and
  doesn't integrate with React's reconciler — every chart would be a
  `useEffect` + `useRef` + manual SVG manipulation, which is harder to
  theme and harder for a subagent to write correctly the first time.
- **nivo** — beautiful defaults, more chart types than recharts, but
  heavier (~80 KB for the components ATLAS would use) and the
  responsive-container story is less ergonomic. Rejected on bundle
  cost.
- **chart.js + react-chartjs-2** — canvas-based, fast for large
  datasets, but canvas charts can't be styled with CSS variables and
  don't compose with framer-motion. Rejected because ATLAS charts are
  small (max 10 data points per benchmark bar) and the theming cost
  outweighs the perf benefit.
- **Plotly.js** — feature-rich but ~3 MB; absurd for this use case.
  Rejected.
- **Apache ECharts** — powerful, but the React wrapper
  (`echarts-for-react`) hides a canvas under the hood and the theming
  story is awkward. Rejected.

## Consequences

**Positive.** Every chart is a real DOM/SVG tree that re-renders with
React state, themes with CSS variables, and composes with the
shadcn/ui `ChartContainer` wrapper. The declarative JSX meant a
subagent wrote each of the 8 chart components correctly on the first
pass — `capability-radar.tsx`, `boundary-gauge.tsx`, and the others
all rendered correctly without iterative visual debugging on the main
session. The `<ResponsiveContainer>` means charts work at 375 px and
1280 px with no media queries. Bundle cost is ~95 KB gzipped for all
of recharts, which is non-trivial but defensible given the dashboard
is chart-heavy.

**Negative.** recharts' performance degrades above ~1000 data points
(it renders every SVG element; no canvas fallback). ATLAS charts max
out at 10 data points (one bar per benchmark), so this is a non-issue
here but would be a hard blocker for a chart of 10k+ rows. The
`<ResponsiveContainer>` sometimes renders at height 0 on the first
pass if the parent has no explicit height; the `<SectionCard>`
wrapper gives a fixed min-height to work around this. The
TypeScript types in recharts 2 are loose (a lot of `any`), which
means type errors in chart props don't always surface at compile
time — mitigated by the `tsc --noEmit` gate in the PR checklist.

**Neutral.** recharts 2 is the current major; recharts 3 is in alpha
and changes the `<XAxis dataKey>` ergonomics. The team will re-evaluate
on recharts 3 stable. The `--chart-1` through `--chart-5` color tokens
are defined once in `globals.css` and shared by every chart.
