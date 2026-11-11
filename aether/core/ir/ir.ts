/**
 * aether/core/ir/ir.ts
 * =====================
 * SSA-flavored intermediate representation between the Aether AST and the
 * bytecode VM.
 *
 * Design overview
 * ---------------
 * An `IrProgram` is a flat list of `IrFunc`s plus a table of top-level
 * "globals" (names → virtual registers) so cross-function references can be
 * resolved by the codegen pass.
 *
 * Each `IrFunc` has:
 *   - a unique list of `IrBlock`s (basic blocks),
 *   - a list of `params` (vreg indices for the function's parameters),
 *   - `nlocals` — total number of virtual registers the function uses,
 *   - `entry` — block id of the function entry block.
 *
 * Each `IrBlock` is a list of `IrOp`s followed by exactly one terminator
 * (`Br` or `Return`). The well-formedness rules are:
 *   - every block ends in exactly one terminator (`Br` or `Return`),
 *   - every block id referenced from a `Br` exists in the function,
 *   - every vreg index is < nlocals.
 *
 * Register-numbering scheme
 * -------------------------
 * v1 uses a *simple per-function virtual-register allocator*: every binding
 * (let / mut / const / parameter / pattern-binding / intermediate result)
 * gets a fresh vreg index. There are NO phi nodes in this v1 — when control
 * flow merges, the merged value is held in a single vreg that both
 * predecessors write into via `Move`. This is technically not "true SSA"
 * (a vreg can be assigned more than once), but it's pragmatic, easy to
 * codegen, and produces correct bytecode. We document this simplification
 * at the top of each generated function. Full SSA + phi is left for v2.
 *
 * Current-block model
 * -------------------
 * `LowerCtx.currentBlock` holds the block being emitted into. After a
 * terminator (`Br`, `Return`) is emitted, the current block is *sealed* and
 * a fresh empty block becomes the current block. Subsequent emits go to
 * the fresh block. LowerExpr/LowerStmt always read `ctx.currentBlock`,
 * so callers don't need to pass it explicitly. This keeps the lowering
 * code linear even through nested control-flow constructs.
 *
 * Closures / captures
 * -------------------
 * When a nested `fn` or lambda captures a variable from the enclosing
 * scope, that variable is "boxed" — its vreg stores a Box (a one-cell
 * mutable container) so the inner function can read/write through it.
 * The IR emits `MakeBox` (allocates a box from a value), `Unbox` (reads a
 * box's content), `SetBox` (writes a box's content), and `MakeClosure`
 * (packs a list of boxes/values into a closure value carrying the function
 * index + the captures array). Reads/writes of *captured* variables go
 * through the box ops; reads/writes of *non-captured* variables are
 * plain `Move`s. The codegen maps these to bytecode `GetUpvalue`/
 * `SetUpvalue`/`MakeClosure` instructions.
 *
 * Builtin calls
 * -------------
 * Builtins (`print`, `len`, `range`, `map`, `filter`, `reduce`, …) are
 * emitted as `CallBuiltin` ops carrying the builtin name. The codegen
 * resolves them to `Op.CallBuiltin` instructions; the VM dispatches to the
 * builtin registry shared with the tree-walker (see vm/interpreter/vm.ts).
 *
 * Public surface
 * --------------
 *   type IrOp, IrBlock, IrFunc, IrProgram
 *   function lowerToIr(program: Program): IrProgram
 */
import type {
  Program,
  Stmt,
  Expr,
  Pattern,
  FnDecl,
  Block,
  MatchArm,
  StringSegment,
} from "../ast/ast";
import type { Value } from "../eval/eval";

//----------------------------------------------------------------------------
// Public types
//----------------------------------------------------------------------------

export type BinKind =
  | "Add" | "Sub" | "Mul" | "Div" | "IDiv" | "Mod"
  | "Eq" | "Neq" | "Lt" | "Le" | "Gt" | "Ge"
  | "And" | "Or"
  | "BitAnd" | "BitOr" | "BitXor" | "Shl" | "Shr";

export type UnKind = "Neg" | "Not" | "BitNot";

export type IrOp =
  | { op: "Const"; value: Value; dest: number }
  | { op: "Move"; src: number; dest: number }
  | { op: "Bin"; kind: BinKind; lhs: number; rhs: number; dest: number }
  | { op: "Un"; kind: UnKind; src: number; dest: number }
  | { op: "Call"; fn: number; args: number[]; dest: number }
  | { op: "CallBuiltin"; name: string; args: number[]; dest: number }
  | { op: "Phi"; incoming: { block: number; val: number }[]; dest: number }
  | { op: "Br"; cond: number | null; then: number; else: number }
  | { op: "Return"; val: number }
  | { op: "LoadField"; obj: number; field: string; dest: number }
  | { op: "StoreField"; obj: number; field: string; val: number }
  | { op: "AllocStruct"; name: string; fields: Record<string, number>; dest: number }
  | { op: "AllocVariant"; enumName: string; variant: string; data: number[]; dest: number }
  | { op: "AllocArray"; elems: number[]; dest: number }
  | { op: "AllocMap"; entries: { key: number; val: number }[]; dest: number }
  | { op: "AllocTuple"; elems: number[]; dest: number }
  | { op: "AllocRange"; start: number; end: number; inclusive: boolean; dest: number }
  | { op: "IndexGet"; obj: number; idx: number; dest: number }
  | { op: "IndexSet"; obj: number; idx: number; val: number }
  | { op: "TupleGet"; obj: number; idx: number; dest: number }
  | { op: "Match"; scrutinee: number; cases: { pattern: Pattern; block: number; bindings: { name: string; reg: number }[] }[]; elseBlock: number }
  | { op: "Len"; src: number; dest: number }
  | { op: "MakeBox"; src: number; dest: number }
  | { op: "Unbox"; src: number; dest: number }
  | { op: "SetBox"; box: number; val: number }
  | { op: "GetUpvalue"; upvalueIndex: number; dest: number }
  | { op: "SetUpvalue"; upvalueIndex: number; val: number }
  | { op: "MakeClosure"; funcIndex: number; captures: number[]; dest: number }
  | { op: "Panic"; msg: number }
  | { op: "Print"; src: number }
  | { op: "Cast"; kind: "Int" | "Float" | "Bool" | "String"; src: number; dest: number }
  | { op: "Nop" };

export interface IrBlock {
  id: number;
  instrs: IrOp[];
}

export interface IrFunc {
  name: string;
  /** Virtual-register indices for each declared parameter. */
  params: number[];
  /** Function's blocks. */
  blocks: IrBlock[];
  /** Block id of the entry block. */
  entry: number;
  /** Total number of virtual registers used. */
  nlocals: number;
  /** For nested functions: list of free-variable names captured from the
   * enclosing function. Each name corresponds to a vreg in the enclosing
   * scope. The closure carries these as upvalues. */
  captures: string[];
  /** True iff this function is the top-level program (the synthesized main). */
  isMain: boolean;
  /** Locally-nested function definitions (by index into IrProgram.funcs). */
  nested: number[];
  /** Optional display-name for closures synthesized from lambdas. */
  displayName?: string;
  /** Self-reference slot (recursive closure); -1 if none. */
  selfReg?: number;
}

export interface IrProgram {
  funcs: IrFunc[];
  /** Top-level (global) name → vreg in the main function. */
  globals: Map<string, number>;
}

//----------------------------------------------------------------------------
// Lowering state
//----------------------------------------------------------------------------

interface LowerCtx {
  funcs: IrFunc[];
  current: IrFunc | null;
  currentBlock: IrBlock | null;
  scopes: Array<Map<string, { vreg: number; boxed: boolean; isUpvalue?: boolean; upvalueIndex?: number }>>;
  capturedNames: Set<string>;
  nextBlockId: number;
}

function newCtx(): LowerCtx {
  return { funcs: [], current: null, currentBlock: null, scopes: [], capturedNames: new Set(), nextBlockId: 0 };
}

function allocReg(ctx: LowerCtx): number {
  if (!ctx.current) throw new Error("allocReg: no current function");
  return ctx.current.nlocals++;
}

function lookupVar(ctx: LowerCtx, name: string): { vreg: number; boxed: boolean; isUpvalue?: boolean; upvalueIndex?: number } | null {
  for (let i = ctx.scopes.length - 1; i >= 0; i--) {
    const v = ctx.scopes[i].get(name);
    if (v) return v;
  }
  return null;
}

function pushScope(ctx: LowerCtx): void { ctx.scopes.push(new Map()); }
function popScope(ctx: LowerCtx): void { ctx.scopes.pop(); }

function declareVar(ctx: LowerCtx, name: string, boxed: boolean): number {
  const vreg = allocReg(ctx);
  ctx.scopes[ctx.scopes.length - 1].set(name, { vreg, boxed });
  return vreg;
}

function newBlock(ctx: LowerCtx): IrBlock {
  const b: IrBlock = { id: ctx.nextBlockId++, instrs: [] };
  if (!ctx.current) throw new Error("newBlock: no current function");
  ctx.current.blocks.push(b);
  return b;
}

/** Set the current block to a fresh empty block and return it. */
function freshBlock(ctx: LowerCtx): IrBlock {
  ctx.currentBlock = newBlock(ctx);
  return ctx.currentBlock;
}

