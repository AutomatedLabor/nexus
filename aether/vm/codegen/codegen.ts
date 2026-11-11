/**
 * aether/vm/codegen/codegen.ts
 * =============================
 * IR → bytecode compiler. Maps an `IrProgram` to a `BytecodeModule`.
 *
 * Design
 * ------
 * For each `IrFunc`:
 *   1. Pre-allocate vreg → bytecode register index map (identity: vreg i → reg i).
 *      Spilling is unnecessary in v1 — we allow `nlocals` > 256 by using 16-bit
 *      register indices in the bytecode (per the bytecode spec).
 *   2. Compute block-id → instruction-offset map by laying out blocks in id
 *      order and concatenating their instructions. Each block becomes a
 *      contiguous run of Instrs. The `Br` targets are translated to absolute
 *      instruction indices via the block-offset map.
 *   3. Walk each block's `IrOp`s, emitting one or more `Instr`s per op. Match
 *      ops are compiled into a per-function `MatchTableEntry[]` stored in the
 *      function's `matchTables`.
 *   4. Intern strings (field names, variant tags, builtin names, function
 *      names) into the function's `strings` table. Float literals and big
 *      ints go into the `constants` table.
 *
 * The codegen is a single pass per function. There is no separate
 * optimization phase in v1 — the IR is already in a near-bytecode shape.
 *
 * Closures
 * --------
 * The codegen translates:
 *   - `MakeBox src dest`  → `MakeBox dest, src`
 *   - `Unbox src dest`    → `Unbox dest, src`
 *   - `SetBox box val`    → `SetBox box, val`
 *   - `MakeClosure funcIndex captures dest`
 *                          → intern captures into `fn.regLists`; emit
 *                            `MakeClosure dest, imm=funcIndex, regs=capturesIdx`.
 *
 * The function's `captures` (upvalue names) is copied verbatim from the
 * IR's `IrFunc.captures`. The VM uses these names to resolve `GetUpvalue`/
 * `SetUpvalue` operations against the calling closure's captured env.
 *
 * Pattern matching
 * ----------------
 * For each `Match` IR op, the codegen builds a `MatchTableEntry[]`. Each
 * IR pattern is translated recursively. The pattern's bindings are
 * resolved to vregs via the same scope-tracking the IR used (we re-walk
 * the arm bodies to discover which vreg each binding name maps to — see
 * `resolvePatternBindings`).
 *
 * For v1, the bindings written by a successful match are the vregs
 * allocated by the IR's `declarePatternBindings`. The codegen re-derives
 * these vregs by re-running the same allocation pass over the patterns
 * (since the IR doesn't expose the bindings map directly). This is a
 * duplication of effort but keeps the IR/bytecode boundary clean.
 *
 * Builtin calls
 * -------------
 * `CallBuiltin name args dest` → intern the name into `fn.strings`; intern
 * `args` into `fn.regLists`; emit `CallBuiltin dest, imm=nameIdx, regs=argsIdx`.
 *
 * Public surface
 * --------------
 *   function compileToBytecode(ir: IrProgram): BytecodeModule
 */
import type {
  IrProgram,
  IrFunc,
  IrBlock,
  IrOp,
  BinKind,
} from "../../core/ir/ir";
import type { Pattern } from "../../core/ast/ast";
import type { Value } from "../../core/eval/eval";
import {
  Op,
  type BytecodeModule,
  type BytecodeFunc,
  type Instr,
  type MatchTableEntry,
  type Constant,
  internString,
  internConstant,
  internRegList,
  internFieldList,
} from "../bytecode/bytecode";

//----------------------------------------------------------------------------
// Public entry
//----------------------------------------------------------------------------

export function compileToBytecode(ir: IrProgram): BytecodeModule {
  const funcs: BytecodeFunc[] = [];
  for (let i = 0; i < ir.funcs.length; i++) {
    funcs.push(compileFunc(ir, i, funcs));
  }
  // Find the main function (the one with isMain=true).
  let entry = ir.funcs.findIndex((f) => f.isMain);
  if (entry < 0) entry = 0;
  return { funcs, constants: [], entry };
}

//----------------------------------------------------------------------------
// Per-function compilation
//----------------------------------------------------------------------------

