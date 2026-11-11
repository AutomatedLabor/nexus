/**
 * aether/core/opt/types.ts
 * =========================
 * Local IR type definitions for the optimizer passes.
 *
 * The canonical IR lives in `aether/core/ir/ir.ts` (built by a parallel
 * subagent). To avoid coupling the optimizer to a module that may not yet
 * exist on disk, we define a structurally-compatible set of IR types here.
 *
 * Compatibility strategy
 * ----------------------
 * - The shapes below match the public IR contract documented in the task
 *   (`IrOp` union with `Const | Move | Bin | Un | Call | CallBuiltin | Br |
 *   Return | LoadField | StoreField | AllocStruct | AllocVariant | AllocArray
 *   | AllocMap | IndexGet | IndexSet | Match | Len | Phi`, plus `IrBlock`,
 *   `IrFunc`, `IrProgram`).
 * - We use TypeScript structural typing so once `aether/core/ir/ir.ts` lands,
 *   the two type sets are mutually assignable without code changes.
 * - Every op uses a string `op` discriminator, so passes can duck-type on
 *   `instr.op` without exhaustive-switch coupling to the canonical union.
 * - We add `TailCall` (used by `tco.ts`) which is the recommended pragmatic
 *   extension noted in the task description ("add to IrOp OR represent as
 *   Move(arg params) + Jmp to entry block"). `TailCall` is selected for
 *   clarity — see `tco.ts` for the rationale.
 *
 * To switch to the canonical types once the parallel module lands, simply
 * replace this file with:
 *   export type { IrProgram, IrFunc, IrBlock, IrOp, BinKind, UnKind, IrValue,
 *     IrConst, IrMove, IrBin, IrUn, IrCall, IrCallBuiltin, IrBr, IrReturn,
 *     IrLoadField, IrStoreField, IrAllocStruct, IrAllocVariant, IrAllocArray,
 *     IrAllocMap, IrIndexGet, IrIndexSet, IrMatch, IrLen, IrPhi, IrTailCall
 *   } from "../ir/ir";
 * (or extend the canonical module with `TailCall`).
 */
//----------------------------------------------------------------------------
// Operands
//----------------------------------------------------------------------------

/** A scalar IR literal. Numbers, strings, booleans, null. */
export type IrValue = number | string | boolean | null;

/** Binary operators in the Aether IR. */
export type BinKind =
  | "Add"
  | "Sub"
  | "Mul"
  | "Div"
  | "Mod"
  | "Eq"
  | "Neq"
  | "Lt"
  | "Le"
  | "Gt"
  | "Ge"
  | "And"
  | "Or"
  | "BitAnd"
  | "BitOr"
  | "BitXor"
  | "Shl"
  | "Shr";

/** Unary operators. */
export type UnKind = "Neg" | "Not" | "BitNot";

//----------------------------------------------------------------------------
// IR instructions (IrOp union members)
//----------------------------------------------------------------------------

export interface IrConst {
  op: "Const";
  value: IrValue;
  dest: number;
}

export interface IrMove {
  op: "Move";
  src: number;
  dest: number;
}

export interface IrBin {
  op: "Bin";
  kind: BinKind;
  src1: number;
  src2: number;
  dest: number;
}

export interface IrUn {
  op: "Un";
  kind: UnKind;
  src: number;
  dest: number;
}

export interface IrCall {
  op: "Call";
  fn: string;
  args: number[];
  dest: number;
}

export interface IrCallBuiltin {
  op: "CallBuiltin";
  fn: string;
  args: number[];
  dest: number;
}

export interface IrBr {
  op: "Br";
  /** Source register holding the boolean condition, or `null` for unconditional. */
  cond: number | null;
  /** Block id taken when cond is true (or always, if cond is null). */
  then: number;
  /** Block id taken when cond is false. `null` if not used. */
  else: number | null;
}

export interface IrReturn {
  op: "Return";
  /** Source register holding the return value, or `null` for void return. */
  src: number | null;
}