function emit(ctx: LowerCtx, op: IrOp): void {
  if (!ctx.currentBlock) throw new Error("emit: no current block");
  ctx.currentBlock.instrs.push(op);
}

/** Emit a terminator and replace the current block with a fresh empty
 * block (so subsequent emits go to a new block). Returns the new block. */
function terminate(ctx: LowerCtx, op: IrOp): IrBlock {
  emit(ctx, op);
  return freshBlock(ctx);
}

//----------------------------------------------------------------------------
// First pass: collect captured names
//----------------------------------------------------------------------------

function collectReads(b: Block, reads: Set<string>): void {
  for (const s of b.stmts) collectReadsStmt(s, reads);
  if (b.expr) collectReadsExpr(b.expr, reads);
}

function collectReadsStmt(s: Stmt, reads: Set<string>): void {
  switch (s.kind) {
    case "Let": case "Const": case "MutLet":
      collectReadsExpr(s.init, reads); return;
    case "FnDecl":
      collectReads(s.body, reads); return;
    case "ExprStmt":
      collectReadsExpr(s.expr, reads); return;
    case "AssignStmt":
      collectReadsExpr(s.target, reads);
      collectReadsExpr(s.value, reads);
      return;
    case "Return":
      if (s.expr) collectReadsExpr(s.expr, reads);
      return;
    case "While":
      collectReadsExpr(s.cond, reads);
      collectReads(s.body, reads);
      return;
    case "ForIn":
      collectReadsExpr(s.iterable, reads);
      collectReads(s.body, reads);
      return;
    case "Print":
      collectReadsExpr(s.expr, reads);
      return;
    case "BlockStmt":
      collectReads({ kind: "Block", loc: s.loc, stmts: s.body, expr: null }, reads);
      return;
  }
}

function collectReadsExpr(e: Expr, reads: Set<string>): void {
  switch (e.kind) {
    case "Ident": reads.add(e.name); return;
    case "Binary":
      collectReadsExpr(e.left, reads);
      collectReadsExpr(e.right, reads);
      return;
    case "Unary": collectReadsExpr(e.operand, reads); return;
    case "Assign":
      collectReadsExpr(e.target, reads);
      collectReadsExpr(e.value, reads);
      return;
    case "CompoundAssign":
      collectReadsExpr(e.target, reads);
      collectReadsExpr(e.value, reads);
      return;
    case "Call":
      collectReadsExpr(e.callee, reads);
      for (const a of e.args) collectReadsExpr(a, reads);
      return;
    case "Index":
      collectReadsExpr(e.object, reads);
      collectReadsExpr(e.index, reads);
      return;
    case "Field":
      collectReadsExpr(e.object, reads);
      return;
    case "MethodCall":
      collectReadsExpr(e.object, reads);
      for (const a of e.args) collectReadsExpr(a, reads);
      return;
    case "TupleExpr": case "ArrayExpr":
      for (const el of e.elements) collectReadsExpr(el, reads);
      return;
    case "MapExpr":
      for (const ent of e.entries) {
        collectReadsExpr(ent.key, reads);
        collectReadsExpr(ent.value, reads);
      }
      return;
    case "StructExpr":
      if (e.spread) collectReadsExpr(e.spread, reads);
      for (const f of e.fields) collectReadsExpr(f.value, reads);
      return;
    case "EnumVariant":
      for (const a of e.args) collectReadsExpr(a, reads);
      return;
    case "Lambda": return; // separate function
    case "If":
      collectReadsExpr(e.cond, reads);
      collectReadsExpr(e.then, reads);
      if (e.else) collectReadsExpr(e.else, reads);
      return;
    case "Match":
      collectReadsExpr(e.scrutinee, reads);
      for (const arm of e.arms) {
        collectPatternReads(arm.pattern, reads);
        if (arm.guard) collectReadsExpr(arm.guard, reads);
        collectReadsExpr(arm.body, reads);
      }
      return;
    case "Block": collectReads(e, reads); return;
    case "Paren": collectReadsExpr(e.expr, reads); return;
    case "Cast": case "As": collectReadsExpr(e.expr, reads); return;
    case "Range":
      collectReadsExpr(e.start, reads);
      collectReadsExpr(e.end, reads);
      return;
    case "ErrorProp": collectReadsExpr(e.expr, reads); return;
    case "TupleField": collectReadsExpr(e.object, reads); return;
    case "Return": if (e.expr) collectReadsExpr(e.expr, reads); return;
    case "Spread": collectReadsExpr(e.expr, reads); return;
    default: return;
  }
}

function collectPatternReads(p: Pattern, reads: Set<string>): void {
  switch (p.kind) {
    case "LitPat": collectReadsExpr(p.value, reads); return;
    case "TuplePat": for (const sub of p.elements) collectPatternReads(sub, reads); return;
    case "ArrayPat": for (const sub of p.elements) collectPatternReads(sub, reads); return;
    case "StructPat": for (const f of p.fields) collectPatternReads(f.pattern, reads); return;
    case "EnumPat": for (const sub of p.subpatterns) collectPatternReads(sub, reads); return;
    case "OrPat": for (const sub of p.patterns) collectPatternReads(sub, reads); return;
    default: return;
  }
}

/** Collect all names that are READ inside `body` but not declared as locals
 * inside `body`. Returns the set of free-variable names. */
function freeVarsOfFn(body: Block, paramNames: Set<string>): Set<string> {
  const reads = new Set<string>();
  collectReads(body, reads);
  // Determine which names are declared as locals inside the body.
  const localNames = new Set<string>();
  for (const p of paramNames) localNames.add(p);
  collectLocalNames(body, localNames);
  const free = new Set<string>();
  for (const r of reads) {
    if (!localNames.has(r)) free.add(r);
  }
  return free;
}

/** Walk a block and record names bound by let/mut/const/fn/for. */
function collectLocalNames(b: Block, names: Set<string>): void {
  for (const s of b.stmts) collectLocalNamesStmt(s, names);
  if (b.expr) collectLocalNamesExpr(b.expr, names);
}

function collectLocalNamesStmt(s: Stmt, names: Set<string>): void {
  switch (s.kind) {
    case "Let": case "Const": case "MutLet":
      names.add(s.name);
      collectLocalNamesExpr(s.init, names);
      return;
    case "FnDecl":
      names.add(s.name);
      // Don't recurse into the fn body — its locals are separate.
      return;
    case "ExprStmt":
      collectLocalNamesExpr(s.expr, names);
      return;
    case "AssignStmt":
      collectLocalNamesExpr(s.target, names);
      collectLocalNamesExpr(s.value, names);
      return;
    case "Return":
      if (s.expr) collectLocalNamesExpr(s.expr, names);
      return;
    case "While":
      collectLocalNamesExpr(s.cond, names);
      collectLocalNames(s.body, names);
      return;
    case "ForIn":
      names.add(s.varName);
      collectLocalNamesExpr(s.iterable, names);
      collectLocalNames(s.body, names);
      return;
    case "Print":
      collectLocalNamesExpr(s.expr, names);
      return;
    case "BlockStmt":
      collectLocalNames({ kind: "Block", loc: s.loc, stmts: s.body, expr: null }, names);
      return;
  }
}

function collectLocalNamesExpr(e: Expr, names: Set<string>): void {
  switch (e.kind) {
    case "Binary":
      collectLocalNamesExpr(e.left, names);
      collectLocalNamesExpr(e.right, names);
      return;
    case "Unary": collectLocalNamesExpr(e.operand, names); return;
    case "Assign":
      collectLocalNamesExpr(e.target, names);
      collectLocalNamesExpr(e.value, names);
      return;
    case "CompoundAssign":
      collectLocalNamesExpr(e.target, names);
      collectLocalNamesExpr(e.value, names);
      return;
    case "Call":
      collectLocalNamesExpr(e.callee, names);
      for (const a of e.args) collectLocalNamesExpr(a, names);
      return;
    case "Index":
      collectLocalNamesExpr(e.object, names);
      collectLocalNamesExpr(e.index, names);
      return;
    case "Field":
      collectLocalNamesExpr(e.object, names);
      return;
    case "MethodCall":
      collectLocalNamesExpr(e.object, names);
      for (const a of e.args) collectLocalNamesExpr(a, names);
      return;
    case "TupleExpr": case "ArrayExpr":
      for (const el of e.elements) collectLocalNamesExpr(el, names);
      return;
    case "MapExpr":
      for (const ent of e.entries) {
        collectLocalNamesExpr(ent.key, names);
        collectLocalNamesExpr(ent.value, names);
      }
      return;
    case "StructExpr":
      if (e.spread) collectLocalNamesExpr(e.spread, names);
      for (const f of e.fields) collectLocalNamesExpr(f.value, names);
      return;
    case "EnumVariant":
      for (const a of e.args) collectLocalNamesExpr(a, names);
      return;
    case "Lambda": return; // separate function
    case "If":
      collectLocalNamesExpr(e.cond, names);
      collectLocalNamesExpr(e.then, names);
      if (e.else) collectLocalNamesExpr(e.else, names);
      return;
    case "Match":
      collectLocalNamesExpr(e.scrutinee, names);
      for (const arm of e.arms) {
        collectLocalNamesPattern(arm.pattern, names);
        if (arm.guard) collectLocalNamesExpr(arm.guard, names);
        collectLocalNamesExpr(arm.body, names);
      }
      return;
    case "Block": collectLocalNames(e, names); return;
    case "Paren": collectLocalNamesExpr(e.expr, names); return;
    case "Cast": case "As": collectLocalNamesExpr(e.expr, names); return;
    case "Range":
      collectLocalNamesExpr(e.start, names);
      collectLocalNamesExpr(e.end, names);
      return;
    case "ErrorProp": collectLocalNamesExpr(e.expr, names); return;
    case "TupleField": collectLocalNamesExpr(e.object, names); return;
    case "Return": if (e.expr) collectLocalNamesExpr(e.expr, names); return;
    case "Spread": collectLocalNamesExpr(e.expr, names); return;
    default: return;
  }
}

