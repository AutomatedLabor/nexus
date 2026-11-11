# radix_sort.ae

Radix sort (LSD — least significant digit first). Sorts
positive integers by repeatedly bucket-sorting on each
decimal digit, starting with the units, then tens, then
hundreds, and so on up to the largest value's highest digit.

## What it does

1. **`array_max(arr)`** — find the maximum value in `arr`
   (used to bound the number of passes — `floor(log10(max)) + 1`).
2. **`radix_pass(arr, exp)`** — one stable bucket sort by the
   digit at position `exp` (1 = units, 10 = tens, ...). For
   each digit `d` in `0..9`, walk `arr` left-to-right and
   push any element whose `(x / exp) % 10` equals `d` into
   the output. Iterating `d` ascending makes the pass stable.
3. **`radix_sort(arr)`** — call `radix_pass` for `exp = 1, 10,
   100, ...` while `exp <= max`. Each pass is stable so the
   previous pass's ordering is preserved among equal keys at
   the new digit.
4. **Driver** — sorts `[170, 45, 75, 90, 802, 24, 2, 66]`,
   traces each pass, and runs a few more cases.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/radix_sort.ae
```

## Key language features

- **No array-of-arrays** — instead of building 10 buckets
  (`[[int]]` typing that the v1 type checker dislikes), each
  pass is a single flat filter over `arr` per digit. This is
  `O(10n)` per pass but is type-checker-friendly and avoids
  the `[[int]]` type errors that would surface in the
  alternative formulation.
- **`int(x / exp)` for integer division** since `/` is
  float division in Aether.
- **`while` loops** for all iteration — sidesteps the
  for-loop-scope quirk.
- **`reduce`** to render the int array as a pretty string.

## Expected output

```
== Radix sort (LSD) ==

input:  [170, 45, 75, 90, 802, 24, 2, 66]
sorted: [2, 24, 45, 66, 75, 90, 170, 802]

pass trace (digit considered: units, tens, hundreds, ...):
  after exp=1: [170, 90, 802, 2, 24, 45, 75, 66]
  after exp=10: [802, 2, 24, 45, 170, 75, 66, 90]
  after exp=100: [2, 24, 45, 66, 75, 90, 170, 802]
```

## Design notes

- Stability is what makes LSD radix sort correct: if two
  numbers agree on the units digit, the next pass (tens)
  must not disturb their relative order from the units pass.
  Our implementation gets stability for free by walking
  `arr` left-to-right inside each digit's emission.
- The largest value (`802`) requires 3 passes (`exp = 1, 10,
  100`). The trace shows the array getting progressively
  more sorted as higher digits are processed.
- For very wide value ranges (e.g., 64-bit integers), LSD
  radix becomes impractical; MSD radix or comparison-based
  sorts are preferred.
