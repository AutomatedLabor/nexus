# aether-list

> Functional list utilities for the Aether language — 25 pure functions covering the Haskell `Data.List` API, written in Aether itself.

`aether-list` is the first package of the Aether package registry, a reference implementation of a small but complete functional list library that lives entirely in user-space: no compiler hooks, no host primitives, no FFI. Every function is a few lines of Aether built on `push`, `len`, `while`, `map`, `filter`, `reduce`, and recursion. If you can read Aether, you can read this package's source.

The package is targeted at three audiences:

1. **Application authors** who need standard list manipulations (`chunk`, `window`, `groupBy`, `partition`, `nub`, `zipWith`) and don't want to rewrite them in every project.
2. **Library authors** who want a small, dependency-free building block to layer higher abstractions on top of (e.g. a `Set` library can be implemented in terms of `nub` + `sortWith`, a `Map` library in terms of `groupBy`).
3. **Language learners** who want to see how idiomatic Aether looks in a non-trivial codebase — the source of `lib.ae` is heavily commented and intended to be read end-to-end.

## Why a list package?

Aether ships a small core of built-in functions (`print`, `len`, `range`, `map`, `filter`, `reduce`, `push`, `pop`, `charCode`, `fromCharCode`, `strSlice`, `int`, `float`, `str`, `min`, `max`, `abs`, `sqrt`, `assert`, `assert_eq`, `panic`). It deliberately does *not* ship `head`, `tail`, `nub`, `groupBy`, `chunk`, `permutations`, or any of the other "every program eventually needs these" list operations. The language design principle is: the standard library should be the smallest set of operations that compose into everything else, and the rest should live in user-installable packages.

`aether-list` is the canonical user-installable package for list operations. It is the reference target for the package registry protocol (RFC-005, draft): every other list-flavored package in the registry (`aether-list-extra`, `aether-batched`, `aether-streaming`) is expected to either re-export `aether-list` or extend it.

## API

All 25 functions are `pub fn` declarations in `src/lib.ae`. They are pure: they return new arrays and never mutate their inputs. None of them use `for in` loops; all iteration uses `while` with explicit index variables, defensively avoiding the v1 evaluator's for-loop-scope quirk.

### Basic accessors

| Function | Signature | Description |
| --- | --- | --- |
| `head(arr)` | `([int]) -> int` | First element. Panics on empty. |
| `tail(arr)` | `([int]) -> [int]` | All but the first. `[]` for empty/single. |
| `init(arr)` | `([int]) -> [int]` | All but the last. `[]` for empty/single. |
| `last(arr)` | `([int]) -> int` | Last element. Panics on empty. |
| `cons(h, t)` | `(int, [int]) -> [int]` | Prepend `h` to `t`. |
| `append_arr(a, b)` | `([int], [int]) -> [int]` | Concatenate two arrays. |
| `reverse(arr)` | `([int]) -> [int]` | Reverse. O(n). |

(`append_arr` is spelled with the `_arr` suffix because `append` is reserved as a possible future keyword in the Aether grammar; the suffix is a defensive choice, not a typo.)

### Intersperse / intercalate / transpose

| Function | Signature | Description |
| --- | --- | --- |
| `intersperse(arr, sep)` | `([int], int) -> [int]` | Insert `sep` between each pair. |
| `intercalate(sep, arrs)` | `(int, [[int]]) -> [int]` | Join an array of arrays with `sep`. |
| `transpose(arrs)` | `([[int]]) -> [[int]]` | Matrix transpose. Rows of unequal length are truncated to the shortest. |

### Subsequences / permutations

| Function | Signature | Description |
| --- | --- | --- |
| `subsequences(arr)` | `([int]) -> [[int]]` | All `2^n` subsequences, in shortlex order. |
| `permutations(arr)` | `([int]) -> [[int]]` | All `n!` permutations, lexicographic order. |

`subsequences` is implemented iteratively (start with `[[]]`, for each element `x`, append to each existing subsequence a new subsequence that includes `x`). `permutations` is recursive: `permutations([x, ...rest]) = for each perm p of rest, for each position i in 0..len(p), insert x at i`. Both are exponential; use on small inputs only.

### Nub / sort / group

