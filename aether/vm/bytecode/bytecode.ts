/**
 * aether/vm/bytecode/bytecode.ts
 * ===============================
 * The Aether VM bytecode format — register-based, 80+ opcodes, with
 * binary serialization, a human-readable disassembler, and a verifier.
 *
 * Format
 * ------
 * Each instruction is a JS object `{ op, a, b, c, imm }`:
 *   - `op` is the `Op` enum value (8 bits in the binary form).
 *   - `a`, `b`, `c` are 16-bit register indices (0..65535). Each frame's
 *     register file is sized to the function's `nlocals`.
 *   - `imm` is a 16-bit signed immediate OR a 16-bit constant-pool index,
 *     depending on the opcode.
 *   - `str` (optional) is a string literal inline (used for field names,
 *     variant tags, builtin names, etc.). Strings are interned into the
 *     module's constant pool so the binary form is compact.
 *
 * Binary layout (variable-length per instruction):
 *   byte 0: opcode (8 bits)
 *   byte 1: format nibble — which operands are present (low 4 bits) and
 *           a high 4 bits reserved for flags.
 *   Then for each present operand: 2 bytes (16-bit little-endian).
 *   String operands are stored as a 16-bit constant-pool index.
 *
 * The disassembler produces a readable, one-line-per-instruction format
 * with labels for jump targets, e.g.:
 *   L0:  LoadInt r1, 42
 *       Call r0, r5, r1, 1
 *       JmpIfNot r3, L12
 *   L12: Return r0
 *
 * Why register-based (not stack-based)
 * ------------------------------------
 * Register-based bytecode (per RFC-002) maps naturally from a register-
 * based IR, requires fewer push/pop instructions than stack-based
 * bytecode (so the dispatch loop runs fewer cycles for the same
 * computation), and is closer to how the underlying hardware works.
 * Stack-based bytecode (CEval, YARV) is simpler to generate but slower
 * to execute. We choose register-based for the v2 VM to match the RFC's
 * design and to maximize throughput over the tree-walker.
 */
import type { Value } from "../../core/eval/eval";

//----------------------------------------------------------------------------
// Opcode enum — 80+ opcodes
//----------------------------------------------------------------------------

export enum Op {
  // Constants
  LoadInt = 1,        // a=dest, imm=int value
  LoadFloat,          // a=dest, imm=const pool index (float)
  LoadString,         // a=dest, imm=const pool index (string)
  LoadBool,           // a=dest, imm=0/1
  LoadUnit,           // a=dest
  LoadNull,           // a=dest (alias of LoadUnit)

  // Arithmetic (binary)
  Add,                // a=dest, b=lhs, c=rhs
  Sub,
  Mul,
  Div,                // float division (JS /)
  IDiv,               // int division (Math.trunc(a / b))
  Mod,                // Python positive modulo
  Neg,                // a=dest, b=src
  Not,                // a=dest, b=src  (logical not, using truthy)
  BitAnd,
  BitOr,
  BitXor,
  BitNot,             // a=dest, b=src
  Shl,
  Shr,                // arithmetic right shift

  // Comparison
  Eq,                 // a=dest, b=lhs, c=rhs (deep valueEq)
  Neq,
  Lt,
  Le,
  Gt,
  Ge,

  // Control flow
  Jmp,                // imm=target instr index
  JmpIf,              // a=cond reg, imm=target
  JmpIfNot,           // a=cond reg, imm=target
  Return,             // a=value reg
  ReturnUnit,         // no operands — return null
  Br,                 // a=cond reg (or -1 for unconditional), imm=then, b=else (or 0)
  Pop,                // a=reg (discard — no-op semantically, for IR compat)
  Dup,                // a=src, b=dest

  // Calls
  Call,               // a=dest, b=fn reg, imm=args start, c=args count
  CallBuiltin,        // a=dest, imm=builtin name const index, b=args start, c=args count
  CallClosure,        // a=dest, b=closure reg, imm=args start, c=args count
  CallNamed,          // a=dest, imm=func name const index, imm2=args start, c=args count
                      //   (resolves a top-level function by name in the module)
  TailCall,           // (reserved for future use; currently same as Call)

  // Memory / data
  AllocStruct,        // a=dest, imm=name const index, b=fields start, c=fields count
                      //   fields are laid out as [name_idx, val_reg, name_idx, val_reg, ...]
                      //   in the function's "extra" register array (we use a side table).
  AllocVariant,       // a=dest, imm=enum+variant const index, b=args start, c=args count
  AllocArray,          // a=dest, b=elems start, c=elems count
  AllocMap,            // a=dest, b=entries start, c=entries count
                      //   entries laid out as [key_reg, val_reg, ...]
  AllocTuple,          // alias of AllocArray for v1
  AllocRange,          // a=dest, b=start reg, c=end reg, imm=inclusive flag

  LoadField,           // a=dest, b=obj reg, imm=field name const index
  StoreField,          // a=obj reg, imm=field name const index, b=val reg
  IndexGet,            // a=dest, b=obj reg, c=idx reg
  IndexSet,            // a=obj reg, b=idx reg, c=val reg
  TupleGet,            // a=dest, b=obj reg, imm=index
  Len,                 // a=dest, b=src
  Push,                // a=array reg, b=val reg (append; in-place)
  PopArr,              // a=dest, b=array reg (pop last element)

