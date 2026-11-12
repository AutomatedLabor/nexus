# Aether stdlib — `memoize`

A small memoization cache for unary/binary/variadic pure
functions. Stores results keyed by a stringified argument tuple,
with optional LRU eviction and per-cache statistics.

## When to use this?

Any time a function is:

1. **Pure** — same inputs always give the same output, no side
   effects.
2. **Expensive** — the cost of computing the result dominates the
   cost of a Map lookup.
3. **Repeatedly called** with overlapping arguments.

Typical use cases: recursive Fibonacci (turn exponential into
linear), naive knapsack, parsers that re-enter the same state
with the same input position, expensive-format stringifiers,
JSON-parsed inputs that haven't changed.

## Data model

```ts
interface MemoCache<V> {
  fn: ((...args: any[]) => V) | null;
  entries: Map<string, { value: V; args: any[]; lastTouched: number }>;
  capacity: number;  // 0 means unlimited
  keyOf: (args: any[]) => string;
  stats: { hits: number; misses: number; evictions: number };
  clock: number;
}
```

The default `keyOf` is `JSON.stringify(args)` — this works for any
plain JSON-able inputs.  Functions, symbols, and circular
references will produce unusual keys (the same input always
hashes to the same key, but two distinct function objects may
collapse).  For those cases, supply a custom `keyOf` at
construction time (currently this means using the host JS API;
the Aether-side API uses the default).

## Functions

| Function | Signature | Notes |
|---|---|---|
| `memoizeNew` | `(fn?, capacity?) -> MemoCache` | Wrap a function (or `null` for a pure kv store). |
| `memoizeGet` | `(c, ...args) -> any?` | Compute on miss, store, return; updates LRU recency. |
| `memoizeSet` | `(c, value, args?) -> MemoCache` | Direct store under args; chainable; honours capacity. |
| `memoizeHas` | `(c, ...args) -> bool` | True if an entry exists (does not compute). |
| `memoizeSize` | `(c) -> int` | Number of cached entries. |
| `memoizeClear` | `(c) -> unit` | Drop all entries and reset stats. |
| `memoizeStats` | `(c) -> {hits, misses, evictions, size}` | Snapshot of stats. |
| `memoizeEvict` | `(c, ...args) -> bool` | Manually remove one entry by key. |

## Examples

### Wrapping an expensive function

```aether
let calls = 0;
let slow = fn (n: int) -> int { calls = calls + 1; n * 2 };
let c = memoizeNew(slow);
print(memoizeGet(c, 5));  // 10  (miss, computed)
print(memoizeGet(c, 5));  // 10  (hit)
print(memoizeGet(c, 5));  // 10  (hit)
print(memoizeStats(c).hits);   // 2
print(memoizeStats(c).misses); // 1
```

### LRU eviction

```aether
let c = memoizeNew(null, 2);   // capacity = 2
memoizeSet(c, 1, [1]);
memoizeSet(c, 2, [2]);
memoizeGet(c, 1);                // touch 1 — refreshes recency
memoizeSet(c, 3, [3]);            // capacity exceeded, evict LRU
print(memoizeHas(c, 1)); // true  (touched recently)
print(memoizeHas(c, 2)); // false (evicted)
print(memoizeStats(c).evictions); // 1
```

### Multi-argument functions

```aether
let add = fn (a: int, b: int) -> int { a + b };
let c = memoizeNew(add);
print(memoizeGet(c, 1, 2));  // 3 (miss)
print(memoizeGet(c, 1, 2));  // 3 (hit)
print(memoizeGet(c, 2, 3));  // 5 (miss)
print(memoizeStats(c).hits);   // 1
print(memoizeStats(c).misses); // 2
```

## Semantics

* **Read-through.**  `memoizeGet` computes via `c.fn` on a miss;
  if `c.fn` is `null`, it just returns `undefined` (after
  incrementing the miss counter).
* **LRU recency.**  Each hit on a key updates that key's
  `lastTouched` to the cache's monotonic clock.  When a `set`
  pushes the cache over capacity, the entry with the smallest
  `lastTouched` is evicted.
* **Stats reset.**  `memoizeClear` resets the counters AND the
  clock.  This is important: a stale clock would let new entries
  look older than they really are, biasing eviction.
* **Snapshot semantics.**  `memoizeStats` returns a *copy* of the
  stats object; mutating it does not affect the cache.

## Errors

* Bad cache object → `Error: memoizeX: expected MemoCache, got …`.
* Bad capacity (negative, fractional, NaN, Infinity) at
  construction → `Error: memoizeNew: capacity must be a non-negative integer`.
* Non-array `args` to `memoizeSet` → throws.

## Performance

* `memoizeGet`, `memoizeSet`:  O(1) average (Map ops), O(n) worst
  case for the LRU scan when capacity is exceeded.
* `memoizeHas`, `memoizeSize`, `memoizeStats`:  O(1).
* `memoizeClear`, `memoizeEvict`:  O(1).

For most workloads the LRU scan is invisible — capacities are
usually large relative to the eviction frequency.  For
extremely large caches with tiny capacities, a dedicated
double-linked-list LRU would be O(1) worst case.

## Tests

20 tests in `index.test.ts` cover construction, get/set/has,
LRU eviction (with explicit recency check), stats, manual
eviction, clear, and validator errors.  Run them with:

```
bunx vitest run aether/stdlib/memoize
```

## Future work

A `memoizeFn(fn, capacity?)` convenience wrapper that returns a
function — so callers don't need to thread the cache through.
Also, custom `keyOf` plumbing so Aether code can override the
default JSON serializer when the args contain non-JSON types.
