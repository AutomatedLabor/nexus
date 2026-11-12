# topo_sort_courses.ae

Topological sort of course prerequisites using Kahn's algorithm.
Each course may require one or more other courses first. We count
incoming edges, queue nodes with zero in-degree, pop and emit them,
decrement neighbors, repeat. If we emit fewer than the total node
count, the graph has a cycle.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`topo_sort(n, adj)`** — the algorithm:
   - `adj[u]` = list of courses that depend on `u` (u is a prereq).
   - Compute in-degrees by scanning every adjacency list.
   - Initialize a FIFO queue with all zero-in-degree nodes.
   - Pop a node, append to output, decrement each neighbor's
     in-degree, push to queue when it hits zero.
   - If the output size equals `n`, return the order; otherwise
     return `[]` (cycle).
3. **Driver** — defines a 7-course graph (Intro -> DS -> Algorithms
   -> Compilers; DS -> Databases -> OS; Intro -> Networks),
   runs `topo_sort`, and prints the order with course names. Then
   verifies cycle detection on a 3-cycle graph.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/topo_sort_courses.ae
```

## Key language features

- **Adjacency list as `[[int]]`** — Aether supports nested array
  types and indexing into them.
- **FIFO queue via array + `head` pointer** — we don't shrink
  the array, just advance `head`. This is the canonical pattern
  for Aether (avoids `O(n^2)` pop-from-front).
- **`while head < len(queue)`** — canonical Aether iteration
  pattern that sidesteps the for-loop-scope bug.
- **Forward reference**: `order_len` is called before it's
  declared — Aether's top-level function declarations are
  hoisted.

## Expected output

```
== Topological sort: course prerequisites ==

course graph has 7 nodes, 6 edges
  1. Intro to CS
  2. Data Structures
  3. Networks
  4. Algorithms
  5. Databases
  6. Compilers
  7. Operating Systems

cyclic graph topo sort: [] (empty = cycle detected)

All assertions passed.
```

## Design notes

- The output order respects all prerequisites: e.g.,
  `Intro to CS` comes first, `Compilers` comes after `Algorithms`
  (which requires `Data Structures`, which requires `Intro`).
- Kahn's algorithm produces a *valid* topological order, not a
  unique one. Changing the order in which zero-in-degree nodes
  are inserted into the queue changes the output (the algorithm
  picks nodes in FIFO order here).
- The cycle-detection assertion confirms that a 3-node ring
  (`0 -> 1 -> 2 -> 0`) returns `[]`.
- The `order_len` helper at the bottom is forward-referenced;
  Aether hoists top-level `fn` declarations, so this is fine.