  // Closures
  MakeClosure,         // a=dest, imm=func index, b=captures start, c=captures count
  GetUpvalue,          // a=dest, imm=upvalue index
  SetUpvalue,          // imm=upvalue index, b=val reg
  MakeBox,             // a=dest, b=src (wrap src in a Box)
  Unbox,               // a=dest, b=box reg
  SetBox,              // a=box reg, b=val reg

  // Pattern match — runtime dispatch
  // Pops nothing; uses a "match table" stored in the function's match-table list.
  // The scrutinee is in register `a`; imm is the match-table index. The VM
  // tries each pattern in the table; on a match, it binds subpattern variables
  // (writing into specific registers as specified by the table) and jumps
  // to the target instruction index.
  Match,               // a=scrutinee reg, imm=match table index

  // Print
  Print,               // a=src

  // Cast
  CastInt,             // a=dest, b=src
  CastFloat,           // a=dest, b=src
  CastBool,            // a=dest, b=src
  CastString,          // a=dest, b=src

  // Panic
  Panic,               // a=msg reg
  // Error propagation (`expr?`): if src is Err/None, return it from the
  // current function. Else, store the unwrapped value into dest.
  UnwrapOrProp,        // a=dest, b=src

  // Nop — placeholder, used by the IR for unreachable code.
  Nop,

  // Break / Continue — modeled as Jmp with a special flag. The VM throws
  // a BreakSignal/ContinueSignal (matching the tree-walker's behavior).
  Break,               // imm=target instr index (for fallthrough after loop)
  Continue,            // imm=target instr index (loop head)

  // SelfRef: store the current closure value into a register. Used at
  // function entry to populate the "self" slot for recursive references.
  SelfRef,             // a=dest

  // LoadGlobal: read a top-level (main-function) variable by name. Used
  // when a function refers to a top-level binding by name (e.g., a top-
  // level `let LOWER = ...` accessed from a nested function).
  LoadGlobal,          // a=dest, imm=name const index

  // Trace / debug (no-op in v1).
  Trace,               // a=src
  Breakpoint,          // no operands
}

//----------------------------------------------------------------------------
// Instruction shape
//----------------------------------------------------------------------------

export interface Instr {
  op: Op;
  a?: number;
  b?: number;
  c?: number;
  imm?: number;
  /** For inline string operands (rare — most strings go through the
   * constant pool). Used for field names, variant tags, builtin names. */
  str?: string;
  /** Variadic register list (for args, elems, captures, etc.). The actual
   * array is stored in the function's `regLists` table; this field holds
   * the index into that table. The codegen assigns these. */
  regs?: number;
  /** Variadic field list (for AllocStruct). Stored in the function's
   * `fieldLists` table; this field holds the index. */
  fields?: number;
}

//----------------------------------------------------------------------------
// Constant pool
//----------------------------------------------------------------------------

export type Constant = number | string | boolean | null;

//----------------------------------------------------------------------------
// Bytecode function & module
//----------------------------------------------------------------------------

export interface MatchTableEntry {
  /** Pattern description that the VM can match against. We store the AST
   * pattern shape inline. The codegen builds these from IR Match ops. */
  patternKind:
  | "Wildcard"
  | "Bind"
  | "Lit"
  | "Tuple"
  | "Array"
  | "Struct"
  | "Enum"
  | "Or";
  /** Bindings: list of (subregister-index, subpattern) to write into
   * the frame's registers when the pattern matches. For "Bind", the
   * binding is the whole scrutinee. For "Struct" / "Enum" / "Tuple" /
   * "Array", subpatterns recursively bind sub-registers from subparts
   * of the scrutinee. */
  bindName?: string;            // for BindPat
  litValue?: Value;             // for LitPat (the literal to compare)
  structName?: string;          // for StructPat
  enumName?: string;            // for EnumPat
  variant?: string;             // for EnumPat
  fieldBindings?: { name: string; subreg: number; pattern: MatchTableEntry }[]; // StructPat
  subregs?: { subreg: number; pattern: MatchTableEntry }[];                   // Tuple/Array/Enum
  rest?: boolean;               // ArrayPat rest
  orPatterns?: { subreg: number; pattern: MatchTableEntry }[];               // OrPat
  /** Jump target (instruction index) on match. */
  target: number;
  /** Optional guard: a sequence of instructions to evaluate (returns a
   * bool). For v1, we don't support guards — the IR doesn't emit them. */
  guard?: number[];
}

export interface BytecodeFunc {
  name: string;
  nparams: number;
  nlocals: number;
  code: Instr[];
  /** Per-function constant pool (strings, floats, big ints). */
  constants: Constant[];
  /** Per-function match tables. */
  matchTables: MatchTableEntry[][];
  /** Side table of variadic register lists (for Call args, AllocArray
   * elems, MakeClosure captures, AllocVariant args, AllocMap entries
   * flattened as [k0, v0, k1, v1, ...]). */
  regLists: number[][][];
  /** Side table of field lists (for AllocStruct: ordered list of
   * (name, register) pairs). */
  fieldLists: { name: string; reg: number }[][];
  /** For closures: list of upvalue names (in the order MakeClosure
   * captures them). The VM uses this to map upvalue indices to names. */
  captures: string[];
  /** Self-reference slot: when the function is called as a closure, the
   * VM writes the closure value into this slot before invoking the body.
   * -1 if no self-reference (e.g., <main>). */
  selfReg: number;
  /** Inline string table for field names / variant tags / builtin names. */
  strings: string[];
  /** Reserved for future use. */
  isMain?: boolean;
}

