/**
 * Aether stdlib — `bimap` module.
 *
 * A bidirectional map: a key↔value mapping where both directions
 * are O(1) lookups.  Each (key, value) pair is stored in two
 * `Map`s — `keyToValue` and `valueToKey` — so that lookups in
 * either direction are symmetric.  Insertion guarantees the
 * *one-to-one* invariant: setting `key -> value` first removes
 * any previous `key -> oldValue` (and any previous `otherKey ->
 * value`), so the bimap never has two keys mapping to the same
 * value, nor two values mapping to the same key.
 *
 * Use cases:
 *   - **Registry of unique abbreviations**: `("tlwdr" -> "too long
 *     without didn't read")` and back.  Enforce that no two long
 *     names get the same abbreviation.
 *   - **Bi-directional foreign keys**: `(userId -> email)` and
 *     `(email -> userId)`.  Lookup by either column in O(1).
 *   - **Token tables**: `(symbol -> tokenType)` and
 *     `(tokenType -> symbol)` in a parser.
 *   - **Aliases**: `(shortName -> canonicalName)` and back.
 *
 * All functions throw a plain `Error` on invalid input; the
 * evaluator converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Bimap<K = any, V = any> {
  keyToValue: Map<K, V>;
  valueToKey: Map<V, K>;
  /** Number of pairs currently stored. */
  size: number;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Create a fresh, empty bidirectional map. */
