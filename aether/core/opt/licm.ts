/**
 * aether/core/opt/licm.ts
 * =======================
 * Pass 6: Loop-Invariant Code Motion.
 *
 * Identifies natural loops in each function's control-flow graph and hoists
 * invariant computations out of the loop into a fresh preheader block.
 *
 * Loop detection (conservative, no full dominator analysis)
 * ---------------------------------------------------------
 * A back-edge is any `Br` whose target block id is *strictly smaller* than
 * the current block id (i.e., the branch jumps to an earlier block). The
 * target is the loop header `H`. The loop body is `H` plus all blocks that
 * can reach the back-edge source `B` via predecessor edges, without going
 * through `H` (reverse-BFS from `B`, stopping at `H`). Multiple back-edges
 * to the same `H` are coalesced into a single loop.
 *
 * Invariant detection
 * -------------------
 * An instruction is loop-invariant if:
 *   - it is pure (no side effects, see `opt.ts:hasSideEffects`),
 *   - it has a destination register, and
 *   - all of its source operands are either:
 *       * `Const` literals (function-wide SSA assumption), or
 *       * registers defined outside the loop body, or
 *       * registers defined by an instruction already classified invariant
 *         (transitive, iterated to fixpoint).
 *
 * Hoisting
 * --------
 * For each loop with at least one invariant instruction, we create a new
 * preheader block with:
 *   - the invariant instructions, in dependency order, followed by
 *   - `Br(null, H)` to fall into the loop header.
 *
 * Every predecessor of `H` that is NOT in the loop body has its `Br`/`Match`
 * target rewritten from `H` to the preheader. Back-edges (predecessors inside
 * the body) keep targeting `H` directly, preserving the loop.
 *
 * Iteration policy
 * ----------------
 * LICM runs one pass per call. The pass pipeline can call `licm` again to
 * pick up newly-revealed invariants (a hoisted instruction can make its
 * users invariant in turn). We do not iterate inside a single call: doing
 * so would risk detecting the freshly-created preheader's `Br` to `H` as a
 * new "back-edge" (its block id is greater than `H`'s). The strict
 * `processedHeaders` set also prevents processing the same header twice in
 * one call when multiple back-edges share a header.
 *
 * The pass is pure: clones input, mutates only the clone.
 */
import type { IrProgram, IrFunc, IrBlock, IrOp } from "./types";
import { cloneIr, hasDest, hasSideEffects } from "./opt";
import { srcsOf } from "./dce";

//----------------------------------------------------------------------------

/** Build a predecessor map: block id → set of predecessor block ids. */
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
        ensure(b.then).add(block.id);
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

/**
 * Compute the loop body for a set of back-edge sources all targeting `headerId`.
 * Body = {headerId} ∪ reverse-BFS from each source through predecessors,
 * stopping at (not expanding) the header.
 */
function computeLoopBody(
  func: IrFunc,
  backEdgeSrcs: number[],
  headerId: number,
  preds: Map<number, Set<number>>,
): Set<number> {
  const body = new Set<number>([headerId]);
  for (const src of backEdgeSrcs) {
    if (!body.has(src)) body.add(src);
  }
  const stack: number[] = [...backEdgeSrcs];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === headerId) continue;
    const ps = preds.get(id);
    if (!ps) continue;
    for (const p of ps) {
      if (!body.has(p)) {
        body.add(p);
        stack.push(p);
      }
    }
  }
  return body;
}

//----------------------------------------------------------------------------

interface Invariant {
  blockId: number;
  idx: number;
  instr: IrOp;
}

/**
 * Find all loop-invariant instructions in the body, in dependency order.
 * Returns the list of (blockId, idx, instr) tuples to hoist.
 */
function findInvariants(func: IrFunc, body: Set<number>): Invariant[] {
  const blockById = new Map<number, IrBlock>();
  for (const b of func.blocks) blockById.set(b.id, b);

  // Defined-in-loop: every dest register of an instruction in a body block.
  const definedInLoop = new Set<number>();
  for (const id of body) {
    const block = blockById.get(id);
    if (!block) continue;
    for (const instr of block.instrs) {
      if (hasDest(instr)) definedInLoop.add((instr as { dest: number }).dest);
    }
  }

  // Function-wide const map (SSA assumption: consts defined once).
  const consts = new Set<number>();
  for (const b of func.blocks) {
    for (const instr of b.instrs) {
      if ((instr as { op?: string }).op === "Const") {
        consts.add((instr as { dest: number }).dest);
      }
    }
  }

  const invariantDests = new Set<number>();
  const ordered: Invariant[] = [];

  let changed = true;
  let safety = 0;
  while (changed && safety < 100) {
    changed = false;
    for (const id of body) {
      const block = blockById.get(id);
      if (!block) continue;
      for (let i = 0; i < block.instrs.length; i++) {
        const instr = block.instrs[i];
        if (!hasDest(instr) || hasSideEffects(instr)) continue;
        const dest = (instr as { dest: number }).dest;
        if (invariantDests.has(dest)) continue;
        const srcs = srcsOf(instr);
        const allInvariant = srcs.every(s => {
          if (consts.has(s)) return true;
          if (definedInLoop.has(s)) return invariantDests.has(s);
          return true; // defined outside the loop body
        });
        if (allInvariant) {
          invariantDests.add(dest);
          ordered.push({ blockId: id, idx: i, instr });
          changed = true;
        }
      }
    }
    safety++;
  }

  return ordered;
}

//----------------------------------------------------------------------------

