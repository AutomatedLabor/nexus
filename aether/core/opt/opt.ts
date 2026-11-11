/**
 * aether/core/opt/opt.ts
 * =======================
 * Optimizer framework. Exports the `Pass` type, a `runPasses` driver that
 * applies a sequence of passes, a `countInstrs` tally, and a `cloneIr` helper
 * for immutable transforms.
 *
 * Every pass takes an `IrProgram` and returns a new `IrProgram`. Passes never
 * mutate the input program — they always clone first (or build a fresh
 * program from scratch). Tests rely on this to assert before/after state.
 *
 * The framework is intentionally tiny: each pass is a single pure function
 * and may be invoked in isolation or chained. `runPasses` is a left fold
 * over the pass list.
 */
import type { IrProgram, IrFunc, IrBlock, IrOp } from "./types";

//----------------------------------------------------------------------------
// Public types
//----------------------------------------------------------------------------

/** A single optimization pass: pure function from program to program. */
export type Pass = (prog: IrProgram) => IrProgram;

//----------------------------------------------------------------------------
// countInstrs
//----------------------------------------------------------------------------

/** Total number of instructions across all functions and blocks. */
export function countInstrs(prog: IrProgram): number {
  let n = 0;
  for (const f of prog.funcs) {
    for (const b of f.blocks) n += b.instrs.length;
  }
  return n;
}

//----------------------------------------------------------------------------
// runPasses
//----------------------------------------------------------------------------

/** Apply each pass in order, threading the program through. */
export function runPasses(prog: IrProgram, passes: Pass[]): IrProgram {
  let p = prog;
  for (const pass of passes) p = pass(p);
  return p;
}

//----------------------------------------------------------------------------
// cloneIr — deep clone for immutable transforms
//----------------------------------------------------------------------------

/**
 * Deep-clone an IR program. Used by passes that prefer a "clone-then-mutate
 * the clone" style; the input program is never observed.
 *
 * `Map` (globals) is cloned via its constructor; everything else is plain
 * JSON-shaped data so a structured clone via JSON round-trip is safe and
 * fast. We avoid `structuredClone` to remain Bun/browser-portable.
 */
export function cloneIr(prog: IrProgram): IrProgram {
  return {
    funcs: prog.funcs.map(cloneFunc),
    globals: new Map(prog.globals),
  };
}

function cloneFunc(f: IrFunc): IrFunc {
  return {
    name: f.name,
    params: [...f.params],
    entry: f.entry,
    nlocals: f.nlocals,
    blocks: f.blocks.map(cloneBlock),
  };
}

function cloneBlock(b: IrBlock): IrBlock {
  return { id: b.id, instrs: b.instrs.map(cloneInstr) };
}

function cloneInstr(i: IrOp): IrOp {
  // All IrOp shapes are JSON-serializable (no Maps, functions, or symbols).
  // A JSON round-trip is the simplest correct deep clone available here.
  return JSON.parse(JSON.stringify(i)) as IrOp;
}

//----------------------------------------------------------------------------
// Misc helpers used across passes
//----------------------------------------------------------------------------

/** Returns true if the instruction ends a block (no fall-through). */
export function isTerminator(i: IrOp): boolean {
  const op = (i as { op?: string }).op;
  return op === "Br" || op === "Return" || op === "TailCall" || op === "Match";
}

/** Returns true if the instruction has a destination register (`dest`). */
export function hasDest(i: IrOp): boolean {
  const op = (i as { op?: string }).op;
  return (
    op === "Const" ||
    op === "Move" ||
    op === "Bin" ||
    op === "Un" ||
    op === "Call" ||
    op === "CallBuiltin" ||
    op === "LoadField" ||
    op === "AllocStruct" ||
    op === "AllocVariant" ||
    op === "AllocArray" ||
    op === "AllocMap" ||
    op === "IndexGet" ||
    op === "Len" ||
    op === "Phi"
  );
}

/** Get the dest register of an instruction (throws if none). */
export function getDest(i: IrOp): number {
  return (i as { dest: number }).dest;
}

/**
 * Returns true if executing the instruction may have an observable side
 * effect beyond writing its destination register — and so it cannot be
 * removed by DCE even if its dest is dead.
 *
 * Conservatively includes all `Call` to user functions (which may transitively
 * call `print`/`panic`/mutate globals), `CallBuiltin` to known side-effectful
 * builtins (`print`/`println`/`panic`/`error`/`assert`), all stores
 * (`StoreField`, `IndexSet`), and all terminators.
 */
export function hasSideEffects(i: IrOp): boolean {
  const op = (i as { op?: string }).op;
  switch (op) {
    case "Br":
    case "Return":
    case "TailCall":
    case "Match":
    case "StoreField":
    case "IndexSet":
      return true;
    case "Call":
      return true; // user calls may have side effects
    case "CallBuiltin": {
      const fn = (i as { fn: string }).fn;
      // Known side-effectful builtins. Other builtins (len, sqrt, abs, ...)
      // are treated as pure — they can be DCE'd if their dest is unused.
      return (
        fn === "print" ||
        fn === "println" ||
        fn === "panic" ||
        fn === "error" ||
        fn === "assert" ||
        fn === "assert_eq" ||
        fn === "raise"
      );
    }
    default:
      return false;
  }
}

/** Iterate a fixpoint computation up to a safety cap. */
export function fixpoint<T>(initial: T, step: (t: T) => T, eq: (a: T, b: T) => boolean, maxIters = 100): T {
  let cur = initial;
  for (let i = 0; i < maxIters; i++) {
    const next = step(cur);
    if (eq(cur, next)) return next;
    cur = next;
  }
  return cur;
}
