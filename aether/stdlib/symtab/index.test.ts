import { describe, it, expect } from "vitest";
import * as S from "./index";

describe("symtab module", () => {
  it("symtabNew: creates empty table with zero depth", () => {
    const t = S.symtabNew();
    expect(S.symtabCurrentDepth(t)).toBe(0);
    expect(S.symtabAll(t)).toEqual([]);
    expect(S.symtabToString(t)).toBe("<symtab empty>");
  });

  it("symtabEnter: pushes a frame and increases depth", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    expect(S.symtabCurrentDepth(t)).toBe(1);
    S.symtabEnter(t);
    expect(S.symtabCurrentDepth(t)).toBe(2);
  });

  it("symtabEnter: is chainable", () => {
    const t = S.symtabNew();
    expect(S.symtabEnter(t)).toBe(t);
  });

  it("symtabExit: pops a frame and decreases depth", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    S.symtabEnter(t);
    expect(S.symtabExit(t)).toBe(true);
    expect(S.symtabCurrentDepth(t)).toBe(1);
  });

  it("symtabExit: returns false on empty table (no-op)", () => {
    const t = S.symtabNew();
    expect(S.symtabExit(t)).toBe(false);
    expect(S.symtabCurrentDepth(t)).toBe(0);
  });

  it("symtabInsert: writes a binding into the current frame", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    S.symtabInsert(t, "x", 42);
    expect(S.symtabLookup(t, "x")).toBe(42);
  });

  it("symtabInsert: is chainable", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    expect(S.symtabInsert(t, "x", 1)).toBe(t);
  });

  it("symtabInsert: overwrites an existing binding in the same frame", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    S.symtabInsert(t, "x", 1);
    S.symtabInsert(t, "x", 2);
    expect(S.symtabLookup(t, "x")).toBe(2);
  });

  it("symtabInsert: throws when there is no active frame", () => {
    const t = S.symtabNew();
    expect(() => S.symtabInsert(t, "x", 1)).toThrow();
  });

  it("symtabInsert: throws on empty name", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    expect(() => S.symtabInsert(t, "", 1)).toThrow();
  });

  it("symtabLookup: walks the chain from deepest to shallowest", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    S.symtabInsert(t, "x", 1);
    S.symtabEnter(t);
    S.symtabInsert(t, "x", 2);
    S.symtabEnter(t);
    S.symtabInsert(t, "x", 3);
    expect(S.symtabLookup(t, "x")).toBe(3);
    S.symtabExit(t);
    expect(S.symtabLookup(t, "x")).toBe(2);
    S.symtabExit(t);
    expect(S.symtabLookup(t, "x")).toBe(1);
  });

  it("symtabLookup: returns undefined when not found", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    S.symtabInsert(t, "a", 1);
    expect(S.symtabLookup(t, "b")).toBeUndefined();
  });

  it("symtabLookup: returns undefined on empty table", () => {
    const t = S.symtabNew();
    expect(S.symtabLookup(t, "x")).toBeUndefined();
  });

  it("symtabLookup: throws on empty name", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    expect(() => S.symtabLookup(t, "")).toThrow();
  });

  it("symtabLookupLocal: checks only the current frame", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    S.symtabInsert(t, "x", 1);
    S.symtabEnter(t);
    S.symtabInsert(t, "y", 2);
    expect(S.symtabLookupLocal(t, "x")).toBeUndefined();
    expect(S.symtabLookupLocal(t, "y")).toBe(2);
  });

  it("symtabLookupLocal: returns undefined on empty table", () => {
    const t = S.symtabNew();
    expect(S.symtabLookupLocal(t, "x")).toBeUndefined();
  });

  it("symtabShadow: inserts when no local binding exists", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    S.symtabInsert(t, "x", 1);
    S.symtabEnter(t);
    expect(S.symtabShadow(t, "x", 2)).toBe(true);
    expect(S.symtabLookupLocal(t, "x")).toBe(2);
    expect(S.symtabLookup(t, "x")).toBe(2); // now shadows the outer
  });

  it("symtabShadow: refuses to insert when a local binding already exists", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    S.symtabInsert(t, "x", 1);
    expect(S.symtabShadow(t, "x", 2)).toBe(false);
    expect(S.symtabLookup(t, "x")).toBe(1);
  });

  it("symtabShadow: throws when no active frame", () => {
    const t = S.symtabNew();
    expect(() => S.symtabShadow(t, "x", 1)).toThrow();
  });

  it("symtabCurrentDepth: tracks enter/exit", () => {
    const t = S.symtabNew();
    expect(S.symtabCurrentDepth(t)).toBe(0);
    S.symtabEnter(t);
    expect(S.symtabCurrentDepth(t)).toBe(1);
    S.symtabEnter(t);
    expect(S.symtabCurrentDepth(t)).toBe(2);
    S.symtabExit(t);
    expect(S.symtabCurrentDepth(t)).toBe(1);
  });

  it("symtabAll: returns visible bindings with depth, sorted by name", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    S.symtabInsert(t, "a", 1);
    S.symtabInsert(t, "b", 2);
    S.symtabEnter(t);
    S.symtabInsert(t, "b", 20); // shadows outer b
    S.symtabInsert(t, "c", 3);
    const all = S.symtabAll(t);
    expect(all).toEqual([
      { name: "a", value: 1, depth: 0 },
      { name: "b", value: 20, depth: 1 },
      { name: "c", value: 3, depth: 1 },
    ]);
  });

  it("symtabAll: returns [] on empty table", () => {
    const t = S.symtabNew();
    expect(S.symtabAll(t)).toEqual([]);
  });

  it("symtabAll: handles empty frames (no bindings)", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    S.symtabEnter(t);
    expect(S.symtabAll(t)).toEqual([]);
  });

  it("symtabToString: dumps each frame", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    S.symtabInsert(t, "x", 1);
    S.symtabInsert(t, "y", "hi");
    S.symtabEnter(t);
    S.symtabInsert(t, "z", true);
    const s = S.symtabToString(t);
    expect(s).toContain("d0: { x=1, y=\"hi\" }");
    expect(s).toContain("d1: { z=true }");
  });

  it("symtabToString: empty frame", () => {
    const t = S.symtabNew();
    S.symtabEnter(t);
    expect(S.symtabToString(t)).toBe("d0: {}");
  });

  it("symtab: validators reject bad input", () => {
    expect(() => S.symtabEnter(null as any)).toThrow();
    expect(() => S.symtabEnter({} as any)).toThrow();
    expect(() => S.symtabExit({ frames: "not-an-array" } as any)).toThrow();
    expect(() => S.symtabInsert(null as any, "x", 1)).toThrow();
  });
});