/** Rewrite all Br/Match targets from `from` to `to` in a block. */
function redirectTargets(block: IrBlock, from: number, to: number): void {
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

/** Allocate the next block id in the function (max + 1). */
function nextBlockId(func: IrFunc): number {
  let m = -1;
  for (const b of func.blocks) if (b.id > m) m = b.id;
  return m + 1;
}

//----------------------------------------------------------------------------

/** Build a successor map: block id → set of successor block ids. */
function buildSuccMap(func: IrFunc): Map<number, Set<number>> {
  const succ = new Map<number, Set<number>>();
  const ensure = (id: number): Set<number> => {
    let s = succ.get(id);
    if (!s) {
      s = new Set();
      succ.set(id, s);
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
  return succ;
}

/**
 * A back-edge is an edge S → T where T can be reached from S via forward CFG
 * edges (excluding the trivial S == T self-loop case is NOT excluded —
 * self-loops count). This is the proper natural-loop definition without
 * explicit dominator analysis.
 *
 * For our purposes we use it to distinguish genuine loop back-edges from
 * "forward jumps to an earlier block" — e.g. a freshly-created preheader's
 * `Br` to the loop header is NOT a back-edge (the header doesn't reach the
 * preheader).
 */
function isBackEdge(
  func: IrFunc,
  src: number,
  dst: number,
  succ: Map<number, Set<number>>,
): boolean {
  // Can `dst` reach `src` via forward edges (non-empty path)?
  if (src === dst) return true; // self-loop
  const visited = new Set<number>();
  const stack: number[] = [];
  const init = succ.get(dst);
  if (init) for (const s of init) stack.push(s);
  while (stack.length) {
    const id = stack.pop()!;
    if (id === src) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    const s = succ.get(id);
    if (s) for (const n of s) stack.push(n);
  }
  return false;
}

/** Run LICM on a single function. Returns true if anything was hoisted. */
function licmFunc(func: IrFunc): boolean {
  // Detect back-edges using proper reachability (handles self-loops and
  // preheader's Br-to-header correctly).
  const succ = buildSuccMap(func);
  const backEdges: Array<{ src: number; dst: number }> = [];
  for (const block of func.blocks) {
    for (const instr of block.instrs) {
      const op = (instr as { op?: string }).op;
      if (op === "Br") {
        const b = instr as { then: number; else: number | null };
        if (b.then !== null && isBackEdge(func, block.id, b.then, succ)) {
          backEdges.push({ src: block.id, dst: b.then });
        }
        if (b.else !== null && isBackEdge(func, block.id, b.else, succ)) {
          backEdges.push({ src: block.id, dst: b.else });
        }
      }
    }
  }

  if (backEdges.length === 0) return false;

  const preds = buildPredMap(func);

  // Group back-edges by header.
  const byHeader = new Map<number, number[]>();
  for (const be of backEdges) {
    const arr = byHeader.get(be.dst) ?? [];
    arr.push(be.src);
    byHeader.set(be.dst, arr);
  }

  let changed = false;
  const processedHeaders = new Set<number>();

  // Process headers in ascending id order (outer loops first).
  const headerIds = [...byHeader.keys()].sort((a, b) => a - b);
  for (const headerId of headerIds) {
    if (processedHeaders.has(headerId)) continue;
    processedHeaders.add(headerId);

    const srcs = byHeader.get(headerId)!;
    const body = computeLoopBody(func, srcs, headerId, preds);
    if (body.size <= 1) continue;

    const invariants = findInvariants(func, body);
    if (invariants.length === 0) continue;

    // Remove the invariant instructions from their original blocks. Group
    // by block and remove in descending index order so indices stay valid.
    const byBlock = new Map<number, Invariant[]>();
    for (const inv of invariants) {
      const arr = byBlock.get(inv.blockId) ?? [];
      arr.push(inv);
      byBlock.set(inv.blockId, arr);
    }
    for (const [blockId, items] of byBlock) {
      const block = func.blocks.find(b => b.id === blockId);
      if (!block) continue;
      items.sort((a, b) => b.idx - a.idx);
      for (const item of items) block.instrs.splice(item.idx, 1);
    }

    // Create the preheader.
    const preId = nextBlockId(func);
    const preInstrs: IrOp[] = invariants.map(inv => inv.instr);
    preInstrs.push({ op: "Br", cond: null, then: headerId, else: null });
    const preheader: IrBlock = { id: preId, instrs: preInstrs };

    // Redirect non-loop predecessors of the header to the preheader.
    const predsOfHeader = preds.get(headerId) ?? new Set<number>();
    for (const predId of predsOfHeader) {
      if (body.has(predId)) continue; // back-edge, keep
      const predBlock = func.blocks.find(b => b.id === predId);
      if (!predBlock) continue;
      redirectTargets(predBlock, headerId, preId);
    }

    // If the function entry is the header, update the entry to the preheader
    // (the preheader becomes the new loop entry). Otherwise insert the
    // preheader just before the header for readability.
    if (func.entry === headerId) {
      func.entry = preId;
    }
    const headerIdx = func.blocks.findIndex(b => b.id === headerId);
    if (headerIdx >= 0) func.blocks.splice(headerIdx, 0, preheader);
    else func.blocks.push(preheader);

    changed = true;
  }

  return changed;
}

//----------------------------------------------------------------------------

/** The LICM pass. Pure: clones input, mutates only the clone. */
export function licm(prog: IrProgram): IrProgram {
  const result = cloneIr(prog);
  for (const func of result.funcs) {
    licmFunc(func);
  }
  return result;
}
