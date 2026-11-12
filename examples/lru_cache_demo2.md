# lru_cache_demo2.ae

A simple LRU (Least Recently Used) cache. This demo runs 20 `put` operations on a 5-capacity cache and prints the cache state after each operation. When a new item is added beyond capacity, the least-recently-used entry is evicted; we record each eviction and print it. After the puts, three `get` probes verify the cache state and LRU-reordering.

## What it does

1. **`index_of(arr, key)`** — linear search for `key` in `arr`, returns the index or -1.
2. **`move_to_end(keys, vals, i)`** — remove the entry at index `i` from both parallel arrays and re-append it at the end (so it becomes MRU).
3. **`lru_new(cap)`** — fresh empty cache: `(cap, [], [])`.
4. **`lru_get(cache, key)`** — search for `key`; on hit, move the entry to MRU and return `(value, new_cache)`; on miss, return `(-9999, cache)`.
5. **`lru_put(cache, key, v)`** — insert or update `(key, v)`; if at capacity, evict the LRU (index 0) first. Returns `(new_cache, evicted_key_or_-1)`.
6. **`show_cache(cache)`** — render as `key=val | key=val | ... (cap=N, size=M)` with LRU on the left, MRU on the right.
7. **Driver** — runs 20 scripted puts with eviction tracking, then 3 probes (2 hits + 1 miss), and asserts the final state.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/lru_cache_demo2.ae
```

## Key language features

- **Tuple-of-arrays as a struct** — the cache is the 3-tuple `(cap, keys, vals)`, threaded through every function and rebound on every update. Aether has no record type at the stdlib level, so we use tuples.
- **`let mut` for rebinding** — `cache` and `evictions` need `let mut` so the loop can reassign them.
- **Tuple destructuring via `.0`/`.1`** — Aether supports `.0`/`.1` on tuples; we use `result.0` (the new cache) and `result.1` (the evicted key).
- **Array literal of tuples** — `let ops_put = [(1, 100), (2, 200), ...]` builds a `[tuple]` array; `op.0` and `op.1` extract the key and value.
- **`while` for iteration** — every loop is `while i < n { ...; i = i + 1 }` to avoid the for-loop-scope quirk.
- **`if cond { ... } else { ... }` as an expression** — used inline for `label = if v == -9999 { "MISS" } else { "hit" }`.

## Expected output

```
== LRU cache demo (20 ops, capacity 5) ==

new cache: [] (cap=5, size=0)

put(1, 100): no evict        ->  [1=100] (cap=5, size=1)
put(2, 200): no evict        ->  [1=100 | 2=200] (cap=5, size=2)
put(3, 300): no evict        ->  [1=100 | 2=200 | 3=300] (cap=5, size=3)
put(4, 400): no evict        ->  [1=100 | 2=200 | 3=300 | 4=400] (cap=5, size=4)
put(5, 500): no evict        ->  [1=100 | 2=200 | 3=300 | 4=400 | 5=500] (cap=5, size=5)
put(6, 600): evict 1  ->  [2=200 | 3=300 | 4=400 | 5=500 | 6=600] (cap=5, size=5)
put(7, 700): evict 2  ->  [3=300 | 4=400 | 5=500 | 6=600 | 7=700] (cap=5, size=5)
put(3, 333): no evict        ->  [4=400 | 5=500 | 6=600 | 7=700 | 3=333] (cap=5, size=5)
put(8, 800): evict 4  ->  [5=500 | 6=600 | 7=700 | 3=333 | 8=800] (cap=5, size=5)
put(9, 900): evict 5  ->  [6=600 | 7=700 | 3=333 | 8=800 | 9=900] (cap=5, size=5)
put(10, 1000): evict 6  ->  [7=700 | 3=333 | 8=800 | 9=900 | 10=1000] (cap=5, size=5)
put(11, 1100): evict 7  ->  [3=333 | 8=800 | 9=900 | 10=1000 | 11=1100] (cap=5, size=5)
put(12, 1200): evict 3  ->  [8=800 | 9=900 | 10=1000 | 11=1100 | 12=1200] (cap=5, size=5)
put(13, 1300): evict 8  ->  [9=900 | 10=1000 | 11=1100 | 12=1200 | 13=1300] (cap=5, size=5)
put(14, 1400): evict 9  ->  [10=1000 | 11=1100 | 12=1200 | 13=1300 | 14=1400] (cap=5, size=5)
put(15, 1500): evict 10  ->  [11=1100 | 12=1200 | 13=1300 | 14=1400 | 15=1500] (cap=5, size=5)
put(16, 1600): evict 11  ->  [12=1200 | 13=1300 | 14=1400 | 15=1500 | 16=1600] (cap=5, size=5)
put(17, 1700): evict 12  ->  [13=1300 | 14=1400 | 15=1500 | 16=1600 | 17=1700] (cap=5, size=5)
put(18, 1800): evict 13  ->  [14=1400 | 15=1500 | 16=1600 | 17=1700 | 18=1800] (cap=5, size=5)
put(19, 1900): evict 14  ->  [15=1500 | 16=1600 | 17=1700 | 18=1800 | 19=1900] (cap=5, size=5)

total evictions: 14
final cache: [15=1500 | 16=1600 | 17=1700 | 18=1800 | 19=1900] (cap=5, size=5)

probes:
  get(15) = 1500  (hit)  ->  [16=1600 | 17=1700 | 18=1800 | 19=1900 | 15=1500] (cap=5, size=5)
  get(19) = 1900  (hit)  ->  [16=1600 | 17=1700 | 18=1800 | 15=1500 | 19=1900] (cap=5, size=5)
  get(1) = -9999  (MISS)  ->  [16=1600 | 17=1700 | 18=1800 | 15=1500 | 19=1900] (cap=5, size=5)

All assertions passed.
```

## Design notes

- **`put(3, 333)` is an update, not an insert**: the cache already has key 3 (inserted as `(3, 300)` and not yet evicted). The update moves 3 to MRU and overwrites 300 → 333; no eviction happens.
- **14 evictions, not 15**: of the 20 puts, 5 are initial fills (no evict), 1 is an update (no evict), and the remaining 14 are inserts beyond capacity (each evicts one entry).
- **Sentinel `-9999` for miss**: Aether has no `Option<int>` at the stdlib level, so we use a sentinel. For real code you'd want a separate `lru_has(cache, key)` predicate.
- **O(n) operations**: `lru_get` and `lru_put` are both O(n) because `index_of` and `move_to_end` are linear scans. For a 5-capacity cache this is fine; for larger caches, swap in a doubly-linked-list + hash-map structure (the textbook O(1) LRU).
- **`while` only**: avoids the for-loop-scope quirk. The `if r { ... } else { ... }` inline is an expression so it doesn't trigger the after-block-return quirk.
