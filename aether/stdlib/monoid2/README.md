# aether/stdlib/monoid2

Companion module to `aether/stdlib/monoid`. The original `monoid` module
ships the ten "obvious" monoids — Sum, Product, String, Array, And, Or,
Max, Min, First, Last — that cover the bulk of "summarize an array"
needs. This module ships ten additional monoids that come up in real
Aether programs but that are less obviously monoidal:

| Factory | Carrier | `empty` | `combine(a, b)` |
| --- | --- | --- | --- |
| `monoidEndo` | `(x: T) => T` | identity | composition `f(g(x))` |
| `monoidDual(m)` | `T` (of `m`) | `m.empty` | `m.combine(b, a)` |
| `monoidCount` | number | `0` | `a + 1` (ignores `b`) |
| `monoidSumAndCount` | `[number, number]` | `[0, 0]` | add sums, add counts |
| `monoidSetUnion` | `T[]` (as set) | `[]` | de-duped concat |
| `monoidIntersect` | `T[]` (as set) | `[]` | intersection in `a`'s order |
| `monoidDict` | `Record<string, T>` | `{}` | `{ ...a, ...b }` (right wins) |
| `monoidMaybe(m)` | `T | null` | `null` | null-skip; non-null uses `m.combine` |
| `monoidFirstNonEmpty` | `string | any[]` | `""` | first non-empty |
| `monoidLastNonEmpty` | `string | any[]` | `""` | last non-empty |

Every factory returns the same `{ empty, combine, combineAll }` shape
as `monoid`'s factories, so the two modules are interchangeable: any
helper that accepts a `Monoid<T>` from `monoid` accepts one from
`monoid2`, and vice versa.

## Why these ten?

The first module covers numeric / string / boolean / array
aggregation. These ten cover the gaps:

- **`monoidEndo`** — building a transformation pipeline by folding a
  list of single-step transformers. The combined function runs each
  transformer right-to-left, so `combineAll([f, g, h])(x) === f(g(h(x)))`.
  Useful for parsing combinators, middleware chains, and
  point-free data pipelines.
- **`monoidDual`** — when you want to fold an array in the other
  direction using the same combine operation. For commutative monoids
  (Sum, Max, Or, SetUnion) the dual is identical to the original; for
  non-commutative monoids (String, Endo) it makes a real difference.
- **`monoidCount`** — folds an array to its length. Sounds trivial but
  it's the canonical "tally" monoid and is often paired with
  `monoidSum` to compute averages.
- **`monoidSumAndCount`** — folds an array of numbers to a `(sum,
  count)` pair from which you compute the mean as `sum / count`. The
  pair is also a monoid (you can merge two already-aggregated pairs),
  which makes it suitable for divide-and-conquer parallel folds where
  each shard produces a partial `(sum, count)` and the results are
  combined at the end.
- **`monoidSetUnion`** — accumulate a de-duplicated set of values
  from many sources. Elements are compared by `===`; the order of
  first appearance is preserved.
- **`monoidIntersect`** — find the common subset across many sets.
  Useful for "tags shared by all items in a list" or "permissions
  common to all users in a group".
- **`monoidDict`** — accumulate configuration from many sources
  where later values win. A common pattern: fold a list of
  `override` records so the last definition of each key is the one
  that takes effect.
- **`monoidMaybe(m)`** — lift any monoid to `Maybe<T>` so that `null`
  values are skipped during the fold. Useful when the input array
  contains nulls that should be ignored (e.g. optional fields from a
  record list, with `monoidMaybe(monoidSum)`).
