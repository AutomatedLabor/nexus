# topo_sort_kahn.ae

Topological sort via Kahn's algorithm. We compute in-degrees, repeatedly emit a zero-in-degree node, decrement its successors' in-degrees, and continue. If we exhaust the queue before emitting all `n` nodes, the graph has a cycle and we return `[]`.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`topo_sort(adj, n)`**:
   - Walk every `(u, v)` in the adjacency list, computing `indeg[v] += 1`.
   - Seed a FIFO queue with all zero-in-degree nodes.
   - Pop the front, push to `order`, and decrement the in-degrees of its successors; enqueue any that reach zero.
   - If `len(order) < n` at the end, return `[]` (cycle detected).

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/topo_sort_kahn.ae
```

## Key language features

- **`while` for every loop** — no `for in`.
- **FIFO via array + head cursor** — we keep a `queue` array and a `head` index; `head < len(queue)` is the loop condition, so we never need to actually shift elements off the front.
- **`if cond { ... };` after if blocks** — Aether v1 requires `;` after the closing brace of an if/else block when followed by another statement.

## Expected output

```
== Topological sort (Kahn) ==

graph (adjacency list):
  0: [1, 2]
  1: [3]
  2: [3, 4]
  3: [5]
  4: [5]
  5: [6]
  6: [7]
  7: []

topological order: [0, 1, 2, 3, 4, 5, 6, 7]

cyclic graph order: []  (empty = cycle)
All assertions passed.
```

## Design notes

- The Kahn order is one valid topological order. Many valid orders may exist; the one returned is determined by the initial scan order for zero-in-degree nodes (here, lowest index first).
- The cycle case (`1 -> 2 -> 3 -> 1`) shows the algorithm correctly returns `[]` when the graph isn't a DAG.
- Complexity: `O(V + E)` time, `O(V)` space for the in-degree array and queue.
- For deterministic orderings by priority (e.g., "smallest valid next node"), use a priority queue instead of a FIFO.