export interface BytecodeModule {
  funcs: BytecodeFunc[];
  /** Module-level constant pool (unused in v1 — each function has its own). */
  constants: Constant[];
  /** Entry function index. */
  entry: number;
}

//----------------------------------------------------------------------------
// Helpers: intern a variadic register list / field list
//----------------------------------------------------------------------------

export function internRegList(fn: BytecodeFunc, regs: number[]): number {
  // Dedupe by reference equality on the array contents.
  for (let i = 0; i < fn.regLists.length; i++) {
    const r = fn.regLists[i];
    if (r.length !== regs.length) continue;
    let eq = true;
    for (let j = 0; j < r.length; j++) {
      if (r[j] !== regs[j]) { eq = false; break; }
    }
    if (eq) return i;
  }
  fn.regLists.push(regs);
  return fn.regLists.length - 1;
}

export function internFieldList(fn: BytecodeFunc, fields: { name: string; reg: number }[]): number {
  for (let i = 0; i < fn.fieldLists.length; i++) {
    const f = fn.fieldLists[i];
    if (f.length !== fields.length) continue;
    let eq = true;
    for (let j = 0; j < f.length; j++) {
      if (f[j].name !== fields[j].name || f[j].reg !== fields[j].reg) { eq = false; break; }
    }
    if (eq) return i;
  }
  fn.fieldLists.push(fields);
  return fn.fieldLists.length - 1;
}

export function internRegListWith(fn: BytecodeFunc, regs: number[], fieldList?: { name: string; reg: number }[]): number {
  void fieldList;
  return internRegList(fn, regs);
}

//----------------------------------------------------------------------------
// String interning helper (per-function)
//----------------------------------------------------------------------------

export function internString(fn: BytecodeFunc, s: string): number {
  const idx = fn.strings.indexOf(s);
  if (idx >= 0) return idx;
  fn.strings.push(s);
  return fn.strings.length - 1;
}

export function internConstant(fn: BytecodeFunc, c: Constant): number {
  // Numbers, booleans, null are stored inline in the Instr (imm). Only
  // strings and floats that don't fit in int16 go into the constant pool.
  // For v1 simplicity, we always intern strings and floats.
  if (typeof c === "string") {
    return internString(fn, c);
  }
  // Try to find an existing constant of the same value.
  for (let i = 0; i < fn.constants.length; i++) {
    const k = fn.constants[i];
    if (typeof c === "number" && typeof k === "number" && k === c) return i;
    if (typeof c === "boolean" && typeof k === "boolean" && k === c) return i;
    if (c === null && k === null) return i;
  }
  fn.constants.push(c);
  return fn.constants.length - 1;
}

//----------------------------------------------------------------------------
// Binary serialization
//----------------------------------------------------------------------------

/**
 * Serialize a BytecodeModule to a compact binary form.
 *
 * Layout:
 *   Header: 4 bytes magic "AETH", 2 bytes version, 2 bytes func count.
 *   For each function:
 *     - name length (2 bytes), name bytes
 *     - nparams (2), nlocals (2), selfReg (2)
 *     - captures count (2), then each capture as (name len, name bytes)
 *     - strings count (2), then each string (len, bytes)
 *     - constants count (2), then each constant (tag byte + value)
 *     - match tables count (2), then each table
 *     - code length (4), then each instruction (variable)
 *   Entry function index (2).
 *
 * Constant value encoding:
 *   tag 0 = null
 *   tag 1 = int (4 bytes signed LE) — for small ints stored as constants
 *   tag 2 = float (8 bytes IEEE-754 LE)
 *   tag 3 = bool (1 byte)
 *   tag 4 = string (2 bytes length + bytes)
 *
 * Instruction encoding:
 *   byte 0: opcode
 *   byte 1: format flags (bit 0: a present, bit 1: b, bit 2: c, bit 3: imm,
 *           bit 4: str present)
 *   Then operands in order a, b, c, imm (each 2 bytes LE if present).
 *   If str present: 2 bytes string-table index.
 */
export function assemble(module: BytecodeModule): Uint8Array {
  const buf: number[] = [];
  // Magic + version + func count.
  pushBytes(buf, stringToBytes("AETH"));
  pushU16(buf, 1);
  pushU16(buf, module.funcs.length);
  for (const fn of module.funcs) {
    pushU16(buf, fn.name.length);
    pushBytes(buf, stringToBytes(fn.name));
    pushU16(buf, fn.nparams);
    pushU16(buf, fn.nlocals);
    pushU16(buf, fn.selfReg);
    pushU16(buf, fn.captures.length);
    for (const cap of fn.captures) {
      pushU16(buf, cap.length);
      pushBytes(buf, stringToBytes(cap));
    }
    pushU16(buf, fn.strings.length);
    for (const s of fn.strings) {
      pushU16(buf, s.length);
      pushBytes(buf, stringToBytes(s));
    }
    pushU16(buf, fn.constants.length);
    for (const c of fn.constants) {
      if (c === null) {
        buf.push(0);
      } else if (typeof c === "number") {
        if (Number.isInteger(c) && c >= -0x80000000 && c <= 0x7fffffff) {
          buf.push(1);
          pushI32(buf, c);
        } else {
          buf.push(2);
          pushF64(buf, c);
        }
      } else if (typeof c === "boolean") {
        buf.push(3);
        buf.push(c ? 1 : 0);
      } else {
        buf.push(4);
        pushU16(buf, c.length);
        pushBytes(buf, stringToBytes(c));
      }
    }
    pushU16(buf, fn.matchTables.length);
    for (const table of fn.matchTables) {
      pushU16(buf, table.length);
      for (const entry of table) {
        pushMatchEntry(buf, entry);
      }
    }
    // regLists
    pushU16(buf, fn.regLists.length);
    for (const rl of fn.regLists) {
      pushU16(buf, rl.length);
      for (const r of rl) pushI16(buf, r);
    }
    // fieldLists
    pushU16(buf, fn.fieldLists.length);
    for (const fl of fn.fieldLists) {
      pushU16(buf, fl.length);
      for (const f of fl) {
        pushU16(buf, f.name.length);
        pushBytes(buf, stringToBytes(f.name));
        pushI16(buf, f.reg);
      }
    }
    pushU32(buf, fn.code.length);
    for (const instr of fn.code) {
      pushInstr(buf, instr);
    }
  }
  pushU16(buf, module.entry);
  return new Uint8Array(buf);
}