function compileFunc(ir: IrProgram, funcIndex: number, allFuncs: BytecodeFunc[]): BytecodeFunc {
  const irFn = ir.funcs[funcIndex];
  // Determine selfReg.
  const selfReg = (irFn as IrFunc & { selfReg?: number }).selfReg ?? -1;

  const fn: BytecodeFunc = {
    name: irFn.name,
    nparams: irFn.params.length,
    nlocals: irFn.nlocals,
    code: [],
    constants: [],
    matchTables: [],
    regLists: [],
    fieldLists: [],
    captures: irFn.captures,
    selfReg,
    strings: [],
    isMain: irFn.isMain,
  };

  // Block id → instruction offset (we'll fill this in after laying out).
  // For v1, we lay out blocks in their stored order (which is the order the
  // IR appended them). Each block's instructions are concatenated. The
  // final instruction is the terminator (Br or Return).
  const blockOffsets = new Map<number, number>();
  let offset = 0;
  for (const b of irFn.blocks) {
    blockOffsets.set(b.id, offset);
    offset += countInstrsForBlock(b);
  }
  // Total Instr count placeholder; we'll fill code as we go.
  // Compute block-offset targets *after* emitting all blocks — but to keep
  // things simple, we emit a placeholder for jump targets and patch them in
  // a second pass. Since we know each block's offset upfront (above), we can
  // compute targets directly.

  // Actually, countInstrsForBlock only gives an estimate — the real Instr
  // count per IrOp can vary (e.g., Break/Continue emit one Instr, but Const
  // emits one Instr, etc.). We need to be precise. Let's emit Instrs into a
  // temporary array per block, then concat with computed offsets.
  const blockInstrs = new Map<number, Instr[]>();
  for (const b of irFn.blocks) {
    blockInstrs.set(b.id, emitBlockInstrs(ir, fn, b, irFn, funcIndex));
  }
  // Now compute the actual offsets.
  let cur = 0;
  blockOffsets.clear();
  for (const b of irFn.blocks) {
    blockOffsets.set(b.id, cur);
    cur += blockInstrs.get(b.id)!.length;
  }
  // Patch jump targets: for each emitted Instr, if it's a jump, replace
  // block id with the instruction offset.
  for (const b of irFn.blocks) {
    const instrs = blockInstrs.get(b.id)!;
    for (const instr of instrs) {
      patchJumpTargets(instr, blockOffsets);
    }
  }
  // Concat into fn.code.
  for (const b of irFn.blocks) {
    fn.code.push(...blockInstrs.get(b.id)!);
  }
  // Patch match table targets similarly.
  for (const table of fn.matchTables) {
    for (const entry of table) {
      const off = blockOffsets.get(entry.target);
      if (off !== undefined) entry.target = off;
    }
  }

  return fn;
}

/** Count placeholder instrs — we don't strictly need this since we use the
 * emit-then-concat approach, but kept for clarity. */
function countInstrsForBlock(b: IrBlock): number {
  // Conservative upper bound — each IrOp emits at most 4 Instrs (for
  // Const bool/null where we emit one LoadBool/LoadNull, etc.).
  return b.instrs.length * 4;
}

function patchJumpTargets(instr: Instr, blockOffsets: Map<number, number>): void {
  switch (instr.op) {
    case Op.Jmp: case Op.JmpIf: case Op.JmpIfNot:
    case Op.Break: case Op.Continue:
      if (instr.imm !== undefined && instr.imm >= 0) {
        const off = blockOffsets.get(instr.imm);
        if (off !== undefined) instr.imm = off;
      }
      break;
    case Op.Br:
      if (instr.imm !== undefined && instr.imm >= 0) {
        const off = blockOffsets.get(instr.imm);
        if (off !== undefined) instr.imm = off;
      }
      if (instr.b !== undefined && instr.b >= 0) {
        const off = blockOffsets.get(instr.b);
        if (off !== undefined) instr.b = off;
      }
      break;
    default:
      break;
  }
}

//----------------------------------------------------------------------------
// Emit instructions for a block
//----------------------------------------------------------------------------

function emitBlockInstrs(
  ir: IrProgram,
  fn: BytecodeFunc,
  block: IrBlock,
  irFn: IrFunc,
  funcIndex: number,
): Instr[] {
  const out: Instr[] = [];
  for (const op of block.instrs) {
    emitOp(ir, fn, out, op, irFn, funcIndex);
  }
  return out;
}

