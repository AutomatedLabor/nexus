# lru_cache.ae

A Least Recently Used (LRU) cache with a fixed capacity.
Inserts and accesses mark items as most-recently-used; when
the cache is full and a new item is inserted, the least
recently used item is evicted.

## What it does

1. **`lru_new(cap)`** — returns `(cap, [], [])`, a 3-tuple
   holding the capacity and two parallel arrays (`keys` and
   `vals`) in LRU order (LRU at index 0, MRU at the end).
2. **`lru_get(cache, key)`** — returns `(value, new_cache)`.
   On a hit, the entry is moved to the end (most-recently-used)
   and the new cache state is returned. On a miss, returns
   `(-9999, cache_unchanged)`.
3. **`lru_put(cache, key, v)`** — inserts `(key, v)`. If the
   key already exists, updates the value and moves the entry
   to the end. If new and at capacity, evicts index 0 (LRU).
   Returns the new cache state.
4. **`show_cache(cache)`** — renders as `[1=100 | 2=200 | 3=300]
   (cap=3, size=3)`.
5. **Driver** — fills a capacity-3 cache, hits key 1 (marking
   it MRU), inserts key 4 (evicting key 2), attempts a miss
   on key 2, inserts key 5 (evicting key 3), updates key 1.
   Each step is printed before/after.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/lru_cache.ae
```

## Key language features

- **Tuples as the cache type** — `(int, [int], [int])` carries
  capacity, keys, and vals in one immutable bundle. Every
  mutating operation returns a new tuple, so the caller can
  thread the cache forward like state in a state monad.
- **Tuple destructuring** — `let cap = cache.0; let keys = cache.1; let vals = cache.2;`.
- **`move_to_end(keys, vals, i)` helper** — returns a fresh
  pair of arrays with the element at index `i` moved to the end.
- **Sentinel for "miss"** — `-9999` (v1 has no `Option<int>`).
- **Array slicing by reconstruction** — to drop index 0 we
  walk from `j = 1` and push into a fresh array.

## Expected output

```
== LRU cache ==

new cache: [] (cap=3, size=0)
Insert 1=100, 2=200, 3=300 (fills the cache to capacity):
  cache: [1=100 | 2=200 | 3=300] (cap=3, size=3)
Get key 1 (hits, marks it most-recently-used):
  get(1) = 100
  cache: [2=200 | 3=300 | 1=100] (cap=3, size=3)
...
All assertions passed.
```

## Design notes

The implementation is **O(n)** for `get` and `put` because it
uses linear search to find keys. A production LRU would use a
doubly-linked list + hash map for O(1) operations, but Aether
v1 has no hash-map type. For typical LRU sizes (single digits
to a few hundred), the linear scan is acceptable, and the
value-semantics tuple approach makes the state thread explicit
and easy to reason about.