function pushBytes(buf: number[], bytes: number[] | Uint8Array): void {
  for (const b of bytes) buf.push(b & 0xff);
}

function pushU16(buf: number[], v: number): void {
  buf.push(v & 0xff);
  buf.push((v >> 8) & 0xff);
}

function pushI16(buf: number[], v: number): void {
  // Signed 16-bit LE.
  if (v < 0) v = (1 << 16) + v;
  pushU16(buf, v);
}

function pushU32(buf: number[], v: number): void {
  buf.push(v & 0xff);
  buf.push((v >> 8) & 0xff);
  buf.push((v >> 16) & 0xff);
  buf.push((v >> 24) & 0xff);
}

function pushI32(buf: number[], v: number): void {
  if (v < 0) v = (1 << 30) * 4 + v; // 2^32 + v
  pushU32(buf, v);
}

function pushF64(buf: number[], v: number): void {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, v, true);
  for (let i = 0; i < 8; i++) buf.push(dv.getUint8(i));
}

function stringToBytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 128) out.push(c);
    else if (c < 0x800) {
      out.push(0xc0 | (c >> 6));
      out.push(0x80 | (c & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12));
      out.push(0x80 | ((c >> 6) & 0x3f));
      out.push(0x80 | (c & 0x3f));
    }
  }
  return out;
}

function pushInstr(buf: number[], instr: Instr): void {
  buf.push(instr.op);
  let flags = 0;
  if (instr.a !== undefined) flags |= 1;
  if (instr.b !== undefined) flags |= 2;
  if (instr.c !== undefined) flags |= 4;
  if (instr.imm !== undefined) flags |= 8;
  if (instr.str !== undefined) flags |= 16;
  if (instr.regs !== undefined) flags |= 32;
  if (instr.fields !== undefined) flags |= 64;
  buf.push(flags);
  if (instr.a !== undefined) pushI16(buf, instr.a);
  if (instr.b !== undefined) pushI16(buf, instr.b);
  if (instr.c !== undefined) pushI16(buf, instr.c);
  if (instr.imm !== undefined) pushI16(buf, instr.imm);
  if (instr.str !== undefined) {
    // String is stored inline: emit length + bytes.
    pushU16(buf, instr.str.length);
    pushBytes(buf, stringToBytes(instr.str));
  }
  if (instr.regs !== undefined) pushI16(buf, instr.regs);
  if (instr.fields !== undefined) pushI16(buf, instr.fields);
}

function pushMatchEntry(buf: number[], entry: MatchTableEntry): void {
  // Encode a match table entry.
  const kindTag = {
    Wildcard: 0, Bind: 1, Lit: 2, Tuple: 3, Array: 4, Struct: 5,
    Enum: 6, Or: 7,
  }[entry.patternKind];
  buf.push(kindTag);
  pushI32(buf, entry.target);
  if (entry.bindName !== undefined) {
    pushU16(buf, entry.bindName.length);
    pushBytes(buf, stringToBytes(entry.bindName));
  } else {
    pushU16(buf, 0);
  }
  if (entry.litValue !== undefined) {
    pushValue(buf, entry.litValue);
  } else {
    buf.push(0xff); // sentinel: no lit value
  }
  if (entry.structName !== undefined) {
    pushU16(buf, entry.structName.length);
    pushBytes(buf, stringToBytes(entry.structName));
  } else {
    pushU16(buf, 0);
  }
  if (entry.enumName !== undefined) {
    pushU16(buf, entry.enumName.length);
    pushBytes(buf, stringToBytes(entry.enumName));
  } else {
    pushU16(buf, 0);
  }
  if (entry.variant !== undefined) {
    pushU16(buf, entry.variant.length);
    pushBytes(buf, stringToBytes(entry.variant));
  } else {
    pushU16(buf, 0);
  }
  if (entry.fieldBindings) {
    pushU16(buf, entry.fieldBindings.length);
    for (const fb of entry.fieldBindings) {
      pushU16(buf, fb.name.length);
      pushBytes(buf, stringToBytes(fb.name));
      pushI16(buf, fb.subreg);
      pushMatchEntry(buf, fb.pattern);
    }
  } else {
    pushU16(buf, 0);
  }
  if (entry.subregs) {
    pushU16(buf, entry.subregs.length);
    for (const sub of entry.subregs) {
      pushI16(buf, sub.subreg);
      pushMatchEntry(buf, sub.pattern);
    }
  } else {
    pushU16(buf, 0);
  }
  if (entry.rest) buf.push(1); else buf.push(0);
  if (entry.orPatterns) {
    pushU16(buf, entry.orPatterns.length);
    for (const sub of entry.orPatterns) {
      pushI16(buf, sub.subreg);
      pushMatchEntry(buf, sub.pattern);
    }
  } else {
    pushU16(buf, 0);
  }
}

