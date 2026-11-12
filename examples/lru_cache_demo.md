# lru_cache_demo.ae

A small LRU cache demo: put 5 items into a cache of capacity 3,
observe the eviction, then `get` each key to show which survived.
The cache is a 3-tuple `(cap, keys, vals)` where the parallel
arrays are ordered LRU (index 0) to MRU (last index).

## What it does

1. **`index_of(arr, key)`** — linear search for `key` in `arr`;
   returns its index or `-1`.
2. **`move_to_end(keys, vals, i)`** — returns a fresh pair of
   arrays with the entry at index `i` moved to the end (MRU
   position).
3. **`lru_new(cap)`** — empty cache `(cap, [], [])`.
4. **`lru_get(cache, key)`** — returns `(cache', value)`. If the
   key is absent, returns `(cache, -9999)`. If present, moves the
   entry to MRU and returns its value.
5. **`lru_put(cache, key, val)`** — if the key is present, update
   its value and bump to MRU. Otherwise, append; if over capacity,
   drop the LRU (index 0).
6. **Driver** — puts (1,100), (2,200), (3,300); then puts (4,400)
   evicting key 1; gets key 2 to bump it; then puts (5,500)
   evicting key 3. Asserts the final contents.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/lru_cache_demo.ae
```

## Key language features

- **Tuple-typed state**: the cache is `(int, [int], [int])`. `get`
  returns a nested tuple `((int, [int], [int]), int)` so we can
  return both the new cache state and the value.
- **Functional style for the state**: `move_to_end` builds new
  arrays; `lru_put` either reuses the input arrays or builds new
  ones. We avoid mutating the input where possible.
- **`while j < len(keys)`** to walk arrays — sidesteps the
  for-loop-scope quirk.
- **`if len(keys) > cap`** eviction logic uses `while j = 1` to
  skip index 0 (the LRU).

## Expected output

```
== LRU cache demo (capacity 3) ==

after put(1,100), put(2,200), put(3,300):
  keys: [1, 2, 3]  vals: [100, 200, 300]

after put(4,400) -- evicts LRU (key 1):
  keys: [2, 3, 4]  vals: [200, 300, 400]

after get(2) = 200  -- bump key 2 to MRU:
  keys: [3, 4, 2]  vals: [300, 400, 200]

after put(5,500) -- evicts LRU (key 3):
  keys: [4, 2, 5]  vals: [400, 200, 500]

All assertions passed.
```

## Design notes

- We use the simple parallel-array representation
  `(cap, keys, vals)` instead of a doubly-linked list + hash map
  (the textbook O(1) LRU). For small capacities the O(n) get/put
  is fine and the code is much shorter.
- The `get` function returns `((cap, mk, mv), val)` — a tuple
  of the new cache state and the value. The caller rebinds
  `cache = r2.0` to thread the updated state back.
- The "value-not-found" sentinel `-9999` is a hack; in a real
  cache you'd return `Option<V>` (e.g. `result<T, E>` in
  Aether) or null.
- Compare to `lru_cache.ae` (already in the repo) which uses
  the same representation but for a different demo
  sequence.
