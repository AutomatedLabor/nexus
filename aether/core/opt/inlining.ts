/**
 * aether/core/opt/inlining.ts
 * ============================
 * Pass 4: Function inlining.
 *
 * Inlines "small" callees (≤ 3 blocks AND ≤ 10 total instructions) at every
 * direct `Call` site. Recursive functions are never inlined. The pass runs
 * up to 3 iterations so nested inlinees can cascade — the depth cap of 3
 * matches the iteration cap.
 *
 * Inlining strategy
 * -----------------
 * For each call site `Call(fn, args, dest)`:
 *
 *   - Build a substitution map for the callee's parameter registers: each
 *     callee param (after offset) is replaced by the corresponding arg
 *     register from the call site.
 *   - All other callee registers are shifted by `caller.nlocals` to avoid
 *     name collisions.
 *
 * Two inlining shapes
 * -------------------
 * A. Simple single-block callee whose body is straight-line and ends in
 *    `Return(...)`: the entry block's instructions (with the final Return
 *    rewritten as `Move(src, dest)`) are spliced inline at the call site.
 *    No new blocks. The original instructions after the call site continue
 *    to execute.
 *
 * B. Multi-block callee (or single-block with internal control flow):
 *    - The caller block is split at the call site.
 *    - All instructions before the call stay in the caller block.
 *    - The call is replaced with `Br(null, newEntryID)`.
 *    - Every callee block (including the entry) is added to the caller with
 *      a fresh block ID; block references inside the callee are remapped.
 *    - `Return(src)` in the callee becomes `Move(src, dest); Br(null, contID)`
 *      (or just `Br(null, contID)` for void returns).
 *    - The instructions after the call site move into a new continuation
 *      block with id `contID`.
 *    - `TailCall` is preserved (with renamed arg registers); the continuation
 *      becomes unreachable, but DCE will clean it up.
 *
 * After inlining, the caller's `nlocals` is extended by `callee.nlocals` so
 * fresh callee registers don't clash with later inlinees.
 *
 * The pass is pure: it clones the input program and mutates only the clone.
 */
import type { IrProgram, IrFunc, IrBlock, IrOp, IrValue } from "./types";
import { cloneIr, isTerminator } from "./opt";

//----------------------------------------------------------------------------

function countBlocks(f: IrFunc): number {
  return f.blocks.length;
}

function countInstrsInFunc(f: IrFunc): number {
  let n = 0;
  for (const b of f.blocks) n += b.instrs.length;
  return n;
}

/** Does `f` (transitively) call itself? Uses DFS on the call graph. */
function isRecursive(f: IrFunc, allFuncs: Map<string, IrFunc>): boolean {
  const visited = new Set<string>();
  const stack: string[] = [f.name];
  while (stack.length) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const func = allFuncs.get(cur);
    if (!func) continue;
    for (const b of func.blocks) {
      for (const instr of b.instrs) {
        if ((instr as { op?: string }).op === "Call") {
          const callee = (instr as { fn: string }).fn;
          if (callee === f.name) return true;
          if (!visited.has(callee)) stack.push(callee);
        }
      }
    }
  }
  return false;
}

//----------------------------------------------------------------------------

interface InlineCtx {
  /** Offset added to every callee register that isn't a substituted param. */
  offset: number;
  /** Substitution map: callee param reg + offset → caller arg reg. */
  sub: Map<number, number>;
  /** Block id remap: callee block id → new block id in caller. */
  blockMap: Map<number, number>;
  /** Destination register for the call result (where Returns write to). */
  destReg: number;
  /** Continuation block id (where Returns jump to). */
  contBlockId: number;
  /** Set true if this is case A (inline inline, no continuation). */
  inlineInline: boolean;
}

function remapReg(r: number, ctx: InlineCtx): number {
  const sub = ctx.sub.get(r + ctx.offset);
  if (sub !== undefined) return sub;
  return r + ctx.offset;
}

function remapBlock(id: number, ctx: InlineCtx): number {
  const m = ctx.blockMap.get(id);
  return m === undefined ? id : m;
}