| Function | Signature | Description |
| --- | --- | --- |
| `nub(arr)` | `([int]) -> [int]` | Deduplicate, preserving first-occurrence order. O(n²). |
| `sortWith(arr, cmp)` | `([int], fn(int, int) -> int) -> [int]` | Quicksort using `cmp` (returns neg/zero/pos). |
| `sortBy(arr, key)` | `([int], fn(int) -> int) -> [int]` | Sort by `key` ascending (uses `sortWith`). |
| `groupBy(arr, eq)` | `([int], fn(int, int) -> bool) -> [int]` | Group consecutive equal-by-`eq` elements. |

`nub` is intentionally simple (linear scan with `not_contains`) — for sorted inputs, the `sortWith` + `groupBy` pair is asymptotically faster (O(n log n) vs O(n²)) at the cost of changing the input order.

### Span / break / takeWhile / dropWhile / partition

| Function | Signature | Description |
| --- | --- | --- |
| `span(arr, pred)` | `([int], fn(int) -> bool) -> [[int]]` | `(takeWhile(pred, arr), dropWhile(pred, arr))`. |
| `break_(arr, pred)` | `([int], fn(int) -> bool) -> [[int]]` | `(takeWhile(!pred, arr), dropWhile(!pred, arr))`. |
| `takeWhile(arr, pred)` | `([int], fn(int) -> bool) -> [int]` | Longest prefix where `pred` holds. |
| `dropWhile(arr, pred)` | `([int], fn(int) -> bool) -> [int]` | Drop that prefix; return the rest. |
| `partition(arr, pred)` | `([int], fn(int) -> bool) -> [[int]]` | `(satisfying, not satisfying)`. |

`break_` is spelled with a trailing underscore because `break` is a reserved keyword in Aether. This follows the Haskell convention of `break` being the negated-predicate counterpart to `span`.

### Chunk / window / zipWith

| Function | Signature | Description |
| --- | --- | --- |
| `chunk(arr, n)` | `([int], int) -> [[int]]` | Split into chunks of size `n`. Last chunk may be shorter. |
| `window(arr, n)` | `([int], int) -> [[int]]` | Sliding window of size `n`. `len(arr) - n + 1` windows. |
| `zipWith(a, b, f)` | `([int], [int], fn(int, int) -> int) -> [int]` | Element-wise combine via `f`. Length is `min(len(a), len(b))`. |

`chunk` panics if `n <= 0` (the function is undefined for non-positive sizes; a panic is more useful than silently returning garbage). `window` returns `[]` if `n > len(arr)` (no full windows exist — this is the empty result, not an error).

## How to use

### As a dependency

Add `aether-list` to your project's `aether.toml`:

```toml
[dependencies]
aether-list = "0.1.0"
```

Then in your Aether source, import the functions you need:

```aether
import { nub, sortWith, groupBy } from "aether-list";

fn cmp_int(a: int, b: int) -> int { a - b }

let xs = nub([3, 1, 2, 1, 3, 4, 2]);
let sorted = sortWith(xs, cmp_int);
let grouped = groupBy(sorted, fn(a: int, b: int) -> bool { a == b });

print(sorted);   // [1, 2, 3, 4]
print(grouped);  // [[1], [2], [3], [4]]
```

### Locally (without the registry)

The package is a directory with `src/lib.ae`. You can import it directly by relative path:

```aether
import { chunk, window, zipWith } from "./aether-packages/aether-list/src/lib.ae";
```

### Running the test suite

```sh
aether test aether-packages/aether-list/tests
# PASS aether-packages/aether-list/tests/tests.ae
# 1 passed, 0 failed
```

The test file (`tests/tests.ae`) contains 30+ `assert_eq` cases covering every `pub fn` in the library. Each case is one line — the test suite is intentionally flat and readable.

### Running the example

```sh
aether run aether-packages/aether-list/examples/example.ae
```

The example exercises every function with a small input, producing a snapshot of expected outputs. It's the canonical "does the package work?" smoke test.

## Design notes

### Why `while` and not `for in`?

The Aether v1 evaluator has a known quirk where `let X;` declared before a `for in` loop and referenced after the loop can produce wrong results. The fix is in the evaluator (Wave 2 work), but in the meantime, `aether-list` defensively uses only `while` loops with explicit `let mut i = 0; i = i + 1` patterns. This is slightly more verbose but bulletproof — and the generated code is the same after lowering.

### Why explicit index-based iteration (not `map`/`filter`)?

Three reasons:

