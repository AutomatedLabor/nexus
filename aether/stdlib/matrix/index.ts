/**
 * Aether stdlib — `matrix` module.
 *
 * Matrix / linear-algebra operations on a 2D dense representation:
 *
 *   { rows: int, cols: int, data: number[] }
 *
 * where `data` is a flat row-major array of length `rows * cols`.
 * Element at row `r`, col `c` is `data[r * cols + c]`.  All matrices
 * are numeric (number-typed values); this is a linear-algebra
 * module, not a generalised 2D array module.
 *
 * All functions throw a plain `Error` on invalid input (size mismatch,
 * out-of-bounds indices, non-square determinant requests, …); the
 * evaluator converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Matrix {
  rows: number;
  cols: number;
  data: number[];
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Create a `rows × cols` matrix filled with `fill` (default 0). */
export function matrixNew(rows: number, cols: number, fill: number = 0): Matrix {
  assertDims(rows, cols, "matrixNew");
  if (typeof fill !== "number" || !Number.isFinite(fill)) throw new Error("matrixNew: fill must be a number");
  return { rows, cols, data: new Array<number>(rows * cols).fill(fill) };
}

/** Build a matrix from an array of row arrays. */
export function matrixFromRows(rows: number[][]): Matrix {
  if (!Array.isArray(rows)) throw new Error("matrixFromRows: expected array of rows");
  if (rows.length === 0) throw new Error("matrixFromRows: empty rows");
  const cols = rows[0].length;
  for (const r of rows) {
    if (!Array.isArray(r) || r.length !== cols) {
      throw new Error("matrixFromRows: all rows must be the same length");
    }
    for (const x of r) {
      if (typeof x !== "number" || !Number.isFinite(x)) {
        throw new Error("matrixFromRows: each cell must be a number");
      }
    }
  }
  const data: number[] = [];
  for (const r of rows) for (const x of r) data.push(x);
  return { rows: rows.length, cols, data };
}

/** Identity matrix of size `n × n`. */
export function matrixIdentity(n: number): Matrix {
  assertDims(n, n, "matrixIdentity");
  const m = matrixNew(n, n, 0);
  for (let i = 0; i < n; i++) m.data[i * n + i] = 1;
  return m;
}

/** Zero matrix of size `rows × cols`. */
export function matrixZero(rows: number, cols: number): Matrix {
  return matrixNew(rows, cols, 0);
}

/** Diagonal matrix from a 1D array. */
export function matrixDiagonal(v: number[]): Matrix {
  if (!Array.isArray(v)) throw new Error("matrixDiagonal: expected array");
  for (const x of v) if (typeof x !== "number" || !Number.isFinite(x)) throw new Error("matrixDiagonal: each element must be a number");
  const n = v.length;
  const m = matrixNew(n, n, 0);
  for (let i = 0; i < n; i++) m.data[i * n + i] = v[i];
  return m;
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/** Get the element at `(r, c)`.  Panics on out-of-bounds. */
export function matrixGet(m: Matrix, r: number, c: number): number {
  assertMatrix(m, "matrixGet");
  assertIdx(m, r, c, "matrixGet");
  return m.data[r * m.cols + c];
}

/** Set the element at `(r, c)` to `v`.  Panics on out-of-bounds. */
export function matrixSet(m: Matrix, r: number, c: number, v: number): void {
  assertMatrix(m, "matrixSet");
  assertIdx(m, r, c, "matrixSet");
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("matrixSet: value must be a number");
  m.data[r * m.cols + c] = v;
}

/** Number of rows. */
export function matrixRows(m: Matrix): number {
  assertMatrix(m, "matrixRows");
  return m.rows;
}

/** Number of columns. */
export function matrixCols(m: Matrix): number {
  assertMatrix(m, "matrixCols");
  return m.cols;
}

/** Return row `r` as a fresh array. */
export function matrixRow(m: Matrix, r: number): number[] {
  assertMatrix(m, "matrixRow");
  if (!Number.isInteger(r) || r < 0 || r >= m.rows) throw new Error("matrixRow: row index out of bounds");
  const out: number[] = [];
  for (let c = 0; c < m.cols; c++) out.push(m.data[r * m.cols + c]);
  return out;
}

/** Return column `c` as a fresh array. */
export function matrixCol(m: Matrix, c: number): number[] {
  assertMatrix(m, "matrixCol");
  if (!Number.isInteger(c) || c < 0 || c >= m.cols) throw new Error("matrixCol: column index out of bounds");
  const out: number[] = [];
  for (let r = 0; r < m.rows; r++) out.push(m.data[r * m.cols + c]);
  return out;
}

// ---------------------------------------------------------------------------
// Algebra
// ---------------------------------------------------------------------------

/** Transpose: `m^T`. */
export function matrixTranspose(m: Matrix): Matrix {
  assertMatrix(m, "matrixTranspose");
  const out = matrixNew(m.cols, m.rows, 0);
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      out.data[c * m.rows + r] = m.data[r * m.cols + c];
    }
  }
  return out;
}