/**
 * Rewrite a single callee instruction under the inlining context. Returns
 * an array of replacement instructions (usually 1; `Return` expands to a
 * `Move` + `Br` pair, or nothing + Br for void returns). `TailCall` returns
 * itself (with renamed args).
 */
function remapInstr(instr: IrOp, ctx: InlineCtx): IrOp[] {
  const op = (instr as { op?: string }).op;
  switch (op) {
    case "Const":
      return [{ op: "Const", value: (instr as { value: IrValue }).value, dest: (instr as { dest: number }).dest + ctx.offset }];
    case "Move":
      return [{ op: "Move", src: remapReg((instr as { src: number }).src, ctx), dest: (instr as { dest: number }).dest + ctx.offset }];
    case "Bin": {
      const b = instr as { kind: string; src1: number; src2: number; dest: number };
      return [{ op: "Bin", kind: b.kind as any, src1: remapReg(b.src1, ctx), src2: remapReg(b.src2, ctx), dest: b.dest + ctx.offset }];
    }
    case "Un": {
      const u = instr as { kind: string; src: number; dest: number };
      return [{ op: "Un", kind: u.kind as any, src: remapReg(u.src, ctx), dest: u.dest + ctx.offset }];
    }
    case "Call": {
      const c = instr as { fn: string; args: number[]; dest: number };
      return [{ op: "Call", fn: c.fn, args: c.args.map(a => remapReg(a, ctx)), dest: c.dest + ctx.offset }];
    }
    case "CallBuiltin": {
      const c = instr as { fn: string; args: number[]; dest: number };
      return [{ op: "CallBuiltin", fn: c.fn, args: c.args.map(a => remapReg(a, ctx)), dest: c.dest + ctx.offset }];
    }
    case "Br": {
      const b = instr as { cond: number | null; then: number; else: number | null };
      return [{
        op: "Br",
        cond: b.cond === null ? null : remapReg(b.cond, ctx),
        then: remapBlock(b.then, ctx),
        else: b.else === null ? null : remapBlock(b.else, ctx),
      }];
    }
    case "Return": {
      const r = instr as { src: number | null };
      if (ctx.inlineInline) {
        // Case A: Return becomes a single Move into the call's dest.
        if (r.src === null) return []; // void return
        return [{ op: "Move", src: remapReg(r.src, ctx), dest: ctx.destReg }];
      }
      // Case B: Return becomes Move + Jmp to continuation.
      const out: IrOp[] = [];
      if (r.src !== null) {
        out.push({ op: "Move", src: remapReg(r.src, ctx), dest: ctx.destReg });
      }
      out.push({ op: "Br", cond: null, then: ctx.contBlockId, else: null });
      return out;
    }
    case "TailCall": {
      const t = instr as { fn: string; args: number[] };
      return [{ op: "TailCall", fn: t.fn, args: t.args.map(a => remapReg(a, ctx)) }];
    }
    case "LoadField": {
      const l = instr as { src: number; field: string; dest: number };
      return [{ op: "LoadField", src: remapReg(l.src, ctx), field: l.field, dest: l.dest + ctx.offset }];
    }
    case "StoreField": {
      const s = instr as { dest: number; field: string; src: number };
      return [{ op: "StoreField", dest: s.dest + ctx.offset, field: s.field, src: remapReg(s.src, ctx) }];
    }
    case "AllocStruct": {
      const a = instr as { structName: string; fields: Record<string, number>; dest: number };
      const newFields: Record<string, number> = {};
      for (const [k, v] of Object.entries(a.fields)) newFields[k] = remapReg(v, ctx);
      return [{ op: "AllocStruct", structName: a.structName, fields: newFields, dest: a.dest + ctx.offset }];
    }
    case "AllocVariant": {
      const a = instr as { enumName: string; variant: string; args: number[]; dest: number };
      return [{ op: "AllocVariant", enumName: a.enumName, variant: a.variant, args: a.args.map(x => remapReg(x, ctx)), dest: a.dest + ctx.offset }];
    }
    case "AllocArray": {
      const a = instr as { args: number[]; dest: number };
      return [{ op: "AllocArray", args: a.args.map(x => remapReg(x, ctx)), dest: a.dest + ctx.offset }];
    }
    case "AllocMap": {
      const a = instr as { pairs: Array<[number, number]>; dest: number };
      return [{ op: "AllocMap", pairs: a.pairs.map(([k, v]) => [remapReg(k, ctx), remapReg(v, ctx)] as [number, number]), dest: a.dest + ctx.offset }];
    }
    case "IndexGet": {
      const g = instr as { src: number; index: number; dest: number };
      return [{ op: "IndexGet", src: remapReg(g.src, ctx), index: remapReg(g.index, ctx), dest: g.dest + ctx.offset }];
    }
    case "IndexSet": {
      const s = instr as { src: number; index: number; value: number };
      return [{ op: "IndexSet", src: remapReg(s.src, ctx), index: remapReg(s.index, ctx), value: remapReg(s.value, ctx) }];
    }
    case "Match": {
      const m = instr as { src: number; targets: Array<{ test: number; target: number }>; default: number };
      return [{
        op: "Match",
        src: remapReg(m.src, ctx),
        targets: m.targets.map(t => ({ test: remapReg(t.test, ctx), target: remapBlock(t.target, ctx) })),
        default: remapBlock(m.default, ctx),
      }];
    }
    case "Len": {
      const l = instr as { src: number; dest: number };
      return [{ op: "Len", src: remapReg(l.src, ctx), dest: l.dest + ctx.offset }];
    }
    case "Phi": {
      const p = instr as { incomings: Array<{ from: number; src: number }>; dest: number };
      return [{
        op: "Phi",
        incomings: p.incomings.map(x => ({ from: remapBlock(x.from, ctx), src: remapReg(x.src, ctx) })),
        dest: p.dest + ctx.offset,
      }];
    }
    default:
      return [instr];
  }
}

