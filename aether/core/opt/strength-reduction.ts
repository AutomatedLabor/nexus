/**
 * aether/core/opt/strength-reduction.ts
 * ====================================
 * Pass 7: Strength reduction.
 *
 * Rewrites expensive arithmetic with cheaper equivalents when one operand is
 * a compile-time constant. The rewrite opportunities come from the task
 * spec; we also fold in a few obvious cousins that fall out for free:
 *
 *   Mul(x, Const(2^k))      → Shl(x, Const(k))
 *   Mul(x, Const(1))        → Move(x)
 *   Add(x, Const(0))        → Move(x)
 *   Sub(x, Const(0))        → Move(x)
 *   Div(x, Const(1))       → Move(x)
 *   Mod(x, Const(1))       → Const(0)
 *   Shl(x, Const(0))       → Move(x)
 *   Shr(x, Const(0))       → Move(x)
 *   BitOr(x, Const(0))     → Move(x)
 *   BitAnd(x, Const(0))    → Const(0)
 *   BitXor(x, Const(0))    → Move(x)
 *
 * Commutative operators are matched on either side. For `Mul` by a power of
 * two, we mint a fresh `Const(k)` register holding the shift amount and
 * rewrite the multiply as a shift. The new const costs one extra instruction
 * but shifts are typically cheaper than multiplies on real hardware.
 *
 * `Const` operand identification is function-wide (SSA assumption: each
 * register assigned once). Iterated to fixpoint so cascading rewrites
 * (e.g. after constant folding produces fresh consts) are picked up.
 *
 * The pass is pure: clones input, mutates only the clone.
 */
import type { IrProgram, IrFunc, IrBlock, IrOp, BinKind, IrValue } from "./types";
import { cloneIr } from "./opt";

//----------------------------------------------------------------------------

