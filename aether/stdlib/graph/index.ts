/**
 * Aether stdlib — `graph` module.
 *
 * Graph algorithms on an adjacency-list representation.  A graph is
 *
 *   { nodes: Set<any>, edges: Map<any, Array<{ to, w }>> }
 *
 * The `nodes` set holds every node value seen via `graphAddNode` /
 * `graphAddEdge`.  The `edges` map gives, for each node, the list of
 * outgoing weighted edges.  Weights default to 1 when omitted.
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Edge<T> { to: T; w: number; }
export interface Graph<T> {
  nodes: Set<T>;
  edges: Map<T, Edge<T>[]>;
  directed: boolean;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Create a fresh empty graph.  `directed` defaults to true. */
export function graphNew<T>(directed: boolean = true): Graph<T> {
  return { nodes: new Set<T>(), edges: new Map<T, Edge<T>[]>(), directed };
}

/** Add a node (no-op if already present).  Returns the graph for chaining. */
export function graphAddNode<T>(g: Graph<T>, n: T): Graph<T> {
  assertGraph(g, "graphAddNode");
  if (!g.nodes.has(n)) {
    g.nodes.add(n);
    g.edges.set(n, []);
  }
  return g;
}

/** Add a weighted edge `a -> b` (and `b -> a` when undirected).
 *  `w` defaults to 1.  Both endpoints become nodes.  Returns the graph. */
export function graphAddEdge<T>(g: Graph<T>, a: T, b: T, w: number = 1): Graph<T> {
  assertGraph(g, "graphAddEdge");
  if (typeof w !== "number" || !Number.isFinite(w)) {
    throw new Error("graphAddEdge: weight must be a finite number");
  }
  graphAddNode(g, a);
  graphAddNode(g, b);
  (g.edges.get(a) as Edge<T>[]).push({ to: b, w });
  if (!g.directed) {
    (g.edges.get(b) as Edge<T>[]).push({ to: a, w });
  }
  return g;
}

