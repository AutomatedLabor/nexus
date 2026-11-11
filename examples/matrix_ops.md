# matrix_ops.ae

2D matrix math using nested arrays. Implements `zeros`, `transpose`,
and `multiply`, with a `print_matrix` pretty-printer. Demonstrates
that nested-array element assignment (`m[i][j] = v`) works through two
levels of indexing in the v1 evaluator.

## What it does

1. **`zeros(rows, cols)`** builds an R×C matrix of zeros using
   nested `for i in range(0, rows, 1)` / `for j in range(0, cols, 1)`
   loops and `push` to grow each row and the outer matrix.
2. **`print_matrix(label, m)`** pretty-prints a matrix as a column
   of `[a, b, c]`-style rows, with single-digit numbers padded to
   two characters so the columns line up.
3. **`transpose(m)`** computes the matrix transpose: `t[j][i] =
   m[i][j]`. The result is a fresh matrix built by `zeros(cols,
   rows)` and filled by nested for-loops with two-level index
   assignment `t[j][i] = m[i][j]`.
4. **`multiply(a, b)`** computes the matrix product. `a` is R×K, `b`
   is K×C, result is R×C. Uses a triple-nested loop: outer two over
   `i` and `j` (the result cell), inner over `k` (the dot-product
   accumulator). The inner loop accumulates `sum = sum + a[i][k] *
   b[k][j]`.
5. **Driver**: builds a 2×3 matrix `A` and a 3×2 matrix `B`, prints
   them, computes and prints `Aᵀ` (transpose), `A·B` (product), `A·I`
   (identity check), and `Aᵀᵀ` (transpose of transpose). Each result
   is checked with `assert_eq`.

## How to run

Open the file in the playground and click **Run**, or:

```bash
bun /home/z/my-project/verify_one.ts /home/z/my-project/examples/matrix_ops.ae
```

## Key language features

- **Nested array type** `[[int]]` — the matrix type. Indexed with
  `m[i][j]`.
- **Two-level index assignment** `t[j][i] = m[i][j]` and
  `result[i][j] = sum` both work. The evaluator follows the chain
  `result → result[i] (an array reference) → result[i][j] = …`.
- **`for i in range(0, n, 1)`** with the explicit step argument —
  the 2-argument form also runs but the v1 type signature registers
  `range` as three ints.
- **`push` to build nested arrays** — each row is grown with `push`
  in the inner loop, then the row is `push`ed onto the outer matrix.
- **`len(m)` and `len(m[0])`** for row and column counts (assumes a
  non-empty, rectangular matrix).
- **`assert_eq` on nested arrays** — `assert_eq(at, [[1, 4], [2, 5],
  [3, 6]])` deep-compares the transposed structure.
- **The grammar note** (from the in-file comment): a non-trailing
  `for` statement must be followed by either another statement or the
  closing brace of the enclosing block. A `;` after a `for` body's
  closing `}` isn't valid syntax; trailing `if/else` blocks may end
  with `;` because `if` is an expression, but `for` is a statement.

## Expected output

```
== Matrix ops (nested arrays) ==

A (2x3):
  [ 1,  2,  3]
  [ 4,  5,  6]

B (3x2):
  [ 7,  8]
  [ 9, 10]
  [11, 12]

A^T (transpose, 3x2):
  [ 1,  4]
  [ 2,  5]
  [ 3,  6]

A * B (2x3 * 3x2 = 2x2):
  [58, 64]
  [139, 154]

A * I (2x3 * 3x3 = 2x3) should equal A:
  [ 1,  2,  3]
  [ 4,  5,  6]

A^T^T should equal A:
  [ 1,  2,  3]
  [ 4,  5,  6]

All assertions passed.
```

## Design notes

- **Two-level index assignment works** in v1 — this is the key
  language feature the example demonstrates. The evaluator handles
  `m[i][j] = v` by following the chain `m → m[i] → set m[i][j]`,
  requiring only that `m` is `let mut` and `m[i]` is itself a mutable
  array reference. (It is, because all arrays are reference types.)
- **No matrix shape-checking** — `multiply` assumes `len(a[0]) ==
  len(b)`. A production version would assert this. The example keeps
  it simple.
- **`zeros` builds the matrix by `push`**, not by literal syntax —
  this is more flexible (works for any R, C) and avoids the empty-
  array-literal type-checker quirk where `[]` against a typed binding
  gets a fresh element type variable.
- The driver uses **named identity checks** (`A · I == A`, `Aᵀᵀ ==
  A`) rather than abstract unit tests, so the reader can see what
  each operation is supposed to do at a glance.
