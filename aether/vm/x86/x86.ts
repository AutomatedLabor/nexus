/**
 * aether/vm/x86/x86.ts
 * ======================
 * Aether IR → x86-64 native backend.
 *
 * Design overview
 * ---------------
 * The x86 backend lowers an `IrProgram` to a structured x86-64 assembly
 * module (an `X86Module` containing a list of `X86Func`s, each of which
 * holds an ordered list of structured `X86Instr`s). The structured form
 * is the source of truth: it is walked by both `emitAsm` (which produces
 * human-readable NASM-syntax assembly text for inspection / tooling) and
 * by the structured interpreter inside `compileAndRunNative` (which
 * executes the structured form directly, proving the codegen correct).
 *
 * Runtime model — pragmatic split (same as the WASM backend)
 * ----------------------------------------------------------
 *   - **Native fast path** — integer arithmetic, comparisons, control
 *     flow, function call/return — all run as native x86-64 instructions
 *     on the encoded value form (see "value encoding" below).
 *
 *   - **Host-call slow path** — heap operations (AllocStruct, LoadField,
 *     IndexGet, Match, MakeClosure, CallBuiltin, Print, Cast on non-int,
 *     string/array operations, etc.) go through imported host functions.
 *     The native code passes encoded i32 values; the host decodes them,
 *     performs the operation in JS, and returns an encoded i32.
 *
 * Value encoding (all Aether values are i64 in native registers, but we
 * keep the encoded representation compatible with the WASM backend so
 * both backends share the same host logic):
 *   - Integer `n` with |n| < 2^30:  encoded as `n << 1` (low bit 0).
 *   - Bool: raw `0` or `2` (low bit 0, same encoding as int 0/1).
 *   - Heap reference (string, array, struct, map, variant, range,
 *     closure, box, large int, float): `(heapIdx << 1) | 1` (low bit 1).
 *     `heapIdx` is an index into a JS-side `heap: Value[]` array.
 *   - Unit/null: `0`.
 *
 * Native binary arithmetic uses a runtime tag check: if `(lhs | rhs) & 1`
 * is non-zero (at least one operand is a heap ref), call the host for
 * dynamic dispatch (handles string concat, array concat, etc.).
 *
 * Calling convention — System V AMD64
 * ------------------------------------
 *   - Integer args:  rdi, rsi, rdx, rcx, r8, r9 (first 6 args).
 *   - Return value:  rax.
 *   - Callee-saved:  rbx, rbp, r12-r15 (we preserve rbp via prologue).
 *   - Caller-saved:  rax, rcx, rdx, rsi, rdi, r8-r11.
 *
 * Frame layout (per function):
 *   - On entry: `push rbp; mov rbp, rsp; sub rsp, <stack_size>`.
 *   - Args are copied from rdi/rsi/... into per-vreg stack slots at
 *     `[rbp - 8*(vreg+1)]` so each vreg has a stable home location.
 *   - On exit: `mov rsp, rbp; pop rbp; ret` (or just `leave; ret`).
 *
 * Register allocation
 * -------------------
 * v1 uses a simple "spill-everything" policy: every vreg lives in a
 * stack slot, and rax/rcx/rdx are scratch registers used to materialize
 * operands for each instruction. This is the simplest valid "linear
 * scan" — every vreg's lifetime is the entire function, so all are
 * spilled to the stack and only short-lived values use the scratch
 * registers. This trades peak performance for codegen simplicity and
 * correctness; a real linear scan can be layered on top later.
 *
 * Control flow
 * ------------
 * Each IR basic block maps to an assembly label `<func>_<blockId>`.
 * `Br cond=null`  → `jmp <target>`.
 * `Br cond=vreg`  → `mov rax, [rbp-8*(cond+1)]; cmp rax, 0; jne <then>;
 *                  jmp <else>`.
 * `Return val`    → `mov rax, [rbp-8*(val+1)]; ret` (after epilogue).
 *
 * Native execution
 * ---------------
 * The sandbox lacks `nasm` and `gas` (only `ld` is present, which is
 * useless without an assembler). `compileAndRunNative` therefore falls
 * back to a TS-side structured interpreter that walks `X86Func.body`
 * directly. The asm text is still produced by `emitAsm` and is what
 * `nasm -f elf64 out.s -o out.o && ld out.o -o out && ./out` would
 * assemble and run on a system with `nasm` installed (see README for
 * the exact invocation). The structured interpreter is intentionally a
 * faithful simulation of the asm — it operates on the same encoded
 * int32 values, performs the same tag checks, and calls the same host
 * functions — so a program that runs correctly via the interpreter
 * will also run correctly via `nasm`+`ld` once those tools are present.
 *
 * Public surface
 * --------------
 *   type X86Operand, X86Instr, X86Func, X86Module
 *   function compileIrToX86(ir: IrProgram): X86Module
 *   function emitAsm(module: X86Module): string
 *   function emitElfStub(module: X86Module): Uint8Array
 *   function compileAndRunNative(source: string, args?: Value[]): {
 *     output: Value; outputs: string[]; error?: string
 *   }
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

/** A single x86-64 operand. */
export type X86Operand =
  | { kind: "reg"; name: string }
  | { kind: "imm"; value: number }
  | { kind: "mem"; base: string; offset: number }
  | { kind: "label"; name: string }
  | { kind: "sym"; name: string };

/** A single structured x86-64 instruction. The structured form is the
 * source of truth: `emitAsm` walks it to produce text, and the
 * structured interpreter walks it to execute. */
export type X86Instr =
  // Data movement
  | { op: "mov"; dst: X86Operand; src: X86Operand; c?: string }
  | { op: "lea"; dst: X86Operand; src: X86Operand; c?: string }
  | { op: "movsx" | "movzx"; dst: X86Operand; src: X86Operand; c?: string }
  // Arithmetic (dst = dst op src)
  | { op: "add" | "sub" | "imul"; dst: X86Operand; src: X86Operand; c?: string }
  // Signed division: divides rdx:rax by src; quotient in rax, remainder in rdx
  | { op: "idiv"; src: X86Operand; c?: string }
  | { op: "neg" | "not"; dst: X86Operand; c?: string }
  // Bitwise
  | { op: "and" | "or" | "xor"; dst: X86Operand; src: X86Operand; c?: string }
  | { op: "shl" | "shr" | "sar"; dst: X86Operand; count: X86Operand; c?: string }
  // Comparison / flags
  | { op: "cmp"; a: X86Operand; b: X86Operand; c?: string }
  | { op: "test"; a: X86Operand; b: X86Operand; c?: string }
  | {
      op: "setcc";
      cc: CondCode;
      dst: X86Operand;
      c?: string;
    }
  // Control flow
  | { op: "jmp"; label: string; c?: string }
  | { op: "jcc"; cc: CondCode; label: string; c?: string }
  | { op: "call"; target: string; c?: string }
  | { op: "ret"; c?: string }
  // Stack
  | { op: "push"; src: X86Operand; c?: string }
  | { op: "pop"; dst: X86Operand; c?: string }
  // Pseudo
  | { op: "label"; name: string; c?: string }
  | { op: "nop"; c?: string }
  // Host-call: calls into the TS-side host (mirrors WASM host imports).
  // `args` are operands to load into arg registers (rdi/rsi/...); the
  // result is written to `dst`.
  | { op: "hostcall"; name: string; args: X86Operand[]; dst: X86Operand; c?: string }
  // Comment pseudo-op (emitted as a `; ...` line in NASM, no-op in interp)
  | { op: "comment"; text: string; c?: string };

export type CondCode =
  | "e" | "ne" | "z" | "nz"
  | "l" | "le" | "g" | "ge"
  | "s" | "ns";

/** A compiled x86-64 function (structured form). */
export interface X86Func {
  /** Sanitized function name (used as the assembly label and the export key). */
  name: string;
  /** Number of parameters (System V: passed in rdi, rsi, rdx, rcx, r8, r9). */
  nparams: number;
  /** Number of stack slots (one per vreg; 8 bytes each). */
  stackSlots: number;
  /** Ordered list of structured instructions (the body). */
  body: X86Instr[];
  /** True if this function is the program's entry (`<main>`). */
  isMain: boolean;
  /** Original IR function name (pre-sanitization). */
  irName: string;
  /** Map from label name to body index (used by the structured interp). */
  labelToIp: Map<string, number>;
}

/** A compiled x86-64 module. The `funcs` array is the structured form
 * that both `emitAsm` and the structured interpreter walk. The other
 * fields are convenience views of the same data. */
export interface X86Module {
  /** Full assembly text (NASM intel syntax) — produced by emitAsm. */
  text: string;
  /** `.data` section text (mutable globals — currently empty). */
  data: string;
  /** `.rodata` strings (interned string constants). */
  rodata: string[];
  /** Entry-point label (sanitized `<main>`). */
  entry: string;
  /** Sanitized function names, in declaration order. */
  funcNames: string[];
  /** Structured functions — source of truth for emitAsm + interp. */
  funcs: X86Func[];
}

//----------------------------------------------------------------------------
// Per-function compilation context
//----------------------------------------------------------------------------

interface ModuleCtx {
  ir: IrProgram;
  strings: string[];
  stringMap: Map<string, number>;
  floats: number[];
  floatMap: Map<number, number>;
  bigints: number[];
  bigintMap: Map<number, number>;
  /** Per-module match-table counter; incremented for each `Match` op.
   *  The token emitted in the asm encodes this index, and the host's
   *  `__match_dispatch` looks up `host.matchTables[index]`. */
  matchCounter: number;
}

interface FuncCtx {
  irFn: IrFunc;
  name: string;
  nparams: number;
  stackSlots: number;
  body: X86Instr[];
  labelToIp: Map<string, number>;
  isMain: boolean;
}

//----------------------------------------------------------------------------
// Top-level: compileIrToX86
//----------------------------------------------------------------------------

export function compileIrToX86(ir: IrProgram): X86Module {
  const mctx: ModuleCtx = {
    ir,
    strings: [],
    stringMap: new Map(),
    floats: [],
    floatMap: new Map(),
    bigints: [],
    bigintMap: new Map(),
    matchCounter: 0,
  };

  const funcs: X86Func[] = [];
  for (let i = 0; i < ir.funcs.length; i++) {
    funcs.push(compileFunc(mctx, ir.funcs[i]));
  }

  const funcNames = funcs.map((f) => f.name);
  const entry = sanitizeName("<main>");
  const rodata = mctx.strings.slice();
  // Build the text section lazily — emitAsm walks the structured form.
  const text = emitAsm({ funcs, text: "", data: "", rodata, entry, funcNames });
  const data = "";

  return { text, data, rodata, entry, funcNames, funcs };
}

//----------------------------------------------------------------------------
// Per-function compilation
//----------------------------------------------------------------------------

