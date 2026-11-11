# Aether stdlib — `collections`

The `collections` module bundles three data structures into one ergonomic API surface:

- **Vector** — the everyday array.  Aether uses JS arrays under the hood (`int[]`, `string[]`, etc.).  All mutating-named Vector helpers (`push`, `pop`, `shift`, `unshift`, `insert`, `remove`, `reverse`, `sort`) return a *new* array and leave the input untouched.  This matches Aether's value semantics: an Aether variable bound to an array does not see side-effects from operations applied to its array, which makes refactoring safe.
- **Map** — a JS `Map` keyed by any value (numbers, strings, booleans, even object references).  Use `mapNew()` to create, `mapSet` to add, `mapGet` to read (panics on missing keys), `mapHas` for membership, and `mapKeys`/`mapValues`/`mapEntries` to iterate.
- **Set** — a JS `Set`, the unique-collection workhorse.  `setNew`, `setAdd`, `setHas`, `setDelete`, `setSize`, `setToArray`.

The Map and Set helpers *do* mutate their first argument (since `Map`/`Set` are reference types in JS) and return the same collection for chaining — i.e. `setAdd(setAdd(setNew(), 1), 2)` produces a 2-element set.  The Vector helpers never mutate.

The module also provides higher-order combinators (`map`, `filter`, `reduce`, `find`, `findIndex`, `every`, `some`, `flatMap`, `zip`, `chunk`, `unique`) and structural utilities (`includes`, `indexOf`, `flat`, `concat`, `slice`, `reverse`, `sort`, `len`).  `includes` and `indexOf` use deep equality (so nested arrays compare correctly); `unique` likewise deduplicates by deep equality.

## Vector functions

### `push(arr, v) -> arr`
Non-mutating append.  Returns a new array with `v` at the end.

```aether
collections.push([1, 2], 3)   // [1, 2, 3]
```

### `pop(arr) -> arr`
Non-mutating drop of the last element.  Panics on an empty array.

```aether
collections.pop([1, 2, 3])   // [1, 2]
collections.pop([])         // panic
```

### `shift(arr) -> arr`
Non-mutating drop of the first element.  Panics on an empty array.

```aether
collections.shift([1, 2, 3])  // [2, 3]
```

### `unshift(arr, v) -> arr`
Non-mutating prepend.

```aether
collections.unshift([2, 3], 1)  // [1, 2, 3]
```

### `insert(arr, i, v) -> arr`
Insert `v` at index `i`, shifting the rest right.  Panics when `i` is out of `0..len(arr)`.

```aether
collections.insert([1, 3], 1, 2)  // [1, 2, 3]
```

### `remove(arr, i) -> arr`
Remove the element at index `i`.  Panics when `i` is out of `0..len(arr) - 1`.

```aether
collections.remove([1, 2, 3], 1)  // [1, 3]
```

### `slice(arr, i, j?) -> arr`
Subarray from `i` (inclusive) to `j` (exclusive).  Negative indices count from the end.  If `j` is omitted the subarray runs to the end.

```aether
collections.slice([1, 2, 3, 4], 1)     // [2, 3, 4]
collections.slice([1, 2, 3, 4], 1, 3)  // [2, 3]
```

### `concat(a, b) -> arr`
Concatenate two arrays into a new one.

```aether
collections.concat([1, 2], [3, 4])  // [1, 2, 3, 4]
```

### `reverse(arr) -> arr`
Non-mutating reverse.

```aether
collections.reverse([1, 2, 3])  // [3, 2, 1]
```

### `sort(arr, cmp?) -> arr`
Non-mutating sort.  When `cmp` is omitted the default comparator orders numbers ascending, then strings ascending, then booleans (`false` before `true`), falling back to `String(x)` for other types.  Pass a comparator for custom ordering: a function returning a negative number means `a < b`, zero means equal, positive means `a > b`.

```aether
collections.sort([3, 1, 2])                          // [1, 2, 3]
collections.sort([3, 1, 2], (a, b) => b - a)         // [3, 2, 1] (descending)
collections.sort(["b", "a", "c"])                     // ["a", "b", "c"]
```

### `map(arr, fn) -> arr`
Apply `fn` to each element; collect results.

```aether
collections.map([1, 2, 3], (v) => v * 2)        // [2, 4, 6]
collections.map([10, 20], (v, i) => v + i)      // [10, 21]
```

### `filter(arr, fn) -> arr`
Keep elements where `fn` returns truthy.

```aether
collections.filter([1, 2, 3, 4], (v) => v % 2 == 0)  // [2, 4]
```

### `reduce(arr, fn, init) -> any`
Left fold: `fn(fn(fn(init, arr[0]), arr[1]), arr[2]) …`.  Empty array returns `init` unchanged.

```aether
collections.reduce([1, 2, 3, 4], (a, v) => a + v, 0)  // 10
collections.reduce([], (a, v) => a + v, 5)            // 5
```

### `find(arr, fn) -> any`
First element for which `fn` returns truthy, or `null` if none match.

```aether
collections.find([1, 2, 3], (v) => v > 1)   // 2
collections.find([1, 2, 3], (v) => v > 5)   // null
```

### `findIndex(arr, fn) -> int`
Index of the first element for which `fn` returns truthy, or `-1`.

```aether
collections.findIndex([1, 2, 3], (v) => v === 2)  // 1
collections.findIndex([1, 2, 3], (v) => v === 9)  // -1
```

