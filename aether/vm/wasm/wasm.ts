/**
 * aether/vm/wasm/wasm.ts
 * =======================
 * Aether IR → WebAssembly backend.
 *
 * Design overview
 * ---------------
 * The WASM backend lowers an `IrProgram` to a WebAssembly module. The module
 * exports one function per Aether function (with `<main>` renamed to a
 * sanitized identifier). The runtime model is a *pragmatic split*:
 *
 *   - **Native fast path** — integer arithmetic, comparisons, control flow,
 *     function call/return, local-variable access — all run as native WASM
 *     instructions. This is where the speedup over the tree-walker comes
 *     from: tight i32 arithmetic in a typed, JIT-friendly binary format.
 *
 *   - **Host-call slow path** — heap operations (AllocStruct, LoadField,
 *     IndexGet, Match, MakeClosure, CallBuiltin, Print, Cast on non-int,
 *     string/array operations, etc.) go through imported host functions.
 *     The WASM code passes encoded i32 values; the host decodes them,
 *     performs the operation in JS, and returns an encoded i32.
 *
 * Value encoding (all Aether values are i32 in WASM):
 *   - Integer `n` with |n| < 2^30: encoded as `n << 1` (low bit 0).
 *   - Bool: raw i32 `0` or `1` (low bit may be 0 or 1; never used in
 *     arithmetic, only as branch conditions).
 *   - Heap reference (string, array, struct, map, variant, range, closure,
 *     box, large int, float): encoded as `(heapIdx << 1) | 1` (low bit 1).
 *     `heapIdx` is an index into a JS-side `heap: Value[]` array.
 *   - Unit/null: `i32.const 0`.
 *
 * Binary arithmetic uses a runtime tag check: if `(lhs | rhs) & 1 == 0`
 * (both operands are ints), execute the native WASM op; else call the host
 * for dynamic dispatch (handles string concat, array concat, etc.).
 *
 * Control flow is lowered to a *dispatch loop*: each IrFunc with >1 block
 * has a `loop` containing a `br_table` indexed by a `$block` local. Each
 * block is a nested `block`; the block's code runs after its `end`. Branches
 * set `$block` to the target's *normalized index* (NOT the raw block id —
 * block ids may not be 0..N-1 contiguous after the IR cleanup pass, so we
 * normalize to sorted indices) and `br $next` to loop.
 *
 * Closures: `MakeClosure` calls `__make_closure_N(funcIdx, captures...)`
 * which stores the closure as a JS object in the heap. `Call` calls
 * `__call_closure_N(closure, args...)` which looks up the closure, pushes
 * its captures onto an upvalue stack, calls the WASM function by export
 * name, and pops. `GetUpvalue`/`SetUpvalue` read/write the top of the
 * upvalue stack. The closure self-reference is passed as the FIRST param
 * to every WASM function (a "hidden" $self); functions with `selfReg >= 0`
 * copy it to `$v_{selfReg}` at entry.
 *
 * Public surface
 * --------------
 *   type WasmInstr, WasmFunc, WasmModule, WasmImport, WasmExport
 *   function compileIrToWasm(ir: IrProgram): WasmModule
 *   function emitWasmText(module: WasmModule): string
 *   function emitWasmBinary(module: WasmModule): Uint8Array
 *   function compileAndRunWasm(source: string, args?: Value[]): Promise<WasmRunResult>
 */
import type {
  IrProgram,
  IrFunc,
  IrBlock,
  IrOp,
  BinKind,
} from "../../core/ir/ir";
import type { Value } from "../../core/eval/eval";
import { display, valueEq } from "../../core/eval/eval";
import { lexWithErrors } from "../../core/lexer/lexer";
import { parse } from "../../core/parser/parser";
import { lowerToIr } from "../../core/ir/ir";

//----------------------------------------------------------------------------
// Public types
//----------------------------------------------------------------------------

export type WasmValType = "i32" | "i64" | "f32" | "f64";

export type WasmBlockType = "void" | WasmValType;

/** A single WASM instruction. We use a structured tree form (with nested
 * `block`/`loop`/`if` bodies) for ease of codegen; both `emitWasmText` and
 * `emitWasmBinary` walk this tree. */
export type WasmInstr =
  // Constants
  | { op: "i32.const"; value: number }
  | { op: "i64.const"; value: bigint | number }
  | { op: "f64.const"; value: number }
  // Locals
  | { op: "local.get"; idx: number }
  | { op: "local.set"; idx: number }
  | { op: "local.tee"; idx: number }
  // Globals
  | { op: "global.get"; idx: number }
  | { op: "global.set"; idx: number }
  // i32 arithmetic / bitwise / comparison
  | { op: "i32.add" | "i32.sub" | "i32.mul" | "i32.div_s" | "i32.div_u"
        | "i32.rem_s" | "i32.rem_u" | "i32.and" | "i32.or" | "i32.xor"
        | "i32.shl" | "i32.shr_s" | "i32.shr_u" | "i32.rotl" | "i32.rotr"
        | "i32.eq" | "i32.ne" | "i32.lt_s" | "i32.lt_u" | "i32.gt_s"
        | "i32.gt_u" | "i32.le_s" | "i32.le_u" | "i32.ge_s" | "i32.ge_u"
        | "i32.eqz" | "i32.clz" | "i32.ctz" | "i32.popcnt" }
  // f64 arithmetic (rarely used; floats are heap-encoded in v1)
  | { op: "f64.add" | "f64.sub" | "f64.mul" | "f64.div" | "f64.min" | "f64.max"
        | "f64.abs" | "f64.neg" | "f64.sqrt" | "f64.floor" | "f64.ceil"
        | "f64.trunc" | "f64.nearest"
        | "f64.eq" | "f64.ne" | "f64.lt" | "f64.gt" | "f64.le" | "f64.ge" }
  // Stack
  | { op: "drop" }
  | { op: "select" }
  // Calls
  | { op: "call"; funcIdx: number }
  | { op: "call_indirect"; typeIdx: number; tableIdx: number }
  // Control flow
  | { op: "br"; label: number }
  | { op: "br_if"; label: number }
  | { op: "br_table"; labels: number[]; default: number }
  | { op: "return" }
  | { op: "unreachable" }
  | { op: "nop" }
  // Structured control flow (with nested bodies)
  | { op: "block"; blockType: WasmBlockType; body: WasmInstr[] }
  | { op: "loop"; blockType: WasmBlockType; body: WasmInstr[] }
  | { op: "if"; blockType: WasmBlockType; then: WasmInstr[]; else?: WasmInstr[] };

export interface WasmFunc {
  /** Sanitized function name (used for exports). */
  name: string;
  /** Parameter types (always i32 in our encoding). */
  params: WasmValType[];
  /** Result types (always a single i32 in our encoding). */
  results: WasmValType[];
  /** Local variables (excluding params). Always i32. */
  locals: WasmValType[];
  /** Function body instructions. */
  body: WasmInstr[];
  /** True if this function should be exported. */
  exported: boolean;
}

export interface WasmImport {
  module: string;
  name: string;
  params: WasmValType[];
  results: WasmValType[];
}

export interface WasmExport {
  name: string;
  kind: "func" | "memory";
  idx: number;
}

export interface WasmModule {
  /** Defined functions, in function-index order (after imports). */
  funcs: WasmFunc[];
  /** Imports (function imports only; come first in the function index space). */
  imports: WasmImport[];
  /** Exports (functions and optional memory). */
  exports: WasmExport[];
  /** Optional linear memory. */
  memory?: { min: number; max?: number };
  /** Module-level interned strings (set by compileIrToWasm). */
  strings?: string[];
  /** Module-level interned floats. */
  floats?: number[];
  /** Module-level interned bigints. */
  bigints?: number[];
  /** Match tables (per match id, set by compileIrToWasm). */
  matchTables?: any[];
}

//----------------------------------------------------------------------------
// Per-function compilation context
//----------------------------------------------------------------------------

interface FuncCtx {
  irFn: IrFunc;
  funcIndex: number;
  nparams: number; // including $self
  nlocals: number;
  /** Block id → normalized index 0..N-1. */
  blockIdToIndex: Map<number, number>;
  /** Sorted block ids (index 0..N-1). */
  sortedIds: number[];
  importIndices: Map<string, number>;
  blockLocalIdx: number;
  /** Per-function match counter (for assigning match ids). */
  matchCounter: number;
  /** Depth to the dispatch loop ($next) from the current emit position.
   * Updated as we descend into nested blocks/ifs. Used by emitBr/emitMatch
   * to compute the correct `br` depth. */
  loopDepth: number;
  out: WasmFunc;
}

interface ModuleCtx {
  ir: IrProgram;
  funcIndexMap: number[];
  importIndices: Map<string, number>;
  imports: WasmImport[];
  strings: string[];
  stringMap: Map<string, number>;
  floats: number[];
  floatMap: Map<number, number>;
  bigints: number[];
  bigintMap: Map<number, number>;
  matchTables: any[];
}

//----------------------------------------------------------------------------
// Top-level: compileIrToWasm
//----------------------------------------------------------------------------

export function compileIrToWasm(ir: IrProgram): WasmModule {
  const mctx: ModuleCtx = {
    ir,
    funcIndexMap: [],
    importIndices: new Map(),
    imports: [],
    strings: [],
    stringMap: new Map(),
    floats: [],
    floatMap: new Map(),
    bigints: [],
    bigintMap: new Map(),
    matchTables: [],
  };

  // Reserve import indices for all the host functions we might call.
  declareImports(mctx);

  // Assign function indices: imports come first, then defined functions.
  const funcStart = mctx.imports.length;
  for (let i = 0; i < ir.funcs.length; i++) {
    mctx.funcIndexMap[i] = funcStart + i;
  }

  // Compile each function.
  const funcs: WasmFunc[] = [];
  for (let i = 0; i < ir.funcs.length; i++) {
    funcs.push(compileFunc(mctx, i));
  }

  // Exports: export every defined function (so the host can call them by name).
  const exports: WasmExport[] = [];
  for (let i = 0; i < ir.funcs.length; i++) {
    exports.push({
      name: funcs[i].name,
      kind: "func",
      idx: mctx.funcIndexMap[i],
    });
  }

  return {
    funcs,
    imports: mctx.imports,
    exports,
    strings: mctx.strings,
    floats: mctx.floats,
    bigints: mctx.bigints,
    matchTables: mctx.matchTables,
  };
}

/** Declare all host imports upfront. We declare a fixed set covering all
 * ops the IR can produce. The JS host provides all of them when the
 * module is instantiated. */
