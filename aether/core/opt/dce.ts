/**
 * aether/core/opt/dce.ts
 * =======================
 * Pass 2: Dead code elimination.
 *
 * Two phases, iterated to fixpoint:
 *
 *  1. Remove unreachable blocks. A block is reachable if it is the function
 *     entry, or it is the target of some `Br`/`Match` in a reachable block.
 *     We compute reachability via worklist BFS from `func.entry`.
 *
 *  2. Remove dead instructions. An instruction is dead if
 *       (a) it has a destination register (so it can be removed without
 *           affecting control flow), AND
 *       (b) its destination is never read by any other instruction, AND
 *       (c) it has no observable side effect (calls, stores, control flow).
 *
 *     Side-effect classification lives in `opt.ts:hasSideEffects`. Calls to
 *     user functions are conservatively side-effectful. Calls to builtins
 *     are side-effectful only for known names (`print`/`println`/`panic`/
 *     `error`/`assert`/`assert_eq`/`raise`).
 *
 * Removing one dead instruction can make others dead (e.g. a `Const` whose
 * only use was the operand of a removed `Bin`). We iterate until no change.
 *
 * The pass is pure: it clones the input program and mutates only the clone.
 */
import type { IrProgram, IrFunc, IrBlock, IrOp } from "./types";
import { cloneIr, hasDest, hasSideEffects, isTerminator } from "./opt";

//----------------------------------------------------------------------------

/** Find all `Br`/`Match` targets reachable from `instr`. */
function successorsOf(instr: IrOp): number[] {
  const op = (instr as { op?: string }).op;
  if (op === "Br") {
    const b = instr as { then: number; else: number | null };
    return b.else === null ? [b.then] : [b.then, b.else];
  }
  if (op === "Match") {
    const m = instr as { targets: Array<{ target: number }>; default: number };
    const out: number[] = [m.default];
    for (const t of m.targets) out.push(t.target);
    return out;
  }
  // Return, TailCall: no successors.
  return [];
}

/** Compute the set of reachable block IDs in a function (worklist BFS). */
function reachableBlocks(func: IrFunc): Set<number> {
  const reach = new Set<number>();
  const work: number[] = [func.entry];
  reach.add(func.entry);
  while (work.length) {
    const id = work.pop()!;
    const block = func.blocks.find(b => b.id === id);
    if (!block) continue;
    for (const instr of block.instrs) {
      for (const succ of successorsOf(instr)) {
        if (!reach.has(succ)) {
          reach.add(succ);
          work.push(succ);
        }
      }
    }
  }
  return reach;
}

//----------------------------------------------------------------------------

/** Collect every source register read by an instruction. */
export function srcsOf(instr: IrOp): number[] {
  const op = (instr as { op?: string }).op;
  switch (op) {
    case "Const":
      return [];
    case "Move":
      return [(instr as { src: number }).src];
    case "Bin":
      return [(instr as { src1: number; src2: number }).src1, (instr as { src1: number; src2: number }).src2];
    case "Un":
      return [(instr as { src: number }).src];
    case "Call":
      return [...(instr as { args: number[] }).args];
    case "CallBuiltin":
      return [...(instr as { args: number[] }).args];
    case "Br": {
      const c = (instr as { cond: number | null }).cond;
      return c === null ? [] : [c];
    }
    case "Return": {
      const s = (instr as { src: number | null }).src;
      return s === null ? [] : [s];
    }
    case "LoadField":
      return [(instr as { src: number }).src];
    case "StoreField":
      return [(instr as { dest: number; src: number }).dest, (instr as { dest: number; src: number }).src];
    case "AllocStruct": {
      const a = instr as { fields: Record<string, number> };
      return Object.values(a.fields);
    }
    case "AllocVariant":
      return [...(instr as { args: number[] }).args];
    case "AllocArray":
      return [...(instr as { args: number[] }).args];
    case "AllocMap": {
      const a = instr as { pairs: Array<[number, number]> };
      const out: number[] = [];
      for (const [k, v] of a.pairs) {
        out.push(k);
        out.push(v);
      }
      return out;
    }
    case "IndexGet":
      return [(instr as { src: number; index: number }).src, (instr as { src: number; index: number }).index];
    case "IndexSet":
      return [
        (instr as { src: number; index: number; value: number }).src,
        (instr as { src: number; index: number; value: number }).index,
        (instr as { src: number; index: number; value: number }).value,
      ];
    case "Match": {
      const m = instr as { src: number; targets: Array<{ test: number }> };
      const out: number[] = [m.src];
      for (const t of m.targets) out.push(t.test);
      return out;
    }
    case "Len":
      return [(instr as { src: number }).src];
    case "Phi": {
      const p = instr as { incomings: Array<{ src: number }> };
      return p.incomings.map(x => x.src);
    }
    case "TailCall":
      return [...(instr as { args: number[] }).args];
    default:
      return [];
  }
}

/** Compute the set of registers that are read by ANY instruction in the func. */
function usedRegs(func: IrFunc): Set<number> {
  const used = new Set<number>();
  for (const block of func.blocks) {
    for (const instr of block.instrs) {
      for (const r of srcsOf(instr)) used.add(r);
    }
  }
  return used;
}

//----------------------------------------------------------------------------

/** Run one DCE iteration on a function. Returns true if anything changed. */
function dceFunc(func: IrFunc): boolean {
  let changed = false;

  // Phase 1: drop unreachable blocks. We rebuild the blocks list keeping
  // order so block IDs remain stable.
  const reach = reachableBlocks(func);
  const keptBlocks: IrBlock[] = [];
  for (const b of func.blocks) {
    if (reach.has(b.id)) {
      keptBlocks.push(b);
    } else {
      changed = true;
    }
  }
  func.blocks = keptBlocks;

  // Phase 2: drop dead instructions. A pure, dest-bearing instruction whose
  // dest is never read can go. We recompute usedRegs after every removal so
  // cascading dead instructions are cleaned up within one iteration; we still
  // iterate the pass to fixpoint at the top level to be safe.
  const used = usedRegs(func);
  for (const block of func.blocks) {
    const kept: IrOp[] = [];
    for (const instr of block.instrs) {
      if (hasDest(instr) && !hasSideEffects(instr)) {
        const dest = (instr as { dest: number }).dest;
        if (!used.has(dest)) {
          changed = true;
          continue;
        }
      }
      kept.push(instr);
    }
    block.instrs = kept;
  }

  return changed;
}

//----------------------------------------------------------------------------

/** The DCE pass. Pure: clones input, mutates only the clone. */
export function dce(prog: IrProgram): IrProgram {
  const result = cloneIr(prog);
  let changed = true;
  let iters = 0;
  while (changed && iters < 100) {
    changed = false;
    for (const func of result.funcs) {
      if (dceFunc(func)) changed = true;
    }
    iters++;
  }
  return result;
}