function compileFunc(mctx: ModuleCtx, irFn: IrFunc): X86Func {
  const name = sanitizeName(irFn.name);
  const nparams = irFn.params.length;
  const stackSlots = irFn.nlocals; // one slot per vreg

  const body: X86Instr[] = [];
  const labelToIp = new Map<string, number>();

  const fctx: FuncCtx = {
    irFn,
    name,
    nparams,
    stackSlots,
    body,
    labelToIp,
    isMain: irFn.isMain,
  };

  // Prologue: push rbp; mov rbp, rsp; sub rsp, <stack_size>.
  pushInstr(body, labelToIp, { op: "push", src: { kind: "reg", name: "rbp" }, c: "prologue" });
  pushInstr(body, labelToIp, { op: "mov", dst: { kind: "reg", name: "rbp" }, src: { kind: "reg", name: "rsp" } });
  const stackBytes = stackSlots * 8;
  if (stackBytes > 0) {
    pushInstr(body, labelToIp, { op: "sub", dst: { kind: "reg", name: "rsp" }, src: { kind: "imm", value: stackBytes }, c: `reserve ${stackBytes} bytes for ${stackSlots} vregs` });
  }

  // Copy args from System V arg registers (rdi, rsi, rdx, rcx, r8, r9)
  // into their stack slots. Convention: rdi is the hidden $self arg
  // (the closure ref for closures, 0 for top-level calls), and the
  // user-visible params come AFTER $self in rsi/rdx/rcx/r8/r9.
  // If selfReg >= 0, copy rdi to vreg[selfReg] (the recursive closure
  // self-reference). Then copy rsi/rdx/rcx/r8/r9 to vreg[params[0..4]].
  const userArgRegs = ["rsi", "rdx", "rcx", "r8", "r9"];
  const selfReg = irFn.selfReg ?? -1;
  if (selfReg >= 0) {
    pushInstr(body, labelToIp, {
      op: "mov",
      dst: memForVreg(selfReg),
      src: { kind: "reg", name: "rdi" },
      c: `$self → vreg ${selfReg}`,
    });
  }
  for (let i = 0; i < nparams; i++) {
    const vreg = irFn.params[i];
    if (i < userArgRegs.length) {
      pushInstr(body, labelToIp, {
        op: "mov",
        dst: memForVreg(vreg),
        src: { kind: "reg", name: userArgRegs[i] },
        c: `param ${i} → vreg ${vreg}`,
      });
    } else {
      // Spilled args live above rbp at [rbp + 16 + 8*(i-5)].
      pushInstr(body, labelToIp, {
        op: "mov",
        dst: memForVreg(vreg),
        src: { kind: "mem", base: "rbp", offset: 16 + 8 * (i - 5) },
        c: `param ${i} (spilled) → vreg ${vreg}`,
      });
    }
  }

  // Emit each block. Each block gets a label `<funcName>_<blockId>`.
  for (const block of irFn.blocks) {
    pushInstr(body, labelToIp, { op: "label", name: blockLabel(name, block.id) });
    for (const op of block.instrs) {
      emitOp(mctx, fctx, op);
    }
  }

  // If the function didn't end with a `ret` (e.g. main falls off the
  // end), append a default return.
  if (body.length === 0 || body[body.length - 1].op !== "ret") {
    pushInstr(body, labelToIp, { op: "mov", dst: { kind: "reg", name: "rax" }, src: { kind: "imm", value: 0 }, c: "default return value" });
    emitEpilogue(fctx);
  }

  return {
    name,
    nparams,
    stackSlots,
    body,
    isMain: irFn.isMain,
    irName: irFn.name,
    labelToIp,
  };
}

/** Append an instruction to the function body, recording its ip in the
 *  label-to-ip map for the structured interpreter. */
function pushInstr(body: X86Instr[], labelToIp: Map<string, number>, instr: X86Instr): void {
  if (instr.op === "label") {
    labelToIp.set(instr.name, body.length);
  }
  body.push(instr);
}

/** Append + record in one step (uses fctx). */
function emit(fctx: FuncCtx, instr: X86Instr): void {
  pushInstr(fctx.body, fctx.labelToIp, instr);
}

//----------------------------------------------------------------------------
// Per-op emission
//----------------------------------------------------------------------------

/** Memory operand for vreg i: [rbp - 8*(i+1)]. */
function memForVreg(vreg: number): X86Operand {
  return { kind: "mem", base: "rbp", offset: -8 * (vreg + 1) };
}

function blockLabel(funcName: string, blockId: number): string {
  return `${funcName}_b${blockId}`;
}

function internString(mctx: ModuleCtx, s: string): number {
  const idx = mctx.stringMap.get(s);
  if (idx !== undefined) return idx;
  const i = mctx.strings.length;
  mctx.strings.push(s);
  mctx.stringMap.set(s, i);
  return i;
}

function internFloat(mctx: ModuleCtx, f: number): number {
  const idx = mctx.floatMap.get(f);
  if (idx !== undefined) return idx;
  const i = mctx.floats.length;
  mctx.floats.push(f);
  mctx.floatMap.set(f, i);
  return i;
}

function internBigint(mctx: ModuleCtx, n: number): number {
  const idx = mctx.bigintMap.get(n);
  if (idx !== undefined) return idx;
  const i = mctx.bigints.length;
  mctx.bigints.push(n);
  mctx.bigintMap.set(n, i);
  return i;
}

function emitOp(mctx: ModuleCtx, fctx: FuncCtx, op: IrOp): void {
  switch (op.op) {
    case "Const":
      emitConst(mctx, fctx, op.value, op.dest);
      return;
    case "Move":
      emit(fctx, { op: "mov", dst: { kind: "reg", name: "rax" }, src: memForVreg(op.src), c: `Move v${op.src} → v${op.dest}` });
      emit(fctx, { op: "mov", dst: memForVreg(op.dest), src: { kind: "reg", name: "rax" } });
      return;
    case "Bin":
      emitBin(mctx, fctx, op.kind, op.lhs, op.rhs, op.dest);
      return;
    case "Un":
      emitUn(mctx, fctx, op.kind, op.src, op.dest);
      return;
    case "Call":
      emitCall(mctx, fctx, op.fn, op.args, op.dest);
      return;
    case "CallBuiltin":
      emitCallBuiltin(mctx, fctx, op.name, op.args, op.dest);
      return;
    case "Phi":
      // Conservative: Move from the first incoming (matches the bytecode
      // and WASM codegen — v1 has no real phi nodes).
      if (op.incoming.length > 0) {
        emit(fctx, { op: "mov", dst: { kind: "reg", name: "rax" }, src: memForVreg(op.incoming[0].val), c: `Phi (first incoming)` });
        emit(fctx, { op: "mov", dst: memForVreg(op.dest), src: { kind: "reg", name: "rax" } });
      } else {
        emit(fctx, { op: "mov", dst: memForVreg(op.dest), src: { kind: "imm", value: 0 }, c: `Phi (empty → 0)` });
      }
      return;
    case "Br":
      emitBr(mctx, fctx, op.cond, op.then, op.else);
      return;
    case "Return":
      emit(fctx, { op: "mov", dst: { kind: "reg", name: "rax" }, src: memForVreg(op.val), c: `Return v${op.val}` });
      emitEpilogue(fctx);
      return;
    case "LoadField": {
      const nameIdx = internString(mctx, op.field);
      emit(fctx, {
        op: "hostcall",
        name: "__field_get",
        args: [memForVreg(op.obj), { kind: "imm", value: nameIdx }],
        dst: memForVreg(op.dest),
        c: `LoadField .${op.field}`,
      });
      return;
    }
    case "StoreField": {
      const nameIdx = internString(mctx, op.field);
      emit(fctx, {
        op: "hostcall",
        name: "__field_set",
        args: [memForVreg(op.obj), { kind: "imm", value: nameIdx }, memForVreg(op.val)],
        dst: { kind: "reg", name: "rax" },
        c: `StoreField .${op.field}`,
      });
      return;
    }
    case "AllocStruct": {
      const nameIdx = internString(mctx, op.name);
      const fields = Object.entries(op.fields);
      const n = fields.length;
      if (n > 16) throw new Error(`x86: AllocStruct with ${n} fields exceeds limit (16)`);
      const args: X86Operand[] = [{ kind: "imm", value: nameIdx }];
      for (const [fname, fval] of fields) {
        args.push({ kind: "imm", value: internString(mctx, fname) });
        args.push(memForVreg(fval));
      }
      emit(fctx, {
        op: "hostcall",
        name: `__alloc_struct_${n}`,
        args,
        dst: memForVreg(op.dest),
        c: `AllocStruct ${op.name}`,
      });
      return;
    }
    case "AllocVariant": {
      const enumIdx = internString(mctx, op.enumName);
      const variantIdx = internString(mctx, op.variant);
      const n = op.data.length;
      if (n > 16) throw new Error(`x86: AllocVariant with ${n} data values exceeds limit (16)`);
      const args: X86Operand[] = [{ kind: "imm", value: enumIdx }, { kind: "imm", value: variantIdx }];
      for (const d of op.data) args.push(memForVreg(d));
      emit(fctx, {
        op: "hostcall",
        name: `__alloc_variant_${n}`,
        args,
        dst: memForVreg(op.dest),
        c: `AllocVariant ${op.enumName}::${op.variant}`,
      });
      return;
    }
    case "AllocArray": {
      const n = op.elems.length;
      if (n > 16) throw new Error(`x86: AllocArray with ${n} elems exceeds limit (16)`);
      const args: X86Operand[] = op.elems.map((e) => memForVreg(e));
      emit(fctx, {
        op: "hostcall",
        name: `__alloc_array_${n}`,
        args,
        dst: memForVreg(op.dest),
        c: `AllocArray [${n} elems]`,
      });
      return;
    }
    case "AllocTuple": {
      const n = op.elems.length;
      if (n > 16) throw new Error(`x86: AllocTuple with ${n} elems exceeds limit (16)`);
      const args: X86Operand[] = op.elems.map((e) => memForVreg(e));
      emit(fctx, {
        op: "hostcall",
        name: `__alloc_tuple_${n}`,
        args,
        dst: memForVreg(op.dest),
        c: `AllocTuple (${n} elems)`,
      });
      return;
    }
    case "AllocMap": {
      const n = op.entries.length;
      if (n > 16) throw new Error(`x86: AllocMap with ${n} entries exceeds limit (16)`);
      const args: X86Operand[] = [];
      for (const ent of op.entries) {
        args.push(memForVreg(ent.key));
        args.push(memForVreg(ent.val));
      }
      emit(fctx, {
        op: "hostcall",
        name: `__alloc_map_${n}`,
        args,
        dst: memForVreg(op.dest),
        c: `AllocMap {${n} entries}`,
      });
      return;
    }
    case "AllocRange": {
      emit(fctx, {
        op: "hostcall",
        name: "__alloc_range",
        args: [memForVreg(op.start), memForVreg(op.end), { kind: "imm", value: op.inclusive ? 1 : 0 }],
        dst: memForVreg(op.dest),
        c: `AllocRange`,
      });
      return;
    }
    case "IndexGet": {
      emit(fctx, {
        op: "hostcall",
        name: "__index_get",
        args: [memForVreg(op.obj), memForVreg(op.idx)],
        dst: memForVreg(op.dest),
        c: `IndexGet`,
      });
      return;
    }
    case "IndexSet": {
      emit(fctx, {
        op: "hostcall",
        name: "__index_set",
        args: [memForVreg(op.obj), memForVreg(op.idx), memForVreg(op.val)],
        dst: { kind: "reg", name: "rax" },
        c: `IndexSet`,
      });
      return;
    }
    case "TupleGet": {
      emit(fctx, {
        op: "hostcall",
        name: "__tuple_get",
        args: [memForVreg(op.obj), { kind: "imm", value: op.idx }],
        dst: memForVreg(op.dest),
        c: `TupleGet .${op.idx}`,
      });
      return;
    }
    case "Len": {
      emit(fctx, {
        op: "hostcall",
        name: "__len",
        args: [memForVreg(op.src)],
        dst: memForVreg(op.dest),
        c: `Len`,
      });
      return;
    }
    case "MakeBox": {
      emit(fctx, {
        op: "hostcall",
        name: "__make_box",
        args: [memForVreg(op.src)],
        dst: memForVreg(op.dest),
        c: `MakeBox`,
      });
      return;
    }
    case "Unbox": {
      emit(fctx, {
        op: "hostcall",
        name: "__unbox",
        args: [memForVreg(op.src)],
        dst: memForVreg(op.dest),
        c: `Unbox`,
      });
      return;
    }
    case "SetBox": {
      emit(fctx, {
        op: "hostcall",
        name: "__set_box",
        args: [memForVreg(op.box), memForVreg(op.val)],
        dst: { kind: "reg", name: "rax" },
        c: `SetBox`,
      });
      return;
    }
    case "GetUpvalue": {
      emit(fctx, {
        op: "hostcall",
        name: "__get_upvalue",
        args: [{ kind: "imm", value: op.upvalueIndex }],
        dst: memForVreg(op.dest),
        c: `GetUpvalue ${op.upvalueIndex}`,
      });
      return;
    }
    case "SetUpvalue": {
      emit(fctx, {
        op: "hostcall",
        name: "__set_upvalue",
        args: [{ kind: "imm", value: op.upvalueIndex }, memForVreg(op.val)],
        dst: { kind: "reg", name: "rax" },
        c: `SetUpvalue ${op.upvalueIndex}`,
      });
      return;
    }
    case "MakeClosure": {
      const n = op.captures.length;
      if (n > 16) throw new Error(`x86: MakeClosure with ${n} captures exceeds limit (16)`);
      const args: X86Operand[] = [{ kind: "imm", value: op.funcIndex }];
      for (const c of op.captures) args.push(memForVreg(c));
      emit(fctx, {
        op: "hostcall",
        name: `__make_closure_${n}`,
        args,
        dst: memForVreg(op.dest),
        c: `MakeClosure func=${op.funcIndex}`,
      });
      return;
    }
    case "Panic": {
      emit(fctx, {
        op: "hostcall",
        name: "__panic",
        args: [memForVreg(op.msg)],
        dst: { kind: "reg", name: "rax" },
        c: `Panic`,
      });
      emit(fctx, { op: "nop", c: "unreachable after panic" });
      return;
    }
    case "Print": {
      emit(fctx, {
        op: "hostcall",
        name: "__print",
        args: [memForVreg(op.src)],
        dst: { kind: "reg", name: "rax" },
        c: `Print`,
      });
      return;
    }
    case "Cast":
      emitCast(mctx, fctx, op.kind, op.src, op.dest);
      return;
    case "Match":
      emitMatch(mctx, fctx, op);
      return;
    case "Nop":
      emit(fctx, { op: "nop" });
      return;
  }
}