function declareImports(mctx: ModuleCtx): void {
  const add = (name: string, params: WasmValType[], results: WasmValType[]): void => {
    if (mctx.importIndices.has(name)) return;
    mctx.importIndices.set(name, mctx.imports.length);
    mctx.imports.push({ module: "env", name, params, results });
  };

  // Constants / constructors
  add("__const_str", ["i32"], ["i32"]);
  add("__const_float", ["i32"], ["i32"]);
  add("__const_bigint", ["i32"], ["i32"]);

  // Print / panic
  add("__print", ["i32"], []);
  add("__panic", ["i32"], []);

  // Binary ops (slow path for non-int operands)
  for (const k of ["add", "sub", "mul", "div", "idiv", "mod", "eq", "neq", "lt", "le", "gt", "ge", "bitand", "bitor", "bitxor", "shl", "shr", "and", "or"]) {
    add(`__bin_${k}`, ["i32", "i32"], ["i32"]);
  }

  // Unary ops (slow path)
  add("__un_neg", ["i32"], ["i32"]);
  add("__un_not", ["i32"], ["i32"]);
  add("__un_bitnot", ["i32"], ["i32"]);

  // Alloc / heap ops with fixed arity (one import per arity in 0..16)
  for (let n = 0; n <= 16; n++) {
    const structParams: WasmValType[] = ["i32"];
    for (let i = 0; i < n; i++) structParams.push("i32", "i32");
    add(`__alloc_struct_${n}`, structParams, ["i32"]);

    const variantParams: WasmValType[] = ["i32", "i32"];
    for (let i = 0; i < n; i++) variantParams.push("i32");
    add(`__alloc_variant_${n}`, variantParams, ["i32"]);

    const arrayParams: WasmValType[] = [];
    for (let i = 0; i < n; i++) arrayParams.push("i32");
    add(`__alloc_array_${n}`, arrayParams, ["i32"]);

    const tupleParams: WasmValType[] = [];
    for (let i = 0; i < n; i++) tupleParams.push("i32");
    add(`__alloc_tuple_${n}`, tupleParams, ["i32"]);

    const mapParams: WasmValType[] = [];
    for (let i = 0; i < n; i++) mapParams.push("i32", "i32");
    add(`__alloc_map_${n}`, mapParams, ["i32"]);

    const closureParams: WasmValType[] = ["i32"];
    for (let i = 0; i < n; i++) closureParams.push("i32");
    add(`__make_closure_${n}`, closureParams, ["i32"]);

    const callParams: WasmValType[] = ["i32"];
    for (let i = 0; i < n; i++) callParams.push("i32");
    add(`__call_closure_${n}`, callParams, ["i32"]);
  }
  add("__alloc_range", ["i32", "i32", "i32"], ["i32"]);

  // Field / index access
  add("__field_get", ["i32", "i32"], ["i32"]);
  add("__field_set", ["i32", "i32", "i32"], []);
  add("__index_get", ["i32", "i32"], ["i32"]);
  add("__index_set", ["i32", "i32", "i32"], []);
  add("__tuple_get", ["i32", "i32"], ["i32"]);
  add("__len", ["i32"], ["i32"]);

  // Boxes / upvalues
  add("__make_box", ["i32"], ["i32"]);
  add("__unbox", ["i32"], ["i32"]);
  add("__set_box", ["i32", "i32"], []);
  add("__get_upvalue", ["i32"], ["i32"]);
  add("__set_upvalue", ["i32", "i32"], []);

  // Casts
  add("__cast_int", ["i32"], ["i32"]);
  add("__cast_float", ["i32"], ["i32"]);
  add("__cast_bool", ["i32"], ["i32"]);
  add("__cast_string", ["i32"], ["i32"]);

  // Match: dispatch + binding extraction
  add("__match_dispatch", ["i32", "i32"], ["i32"]);
  add("__match_binding", ["i32"], ["i32"]);

  // Builtins (variadic by arity; up to 8 args)
  for (let n = 0; n <= 8; n++) {
    const params: WasmValType[] = ["i32"]; // builtin name id
    for (let i = 0; i < n; i++) params.push("i32");
    add(`__builtin_${n}`, params, ["i32"]);
  }
}

//----------------------------------------------------------------------------
// Per-function compilation
//----------------------------------------------------------------------------

function compileFunc(mctx: ModuleCtx, funcIndex: number): WasmFunc {
  const irFn = mctx.ir.funcs[funcIndex];
  const nparams = irFn.params.length;
  const nlocals = irFn.nlocals;

  // Local layout: $self (param 0) + nparams params + nlocals vregs + $block.
  // WASM local indices:
  //   0: $self
  //   1..nparams: IrFunc.params (mapped via irFn.params[i] = vreg index)
  //   ... actually params are direct WASM params, not locals.
  // Vregs map to WASM locals as: vreg i → local index (1 + i).
  // The first nparams WASM params correspond to IrFunc.params[i] — but we
  // COPY them to vregs at the function start, so the params are scratch.
  // Total: 1 ($self) + nparams (params) + nlocals (vreg locals) + 1 ($block).
  const params: WasmValType[] = ["i32"]; // $self
  for (let i = 0; i < nparams; i++) params.push("i32");
  const locals: WasmValType[] = [];
  for (let i = 0; i < nlocals; i++) locals.push("i32");
  locals.push("i32"); // $block local for dispatch

  const blockLocalIdx = 1 + nlocals; // index of $block in the locals space

  // Compute sorted block ids and the id → index map.
  const sortedIds = irFn.blocks.map((b) => b.id).sort((a, b) => a - b);
  const blockIdToIndex = new Map<number, number>();
  sortedIds.forEach((id, i) => blockIdToIndex.set(id, i));

  const fctx: FuncCtx = {
    irFn,
    funcIndex,
    nparams: nparams + 1,
    nlocals,
    blockIdToIndex,
    sortedIds,
    importIndices: mctx.importIndices,
    blockLocalIdx,
    matchCounter: 0,
    loopDepth: 0,
    out: {
      name: sanitizeName(irFn.name),
      params,
      results: ["i32"],
      locals,
      body: [],
      exported: true,
    },
  };

  const body: WasmInstr[] = [];

  // Prologue: copy params to vregs.
  for (let i = 0; i < nparams; i++) {
    const vreg = irFn.params[i];
    body.push({ op: "local.get", idx: 1 + i }); // param i (after $self)
    body.push({ op: "local.set", idx: 1 + vreg });
  }
  // Set selfReg: copy $self (local 0) to $v_{selfReg}.
  const selfReg = irFn.selfReg ?? -1;
  if (selfReg >= 0) {
    body.push({ op: "local.get", idx: 0 });
    body.push({ op: "local.set", idx: 1 + selfReg });
  }

  // Initialize $block to entry's normalized index.
  const entryIdx = blockIdToIndex.get(irFn.entry) ?? 0;
  body.push({ op: "i32.const", value: entryIdx });
  body.push({ op: "local.set", idx: blockLocalIdx });

  if (sortedIds.length === 1) {
    // Single-block function: emit the block's code directly (no dispatch).
    const block = irFn.blocks[0];
    for (const op of block.instrs) {
      emitOp(mctx, fctx, body, op);
    }
    if (body.length === 0 || !isTerminator(body[body.length - 1])) {
      body.push({ op: "i32.const", value: 0 });
      body.push({ op: "return" });
    }
  } else {
    // Multi-block: use the br_table dispatch loop.
    body.push(...buildDispatchLoop(mctx, fctx));
    // Fallback return value (unreachable in practice).
    body.push({ op: "i32.const", value: 0 });
  }

  fctx.out.body = body;
  return fctx.out;
}

/** Build the dispatch loop for a multi-block function.
 *
 * Structure:
 *   loop $next  (depth N from inside the innermost dispatch block)
 *     block $b_0  (depth N-1, outermost dispatch block)
 *       block $b_1  (depth N-2)
 *         ...
 *           block $b_{N-1}  (depth 0, innermost — contains br_table)
 *             local.get $block
 *             br_table [N-1, N-2, ..., 1, 0] default=0
 *           end
 *           ;; sortedIds[N-1]'s code
 *         end
 *         ;; sortedIds[N-2]'s code
 *       ...
 *     end
 *     ;; sortedIds[0]'s code
 *   end
 *
 * Each block's code ends with `br $next` (loop back) or `return`.
 * `br $next` from inside $b_i (where i = sortedIds[N-1]'s position) is at
 * depth (N - i) from the br position... actually, let me recompute:
 *   - sortedIds[k]'s code is inside $b_{k-1}'s body (after $b_k's end).
 *   - From this position, $b_{k-1} is at depth 0, $b_{k-2} at depth 1, ...,
 *     $b_0 at depth k-1, $next (loop) at depth k.
 *   - So `br $next` from sortedIds[k]'s code position is `br k`.
 *   - For k=0 (the outermost code, after $b_0's end), $b_0 has ended, so
 *     we're inside $next. `br $next` is `br 0`.
 *   - For k=N-1 (the innermost code, after $b_{N-1}'s end), we're inside
 *     $b_{N-2}. `br $next` is `br N-1`.
 *
 * The br_table is inside $b_{N-1} (innermost). From there:
 *   - $b_{N-1} is at depth 0
 *   - $b_{N-2} is at depth 1
 *   - ...
 *   - $b_0 is at depth N-1
 *   - $next (loop) is at depth N
 * We want: $block = k → br to $b_k (which is at depth N-1-k from inside
 * $b_{N-1}). So labels[k] = N-1-k. Default = labels[N-1] = 0 (safe —
 * re-enters the loop, shouldn't happen).
 */
function buildDispatchLoop(mctx: ModuleCtx, fctx: FuncCtx): WasmInstr[] {
  const N = fctx.sortedIds.length;
  const irFn = fctx.irFn;
  const blockLocalIdx = fctx.blockLocalIdx;

  // The br_table is the innermost content.
  const brTableBody: WasmInstr[] = [
    { op: "local.get", idx: blockLocalIdx },
    {
      op: "br_table",
      // labels[k] = depth to br to for $block=k = N-1-k
      labels: fctx.sortedIds.map((_, k) => N - 1 - k),
      default: 0,
    },
  ];

  // Recursively build nested blocks. buildLevel(k) returns the content
  // of $b_k (the block at depth N-1-k from the br_table's perspective).
  //   buildLevel(N-1) = [br_table] (innermost block body)
  //   buildLevel(k) = [{ block $b_{k+1} (body: buildLevel(k+1)) },
  //                    ...sortedIds[k+1]'s code]
  //   buildLevel(0) = [{ block $b_1 (body: buildLevel(1)) },
  //                    ...sortedIds[1]'s code]
  // We then wrap with $b_0 ourselves, and append sortedIds[0]'s code after.
  function buildLevel(k: number): WasmInstr[] {
    if (k === N - 1) {
      return brTableBody;
    }
    const innerBody = buildLevel(k + 1);
    // After $b_{k+1}'s end, emit sortedIds[k+1]'s code. We're now at level
    // "k" (inside $b_k). The depth to $next from here is k+1.
    const blockCode: WasmInstr[] = [];
    const blockId = fctx.sortedIds[k + 1];
    const block = irFn.blocks.find((b) => b.id === blockId)!;
    fctx.loopDepth = k + 1;
    for (const op of block.instrs) {
      emitOp(mctx, fctx, blockCode, op);
    }
    // If the block didn't end with a terminator, add a `br $next`.
    // `br $next` from this position is `br (k+1)`.
    if (blockCode.length === 0 || !isTerminator(blockCode[blockCode.length - 1])) {
      blockCode.push({ op: "br", label: k + 1 });
    }
    return [
      { op: "block", blockType: "void", body: innerBody },
      ...blockCode,
    ];
  }

  const bodyOfB0 = buildLevel(0);
  const block0Code: WasmInstr[] = [];
  const block0 = irFn.blocks.find((b) => b.id === fctx.sortedIds[0])!;
  // Block 0's code is at the outermost level (inside $next, after $b_0's
  // end). depthToLoop = 0.
  fctx.loopDepth = 0;
  for (const op of block0.instrs) {
    emitOp(mctx, fctx, block0Code, op);
  }
  // After $b_0's end, we're inside $next. `br $next` is `br 0`.
  if (block0Code.length === 0 || !isTerminator(block0Code[block0Code.length - 1])) {
    block0Code.push({ op: "br", label: 0 });
  }

  // The loop body: [block $b_0 { bodyOfB0 }, ...block0Code]
  const loopBody: WasmInstr[] = [
    { op: "block", blockType: "void", body: bodyOfB0 },
    ...block0Code,
  ];

  return [
    { op: "loop", blockType: "void", body: loopBody },
  ];
}

