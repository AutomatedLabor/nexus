# aether-iterator

> Lazy iterator combinators for the Aether language — 18 public functions implementing a Rust/Haskell-style iterator API, written entirely in Aether.

`aether-iterator` provides a small, composable toolkit for working with lazy sequences in Aether. The package models an iterator as a closure `fn() -> option<int>` — each call yields the next element (`Option::Some(x)`) or signals exhaustion (`Option::None`). Every combinator is a higher-order function that takes one or more iterators (or arrays, ranges, predicates, transforms) and produces a new iterator; the chain is consumed by a terminator like `iterCollect`, `iterCount`, `iterFold`, `iterAny`, `iterAll`, or `iterFind`. This separation between producer and consumer is the standard iterator pattern: it lets the program describe what to compute, then materialize the result exactly once, without allocating intermediate arrays at every step.

The package is aimed at three audiences:

1. **Application authors** who need to filter, map, take, drop, or fold over sequences and don't want to write `while` loops with manual index bookkeeping in every project.
2. **Library authors** who want a small, dependency-free building block to layer higher abstractions on top of (a `Set` library could be implemented in terms of `iterFilter` + `iterCollect`; a `Map` library in terms of `iterFold`).
3. **Language learners** who want to see how closures, options, and higher-order functions compose into a non-trivial data structure. The source of `lib.ae` is heavily commented and intended to be read end-to-end.

## Why an iterator package?

Aether's core builtins (`print`, `len`, `range`, `map`, `filter`, `reduce`, `push`, `pop`) include eager variants of `map`, `filter`, and `reduce`, but no lazy sequence type. Eager combinators allocate a fresh array at every step — `map(filter(xs, p), f)` materializes the filtered array, then maps it into another array, even when the consumer only wants the first element. For small inputs this is fine; for pipelines over large arrays (or infinite sequences) it's wasteful.

`aether-iterator` is the canonical user-installable package for lazy iteration. It is the reference target for the package registry protocol (RFC-005, draft): every future iterator-flavored package (`aether-iter-extra`, `aether-streaming`, `aether-async-iter`) is expected to either re-export `aether-iterator` or extend it.

## API

All 18 functions are `pub fn` declarations in `src/lib.ae`. They are pure: combinators return new closures, never mutate their inputs, and never allocate until a terminator is called. Four small option helpers (`some`, `none`, `is_some`, `unwrap_or`) are also exported so callers can pattern-match or unwrap the result of `iterFind` and `iterEnumerate` without re-implementing them.

### Constructors

| Function | Signature | Description |
| --- | --- | --- |
| `iterFrom(arr)` | `([int]) -> iter` | Iterator over an array's elements. |
| `iterRange(start, end)` | `(int, int) -> iter` | Iterator over `[start, end)`. Doesn't materialize. |
| `iterRepeat(x)` | `(int) -> iter` | Infinite iterator yielding `x` forever. |

### Combinators (lazy)

| Function | Signature | Description |
| --- | --- | --- |
| `iterMap(it, f)` | `(iter, fn(int) -> int) -> iter` | Apply `f` to each element. |
| `iterFilter(it, pred)` | `(iter, fn(int) -> bool) -> iter` | Keep elements where `pred` holds. |
| `iterTake(it, n)` | `(iter, int) -> iter` | First `n` elements, then None. |
| `iterDrop(it, n)` | `(iter, int) -> iter` | Drop `n`, yield the rest. |
| `iterZip(a, b)` | `(iter, iter) -> iter` | Pair-wise combine; stops at the shorter. Element is `a + b` (int channel — use `iterMap` to decode tuples). |
| `iterChain(a, b)` | `(iter, iter) -> iter` | Concatenate `a` then `b`. |
| `iterEnumerate(it)` | `(iter) -> iter` | Yield `index * 1_000_000 + value` (single int channel). |
| `iterCycle(it)` | `(iter) -> iter` | Repeat forever (materializes the source first). |

### Terminators (eager)

| Function | Signature | Description |
| --- | --- | --- |
| `iterCollect(it)` | `(iter) -> [int]` | Drain into an array. |
| `iterCount(it)` | `(iter) -> int` | Count elements (drains). |
| `iterFold(it, init, f)` | `(iter, int, fn(int, int) -> int) -> int` | Left fold. |
| `iterAny(it, pred)` | `(iter, fn(int) -> bool) -> bool` | True if any element matches (short-circuits). |
| `iterAll(it, pred)` | `(iter, fn(int) -> bool) -> bool` | True if all elements match (short-circuits). |
| `iterFind(it, pred)` | `(iter, fn(int) -> bool) -> option<int>` | First matching element, or None. |
| `iterForEach(it, f)` | `(iter, fn(int) -> unit) -> unit` | Call `f` on each element. |

