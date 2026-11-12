# aether/stdlib/monoid

`monoid` provides ten ready-to-use monoid factories. A monoid is an
algebraic structure with three things:

- a carrier type `T` (the values the monoid lives on);
- an identity element `empty : T` — combining it with anything
  leaves that thing unchanged;
- an associative binary operation `combine : (T, T) -> T`.

We represent a monoid in TypeScript as a plain struct:

```ts
interface Monoid<T> {
  empty: T;
  combine: (a: T, b: T) => T;
  combineAll: (arr: T[]) => T;
}
```

The `combineAll` field is a convenience that folds a whole array in
one call, using `empty` as the seed. It's the standard `reduce`
operation specialized to the monoid's combine, exposed on the
returned struct so it's discoverable via `monoidSum().combineAll([1, 2, 3])`.

## The ten monoids

| Factory | Carrier | `empty` | `combine(a, b)` |
| --- | --- | --- | --- |
| `monoidSum` | number | `0` | `a + b` |
| `monoidProduct` | number | `1` | `a * b` |
| `monoidString` | string | `""` | `a + b` (concat) |
| `monoidArray` | array | `[]` | `a.concat(b)` |
| `monoidAnd` | boolean | `true` | `a && b` |
| `monoidOr` | boolean | `false` | `a || b` |
| `monoidMax` | number | `-Infinity` | `Math.max(a, b)` |
| `monoidMin` | number | `+Infinity` | `Math.min(a, b)` |
| `monoidFirst` | any | `null` | first non-null |
| `monoidLast` | any | `null` | last non-null |

### Why these ten?

They cover the most common "summarize an array" needs:

- `monoidSum` / `monoidProduct` for numeric aggregation (totals, products).
- `monoidString` for joining text (the canonical non-numeric combine).
- `monoidArray` for flattening arrays of arrays.
- `monoidAnd` / `monoidOr` for "all/any" predicate folds — `combineAll` of
  booleans reduces to the conjunction or disjunction.
- `monoidMax` / `monoidMin` for "best/worst" picks. The `±Infinity`
  identities are chosen so that `combineAll([])` returns the identity
  (which represents "no value seen yet"), and combining it with any
  real number returns that number.
- `monoidFirst` / `monoidLast` for "find the first/last non-null entry"
  folds — useful for default-value chains where you want the first
  defined option in a list of candidates.

### The `monoidFirst` and `monoidLast` monoids

These use `null` as the empty element and treat `undefined` the same
as `null`:

- `monoidFirst.combine(null, x)` returns `x`.
- `monoidFirst.combine(x, null)` returns `x`.
- `monoidFirst.combine(x, y)` (both non-null) returns `x` — the first
  argument wins.

`monoidLast` is symmetric: when both arguments are non-null, the
second wins.

This makes it easy to express default-value patterns:

```aether
import { monoidFirst } from "aether/stdlib/monoid";

let env_var = monoidFirst().combineAll([process_env_value, default_value]);
```

## Aether usage

```aether
import {
  monoidSum, monoidString, monoidArray, monoidMax, monoidFirst,
} from "aether/stdlib/monoid";

// Sum
let total = monoidSum().combineAll([1, 2, 3, 4, 5]);  // 15

// Concatenate strings
let joined = monoidString().combineAll(["a", "b", "c"]);  // "abc"

// Flatten an array of arrays
let flat = monoidArray().combineAll([[1, 2], [3], [4, 5]]);  // [1,2,3,4,5]

// Find the maximum of an array
let max = monoidMax().combineAll([3, 1, 4, 1, 5, 9, 2, 6]);  // 9

// Find the first non-null in a list
let first = monoidFirst().combineAll([null, null, "hello", "world"]);  // "hello"
```

## Monoid laws

A well-formed monoid obeys two laws:

1. **Left identity:** `combine(empty, x) == x`.
2. **Right identity:** `combine(x, empty) == x`.
3. **Associativity:** `combine(combine(a, b), c) == combine(a, combine(b, c))`.

All ten factory functions return monoids that satisfy these laws for
their carrier types. The test suite at `index.test.ts` includes
explicit law checks for `monoidSum`, `monoidString`, and `monoidAnd`;
the other seven are exercised through their `combineAll` operations,
which inherently require associativity to be useful.

## Limitations

- The monoids are untyped at the FFI boundary: `combine` doesn't
  check that its arguments match the carrier type. Mixing strings
  with numbers in `monoidSum`, for example, will produce JavaScript's
  usual coercion result rather than an error. Validate inputs before
  folding if you need stricter typing.
- `monoidArray` uses `Array.prototype.concat`, which flattens one
  level of nesting. Passing nested arrays-of-arrays will flatten them
  by one level, not deeply.
- `monoidMax` and `monoidMin` use `±Infinity` as the identity, so an
  empty `combineAll([])` returns `±Infinity` rather than `null` or
  `undefined`. If you need a different "no value" sentinel, post-
  process the result.
- The `combineAll` helper validates that its argument is an array but
  does not validate element types; it folds whatever the array
  contains through the monoid's `combine`.

## Test coverage

The test suite in `index.test.ts` contains 25 cases covering:

- the `empty`, `combine`, and `combineAll` surfaces of all ten monoids;
- happy paths and edge cases (empty arrays, single-element arrays);
- the `±Infinity` identity behaviour for `monoidMax` / `monoidMin`;
- the first/last-wins semantics for `monoidFirst` / `monoidLast`;
- explicit monoid-law checks (left identity, right identity,
  associativity) for representative monoids.
