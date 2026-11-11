# Aether stdlib — `graph`

The `graph` module provides a tiny but complete graph library. A graph is represented as a JavaScript object

```aether
{ nodes: Set<any>, edges: Map<any, [{ to, w }]>, directed: bool }
```

where `nodes` is the set of all node values, `edges` maps each node to its outgoing weighted edge list, and `directed` flags whether edges are one-way. The module ships 20 functions: constructors, accessors, traversal, and the four classic graph algorithms (Dijkstra, topological sort, cycle detection, MST). All functions are pure TypeScript; throwing an `Error` from a builtin surfaces as an Aether panic.

## Why this shape?

The adjacency-list representation is the sweet spot between memory and time complexity. Storing `Set<any>` for nodes lets you check membership in O(1) and lets the graph carry any node value (strings, numbers, tuples). Storing the edge list keyed by source means `graphNeighbors(g, n)` and `graphDegree(g, n)` are O(deg(n)) — a single array index and length lookup — while `graphBfs` and `graphDfs` walk the edges they need without scanning all of them. For the small-to-medium graphs that come up in practice (call graphs, dependency trees, small maps) this beats a dense matrix.

## Construction

`graphNew(directed = true)` returns a fresh empty graph. `graphAddNode(g, n)` adds a node (idempotent: a no-op if the node is already present) and returns the graph for chaining. `graphAddEdge(g, a, b, w = 1)` adds an edge from `a` to `b` with weight `w` (defaults to 1). For undirected graphs, the reverse edge is added automatically. `graphFromEdges(edges, directed = true)` builds the whole graph from an array of `[from, to, w?]` triples in one shot.

```aether
let g = graph.graphNew(false);                // undirected
graph.graphAddEdge(g, "a", "b", 4);
graph.graphAddEdge(g, "b", "c", 2);
// Or all at once:
let g2 = graph.graphFromEdges([["a", "b", 4], ["b", "c", 2]]);
```

## Accessors

`graphNeighbors(g, n)` returns the outgoing neighbors of `n` (panics if `n` is not in the graph). `graphHasEdge(g, a, b)` checks whether an edge exists (one-way for directed, both ways for undirected). `graphNodes(g)` returns all nodes in insertion order. `graphEdges(g)` returns all edges as `{from, to, w}` objects. `graphNodeCount(g)` and `graphEdgeCount(g)` give sizes; for undirected graphs `graphEdgeCount` returns the number of distinct edges (each pair counted once). `graphDegree(g, n)` is the out-degree (which equals the degree for undirected graphs).

```aether
graph.graphNeighbors(g, "a")    // ["b"]
graph.graphHasEdge(g, "a", "b") // true
graph.graphNodeCount(g)         // 3
graph.graphEdgeCount(g)          // 2 (for directed graph above)
```

## Traversal

`graphBfs(g, start, fn)` walks every node reachable from `start` in BFS order, calling `fn(node, dist)` where `dist` is the hop count from `start`. `graphDfs(g, start, fn)` walks the same set in DFS pre-order, calling `fn(node, depth)` where `depth` is the recursion depth. Both are iterative (no stack overflow on long chains) and visit each reachable node exactly once.

```aether
graph.graphBfs(g, "a", (n, d) => println(n + " at distance " + d))
// a at distance 0
// b at distance 1
// c at distance 2
```

## Shortest path — Dijkstra

`graphShortestPath(g, a, b)` returns `{ dist, path }` where `dist` is the total weighted distance from `a` to `b` and `path` is `[a, ..., b]` (or `[]` when `b` is unreachable). The algorithm is the textbook O(V²) Dijkstra with a linear scan for the minimum — fine for graphs up to a few thousand nodes. The path is reconstructed by walking back through the `prev` map.

```aether
let r = graph.graphShortestPath(g, "a", "d")
// r.dist == 4
// r.path == ["a", "c", "b", "d"]
```

## Connectivity

`graphConnected(g, a, b)` is `true` when `b` is reachable from `a` (BFS). Two nodes are mutually connected in an undirected graph iff this is true both ways; in a directed graph, reachability is asymmetric.

## Topological sort

`graphTopoSort(g)` returns an array of nodes in topological order using Kahn's algorithm (repeatedly peel off zero-in-degree nodes). Returns `null` when the graph has a cycle — the classic "if the output doesn't contain every node, there was a cycle" trick. `graphIsCyclic(g)` is the dedicated predicate (DFS with three-colour marking).

```aether
let order = graph.graphTopoSort(g)
if (order == null) {
  println("cycle detected")
} else {
  for (let n in order) { println(n) }
}
```

## Minimum spanning tree — Prim

`graphMst(g)` returns the MST as a list of `{from, to, w}` edges using Prim's algorithm (repeatedly add the cheapest edge from the in-tree to the out-tree). For directed graphs, edges are treated as undirected for the MST computation. Returns the empty list for empty graphs and a partial MST for disconnected ones (one spanning forest per component, but the function returns just one — disconnected graphs yield a list shorter than `nodeCount - 1`).

## Reverse

`graphReverse(g)` returns a new graph with every edge flipped. For undirected graphs this is a structural copy. Useful for computing "who points to me" relationships (the reverse adjacency list).

## Display

`graphToString(g)` renders the graph as a multi-line adjacency list — useful for debugging:

```
Graph(directed, 3 nodes, 2 edges)
  a -> [b(4)]
  b -> [c(2)]
  c -> []
```

## Common patterns

- **Build a DAG and topo-sort it**: construct with `graphFromEdges`, then `graphTopoSort` to schedule tasks in dependency order.
- **Find reachable nodes**: `graphBfs` with a side-effect closure collecting into an array.
- **Compute shortest paths from one source**: a `for n in graphNodes(g)` loop calling `graphShortestPath(g, src, n)` is O(V³) but fine for small graphs; for bigger graphs, hand-roll a single-source Dijkstra once and read `dist` from the closure.
- **Detect cycle in a dependency graph**: `graphIsCyclic(g)` for the predicate, `graphTopoSort(g) == null` if you also want the sort.

## What's NOT in here

We deliberately omitted: A* (no heuristic abstraction in v1), Bellman-Ford (negative weights are an edge case; if you need them, file an RFC), max-flow (out of scope for the stdlib), and graph serialization to GraphViz (use `graphToString` and post-process). These are good candidates for a future `graphx` companion module or community extensions.

The whole module is 20 functions, ~340 lines of TypeScript, no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