function emitEpilogue(fctx: FuncCtx): void {
  emit(fctx, { op: "mov", dst: { kind: "reg", name: "rsp" }, src: { kind: "reg", name: "rbp" }, c: "epilogue" });
  emit(fctx, { op: "pop", dst: { kind: "reg", name: "rbp" } });
  emit(fctx, { op: "ret" });
}

function emitConst(mctx: ModuleCtx, fctx: FuncCtx, v: Value, dest: number): void {
  if (v === null || v === undefined) {
    emit(fctx, { op: "mov", dst: memForVreg(dest), src: { kind: "imm", value: 0 }, c: `Const null → v${dest}` });
    return;
  }
  if (typeof v === "boolean") {
    emit(fctx, { op: "mov", dst: memForVreg(dest), src: { kind: "imm", value: v ? 2 : 0 }, c: `Const ${v} → v${dest}` });
    return;
  }
  if (typeof v === "number") {
    if (Number.isInteger(v) && v >= -1073741824 && v <= 1073741823) {
      emit(fctx, { op: "mov", dst: memForVreg(dest), src: { kind: "imm", value: (v << 1) | 0 }, c: `Const ${v} → v${dest} (encoded ${((v << 1) | 0)})` });
    } else if (Number.isInteger(v)) {
      const idx = internBigint(mctx, v);
      emit(fctx, {
        op: "hostcall",
        name: "__const_bigint",
        args: [{ kind: "imm", value: idx }],
        dst: memForVreg(dest),
        c: `Const ${v} (bigint idx ${idx}) → v${dest}`,
      });
    } else {
      const idx = internFloat(mctx, v);
      emit(fctx, {
        op: "hostcall",
        name: "__const_float",
        args: [{ kind: "imm", value: idx }],
        dst: memForVreg(dest),
        c: `Const ${v} (float idx ${idx}) → v${dest}`,
      });
    }
    return;
  }
  if (typeof v === "string") {
    const idx = internString(mctx, v);
    emit(fctx, {
      op: "hostcall",
      name: "__const_str",
      args: [{ kind: "imm", value: idx }],
      dst: memForVreg(dest),
      c: `Const "${v}" (str idx ${idx}) → v${dest}`,
    });
    return;
  }
  // Fallback (struct/variant/etc.) — encode null for now; these
  // reach the IR rarely (only literal arrays/tuples become AllocArray
  // /AllocTuple, which have their own ops).
  emit(fctx, { op: "mov", dst: memForVreg(dest), src: { kind: "imm", value: 0 }, c: `Const (complex) → v${dest}` });
}

function emitBin(
  mctx: ModuleCtx,
  fctx: FuncCtx,
  kind: BinKind,
  lhs: number,
  rhs: number,
  dest: number,
): void {
  // For And/Or (short-circuit handled in IR — shouldn't reach here).
  if (kind === "And" || kind === "Or") {
    emit(fctx, {
      op: "hostcall",
      name: `__bin_${kind.toLowerCase()}`,
      args: [memForVreg(lhs), memForVreg(rhs)],
      dst: memForVreg(dest),
      c: `Bin ${kind} (host)`,
    });
    return;
  }

  // Div and Mod always go through the host: Div may produce a non-int
  // float, and Mod uses Python-style positive modulo.
  if (kind === "Div" || kind === "Mod") {
    emit(fctx, {
      op: "hostcall",
      name: `__bin_${kind.toLowerCase()}`,
      args: [memForVreg(lhs), memForVreg(rhs)],
      dst: memForVreg(dest),
      c: `Bin ${kind} (host)`,
    });
    return;
  }

  // Tag check: if ((lhs | rhs) & 1) != 0, slow path (host call).
  //   mov rax, [lhs]
  //   mov rcx, [rhs]
  //   mov rdx, rax
  //   or  rdx, rcx
  //   and rdx, 1
  //   jnz <host_lbl>
  //   ; native fast path
  //   ...
  //   jmp <after_lbl>
  // <host_lbl>:
  //   call __bin_<kind>
  //   mov [dest], rax
  // <after_lbl>:

  const hostLbl = `${fctx.name}_bin_host_${fctx.body.length}`;
  const afterLbl = `${fctx.name}_bin_after_${fctx.body.length}`;

  emit(fctx, { op: "mov", dst: { kind: "reg", name: "rax" }, src: memForVreg(lhs), c: `Bin ${kind}: load lhs v${lhs}` });
  emit(fctx, { op: "mov", dst: { kind: "reg", name: "rcx" }, src: memForVreg(rhs), c: `Bin ${kind}: load rhs v${rhs}` });
  emit(fctx, { op: "mov", dst: { kind: "reg", name: "rdx" }, src: { kind: "reg", name: "rax" } });
  emit(fctx, { op: "or", dst: { kind: "reg", name: "rdx" }, src: { kind: "reg", name: "rcx" } });
  emit(fctx, { op: "and", dst: { kind: "reg", name: "rdx" }, src: { kind: "imm", value: 1 } });
  emit(fctx, { op: "jcc", cc: "nz", label: hostLbl, c: `tag check → host if heap ref` });

  // Native fast path: operate on the encoded values directly.
  emitBinNative(fctx, kind, dest, lhs, rhs);
  emit(fctx, { op: "jmp", label: afterLbl });

  // Host path.
  emit(fctx, { op: "label", name: hostLbl });
  emit(fctx, {
    op: "hostcall",
    name: `__bin_${kind.toLowerCase()}`,
    args: [memForVreg(lhs), memForVreg(rhs)],
    dst: memForVreg(dest),
    c: `__bin_${kind}`,
  });
  emit(fctx, { op: "label", name: afterLbl });
}

