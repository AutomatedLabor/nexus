# aether-collections-extra

> Extra collection operations for the Aether language — 14 pure functions covering chunking/windowing/sliding, partition, grouping/counting/indexing, set-like ops (unique/difference/intersection/union/symmetricDifference), and deterministic shuffle/sample.

`aether-collections-extra` is a user-space Aether package that complements `aether-list` with the operations application code most commonly reaches for after the basic `map`/`filter`/`reduce`/`chunk`/`window` set: `sliding` (window with custom step), `partition` (split by predicate), `groupBy`/`countBy`/`indexBy` (cluster by key function), and the full set-algebra quartet (`union`, `intersection`, `difference`, `symmetricDifference`). It also ships a deterministic `shuffle` and `sample` so reproducible randomized collection ops work without host `Math.random`.

Like every other package in the Aether registry, the whole library is a single ~400-line `src/lib.ae` written entirely in Aether itself — no host primitives, no FFI, no compiler hooks. If you can read Aether, you can read the source end-to-end.

## Why a "collections-extra" package?

The base `aether-list` package (the canonical "list utilities" package) covers the Haskell `Data.List` API — `head`/`tail`, `intersperse`/`intercalate`, `subsequences`/`permutations`, `nub`, `sortWith`/`sortBy`/`groupBy` (consecutive-equality variant), `span`/`break_`/`takeWhile`/`dropWhile`, `chunk`, `window`, `zipWith`. It deliberately does *not* ship:

- **`sliding`** (window with a custom step) — a common need when working with overlapping frames of varying stride.
- **`partition`** — split a list into (satisfying, not-satisfying) halves in one pass.
- **`groupBy`/`countBy`/`indexBy`** with a key function (not just consecutive equality) — the more general "cluster by computed key" operations.
- **Set algebra** — `union`/`intersection`/`difference`/`symmetricDifference`. `aether-set` exists, but it's a richer `Set` data type; many callers just want one-shot set ops on plain arrays.
- **`shuffle`/`sample`** — randomized collection ops, useful for tests, fixtures, and Monte Carlo-style simulations. Aether's core deliberately doesn't ship randomness; this package provides a *deterministic* LCG-based variant so results are reproducible.

This package fills those gaps.

## API

All 14 functions are `pub fn` declarations in `src/lib.ae`. They are pure: they return new arrays and never mutate their inputs. None use `for in` loops; all iteration uses `while` with explicit index variables, defensively avoiding the v1 evaluator's for-loop-scope quirk.

### Chunk / window / sliding

| Function | Signature | Description |
| --- | --- | --- |
| `chunk(arr, n)` | `([int], int) -> [[int]]` | Split into non-overlapping chunks of size `n`. Last chunk may be shorter. Panics if `n <= 0`. |
| `window(arr, n)` | `([int], int) -> [[int]]` | Sliding window of size `n` (step 1). Returns `[]` if `n > len(arr)`. Panics if `n <= 0`. |
| `sliding(arr, n, step)` | `([int], int, int) -> [[int]]` | Sliding window of size `n` with custom `step`. Only full n-length windows are returned (any trailing partial window is dropped). Panics if `n <= 0` or `step <= 0`. |

`chunk` is the "tile" operation (non-overlapping); `window` is the "stride-1 sliding window"; `sliding` is the general form with custom step. They share the same `[int] -> [[int]]` shape but differ in the relationship between consecutive groups.

### Partition

| Function | Signature | Description |
| --- | --- | --- |
| `partition(arr, pred)` | `([int], fn(int) -> bool) -> [[int]]` | Split into `(satisfying, not-satisfying)`. Single pass over `arr`. |

`partition` returns a 2-element outer array; the first inner array holds the elements for which `pred` returned true, the second holds the rest. Order within each half is preserved.

### Group / count / index by key

| Function | Signature | Description |
| --- | --- | --- |
| `groupBy(arr, f)` | `([int], fn(int) -> int) -> [[int]]` | Group ALL elements by key `f` (not consecutive-equality). Returns array of `[int]` groups in first-seen-key order. |
| `countBy(arr, f)` | `([int], fn(int) -> int) -> [[int]]` | Count elements per key. Returns `[[key, count], ...]` in first-seen-key order. |
| `indexBy(arr, f)` | `([int], fn(int) -> int) -> [[int]]` | Group ORIGINAL INDICES by key `f`. Returns `[[key, [idx...]], ...]` in first-seen-key order. |

These three functions all share the "find or insert key" pattern: scan `arr`, compute `k = f(x)`, look up `k` in a parallel `keys` array, and either append `x` to an existing group or start a new one. `groupBy` returns the groups; `countBy` returns counts; `indexBy` returns the original positions. All three are O(n·m) where `m` is the number of distinct keys (linear scan over `keys`); for large `m` a hash-table-backed variant would be faster, but the linear scan is simplest and adequate for typical workloads.

### Set-like ops (preserving first-seen order)

