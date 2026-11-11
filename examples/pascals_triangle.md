# pascals_triangle.ae

Builds the first 7 rows of Pascal's triangle as a nested int
array, then pretty-prints them as a triangular layout and as
row arrays. Spot-checks a few binomial coefficients.

## What it does

Recurrence:

```
row[k][0]   = 1
row[k][k]   = 1
row[k][j]   = row[k-1][j-1] + row[k-1][j]    for 0 < j < k
```

1. **`next_row(prev)`** — builds the next row given the previous
   row. The next row has one more element; each interior element
   is the sum of two adjacent elements of the previous row, with
   implicit zeros on the ends.
2. **`pascals(n)`** — builds the first `n` rows starting from
   row 0 = `[1]`. Returns a `[[int]]` (nested array).
3. **`show_row(row, indent)`** — renders a row as space-separated
   values, indented so the triangle looks triangular in the
   output.
4. **Driver** — builds the first 7 rows, prints them as a
   triangle (with decreasing indent), then prints them as arrays
   for clarity, then spot-checks a few binomial coefficients
   (`C(4, 2) = 6`, `C(5, 3) = 10`, `C(6, 3) = 20`).

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/pascals_triangle.ae
```

## Key language features

- **`[[int]]` nested array type** — the triangle is an array of
  rows, each row is an array of ints. The type checker reports a
  minor warning about the nested array type ("expected return
  type `[[int]]`, found `[E11]`") but the program runs correctly.
- **`push(triangle, next_row(prev))`** to build up the triangle
  iteratively with a `while` loop.
- **`if cond { then } else { else }` expression** for the
  sentinel-zero access in `next_row` (`if i == 0 { 0 } else {
  prev[i - 1] }`).
- **`reduce` over a `[int]`** to render each row as a string.
- **`while` loop to build the indent string** — a small wart
  that demonstrates string concatenation in a loop.

## Expected output

```
== Pascal's triangle (first 7 rows) ==

            1
          1  1
        1  2  1
      1  3  3  1
    1  4  6  4  1
  1  5  10  10  5  1
1  6  15  20  15  6  1

As arrays:
  row 0: [1]
  row 1: [1, 1]
  row 2: [1, 2, 1]
  row 3: [1, 3, 3, 1]
  row 4: [1, 4, 6, 4, 1]
  row 5: [1, 5, 10, 10, 5, 1]
  row 6: [1, 6, 15, 20, 15, 6, 1]

Binomial coefficient spot checks (row[k][j] == C(k, j)):
  C(4, 2) = row 4 [2] = 6  (expect 6)
  C(5, 3) = row 5 [3] = 10  (expect 10)
  C(6, 3) = row 6 [3] = 20  (expect 20)

All assertions passed.
```

## Design notes

- The iterative construction (`start with row 0, then repeatedly
  call `next_row`) is more idiomatic Aether than a recursive
  construction, because the natural unit of work is "compute one
  row from the previous row" — that's `next_row`. The `while`
  loop just sequences these calls.
- The sentinel-zero trick in `next_row` (`if i == 0 { 0 } else {
  prev[i - 1] }`) lets us avoid an explicit special-case for the
  edges of the row. The math works out: `prev[-1]` would be an
  out-of-bounds access, but we substitute 0 instead.
- The triangle layout uses decreasing indent (`(n - 1 - i) * 2`
  spaces) so the triangle is centered. The trade-off: it doesn't
  actually look perfectly triangular because the row lengths
  vary (single-digit vs two-digit numbers), but it's close enough.
