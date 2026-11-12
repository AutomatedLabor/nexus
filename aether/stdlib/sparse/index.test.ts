import { describe, it, expect } from "vitest";
import * as S from "./index";

describe("sparse module", () => {
  it("sparseNew: creates a zero matrix with empty rows", () => {
    const m = S.sparseNew(3, 4);
    expect(m.rows).toBe(3);
    expect(m.cols).toBe(4);
    expect(m.data.length).toBe(3);
    expect(m.data[0].size).toBe(0);
    expect(S.sparseNNZ(m)).toBe(0);
    expect(S.sparseDensity(m)).toBe(0);
  });

  it("sparseNew: rejects negative dimensions", () => {
    expect(() => S.sparseNew(-1, 3)).toThrow();
    expect(() => S.sparseNew(3, -1)).toThrow();
  });

  it("sparseNew: zero matrix is allowed", () => {
    const m = S.sparseNew(0, 0);
    expect(m.rows).toBe(0);
    expect(m.cols).toBe(0);
    expect(S.sparseNNZ(m)).toBe(0);
    expect(S.sparseDensity(m)).toBe(0);
  });

  it("sparseSet: stores a value", () => {
    const m = S.sparseNew(3, 3);
    S.sparseSet(m, 0, 0, 5);
    expect(S.sparseGet(m, 0, 0)).toBe(5);
    expect(S.sparseNNZ(m)).toBe(1);
  });

  it("sparseSet: storing zero deletes the entry", () => {
    const m = S.sparseNew(3, 3);
    S.sparseSet(m, 1, 1, 9);
    expect(S.sparseNNZ(m)).toBe(1);
    S.sparseSet(m, 1, 1, 0);
    expect(S.sparseNNZ(m)).toBe(0);
    expect(S.sparseGet(m, 1, 1)).toBe(0);
  });

  it("sparseSet: is chainable", () => {
    const m = S.sparseNew(2, 2);
    expect(S.sparseSet(m, 0, 0, 1)).toBe(m);
  });

  it("sparseSet: rejects out-of-range indices", () => {
    const m = S.sparseNew(2, 2);
    expect(() => S.sparseSet(m, -1, 0, 1)).toThrow();
    expect(() => S.sparseSet(m, 0, -1, 1)).toThrow();
    expect(() => S.sparseSet(m, 2, 0, 1)).toThrow();
    expect(() => S.sparseSet(m, 0, 2, 1)).toThrow();
  });

  it("sparseGet: returns 0 for unstored entries", () => {
    const m = S.sparseNew(3, 3);
    expect(S.sparseGet(m, 1, 1)).toBe(0);
  });

  it("sparseGet: rejects out-of-range indices", () => {
    const m = S.sparseNew(2, 2);
    expect(() => S.sparseGet(m, 5, 0)).toThrow();
  });

  it("sparseAdd: sums two matrices", () => {
    const a = S.sparseNew(2, 2);
    S.sparseSet(a, 0, 0, 1);
    S.sparseSet(a, 1, 1, 2);
    const b = S.sparseNew(2, 2);
    S.sparseSet(b, 0, 0, 3);
    S.sparseSet(b, 0, 1, 4);
    const c = S.sparseAdd(a, b);
    expect(S.sparseToDense(c)).toEqual([[4, 4], [0, 2]]);
  });

  it("sparseAdd: stores zero where values cancel exactly", () => {
    const a = S.sparseNew(2, 2);
    S.sparseSet(a, 0, 0, 5);
    const b = S.sparseNew(2, 2);
    S.sparseSet(b, 0, 0, -5);
    const c = S.sparseAdd(a, b);
    expect(S.sparseNNZ(c)).toBe(0);
  });

  it("sparseAdd: rejects dimension mismatch", () => {
    const a = S.sparseNew(2, 3);
    const b = S.sparseNew(3, 2);
    expect(() => S.sparseAdd(a, b)).toThrow();
  });

  it("sparseMul: multiplies two matrices", () => {
    const a = S.sparseFromDense([[1, 2], [3, 4]]);
    const b = S.sparseFromDense([[5, 6], [7, 8]]);
    const c = S.sparseMul(a, b);
    expect(S.sparseToDense(c)).toEqual([[19, 22], [43, 50]]);
  });

  it("sparseMul: identity times matrix is the matrix", () => {
    const a = S.sparseFromDense([[1, 2, 3], [4, 5, 6]]);
    const i = S.sparseFromDense([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    expect(S.sparseToDense(S.sparseMul(a, i))).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it("sparseMul: rejects incompatible dimensions", () => {
    const a = S.sparseNew(2, 3);
    const b = S.sparseNew(2, 3);
    expect(() => S.sparseMul(a, b)).toThrow();
  });

  it("sparseMul: skips empty rows efficiently", () => {
    const a = S.sparseNew(2, 2); // all zeros
    const b = S.sparseFromDense([[1, 2], [3, 4]]);
    const c = S.sparseMul(a, b);
    expect(S.sparseNNZ(c)).toBe(0);
  });

  it("sparseTranspose: swaps dimensions and entries", () => {
    const m = S.sparseFromDense([[1, 0, 2], [0, 3, 0]]);
    const t = S.sparseTranspose(m);
    expect(t.rows).toBe(3);
    expect(t.cols).toBe(2);
    expect(S.sparseToDense(t)).toEqual([[1, 0], [0, 3], [2, 0]]);
  });

  it("sparseTranspose: double transpose is identity", () => {
    const m = S.sparseFromDense([[1, 2, 0], [0, 0, 3]]);
    const tt = S.sparseTranspose(S.sparseTranspose(m));
    expect(S.sparseToDense(tt)).toEqual([[1, 2, 0], [0, 0, 3]]);
  });

  it("sparseNNZ: counts stored entries", () => {
    const m = S.sparseFromDense([[0, 1, 0], [2, 0, 3]]);
    expect(S.sparseNNZ(m)).toBe(3);
  });

  it("sparseDensity: ratio of stored to total", () => {
    const m = S.sparseFromDense([[0, 1, 0], [2, 0, 3]]);
    expect(S.sparseDensity(m)).toBeCloseTo(3 / 6);
  });

  it("sparseDensity: 0 for zero matrix", () => {
    expect(S.sparseDensity(S.sparseNew(5, 5))).toBe(0);
  });

  it("sparseDensity: 0 for empty (0x0) matrix", () => {
    expect(S.sparseDensity(S.sparseNew(0, 0))).toBe(0);
  });

  it("sparseToDense: produces a rows x cols grid", () => {
    const m = S.sparseFromDense([[1, 2, 0], [0, 0, 3]]);
    const d = S.sparseToDense(m);
    expect(d).toEqual([[1, 2, 0], [0, 0, 3]]);
    expect(d.length).toBe(2);
    expect(d[0].length).toBe(3);
  });

  it("sparseFromDense: skips zeros", () => {
    const m = S.sparseFromDense([[0, 0, 0], [0, 1, 0]]);
    expect(S.sparseNNZ(m)).toBe(1);
  });

  it("sparseFromDense: handles jagged input by padding", () => {
    const m = S.sparseFromDense([[1, 2], [3]]);
    expect(m.rows).toBe(2);
    expect(m.cols).toBe(2);
    expect(S.sparseToDense(m)).toEqual([[1, 2], [3, 0]]);
  });

  it("sparseFromDense: rejects non-array input", () => {
    expect(() => S.sparseFromDense(null as any)).toThrow();
    expect(() => S.sparseFromDense([1, 2, 3] as any)).toThrow();
  });

  it("sparse: validators reject bad input", () => {
    expect(() => S.sparseSet(null as any, 0, 0, 1)).toThrow();
    expect(() => S.sparseSet({ rows: 2, cols: 2 } as any, 0, 0, 1)).toThrow();
  });
});