- **`monoidFirstNonEmpty` / `monoidLastNonEmpty`** — find the first
  or last non-empty string/array in a list, where "empty" is `""` or
  `[]` rather than `null`. Useful for default-value chains where the
  default is the empty string (e.g. `monoidFirstNonEmpty().combineAll([
  process_env_value, config_file_value, default_value])`.

## Aether usage

```aether
import {
  monoidEndo, monoidDual, monoidCount, monoidSumAndCount,
  monoidSetUnion, monoidIntersect, monoidDict, monoidMaybe,
  monoidFirstNonEmpty, monoidLastNonEmpty,
} from "aether/stdlib/monoid2";
import { monoidSum, monoidString } from "aether/stdlib/monoid";

// Build a transformation pipeline by folding single-step functions.
let pipeline = monoidEndo().combineAll([
  fn(x) { x + 1 },
  fn(x) { x * 2 },
  fn(x) { x - 3 },
]);
// ((5 - 3) * 2) + 1 = 5
print(pipeline(5));

// Count items in an array via a monoid.
let count = monoidCount().combineAll([10, 20, 30, 40]);  // 4

// Compute the mean via (sum, count).
let pair = monoidSumAndCount().combineAll([1, 2, 3, 4, 5]);  // [15, 5]
let mean = pair[0] / pair[1];  // 3.0

// Accumulate a set of unique tags from many sources.
let tags = monoidSetUnion().combineAll([
  ["a", "b"],
  ["b", "c"],
  ["c", "d"],
]);  // ["a", "b", "c", "d"]

// Find the tags shared by all items.
let common = monoidIntersect().combineAll([
  ["a", "b", "c"],
  ["b", "c", "d"],
  ["c", "d", "e"],
]);  // ["c"]

// Merge config records (right wins).
let config = monoidDict().combineAll([
  { host: "localhost" },
  { port: 8080 },
  { port: 9090, debug: true },
]);  // { host: "localhost", port: 9090, debug: true }

// Lift a sum monoid to handle nulls.
let total = monoidMaybe(monoidSum()).combineAll([1, null, 2, null, 3]);  // 6

// Find the first non-empty string.
let name = monoidFirstNonEmpty().combineAll([
  "",
  "",
  "Alice",
  "Bob",
]);  // "Alice"
```

## Monoid laws

Each of the ten factories returns a monoid that satisfies the three
monoid laws for its carrier type:

1. **Left identity:** `combine(empty, x) == x`.
2. **Right identity:** `combine(x, empty) == x`.
3. **Associativity:** `combine(combine(a, b), c) == combine(a, combine(b, c))`.

`monoidIntersect` deserves a careful note: its empty element is `[]`
(the empty array). The intersection of `[]` with any other set is `[]`
(not the other set), so `combine(empty, x)` returns `[]` — which
violates the identity law for arbitrary inputs! However, this is the
only sensible choice for an intersection monoid because there is no
universal "top" set. To work around this for the common "find the
common subset across many sets" use case, `monoidIntersect`'s
`combineAll` is overridden to **seed with the first element** of
the input array (rather than `empty`), so
`combineAll([s1, s2, s3])` produces `intersect(intersect(s1, s2), s3)`
— the "intersection of all" — rather than the always-empty
`intersect(intersect(intersect([], s1), s2), s3) = []`. For an empty
input array, `combineAll([])` returns `empty` (=`[]`).

Use `monoidIntersect` only when you intend to fold over one-or-more
non-empty sets; the pairwise `combine` is still useful as a
"semigroup intersect" if you manage your own seed.

The other nine factories produce lawful monoids; the test suite at
`index.test.ts` includes explicit identity-law checks for
`monoidCount`, `monoidSetUnion`, `monoidDict`, and `monoidMaybe`,
and associativity is exercised through `combineAll` on all ten.

## Limitations

- All monoids are untyped at the FFI boundary: `combine` doesn't
  check that its arguments match the carrier type. Mixing a string
  into `monoidSumAndCount` will produce a runtime error from the
  combine, but a number into `monoidString` will produce JS's usual
  coercion.
- `monoidSetUnion` and `monoidIntersect` use `Set` internally with
  `===` equality; objects are compared by reference, not by content.
- `monoidDict` does a shallow merge only — nested objects are
  replaced, not deep-merged. For deep merge, compose with `monoidDict`
  recursively per key (a one-liner with `monoidMaybe`).
- `monoidDual` and `monoidMaybe` accept any monoid; they validate
  the input has the right shape (`empty` + `combine`) but do not
  verify the monoid laws.
- `monoidEndo`'s combine is composition; combined functions are
  not curried or memoized. For long pipelines, consider interleaving
  with `monoidMaybe` to short-circuit on `null`.

## Test coverage

The test suite in `index.test.ts` contains 45 cases covering:

- the `empty`, `combine`, and `combineAll` surfaces of all ten monoids;
- happy paths and edge cases (empty arrays, single-element arrays,
  all-null arrays for `monoidMaybe`, all-empty strings for
  `monoidFirstNonEmpty`);
- the dual-of-non-commutative-monoid case for `monoidDual`;
- the de-duplication behaviour for `monoidSetUnion` and
  `monoidIntersect`;
- the shallow-merge right-wins behaviour for `monoidDict`;
- explicit monoid-law checks for representative monoids (identity,
  left/right identity, associativity via `combineAll`).