export interface IrLoadField {
  op: "LoadField";
  src: number;
  field: string;
  dest: number;
}

export interface IrStoreField {
  op: "StoreField";
  /** Destination struct register (mutated in place). */
  dest: number;
  field: string;
  src: number;
}

export interface IrAllocStruct {
  op: "AllocStruct";
  structName: string;
  fields: Record<string, number>;
  dest: number;
}

export interface IrAllocVariant {
  op: "AllocVariant";
  enumName: string;
  variant: string;
  args: number[];
  dest: number;
}

export interface IrAllocArray {
  op: "AllocArray";
  args: number[];
  dest: number;
}

export interface IrAllocMap {
  op: "AllocMap";
  pairs: Array<[number, number]>;
  dest: number;
}

export interface IrIndexGet {
  op: "IndexGet";
  src: number;
  index: number;
  dest: number;
}

export interface IrIndexSet {
  op: "IndexSet";
  /** Target collection register (mutated in place). */
  src: number;
  index: number;
  value: number;
}

export interface IrMatch {
  op: "Match";
  src: number;
  /** Each entry: test value register → target block id. */
  targets: Array<{ test: number; target: number }>;
  default: number;
}

export interface IrLen {
  op: "Len";
  src: number;
  dest: number;
}

export interface IrPhi {
  op: "Phi";
  incomings: Array<{ from: number; src: number }>;
  dest: number;
}

/**
 * Tail-call marker. Emitted by `tco.ts` when a `Call(fn, args, dest)` is
 * immediately followed by `Return(dest)`. Semantically: tail-call `fn(args)`
 * and propagate its return value to the caller — the current frame is no
 * longer needed. A backend can compile this to a jump instead of a call.
 *
 * `TailCall` has no successor block and must be the last instruction in its
 * block. It carries no dest because the call's result is forwarded directly.
 */
export interface IrTailCall {
  op: "TailCall";
  fn: string;
  args: number[];
}

//----------------------------------------------------------------------------

export type IrOp =
  | IrConst
  | IrMove
  | IrBin
  | IrUn
  | IrCall
  | IrCallBuiltin
  | IrBr
  | IrReturn
  | IrLoadField
  | IrStoreField
  | IrAllocStruct
  | IrAllocVariant
  | IrAllocArray
  | IrAllocMap
  | IrIndexGet
  | IrIndexSet
  | IrMatch
  | IrLen
  | IrPhi
  | IrTailCall;

//----------------------------------------------------------------------------

export interface IrBlock {
  id: number;
  instrs: IrOp[];
}

export interface IrFunc {
  name: string;
  params: number[];
  blocks: IrBlock[];
  entry: number;
  nlocals: number;
}

export interface IrProgram {
  funcs: IrFunc[];
  globals: Map<string, number>;
}

//----------------------------------------------------------------------------
// Convenience helpers (re-exported from opt.ts for tests)
//----------------------------------------------------------------------------

/** Type guard helpers for duck-typing on the `op` string discriminator. */
export function isConst(i: IrOp): i is IrConst {
  return (i as { op?: string }).op === "Const";
}
export function isMove(i: IrOp): i is IrMove {
  return (i as { op?: string }).op === "Move";
}
export function isBin(i: IrOp): i is IrBin {
  return (i as { op?: string }).op === "Bin";
}
export function isUn(i: IrOp): i is IrUn {
  return (i as { op?: string }).op === "Un";
}
export function isCall(i: IrOp): i is IrCall {
  return (i as { op?: string }).op === "Call";
}
export function isCallBuiltin(i: IrOp): i is IrCallBuiltin {
  return (i as { op?: string }).op === "CallBuiltin";
}
export function isBr(i: IrOp): i is IrBr {
  return (i as { op?: string }).op === "Br";
}
export function isReturn(i: IrOp): i is IrReturn {
  return (i as { op?: string }).op === "Return";
}
export function isTailCall(i: IrOp): i is IrTailCall {
  return (i as { op?: string }).op === "TailCall";
}
