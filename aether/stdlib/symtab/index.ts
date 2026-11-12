/**
 * Aether stdlib — `symtab` module.
 *
 * A lexical symbol table with scoped frames, designed to mirror the
 * evaluator's environment chain in a more minimal, debuggable form.
 * Each symbol table is a stack of frames; pushing a frame enters a
 * new scope, popping a frame exits.  `symtabInsert` writes a binding
 * into the current (deepest) frame, `symtabLookup` walks the chain
 * from deepest to shallowest, and `symtabLookupLocal` checks only the
 * current frame.
 *
 * Implementation notes
 * --------------------
 * Frames are plain JS Maps; the symbol table is an array of frames
 * with `depth` derived from `frames.length`.  All functions throw a
 * plain `Error` on invalid input; the evaluator converts thrown
 * errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SymTabFrame<V = any> {
  /** Map<name, value>. */
  bindings: Map<string, V>;
}

export interface SymTab<V = any> {
  frames: SymTabFrame<V>[];
}

// ---------------------------------------------------------------------------
// Construction & scope management
// ---------------------------------------------------------------------------

/** Create a fresh, empty symbol table (zero frames).  The caller is
 *  responsible for entering at least one frame before inserting. */
export function symtabNew<V = any>(): SymTab<V> {
  return { frames: [] };
}

/** Enter a new scope: push a fresh frame onto the stack.  Returns the
 *  table (chainable).  If `frames` was previously empty, this becomes
 *  the global frame. */
export function symtabEnter<V>(t: SymTab<V>): SymTab<V> {
  assertTab(t, "symtabEnter");
  t.frames.push({ bindings: new Map() });
  return t;
}

/** Exit the current scope: pop the deepest frame.  Returns true if a
 *  frame was popped, false if the table was already empty (in which
 *  case nothing happens).  All bindings in the discarded frame are
 *  lost. */
export function symtabExit<V>(t: SymTab<V>): boolean {
  assertTab(t, "symtabExit");
  if (t.frames.length === 0) return false;
  t.frames.pop();
  return true;
}

// ---------------------------------------------------------------------------
// Binding operations
// ---------------------------------------------------------------------------

/** Insert (or overwrite) a binding `name -> value` in the current
 *  (deepest) frame.  Returns the table (chainable).  Throws if the
 *  table is empty (no frame to write into) or if `name` is not a
 *  non-empty string. */
export function symtabInsert<V>(t: SymTab<V>, name: string, value: V): SymTab<V> {
  assertTab(t, "symtabInsert");
  assertName(name, "symtabInsert");
  if (t.frames.length === 0) {
    throw new Error("symtabInsert: no active frame — call symtabEnter first");
  }
  t.frames[t.frames.length - 1].bindings.set(name, value);
  return t;
}

/** Walk the frame chain from deepest to shallowest, returning the
 *  first binding named `name`.  Returns `undefined` if not found. */
export function symtabLookup<V>(t: SymTab<V>, name: string): V | undefined {
  assertTab(t, "symtabLookup");
  assertName(name, "symtabLookup");
  for (let i = t.frames.length - 1; i >= 0; i--) {
    if (t.frames[i].bindings.has(name)) {
      return t.frames[i].bindings.get(name);
    }
  }
  return undefined;
}

/** Look up `name` in the current (deepest) frame only.  Returns
 *  `undefined` if the table is empty or the name is not present in
 *  the current frame. */
export function symtabLookupLocal<V>(t: SymTab<V>, name: string): V | undefined {
  assertTab(t, "symtabLookupLocal");
  assertName(name, "symtabLookupLocal");
  if (t.frames.length === 0) return undefined;
  return t.frames[t.frames.length - 1].bindings.get(name);
}

/** Insert `name -> value` into the current frame, but only if the
 *  name is *not* already present in the current frame.  Returns true
 *  if the binding was inserted, false if a local binding with that
 *  name already exists (in which case the existing binding is
 *  preserved).  Outer-frame bindings are not consulted — this allows
 *  the new binding to shadow an outer one. */
export function symtabShadow<V>(t: SymTab<V>, name: string, value: V): boolean {
  assertTab(t, "symtabShadow");
  assertName(name, "symtabShadow");
  if (t.frames.length === 0) {
    throw new Error("symtabShadow: no active frame — call symtabEnter first");
  }
  const frame = t.frames[t.frames.length - 1];
  if (frame.bindings.has(name)) return false;
  frame.bindings.set(name, value);
  return true;
}

