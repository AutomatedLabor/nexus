# Aether stdlib — `set`

The `set` module wraps JavaScript's native `Set` with the operations you'd expect from a math-class set library: union, intersection, difference, symmetric difference, subset/superset, and the higher-order trinity (map/filter/fold). Every function is a pure TypeScript implementation that operates on plain `Set` objects the Aether evaluator hands through; throwing a plain `Error` from a builtin becomes an Aether panic.

## Why a `set` module at all?

JavaScript ships a `Set` builtin, but it only exposes `add`, `delete`, `has`, `forEach`, and the iteration protocol. Anything set-theoretic — union, intersection, subset testing — you write yourself, and the obvious five-line implementations are easy to get subtly wrong (forgetting `NaN === NaN`, mixing up subset direction, allocating copies when you don't need to). This module packages those primitives so Aether programs can write `setEqual(allowed, requested)` instead of a six-line dance every time.

## Conventions

- **Equality** is JS `Set` equality (the SameValueZero algorithm). `NaN` is equal to itself; `0` and `-0` are equal; objects and arrays are compared by identity (not by contents). For value-equality on arrays/objects, you'd serialize first (e.g. with `encoding.jsonEncode`) and store the strings in the set.
- **Insertion order** is preserved by `setToArray`, `setFold`, and `setToString` — JS sets iterate in insertion order, so the module just inherits that.
- **All set-algebra functions return NEW sets**; they never mutate their inputs. `setAdd` is the lone exception — it mutates and returns `s` so callers can chain (`setAdd(setAdd(setNew(), 1), 2)`).
- **Higher-order functions** take callbacks in the natural order: `setMap(s, fn)`, `setFilter(s, fn)`, `setFold(s, fn, init)`. There is no `setReduce` alias — `setFold` is the canonical name and matches the rest of stdlib.

## Construction and basic ops

`setNew(arr?)` returns a fresh empty set, or one seeded with the values of `arr` if provided. `setAdd`, `setRemove`, `setHas`, `setSize`, and `setToArray` are the obvious operations — all panic with a clear message if their first argument isn't a `Set`. `setRemove` returns a boolean indicating whether the value was present (matching `Set.prototype.delete`).

```aether
let s = set.setNew([1, 2, 2, 3])   // {1, 2, 3}
set.setAdd(s, 4)                   // {1, 2, 3, 4} (returns s)
set.setRemove(s, 2)                // true; s is now {1, 3, 4}
set.setHas(s, 3)                   // true
set.setSize(s)                     // 3
set.setToArray(s)                  // [1, 3, 4]
```

## Set algebra

`setUnion`, `setIntersect`, `setDifference`, `setSymDiff` produce fresh sets containing, respectively, elements in either set, both sets, `a` minus `b`, and exactly one of the two. `setIntersect` and `setDisjoint` iterate over the smaller set for performance — important when intersecting a small query set with a large corpus.

```aether
let a = set.setNew([1, 2, 3])
let b = set.setNew([2, 3, 4])
set.setUnion(a, b)        // {1, 2, 3, 4}
set.setIntersect(a, b)    // {2, 3}
set.setDifference(a, b)   // {1}
set.setSymDiff(a, b)      // {1, 4}
```

`setSubset(a, b)` is `a ⊆ b`; `setSuperset(a, b)` is `a ⊇ b` (implemented as `setSubset(b, a)`). The size-check first (`if (a.size > b.size) return false`) short-circuits the obvious negative case. `setDisjoint(a, b)` is true when the two sets share no elements. `setEqual(a, b)` is order-independent equality — a size check followed by an existence check.

```aether
set.setSubset(set.setNew([1, 2]), set.setNew([1, 2, 3]))    // true
set.setSuperset(set.setNew([1, 2, 3]), set.setNew([1, 2]))  // true
set.setDisjoint(set.setNew([1, 2]), set.setNew([3, 4]))    // true
set.setEqual(set.setNew([1, 2, 3]), set.setNew([3, 2, 1]))  // true
```

## Higher-order ops

`setMap(s, fn)` returns a new set of `fn(x)` for each `x`. Collisions collapse: `setMap(setNew([1, -1]), abs)` has one element, not two. `setFilter(s, fn)` keeps only the satisfying elements. `setFold(s, fn, init)` is a left fold over the set's iteration order — use it for sums, products, maxima, or to build aggregates out of the set. `setAny` / `setAll` are the predicate quantifiers — `setAny` is true if at least one element satisfies `fn`, `setAll` is true if every element does (vacuously true for the empty set, matching mathematical convention).

```aether
set.setMap(set.setNew([1, 2, 3]), x -> x * 2)            // {2, 4, 6}
set.setFilter(set.setNew([1, 2, 3, 4]), x -> x % 2 == 0) // {2, 4}
set.setFold(set.setNew([1, 2, 3, 4]), (a, x) -> a + x, 0) // 10
set.setAny(set.setNew([1, 2, 3]), x -> x == 2)            // true
set.setAll(set.setNew([2, 4, 6]), x -> x % 2 == 0)       // true
```

## Display

`setToString(s)` renders the set as `{a, b, c}` in insertion order. Non-string values go through `toDisplay` (numbers, booleans, null/undefined, JSON-stringified objects). This is what the REPL uses to display a set, and what `print` uses when it encounters one.

```aether
set.setToString(set.setNew(["a", "b"]))   // "{a, b}"
set.setToString(set.setNew([1, 2, 3]))     // "{1, 2, 3}"
set.setToString(set.setNew())              // "{}"
```

## When to use `set` vs `collections`

Aether also has a `collections` module that includes some set-like helpers (duplicates, unique). The split is: `collections` is for *array* operations (the input and output are arrays), `set` is for *set*-typed values — you want to keep the `Set` object around as a lookup index, not just deduplicate a one-shot array. If you find yourself calling `setToArray(setNew(arr))` a lot, you probably want `collections.unique` instead.

## Common patterns

- **Deduplicate while preserving insertion order**: `setToArray(setNew(arr))`.
- **Inclusion check on a fixed corpus**: build the set once with `setNew(corpus)`, then `setHas(s, x)` repeatedly — O(1) per lookup vs. O(n) for `arr.includes`.
- **Set-difference of allowed vs. requested permissions**: `setDifference(allowed, requested)` returns the unauthorized subset; if its size is zero, the request is fully granted.
- **Validate a uniqueness constraint**: `setSize(s) === arr.length` where `s = setNew(arr)`.

The whole module is 20 functions, ~250 lines of TypeScript, no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
