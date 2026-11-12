# aether-set

> Set operations for the Aether language — 20 pure functions implementing the standard mathematical set API, written entirely in Aether.

`aether-set` provides a small, dependency-free toolkit for working with sets of integers in Aether. A set is represented internally as a sorted array of unique elements; the invariant is maintained by every operation, so `has` is O(log n) via binary search, and `union`/`intersect`/`difference`/`sym_diff` are O(n) merge-style scans (rather than the naive O(n*m) approach of nested loops). All operations return new sets — the inputs are never mutated — which matches the "values, not references" style of the rest of the Aether packages and makes sets safe to pass around freely.

The package is targeted at three audiences:

1. **Application authors** who need to deduplicate arrays, compute set differences, or check membership without reaching for the full `Map`/`Set` machinery of a richer language.
2. **Library authors** who want a small, dependency-free building block to layer higher abstractions on top of (e.g. a graph library can use `from_arr` to deduplicate vertex lists; a constraint solver can use `intersect` to narrow feasible sets).
3. **Language learners** who want to see how a non-trivial data structure with a sorted invariant is implemented in idiomatic Aether. The source of `lib.ae` is heavily commented and walks through the invariant, the binary-search `has`, and the merge-style set algebra.

## Why a set package?

Aether ships a small core of built-in functions (`print`, `len`, `range`, `map`, `filter`, `reduce`, `push`, `pop`, `assert`, `assert_eq`, `panic`, `str`, `int`, `min`, `max`, `abs`, `sqrt`). It does *not* ship a `Set` data structure or any set-algebra operations. Applications that need set membership or set algebra typically reimplement these — badly. A naive `has` is O(n); a naive `union` is O(n*m); the result is correct but slow on large inputs. `aether-set` is the canonical user-installable package for set operations.

## API

All 20 functions are `pub fn` declarations in `src/lib.ae`. They are pure: they return new sets and never mutate their inputs. The element type is `int` throughout — the type system is mostly erased at runtime, so the same code works for any comparable value the caller cares to encode as int.

### Construction

| Function | Signature | Description |
| --- | --- | --- |
| `new()` | `() -> [int]` | The empty set. |
| `from_arr(arr)` | `([int]) -> [int]` | Construct a set from an array (dedup + sort). |

### Modification

| Function | Signature | Description |
| --- | --- | --- |
| `add(s, x)` | `([int], int) -> [int]` | Return a new set with `x` added (no-op if present). |
| `remove(s, x)` | `([int], int) -> [int]` | Return a new set with `x` removed (no-op if absent). |

### Inspection

| Function | Signature | Description |
| --- | --- | --- |
| `has(s, x)` | `([int], int) -> bool` | True iff `x ∈ s`. O(log n) binary search. |
| `size(s)` | `([int]) -> int` | Number of elements. |
| `to_array(s)` | `([int]) -> [int]` | Return a sorted-array copy. |
| `to_string(s)` | `([int]) -> string` | Render as `{1, 2, 3}`. |

### Set algebra

| Function | Signature | Description |
| --- | --- | --- |
| `union(s, t)` | `([int], [int]) -> [int]` | `s ∪ t`. |
| `intersect(s, t)` | `([int], [int]) -> [int]` | `s ∩ t`. |
| `difference(s, t)` | `([int], [int]) -> [int]` | `s \ t` (elements in s but not t). |
| `sym_diff(s, t)` | `([int], [int]) -> [int]` | `s △ t` (in s or t but not both). |

### Relations

| Function | Signature | Description |
| --- | --- | --- |
| `subset(s, t)` | `([int], [int]) -> bool` | True iff `s ⊆ t`. |
| `superset(s, t)` | `([int], [int]) -> bool` | True iff `s ⊇ t` (= `subset(t, s)`). |
| `disjoint(s, t)` | `([int], [int]) -> bool` | True iff `s ∩ t = ∅`. |
| `equal(s, t)` | `([int], [int]) -> bool` | True iff `s == t`. |

