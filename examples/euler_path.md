# euler_path.ae

Find an Euler path in a directed graph using Hierholzer's algorithm (iterative form). An Euler path traverses every edge exactly once. We maintain a stack of nodes to "return to"; we greedily take the next unused edge from the top node, and when a node has no edges left, we pop it and prepend it to the path.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`hierholzer(adj, n, start)`**:
   - `cursor[v]` tracks the next outgoing edge to try from `v`.
   - `stack = [start]` simulates the DFS.
   - Loop while `stack` isn't empty:
     - Top of stack `v` has an unused edge → take it, advance `cursor[v]`, push the destination.
     - Otherwise pop `v` and push it onto `path` (this builds the path in reverse).
   - Reverse `path` for forward order.
3. **Driver** — prints the graph and the discovered Euler path.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/euler_path.ae
```

## Key language features

- **Iterative Hierholzer** — no recursion; the explicit stack works around the v1 evaluator's recursion limit.
- **`if cond { ... } else { ... };`** — closing brace of an if-else block must be followed by `;` if the next line is a statement; otherwise the next statement is silently absorbed into the else block and never executes.
- **`while` for every loop** — sidesteps the for-loop-scope quirk.

## Expected output

```
== Euler path (Hierholzer) ==

graph (adjacency list):
  0: [1]
  1: [2]
  2: [0, 3]
  3: [1]

Euler path from 2: 2 -> 0 -> 1 -> 2 -> 3 -> 1
length: 5 edges

All assertions passed.
```

## Design notes

- The graph is `0 -> 1, 1 -> 2, 2 -> 0, 2 -> 3, 3 -> 1`. Node 2 has out-degree 2, in-degree 1 (diff +1) and node 1 has out-degree 1, in-degree 2 (diff −1), so an Euler path exists from 2 to 1.
- The path uses every edge exactly once: `2 → 0 → 1 → 2 → 3 → 1`.
- For Euler circuits (start = end), every node has out-degree = in-degree and any node can be the start.
- Complexity: `O(V + E)` time, `O(V)` space for the stack and cursor.