/** Element-wise addition: `a + b`.  Shapes must match. */
export function matrixAdd(a: Matrix, b: Matrix): Matrix {
  assertMatrix(a, "matrixAdd");
  assertMatrix(b, "matrixAdd");
  assertSameShape(a, b, "matrixAdd");
  const out = matrixNew(a.rows, a.cols, 0);
  for (let i = 0; i < a.data.length; i++) out.data[i] = a.data[i] + b.data[i];
  return out;
}

/** Element-wise subtraction: `a - b`. */
export function matrixSub(a: Matrix, b: Matrix): Matrix {
  assertMatrix(a, "matrixSub");
  assertMatrix(b, "matrixSub");
  assertSameShape(a, b, "matrixSub");
  const out = matrixNew(a.rows, a.cols, 0);
  for (let i = 0; i < a.data.length; i++) out.data[i] = a.data[i] - b.data[i];
  return out;
}

/** Scalar multiplication: `m * s`. */
export function matrixScale(m: Matrix, s: number): Matrix {
  assertMatrix(m, "matrixScale");
  if (typeof s !== "number" || !Number.isFinite(s)) throw new Error("matrixScale: scalar must be a number");
  const out = matrixNew(m.rows, m.cols, 0);
  for (let i = 0; i < m.data.length; i++) out.data[i] = m.data[i] * s;
  return out;
}

