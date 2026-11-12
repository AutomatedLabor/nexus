# Aether stdlib — `sparse`

A simple sparse matrix using row-wise compressed storage. Each
row is a `Map<col, value>` — lookup and update are O(1) average,
iteration is O(nnz_in_row) per row.  Dense matrices are plain JS
arrays of arrays of numbers; conversion helpers go both ways.

## When to use this?

Sparse matrices shine when most entries are zero — common in
linear algebra over large graphs, finite-element meshes, PDE
discretisations, and ML feature vectors.  The matrix-vector
product can be hundreds of times faster than dense equivalents at
99% sparsity.

This module deliberately keeps the data model *simple*: a row-wise
array of `Map<number, number>`.  It's not the fastest sparse
format (CSR would be tighter), but it is by far the easiest to
introspect and debug from Aether code, and it ties directly into
Aether's existing `Map` and `Array` support without any host FFI.

## Data model

```ts
interface SparseMatrix {
  rows: number;
  cols: number;
  data: Array<Map<number, number>>;  // data[i] is Map<col, value> for row i
}
```

* `rows` and `cols` are fixed at construction time.
* Storing a zero **deletes** the entry, keeping the matrix sparse
  (`sparseSet(m, i, j, 0)`).
* All indices are checked; out-of-bounds access panics.

## Functions

| Function | Signature | Notes |
|---|---|---|
| `sparseNew` | `(rows, cols) -> SparseMatrix` | Fresh zero matrix. |
| `sparseSet` | `(m, i, j, value) -> SparseMatrix` | Storing 0 deletes the entry; chainable. |
| `sparseGet` | `(m, i, j) -> float` | Returns 0 for unstored entries. |
| `sparseAdd` | `(a, b) -> SparseMatrix` | Element-wise sum; fresh result. |
| `sparseMul` | `(a, b) -> SparseMatrix` | Matrix product; fresh result. |
| `sparseTranspose` | `(m) -> SparseMatrix` | Swap rows/cols. |
| `sparseDensity` | `(m) -> float` | `nnz / (rows*cols)`, in [0, 1]. |
| `sparseNNZ` | `(m) -> int` | Number of stored (non-zero) entries. |
| `sparseToDense` | `(m) -> [[float]]` | Materialise to a dense array-of-arrays. |
| `sparseFromDense` | `(d) -> SparseMatrix` | Build from a dense array-of-arrays; zeros skipped. |

## Examples

### Construction & lookup

```aether
let m = sparseNew(3, 3);
sparseSet(m, 0, 0, 1);
sparseSet(m, 1, 1, 2);
sparseSet(m, 2, 2, 3);
print(sparseGet(m, 1, 1));   // 2
print(sparseGet(m, 0, 1));   // 0
print(sparseNNZ(m));          // 3
print(sparseDensity(m));      // 0.333...
```

### Arithmetic

```aether
let a = sparseFromDense([[1, 2], [3, 4]]);
let b = sparseFromDense([[5, 6], [7, 8]]);
let c = sparseMul(a, b);
// c == [[19, 22], [43, 50]]
print(sparseToDense(c));
```

### Round-trip

```aether
let m = sparseFromDense([[0, 0, 1], [0, 2, 0]]);
let t = sparseTranspose(m);
// t == [[0, 0], [0, 2], [1, 0]]
print(sparseToDense(t));
```

## Cancellation semantics

`sparseAdd` and `sparseMul` delete any cell whose computed value
becomes exactly zero — this keeps the result sparse, but means
that adding a matrix to its negation yields a strictly zero
matrix (not "all zeros still in the index space").  This is the
standard sparse-matrix convention and matches the behaviour of
popular libraries (SciPy, Eigen, etc.).

## Performance

* `sparseGet`, `sparseSet`:  O(1) average per call.
* `sparseAdd`:  O(nnz_a + nnz_b).
* `sparseMul`:  O(nnz_a * max_row_density_b) — the inner product
  over each non-zero in `a` times the corresponding row in `b`.
* `sparseTranspose`:  O(nnz).
* `sparseNNZ`, `sparseDensity`:  O(rows) (sum of row sizes).
* `sparseToDense`, `sparseFromDense`:  O(rows*cols).

## Errors

* Bad matrix object → `Error: sparseX: expected SparseMatrix, got …`.
* Out-of-range indices → `Error: sparseX: index (i, j) out of range …`.
* Dimension mismatch in add/mul → `Error: sparseX: dimension mismatch …`.
* `sparseFromDense` expects a non-empty array of arrays; jagged
  input is right-padded with zeros.

## Tests

25 tests in `index.test.ts` cover construction, CRUD, add/mul,
transpose, density metrics, dense conversions, jagged-input
handling, and validator errors.  Run them with:

```
bunx vitest run aether/stdlib/sparse
```

## Future work

A CSR (compressed sparse row) backend would be faster for
matrix-vector products, but loses the convenience of in-place
`set` and `get`.  A separate `csrMatrix` module could provide
that for hot paths, with `sparseFromCSR` / `sparseToCSR`
conversions bridging the two formats.