### `every(arr, fn) -> bool`
True when `fn` returns truthy for every element.  Vacuously true for an empty array.

```aether
collections.every([2, 4, 6], (v) => v % 2 == 0)  // true
collections.every([], (v) => false)              // true
```

### `some(arr, fn) -> bool`
True when `fn` returns truthy for at least one element.  Vacuously false for an empty array.

```aether
collections.some([1, 3, 5], (v) => v == 3)  // true
collections.some([], (v) => true)           // false
```

### `includes(arr, v) -> bool`
Membership test using deep equality (so nested arrays/objects compare by value).

```aether
collections.includes([1, 2, 3], 2)            // true
collections.includes([[1], [2]], [1])         // true
```

### `indexOf(arr, v) -> int`
Index of the first element equal (deep equality) to `v`, or `-1`.

```aether
collections.indexOf([1, 2, 3], 2)  // 1
collections.indexOf([1, 2, 3], 9)  // -1
```

### `flat(arr) -> arr`
Flatten one level of nesting.  Use `flatMap` if you also want a transform.

```aether
collections.flat([[1, 2], [3]])        // [1, 2, 3]
collections.flat([1, [2, [3]]])         // [1, 2, [3]] (one level only)
```

### `flatMap(arr, fn) -> arr`
`map` then `flat` (one level).  If `fn` returns a non-array it is inserted as-is.

```aether
collections.flatMap([1, 2, 3], (v) => [v, v * 10])  // [1, 10, 2, 20, 3, 30]
collections.flatMap([1, 2], (v) => v)               // [1, 2]
```

### `zip(a, b) -> arr`
Pairwise zip.  The result has the length of the shorter input.

```aether
collections.zip([1, 2, 3], ["a", "b"])  // [[1, "a"], [2, "b"]]
```

### `chunk(arr, n) -> arr`
Split into sub-arrays of size `n`.  Panics for `n <= 0`.  The last chunk may be smaller.

```aether
collections.chunk([1, 2, 3, 4, 5], 2)  // [[1, 2], [3, 4], [5]]
```

### `unique(arr) -> arr`
Drop duplicates, preserving first-occurrence order.  Uses deep equality.

```aether
collections.unique([1, 1, 2, 3, 3])        // [1, 2, 3]
collections.unique(["a", "a", "b"])        // ["a", "b"]
```

### `len(arr | map | set) -> int`
Element count.  Accepts a Vector, Map, or Set.

```aether
collections.len([1, 2, 3])           // 3
collections.len(myMap)               // entry count
collections.len(mySet)               // element count
```

## Map functions

### `mapNew() -> map`
Create an empty map.  Any value can be a key (numbers, strings, booleans, object references).

```aether
let m = collections.mapNew()
```

### `mapSet(m, k, v) -> map`
Set `k -> v`.  Mutates and returns `m` for chaining.

```aether
collections.mapSet(m, "a", 1)
```

### `mapGet(m, k) -> any`
Return the value at `k`.  Panics if the key is absent — use `mapHas` first when the key may be missing.

```aether
collections.mapGet(m, "a")  // 1
collections.mapGet(m, "z")  // panic
```

### `mapHas(m, k) -> bool`
True when the key exists.

```aether
collections.mapHas(m, "a")  // true
```

### `mapDelete(m, k) -> bool`
Remove the entry for `k`; returns `true` if it existed, `false` otherwise.  Mutates.

```aether
collections.mapDelete(m, "a")  // true
```

### `mapKeys(m) -> arr`
All keys as an array (insertion order).

### `mapValues(m) -> arr`
All values as an array (insertion order).

### `mapEntries(m) -> arr`
All entries as an array of structs `{ key, value }`.  Each entry is an Aether struct (record) with fields `key` and `value`.

```aether
for (e in collections.mapEntries(m)) {
  io.println(e.key, "=>", e.value)
}
```

### `mapSize(m) -> int`
Number of entries.

## Set functions

### `setNew() -> set`
Create an empty set.

### `setAdd(s, v) -> set`
Add `v`.  Mutates and returns `s`.  Duplicates are silently dropped.

```aether
collections.setAdd(s, 1)
collections.setAdd(s, 1)   // size still 1
```

### `setHas(s, v) -> bool`
True when `v` is present.

### `setDelete(s, v) -> bool`
Remove `v`.  Returns `true` if it existed.

### `setSize(s) -> int`
Element count.

### `setToArray(s) -> arr`
Materialise the set as an array (insertion order).

## Concurrency and equality notes

Equality inside `includes`, `indexOf`, and `unique` is structural (deep) for arrays and plain objects, identity for everything else.  This is intentional: it makes the helpers predictable for the value-shaped data Aether programs typically carry (structs, tuples, primitives).  References to the same `Map`/`Set` instance remain valid across calls — the helpers preserve identity.

When you need O(1) membership tests on a large vector, convert to a `Set` first via `reduce(arr, (s, v) => collections.setAdd(s, v), collections.setNew())` and use `setHas` thereafter.  `includes` on a Vector is O(n) and uses deep equality, which is fine for small arrays but expensive for large ones.

## When to use which

- **Vector** for ordered, indexed, possibly-duplicate data.
- **Map** for keyed lookup, especially with non-string keys.
- **Set** for membership tests and deduplication.

All three interoperate cleanly: `mapKeys`, `mapValues`, and `setToArray` produce Vectors, and `unique` plus `setToArray` together round-trip.
