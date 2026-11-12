/**
 * Aether stdlib — `scc` module.
 *
 * Strongly Connected Components (SCC) for directed graphs.  Two
 * algorithms are provided:
 *
 *   - `sccTarjan(g)`   — Tarjan's single-DFS algorithm, O(V+E).
 *   - `sccKosaraju(g)` — Kosaraju's two-pass algorithm, O(V+E).
 *
 * Both produce the same answer (the SCCs are unique), but they differ
 * in their internals:
 *
 *   - Tarjan uses a single DFS with a low-link computation; it's
 *     slightly more space-efficient (no second DFS pass) and emits
 *     SCCs in reverse topological order (sinks first).
 *   - Kosaraju uses two DFS passes (one forward, one on the
 *     transposed graph) and emits SCCs in topological order
 *     (sources first).
 *
 * Both functions return an array of SCCs, where each SCC is an
 * array of vertex indices.  The order of SCCs in the outer array
 * differs between the two algorithms; the order of vertices within
 * an SCC is the order in which the SCC's vertices were discovered
 * by the DFS.
 *
 * The six functions:
 *
 *   - `sccNew(n)`         — create a graph with `n` vertices.
 *   - `sccAddEdge(g, u, v)` — add a directed edge u -> v.
 *   - `sccTarjan(g)`      — Tarjan's algorithm; returns array of SCCs.
 *   - `sccKosaraju(g)`    — Kosaraju's algorithm; returns array of SCCs.
 *   - `sccCount(g)`       — number of SCCs (via Tarjan).
 *   - `sccToList(g)`      — a flat list of { vertex, component } pairs.
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SccGraph {
  /** Number of vertices. */
  n: number;
  /** Adjacency list: vertex -> array of out-neighbours. */
  adj: number[][];
  /** Reverse adjacency list (used by Kosaraju): vertex -> array of in-neighbours. */
  radj: number[][];
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Create a fresh graph with `n` vertices (labelled 0..n-1) and no edges. */
export function sccNew(n: number): SccGraph {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new Error("sccNew: n must be a non-negative integer");
  }
  const adj: number[][] = [];
  const radj: number[][] = [];
  for (let i = 0; i < n; i++) {
    adj.push([]);
    radj.push([]);
  }
  return { n, adj, radj };
}

/** Add a directed edge u -> v.  Throws if u or v is out of bounds. */
export function sccAddEdge(g: SccGraph, u: number, v: number): SccGraph {
  assertGraph(g, "sccAddEdge");
  assertVertex(g, u, "sccAddEdge");
  assertVertex(g, v, "sccAddEdge");
  g.adj[u].push(v);
  g.radj[v].push(u);
  return g;
}

// ---------------------------------------------------------------------------
// Tarjan's algorithm
// ---------------------------------------------------------------------------

/**
 * Tarjan's SCC algorithm.  Returns an array of SCCs, each an array
 * of vertex indices.  SCCs are emitted in reverse topological order
 * (sinks first), which is the natural order of the algorithm.
 *
 * Implementation: a single DFS, maintaining a stack of vertices on
 * the current DFS path, an index counter (the discovery time), and
 * a low-link array.  When the DFS finishes a vertex whose low-link
 * equals its index, the vertex and everything above it on the
 * stack form one SCC; pop them off and emit the SCC.
 *
 * O(V+E) time, O(V) auxiliary space (stack + arrays).
 */
export function sccTarjan(g: SccGraph): number[][] {
  assertGraph(g, "sccTarjan");
  const n = g.n;
  const index: number[] = new Array(n).fill(-1);
  const lowlink: number[] = new Array(n).fill(0);
  const onStack: boolean[] = new Array(n).fill(false);
  const stack: number[] = [];
  let next = 0;
  const sccs: number[][] = [];

  // Iterative DFS to avoid stack overflow on large graphs (the
  // evaluator caps recursion depth, so we use an explicit stack).
  // Each stack frame records: vertex, and the index of the next
  // neighbour to visit.
  function strongconnect(root: number): void {
    const dfs: Array<{ v: number; i: number }> = [{ v: root, i: 0 }];
    index[root] = next;
    lowlink[root] = next;
    next = next + 1;
    stack.push(root);
    onStack[root] = true;

    while (dfs.length > 0) {
      const frame = dfs[dfs.length - 1];
      const v = frame.v;
      const neighbours = g.adj[v];
      if (frame.i < neighbours.length) {
        const w = neighbours[frame.i];
        frame.i = frame.i + 1;
        if (index[w] === -1) {
          // Not yet visited: recurse (push a new frame).
          index[w] = next;
          lowlink[w] = next;
          next = next + 1;
          stack.push(w);
          onStack[w] = true;
          dfs.push({ v: w, i: 0 });
        } else if (onStack[w]) {
          // Back-edge to a vertex on the current DFS path.
          if (index[w] < lowlink[v]) lowlink[v] = index[w];
        }
      } else {
        // All neighbours visited: pop the frame and propagate lowlink.
        dfs.pop();
        if (lowlink[v] === index[v]) {
          // v is the root of an SCC: pop everything down to v on the stack.
          const comp: number[] = [];
          let w: number;
          do {
            w = stack.pop() as number;
            onStack[w] = false;
            comp.push(w);
          } while (w !== v);
          sccs.push(comp);
        }
        // Propagate lowlink to parent (if any).
        if (dfs.length > 0) {
          const parent = dfs[dfs.length - 1].v;
          if (lowlink[v] < lowlink[parent]) lowlink[parent] = lowlink[v];
        }
      }
    }
  }

  for (let v = 0; v < n; v++) {
    if (index[v] === -1) strongconnect(v);
  }
  return sccs;
}

