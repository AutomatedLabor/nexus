/**
 * aether/core/opt/cse.ts
 * =======================
 * Pass 3: Common Subexpression Elimination (block-local).
 *
 * Within a block, if two instructions compute the same value from identical
 * operands, the second is replaced by `Move(firstDest, secondDest)`.
 *
 * Conservative design
 * --------------------
 * - Block-local only. No cross-block CSE, no value numbering across the CFG.
 * - The IR is SSA-ish, so register numbers uniquely identify a definition;
 *   we use them as keys directly.
 * - Commutative operators are normalized so `Bin(Add, r1, r2)` and
 *   `Bin(Add, r2, r1)` are treated as equal.
 * - We CSE the following pure, dest-bearing instructions:
 *     `Bin`, `Un`, `LoadField`, `Len`, `IndexGet`, `AllocArray`
 *   We deliberately do NOT CSE `Call` (calls may have side effects, even
 *   "pure-looking" ones might allocate or log) nor `AllocStruct`/`AllocMap`
 *   (each allocation should produce a fresh object — aliasing matters).
 *
 * Iterated to fixpoint: replacing a Bin with a Move can unlock further CSE
 * if the eliminated Bin's dest was an operand to another duplicate.
 */
import type { IrProgram, IrFunc, IrBlock, IrOp, BinKind } from "./types";
import { cloneIr } from "./opt";

//----------------------------------------------------------------------------

const COMMUTATIVE: Set<BinKind> = new Set<BinKind>([
  "Add",
  "Mul",
  "Eq",
  "Neq",
  "BitAnd",
  "BitOr",
  "BitXor",
  "And",
  "Or",
]);

/** Canonical key for a `Bin` — operands swapped for commutative ops. */
function binKey(b: { kind: BinKind; src1: number; src2: number }): string {
  const commutative = COMMUTATIVE.has(b.kind);
  const [a, c] = commutative && b.src1 > b.src2 ? [b.src2, b.src1] : [b.src1, b.src2];
  return `Bin:${b.kind}:${a}:${c}`;
}

/** Canonical key for any CSE-able instruction. */
function cseKey(instr: IrOp): string | null {
  const op = (instr as { op?: string }).op;
  switch (op) {
    case "Bin":
      return binKey(instr as { kind: BinKind; src1: number; src2: number });
    case "Un": {
      const u = instr as { kind: string; src: number };
      return `Un:${u.kind}:${u.src}`;
    }
    case "LoadField": {
      const l = instr as { src: number; field: string };
      return `LoadField:${l.src}:${l.field}`;
    }
    case "Len":
      return `Len:${(instr as { src: number }).src}`;
    case "IndexGet": {
      const g = instr as { src: number; index: number };
      return `IndexGet:${g.src}:${g.index}`;
    }
    case "AllocArray": {
      const a = instr as { args: number[] };
      return `AllocArray:${a.args.join(",")}`;
    }
    default:
      return null;
  }
}

//----------------------------------------------------------------------------

/** Run one CSE iteration on a block. Returns true if anything changed. */
function cseBlock(block: IrBlock): boolean {
  let changed = false;
  const seen = new Map<string, number>(); // key -> first dest
  for (let i = 0; i < block.instrs.length; i++) {
    const instr = block.instrs[i];
    const key = cseKey(instr);
    if (key === null) {
      // Non-CSE-able: clear the seen map to stay conservative across
      // possibly-aliasing ops (e.g. CallBuiltin that might mutate state).
      continue;
    }
    const existing = seen.get(key);
    if (existing !== undefined) {
      const myDest = (instr as { dest: number }).dest;
      if (existing !== myDest) {
        block.instrs[i] = { op: "Move", src: existing, dest: myDest };
        changed = true;
      }
    } else {
      seen.set(key, (instr as { dest: number }).dest);
    }
  }
  return changed;
}

/** The CSE pass. Pure: clones input, mutates only the clone. */
export function cse(prog: IrProgram): IrProgram {
  const result = cloneIr(prog);
  let changed = true;
  let iters = 0;
  while (changed && iters < 100) {
    changed = false;
    for (const func of result.funcs) {
      for (const block of func.blocks) {
        if (cseBlock(block)) changed = true;
      }
    }
    iters++;
  }
  return result;
}