/** Check if an instruction is a function-exit or loop-back terminator. */
function isTerminator(instr: WasmInstr): boolean {
  return instr.op === "return" || instr.op === "br" || instr.op === "unreachable";
}

//----------------------------------------------------------------------------
// Per-op emission
//----------------------------------------------------------------------------

/** Intern a string into the module's string table. Returns the index. */
function internString(mctx: ModuleCtx, s: string): number {
  let idx = mctx.stringMap.get(s);
  if (idx !== undefined) return idx;
  idx = mctx.strings.length;
  mctx.strings.push(s);
  mctx.stringMap.set(s, idx);
  return idx;
}

/** Intern a float into the module's float table. Returns the index. */
function internFloat(mctx: ModuleCtx, f: number): number {
  let idx = mctx.floatMap.get(f);
  if (idx !== undefined) return idx;
  idx = mctx.floats.length;
  mctx.floats.push(f);
  mctx.floatMap.set(f, idx);
  return idx;
}

/** Intern a "bigint" (int that doesn't fit in i31) into the module's
 * bigint table. Returns the index. */
function internBigint(mctx: ModuleCtx, n: number): number {
  let idx = mctx.bigintMap.get(n);
  if (idx !== undefined) return idx;
  idx = mctx.bigints.length;
  mctx.bigints.push(n);
  mctx.bigintMap.set(n, idx);
  return idx;
}

/** Get the WASM function index for an import. */
function importIdx(fctx: FuncCtx, name: string): number {
  const idx = fctx.importIndices.get(name);
  if (idx === undefined) throw new Error(`WASM codegen: import not declared: ${name}`);
  return idx;
}

/** Map a vreg index to a WASM local index. */
function vreg(fctx: FuncCtx, vregIdx: number): number {
  return 1 + vregIdx; // local 0 is $self
}

/** Translate a block id to its normalized index. */
function blockIndex(fctx: FuncCtx, blockId: number): number {
  const idx = fctx.blockIdToIndex.get(blockId);
  if (idx === undefined) {
    // Sentinel: -1 (break), -2 (continue). For v1, treat as panic.
    return 0;
  }
  return idx;
}

/** Register a match table on the module. Returns the match id. */
function registerMatch(mctx: ModuleCtx, op: Extract<IrOp, { op: "Match" }>): number {
  const id = mctx.matchTables.length;
  mctx.matchTables.push({
    cases: op.cases.map((c) => ({ pattern: c.pattern, bindings: c.bindings })),
    elseBlock: op.elseBlock,
  });
  return id;
}

function emitOp(mctx: ModuleCtx, fctx: FuncCtx, out: WasmInstr[], op: IrOp): void {
  switch (op.op) {
    case "Const":
      emitConst(mctx, fctx, out, op.value, op.dest);
      return;
    case "Move":
      out.push({ op: "local.get", idx: vreg(fctx, op.src) });
      out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      return;
    case "Bin":
      emitBin(mctx, fctx, out, op.kind, op.lhs, op.rhs, op.dest);
      return;
    case "Un":
      emitUn(mctx, fctx, out, op.kind, op.src, op.dest);
      return;
    case "Call":
      emitCall(mctx, fctx, out, op.fn, op.args, op.dest);
      return;
    case "CallBuiltin":
      emitCallBuiltin(mctx, fctx, out, op.name, op.args, op.dest);
      return;
    case "Phi":
      // Conservative: Move from the first incoming (matches the bytecode codegen).
      if (op.incoming.length > 0) {
        out.push({ op: "local.get", idx: vreg(fctx, op.incoming[0].val) });
        out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      } else {
        out.push({ op: "i32.const", value: 0 });
        out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      }
      return;
    case "Br":
      emitBr(mctx, fctx, out, op.cond, op.then, op.else);
      return;
    case "Return":
      out.push({ op: "local.get", idx: vreg(fctx, op.val) });
      out.push({ op: "return" });
      return;
    case "LoadField": {
      const nameIdx = internString(mctx, op.field);
      out.push({ op: "local.get", idx: vreg(fctx, op.obj) });
      out.push({ op: "i32.const", value: nameIdx });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__field_get") });
      out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      return;
    }
    case "StoreField": {
      const nameIdx = internString(mctx, op.field);
      out.push({ op: "local.get", idx: vreg(fctx, op.obj) });
      out.push({ op: "i32.const", value: nameIdx });
      out.push({ op: "local.get", idx: vreg(fctx, op.val) });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__field_set") });
      return;
    }
    case "AllocStruct": {
      const nameIdx = internString(mctx, op.name);
      const fieldEntries = Object.entries(op.fields);
      const n = fieldEntries.length;
      if (n > 16) throw new Error(`WASM: AllocStruct with ${n} fields exceeds limit (16)`);
      out.push({ op: "i32.const", value: nameIdx });
      for (const [fname, fval] of fieldEntries) {
        const fIdx = internString(mctx, fname);
        out.push({ op: "i32.const", value: fIdx });
        out.push({ op: "local.get", idx: vreg(fctx, fval) });
      }
      out.push({ op: "call", funcIdx: importIdx(fctx, `__alloc_struct_${n}`) });
      out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      return;
    }
    case "AllocVariant": {
      const enumIdx = internString(mctx, op.enumName);
      const variantIdx = internString(mctx, op.variant);
      const n = op.data.length;
      if (n > 16) throw new Error(`WASM: AllocVariant with ${n} data values exceeds limit (16)`);
      out.push({ op: "i32.const", value: enumIdx });
      out.push({ op: "i32.const", value: variantIdx });
      for (const d of op.data) {
        out.push({ op: "local.get", idx: vreg(fctx, d) });
      }
      out.push({ op: "call", funcIdx: importIdx(fctx, `__alloc_variant_${n}`) });
      out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      return;
    }
    case "AllocArray": {
      const n = op.elems.length;
      if (n > 16) throw new Error(`WASM: AllocArray with ${n} elems exceeds limit (16)`);
      for (const e of op.elems) {
        out.push({ op: "local.get", idx: vreg(fctx, e) });
      }
      out.push({ op: "call", funcIdx: importIdx(fctx, `__alloc_array_${n}`) });
      out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      return;
    }
    case "AllocTuple": {
      const n = op.elems.length;
      if (n > 16) throw new Error(`WASM: AllocTuple with ${n} elems exceeds limit (16)`);
      for (const e of op.elems) {
        out.push({ op: "local.get", idx: vreg(fctx, e) });
      }
      out.push({ op: "call", funcIdx: importIdx(fctx, `__alloc_tuple_${n}`) });
      out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      return;
    }
    case "AllocMap": {
      const n = op.entries.length;
      if (n > 16) throw new Error(`WASM: AllocMap with ${n} entries exceeds limit (16)`);
      for (const ent of op.entries) {
        out.push({ op: "local.get", idx: vreg(fctx, ent.key) });
        out.push({ op: "local.get", idx: vreg(fctx, ent.val) });
      }
      out.push({ op: "call", funcIdx: importIdx(fctx, `__alloc_map_${n}`) });
      out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      return;
    }
    case "AllocRange": {
      out.push({ op: "local.get", idx: vreg(fctx, op.start) });
      out.push({ op: "local.get", idx: vreg(fctx, op.end) });
      out.push({ op: "i32.const", value: op.inclusive ? 1 : 0 });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__alloc_range") });
      out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      return;
    }
    case "IndexGet": {
      out.push({ op: "local.get", idx: vreg(fctx, op.obj) });
      out.push({ op: "local.get", idx: vreg(fctx, op.idx) });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__index_get") });
      out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      return;
    }
    case "IndexSet": {
      out.push({ op: "local.get", idx: vreg(fctx, op.obj) });
      out.push({ op: "local.get", idx: vreg(fctx, op.idx) });
      out.push({ op: "local.get", idx: vreg(fctx, op.val) });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__index_set") });
      return;
    }
    case "TupleGet": {
      out.push({ op: "local.get", idx: vreg(fctx, op.obj) });
      out.push({ op: "i32.const", value: op.idx });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__tuple_get") });
      out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      return;
    }
    case "Len": {
      out.push({ op: "local.get", idx: vreg(fctx, op.src) });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__len") });
      out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      return;
    }
    case "MakeBox": {
      out.push({ op: "local.get", idx: vreg(fctx, op.src) });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__make_box") });
      out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      return;
    }
    case "Unbox": {
      out.push({ op: "local.get", idx: vreg(fctx, op.src) });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__unbox") });
      out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      return;
    }
    case "SetBox": {
      out.push({ op: "local.get", idx: vreg(fctx, op.box) });
      out.push({ op: "local.get", idx: vreg(fctx, op.val) });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__set_box") });
      return;
    }
    case "GetUpvalue": {
      out.push({ op: "i32.const", value: op.upvalueIndex });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__get_upvalue") });
      out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      return;
    }
    case "SetUpvalue": {
      out.push({ op: "i32.const", value: op.upvalueIndex });
      out.push({ op: "local.get", idx: vreg(fctx, op.val) });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__set_upvalue") });
      return;
    }
    case "MakeClosure": {
      const n = op.captures.length;
      if (n > 16) throw new Error(`WASM: MakeClosure with ${n} captures exceeds limit (16)`);
      out.push({ op: "i32.const", value: op.funcIndex });
      for (const c of op.captures) {
        out.push({ op: "local.get", idx: vreg(fctx, c) });
      }
      out.push({ op: "call", funcIdx: importIdx(fctx, `__make_closure_${n}`) });
      out.push({ op: "local.set", idx: vreg(fctx, op.dest) });
      return;
    }
    case "Panic": {
      out.push({ op: "local.get", idx: vreg(fctx, op.msg) });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__panic") });
      out.push({ op: "unreachable" });
      return;
    }
    case "Print": {
      out.push({ op: "local.get", idx: vreg(fctx, op.src) });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__print") });
      return;
    }
    case "Cast":
      emitCast(mctx, fctx, out, op.kind, op.src, op.dest);
      return;
    case "Match":
      emitMatch(mctx, fctx, out, op);
      return;
    case "Nop":
      out.push({ op: "nop" });
      return;
  }
}