export function bimapNew<K = any, V = any>(): Bimap<K, V> {
  return { keyToValue: new Map(), valueToKey: new Map(), size: 0 };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Insert (or update) a key↔value pair.  The one-to-one invariant
 *  is enforced: any pre-existing pair `key -> oldValue` is removed
 *  (freeing `oldValue` for re-use), and any pre-existing pair
 *  `otherKey -> value` is removed (freeing `otherKey` for re-use).
 *  Returns the bimap (chainable). */
export function bimapSet<K, V>(m: Bimap<K, V>, key: K, value: V): Bimap<K, V> {
  assertBimap(m, "bimapSet");
  // If this key already maps to some value, that old pair must go.
  const oldValue = m.keyToValue.get(key);
  if (oldValue !== undefined) {
    m.valueToKey.delete(oldValue);
    m.keyToValue.delete(key);
    m.size--;
  }
  // If this value is already mapped to by some other key, that
  // other pair must go.
  const otherKey = m.valueToKey.get(value);
  if (otherKey !== undefined) {
    m.keyToValue.delete(otherKey);
    m.valueToKey.delete(value);
    m.size--;
  }
  // Insert the new pair.
  m.keyToValue.set(key, value);
  m.valueToKey.set(value, key);
  m.size++;
  return m;
}

/** Look up the value for a given key.  Returns `undefined` if the
 *  key is not in the bimap. */
export function bimapGet<K, V>(m: Bimap<K, V>, key: K): V | undefined {
  assertBimap(m, "bimapGet");
  return m.keyToValue.get(key);
}

/** Look up the key for a given value (reverse direction).
 *  Returns `undefined` if the value is not in the bimap. */
export function bimapGetReverse<K, V>(m: Bimap<K, V>, value: V): K | undefined {
  assertBimap(m, "bimapGetReverse");
  return m.valueToKey.get(value);
}

/** True if `key` is in the bimap. */
export function bimapHas<K, V>(m: Bimap<K, V>, key: K): boolean {
  assertBimap(m, "bimapHas");
  return m.keyToValue.has(key);
}

/** True if `value` is in the bimap (reverse direction). */
export function bimapHasReverse<K, V>(m: Bimap<K, V>, value: V): boolean {
  assertBimap(m, "bimapHasReverse");
  return m.valueToKey.has(value);
}

/** Remove the pair keyed by `key` (and its associated value).
 *  Returns `true` if a pair was removed, `false` if `key` was not
 *  in the bimap. */
export function bimapDelete<K, V>(m: Bimap<K, V>, key: K): boolean {
  assertBimap(m, "bimapDelete");
  const value = m.keyToValue.get(key);
  if (value === undefined) return false;
  m.keyToValue.delete(key);
  m.valueToKey.delete(value);
  m.size--;
  return true;
}

/** Remove the pair keyed by the reverse lookup of `value` (i.e.,
 *  remove the pair `(otherKey, value)`).  Returns `true` if a
 *  pair was removed, `false` if `value` was not in the bimap. */
export function bimapDeleteReverse<K, V>(m: Bimap<K, V>, value: V): boolean {
  assertBimap(m, "bimapDeleteReverse");
  const key = m.valueToKey.get(value);
  if (key === undefined) return false;
  m.valueToKey.delete(value);
  m.keyToValue.delete(key);
  m.size--;
  return true;
}

/** Number of pairs currently in the bimap. */
export function bimapSize<K, V>(m: Bimap<K, V>): number {
  assertBimap(m, "bimapSize");
  return m.size;
}

/** Array of all keys (insertion order, per the JS Map spec). */
export function bimapKeys<K, V>(m: Bimap<K, V>): K[] {
  assertBimap(m, "bimapKeys");
  return Array.from(m.keyToValue.keys());
}

/** Array of all values (insertion order, per the JS Map spec). */
export function bimapValues<K, V>(m: Bimap<K, V>): V[] {
  assertBimap(m, "bimapValues");
  return Array.from(m.keyToValue.values());
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "bimap",
  fns: [
    { name: "bimapNew", sig: "() -> Bimap", desc: "Create a fresh empty bidirectional map." },
    { name: "bimapSet", sig: "(m: Bimap, key: any, value: any) -> Bimap", desc: "Insert (key, value); enforces one-to-one invariant; chainable." },
    { name: "bimapGet", sig: "(m: Bimap, key: any) -> any?", desc: "Look up value by key; undefined if not present." },
    { name: "bimapGetReverse", sig: "(m: Bimap, value: any) -> any?", desc: "Look up key by value; undefined if not present." },
    { name: "bimapHas", sig: "(m: Bimap, key: any) -> bool", desc: "True if key is in the bimap." },
    { name: "bimapHasReverse", sig: "(m: Bimap, value: any) -> bool", desc: "True if value is in the bimap." },
    { name: "bimapDelete", sig: "(m: Bimap, key: any) -> bool", desc: "Remove the pair keyed by key; true if removed, false if absent." },
    { name: "bimapDeleteReverse", sig: "(m: Bimap, value: any) -> bool", desc: "Remove the pair containing value; true if removed, false if absent." },
    { name: "bimapSize", sig: "(m: Bimap) -> int", desc: "Number of pairs currently in the bimap." },
    { name: "bimapKeys", sig: "(m: Bimap) -> any[]", desc: "Array of all keys (insertion order)." },
    { name: "bimapValues", sig: "(m: Bimap) -> any[]", desc: "Array of all values (insertion order)." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("bimapNew", bimapNew);
  registerBuiltin("bimapSet", bimapSet);
  registerBuiltin("bimapGet", bimapGet);
  registerBuiltin("bimapGetReverse", bimapGetReverse);
  registerBuiltin("bimapHas", bimapHas);
  registerBuiltin("bimapHasReverse", bimapHasReverse);
  registerBuiltin("bimapDelete", bimapDelete);
  registerBuiltin("bimapDeleteReverse", bimapDeleteReverse);
  registerBuiltin("bimapSize", bimapSize);
  registerBuiltin("bimapKeys", bimapKeys);
  registerBuiltin("bimapValues", bimapValues);
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function assertBimap<K, V>(x: any, fn: string): asserts x is Bimap<K, V> {
  if (typeof x !== "object" || x === null ||
      !(x.keyToValue instanceof Map) ||
      !(x.valueToKey instanceof Map) ||
      typeof x.size !== "number") {
    throw new Error(fn + ": expected Bimap, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
