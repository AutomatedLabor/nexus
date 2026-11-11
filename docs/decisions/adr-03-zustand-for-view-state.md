# ADR-03 — Zustand for view state

> Status: Accepted
> Date: 2023-10-01
> Decision-maker: Aether playground team
> Supersedes: none
> Superseded by: none

## Context

The Aether playground is a Next.js app with a single page. The page has view state that changes over time:

- the current view (Playground, Examples, Stdlib, Benchmarks, Explorer, About),
- the current source string (the editor's value),
- a `codeVersion` counter that bumps whenever new code is loaded from Examples / Share URL, so the playground editor can re-sync its textarea,
- the currently selected example program (for the Examples view),
- the share URL (when the user clicks Share),
- any UI flags (theme, font size, etc.).

The Next.js app already had React for rendering. The question was: how to manage this view state?

The options were:

1. **useState / useReducer in the top-level component.** The standard React approach. The state lives in the component; child components get it via props or context.
2. **Redux.** The heavyweight standard. A single store, actions, reducers. Lots of boilerplate, but well-known and tool-supported.
3. **Zustand.** A small (~1 KB) library that provides a single store with `get`/`set` semantics. No actions, no reducers, no boilerplate. Hooks subscribe to slices of the store.
4. **Recoil / Jotai.** Atom-based state management. Each piece of state is an atom; components subscribe to atoms. More granular than Zustand, more boilerplate.

The playground's view state is a single shape: it is not split across many independent atoms, and it is not so complex that a reducer pattern pays for itself. The state changes are simple: "set view", "load code", "switch to playground view".

## Decision

**The Aether playground uses Zustand for view state.** The store is a single object with `view`, `code`, `codeVersion`, and `setView`/`loadCode` actions. Components subscribe to slices via Zustand's `useStore` hook with a selector.

The store lives in `src/lib/view-store.ts` — a 77-line file that defines the `ViewState` interface, the `ViewId` union (`"playground" | "explorer" | "stdlib" | "examples" | "benchmarks" | "about"`), the `DEFAULT_CODE` constant (the opening program shown when the playground first loads), and the `useViewStore` Zustand store itself.

The store's API is:

```ts
export interface ViewState {
  view: ViewId;
  code: string;
  codeVersion: number;
  setView: (v: ViewId) => void;
  loadCode: (code: string, switchToPlayground?: boolean) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  view: "playground",
  code: DEFAULT_CODE,
  codeVersion: 0,
  setView: (v) => set({ view: v }),
  loadCode: (code, switchToPlayground = true) =>
    set((s) => ({
      code,
      codeVersion: s.codeVersion + 1,
      view: switchToPlayground ? "playground" : s.view,
    })),
}));
```

Components consume it like this:

```tsx
const view = useViewStore((s) => s.view);
const loadCode = useViewStore((s) => s.loadCode);
```

The selector-based access means a component re-renders only when the slice it reads changes — no prop drilling, no unnecessary re-renders.

## Alternatives considered

### useState / useReducer

Fine for small state. For the playground, the state fits in maybe 6 fields; `useState` would mean threading props through 5 levels of components (sidebar → header → view → editor → toolbar), or building a context. Zustand is a smaller change to the codebase and gives us the same effect with less boilerplate.

### Redux

Too heavy for the playground's needs. The action/reducer pattern pays for itself when you have many independent update paths, complex state shapes, or strict devtool requirements. The playground has none of these. Redux would add ~100 lines of boilerplate (action types, action creators, reducer, `useSelector` boilerplate) for no benefit. Redux Toolkit would shrink that, but it still requires you to think in the Redux mental model.

### Recoil / Jotai

Atom-based state is good for very granular state (think: a spreadsheet with 1000 cells, or a form with 50 fields). The playground's state is coarse (one source string, one view ID, one code version counter). Atom-based is overkill — you'd have an atom for each of 3 pieces of state, plus derived atoms for the parts that depend on them. Zustand's single-store model is simpler.

### React Context + useReducer

This would work — it's the React-builtin alternative. The downside: every consumer of the context re-renders on every context change (unless you split into multiple contexts). Zustand's selector-based subscription avoids that automatically. The Zustand API is also smaller than `useReducer` + `useContext` + the action dispatchers.

## Consequences

### Positive

- **Small.** Zustand is ~1 KB; the store is ~50 lines.
- **No boilerplate.** No actions, no reducers, no thunks. You define a store with a few fields and setter functions; you read it with `useStore(s => s.field)`.
- **React-friendly.** Zustand is built on hooks. The integration with React is seamless — `useViewStore` is just a hook.
- **Selector-based subscriptions.** Components re-render only when the slice they read changes. No prop drilling, no unnecessary re-renders, no `useMemo` gymnastics.
- **Devtools.** Zustand has a Redux DevTools integration that lets you inspect the store, time-travel, etc. — useful for debugging the share-URL flow.
- **Forward-compatible.** If the state grows more complex, Zustand scales: you can split the store, add selectors, use middleware. We do not have to migrate to Redux later.

### Negative

- **One more dependency.** Zustand is small, but it is still a dependency. The playground already has Next.js, React, Tailwind, shadcn/ui, Recharts. Adding Zustand is one more thing to maintain.
- **Less familiar.** Redux is the standard; some contributors will not know Zustand. The docs are good, though, and the API is small.
- **Single store can grow.** As the playground's UI gets more complex, the single Zustand store may grow into a god object. The mitigation is to split into multiple stores when that happens.

## Mitigations

- The playground's state shape is documented in [../tutorials/tooling.md](../tutorials/tooling.md) § 8 (the tech stack).
- The Zustand store lives in a single file (`src/lib/view-store.ts`), so it is easy to find and read. The whole store is 77 lines, including the `DEFAULT_CODE` constant.
- If Zustand ever feels too limiting, the migration to Redux is mechanical (the store shape stays the same; the actions and reducers are derived).

## Reversibility

The decision is **easily reversible**. The state shape does not depend on Zustand; switching to Redux or useReducer would be a refactor, not a rewrite. The forward-compatible choice means we do not have to revisit this decision later.

## Cross-references

- [../decisions/adr-04-recharts-for-benchmark-viz.md](adr-04-recharts-for-benchmark-viz.md) — a sibling decision for the Benchmarks view.
- [../decisions/adr-07-single-playground-route.md](adr-07-single-playground-route.md) — the routing decision for the playground.
- [../tutorials/tooling.md](../tutorials/tooling.md) § 8 — the playground UI tour and tech stack.