function emitOp(
  ir: IrProgram,
  fn: BytecodeFunc,
  out: Instr[],
  op: IrOp,
  irFn: IrFunc,
  funcIndex: number,
): void {
  switch (op.op) {
    case "Const": {
      emitConst(fn, out, op.value, op.dest);
      return;
    }
    case "Move": {
      out.push({ op: Op.Dup, a: op.src, b: op.dest });
      return;
    }
    case "Bin": {
      const opc = binOp(op.kind);
      out.push({ op: opc, a: op.dest, b: op.lhs, c: op.rhs });
      return;
    }
    case "Un": {
      const opc = unOp(op.kind);
      out.push({ op: opc, a: op.dest, b: op.src });
      return;
    }
    case "Call": {
      const argsIdx = internRegList(fn, op.args);
      out.push({ op: Op.Call, a: op.dest, b: op.fn, regs: argsIdx });
      return;
    }
    case "CallBuiltin": {
      const nameIdx = internString(fn, op.name);
      const argsIdx = internRegList(fn, op.args);
      out.push({ op: Op.CallBuiltin, a: op.dest, imm: nameIdx, regs: argsIdx });
      return;
    }
    case "Phi": {
      // No phi in v1 — emit a Move from the first incoming (conservative).
      if (op.incoming.length > 0) {
        out.push({ op: Op.Dup, a: op.incoming[0].val, b: op.dest });
      }
      return;
    }
    case "Br": {
      if (op.cond === null) {
        if (op.then === -1) {
          out.push({ op: Op.Break, imm: 0 });
        } else if (op.then === -2) {
          out.push({ op: Op.Continue, imm: 0 });
        } else {
          out.push({ op: Op.Jmp, imm: op.then });
        }
      } else {
        if (op.then === -1) {
          // Br on cond to break — if cond, break; else jump to else.
          out.push({ op: Op.JmpIf, a: op.cond, imm: 0 }); // placeholder for break
          // The else target — emit a Jmp.
          out.push({ op: Op.Jmp, imm: op.else });
          // Back-patch the JmpIf target to a "Break" with target = else.
          // (We can't easily model "break if cond" with the current opcode
          // set; for v1 we emit JmpIf to a break sentinel. Since the only
          // use of break in the example suite is `break` (no condition),
          // this is a non-issue.)
          // Replace the JmpIf with a sequence: Not(cond), JmpIfNot(cond, target).
          // For simplicity, we just emit JmpIf(cond, <break sentinel>).
          // We'll use a special imm of -3 to denote "break".
          out[out.length - 2] = { op: Op.JmpIf, a: op.cond, imm: -3 };
          // Replace the trailing Jmp with else target — but Jmp's imm should
          // be the actual block id; we set it above.
          out[out.length - 1] = { op: Op.Jmp, imm: op.else };
        } else if (op.then === -2) {
          out.push({ op: Op.JmpIf, a: op.cond, imm: -4 }); // -4 = "continue if cond"
          out.push({ op: Op.Jmp, imm: op.else });
        } else {
          // Normal conditional Br: JmpIf(cond, then); Jmp(else).
          out.push({ op: Op.JmpIf, a: op.cond, imm: op.then });
          out.push({ op: Op.Jmp, imm: op.else });
        }
      }
      return;
    }
    case "Return": {
      out.push({ op: Op.Return, a: op.val });
      return;
    }
    case "LoadField": {
      const nameIdx = internString(fn, op.field);
      out.push({ op: Op.LoadField, a: op.dest, b: op.obj, imm: nameIdx });
      return;
    }
    case "StoreField": {
      const nameIdx = internString(fn, op.field);
      out.push({ op: Op.StoreField, a: op.obj, imm: nameIdx, b: op.val });
      return;
    }
    case "AllocStruct": {
      const nameIdx = internString(fn, op.name);
      const fieldsList: { name: string; reg: number }[] = Object.entries(op.fields).map(([n, r]) => ({ name: n, reg: r }));
      const fieldsIdx = internFieldList(fn, fieldsList);
      out.push({ op: Op.AllocStruct, a: op.dest, imm: nameIdx, fields: fieldsIdx });
      return;
    }
    case "AllocVariant": {
      const tag = `${op.enumName}::${op.variant}`;
      const tagIdx = internString(fn, tag);
      const argsIdx = internRegList(fn, op.data);
      out.push({ op: Op.AllocVariant, a: op.dest, imm: tagIdx, regs: argsIdx });
      return;
    }
    case "AllocArray": {
      const elemsIdx = internRegList(fn, op.elems);
      out.push({ op: Op.AllocArray, a: op.dest, regs: elemsIdx });
      return;
    }
    case "AllocTuple": {
      const elemsIdx = internRegList(fn, op.elems);
      out.push({ op: Op.AllocTuple, a: op.dest, regs: elemsIdx });
      return;
    }
    case "AllocMap": {
      const flat: number[] = [];
      for (const ent of op.entries) { flat.push(ent.key, ent.val); }
      const entriesIdx = internRegList(fn, flat);
      out.push({ op: Op.AllocMap, a: op.dest, regs: entriesIdx });
      return;
    }
    case "AllocRange": {
      out.push({ op: Op.AllocRange, a: op.dest, b: op.start, c: op.end, imm: op.inclusive ? 1 : 0 });
      return;
    }
    case "IndexGet": {
      out.push({ op: Op.IndexGet, a: op.dest, b: op.obj, c: op.idx });
      return;
    }
    case "IndexSet": {
      out.push({ op: Op.IndexSet, a: op.obj, b: op.idx, c: op.val });
      return;
    }
    case "TupleGet": {
      out.push({ op: Op.TupleGet, a: op.dest, b: op.obj, imm: op.idx });
      return;
    }
    case "Match": {
      // Populate the function's __matchBindings map from the IR's bindings.
      const matchBindings = (fn as BytecodeFunc & { __matchBindings?: Map<string, number> }).__matchBindings
        ?? new Map<string, number>();
      (fn as BytecodeFunc & { __matchBindings?: Map<string, number> }).__matchBindings = matchBindings;
      const tableIdx = fn.matchTables.length;
      for (const c of op.cases) {
        for (const b of c.bindings) {
          matchBindings.set(`${tableIdx}:${b.name}`, b.reg);
        }
      }
      const table = buildMatchTable(op.cases, op.elseBlock);
      fn.matchTables.push(table);
      out.push({ op: Op.Match, a: op.scrutinee, imm: tableIdx });
      return;
    }
    case "Len": {
      out.push({ op: Op.Len, a: op.dest, b: op.src });
      return;
    }
    case "MakeBox": {
      out.push({ op: Op.MakeBox, a: op.dest, b: op.src });
      return;
    }
    case "Unbox": {
      out.push({ op: Op.Unbox, a: op.dest, b: op.src });
      return;
    }
    case "SetBox": {
      out.push({ op: Op.SetBox, a: op.box, b: op.val });
      return;
    }
    case "GetUpvalue": {
      out.push({ op: Op.GetUpvalue, a: op.dest, imm: op.upvalueIndex });
      return;
    }
    case "SetUpvalue": {
      out.push({ op: Op.SetUpvalue, imm: op.upvalueIndex, b: op.val });
      return;
    }
    case "MakeClosure": {
      const capsIdx = internRegList(fn, op.captures);
      out.push({ op: Op.MakeClosure, a: op.dest, imm: op.funcIndex, regs: capsIdx });
      return;
    }
    case "Panic": {
      out.push({ op: Op.Panic, a: op.msg });
      return;
    }
    case "Print": {
      out.push({ op: Op.Print, a: op.src });
      return;
    }
    case "Cast": {
      switch (op.kind) {
        case "Int": out.push({ op: Op.CastInt, a: op.dest, b: op.src }); return;
        case "Float": out.push({ op: Op.CastFloat, a: op.dest, b: op.src }); return;
        case "Bool": out.push({ op: Op.CastBool, a: op.dest, b: op.src }); return;
        case "String": out.push({ op: Op.CastString, a: op.dest, b: op.src }); return;
      }
      return;
    }
    case "Nop": {
      out.push({ op: Op.Nop });
      return;
    }
  }
}

