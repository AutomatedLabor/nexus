# aether/stdlib/scc

Strongly Connected Components (SCC) for directed graphs. A strongly
connected component is a maximal subset of vertices such that every
vertex is reachable from every other vertex in the subset. SCCs are
the fundamental building block for many graph algorithms: 2-SAT,
cycle detection, dominator-finding, dataflow analysis, and graph
condensation.

This module provides two classic SCC algorithms and four helper
functions:

| Function | Returns | Notes |
| --- | --- | --- |
| `sccNew(n)` | `SccGraph` | Create a graph with `n` vertices (0..n-1) and no edges. |
| `sccAddEdge(g, u, v)` | `SccGraph` | Add a directed edge `u -> v` (also records the reverse edge for Kosaraju). |
| `sccTarjan(g)` | `number[][]` | Tarjan's single-DFS algorithm; SCCs in reverse topological order (sinks first). |
| `sccKosaraju(g)` | `number[][]` | Kosaraju's two-pass algorithm; SCCs in topological order (sources first). |
| `sccCount(g)` | `number` | Number of SCCs (computed via Tarjan). |
| `sccToList(g, algo?)` | `Array<{vertex, component}>` | Flat list sorted by vertex; `component` is the 0-based SCC index. |

Both algorithms run in `O(V+E)` time and `O(V)` auxiliary space and
produce the same SCC partition (the partition is unique); only the
order of SCCs in the outer array differs.

## Why two algorithms?

Tarjan and Kosaraju are the two most-taught SCC algorithms. They
have the same asymptotic complexity but differ in their internals
and in the order in which they emit SCCs:

- **Tarjan** uses a single DFS with a low-link computation. It's
  slightly more space-efficient (one DFS pass instead of two) and
  emits SCCs in reverse topological order — i.e. the SCC at the
  output array's index 0 is a *sink* component (no out-edges to
  other SCCs). This makes it convenient for
  bottom-up processing (e.g. dataflow analysis where you process
  leaves first).
- **Kosaraju** uses two DFS passes: one forward (to compute
  finishing times) and one on the transposed graph (in reverse
  finishing order). It emits SCCs in topological order — i.e. the
  SCC at the output array's index 0 is a *source* component (no
  in-edges from other SCCs). This makes it convenient for top-down
  processing.

If you don't care about the order, `sccTarjan` is the standard
choice. If you want a specific order (top-down vs bottom-up),
choose the algorithm that gives it to you directly; the alternative
order can be obtained by reversing the output array.

## Aether usage

```aether
import { sccNew, sccAddEdge, sccTarjan, sccKosaraju, sccCount, sccToList }
  from "aether/stdlib/scc";

// Build a graph: 0 -> 1 -> 2 -> 0 (a 3-cycle), 3 -> 1, 4 -> 3.
let g = sccNew(5);
sccAddEdge(g, 0, 1);
sccAddEdge(g, 1, 2);
sccAddEdge(g, 2, 0);
sccAddEdge(g, 3, 1);
sccAddEdge(g, 4, 3);

// Tarjan: returns [[0,1,2], [3], [4]] in some order.
let sccs = sccTarjan(g);
print("SCCs:");
let mut i = 0;
while i < len(sccs) {
  print("  " + str(sccs[i]));
  i = i + 1;
}

// Kosaraju: returns the same partition, possibly in a different order.
let sccs_k = sccKosaraju(g);

// Count.
print("Number of SCCs: " + str(sccCount(g)));  // 3

// Flat {vertex, component} list (sorted by vertex).
let flat = sccToList(g);
print("Vertex -> component:");
let mut j = 0;
while j < len(flat) {
  print("  vertex " + str(flat[j].vertex) + " -> component " + str(flat[j].component));
  j = j + 1;
}
```

## Algorithm details

### Tarjan

Tarjan's algorithm maintains a single DFS stack and three per-vertex
arrays:

- `index[v]` — the discovery time of `v` (a monotonic counter).
- `lowlink[v]` — the smallest `index` reachable from `v` by
  following zero or more tree edges and then one back-edge or
  cross-edge to a vertex on the current DFS path.
- `onStack[v]` — whether `v` is currently on the DFS stack.

When the DFS visits a vertex `v`, it sets `index[v] = lowlink[v] =
next++` and pushes `v` on the stack. For each neighbour `w` of `v`:

- If `w` is unvisited, recurse into `w`; on return, set
  `lowlink[v] = min(lowlink[v], lowlink[w])`.
- If `w` is on the stack (i.e. it's on the current DFS path),
  set `lowlink[v] = min(lowlink[v], index[w])` (this is the back-edge
  or cross-edge case).

When the DFS finishes a vertex `v` with `lowlink[v] == index[v]`,
`v` is the *root* of an SCC: every vertex above `v` on the stack
(and `v` itself) is in the same SCC. Pop them, mark them
`onStack = false`, and emit the SCC.

This implementation uses an explicit stack (rather than recursion)
to avoid the Aether evaluator's recursion-depth limit on large
graphs. Each stack frame holds the vertex and the index of the next
neighbour to visit.

### Kosaraju

Kosaraju's algorithm is conceptually simpler:

1. **Forward pass:** DFS the graph; push each vertex onto a stack
   when its DFS *finishes* (post-order). After this pass, the
   stack's top is the vertex that finished last.
2. **Reverse pass:** pop vertices from the stack; for each unvisited
   vertex, DFS the *transposed* graph (edges reversed). Every
   vertex reached in this DFS forms one SCC; assign it the next
   component index.

The intuition: the finishing order of the first pass puts "sink"
components at the top of the stack; processing the transposed graph
in that order turns sinks into sources, so each DFS reaches exactly
one SCC.

This implementation also uses explicit DFS stacks (iterative,
not recursive).

## Limitations

- The graph representation uses two adjacency lists (`adj` for
  out-edges, `radj` for in-edges, the latter maintained by
  `sccAddEdge` for Kosaraju). Adding an edge costs `O(1)` amortized,
  but `radj` doubles the space cost compared to a single-list
  representation. For graphs where you only ever use Tarjan, the
  `radj` list is wasted; for Kosaraju-only use, it's required.
- Both algorithms use `O(V)` auxiliary space; for very large graphs
  (millions of vertices) this is fine, but the explicit DFS stack in
  the Aether evaluator will hit the evaluator's step limit before
  the algorithm's space limit.
- `sccAddEdge` allows self-loops (`u == v`); they don't affect SCC
  structure (a self-loop is an SCC of size 1 either way).
- `sccAddEdge` allows duplicate edges; they don't affect SCC
  structure either, but they do inflate the work slightly.
- The `component` indices in `sccToList`'s output depend on the
  algorithm's emission order. If you need a canonical mapping,
  normalize by sorting each SCC and re-indexing in sorted order.

## Test coverage

The test suite in `index.test.ts` contains 27 cases covering:

- construction (`sccNew` with 0, 1, and many vertices; invalid
  inputs);
- `sccAddEdge` (forward + reverse edges; out-of-bounds; non-graph
  input);
- the trivial cases (singleton SCC, self-loop, DAG with `n`
  singleton SCCs);
- a real cycle (3-cycle = 1 SCC);
- two disjoint cycles (= 2 SCCs);
- a graph with a cycle and a tail;
- Kosaraju's parity with Tarjan (same partition, modulo order) on
  a complex graph;
- `sccCount` (singleton, empty, multi-SCC graphs);
- `sccToList` (sorted-by-vertex output; component mapping; the
  `algo = "kosaraju"` override; non-graph input).
