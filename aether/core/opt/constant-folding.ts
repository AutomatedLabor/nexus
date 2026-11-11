/**
 * aether/core/opt/constant-folding.ts
 * ===================================
 * Pass 1: Constant folding.
 *
 * Replaces binary and unary operations whose operands are all compile-time
 * constants with a single `Const` instruction. Iterated to fixpoint so that
 * cascades such as `((2 + 3) * 4)` collapse to a single `Const(20)`.
 *
 * Handled operators (all from the task spec):
 *   Binary:  Add, Sub, Mul, Div, Mod, Eq, Neq, Lt, Le, Gt, Ge, And, Or,
 *            BitAnd, BitOr, BitXor, Shl, Shr
 *   Unary:   Neg, Not, BitNot
 *
 * The pass collects every `Const` definition across the function (IR is
 * SSA-ish, so register numbers are unique). It then walks each block and
 * replaces any `Bin` or `Un` whose operands are known constants with a
 * freshly-stamped `Const`. Folding may unlock further folding in the
 * same pass, so we iterate until nothing changes (capped at 100 iterations).
 *
 * Safety
 * ------
 * - Integer division/modulo by zero is left as-is (folding would hide a
 *   runtime error); the IR instruction is preserved.
 * - Operand types must be compatible (e.g. Add requires two numbers; And
 *   requires two booleans); mismatches are left as-is.
 * - No control-flow rewrites — this pass touches only data-flow instrs.
 */
import type { IrProgram, IrFunc, IrBlock, IrOp, BinKind, UnKind, IrValue } from "./types";
import { cloneIr } from "./opt";

/** Pure numeric binary op result; returns `undefined` if either operand
 *  isn't a number (or if the op is forbidden, e.g. div-by-zero). */
function numOp(a: IrValue, b: IrValue, f: (x: number, y: number) => number): IrValue | undefined {
  if (typeof a !== "number" || typeof b !== "number") return undefined;
  return f(a, b);
}

function intOp(a: IrValue, b: IrValue, f: (x: number, y: number) => number): IrValue | undefined {
  if (typeof a !== "number" || typeof b !== "number") return undefined;
  if (!Number.isInteger(a) || !Number.isInteger(b)) return undefined;
  return f(a, b);
}

function numCmp(a: IrValue, b: IrValue, f: (x: number, y: number) => boolean): IrValue | undefined {
  if (typeof a !== "number" || typeof b !== "number") return undefined;
  return f(a, b);
}

function boolOp(a: IrValue, b: IrValue, f: (x: boolean, y: boolean) => boolean): IrValue | undefined {
  if (typeof a !== "boolean" || typeof b !== "boolean") return undefined;
  return f(a, b);
}

/**
 * Evaluate a binary op on two known IR values. Returns the folded result
 * or `undefined` if the operands are not foldable (e.g. div-by-zero).
 */
export function evalBin(kind: BinKind, a: IrValue, b: IrValue): IrValue | undefined {
  switch (kind) {
    case "Add":
      // Allow string + string concatenation as well as numeric addition.
      if (typeof a === "string" && typeof b === "string") return a + b;
      return numOp(a, b, (x, y) => x + y);
    case "Sub":
      return numOp(a, b, (x, y) => x - y);
    case "Mul":
      return numOp(a, b, (x, y) => x * y);
    case "Div":
      if (typeof a !== "number" || typeof b !== "number") return undefined;
      if (b === 0) return undefined; // leave runtime error to interpreter
      return a / b;
    case "Mod":
      if (typeof a !== "number" || typeof b !== "number") return undefined;
      if (b === 0) return undefined;
      // Python-style modulo: result has the sign of the divisor.
      const m = a % b;
      return ((m < 0 && b > 0) || (m > 0 && b < 0)) ? m + b : m;
    case "Eq":
      return a === b;
    case "Neq":
      return a !== b;
    case "Lt":
      return numCmp(a, b, (x, y) => x < y);
    case "Le":
      return numCmp(a, b, (x, y) => x <= y);
    case "Gt":
      return numCmp(a, b, (x, y) => x > y);
    case "Ge":
      return numCmp(a, b, (x, y) => x >= y);
    case "And":
      return boolOp(a, b, (x, y) => x && y);
    case "Or":
      return boolOp(a, b, (x, y) => x || y);
    case "BitAnd":
      return intOp(a, b, (x, y) => x & y);
    case "BitOr":
      return intOp(a, b, (x, y) => x | y);
    case "BitXor":
      return intOp(a, b, (x, y) => x ^ y);
    case "Shl":
      return intOp(a, b, (x, y) => x << y);
    case "Shr":
      return intOp(a, b, (x, y) => x >> y);
    default:
      return undefined;
  }
}

/** Evaluate a unary op on a known IR value. */
export function evalUn(kind: UnKind, a: IrValue): IrValue | undefined {
  switch (kind) {
    case "Neg":
      if (typeof a !== "number") return undefined;
      return -a;
    case "Not":
      if (typeof a !== "boolean") return undefined;
      return !a;
    case "BitNot":
      if (typeof a !== "number" || !Number.isInteger(a)) return undefined;
      return ~a;
    default:
      return undefined;
  }
}

/**
 * Single iteration of constant folding for a function. Mutates `func.blocks`
 * (the function is from a freshly-cloned program). Returns `true` if any
 * instruction was rewritten.
 */
function foldFunc(func: IrFunc): boolean {
  let changed = false;

  // Function-level constant map. SSA assumption: each register assigned once.
  // We rebuild the map each iteration so newly-folded constants participate.
  const consts = new Map<number, IrValue>();
  for (const block of func.blocks) {
    for (const instr of block.instrs) {
      const op = (instr as { op?: string }).op;
      if (op === "Const") {
        const c = instr as { value: IrValue; dest: number };
        consts.set(c.dest, c.value);
      }
    }
  }

  for (const block of func.blocks) {
    for (let i = 0; i < block.instrs.length; i++) {
      const instr = block.instrs[i];
      const op = (instr as { op?: string }).op;
      if (op === "Bin") {
        const b = instr as { kind: BinKind; src1: number; src2: number; dest: number };
        const v1 = consts.get(b.src1);
        const v2 = consts.get(b.src2);
        if (v1 !== undefined && v2 !== undefined) {
          const folded = evalBin(b.kind, v1, v2);
          if (folded !== undefined) {
            block.instrs[i] = { op: "Const", value: folded, dest: b.dest };
            consts.set(b.dest, folded);
            changed = true;
          }
        }
      } else if (op === "Un") {
        const u = instr as { kind: UnKind; src: number; dest: number };
        const v = consts.get(u.src);
        if (v !== undefined) {
          const folded = evalUn(u.kind, v);
          if (folded !== undefined) {
            block.instrs[i] = { op: "Const", value: folded, dest: u.dest };
            consts.set(u.dest, folded);
            changed = true;
          }
        }
      }
    }
  }
  return changed;
}

/** The constant-folding pass. Pure: clones input, mutates only the clone. */
export function constantFolding(prog: IrProgram): IrProgram {
  const result = cloneIr(prog);
  let changed = true;
  let iters = 0;
  while (changed && iters < 100) {
    changed = false;
    for (const func of result.funcs) {
      if (foldFunc(func)) changed = true;
    }
    iters++;
  }
  return result;
}
