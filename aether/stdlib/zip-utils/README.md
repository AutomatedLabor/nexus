# aether/stdlib/zip-utils

`zip-utils` is the canonical umbrella namespace for Aether's array-zipping
helpers. It re-exports the ten functions defined in the sibling `zip` module
under the same names so that Aether programs and host code can refer to the
whole family through one stable, well-named import. The module exists for
three reasons:

1. **Discoverability.** The bare name `zip` is also the name of a 2-array
   builtin registered by the older `collections` module. When developers
   grep the docs or autocomplete the function list, the meaning of `zip`
   can be ambiguous. `zip-utils` is unambiguous — every function under it
   is a zipping/unzipping helper and nothing else.
2. **Single source of truth at runtime.** When the stdlib is wired into
   the evaluator via `registerAll`, both `zip` and `zip-utils` register
   the same ten builtins under the same names. The second call merely
   overwrites the first with the same function reference, so the
   observable behaviour is unchanged but every consumer that imports
   from either path is guaranteed to see the same implementation.
3. **Broader test coverage.** This module hosts its own 25-case test
   suite that exercises edge cases not covered by the `zip` module's
   tests: mixed-type tuples, large 100-element inputs, unicode keys,
   partial-fill round trips through `unzip`, `zipAll` with one or many
   inputs, and `zipToDict` semantics on numeric, boolean, and unicode
   keys. Combined with the `zip` suite, the family has noticeably
   stronger coverage than either suite alone.

## Functions

| Name | Signature | Description |
| --- | --- | --- |
| `zip` | `(a, b) -> any[]` | Zip two arrays into 2-tuples; truncate to the shorter input. |
| `zip3` | `(a, b, c) -> any[]` | Zip three arrays into 3-tuples; truncate to the shortest. |
| `zipWith` | `(a, b, fn) -> any[]` | Zip two arrays and combine each pair through `fn(a, b, i)`. |
| `unzip` | `(arr) -> any[]` | Unzip an array of 2-tuples into `[a[], b[]]`. |
| `unzip3` | `(arr) -> any[]` | Unzip an array of 3-tuples into `[a[], b[], c[]]`. |
| `zipLongest` | `(a, b, fill?) -> any[]` | Zip two arrays, padding the shorter with `fill` (default `null`). |
| `zipAll` | `(fill?, ...arrs) -> any[]` | Zip any number of arrays; pad short inputs with `fill` (default `null`). |
| `zipToDict` | `(keys, values) -> record` | Zip into a record mapping `keys` to `values` (keys are stringified). |
| `zipStrict` | `(a, b) -> any[]` | Like `zip` but panics on length mismatch. |
| `zipWithIndex` | `(arr) -> any[]` | Pair each element with its index: `[[i, v], ...]`. |

## Semantics at a glance

- **Truncation by default.** `zip`, `zip3`, and `zipWith` truncate to the
  shorter input — no padding, no error. This matches Python's `itertools.zip`
  and most modern zip libraries.
- **Padding is explicit.** `zipLongest` and `zipAll` pad the short inputs
  with a fill value. `zipLongest` defaults to `null` if no fill is supplied;
  `zipAll` uses `null` if its first argument is an array (the "no fill
  provided" form). To use a custom fill, pass it as the first argument:
  `zipAll(0, a, b, c)`.
- **Strict mode.** `zipStrict` panics when the inputs aren't the same
  length. Use it when a length mismatch is a programmer error rather
  than a legitimate runtime condition.
- **Dict keys are stringified.** `zipToDict` always converts keys to
  strings via `String(k)`. Numbers, booleans, and even nested objects
  become strings via their `toString` representations. If you need
  non-string keys, use a plain `mapNew()` and populate it with a `while`
  loop.
- **Duplicate keys.** In `zipToDict`, later duplicate keys overwrite
  earlier ones (last write wins). This matches JavaScript's object
  literal semantics.

## Aether usage

```aether
import { zip, zipWith, zipToDict, zipWithIndex } from "aether/stdlib/zip-utils";

let pairs = zip([1, 2, 3], ["a", "b", "c"]);
// pairs == [[1, "a"], [2, "b"], [3, "c"]]

let sums = zipWith([1, 2, 3], [10, 20, 30], fn(a: int, b: int) -> int { a + b });
// sums == [11, 22, 33]

let d = zipToDict(["alpha", "beta"], [1, 2]);
// d == { "alpha": 1, "beta": 2 }

let indexed = zipWithIndex(["x", "y", "z"]);
// indexed == [[0, "x"], [1, "y"], [2, "z"]]
```

## Relationship to the `zip` module

This module is a thin re-export shim. The implementations live in
`aether/stdlib/zip`; `zip-utils` imports them and re-exports them
under the same names. Both modules' `register` functions register the
same ten builtins under the same names, so wiring either one into the
evaluator gives identical runtime behaviour. Wiring both (which is
the default in `registerAll`) is also safe — the second registration
overwrites the first with the same function reference.

This pattern keeps the namespace tidy: if you only want zipping helpers,
import `zip-utils`. If you're working with the full `collections`
suite and already have `zip` in scope, you can use it directly. There
is no functional difference at runtime.

## Limitations

- All inputs must be arrays. The functions throw a plain `Error` (which
  the evaluator converts to an Aether panic) if any argument is not an
  array.
- `zipWith` requires `fn` to be a function; passing a non-callable value
  panics.
- `unzip` and `unzip3` panic if any element of the input array is not
  itself an array of the required length (2 or 3, respectively).
- `zipStrict` panics on any length mismatch — it is intentionally less
  forgiving than `zip`.
- `zipToDict` only produces string-keyed records. For arbitrary keys,
  build a `Map` directly.
- The `MISSING` sentinel exported by the `zip` module is also
  re-exported here for tests that need to detect "missing" placeholder
  values from `zipLongest`.

## Test coverage

The test suite in `index.test.ts` contains 25 cases that exercise:

- happy paths with mixed types (int, string, bool, object);
- large inputs (100 elements, 50 elements);
- empty inputs (any side empty -> empty output);
- error cases (non-array inputs, non-function `fn`, mismatched lengths
  for `zipStrict`, malformed tuples for `unzip`/`unzip3`);
- unicode string keys for `zipToDict`;
- boolean keys for `zipToDict`;
- duplicate-key overwrite semantics for `zipToDict`;
- `zipAll` with one, many, or zero arrays;
- round trips (zip-then-unzip, zip3-then-unzip3);
- the re-export invariant (the function references are identical to
  the `zip` module's).

Combined with the `zip` module's own 25-case suite, the family has 50
distinct test cases covering the public surface.