| Function | Signature | Description |
| --- | --- | --- |
| `unique(arr)` | `([int]) -> [int]` | Deduplicate, preserving first-occurrence order. O(n²). |
| `difference(a, b)` | `([int], [int]) -> [int]` | Elements in `a` not in `b`. Preserves order from `a`. |
| `intersection(a, b)` | `([int], [int]) -> [int]` | Elements in both `a` and `b`. Preserves order from `a`. |
| `union(a, b)` | `([int], [int]) -> [int]` | Set union. Preserves first-seen order across `a` then `b`. |
| `symmetricDifference(a, b)` | `([int], [int]) -> [int]` | Elements in exactly one of `a` or `b`. |

All five are O(n²) (linear-scan membership tests). For sorted inputs, faster variants exist but require the caller to sort first; those live in `aether-set` (which provides a proper `Set` ADT).

### Randomized ops (deterministic LCG)

| Function | Signature | Description |
| --- | --- | --- |
| `shuffle(arr)` | `([int]) -> [int]` | Fisher–Yates shuffle driven by a deterministic LCG (seed 1). Reproducible across runs. Input is unchanged. |
| `sample(arr, n)` | `([int], int) -> [int]` | Return `n` distinct elements sampled from `arr`. If `n >= len(arr)`, returns a shuffled copy of `arr`. Returns `[]` if `n <= 0`. |

Aether's core deliberately does not include randomness (no `Math.random`, no `random` builtin) — randomness is a host concern that the language design defers to user-space packages. This package ships a deterministic linear congruential generator (LCG) with the Numerical Recipes constants (`a = 1664525`, `c = 1013904223`, `m = 2^31 - 1`), seeded with `1`. The result is that `shuffle([1..10])` returns the same permutation on every run, which is what you want for reproducible test fixtures.

## How to use

### As a dependency

Add `aether-collections-extra` to your project's `aether.toml`:

```toml
[dependencies]
aether-collections-extra = "0.1.0"
```

Then in your Aether source:

```aether
import { groupBy, partition, sliding, unique } from "aether-collections-extra";

fn parity(x: int) -> int { x % 2 }
fn is_even(x: int) -> bool { x % 2 == 0 }

let xs = [1, 2, 3, 4, 5, 6, 7];
print(groupBy(xs, parity));          // [[1, 3, 5, 7], [2, 4, 6]]
print(partition(xs, is_even));        // [[2, 4, 6], [1, 3, 5, 7]]
print(sliding(xs, 3, 2));             // [[1, 2, 3], [3, 4, 5], [5, 6, 7]]
print(unique([1, 1, 2, 3, 3, 2, 4])); // [1, 2, 3, 4]
```

### Running the test suite

```sh
aether test aether-packages/aether-collections-extra/tests
# PASS aether-packages/aether-collections-extra/tests/tests.ae
# 1 passed, 0 failed
```

The test file (`tests/tests.ae`) contains 25+ `assert_eq` cases covering every `pub fn` in the library. Each case is one line — the test suite is intentionally flat and readable.

### Running the example

```sh
aether run aether-packages/aether-collections-extra/examples/example.ae
```

The example exercises every function with a small input, producing a snapshot of expected outputs.

## Design notes

### Why is `groupBy` here different from `aether-list`'s `groupBy`?

`aether-list.groupBy` groups *consecutive* equal-by-eq elements (Haskell's `Data.List.groupBy`). It's a single-pass operation that doesn't need to remember earlier groups. `aether-collections-extra.groupBy` groups *all* elements by a computed key (Python's `itertools.groupby` after a `sorted`, or Lodash's `_.groupBy`). It needs to remember all earlier groups and find-or-insert on each element. The two are complementary — neither subsumes the other — which is why they live in different packages.

### Why deterministic `shuffle`?

Randomness is a side-channel. Aether's design principle is that the same source code, run twice, should produce the same output (modulo genuine I/O). For tests, fixtures, and examples this is essential — the test suite for `shuffle` can assert that "all original elements are present in the result" without caring which permutation occurred. A future `aether-random` package may provide a seeded PRNG object with `next_int`, `next_float`, etc.; this package just uses a fixed-seed LCG inline.

### Why O(n²) for set ops?

A hash-table-backed `Set` (in `aether-set`) is faster for large inputs. But many callers have small arrays (a few dozen elements) and just want one-line `union`/`intersection`/`difference` semantics without allocating a `Set`. O(n²) for those workloads is faster than the constant-factor overhead of building a hash set. The package prioritizes the simple/common case.

## Future work

- A `chunkInto(arr, n)` that splits into exactly `n` chunks of (nearly) equal size — useful for parallel partitioning.
- A `groupByCount` that returns `[[key, count]]` sorted by count descending (the canonical "top-N by frequency" operation).
- A `setEq(a, b)` that checks set equality (ignoring order/duplicates) in one call.

## License

MIT — same as the Aether language.