function pushValue(buf: number[], v: Value): void {
  if (v === null || v === undefined) {
    buf.push(0);
  } else if (typeof v === "number") {
    if (Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff) {
      buf.push(1);
      pushI32(buf, v);
    } else {
      buf.push(2);
      pushF64(buf, v);
    }
  } else if (typeof v === "boolean") {
    buf.push(3);
    buf.push(v ? 1 : 0);
  } else if (typeof v === "string") {
    buf.push(4);
    pushU16(buf, v.length);
    pushBytes(buf, stringToBytes(v));
  } else {
    // Complex value (array/struct/variant/map) — we don't support these as
    // literal patterns in v1. Encode as null.
    buf.push(0);
  }
}

//----------------------------------------------------------------------------
// Disassembly (binary → readable text)
//----------------------------------------------------------------------------

export function disassemble(module: BytecodeModule): string {
  const lines: string[] = [];
  lines.push(`; Aether bytecode module — ${module.funcs.length} function(s), entry=${module.entry}`);
  lines.push("");
  for (let fi = 0; fi < module.funcs.length; fi++) {
    const fn = module.funcs[fi];
    lines.push(`; === function ${fi}: ${fn.name} (nparams=${fn.nparams}, nlocals=${fn.nlocals}, selfReg=${fn.selfReg}) ===`);
    if (fn.captures.length > 0) {
      lines.push(`;   captures: ${fn.captures.join(", ")}`);
    }
    if (fn.strings.length > 0) {
      lines.push(`;   strings: ${fn.strings.map((s, i) => `${i}=${JSON.stringify(s)}`).join(", ")}`);
    }
    if (fn.constants.length > 0) {
      lines.push(`;   constants: ${fn.constants.map((c, i) => `${i}=${JSON.stringify(c)}`).join(", ")}`);
    }
    for (let i = 0; i < fn.matchTables.length; i++) {
      lines.push(`;   match table ${i}:`);
      for (const e of fn.matchTables[i]) {
        lines.push(`;     -> ${describeMatchEntry(e)}`);
      }
    }
    // Build a label table: instruction indices that are jump targets get
    // labels (L0, L1, ...).
    const labels = new Map<number, string>();
    let labelCounter = 0;
    for (const instr of fn.code) {
      switch (instr.op) {
        case Op.Jmp: case Op.JmpIf: case Op.JmpIfNot:
        case Op.Break: case Op.Continue:
          if (instr.imm !== undefined && !labels.has(instr.imm)) {
            labels.set(instr.imm, `L${labelCounter++}`);
          }
          break;
        case Op.Br:
          if (instr.imm !== undefined && !labels.has(instr.imm)) {
            labels.set(instr.imm, `L${labelCounter++}`);
          }
          if (instr.b !== undefined && instr.b >= 0 && !labels.has(instr.b)) {
            labels.set(instr.b, `L${labelCounter++}`);
          }
          break;
      }
    }
    // Also label match-table targets.
    for (const table of fn.matchTables) {
      for (const e of table) {
        if (!labels.has(e.target)) labels.set(e.target, `L${labelCounter++}`);
      }
    }
    for (let i = 0; i < fn.code.length; i++) {
      const label = labels.get(i);
      const prefix = label ? `${label}: ` : "    ";
      lines.push(prefix + disasmInstr(fn, fn.code[i], labels));
    }
    lines.push("");
  }
  return lines.join("\n");
}

