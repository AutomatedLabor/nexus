# ADR-03 — Zustand for view state

> Status: Accepted
> Date: 2023-10-01
> Decision-maker: Aether playground team
> Supersedes: none
> Superseded by: none

## Context

The Aether playground is a Next.js app with a single page:
an editor pane, an output pane, and an inspector with
tabs for Tokens, AST, Type errors, and Steps. The page has
view state that changes over time:

- the current source string (the editor's value),
- the compile result (the last `compileAndRun(source)`
  output, which has tokens, AST, type errors, runtime),
- the currently selected Inspector tab,
- the currently selected example program (for the
  examples dropdown),
- the share URL (when the user clicks Share),
- any UI flags (dark mode, font size, etc.).

The Next.js app already had React for rendering. The
question was: how to manage this view state?

The options were:

1. **useState / useReducer in the top-level component.** The
   standard React approach. The state lives in the
   component; child components get it via props or context.
2. **Redux.** The heavyweight standard. A single store,
   actions, reducers. Lots of boilerplate, but well-known
   and tool-supported.
3. **Zustand.** A small (~1 KB) library that provides a
   single store with `get`/`set` semantics. No actions,
   no reducers, no boilerplate. Hooks subscribe to slices
   of the store.
4. **Recoil / Jotai.** Atom-based state management. Each
   piece of state is an atom; components subscribe to
   atoms. More granular than Zustand, more boilerplate.

The playground's view state is a single shape: it is not
split across many independent atoms, and it is not so
complex that a reducer pattern pays for itself. The
state changes are simple: "set source", "set compile
result", "set selected tab".

## Decision

**The Aether playground uses Zustand for view state.** The
store is a single object with the source, the compile
result, the selected tab, and any UI flags. Components
subscribe to slices via Zustand's `useStore` hook with a
selector.

The store lives in `src/app/store.ts` (planned; not in v1's
source tree yet, but the decision is to use Zustand when
state grows beyond the trivial). For v1, the state is small
enough that `useState` would also work; Zustand is the
forward choice.

## Alternatives considered

### useState / useReducer

Fine for small state. For the playground, the state fits in
maybe 10 fields; `useState` would mean threading 10 props
through 5 levels of components, or building a context.
Zustand is a smaller change to the codebase and gives us
the same effect with less boilerplate.

### Redux

Too heavy for the playground's needs. The action/reducer
pattern pays for itself when you have many independent
update paths, complex state shapes, or strict devtool
requirements. The playground has none of these. Redux
would add ~100 lines of boilerplate for no benefit.

### Recoil / Jotai

Atom-based state is good for very granular state (think:
a spreadsheet with 1000 cells). The playground's state is
coarse (one source string, one compile result, one tab).
Atom-based is overkill.

## Consequences

### Positive

- **Small.** Zustand is ~1 KB; the store is ~50 lines.
- **No boilerplate.** No actions, no reducers, no
  thunks. You define a store with a few fields and setter
  functions; you read it with `useStore(s => s.field)`.
- **React-friendly.** Zustand is built on hooks. The
  integration with React is seamless.
- **Devtools.** Zustand has a Redux DevTools integration
  that lets you inspect the store, time-travel, etc.
- **Forward-compatible.** If the state grows more complex,
  Zustand scales: you can split the store, add selectors,
  use middleware. We do not have to migrate to Redux later.

### Negative

- **One more dependency.** Zustand is small, but it is
  still a dependency. The playground already has Next.js,
  React, Tailwind, shadcn/ui, Recharts (for the Benchmarks
  view). Adding Zustand is one more thing to maintain.
- **Less familiar.** Redux is the standard; some
  contributors will not know Zustand. The docs are good,
  though, and the API is small.

## Mitigations

- The playground's state shape is documented in
  [../tutorials/tooling.md](../tutorials/tooling.md) §2.
- The Zustand store lives in a single file
  (`src/app/store.ts`), so it is easy to find and read.
- If Zustand ever feels too limiting, the migration to
  Redux is mechanical (the store shape stays the same;
  the actions and reducers are derived).

## Reversibility

The decision is **easily reversible**. The state shape
does not depend on Zustand; switching to Redux or
useReducer would be a refactor, not a rewrite. The
forward-compatible choice means we do not have to revisit
this decision later.

## Cross-references

- [../decisions/adr-04-recharts-for-benchmark-viz.md](adr-04-recharts-for-benchmark-viz.md)
  — a sibling decision for the Benchmarks view.
- [../decisions/adr-07-single-playground-route.md](adr-07-single-playground-route.md)
  — the routing decision for the playground.
- [../tutorials/tooling.md](../tutorials/tooling.md) §2 —
  the playground UI tour.