1. **Readability for learners.** The source of `aether-list` is intended to be read as a tutorial. Explicit `while` + `push` is the most transparent form for someone learning Aether.
2. **Avoiding closures where they're not needed.** Higher-order functions like `map`/`filter` create closures; in the v1 evaluator, closures with untyped parameters can confuse the type checker (which is why the test files pass even with type warnings — `cmdTest` ignores them — but the example file must be type-clean).
3. **No early-exit penalty.** `takeWhile` and `dropWhile` need early exit; using `map` would require an extra pass. Explicit `while` lets us short-circuit on the first non-matching element.

That said, the code does use `reduce` in places (e.g. the `show_int` helper in the example) where it's the natural fit. The choice is per-function, not dogmatic.

### Why are element types annotated as `int`?

Aether's type system is mostly erased at runtime — a function declared `fn head(arr: [int]) -> int` works fine on `[string]` or `[[int]]` because the runtime values flow through unchanged. The type annotations are documentation, not enforcement. We pick `int` because:

1. It's the most common element type in practice (and the test suite uses ints).
2. It's the simplest primitive type to write.
3. The function-typed parameters (`fn(int) -> bool`, `fn(int, int) -> int`) need a concrete element type to be checkable; `int` is the natural choice.

If you need to use `aether-list` on a different element type, you have two options:

1. **Ignore the type annotations.** Aether's type checker doesn't block execution (it's a lenient playground). The functions will work on any element type that supports the operations they use (e.g. `nub` works on any equality-comparable type, `sortWith` works on any type that the comparator handles).
2. **Copy and adapt.** The source is short; for a `string`-only list library, copy `lib.ae` and change `[int]` to `[string]`.

### Why `append_arr` instead of `append`?

`append` is a keyword candidate for future Aether versions (it's reserved as a possible compound-assignment operator). Naming the function `append_arr` is defensive — it avoids a potential collision if the language ever reserves `append`. The same logic applies to `break_` (already a keyword).

### Why panic on empty input for `head`/`last`?

Three options for empty-input handling:

1. **Panic** (chosen). Matches Haskell's `head []`. Forces the caller to handle emptiness explicitly with `if len(arr) == 0`.
2. **Return a default** (e.g. `0`). Silent failure — bugs from `head([])` would be hard to track down.
3. **Return a `Result`**. Would require coupling to `aether-result`. Not worth the dependency for this package.

The panic message is descriptive (`"head: empty list"`) so the error is easy to find.

## Implementation patterns

The codebase uses a small set of recurring patterns. Recognizing them makes the source easier to read.

### Pattern 1: build-and-push

Most functions build a result array with `let mut out = [];` and `push(out, ...)`. This is the canonical "list builder" in Aether.

```aether
pub fn reverse(arr: [int]) -> [int] {
  let mut out = [];
  let mut i = len(arr) - 1;
  while i >= 0 {
    push(out, arr[i]);
    i = i - 1;
  }
  out
}
```

### Pattern 2: linear scan with flag

`takeWhile`, `dropWhile`, and `not_contains` use a boolean flag to short-circuit:

```aether
pub fn takeWhile(arr: [int], pred: fn(int) -> bool) -> [int] {
  let mut out = [];
  let mut i = 0;
  let mut keep = true;
  while i < len(arr) && keep {
    if pred(arr[i]) {
      push(out, arr[i]);
    } else {
      keep = false;
    };
    i = i + 1;
  }
  out
}
```

### Pattern 3: recursive divide-and-conquer

`sortWith` (quicksort) and `permutations` use recursion:

```aether
pub fn sortWith(arr: [int], cmp: fn(int, int) -> int) -> [int] {
  if len(arr) <= 1 {
    arr
  } else {
    let pivot = arr[0];
    let mut lt = []; let mut eq = []; let mut gt = [];
    // partition into lt, eq, gt ...
    append_arr(append_arr(sortWith(lt, cmp), eq), sortWith(gt, cmp))
  }
}
```

### Pattern 4: tuple-as-array

`span`, `break_`, and `partition` return two arrays; we represent the pair as a 2-element outer array. The caller destructures with `[a, b] = span(xs, p)` or by indexing `span(xs, p)[0]` / `[1]`.

## Future work

- **Lazy sequences.** All functions here are strict (they fully evaluate their inputs). A companion package `aether-iterator` provides lazy iterators that compose with these via `iterCollect` / `iterFrom`.
- **Polymorphic element types.** Currently annotated as `int`; a future generic-parameters extension to Aether would let us write `fn head<T>(arr: [T]) -> T`.
- **Faster `nub`.** The O(n²) `nub` is acceptable for small lists; a sorted-set-based `nubSorted` is a candidate for `aether-list-extra`.

## License

MIT — same as the Aether language.
