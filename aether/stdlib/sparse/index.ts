/**
 * Aether stdlib — `sparse` module.
 *
 * A simple sparse matrix using row-wise compressed storage. Each
 * row is a `Map<col, value>` — lookup and update are O(1) average,
 * iteration is O(nnz_in_row) per row.  Dense matrices are plain JS
 * arrays of arrays of numbers; conversion helpers go both ways.
 *
 * Operations supported:
 *   - sparseNew, sparseGet, sparseSet          — basic CRUD
 *   - sparseAdd, sparseMul                    — arithmetic
 *   - sparseTranspose                         — transpose
 *   - sparseDensity, sparseNNZ                — density metrics
 *   - sparseToDense, sparseFromDense           — conversions
 *
 * All functions throw a plain `Error` on invalid input.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SparseMatrix {
  rows: number;
  cols: number;
  /** `data[i]` is a Map<col, value> for row i.  Rows with no stored
   *  values are still represented (by an empty Map) so the index
   *  space is well defined. */
  data: Array<Map<number, number>>;
}

// ---------------------------------------------------------------------------
// Construction & CRUD
// ---------------------------------------------------------------------------

/** Create a fresh `rows × cols` sparse matrix with all entries zero. */
export function sparseNew(rows: number, cols: number): SparseMatrix {
  assertInt(rows, "sparseNew", "rows");
  assertInt(cols, "sparseNew", "cols");
  if (rows < 0 || cols < 0) throw new Error("sparseNew: dimensions must be non-negative");
  const data: Array<Map<number, number>> = new Array(rows);
  for (let i = 0; i < rows; i++) data[i] = new Map();
  return { rows, cols, data };
}

/** Set `m[i][j] = value`.  Storing a zero deletes the entry (keeping
 *  the matrix sparse).  Returns the matrix (chainable).  Throws on
 *  out-of-range indices. */
export function sparseSet(m: SparseMatrix, i: number, j: number, value: number): SparseMatrix {
  assertMatrix(m, "sparseSet");
  assertInt(i, "sparseSet", "i");
  assertInt(j, "sparseSet", "j");
  assertNum(value, "sparseSet", "value");
  if (i < 0 || i >= m.rows || j < 0 || j >= m.cols) {
    throw new Error(`sparseSet: index (${i}, ${j}) out of range for ${m.rows}x${m.cols} matrix`);
  }
  if (value === 0) {
    m.data[i].delete(j);
  } else {
    m.data[i].set(j, value);
  }
  return m;
}

/** Get `m[i][j]` (0 if no entry is stored).  Throws on
 *  out-of-range indices. */