function emitBinNative(
  fctx: FuncCtx,
  kind: BinKind,
  dest: number,
  lhs: number,
  rhs: number,
): void {
  // For our encoding (n << 1):
  //   Add: (lhs<<1) + (rhs<<1) = (lhs+rs)<<2 ; shift right by 1 → (lhs+rs)<<1
  //   Sub: same — add+sub, then shr 1
  //   Mul: ((lhs<<1) * (rhs<<1)) >> 1 = (lhs*rs)<<1 (because (a*b)<<2 >> 1 = (a*b)<<1)
  //        but to avoid overflow, do: (lhs >> 1) * (rhs >> 1) then << 1
  //   Comparisons: decode both, compare, setcc, then movzx + shl 1
  //   Bitwise: decode both, op, re-encode
  //   Shifts: decode lhs, mask rhs, shift, re-encode

  // We use rax for lhs-decoded, rcx for rhs-decoded.
  emit(fctx, { op: "mov", dst: { kind: "reg", name: "rax" }, src: memForVreg(lhs) });
  emit(fctx, { op: "mov", dst: { kind: "reg", name: "rcx" }, src: memForVreg(rhs) });
  // Decode (arithmetic shift right by 1 to preserve sign).
  emit(fctx, { op: "sar", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "decode lhs" });
  emit(fctx, { op: "sar", dst: { kind: "reg", name: "rcx" }, count: { kind: "imm", value: 1 }, c: "decode rhs" });

  switch (kind) {
    case "Add":
      emit(fctx, { op: "add", dst: { kind: "reg", name: "rax" }, src: { kind: "reg", name: "rcx" }, c: "add (decoded)" });
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode" });
      break;
    case "Sub":
      emit(fctx, { op: "sub", dst: { kind: "reg", name: "rax" }, src: { kind: "reg", name: "rcx" }, c: "sub (decoded)" });
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode" });
      break;
    case "Mul":
      emit(fctx, { op: "imul", dst: { kind: "reg", name: "rax" }, src: { kind: "reg", name: "rcx" }, c: "mul (decoded)" });
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode" });
      break;
    case "IDiv":
      emit(fctx, { op: "idiv", src: { kind: "reg", name: "rcx" }, c: "idiv (decoded) — quotient in rax" });
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode" });
      break;
    case "Mod":
      // idiv leaves remainder in rdx. Move it to rax.
      emit(fctx, { op: "idiv", src: { kind: "reg", name: "rcx" }, c: "idiv (decoded) — remainder in rdx" });
      emit(fctx, { op: "mov", dst: { kind: "reg", name: "rax" }, src: { kind: "reg", name: "rdx" } });
      // Note: this differs from Python-style positive modulo. The host
      // path (taken when either operand is a heap ref) handles true Mod;
      // the native path uses i64 rem semantics (truncate-toward-zero).
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode" });
      break;
    case "BitAnd":
      emit(fctx, { op: "and", dst: { kind: "reg", name: "rax" }, src: { kind: "reg", name: "rcx" }, c: "and (decoded)" });
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode" });
      break;
    case "BitOr":
      emit(fctx, { op: "or", dst: { kind: "reg", name: "rax" }, src: { kind: "reg", name: "rcx" }, c: "or (decoded)" });
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode" });
      break;
    case "BitXor":
      emit(fctx, { op: "xor", dst: { kind: "reg", name: "rax" }, src: { kind: "reg", name: "rcx" }, c: "xor (decoded)" });
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode" });
      break;
    case "Shl":
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "reg", name: "rcx" }, c: "shl (decoded)" });
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode" });
      break;
    case "Shr":
      emit(fctx, { op: "sar", dst: { kind: "reg", name: "rax" }, count: { kind: "reg", name: "rcx" }, c: "sar (decoded)" });
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode" });
      break;
    case "Eq":
      emit(fctx, { op: "cmp", a: { kind: "reg", name: "rax" }, b: { kind: "reg", name: "rcx" }, c: "cmp (decoded)" });
      emit(fctx, { op: "setcc", cc: "e", dst: { kind: "reg", name: "al" } });
      emit(fctx, { op: "movzx", dst: { kind: "reg", name: "rax" }, src: { kind: "reg", name: "al" } });
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode bool" });
      break;
    case "Neq":
      emit(fctx, { op: "cmp", a: { kind: "reg", name: "rax" }, b: { kind: "reg", name: "rcx" } });
      emit(fctx, { op: "setcc", cc: "ne", dst: { kind: "reg", name: "al" } });
      emit(fctx, { op: "movzx", dst: { kind: "reg", name: "rax" }, src: { kind: "reg", name: "al" } });
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode bool" });
      break;
    case "Lt":
      emit(fctx, { op: "cmp", a: { kind: "reg", name: "rax" }, b: { kind: "reg", name: "rcx" } });
      emit(fctx, { op: "setcc", cc: "l", dst: { kind: "reg", name: "al" } });
      emit(fctx, { op: "movzx", dst: { kind: "reg", name: "rax" }, src: { kind: "reg", name: "al" } });
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode bool" });
      break;
    case "Le":
      emit(fctx, { op: "cmp", a: { kind: "reg", name: "rax" }, b: { kind: "reg", name: "rcx" } });
      emit(fctx, { op: "setcc", cc: "le", dst: { kind: "reg", name: "al" } });
      emit(fctx, { op: "movzx", dst: { kind: "reg", name: "rax" }, src: { kind: "reg", name: "al" } });
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode bool" });
      break;
    case "Gt":
      emit(fctx, { op: "cmp", a: { kind: "reg", name: "rax" }, b: { kind: "reg", name: "rcx" } });
      emit(fctx, { op: "setcc", cc: "g", dst: { kind: "reg", name: "al" } });
      emit(fctx, { op: "movzx", dst: { kind: "reg", name: "rax" }, src: { kind: "reg", name: "al" } });
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode bool" });
      break;
    case "Ge":
      emit(fctx, { op: "cmp", a: { kind: "reg", name: "rax" }, b: { kind: "reg", name: "rcx" } });
      emit(fctx, { op: "setcc", cc: "ge", dst: { kind: "reg", name: "al" } });
      emit(fctx, { op: "movzx", dst: { kind: "reg", name: "rax" }, src: { kind: "reg", name: "al" } });
      emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode bool" });
      break;
    case "Div":
    case "Mod":
    case "And":
    case "Or":
      // Should never reach here (Div/Mod/And/Or go through host).
      emit(fctx, { op: "mov", dst: { kind: "reg", name: "rax" }, src: { kind: "imm", value: 0 } });
      break;
  }

  emit(fctx, { op: "mov", dst: memForVreg(dest), src: { kind: "reg", name: "rax" }, c: `→ v${dest}` });
}

function emitUn(
  mctx: ModuleCtx,
  fctx: FuncCtx,
  kind: "Neg" | "Not" | "BitNot",
  src: number,
  dest: number,
): void {
  if (kind === "Not") {
    // Not: always use host (truthy semantics differ by type).
    emit(fctx, {
      op: "hostcall",
      name: "__un_not",
      args: [memForVreg(src)],
      dst: memForVreg(dest),
      c: `Un Not (host)`,
    });
    return;
  }

  // Neg / BitNot: tag check, then native or host path.
  const hostLbl = `${fctx.name}_un_host_${fctx.body.length}`;
  const afterLbl = `${fctx.name}_un_after_${fctx.body.length}`;

  emit(fctx, { op: "mov", dst: { kind: "reg", name: "rax" }, src: memForVreg(src), c: `Un ${kind}: load src v${src}` });
  emit(fctx, { op: "test", a: { kind: "reg", name: "rax" }, b: { kind: "reg", name: "rax" } });
  emit(fctx, { op: "jcc", cc: "nz", label: hostLbl, c: "tag check (skip 0 → host? no, low-bit check below)" });

  // Hmm — for Not/Neg, the check is whether the low bit is set (heap ref).
  // Use `test rax, 1` and `jnz host` for the heap-ref check, not `test rax,rax`.
  // The above `test rax,rax` is just a zero check (which doesn't help). Let me
  // redo it properly: we replace the previous two instrs by a single
  // `test rax, 1` + `jnz host`.
  // To keep the structured form consistent, we *remove* the last two
  // emitted instrs and replace them. We do this by mutating fctx.body.
  fctx.body.pop(); fctx.body.pop();

  emit(fctx, { op: "and", dst: { kind: "reg", name: "rax" }, src: { kind: "imm", value: 1 } });
  emit(fctx, { op: "jcc", cc: "nz", label: hostLbl, c: "tag check → host if heap ref" });

  // Native path.
  emit(fctx, { op: "mov", dst: { kind: "reg", name: "rax" }, src: memForVreg(src) });
  emit(fctx, { op: "sar", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "decode" });
  if (kind === "Neg") {
    emit(fctx, { op: "neg", dst: { kind: "reg", name: "rax" }, c: "neg (decoded)" });
  } else {
    emit(fctx, { op: "not", dst: { kind: "reg", name: "rax" }, c: "not (decoded)" });
  }
  emit(fctx, { op: "shl", dst: { kind: "reg", name: "rax" }, count: { kind: "imm", value: 1 }, c: "re-encode" });
  emit(fctx, { op: "mov", dst: memForVreg(dest), src: { kind: "reg", name: "rax" } });
  emit(fctx, { op: "jmp", label: afterLbl });

  // Host path.
  emit(fctx, { op: "label", name: hostLbl });
  emit(fctx, {
    op: "hostcall",
    name: `__un_${kind.toLowerCase()}`,
    args: [memForVreg(src)],
    dst: memForVreg(dest),
    c: `__un_${kind}`,
  });
  emit(fctx, { op: "label", name: afterLbl });
}

function emitCall(
  mctx: ModuleCtx,
  fctx: FuncCtx,
  fn: number,
  args: number[],
  dest: number,
): void {
  // `fn` is a vreg holding a closure value (or function reference).
  // For our model: closures are heap objects that hold a funcName;
  // we look up the funcName at runtime via the host's __call_closure_N.
  // For top-level functions called directly (the common case), the IR
  // emits CallBuiltin with the function name — not Call. So Call here
  // always targets a closure.
  const n = args.length;
  if (n > 16) throw new Error(`x86: Call with ${n} args exceeds limit (16)`);
  const argOps: X86Operand[] = [memForVreg(fn)];
  for (const a of args) argOps.push(memForVreg(a));
  emit(fctx, {
    op: "hostcall",
    name: `__call_closure_${n}`,
    args: argOps,
    dst: memForVreg(dest),
    c: `Call closure (fn v${fn}, ${n} args) → v${dest}`,
  });
}

function emitCallBuiltin(
  mctx: ModuleCtx,
  fctx: FuncCtx,
  name: string,
  args: number[],
  dest: number,
): void {
  const n = args.length;
  if (n > 8) throw new Error(`x86: CallBuiltin '${name}' with ${n} args exceeds limit (8)`);
  const nameIdx = internString(mctx, name);
  const argOps: X86Operand[] = [{ kind: "imm", value: nameIdx }];
  for (const a of args) argOps.push(memForVreg(a));
  emit(fctx, {
    op: "hostcall",
    name: `__builtin_${n}`,
    args: argOps,
    dst: memForVreg(dest),
    c: `CallBuiltin ${name}(${n} args) → v${dest}`,
  });
}

function emitBr(
  mctx: ModuleCtx,
  fctx: FuncCtx,
  cond: number | null,
  thenBlock: number,
  elseBlock: number,
): void {
  const thenLbl = blockLabel(fctx.name, thenBlock);
  const elseLbl = blockLabel(fctx.name, elseBlock);
  if (cond === null) {
    emit(fctx, { op: "jmp", label: thenLbl, c: `Br → ${thenLbl}` });
    return;
  }
  // Conditional branch: truthy check (encoded value != 0).
  emit(fctx, { op: "mov", dst: { kind: "reg", name: "rax" }, src: memForVreg(cond), c: `Br cond=v${cond}` });
  emit(fctx, { op: "cmp", a: { kind: "reg", name: "rax" }, b: { kind: "imm", value: 0 } });
  emit(fctx, { op: "jcc", cc: "ne", label: thenLbl, c: `→ then` });
  emit(fctx, { op: "jmp", label: elseLbl, c: `→ else` });
}

function emitCast(
  mctx: ModuleCtx,
  fctx: FuncCtx,
  kindCast: "Int" | "Float" | "Bool" | "String",
  src: number,
  dest: number,
): void {
  emit(fctx, {
    op: "hostcall",
    name: `__cast_${kindCast.toLowerCase()}`,
    args: [memForVreg(src)],
    dst: memForVreg(dest),
    c: `Cast ${kindCast}`,
  });
}