function emitConst(
  mctx: ModuleCtx,
  fctx: FuncCtx,
  out: WasmInstr[],
  v: Value,
  dest: number,
): void {
  if (v === null || v === undefined) {
    out.push({ op: "i32.const", value: 0 });
    out.push({ op: "local.set", idx: vreg(fctx, dest) });
    return;
  }
  if (typeof v === "boolean") {
    // Bool encoding: 0 (false) or 2 (true). We use 2 = (1 << 1) so that
    // `true` shares the int encoding (low bit 0), avoiding collision with
    // heap refs (low bit 1).
    out.push({ op: "i32.const", value: v ? 2 : 0 });
    out.push({ op: "local.set", idx: vreg(fctx, dest) });
    return;
  }
  if (typeof v === "number") {
    if (Number.isInteger(v) && v >= -1073741824 && v <= 1073741823) {
      out.push({ op: "i32.const", value: (v << 1) | 0 });
      out.push({ op: "local.set", idx: vreg(fctx, dest) });
    } else if (Number.isInteger(v)) {
      const idx = internBigint(mctx, v);
      out.push({ op: "i32.const", value: idx });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__const_bigint") });
      out.push({ op: "local.set", idx: vreg(fctx, dest) });
    } else {
      const idx = internFloat(mctx, v);
      out.push({ op: "i32.const", value: idx });
      out.push({ op: "call", funcIdx: importIdx(fctx, "__const_float") });
      out.push({ op: "local.set", idx: vreg(fctx, dest) });
    }
    return;
  }
  if (typeof v === "string") {
    const idx = internString(mctx, v);
    out.push({ op: "i32.const", value: idx });
    out.push({ op: "call", funcIdx: importIdx(fctx, "__const_str") });
    out.push({ op: "local.set", idx: vreg(fctx, dest) });
    return;
  }
  out.push({ op: "i32.const", value: 0 });
  out.push({ op: "local.set", idx: vreg(fctx, dest) });
}

function emitBin(
  mctx: ModuleCtx,
  fctx: FuncCtx,
  out: WasmInstr[],
  kind: BinKind,
  lhs: number,
  rhs: number,
  dest: number,
): void {
  const lhsIdx = vreg(fctx, lhs);
  const rhsIdx = vreg(fctx, rhs);
  const destIdx = vreg(fctx, dest);

  // For And/Or (short-circuited in IR — shouldn't appear here), use host.
  if (kind === "And" || kind === "Or") {
    out.push({ op: "local.get", idx: lhsIdx });
    out.push({ op: "local.get", idx: rhsIdx });
    out.push({ op: "call", funcIdx: importIdx(fctx, `__bin_${kind.toLowerCase()}`) });
    out.push({ op: "local.set", idx: destIdx });
    return;
  }

  // Div and Mod always go through the host: Div may produce a non-integer
  // float (which can't be encoded as `n << 1`), and Mod uses Python-style
  // positive modulo (which differs from native i32.rem_s for negative
  // operands). IDiv is always integer, so it can use the native fast path.
  if (kind === "Div" || kind === "Mod") {
    out.push({ op: "local.get", idx: lhsIdx });
    out.push({ op: "local.get", idx: rhsIdx });
    out.push({ op: "call", funcIdx: importIdx(fctx, `__bin_${kind.toLowerCase()}`) });
    out.push({ op: "local.set", idx: destIdx });
    return;
  }

  // Tag check: if ((lhs | rhs) & 1) != 0, slow path (host call); else native.
  const thenBody: WasmInstr[] = [
    { op: "local.get", idx: lhsIdx },
    { op: "local.get", idx: rhsIdx },
    { op: "call", funcIdx: importIdx(fctx, `__bin_${kind.toLowerCase()}`) },
  ];
  const elseBody: WasmInstr[] = emitBinNative(lhsIdx, rhsIdx, kind);

  out.push({ op: "local.get", idx: lhsIdx });
  out.push({ op: "local.get", idx: rhsIdx });
  out.push({ op: "i32.or" });
  out.push({ op: "i32.const", value: 1 });
  out.push({ op: "i32.and" });
  out.push({
    op: "if",
    blockType: "i32",
    then: thenBody,
    else: elseBody,
  });
  out.push({ op: "local.set", idx: destIdx });
}

function emitBinNative(lhsIdx: number, rhsIdx: number, kind: BinKind): WasmInstr[] {
  switch (kind) {
    case "Add":
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.add" },
      ];
    case "Sub":
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.sub" },
      ];
    case "Mul":
      // (a<<1) * (b<<1) = (a*b)<<2; shift right by 1 to get (a*b)<<1.
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.mul" },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
      ];
    case "Div":
    case "IDiv":
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "i32.div_s" },
        { op: "i32.const", value: 1 },
        { op: "i32.shl" },
      ];
    case "Mod":
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "i32.rem_s" },
        { op: "i32.const", value: 1 },
        { op: "i32.shl" },
      ];
    case "BitAnd":
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "i32.and" },
        { op: "i32.const", value: 1 },
        { op: "i32.shl" },
      ];
    case "BitOr":
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "i32.or" },
        { op: "i32.const", value: 1 },
        { op: "i32.shl" },
      ];
    case "BitXor":
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "i32.xor" },
        { op: "i32.const", value: 1 },
        { op: "i32.shl" },
      ];
    case "Shl":
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "i32.shl" },
        { op: "i32.const", value: 1 },
        { op: "i32.shl" },
      ];
    case "Shr":
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "i32.shr_s" },
        { op: "i32.const", value: 1 },
        { op: "i32.shl" },
      ];
    case "Eq":
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "i32.eq" },
        { op: "i32.const", value: 1 },
        { op: "i32.shl" },
      ];
    case "Neq":
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "i32.ne" },
        { op: "i32.const", value: 1 },
        { op: "i32.shl" },
      ];
    case "Lt":
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "i32.lt_s" },
        { op: "i32.const", value: 1 },
        { op: "i32.shl" },
      ];
    case "Le":
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "i32.le_s" },
        { op: "i32.const", value: 1 },
        { op: "i32.shl" },
      ];
    case "Gt":
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "i32.gt_s" },
        { op: "i32.const", value: 1 },
        { op: "i32.shl" },
      ];
    case "Ge":
      return [
        { op: "local.get", idx: lhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "local.get", idx: rhsIdx },
        { op: "i32.const", value: 1 },
        { op: "i32.shr_s" },
        { op: "i32.ge_s" },
        { op: "i32.const", value: 1 },
        { op: "i32.shl" },
      ];
    case "And":
    case "Or":
      return [{ op: "i32.const", value: 0 }];
  }
}

function emitUn(
  mctx: ModuleCtx,
  fctx: FuncCtx,
  out: WasmInstr[],
  kind: "Neg" | "Not" | "BitNot",
  src: number,
  dest: number,
): void {
  const srcIdx = vreg(fctx, src);
  const destIdx = vreg(fctx, dest);

  if (kind === "Not") {
    // Not: always use host (truthy semantics differ by type).
    out.push({ op: "local.get", idx: srcIdx });
    out.push({ op: "call", funcIdx: importIdx(fctx, "__un_not") });
    out.push({ op: "local.set", idx: destIdx });
    return;
  }

  const thenBody: WasmInstr[] = [
    { op: "local.get", idx: srcIdx },
    { op: "call", funcIdx: importIdx(fctx, `__un_${kind.toLowerCase()}`) },
  ];
  let elseBody: WasmInstr[];
  if (kind === "Neg") {
    elseBody = [
      { op: "local.get", idx: srcIdx },
      { op: "i32.const", value: 1 },
      { op: "i32.shr_s" },
      { op: "i32.const", value: 0 },
      { op: "i32.sub" },
      { op: "i32.const", value: 1 },
      { op: "i32.shl" },
    ];
  } else {
    // BitNot
    elseBody = [
      { op: "local.get", idx: srcIdx },
      { op: "i32.const", value: 1 },
      { op: "i32.shr_s" },
      { op: "i32.const", value: -1 },
      { op: "i32.xor" },
      { op: "i32.const", value: 1 },
      { op: "i32.shl" },
    ];
  }

  out.push({ op: "local.get", idx: srcIdx });
  out.push({ op: "i32.const", value: 1 });
  out.push({ op: "i32.and" });
  out.push({
    op: "if",
    blockType: "i32",
    then: thenBody,
    else: elseBody,
  });
  out.push({ op: "local.set", idx: destIdx });
}

function emitCast(
  mctx: ModuleCtx,
  fctx: FuncCtx,
  out: WasmInstr[],
  kind: "Int" | "Float" | "Bool" | "String",
  src: number,
  dest: number,
): void {
  const srcIdx = vreg(fctx, src);
  const destIdx = vreg(fctx, dest);
  if (kind === "Int") {
    // For int-encoded values, no-op. For others, call host.
    const thenBody: WasmInstr[] = [
      { op: "local.get", idx: srcIdx },
      { op: "call", funcIdx: importIdx(fctx, "__cast_int") },
    ];
    const elseBody: WasmInstr[] = [
      { op: "local.get", idx: srcIdx },
    ];
    out.push({ op: "local.get", idx: srcIdx });
    out.push({ op: "i32.const", value: 1 });
    out.push({ op: "i32.and" });
    out.push({
      op: "if",
      blockType: "i32",
      then: thenBody,
      else: elseBody,
    });
    out.push({ op: "local.set", idx: destIdx });
    return;
  }
  out.push({ op: "local.get", idx: srcIdx });
  out.push({ op: "call", funcIdx: importIdx(fctx, `__cast_${kind.toLowerCase()}`) });
  out.push({ op: "local.set", idx: destIdx });
}

function emitCall(
  mctx: ModuleCtx,
  fctx: FuncCtx,
  out: WasmInstr[],
  fn: number,
  args: number[],
  dest: number,
): void {
  const n = args.length;
  if (n > 16) throw new Error(`WASM: Call with ${n} args exceeds limit (16)`);
  out.push({ op: "local.get", idx: vreg(fctx, fn) });
  for (const a of args) {
    out.push({ op: "local.get", idx: vreg(fctx, a) });
  }
  out.push({ op: "call", funcIdx: importIdx(fctx, `__call_closure_${n}`) });
  out.push({ op: "local.set", idx: vreg(fctx, dest) });
}

function emitCallBuiltin(
  mctx: ModuleCtx,
  fctx: FuncCtx,
  out: WasmInstr[],
  name: string,
  args: number[],
  dest: number,
): void {
  const n = args.length;
  if (n > 8) throw new Error(`WASM: CallBuiltin with ${n} args exceeds limit (8)`);
  const nameIdx = internString(mctx, name);
  out.push({ op: "i32.const", value: nameIdx });
  for (const a of args) {
    out.push({ op: "local.get", idx: vreg(fctx, a) });
  }
  out.push({ op: "call", funcIdx: importIdx(fctx, `__builtin_${n}`) });
  out.push({ op: "local.set", idx: vreg(fctx, dest) });
}

/** Emit a Br op. Sets $block to the target's normalized index and `br`s to
 * the dispatch loop ($next). The `br` depth depends on where we are in
 * the dispatch loop structure. */
