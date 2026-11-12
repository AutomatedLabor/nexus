import { describe, it, expect } from "vitest";
import * as SCC from "./index";

describe("scc module", () => {
  // Construction --------------------------------------------------------
  it("sccNew: creates a graph with n vertices and no edges", () => {
    const g = SCC.sccNew(5);
    expect(g.n).toBe(5);
    expect(g.adj).toEqual([[], [], [], [], []]);
    expect(g.radj).toEqual([[], [], [], [], []]);
  });
  it("sccNew: throws on negative n", () => {
    expect(() => SCC.sccNew(-1)).toThrow(/non-negative integer/);
  });
  it("sccNew: throws on non-integer n", () => {
    expect(() => SCC.sccNew(2.5)).toThrow(/non-negative integer/);
  });
  it("sccNew: 0-vertex graph is valid", () => {
    const g = SCC.sccNew(0);
    expect(g.n).toBe(0);
    expect(SCC.sccTarjan(g)).toEqual([]);
  });

  // sccAddEdge ---------------------------------------------------------
  it("sccAddEdge: adds a forward edge and a reverse edge", () => {
    const g = SCC.sccNew(3);
    SCC.sccAddEdge(g, 0, 1);
    expect(g.adj[0]).toEqual([1]);
    expect(g.radj[1]).toEqual([0]);
  });
  it("sccAddEdge: throws on out-of-bounds u", () => {
    const g = SCC.sccNew(3);
    expect(() => SCC.sccAddEdge(g, 5, 0)).toThrow(/vertex out of bounds/);
  });
  it("sccAddEdge: throws on out-of-bounds v", () => {
    const g = SCC.sccNew(3);
    expect(() => SCC.sccAddEdge(g, 0, -1)).toThrow(/vertex out of bounds/);
  });
  it("sccAddEdge: throws on non-graph input", () => {
    expect(() => SCC.sccAddEdge(null as any, 0, 1)).toThrow(/expected an SccGraph/);
  });

  // Self-loops and trivial SCCs ----------------------------------------
  it("sccTarjan: a single vertex has one SCC", () => {
    const g = SCC.sccNew(1);
    const s = SCC.sccTarjan(g);
    expect(s).toEqual([[0]]);
  });
  it("sccTarjan: a self-loop makes a single-vertex SCC", () => {
    const g = SCC.sccNew(1);
    SCC.sccAddEdge(g, 0, 0);
    expect(SCC.sccTarjan(g)).toEqual([[0]]);
  });
  it("sccTarjan: a DAG has n singleton SCCs", () => {
    const g = SCC.sccNew(4);
    SCC.sccAddEdge(g, 0, 1);
    SCC.sccAddEdge(g, 1, 2);
    SCC.sccAddEdge(g, 2, 3);
    const s = SCC.sccTarjan(g);
    expect(s.length).toBe(4);
    // Each SCC is a singleton (in some order).
    const sizes = s.map((c) => c.length).sort();
    expect(sizes).toEqual([1, 1, 1, 1]);
  });

  // A real cycle --------------------------------------------------------
  it("sccTarjan: a 3-cycle is one SCC", () => {
    const g = SCC.sccNew(3);
    SCC.sccAddEdge(g, 0, 1);
    SCC.sccAddEdge(g, 1, 2);
    SCC.sccAddEdge(g, 2, 0);
    const s = SCC.sccTarjan(g);
    expect(s.length).toBe(1);
    expect(s[0].sort()).toEqual([0, 1, 2]);
  });

  // Two disjoint cycles -------------------------------------------------
  it("sccTarjan: two disjoint 2-cycles are two SCCs", () => {
    const g = SCC.sccNew(4);
    SCC.sccAddEdge(g, 0, 1);
    SCC.sccAddEdge(g, 1, 0);
    SCC.sccAddEdge(g, 2, 3);
    SCC.sccAddEdge(g, 3, 2);
    const s = SCC.sccTarjan(g);
    expect(s.length).toBe(2);
    const sets = s.map((c) => c.sort().join(",")).sort();
    expect(sets).toEqual(["0,1", "2,3"]);
  });

  // A graph with a cycle and tails --------------------------------------
  it("sccTarjan: a graph with a cycle and a tail", () => {
    // 0 -> 1 -> 2 -> 1 (cycle {1,2}), and 0 is a singleton.
    const g = SCC.sccNew(3);
    SCC.sccAddEdge(g, 0, 1);
    SCC.sccAddEdge(g, 1, 2);
    SCC.sccAddEdge(g, 2, 1);
    const s = SCC.sccTarjan(g);
    expect(s.length).toBe(2);
    const sets = s.map((c) => c.sort().join(",")).sort();
    expect(sets).toEqual(["0", "1,2"]);
  });

  // Kosaraju parity -----------------------------------------------------
  it("sccKosaraju: a 3-cycle is one SCC", () => {
    const g = SCC.sccNew(3);
    SCC.sccAddEdge(g, 0, 1);
    SCC.sccAddEdge(g, 1, 2);
    SCC.sccAddEdge(g, 2, 0);
    const s = SCC.sccKosaraju(g);
    expect(s.length).toBe(1);
    expect(s[0].sort()).toEqual([0, 1, 2]);
  });
  it("sccKosaraju: two disjoint 2-cycles are two SCCs", () => {
    const g = SCC.sccNew(4);
    SCC.sccAddEdge(g, 0, 1);
    SCC.sccAddEdge(g, 1, 0);
    SCC.sccAddEdge(g, 2, 3);
    SCC.sccAddEdge(g, 3, 2);
    const s = SCC.sccKosaraju(g);
    expect(s.length).toBe(2);
    const sets = s.map((c) => c.sort().join(",")).sort();
    expect(sets).toEqual(["0,1", "2,3"]);
  });
  it("sccKosaraju: a DAG has n singleton SCCs", () => {
    const g = SCC.sccNew(4);
    SCC.sccAddEdge(g, 0, 1);
    SCC.sccAddEdge(g, 1, 2);
    SCC.sccAddEdge(g, 2, 3);
    const s = SCC.sccKosaraju(g);
    expect(s.length).toBe(4);
  });
  it("sccKosaraju: 0-vertex graph returns empty", () => {
    expect(SCC.sccKosaraju(SCC.sccNew(0))).toEqual([]);
  });
  it("sccKosaraju: throws on non-graph", () => {
    expect(() => SCC.sccKosaraju(null as any)).toThrow(/expected an SccGraph/);
  });

  // Tarjan and Kosaraju agree (modulo order) ----------------------------
  it("sccTarjan and sccKosaraju: same SCC partition on a complex graph", () => {
    // 0 -> 1, 1 -> 2, 2 -> 0 (cycle {0,1,2}), 3 -> 1, 4 -> 3 (singletons).
    const g = SCC.sccNew(5);
    SCC.sccAddEdge(g, 0, 1);
    SCC.sccAddEdge(g, 1, 2);
    SCC.sccAddEdge(g, 2, 0);
    SCC.sccAddEdge(g, 3, 1);
    SCC.sccAddEdge(g, 4, 3);
    const t = SCC.sccTarjan(g).map((c) => c.sort().join(",")).sort();
    const k = SCC.sccKosaraju(g).map((c) => c.sort().join(",")).sort();
    expect(t).toEqual(k);
    expect(t).toEqual(["0,1,2", "3", "4"]);
  });

  // sccCount -------------------------------------------------------------
  it("sccCount: counts SCCs (Tarjan)", () => {
    const g = SCC.sccNew(5);
    SCC.sccAddEdge(g, 0, 1);
    SCC.sccAddEdge(g, 1, 2);
    SCC.sccAddEdge(g, 2, 0);
    SCC.sccAddEdge(g, 3, 4);
    expect(SCC.sccCount(g)).toBe(3); // {0,1,2}, {3}, {4}
  });
  it("sccCount: empty graph has 0 SCCs", () => {
    expect(SCC.sccCount(SCC.sccNew(0))).toBe(0);
  });
  it("sccCount: singleton graph has 1 SCC", () => {
    expect(SCC.sccCount(SCC.sccNew(1))).toBe(1);
  });

  // sccToList -----------------------------------------------------------
  it("sccToList: returns {vertex, component} pairs sorted by vertex", () => {
    const g = SCC.sccNew(5);
    SCC.sccAddEdge(g, 0, 1);
    SCC.sccAddEdge(g, 1, 2);
    SCC.sccAddEdge(g, 2, 0);
    SCC.sccAddEdge(g, 3, 4);
    const list = SCC.sccToList(g);
    expect(list.length).toBe(5);
    expect(list[0]).toEqual({ vertex: 0, component: expect.any(Number) });
    // 0, 1, 2 share a component; 3 and 4 are in different components.
    expect(list[0].component).toBe(list[1].component);
    expect(list[1].component).toBe(list[2].component);
    expect(list[3].component).not.toBe(list[0].component);
    expect(list[4].component).not.toBe(list[3].component);
  });
  it("sccToList: vertices are in ascending order", () => {
    const g = SCC.sccNew(3);
    SCC.sccAddEdge(g, 0, 1);
    SCC.sccAddEdge(g, 1, 0);
    const list = SCC.sccToList(g);
    expect(list.map((p) => p.vertex)).toEqual([0, 1, 2]);
  });
  it("sccToList: with algo='kosaraju' uses Kosaraju", () => {
    const g = SCC.sccNew(4);
    SCC.sccAddEdge(g, 0, 1);
    SCC.sccAddEdge(g, 1, 2);
    SCC.sccAddEdge(g, 2, 0);
    SCC.sccAddEdge(g, 3, 0);
    const list = SCC.sccToList(g, "kosaraju");
    expect(list.length).toBe(4);
    expect(list[0].component).toBe(list[1].component);
    expect(list[1].component).toBe(list[2].component);
    expect(list[3].component).not.toBe(list[0].component);
  });
  it("sccToList: throws on non-graph input", () => {
    expect(() => SCC.sccToList(null as any)).toThrow(/expected an SccGraph/);
  });
});
