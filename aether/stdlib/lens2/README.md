# aether/stdlib/lens2

Companion module to `aether/stdlib/lens`. The original `lens` module
ships the ten most common lens operations — `lensNew`, `lensGet`,
`lensSet`, `lensModify`, `lensCompose`, `lensAt`, `lensIndex`,
`lensPath`, `lensProp`, `lensOptional` — covering the everyday needs
of immutable updates. This module ships ten additional, more
specialized lens helpers that come up in real Aether programs:

| Factory | Focus | Notes |
| --- | --- | --- |
| `lensWhere(pred)` | first array element matching a predicate | set is a no-op if no match |
| `lensRecord(keys)` | a subset of a record's keys | set merges, preserves other keys |
| `lensSlice(start, end)` | a sub-array slice | set splices the replacement in |
| `lensAppend()` | "the new element to append" | set appends; get returns undefined |
| `lensPrepend()` | "the new element to prepend" | set prepends; get returns undefined |
| `lensHead()` | the first element of an array | set with undefined drops the head |
| `lensTail()` | the tail of an array | set replaces the tail, preserves head |
| `lensDefault(l, def)` | the focus of `l`, with a fallback | get returns `def` when focus is undefined |
| `lensChoice(l1, l2)` | the focus of `l1` if defined, else `l2` | "primary + fallback" pattern |
| `lensIso(iso, l)` | the focus of `l` viewed through an iso | iso = `{ to, from }` bijection |

Every factory returns a `Lens<T, V>` of the same `{ get, set }` shape
as `lens`'s factories, so the two modules are interchangeable: any
helper that accepts a `Lens` from `lens` accepts one from `lens2`,
and vice versa.

## Why these ten?

The original `lens` module covers record-field and array-index
access. These ten cover the gaps:

- **`lensWhere`** — focus the first array element matching a
  predicate. Useful for "find and update" patterns where you don't
  know the index in advance (e.g. update the first user with id=42).
  Set is a no-op if no element matches, which makes the lens safe to
  use in `lensModify` chains.
- **`lensRecord`** — focus a subset of a record's keys. Useful for
  "update many fields at once" patterns where you want to validate
  the subset against a schema and write all of them atomically.
- **`lensSlice`** — focus a sub-array slice. Useful for replacing a
  range of elements (e.g. "replace rows 3..5 of this table with
  these new rows"). The slice is immutable — the original array is
  untouched; the set returns a new array with the slice spliced in.
- **`lensAppend` / `lensPrepend`** — focus "the new element to
  append/prepend". Reads return `undefined` (the focus doesn't
  exist yet); writes append/prepend. Useful for accumulating values
  into an array via `lensSet` in a fold.
- **`lensHead` / `lensTail`** — focus the first element / tail of
  an array. `lensHead` is a thin convenience over `lensIndex(0)`,
  but with a slightly different convention: setting `lensHead` to
  `undefined` *drops* the head, which is more useful than
  `lensIndex(0)`'s "set arr[0] to undefined" behaviour in many
  contexts. `lensTail` focuses everything *after* the first
  element.
- **`lensDefault`** — wrap a lens so that `get` returns a sensible
  default when the focus is `undefined`. Useful for lenses that
  focus optional fields where you want a non-`undefined` value
  (e.g. `lensDefault(lensAt("optional_field"), "default_value")`).
- **`lensChoice`** — try `l1` first, fall back to `l2` if `l1`'s
  focus is `undefined`. Useful for "primary + fallback" patterns
  (e.g. user override then config-file value, or env var then
  default).
- **`lensIso`** — view a focus through an isomorphism. An iso is a
  pair of `to` / `from` bijections. Reads walk `l.get(obj)` then
  `iso.to`; writes convert with `iso.from` then write through
  `l.set`. Useful for "view this number as a string" / "view this
  Date as a unix timestamp" / "view this base64 as a utf-8 string"
  patterns.

## Aether usage

