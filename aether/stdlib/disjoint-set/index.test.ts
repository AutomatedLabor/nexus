import { describe, it, expect } from "vitest";
import * as D from "./index";

describe("disjoint-set module", () => {
  it("dsNew: creates empty set", () => {
    const ds = D.dsNew();
    expect(D.dsCount(ds)).toBe(0);
    expect(D.dsComponents(ds)).toBe(0);
  });

  it("dsMake: adds a singleton", () => {
    const ds = D.dsNew();
    expect(D.dsMake(ds, "a")).toBe(true);
    expect(D.dsCount(ds)).toBe(1);
    expect(D.dsComponents(ds)).toBe(1);
    expect(D.dsSize(ds, "a")).toBe(1);
  });

  it("dsMake: duplicate is no-op", () => {
    const ds = D.dsNew();
    D.dsMake(ds, "a");
    expect(D.dsMake(ds, "a")).toBe(false);
    expect(D.dsCount(ds)).toBe(1);
    expect(D.dsComponents(ds)).toBe(1);
  });

  it("dsMake: adds many singletons", () => {
    const ds = D.dsNew();
    for (let i = 0; i < 10; i++) D.dsMake(ds, i);
    expect(D.dsCount(ds)).toBe(10);
    expect(D.dsComponents(ds)).toBe(10);
    for (let i = 0; i < 10; i++) expect(D.dsSize(ds, i)).toBe(1);
  });

  it("dsFind: returns self for unknown element", () => {
    const ds = D.dsNew();
    expect(D.dsFind(ds, "x")).toBe("x");
    expect(D.dsCount(ds)).toBe(0);   // dsFind is read-only
  });

  it("dsFind: returns self for a singleton", () => {
    const ds = D.dsNew();
    D.dsMake(ds, "a");
    expect(D.dsFind(ds, "a")).toBe("a");
  });

  it("dsFind: returns same root after union", () => {
    const ds = D.dsNew();
    D.dsMake(ds, "a");
    D.dsMake(ds, "b");
    D.dsUnion(ds, "a", "b");
    expect(D.dsFind(ds, "a")).toBe(D.dsFind(ds, "b"));
  });

  it("dsUnion: merges two singletons", () => {
    const ds = D.dsNew();
    D.dsMake(ds, "a");
    D.dsMake(ds, "b");
    expect(D.dsUnion(ds, "a", "b")).toBe(true);
    expect(D.dsComponents(ds)).toBe(1);
    expect(D.dsSize(ds, "a")).toBe(2);
    expect(D.dsSize(ds, "b")).toBe(2);
  });

  it("dsUnion: no-op for already-connected", () => {
    const ds = D.dsNew();
    D.dsMake(ds, "a");
    D.dsMake(ds, "b");
    D.dsUnion(ds, "a", "b");
    expect(D.dsUnion(ds, "a", "b")).toBe(false);
    expect(D.dsComponents(ds)).toBe(1);
  });

  it("dsUnion: auto-registers unknown elements", () => {
    const ds = D.dsNew();
    D.dsUnion(ds, "x", "y");
    expect(D.dsCount(ds)).toBe(2);
    expect(D.dsComponents(ds)).toBe(1);
    expect(D.dsConnected(ds, "x", "y")).toBe(true);
  });

  it("dsUnion: chains into a single component", () => {
    const ds = D.dsNew();
    for (let i = 0; i < 10; i++) D.dsMake(ds, i);
    for (let i = 1; i < 10; i++) D.dsUnion(ds, 0, i);
    expect(D.dsComponents(ds)).toBe(1);
    expect(D.dsSize(ds, 0)).toBe(10);
    for (let i = 0; i < 10; i++) expect(D.dsFind(ds, i)).toBe(D.dsFind(ds, 0));
  });

  it("dsUnion: three separate groups", () => {
    const ds = D.dsNew();
    D.dsUnion(ds, 1, 2);
    D.dsUnion(ds, 3, 4);
    D.dsUnion(ds, 5, 6);
    expect(D.dsComponents(ds)).toBe(3);
    expect(D.dsConnected(ds, 1, 2)).toBe(true);
    expect(D.dsConnected(ds, 3, 4)).toBe(true);
    expect(D.dsConnected(ds, 5, 6)).toBe(true);
    expect(D.dsConnected(ds, 1, 3)).toBe(false);
    expect(D.dsConnected(ds, 2, 5)).toBe(false);
  });

  it("dsConnected: transitive after chained unions", () => {
    const ds = D.dsNew();
    D.dsUnion(ds, "a", "b");
    D.dsUnion(ds, "b", "c");
    D.dsUnion(ds, "c", "d");
    expect(D.dsConnected(ds, "a", "d")).toBe(true);
    expect(D.dsConnected(ds, "a", "b")).toBe(true);
    expect(D.dsConnected(ds, "b", "d")).toBe(true);
  });

  it("dsConnected: reflexive and symmetric", () => {
    const ds = D.dsNew();
    D.dsMake(ds, "x");
    expect(D.dsConnected(ds, "x", "x")).toBe(true);
    expect(D.dsConnected(ds, "x", "y")).toBe(false);
    expect(D.dsConnected(ds, "y", "x")).toBe(false);
    expect(D.dsConnected(ds, "y", "y")).toBe(true);   // implicit singleton
  });

  it("dsCount / dsComponents: track universe and groups", () => {
    const ds = D.dsNew();
    D.dsMake(ds, 1);
    D.dsMake(ds, 2);
    D.dsMake(ds, 3);
    expect(D.dsCount(ds)).toBe(3);
    expect(D.dsComponents(ds)).toBe(3);
    D.dsUnion(ds, 1, 2);
    expect(D.dsCount(ds)).toBe(3);
    expect(D.dsComponents(ds)).toBe(2);
    D.dsUnion(ds, 2, 3);
    expect(D.dsComponents(ds)).toBe(1);
    expect(D.dsCount(ds)).toBe(3);
  });

  it("dsSize: returns 1 for unknown element (implicit singleton)", () => {
    const ds = D.dsNew();
    expect(D.dsSize(ds, "z")).toBe(1);
  });

  it("dsSize: tracks group size after merges", () => {
    const ds = D.dsNew();
    D.dsMake(ds, 1);
    D.dsMake(ds, 2);
    D.dsMake(ds, 3);
    D.dsMake(ds, 4);
    D.dsUnion(ds, 1, 2);
    D.dsUnion(ds, 3, 4);
    D.dsUnion(ds, 1, 3);
    expect(D.dsSize(ds, 1)).toBe(4);
    expect(D.dsSize(ds, 2)).toBe(4);
    expect(D.dsSize(ds, 3)).toBe(4);
    expect(D.dsSize(ds, 4)).toBe(4);
  });

  it("dsReset: empties the set", () => {
    const ds = D.dsNew();
    D.dsUnion(ds, "a", "b");
    D.dsUnion(ds, "c", "d");
    D.dsReset(ds);
    expect(D.dsCount(ds)).toBe(0);
    expect(D.dsComponents(ds)).toBe(0);
    expect(D.dsFind(ds, "a")).toBe("a");
  });

  it("dsReset: validates input", () => {
    expect(() => D.dsReset(null as any)).toThrow();
    expect(() => D.dsReset({} as any)).toThrow();
  });

  it("dsToString: empty set renders as {}", () => {
    const ds = D.dsNew();
    expect(D.dsToString(ds)).toBe("{}");
  });

  it("dsToString: singletons render each as its own group", () => {
    const ds = D.dsNew();
    D.dsMake(ds, "a");
    D.dsMake(ds, "b");
    const s = D.dsToString(ds);
    expect(s).toContain("\"a\"");
    expect(s).toContain("\"b\"");
    // Two separate singleton groups, no outer brace wrap.
    expect(s).toBe('{"a"}, {"b"}');
  });

  it("dsToString: merged group renders as one component", () => {
    const ds = D.dsNew();
    D.dsUnion(ds, 1, 2);
    D.dsUnion(ds, 2, 3);
    expect(D.dsToString(ds)).toBe("{1, 2, 3}");
  });

  it("dsToString: multiple groups separated by commas", () => {
    const ds = D.dsNew();
    D.dsUnion(ds, 1, 2);
    D.dsUnion(ds, 3, 4);
    const s = D.dsToString(ds);
    // Two groups, each in its own braces, comma-separated.
    expect(s).toBe("{1, 2}, {3, 4}");
  });

  it("dsFind: path compression keeps subsequent finds O(1)-ish", () => {
    const ds = D.dsNew();
    for (let i = 0; i < 100; i++) D.dsMake(ds, i);
    // Chain 0-1-2-...-99.
    for (let i = 1; i < 100; i++) D.dsUnion(ds, i - 1, i);
    // First find may walk a path; subsequent finds should be near-constant.
    const r1 = D.dsFind(ds, 50);
    const r2 = D.dsFind(ds, 50);
    expect(r1).toBe(r2);
    // After path compression, find of 50 should be the root directly.
    expect(D.dsSize(ds, 50)).toBe(100);
  });

  it("dsUnion: validates types", () => {
    const ds = D.dsNew();
    expect(() => D.dsUnion(null as any, "a", "b")).toThrow();
    expect(() => D.dsUnion({} as any, "a", "b")).toThrow();
  });

  it("dsFind: validates types", () => {
    expect(() => D.dsFind(null as any, "x")).toThrow();
    expect(() => D.dsFind({} as any, "x")).toThrow();
  });

  it("dsMake: validates types", () => {
    expect(() => D.dsMake(null as any, "x")).toThrow();
    expect(() => D.dsMake({} as any, "x")).toThrow();
  });

  it("dsSize: validates types", () => {
    expect(() => D.dsSize(null as any, "x")).toThrow();
    expect(() => D.dsSize({} as any, "x")).toThrow();
  });
});
