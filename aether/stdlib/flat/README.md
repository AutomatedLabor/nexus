# Aether stdlib — `flat`

The `flat` module is a focused toolkit for **flattening nested arrays** (and one helper for flattening nested records). 10 functions, ~200 lines of TypeScript, zero dependencies, pure functions, no input mutation.

## What's here

The flattening problem has more variants than you'd guess. We ship them all:

| Function | Shape | Returns |
|---|---|---|
| `flat(arr)` | one level | flat array |
| `flatDeep(arr)` | all levels | flat array |
| `flatten(arr, depth?)` | `depth` levels | flat array |
| `chunkFlat(arr, n)` | one level then re-chunk into groups of `n` | array of arrays |
| `flatMap(arr, fn)` | map + one level | flat array |
| `flatMapDeep(arr, fn)` | map + all levels | flat array |
| `nestedFlat(arr, n?)` | `n` levels (alias of `flatten`) | flat array |
| `flattenKeys(obj)` | nested record → dot-path keys | record |
| `flattenPath(obj, sep?)` | nested record → separator-path keys | record |
| `concatAll(...arrs)` | mix of arrays + scalars | flat array |

## Why 10 flattening functions?

There is no single "right" flatten — the right answer depends on (a) how deep to go, (b) whether you map at the same time, (c) whether you want the result re-chunked, and (d) whether the input is an array of values or a nested record (key-value tree). We provide all of these so you don't have to remember "the flatten module doesn't have X, I have to write it myself" — just pick the variant you need.

## Conventions

- **Pure functions** — no input is ever mutated. Every function returns a new array (or new record).
- **Scalars stay as scalars** when they appear at a position where an array is expected. `flat([1, [2, 3], 4])` gives `[1, 2, 3, 4]` — the `1` and `4` are pushed through unchanged.
- **Array indices become bracketed path segments** in the record flatteners: `{ a: [10, 20] }` flattens to `{ "a[0]": 10, "a[1]": 20 }`.
- **Depth control** is exact: `flatten(arr, 0)` returns a shallow copy; `flatten(arr, 1)` is one level; `flatten(arr, -1)` is fully deep (any negative value works the same way).
- **Errors are panics** — invalid input (non-array, non-record, non-positive chunk size, empty separator) throws a plain `Error` that the evaluator surfaces as an Aether panic.

## The functions

### `flat(arr) -> any[]` — one level

Flatten a single level of nesting. `[[1,2], [3,4], 5]` → `[1, 2, 3, 4, 5]`. Scalars and empty arrays are handled naturally. This is the everyday "flatten" — the one you want 80% of the time.

### `flatDeep(arr) -> any[]` — all levels

Recursively flatten every level of nesting until no element is an array. `[1, [2, [3, [4, [5]]]]]` → `[1, 2, 3, 4, 5]`. Cycles are not detected — Aether values are trees in practice.

### `flatten(arr, depth?) -> any[]` — `depth` levels

Flatten by an explicit depth. `depth=0` is a shallow copy (returns a new array, same contents). `depth=1` equals `flat`. `depth=2` flattens two levels (so `[1, [2, [3, [4]]]]` with depth 2 gives `[1, 2, 3, [4]]`). `depth<0` is treated as infinite (same as `flatDeep`). Default depth is 1.

### `chunkFlat(arr, n) -> any[]` — one level then re-chunk

Flatten one level, then re-group into chunks of size `n`. Useful when you want a flat list turned into row groups. `[1, [2, 3], 4, 5]` with `n=2` gives `[[1, 2], [3, 4], [5]]` (last chunk may be short).

### `flatMap(arr, fn) -> any[]` — map + one level

Map each element through `fn(value, index)`, then flatten the result by one level. If `fn` returns a scalar, it's pushed as-is; if it returns an array, its elements are spliced in. This is the workhorse "for each input, produce zero or more outputs" pattern.

### `flatMapDeep(arr, fn) -> any[]` — map + all levels

Like `flatMap`, but the result of `fn` is recursively flattened — if `fn` returns `[v, [v * 10, [v * 100]]]`, you get a fully flat output. Useful when `fn` builds nested lists you want unrolled.

### `nestedFlat(arr, n?) -> any[]` — alias of `flatten`

`nestedFlat` is `flatten` — kept under a different name because in some contexts "nested flat" reads more naturally than "flatten by depth". Default `n` is 1.

### `flattenKeys(obj) -> record` — dot-path keys

Flatten a nested record into a single-level record whose keys are dotted paths. `{ a: { b: 1 } }` becomes `{ "a.b": 1 }`. Arrays get bracketed indices: `{ a: [10, 20] }` becomes `{ "a[0]": 10, "a[1]": 20 }`. Useful for serialising config or form data into a flat key→value map (e.g. for a query string or environment-variable dump).

### `flattenPath(obj, sep?) -> record` — separator-path keys

Like `flattenKeys` but uses a custom separator (default `"/"`) instead of dots. `{ a: { b: 1 } }` with default sep gives `{ "a/b": 1 }`. Useful for file-system-style paths or any domain where `.` collides with the keys themselves.

### `concatAll(...arrs) -> any[]` — variadic concat

Concatenate any mix of arrays and scalars into a single flat array. Scalars are wrapped as a 1-element array; arrays are spliced in. `concatAll(1, [2, 3], 4, [5])` gives `[1, 2, 3, 4, 5]`. This is the variadic version of `flat` — useful when you have a fixed set of inputs at the call site.

## Naming note

`flat` and `flatMap` here intentionally shadow the older bare-name versions registered from the `collections` module. The `flat`-module versions are strict supersets (same one-level semantics, richer error messages, identical return shape), so any existing user code that relied on the older `collections.flat` / `collections.flatMap` keeps working unchanged. The unit tests for `collections` use the namespace import (`import * as Coll`), so they continue to verify the original implementation directly.

## Performance notes

- `flat` and `flatMap` are O(n + m) where n is the input length and m is the total length of sub-arrays.
- `flatDeep` and `flatMapDeep` visit every leaf, so they're O(L) where L is the total number of leaves in the nested tree.
- `flattenKeys` and `flattenPath` walk every leaf in the record and build a new key for each — O(L) leaves, O(L * d) string-building where d is the average depth.
- `concatAll` is O(n) total elements.

The whole module is 10 functions, ~200 lines of TypeScript, no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