(`iter` is shorthand for `fn() -> option<int>`.)

### Option helpers

| Function | Signature | Description |
| --- | --- | --- |
| `some(x)` | `(int) -> option<int>` | Wrap in `Option::Some`. |
| `none()` | `() -> option<int>` | The `Option::None` value. |
| `is_some(o)` | `(option<int>) -> bool` | True iff `Option::Some`. |
| `unwrap_or(o, dflt)` | `(option<int>, int) -> int` | Unwrap or return default. |

## Design notes

The iterator element type is `int` throughout. Aether's type system is mostly erased at runtime, so the same combinators work for any value the caller cares to encode as int — booleans as 0/1, characters as char codes, even small structs packed into an int. The trade-off is that pair-wise combinators like `iterZip` and `iterEnumerate` pack two values into one int (via `a + b` or `index * 1_000_000 + value`); the caller uses `iterMap` to decode. This keeps the surface area small and avoids needing generic types in the iterator combinator.

The package uses closures over mutable local state for the iterator's position (e.g., `let mut idx = 0;` captured by the closure). This is the standard closure-as-cursor pattern: each call to the closure advances the captured `idx` and returns the next element. The closure capture is by reference (Aether's default), so the same closure instance maintains state across calls — exactly the iterator semantics we want.

All combinators are one-shot. Once an iterator is exhausted, calling `next` again returns `Option::None` (and stays there). To consume an iterator twice, the caller must reconstruct it from the source. This matches Rust's `Iterator` trait (which is consumed by `next`) rather than Rust's `IntoIterator` (which can be reconstructed from the source). A `Cloned` combinator (which would buffer the source and replay it) is a v2 follow-up — `iterCycle` is the closest existing approximation but it always repeats forever.

`iterCycle` materializes the source into an array first (since iterators in this model are one-shot and the combinator needs to replay them). This is documented in the source comment: for very large sources, this means `iterCycle` is O(n) in memory. A v2 lazy `iterCycle` would require either shared-state closures or a different iterator model.

## Examples

```aether
import {
  iterFrom, iterMap, iterFilter, iterTake, iterCollect, iterFold, iterRange,
} from "aether-iterator/src/lib.ae";

// First 5 even numbers, doubled.
let result = iterCollect(iterTake(iterMap(iterFilter(
  iterRange(0, 100),
  fn(x: int) -> bool { x % 2 == 0 }),
  fn(x: int) -> int { x * 2 }), 5));
print(result);  // [0, 4, 8, 12, 16]

// Sum 1..=100.
let sum = iterFold(iterRange(1, 101), 0, fn(a: int, b: int) -> int { a + b });
print(sum);  // 5050
```

The package ships `examples/example.ae`, a runnable demo that exercises every combinator with small inputs and prints the collected results.

## Limitations (v1)

- **Element type is `int` only.** The same combinators work for any value encoded as int, but the type system doesn't yet model a generic `iter<T>`. v2 will likely add generic iterator types.
- **One-shot iterators.** No `Cloned` or replayable iterator combinator yet.
- **No async support.** All combinators are synchronous; `next()` returns synchronously. An async iterator package (`aether-async-iter`) is planned for v2.
- **`iterZip` packs two ints into one** (via `a + b`). This is a stop-gap; a v2 generic iterator would model tuples properly.
- **`iterEnumerate` packs `(index, value)` into a single int** (`index * 1_000_000 + value`). The caller decodes via integer division/mod. This is a stop-gap for the same reason.

## Testing

The package ships 25+ assertions in `tests/tests.ae`, covering every public function plus several chained-combinator scenarios. Run with:

```
bun -e "import {runModule} from '/home/z/my-project/aether/core/modules/modules'; \
  runModule('aether-packages/aether-iterator/tests/tests.ae', {maxSteps:50000000})"
```

All tests pass under the v3 module loader.

## Installation

Drop the `aether-iterator` directory into your `aether-packages/` (or any directory on the Aether package path) and add `aether-iterator` to your project's `aether.toml` `[dependencies]` table:

```toml
[dependencies]
aether-iterator = "0.1.0"
```

Then `import { iterFrom, iterMap, ... } from "aether-iterator/src/lib.ae";` from any Aether source file in your project.