/** Matrix multiplication: `a * b`.  `a.cols` must equal `b.rows`. */
export function matrixMul(a: Matrix, b: Matrix): Matrix {
  assertMatrix(a, "matrixMul");
  assertMatrix(b, "matrixMul");
  if (a.cols !== b.rows) throw new Error("matrixMul: a.cols must equal b.rows");
  const out = matrixNew(a.rows, b.cols, 0);
  for (let r = 0; r < a.rows; r++) {
    for (let c = 0; c < b.cols; c++) {
      let sum = 0;
      for (let k = 0; k < a.cols; k++) {
        sum += a.data[r * a.cols + k] * b.data[k * b.cols + c];
      }
      out.data[r * b.cols + c] = sum;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

/** Trace: sum of the diagonal entries.  Matrix must be square. */
export function matrixTrace(m: Matrix): number {
  assertMatrix(m, "matrixTrace");
  if (m.rows !== m.cols) throw new Error("matrixTrace: matrix must be square");
  let sum = 0;
  for (let i = 0; i < m.rows; i++) sum += m.data[i * m.cols + i];
  return sum;
}

/** Determinant of a 2×2 matrix. */
export function matrixDeterminant2(m: Matrix): number {
  assertMatrix(m, "matrixDeterminant2");
  if (m.rows !== 2 || m.cols !== 2) throw new Error("matrixDeterminant2: matrix must be 2x2");
  return m.data[0] * m.data[3] - m.data[1] * m.data[2];
}

/** Determinant of a 3×3 matrix (rule of Sarrus). */
export function matrixDeterminant3(m: Matrix): number {
  assertMatrix(m, "matrixDeterminant3");
  if (m.rows !== 3 || m.cols !== 3) throw new Error("matrixDeterminant3: matrix must be 3x3");
  const d = m.data;
  return (
    d[0] * (d[4] * d[8] - d[5] * d[7]) -
    d[1] * (d[3] * d[8] - d[5] * d[6]) +
    d[2] * (d[3] * d[7] - d[4] * d[6])
  );
}

// ---------------------------------------------------------------------------
// Higher-order
// ---------------------------------------------------------------------------

/** Apply `fn` to every element; return a new matrix. */
export function matrixMap(m: Matrix, fn: (v: number, r: number, c: number) => number): Matrix {
  assertMatrix(m, "matrixMap");
  if (typeof fn !== "function") throw new Error("matrixMap: expected function");
  const out = matrixNew(m.rows, m.cols, 0);
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      out.data[r * m.cols + c] = fn(m.data[r * m.cols + c], r, c);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "matrix",
  fns: [
    { name: "matrixNew", sig: "(rows, cols, fill?) -> Matrix", desc: "Create a rows x cols matrix filled with fill (default 0)." },
    { name: "matrixFromRows", sig: "(rows: number[][]) -> Matrix", desc: "Build a matrix from an array of row arrays." },
    { name: "matrixGet", sig: "(m, r, c) -> number", desc: "Get element at (r, c)." },
    { name: "matrixSet", sig: "(m, r, c, v) -> void", desc: "Set element at (r, c)." },
    { name: "matrixRows", sig: "(m) -> int", desc: "Number of rows." },
    { name: "matrixCols", sig: "(m) -> int", desc: "Number of columns." },
    { name: "matrixTranspose", sig: "(m) -> Matrix", desc: "Transpose m^T." },
    { name: "matrixAdd", sig: "(a, b) -> Matrix", desc: "Element-wise addition (shapes must match)." },
    { name: "matrixSub", sig: "(a, b) -> Matrix", desc: "Element-wise subtraction." },
    { name: "matrixScale", sig: "(m, s) -> Matrix", desc: "Scalar multiplication m * s." },
    { name: "matrixMul", sig: "(a, b) -> Matrix", desc: "Matrix multiplication a * b (a.cols == b.rows)." },
    { name: "matrixIdentity", sig: "(n) -> Matrix", desc: "Identity matrix of size n." },
    { name: "matrixZero", sig: "(rows, cols) -> Matrix", desc: "Zero matrix of size rows x cols." },
    { name: "matrixDiagonal", sig: "(v: number[]) -> Matrix", desc: "Diagonal matrix from a 1D array." },
    { name: "matrixTrace", sig: "(m) -> number", desc: "Trace (sum of diagonal); matrix must be square." },
    { name: "matrixDeterminant2", sig: "(m) -> number", desc: "Determinant of a 2x2 matrix." },
    { name: "matrixDeterminant3", sig: "(m) -> number", desc: "Determinant of a 3x3 matrix (Sarrus)." },
    { name: "matrixMap", sig: "(m, fn) -> Matrix", desc: "Apply fn(value, r, c) to every element." },
    { name: "matrixRow", sig: "(m, r) -> number[]", desc: "Return row r as a fresh array." },
    { name: "matrixCol", sig: "(m, c) -> number[]", desc: "Return column c as a fresh array." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("matrixNew", matrixNew);
  registerBuiltin("matrixFromRows", matrixFromRows);
  registerBuiltin("matrixGet", matrixGet);
  registerBuiltin("matrixSet", matrixSet);
  registerBuiltin("matrixRows", matrixRows);
  registerBuiltin("matrixCols", matrixCols);
  registerBuiltin("matrixTranspose", matrixTranspose);
  registerBuiltin("matrixAdd", matrixAdd);
  registerBuiltin("matrixSub", matrixSub);
  registerBuiltin("matrixScale", matrixScale);
  registerBuiltin("matrixMul", matrixMul);
  registerBuiltin("matrixIdentity", matrixIdentity);
  registerBuiltin("matrixZero", matrixZero);
  registerBuiltin("matrixDiagonal", matrixDiagonal);
  registerBuiltin("matrixTrace", matrixTrace);
  registerBuiltin("matrixDeterminant2", matrixDeterminant2);
  registerBuiltin("matrixDeterminant3", matrixDeterminant3);
  registerBuiltin("matrixMap", matrixMap);
  registerBuiltin("matrixRow", matrixRow);
  registerBuiltin("matrixCol", matrixCol);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertMatrix(x: any, fn: string): asserts x is Matrix {
  if (typeof x !== "object" || x === null ||
      typeof x.rows !== "number" || typeof x.cols !== "number" ||
      !Array.isArray(x.data) || x.data.length !== x.rows * x.cols) {
    throw new Error(fn + ": expected matrix, got " + describe(x));
  }
}

function assertDims(r: number, c: number, fn: string): void {
  if (!Number.isInteger(r) || !Number.isInteger(c) || r <= 0 || c <= 0) {
    throw new Error(fn + ": rows and cols must be positive integers");
  }
}

function assertIdx(m: Matrix, r: number, c: number, fn: string): void {
  if (!Number.isInteger(r) || r < 0 || r >= m.rows) throw new Error(fn + ": row index out of bounds");
  if (!Number.isInteger(c) || c < 0 || c >= m.cols) throw new Error(fn + ": column index out of bounds");
}

function assertSameShape(a: Matrix, b: Matrix, fn: string): void {
  if (a.rows !== b.rows || a.cols !== b.cols) {
    throw new Error(fn + ": shape mismatch (" + a.rows + "x" + a.cols + " vs " + b.rows + "x" + b.cols + ")");
  }
}

function describe(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
