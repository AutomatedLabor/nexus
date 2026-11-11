/**
 * aether/core/opt/branch-simplification.ts
 * ========================================
 * Pass 8: Branch simplification and block merging.
 *
 * Three transformations, iterated to fixpoint:
 *
 *  1. Constant-condition branches. `Br(cond, T, E)` where `cond` is a
 *     register holding a `Const(true)` collapses to `Br(null, T, _)`.
 *     `Const(false)` collapses to `Br(null, E, _)`. The unreachable arm's
 *     target is dropped from the branch, and any blocks that become
 *     unreachable from the entry are removed by the next phase.
 *
 *  2. Unreachable block removal. Re-computes reachable blocks via worklist
 *     BFS from `func.entry` (same logic as `dce.ts`) and drops blocks no
 *     longer reachable. This is what makes (1) actually shrink the program.
 *
 *  3. Singleton-block merging. If block `B` ends in an unconditional
 *     `Br(null, S, _)` AND block `S` has exactly one predecessor (`B`),
 *     then `S`'s instructions are spliced onto the end of `B` (replacing
 *     the Br), and `S` is removed. All references to `S` in the function
 *     are rewritten to `B`. This is the canonical "trivial block merge"
 *     used to clean up after constant branches and after inlining.
 *
 * Iteration policy
 * ----------------
 * The three phases feed each other: (1) can produce unconditional branches
 * that enable (3); (3) can expose a constant-condition branch that enables
 * (1); both can make blocks unreachable for (2). We run a fixpoint up to
 * 100 iterations.
 *
 * The pass is pure: clones input, mutates only the clone.
 */
import type { IrProgram, IrFunc, IrBlock, IrOp } from "./types";
import { cloneIr } from "./opt";

//----------------------------------------------------------------------------

/** Returns true if `r` is a register defined by `Const(true)`/`Const(false)`
 *  in the function; returns the boolean value, or undefined otherwise. */
function constBoolValue(func: IrFunc, r: number): boolean | undefined {
  for (const block of func.blocks) {
    for (const instr of block.instrs) {
      if ((instr as { op?: string }).op === "Const") {
        const c = instr as { value: unknown; dest: number };
        if (c.dest === r && typeof c.value === "boolean") return c.value;
      }
    }
  }
  return undefined;
}

//----------------------------------------------------------------------------

/** Phase 1: collapse constant-condition branches. Returns true if changed. */
function simplifyConstantBranches(func: IrFunc): boolean {
  let changed = false;
  for (const block of func.blocks) {
    for (let i = 0; i < block.instrs.length; i++) {
      const instr = block.instrs[i];
      if ((instr as { op?: string }).op !== "Br") continue;
      const b = instr as { cond: number | null; then: number; else: number | null };
      if (b.cond === null) continue;
      const v = constBoolValue(func, b.cond);
      if (v === undefined) continue;
      // Rewrite to unconditional branch.
      const target = v ? b.then : b.else;
      block.instrs[i] = {
        op: "Br",
        cond: null,
        then: target === null ? b.then : target,
        else: null,
      };
      changed = true;
    }
  }
  return changed;
}

//----------------------------------------------------------------------------

/** Compute reachable block IDs from `func.entry` via worklist BFS. */
function reachableBlocks(func: IrFunc): Set<number> {
  const reach = new Set<number>();
  const work: number[] = [func.entry];
  reach.add(func.entry);
  while (work.length) {
    const id = work.pop()!;
    const block = func.blocks.find(b => b.id === id);
    if (!block) continue;
    for (const instr of block.instrs) {
      const op = (instr as { op?: string }).op;
      if (op === "Br") {
        const b = instr as { then: number; else: number | null };
        for (const s of [b.then, b.else]) if (s !== null && !reach.has(s)) {
          reach.add(s);
          work.push(s);
        }
      } else if (op === "Match") {
        const m = instr as { targets: Array<{ target: number }>; default: number };
        for (const s of [...m.targets.map(t => t.target), m.default]) {
          if (!reach.has(s)) {
            reach.add(s);
            work.push(s);
          }
        }
      }
    }
  }
  return reach;
}

/** Phase 2: drop unreachable blocks. Returns true if any were removed. */
function removeUnreachableBlocks(func: IrFunc): boolean {
  const reach = reachableBlocks(func);
  const before = func.blocks.length;
  func.blocks = func.blocks.filter(b => reach.has(b.id));
  return func.blocks.length !== before;
}