function emitBr(
  mctx: ModuleCtx,
  fctx: FuncCtx,
  out: WasmInstr[],
  cond: number | null,
  then: number,
  elseBlk: number | null,
): void {
  // Handle break/continue sentinels.
  if (then === -1 || then === -2 || (elseBlk !== null && (elseBlk === -1 || elseBlk === -2))) {
    out.push({ op: "i32.const", value: 0 });
    out.push({ op: "call", funcIdx: importIdx(fctx, "__panic") });
    out.push({ op: "unreachable" });
    return;
  }

  if (cond === null) {
    // Unconditional Br: set $block to target's normalized index, br $next.
    const targetIdx = blockIndex(fctx, then);
    out.push({ op: "i32.const", value: targetIdx });
    out.push({ op: "local.set", idx: fctx.blockLocalIdx });
    // `br $next` from the current emit position is `br fctx.loopDepth`.
    out.push({ op: "br", label: fctx.loopDepth });
    return;
  }

  // Conditional Br: if (cond) { $block = thenIdx; br $next } else { $block = elseIdx; br $next }.
  // The if/else wraps the branches, making them one level deeper than the
  // current emit position. So `br $next` from inside the if is
  // `br (fctx.loopDepth + 1)`.
  const condIdx = vreg(fctx, cond);
  const thenIdx = blockIndex(fctx, then);
  const elseIdx = (elseBlk !== null) ? blockIndex(fctx, elseBlk) : 0;
  const brDepth = fctx.loopDepth + 1;
  const thenBody: WasmInstr[] = [
    { op: "i32.const", value: thenIdx },
    { op: "local.set", idx: fctx.blockLocalIdx },
    { op: "br", label: brDepth },
  ];
  const elseBody: WasmInstr[] = [
    { op: "i32.const", value: elseIdx },
    { op: "local.set", idx: fctx.blockLocalIdx },
    { op: "br", label: brDepth },
  ];
  out.push({ op: "local.get", idx: condIdx });
  out.push({
    op: "if",
    blockType: "void",
    then: thenBody,
    else: elseBody,
  });
}

function emitMatch(
  mctx: ModuleCtx,
  fctx: FuncCtx,
  out: WasmInstr[],
  op: Extract<IrOp, { op: "Match" }>,
): void {
  const matchId = registerMatch(mctx, op);

  // Call __match_dispatch(scrutinee, matchId) and store the case index in $block.
  out.push({ op: "local.get", idx: vreg(fctx, op.scrutinee) });
  out.push({ op: "i32.const", value: matchId });
  out.push({ op: "call", funcIdx: importIdx(fctx, "__match_dispatch") });
  out.push({ op: "local.set", idx: fctx.blockLocalIdx });

  // Build the if/else chain. Each case sets the bindings + $block to the
  // target block's index + br $next. The i-th case's if is at depth
  // (fctx.loopDepth + i + 1) from $next.
  function buildCase(i: number): WasmInstr[] {
    if (i >= op.cases.length) {
      // Else: jump to elseBlock. We're inside `num_cases` nested ifs (one
      // per case), so the depth to $next is `fctx.loopDepth + num_cases`.
      const elseIdx = blockIndex(fctx, op.elseBlock);
      return [
        { op: "i32.const", value: elseIdx },
        { op: "local.set", idx: fctx.blockLocalIdx },
        { op: "br", label: fctx.loopDepth + op.cases.length },
      ];
    }
    const c = op.cases[i];
    // We're inside `i` outer ifs (case 0 is in the outer if, case 1 in the
    // next, etc.). The depth to $next from case i's then is
    // `fctx.loopDepth + i + 1`.
    const brDepth = fctx.loopDepth + i + 1;
    const thenBody: WasmInstr[] = [];
    // Extract bindings.
    for (let bi = 0; bi < c.bindings.length; bi++) {
      thenBody.push({ op: "i32.const", value: bi });
      thenBody.push({ op: "call", funcIdx: importIdx(fctx, "__match_binding") });
      thenBody.push({ op: "local.set", idx: vreg(fctx, c.bindings[bi].reg) });
    }
    // Set $block to the case's target.
    const targetIdx = blockIndex(fctx, c.block);
    thenBody.push({ op: "i32.const", value: targetIdx });
    thenBody.push({ op: "local.set", idx: fctx.blockLocalIdx });
    thenBody.push({ op: "br", label: brDepth });
    const elseBody = buildCase(i + 1);
    return [
      { op: "local.get", idx: fctx.blockLocalIdx },
      { op: "i32.const", value: i },
      { op: "i32.eq" },
      {
        op: "if",
        blockType: "void",
        then: thenBody,
        else: elseBody,
      },
    ];
  }

  out.push(...buildCase(0));
}

function sanitizeName(name: string): string {
  return "_ae_" + name.replace(/[^a-zA-Z0-9_]/g, "_");
}

//----------------------------------------------------------------------------
// WASM text format (.wat) emission
//----------------------------------------------------------------------------

export function emitWasmText(module: WasmModule): string {
  const lines: string[] = ["(module"];

  for (const imp of module.imports) {
    const params = imp.params.map((p) => `(param ${p})`).join(" ");
    const results = imp.results.map((r) => `(result ${r})`).join(" ");
    const sig = [params, results].filter((s) => s).join(" ");
    lines.push(`  (import "${imp.module}" "${imp.name}" (func $${imp.name} ${sig}))`.replace(/\s+/g, " "));
  }

  if (module.memory) {
    const max = module.memory.max !== undefined ? ` (max ${module.memory.max})` : "";
    lines.push(`  (memory ${module.memory.min}${max})`);
  }

  for (const fn of module.funcs) {
    const params = fn.params.map((p, i) => `(param $p${i} ${p})`).join(" ");
    const results = fn.results.map((r) => `(result ${r})`).join(" ");
    const locals = fn.locals.map((l, i) => `(local $l${i} ${l})`).join(" ");
    const sig = [params, results].filter((s) => s).join(" ");
    lines.push(`  (func $${fn.name} ${sig} ${locals}`.replace(/\s+/g, " "));
    lines.push(emitInstrsText(fn.body, 4));
    lines.push(`  )`);
  }

  for (const exp of module.exports) {
    if (exp.kind === "func") {
      const fn = module.funcs[exp.idx - module.imports.length];
      if (fn) lines.push(`  (export "${exp.name}" (func $${fn.name}))`);
    } else if (exp.kind === "memory") {
      lines.push(`  (export "${exp.name}" (memory 0))`);
    }
  }

  lines.push(")");
  return lines.join("\n");
}

function emitInstrsText(instrs: WasmInstr[], indent: number): string {
  return instrs.map((i) => emitInstrText(i, indent)).join("\n");
}

function emitInstrText(instr: WasmInstr, indent: number): string {
  const pad = " ".repeat(indent);
  switch (instr.op) {
    case "i32.const": return `${pad}i32.const ${instr.value}`;
    case "i64.const": return `${pad}i64.const ${instr.value}`;
    case "f64.const": return `${pad}f64.const ${instr.value}`;
    case "local.get": return `${pad}local.get ${instr.idx}`;
    case "local.set": return `${pad}local.set ${instr.idx}`;
    case "local.tee": return `${pad}local.tee ${instr.idx}`;
    case "global.get": return `${pad}global.get ${instr.idx}`;
    case "global.set": return `${pad}global.set ${instr.idx}`;
    case "drop": return `${pad}drop`;
    case "select": return `${pad}select`;
    case "call": return `${pad}call ${instr.funcIdx}`;
    case "call_indirect": return `${pad}call_indirect (type ${instr.typeIdx})`;
    case "br": return `${pad}br ${instr.label}`;
    case "br_if": return `${pad}br_if ${instr.label}`;
    case "br_table": return `${pad}br_table ${instr.labels.join(" ")} ${instr.default}`;
    case "return": return `${pad}return`;
    case "unreachable": return `${pad}unreachable`;
    case "nop": return `${pad}nop`;
    case "block": {
      const inner = emitInstrsText(instr.body, indent + 2);
      return `${pad}block ${instr.blockType}\n${inner}\n${pad}end`;
    }
    case "loop": {
      const inner = emitInstrsText(instr.body, indent + 2);
      return `${pad}loop ${instr.blockType}\n${inner}\n${pad}end`;
    }
    case "if": {
      const thenText = emitInstrsText(instr.then, indent + 2);
      if (instr.else && instr.else.length > 0) {
        const elseText = emitInstrsText(instr.else, indent + 2);
        return `${pad}if ${instr.blockType}\n${thenText}\n${pad}else\n${elseText}\n${pad}end`;
      }
      return `${pad}if ${instr.blockType}\n${thenText}\n${pad}end`;
    }
    default: return `${pad}${instr.op}`;
  }
}

//----------------------------------------------------------------------------
// WASM binary format (.wasm) emission
//----------------------------------------------------------------------------

function encodeU32(n: number): number[] {
  const out: number[] = [];
  n = n >>> 0;
  while (true) {
    let b = n & 0x7f;
    n = n >>> 7;
    if (n !== 0) out.push(b | 0x80);
    else { out.push(b); break; }
  }
  return out;
}

function encodeS32(n: number): number[] {
  const out: number[] = [];
  n = n | 0;
  let more = true;
  while (more) {
    let b = n & 0x7f;
    n = n >> 7;
    if ((n === 0 && (b & 0x40) === 0) || (n === -1 && (b & 0x40) !== 0)) {
      more = false;
    } else {
      b |= 0x80;
    }
    out.push(b);
  }
  return out;
}

function encodeS64(n: bigint | number): number[] {
  if (typeof n === "number") n = BigInt(n);
  const out: number[] = [];
  let more = true;
  while (more) {
    let b = Number(n & 0x7fn);
    n >>= 7n;
    if ((n === 0n && (b & 0x40) === 0) || (n === -1n && (b & 0x40) !== 0)) {
      more = false;
    } else {
      b |= 0x80;
    }
    out.push(b);
  }
  return out;
}

function encodeF64(v: number): number[] {
  const buf = new ArrayBuffer(8);
  new Float64Array(buf)[0] = v;
  return Array.from(new Uint8Array(buf));
}

function encodeValType(t: WasmValType): number {
  switch (t) {
    case "i32": return 0x7f;
    case "i64": return 0x7e;
    case "f32": return 0x7d;
    case "f64": return 0x7c;
  }
}

function encodeBlockType(t: WasmBlockType): number[] {
  if (t === "void") return [0x40];
  return [encodeValType(t)];
}

