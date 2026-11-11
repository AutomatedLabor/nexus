# topological_sort.ae

Topological sort of a small directed acyclic graph (DAG).
DFS-based: do a post-order traversal, then reverse the post-
order to get a topological order (a linear order in which
every edge `u -> v` has `u` before `v`).

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`reverse_int(arr)`** — reverse a `[int]` into a fresh
   array (we walk back to front).
3. **`topo_sort(graph, n)`** — the algorithm:
   - The nested `visit(u)` helper recurses into all
     neighbors before pushing `u` onto `order` (true
     post-order).
   - We visit every node `0..n-1` in case the graph is
     disconnected.
   - Finally, reverse the post-order to get a valid
     topological order.
4. **Driver** — runs the algorithm on two small DAGs and
   prints edges + topological order for each.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/topological_sort.ae
```

## Key language features

- **Nested recursive function** `visit(u)` inside
  `topo_sort` — closes over `visited` and `order` from the
  enclosing scope, mutating both. This is the canonical
  pattern for DFS-style algorithms in Aether.
- **`while` loops** for both the iteration over all nodes
  and the inner neighbor walk.
- **`reverse_int` helper** to flip the post-order array.

## Expected output

```
== Topological sort ==

edges:
  0 -> 1
  0 -> 2
  1 -> 3
  2 -> 3
  3 -> 4

topological order: 0 -> 2 -> 1 -> 3 -> 4

second DAG: 0 -> 2 -> 4 -> 1 -> 3 -> 5

All assertions passed.
```

## Design notes

- DFS-based topo sort works because of the key insight:
  if there's an edge `u -> v`, then `v` finishes before
  `u` in the DFS (since `u` must finish its child `v`
  before it itself finishes). So reversing the post-
  order places `u` before `v` in the output.
- For our graph `0 -> 1, 0 -> 2, 1 -> 3, 2 -> 3, 3 -> 4`,
  the visit order from node 0 is: 0 -> 1 -> 3 -> 4 (post:
  4, 3, 1), then back to 0, then 2 -> 3 (already visited)
  -> 4 (already visited), so post for 2 is just (2), then
  finally post for 0 is (0). Full post-order is
  `[4, 3, 1, 2, 0]`; reversed is `[0, 2, 1, 3, 4]`.
- An alternative is Kahn's algorithm (iteratively remove
  nodes with in-degree 0). DFS-based is shorter and
  recursive; both are valid.
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