// ---------------------------------------------------------------------------
// Introspection
// ---------------------------------------------------------------------------

/** Current scope depth — `0` when no frames have been entered, `1`
 *  after the first `symtabEnter`, etc. */
export function symtabCurrentDepth<V>(t: SymTab<V>): number {
  assertTab(t, "symtabCurrentDepth");
  return t.frames.length;
}

/** Collect all bindings visible at the current point — i.e. the
 *  union of all frames, with inner frames shadowing outer ones when
 *  names collide.  Returns an array of `{ name, value, depth }`
 *  triples sorted by name.  Returns the empty array if the table is
 *  empty. */
export function symtabAll<V>(t: SymTab<V>): Array<{ name: string; value: V; depth: number }> {
  assertTab(t, "symtabAll");
  const out = new Map<string, { name: string; value: V; depth: number }>();
  for (let d = 0; d < t.frames.length; d++) {
    for (const [k, v] of t.frames[d].bindings.entries()) {
      // inner (higher d) shadows outer
      out.set(k, { name: k, value: v, depth: d });
    }
  }
  return Array.from(out.values()).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Human-readable dump: one line per frame, with bindings sorted by
 *  name.  Useful for debugging the evaluator's environment chain. */
export function symtabToString<V>(t: SymTab<V>): string {
  assertTab(t, "symtabToString");
  if (t.frames.length === 0) return "<symtab empty>";
  const lines: string[] = [];
  for (let d = 0; d < t.frames.length; d++) {
    const frame = t.frames[d];
    const entries = Array.from(frame.bindings.entries()).sort((a, b) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
    );
    if (entries.length === 0) {
      lines.push(`d${d}: {}`);
    } else {
      const body = entries.map(([k, v]) => `${k}=${describe(v)}`).join(", ");
      lines.push(`d${d}: { ${body} }`);
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "symtab",
  fns: [
    { name: "symtabNew", sig: "() -> SymTab", desc: "Create a fresh empty symbol table." },
    { name: "symtabEnter", sig: "(t: SymTab) -> SymTab", desc: "Push a new scope frame; chainable." },
    { name: "symtabExit", sig: "(t: SymTab) -> bool", desc: "Pop the current frame; returns true if popped." },
    { name: "symtabInsert", sig: "(t: SymTab, name: string, value: any) -> SymTab", desc: "Insert/overwrite binding in the current frame." },
    { name: "symtabLookup", sig: "(t: SymTab, name: string) -> any?", desc: "Walk frames deepest-first; return first match or undefined." },
    { name: "symtabLookupLocal", sig: "(t: SymTab, name: string) -> any?", desc: "Look up in the current frame only." },
    { name: "symtabShadow", sig: "(t: SymTab, name: string, value: any) -> bool", desc: "Insert in current frame unless a local binding already exists." },
    { name: "symtabCurrentDepth", sig: "(t: SymTab) -> int", desc: "Number of frames currently on the stack." },
    { name: "symtabAll", sig: "(t: SymTab) -> [{name, value, depth}]", desc: "All visible bindings (inner shadows outer), sorted by name." },
    { name: "symtabToString", sig: "(t: SymTab) -> string", desc: "Human-readable per-frame dump for debugging." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("symtabNew", symtabNew);
  registerBuiltin("symtabEnter", symtabEnter);
  registerBuiltin("symtabExit", symtabExit);
  registerBuiltin("symtabInsert", symtabInsert);
  registerBuiltin("symtabLookup", symtabLookup);
  registerBuiltin("symtabLookupLocal", symtabLookupLocal);
  registerBuiltin("symtabShadow", symtabShadow);
  registerBuiltin("symtabCurrentDepth", symtabCurrentDepth);
  registerBuiltin("symtabAll", symtabAll);
  registerBuiltin("symtabToString", symtabToString);
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function assertTab<V>(x: any, fn: string): asserts x is SymTab<V> {
  if (typeof x !== "object" || x === null || !Array.isArray(x.frames)) {
    throw new Error(fn + ": expected SymTab, got " + kind(x));
  }
}

function assertName(x: any, fn: string): asserts x is string {
  if (typeof x !== "string" || x.length === 0) {
    throw new Error(fn + ": expected non-empty string name, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}

function describe(x: any): string {
  if (typeof x === "string") return JSON.stringify(x);
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  if (typeof x === "object") {
    try {
      return JSON.stringify(x);
    } catch {
      return String(x);
    }
  }
  return String(x);
}
