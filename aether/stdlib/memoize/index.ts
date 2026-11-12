/**
 * Aether stdlib — `memoize` module.
 *
 * A small memoization cache for unary/binary pure functions. Stores
 * results keyed by a stringified argument tuple, with optional LRU
 * eviction and per-cache statistics.
 *
 * Functions:
 *   - memoizeNew        — create a cache
 *   - memoizeGet        — read-through lookup (computes via the
 *                         supplied function on miss)
 *   - memoizeSet        — write a binding directly (bypass the fn)
 *   - memoizeHas        — check existence
 *   - memoizeSize       — current number of cached entries
 *   - memoizeClear      — drop all entries
 *   - memoizeStats      — return {hits, misses, evictions, size}
 *   - memoizeEvict      — manually remove one entry by key
 *
 * All functions throw a plain `Error` on invalid input.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemoCache<V = any> {
  /** The wrapped function. May be null/undefined for caches that are
   *  only used as explicit key/value stores via `memoizeSet`. */
  fn: ((...args: any[]) => V) | null;
  /** Map<keyString, { value, args }>.  Iteration order is insertion
   *  order; the LRU re-orders on hit. */
  entries: Map<string, { value: V; args: any[]; lastTouched: number }>;
  /** Maximum number of entries; 0 means unlimited. */
  capacity: number;
  /** Key serializer: takes the raw args and produces a string.  The
   *  default uses JSON.stringify on the args array. */
  keyOf: (args: any[]) => string;
  /** Statistics. */
  stats: { hits: number; misses: number; evictions: number };
  /** Monotonic timestamp for LRU ordering. */
  clock: number;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Create a fresh memoization cache.
 *   `memoizeNew(fn, capacity?)` — wrap a function with optional LRU.
 *   `memoizeNew(null, capacity?)` — pure key/value cache (use
 *     `memoizeSet` to populate, `memoizeGet` will always miss).
 *  `capacity` defaults to 0 (unlimited). */
export function memoizeNew<V = any>(
  fn: ((...args: any[]) => V) | null = null,
  capacity: number = 0,
): MemoCache<V> {
  if (fn !== null && typeof fn !== "function") {
    throw new Error("memoizeNew: fn must be a function or null");
  }
  if (typeof capacity !== "number" || !Number.isFinite(capacity) || capacity < 0 || !Number.isInteger(capacity)) {
    throw new Error("memoizeNew: capacity must be a non-negative integer");
  }
  return {
    fn,
    entries: new Map(),
    capacity,
    keyOf: defaultKeyOf,
    stats: { hits: 0, misses: 0, evictions: 0 },
    clock: 0,
  };
}

// ---------------------------------------------------------------------------
// Lookup / write
// ---------------------------------------------------------------------------

/** Get a cached value by key.  On a hit, returns the stored value
 *  (and refreshes LRU recency).  On a miss, computes `cache.fn(...args)`
 *  if a function is set, stores the result, returns it; otherwise
 *  returns `undefined`. */
export function memoizeGet<V>(cache: MemoCache<V>, ...args: any[]): V | undefined {
  assertCache(cache, "memoizeGet");
  const key = cache.keyOf(args);
  const e = cache.entries.get(key);
  if (e !== undefined) {
    cache.stats.hits++;
    cache.clock++;
    e.lastTouched = cache.clock;
    return e.value;
  }
  cache.stats.misses++;
  if (cache.fn === null) return undefined;
  const value = cache.fn(...args);
  // Use the same insert path as memoizeSet for LRU.
  memoizeSet(cache, value, args);
  return value;
}

/** Directly write a value into the cache under the given args.
 *  Useful for pre-populating or for caches with no wrapped function.
 *  Honours the capacity (evicts least-recently-used).  Returns the
 *  cache (chainable). */