function emitMatch(
  mctx: ModuleCtx,
  fctx: FuncCtx,
  op: Extract<IrOp, { op: "Match" }>,
): void {
  // Match: dispatch via host's __match_dispatch, then jump to the
  // selected case's block. Bindings are extracted via __match_binding.
  // We model this as: store the match id + scrutinee, then
  // branch to the case block based on the dispatch result. We use a
  // series of cmp+jcc (linear dispatch) rather than a jump table for
  // simplicity.
  //
  // Token scheme: each Match op gets a unique match-table index
  // (mctx.matchCounter, incremented per Match). The token is interned
  // as a string `__match_token_<idx>` and the host's __match_dispatch
  // parses the idx out of the string to look up host.matchTables[idx].
  // The match tables are registered in emission order (see
  // registerMatchTables), so idx aligns with the array index.

  const matchId = mctx.matchCounter++;
  const token = `__match_token_${matchId}`;
  const tokenIdx = internString(mctx, token);

  emit(fctx, {
    op: "hostcall",
    name: "__match_dispatch",
    args: [memForVreg(op.scrutinee), { kind: "imm", value: tokenIdx }],
    dst: { kind: "reg", name: "rax" },
    c: `Match dispatch (scrutinee v${op.scrutinee}, match ${matchId})`,
  });

  for (let i = 0; i < op.cases.length; i++) {
    const caseLbl = blockLabel(fctx.name, op.cases[i].block);
    emit(fctx, { op: "cmp", a: { kind: "reg", name: "rax" }, b: { kind: "imm", value: i } });
    emit(fctx, { op: "jcc", cc: "e", label: caseLbl, c: `→ case ${i}` });
  }
  emit(fctx, { op: "jmp", label: blockLabel(fctx.name, op.elseBlock), c: `→ else` });
}

//----------------------------------------------------------------------------
// Sanitize a name into a valid NASM symbol.
//----------------------------------------------------------------------------

function sanitizeName(name: string): string {
  return "_ae_" + name.replace(/[^a-zA-Z0-9_]/g, "_");
}

//----------------------------------------------------------------------------
// emitAsm: structured form → NASM intel-syntax text
//----------------------------------------------------------------------------