```aether
import {
  lensWhere, lensRecord, lensSlice, lensAppend, lensPrepend,
  lensHead, lensTail, lensDefault, lensChoice, lensIso,
} from "aether/stdlib/lens2";

// Find and update the first user with id == 42.
let users = [
  { id: 1, name: "Alice" },
  { id: 42, name: "Bob" },
  { id: 99, name: "Carol" },
];
let byId42 = lensWhere(fn(u) { u.id == 42 });
let updated = lensSet(byId42, users, { id: 42, name: "Bobby" });
// users is unchanged; updated has Bobby in place of Bob.

// Update several keys of a record at once.
let multi = lensRecord(["name", "age"]);
let person = { name: "Alice", age: 30, city: "NYC" };
let patched = lensSet(multi, person, { name: "Alicia", age: 31 });
// patched: { name: "Alicia", age: 31, city: "NYC" }

// Replace rows 2..4 of a table.
let tableRowLens = lensSlice(2, 4);
let table = [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]];
let newTable = lensSet(tableRowLens, table, [[99, 99], [88, 88]]);

// Append to an array via a lens.
let appender = lensAppend();
let xs = [1, 2, 3];
let xs4 = lensSet(appender, xs, 4);  // [1, 2, 3, 4]

// lensHead: drop the first element by setting it to undefined.
let headLens = lensHead();
let rest = lensSet(headLens, [1, 2, 3], undefined);  // [2, 3]

// lensDefault: get a default when the focus is undefined.
let opt = lensAt("optional_field");
let withDefault = lensDefault(opt, "fallback");
let val = lensGet(withDefault, { other_field: 1 });  // "fallback"

// lensChoice: primary then fallback.
let primary = lensAt("user_override");
let fallback = lensAt("config_default");
let effective = lensChoice(primary, fallback);
let v = lensGet(effective, { config_default: "from-config" });  // "from-config"

// lensIso: view a number as a string.
let numToStr = { to: fn(n) { str(n) }, from: fn(s) { int(s) } };
let baseLens = lensWhere(fn(x) { x > 2 });
let isoLens = lensIso(numToStr, baseLens);
let s = lensGet(isoLens, [1, 2, 3, 4]);  // "3"
```

## Lens laws

A well-formed lens obeys three laws:

1. **Get-Set:** `lensSet(l, obj, lensGet(l, obj)) == obj`.
2. **Set-Get:** `lensGet(l, lensSet(l, obj, v)) == v`.
3. **Set-Set:** `lensSet(l, lensSet(l, obj, v1), v2) == lensSet(l, obj, v2)`.

The factories in `lens2` are designed to satisfy these laws for
their carrier types. There are two notable caveats:

- `lensWhere` may not find a match; in that case `lensGet` returns
  `undefined` and `lensSet` is a no-op, which violates the Set-Get
  law (you don't get back what you set). This is a deliberate
  trade-off — `lensWhere` is meant to be a "best-effort find and
  update" rather than a strict lens; pair it with `lensOptional`
  from the original `lens` module if you need strict laws.
- `lensAppend` / `lensPrepend` have a `get` that always returns
  `undefined` (the focus doesn't exist yet). They satisfy the
  Set-Set law (appending then appending is the same as appending
  the second value) but the Set-Get law is satisfied only trivially.

The other seven factories satisfy all three laws strictly. The test
suite includes purity checks (`set` does not mutate the input) for
`lensWhere` and `lensRecord`, and round-trip (`get` after `set`)
checks for all ten.

## Limitations

- All lenses are untyped at the FFI boundary: `get` and `set` don't
  check that their arguments match the carrier type. Setting a
  string into `lensWhere<number>` will produce a mixed-type array
  rather than an error.
- `lensSlice` does bounds checks but only at `set` time. `get` on
  an array shorter than `end` returns a shorter slice (mirroring
  `Array.prototype.slice`); `set` throws if `end > arr.length`.
- `lensRecord` does a shallow clone on `set`; the original record's
  nested objects are not deep-copied (their references are shared
  between the original and the new record). For deep
  immutability, use `lensPath` from the original `lens` module
  with nested `lensRecord` calls.
- `lensIso` does not verify that `iso.to` and `iso.from` are
  actual inverses — it trusts the caller. A broken iso (where
  `from(to(x)) != x`) will produce broken lenses silently.

## Test coverage

The test suite in `index.test.ts` contains 40 cases covering:

- the `get` and `set` surfaces of all ten factories;
- happy paths and edge cases (empty arrays, no-match arrays,
  out-of-bounds slices, null inputs, undefined values);
- the lens laws (purity of `set` for `lensWhere` and `lensRecord`;
  Set-Get round-trip for all factories);
- the "no-op set when no match" behaviour of `lensWhere`;
- the "drop the head when set to undefined" behaviour of `lensHead`;
- the "preserve the head on tail-set" behaviour of `lensTail`;
- the "prefer l1, fall back to l2" behaviour of `lensChoice`;
- the "view through iso" round-trip for `lensIso`;
- error cases (non-function predicates, non-array keys, non-iso
  inputs, non-lens args to `lensDefault`/`lensChoice`/`lensIso`).