/** Build a graph from an array of `[from, to, w?]` (or `[from, to]`) edges. */
export function graphFromEdges<T>(edges: Array<[T, T] | [T, T, number]>, directed: boolean = true): Graph<T> {
  const g = graphNew<T>(directed);
  if (!Array.isArray(edges)) throw new Error("graphFromEdges: expected array of edges");
  for (const e of edges) {
    if (!Array.isArray(e) || (e.length !== 2 && e.length !== 3)) {
      throw new Error("graphFromEdges: each edge must be [from, to] or [from, to, w]");
    }
    graphAddEdge(g, e[0], e[1], e.length === 3 ? (e[2] as number) : 1);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/** Return the outgoing neighbors of `n` (panics if `n` is not in the graph). */
export function graphNeighbors<T>(g: Graph<T>, n: T): T[] {
  assertGraph(g, "graphNeighbors");
  assertHas(g, n, "graphNeighbors");
  return (g.edges.get(n) as Edge<T>[]).map((e) => e.to);
}

/** True when an edge `a -> b` exists (or `b -> a` when undirected). */
export function graphHasEdge<T>(g: Graph<T>, a: T, b: T): boolean {
  assertGraph(g, "graphHasEdge");
  if (!g.nodes.has(a) || !g.nodes.has(b)) return false;
  const list = g.edges.get(a) as Edge<T>[];
  for (const e of list) if (eql(e.to, b)) return true;
  if (!g.directed) {
    const other = g.edges.get(b) as Edge<T>[];
    for (const e of other) if (eql(e.to, a)) return true;
  }
  return false;
}

/** Return all node values (insertion order). */
export function graphNodes<T>(g: Graph<T>): T[] {
  assertGraph(g, "graphNodes");
  return Array.from(g.nodes);
}

/** Return all edges as `{ from, to, w }` objects (insertion order). */
export function graphEdges<T>(g: Graph<T>): Array<{ from: T; to: T; w: number }> {
  assertGraph(g, "graphEdges");
  const out: Array<{ from: T; to: T; w: number }> = [];
  for (const [from, list] of g.edges) {
    for (const e of list) out.push({ from, to: e.to, w: e.w });
  }
  return out;
}

/** Number of nodes. */
export function graphNodeCount<T>(g: Graph<T>): number {
  assertGraph(g, "graphNodeCount");
  return g.nodes.size;
}

/** Number of edges (for undirected graphs, each pair is counted once). */
export function graphEdgeCount<T>(g: Graph<T>): number {
  assertGraph(g, "graphEdgeCount");
  let total = 0;
  for (const list of g.edges.values()) total += list.length;
  return g.directed ? total : Math.floor(total / 2);
}

/** Out-degree of `n` (for undirected graphs, equals degree). */
export function graphDegree<T>(g: Graph<T>, n: T): number {
  assertGraph(g, "graphDegree");
  assertHas(g, n, "graphDegree");
  return (g.edges.get(n) as Edge<T>[]).length;
}

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

/** Breadth-first search starting from `start`; call `fn(node, dist)` for
 *  every reachable node in BFS order.  `dist` is the hop count from `start`. */
export function graphBfs<T>(g: Graph<T>, start: T, fn: (n: T, dist: number) => void): void {
  assertGraph(g, "graphBfs");
  assertHas(g, start, "graphBfs");
  if (typeof fn !== "function") throw new Error("graphBfs: expected function");
  const visited = new Set<T>([start]);
  const queue: Array<[T, number]> = [[start, 0]];
  while (queue.length > 0) {
    const [n, d] = queue.shift() as [T, number];
    fn(n, d);
    for (const e of g.edges.get(n) as Edge<T>[]) {
      if (!visited.has(e.to)) {
        visited.add(e.to);
        queue.push([e.to, d + 1]);
      }
    }
  }
}

/** Depth-first search starting from `start`; call `fn(node, depth)` in
 *  pre-order.  Iterative (no recursion stack overflow on long chains). */
export function graphDfs<T>(g: Graph<T>, start: T, fn: (n: T, depth: number) => void): void {
  assertGraph(g, "graphDfs");
  assertHas(g, start, "graphDfs");
  if (typeof fn !== "function") throw new Error("graphDfs: expected function");
  const visited = new Set<T>();
  const stack: Array<[T, number]> = [[start, 0]];
  while (stack.length > 0) {
    const [n, d] = stack.pop() as [T, number];
    if (visited.has(n)) continue;
    visited.add(n);
    fn(n, d);
    const list = g.edges.get(n) as Edge<T>[];
    // Push in reverse so the first neighbor comes out first.
    for (let i = list.length - 1; i >= 0; i--) {
      if (!visited.has(list[i].to)) stack.push([list[i].to, d + 1]);
    }
  }
}

// ---------------------------------------------------------------------------
// Algorithms
// ---------------------------------------------------------------------------

/** Dijkstra shortest-path distances from `a` to `b` plus the reconstructed
 *  path.  Returns `{ dist, path }` where `path` is `[a, ..., b]` or `[]`
 *  when `b` is unreachable. */
export function graphShortestPath<T>(g: Graph<T>, a: T, b: T): { dist: number; path: T[] } {
  assertGraph(g, "graphShortestPath");
  assertHas(g, a, "graphShortestPath");
  assertHas(g, b, "graphShortestPath");
  if (eql(a, b)) return { dist: 0, path: [a] };
  const dist = new Map<T, number>();
  const prev = new Map<T, T | null>();
  for (const n of g.nodes) { dist.set(n, Infinity); prev.set(n, null); }
  dist.set(a, 0);
  const visited = new Set<T>();
  while (visited.size < g.nodes.size) {
    // Pick unvisited u with min dist[u] (linear scan — fine for small graphs).
    let u: T | null = null;
    let best = Infinity;
    for (const [n, d] of dist) {
      if (!visited.has(n) && d < best) { best = d; u = n; }
    }
    if (u === null || best === Infinity) break;
    visited.add(u as T);
    for (const e of g.edges.get(u as T) as Edge<T>[]) {
      const nd = (dist.get(u as T) as number) + e.w;
      if (nd < (dist.get(e.to) as number)) {
        dist.set(e.to, nd);
        prev.set(e.to, u as T);
      }
    }
  }
  const d = dist.get(b) as number;
  if (!Number.isFinite(d)) return { dist: Infinity, path: [] };
  // Reconstruct path.
  const path: T[] = [];
  let cur: T | null = b;
  let safety = 0;
  while (cur !== null && safety < 100000) {
    path.unshift(cur);
    if (eql(cur, a)) break;
    cur = prev.get(cur) ?? null;
    safety++;
  }
  return { dist: d, path };
}

/** True when `b` is reachable from `a` (BFS). */
export function graphConnected<T>(g: Graph<T>, a: T, b: T): boolean {
  assertGraph(g, "graphConnected");
  assertHas(g, a, "graphConnected");
  assertHas(g, b, "graphConnected");
  if (eql(a, b)) return true;
  let found = false;
  graphBfs(g, a, (n) => { if (eql(n, b)) found = true; });
  return found;
}

/** Topological sort (Kahn's algorithm).  Returns an array of nodes in
 *  topological order, or `null` when the graph has a cycle. */
export function graphTopoSort<T>(g: Graph<T>): T[] | null {
  assertGraph(g, "graphTopoSort");
  // Compute in-degrees.
  const indeg = new Map<T, number>();
  for (const n of g.nodes) indeg.set(n, 0);
  for (const list of g.edges.values()) {
    for (const e of list) indeg.set(e.to, (indeg.get(e.to) as number) + 1);
  }
  const queue: T[] = [];
  for (const [n, d] of indeg) if (d === 0) queue.push(n);
  const out: T[] = [];
  while (queue.length > 0) {
    const n = queue.shift() as T;
    out.push(n);
    for (const e of g.edges.get(n) as Edge<T>[]) {
      const nd = (indeg.get(e.to) as number) - 1;
      indeg.set(e.to, nd);
      if (nd === 0) queue.push(e.to);
    }
  }
  return out.length === g.nodes.size ? out : null;
}

/** True when the graph contains a cycle (DFS with three-colour marking). */
export function graphIsCyclic<T>(g: Graph<T>): boolean {
  assertGraph(g, "graphIsCyclic");
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<T, number>();
  for (const n of g.nodes) color.set(n, WHITE);
  function dfs(u: T): boolean {
    color.set(u, GRAY);
    for (const e of g.edges.get(u) as Edge<T>[]) {
      const c = color.get(e.to) as number;
      if (c === GRAY) return true;
      if (c === WHITE && dfs(e.to)) return true;
    }
    color.set(u, BLACK);
    return false;
  }
  for (const n of g.nodes) {
    if (color.get(n) === WHITE && dfs(n)) return true;
  }
  return false;
}

/** Minimum spanning tree (Prim's algorithm).  Returns the list of edges
 *  `{ from, to, w }` in the MST.  Works on undirected graphs; for directed
 *  graphs we treat edges as undirected for the MST computation. */
export function graphMst<T>(g: Graph<T>): Array<{ from: T; to: T; w: number }> {
  assertGraph(g, "graphMst");
  if (g.nodes.size === 0) return [];
  const start = g.nodes.values().next().value as T;
  const inTree = new Set<T>([start]);
  const out: Array<{ from: T; to: T; w: number }> = [];
  // Collect all edges with both endpoints considered bidirectionally.
  const all = new Map<T, Edge<T>[]>();
  for (const [from, list] of g.edges) {
    if (!all.has(from)) all.set(from, []);
    for (const e of list) {
      (all.get(from) as Edge<T>[]).push(e);
      if (!all.has(e.to)) all.set(e.to, []);
      (all.get(e.to) as Edge<T>[]).push({ to: from, w: e.w });
    }
  }
  while (inTree.size < g.nodes.size) {
    let best: { from: T; to: T; w: number } | null = null;
    for (const u of inTree) {
      const list = all.get(u) ?? [];
      for (const e of list) {
        if (inTree.has(e.to)) continue;
        if (best === null || e.w < best.w) best = { from: u, to: e.to, w: e.w };
      }
    }
    if (best === null) break; // disconnected
    inTree.add(best.to);
    out.push(best);
  }
  return out;
}

/** Return a graph with every edge reversed (only meaningful for directed graphs). */
export function graphReverse<T>(g: Graph<T>): Graph<T> {
  assertGraph(g, "graphReverse");
  const r = graphNew<T>(g.directed);
  for (const n of g.nodes) graphAddNode(r, n);
  for (const [from, list] of g.edges) {
    for (const e of list) graphAddEdge(r, e.to, from, e.w);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** Render the graph as a multi-line adjacency-list string. */
export function graphToString<T>(g: Graph<T>): string {
  assertGraph(g, "graphToString");
  const lines: string[] = [];
  lines.push("Graph(" + (g.directed ? "directed" : "undirected") + ", " + g.nodes.size + " nodes, " + graphEdgeCount(g) + " edges)");
  for (const [from, list] of g.edges) {
    const tail = list.map((e) => String(e.to) + "(" + e.w + ")").join(", ");
    lines.push("  " + String(from) + " -> [" + tail + "]");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "graph",
  fns: [
    { name: "graphNew", sig: "(directed?: bool) -> Graph", desc: "Create a fresh empty graph (directed by default)." },
    { name: "graphAddNode", sig: "(g, n) -> Graph", desc: "Add a node (no-op if present)." },
    { name: "graphAddEdge", sig: "(g, a, b, w?: number) -> Graph", desc: "Add a weighted edge (w defaults to 1)." },
    { name: "graphNeighbors", sig: "(g, n) -> any[]", desc: "Outgoing neighbors of n." },
    { name: "graphHasEdge", sig: "(g, a, b) -> bool", desc: "True when an edge a->b exists." },
    { name: "graphNodes", sig: "(g) -> any[]", desc: "All node values." },
    { name: "graphEdges", sig: "(g) -> [{from,to,w}]", desc: "All edges as {from, to, w} objects." },
    { name: "graphNodeCount", sig: "(g) -> int", desc: "Number of nodes." },
    { name: "graphEdgeCount", sig: "(g) -> int", desc: "Number of edges (undirected counted once)." },
    { name: "graphBfs", sig: "(g, start, fn) -> void", desc: "Breadth-first walk calling fn(node, dist)." },
    { name: "graphDfs", sig: "(g, start, fn) -> void", desc: "Depth-first walk calling fn(node, depth)." },
    { name: "graphShortestPath", sig: "(g, a, b) -> {dist, path}", desc: "Dijkstra shortest path (returns {dist, path})." },
    { name: "graphConnected", sig: "(g, a, b) -> bool", desc: "True when b is reachable from a." },
    { name: "graphTopoSort", sig: "(g) -> any[]?", desc: "Topological sort (null if cyclic)." },
    { name: "graphIsCyclic", sig: "(g) -> bool", desc: "True when the graph has a cycle." },
    { name: "graphMst", sig: "(g) -> [{from,to,w}]", desc: "Minimum spanning tree (Prim)." },
    { name: "graphReverse", sig: "(g) -> Graph", desc: "Return a graph with every edge reversed." },
    { name: "graphDegree", sig: "(g, n) -> int", desc: "Out-degree of n (degree in undirected graphs)." },
    { name: "graphFromEdges", sig: "(edges, directed?) -> Graph", desc: "Build a graph from [from, to, w?] triples." },
    { name: "graphToString", sig: "(g) -> string", desc: "Render the adjacency list as a multi-line string." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("graphNew", graphNew);
  registerBuiltin("graphAddNode", graphAddNode);
  registerBuiltin("graphAddEdge", graphAddEdge);
  registerBuiltin("graphNeighbors", graphNeighbors);
  registerBuiltin("graphHasEdge", graphHasEdge);
  registerBuiltin("graphNodes", graphNodes);
  registerBuiltin("graphEdges", graphEdges);
  registerBuiltin("graphNodeCount", graphNodeCount);
  registerBuiltin("graphEdgeCount", graphEdgeCount);
  registerBuiltin("graphBfs", graphBfs);
  registerBuiltin("graphDfs", graphDfs);
  registerBuiltin("graphShortestPath", graphShortestPath);
  registerBuiltin("graphConnected", graphConnected);
  registerBuiltin("graphTopoSort", graphTopoSort);
  registerBuiltin("graphIsCyclic", graphIsCyclic);
  registerBuiltin("graphMst", graphMst);
  registerBuiltin("graphReverse", graphReverse);
  registerBuiltin("graphDegree", graphDegree);
  registerBuiltin("graphFromEdges", graphFromEdges);
  registerBuiltin("graphToString", graphToString);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertGraph<T>(x: any, fn: string): asserts x is Graph<T> {
  if (typeof x !== "object" || x === null || !(x.nodes instanceof Set) || !(x.edges instanceof Map)) {
    throw new Error(fn + ": expected graph, got " + describe(x));
  }
}

function assertHas<T>(g: Graph<T>, n: T, fn: string): void {
  if (!g.nodes.has(n)) {
    throw new Error(fn + ": node " + String(n) + " not in graph");
  }
}

function eql<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!eql(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a as any), kb = Object.keys(b as any);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!eql((a as any)[k], (b as any)[k])) return false;
  return true;
}

function describe(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
