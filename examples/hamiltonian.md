# hamiltonian.ae

Find a Hamiltonian path in a directed graph via backtracking. A Hamiltonian path visits every node exactly once. The recursion-style algorithm tries each unvisited neighbor of the current node; if we reach depth `n`, we've found a path. The v1 evaluator has a recursion limit, so we drive the backtracking with an explicit stack of `[node, child_idx]` frames.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`hamiltonian(adj, n, start)`**:
   - `visited[start] = 1`, `path = [start]`, `frames = [[start, 0]]`.
   - Loop while frames isn't empty and path length < n:
     - Look at the top frame `[v, ci]`. Scan `adj[v]` from `ci` for an unvisited `w`.
     - Found one → push `[w, 0]`, mark `visited[w]`, advance `path`.
     - None → backtrack: un-visit `v`, pop `path`, pop `frames`.
   - Returns `path` if found, else `[]`.
3. **Driver** — prints a Hamiltonian path from node 0 and tries every starting node.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/hamiltonian.ae
```

## Key language features

- **Iterative backtracking** — explicit frame stack avoids the recursion limit. Each frame stores the next child index to try, so we can resume on backtrack.
- **`while` for every loop** — no `for in` (the for-loop-scope quirk).
- **`if cond { ... };` after if-else** — required when followed by another statement.

## Expected output

```
== Hamiltonian path (backtracking) ==

graph (adjacency list):
  0: [1, 3]
  1: [2, 3]
  2: [4]
  3: [1, 4]
  4: [2]

Hamiltonian path from 0: 0 -> 1 -> 3 -> 4 -> 2

starting from each node:
  start 0: 0 -> 1 -> 3 -> 4 -> 2
  start 1: no path
  start 2: no path
  start 3: no path
  start 4: no path

All assertions passed.
```

## Design notes

- The graph is small (5 nodes) but Hamiltonian path is NP-complete in general; the backtracking is exponential. For larger graphs, use heuristic search (e.g., A* with a heuristic).
- For undirected Hamiltonian path on this graph, we'd need symmetric edges; here we use directed edges.
- The safety counter (`max_safety = 100000`) bounds the search even if the algorithm goes wrong.
- A Hamiltonian *cycle* would additionally require an edge from the last node back to the start; that's one extra check.
