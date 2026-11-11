import { describe, it, expect } from "vitest";
import * as G from "./index";

describe("graph module", () => {
  it("graphNew: defaults to directed", () => {
    const g = G.graphNew();
    expect(g.directed).toBe(true);
    expect(g.nodes.size).toBe(0);
  });

  it("graphNew: undirected flag honored", () => {
    const g = G.graphNew(false);
    expect(g.directed).toBe(false);
  });

  it("graphAddNode: adds a node", () => {
    const g = G.graphNew();
    G.graphAddNode(g, "a");
    G.graphAddNode(g, "b");
    expect(G.graphNodeCount(g)).toBe(2);
  });

  it("graphAddNode: idempotent on duplicates", () => {
    const g = G.graphNew();
    G.graphAddNode(g, "a");
    G.graphAddNode(g, "a");
    expect(G.graphNodeCount(g)).toBe(1);
  });

  it("graphAddEdge: adds both endpoints and the edge", () => {
    const g = G.graphNew();
    G.graphAddEdge(g, "a", "b");
    expect(G.graphNodeCount(g)).toBe(2);
    expect(G.graphEdgeCount(g)).toBe(1);
    expect(G.graphNeighbors(g, "a")).toEqual(["b"]);
  });

  it("graphAddEdge: weight defaults to 1", () => {
    const g = G.graphNew();
    G.graphAddEdge(g, "a", "b");
    const edges = G.graphEdges(g);
    expect(edges[0].w).toBe(1);
  });

  it("graphAddEdge: undirected graph adds both directions", () => {
    const g = G.graphNew(false);
    G.graphAddEdge(g, "a", "b");
    expect(G.graphNeighbors(g, "a")).toEqual(["b"]);
    expect(G.graphNeighbors(g, "b")).toEqual(["a"]);
    // Undirected: edge count is half the directed total.
    expect(G.graphEdgeCount(g)).toBe(1);
  });

  it("graphNeighbors: panics on missing node", () => {
    const g = G.graphNew();
    G.graphAddNode(g, "a");
    expect(() => G.graphNeighbors(g, "x")).toThrow();
  });

  it("graphHasEdge: directed (one-way)", () => {
    const g = G.graphNew();
    G.graphAddEdge(g, "a", "b");
    expect(G.graphHasEdge(g, "a", "b")).toBe(true);
    expect(G.graphHasEdge(g, "b", "a")).toBe(false);
  });

  it("graphHasEdge: undirected (both ways)", () => {
    const g = G.graphNew(false);
    G.graphAddEdge(g, "a", "b");
    expect(G.graphHasEdge(g, "a", "b")).toBe(true);
    expect(G.graphHasEdge(g, "b", "a")).toBe(true);
  });

  it("graphNodes: returns all nodes in insertion order", () => {
    const g = G.graphNew();
    G.graphAddEdge(g, "a", "b");
    G.graphAddEdge(g, "b", "c");
    expect(G.graphNodes(g)).toEqual(["a", "b", "c"]);
  });

  it("graphEdges: returns all edges", () => {
    const g = G.graphNew();
    G.graphAddEdge(g, "a", "b", 2);
    G.graphAddEdge(g, "b", "c", 3);
    const e = G.graphEdges(g);
    expect(e.length).toBe(2);
    expect(e[0]).toEqual({ from: "a", to: "b", w: 2 });
    expect(e[1]).toEqual({ from: "b", to: "c", w: 3 });
  });

  it("graphDegree: counts outgoing edges", () => {
    const g = G.graphNew();
    G.graphAddEdge(g, "a", "b");
    G.graphAddEdge(g, "a", "c");
    G.graphAddEdge(g, "a", "d");
    expect(G.graphDegree(g, "a")).toBe(3);
  });

  it("graphBfs: visits reachable nodes with distances", () => {
    const g = G.graphFromEdges([["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"]]);
    const visited: Array<[string, number]> = [];
    G.graphBfs(g, "a", (n, d) => visited.push([n, d]));
    expect(visited).toEqual([["a", 0], ["b", 1], ["c", 1], ["d", 2]]);
  });

  it("graphDfs: visits reachable nodes in DFS order", () => {
    const g = G.graphFromEdges([["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"]]);
    const visited: string[] = [];
    G.graphDfs(g, "a", (n) => visited.push(n));
    expect(visited).toEqual(["a", "b", "d", "c"]);
  });

  it("graphShortestPath: weighted path", () => {
    const g = G.graphFromEdges([["a", "b", 4], ["a", "c", 1], ["c", "b", 2], ["b", "d", 1], ["c", "d", 5]]);
    const r = G.graphShortestPath(g, "a", "d");
    expect(r.dist).toBe(4);
    expect(r.path).toEqual(["a", "c", "b", "d"]);
  });

  it("graphShortestPath: same node = zero distance", () => {
    const g = G.graphFromEdges([["a", "b"]]);
    const r = G.graphShortestPath(g, "a", "a");
    expect(r.dist).toBe(0);
    expect(r.path).toEqual(["a"]);
  });

  it("graphShortestPath: unreachable returns Infinity", () => {
    const g = G.graphFromEdges([["a", "b"]]);
    G.graphAddNode(g, "z");
    const r = G.graphShortestPath(g, "a", "z");
    expect(r.dist).toBe(Infinity);
    expect(r.path).toEqual([]);
  });

  it("graphConnected: reachable nodes", () => {
    const g = G.graphFromEdges([["a", "b"], ["b", "c"]]);
    expect(G.graphConnected(g, "a", "c")).toBe(true);
    expect(G.graphConnected(g, "c", "a")).toBe(false);
  });

  it("graphTopoSort: DAG", () => {
    const g = G.graphFromEdges([["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"]]);
    const ts = G.graphTopoSort(g);
    expect(ts).not.toBeNull();
    expect((ts as string[])[0]).toBe("a");
    expect((ts as string[]).slice(-1)[0]).toBe("d");
  });

  it("graphTopoSort: cycle returns null", () => {
    const g = G.graphFromEdges([["a", "b"], ["b", "c"], ["c", "a"]]);
    expect(G.graphTopoSort(g)).toBeNull();
  });

  it("graphIsCyclic: DAG is false", () => {
    const g = G.graphFromEdges([["a", "b"], ["b", "c"]]);
    expect(G.graphIsCyclic(g)).toBe(false);
  });

  it("graphIsCyclic: cycle is true", () => {
    const g = G.graphFromEdges([["a", "b"], ["b", "c"], ["c", "a"]]);
    expect(G.graphIsCyclic(g)).toBe(true);
  });

  it("graphMst: minimal spanning tree", () => {
    const g = G.graphNew(false);
    G.graphAddEdge(g, "a", "b", 1);
    G.graphAddEdge(g, "b", "c", 2);
    G.graphAddEdge(g, "a", "c", 5);
    const mst = G.graphMst(g);
    expect(mst.length).toBe(2);
    expect(mst[0].w + mst[1].w).toBe(3);
  });

  it("graphReverse: reverses edges", () => {
    const g = G.graphFromEdges([["a", "b"], ["b", "c"]]);
    const r = G.graphReverse(g);
    expect(G.graphNeighbors(r, "c")).toEqual(["b"]);
    expect(G.graphNeighbors(r, "b")).toEqual(["a"]);
  });

  it("graphFromEdges: builds from triples", () => {
    const g = G.graphFromEdges([["a", "b", 3], ["b", "c"]]);
    const edges = G.graphEdges(g);
    expect(edges[0].w).toBe(3);
    expect(edges[1].w).toBe(1);
  });

  it("graphToString: includes node count", () => {
    const g = G.graphFromEdges([["a", "b", 1], ["b", "c", 2]]);
    const s = G.graphToString(g);
    expect(s).toContain("3 nodes");
    expect(s).toContain("a -> [b(1)]");
  });
});