export function emitWasmBinary(module: WasmModule): Uint8Array {
  const bytes: number[] = [];
  // Magic + version.
  bytes.push(0x00, 0x61, 0x73, 0x6d);
  bytes.push(0x01, 0x00, 0x00, 0x00);

  // --- Type section (1) ---
  const types: { params: WasmValType[]; results: WasmValType[] }[] = [];
  const typeMap = new Map<string, number>();
  function typeIdx(params: WasmValType[], results: WasmValType[]): number {
    const key = params.join(",") + "|" + results.join(",");
    let idx = typeMap.get(key);
    if (idx !== undefined) return idx;
    idx = types.length;
    types.push({ params, results });
    typeMap.set(key, idx);
    return idx;
  }

  const importTypeIdx: number[] = module.imports.map((imp) => typeIdx(imp.params, imp.results));
  const funcTypeIdx: number[] = module.funcs.map((fn) => typeIdx(fn.params, fn.results));

  const typeSection: number[] = [...encodeU32(types.length)];
  for (const t of types) {
    typeSection.push(0x60);
    typeSection.push(...encodeU32(t.params.length));
    for (const p of t.params) typeSection.push(encodeValType(p));
    typeSection.push(...encodeU32(t.results.length));
    for (const r of t.results) typeSection.push(encodeValType(r));
  }
  emitSection(bytes, 1, typeSection);

  // --- Import section (2) ---
  const importSection: number[] = [...encodeU32(module.imports.length)];
  for (let i = 0; i < module.imports.length; i++) {
    const imp = module.imports[i];
    importSection.push(...encodeStr(imp.module));
    importSection.push(...encodeStr(imp.name));
    importSection.push(0x00); // func import
    importSection.push(...encodeU32(importTypeIdx[i]));
  }
  emitSection(bytes, 2, importSection);

  // --- Function section (3) ---
  const funcSection: number[] = [...encodeU32(module.funcs.length)];
  for (const tIdx of funcTypeIdx) {
    funcSection.push(...encodeU32(tIdx));
  }
  emitSection(bytes, 3, funcSection);

  // --- Memory section (5) ---
  if (module.memory) {
    const memSection: number[] = [1]; // 1 memory
    if (module.memory.max !== undefined) {
      memSection.push(0x01);
      memSection.push(...encodeU32(module.memory.min));
      memSection.push(...encodeU32(module.memory.max));
    } else {
      memSection.push(0x00);
      memSection.push(...encodeU32(module.memory.min));
    }
    emitSection(bytes, 5, memSection);
  }

  // --- Export section (7) ---
  const exportSection: number[] = [...encodeU32(module.exports.length)];
  for (const exp of module.exports) {
    exportSection.push(...encodeStr(exp.name));
    if (exp.kind === "func") {
      exportSection.push(0x00);
      exportSection.push(...encodeU32(exp.idx));
    } else if (exp.kind === "memory") {
      exportSection.push(0x02);
      exportSection.push(...encodeU32(exp.idx));
    }
  }
  emitSection(bytes, 7, exportSection);

  // --- Code section (10) ---
  const codeSection: number[] = [...encodeU32(module.funcs.length)];
  for (const fn of module.funcs) {
    const funcBytes: number[] = [];
    const localGroups: { count: number; type: WasmValType }[] = [];
    for (const l of fn.locals) {
      const last = localGroups[localGroups.length - 1];
      if (last && last.type === l) last.count++;
      else localGroups.push({ count: 1, type: l });
    }
    funcBytes.push(...encodeU32(localGroups.length));
    for (const g of localGroups) {
      funcBytes.push(...encodeU32(g.count));
      funcBytes.push(encodeValType(g.type));
    }
    for (const instr of fn.body) {
      emitInstrBinary(instr, funcBytes);
    }
    funcBytes.push(0x0b); // end of function
    codeSection.push(...encodeU32(funcBytes.length));
    codeSection.push(...funcBytes);
  }
  emitSection(bytes, 10, codeSection);

  return new Uint8Array(bytes);
}

function emitSection(bytes: number[], id: number, data: number[]): void {
  bytes.push(id);
  bytes.push(...encodeU32(data.length));
  bytes.push(...data);
}

function encodeStr(s: string): number[] {
  const utf8 = new TextEncoder().encode(s);
  return [...encodeU32(utf8.length), ...utf8];
}

const OPCODES: Record<string, number> = {
  "unreachable": 0x00, "nop": 0x01,
  "block": 0x02, "loop": 0x03, "if": 0x04, "else": 0x05,
  "br": 0x0c, "br_if": 0x0d, "br_table": 0x0e, "return": 0x0f,
  "call": 0x10, "call_indirect": 0x11,
  "drop": 0x1a, "select": 0x1b,
  "local.get": 0x20, "local.set": 0x21, "local.tee": 0x22,
  "global.get": 0x23, "global.set": 0x24,
  "i32.const": 0x41, "i64.const": 0x42, "f32.const": 0x43, "f64.const": 0x44,
  "i32.eqz": 0x45, "i32.eq": 0x46, "i32.ne": 0x47,
  "i32.lt_s": 0x48, "i32.lt_u": 0x49, "i32.gt_s": 0x4a, "i32.gt_u": 0x4b,
  "i32.le_s": 0x4c, "i32.le_u": 0x4d, "i32.ge_s": 0x4e, "i32.ge_u": 0x4f,
  "i32.clz": 0x67, "i32.ctz": 0x68, "i32.popcnt": 0x69,
  "i32.add": 0x6a, "i32.sub": 0x6b, "i32.mul": 0x6c,
  "i32.div_s": 0x6d, "i32.div_u": 0x6e, "i32.rem_s": 0x6f, "i32.rem_u": 0x70,
  "i32.and": 0x71, "i32.or": 0x72, "i32.xor": 0x73,
  "i32.shl": 0x74, "i32.shr_s": 0x75, "i32.shr_u": 0x76,
  "i32.rotl": 0x77, "i32.rotr": 0x78,
  "f64.eq": 0x61, "f64.ne": 0x62, "f64.lt": 0x63, "f64.gt": 0x64,
  "f64.le": 0x65, "f64.ge": 0x66,
  "f64.abs": 0x99, "f64.neg": 0x9a, "f64.ceil": 0x9d, "f64.floor": 0x9e,
  "f64.trunc": 0x9c, "f64.nearest": 0x9b, "f64.sqrt": 0x9f,
  "f64.add": 0xa0, "f64.sub": 0xa1, "f64.mul": 0xa2, "f64.div": 0xa3,
  "f64.min": 0xa4, "f64.max": 0xa5,
};

function emitInstrBinary(instr: WasmInstr, out: number[]): void {
  switch (instr.op) {
    case "i32.const":
      out.push(0x41, ...encodeS32(instr.value));
      return;
    case "i64.const":
      out.push(0x42, ...encodeS64(instr.value));
      return;
    case "f64.const":
      out.push(0x44, ...encodeF64(instr.value));
      return;
    case "local.get":
      out.push(0x20, ...encodeU32(instr.idx));
      return;
    case "local.set":
      out.push(0x21, ...encodeU32(instr.idx));
      return;
    case "local.tee":
      out.push(0x22, ...encodeU32(instr.idx));
      return;
    case "global.get":
      out.push(0x23, ...encodeU32(instr.idx));
      return;
    case "global.set":
      out.push(0x24, ...encodeU32(instr.idx));
      return;
    case "drop":
      out.push(0x1a);
      return;
    case "select":
      out.push(0x1b);
      return;
    case "call":
      out.push(0x10, ...encodeU32(instr.funcIdx));
      return;
    case "call_indirect":
      out.push(0x11, ...encodeU32(instr.typeIdx), ...encodeU32(instr.tableIdx));
      return;
    case "br":
      out.push(0x0c, ...encodeU32(instr.label));
      return;
    case "br_if":
      out.push(0x0d, ...encodeU32(instr.label));
      return;
    case "br_table": {
      out.push(0x0e);
      out.push(...encodeU32(instr.labels.length));
      for (const l of instr.labels) out.push(...encodeU32(l));
      out.push(...encodeU32(instr.default));
      return;
    }
    case "return":
      out.push(0x0f);
      return;
    case "unreachable":
      out.push(0x00);
      return;
    case "nop":
      out.push(0x01);
      return;
    case "block":
      out.push(0x02, ...encodeBlockType(instr.blockType));
      for (const sub of instr.body) emitInstrBinary(sub, out);
      out.push(0x0b);
      return;
    case "loop":
      out.push(0x03, ...encodeBlockType(instr.blockType));
      for (const sub of instr.body) emitInstrBinary(sub, out);
      out.push(0x0b);
      return;
    case "if":
      out.push(0x04, ...encodeBlockType(instr.blockType));
      for (const sub of instr.then) emitInstrBinary(sub, out);
      if (instr.else && instr.else.length > 0) {
        out.push(0x05);
        for (const sub of instr.else) emitInstrBinary(sub, out);
      }
      out.push(0x0b);
      return;
    default: {
      const op = OPCODES[instr.op];
      if (op === undefined) throw new Error(`WASM binary: unsupported op ${instr.op}`);
      out.push(op);
      return;
    }
  }
}

//----------------------------------------------------------------------------
// Host runtime (the JS side of the imports)
//----------------------------------------------------------------------------

export interface WasmHost {
  instance: WebAssembly.Instance | null;
  heap: Value[];
  upvalueStack: { value: Value }[][];
  output: string[];
  strings: string[];
  floats: number[];
  bigints: number[];
  matchTables: any[];
  currentBindings: Value[];
  funcNames: string[];
  /** Map from Aether function name (e.g., "rot13_char") → sanitized WASM
   * export name (e.g., "_ae_rot13_char"). Set at compile time so the host
   * can dispatch CallBuiltin ops that target user-defined functions
   * (which the IR lowers as CallBuiltin when the function isn't in the
   * calling scope's captured set). */
  funcNameToExport: Map<string, string>;
}

export function createHost(): WasmHost {
  return {
    instance: null,
    heap: [null],
    upvalueStack: [],
    output: [],
    strings: [],
    floats: [],
    bigints: [],
    matchTables: [],
    currentBindings: [],
    funcNames: [],
    funcNameToExport: new Map(),
  };
}

function heapAlloc(host: WasmHost, v: Value): number {
  host.heap.push(v);
  return host.heap.length - 1;
}

function encodeValue(host: WasmHost, v: Value): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "boolean") return v ? 2 : 0;
  if (typeof v === "number") {
    if (Number.isInteger(v) && v >= -1073741824 && v <= 1073741823) {
      return (v << 1) | 0;
    }
    const idx = heapAlloc(host, v);
    return (idx << 1) | 1;
  }
  const idx = heapAlloc(host, v);
  return (idx << 1) | 1;
}

function decodeValue(host: WasmHost, n: number): Value {
  n = n | 0;
  if ((n & 1) === 0) {
    return n >> 1;
  }
  const idx = n >>> 1;
  if (idx === 0) return null;
  return host.heap[idx] ?? null;
}

