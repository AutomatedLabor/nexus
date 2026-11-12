# fenwick_tree.ae

A Fenwick tree (Binary Indexed Tree, BIT) for prefix-sum queries.
Given an array of N integers, we support `update(i, delta)` (add
`delta` to position i) and `prefix(i)` (sum of `data[0..=i]`), both
in `O(log N)`. Internally the BIT is stored in a 1-indexed array
`bit[1..N]` where `bit[k]` holds the sum of indices
`(k - lowbit(k), k]`. We convert 0-based indices to 1-based on
the way in.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`lowbit(x)`** — `x & (-x)`, the lowest set bit of `x`.
3. **`build_bit(data, n)`** — constructs a BIT of size `n` from
   the data array by inserting each element one at a time
   (`O(N log N)` construction).
4. **`bit_update(bit, n, i, delta)`** — adds `delta` to position
   `i` (0-indexed). Walks up the tree, adding `delta` to every
   ancestor.
5. **`bit_prefix(bit, i)`** — returns `data[0..=i]` (0-indexed).
   Walks down the tree, summing the relevant `bit[k]` cells.
6. **`bit_range(bit, l, r)`** — returns `data[l..=r]` as
   `prefix(r) - prefix(l - 1)`.
7. **Driver** — builds a BIT over `[3, 1, 4, 1, 5, 9, 2, 6]`,
   prints prefix and range queries, performs an update, and
   re-queries.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/fenwick_tree.ae
```

## Key language features

- **`x & (-x)`** — Aether supports bitwise operators. `-x` is
  the two's complement; `x & (-x)` isolates the lowest set bit.
- **1-indexed internal array** with size `n + 2` to avoid
  off-by-one indexing bugs at the upper boundary.
- **Mutable array element assignment** (`bit[k] = bit[k] + delta`)
  — Aether lets you mutate array elements in place.
- **`while k > 0` and `while k <= n`** — the canonical BIT
  up-walk and down-walk loops. Both use `lowbit` to move at
  `O(log N)` speed.

## Expected output

```
== Fenwick tree (BIT) ==

data: [3, 1, 4, 1, 5, 9, 2, 6]

prefix sums:
  prefix(0) = 3   (expected 3)
  prefix(2) = 8   (expected 3+1+4 = 8)
  prefix(3) = 9   (expected 3+1+4+1 = 9)
  prefix(7) = 31   (expected total = 31)

range sums:
  sum[2..4] = 10   (expected 4+1+5 = 10)
  ...

update: data[3] += 99  (1 -> 100)
  prefix(7) = 130   (expected 31 + 99 = 130)
  ...

All assertions passed.
```

## Design notes

- The BIT is more compact than a segment tree (just `N` cells,
  vs `4N`), but only supports prefix sums cleanly. For arbitrary
  range queries (sum, min, max), a segment tree is more general.
- `update(i, delta)` adds a delta; if you want to set `data[i] = v`,
  call `update(i, v - data[i])` (you need to track `data[i]`
  separately).
- The construction is `O(N log N)`. There's a clever `O(N)`
  construction that walks the tree once, but the simpler
  per-element insertion is fine for the demo size.