function disasmInstr(fn: BytecodeFunc, instr: Instr, labels: Map<number, string>): string {
  const opName = Op[instr.op];
  const a = instr.a ?? 0;
  const b = instr.b ?? 0;
  const c = instr.c ?? 0;
  const imm = instr.imm ?? 0;
  switch (instr.op) {
    case Op.LoadInt: return `LoadInt r${a}, ${imm}`;
    case Op.LoadFloat: return `LoadFloat r${a}, #${imm} (${JSON.stringify(fn.constants[imm])})`;
    case Op.LoadString: return `LoadString r${a}, #${imm} (${JSON.stringify(fn.strings[imm] ?? fn.constants[imm])})`;
    case Op.LoadBool: return `LoadBool r${a}, ${imm ? "true" : "false"}`;
    case Op.LoadUnit: return `LoadUnit r${a}`;
    case Op.LoadNull: return `LoadNull r${a}`;

    case Op.Add: case Op.Sub: case Op.Mul: case Op.Div: case Op.IDiv: case Op.Mod:
    case Op.BitAnd: case Op.BitOr: case Op.BitXor: case Op.Shl: case Op.Shr:
    case Op.Eq: case Op.Neq: case Op.Lt: case Op.Le: case Op.Gt: case Op.Ge:
      return `${opName} r${a}, r${b}, r${c}`;

    case Op.Neg: case Op.Not: case Op.BitNot:
    case Op.Len: case Op.Unbox: case Op.Print:
      return `${opName} r${a}, r${b}`;

    case Op.Jmp: return `Jmp ${labels.get(imm) ?? imm}`;
    case Op.JmpIf: return `JmpIf r${a}, ${labels.get(imm) ?? imm}`;
    case Op.JmpIfNot: return `JmpIfNot r${a}, ${labels.get(imm) ?? imm}`;
    case Op.Return: return `Return r${a}`;
    case Op.ReturnUnit: return `ReturnUnit`;
    case Op.Br: return `Br r${a}, ${labels.get(imm) ?? imm}, ${labels.get(b) ?? b}`;
    case Op.Pop: return `Pop r${a}`;
    case Op.Dup: return `Dup r${a}, r${b}`;

    case Op.Call: return `Call r${a}, fn=r${b}, args=${fmtRegList(fn, instr.regs)}`;
    case Op.CallBuiltin: return `CallBuiltin r${a}, ${JSON.stringify(fn.strings[imm])}, args=${fmtRegList(fn, instr.regs)}`;
    case Op.CallClosure: return `CallClosure r${a}, closure=r${b}, args=${fmtRegList(fn, instr.regs)}`;
    case Op.CallNamed: return `CallNamed r${a}, ${JSON.stringify(fn.strings[imm])}, args=${fmtRegList(fn, instr.regs)}`;
    case Op.TailCall: return `TailCall r${a}, fn=r${b}, args=${fmtRegList(fn, instr.regs)}`;

    case Op.AllocStruct: return `AllocStruct r${a}, ${JSON.stringify(fn.strings[imm])}, fields=${fmtFieldList(fn, instr.fields)}`;
    case Op.AllocVariant: return `AllocVariant r${a}, ${JSON.stringify(fn.strings[imm])}, args=${fmtRegList(fn, instr.regs)}`;
    case Op.AllocArray: return `AllocArray r${a}, elems=${fmtRegList(fn, instr.regs)}`;
    case Op.AllocMap: return `AllocMap r${a}, entries=${fmtRegList(fn, instr.regs)}`;
    case Op.AllocTuple: return `AllocTuple r${a}, elems=${fmtRegList(fn, instr.regs)}`;
    case Op.AllocRange: return `AllocRange r${a}, start=r${b}, end=r${c}, inclusive=${imm}`;

    case Op.LoadField: return `LoadField r${a}, r${b}, ${JSON.stringify(fn.strings[imm])}`;
    case Op.StoreField: return `StoreField r${a}, ${JSON.stringify(fn.strings[imm])}, r${b}`;
    case Op.IndexGet: return `IndexGet r${a}, r${b}, r${c}`;
    case Op.IndexSet: return `IndexSet r${a}, r${b}, r${c}`;
    case Op.TupleGet: return `TupleGet r${a}, r${b}, ${imm}`;
    case Op.Push: return `Push r${a}, r${b}`;
    case Op.PopArr: return `PopArr r${a}, r${b}`;

    case Op.MakeClosure: return `MakeClosure r${a}, func=${imm}, captures=${fmtRegList(fn, instr.regs)}`;
    case Op.GetUpvalue: return `GetUpvalue r${a}, ${imm}`;
    case Op.SetUpvalue: return `SetUpvalue ${imm}, r${b}`;
    case Op.MakeBox: return `MakeBox r${a}, r${b}`;
    case Op.SetBox: return `SetBox r${a}, r${b}`;

    case Op.Match: return `Match r${a}, table=${imm}`;

    case Op.CastInt: return `CastInt r${a}, r${b}`;
    case Op.CastFloat: return `CastFloat r${a}, r${b}`;
    case Op.CastBool: return `CastBool r${a}, r${b}`;
    case Op.CastString: return `CastString r${a}, r${b}`;

    case Op.Panic: return `Panic r${a}`;
    case Op.UnwrapOrProp: return `UnwrapOrProp r${a}, r${b}`;
    case Op.Nop: return `Nop`;
    case Op.Break: return `Break ${labels.get(imm) ?? imm}`;
    case Op.Continue: return `Continue ${labels.get(imm) ?? imm}`;
    case Op.SelfRef: return `SelfRef r${a}`;
    case Op.LoadGlobal: return `LoadGlobal r${a}, ${JSON.stringify(fn.strings[imm])}`;
    case Op.Trace: return `Trace r${a}`;
    case Op.Breakpoint: return `Breakpoint`;
  }
  return `${opName}`;
}

function describeMatchEntry(e: MatchTableEntry): string {
  switch (e.patternKind) {
    case "Wildcard": return `Wildcard -> ${e.target}`;
    case "Bind": return `Bind ${e.bindName} -> ${e.target}`;
    case "Lit": return `Lit ${JSON.stringify(e.litValue)} -> ${e.target}`;
    case "Tuple": return `Tuple[${(e.subregs ?? []).length}] -> ${e.target}`;
    case "Array": return `Array[${(e.subregs ?? []).length}]${e.rest ? "+rest" : ""} -> ${e.target}`;
    case "Struct": return `Struct ${e.structName} -> ${e.target}`;
    case "Enum": return `Enum ${e.enumName}::${e.variant} -> ${e.target}`;
    case "Or": return `Or[${(e.orPatterns ?? []).length}] -> ${e.target}`;
  }
}

function fmtRegList(fn: BytecodeFunc, idx: number | undefined): string {
  if (idx === undefined) return "[]";
  const regs = fn.regLists[idx];
  if (!regs) return `[?${idx}]`;
  return `[${regs.map((r) => `r${r}`).join(", ")}]`;
}