export function createWasmImports(host: WasmHost): WebAssembly.Imports {
  const env: Record<string, any> = {};

  const currentUpvalues = (): { value: Value }[] => {
    if (host.upvalueStack.length === 0) return [];
    return host.upvalueStack[host.upvalueStack.length - 1];
  };

  const callWasmFunc = (name: string, ...args: number[]): number => {
    if (!host.instance) throw new Error("WASM host: instance not set");
    const fn = (host.instance.exports as Record<string, any>)[name];
    if (typeof fn !== "function") throw new Error(`WASM host: export '${name}' not found`);
    return fn(...args) | 0;
  };

  // --- Constants ---
  env.__const_str = (idx: number): number => encodeValue(host, host.strings[idx]);
  env.__const_float = (idx: number): number => encodeValue(host, host.floats[idx]);
  env.__const_bigint = (idx: number): number => encodeValue(host, host.bigints[idx]);

  // --- Print / panic ---
  env.__print = (v: number): void => {
    host.output.push(display(decodeValue(host, v)));
  };
  env.__panic = (v: number): void => {
    throw new Error(`Aether panic: ${display(decodeValue(host, v))}`);
  };

  // --- Binary ops ---
  const binOps: Record<string, (a: Value, b: Value) => Value> = {
    add: (a, b) => {
      if (typeof a === "string" || typeof b === "string") return display(a) + display(b);
      if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
      return (a as number) + (b as number);
    },
    sub: (a, b) => (a as number) - (b as number),
    mul: (a, b) => (a as number) * (b as number),
    div: (a, b) => {
      if ((b as number) === 0) throw new Error("division by zero");
      return (a as number) / (b as number);
    },
    idiv: (a, b) => {
      if ((b as number) === 0) throw new Error("division by zero");
      return Math.trunc((a as number) / (b as number));
    },
    mod: (a, b) => {
      const bv = Math.trunc(b as number);
      if (bv === 0) throw new Error("modulo by zero");
      const av = Math.trunc(a as number);
      return ((av % bv) + bv) % bv;
    },
    eq: (a, b) => valueEq(a, b) as unknown as Value,
    neq: (a, b) => (!valueEq(a, b)) as unknown as Value,
    lt: (a, b) => ((a as number) < (b as number)) as unknown as Value,
    le: (a, b) => ((a as number) <= (b as number)) as unknown as Value,
    gt: (a, b) => ((a as number) > (b as number)) as unknown as Value,
    ge: (a, b) => ((a as number) >= (b as number)) as unknown as Value,
    bitand: (a, b) => (Math.trunc(a as number) & Math.trunc(b as number)) | 0,
    bitor: (a, b) => (Math.trunc(a as number) | Math.trunc(b as number)) | 0,
    bitxor: (a, b) => (Math.trunc(a as number) ^ Math.trunc(b as number)) | 0,
    shl: (a, b) => (Math.trunc(a as number) << Math.trunc(b as number)) | 0,
    shr: (a, b) => (Math.trunc(a as number) >> Math.trunc(b as number)) | 0,
    and: (a, b) => (truthy(a) && truthy(b)) as unknown as Value,
    or: (a, b) => (truthy(a) || truthy(b)) as unknown as Value,
  };
  for (const [name, fn] of Object.entries(binOps)) {
    env[`__bin_${name}`] = (a: number, b: number): number => {
      const av = decodeValue(host, a);
      const bv = decodeValue(host, b);
      return encodeValue(host, fn(av, bv));
    };
  }

  // --- Unary ops ---
  env.__un_neg = (v: number): number => encodeValue(host, -(decodeValue(host, v) as number));
  env.__un_not = (v: number): number => encodeValue(host, !truthy(decodeValue(host, v)));
  env.__un_bitnot = (v: number): number => encodeValue(host, ~Math.trunc(decodeValue(host, v) as number));

  // --- Alloc ops (per arity) ---
  for (let n = 0; n <= 16; n++) {
    ((n: number) => {
      env[`__alloc_struct_${n}`] = (...args: number[]): number => {
        const name = host.strings[args[0]];
        const fields: Record<string, Value> = {};
        for (let i = 0; i < n; i++) {
          const fName = host.strings[args[1 + i * 2]];
          const fVal = decodeValue(host, args[2 + i * 2]);
          fields[fName] = fVal;
        }
        return encodeValue(host, { __struct: name, fields } as Value);
      };
      env[`__alloc_variant_${n}`] = (...args: number[]): number => {
        const enumName = host.strings[args[0]];
        const variant = host.strings[args[1]];
        const data: Value[] = [];
        for (let i = 0; i < n; i++) data.push(decodeValue(host, args[2 + i]));
        return encodeValue(host, { __variant: enumName, variant, data } as Value);
      };
      env[`__alloc_array_${n}`] = (...args: number[]): number => {
        const arr: Value[] = args.map((a) => decodeValue(host, a));
        return encodeValue(host, arr);
      };
      env[`__alloc_tuple_${n}`] = (...args: number[]): number => {
        const arr: Value[] = args.map((a) => decodeValue(host, a));
        return encodeValue(host, arr);
      };
      env[`__alloc_map_${n}`] = (...args: number[]): number => {
        const m = new Map<Value, Value>();
        for (let i = 0; i < n; i++) {
          const k = decodeValue(host, args[i * 2]);
          const v = decodeValue(host, args[i * 2 + 1]);
          m.set(k, v);
        }
        return encodeValue(host, m as unknown as Value);
      };
      env[`__make_closure_${n}`] = (funcIdx: number, ...caps: number[]): number => {
        const captures = caps.map((c) => ({ value: decodeValue(host, c) }));
        const closure = {
          __closure: true,
          func: funcIdx,
          funcName: host.funcNames[funcIdx],
          captures,
        };
        return encodeValue(host, closure as unknown as Value);
      };
      env[`__call_closure_${n}`] = (closureRef: number, ...args: number[]): number => {
        const closure = decodeValue(host, closureRef) as any;
        if (!closure || !closure.__closure) {
          throw new Error(`WASM: cannot call non-closure value: ${display(closure)}`);
        }
        host.upvalueStack.push(closure.captures);
        try {
          return callWasmFunc(closure.funcName, closureRef, ...args);
        } finally {
          host.upvalueStack.pop();
        }
      };
    })(n);
  }

  // --- Alloc range ---
  env.__alloc_range = (start: number, end: number, inclusive: number): number => {
    const s = decodeValue(host, start) as number;
    const e = decodeValue(host, end) as number;
    const adjEnd = inclusive ? e + 1 : e;
    return encodeValue(host, { __range: "range", start: s, end: adjEnd, step: 1 } as Value);
  };

  // --- Field / index access ---
  env.__field_get = (objRef: number, nameIdx: number): number => {
    const obj = decodeValue(host, objRef) as any;
    const name = host.strings[nameIdx];
    if (!obj || !obj.__struct) throw new Error(`cannot access field '${name}' on ${typeof obj}`);
    if (!(name in obj.fields)) throw new Error(`struct ${obj.__struct} has no field '${name}'`);
    return encodeValue(host, obj.fields[name]);
  };
  env.__field_set = (objRef: number, nameIdx: number, valRef: number): void => {
    const obj = decodeValue(host, objRef) as any;
    const name = host.strings[nameIdx];
    if (!obj || !obj.__struct) throw new Error(`cannot assign field '${name}' on non-struct`);
    obj.fields[name] = decodeValue(host, valRef);
  };
  env.__index_get = (objRef: number, idxRef: number): number => {
    const obj = decodeValue(host, objRef);
    const idx = decodeValue(host, idxRef);
    if (Array.isArray(obj)) {
      const i = idx as number;
      if (i < 0 || i >= obj.length) throw new Error(`array index out of bounds: ${i}`);
      return encodeValue(host, obj[i]);
    }
    if (typeof obj === "string") {
      const i = idx as number;
      if (i < 0 || i >= obj.length) throw new Error(`string index out of bounds: ${i}`);
      return encodeValue(host, obj[i]);
    }
    if (obj instanceof Map) {
      if (!(obj as Map<Value, Value>).has(idx)) throw new Error(`map key not found: ${display(idx)}`);
      return encodeValue(host, (obj as Map<Value, Value>).get(idx) as Value);
    }
    throw new Error(`cannot index into ${typeof obj}`);
  };
  env.__index_set = (objRef: number, idxRef: number, valRef: number): void => {
    const obj = decodeValue(host, objRef);
    const idx = decodeValue(host, idxRef);
    const val = decodeValue(host, valRef);
    if (Array.isArray(obj)) {
      const i = idx as number;
      if (i < 0 || i >= obj.length) throw new Error(`array index out of bounds: ${i}`);
      obj[i] = val;
    } else if (obj instanceof Map) {
      (obj as Map<Value, Value>).set(idx, val);
    } else {
      throw new Error("cannot index-assign into non-array/map");
    }
  };
  env.__tuple_get = (objRef: number, idx: number): number => {
    const obj = decodeValue(host, objRef);
    if (!Array.isArray(obj)) throw new Error(`cannot apply tuple field .${idx} to non-tuple`);
    if (idx < 0 || idx >= obj.length) throw new Error(`tuple index out of bounds: ${idx}`);
    return encodeValue(host, obj[idx]);
  };
  env.__len = (vRef: number): number => {
    const v = decodeValue(host, vRef);
    if (typeof v === "string" || Array.isArray(v)) return encodeValue(host, v.length);
    if (v instanceof Map) return encodeValue(host, (v as Map<Value, Value>).size);
    if (v && typeof v === "object" && (v as any).__struct) return encodeValue(host, Object.keys((v as any).fields).length);
    throw new Error(`len: unsupported value ${typeof v}`);
  };

  // --- Boxes ---
  env.__make_box = (vRef: number): number => encodeValue(host, { __box: true, value: decodeValue(host, vRef) } as Value);
  env.__unbox = (vRef: number): number => {
    const v = decodeValue(host, vRef) as any;
    if (v && v.__box) return encodeValue(host, v.value);
    return vRef;
  };
  env.__set_box = (boxRef: number, valRef: number): void => {
    const box = decodeValue(host, boxRef) as any;
    if (box && box.__box) box.value = decodeValue(host, valRef);
  };

  // --- Upvalues ---
  env.__get_upvalue = (idx: number): number => {
    const ups = currentUpvalues();
    if (idx < 0 || idx >= ups.length) throw new Error(`upvalue out of range: ${idx}`);
    return encodeValue(host, ups[idx].value);
  };
  env.__set_upvalue = (idx: number, valRef: number): void => {
    const ups = currentUpvalues();
    if (idx < 0 || idx >= ups.length) throw new Error(`upvalue out of range: ${idx}`);
    ups[idx].value = decodeValue(host, valRef);
  };

  // --- Casts ---
  env.__cast_int = (vRef: number): number => {
    const v = decodeValue(host, vRef);
    if (typeof v === "string") {
      const n = parseInt(v, 10);
      if (Number.isNaN(n)) throw new Error(`int: cannot parse '${v}'`);
      return encodeValue(host, n);
    }
    return encodeValue(host, Math.trunc(v as number));
  };
  env.__cast_float = (vRef: number): number => encodeValue(host, decodeValue(host, vRef) as number);
  env.__cast_bool = (vRef: number): number => encodeValue(host, !!truthy(decodeValue(host, vRef)));
  env.__cast_string = (vRef: number): number => encodeValue(host, display(decodeValue(host, vRef)));

  // --- Match ---
  env.__match_dispatch = (scrutineeRef: number, matchId: number): number => {
    const table = host.matchTables[matchId];
    if (!table) throw new Error(`WASM: no match table for id ${matchId}`);
    const scrutinee = decodeValue(host, scrutineeRef);
    for (let i = 0; i < table.cases.length; i++) {
      const bindings: Value[] = [];
      if (tryMatch(table.cases[i].pattern, scrutinee, bindings)) {
        host.currentBindings = bindings;
        return i;
      }
    }
    host.currentBindings = [];
    return table.cases.length;
  };
  env.__match_binding = (idx: number): number => {
    if (idx < 0 || idx >= host.currentBindings.length) throw new Error(`match binding out of range: ${idx}`);
    return encodeValue(host, host.currentBindings[idx]);
  };

  // --- Builtins (per arity) ---
  for (let n = 0; n <= 8; n++) {
    ((n: number) => {
      env[`__builtin_${n}`] = (nameIdx: number, ...args: number[]): number => {
        const name = host.strings[nameIdx];
        // First, check if this is actually a user-defined function (the IR
        // emits CallBuiltin for top-level functions not in the calling
        // scope's captured set). Look up the export name.
        const exportName = host.funcNameToExport.get(name);
        if (exportName !== undefined) {
          // Call the WASM function by export name. The first arg is the
          // closure self-reference — for top-level functions, we don't
          // have one, so pass 0 (null). The function's upvalue stack
          // should be empty for non-closure top-level calls.
          host.upvalueStack.push([]);
          try {
            const result = callWasmFunc(exportName, 0, ...args);
            return result;
          } finally {
            host.upvalueStack.pop();
          }
        }
        const decodedArgs = args.map((a) => decodeValue(host, a));
        const result = callBuiltin(host, name, decodedArgs);
        return encodeValue(host, result);
      };
    })(n);
  }

  return { env };
}