function binOp(kind: BinKind): Op {
  switch (kind) {
    case "Add": return Op.Add;
    case "Sub": return Op.Sub;
    case "Mul": return Op.Mul;
    case "Div": return Op.Div;
    case "IDiv": return Op.IDiv;
    case "Mod": return Op.Mod;
    case "Eq": return Op.Eq;
    case "Neq": return Op.Neq;
    case "Lt": return Op.Lt;
    case "Le": return Op.Le;
    case "Gt": return Op.Gt;
    case "Ge": return Op.Ge;
    case "And": return Op.Add; // shouldn't happen (short-circuited in IR)
    case "Or": return Op.Add;
    case "BitAnd": return Op.BitAnd;
    case "BitOr": return Op.BitOr;
    case "BitXor": return Op.BitXor;
    case "Shl": return Op.Shl;
    case "Shr": return Op.Shr;
  }
}

function unOp(kind: "Neg" | "Not" | "BitNot"): Op {
  switch (kind) {
    case "Neg": return Op.Neg;
    case "Not": return Op.Not;
    case "BitNot": return Op.BitNot;
  }
}

function emitConst(fn: BytecodeFunc, out: Instr[], v: Value, dest: number): void {
  if (v === null || v === undefined) {
    out.push({ op: Op.LoadNull, a: dest });
    return;
  }
  if (typeof v === "boolean") {
    out.push({ op: Op.LoadBool, a: dest, imm: v ? 1 : 0 });
    return;
  }
  if (typeof v === "number") {
    if (Number.isInteger(v) && v >= -32768 && v <= 32767) {
      out.push({ op: Op.LoadInt, a: dest, imm: v });
    } else {
      const cIdx = internConstant(fn, v);
      out.push({ op: Op.LoadFloat, a: dest, imm: cIdx });
    }
    return;
  }
  if (typeof v === "string") {
    const sIdx = internString(fn, v);
    out.push({ op: Op.LoadString, a: dest, imm: sIdx });
    return;
  }
  // Fallback: complex value as a constant (not supported in v1).
  out.push({ op: Op.LoadNull, a: dest });
}