export function sparseGet(m: SparseMatrix, i: number, j: number): number {
  assertMatrix(m, "sparseGet");
  assertInt(i, "sparseGet", "i");
  assertInt(j, "sparseGet", "j");
  if (i < 0 || i >= m.rows || j < 0 || j >= m.cols) {
    throw new Error(`sparseGet: index (${i}, ${j}) out of range for ${m.rows}x${m.cols} matrix`);
  }
  const v = m.data[i].get(j);
  return v === undefined ? 0 : v;
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

/** C = A + B.  Both matrices must have matching dimensions.  Returns
 *  a fresh sparse matrix; inputs are not mutated. */
export function sparseAdd(a: SparseMatrix, b: SparseMatrix): SparseMatrix {
  assertMatrix(a, "sparseAdd");
  assertMatrix(b, "sparseAdd");
  if (a.rows !== b.rows || a.cols !== b.cols) {
    throw new Error(`sparseAdd: dimension mismatch (${a.rows}x${a.cols} vs ${b.rows}x${b.cols})`);
  }
  const out = sparseNew(a.rows, a.cols);
  for (let i = 0; i < a.rows; i++) {
    for (const [j, v] of a.data[i].entries()) {
      out.data[i].set(j, v);
    }
    for (const [j, v] of b.data[i].entries()) {
      const sum = (out.data[i].get(j) ?? 0) + v;
      if (sum === 0) out.data[i].delete(j);
      else out.data[i].set(j, sum);
    }
  }
  return out;
}

/** C = A * B.  Dimensions must be compatible (a.cols == b.rows).
 *  Returns a fresh sparse matrix; inputs are not mutated. */
export function sparseMul(a: SparseMatrix, b: SparseMatrix): SparseMatrix {
  assertMatrix(a, "sparseMul");
  assertMatrix(b, "sparseMul");
  if (a.cols !== b.rows) {
    throw new Error(`sparseMul: dimension mismatch (${a.rows}x${a.cols} * ${b.rows}x${b.cols})`);
  }
  const out = sparseNew(a.rows, b.cols);
  // Standard row-times-column via per-row sparse iteration.
  for (let i = 0; i < a.rows; i++) {
    const aRow = a.data[i];
    if (aRow.size === 0) continue;
    for (const [k, aik] of aRow.entries()) {
      const bRow = b.data[k];
      if (!bRow || bRow.size === 0) continue;
      for (const [j, bkj] of bRow.entries()) {
        const cur = out.data[i].get(j) ?? 0;
        const next = cur + aik * bkj;
        if (next === 0) out.data[i].delete(j);
        else out.data[i].set(j, next);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transpose
// ---------------------------------------------------------------------------

/** Return the transpose of `m` (a fresh sparse matrix). */
export function sparseTranspose(m: SparseMatrix): SparseMatrix {
  assertMatrix(m, "sparseTranspose");
  const out = sparseNew(m.cols, m.rows);
  for (let i = 0; i < m.rows; i++) {
    for (const [j, v] of m.data[i].entries()) {
      out.data[j].set(i, v);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Density metrics
// ---------------------------------------------------------------------------

/** Number of stored (non-zero) entries.  O(rows) since each row's
 *  Map size is O(1). */
export function sparseNNZ(m: SparseMatrix): number {
  assertMatrix(m, "sparseNNZ");
  let n = 0;
  for (let i = 0; i < m.rows; i++) n += m.data[i].size;
  return n;
}

/** Density = nnz / (rows * cols).  Returns 0 for an empty matrix. */
export function sparseDensity(m: SparseMatrix): number {
  assertMatrix(m, "sparseDensity");
  const total = m.rows * m.cols;
  if (total === 0) return 0;
  return sparseNNZ(m) / total;
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

/** Convert to a dense `rows × cols` array of arrays of numbers. */
export function sparseToDense(m: SparseMatrix): number[][] {
  assertMatrix(m, "sparseToDense");
  const out: number[][] = new Array(m.rows);
  for (let i = 0; i < m.rows; i++) {
    const row = new Array(m.cols).fill(0);
    for (const [j, v] of m.data[i].entries()) {
      row[j] = v;
    }
    out[i] = row;
  }
  return out;
}

/** Build a sparse matrix from a dense `rows × cols` array of arrays
 *  of numbers.  Zeros in the input are not stored. */
export function sparseFromDense(dense: number[][]): SparseMatrix {
  if (!Array.isArray(dense)) throw new Error("sparseFromDense: expected array of arrays");
  const rows = dense.length;
  let cols = 0;
  for (let i = 0; i < rows; i++) {
    if (!Array.isArray(dense[i])) throw new Error("sparseFromDense: expected array of arrays");
    if (dense[i].length > cols) cols = dense[i].length;
  }
  const m = sparseNew(rows, cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < dense[i].length; j++) {
      const v = dense[i][j];
      assertNum(v, "sparseFromDense", `dense[${i}][${j}]`);
      if (v !== 0) m.data[i].set(j, v);
    }
  }
  return m;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "sparse",
  fns: [
    { name: "sparseNew", sig: "(rows: int, cols: int) -> SparseMatrix", desc: "Create a fresh rows x cols sparse matrix of zeros." },
    { name: "sparseSet", sig: "(m: SparseMatrix, i: int, j: int, value: float) -> SparseMatrix", desc: "Set m[i][j]; storing 0 deletes the entry. Chainable." },
    { name: "sparseGet", sig: "(m: SparseMatrix, i: int, j: int) -> float", desc: "Get m[i][j] (0 if not stored)." },
    { name: "sparseAdd", sig: "(a: SparseMatrix, b: SparseMatrix) -> SparseMatrix", desc: "Element-wise sum; returns a fresh matrix." },
    { name: "sparseMul", sig: "(a: SparseMatrix, b: SparseMatrix) -> SparseMatrix", desc: "Matrix product a*b; returns a fresh matrix." },
    { name: "sparseTranspose", sig: "(m: SparseMatrix) -> SparseMatrix", desc: "Transpose; returns a fresh matrix." },
    { name: "sparseDensity", sig: "(m: SparseMatrix) -> float", desc: "Density = nnz / (rows*cols); 0 for empty." },
    { name: "sparseNNZ", sig: "(m: SparseMatrix) -> int", desc: "Number of stored (non-zero) entries." },
    { name: "sparseToDense", sig: "(m: SparseMatrix) -> [[float]]", desc: "Convert to a dense array-of-arrays." },
    { name: "sparseFromDense", sig: "(dense: [[float]]) -> SparseMatrix", desc: "Build a sparse matrix from a dense array-of-arrays." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("sparseNew", sparseNew);
  registerBuiltin("sparseSet", sparseSet);
  registerBuiltin("sparseGet", sparseGet);
  registerBuiltin("sparseAdd", sparseAdd);
  registerBuiltin("sparseMul", sparseMul);
  registerBuiltin("sparseTranspose", sparseTranspose);
  registerBuiltin("sparseDensity", sparseDensity);
  registerBuiltin("sparseNNZ", sparseNNZ);
  registerBuiltin("sparseToDense", sparseToDense);
  registerBuiltin("sparseFromDense", sparseFromDense);
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function assertMatrix(x: any, fn: string): asserts x is SparseMatrix {
  if (typeof x !== "object" || x === null ||
      typeof x.rows !== "number" || typeof x.cols !== "number" ||
      !Array.isArray(x.data) || x.data.length !== x.rows) {
    throw new Error(fn + ": expected SparseMatrix, got " + kind(x));
  }
}

function assertInt(x: any, fn: string, name: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x) || !Number.isInteger(x)) {
    throw new Error(fn + ": " + name + " must be an integer, got " + kind(x));
  }
}

function assertNum(x: any, fn: string, name: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x)) {
    throw new Error(fn + ": " + name + " must be a finite number, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