function tryMatch(pattern: any, value: Value, bindings: Value[]): boolean {
  switch (pattern.kind) {
    case "WildcardPat": return true;
    case "BindPat":
      bindings.push(value);
      return true;
    case "LitPat":
      return valueEq(value, evalLitPattern(pattern.value));
    case "TuplePat": {
      if (!Array.isArray(value)) return false;
      if (pattern.elements.length !== value.length) return false;
      for (let i = 0; i < pattern.elements.length; i++) {
        if (!tryMatch(pattern.elements[i], value[i], bindings)) return false;
      }
      return true;
    }
    case "ArrayPat": {
      if (!Array.isArray(value)) return false;
      if (pattern.rest) {
        if (pattern.elements.length > value.length) return false;
      } else {
        if (pattern.elements.length !== value.length) return false;
      }
      for (let i = 0; i < pattern.elements.length; i++) {
        if (!tryMatch(pattern.elements[i], value[i], bindings)) return false;
      }
      return true;
    }
    case "StructPat": {
      if (!value || typeof value !== "object" || !(value as any).__struct) return false;
      if (pattern.name && (value as any).__struct !== pattern.name) return false;
      for (const f of pattern.fields) {
        if (!(f.name in (value as any).fields)) return false;
        if (!tryMatch(f.pattern, (value as any).fields[f.name], bindings)) return false;
      }
      return true;
    }
    case "EnumPat": {
      if (!value || typeof value !== "object" || !(value as any).__variant) return false;
      if (pattern.enumName && (value as any).__variant !== pattern.enumName) return false;
      if (pattern.variant && (value as any).variant !== pattern.variant) return false;
      if (pattern.subpatterns.length !== (value as any).data.length) {
        if (pattern.subpatterns.length === 0 && (value as any).data.length === 0) return true;
        return false;
      }
      for (let i = 0; i < pattern.subpatterns.length; i++) {
        if (!tryMatch(pattern.subpatterns[i], (value as any).data[i], bindings)) return false;
      }
      return true;
    }
    case "OrPat": {
      for (const sub of pattern.patterns) {
        const saved = bindings.slice();
        if (tryMatch(sub, value, bindings)) return true;
        bindings.length = 0;
        bindings.push(...saved);
      }
      return false;
    }
    case "RestPat": return true;
  }
  return false;
}

function evalLitPattern(e: any): Value {
  switch (e.kind) {
    case "IntLit": return e.value;
    case "FloatLit": return e.value;
    case "BoolLit": return e.value;
    case "CharLit": return e.value;
    case "StringLit": {
      let s = "";
      for (const seg of e.segments) {
        if (seg.kind === "text") s += seg.value;
      }
      return s;
    }
    case "UnitLit": return null;
    case "Paren": return evalLitPattern(e.expr);
    case "Unary": {
      const inner = evalLitPattern(e.operand);
      if (e.op === "-" && typeof inner === "number") return -inner;
      return inner;
    }
  }
  return null;
}

function truthy(v: Value): boolean {
  if (typeof v === "boolean") return v;
  if (v === null) return false;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map) return v.size > 0;
  return true;
}

function callBuiltin(host: WasmHost, name: string, args: Value[]): Value {
  switch (name) {
    case "print":
    case "println":
      host.output.push(display(args[0]));
      return null;
    case "range": {
      let start = 0, end = 0, step = 1;
      if (args.length === 1) end = args[0] as number;
      else if (args.length === 2) { start = args[0] as number; end = args[1] as number; }
      else if (args.length >= 3) { start = args[0] as number; end = args[1] as number; step = args[2] as number; }
      return { __range: "range", start, end, step } as Value;
    }
    case "len": {
      const v = args[0];
      if (typeof v === "string" || Array.isArray(v)) return v.length;
      if (v instanceof Map) return v.size;
      if (v && typeof v === "object" && (v as any).__struct) return Object.keys((v as any).fields).length;
      throw new Error(`len: unsupported value ${typeof v}`);
    }
    case "type_of": {
      const v = args[0];
      if (v === null) return "unit";
      if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
      if (typeof v === "string") return "string";
      if (typeof v === "boolean") return "bool";
      if (Array.isArray(v)) return "array";
      if (v instanceof Map) return "map";
      if ((v as any)?.__struct) return (v as any).__struct;
      if ((v as any)?.__variant) return (v as any).__variant;
      if ((v as any)?.__closure) return "fn";
      if ((v as any)?.__range) return "range";
      return typeof v;
    }
    case "assert":
      if (!truthy(args[0])) throw new Error(`assertion failed${args[1] ? ": " + display(args[1]) : ""}`);
      return null;
    case "assert_eq":
      if (!valueEq(args[0], args[1])) throw new Error(`assertion failed: ${display(args[0])} != ${display(args[1])}`);
      return null;
    case "panic":
      throw new Error(display(args[0]));
    case "str":
      return display(args[0]);
    case "int": {
      const v = args[0];
      if (typeof v === "string") {
        const n = parseInt(v, 10);
        if (Number.isNaN(n)) throw new Error(`int: cannot parse '${v}'`);
        return n;
      }
      return Math.trunc(v as number);
    }
    case "float": {
      const v = args[0];
      if (typeof v === "string") {
        const n = parseFloat(v);
        if (Number.isNaN(n)) throw new Error(`float: cannot parse '${v}'`);
        return n;
      }
      return v as number;
    }
    case "min":
      if (args.length === 1 && Array.isArray(args[0])) return Math.min(...(args[0] as number[]));
      return Math.min(...(args as number[]));
    case "max":
      if (args.length === 1 && Array.isArray(args[0])) return Math.max(...(args[0] as number[]));
      return Math.max(...(args as number[]));
    case "abs":
      return Math.abs(args[0] as number);
    case "sqrt":
      return Math.sqrt(args[0] as number);
    case "push": {
      const arr = args[0];
      if (!Array.isArray(arr)) throw new Error("push: expected array");
      arr.push(args[1]);
      return arr;
    }
    case "pop": {
      const arr = args[0];
      if (!Array.isArray(arr)) throw new Error("pop: expected array");
      return arr.pop() ?? null;
    }
    case "iter_to_items": {
      const v = args[0];
      if (Array.isArray(v)) return v;
      if ((v as any)?.__range) {
        const r = v as any;
        const out: Value[] = [];
        if (r.step > 0) for (let i = r.start; i < r.end; i += r.step) out.push(i);
        else if (r.step < 0) for (let i = r.start; i > r.end; i += r.step) out.push(i);
        return out;
      }
      if (typeof v === "string") return Array.from(v) as Value[];
      if (v instanceof Map) return Array.from((v as Map<Value, Value>).keys());
      throw new Error(`cannot iterate over ${typeof v}`);
    }
    case "map": {
      const arr = args[0];
      const fn = args[1];
      if (!Array.isArray(arr)) throw new Error("map: expected array");
      const out: Value[] = [];
      for (let i = 0; i < arr.length; i++) out.push(callValue(host, fn, [arr[i], i]));
      return out;
    }
    case "filter": {
      const arr = args[0];
      const fn = args[1];
      if (!Array.isArray(arr)) throw new Error("filter: expected array");
      const out: Value[] = [];
      for (let i = 0; i < arr.length; i++) {
        if (truthy(callValue(host, fn, [arr[i], i]))) out.push(arr[i]);
      }
      return out;
    }
    case "reduce": {
      const arr = args[0];
      const fn = args[1];
      const init = args[2];
      if (!Array.isArray(arr)) throw new Error("reduce: expected array");
      let acc = init;
      for (let i = 0; i < arr.length; i++) acc = callValue(host, fn, [acc, arr[i], i]);
      return acc;
    }
  }
  throw new Error(`unknown builtin '${name}'`);
}

function callValue(host: WasmHost, fnVal: Value, args: Value[]): Value {
  if (fnVal && typeof fnVal === "object" && (fnVal as any).__closure) {
    const c = fnVal as any;
    host.upvalueStack.push(c.captures);
    try {
      const encodedArgs = args.map((a) => encodeValue(host, a));
      const closureRef = encodeValue(host, c);
      const result = (host.instance!.exports as Record<string, any>)[c.funcName](closureRef, ...encodedArgs);
      return decodeValue(host, result);
    } finally {
      host.upvalueStack.pop();
    }
  }
  if (fnVal && typeof fnVal === "object" && (fnVal as any).__native) {
    return (fnVal as any).fn(...args);
  }
  throw new Error(`cannot call non-function value`);
}

//----------------------------------------------------------------------------
// compileAndRunWasm: convenience entry point
//----------------------------------------------------------------------------

export interface WasmRunResult {
  output: Value;
  outputs: string[];
  error?: string;
}

export async function compileAndRunWasm(
  source: string,
  args: Value[] = [],
): Promise<WasmRunResult> {
  try {
    const { tokens, errors: lexErrs } = lexWithErrors(source, "<aether>");
    if (lexErrs.length > 0) {
      return { output: null, outputs: [], error: lexErrs[0].message };
    }
    const { program, errors: parseErrs } = parse(tokens, "<aether>");
    if (parseErrs.length > 0 && program.body.length === 0) {
      return { output: null, outputs: [], error: parseErrs[0].message };
    }
    const ir = lowerToIr(program);
    const module = compileIrToWasm(ir);

    const host = createHost();
    host.strings = module.strings ?? [];
    host.floats = module.floats ?? [];
    host.bigints = module.bigints ?? [];
    host.matchTables = module.matchTables ?? [];
    host.funcNames = ir.funcs.map((f) => sanitizeName(f.name));
    // Build the function-name → export-name map. This lets the host's
    // `__builtin_N` handler dispatch CallBuiltin ops that target
    // user-defined functions (the IR emits these for top-level functions
    // not in the calling scope's captured set).
    for (const f of ir.funcs) {
      host.funcNameToExport.set(f.name, sanitizeName(f.name));
    }

    const binary = emitWasmBinary(module);
    const imports = createWasmImports(host);
    const { instance } = await WebAssembly.instantiate(binary, imports);
    host.instance = instance;

    const mainName = sanitizeName("<main>");
    const mainFn = (instance.exports as Record<string, any>)[mainName];
    if (typeof mainFn !== "function") {
      return { output: null, outputs: host.output, error: `entry function '${mainName}' not found` };
    }
    const resultEncoded = mainFn(0, ...args.map((a) => encodeValue(host, a))) | 0;
    const result = decodeValue(host, resultEncoded);
    return { output: result, outputs: host.output };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { output: null, outputs: [], error: msg };
  }
}