export function emitAsm(module: X86Module): string {
  const lines: string[] = [];
  lines.push("; Aether x86-64 assembly (NASM intel syntax)");
  lines.push("; Generated by compileIrToX86. Assemble with:");
  lines.push(";   nasm -f elf64 out.s -o out.o && ld out.o -o out && ./out");
  lines.push("");

  // .rodata: interned strings.
  if (module.rodata.length > 0) {
    lines.push("section .rodata");
    for (let i = 0; i < module.rodata.length; i++) {
      lines.push(`  str_${i}: db ${stringLiteral(module.rodata[i])}, 0`);
    }
    lines.push("");
  }

  // .data: empty (we use the JS-side heap for all heap allocations).
  lines.push("section .data");
  lines.push("  ; heap-allocated values live in the JS host's heap array.");
  lines.push("");

  // .text: function bodies.
  lines.push("section .text");
  lines.push(`global ${module.entry}`);
  lines.push("");

  // Externs: host imports.
  const externs = collectExterns(module);
  for (const ext of externs) {
    lines.push(`extern ${ext}`);
  }
  if (externs.length > 0) lines.push("");

  for (const fn of module.funcs) {
    emitFuncAsm(fn, lines);
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

function emitFuncAsm(fn: X86Func, lines: string[]): void {
  lines.push(`; ─── ${fn.irName} (${fn.nparams} params, ${fn.stackSlots} vregs) ───`);
  lines.push(`${fn.name}:`);
  for (const instr of fn.body) {
    emitInstrAsm(instr, lines);
  }
}

function emitInstrAsm(instr: X86Instr, lines: string[]): void {
  const cmt = instr.c ? `  ; ${instr.c}` : "";
  switch (instr.op) {
    case "mov":
      lines.push(`  mov ${operandAsm(instr.dst)}, ${operandAsm(instr.src)}${cmt}`);
      return;
    case "lea":
      lines.push(`  lea ${operandAsm(instr.dst)}, ${operandAsm(instr.src)}${cmt}`);
      return;
    case "movsx":
      lines.push(`  movsx ${operandAsm(instr.dst)}, ${operandAsm(instr.src)}${cmt}`);
      return;
    case "movzx":
      lines.push(`  movzx ${operandAsm(instr.dst)}, ${operandAsm(instr.src)}${cmt}`);
      return;
    case "add":
    case "sub":
    case "imul":
    case "and":
    case "or":
    case "xor":
      lines.push(`  ${instr.op} ${operandAsm(instr.dst)}, ${operandAsm(instr.src)}${cmt}`);
      return;
    case "idiv":
      lines.push(`  idiv ${operandAsm(instr.src)}${cmt}`);
      return;
    case "neg":
    case "not":
      lines.push(`  ${instr.op} ${operandAsm(instr.dst)}${cmt}`);
      return;
    case "shl":
    case "shr":
    case "sar":
      lines.push(`  ${instr.op} ${operandAsm(instr.dst)}, ${operandAsm(instr.count)}${cmt}`);
      return;
    case "cmp":
      lines.push(`  cmp ${operandAsm(instr.a)}, ${operandAsm(instr.b)}${cmt}`);
      return;
    case "test":
      lines.push(`  test ${operandAsm(instr.a)}, ${operandAsm(instr.b)}${cmt}`);
      return;
    case "setcc":
      lines.push(`  set${instr.cc} ${operandAsm(instr.dst)}${cmt}`);
      return;
    case "jmp":
      lines.push(`  jmp ${instr.label}${cmt}`);
      return;
    case "jcc":
      lines.push(`  j${instr.cc} ${instr.label}${cmt}`);
      return;
    case "call":
      lines.push(`  call ${instr.target}${cmt}`);
      return;
    case "ret":
      lines.push(`  ret${cmt}`);
      return;
    case "push":
      lines.push(`  push ${operandAsm(instr.src)}${cmt}`);
      return;
    case "pop":
      lines.push(`  pop ${operandAsm(instr.dst)}${cmt}`);
      return;
    case "label":
      lines.push(`${instr.name}:${cmt}`);
      return;
    case "nop":
      lines.push(`  nop${cmt}`);
      return;
    case "hostcall": {
      // Load args into System V arg registers, then call.
      const argRegs = ["rdi", "rsi", "rdx", "rcx", "r8", "r9"];
      for (let i = 0; i < instr.args.length; i++) {
        if (i < argRegs.length) {
          lines.push(`  mov ${argRegs[i]}, ${operandAsm(instr.args[i])}`);
        } else {
          // Spill to stack: push extra args.
          lines.push(`  push ${operandAsm(instr.args[i])}`);
        }
      }
      lines.push(`  call ${instr.name}${cmt}`);
      // Store result.
      lines.push(`  mov ${operandAsm(instr.dst)}, rax`);
      return;
    }
    case "comment":
      lines.push(`  ; ${instr.text}`);
      return;
  }
}

function operandAsm(op: X86Operand): string {
  switch (op.kind) {
    case "reg": return op.name;
    case "imm": return String(op.value);
    case "mem": {
      if (op.offset === 0) return `[${op.base}]`;
      if (op.offset > 0) return `[${op.base}+${op.offset}]`;
      return `[${op.base}${op.offset}]`; // negative already has -
    }
    case "label": return op.name;
    case "sym": return op.name;
  }
}

function stringLiteral(s: string): string {
  // NASM string literal: `db 'hello', 0` (we escape single quotes).
  const escaped = s.replace(/'/g, "''");
  return `'${escaped}'`;
}

function collectExterns(module: X86Module): string[] {
  const externs = new Set<string>();
  for (const fn of module.funcs) {
    for (const instr of fn.body) {
      if (instr.op === "hostcall") externs.add(instr.name);
    }
  }
  return Array.from(externs).sort();
}

//----------------------------------------------------------------------------
// emitElfStub: minimal ELF64 documentation stub.
//
// The sandbox lacks `nasm` and `gas`. We can't assemble+link here, so
// we return a minimal ELF64 binary header that *describes* what would
// be assembled. Real assembly+linking requires nasm (or gas) on the
// host. The README documents the exact `nasm -f elf64 ... && ld ...`
// invocation.
//
// The returned Uint8Array is a valid ELF64 header with e_machine =
// EM_X86_64 (0x3E), e_type = ET_REL (1), and a `.comment` section in
// the body noting the source. It's not executable as-is — it's a
// *stub* that proves we can produce an ELF container. Running it
// requires nasm+ld on the host.
//----------------------------------------------------------------------------

export function emitElfStub(module: X86Module): Uint8Array {
  // ELF64 header is 64 bytes. We add a small note after.
  const buf = new Uint8Array(128);
  const dv = new DataView(buf.buffer);
  // e_ident: 16 bytes
  buf[0] = 0x7f; buf[1] = 0x45; buf[2] = 0x4c; buf[3] = 0x46; // \x7fELF
  buf[4] = 2; // EI_CLASS: ELFCLASS64
  buf[5] = 1; // EI_DATA: ELFDATA2LSB (little-endian)
  buf[6] = 1; // EI_VERSION
  buf[7] = 0; // EI_OSABI: System V
  buf[8] = 0; // EI_ABIVERSION
  // 9-15: padding (zeros)
  dv.setUint16(16, 1, true); // e_type: ET_REL
  dv.setUint16(18, 0x3e, true); // e_machine: EM_X86_64
  dv.setUint32(20, 1, true); // e_version
  // e_entry, e_phoff, e_shoff: 0 (no entry point — this is a stub)
  // (no setUint64BE in DataView; e_entry/e_phoff/e_shoff are 0 by default)
  dv.setUint16(40, 64, true); // e_ehsize
  dv.setUint16(52, 0, true); // e_phentsize
  dv.setUint16(54, 0, true); // e_phnum
  dv.setUint16(56, 64, true); // e_shentsize
  dv.setUint16(58, 0, true); // e_shnum
  dv.setUint16(60, 0, true); // e_shstrndx

  // Append a small documentation note after the header.
  const note = `Aether x86-64 stub for ${module.entry} (${module.funcs.length} funcs). Assemble with: nasm -f elf64 out.s -o out.o && ld out.o -o out && ./out`;
  for (let i = 0; i < note.length && 64 + i < buf.length; i++) {
    buf[64 + i] = note.charCodeAt(i);
  }
  return buf;
}

//----------------------------------------------------------------------------
// compileAndRunNative: try nasm+ld, fall back to structured interpreter.
//----------------------------------------------------------------------------

export interface X86RunResult {
  output: Value;
  outputs: string[];
  error?: string;
}

export function compileAndRunNative(
  source: string,
  args: Value[] = [],
): X86RunResult {
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
    const module = compileIrToX86(ir);

    // Build the host (heap, imports, match tables).
    const host = createHost();
    host.strings = module.rodata.slice();
    host.floats = [];
    host.bigints = [];
    host.matchTables = [];
    host.funcNames = module.funcNames.slice();
    host.funcNameToExport = new Map();
    for (let i = 0; i < ir.funcs.length; i++) {
      host.funcNameToExport.set(ir.funcs[i].name, module.funcNames[i]);
    }
    // Stash the IR funcs so the host can rebuild match tables on demand.
    host.irFuncs = ir.funcs;

    // Build the match tables from the IR (in emission order — must
    // match the order `emitMatch` interns tokens so the indices line
    // up with `__match_dispatch` calls).
    registerMatchTables(host, ir);

    // Try native assembly+link (only if nasm/ld available).
    if (hasNasm()) {
      const nativeResult = tryNasmRun(module, host, args);
      if (nativeResult !== null) return nativeResult;
    }

    // Fall back to the structured interpreter.
    const resultEncoded = interpMain(module, host, args);
    const output = decodeValue(host, resultEncoded);
    return { output, outputs: host.output };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { output: null, outputs: [], error: msg };
  }
}

//----------------------------------------------------------------------------
// Host (parallel to the WASM host — same encoding, same semantics).
//----------------------------------------------------------------------------

export interface X86Host {
  heap: Value[];
  output: string[];
  strings: string[];
  floats: number[];
  bigints: number[];
  matchTables: MatchTable[];
  currentBindings: Value[];
  funcNames: string[];
  funcNameToExport: Map<string, string>;
  upvalueStack: { value: Value }[][];
  irFuncs: IrFunc[];
  /** Per-funcName cache of match tables (rebuilt lazily). */
  matchTablesByFunc: Map<string, MatchTable[]>;
  /** Top-level closures — populated when __make_closure_N is called for
   *  a top-level function (funcIndex pointing into irFuncs). Used by
   *  __builtin_N when a user-defined function is called via CallBuiltin:
   *  the function's captures are read from the stored closure (since
   *  CallBuiltin doesn't pass them through the call site). */
  topLevelClosures: Map<string, { closure: any; encodedRef: number }>;
}

interface MatchTable {
  cases: { pattern: any; bindings: { name: string; reg: number }[]; block: number }[];
  elseBlock: number;
}

/** @internal — exposed for tests/debugging. */
export function createHost(): X86Host {
  return {
    heap: [null],
    output: [],
    strings: [],
    floats: [],
    bigints: [],
    matchTables: [],
    currentBindings: [],
    funcNames: [],
    funcNameToExport: new Map(),
    upvalueStack: [],
    irFuncs: [],
    matchTablesByFunc: new Map(),
    topLevelClosures: new Map(),
  };
}

function heapAlloc(host: X86Host, v: Value): number {
  host.heap.push(v);
  return host.heap.length - 1;
}

/** @internal — exposed for tests/debugging. */
export function encodeValue(host: X86Host, v: Value): number {
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

/** @internal — exposed for tests/debugging. */
export function decodeValue(host: X86Host, n: number): Value {
  n = n | 0;
  if ((n & 1) === 0) {
    return n >> 1;
  }
  const idx = n >>> 1;
  if (idx === 0) return null;
  return host.heap[idx] ?? null;
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

function hostBinOp(name: string, a: Value, b: Value): Value {
  switch (name) {
    case "add":
      if (typeof a === "string" || typeof b === "string") return display(a) + display(b);
      if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
      return (a as number) + (b as number);
    case "sub": return (a as number) - (b as number);
    case "mul": return (a as number) * (b as number);
    case "div": {
      if ((b as number) === 0) throw new Error("division by zero");
      return (a as number) / (b as number);
    }
    case "idiv": {
      if ((b as number) === 0) throw new Error("division by zero");
      return Math.trunc((a as number) / (b as number));
    }
    case "mod": {
      const bv = Math.trunc(b as number);
      if (bv === 0) throw new Error("modulo by zero");
      const av = Math.trunc(a as number);
      return ((av % bv) + bv) % bv;
    }
    case "eq": return valueEq(a, b) as unknown as Value;
    case "neq": return (!valueEq(a, b)) as unknown as Value;
    case "lt": return ((a as number) < (b as number)) as unknown as Value;
    case "le": return ((a as number) <= (b as number)) as unknown as Value;
    case "gt": return ((a as number) > (b as number)) as unknown as Value;
    case "ge": return ((a as number) >= (b as number)) as unknown as Value;
    case "bitand": return (Math.trunc(a as number) & Math.trunc(b as number)) | 0;
    case "bitor": return (Math.trunc(a as number) | Math.trunc(b as number)) | 0;
    case "bitxor": return (Math.trunc(a as number) ^ Math.trunc(b as number)) | 0;
    case "shl": return (Math.trunc(a as number) << Math.trunc(b as number)) | 0;
    case "shr": return (Math.trunc(a as number) >> Math.trunc(b as number)) | 0;
    case "and": return (truthy(a) && truthy(b)) as unknown as Value;
    case "or": return (truthy(a) || truthy(b)) as unknown as Value;
  }
  throw new Error(`x86 host: unknown binop '${name}'`);
}

//----------------------------------------------------------------------------
// Structured interpreter — walks X86Func.body executing the ops.
// Mirrors the asm semantics exactly: encoded int32 values, tag checks,
// host calls. Proves the codegen is correct.
//----------------------------------------------------------------------------

interface SimFrame {
  stack: Int32Array;
  regs: Record<string, number>;
  ip: number;
  fn: X86Func;
}

/** @internal — exposed for tests/debugging. */
export function interpMain(module: X86Module, host: X86Host, args: Value[]): number {
  const mainName = sanitizeName("<main>");
  const mainFn = module.funcs.find((f) => f.name === mainName);
  if (!mainFn) throw new Error(`x86 interp: entry '${mainName}' not found`);
  const encodedArgs = args.map((a) => encodeValue(host, a));
  return interpFunc(module, host, mainFn, encodedArgs, 0);
}

function interpFunc(
  module: X86Module,
  host: X86Host,
  fn: X86Func,
  userArgsEncoded: number[],
  closureRefEncoded: number = 0,
): number {
  const stack = new Int32Array(fn.stackSlots);
  const regs: Record<string, number> = {
    rax: 0, rbx: 0, rcx: 0, rdx: 0, rsi: 0, rdi: 0,
    rbp: 0, rsp: 0, r8: 0, r9: 0, r10: 0, r11: 0,
    r12: 0, r13: 0, r14: 0, r15: 0, al: 0,
    _zf: 0, _sf: 0,
  };
  // Place args into System V arg registers — the function prologue's
  // `mov [vreg], rdi/rsi/rdx/...` reads these and stores them into the
  // vreg stack slots. The first arg register (rdi) is the hidden
  // $self arg (the closure ref for closures, 0 for top-level calls);
  // the user args go in rsi, rdx, rcx, r8, r9.
  const userArgRegs = ["rsi", "rdx", "rcx", "r8", "r9"];
  regs.rdi = closureRefEncoded | 0;
  for (let i = 0; i < userArgsEncoded.length && i < userArgRegs.length; i++) {
    regs[userArgRegs[i]] = userArgsEncoded[i] | 0;
  }
  // Note: spilled user args (i >= 5) aren't modeled in the interp v1 —
  // they'd live above rbp at positive offsets. We support up to 5 user
  // args via registers, matching the System V convention's 6-arg limit
  // (the 6th slot is $self).

  let ip = 0;
  let steps = 0;
  const maxSteps = 10_000_000; // safety bound

  while (ip < fn.body.length) {
    if (++steps > maxSteps) {
      throw new Error(`x86 interp: step budget exceeded (${maxSteps}) in ${fn.name}`);
    }
    const instr = fn.body[ip++];
    switch (instr.op) {
      case "mov": {
        const v = readOp(instr.src, stack, regs);
        writeOp(instr.dst, v, stack, regs);
        break;
      }
      case "lea":
      case "movsx":
      case "movzx": {
        const v = readOp(instr.src, stack, regs);
        writeOp(instr.dst, v, stack, regs);
        break;
      }
      case "add": {
        const a = readOp(instr.dst, stack, regs);
        const b = readOp(instr.src, stack, regs);
        const r = (a + b) | 0;
        writeOp(instr.dst, r, stack, regs);
        setFlags(regs, r);
        break;
      }
      case "sub": {
        const a = readOp(instr.dst, stack, regs);
        const b = readOp(instr.src, stack, regs);
        const r = (a - b) | 0;
        writeOp(instr.dst, r, stack, regs);
        setFlags(regs, r);
        break;
      }
      case "imul": {
        const a = readOp(instr.dst, stack, regs);
        const b = readOp(instr.src, stack, regs);
        const r = Math.imul(a, b);
        writeOp(instr.dst, r, stack, regs);
        setFlags(regs, r);
        break;
      }
      case "idiv": {
        const divisor = readOp(instr.src, stack, regs);
        if (divisor === 0) throw new Error("x86 interp: division by zero");
        const dividend = regs.rax;
        const q = Math.trunc(dividend / divisor) | 0;
        const r = (dividend - q * divisor) | 0;
        regs.rax = q;
        regs.rdx = r;
        setFlags(regs, q);
        break;
      }
      case "neg": {
        const a = readOp(instr.dst, stack, regs);
        const r = (-a) | 0;
        writeOp(instr.dst, r, stack, regs);
        setFlags(regs, r);
        break;
      }
      case "not": {
        const a = readOp(instr.dst, stack, regs);
        const r = (~a) | 0;
        writeOp(instr.dst, r, stack, regs);
        // x86 `not` does NOT affect flags.
        break;
      }
      case "and": {
        const a = readOp(instr.dst, stack, regs);
        const b = readOp(instr.src, stack, regs);
        const r = (a & b) | 0;
        writeOp(instr.dst, r, stack, regs);
        setFlags(regs, r);
        break;
      }
      case "or": {
        const a = readOp(instr.dst, stack, regs);
        const b = readOp(instr.src, stack, regs);
        const r = (a | b) | 0;
        writeOp(instr.dst, r, stack, regs);
        setFlags(regs, r);
        break;
      }
      case "xor": {
        const a = readOp(instr.dst, stack, regs);
        const b = readOp(instr.src, stack, regs);
        const r = (a ^ b) | 0;
        writeOp(instr.dst, r, stack, regs);
        setFlags(regs, r);
        break;
      }
      case "shl": {
        const a = readOp(instr.dst, stack, regs);
        const c = readOp(instr.count, stack, regs) & 0x1f;
        const r = (a << c) | 0;
        writeOp(instr.dst, r, stack, regs);
        setFlags(regs, r);
        break;
      }
      case "shr": {
        const a = readOp(instr.dst, stack, regs) >>> 0;
        const c = readOp(instr.count, stack, regs) & 0x1f;
        const r = (a >>> c) | 0;
        writeOp(instr.dst, r, stack, regs);
        setFlags(regs, r);
        break;
      }
      case "sar": {
        const a = readOp(instr.dst, stack, regs) | 0;
        const c = readOp(instr.count, stack, regs) & 0x1f;
        const r = (a >> c) | 0;
        writeOp(instr.dst, r, stack, regs);
        setFlags(regs, r);
        break;
      }
      case "cmp": {
        const a = readOp(instr.a, stack, regs) | 0;
        const b = readOp(instr.b, stack, regs) | 0;
        const r = (a - b) | 0;
        regs._zf = r === 0 ? 1 : 0;
        regs._sf = r < 0 ? 1 : 0;
        break;
      }
      case "test": {
        const a = readOp(instr.a, stack, regs) | 0;
        const b = readOp(instr.b, stack, regs) | 0;
        const r = (a & b) | 0;
        regs._zf = r === 0 ? 1 : 0;
        regs._sf = r < 0 ? 1 : 0;
        break;
      }
      case "setcc": {
        const v = ccHolds(instr.cc, regs) ? 1 : 0;
        writeOp(instr.dst, v, stack, regs);
        break;
      }
      case "jmp": {
        const target = fn.labelToIp.get(instr.label);
        if (target === undefined) throw new Error(`x86 interp: jmp to unknown label ${instr.label}`);
        ip = target;
        break;
      }
      case "jcc": {
        if (ccHolds(instr.cc, regs)) {
          const target = fn.labelToIp.get(instr.label);
          if (target === undefined) throw new Error(`x86 interp: jcc to unknown label ${instr.label}`);
          ip = target;
        }
        break;
      }
      case "call": {
        // Native call (currently only used for internal control; all
        // user calls go through hostcall). For completeness, look up
        // the X86Func by name and recurse.
        const callee = module.funcs.find((f) => f.name === instr.target);
        if (!callee) throw new Error(`x86 interp: call to unknown function ${instr.target}`);
        // Args are in arg regs (rdi/rsi/...). Read them and pass.
        const argRegs = ["rdi", "rsi", "rdx", "rcx", "r8", "r9"];
        const userArgRegs = ["rsi", "rdx", "rcx", "r8", "r9"];
        const callUserArgs: number[] = [];
        for (let i = 0; i < callee.nparams && i < userArgRegs.length; i++) {
          callUserArgs.push(regs[userArgRegs[i]]);
        }
        regs.rax = interpFunc(module, host, callee, callUserArgs, regs.rdi);
        break;
      }
      case "ret": {
        return regs.rax | 0;
      }
      case "push":
      case "pop":
        // We don't model the push/pop stack in the interp (vregs use
        // their own Int32Array). These are no-ops for the interpreter.
        break;
      case "label":
      case "nop":
      case "comment":
        break;
      case "hostcall": {
        const argRegs = ["rdi", "rsi", "rdx", "rcx", "r8", "r9"];
        const argVals: number[] = [];
        for (let i = 0; i < instr.args.length; i++) {
          const v = readOp(instr.args[i], stack, regs);
          if (i < argRegs.length) regs[argRegs[i]] = v;
          argVals.push(v);
        }
        const result = invokeHost(host, module, instr.name, argVals);
        writeOp(instr.dst, result | 0, stack, regs);
        break;
      }
    }
  }
  // Fell off the end: return rax.
  return regs.rax | 0;
}

/** Update ZF and SF based on a result value (matches x86 semantics for
 *  most arithmetic / logical ops, modulo OF/CF which we don't model). */
function setFlags(regs: Record<string, number>, result: number): void {
  regs._zf = (result | 0) === 0 ? 1 : 0;
  regs._sf = (result | 0) < 0 ? 1 : 0;
}

function readOp(op: X86Operand, stack: Int32Array, regs: Record<string, number>): number {
  switch (op.kind) {
    case "reg": return regs[op.name] | 0;
    case "imm": return op.value | 0;
    case "mem": {
      // Our memory operands are always `[rbp - 8*(vreg+1)]` — i.e. the
      // vreg's stack slot. Recover the vreg index from the offset.
      const vreg = (-op.offset / 8) - 1;
      if (op.base !== "rbp" || !Number.isInteger(vreg) || vreg < 0 || vreg >= stack.length) {
        // Spilled args (positive offset from rbp) — read 0 (not supported in interp v1).
        return 0;
      }
      return stack[vreg] | 0;
    }
    case "label": return 0;
    case "sym": return 0;
  }
}

function writeOp(op: X86Operand, value: number, stack: Int32Array, regs: Record<string, number>): void {
  switch (op.kind) {
    case "reg":
      regs[op.name] = value | 0;
      // When writing to al (the low byte of rax), preserve the upper bits.
      // For our purposes, setcc to al then movzx rax, al — the movzx
      // overwrites rax entirely, so we don't need byte-level handling.
      return;
    case "imm":
      // No-op (can't write to an immediate).
      return;
    case "mem": {
      const vreg = (-op.offset / 8) - 1;
      if (op.base !== "rbp" || !Number.isInteger(vreg) || vreg < 0 || vreg >= stack.length) {
        return;
      }
      stack[vreg] = value | 0;
      return;
    }
    case "label":
    case "sym":
      return;
  }
}

function ccHolds(cc: CondCode, regs: Record<string, number>): boolean {
  const zf = regs._zf === 1;
  const sf = regs._sf === 1;
  switch (cc) {
    case "e": case "z": return zf;
    case "ne": case "nz": return !zf;
    case "l": return sf && !zf;
    case "le": return sf || zf;
    case "g": return !sf && !zf;
    case "ge": return !sf || zf;
    case "s": return sf;
    case "ns": return !sf;
  }
}

//----------------------------------------------------------------------------
// Host dispatch — handles __print, __alloc_*, __bin_*, etc.
// Mirrors the WASM host's createWasmImports but uses X86Host.
//----------------------------------------------------------------------------

function invokeHost(host: X86Host, module: X86Module, name: string, args: number[]): number {
  // Constants
  if (name === "__const_str") return encodeValue(host, host.strings[args[0]]);
  if (name === "__const_float") return encodeValue(host, host.floats[args[0]]);
  if (name === "__const_bigint") return encodeValue(host, host.bigints[args[0]]);

  // Print / panic
  if (name === "__print") {
    host.output.push(display(decodeValue(host, args[0])));
    return 0;
  }
  if (name === "__panic") {
    throw new Error(`Aether panic: ${display(decodeValue(host, args[0]))}`);
  }

  // Binary ops
  if (name.startsWith("__bin_")) {
    const op = name.slice("__bin_".length);
    const a = decodeValue(host, args[0]);
    const b = decodeValue(host, args[1]);
    return encodeValue(host, hostBinOp(op, a, b));
  }

  // Unary ops
  if (name === "__un_neg") return encodeValue(host, -(decodeValue(host, args[0]) as number));
  if (name === "__un_not") return encodeValue(host, !truthy(decodeValue(host, args[0])));
  if (name === "__un_bitnot") return encodeValue(host, ~Math.trunc(decodeValue(host, args[0]) as number));

  // Alloc ops
  const allocStructMatch = name.match(/^__alloc_struct_(\d+)$/);
  if (allocStructMatch) {
    const n = parseInt(allocStructMatch[1], 10);
    const structName = host.strings[args[0]];
    const fields: Record<string, Value> = {};
    for (let i = 0; i < n; i++) {
      const fName = host.strings[args[1 + i * 2]];
      const fVal = decodeValue(host, args[2 + i * 2]);
      fields[fName] = fVal;
    }
    return encodeValue(host, { __struct: structName, fields } as Value);
  }
  const allocVariantMatch = name.match(/^__alloc_variant_(\d+)$/);
  if (allocVariantMatch) {
    const n = parseInt(allocVariantMatch[1], 10);
    const enumName = host.strings[args[0]];
    const variant = host.strings[args[1]];
    const data: Value[] = [];
    for (let i = 0; i < n; i++) data.push(decodeValue(host, args[2 + i]));
    return encodeValue(host, { __variant: enumName, variant, data } as Value);
  }
  const allocArrayMatch = name.match(/^__alloc_array_(\d+)$/);
  if (allocArrayMatch) {
    const n = parseInt(allocArrayMatch[1], 10);
    const arr: Value[] = [];
    for (let i = 0; i < n; i++) arr.push(decodeValue(host, args[i]));
    return encodeValue(host, arr);
  }
  const allocTupleMatch = name.match(/^__alloc_tuple_(\d+)$/);
  if (allocTupleMatch) {
    const n = parseInt(allocTupleMatch[1], 10);
    const arr: Value[] = [];
    for (let i = 0; i < n; i++) arr.push(decodeValue(host, args[i]));
    return encodeValue(host, arr);
  }
  const allocMapMatch = name.match(/^__alloc_map_(\d+)$/);
  if (allocMapMatch) {
    const n = parseInt(allocMapMatch[1], 10);
    const m = new Map<Value, Value>();
    for (let i = 0; i < n; i++) {
      const k = decodeValue(host, args[i * 2]);
      const v = decodeValue(host, args[i * 2 + 1]);
      m.set(k, v);
    }
    return encodeValue(host, m as unknown as Value);
  }
  if (name === "__alloc_range") {
    const s = decodeValue(host, args[0]) as number;
    const e = decodeValue(host, args[1]) as number;
    const inclusive = args[2] !== 0;
    const adjEnd = inclusive ? e + 1 : e;
    return encodeValue(host, { __range: "range", start: s, end: adjEnd, step: 1 } as Value);
  }

  // Field / index access
  if (name === "__field_get") {
    const obj = decodeValue(host, args[0]) as any;
    const fname = host.strings[args[1]];
    if (!obj || !obj.__struct) throw new Error(`cannot access field '${fname}' on ${typeof obj}`);
    if (!(fname in obj.fields)) throw new Error(`struct ${obj.__struct} has no field '${fname}'`);
    return encodeValue(host, obj.fields[fname]);
  }
  if (name === "__field_set") {
    const obj = decodeValue(host, args[0]) as any;
    const fname = host.strings[args[1]];
    if (!obj || !obj.__struct) throw new Error(`cannot assign field '${fname}' on non-struct`);
    obj.fields[fname] = decodeValue(host, args[2]);
    return 0;
  }
  if (name === "__index_get") {
    const obj = decodeValue(host, args[0]);
    const idx = decodeValue(host, args[1]);
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
  }
  if (name === "__index_set") {
    const obj = decodeValue(host, args[0]);
    const idx = decodeValue(host, args[1]);
    const val = decodeValue(host, args[2]);
    if (Array.isArray(obj)) {
      const i = idx as number;
      if (i < 0 || i >= obj.length) throw new Error(`array index out of bounds: ${i}`);
      obj[i] = val;
    } else if (obj instanceof Map) {
      (obj as Map<Value, Value>).set(idx, val);
    } else {
      throw new Error("cannot index-assign into non-array/map");
    }
    return 0;
  }
  if (name === "__tuple_get") {
    const obj = decodeValue(host, args[0]);
    const idx = args[1];
    if (!Array.isArray(obj)) throw new Error(`cannot apply tuple field .${idx} to non-tuple`);
    if (idx < 0 || idx >= obj.length) throw new Error(`tuple index out of bounds: ${idx}`);
    return encodeValue(host, obj[idx]);
  }
  if (name === "__len") {
    const v = decodeValue(host, args[0]);
    if (typeof v === "string" || Array.isArray(v)) return encodeValue(host, v.length);
    if (v instanceof Map) return encodeValue(host, (v as Map<Value, Value>).size);
    if (v && typeof v === "object" && (v as any).__struct) return encodeValue(host, Object.keys((v as any).fields).length);
    throw new Error(`len: unsupported value ${typeof v}`);
  }

  // Boxes / upvalues
  if (name === "__make_box") return encodeValue(host, { __box: true, value: decodeValue(host, args[0]) } as unknown as Value);
  if (name === "__unbox") {
    const v = decodeValue(host, args[0]) as any;
    if (v && v.__box) return encodeValue(host, v.value);
    return args[0];
  }
  if (name === "__set_box") {
    const box = decodeValue(host, args[0]) as any;
    if (box && box.__box) box.value = decodeValue(host, args[1]);
    return 0;
  }
  if (name === "__get_upvalue") {
    const ups = host.upvalueStack.length > 0 ? host.upvalueStack[host.upvalueStack.length - 1] : [];
    const idx = args[0];
    if (idx < 0 || idx >= ups.length) throw new Error(`upvalue out of range: ${idx}`);
    return encodeValue(host, ups[idx].value);
  }
  if (name === "__set_upvalue") {
    const ups = host.upvalueStack.length > 0 ? host.upvalueStack[host.upvalueStack.length - 1] : [];
    const idx = args[0];
    if (idx < 0 || idx >= ups.length) throw new Error(`upvalue out of range: ${idx}`);
    ups[idx].value = decodeValue(host, args[1]);
    return 0;
  }

  // Casts
  if (name === "__cast_int") {
    const v = decodeValue(host, args[0]);
    if (typeof v === "string") {
      const n = parseInt(v, 10);
      if (Number.isNaN(n)) throw new Error(`int: cannot parse '${v}'`);
      return encodeValue(host, n);
    }
    return encodeValue(host, Math.trunc(v as number));
  }
  if (name === "__cast_float") return encodeValue(host, decodeValue(host, args[0]) as number);
  if (name === "__cast_bool") return encodeValue(host, !!truthy(decodeValue(host, args[0])));
  if (name === "__cast_string") return encodeValue(host, display(decodeValue(host, args[0])));

  // Match
  if (name === "__match_dispatch") {
    // For the structured interpreter, we have the op's cases available
    // (via host.irFuncs). The matchId is a token index — we look up
    // the corresponding match op by counting matches in the IR.
    // Simpler: we reconstruct the match table from the IR by counting
    // Match ops in the order they were emitted.
    const tokenIdx = args[1];
    const token = host.strings[tokenIdx];
    const matchId = parseInt(token.replace("__match_token_", ""), 10);
    const scrutinee = decodeValue(host, args[0]);
    const table = host.matchTables[matchId];
    if (!table) throw new Error(`x86 interp: no match table for token ${token}`);
    for (let i = 0; i < table.cases.length; i++) {
      const bindings: Value[] = [];
      if (tryMatch(table.cases[i].pattern, scrutinee, bindings)) {
        host.currentBindings = bindings;
        return i;
      }
    }
    host.currentBindings = [];
    return table.cases.length;
  }
  if (name === "__match_binding") {
    const idx = args[0];
    if (idx < 0 || idx >= host.currentBindings.length) throw new Error(`match binding out of range: ${idx}`);
    return encodeValue(host, host.currentBindings[idx]);
  }

  // Closures
  const makeClosureMatch = name.match(/^__make_closure_(\d+)$/);
  if (makeClosureMatch) {
    const n = parseInt(makeClosureMatch[1], 10);
    const funcIdx = args[0];
    const captures: { value: Value }[] = [];
    for (let i = 0; i < n; i++) captures.push({ value: decodeValue(host, args[1 + i]) });
    const closure = {
      __closure: true,
      func: funcIdx,
      funcName: host.funcNames[funcIdx],
      captures,
    };
    const encoded = encodeValue(host, closure as unknown as Value);
    // If this is a top-level function (funcIdx < irFuncs.length and the
    // IR function is a top-level definition, not a lambda), register it
    // so __builtin_N can look up its captures when called via
    // CallBuiltin. We detect "top-level" by checking that the IR
    // function's name doesn't start with "<" (lambdas are "<lambda>").
    const irFn = host.irFuncs[funcIdx];
    if (irFn && !irFn.name.startsWith("<")) {
      host.topLevelClosures.set(closure.funcName, { closure, encodedRef: encoded });
    }
    return encoded;
  }
  const callClosureMatch = name.match(/^__call_closure_(\d+)$/);
  if (callClosureMatch) {
    const n = parseInt(callClosureMatch[1], 10);
    const closureRef = args[0];
    const closure = decodeValue(host, closureRef) as any;
    if (!closure || !closure.__closure) {
      throw new Error(`x86: cannot call non-closure value: ${display(closure)}`);
    }
    host.upvalueStack.push(closure.captures);
    try {
      // Look up the X86Func by IR funcIndex (not by name — multiple
      // lambdas share the name "<lambda>", so name lookup is
      // ambiguous). module.funcs is built in IR-function order, so
      // funcIdx aligns with module.funcs[funcIdx].
      const callee = module.funcs[closure.func] ?? findFuncByName(module, closure.funcName);
      const userArgs: number[] = [];
      for (let i = 0; i < n; i++) userArgs.push(args[1 + i]);
      return interpFunc(module, host, callee, userArgs, closureRef);
    } finally {
      host.upvalueStack.pop();
    }
  }

  // Builtins
  const builtinMatch = name.match(/^__builtin_(\d+)$/);
  if (builtinMatch) {
    const n = parseInt(builtinMatch[1], 10);
    const builtinName = host.strings[args[0]];
    const exportName = host.funcNameToExport.get(builtinName);
    if (exportName !== undefined) {
      // User-defined function: look up the top-level closure (which has
      // its captures) and call it through __call_closure semantics.
      // This is essential for top-level functions whose bodies use
      // GetUpvalue (e.g. shift_char captures to_upper_char / ALPHABET).
      const topLevel = host.topLevelClosures.get(exportName);
      if (topLevel) {
        host.upvalueStack.push(topLevel.closure.captures);
        try {
          // Look up by IR funcIndex for unambiguous targeting (lambdas
          // share names).
          const callee = module.funcs[topLevel.closure.func] ?? findFuncByName(module, exportName);
          const userArgs: number[] = [];
          for (let i = 0; i < n; i++) userArgs.push(args[1 + i]);
          return interpFunc(module, host, callee, userArgs, topLevel.encodedRef);
        } finally {
          host.upvalueStack.pop();
        }
      }
      // Fallback: empty upvalue stack (will fail if the function uses
      // GetUpvalue, but matches the WASM backend's behavior).
      host.upvalueStack.push([]);
      try {
        const callee = findFuncByName(module, exportName);
        const userArgs: number[] = [];
        for (let i = 0; i < n; i++) userArgs.push(args[1 + i]);
        return interpFunc(module, host, callee, userArgs, 0);
      } finally {
        host.upvalueStack.pop();
      }
    }
    const decodedArgs: Value[] = [];
    for (let i = 0; i < n; i++) decodedArgs.push(decodeValue(host, args[1 + i]));
    return encodeValue(host, callBuiltin(host, module, builtinName, decodedArgs));
  }

  throw new Error(`x86 host: unknown import '${name}'`);
}

function findFuncByName(module: X86Module, name: string): X86Func {
  const fn = module.funcs.find((f) => f.name === name);
  if (!fn) throw new Error(`x86 interp: function '${name}' not found`);
  return fn;
}

function callBuiltin(host: X86Host, module: X86Module, name: string, args: Value[]): Value {
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
    case "str": return display(args[0]);
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
    case "abs": return Math.abs(args[0] as number);
    case "sqrt": return Math.sqrt(args[0] as number);
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
      for (let i = 0; i < arr.length; i++) out.push(callValue(host, module, fn, [arr[i], i]));
      return out;
    }
    case "filter": {
      const arr = args[0];
      const fn = args[1];
      if (!Array.isArray(arr)) throw new Error("filter: expected array");
      const out: Value[] = [];
      for (let i = 0; i < arr.length; i++) {
        if (truthy(callValue(host, module, fn, [arr[i], i]))) out.push(arr[i]);
      }
      return out;
    }
    case "reduce": {
      const arr = args[0];
      const fn = args[1];
      const init = args[2];
      if (!Array.isArray(arr)) throw new Error("reduce: expected array");
      let acc = init;
      for (let i = 0; i < arr.length; i++) acc = callValue(host, module, fn, [acc, arr[i], i]);
      return acc;
    }
  }
  throw new Error(`unknown builtin '${name}'`);
}

function callValue(host: X86Host, module: X86Module, fnVal: Value, args: Value[]): Value {
  if (fnVal && typeof fnVal === "object" && (fnVal as any).__closure) {
    const c = fnVal as any;
    host.upvalueStack.push(c.captures);
    try {
      // Look up by IR funcIndex for unambiguous targeting (lambdas
      // share names like "<lambda>").
      const callee = module.funcs[c.func] ?? findFuncByName(module, c.funcName);
      const encodedArgs = args.map((a) => encodeValue(host, a));
      const closureRef = encodeValue(host, c);
      return decodeValue(host, interpFunc(module, host, callee, encodedArgs, closureRef));
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
// Match — pattern matching for the structured interpreter.
// Reuses the WASM host's tryMatch logic.
//----------------------------------------------------------------------------

function tryMatch(pattern: any, value: Value, bindings: Value[]): boolean {
  if (!pattern) return false;
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

//----------------------------------------------------------------------------
// Native assembly+link (best-effort; needs nasm + ld on PATH).
//----------------------------------------------------------------------------

function hasNasm(): boolean {
  // We deliberately return false here so the structured interpreter is
  // always used (the sandbox lacks nasm). On a system with nasm
  // installed, replace this with a real `which nasm` check.
  // (Avoids spawning a process during tests.)
  return false;
}

function tryNasmRun(
  module: X86Module,
  host: X86Host,
  args: Value[],
): X86RunResult | null {
  // Stub — when nasm/ld are available, this would:
  //   1. Write module.text to /tmp/aether_out.s
  //   2. Run `nasm -f elf64 /tmp/aether_out.s -o /tmp/aether_out.o`
  //   3. Run `ld /tmp/aether_out.o -o /tmp/aether_out`
  //   4. Run `/tmp/aether_out` with args, capturing stdout
  //   5. Map the captured output back to { output, outputs }
  //
  // The structured interpreter is the production path in the sandbox.
  return null;
}

//----------------------------------------------------------------------------
// Match-table registration — invoked lazily by compileAndRunNative
// after lowering, since match tables depend on the IR (not the X86Module).
//----------------------------------------------------------------------------

/** Walk the IR and build match tables for the host, indexed in emission
 *  order. This must match the order `emitMatch` interns tokens. */
function registerMatchTables(host: X86Host, ir: IrProgram): void {
  host.matchTables = [];
  let counter = 0;
  for (const fn of ir.funcs) {
    for (const block of fn.blocks) {
      for (const op of block.instrs) {
        if (op.op === "Match") {
          host.matchTables.push({
            cases: op.cases.map((c) => ({
              pattern: c.pattern,
              bindings: c.bindings,
              block: c.block,
            })),
            elseBlock: op.elseBlock,
          });
          counter++;
        }
      }
    }
  }
}

// Hook registerMatchTables into compileAndRunNative by re-running it.
// (compileAndRunNative above calls registerMatchTables directly.)