function collectLocalNamesPattern(p: Pattern, names: Set<string>): void {
  switch (p.kind) {
    case "BindPat": names.add(p.name); return;
    case "TuplePat": for (const sub of p.elements) collectLocalNamesPattern(sub, names); return;
    case "ArrayPat": for (const sub of p.elements) collectLocalNamesPattern(sub, names); return;
    case "StructPat": for (const f of p.fields) collectLocalNamesPattern(f.pattern, names); return;
    case "EnumPat": for (const sub of p.subpatterns) collectLocalNamesPattern(sub, names); return;
    case "OrPat": for (const sub of p.patterns) collectLocalNamesPattern(sub, names); return;
    default: return;
  }
}

/** For each name in `captures`, mark it as captured in `ctx.capturedNames`
 * so subsequent let-bindings will allocate a Box for it. */
function markCaptured(ctx: LowerCtx, captures: string[]): void {
  for (const c of captures) ctx.capturedNames.add(c);
}

//----------------------------------------------------------------------------
// Lowering: expressions
//----------------------------------------------------------------------------

function lowerExpr(ctx: LowerCtx, e: Expr): number {
  switch (e.kind) {
    case "IntLit": case "FloatLit": case "BoolLit": case "CharLit": {
      const d = allocReg(ctx);
      emit(ctx, { op: "Const", value: e.value, dest: d });
      return d;
    }
    case "StringLit": return lowerStringLit(ctx, e.segments);
    case "UnitLit": {
      const d = allocReg(ctx);
      emit(ctx, { op: "Const", value: null, dest: d });
      return d;
    }
    case "Ident": {
      const v = lookupVar(ctx, e.name);
      if (!v) {
        // Undefined name — emit a panic.
        const msg = allocReg(ctx);
        emit(ctx, { op: "Const", value: `undefined name '${e.name}'`, dest: msg });
        const d = allocReg(ctx);
        emit(ctx, { op: "Panic", msg });
        emit(ctx, { op: "Const", value: null, dest: d });
        return d;
      }
      if (v.isUpvalue) {
        // Read via GetUpvalue (returns the Box) + Unbox (dereferences).
        const boxReg = allocReg(ctx);
        emit(ctx, { op: "GetUpvalue", upvalueIndex: v.upvalueIndex!, dest: boxReg });
        const d = allocReg(ctx);
        emit(ctx, { op: "Unbox", src: boxReg, dest: d });
        return d;
      }
      if (v.boxed) {
        const d = allocReg(ctx);
        emit(ctx, { op: "Unbox", src: v.vreg, dest: d });
        return d;
      }
      return v.vreg;
    }
    case "Paren": return lowerExpr(ctx, e.expr);
    case "Binary": return lowerBinary(ctx, e);
    case "Unary": return lowerUnary(ctx, e);
    case "Assign": return lowerAssign(ctx, e);
    case "CompoundAssign": return lowerCompoundAssign(ctx, e);
    case "Call": return lowerCall(ctx, e);
    case "Index": {
      const obj = lowerExpr(ctx, e.object);
      const idx = lowerExpr(ctx, e.index);
      const d = allocReg(ctx);
      emit(ctx, { op: "IndexGet", obj, idx, dest: d });
      return d;
    }
    case "Field": {
      const obj = lowerExpr(ctx, e.object);
      const d = allocReg(ctx);
      emit(ctx, { op: "LoadField", obj, field: e.name, dest: d });
      return d;
    }
    case "MethodCall": {
      const recv = lowerExpr(ctx, e.object);
      const args = e.args.map((a) => lowerExpr(ctx, a));
      const fnVar = lookupVar(ctx, e.name);
      const d = allocReg(ctx);
      if (fnVar) {
        let callee: number;
        if (fnVar.isUpvalue) {
          callee = allocReg(ctx);
          const boxReg = allocReg(ctx);
          emit(ctx, { op: "GetUpvalue", upvalueIndex: fnVar.upvalueIndex!, dest: boxReg });
          emit(ctx, { op: "Unbox", src: boxReg, dest: callee });
        } else if (fnVar.boxed) {
          callee = allocReg(ctx);
          emit(ctx, { op: "Unbox", src: fnVar.vreg, dest: callee });
        } else {
          callee = fnVar.vreg;
        }
        emit(ctx, { op: "Call", fn: callee, args: [recv, ...args], dest: d });
      } else {
        emit(ctx, { op: "CallBuiltin", name: e.name, args: [recv, ...args], dest: d });
      }
      return d;
    }
    case "TupleExpr": {
      const elems = e.elements.map((el) => lowerExpr(ctx, el));
      const d = allocReg(ctx);
      emit(ctx, { op: "AllocTuple", elems, dest: d });
      return d;
    }
    case "ArrayExpr": {
      const elems = e.elements.map((el) => lowerExpr(ctx, el));
      const d = allocReg(ctx);
      emit(ctx, { op: "AllocArray", elems, dest: d });
      return d;
    }
    case "MapExpr": {
      const entries = e.entries.map((ent) => ({
        key: lowerExpr(ctx, ent.key),
        val: lowerExpr(ctx, ent.value),
      }));
      const d = allocReg(ctx);
      emit(ctx, { op: "AllocMap", entries, dest: d });
      return d;
    }
    case "StructExpr": return lowerStructExpr(ctx, e);
    case "EnumVariant": {
      const data = e.args.map((a) => lowerExpr(ctx, a));
      const d = allocReg(ctx);
      emit(ctx, { op: "AllocVariant", enumName: e.enumName, variant: e.variant, data, dest: d });
      return d;
    }
    case "Lambda": return lowerLambda(ctx, e);
    case "If": return lowerIf(ctx, e);
    case "Match": return lowerMatch(ctx, e);
    case "Block": {
      pushScope(ctx);
      let last: number;
      try {
        for (const s of e.stmts) last = lowerStmt(ctx, s);
        if (e.expr) last = lowerExpr(ctx, e.expr);
        else {
          last = allocReg(ctx);
          emit(ctx, { op: "Const", value: null, dest: last });
        }
      } finally {
        popScope(ctx);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return last!;
    }
    case "Cast": case "As": return lowerCast(ctx, e);
    case "Range": {
      const start = lowerExpr(ctx, e.start);
      const end = lowerExpr(ctx, e.end);
      const d = allocReg(ctx);
      emit(ctx, { op: "AllocRange", start, end, inclusive: e.inclusive, dest: d });
      return d;
    }
    case "ErrorProp": return lowerErrorProp(ctx, e);
    case "TupleField": {
      const obj = lowerExpr(ctx, e.object);
      const d = allocReg(ctx);
      emit(ctx, { op: "TupleGet", obj, idx: e.index, dest: d });
      return d;
    }
    case "SelfExpr": {
      const msg = allocReg(ctx);
      emit(ctx, { op: "Const", value: "`self` is not supported outside of a method", dest: msg });
      const d = allocReg(ctx);
      emit(ctx, { op: "Panic", msg });
      emit(ctx, { op: "Const", value: null, dest: d });
      return d;
    }
    case "Spread": {
      const msg = allocReg(ctx);
      emit(ctx, { op: "Const", value: "spread `...x` is not a standalone expression", dest: msg });
      const d = allocReg(ctx);
      emit(ctx, { op: "Panic", msg });
      emit(ctx, { op: "Const", value: null, dest: d });
      return d;
    }
    case "Return": {
      const v = e.expr ? lowerExpr(ctx, e.expr) : (() => {
        const d = allocReg(ctx);
        emit(ctx, { op: "Const", value: null, dest: d });
        return d;
      })();
      terminate(ctx, { op: "Return", val: v });
      const d = allocReg(ctx);
      emit(ctx, { op: "Const", value: null, dest: d });
      return d;
    }
  }
  const d = allocReg(ctx);
  emit(ctx, { op: "Const", value: null, dest: d });
  return d;
}

function lowerStringLit(ctx: LowerCtx, segments: StringSegment[]): number {
  if (segments.length === 0) {
    const d = allocReg(ctx);
    emit(ctx, { op: "Const", value: "", dest: d });
    return d;
  }
  let cur = lowerStringSeg(ctx, segments[0]);
  for (let i = 1; i < segments.length; i++) {
    const next = lowerStringSeg(ctx, segments[i]);
    const d = allocReg(ctx);
    emit(ctx, { op: "Bin", kind: "Add", lhs: cur, rhs: next, dest: d });
    cur = d;
  }
  return cur;
}

function lowerStringSeg(ctx: LowerCtx, seg: StringSegment): number {
  if (seg.kind === "text") {
    const d = allocReg(ctx);
    emit(ctx, { op: "Const", value: seg.value, dest: d });
    return d;
  }
  if (seg.expr) return lowerExpr(ctx, seg.expr);
  const d = allocReg(ctx);
  emit(ctx, { op: "Const", value: seg.value, dest: d });
  return d;
}

function lowerBinary(ctx: LowerCtx, e: Extract<Expr, { kind: "Binary" }>): number {
  const op = e.op;
  if (op === "&&" || op === "||" || op === "or") {
    return lowerShortCircuit(ctx, e);
  }
  const lhs = lowerExpr(ctx, e.left);
  const rhs = lowerExpr(ctx, e.right);
  const d = allocReg(ctx);
  emit(ctx, { op: "Bin", kind: binKind(op), lhs, rhs, dest: d });
  return d;
}

function binKind(op: string): BinKind {
  switch (op) {
    case "+": return "Add";
    case "-": return "Sub";
    case "*": return "Mul";
    case "/": return "Div";
    case "==": return "Eq";
    case "!=": return "Neq";
    case "<": return "Lt";
    case "<=": return "Le";
    case ">": return "Gt";
    case ">=": return "Ge";
    case "&": return "BitAnd";
    case "|": return "BitOr";
    case "^": return "BitXor";
    case "<<": return "Shl";
    case ">>": return "Shr";
    case "%": return "Mod";
  }
  throw new Error("binKind: unknown op " + op);
}

function lowerShortCircuit(ctx: LowerCtx, e: Extract<Expr, { kind: "Binary" }>): number {
  const op = e.op;
  const resultReg = allocReg(ctx);
  const lhs = lowerExpr(ctx, e.left);
  const lhsBlock = ctx.currentBlock!;
  const rhsBlock = newBlock(ctx);
  const shortBlock = newBlock(ctx);
  const mergeBlock = newBlock(ctx);

  if (op === "or") {
    // if truthy(lhs) → result = lhs; else result = rhs.
    terminate(ctx, { op: "Br", cond: lhs, then: shortBlock.id, else: rhsBlock.id });
    // shortBlock
    ctx.currentBlock = shortBlock;
    emit(ctx, { op: "Move", src: lhs, dest: resultReg });
    terminate(ctx, { op: "Br", cond: null, then: mergeBlock.id, else: mergeBlock.id });
    // rhsBlock
    ctx.currentBlock = rhsBlock;
    pushScope(ctx);
    const rhs = lowerExpr(ctx, e.right);
    popScope(ctx);
    emit(ctx, { op: "Move", src: rhs, dest: resultReg });
    terminate(ctx, { op: "Br", cond: null, then: mergeBlock.id, else: mergeBlock.id });
  } else if (op === "||") {
    terminate(ctx, { op: "Br", cond: lhs, then: shortBlock.id, else: rhsBlock.id });
    ctx.currentBlock = shortBlock;
    emit(ctx, { op: "Const", value: true, dest: resultReg });
    terminate(ctx, { op: "Br", cond: null, then: mergeBlock.id, else: mergeBlock.id });
    ctx.currentBlock = rhsBlock;
    pushScope(ctx);
    const rhs = lowerExpr(ctx, e.right);
    popScope(ctx);
    // result = truthy(rhs): Not(Not(rhs)).
    const t1 = allocReg(ctx);
    emit(ctx, { op: "Un", kind: "Not", src: rhs, dest: t1 });
    const t2 = allocReg(ctx);
    emit(ctx, { op: "Un", kind: "Not", src: t1, dest: t2 });
    emit(ctx, { op: "Move", src: t2, dest: resultReg });
    terminate(ctx, { op: "Br", cond: null, then: mergeBlock.id, else: mergeBlock.id });
  } else {
    // && — if !truthy(lhs) → result = false; else result = truthy(rhs).
    const notLhs = allocReg(ctx);
    emit(ctx, { op: "Un", kind: "Not", src: lhs, dest: notLhs });
    terminate(ctx, { op: "Br", cond: notLhs, then: shortBlock.id, else: rhsBlock.id });
    ctx.currentBlock = shortBlock;
    emit(ctx, { op: "Const", value: false, dest: resultReg });
    terminate(ctx, { op: "Br", cond: null, then: mergeBlock.id, else: mergeBlock.id });
    ctx.currentBlock = rhsBlock;
    pushScope(ctx);
    const rhs = lowerExpr(ctx, e.right);
    popScope(ctx);
    const t1 = allocReg(ctx);
    emit(ctx, { op: "Un", kind: "Not", src: rhs, dest: t1 });
    const t2 = allocReg(ctx);
    emit(ctx, { op: "Un", kind: "Not", src: t1, dest: t2 });
    emit(ctx, { op: "Move", src: t2, dest: resultReg });
    terminate(ctx, { op: "Br", cond: null, then: mergeBlock.id, else: mergeBlock.id });
  }
  void lhsBlock;
  // Continue on mergeBlock.
  ctx.currentBlock = mergeBlock;
  return resultReg;
}

function lowerUnary(ctx: LowerCtx, e: Extract<Expr, { kind: "Unary" }>): number {
  const src = lowerExpr(ctx, e.operand);
  const d = allocReg(ctx);
  const kind: UnKind = e.op === "-" ? "Neg" : e.op === "!" ? "Not" : "BitNot";
  emit(ctx, { op: "Un", kind, src, dest: d });
  return d;
}

function lowerAssign(ctx: LowerCtx, e: Extract<Expr, { kind: "Assign" }>): number {
  const v = lowerExpr(ctx, e.value);
  lowerAssignTo(ctx, e.target, v);
  return v;
}

function lowerCompoundAssign(ctx: LowerCtx, e: Extract<Expr, { kind: "CompoundAssign" }>): number {
  const cur = lowerExpr(ctx, e.target);
  const rhs = lowerExpr(ctx, e.value);
  const d = allocReg(ctx);
  emit(ctx, { op: "Bin", kind: binKind(e.op), lhs: cur, rhs, dest: d });
  lowerAssignTo(ctx, e.target, d);
  return d;
}

function lowerAssignTo(ctx: LowerCtx, target: Expr, val: number): void {
  if (target.kind === "Ident") {
    const v = lookupVar(ctx, target.name);
    if (!v) { emit(ctx, { op: "Panic", msg: val }); return; }
    if (v.isUpvalue) {
      // Write via GetUpvalue + SetBox.
      const boxReg = allocReg(ctx);
      emit(ctx, { op: "GetUpvalue", upvalueIndex: v.upvalueIndex!, dest: boxReg });
      emit(ctx, { op: "SetBox", box: boxReg, val });
      return;
    }
    if (v.boxed) emit(ctx, { op: "SetBox", box: v.vreg, val });
    else emit(ctx, { op: "Move", src: val, dest: v.vreg });
    return;
  }
  if (target.kind === "Index") {
    const obj = lowerExpr(ctx, target.object);
    const idx = lowerExpr(ctx, target.index);
    emit(ctx, { op: "IndexSet", obj, idx, val });
    return;
  }
  if (target.kind === "Field") {
    const obj = lowerExpr(ctx, target.object);
    emit(ctx, { op: "StoreField", obj, field: target.name, val });
    return;
  }
  emit(ctx, { op: "Panic", msg: val });
}

function lowerCall(ctx: LowerCtx, e: Extract<Expr, { kind: "Call" }>): number {
  const args = e.args.map((a) => lowerExpr(ctx, a));
  const d = allocReg(ctx);
  if (e.callee.kind === "Ident") {
    const v = lookupVar(ctx, e.callee.name);
    if (v) {
      let callee: number;
      if (v.isUpvalue) {
        callee = allocReg(ctx);
        const boxReg = allocReg(ctx);
        emit(ctx, { op: "GetUpvalue", upvalueIndex: v.upvalueIndex!, dest: boxReg });
        emit(ctx, { op: "Unbox", src: boxReg, dest: callee });
      } else if (v.boxed) {
        callee = allocReg(ctx);
        emit(ctx, { op: "Unbox", src: v.vreg, dest: callee });
      } else {
        callee = v.vreg;
      }
      emit(ctx, { op: "Call", fn: callee, args, dest: d });
      return d;
    }
    emit(ctx, { op: "CallBuiltin", name: e.callee.name, args, dest: d });
    return d;
  }
  const callee = lowerExpr(ctx, e.callee);
  emit(ctx, { op: "Call", fn: callee, args, dest: d });
  return d;
}

function lowerStructExpr(ctx: LowerCtx, e: Extract<Expr, { kind: "StructExpr" }>): number {
  const fields: Record<string, number> = {};
  if (e.spread) {
    // v1: spread not supported — emit a panic.
    const base = lowerExpr(ctx, e.spread);
    void base;
    const msg = allocReg(ctx);
    emit(ctx, { op: "Const", value: "struct spread not yet supported in VM v1", dest: msg });
    emit(ctx, { op: "Panic", msg });
  }
  for (const f of e.fields) {
    fields[f.name] = lowerExpr(ctx, f.value);
  }
  const d = allocReg(ctx);
  emit(ctx, { op: "AllocStruct", name: e.name, fields, dest: d });
  return d;
}

function lowerLambda(ctx: LowerCtx, e: Extract<Expr, { kind: "Lambda" }>): number {
  const fakeFn: FnDecl = {
    kind: "FnDecl",
    loc: e.loc,
    name: "<lambda>",
    generics: [],
    params: e.params,
    ret: e.ret,
    body: e.body.kind === "Block" ? (e.body as Block) : { kind: "Block", loc: e.loc, stmts: [], expr: e.body },
  };
  return lowerFnDecl(ctx, fakeFn, "<lambda>");
}

/** Walk a function body and find all names that are CAPTURED by any nested
 * function (transitively). A name is captured if a nested fn/lambda reads
 * or writes it AND it's a local of *this* function (not a local of the
 * nested fn itself).
 *
 * `locals` = names defined in the enclosing function (params + lets +
 * fn-names + for-loop vars + match bindings). `captured` is the output
 * set of names that get boxed because they're captured by a nested fn.
 *
 * We walk recursively: for each FnDecl/Lambda in the body, we compute its
 * free vars, intersect with `locals`, add to `captured`, and recurse into
 * the nested fn's body using the nested fn's own locals (params + body
 * locals). */
function precomputeCaptured(b: Block, locals: Set<string>, captured: Set<string>): void {
  // First, gather all locals declared in this block (so nested fn's
  // free vars don't get credited to us if they're actually our locals).
  const blockLocals = new Set(locals);
  collectLocalNames(b, blockLocals);
  // Now walk the block for nested functions.
  precomputeCapturedInBlock(b, blockLocals, captured);
}

function precomputeCapturedInBlock(b: Block, locals: Set<string>, captured: Set<string>): void {
  for (const s of b.stmts) precomputeCapturedStmt(s, locals, captured);
  if (b.expr) precomputeCapturedExpr(b.expr, locals, captured);
}

function precomputeCapturedStmt(s: Stmt, locals: Set<string>, captured: Set<string>): void {
  switch (s.kind) {
    case "Let": case "Const": case "MutLet":
      precomputeCapturedExpr(s.init, locals, captured);
      return;
    case "FnDecl": {
      // Compute free vars of this fn body, intersect with `locals`.
      const innerLocals = new Set<string>();
      for (const p of s.params) innerLocals.add(p.name);
      innerLocals.add(s.name);
      const fv = freeVarsOfFn(s.body, innerLocals);
      for (const name of fv) {
        if (locals.has(name)) captured.add(name);
      }
      // Recurse into the fn body with the fn's own locals.
      precomputeCaptured(s.body, innerLocals, captured);
      return;
    }
    case "ExprStmt": precomputeCapturedExpr(s.expr, locals, captured); return;
    case "AssignStmt":
      precomputeCapturedExpr(s.target, locals, captured);
      precomputeCapturedExpr(s.value, locals, captured);
      return;
    case "Return":
      if (s.expr) precomputeCapturedExpr(s.expr, locals, captured);
      return;
    case "While":
      precomputeCapturedExpr(s.cond, locals, captured);
      precomputeCapturedInBlock(s.body, locals, captured);
      return;
    case "ForIn": {
      // Loop var is a new local for the body.
      const childLocals = new Set(locals);
      childLocals.add(s.varName);
      precomputeCapturedExpr(s.iterable, locals, captured);
      precomputeCapturedInBlock(s.body, childLocals, captured);
      return;
    }
    case "Print": precomputeCapturedExpr(s.expr, locals, captured); return;
    case "BlockStmt":
      precomputeCapturedInBlock({ kind: "Block", loc: s.loc, stmts: s.body, expr: null }, locals, captured);
      return;
  }
}

function precomputeCapturedExpr(e: Expr, locals: Set<string>, captured: Set<string>): void {
  switch (e.kind) {
    case "Binary":
      precomputeCapturedExpr(e.left, locals, captured);
      precomputeCapturedExpr(e.right, locals, captured);
      return;
    case "Unary": precomputeCapturedExpr(e.operand, locals, captured); return;
    case "Assign":
      precomputeCapturedExpr(e.target, locals, captured);
      precomputeCapturedExpr(e.value, locals, captured);
      return;
    case "CompoundAssign":
      precomputeCapturedExpr(e.target, locals, captured);
      precomputeCapturedExpr(e.value, locals, captured);
      return;
    case "Call":
      precomputeCapturedExpr(e.callee, locals, captured);
      for (const a of e.args) precomputeCapturedExpr(a, locals, captured);
      return;
    case "Index":
      precomputeCapturedExpr(e.object, locals, captured);
      precomputeCapturedExpr(e.index, locals, captured);
      return;
    case "Field":
      precomputeCapturedExpr(e.object, locals, captured);
      return;
    case "MethodCall":
      precomputeCapturedExpr(e.object, locals, captured);
      for (const a of e.args) precomputeCapturedExpr(a, locals, captured);
      return;
    case "TupleExpr": case "ArrayExpr":
      for (const el of e.elements) precomputeCapturedExpr(el, locals, captured);
      return;
    case "MapExpr":
      for (const ent of e.entries) {
        precomputeCapturedExpr(ent.key, locals, captured);
        precomputeCapturedExpr(ent.value, locals, captured);
      }
      return;
    case "StructExpr":
      if (e.spread) precomputeCapturedExpr(e.spread, locals, captured);
      for (const f of e.fields) precomputeCapturedExpr(f.value, locals, captured);
      return;
    case "EnumVariant":
      for (const a of e.args) precomputeCapturedExpr(a, locals, captured);
      return;
    case "Lambda": {
      // Lambda's free vars that are in `locals` get captured.
      const innerLocals = new Set<string>();
      for (const p of e.params) innerLocals.add(p.name);
      const fv = freeVarsOfFn(
        e.body.kind === "Block" ? (e.body as Block) : { kind: "Block", loc: e.loc, stmts: [], expr: e.body },
        innerLocals,
      );
      for (const name of fv) {
        if (locals.has(name)) captured.add(name);
      }
      // Recurse.
      precomputeCaptured(
        e.body.kind === "Block" ? (e.body as Block) : { kind: "Block", loc: e.loc, stmts: [], expr: e.body },
        innerLocals,
        captured,
      );
      return;
    }
    case "If":
      precomputeCapturedExpr(e.cond, locals, captured);
      precomputeCapturedExpr(e.then, locals, captured);
      if (e.else) precomputeCapturedExpr(e.else, locals, captured);
      return;
    case "Match":
      precomputeCapturedExpr(e.scrutinee, locals, captured);
      for (const arm of e.arms) {
        precomputeCapturedExpr(arm.body, locals, captured);
      }
      return;
    case "Block": precomputeCapturedInBlock(e, locals, captured); return;
    case "Paren": precomputeCapturedExpr(e.expr, locals, captured); return;
    case "Cast": case "As": precomputeCapturedExpr(e.expr, locals, captured); return;
    case "Range":
      precomputeCapturedExpr(e.start, locals, captured);
      precomputeCapturedExpr(e.end, locals, captured);
      return;
    case "ErrorProp": precomputeCapturedExpr(e.expr, locals, captured); return;
    case "TupleField": precomputeCapturedExpr(e.object, locals, captured); return;
    case "Return": if (e.expr) precomputeCapturedExpr(e.expr, locals, captured); return;
    case "Spread": precomputeCapturedExpr(e.expr, locals, captured); return;
    default: return;
  }
}

function lowerFnDecl(ctx: LowerCtx, fn: FnDecl, displayName?: string): number {
  // Compute captures: free variables in the fn body that are visible in
  // the enclosing scope.
  const paramNames = new Set<string>();
  for (const p of fn.params) paramNames.add(p.name);
  paramNames.add(fn.name); // self-reference
  const freeVars = freeVarsOfFn(fn.body, paramNames);
  const visibleNames = new Set<string>();
  for (const scope of ctx.scopes) for (const name of scope.keys()) visibleNames.add(name);
  const captures: string[] = [];
  for (const name of freeVars) {
    if (visibleNames.has(name)) captures.push(name);
  }
  // Mark captured names in the enclosing context so they get boxed.
  markCaptured(ctx, captures);

  // Save enclosing context.
  const savedCurrent = ctx.current;
  const savedCurrentBlock = ctx.currentBlock;
  const savedScopes = ctx.scopes;
  const savedCaptured = ctx.capturedNames;

  // Create the new function.
  const newFunc: IrFunc = {
    name: fn.name,
    params: [],
    blocks: [],
    entry: 0,
    nlocals: 0,
    captures,
    isMain: false,
    nested: [],
    displayName,
    selfReg: -1,
  };
  const newFuncIndex = ctx.funcs.length;
  ctx.funcs.push(newFunc);
  if (savedCurrent) savedCurrent.nested.push(newFuncIndex);

  ctx.current = newFunc;
  ctx.capturedNames = new Set();
  ctx.scopes = [];
  pushScope(ctx);

  // Parameters get vregs.
  const paramRegs: number[] = [];
  for (const p of fn.params) {
    const r = allocReg(ctx);
    ctx.scopes[0].set(p.name, { vreg: r, boxed: false });
    paramRegs.push(r);
  }
  newFunc.params = paramRegs;

  // Upvalue bindings: each captured name is an upvalue at index `i` in
  // the captures list. The function body accesses these via GetUpvalue/
  // SetUpvalue ops. We register them in the scope so lookupVar finds
  // them when the body references the captured name.
  for (let i = 0; i < captures.length; i++) {
    const name = captures[i];
    ctx.scopes[0].set(name, { vreg: -1, boxed: false, isUpvalue: true, upvalueIndex: i });
  }

  // Self-reference slot: the function's own name is bound to its closure.
  const selfReg = allocReg(ctx);
  newFunc.selfReg = selfReg;
  ctx.scopes[0].set(fn.name, { vreg: selfReg, boxed: false });

  // PRE-PASS: compute all names captured by any *nested* function inside
  // this function's body (transitively), so that when we lower a `let
  // mut x = ...` declaration, we know whether `x` will be captured and
  // needs to be boxed. This must happen BEFORE lowering the body so the
  // box allocation is correctly emitted at declaration time.
  const allCaptured = new Set<string>();
  const fnLocalNames = new Set<string>();
  for (const p of fn.params) fnLocalNames.add(p.name);
  fnLocalNames.add(fn.name);
  precomputeCaptured(fn.body, fnLocalNames, allCaptured);
  ctx.capturedNames = allCaptured;

  // Entry block.
  const entryBlock = newBlock(ctx);
  newFunc.entry = entryBlock.id;
  ctx.currentBlock = entryBlock;

  // Lower the body.
  let lastVal: number;
  for (const s of fn.body.stmts) lastVal = lowerStmt(ctx, s);
  if (fn.body.expr) lastVal = lowerExpr(ctx, fn.body.expr);
  else {
    lastVal = allocReg(ctx);
    emit(ctx, { op: "Const", value: null, dest: lastVal });
  }
  // Emit Return if the last block isn't already terminated.
  const cb = ctx.currentBlock;
  if (cb && cb.instrs.length === 0) {
    // The last op was a terminator that sealed the block. The "lastVal"
    // produced in that case is a placeholder. Emit a Return on this empty
    // block carrying the placeholder value.
    emit(ctx, { op: "Const", value: null, dest: allocReg(ctx) });
    emit(ctx, { op: "Return", val: lastVal });
  } else if (cb && cb.instrs.length > 0) {
    const lastInstr = cb.instrs[cb.instrs.length - 1];
    if (lastInstr.op !== "Br" && lastInstr.op !== "Return") {
      emit(ctx, { op: "Return", val: lastVal });
    }
  }

  popScope(ctx);

  // Restore enclosing context.
  ctx.current = savedCurrent;
  ctx.currentBlock = savedCurrentBlock;
  ctx.scopes = savedScopes;
  ctx.capturedNames = savedCaptured;

  // Emit MakeClosure in the enclosing block.
  // For each capture name, find its binding in the enclosing scope:
  //   - If it's an upvalue (captured from a further-outer scope), emit a
  //     GetUpvalue to fetch its Box into a temp register; pass that temp
  //     register as the capture.
  //   - If it's a boxed local, the vreg already holds a Box; pass vreg.
  //   - If it's a plain local, the vreg holds a value; pass vreg (the VM
  //     wraps it in a Box at MakeClosure time).
  const captureRegs: number[] = captures.map((name) => {
    const v = (() => {
      for (let i = (savedScopes ?? []).length - 1; i >= 0; i--) {
        const sv = savedScopes![i].get(name);
        if (sv) return sv;
      }
      return null;
    })();
    if (!v) return allocReg(ctx);
    if (v.isUpvalue) {
      const boxReg = allocReg(ctx);
      emit(ctx, { op: "GetUpvalue", upvalueIndex: v.upvalueIndex!, dest: boxReg });
      return boxReg;
    }
    return v.vreg;
  });
  const d = allocReg(ctx);
  emit(ctx, { op: "MakeClosure", funcIndex: newFuncIndex, captures: captureRegs, dest: d });
  return d;
}

function lowerIf(ctx: LowerCtx, e: Extract<Expr, { kind: "If" }>): number {
  const cond = lowerExpr(ctx, e.cond);
  const resultReg = allocReg(ctx);
  const thenBlock = newBlock(ctx);
  const elseBlock = newBlock(ctx);
  const mergeBlock = newBlock(ctx);
  // Branch on cond.
  terminate(ctx, { op: "Br", cond, then: thenBlock.id, else: e.else ? elseBlock.id : mergeBlock.id });

  // thenBlock
  ctx.currentBlock = thenBlock;
  pushScope(ctx);
  const thenVal = lowerExpr(ctx, e.then);
  popScope(ctx);
  emit(ctx, { op: "Move", src: thenVal, dest: resultReg });
  terminate(ctx, { op: "Br", cond: null, then: mergeBlock.id, else: mergeBlock.id });

  // elseBlock
  if (e.else) {
    ctx.currentBlock = elseBlock;
    pushScope(ctx);
    const elseVal = lowerExpr(ctx, e.else);
    popScope(ctx);
    emit(ctx, { op: "Move", src: elseVal, dest: resultReg });
    terminate(ctx, { op: "Br", cond: null, then: mergeBlock.id, else: mergeBlock.id });
  }

  // mergeBlock — continue emitting here.
  ctx.currentBlock = mergeBlock;
  return resultReg;
}

function lowerMatch(ctx: LowerCtx, e: Extract<Expr, { kind: "Match" }>): number {
  const scrutinee = lowerExpr(ctx, e.scrutinee);
  const resultReg = allocReg(ctx);
  const armBlocks: IrBlock[] = e.arms.map(() => newBlock(ctx));
  const elseBlock = newBlock(ctx);
  const mergeBlock = newBlock(ctx);

  // Compute bindings for each arm before emitting the Match op. We push a
  // fresh scope per arm, declare pattern bindings in it, record them, then
  // pop the scope. We re-push the scope when lowering the arm body.
  const armBindings: { name: string; reg: number }[][] = e.arms.map((arm) => {
    pushScope(ctx);
    const bindings: { name: string; reg: number }[] = [];
    collectPatternBindings(ctx, arm.pattern, bindings);
    popScope(ctx);
    return bindings;
  });

  // Emit the Match op on the current block; the block is then sealed.
  terminate(ctx, {
    op: "Match",
    scrutinee,
    cases: e.arms.map((arm, i) => ({ pattern: arm.pattern, block: armBlocks[i].id, bindings: armBindings[i] })),
    elseBlock: elseBlock.id,
  });

  // Lower each arm body. The arm block's first instructions are the
  // pattern bindings (the VM writes them before jumping). We populate
  // the scope map with the bindings already allocated by
  // collectPatternBindings so the arm body's references resolve to
  // those same vregs.
  for (let i = 0; i < e.arms.length; i++) {
    const arm = e.arms[i];
    ctx.currentBlock = armBlocks[i];
    pushScope(ctx);
    for (const b of armBindings[i]) {
      ctx.scopes[ctx.scopes.length - 1].set(b.name, { vreg: b.reg, boxed: false });
    }
    const bodyVal = lowerExpr(ctx, arm.body);
    popScope(ctx);
    emit(ctx, { op: "Move", src: bodyVal, dest: resultReg });
    terminate(ctx, { op: "Br", cond: null, then: mergeBlock.id, else: mergeBlock.id });
  }

  // elseBlock: panic (no match).
  ctx.currentBlock = elseBlock;
  const msg = allocReg(ctx);
  emit(ctx, { op: "Const", value: "no match arm matched", dest: msg });
  emit(ctx, { op: "Panic", msg });
  terminate(ctx, { op: "Br", cond: null, then: mergeBlock.id, else: mergeBlock.id });

  // Continue on mergeBlock.
  ctx.currentBlock = mergeBlock;
  return resultReg;
}

/** Walk a pattern and for each BindPat, allocate a vreg and add an entry to
 * `bindings`. Doesn't push a scope — caller must. Mirrors
 * `declarePatternBindings` but also records the binding registers. */
function collectPatternBindings(ctx: LowerCtx, p: Pattern, bindings: { name: string; reg: number }[]): void {
  switch (p.kind) {
    case "WildcardPat": return;
    case "BindPat": {
      const r = declareVar(ctx, p.name, false);
      bindings.push({ name: p.name, reg: r });
      return;
    }
    case "LitPat": return;
    case "TuplePat": for (const sub of p.elements) collectPatternBindings(ctx, sub, bindings); return;
    case "ArrayPat": for (const sub of p.elements) collectPatternBindings(ctx, sub, bindings); return;
    case "StructPat": for (const f of p.fields) collectPatternBindings(ctx, f.pattern, bindings); return;
    case "EnumPat": for (const sub of p.subpatterns) collectPatternBindings(ctx, sub, bindings); return;
    case "OrPat": if (p.patterns.length > 0) collectPatternBindings(ctx, p.patterns[0], bindings); return;
    case "RestPat": return;
  }
}

function declarePatternBindings(ctx: LowerCtx, p: Pattern): void {
  switch (p.kind) {
    case "WildcardPat": return;
    case "BindPat": declareVar(ctx, p.name, false); return;
    case "LitPat": return;
    case "TuplePat": for (const sub of p.elements) declarePatternBindings(ctx, sub); return;
    case "ArrayPat": for (const sub of p.elements) declarePatternBindings(ctx, sub); return;
    case "StructPat": for (const f of p.fields) declarePatternBindings(ctx, f.pattern); return;
    case "EnumPat": for (const sub of p.subpatterns) declarePatternBindings(ctx, sub); return;
    case "OrPat": if (p.patterns.length > 0) declarePatternBindings(ctx, p.patterns[0]); return;
    case "RestPat": return;
  }
}

function lowerCast(ctx: LowerCtx, e: Extract<Expr, { kind: "As" | "Cast" }>): number {
  const src = lowerExpr(ctx, e.expr);
  const d = allocReg(ctx);
  const ty = e.type;
  if (ty.kind === "PrimitiveType") {
    switch (ty.name) {
      case "int": emit(ctx, { op: "Cast", kind: "Int", src, dest: d }); return d;
      case "float": emit(ctx, { op: "Cast", kind: "Float", src, dest: d }); return d;
      case "bool": emit(ctx, { op: "Cast", kind: "Bool", src, dest: d }); return d;
      case "string": case "char":
        emit(ctx, { op: "Cast", kind: "String", src, dest: d }); return d;
    }
  }
  if (ty.kind === "UnitType") {
    emit(ctx, { op: "Const", value: null, dest: d });
    return d;
  }
  emit(ctx, { op: "Move", src, dest: d });
  return d;
}

function lowerErrorProp(ctx: LowerCtx, e: Extract<Expr, { kind: "ErrorProp" }>): number {
  // `expr?` — unwrap Ok/Some or return Err/None from the current function.
  // We emit:
  //   v = lowerExpr(expr)
  //   d = allocReg
  //   Br: if v is Ok/Some → d = v.data[0]; else → Return v
  // Then continue on a new block with d available.
  const v = lowerExpr(ctx, e.expr);
  const d = allocReg(ctx);
  const okBlock = newBlock(ctx);
  const errBlock = newBlock(ctx);
  // We use a Match op with synthetic patterns.
  terminate(ctx, {
    op: "Match",
    scrutinee: v,
    cases: [
      { pattern: makeEnumPat("Result", "Ok", "__aether_prop"), block: okBlock.id },
      { pattern: makeEnumPat("Option", "Some", "__aether_prop"), block: okBlock.id },
    ],
    elseBlock: errBlock.id,
  });
  // okBlock: store the bound value into d.
  ctx.currentBlock = okBlock;
  pushScope(ctx);
  const bound = declareVar(ctx, "__aether_prop", false);
  popScope(ctx);
  emit(ctx, { op: "Move", src: bound, dest: d });
  const cont = newBlock(ctx);
  terminate(ctx, { op: "Br", cond: null, then: cont.id, else: cont.id });
  // errBlock: return v.
  ctx.currentBlock = errBlock;
  terminate(ctx, { op: "Return", val: v });
  // Continue on cont.
  ctx.currentBlock = cont;
  return d;
}

function makeEnumPat(enumName: string, variant: string, bindName: string): Pattern {
  return {
    kind: "EnumPat",
    loc: { file: "<synthetic>", start: { line: 1, col: 1, offset: 0 }, end: { line: 1, col: 1, offset: 0 } },
    enumName,
    variant,
    subpatterns: [{
      kind: "BindPat",
      loc: { file: "<synthetic>", start: { line: 1, col: 1, offset: 0 }, end: { line: 1, col: 1, offset: 0 } },
      name: bindName,
    }],
  };
}

//----------------------------------------------------------------------------
// Lowering: statements
//----------------------------------------------------------------------------

function lowerStmt(ctx: LowerCtx, s: Stmt): number {
  switch (s.kind) {
    case "Let": case "Const": case "MutLet": {
      const init = lowerExpr(ctx, s.init);
      const isCaptured = ctx.capturedNames.has(s.name);
      const slot = declareVar(ctx, s.name, isCaptured);
      if (isCaptured) {
        const boxReg = allocReg(ctx);
        emit(ctx, { op: "MakeBox", src: init, dest: boxReg });
        emit(ctx, { op: "Move", src: boxReg, dest: slot });
      } else {
        emit(ctx, { op: "Move", src: init, dest: slot });
      }
      const u = allocReg(ctx);
      emit(ctx, { op: "Const", value: null, dest: u });
      return u;
    }
    case "FnDecl": {
      const d = lowerFnDecl(ctx, s, s.name);
      const slot = declareVar(ctx, s.name, false);
      emit(ctx, { op: "Move", src: d, dest: slot });
      const u = allocReg(ctx);
      emit(ctx, { op: "Const", value: null, dest: u });
      return u;
    }
    case "EnumDecl": case "StructDecl": case "TypeAlias": case "Import": {
      const u = allocReg(ctx);
      emit(ctx, { op: "Const", value: null, dest: u });
      return u;
    }
    case "Return": {
      const v = s.expr ? lowerExpr(ctx, s.expr) : (() => {
        const d = allocReg(ctx);
        emit(ctx, { op: "Const", value: null, dest: d });
        return d;
      })();
      terminate(ctx, { op: "Return", val: v });
      const u = allocReg(ctx);
      emit(ctx, { op: "Const", value: null, dest: u });
      return u;
    }
    case "Break": {
      terminate(ctx, { op: "Br", cond: null, then: -1, else: -1 });
      const u = allocReg(ctx);
      emit(ctx, { op: "Const", value: null, dest: u });
      return u;
    }
    case "Continue": {
      terminate(ctx, { op: "Br", cond: null, then: -2, else: -2 });
      const u = allocReg(ctx);
      emit(ctx, { op: "Const", value: null, dest: u });
      return u;
    }
    case "While": return lowerWhile(ctx, s);
    case "ForIn": return lowerForIn(ctx, s);
    case "Print": {
      const v = lowerExpr(ctx, s.expr);
      emit(ctx, { op: "Print", src: v });
      const u = allocReg(ctx);
      emit(ctx, { op: "Const", value: null, dest: u });
      return u;
    }
    case "ExprStmt": return lowerExpr(ctx, s.expr);
    case "AssignStmt": {
      const v = lowerExpr(ctx, s.value);
      lowerAssignTo(ctx, s.target, v);
      return v;
    }
    case "BlockStmt": {
      pushScope(ctx);
      let last: number;
      try {
        for (const sub of s.body) last = lowerStmt(ctx, sub);
      } finally {
        popScope(ctx);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return last!;
    }
  }
  const u = allocReg(ctx);
  emit(ctx, { op: "Const", value: null, dest: u });
  return u;
}

function lowerWhile(ctx: LowerCtx, s: Extract<Stmt, { kind: "While" }>): number {
  const condBlock = newBlock(ctx);
  const bodyBlock = newBlock(ctx);
  const breakBlock = newBlock(ctx);
  // Jump from current block to condBlock.
  terminate(ctx, { op: "Br", cond: null, then: condBlock.id, else: condBlock.id });
  // condBlock: eval cond, branch to body or break.
  ctx.currentBlock = condBlock;
  const condReg = lowerExpr(ctx, s.cond);
  terminate(ctx, { op: "Br", cond: condReg, then: bodyBlock.id, else: breakBlock.id });
  // bodyBlock: lower body. Continue markers → condBlock; Break markers → breakBlock.
  ctx.currentBlock = bodyBlock;
  pushScope(ctx);
  lowerBlockBody(ctx, s.body);
  popScope(ctx);
  // Patch continue markers in all blocks reachable from bodyBlock down to
  // the bodyBlock's terminator. For v1, we just walk the body block.
  patchMarker(ctx, -2, condBlock.id); // continue -> condBlock
  // After body, jump to condBlock (loop back). But only if the body didn't
  // already emit a terminator (Br/Return).
  if (ctx.currentBlock && ctx.currentBlock.instrs.length === 0) {
    // The body ended with a terminator. The current block is fresh.
    // We need to emit a jump back to condBlock.
    terminate(ctx, { op: "Br", cond: null, then: condBlock.id, else: condBlock.id });
  } else {
    const last = ctx.currentBlock!.instrs[ctx.currentBlock!.instrs.length - 1];
    if (!last || (last.op !== "Br" && last.op !== "Return")) {
      terminate(ctx, { op: "Br", cond: null, then: condBlock.id, else: condBlock.id });
    } else if (last.op === "Br" && last.then === -1 && last.else === -1) {
      // Body ended with break — leave the marker; will be patched to breakBlock.
    } else if (last.op === "Br" && last.then === -2 && last.else === -2) {
      // Body ended with continue — already patched to condBlock.
    }
  }
  // Patch break markers in the body to breakBlock.
  patchMarker(ctx, -1, breakBlock.id);
  // Continue emitting on breakBlock.
  ctx.currentBlock = breakBlock;
  const resultReg = allocReg(ctx);
  emit(ctx, { op: "Const", value: null, dest: resultReg });
  return resultReg;
}

/** Walk all blocks in the current function and replace Br markers with
 * `marker` (e.g., -1 for break, -2 for continue) with the given target. */
function patchMarker(ctx: LowerCtx, marker: number, target: number): void {
  if (!ctx.current) return;
  for (const b of ctx.current.blocks) {
    for (const instr of b.instrs) {
      if (instr.op === "Br" && instr.then === marker && instr.else === marker) {
        instr.then = target;
        instr.else = target;
      }
    }
  }
}

function lowerBlockBody(ctx: LowerCtx, b: Block): number {
  let last: number = (() => {
    const d = allocReg(ctx);
    emit(ctx, { op: "Const", value: null, dest: d });
    return d;
  })();
  for (const s of b.stmts) last = lowerStmt(ctx, s);
  if (b.expr) last = lowerExpr(ctx, b.expr);
  return last;
}

function lowerForIn(ctx: LowerCtx, s: Extract<Stmt, { kind: "ForIn" }>): number {
  const iterReg = lowerExpr(ctx, s.iterable);
  const itemsReg = allocReg(ctx);
  emit(ctx, { op: "CallBuiltin", name: "iter_to_items", args: [iterReg], dest: itemsReg });
  const iReg = allocReg(ctx);
  emit(ctx, { op: "Const", value: 0, dest: iReg });
  const condBlock = newBlock(ctx);
  const bodyBlock = newBlock(ctx);
  const breakBlock = newBlock(ctx);
  terminate(ctx, { op: "Br", cond: null, then: condBlock.id, else: condBlock.id });
  // condBlock
  ctx.currentBlock = condBlock;
  const lenReg = allocReg(ctx);
  emit(ctx, { op: "Len", src: itemsReg, dest: lenReg });
  const cmpReg = allocReg(ctx);
  emit(ctx, { op: "Bin", kind: "Lt", lhs: iReg, rhs: lenReg, dest: cmpReg });
  terminate(ctx, { op: "Br", cond: cmpReg, then: bodyBlock.id, else: breakBlock.id });
  // bodyBlock
  ctx.currentBlock = bodyBlock;
  pushScope(ctx);
  const itemReg = declareVar(ctx, s.varName, false);
  emit(ctx, { op: "IndexGet", obj: itemsReg, idx: iReg, dest: itemReg });
  lowerBlockBody(ctx, s.body);
  popScope(ctx);
  // i += 1
  const oneReg = allocReg(ctx);
  emit(ctx, { op: "Const", value: 1, dest: oneReg });
  const newI = allocReg(ctx);
  emit(ctx, { op: "Bin", kind: "Add", lhs: iReg, rhs: oneReg, dest: newI });
  emit(ctx, { op: "Move", src: newI, dest: iReg });
  // Patch continue markers to condBlock.
  patchMarker(ctx, -2, condBlock.id);
  // Fall through to condBlock, unless the body ended in a terminator.
  if (ctx.currentBlock && ctx.currentBlock.instrs.length === 0) {
    terminate(ctx, { op: "Br", cond: null, then: condBlock.id, else: condBlock.id });
  } else {
    const last = ctx.currentBlock!.instrs[ctx.currentBlock!.instrs.length - 1];
    if (!last || (last.op !== "Br" && last.op !== "Return")) {
      terminate(ctx, { op: "Br", cond: null, then: condBlock.id, else: condBlock.id });
    }
  }
  // Patch break markers to breakBlock.
  patchMarker(ctx, -1, breakBlock.id);
  ctx.currentBlock = breakBlock;
  const resultReg = allocReg(ctx);
  emit(ctx, { op: "Const", value: null, dest: resultReg });
  return resultReg;
}

//----------------------------------------------------------------------------
// Top-level: lower a Program to IrProgram
//----------------------------------------------------------------------------

export function lowerToIr(program: Program): IrProgram {
  const ctx = newCtx();

  const mainFunc: IrFunc = {
    name: "<main>",
    params: [],
    blocks: [],
    entry: 0,
    nlocals: 0,
    captures: [],
    isMain: true,
    nested: [],
    selfReg: -1,
  };
  ctx.funcs.push(mainFunc);
  ctx.current = mainFunc;
  pushScope(ctx);

  // Pre-pass: collect names captured by any nested fn in the program.
  // This ensures that top-level `let mut x` declarations are boxed if
  // a nested fn captures them.
  const mainLocals = new Set<string>();
  const mainCaptured = new Set<string>();
  precomputeCaptured({ kind: "Block", loc: program.loc, stmts: program.body, expr: null }, mainLocals, mainCaptured);
  ctx.capturedNames = mainCaptured;

  const entryBlock = newBlock(ctx);
  mainFunc.entry = entryBlock.id;
  ctx.currentBlock = entryBlock;

  let lastVal: number = (() => {
    const d = allocReg(ctx);
    emit(ctx, { op: "Const", value: null, dest: d });
    return d;
  })();
  for (const s of program.body) {
    lastVal = lowerStmt(ctx, s);
  }
  const cb = ctx.currentBlock;
  if (cb && cb.instrs.length === 0) {
    emit(ctx, { op: "Const", value: null, dest: allocReg(ctx) });
    emit(ctx, { op: "Return", val: lastVal });
  } else if (cb && cb.instrs.length > 0) {
    const last = cb.instrs[cb.instrs.length - 1];
    if (last.op !== "Br" && last.op !== "Return") {
      emit(ctx, { op: "Return", val: lastVal });
    }
  }

  popScope(ctx);
  ctx.current = null;
  ctx.currentBlock = null;

  // Cleanup pass: remove empty blocks (created by `freshBlock` after a
  // terminator that wasn't used). These would otherwise confuse the
  // codegen's offset computation. We remove any block with no instrs that
  // is NOT the entry block.
  for (const fn of ctx.funcs) {
    fn.blocks = fn.blocks.filter((b) => b.instrs.length > 0 || b.id === fn.entry);
  }

  return { funcs: ctx.funcs, globals: new Map() };
}

//----------------------------------------------------------------------------
// Well-formedness check
//----------------------------------------------------------------------------

export interface IrWellFormedIssue {
  func: string;
  block: number;
  message: string;
}

export function checkIrWellFormed(prog: IrProgram): IrWellFormedIssue[] {
  const issues: IrWellFormedIssue[] = [];
  const isTerminator = (op: IrOp): boolean => op.op === "Br" || op.op === "Return" || op.op === "Match";
  for (const fn of prog.funcs) {
    const blockIds = new Set(fn.blocks.map((b) => b.id));
    for (const b of fn.blocks) {
      if (b.instrs.length === 0) {
        issues.push({ func: fn.name, block: b.id, message: "empty block (no terminator)" });
        continue;
      }
      const last = b.instrs[b.instrs.length - 1];
      if (!isTerminator(last)) {
        issues.push({ func: fn.name, block: b.id, message: `block doesn't end in Br/Return/Match (ends in ${last.op})` });
      }
      if (last.op === "Br") {
        if (last.then !== -1 && last.then !== -2 && !blockIds.has(last.then)) {
          issues.push({ func: fn.name, block: b.id, message: `Br target ${last.then} doesn't exist` });
        }
        if (last.else !== null && last.else !== -1 && last.else !== -2 && !blockIds.has(last.else)) {
          issues.push({ func: fn.name, block: b.id, message: `Br.else target ${last.else} doesn't exist` });
        }
      }
      for (const instr of b.instrs) checkVreg(fn, instr, issues);
    }
  }
  return issues;
}

function checkVreg(fn: IrFunc, op: IrOp, issues: IrWellFormedIssue[]): void {
  const check = (r: number, role: string): void => {
    if (r < 0 || r >= fn.nlocals) {
      issues.push({ func: fn.name, block: -1, message: `${op.op}: ${role} vreg ${r} out of range (nlocals=${fn.nlocals})` });
    }
  };
  switch (op.op) {
    case "Const": check(op.dest, "dest"); break;
    case "Move": check(op.src, "src"); check(op.dest, "dest"); break;
    case "Bin": check(op.lhs, "lhs"); check(op.rhs, "rhs"); check(op.dest, "dest"); break;
    case "Un": check(op.src, "src"); check(op.dest, "dest"); break;
    case "Call": check(op.fn, "fn"); op.args.forEach((a, i) => check(a, `args[${i}]`)); check(op.dest, "dest"); break;
    case "CallBuiltin": op.args.forEach((a, i) => check(a, `args[${i}]`)); check(op.dest, "dest"); break;
    case "Return": check(op.val, "val"); break;
    case "LoadField": check(op.obj, "obj"); check(op.dest, "dest"); break;
    case "StoreField": check(op.obj, "obj"); check(op.val, "val"); break;
    case "AllocArray": op.elems.forEach((e, i) => check(e, `elems[${i}]`)); check(op.dest, "dest"); break;
    case "AllocMap": op.entries.forEach((e, i) => { check(e.key, `entries[${i}].key`); check(e.val, `entries[${i}].val`); }); check(op.dest, "dest"); break;
    case "IndexGet": check(op.obj, "obj"); check(op.idx, "idx"); check(op.dest, "dest"); break;
    case "IndexSet": check(op.obj, "obj"); check(op.idx, "idx"); check(op.val, "val"); break;
    case "Len": check(op.src, "src"); check(op.dest, "dest"); break;
    case "MakeBox": check(op.src, "src"); check(op.dest, "dest"); break;
    case "Unbox": check(op.src, "src"); check(op.dest, "dest"); break;
    case "SetBox": check(op.box, "box"); check(op.val, "val"); break;
    case "Panic": check(op.msg, "msg"); break;
    case "Print": check(op.src, "src"); break;
    case "Cast": check(op.src, "src"); check(op.dest, "dest"); break;
  }
}
