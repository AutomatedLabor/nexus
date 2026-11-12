# segment_tree.ae

A segment tree for range-sum queries. We build a complete binary
tree over an array of N integers, where each internal node stores
the sum of its two children. Then we answer queries of the form
"what's the sum from index l to r (inclusive)?" in `O(log N)` and
update a single element in `O(log N)`.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`build(data, n)`** — allocates a `4*N + 8`-sized `tree` array
   and calls `build_rec` to fill it.
3. **`build_rec(...)`** — recursive builder. At a leaf (`lo == hi`)
   the node holds `data[lo]`; at an internal node it holds the sum
   of its two children.
4. **`query(tree, node, lo, hi, l, r)`** — recursive range query.
   If the query range fully contains the node's range, return the
   node's sum. If they're disjoint, return 0. Otherwise split.
5. **`update(tree, node, lo, hi, idx, val)`** — recursive point
   update. At the leaf, set the value; on the way back, recompute
   the parent's sum from its children.
6. **Driver** — builds a tree over `[3, 1, 4, 1, 5, 9, 2, 6]`,
   prints several range queries, performs a point update, then
   re-queries to confirm.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/segment_tree.ae
```

## Key language features

- **Recursion** for build, query, and update — natural fit for a
  tree-shaped data structure.
- **Mutable array element assignment** (`tree[node] = data[lo]`)
  — Aether lets you mutate array elements in place.
- **`int((lo + hi) / 2)`** for the midpoint — Aether's `/` is
  float division, so we wrap with `int(...)`.
- **`if/else` blocks followed by `;`** before another statement,
  required by the parser.
- **`while` loops** in the driver — sidesteps the for-loop-scope
  quirk.

## Expected output

```
== Segment tree (range sum) ==

data: [3, 1, 4, 1, 5, 9, 2, 6]

range sum queries:
  sum[0..7] = 31  (total)
  sum[2..4] = 10
  sum[0..3] = 9
  sum[4..7] = 22

update: data[3] = 1 -> 100
  sum[0..7] = 130  (new total)
  sum[2..4] = 109  (data[2] + data[3] + data[4])

All assertions passed.
```

## Design notes

- We allocate `4*N + 8` for the tree array, which is the standard
  bound for a complete binary segment tree on N leaves.
- The tree is 0-indexed internally; children of node `i` are at
  `2*i + 1` and `2*i + 2`.
- Point update is `O(log N)`: only `log N` nodes lie on the path
  from a leaf to the root, and we only touch those.
- See also `fenwick_tree.ae` for a more compact (and slightly
  faster) alternative that supports prefix sums but not arbitrary
  range queries as cleanly.