//----------------------------------------------------------------------------

/** Build predecessor map: block id → set of predecessor ids. */
function buildPredMap(func: IrFunc): Map<number, Set<number>> {
  const preds = new Map<number, Set<number>>();
  const ensure = (id: number): Set<number> => {
    let s = preds.get(id);
    if (!s) {
      s = new Set();
      preds.set(id, s);
    }
    return s;
  };
  for (const block of func.blocks) {
    ensure(block.id);
    for (const instr of block.instrs) {
      const op = (instr as { op?: string }).op;
      if (op === "Br") {
        const b = instr as { then: number; else: number | null };
        if (b.then !== null) ensure(b.then).add(block.id);
        if (b.else !== null) ensure(b.else).add(block.id);
      } else if (op === "Match") {
        const m = instr as { targets: Array<{ target: number }>; default: number };
        for (const t of m.targets) ensure(t.target).add(block.id);
        ensure(m.default).add(block.id);
      }
    }
  }
  return preds;
}

/** Rewrite all Br/Match targets from `from` to `to` in a block. */
function rewriteTargets(block: IrBlock, from: number, to: number): void {
  for (const instr of block.instrs) {
    const op = (instr as { op?: string }).op;
    if (op === "Br") {
      const b = instr as { then: number; else: number | null };
      if (b.then === from) b.then = to;
      if (b.else === from) b.else = to;
    } else if (op === "Match") {
      const m = instr as { targets: Array<{ target: number }>; default: number };
      if (m.default === from) m.default = to;
      for (const t of m.targets) if (t.target === from) t.target = to;
    }
  }
}

/** Phase 3: merge singleton blocks. Returns true if any merged. */
function mergeSingletonBlocks(func: IrFunc): boolean {
  let changed = false;
  let safety = 0;
  // Iterate: each merge can expose a new merge (e.g. chain of singletons).
  do {
    safety++;
    if (safety > 1000) break;
    const preds = buildPredMap(func);
    const blockById = new Map<number, IrBlock>();
    for (const b of func.blocks) blockById.set(b.id, b);

    let mergedThisRound = false;
    for (const b of func.blocks) {
      // B must end in unconditional Br (last instr is Br with cond=null).
      const last = b.instrs[b.instrs.length - 1];
      if (!last) continue;
      if ((last as { op?: string }).op !== "Br") continue;
      const br = last as { cond: number | null; then: number; else: number | null };
      if (br.cond !== null || br.then === null) continue;
      const sId = br.then;
      // Entry blocks cannot be merged into (S is reachable from entry, but
      // we don't want to rewrite `func.entry` here — leave entry alone).
      if (sId === func.entry) continue;
      const sBlock = blockById.get(sId);
      if (!sBlock) continue;
      // S must have exactly one predecessor (which is B).
      const sPreds = preds.get(sId);
      if (!sPreds || sPreds.size !== 1) continue;
      if (!sPreds.has(b.id)) continue;
      // Splice S's instrs onto the end of B, replacing the Br.
      b.instrs = [...b.instrs.slice(0, -1), ...sBlock.instrs];
      // Rewrite every reference to S in the function to B.
      for (const other of func.blocks) {
        if (other.id === sId) continue;
        rewriteTargets(other, sId, b.id);
      }
      // Drop S from the function.
      func.blocks = func.blocks.filter(x => x.id !== sId);
      mergedThisRound = true;
      changed = true;
      break; // restart the scan with the updated CFG
    }
    if (!mergedThisRound) break;
  } while (true);
  return changed;
}

//----------------------------------------------------------------------------

/** Run branch simplification on one function. Returns true if changed. */
function branchSimplifyFunc(func: IrFunc): boolean {
  let changed = false;
  if (simplifyConstantBranches(func)) changed = true;
  if (removeUnreachableBlocks(func)) changed = true;
  if (mergeSingletonBlocks(func)) changed = true;
  return changed;
}

//----------------------------------------------------------------------------

/** The branch-simplification pass. Iterated to fixpoint. Pure: clones input. */
export function branchSimplification(prog: IrProgram): IrProgram {
  const result = cloneIr(prog);
  let changed = true;
  let iters = 0;
  while (changed && iters < 100) {
    changed = false;
    for (const func of result.funcs) {
      if (branchSimplifyFunc(func)) changed = true;
    }
    iters++;
  }
  return result;
}
