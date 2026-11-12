/**
 * aether/stdlib/index.ts
 * =======================
 * Stdlib registry: aggregates every stdlib module's `register` function and
 * `MANIFEST` so the host (playground) can wire all 200+ builtins into the
 * evaluator in one call and so the docs generator can produce a complete
 * function index.
 *
 * Each stdlib module exports:
 *   - `register(registerBuiltin: (name, fn) => void): void`
 *   - `MANIFEST: { module: string; fns: Array<{ name, sig, desc }> }`
 *
 * `registerAll` here simply walks the modules and forwards each module's
 * `register` to the supplied sink. `STDLIB_MANIFEST` is the union of the
 * per-module manifests, suitable for the playground's autocomplete / docs.
 *
 * Note on naming collisions
 * -------------------------
 * A small number of stdlib functions share a name with the evaluator's
 * inline builtins (e.g. `print`, `println`, `len`, `map`, `filter`,
 * `reduce`, `min`, `max`, `abs`, `sqrt`, `push`, `pop`). When both are
 * registered, the inline builtins installed by `run()` always take
 * precedence because they're the last to be written into the root env.
 * The inline versions know how to call Aether closures via the
 * evaluator's `callValue`; the stdlib versions accept only native JS
 * functions (which is fine when called from host code, not from Aether).
 */
import * as Str from "./string";
import * as Math_ from "./math";
import * as Coll from "./collections";
import * as IO from "./io";
import * as DT from "./datetime";
import * as Re from "./regex";
import * as Enc from "./encoding";
import * as Cr from "./crypto";
import * as Txt from "./text";
import * as Async from "./async";
// New modules (W4-STDLIB-EXPAND):
import * as List from "./list";
import * as Set_ from "./set";
import * as Func from "./functional";
import * as Stat from "./statistics";
import * as Bits from "./bits";
import * as Val from "./validate";
import * as Tree from "./tree";
import * as Uuid from "./uuid";
// New modules (W11-EXPAND):
import * as Graph from "./graph";
import * as Heap from "./heap";
import * as Sort from "./sort";
import * as Matrix from "./matrix";
import * as Parser from "./parser";
import * as Random from "./random";
// New modules (W7-FORMAL — V3-W7-FORMAL):
import * as Bloom from "./bloom";
import * as LruCache from "./lru-cache";
import * as Trie from "./trie";
import * as StateMachine from "./state-machine";
import * as SkipList from "./skip-list";
// New modules (V3-W6-PKGS2):
import * as Interval from "./interval";
import * as DisjointSet from "./disjoint-set";
import * as Bimap from "./bimap";
// New modules (V3-W14-EXPAND2):
import * as SymTab from "./symtab";
import * as Sparse from "./sparse";
import * as Memoize from "./memoize";
import * as Cidr from "./cidr";
import * as PQueue from "./pqueue";

export interface StdlibFn {
  name: string;
  sig: string;
  desc: string;
}

export interface StdlibModuleManifest {
  module: string;
  fns: StdlibFn[];
}

//----------------------------------------------------------------------------
// registerAll — wire every stdlib module's functions into a sink.
// The sink is typically the evaluator's `opts.builtins` map; for the type
// checker it can be a stub that records just the names.
//----------------------------------------------------------------------------
export function registerAll(register: (name: string, fn: any) => void): void {
  Str.register(register);
  Math_.register(register);
  Coll.register(register);
  IO.register(register);
  DT.register(register);
  Re.register(register);
  Enc.register(register);
  Cr.register(register);
  Txt.register(register);
  // async functions live in stdlib/async but are NOT callable from the v1
  // sync evaluator; their `register` throws to surface this honestly.
  // Hosts that want to use them directly can `import * as Async from './async'`.
  // We deliberately do NOT call Async.register here.
  //
  // New modules added in W4-STDLIB-EXPAND.  These ARE callable from the v1
  // evaluator (all sync, all pure functions).
  List.register(register);
  Set_.register(register);
  Func.register(register);
  Stat.register(register);
  Bits.register(register);
  Val.register(register);
  Tree.register(register);
  Uuid.register(register);
  // New modules (W11-EXPAND):
  Graph.register(register);
  Heap.register(register);
  Sort.register(register);
  Matrix.register(register);
  Parser.register(register);
  Random.register(register);
  // New modules (W7-FORMAL — V3-W7-FORMAL):
  Bloom.register(register);
  LruCache.register(register);
  Trie.register(register);
  StateMachine.register(register);
  SkipList.register(register);
  // New modules (V3-W6-PKGS2):
  Interval.register(register);
  DisjointSet.register(register);
  Bimap.register(register);
  // New modules (V3-W14-EXPAND2):
  SymTab.register(register);
  Sparse.register(register);
  Memoize.register(register);
  Cidr.register(register);
  PQueue.register(register);
}

