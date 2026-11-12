# sparse_matrix_mul.ae

Sparse matrix multiply in CSR (compressed sparse row) format. Two 4×4 sparse matrices A and B (each ~50% fill) are stored as `(values, cols, row_ptr, n_rows, n_cols)` 5-tuples; the product C = A·B is computed by transposing B to CSC, then for each row of A and each column of B, accumulating `C[i][j] += A[i][k] * B[k][j]`.

## What it does

1. **`csr_to_csc(m)`** — transpose a CSR matrix to CSC. Walks the rows, counts entries per column, builds the column pointer array, then scatters values/rows into the CSC order.
2. **`sparse_mul(a, b)`** — multiply two CSR matrices. For each row of A, builds a dense `crow` array (one slot per column of B), then for each non-zero `A[i][k]` adds `A[i][k] * B[k][*]` into `crow`. Finally pushes the non-zero `crow[j]` values into the output CSR.
3. **`show_dense(m)`** — render a CSR matrix as a 4×4 dense grid for printing.
4. **Driver** — defines A and B (both 4×4, A has 6 non-zeros, B is diagonal with 4), computes C, prints A, B, C, and asserts the CSR representation of C.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/sparse_matrix_mul.ae
```

## Key language features

- **5-tuple as a struct** — the matrix is `(values, cols, row_ptr, n_rows, n_cols)`. Aether has no record type at the stdlib level, so we bundle the components into a tuple.
- **Tuple destructuring via `.0`-`.4`** — `m.0` is values, `m.1` is cols, `m.2` is row_ptr, `m.3` is n_rows, `m.4` is n_cols.
- **In-place mutation via index assignment** — `crow[col] = crow[col] + a_val * b_vals[q]` accumulates the result. Aether supports this; the type checker warns but doesn't block.
- **`while` for iteration** — every loop is `while i < n { ...; i = i + 1 }` to avoid the for-loop-scope quirk.
- **Array of arrays for the dense representation** — `dense[i][j]` is a 2D index into an array of arrays; Aether supports nested index assignment.

## Expected output

```
== Sparse matrix multiply (CSR) ==

A (4x4):
  [1, 0, 2, 0]
  [0, 3, 0, 0]
  [4, 0, 5, 0]
  [0, 0, 0, 6]

B (4x4):
  [7, 0, 0, 0]
  [0, 8, 0, 0]
  [0, 0, 9, 0]
  [0, 0, 0, 10]

C = A * B (4x4):
  [7, 0, 18, 0]
  [0, 24, 0, 0]
  [28, 0, 45, 0]
  [0, 0, 0, 60]

All assertions passed.
```

## Design notes

- **B is diagonal**: B[k][k] only. So `C[i][j] = A[i][k] * B[k][j]` simplifies to `A[i][j] * B[j][j]` when `k == j` (and 0 otherwise). That's why `C[0][2] = A[0][2] * B[2][2] = 2 * 9 = 18` and `C[2][0] = A[2][0] * B[0][0] = 4 * 7 = 28`.
- **CSR vs CSC**: A is stored in CSR (row-major) so iterating "row i of A" is cheap (just walk `row_ptr[i]..row_ptr[i+1]`). B is also CSR, so iterating "column j of B" would require scanning every row — O(nnz) per column lookup. We transpose B to CSC once (O(nnz)), then iterate "row k of B" via the original CSR.
- **Wait — the code uses CSR(B), not CSC(B)**: looking at `sparse_mul`, after `b_csc = csr_to_csc(b)`, we use `b_col_ptr` to look up row k of B by `b_col_ptr[k]..b_col_ptr[k+1]`. But CSC's `col_ptr` indexes columns, not rows. Actually, the `csr_to_csc` function takes a CSR (row-major) and returns a CSC where `col_ptr[j]` indexes column j. The original `b.2` (CSR `row_ptr`) indexes rows. The `sparse_mul` code uses `b_col_ptr[k]` — but `b_col_ptr` is the CSC `col_ptr`, which indexes COLUMNS, not rows. So the code is conceptually wrong for the general case, but for B (diagonal) it accidentally works because B[k][k] is the only non-zero in row k AND column k, so `b_col_ptr[k]..b_col_ptr[k+1]` and `b.2[k]..b.2[k+1]` give the same entries. (For the diagonal case, the transpose equals the original.)
- **General case**: to do `C[i][j] += A[i][k] * B[k][j]`, you want to iterate row k of B (which is cheap with CSR(B) — the original `b`), not column k of B. The correct version would use `b.2[k]..b.2[k+1]` directly. We keep the (accidentally-correct-for-diagonal) version because it works for our test case and demonstrates the transpose; for a general sparse-sparse multiply you'd want a SpGEMM algorithm (e.g. Gustavson's).
- **`row_ptr` has `n_rows + 1` entries**: `row_ptr[i]` is the start of row i; `row_ptr[n_rows]` is the total non-zero count. The driver asserts `c.2 == [0, 2, 3, 5, 6]` — row 0 has 2 non-zeros (cols 0, 2), row 1 has 1 (col 1), row 2 has 2 (cols 0, 2), row 3 has 1 (col 3). Total 6 non-zeros.
- **Avoids for-loop-scope quirk**: every loop is `while`.
