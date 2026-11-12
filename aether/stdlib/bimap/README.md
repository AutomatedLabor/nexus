# Aether stdlib — `bimap`

A **bidirectional map**: a key↔value mapping where lookups in
both directions are O(1). Each `(key, value)` pair is stored in
*two* `Map`s — `keyToValue` and `valueToKey` — so a query like
"give me the key for value V" is just as fast as "give me the
value for key K".

The bimap enforces a **one-to-one invariant**: no two keys can
share a value, and no two values can share a key. `bimapSet`
preserves this invariant by evicting any prior pair that would
violate it — if you `bimapSet(m, k, v)` when `k` already has a
different value, the old pair is removed first; when `v` is
already mapped by a different key, that other key's pair is
removed first.

## Why a bimap?

Any time you have a 1-1 correspondence and need lookups in both
directions, a bimap is the right structure. Examples:

- **User registry**: `userId → email` and `email → userId`. Look
  up a user by either field without scanning the whole list.
- **Token tables in a parser**: `tokenType → symbol` and back.
  When lexing, you look up by symbol; when emitting diagnostics,
  you look up by type.
- **Country codes**: `("US" → "United States")` and back. With
  ISO codes that are unique on both sides, a bimap is a one-stop
  lookup.
- **DNS forward and reverse**: hostname → IP and IP → hostname.
- **Caching external IDs**: your local model has primary key
  `id`, the external API uses `slug`; map both ways for O(1)
  resolution.
- **Aliases**: a short name ↔ canonical name table where each
  side is unique.

A naïve approach — keep two `Map`s yourself — works but is
fragile: a single bug in the bookkeeping breaks the invariant
silently. The bimap module wraps that bookkeeping in one place.

## Construction

```typescript
import * as BM from "aether/stdlib/bimap";

const m = BM.bimapNew();
BM.bimapSet(m, "alice", 1001);
BM.bimapSet(m, "bob", 1002);
BM.bimapSet(m, "carol", 1003);
```

`bimapNew` returns a fresh, empty bimap. `bimapSet(m, key, value)`
inserts or updates the pair `(key, value)`, enforcing the
one-to-one invariant. The function is chainable (returns the
bimap).

## Lookup

```typescript
BM.bimapGet(m, "alice");          // -> 1001
BM.bimapGetReverse(m, 1002);      // -> "bob"
BM.bimapGet(m, "nonexistent");    // -> undefined
BM.bimapGetReverse(m, 9999);      // -> undefined

BM.bimapHas(m, "alice");          // -> true
BM.bimapHasReverse(m, 1001);      // -> true
BM.bimapHas(m, "unknown");        // -> false
```

`bimapGet` returns the value for a key (or `undefined`).
`bimapGetReverse` returns the key for a value (or `undefined`).
`bimapHas` and `bimapHasReverse` are the boolean variants.

## The one-to-one invariant

When you call `bimapSet(m, k, v)`, three cases are possible:

1. **Neither `k` nor `v` is currently in the bimap.**
   The pair `(k, v)` is added; size increases by 1.

2. **`k` is already in the bimap, mapping to some `oldV`.**
   The old pair `(k, oldV)` is removed (freeing `oldV` for
   re-use), then `(k, v)` is inserted. If `v` was a brand-new
   value, size stays the same. If `v` was previously mapped by
   some other key `otherK`, that other pair is *also* removed
   (see case 3) — the net effect is `(otherK, v)` evicted, then
   `(k, v)` added; size decreases by 1 then increases by 1.

3. **`v` is already in the bimap, mapped by some `otherK`** (and
   `k` is not yet present).
   The other pair `(otherK, v)` is removed (freeing `otherK`),
   then `(k, v)` is inserted. Size stays the same.

4. **Both `k` and `v` are in the bimap, but in *different* pairs
   `(k, oldV)` and `(otherK, v)`.**
   Both old pairs are removed, then `(k, v)` is inserted. Size
   decreases by 1.

The end state is always: exactly one pair contains `k`, exactly
one pair contains `v`, and they're the same pair.

## Deletion

```typescript
BM.bimapDelete(m, "alice");          // -> true (pair removed)
BM.bimapDelete(m, "alice");          // -> false (already gone)

BM.bimapDeleteReverse(m, 1002);      // -> true (pair removed by value)
BM.bimapDeleteReverse(m, 9999);      // -> false
```

`bimapDelete` and `bimapDeleteReverse` are symmetric: you can
remove a pair by either its key or its value.

## Inspection

```typescript
BM.bimapSize(m);        // -> number of pairs currently in the bimap
BM.bimapKeys(m);        // -> array of all keys (insertion order)
BM.bimapValues(m);      // -> array of all values (key insertion order)
```

The `bimapKeys` and `bimapValues` arrays are in the same order
(the key's insertion order, per the JS `Map` spec), so zipping
them gives you the list of pairs:

```typescript
const ks = BM.bimapKeys(m);
const vs = BM.bimapValues(m);
const pairs = ks.map((k, i) => [k, vs[i]]);
```

## Performance

| Operation | Complexity |
|-----------|------------|
| `bimapNew` | O(1) |
| `bimapSet` | O(1) amortised |
| `bimapGet` | O(1) |
| `bimapGetReverse` | O(1) |
| `bimapHas` / `bimapHasReverse` | O(1) |
| `bimapDelete` / `bimapDeleteReverse` | O(1) |
| `bimapSize` | O(1) |
| `bimapKeys` | O(n) |
| `bimapValues` | O(n) |

`bimapSet` involves at most two `Map.delete` calls and two
`Map.set` calls — all O(1) amortised on a hash map.

## API

| Function | Signature | Description |
|----------|-----------|-------------|
| `bimapNew` | `() -> Bimap` | Create a fresh empty bimap. |
| `bimapSet` | `(m, key, value) -> Bimap` | Insert/update (key, value) enforcing 1-1; chainable. |
| `bimapGet` | `(m, key) -> any?` | Value for key; undefined if absent. |
| `bimapGetReverse` | `(m, value) -> any?` | Key for value; undefined if absent. |
| `bimapHas` | `(m, key) -> bool` | True if key is in the bimap. |
| `bimapHasReverse` | `(m, value) -> bool` | True if value is in the bimap. |
| `bimapDelete` | `(m, key) -> bool` | Remove pair by key; true if removed. |
| `bimapDeleteReverse` | `(m, value) -> bool` | Remove pair by value; true if removed. |
| `bimapSize` | `(m) -> int` | Number of pairs. |
| `bimapKeys` | `(m) -> any[]` | All keys (insertion order). |
| `bimapValues` | `(m) -> any[]` | All values (insertion order). |

## Validation

All functions throw a plain `Error` on invalid input (non-bimap,
missing Map fields); the Aether evaluator converts thrown errors
into Aether panics.