//----------------------------------------------------------------------------

/** Highest block id in the function. */
function maxBlockId(f: IrFunc): number {
  let m = -1;
  for (const b of f.blocks) if (b.id > m) m = b.id;
  return m;
}

/** Decide whether the callee can use the simple inline-inline path. */
function canInlineInline(callee: IrFunc): boolean {
  if (callee.blocks.length !== 1) return false;
  const entry = callee.blocks[0];
  if (entry.id !== callee.entry) return false;
  const instrs = entry.instrs;
  if (instrs.length === 0) return false;
  const last = instrs[instrs.length - 1];
  if ((last as { op?: string }).op !== "Return") return false;
  // No internal control flow before the final Return.
  for (let i = 0; i < instrs.length - 1; i++) {
    if (isTerminator(instrs[i])) return false;
  }
  // The entry block must not reference its own id (self-loop).
  for (const instr of instrs) {
    const op = (instr as { op?: string }).op;
    if (op === "Br") {
      const b = instr as { then: number; else: number | null };
      if (b.then === entry.id || b.else === entry.id) return false;
    }
    if (op === "Match") {
      const m = instr as { targets: Array<{ target: number }>; default: number };
      if (m.default === entry.id || m.targets.some(t => t.target === entry.id)) return false;
    }
  }
  return true;
}

//----------------------------------------------------------------------------

/**
 * Inline a single call site. Mutates `caller.blocks` (rewrites the caller
 * block in place and appends new blocks). Caller's `nlocals` is extended by
 * `callee.nlocals` after this returns.
 *
 * Returns true if inlining happened, false if anything looked wrong.
 */
