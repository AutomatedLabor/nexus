# tarjan_scc.ae

Tarjan's algorithm for finding strongly connected components (SCCs) in a directed graph. A single DFS assigns each node a discovery `index` and a `lowlink`; when a node's index equals its lowlink, it's the root of an SCC, and we pop the SCC from the stack. We use an **iterative DFS** with an explicit stack of frames `[node, child_idx, lowlink_so_far]` to avoid the recursion limit on larger graphs.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`tarjan_scc(adj, n)`** — the algorithm:
   - For each unvisited node, start an iterative DFS with a frame stack.
   - On entering a node, push it onto the SCC stack, set `index` and `lowlink` to a global counter, mark `onstack`.
   - For each neighbor: if unvisited, recurse (push a frame); if on-stack, update the parent's lowlink with the neighbor's index.
   - When all neighbors done, if `lowlink == index`, pop the SCC.
3. **`show_scc(c)`** — render a component as `{a, b, c}`.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/tarjan_scc.ae
```

## Key language features

- **Iterative DFS** — explicit frame stack avoids the recursion limit. Each frame stores the next child index to visit so we can resume after recursion returns.
- **Frame mutation** — `frames[len(frames)-1][1] = i + 1` advances the cursor before pushing the new frame.
- **`while` for outer loop, `while` for inner neighbor scan** — no `for in`.
- **`if cond { ... };`** — closing brace of an `if` block must be followed by `;` if the next line is another statement.

## Expected output

```
== Tarjan's SCC ==

graph (adjacency list):
  0: [1]
  1: [2, 4, 5]
  ...
strongly connected components (3):
  {5, 6}
  {7, 3, 2}
  {4, 1, 0}

All assertions passed.
```

## Design notes

- The example graph has 3 SCCs: `{0, 1, 4}`, `{2, 3, 7}`, and `{5, 6}`. Each is a cycle (or a node with no cross-component out-edges).
- Iterative Tarjan needs more bookkeeping than recursive Tarjan, but it sidesteps the recursion limit and works on graphs of any size.
- Complexity: `O(V + E)` time, `O(V)` space.
- The output order of SCCs is reverse-topological (a sink SCC prints first, a source SCC prints last).
