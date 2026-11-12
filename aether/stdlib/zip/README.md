# Aether stdlib — `zip`

The `zip` module is the complete toolkit for zipping arrays together. 10 functions, ~190 lines of TypeScript, zero dependencies, pure functions, no input mutation. Zipping is one of those small primitives that comes up constantly — pairing keys with values, combining x and y coordinates, walking two parallel arrays, building dicts, attaching indices to values — and the standard library ships every common variant so you don't have to write it inline.

## What's here

| Function | Behaviour |
|---|---|
| `zip(a, b)` | 2-tuples, truncate to shorter |
| `zip3(a, b, c)` | 3-tuples, truncate to shortest |
| `zipWith(a, b, fn)` | combine each pair through `fn(a, b, i)` |
| `unzip(arr)` | turn 2-tuples back into `[a[], b[]]` |
| `unzip3(arr)` | turn 3-tuples back into `[a[], b[], c[]]` |
| `zipLongest(a, b, fill?)` | pad short side with `fill` (default null) |
| `zipAll(fill?, ...arrs)` | variadic zip, all inputs padded |
| `zipToDict(keys, values)` | zip into a record (string keys) |
| `zipStrict(a, b)` | zip but panic on length mismatch |
| `zipWithIndex(arr)` | pair each element with its index |

## Conventions

- **Pure functions** — no input is ever mutated.
- **Truncation by default**: `zip` and `zip3` truncate to the shorter input; they never pad. This matches `Array.prototype` semantics and is what you want in most `map`-style pipelines.
- **Padding when you ask for it**: `zipLongest` and `zipAll` pad to the longest input with a sentinel (default `null`, or your `fill`).
- **Strict when you need it**: `zipStrict` panics on length mismatch, turning silent truncation into an explicit error.
- **String keys**: `zipToDict` stringifies non-string keys (so numeric keys work too — they become string-keyed record entries).
- **Errors are panics** — invalid input (non-array, non-tuple in `unzip`, mismatched lengths in `zipStrict`) throws a plain `Error` that the evaluator surfaces as an Aether panic.

## The functions

### `zip(a, b) -> any[]` — 2-array zip, truncate

Pair up two arrays element-by-element. Truncates to the shorter input — no padding. `zip([1,2,3], ["a","b"])` → `[[1,"a"],[2,"b"]]`. This is the everyday workhorse; if you want padding or a different combine, reach for the variants below.

### `zip3(a, b, c) -> any[]` — 3-array zip, truncate

Same as `zip` but for three arrays. Truncates to the shortest. `zip3([1,2], [10,20], [100,200])` → `[[1,10,100],[2,20,200]]`. (We stop at 3 because going further is rare; for n-ary zips with padding, see `zipAll`.)

### `zipWith(a, b, fn) -> any[]` — zip + combine

Zip two arrays and apply `fn(a_i, b_i, i)` to each pair, returning the array of results. `zipWith([1,2,3], [10,20,30], (a,b) => a + b)` → `[11, 22, 33]`. The function form is convenient when you don't actually want the tuples, just the combined values — saves a `map` step downstream.

### `unzip(arr) -> any[]` — reverse zip

Turn an array of 2-tuples back into a 2-tuple of arrays. `unzip([[1,"a"],[2,"b"]])` → `[[1,2],["a","b"]]`. Panics if any element isn't a 2-tuple. Useful after a `zip` when you want to fan the pairs back out.

### `unzip3(arr) -> any[]` — reverse zip3

Same as `unzip` but for 3-tuples: returns `[a[], b[], c[]]`. Panics on non-3-tuples.

### `zipLongest(a, b, fill?) -> any[]` — padded zip

Zip two arrays, padding the shorter side with `fill` (default `null`) so the output length equals the longer input. `zipLongest([1,2,3], ["a","b"], 0)` → `[[1,"a"],[2,"b"],[3,0]]`. Use this when truncation would silently drop data.

### `zipAll(fill?, ...arrs) -> any[]` — variadic padded zip

Zip any number of arrays together, padding every short input to the longest length with `fill` (default `null`). The function accepts two call shapes:

- `zipAll(fill, a, b, c)` — explicit fill first, then arrays.
- `zipAll(a, b, c)` — all-array call; `fill` defaults to `null`.

`zipAll(0, [1,2,3], [10,20], [100])` → `[[1,10,100], [2,20,0], [3,0,0]]`. The fill-first form is detected by checking whether the first argument is an array; if it is, the function treats all arguments as arrays and uses `null` as the fill.

### `zipToDict(keys, values) -> record` — build a dict

Zip two arrays into a record (dictionary) mapping the first array's elements (stringified if needed) to the second array's elements. Truncates to the shorter input. Later duplicate keys overwrite earlier ones. `zipToDict(["a","b"], [1,2])` → `{ a: 1, b: 2 }`. Numeric keys are stringified: `zipToDict([1,2], ["x","y"])` → `{ "1": "x", "2": "y" }`.

### `zipStrict(a, b) -> any[]` — zip with length check

Like `zip` but panics if the inputs aren't the same length. Useful when mismatched lengths are a programmer error — e.g., zipping header names with a row of values where a mismatch means the row is malformed. The panic message includes both lengths for easy debugging.

### `zipWithIndex(arr) -> any[]` — pair with index

Pair each element of `arr` with its index, returning an array of `[index, value]` tuples. `zipWithIndex(["a","b","c"])` → `[[0,"a"],[1,"b"],[2,"c"]]`. Useful when you need both the position and the value in a `map`/`filter` pipeline — saves the closure-capture dance of tracking `i` separately.

## Naming note

`zip` here intentionally shadows the older bare-name version registered from the `collections` module. The `zip`-module version is a strict superset (same 2-array behaviour, richer error messages, identical return shape), so any existing user code that relied on `collections.zip` keeps working unchanged. The unit tests for `collections` use the namespace import (`import * as Coll`), so they continue to verify the original implementation directly.

## Performance notes

- All single-pass zips are O(min(n, m)) — they stop at the shorter input, no wasted work.
- `zipLongest` and `zipAll` are O(max(n, m, ...)) — they walk to the longest input.
- `unzip` and `unzip3` are O(n) with a single pass.
- `zipWithIndex` is O(n).
- All are allocation-light: one output array plus the per-element tuples (or records).

## What's NOT here

- **`zipDictStrict`** (a strict length version of `zipToDict`): the strict check is easy to compose — `assert_eq(keys.length, values.length); zipToDict(keys, values)` — so we don't ship a separate name.
- **`zip4` / `zip5`**: rare in practice; use `zipAll` if you genuinely need four or more arrays.
- **`zipWith3`**: rare; compose `zip3` with a `map` instead.

The whole module is 10 functions, ~190 lines of TypeScript, no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