function fmtFieldList(fn: BytecodeFunc, idx: number | undefined): string {
  if (idx === undefined) return "[]";
  const fields = fn.fieldLists[idx];
  if (!fields) return `[?${idx}]`;
  return `[${fields.map((f) => `${f.name}=r${f.reg}`).join(", ")}]`;
}

//----------------------------------------------------------------------------
// Verifier
//----------------------------------------------------------------------------

export function verifyBytecode(module: BytecodeModule): string[] {
  const errors: string[] = [];
  if (module.entry < 0 || module.entry >= module.funcs.length) {
    errors.push(`module.entry ${module.entry} out of range (funcs=${module.funcs.length})`);
  }
  const checkRegList = (fn: BytecodeFunc, idx: number | undefined, role: string): void => {
    if (idx === undefined) return;
    if (idx < 0 || idx >= fn.regLists.length) {
      errors.push(`regList idx ${idx} out of range (regLists=${fn.regLists.length})`);
      return;
    }
    for (const r of fn.regLists[idx]) {
      if (r < 0 || r >= fn.nlocals) {
        errors.push(`regList[${idx}] contains out-of-range register ${r}`);
      }
    }
  };
  const checkFieldList = (fn: BytecodeFunc, idx: number | undefined, role: string): void => {
    if (idx === undefined) return;
    if (idx < 0 || idx >= fn.fieldLists.length) {
      errors.push(`fieldList idx ${idx} out of range (fieldLists=${fn.fieldLists.length})`);
      return;
    }
    for (const f of fn.fieldLists[idx]) {
      if (f.reg < 0 || f.reg >= fn.nlocals) {
        errors.push(`fieldList[${idx}] contains out-of-range register ${f.reg}`);
      }
    }
  };
  for (let fi = 0; fi < module.funcs.length; fi++) {
    const fn = module.funcs[fi];
    const prefix = `func[${fi}] ${fn.name}: `;
    for (let i = 0; i < fn.code.length; i++) {
      const instr = fn.code[i];
      const checkReg = (r: number | undefined, role: string): void => {
        if (r === undefined) return;
        if (r < 0 || r >= fn.nlocals) {
          errors.push(`${prefix}instr ${i} (${Op[instr.op]}): ${role}=${r} out of range (nlocals=${fn.nlocals})`);
        }
      };
      switch (instr.op) {
        case Op.LoadInt: case Op.LoadFloat: case Op.LoadString:
        case Op.LoadBool: case Op.LoadUnit: case Op.LoadNull:
          checkReg(instr.a, "dest");
          break;
        case Op.Add: case Op.Sub: case Op.Mul: case Op.Div: case Op.IDiv: case Op.Mod:
        case Op.BitAnd: case Op.BitOr: case Op.BitXor: case Op.Shl: case Op.Shr:
        case Op.Eq: case Op.Neq: case Op.Lt: case Op.Le: case Op.Gt: case Op.Ge:
          checkReg(instr.a, "dest");
          checkReg(instr.b, "lhs");
          checkReg(instr.c, "rhs");
          break;
        case Op.Neg: case Op.Not: case Op.BitNot: case Op.Len: case Op.Unbox:
        case Op.Print: case Op.CastInt: case Op.CastFloat: case Op.CastBool:
        case Op.CastString: case Op.MakeBox: case Op.Trace:
          checkReg(instr.a, "dest");
          checkReg(instr.b, "src");
          break;
        case Op.Jmp:
          if (instr.imm === undefined || instr.imm < 0 || instr.imm >= fn.code.length) {
            errors.push(`${prefix}instr ${i} Jmp: target ${instr.imm} out of range`);
          }
          break;
        case Op.JmpIf: case Op.JmpIfNot: case Op.Break: case Op.Continue:
          checkReg(instr.a, "cond");
          if (instr.imm === undefined || instr.imm < 0 || instr.imm >= fn.code.length) {
            errors.push(`${prefix}instr ${i} ${Op[instr.op]}: target ${instr.imm} out of range`);
          }
          break;
        case Op.Return:
          checkReg(instr.a, "val");
          break;
        case Op.Br:
          checkReg(instr.a, "cond");
          if (instr.imm === undefined || instr.imm < 0 || instr.imm >= fn.code.length) {
            errors.push(`${prefix}instr ${i} Br: then ${instr.imm} out of range`);
          }
          if (instr.b !== undefined && instr.b >= 0 && instr.b >= fn.code.length) {
            errors.push(`${prefix}instr ${i} Br: else ${instr.b} out of range`);
          }
          break;
        case Op.Call: case Op.TailCall:
          checkReg(instr.a, "dest");
          checkReg(instr.b, "fn");
          checkRegList(fn, instr.regs, "args");
          break;
        case Op.CallBuiltin:
          checkReg(instr.a, "dest");
          if (instr.imm === undefined || instr.imm < 0 || instr.imm >= fn.strings.length) {
            errors.push(`${prefix}instr ${i} CallBuiltin: name index ${instr.imm} out of range`);
          }
          checkRegList(fn, instr.regs, "args");
          break;
        case Op.CallClosure:
          checkReg(instr.a, "dest");
          checkReg(instr.b, "closure");
          checkRegList(fn, instr.regs, "args");
          break;
        case Op.CallNamed:
          checkReg(instr.a, "dest");
          if (instr.imm === undefined || instr.imm < 0 || instr.imm >= fn.strings.length) {
            errors.push(`${prefix}instr ${i} CallNamed: name index ${instr.imm} out of range`);
          }
          checkRegList(fn, instr.regs, "args");
          break;
        case Op.AllocStruct:
          checkReg(instr.a, "dest");
          if (instr.imm === undefined || instr.imm < 0 || instr.imm >= fn.strings.length) {
            errors.push(`${prefix}instr ${i} AllocStruct: name index ${instr.imm} out of range`);
          }
          checkFieldList(fn, instr.fields, "fields");
          break;
        case Op.AllocVariant:
          checkReg(instr.a, "dest");
          if (instr.imm === undefined || instr.imm < 0 || instr.imm >= fn.strings.length) {
            errors.push(`${prefix}instr ${i} AllocVariant: tag index ${instr.imm} out of range`);
          }
          checkRegList(fn, instr.regs, "args");
          break;
        case Op.AllocArray: case Op.AllocTuple:
          checkReg(instr.a, "dest");
          checkRegList(fn, instr.regs, "elems");
          break;
        case Op.AllocMap:
          checkReg(instr.a, "dest");
          checkRegList(fn, instr.regs, "entries");
          break;
        case Op.AllocRange:
          checkReg(instr.a, "dest");
          checkReg(instr.b, "start");
          checkReg(instr.c, "end");
          break;
        case Op.LoadField:
          checkReg(instr.a, "dest");
          checkReg(instr.b, "obj");
          if (instr.imm === undefined || instr.imm < 0 || instr.imm >= fn.strings.length) {
            errors.push(`${prefix}instr ${i} LoadField: name index ${instr.imm} out of range`);
          }
          break;
        case Op.StoreField:
          checkReg(instr.a, "obj");
          checkReg(instr.b, "val");
          if (instr.imm === undefined || instr.imm < 0 || instr.imm >= fn.strings.length) {
            errors.push(`${prefix}instr ${i} StoreField: name index ${instr.imm} out of range`);
          }
          break;
        case Op.IndexGet: case Op.IndexSet:
          checkReg(instr.a, "obj/dest");
          checkReg(instr.b, "idx");
          checkReg(instr.c, "val/rhs");
          break;
        case Op.TupleGet:
          checkReg(instr.a, "dest");
          checkReg(instr.b, "obj");
          break;
        case Op.Push:
          checkReg(instr.a, "array");
          checkReg(instr.b, "val");
          break;
        case Op.PopArr:
          checkReg(instr.a, "dest");
          checkReg(instr.b, "array");
          break;
        case Op.MakeClosure:
          checkReg(instr.a, "dest");
          if (instr.imm === undefined || instr.imm < 0 || instr.imm >= module.funcs.length) {
            errors.push(`${prefix}instr ${i} MakeClosure: func index ${instr.imm} out of range`);
          }
          checkRegList(fn, instr.regs, "captures");
          break;
        case Op.GetUpvalue:
          checkReg(instr.a, "dest");
          if (instr.imm === undefined || instr.imm < 0 || instr.imm >= fn.captures.length) {
            errors.push(`${prefix}instr ${i} GetUpvalue: idx ${instr.imm} out of range (captures=${fn.captures.length})`);
          }
          break;
        case Op.SetUpvalue:
          checkReg(instr.b, "val");
          if (instr.imm === undefined || instr.imm < 0 || instr.imm >= fn.captures.length) {
            errors.push(`${prefix}instr ${i} SetUpvalue: idx ${instr.imm} out of range (captures=${fn.captures.length})`);
          }
          break;
        case Op.SetBox:
          checkReg(instr.a, "box");
          checkReg(instr.b, "val");
          break;
        case Op.Match:
          checkReg(instr.a, "scrutinee");
          if (instr.imm === undefined || instr.imm < 0 || instr.imm >= fn.matchTables.length) {
            errors.push(`${prefix}instr ${i} Match: table index ${instr.imm} out of range`);
          }
          break;
        case Op.Panic:
          checkReg(instr.a, "msg");
          break;
        case Op.UnwrapOrProp:
          checkReg(instr.a, "dest");
          checkReg(instr.b, "src");
          break;
        case Op.SelfRef:
          checkReg(instr.a, "dest");
          break;
        case Op.LoadGlobal:
          checkReg(instr.a, "dest");
          if (instr.imm === undefined || instr.imm < 0 || instr.imm >= fn.strings.length) {
            errors.push(`${prefix}instr ${i} LoadGlobal: name index ${instr.imm} out of range`);
          }
          break;
        case Op.Nop: case Op.ReturnUnit: case Op.Breakpoint:
          break;
      }
    }
    // Verify match tables.
    for (let ti = 0; ti < fn.matchTables.length; ti++) {
      const table = fn.matchTables[ti];
      for (const e of table) {
        if (e.target < 0 || e.target >= fn.code.length) {
          errors.push(`${prefix}match table ${ti}: target ${e.target} out of range`);
        }
      }
    }
  }
  return errors;
}

//----------------------------------------------------------------------------
// Helper: construct a minimal BytecodeModule for tests
//----------------------------------------------------------------------------

export function makeModule(funcs: BytecodeFunc[], entry: number = 0): BytecodeModule {
  return { funcs, constants: [], entry };
}

export function makeFunc(name: string, code: Instr[], nlocals: number): BytecodeFunc {
  return {
    name,
    nparams: 0,
    nlocals,
    code,
    constants: [],
    matchTables: [],
    regLists: [],
    fieldLists: [],
    captures: [],
    selfReg: -1,
    strings: [],
  };
}
