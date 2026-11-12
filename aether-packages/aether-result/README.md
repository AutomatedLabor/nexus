# aether-result

> Result and Option types for Aether — 20 pure functions modeled as enums, covering the Haskell `Either`/`Maybe` and Rust `Result`/`Option` APIs.

Aether ships without a built-in `Result` or `Option` type. Errors are handled with `panic` (which throws and unwinds) and there's no first-class "optional value" — a function that might not return a value has to either return a sentinel (e.g. `-1`) or panic. `aether-result` fills this gap with two enums and 20 pure functions that compose, modeled after Rust's `Result` and `Option` APIs (which themselves derive from Haskell's `Either` and `Maybe`).

The package is the third target of the Aether package registry (RFC-005, draft). It demonstrates how to model algebraic data types in Aether using `enum` and how to write combinators on them using pattern matching.

## Why a Result/Option package?

Error handling is one of the central questions of language design. Aether's `panic` is great for unrecoverable errors (programming bugs, invariant violations), but it's the wrong tool for *expected* errors (file-not-found, parse errors, missing fields). For those, you want a value that carries either the success payload or the error reason, and combinators that propagate errors through a computation.

`Result<T, E>` is the canonical type for this: it's `Ok(T)` or `Err(E)`. The combinators (`map`, `andThen`, `mapErr`, `orElse`) let you write a pipeline of fallible operations without manually checking `isOk` at each step — the combinator handles the "short-circuit on Err" wiring for you.

`Option<T>` is the canonical type for *maybe-a-value*: it's `Some(T)` or `None`. It's `Result` without an error reason — useful when the "missing" case doesn't need an explanation (looking up a key in a cache, finding an element in a list).

The two types are isomorphic — `Option<T> = Result<T, ()>`, and `Result<T, E> = Option<T> + E`. `aether-result` provides both because they're conceptually distinct in the API (a `Option` says "maybe", a `Result` says "succeeded or failed with a reason") and the combinators have different names in different communities.

## API

All 20 functions are `pub fn` declarations in `src/lib.ae`. They are pure: they return new enum values and never mutate. The enums are defined as:

```aether
enum Result { Ok(int), Err(string) }
enum Option { Some(int), None }
```

The payload types are nominally `int` and `string` (because Aether's enum variants need a concrete type), but at runtime they accept any value — type annotations are documentation, not enforcement. The combinators (`map`, `mapErr`, etc.) work on the runtime payload regardless of the declared type.

### Constructors

| Function | Signature | Description |
| --- | --- | --- |
| `ok(v)` | `(int) -> Result` | Wrap `v` in `Result::Ok`. |
| `err(e)` | `(string) -> Result` | Wrap `e` in `Result::Err`. |
| `some(v)` | `(int) -> Option` | Wrap `v` in `Option::Some`. |
| `none()` | `() -> Option` | Return `Option::None`. |

### Predicates

| Function | Signature | Description |
| --- | --- | --- |
| `isOk(r)` | `(Result) -> bool` | True if `r` is `Result::Ok`. |
| `isErr(r)` | `(Result) -> bool` | True if `r` is `Result::Err`. |
| `isSome(o)` | `(Option) -> bool` | True if `o` is `Option::Some`. |
| `isNone(o)` | `(Option) -> bool` | True if `o` is `Option::None`. |

### Extraction

| Function | Signature | Description |
| --- | --- | --- |
| `unwrap(r)` | `(Result) -> int` | Extract the Ok value, or panic on Err. |
| `unwrapOr(r, default)` | `(Result, int) -> int` | Extract the Ok value, or return `default`. |
| `unwrapErr(r)` | `(Result) -> string` | Extract the Err value, or panic on Ok. |
| `unwrapOption(o, default)` | `(Option, int) -> int` | Extract the Some value, or return `default`. |

`unwrap` and `unwrapErr` panic on the "wrong" variant. They're useful for cases where you've already checked `isOk`/`isErr` and want to extract the payload without a default. For all other cases, prefer `unwrapOr` (which doesn't panic).

### Transformation

| Function | Signature | Description |
| --- | --- | --- |
| `map(r, f)` | `(Result, fn(int) -> int) -> Result` | Apply `f` to the Ok value (if present); pass Err through. |
| `mapErr(r, f)` | `(Result, fn(string) -> string) -> Result` | Apply `f` to the Err value (if present); pass Ok through. |
| `andThen(r, f)` | `(Result, fn(int) -> Result) -> Result` | FlatMap: if Ok, apply `f` to get a new Result; if Err, pass. |
| `orElse(r, f)` | `(Result, fn(string) -> Result) -> Result` | If Err, apply `f` to get a new Result; if Ok, pass. |
| `mapOption(o, f)` | `(Option, fn(int) -> int) -> Option` | Apply `f` to the Some value (if present); pass None through. |
| `andThenOption(o, f)` | `(Option, fn(int) -> Option) -> Option` | FlatMap: if Some, apply `f` to get a new Option; if None, pass. |

`andThen` (also called `flatMap` or `bind` in other languages) is the key combinator for chaining fallible operations:

```aether
fn parse_int(s: string) -> Result { ... }
fn validate(n: int) -> Result { ... }
fn save(n: int) -> Result { ... }

// Without andThen:
let p = parse_int(input);
if isOk(p) {
  let v = validate(unwrap(p));
  if isOk(v) {
    let s = save(unwrap(v));
    ...
  }
}

// With andThen:
let result = andThen(andThen(parse_int(input), validate), save);
```

### Conversions

| Function | Signature | Description |
| --- | --- | --- |
| `okToOption(r)` | `(Result) -> Option` | `Ok(v) -> Some(v)`; `Err(_) -> None`. |
| `errToOption(r)` | `(Result) -> Option` | `Err(e) -> Some(e)`; `Ok(_) -> None`. |
| `optionToResult(o, err)` | `(Option, string) -> Result` | `Some(v) -> Ok(v)`; `None -> Err(err)`. |
| `fromOption(o, err)` | `(Option, string) -> Result` | Alias of `optionToResult` for symmetry. |

### Collection / traversal

| Function | Signature | Description |
| --- | --- | --- |
| `collect(arr)` | `([Result]) -> Result` | Turn `[Result]` into `Result<[int]>`. First Err short-circuits. |
| `traverse(arr, f)` | `([int], fn(int) -> Result) -> Result` | Apply `f` to each, then `collect`. Short-circuits on Err. |

`collect` is the "all-or-nothing" combinator: given a list of `Result`s, return `Ok` of the list of values if all are `Ok`, or the first `Err`. `traverse` is `collect` + `map`: apply a fallible function to each element of a list, and short-circuit on the first error.

```aether
let results = [ok(1), ok(2), ok(3)];
let combined = collect(results);  // Ok([1, 2, 3])

let parsed = traverse(["1", "2", "x"], parse_int);  // Err("parse error") (if "x" fails)
```

## How to use

### As a dependency

Add `aether-result` to your project's `aether.toml`:

```toml
[dependencies]
aether-result = "0.1.0"
```

Then in your Aether source, import the functions you need:

```aether
import { ok, err, andThen, map, unwrapOr } from "aether-result";

fn parse_int(s: string) -> Result {
  // ... parse s; return ok(n) or err("parse error")
}

fn validate(n: int) -> Result {
  if n > 0 { ok(n) } else { err("must be positive") }
}

let result = andThen(parse_int("42"), validate);
let value = unwrapOr(result, 0);
print(value);  // 42 if both succeeded, 0 otherwise
```

### Locally (without the registry)

```aether
import { ok, err, map } from "./aether-packages/aether-result/src/lib.ae";

print(map(ok(5), fn(x: int) -> int { x * 2 }));  // Result::Ok(10)
```

### Running the test suite

```sh
aether test aether-packages/aether-result/tests
# PASS aether-packages/aether-result/tests/tests.ae
# 1 passed, 0 failed
```

The test file (`tests/tests.ae`) contains 25+ `assert_eq` cases covering every `pub fn` in the library.

### Running the example

```sh
aether run aether-packages/aether-result/examples/example.ae
```

The example exercises every function with a small input, producing a snapshot of expected outputs.

## Design notes

### Why enums and not structs?

Aether enums are algebraic data types: each variant can carry data. `Result` is `enum Result { Ok(int), Err(string) }` — two variants, each carrying one payload. This is exactly the structure of Rust's `Result` and Haskell's `Either`. Modeling as a struct would require:

- A `kind` field (e.g. `"ok"` or `"err"`).
- Optional payload fields that are null in the "wrong" variant.
- Manual `kind`-checks instead of pattern matching.

Enums are the natural fit. Pattern matching (`match r { Result::Ok(v) => ..., Result::Err(e) => ... }`) is more readable than `if r.kind == "ok" { ... r.value ... } else { ... r.error ... }`.

### Why `int` and `string` as payload types?

Aether's enum variants need a concrete payload type. We pick `int` for `Ok` and `string` for `Err` because:

1. **They're the most common cases in practice.** Most fallible computations return ints (parsed numbers, computed values) and report string errors (parse errors, missing-key messages).
2. **The type checker is lenient.** Aether doesn't block execution on type errors. `ok("hello")` works fine at runtime — the type checker warns, but the value flows through. So `ok(v)` accepts any `v` at runtime.
3. **Polymorphism via type erasure.** Aether's type system is mostly erased at runtime. The declared payload types are documentation, not enforcement. If you need `Result<string, int>`, use the same enum — the values will be the right types at runtime, and only the type checker will complain (non-blocking).

A future generic-parameters extension to Aether would let us write `enum Result<T, E> { Ok(T), Err(E) }` and have the type checker track the payload types properly. Until then, the type-erased approach works.

### Why does `unwrap` panic on Err?

`unwrap` is the "I'm sure this is Ok, give me the value" combinator. It panics on Err because the only alternatives are:

1. **Return a sentinel** (e.g. `0`). Silent failure — bugs from accidentally calling `unwrap` on an Err would be very hard to track down.
2. **Return `null` (unit).** Same problem, slightly worse because null propagates silently.
3. **Panic** (chosen). Matches Rust's `unwrap`. Forces the caller to handle the Err case explicitly with `unwrapOr` or by checking `isOk` first.

The panic message is descriptive (`"unwrap: called on Err(<e>)"`) so the error is easy to find. If you're not sure whether the Result is Ok, use `unwrapOr(r, default)` instead.

### Why no `?` operator?

Aether v1 has the `?` operator (`expr?` unwraps an Ok/Some value, or propagates the Err/None by returning from the enclosing function). It works on the unstructured values that the type checker infers — not on the `Result`/`Option` enums defined here. Bridging the two would require runtime type checks, which is a follow-up.

For now, use the combinators: `andThen` chains fallible operations, `map` transforms the Ok value, `unwrapOr` extracts with a default.

### Why `mapErr` but not `mapOptionErr`?

`Option` doesn't have an error value — `None` carries no payload. So there's no `mapOptionErr`. The `Option` analog of `mapErr` is "replace `None` with a value", which is `unwrapOption` (with a default).

### Why `collect` short-circuits on the first Err

`collect` walks the input list and returns `Ok` of the collected values if all are `Ok`, or the first `Err`. The implementation uses an early `return` on the first `Err` — it doesn't process the rest of the list. This is the same behavior as Rust's `Iterator::collect::<Result<Vec<_>, _>>()` and Haskell's `sequence`. It's the right default because:

1. **Predictability.** The error you get is from the first failing element, in iteration order.
2. **Performance.** No point processing later elements if we already know the answer is `Err`.
3. **Composability.** `traverse` is `collect ∘ map`, so it inherits the same short-circuit behavior.

### Why the parameter is named `f`, not `fn`

The function-typed parameters in `map`, `andThen`, etc. are named `f` instead of `fn` because `fn` is a reserved keyword in Aether (it starts a function declaration / lambda expression). Naming a parameter `fn` is a syntax error. The convention `f` for function-typed parameters matches Haskell, Scala, and most ML-family languages.

## Implementation patterns

The codebase uses a small set of recurring patterns.

### Pattern 1: match-and-return

Every function is a single `match` on the enum:

```aether
pub fn isOk(r: Result) -> bool {
  match r {
    Result::Ok(_) => true,
    Result::Err(_) => false,
  }
}
```

The pattern `Result::Ok(_)` matches any `Ok` variant (ignoring the payload with `_`). The match expression returns the value of the matching arm.

### Pattern 2: short-circuit with `return`

`collect` and `traverse` use an early `return` inside a `match` arm to short-circuit on the first error:

```aether
while i < len(arr) {
  match arr[i] {
    Result::Ok(v) => { push(out, v); },
    Result::Err(e) => { return Result::Err(e); },
  };
  i = i + 1;
}
```

The `return` exits the whole function, not just the loop. This is the canonical short-circuit pattern in Aether.

### Pattern 3: helper-function chains

`mapErr` is implemented as a `match` that swaps the operation; `andThen` chains by calling `f(v)` in the Ok arm:

```aether
pub fn andThen(r: Result, f: fn(int) -> Result) -> Result {
  match r {
    Result::Ok(v) => f(v),
    Result::Err(e) => Result::Err(e),
  }
}
```

The Ok arm returns the result of `f(v)` (which is itself a Result). The Err arm constructs a new `Err` with the same error. This is the monadic bind operation, expressed as a 4-line function.

## Future work

- **Generic type parameters.** Currently the enum payloads are `int`/`string`; a future generic-parameters extension to Aether would let us write `enum Result<T, E> { Ok(T), Err(E) }`.
- **`?` operator integration.** Bridging the existing `expr?` operator to work on the `Result`/`Option` enums defined here would require runtime type checks.
- **Async variants.** `asyncCollect` / `asyncTraverse` for fallible async operations, when Aether's async story (RFC-006, draft) stabilizes.

## License

MIT — same as the Aether language.