/** Build a {name -> fn} map (used by the evaluator's `opts.builtins`). */
export function stdlibBuiltins(): Record<string, (...args: any[]) => any> {
  const out: Record<string, (...args: any[]) => any> = {};
  registerAll((name, fn) => { out[name] = fn; });
  return out;
}

//----------------------------------------------------------------------------
// STDLIB_MANIFEST — combined manifest of every module.
// `import * as X` gives us X.MANIFEST, but TS narrows the type, so we cast.
//----------------------------------------------------------------------------
export const STDLIB_MANIFEST: StdlibModuleManifest[] = [
  Str.MANIFEST as StdlibModuleManifest,
  Math_.MANIFEST as StdlibModuleManifest,
  Coll.MANIFEST as StdlibModuleManifest,
  IO.MANIFEST as StdlibModuleManifest,
  DT.MANIFEST as StdlibModuleManifest,
  Re.MANIFEST as StdlibModuleManifest,
  Enc.MANIFEST as StdlibModuleManifest,
  Cr.MANIFEST as StdlibModuleManifest,
  Txt.MANIFEST as StdlibModuleManifest,
  Async.MANIFEST as StdlibModuleManifest,
  // New modules (W4-STDLIB-EXPAND):
  List.MANIFEST as StdlibModuleManifest,
  Set_.MANIFEST as StdlibModuleManifest,
  Func.MANIFEST as StdlibModuleManifest,
  Stat.MANIFEST as StdlibModuleManifest,
  Bits.MANIFEST as StdlibModuleManifest,
  Val.MANIFEST as StdlibModuleManifest,
  Tree.MANIFEST as StdlibModuleManifest,
  Uuid.MANIFEST as StdlibModuleManifest,
  // New modules (W11-EXPAND):
  Graph.MANIFEST as StdlibModuleManifest,
  Heap.MANIFEST as StdlibModuleManifest,
  Sort.MANIFEST as StdlibModuleManifest,
  Matrix.MANIFEST as StdlibModuleManifest,
  Parser.MANIFEST as StdlibModuleManifest,
  Random.MANIFEST as StdlibModuleManifest,
  // New modules (W7-FORMAL — V3-W7-FORMAL):
  Bloom.MANIFEST as StdlibModuleManifest,
  LruCache.MANIFEST as StdlibModuleManifest,
  Trie.MANIFEST as StdlibModuleManifest,
  StateMachine.MANIFEST as StdlibModuleManifest,
  SkipList.MANIFEST as StdlibModuleManifest,
  // New modules (V3-W6-PKGS2):
  Interval.MANIFEST as StdlibModuleManifest,
  DisjointSet.MANIFEST as StdlibModuleManifest,
  Bimap.MANIFEST as StdlibModuleManifest,
  // New modules (V3-W14-EXPAND2):
  SymTab.MANIFEST as StdlibModuleManifest,
  Sparse.MANIFEST as StdlibModuleManifest,
  Memoize.MANIFEST as StdlibModuleManifest,
  Cidr.MANIFEST as StdlibModuleManifest,
  PQueue.MANIFEST as StdlibModuleManifest,
];

/** Total function count across all modules (excluding async — not callable). */
export function stdlibFnCount(): number {
  let n = 0;
  for (const m of STDLIB_MANIFEST) n += m.fns.length;
  return n;
}

/** Look up a function by name across all modules. */
export function findStdlibFn(name: string): StdlibFn | undefined {
  for (const m of STDLIB_MANIFEST) {
    for (const f of m.fns) {
      if (f.name === name) return f;
    }
  }
  return undefined;
}

/** Look up the module that defines a function (by name). */
export function findStdlibModule(name: string): string | undefined {
  for (const m of STDLIB_MANIFEST) {
    for (const f of m.fns) {
      if (f.name === name) return m.module;
    }
  }
  return undefined;
}

//----------------------------------------------------------------------------
// Re-exports — convenience namespaces for host code.
// We deliberately do NOT `export * from` each module because their
// `MANIFEST`, `register`, and several function names (split, replace, len,
// slice, reverse, time, now, …) would collide. Use the namespace imports
// above (`import * as Str from 'aether/stdlib/string'`) instead, or import
// directly from each module.
//----------------------------------------------------------------------------