export function memoizeSet<V>(cache: MemoCache<V>, value: V, args: any[] = []): MemoCache<V> {
  assertCache(cache, "memoizeSet");
  if (!Array.isArray(args)) throw new Error("memoizeSet: args must be an array");
  const key = cache.keyOf(args);
  cache.clock++;
  cache.entries.set(key, { value, args, lastTouched: cache.clock });
  // Enforce capacity via LRU eviction.
  while (cache.capacity > 0 && cache.entries.size > cache.capacity) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of cache.entries.entries()) {
      if (v.lastTouched < oldestTime) {
        oldestTime = v.lastTouched;
        oldestKey = k;
      }
    }
    if (oldestKey !== null) {
      cache.entries.delete(oldestKey);
      cache.stats.evictions++;
    } else {
      break;
    }
  }
  return cache;
}

/** True if the cache has a stored value for `args` (does NOT compute
 *  or update recency). */
export function memoizeHas<V>(cache: MemoCache<V>, ...args: any[]): boolean {
  assertCache(cache, "memoizeHas");
  return cache.entries.has(cache.keyOf(args));
}

/** Current number of cached entries. */
export function memoizeSize<V>(cache: MemoCache<V>): number {
  assertCache(cache, "memoizeSize");
  return cache.entries.size;
}

/** Drop all entries and reset hit/miss/eviction counters. */
export function memoizeClear<V>(cache: MemoCache<V>): void {
  assertCache(cache, "memoizeClear");
  cache.entries.clear();
  cache.stats.hits = 0;
  cache.stats.misses = 0;
  cache.stats.evictions = 0;
  cache.clock = 0;
}

/** Return a snapshot of the cache's statistics. */
export function memoizeStats<V>(cache: MemoCache<V>): { hits: number; misses: number; evictions: number; size: number } {
  assertCache(cache, "memoizeStats");
  return {
    hits: cache.stats.hits,
    misses: cache.stats.misses,
    evictions: cache.stats.evictions,
    size: cache.entries.size,
  };
}

/** Manually remove one entry by key (computed from `args`).
 *  Returns true if an entry was removed, false if no entry existed. */
export function memoizeEvict<V>(cache: MemoCache<V>, ...args: any[]): boolean {
  assertCache(cache, "memoizeEvict");
  const key = cache.keyOf(args);
  return cache.entries.delete(key);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "memoize",
  fns: [
    { name: "memoizeNew", sig: "(fn?: (any...) -> any, capacity?: int) -> MemoCache", desc: "Create a memoization cache (optionally wrapping a function)." },
    { name: "memoizeGet", sig: "(c: MemoCache, ...args: any) -> any?", desc: "Get (compute+store on miss); updates LRU recency." },
    { name: "memoizeSet", sig: "(c: MemoCache, value: any, args?: any[]) -> MemoCache", desc: "Directly store a value under args; chainable." },
    { name: "memoizeHas", sig: "(c: MemoCache, ...args: any) -> bool", desc: "True if an entry exists for args (does not compute)." },
    { name: "memoizeSize", sig: "(c: MemoCache) -> int", desc: "Number of cached entries." },
    { name: "memoizeClear", sig: "(c: MemoCache) -> unit", desc: "Drop all entries and reset stats." },
    { name: "memoizeStats", sig: "(c: MemoCache) -> {hits, misses, evictions, size}", desc: "Snapshot of cache statistics." },
    { name: "memoizeEvict", sig: "(c: MemoCache, ...args: any) -> bool", desc: "Manually evict one entry; returns true if removed." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("memoizeNew", memoizeNew);
  registerBuiltin("memoizeGet", memoizeGet);
  registerBuiltin("memoizeSet", memoizeSet);
  registerBuiltin("memoizeHas", memoizeHas);
  registerBuiltin("memoizeSize", memoizeSize);
  registerBuiltin("memoizeClear", memoizeClear);
  registerBuiltin("memoizeStats", memoizeStats);
  registerBuiltin("memoizeEvict", memoizeEvict);
}

// ---------------------------------------------------------------------------
// Helpers & validators
// ---------------------------------------------------------------------------

function defaultKeyOf(args: any[]): string {
  return JSON.stringify(args);
}

function assertCache<V>(x: any, fn: string): asserts x is MemoCache<V> {
  if (typeof x !== "object" || x === null ||
      typeof x.keyOf !== "function" ||
      !(x.entries instanceof Map) ||
      !x.stats || typeof x.stats !== "object") {
    throw new Error(fn + ": expected MemoCache, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