function isPowerOf2(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

function log2(n: number): number {
  return Math.floor(Math.log2(n));
}

//----------------------------------------------------------------------------

/**
 * Try to rewrite a binary instruction. Returns an array of replacement
 * instructions (usually 1; the Shl-of-power-of-2 case emits 2 — a fresh
 * `Const` then the `Shl`). Returns `null` if no rewrite applies.
 */
function tryReduce(
  instr: IrOp,
  consts: Map<number, IrValue>,
  func: IrFunc,
): IrOp[] | null {
  if ((instr as { op?: string }).op !== "Bin") return null;
  const b = instr as { kind: BinKind; src1: number; src2: number; dest: number };

  const v1 = consts.get(b.src1);
  const v2 = consts.get(b.src2);

  // Returns (otherReg, constVal, side) where one operand is a const.
  // `side` tells whether the constant is on the right (default) or left.
  type Pick = { otherReg: number; constVal: IrValue; side: "left" | "right" } | null;
  const pickConst = (): Pick => {
    if (v2 !== undefined) return { otherReg: b.src1, constVal: v2, side: "right" };
    if (v1 !== undefined) return { otherReg: b.src2, constVal: v1, side: "left" };
    return null;
  };

  const pick = pickConst();
  if (pick === null) return null;

  // For non-commutative ops (Sub, Div, Mod, Shl, Shr) we only fold when
  // the *right* operand is the constant. For commutative ops we accept
  // either side.
  const isCommutative = (k: BinKind): boolean =>
    k === "Add" || k === "Mul" || k === "Eq" || k === "Neq" ||
    k === "BitAnd" || k === "BitOr" || k === "BitXor" ||
    k === "And" || k === "Or";

  if (!isCommutative(b.kind) && pick.side !== "right") return null;

  const constVal: IrValue = pick.constVal;
  const otherReg: number = pick.otherReg;

  // For numeric-only rewrites below, bail if the const isn't a number.
  const isNumericConst = (v: IrValue): v is number => typeof v === "number";

  switch (b.kind) {
    case "Mul": {
      if (!isNumericConst(constVal)) return null;
      if (constVal === 1) return [{ op: "Move", src: otherReg, dest: b.dest }];
      if (constVal === 0) return [{ op: "Const", value: 0, dest: b.dest }];
      if (isPowerOf2(constVal)) {
        const shiftReg = func.nlocals++;
        return [
          { op: "Const", value: log2(constVal), dest: shiftReg },
          { op: "Bin", kind: "Shl", src1: otherReg, src2: shiftReg, dest: b.dest },
        ];
      }
      return null;
    }
    case "Add":
      if (!isNumericConst(constVal)) return null;
      if (constVal === 0) return [{ op: "Move", src: otherReg, dest: b.dest }];
      return null;
    case "Sub":
      // Non-commutative: only v2 (right side) applies. Already filtered above.
      if (!isNumericConst(constVal)) return null;
      if (constVal === 0) return [{ op: "Move", src: b.src1, dest: b.dest }];
      return null;
    case "Div":
      if (!isNumericConst(constVal)) return null;
      if (constVal === 1) return [{ op: "Move", src: b.src1, dest: b.dest }];
      if (isPowerOf2(constVal)) {
        const shiftReg = func.nlocals++;
        return [
          { op: "Const", value: log2(constVal), dest: shiftReg },
          { op: "Bin", kind: "Shr", src1: b.src1, src2: shiftReg, dest: b.dest },
        ];
      }
      return null;
    case "Mod":
      if (!isNumericConst(constVal)) return null;
      if (constVal === 1) return [{ op: "Const", value: 0, dest: b.dest }];
      return null;
    case "Shl":
    case "Shr":
      if (!isNumericConst(constVal)) return null;
      if (constVal === 0) return [{ op: "Move", src: b.src1, dest: b.dest }];
      return null;
    case "BitOr":
      if (!isNumericConst(constVal)) return null;
      if (constVal === 0) return [{ op: "Move", src: otherReg, dest: b.dest }];
      return null;
    case "BitAnd":
      if (!isNumericConst(constVal)) return null;
      if (constVal === 0) return [{ op: "Const", value: 0, dest: b.dest }];
      return null;
    case "BitXor":
      if (!isNumericConst(constVal)) return null;
      if (constVal === 0) return [{ op: "Move", src: otherReg, dest: b.dest }];
      return null;
    case "Or":
      if (typeof constVal === "boolean") {
        if (constVal === false) return [{ op: "Move", src: otherReg, dest: b.dest }];
        return [{ op: "Const", value: true, dest: b.dest }];
      }
      return null;
    case "And":
      if (typeof constVal === "boolean") {
        if (constVal === true) return [{ op: "Move", src: otherReg, dest: b.dest }];
        return [{ op: "Const", value: false, dest: b.dest }];
      }
      return null;
    default:
      return null;
  }
}

//----------------------------------------------------------------------------

/** Run strength reduction on a single block (function-level const map). */
function reduceBlock(block: IrBlock, consts: Map<number, IrValue>, func: IrFunc): boolean {
  let changed = false;
  const out: IrOp[] = [];
  for (const instr of block.instrs) {
    const reduced = tryReduce(instr, consts, func);
    if (reduced) {
      out.push(...reduced);
      changed = true;
    } else {
      out.push(instr);
    }
  }
  if (changed) block.instrs = out;
  return changed;
}

/** Run strength reduction on a function. Returns true if anything changed. */
function reduceFunc(func: IrFunc): boolean {
  let changed = false;
  // Function-level const map (SSA assumption).
  const consts = new Map<number, IrValue>();
  for (const block of func.blocks) {
    for (const instr of block.instrs) {
      if ((instr as { op?: string }).op === "Const") {
        const c = instr as { value: IrValue; dest: number };
        consts.set(c.dest, c.value);
      }
    }
  }
  for (const block of func.blocks) {
    if (reduceBlock(block, consts, func)) changed = true;
  }
  return changed;
}

//----------------------------------------------------------------------------

/** The strength-reduction pass. Iterated to fixpoint. Pure: clones input. */
export function strengthReduction(prog: IrProgram): IrProgram {
  const result = cloneIr(prog);
  let changed = true;
  let iters = 0;
  while (changed && iters < 100) {
    changed = false;
    for (const func of result.funcs) {
      if (reduceFunc(func)) changed = true;
    }
    iters++;
  }
  return result;
}