// ---------------------------------------------------------------------------
// Kosaraju's algorithm
// ---------------------------------------------------------------------------

/**
 * Kosaraju's SCC algorithm.  Returns an array of SCCs, each an array
 * of vertex indices.  SCCs are emitted in topological order
 * (sources first), which is the natural order of the second DFS.
 *
 * Implementation: two DFS passes.
 *   1. Forward DFS on g, pushing each vertex onto a stack when its
 *      DFS finishes (post-order).
 *   2. For each vertex popped from the stack (in reverse post-order),
 *      if it's not yet assigned to an SCC, do a DFS on the reverse
 *      graph; every vertex reached forms one SCC.
 *
 * O(V+E) time, O(V) auxiliary space (stack + arrays).
 */
export function sccKosaraju(g: SccGraph): number[][] {
  assertGraph(g, "sccKosaraju");
  const n = g.n;
  const visited: boolean[] = new Array(n).fill(false);
  const order: number[] = [];

  // Pass 1: forward DFS, push vertices in post-order.
  function dfs1(start: number): void {
    const stack: Array<{ v: number; i: number }> = [{ v: start, i: 0 }];
    visited[start] = true;
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const v = frame.v;
      const neighbours = g.adj[v];
      if (frame.i < neighbours.length) {
        const w = neighbours[frame.i];
        frame.i = frame.i + 1;
        if (!visited[w]) {
          visited[w] = true;
          stack.push({ v: w, i: 0 });
        }
      } else {
        stack.pop();
        order.push(v);
      }
    }
  }
  for (let v = 0; v < n; v++) {
    if (!visited[v]) dfs1(v);
  }

  // Pass 2: DFS on reverse graph in reverse post-order; each tree
  // is one SCC.
  const assigned: number[] = new Array(n).fill(-1);
  const sccs: number[][] = [];
  for (let i = order.length - 1; i >= 0; i--) {
    const v = order[i];
    if (assigned[v] !== -1) continue;
    const comp: number[] = [];
    const stack: number[] = [v];
    assigned[v] = sccs.length;
    while (stack.length > 0) {
      const x = stack.pop() as number;
      comp.push(x);
      for (const y of g.radj[x]) {
        if (assigned[y] === -1) {
          assigned[y] = sccs.length;
          stack.push(y);
        }
      }
    }
    sccs.push(comp);
  }
  return sccs;
}

// ---------------------------------------------------------------------------
// Convenience accessors
// ---------------------------------------------------------------------------

/** Return the number of SCCs (computed via Tarjan). */
export function sccCount(g: SccGraph): number {
  return sccTarjan(g).length;
}

/**
 * Return a flat list of `{ vertex, component }` pairs, where
 * `component` is the index (0-based) of the SCC the vertex belongs
 * to.  The list is sorted by vertex index for stable output.
 *
 * By default uses Tarjan's algorithm; pass "kosaraju" as the second
 * arg to use Kosaraju instead.  The component indices are assigned
 * in the order the SCCs are emitted by the chosen algorithm.
 */
export function sccToList(g: SccGraph, algo?: string): Array<{ vertex: number; component: number }> {
  assertGraph(g, "sccToList");
  const sccs = algo === "kosaraju" ? sccKosaraju(g) : sccTarjan(g);
  const comp: number[] = new Array(g.n).fill(-1);
  for (let i = 0; i < sccs.length; i++) {
    for (const v of sccs[i]) comp[v] = i;
  }
  const out: Array<{ vertex: number; component: number }> = [];
  for (let v = 0; v < g.n; v++) {
    out.push({ vertex: v, component: comp[v] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertGraph(g: any, fn: string): asserts g is SccGraph {
  if (!g || typeof g !== "object" || typeof g.n !== "number" || !Array.isArray(g.adj) || !Array.isArray(g.radj)) {
    throw new Error(fn + ": expected an SccGraph (use sccNew())");
  }
}

function assertVertex(g: SccGraph, v: number, fn: string): void {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v >= g.n || Math.floor(v) !== v) {
    throw new Error(fn + ": vertex out of bounds (n=" + g.n + ", got " + v + ")");
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "scc",
  fns: [
    { name: "sccNew", sig: "(n: int) -> SccGraph", desc: "Create a graph with n vertices (labelled 0..n-1) and no edges." },
    { name: "sccAddEdge", sig: "(g, u: int, v: int) -> SccGraph", desc: "Add a directed edge u -> v." },
    { name: "sccTarjan", sig: "(g) -> int[][]", desc: "Tarjan's SCC algorithm; SCCs in reverse topological order." },
    { name: "sccKosaraju", sig: "(g) -> int[][]", desc: "Kosaraju's two-pass SCC; SCCs in topological order." },
    { name: "sccCount", sig: "(g) -> int", desc: "Number of SCCs (via Tarjan)." },
    { name: "sccToList", sig: "(g, algo?) -> [{vertex, component}]", desc: "Flat {vertex, component} list sorted by vertex." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("sccNew", sccNew);
  registerBuiltin("sccAddEdge", sccAddEdge);
  registerBuiltin("sccTarjan", sccTarjan);
  registerBuiltin("sccKosaraju", sccKosaraju);
  registerBuiltin("sccCount", sccCount);
  registerBuiltin("sccToList", sccToList);
}
