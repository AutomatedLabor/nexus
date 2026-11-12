# Aether stdlib — `lru-cache`

The `lru-cache` module implements a **least-recently-used (LRU)
cache**: a fixed-capacity key/value store that evicts the
least-recently-used entry when full.  Reads (`lruGet`) and writes
(`lruPut`) mark the entry as recently used; `lruPeek` reads
without marking.  This is the right tool when you have a slow
data source (database, network, computation) and want to keep
recent results in memory, with a bounded footprint.

## Why an LRU cache?

The LRU policy is the most common cache eviction strategy: keep
the most-recently-used entries, evict the least-recently-used
when the cache is full.  It exploits temporal locality (recently-
used entries are likely to be used again soon) and is simple to
implement.  For workloads with non-uniform access patterns, LRU
beats FIFO (which ignores recency) and matches LFU's hit rate
without LFU's per-entry frequency counters.

## Construction

`lruNew(capacity)` creates a fresh LRU cache with the given
capacity (must be a positive integer).  The cache starts empty.

```aether
let c = lru.lruNew(1000)  // a 1000-entry cache
```

## Operations

`lruPut(cache, key, value)` stores `key → value` in the cache,
marking it as the most recently used.  If the cache is full and
the key is new, the LRU entry is evicted; `lruPut` returns the
evicted entry as a 2-tuple `[key, value]`, or `undefined` if no
eviction occurred.  If the key already exists, the value is
updated (no eviction).

```aether
lru.lruPut(c, "user:42", userRecord)
let evicted = lru.lruPut(c, "user:43", anotherUser)
// `evicted` is the [key, value] pair that was booted, or undefined.
```

`lruGet(cache, key)` returns the value for `key`, marking it as
recently used (so it won't be evicted next).  Returns `undefined`
if the key isn't in the cache.

`lruPeek(cache, key)` returns the value WITHOUT touching the LRU
order — useful for diagnostic reads that shouldn't perturb the
cache.  `lruContains(cache, key)` is a boolean check that also
doesn't touch order.

```aether
let user = lru.lruGet(c, "user:42")  // marks as recently used
let peeked = lru.lruPeek(c, "user:42")  // doesn't mark
let exists = lru.lruContains(c, "user:42")  // bool, doesn't mark
```

## Inspection

`lruSize(cache)` returns the current entry count (0 to
capacity).  `lruKeys(cache)` returns all keys in LRU order (oldest
first, newest last).  `lruValues(cache)` returns the values in the
same order.  `lruClear(cache)` empties the cache.

```aether
lru.lruSize(c)    // current count
lru.lruKeys(c)    // [oldestKey, ..., newestKey]
lru.lruValues(c)  // [oldestValue, ..., newestValue]
lru.lruClear(c)   // empty the cache
```

## Manual eviction

`lruEvict(cache)` manually evicts the LRU entry, returning it as
`[key, value]` (or `undefined` if the cache is empty).  Useful
when you want to flush the cache one entry at a time, e.g., for
testing or for graceful shutdown (write each evicted entry back
to the backing store).

```aether
while (lru.lruSize(c) > 0) {
  let [k, v] = lru.lruEvict(c)
  backingStore.write(k, v)
}
```

## Implementation notes

The cache uses a JS `Map` (which iterates in insertion order)
plus a "reinsert on access" trick: when an entry is accessed via
`lruGet`, we delete and re-insert it so it becomes the newest.
The LRU entry is then `map.keys().next().value` — the first key
in iteration order.  This gives O(1) average-time operations with
very little code, leveraging the JS engine's optimized hash map.

For very high throughput, a doubly-linked-list + Map
implementation would have slightly better constant factors (no
delete+reinsert on every access), but the simple version is
plenty fast up to ~100k entries and is much easier to read.  The
linked-list version is a v2 candidate if profiling shows it
matters.

## When to use LRU vs unbounded caches

Use LRU when:

- Memory is bounded (the cache can't grow forever).
- The workload has temporal locality (recent accesses predict
  future accesses).
- You want a predictable, simple eviction policy.

Use an unbounded `Map` (or `collections.dict`) when:

- You know the entry count is bounded by the problem (e.g., a
  memoization cache for a function with a known input range).
- You can afford the memory.

Use a different policy (LFU, FIFO, ARC) when:

- LRU's hit rate is poor (e.g., scanning workloads where each
  entry is accessed once and never again — LFU or FIFO would be
  better, but Aether doesn't ship those in v1).

## Common patterns

- **Memoization**: `let memo = lru.lruNew(1000); fn slowFn(x) {
  let cached = lru.lruGet(memo, x); if (cached != undefined) {
  return cached; } let result = compute(x); lru.lruPut(memo, x,
  result); return result; }`.
- **Database query cache**: `lruPut(dbCache, queryKey,
  resultSet)` — reuses recent query results; evicts old ones.
- **HTTP response cache**: `lruGet(httpCache, url)` returns the
  cached response if present; on miss, fetch and `lruPut`.

## Caveats

- The cache stores **references**, not copies.  If you mutate a
  cached value, the mutation is visible to subsequent `lruGet`
  callers.  Use deep copy if you need isolation.
- The cache is **not thread-safe** (no concurrent access in v1
  anyway — Aether is single-threaded).
- The cache doesn't support deletion of a specific key in v1
  (only `lruEvict` for the LRU and `lruClear` for all).  v2 may
  add `lruDelete`.

The whole module is 10 functions, ~180 lines of TypeScript, no
dependencies.  Wired in by `registerAll` in `aether/stdlib/index.ts`.
