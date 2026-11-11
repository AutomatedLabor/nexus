import { describe, it, expect } from "vitest";
import * as T from "./index";

describe("tree module", () => {
  // Build a sample tree:
  //   root
  //   ├─ a
  //   │  ├─ a1
  //   │  └─ a2
  //   └─ b
  function sample() {
    const root = T.treeNew("root");
    const a = T.treeAddChild(root, "a");
    T.treeAddChild(a, "a1");
    T.treeAddChild(a, "a2");
    T.treeAddChild(root, "b");
    return root;
  }

  it("treeNew / treeValue / treeChildren / treeIsLeaf", () => {
    const n = T.treeNew(42);
    expect(T.treeValue(n)).toBe(42);
    expect(T.treeChildren(n)).toEqual([]);
    expect(T.treeIsLeaf(n)).toBe(true);
  });

  it("treeAddChild: returns the new child", () => {
    const root = T.treeNew("r");
    const c = T.treeAddChild(root, "c");
    expect(T.treeValue(c)).toBe("c");
    expect(T.treeChildren(root).length).toBe(1);
  });

  it("treeSize", () => {
    expect(T.treeSize(sample())).toBe(5);
    expect(T.treeSize(T.treeNew("x"))).toBe(1);
  });

  it("treeDepth / treeHeight", () => {
    expect(T.treeDepth(sample())).toBe(3);
    expect(T.treeHeight(sample())).toBe(2);
    expect(T.treeDepth(T.treeNew("x"))).toBe(1);
    expect(T.treeHeight(T.treeNew("x"))).toBe(0);
  });

  it("treeMap: identity preserves shape", () => {
    const t = sample();
    const m = T.treeMap(t, (v) => v + "!");
    expect(T.treeFlatten(m)).toEqual(["root!", "a!", "a1!", "a2!", "b!"]);
  });

  it("treeFilter: keep matching branches", () => {
    const t = sample();
    const f = T.treeFilter(t, (v) => v.startsWith("a"));
    // root kept (has matching descendants); a kept; a1, a2 kept; b dropped
    expect(f).not.toBeNull();
    expect(T.treeFlatten(f!)).toEqual(["root", "a", "a1", "a2"]);
  });

  it("treeFilter: nothing matches returns null", () => {
    const t = sample();
    const f = T.treeFilter(t, (v) => v === "zzz");
    expect(f).toBeNull();
  });

  it("treeFind: matching value", () => {
    const t = sample();
    const found = T.treeFind(t, (v) => v === "a2");
    expect(found).not.toBeNull();
    expect(T.treeValue(found!)).toBe("a2");
  });

  it("treeFind: not found returns null", () => {
    const t = sample();
    expect(T.treeFind(t, (v) => v === "zzz")).toBeNull();
  });

  it("treePath", () => {
    const t = sample();
    expect(T.treePath(t, (v) => v === "a2")).toEqual(["root", "a", "a2"]);
    expect(T.treePath(t, (v) => v === "root")).toEqual(["root"]);
    expect(T.treePath(t, (v) => v === "zzz")).toBeNull();
  });

  it("treeFlatten: pre-order", () => {
    expect(T.treeFlatten(sample())).toEqual(["root", "a", "a1", "a2", "b"]);
  });

  it("treeWalk: visits every node", () => {
    const seen: string[] = [];
    T.treeWalk(sample(), (v) => seen.push(v));
    expect(seen).toEqual(["root", "a", "a1", "a2", "b"]);
  });

  it("treeBfs: level-by-level", () => {
    const seen: string[] = [];
    T.treeBfs(sample(), (v) => seen.push(v));
    expect(seen).toEqual(["root", "a", "b", "a1", "a2"]);
  });

  it("treeDfs: pre-order", () => {
    const seen: string[] = [];
    T.treeDfs(sample(), (v) => seen.push(v));
    expect(seen).toEqual(["root", "a", "a1", "a2", "b"]);
  });

  it("treePrint: produces multi-line tree", () => {
    const out = T.treePrint(sample());
    expect(out).toContain("root");
    expect(out).toContain("├─ a");
    expect(out).toContain("└─ b");
    expect(out).toContain("└─ a2");
  });

  it("treeToString: nested S-expression", () => {
    expect(T.treeToString(sample())).toBe("root(a(a1, a2), b)");
  });
  it("treeToString: leaf", () => {
    expect(T.treeToString(T.treeNew("x"))).toBe("x");
  });

  it("treeFromEdges: builds a tree", () => {
    const edges: Array<[string, string]> = [
      ["root", "a"],
      ["root", "b"],
      ["a", "a1"],
      ["a", "a2"],
    ];
    const t = T.treeFromEdges(edges);
    expect(t).not.toBeNull();
    expect(T.treeValue(t!)).toBe("root");
    expect(T.treeFlatten(t!)).toContain("a1");
    expect(T.treeSize(t!)).toBe(5);
  });
  it("treeFromEdges: empty returns null", () => {
    expect(T.treeFromEdges([])).toBeNull();
  });

  it("treeEquals: same shape & values", () => {
    const a = sample();
    const b = sample();
    expect(T.treeEquals(a, b)).toBe(true);
  });
  it("treeEquals: different shape", () => {
    const a = sample();
    const b = T.treeNew("root");
    expect(T.treeEquals(a, b)).toBe(false);
  });
  it("treeEquals: different values", () => {
    const a = sample();
    const b = T.treeMap(sample(), (v) => v + "!");
    expect(T.treeEquals(a, b)).toBe(false);
  });

  it("non-tree arg panics", () => {
    expect(() => T.treeValue(1 as any)).toThrow();
    expect(() => T.treeValue({} as any)).toThrow();
    expect(() => T.treeValue({ value: 1 } as any)).toThrow(); // no children
    expect(() => T.treeSize("x" as any)).toThrow();
  });
  it("non-function callback panics", () => {
    expect(() => T.treeMap(sample(), 1 as any)).toThrow();
    expect(() => T.treeWalk(sample(), 1 as any)).toThrow();
  });
  it("treeFilter: keep matching root only", () => {
    const t = T.treeNew("ok");
    const f = T.treeFilter(t, (v) => v === "ok");
    expect(f).not.toBeNull();
    expect(T.treeValue(f!)).toBe("ok");
  });
  it("treeBfs: single node", () => {
    const seen: string[] = [];
    T.treeBfs(T.treeNew("x"), (v) => seen.push(v));
    expect(seen).toEqual(["x"]);
  });
});