### Higher-order

| Function | Signature | Description |
| --- | --- | --- |
| `map(s, f)` | `([int], fn(int) -> int) -> [int]` | Apply `f` to each element, dedup the result. |
| `filter(s, pred)` | `([int], fn(int) -> bool) -> [int]` | Keep elements where `pred` holds. |
| `fold(s, init, f)` | `([int], int, fn(int, int) -> int) -> int` | Left fold. |
| `any(s, pred)` | `([int], fn(int) -> bool) -> bool` | True if any element satisfies `pred` (short-circuits). |
| `all(s, pred)` | `([int], fn(int) -> bool) -> bool` | True if all elements satisfy `pred` (short-circuits). |

## Design notes

The sorted-unique-array representation is a deliberate trade-off. The alternatives are:

- **Unsorted unique array.** `has` is O(n) — fine for small sets, terrible for large ones.
- **Hash set.** Faster `has`/`add`/`remove` in theory, but Aether's `Map` builtin uses value equality (not hashing), so a hash-based set would need to handle collisions explicitly. The constant factors would also be larger than a sorted array for small sets (which are the common case in Aether programs).
- **Boolean array indexed by element value.** Fast, but limits the element range to small non-negative ints. Not a general set.

The sorted-array representation gives O(log n) `has` via binary search (which is what most call sites care about), O(n) set algebra (which is the theoretical optimum), and trivially supports `to_string` and `to_array`. The cost is O(n) `add`/`remove` — but for the small-to-medium sets that Aether programs typically use, the constant factors of a sorted array beat a balanced tree.

`from_arr` is O(n log n) (insertion sort + dedup). For very large arrays a heap-sort or merge-sort would be faster in the worst case; the current implementation uses insertion sort because the constants are small for the sizes that Aether programs actually encounter, and because insertion sort is stable (preserves relative order of equal elements, which makes the dedup trivial).

`map` may shrink the set if the function maps two distinct elements to the same value: `map({-1, 1}, x*x) = {1}`. This matches the mathematical expectation. `filter` and `fold` preserve the set invariant trivially.

## Examples

```aether
import {
  from_arr, union, intersect, difference, to_string,
} from "aether-set/src/lib.ae";

let a = from_arr([1, 2, 3, 4, 5]);
let b = from_arr([4, 5, 6, 7, 8]);
print(to_string(union(a, b)));        // "{1, 2, 3, 4, 5, 6, 7, 8}"
print(to_string(intersect(a, b)));    // "{4, 5}"
print(to_string(difference(a, b)));    // "{1, 2, 3}"
```

The package ships `examples/example.ae`, a runnable demo that exercises every set operation with small inputs and prints the resulting sets.

## Limitations (v1)

- **Element type is `int` only.** The same combinators work for any value encoded as int, but the type system doesn't model a generic `Set<T>`.
- **No persistent (immutable) shared-structure representation.** Every `add`/`remove` allocates a new array. A v2 might use a balanced tree or HAMT for shared-structure updates.
- **`add`/`remove` are O(n).** Fine for small sets; for very large sets, a v2 might add a `Map`-backed variant with O(log n) updates.

## Testing

The package ships 30+ assertions in `tests/tests.ae`, covering every public function plus the set-algebra laws (idempotency, commutativity, distributivity where applicable). Run with:

```
bun -e "import {runModule} from '/home/z/my-project/aether/core/modules/modules'; \
  runModule('aether-packages/aether-set/tests/tests.ae', {maxSteps:50000000})"
```

All tests pass under the v3 module loader.

## Installation

Drop the `aether-set` directory into your `aether-packages/` (or any directory on the Aether package path) and add `aether-set` to your project's `aether.toml` `[dependencies]` table:

```toml
[dependencies]
aether-set = "0.1.0"
```

Then `import { from_arr, union, intersect, ... } from "aether-set/src/lib.ae";` from any Aether source file in your project.