function inlineCallSite(
  caller: IrFunc,
  callerBlock: IrBlock,
  callIdx: number,
  callee: IrFunc,
  call: { fn: string; args: number[]; dest: number },
): boolean {
  // Defensive: args/params length should match. If not, bail.
  if (call.args.length !== callee.params.length) return false;

  const offset = caller.nlocals;
  const sub = new Map<number, number>();
  for (let i = 0; i < callee.params.length; i++) {
    sub.set(callee.params[i] + offset, call.args[i]);
  }

  const before = callerBlock.instrs.slice(0, callIdx);
  const after = callerBlock.instrs.slice(callIdx + 1);

  const simple = canInlineInline(callee);

  if (simple) {
    // Case A: inline inline. No new blocks, no continuation.
    const ctx: InlineCtx = {
      offset,
      sub,
      blockMap: new Map(),
      destReg: call.dest,
      contBlockId: -1,
      inlineInline: true,
    };
    const entry = callee.blocks[0];
    const inlinedInstrs: IrOp[] = [];
    for (const instr of entry.instrs) {
      inlinedInstrs.push(...remapInstr(instr, ctx));
    }
    callerBlock.instrs = [...before, ...inlinedInstrs, ...after];
    caller.nlocals += callee.nlocals;
    return true;
  }

  // Case B: split caller block.
  let nextBlockId = maxBlockId(caller) + 1;
  const blockMap = new Map<number, number>();
  for (const cb of callee.blocks) {
    blockMap.set(cb.id, nextBlockId++);
  }
  const contBlockId = nextBlockId++;

  const ctx: InlineCtx = { offset, sub, blockMap, destReg: call.dest, contBlockId, inlineInline: false };

  // Build new callee blocks (renamed).
  const newBlocks: IrBlock[] = [];
  for (const cb of callee.blocks) {
    const newInstrs: IrOp[] = [];
    for (const instr of cb.instrs) {
      newInstrs.push(...remapInstr(instr, ctx));
    }
    newBlocks.push({ id: blockMap.get(cb.id)!, instrs: newInstrs });
  }

  // Modify caller block: before + Br to new entry.
  const newEntryId = blockMap.get(callee.entry)!;
  callerBlock.instrs = [...before, { op: "Br", cond: null, then: newEntryId, else: null }];

  // Continuation block: original "after" instructions.
  newBlocks.push({ id: contBlockId, instrs: after });

  caller.blocks.push(...newBlocks);
  caller.nlocals += callee.nlocals;
  return true;
}

//----------------------------------------------------------------------------

/** One pass: inline every inlineable call site in every function. */
function inlineOnce(prog: IrProgram): boolean {
  let changed = false;

  const funcsByName = new Map<string, IrFunc>();
  for (const f of prog.funcs) funcsByName.set(f.name, f);

  // Identify inlineable functions.
  const inlineable = new Set<string>();
  for (const f of prog.funcs) {
    if (countBlocks(f) <= 3 && countInstrsInFunc(f) <= 10 && !isRecursive(f, funcsByName)) {
      inlineable.add(f.name);
    }
  }

  // For each function, walk its current blocks and inline call sites.
  for (const caller of prog.funcs) {
    // Snapshot blocks; new blocks (added by inlining) are processed in
    // the next iteration so we don't blow the stack on deep chains.
    const snapshot = [...caller.blocks];
    for (const block of snapshot) {
      // Find the first inlineable call in this block. Inline one at a time
      // so block-internal positions stay consistent within a single pass.
      for (let i = 0; i < block.instrs.length; i++) {
        const instr = block.instrs[i];
        if ((instr as { op?: string }).op !== "Call") continue;
        const call = instr as { fn: string; args: number[]; dest: number };
        if (!inlineable.has(call.fn)) continue;
        const callee = funcsByName.get(call.fn);
        if (!callee) continue;
        // Don't inline self into self.
        if (callee.name === caller.name) continue;
        if (inlineCallSite(caller, block, i, callee, call)) {
          changed = true;
          break; // re-scan the block from start since its instrs changed
        }
      }
    }
  }

  return changed;
}

//----------------------------------------------------------------------------

/** The inlining pass. Up to 3 iterations (depth cap 3). Pure: clones input. */
export function inlining(prog: IrProgram): IrProgram {
  const result = cloneIr(prog);
  for (let iter = 0; iter < 3; iter++) {
    if (!inlineOnce(result)) break;
  }
  return result;
}
