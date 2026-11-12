# Aether stdlib — `disjoint-set`

A **disjoint-set forest** (a.k.a. **union-find**): a partition of
a universe of elements into disjoint groups. Two operations are
the workhorses:

- `dsFind(x)` returns the *representative* of the group containing
  `x`. Two elements are in the same group iff their `dsFind`
  results are equal.
- `dsUnion(x, y)` merges the groups containing `x` and `y` (a
  no-op if they're already together).

## Why union-find?

Union-find is the algorithm of choice whenever you have to track
"which things are connected to which" in a way that's symmetric
and transitive but doesn't form a tree you'd want to traverse.
Classic applications:

- **Connected components in an undirected graph**: feed every
  edge into `dsUnion`; the number of components is `dsComponents`.
- **Kruskal's minimum spanning tree**: sort edges by weight, take
  each edge iff `dsUnion(u, v)` returns `true` (i.e., the
  endpoints were not already connected).
- **Type inference in compilers**: union-find on type variables
  to maintain equivalence classes during unification.
- **Percolation / network reachability**: open a site, union it
  with its open neighbours, ask whether the top is connected to
  the bottom.
- **Dynamic equivalence**: in a build system, "is file A in the
  same compilation unit as file B?" — every `#include` is a union.
- **Lowest common ancestor (Tarjan's offline algorithm)**: a
  classic union-find application.
- **Image segmentation**: pixels are elements, neighbouring
  pixels with similar colours get unioned; final groups are the
  segments.

A naïve implementation (each group is an array; `union` copies
elements from one array to another) is O(n) per union. Union-find
gets this down to O(α(n)) — the inverse Ackermann function, which
is less than 5 for any input you'll ever see in practice. That's
"effectively constant" per operation.

## The two optimisations

Union-find's near-constant complexity comes from two complementary
optimisations:

1. **Path compression** in `dsFind`: every time we walk from `x`
   up to its root, we re-point every node along the way directly
   to the root. The next `dsFind` from any of those nodes is O(1).
2. **Union by rank** in `dsUnion`: when merging two groups, we
   attach the *shorter* tree under the *taller* one (so the tree
   height never grows unless both are equally tall). This keeps
   the worst-case tree height at O(α(n)).

Either optimisation alone gives O(log n); together they give
O(α(n)). The implementation here applies both.

## Construction

```typescript
import * as DS from "aether/stdlib/disjoint-set";

const ds = DS.dsNew();
DS.dsMake(ds, "a");
DS.dsMake(ds, "b");
DS.dsMake(ds, "c");
// Now three singletons: {a}, {b}, {c}.
DS.dsUnion(ds, "a", "b");
// Now two groups: {a, b}, {c}.
```

`dsNew` returns a fresh empty disjoint-set. `dsMake(ds, x)` adds
`x` as a new singleton. Returns `true` if `x` was new, `false` if
already present.

## Finding and merging

```typescript
// Find: returns the representative of x's group.
DS.dsFind(ds, "a");   // -> "a" (or "b" — whichever is the root)
DS.dsFind(ds, "b");   // -> same as dsFind(ds, "a")

// Are two elements in the same group?
DS.dsConnected(ds, "a", "b");  // true
DS.dsConnected(ds, "a", "c");  // false

// Merge another element.
DS.dsUnion(ds, "b", "c");
DS.dsConnected(ds, "a", "c");  // true (transitive)
```

`dsUnion` returns `true` if a merge actually happened (the two
were in different groups before), `false` if they were already
together. Calling `dsUnion` on unknown elements auto-registers
them as singletons first (transparent to the caller — equivalent
to calling `dsMake` on each).

## Implicit singletons

`dsFind(ds, x)` for an unknown element `x` returns `x` itself —
treating `x` as an implicit singleton that's never been added to
the universe. This means `dsConnected(ds, x, x)` is always `true`
and `dsConnected(ds, x, y)` for two distinct unknowns is always
`false`.

This is convenient: you don't have to pre-register every possible
element. Just call `dsUnion`/`dsConnected` and let the set grow
lazily. The trade-off is that `dsCount` (the universe size) only
counts *registered* elements — implicit singletons don't bump it.

## Size, count, components

```typescript
DS.dsCount(ds);       // universe size (registered elements)
DS.dsComponents(ds);  // number of disjoint groups
DS.dsSize(ds, x);     // size of x's group (1 for unknown x)
```

After N `dsMake` calls (and no unions), `dsCount == N` and
`dsComponents == N`. Each successful `dsUnion` decreases
`dsComponents` by 1. `dsSize` walks to the root and reads its
`size` field (which is maintained by `dsUnion`).

## Reset and inspect

`dsReset(ds)` clears the set back to empty. `dsToString(ds)`
returns a human-readable rendering of the partition: each group
is `{a, b, c}` (sorted, JSON-stringified elements), multiple
groups are comma-separated. An empty set renders as `{}`.

```typescript
const ds = DS.dsNew();
DS.dsUnion(ds, 1, 2);
DS.dsUnion(ds, 2, 3);
DS.dsUnion(ds, "x", "y");
DS.dsToString(ds);  // -> "{1, 2, 3}, {\"x\", \"y\"}"
```

## Performance

| Operation | Amortised | Worst-case (with both optimisations) |
|-----------|-----------|--------------------------------------|
| `dsNew` | O(1) | O(1) |
| `dsMake` | O(1) | O(1) |
| `dsFind` | O(α(n)) | O(α(n)) |
| `dsUnion` | O(α(n)) | O(α(n)) |
| `dsConnected` | O(α(n)) | O(α(n)) |
| `dsCount` | O(1) | O(1) |
| `dsComponents` | O(1) | O(1) |
| `dsSize` | O(α(n)) | O(α(n)) |
| `dsReset` | O(n) | O(n) |
| `dsToString` | O(n log n) | O(n log n) — sorting within groups |

`α(n)` is the inverse Ackermann function: less than 5 for any
practical `n` (specifically, for `n` ≤ 2^65536).

## API

| Function | Signature | Description |
|----------|-----------|-------------|
| `dsNew` | `() -> DisjointSet` | Create a fresh empty disjoint-set. |
| `dsMake` | `(ds, x) -> bool` | Add x as a new singleton; true if new, false if already present. |
| `dsFind` | `(ds, x) -> any` | Representative of x's group; x itself if unknown. |
| `dsUnion` | `(ds, x, y) -> bool` | Merge x's and y's groups; true if merged, false if already same. |
| `dsConnected` | `(ds, x, y) -> bool` | True if x and y are in the same group. |
| `dsCount` | `(ds) -> int` | Universe size (number of registered elements). |
| `dsComponents` | `(ds) -> int` | Number of disjoint groups. |
| `dsSize` | `(ds, x) -> int` | Size of x's group. |
| `dsReset` | `(ds) -> void` | Reset to empty. |
| `dsToString` | `(ds) -> string` | Human-readable rendering of the partition. |

## Validation

All functions throw a plain `Error` on invalid input (non-set,
non-map fields, missing numbers); the Aether evaluator converts
thrown errors into Aether panics.
