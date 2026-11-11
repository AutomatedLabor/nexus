# ADR-04 — Recharts for benchmark viz

> Status: Accepted
> Date: 2023-10-01
> Decision-maker: Aether playground team
> Supersedes: none
> Superseded by: none

## Context

The Aether playground has a Benchmarks view that runs a set of small benchmark programs and shows the elapsed milliseconds and step counts. The six canned benchmarks (`fib-20`, `fib-25`, `sum-500k`, `str-concat`, `array-build`, `factorial-100`) are defined in `src/components/playground/views/benchmarks-view.tsx`. The view runs each one via `runAether(b.code, { maxSteps: 50_000_000 })` and collects a `BenchmarkResult[]` with `elapsedMs`, `steps`, `ok`, and `error`.

The question was: how to visualize the results?

The visualization needs were:

- Bar charts comparing step counts across benchmarks.
- Bar charts comparing elapsed milliseconds across benchmarks.
- A way to show the relative cost of different operations (function call, pattern match, string concat).
- Interactive (hover to see exact numbers).
- Styled consistently with the rest of the playground (Tailwind, shadcn/ui).
- Browser-runnable, no server component.
- Re-renders efficiently when the user re-runs the benchmarks.

## Decision

**The Aether playground uses Recharts for benchmark visualization.** Recharts is a React-based charting library built on D3. It provides declarative chart components (`<BarChart>`, `<LineChart>`, `<PieChart>`) that compose with React's component model.

The Benchmarks view uses Recharts' `<BarChart>` with a `<CartesianGrid>`, `<XAxis>`, `<YAxis>`, `<Tooltip>`, `<Legend>`, and `<Bar>` for the data. Two bars are rendered per benchmark: one for elapsed milliseconds, one for steps. The `<Bar>` color is set per data point via the `<Cell>` component (so the user can see at a glance which benchmarks succeeded vs. failed).

## Alternatives considered

### D3 directly

D3 is the most powerful visualization library, but it is imperative — you write code that manipulates the DOM directly. This fights with React's declarative model. Recharts gives you the power of D3 with React's component model, at the cost of some flexibility. For our use case (bar charts), the flexibility loss is fine. D3 directly would also require manual scaling, axis calculation, and tooltip implementation — each of which is a 20-line function that Recharts gives us for free.

### Chart.js

Chart.js is a popular canvas-based charting library. It is fast and produces good-looking charts. The downsides: it uses canvas, not SVG, which means the charts do not scale as cleanly and the interactivity (hover, click) is harder to wire to React state. Recharts' SVG output is easier to style with CSS and easier to make accessible. Chart.js also has its own animation loop that can fight with React's render cycle.

### visx

visx is Airbnb's collection of low-level visualization primitives. It is more flexible than Recharts (you compose primitives, not pre-built charts) but also more verbose. For our use case (standard bar charts), the verbosity was not worth the flexibility. visx is the right choice when you have unusual chart types that Recharts doesn't have built-in; we don't.

### nivo

nivo is another React-based charting library, similar in spirit to Recharts. It has more chart types and a more opinionated design system. The downsides: it is larger (~200 KB), has a steeper learning curve, and is less actively maintained than Recharts. Recharts hits the sweet spot for our needs.

### Hand-rolled SVG

We could have written the bar chart by hand in SVG. For a single chart, this is feasible — maybe 100 lines of React + SVG. But it does not scale: every new chart type would be another 100 lines, and the interactivity (tooltips, hover states) is non-trivial to get right. A library pays for itself after the second chart.

## Consequences

### Positive

- **Declarative.** The chart is React components; you describe what you want, Recharts figures out how to render it. This is the React way.
- **Composable.** You combine `<BarChart>` with `<CartesianGrid>`, `<XAxis>`, `<YAxis>`, `<Tooltip>`, `<Bar>`, `<Cell>` etc. Each piece is independent and replaceable.
- **SVG output.** The charts are SVG, which means they scale cleanly, are accessible (with appropriate ARIA attributes), and can be styled with CSS.
- **Interactive out of the box.** Tooltips, hover states, click handlers are built-in.
- **Small.** Recharts is ~50 KB gzipped, which is fine for a playground that already ships Next.js, React, Tailwind, and shadcn/ui.
- **Re-renders efficiently.** When the user re-runs the benchmarks, the chart re-renders with the new data — Recharts handles the diff internally.

### Negative

- **One more dependency.** Recharts is a peer of Zustand (see [../decisions/adr-03-zustand-for-view-state.md](adr-03-zustand-for-view-state.md)) — small but real.
- **Bundle size.** 50 KB gzipped is not nothing. The playground could lazy-load Recharts (only load it when the Benchmarks view is opened) to keep the initial bundle small. v1 does not do this; v2 should.
- **Some flexibility loss.** Recharts' built-in charts cover 90% of use cases. For the remaining 10% (custom animations, unusual chart types), you would need visx or D3 directly. We have not hit this.
- **Version churn.** Recharts is actively developed; major versions sometimes break the API. We pin to a specific version in `package.json` (`recharts: ^2.15.4` at time of writing).

## Mitigations

- The Benchmarks view is one page; if Recharts proves limiting, we can swap it for visx or D3 on that page without affecting the rest of the playground.
- The benchmark data is just a list of `{ id, label, description, elapsedMs, steps, ok, error }` objects; the chart is a thin layer over the data. Swapping the chart library is a few hours of work.
- The `package.json` pins Recharts to a specific minor version, so patch updates don't break the build.

## Reversibility

The decision is **easily reversible**. The benchmark data is plain TypeScript objects; the chart is a thin React component. Swapping Recharts for another library is a mechanical refactor of the Benchmarks view, not a rewrite.

## Cross-references

- [../decisions/adr-03-zustand-for-view-state.md](adr-03-zustand-for-view-state.md) — the sibling decision for state.
- [../tutorials/tooling.md](../tutorials/tooling.md) § 6 — the Benchmarks view tour, including the six canned benchmarks.
- [../tutorials/performance.md](../tutorials/performance.md) § 4 — what the benchmarks measure and why.
