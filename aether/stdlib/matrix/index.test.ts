import { describe, it, expect } from "vitest";
import * as M from "./index";

describe("matrix module", () => {
  it("matrixNew: default fill 0", () => {
    const m = M.matrixNew(2, 3);
    expect(m.rows).toBe(2);
    expect(m.cols).toBe(3);
    expect(m.data).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("matrixNew: custom fill", () => {
    const m = M.matrixNew(2, 2, 7);
    expect(m.data).toEqual([7, 7, 7, 7]);
  });

  it("matrixNew: panics on bad dimensions", () => {
    expect(() => M.matrixNew(0, 3)).toThrow();
    expect(() => M.matrixNew(-1, 3)).toThrow();
  });

  it("matrixFromRows: builds matrix", () => {
    const m = M.matrixFromRows([[1, 2, 3], [4, 5, 6]]);
    expect(m.rows).toBe(2);
    expect(m.cols).toBe(3);
    expect(m.data).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("matrixFromRows: panics on inconsistent row lengths", () => {
    expect(() => M.matrixFromRows([[1, 2], [3]])).toThrow();
  });

  it("matrixFromRows: panics on empty", () => {
    expect(() => M.matrixFromRows([])).toThrow();
  });

  it("matrixIdentity: 3x3 identity", () => {
    const m = M.matrixIdentity(3);
    expect(m.data).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("matrixZero", () => {
    const m = M.matrixZero(2, 2);
    expect(m.data).toEqual([0, 0, 0, 0]);
  });

  it("matrixDiagonal", () => {
    const m = M.matrixDiagonal([1, 2, 3]);
    expect(m.data).toEqual([1, 0, 0, 0, 2, 0, 0, 0, 3]);
  });

  it("matrixGet / matrixSet", () => {
    const m = M.matrixFromRows([[1, 2], [3, 4]]);
    expect(M.matrixGet(m, 0, 0)).toBe(1);
    expect(M.matrixGet(m, 1, 1)).toBe(4);
    M.matrixSet(m, 0, 1, 99);
    expect(M.matrixGet(m, 0, 1)).toBe(99);
  });

  it("matrixGet: panics on out-of-bounds", () => {
    const m = M.matrixNew(2, 2);
    expect(() => M.matrixGet(m, 5, 0)).toThrow();
  });

  it("matrixRows / matrixCols", () => {
    const m = M.matrixNew(3, 4);
    expect(M.matrixRows(m)).toBe(3);
    expect(M.matrixCols(m)).toBe(4);
  });

  it("matrixRow: returns row array", () => {
    const m = M.matrixFromRows([[1, 2, 3], [4, 5, 6]]);
    expect(M.matrixRow(m, 1)).toEqual([4, 5, 6]);
  });

  it("matrixCol: returns column array", () => {
    const m = M.matrixFromRows([[1, 2, 3], [4, 5, 6]]);
    expect(M.matrixCol(m, 1)).toEqual([2, 5]);
  });

  it("matrixTranspose: square", () => {
    const m = M.matrixFromRows([[1, 2], [3, 4]]);
    const t = M.matrixTranspose(m);
    expect(t.data).toEqual([1, 3, 2, 4]);
    expect(t.rows).toBe(2);
    expect(t.cols).toBe(2);
  });

  it("matrixTranspose: 2x3 becomes 3x2", () => {
    const m = M.matrixFromRows([[1, 2, 3], [4, 5, 6]]);
    const t = M.matrixTranspose(m);
    expect(t.rows).toBe(3);
    expect(t.cols).toBe(2);
    expect(t.data).toEqual([1, 4, 2, 5, 3, 6]);
  });

  it("matrixAdd: same shape", () => {
    const a = M.matrixFromRows([[1, 2], [3, 4]]);
    const b = M.matrixFromRows([[5, 6], [7, 8]]);
    const c = M.matrixAdd(a, b);
    expect(c.data).toEqual([6, 8, 10, 12]);
  });

  it("matrixAdd: panics on shape mismatch", () => {
    const a = M.matrixNew(2, 3);
    const b = M.matrixNew(3, 2);
    expect(() => M.matrixAdd(a, b)).toThrow();
  });

  it("matrixSub", () => {
    const a = M.matrixFromRows([[5, 6], [7, 8]]);
    const b = M.matrixFromRows([[1, 2], [3, 4]]);
    expect(M.matrixSub(a, b).data).toEqual([4, 4, 4, 4]);
  });

  it("matrixScale", () => {
    const a = M.matrixFromRows([[1, 2], [3, 4]]);
    expect(M.matrixScale(a, 3).data).toEqual([3, 6, 9, 12]);
  });

  it("matrixMul: 2x2 * 2x2", () => {
    const a = M.matrixFromRows([[1, 2], [3, 4]]);
    const b = M.matrixFromRows([[5, 6], [7, 8]]);
    const c = M.matrixMul(a, b);
    // [[1*5+2*7, 1*6+2*8], [3*5+4*7, 3*6+4*8]] = [[19, 22], [43, 50]]
    expect(c.data).toEqual([19, 22, 43, 50]);
  });

  it("matrixMul: 2x3 * 3x2 = 2x2", () => {
    const a = M.matrixFromRows([[1, 2, 3], [4, 5, 6]]);
    const b = M.matrixFromRows([[7, 8], [9, 10], [11, 12]]);
    const c = M.matrixMul(a, b);
    // [[1*7+2*9+3*11, 1*8+2*10+3*12], [4*7+5*9+6*11, 4*8+5*10+6*12]]
    // = [[58, 64], [139, 154]]
    expect(c.data).toEqual([58, 64, 139, 154]);
    expect(c.rows).toBe(2);
    expect(c.cols).toBe(2);
  });

  it("matrixMul: identity is the unit", () => {
    const a = M.matrixFromRows([[1, 2], [3, 4]]);
    const i = M.matrixIdentity(2);
    expect(M.matrixMul(a, i).data).toEqual(a.data);
  });

  it("matrixMul: panics on shape mismatch", () => {
    const a = M.matrixNew(2, 3);
    const b = M.matrixNew(2, 3);
    expect(() => M.matrixMul(a, b)).toThrow();
  });

  it("matrixTrace", () => {
    const m = M.matrixFromRows([[1, 2], [3, 4]]);
    expect(M.matrixTrace(m)).toBe(5);
  });

  it("matrixTrace: panics on non-square", () => {
    const m = M.matrixNew(2, 3);
    expect(() => M.matrixTrace(m)).toThrow();
  });

  it("matrixDeterminant2", () => {
    const m = M.matrixFromRows([[1, 2], [3, 4]]);
    expect(M.matrixDeterminant2(m)).toBe(-2);
  });

  it("matrixDeterminant3", () => {
    const m = M.matrixFromRows([[6, 1, 1], [4, -2, 5], [2, 8, 7]]);
    // det = 6*(-2*7 - 5*8) - 1*(4*7 - 5*2) + 1*(4*8 - (-2)*2)
    //     = 6*(-14 - 40) - 1*(28 - 10) + 1*(32 + 4)
    //     = 6*(-54) - 18 + 36 = -324 - 18 + 36 = -306
    expect(M.matrixDeterminant3(m)).toBe(-306);
  });

  it("matrixMap: square every element", () => {
    const m = M.matrixFromRows([[1, 2], [3, 4]]);
    const out = M.matrixMap(m, (v) => v * v);
    expect(out.data).toEqual([1, 4, 9, 16]);
  });

  it("matrixMap: receives row and col indices", () => {
    const m = M.matrixFromRows([[0, 0], [0, 0]]);
    const out = M.matrixMap(m, (_v, r, c) => r * 10 + c);
    expect(out.data).toEqual([0, 1, 10, 11]);
  });
});
