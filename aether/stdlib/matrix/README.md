# Aether stdlib — `matrix`

The `matrix` module provides linear-algebra operations on a dense 2D representation. A matrix is `{ rows, cols, data }` where `data` is a flat row-major array of length `rows * cols`. Element at row `r`, column `c` is `data[r * cols + c]`. All matrices are numeric (the cells are `number`s). The module ships 20 functions: construction, accessors, the algebraic ops (transpose, add, sub, scale, mul), the standard matrices (identity, zero, diagonal), and the higher-order `matrixMap`. All functions are pure TypeScript; throwing an `Error` from a builtin surfaces as an Aether panic.

## Why flat data?

The flat layout (`data: number[]`, length `rows * cols`, row-major) is the most cache-friendly representation for numeric computation: a single allocation, contiguous memory, no pointer chasing. It also makes element access `O(1)` with a single arithmetic computation. For the matrix sizes that come up in practice (3×3 transforms, 4×4 graphics matrices, small Markov chains, NN layers), this beats a 2D-array-of-arrays layout by a constant factor.

## Construction

`matrixNew(rows, cols, fill = 0)` creates a `rows × cols` matrix filled with `fill`. `matrixFromRows(rows)` builds a matrix from an array of row arrays (all the same length). `matrixIdentity(n)` creates the `n × n` identity matrix. `matrixZero(rows, cols)` is an alias for `matrixNew(rows, cols, 0)`. `matrixDiagonal(v)` creates a square matrix from a 1D array, with `v` on the diagonal and zeros elsewhere.

```aether
let a = matrix.matrixNew(2, 3)               // 2x3 zeros
let b = matrix.matrixFromRows([[1, 2], [3, 4]])
let i = matrix.matrixIdentity(3)
let d = matrix.matrixDiagonal([1, 2, 3])
```

## Accessors

`matrixGet(m, r, c)` returns the element at `(r, c)` — panics on out-of-bounds. `matrixSet(m, r, c, v)` sets it. `matrixRows(m)` and `matrixCols(m)` give the dimensions. `matrixRow(m, r)` returns row `r` as a fresh array (a copy — mutating it doesn't change the matrix). `matrixCol(m, c)` returns column `c` as a fresh array.

```aether
matrix.matrixGet(b, 1, 1)   // 4
matrix.matrixSet(b, 0, 0, 99)
matrix.matrixRow(b, 0)      // [99, 2]
matrix.matrixCol(b, 0)      // [99, 3]
```

## Algebra

`matrixTranspose(m)` returns `m^T` (rows become columns). `matrixAdd(a, b)` and `matrixSub(a, b)` are element-wise — both operands must have the same shape. `matrixScale(m, s)` multiplies every element by the scalar `s`. `matrixMul(a, b)` is matrix multiplication: `a.cols` must equal `b.rows`; the result is `a.rows × b.cols`.

```aether
let a = matrix.matrixFromRows([[1, 2], [3, 4]])
let b = matrix.matrixFromRows([[5, 6], [7, 8]])
matrix.matrixTranspose(a)   // [[1, 3], [2, 4]]
matrix.matrixAdd(a, b)      // [[6, 8], [10, 12]]
matrix.matrixSub(b, a)      // [[4, 4], [4, 4]]
matrix.matrixScale(a, 3)    // [[3, 6], [9, 12]]
matrix.matrixMul(a, b)      // [[19, 22], [43, 50]]
```

## Properties

`matrixTrace(m)` is the sum of the diagonal entries — `m` must be square (panics otherwise). `matrixDeterminant2(m)` is the determinant of a 2×2 matrix (panics on any other shape). `matrixDeterminant3(m)` is the determinant of a 3×3 matrix via the rule of Sarrus. (For larger matrices, the determinant computation requires Gaussian elimination with partial pivoting; we deliberately stopped at 3×3 in the stdlib — for larger determinants, reach for a numerics module.)

```aether
matrix.matrixTrace(matrix.matrixFromRows([[1, 2], [3, 4]]))   // 5
matrix.matrixDeterminant2(matrix.matrixFromRows([[1, 2], [3, 4]]))  // -2
```

## Higher-order

`matrixMap(m, fn)` returns a new matrix where every cell is the result of `fn(value, row, col)`. Useful for element-wise transforms (e.g. squaring every element, applying a nonlinearity like ReLU to a layer) without writing an explicit loop.

```aether
let m = matrix.matrixFromRows([[1, 2], [3, 4]])
let squared = matrix.matrixMap(m, (v) => v * v)       // [[1, 4], [9, 16]]
let indexed = matrix.matrixMap(matrix.matrixNew(2, 3), (_v, r, c) => r * 10 + c)
// indexed: [[0, 1, 2], [10, 11, 12]]
```

## Common patterns

- **Apply a transform**: build a 3×3 affine matrix and `matrixMul` it by a column vector.
- **Compose transforms**: chain `matrixMul` — note that matrix multiplication is associative but not commutative; `A * B` is generally not `B * A`.
- **Compute trace of a covariance**: `matrix.trace(matrix.matrixMul(X, matrix.matrixTranspose(X)))` for the sum of squared singular values.
- **Sigmoid a layer**: `matrix.matrixMap(layer, (v) => 1 / (1 + Math.exp(-v)))`.

## Error handling

Every function panics when called with the wrong shape or out-of-bounds indices:
- `matrixAdd(a, b)` panics when `a.rows != b.rows` or `a.cols != b.cols`.
- `matrixMul(a, b)` panics when `a.cols != b.rows`.
- `matrixTrace(m)` panics when `m.rows != m.cols`.
- `matrixDeterminant2(m)` panics when `m` isn't exactly 2×2.
- `matrixGet(m, r, c)` panics when `r` or `c` is out of bounds.

## What's NOT in here

- **Matrix inversion**: requires Gaussian elimination; would need pivoting for numerical stability; not a stdlib primitive. File an RFC.
- **Singular Value Decomposition**: same — numerics-heavy, out of scope for stdlib.
- **Sparse matrices**: a sparse-matrix module would have a different shape (CSR, CSC, COO). It would be a separate `sparse-matrix` module.
- **LU / QR decomposition**: same as inverse.
- **Eigenvalues**: same — requires iterative numerical methods (Jacobi, QR iteration).
- **Complex-number matrices**: this module is real-valued only.

## Performance notes

- `matrixMul(a, b)` is O(n·m·p) for `n×m` * `m×p`. No blocking, no SIMD, no Strassen — the textbook triple loop. For n=100, that's 10⁶ ops, well under a millisecond. For n=1000, it's 10⁹, which is a few seconds — at that point you want a real BLAS, not this module.
- `matrixTranspose` is O(rows × cols) and allocates a new matrix.
- `matrixMap` is O(rows × cols) with a function call per cell — the function-call overhead can dominate the actual work for cheap functions.

## When to reach for this module

- **Geometric transforms** in 2D or 3D (rotation, scale, translation via affine augment).
- **Markov chains**: a transition matrix; `matrixMul` evolves the distribution.
- **Small neural networks**: weight matrices, `matrixMul` for forward pass.
- **Graph adjacency matrices** (small graphs — for larger graphs, use the `graph` module's adjacency-list form).
- **Solving small linear systems** (e.g. least squares via the normal equations — but you'd need matrix inversion, which we don't ship here; use Gaussian elimination from a numerics module).

The whole module is 20 functions, ~280 lines of TypeScript, no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
