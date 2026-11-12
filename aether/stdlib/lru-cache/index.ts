/**
 * Aether stdlib — `lru-cache` module.
 *
 * A least-recently-used (LRU) cache: a fixed-capacity key/value
 * store that evicts the least-recently-used entry when full.  Reads
 * (`lruGet`) and writes (`lruPut`) both mark the entry as recently
 * used; `lruPeek` reads without marking.
 *
 * Implementation: a Map (insertion-ordered) plus a manual
 * "reinsert on access" trick.  When an entry is accessed, we
 * delete and re-insert it so it becomes the newest.  The oldest
 * entry is then `map.keys().next().value` (the first to be
 * evicted on overflow).  This gives O(1) average-time operations
 * with very little code, leveraging the JS engine's hash map.
 *
 * For very high throughput, a doubly-linked-list + Map
 * implementation would have slightly better constant factors, but
 * the simple version is plenty fast up to ~100k entries and is
 * much easier to read.
 *
 * All functions throw a plain `Error` on invalid input; the
 * evaluator converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LRUCache<K = any, V = any> {
  capacity: number;
  map: Map<K, V>;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Create a new LRU cache with the given capacity (must be > 0). */
export function lruNew<K, V>(capacity: number): LRUCache<K, V> {
  if (typeof capacity !== "number" || !Number.isFinite(capacity) || capacity <= 0) {
    throw new Error("lruNew: capacity must be a positive number, got " + capacity);
  }
  return { capacity: Math.floor(capacity), map: new Map<K, V>() };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Get a value by key, marking it as recently used.
 *  Returns `undefined` if the key is not in the cache. */
export function lruGet<K, V>(cache: LRUCache<K, V>, key: K): V | undefined {
  assertLru(cache, "lruGet");
  if (!cache.map.has(key)) return undefined;
  // Re-insert to mark as newest.
  const v = cache.map.get(key) as V;
  cache.map.delete(key);
  cache.map.set(key, v);
  return v;
}

/** Put a key/value pair, marking it as recently used.
 *  If the cache is full, evicts the LRU entry first.
 *  Returns the evicted entry (as a 2-tuple `[key, value]`), or
 *  `undefined` if no eviction occurred. */
export function lruPut<K, V>(cache: LRUCache<K, V>, key: K, value: V): [K, V] | undefined {
  assertLru(cache, "lruPut");
  let evicted: [K, V] | undefined = undefined;
  if (cache.map.has(key)) {
    // Existing key: update value, mark as newest.
    cache.map.delete(key);
  } else if (cache.map.size >= cache.capacity) {
    // New key, cache full: evict LRU entry.
    const oldest = cache.map.keys().next();
    if (!oldest.done) {
      const k = oldest.value as K;
      const v = cache.map.get(k) as V;
      evicted = [k, v];
      cache.map.delete(k);
    }
  }
  cache.map.set(key, value);
  return evicted;
}

/** Peek at a value by key WITHOUT marking it as recently used.
 *  Returns `undefined` if the key is not in the cache. */
export function lruPeek<K, V>(cache: LRUCache<K, V>, key: K): V | undefined {
  assertLru(cache, "lruPeek");
  return cache.map.get(key);
}

/** Returns true if the cache contains the key (without touching LRU order). */
export function lruContains<K, V>(cache: LRUCache<K, V>, key: K): boolean {
  assertLru(cache, "lruContains");
  return cache.map.has(key);
}

/** Number of entries currently in the cache. */
export function lruSize<K, V>(cache: LRUCache<K, V>): number {
  assertLru(cache, "lruSize");
  return cache.map.size;
}

/** Remove all entries from the cache. */
export function lruClear<K, V>(cache: LRUCache<K, V>): void {
  assertLru(cache, "lruClear");
  cache.map.clear();
}

/** Return all keys in LRU order (oldest first, newest last). */
export function lruKeys<K, V>(cache: LRUCache<K, V>): K[] {
  assertLru(cache, "lruKeys");
  return Array.from(cache.map.keys());
}

/** Return all values in LRU order (oldest first, newest last). */
export function lruValues<K, V>(cache: LRUCache<K, V>): V[] {
  assertLru(cache, "lruValues");
  return Array.from(cache.map.values());
}

/** Evict the LRU entry manually.
 *  Returns the evicted entry as `[key, value]`, or `undefined` if the
 *  cache is empty. */
export function lruEvict<K, V>(cache: LRUCache<K, V>): [K, V] | undefined {
  assertLru(cache, "lruEvict");
  if (cache.map.size === 0) return undefined;
  const oldest = cache.map.keys().next();
  if (oldest.done) return undefined;
  const k = oldest.value as K;
  const v = cache.map.get(k) as V;
  cache.map.delete(k);
  return [k, v];
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "lru-cache",
  fns: [
    { name: "lruNew", sig: "(capacity: int) -> LRUCache", desc: "Create a new LRU cache with the given capacity." },
    { name: "lruGet", sig: "(cache: LRUCache, key: any) -> any?", desc: "Get a value, marking it as recently used." },
    { name: "lruPut", sig: "(cache: LRUCache, key: any, value: any) -> [any, any]?", desc: "Put a key/value pair; evict LRU on overflow; return evicted entry." },
    { name: "lruPeek", sig: "(cache: LRUCache, key: any) -> any?", desc: "Get a value WITHOUT touching LRU order." },
    { name: "lruContains", sig: "(cache: LRUCache, key: any) -> bool", desc: "Test membership without touching LRU order." },
    { name: "lruSize", sig: "(cache: LRUCache) -> int", desc: "Number of entries currently in the cache." },
    { name: "lruClear", sig: "(cache: LRUCache) -> void", desc: "Remove all entries." },
    { name: "lruKeys", sig: "(cache: LRUCache) -> any[]", desc: "All keys in LRU order (oldest first)." },
    { name: "lruValues", sig: "(cache: LRUCache) -> any[]", desc: "All values in LRU order (oldest first)." },
    { name: "lruEvict", sig: "(cache: LRUCache) -> [any, any]?", desc: "Manually evict the LRU entry; return it." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("lruNew", lruNew);
  registerBuiltin("lruGet", lruGet);
  registerBuiltin("lruPut", lruPut);
  registerBuiltin("lruPeek", lruPeek);
  registerBuiltin("lruContains", lruContains);
  registerBuiltin("lruSize", lruSize);
  registerBuiltin("lruClear", lruClear);
  registerBuiltin("lruKeys", lruKeys);
  registerBuiltin("lruValues", lruValues);
  registerBuiltin("lruEvict", lruEvict);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertLru(x: any, fn: string): asserts x is LRUCache {
  if (typeof x !== "object" || x === null || !(x.map instanceof Map) ||
      typeof x.capacity !== "number") {
    throw new Error(fn + ": expected LRUCache, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  if (x instanceof Map) return "Map";
  return typeof x;
}