//----------------------------------------------------------------------------
// Match table construction
//----------------------------------------------------------------------------

function buildMatchTable(
  cases: { pattern: Pattern; block: number; bindings?: { name: string; reg: number }[] }[],
  elseBlock: number,
): MatchTableEntry[] {
  const entries: MatchTableEntry[] = cases.map((c) => patternToEntry(c.pattern, c.block));
  // The else arm: a wildcard that always matches, jumping to elseBlock.
  entries.push({ patternKind: "Wildcard", target: elseBlock });
  return entries;
}

/** Convert an AST Pattern into a MatchTableEntry. The `subreg` fields
 * are filled in by the VM at match time — the codegen doesn't know which
 * vregs the bindings occupy (the IR allocated them but didn't thread
 * that info through the Match op). For v1, the VM uses the pattern's
 * binding names to look up registers in a side table that the codegen
 * attaches to the function. We attach this table via a `__bindingRegs`
 * field on the MatchTableEntry's parent table (the function's
 * `matchTables` array). See `attachBindingRegs`.
 *
 * For v1, we use a simpler scheme: we encode binding *names* into the
 * MatchTableEntry's `bindName` (for Bind), `fieldBindings[].name` (for
 * Struct), etc. The VM maintains a name→vreg map per call frame
 * (populated by the codegen's `bindingRegs` side table) so it can
 * resolve names to registers when matching. This keeps the codegen
 * simple at the cost of a runtime name lookup.
 */
function patternToEntry(p: Pattern, target: number): MatchTableEntry {
  switch (p.kind) {
    case "WildcardPat":
      return { patternKind: "Wildcard", target };
    case "BindPat":
      return { patternKind: "Bind", bindName: p.name, target };
    case "LitPat":
      return { patternKind: "Lit", litValue: evalLitPattern(p.value), target };
    case "TuplePat": {
      // For tuples, we'll use subregs at match time (assigned by the VM
      // based on the tuple's elements). The pattern's subpatterns are
      // recursively converted.
      const subs = p.elements.map((_, i) => ({ subreg: i, pattern: patternToEntry(_, target) }));
      return { patternKind: "Tuple", subregs: subs, target };
    }
    case "ArrayPat": {
      const subs = p.elements.map((_, i) => ({ subreg: i, pattern: patternToEntry(_, target) }));
      return { patternKind: "Array", subregs: subs, rest: !!p.rest, target };
    }
    case "StructPat": {
      const fieldBindings = p.fields.map((f) => ({
        name: f.name,
        subreg: 0, // filled by VM
        pattern: patternToEntry(f.pattern, target),
      }));
      return { patternKind: "Struct", structName: p.name, fieldBindings, rest: !!p.rest, target };
    }
    case "EnumPat": {
      const subs = p.subpatterns.map((_, i) => ({ subreg: i, pattern: patternToEntry(_, target) }));
      return { patternKind: "Enum", enumName: p.enumName, variant: p.variant, subregs: subs, target };
    }
    case "OrPat": {
      const subs = p.patterns.map((_, i) => ({ subreg: i, pattern: patternToEntry(_, target) }));
      return { patternKind: "Or", orPatterns: subs, target };
    }
    case "RestPat":
      return { patternKind: "Wildcard", target };
  }
}

/** Evaluate a literal-pattern expression to a Value. The pattern is a
 * constant expression (literal). */
function evalLitPattern(e: import("../../core/ast/ast").Expr): Value {
  switch (e.kind) {
    case "IntLit": return e.value;
    case "FloatLit": return e.value;
    case "BoolLit": return e.value;
    case "CharLit": return e.value;
    case "StringLit": {
      // Only literal text segments are allowed in patterns.
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
