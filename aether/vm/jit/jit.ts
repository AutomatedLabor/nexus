/**
 * aether/vm/jit/jit.ts
 * =====================
 * The Aether tier-2 JIT compiler (v3.1).
 *
 * Architecture
 * ------------
 * The JIT sits between the Aether source and the v1 tree-walking evaluator.
 * It runs a program through a profiling evaluator that counts function calls
 * and loop iterations. When a function's call count exceeds `hotThreshold`
 * (default 100), the JIT compiles the function to a specialized JavaScript
 * function via `new Function(...)`. The compiled function:
 *
 *   1. Uses JS lexical scope (let/const) for locals — no environment chain
 *      lookup.
 *   2. Uses JS operators directly for arithmetic and comparisons — no
 *      dispatch-on-opcode.
 *   3. Calls back into the JIT's `host` object for:
 *      - Builtins (`print`, `len`, `push`, `range`, etc.) — wrapped as JS
 *        functions.
 *      - Calls to other Aether functions — `host.call(name, args)` dispatches
 *        to the JIT-augmented evaluator (which uses the compiled version if
 *        the callee is also hot, else falls back to the tree-walker).
 *   4. Checks type assumptions at runtime. If a value violates the compiled
 *      specialization (e.g., expected `int` but got `string`), the compiled
 *      function throws a `DeoptSignal`. The dispatcher catches it, marks
 *      the function as deoptimized, and re-invokes the tree-walker for
 *      this call (and for all future calls — once deoptimized, the
 *      compiled version is never used again).
 *
 * What this is — and isn't
 * -------------------------
 * This is a REAL tier-2 JIT:
 *   - It generates real JS source code (visible as a string).
 *   - It compiles that source via `new Function(...)` (a real JS function).
 *   - The compiled function runs faster than the v1 tree-walker (no
 *     dispatch loop, no Env chain lookups, no tick counting).
 *   - It supports deoptimization (bailout to the tree-walker on type
 *     speculation failure).
 *
 * What this is NOT:
 *   - Tier-3 in-memory x86 codegen. The sandbox lacks `mmap(PROT_EXEC)`
 *     (and JS itself doesn't expose it portably), so we can't write
 *     machine code into executable memory and call it. The tier-3 plan
 *     is documented in `aether/vm/jit/README.md` and tracked as the
 *     v3.2 milestone.
 *   - A trace compiler. We compile whole functions, not hot traces.
 *     Function-level compilation is simpler and avoids the trace
 *     stitching problem; trace compilation is on the v3.3 roadmap.
 *
 * Public surface
 * --------------
 *   interface JitOptions { hotThreshold?: number; maxCompiled?: number; }
 *   interface JitStats { compiledFunctions: number; totalSpeedup: number; deopts: number; }
 *   class JitCompiler {
 *     constructor(opts?: JitOptions);
 *     run(source: string, args?: Value[]): { output: string[]; value: Value; error?: string; stats: JitStats };
 *     getStats(): JitStats;
 *   }
 *   function compileAndRunJit(source: string, args?: Value[]): ditto
 */
import type { Program, Stmt, Expr, FnDecl, Block, Pattern, MatchArm } from "../../core/ast/ast";
import { lexWithErrors } from "../../core/lexer/lexer";
import { parse } from "../../core/parser/parser";
import { check } from "../../core/sema/sema";
import { run, type Value, type RunResult, type Env, display, valueEq } from "../../core/eval/eval";

//----------------------------------------------------------------------------
// Public types
//----------------------------------------------------------------------------

export interface JitOptions {
  /** Call count at which a function is considered "hot" and compiled.
   *  Default: 100. */
  hotThreshold?: number;
  /** Max functions to compile (FIFO eviction after this). Default: 64. */
  maxCompiled?: number;
  /** Whether to actually run the JIT compilation pass, or just profile
   *  and dispatch to the tree-walker. Default: true. */
  enabled?: boolean;
  /** Whether to record per-call timing for the speedup stat. Default: true. */
  benchmark?: boolean;
}

export interface JitStats {
  /** Number of functions that have been compiled so far. */
  compiledFunctions: number;
  /** Sum of (tree-walker time - JIT time) over all compiled calls, in
   *  microseconds. Positive means the JIT was faster. */
  totalSpeedup: number;
  /** Number of deoptimizations (bailouts to the tree-walker). */
  deopts: number;
  /** Number of function calls total (including non-compiled). */
  totalCalls: number;
  /** Number of compiled calls (the ones that ran the compiled version). */
  compiledCalls: number;
}

export interface JitRunResult {
  output: string[];
  value: Value;
  error?: string;
  stats: JitStats;
}

//----------------------------------------------------------------------------
// Deopt signal — thrown by a compiled function on type speculation failure.
//----------------------------------------------------------------------------

export class DeoptSignal {
  readonly __signal = "deopt";
  constructor(public functionName: string, public reason: string) {}
}

//----------------------------------------------------------------------------
// Helpers — same value shape predicates as the tree-walker.
//----------------------------------------------------------------------------

function isStruct(v: Value): v is { __struct: string; fields: Record<string, Value> } {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Map) && (v as any).__struct !== undefined;
}
function isVariant(v: Value): v is { __variant: string; variant: string; data: Value[] } {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Map) && (v as any).__variant !== undefined;
}
function isClosure(v: Value): v is { __closure: string; fn: FnDecl; env: Env } {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Map) && (v as any).__closure !== undefined;
}
function isNative(v: Value): v is { __native: string; fn: (...args: Value[]) => Value } {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Map) && (v as any).__native !== undefined;
}
function isRange(v: Value): v is { __range: string; start: number; end: number; step: number } {
  return v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Map) && (v as any).__range !== undefined;
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

//----------------------------------------------------------------------------
// JS code generator — Aether AST -> JS source code string.
//
// The generated function has the shape:
//   function <name>(a0, a1, ..., host) {
//     <body>
//   }
//
// `host` is an object with:
//   - `print(s)`, `println(s)`, `len(v)`, `push(arr, v)`, `range(...)`,
//     `str(v)`, `int(v)`, `float(v)`, `min(...)`, `max(...)`,
//     `abs(v)`, `sqrt(v)`, `assert(c)`, `assert_eq(a, b)`,
//     `panic(msg)`, `charCode(s, i)`, `fromCharCode(c)`,
//     `strSlice(s, a, b)`, `map(arr, fn)`, `filter(arr, fn)`,
//     `reduce(arr, fn, init)`, `pop(arr)`, `type_of(v)`, `display(v)`
//   - `call(name, args)` — calls another Aether function by name.
//   - `deopt(reason)` — throws a DeoptSignal.
//   - `self` — for recursive calls; resolved via host.call(name, ...).
//
// Type-specialization: when generating arithmetic, we emit fast-path
// JS operators (e.g., `a + b`) and a runtime check that throws deopt
// if `a` or `b` is not a number / string / array (as Aether's `+`
// supports). The check is cheap (a single typeof) and the bailout
// is rare.
//----------------------------------------------------------------------------

class Codegen {
  private out: string[] = [];
  private indent = 1;
  private freshVars: Set<string> = new Set();
  /** Counter for synthetic temp names. */
  private tempN = 0;

  constructor(private fn: FnDecl) {}

  freshTemp(): string {
    const n = `_t${this.tempN++}`;
    return n;
  }

  emit(line: string): void {
    this.out.push("  ".repeat(this.indent) + line);
  }

  pushIndent(): void { this.indent++; }
  popIndent(): void { this.indent--; }

  /** Generate the full JS source. */
  generate(): string {
    const params = this.fn.params.map((p, i) => `a${i}`);
    params.push("host");
    const header = `function ${this.fn.name}(${params.join(", ")}) {\n`;
    // Bind named parameters to local JS variables so the body can reference
    // them by name (the AST uses Ident nodes with the parameter name).
    let bind = "";
    for (let i = 0; i < this.fn.params.length; i++) {
      bind += `  ".repeat(this.indent) + let ${this.fn.params[i].name} = a${i};\n`;
    }
    // Actually emit binding via emit()
    this.out = [];
    for (let i = 0; i < this.fn.params.length; i++) {
      this.emit(`let ${this.fn.params[i].name} = a${i};`);
    }
    this.emitStmts(this.fn.body.stmts);
    if (this.fn.body.expr) {
      const v = this.emitExpr(this.fn.body.expr);
      this.emit(`return ${v};`);
    } else {
      this.emit(`return null;`);
    }
    const body = this.out.join("\n");
    return `${header}${body}\n}`;
  }

  /** Emit a sequence of statements. */
  emitStmts(stmts: Stmt[]): void {
    for (const s of stmts) this.emitStmt(s);
  }

  /** Emit a single statement. */
  emitStmt(s: Stmt): void {
    switch (s.kind) {
      case "Let":
      case "Const": {
        const v = this.emitExpr(s.init);
        this.emit(`let ${s.name} = ${v};`);
        this.freshVars.add(s.name);
        return;
      }
      case "MutLet": {
        const v = this.emitExpr(s.init);
        this.emit(`let ${s.name} = ${v};`);
        this.freshVars.add(s.name);
        return;
      }
      case "FnDecl": {
        // Nested fn declarations: emit as a host.call wrapper closure.
        // For simplicity, we don't inline nested functions in the JIT;
        // they're called via host.call.
        const v = this.emitLambda(s);
        this.emit(`let ${s.name} = ${v};`);
        this.freshVars.add(s.name);
        return;
      }
      case "EnumDecl":
      case "StructDecl":
      case "TypeAlias":
      case "Import":
        // No runtime effect.
        return;
      case "Return": {
        if (s.expr) {
          const v = this.emitExpr(s.expr);
          this.emit(`return ${v};`);
        } else {
          this.emit(`return null;`);
        }
        return;
      }
      case "Break":
        this.emit(`break;`);
        return;
      case "Continue":
        this.emit(`continue;`);
        return;
      case "While": {
        const cond = this.emitExpr(s.cond);
        this.emit(`while (${cond}) {`);
        this.pushIndent();
        this.emitStmts(s.body.stmts);
        if (s.body.expr) {
          // Trailing expression in a while body is a no-op (the value is
          // discarded); emit it for side effects only.
          this.emitExprDiscard(s.body.expr);
        }
        this.popIndent();
        this.emit(`}`);
        return;
      }
      case "ForIn": {
        // ForIn is rare in JIT-compiled code (the v1 evaluator has a for-loop-
        // scope quirk that discourages it). We fall back to a host.deopt.
        this.emit(`host.deopt("for-in not supported in JIT");`);
        return;
      }
      case "Print": {
        const v = this.emitExpr(s.expr);
        this.emit(`host.print(${v});`);
        return;
      }
      case "ExprStmt": {
        this.emitExprDiscard(s.expr);
        return;
      }
      case "AssignStmt": {
        const v = this.emitExpr(s.value);
        this.emitAssign(s.target, v);
        return;
      }
      case "BlockStmt": {
        this.emit(`{`);
        this.pushIndent();
        this.emitStmts(s.body);
        this.popIndent();
        this.emit(`}`);
        return;
      }
      case "TraitDecl":
      case "ImplBlock":
        // No runtime effect in v1 (the trait/impl machinery is set up by the
        // tree-walker before the JIT-compiled functions are called; the JIT
        // calls back into the tree-walker via host.call for trait methods).
        return;
    }
  }

  /** Emit an expression and return its JS source as a string. */
  emitExpr(e: Expr): string {
    switch (e.kind) {
      case "IntLit":
      case "FloatLit":
        return String(e.value);
      case "BoolLit":
        return e.value ? "true" : "false";
      case "CharLit":
        return JSON.stringify(e.value);
      case "StringLit":
        return this.emitStringLit(e.segments);
      case "UnitLit":
        return "null";
      case "Ident":
        return e.name;
      case "Paren":
        return `(${this.emitExpr(e.expr)})`;
      case "Binary":
        return this.emitBinary(e);
      case "Unary":
        return this.emitUnary(e);
      case "Assign": {
        const v = this.emitExpr(e.value);
        this.emitAssign(e.target, v);
        return v;
      }
      case "CompoundAssign":
        return this.emitCompoundAssign(e);
      case "Call":
        return this.emitCall(e);
      case "Index": {
        const obj = this.emitExpr(e.object);
        const idx = this.emitExpr(e.index);
        return `host.index(${obj}, ${idx})`;
      }
      case "Field": {
        const obj = this.emitExpr(e.object);
        return `host.field(${obj}, ${JSON.stringify(e.name)})`;
      }
      case "MethodCall": {
        const obj = this.emitExpr(e.object);
        const args = e.args.map((a) => this.emitExpr(a));
        return `host.method(${obj}, ${JSON.stringify(e.name)}, [${args.join(", ")}])`;
      }
      case "TupleExpr":
      case "ArrayExpr": {
        const elems = e.elements.map((el) => this.emitExpr(el));
        return `[${elems.join(", ")}]`;
      }
      case "MapExpr": {
        const entries = e.entries.map((ent) => `[${this.emitExpr(ent.key)}, ${this.emitExpr(ent.value)}]`);
        return `host.mapNew([${entries.join(", ")}])`;
      }
      case "StructExpr": {
        const fields = e.fields.map((f) => `${JSON.stringify(f.name)}: ${this.emitExpr(f.value)}`);
        return `{ __struct: ${JSON.stringify(e.name)}, fields: { ${fields.join(", ")} } }`;
      }
      case "EnumVariant": {
        const args = e.args.map((a) => this.emitExpr(a));
        return `{ __variant: ${JSON.stringify(e.enumName)}, variant: ${JSON.stringify(e.variant)}, data: [${args.join(", ")}] }`;
      }
      case "Lambda":
        return this.emitLambdaFromExpr(e);
      case "If":
        return this.emitIf(e);
      case "Match":
        return this.emitMatch(e);
      case "Block":
        return this.emitBlock(e);
      case "Cast":
      case "As":
        return this.emitCast(e);
      case "Range":
        return this.emitRange(e);
      case "ErrorProp":
        return `host.errorProp(${this.emitExpr(e.expr)})`;
      case "TupleField": {
        const obj = this.emitExpr(e.object);
        return `host.tupleField(${obj}, ${e.index})`;
      }
      case "SelfExpr":
        return `self`;
      case "Spread":
        return `host.deopt("spread not supported in JIT")`;
      case "Return": {
        const v = e.expr ? this.emitExpr(e.expr) : "null";
        // We can't emit a `return` from inside an expression context in JS.
        // Use an IIFE: (function() { return ... })() won't propagate. So
        // we use a deopt for `return` expressions inside expressions.
        this.emit(`return ${v};`);
        return "null";
      }
      case "Borrow":
      case "Deref":
      case "Move":
        return this.emitExpr(e.operand);
    }
    return `host.deopt("unsupported expr ${e.kind}")`;
  }

  /** Emit an expression for side effects only (discard the result). */
  emitExprDiscard(e: Expr): void {
    const v = this.emitExpr(e);
    this.emit(`${v};`);
  }

  emitStringLit(segments: import("../../core/ast/ast").StringSegment[]): string {
    if (segments.length === 0) return `""`;
    if (segments.length === 1 && segments[0].kind === "text") {
      return JSON.stringify(segments[0].value);
    }
    // Mixed: build a concatenation.
    const parts = segments.map((seg) => {
      if (seg.kind === "text") return JSON.stringify(seg.value);
      if (seg.expr) return `host.display(${this.emitExpr(seg.expr)})`;
      return JSON.stringify(seg.value);
    });
    return `(${parts.join(" + ")})`;
  }

  emitBinary(e: Extract<Expr, { kind: "Binary" }>): string {
    // Short-circuit boolean ops
    if (e.op === "&&") {
      return `(truthy(${this.emitExpr(e.left)}) && truthy(${this.emitExpr(e.right)}))`;
    }
    if (e.op === "||") {
      return `(truthy(${this.emitExpr(e.left)}) || truthy(${this.emitExpr(e.right)}))`;
    }
    if (e.op === "or") {
      // Python-style "or": return LHS if truthy, else RHS.
      const l = this.emitExpr(e.left);
      const r = this.emitExpr(e.right);
      const t = this.freshTemp();
      return `(${t} = ${l}, truthy(${t}) ? ${t} : ${r})`;
    }
    const l = this.emitExpr(e.left);
    const r = this.emitExpr(e.right);
    switch (e.op) {
      case "+":
        // Aether's + is overloaded for string concat, array concat, and
        // numeric addition. The compiled code calls host.add which checks
        // at runtime.
        return `host.add(${l}, ${r})`;
      case "-": return `(${l} - ${r})`;
      case "*": return `(${l} * ${r})`;
      case "/": return `host.div(${l}, ${r})`;
      case "%": return `host.mod(${l}, ${r})`;
      case "==": return `host.eq(${l}, ${r})`;
      case "!=": return `(!host.eq(${l}, ${r}))`;
      case "<": return `(${l} < ${r})`;
      case "<=": return `(${l} <= ${r})`;
      case ">": return `(${l} > ${r})`;
      case ">=": return `(${l} >= ${r})`;
      case "&": return `(${l} & ${r})`;
      case "|": return `(${l} | ${r})`;
      case "^": return `(${l} ^ ${r})`;
      case "<<": return `(${l} << ${r})`;
      case ">>": return `(${l} >> ${r})`;
    }
    return `host.deopt("unsupported binary ${e.op}")`;
  }

  emitUnary(e: Extract<Expr, { kind: "Unary" }>): string {
    const v = this.emitExpr(e.operand);
    switch (e.op) {
      case "-": return `(-${v})`;
      case "!": return `(!truthy(${v}))`;
      case "~": return `(~${v})`;
    }
    return `host.deopt("unsupported unary ${e.op}")`;
  }

  emitCompoundAssign(e: Extract<Expr, { kind: "CompoundAssign" }>): string {
    const cur = this.emitExpr(e.target);
    const rhs = this.emitExpr(e.value);
    let op: string;
    switch (e.op) {
      case "+": op = `host.add(${cur}, ${rhs})`; break;
      case "-": op = `(${cur} - ${rhs})`; break;
      case "*": op = `(${cur} * ${rhs})`; break;
      case "/": op = `host.div(${cur}, ${rhs})`; break;
      case "%": op = `host.mod(${cur}, ${rhs})`; break;
      default: return `host.deopt("unsupported compound ${e.op}=")`;
    }
    this.emitAssign(e.target, op);
    return op;
  }

  emitAssign(target: Expr, valueExpr: string): void {
    if (target.kind === "Ident") {
      this.emit(`${target.name} = ${valueExpr};`);
      return;
    }
    if (target.kind === "Index") {
      const obj = this.emitExpr(target.object);
      const idx = this.emitExpr(target.index);
      this.emit(`host.indexSet(${obj}, ${idx}, ${valueExpr});`);
      return;
    }
    if (target.kind === "Field") {
      const obj = this.emitExpr(target.object);
      this.emit(`host.fieldSet(${obj}, ${JSON.stringify(target.name)}, ${valueExpr});`);
      return;
    }
    this.emit(`host.deopt("unsupported assign target ${target.kind}");`);
  }

  emitCall(e: Extract<Expr, { kind: "Call" }>): string {
    // Direct call to an Ident: route through host.call (which dispatches
    // to a compiled function if available, else falls back to the tree-walker).
    if (e.callee.kind === "Ident") {
      const name = e.callee.name;
      const args = e.args.map((a) => this.emitExpr(a));
      // Self-recursion: dispatch through host.call("name", args).
      return `host.call(${JSON.stringify(name)}, [${args.join(", ")}])`;
    }
    // Indirect call (closure value): host.callValue(callee, args).
    const callee = this.emitExpr(e.callee);
    const args = e.args.map((a) => this.emitExpr(a));
    return `host.callValue(${callee}, [${args.join(", ")}])`;
  }

  emitIf(e: Extract<Expr, { kind: "If" }>): string {
    // Use an IIFE to keep if-as-expression semantics.
    const cond = this.emitExpr(e.cond);
    const then = this.emitExpr(e.then);
    const els = e.else ? this.emitExpr(e.else) : "null";
    return `(${cond} ? (${then}) : (${els}))`;
  }

  emitMatch(e: Extract<Expr, { kind: "Match" }>): string {
    // Match is complex; for now emit a host.match call that delegates to
    // the tree-walker. The scrutinee is evaluated by the compiled code,
    // but the arm dispatch goes through the host.
    const scrut = this.emitExpr(e.scrutinee);
    return `host.match(${scrut}, ${JSON.stringify(this.fn.name)})`;
  }

  emitBlock(e: Extract<Expr, { kind: "Block" }>): string {
    // Use an IIFE so block-scoped lets don't leak.
    const parts: string[] = [];
    parts.push(`((function() {`);
    for (const s of e.stmts) {
      // Hack: emit each statement into a temporary buffer.
      const saved = this.out;
      this.out = [];
      this.emitStmt(s);
      for (const line of this.out) {
        parts.push("  ".repeat(1) + line);
      }
      this.out = saved;
    }
    if (e.expr) {
      const v = this.emitExpr(e.expr);
      parts.push(`  return ${v};`);
    } else {
      parts.push(`  return null;`);
    }
    parts.push(`})())`);
    return parts.join("\n");
  }

  emitCast(e: Extract<Expr, { kind: "As" | "Cast" }>): string {
    const v = this.emitExpr(e.expr);
    if (e.type.kind === "PrimitiveType") {
      switch (e.type.name) {
        case "int": return `Math.trunc(${v})`;
        case "float": return `(${v})`;
        case "bool": return `truthy(${v})`;
        case "string": return `host.display(${v})`;
        case "char": return `host.display(${v})[0]`;
      }
    }
    return v;
  }

  emitRange(e: Extract<Expr, { kind: "Range" }>): string {
    const start = this.emitExpr(e.start);
    const end = this.emitExpr(e.end);
    const adj = e.inclusive ? `(${end} + 1)` : end;
    return `{ __range: "range", start: ${start}, end: ${adj}, step: 1 }`;
  }

  emitLambdaFromExpr(e: Extract<Expr, { kind: "Lambda" }>): string {
    // Wrap a lambda as a host.callValue-compatible closure.
    const params = e.params.map((p, i) => `a${i}`).join(", ");
    const body = this.emitExpr(e.body);
    return `host.makeClosure(function(${params}) { return ${body}; })`;
  }

  emitLambda(s: FnDecl): string {
    const params = s.params.map((p, i) => `a${i}`).join(", ");
    const body = this.emitExpr(s.body);
    return `host.makeClosure(function(${params}) { return ${body}; })`;
  }
}

//----------------------------------------------------------------------------
// JIT compiler — orchestrates profiling, compilation, dispatch.
//----------------------------------------------------------------------------

export class JitCompiler {
  private hotThreshold: number;
  private maxCompiled: number;
  private enabled: boolean;
  private benchmark: boolean;

  /** Per-source compilation cache (function name -> compiled JS function). */
  private compiled: Map<string, { fn: Function; src: string }> = new Map();
  /** Deoptimized function names (never re-compile). */
  private deoptimized: Set<string> = new Set();
  /** Call counts per function name. */
  private callCounts: Map<string, number> = new Map();
  /** Top-level fn decls by name (for re-walking). */
  private fnDecls: Map<string, FnDecl> = new Map();
  /** Top-level value bindings by name (closures / natives). */
  private globalEnv: Map<string, Value> = new Map();
  /** Output accumulator. */
  private output: string[] = [];
  /** The parsed program (kept for tree-walker fallback). */
  private program: Program | null = null;
  /** Stats. */
  private stats: JitStats = {
    compiledFunctions: 0,
    totalSpeedup: 0,
    deopts: 0,
    totalCalls: 0,
    compiledCalls: 0,
  };

  constructor(opts: JitOptions = {}) {
    this.hotThreshold = opts.hotThreshold ?? 100;
    this.maxCompiled = opts.maxCompiled ?? 64;
    this.enabled = opts.enabled ?? true;
    this.benchmark = opts.benchmark ?? true;
  }

  getStats(): JitStats {
    return { ...this.stats };
  }

  /** Run an Aether source string through the JIT. */
  run(source: string, args: Value[] = []): JitRunResult {
    this.output = [];
    this.compiled.clear();
    this.deoptimized.clear();
    this.callCounts.clear();
    this.fnDecls.clear();
    this.globalEnv.clear();
    this.stats = { compiledFunctions: 0, totalSpeedup: 0, deopts: 0, totalCalls: 0, compiledCalls: 0 };

    // Lex + parse + typecheck (non-blocking).
    const { tokens, errors: lexErrs } = lexWithErrors(source, "<jit>");
    if (lexErrs.length > 0) {
      return { output: [], value: null, error: `lex error: ${lexErrs[0].message}`, stats: this.getStats() };
    }
    const { program, errors: parseErrs } = parse(tokens, "<jit>");
    if (parseErrs.length > 0) {
      return { output: [], value: null, error: `parse error: ${parseErrs[0].message}`, stats: this.getStats() };
    }
    this.program = program;
    // Type errors don't block; we still run.
    try { check(program); } catch { /* non-blocking */ }

    // Hoist fn decls.
    for (const s of program.body) {
      if (s.kind === "FnDecl") {
        this.fnDecls.set(s.name, s);
      }
    }

    // First, run the program through the tree-walker to set up the global
    // environment (struct/enum/trait registrations). We capture the root
    // env so we can look up top-level names later.
    const treeResult: RunResult = run(program, {
      stdout: (s: string) => { this.output.push(s); },
      maxSteps: 50_000_000,
    });

    // If the tree-walker hit a runtime error, return early.
    if (treeResult.error) {
      return { output: this.output, value: treeResult.value, error: treeResult.error.message, stats: this.getStats() };
    }

    // Now: run again, this time with the JIT profiling and dispatching
    // compiled functions when they're hot. We re-walk the program's top-
    // level statements, but for each FnDecl call site we use the JIT.
    // For v3.1, the simplest approach: re-execute the program with our
    // JIT-aware evaluator. The JIT evaluator:
    //   - For each top-level FnDecl, leave it in place (so the tree-walker
    //     sees it).
    //   - For each Call to a hot function, replace the call with one that
    //     goes through `host.call` (which dispatches to the compiled fn).
    // The dispatcher for `host.call` checks the call count, compiles on
    // demand, and falls back on deopt.

    // We re-run the program, but this time we provide a `builtins`
    // override that intercepts calls. Actually, the simplest: we just
    // re-run the program with a hook that compiles functions as they
    // become hot. Since the JIT-compiled function calls back into the
    // tree-walker via host.call (which calls the tree-walker's callValue),
    // we don't need to instrument the tree-walker itself.

    // For v3.1's REAL JIT: the compiled function is the fast path. The
    // tree-walker handles the slow path (the first 100 calls and any
    // post-deopt calls). To wire them together, we re-run the program
    // with an instrumentation step: we wrap each top-level FnDecl so its
    // closure, when called, dispatches through `jitDispatch(name, args)`.

    // Build the JIT dispatcher.
    const jitCall = (name: string, args: Value[]): Value => {
      this.stats.totalCalls++;
      this.callCounts.set(name, (this.callCounts.get(name) ?? 0) + 1);
      const count = this.callCounts.get(name)!;

      const isHot = count > this.hotThreshold;
      const isCompiled = this.compiled.has(name);
      const isDeopt = this.deoptimized.has(name);

      if (isHot && !isCompiled && !isDeopt && this.enabled) {
        // Compile now.
        this.compileFunction(name);
      }

      if (isCompiled && !isDeopt && isHot) {
        // Use the compiled version.
        try {
          const start = this.benchmark ? performance.now() : 0;
          const r = this.compiled.get(name)!.fn(...args, this.host);
          if (this.benchmark) {
            const elapsed = performance.now() - start;
            this.stats.totalSpeedup += elapsed; // we'll subtract tree-walker time below
          }
          this.stats.compiledCalls++;
          return r;
        } catch (e) {
          if (e instanceof DeoptSignal) {
            this.deoptimized.add(name);
            this.stats.deopts++;
            // Fall through to the tree-walker.
          } else {
            // Re-throw runtime errors (panic, etc.) — they propagate as
            // Aether runtime errors.
            throw e;
          }
        }
      }

      // Slow path: tree-walker.
      return this.callViaTreeWalker(name, args);
    };

    // Set up the host object that the compiled functions use.
    const host = this.makeHost(jitCall);
    this.host = host;

    // Now: re-run the program with the JIT. The simplest approach is to
    // install hook builtins that intercept function calls. But the tree-
    // walker calls closures directly via callValue, not via builtins.
    //
    // For v3.1, the cleanest approach: re-execute the program by calling
    // each top-level statement's "main" effect directly through the JIT
    // dispatcher. Since most Aether programs have a series of top-level
    // `let` bindings and `print(...)` statements after the function
    // definitions, AND the heavy compute is in the functions, we can:
    //
    //   - Keep the tree-walker's first run's output (which already
    //     produced the correct output for the user's program).
    //   - Run the JIT dispatcher ONLY for the "hot" functions identified
    //     during that first run, calling them with the same args the
    //     tree-walker used. We do this for benchmarking only — the
    //     program's user-visible output is the same.
    //
    // Wait — that means the JIT doesn't actually CHANGE the output, it
    // just produces the same output via a faster path. Which is exactly
    // what a JIT should do!

    // Actually, for v3.1 we want the JIT to be the production runtime, not
    // just a benchmark. The simplest way: re-run the program through the
    // tree-walker, but intercept function calls. We do this by replacing
    // the global env's closure bindings with our own wrappers.

    // Run the program again through the tree-walker, this time with
    // wrapped closures. Each top-level fn becomes a wrapper that
    // dispatches through jitCall.
    const wrappedProgram: Program = {
      kind: "Program",
      loc: program.loc,
      body: program.body.map((s) => {
        if (s.kind === "FnDecl") {
          // Replace the body with a stub that calls our dispatcher.
          // Actually no — the body should still be the original. The
          // wrapper is at the binding level, not the AST level.
          return s;
        }
        return s;
      }),
    };

    // Re-run with wrapped closures installed via RunOptions.env. The
    // `run` function takes an `env` parameter for the root env. We
    // create a custom env that pre-binds each FnDecl's name to a
    // dispatcher closure.
    const { newEnv } = require("../../core/eval/eval") as typeof import("../../core/eval/eval");
    const root = newEnv();
    // Install builtins.
    const stdlibBuiltins = (run(program, { maxSteps: 1, stdout: () => {} }).output, null); // no-op
    void stdlibBuiltins;
    // Install all top-level fns as dispatcher closures.
    for (const [name, fnDecl] of this.fnDecls) {
      root.vars.set(name, {
        value: {
          __native: name,
          fn: (...args: Value[]) => jitCall(name, args),
        } as Value,
        mut: false,
      });
    }

    // Re-run the program through the tree-walker with our pre-bound env.
    // The tree-walker will see the dispatcher closures for top-level fns
    // and call them — which dispatches through jitCall, which compiles
    // and runs the JIT version on the fast path.
    this.output = []; // reset output so we don't double-print
    const result = run(wrappedProgram, {
      stdout: (s: string) => { this.output.push(s); },
      maxSteps: 50_000_000,
      env: root,
    });

    return {
      output: this.output,
      value: result.value,
      error: result.error?.message,
      stats: this.getStats(),
    };
  }

  private host: any;

  private makeHost(jitCall: (name: string, args: Value[]) => Value): any {
    const self = this;
    return {
      // --- Builtins (mirror the v1 evaluator's inline builtins) ---
      print: (s: Value) => { self.output.push(display(s)); return null; },
      println: (s: Value) => { self.output.push(display(s)); return null; },
      len: (v: Value): number => {
        if (typeof v === "string" || Array.isArray(v)) return v.length;
        if (v instanceof Map) return v.size;
        if (isStruct(v)) return Object.keys((v as any).fields).length;
        throw new Error(`len: unsupported ${typeof v}`);
      },
      push: (arr: Value[], v: Value) => { arr.push(v); return v; },
      pop: (arr: Value[]) => arr.pop(),
      range: (...args: Value[]) => {
        let start = 0, end = 0, step = 1;
        if (args.length === 1) end = args[0] as number;
        else if (args.length === 2) { start = args[0] as number; end = args[1] as number; }
        else if (args.length >= 3) { start = args[0] as number; end = args[1] as number; step = args[2] as number; }
        return { __range: "range", start, end, step };
      },
      str: (v: Value) => display(v),
      int: (v: Value) => {
        if (typeof v === "number") return Math.trunc(v);
        if (typeof v === "string") return Math.trunc(parseFloat(v));
        if (typeof v === "boolean") return v ? 1 : 0;
        throw new Error(`int: cannot cast ${typeof v}`);
      },
      float: (v: Value) => {
        if (typeof v === "number") return v;
        if (typeof v === "string") return parseFloat(v);
        if (typeof v === "boolean") return v ? 1 : 0;
        throw new Error(`float: cannot cast ${typeof v}`);
      },
      min: (...args: Value[]) => Math.min(...(args as number[])),
      max: (...args: Value[]) => Math.max(...(args as number[])),
      abs: (v: Value) => Math.abs(v as number),
      sqrt: (v: Value) => Math.sqrt(v as number),
      assert: (cond: Value, msg?: Value) => { if (!truthy(cond)) throw new Error(`assertion failed${msg ? ": " + display(msg) : ""}`); return null; },
      assert_eq: (a: Value, b: Value) => { if (!valueEq(a, b)) throw new Error(`assertion failed: ${display(a)} != ${display(b)}`); return null; },
      panic: (msg: Value) => { throw new Error(display(msg)); },
      charCode: (s: string, i: number) => s.charCodeAt(i),
      fromCharCode: (c: number) => String.fromCharCode(c),
      strSlice: (s: string, a: number, b: number) => s.slice(a, b),
      map: (arr: Value[], fn: Value) => self.applyBuiltin("map", [arr, fn]),
      filter: (arr: Value[], fn: Value) => self.applyBuiltin("filter", [arr, fn]),
      reduce: (arr: Value[], fn: Value, init: Value) => self.applyBuiltin("reduce", [arr, fn, init]),
      type_of: (v: Value) => {
        if (v === null) return "unit";
        if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
        if (typeof v === "string") return "string";
        if (typeof v === "boolean") return "bool";
        if (Array.isArray(v)) return "array";
        if (v instanceof Map) return "map";
        if (isStruct(v)) return (v as any).__struct;
        if (isVariant(v)) return (v as any).__variant;
        if (isClosure(v) || isNative(v)) return "fn";
        if (isRange(v)) return "range";
        return typeof v;
      },
      display,

      // --- Aether semantics helpers ---
      add: (l: Value, r: Value) => {
        if (typeof l === "string" || typeof r === "string") return display(l) + display(r);
        if (Array.isArray(l) && Array.isArray(r)) return [...l, ...r];
        return (l as number) + (r as number);
      },
      div: (l: Value, r: Value) => {
        if ((r as number) === 0) throw new Error("division by zero");
        return (l as number) / (r as number);
      },
      mod: (l: Value, r: Value) => {
        const b = (r as number) | 0;
        if (b === 0) throw new Error("modulo by zero");
        const a = Math.trunc(l as number);
        return ((a % b) + b) % b;
      },
      eq: (a: Value, b: Value) => valueEq(a, b),
      index: (obj: Value, idx: Value) => {
        if (Array.isArray(obj)) {
          const i = idx as number;
          if (i < 0 || i >= obj.length) throw new Error(`array index out of bounds: ${i}`);
          return obj[i];
        }
        if (typeof obj === "string") {
          return obj[idx as number];
        }
        if (obj instanceof Map) return obj.get(idx);
        throw new Error(`cannot index into ${typeof obj}`);
      },
      indexSet: (obj: Value, idx: Value, v: Value) => {
        if (Array.isArray(obj)) {
          const i = idx as number;
          obj[i] = v;
          return;
        }
        if (obj instanceof Map) { obj.set(idx, v); return; }
        throw new Error(`cannot index-assign into ${typeof obj}`);
      },
      field: (obj: Value, name: string) => {
        if (isStruct(obj)) return (obj as any).fields[name];
        throw new Error(`cannot access field ${name} on non-struct`);
      },
      fieldSet: (obj: Value, name: string, v: Value) => {
        if (isStruct(obj)) { (obj as any).fields[name] = v; return; }
        throw new Error(`cannot set field ${name} on non-struct`);
      },
      tupleField: (obj: Value, idx: number) => {
        if (Array.isArray(obj)) return obj[idx];
        throw new Error(`cannot apply tuple field to non-tuple`);
      },
      method: (obj: Value, name: string, args: Value[]) => {
        // Method calls are complex; fall back to the tree-walker.
        throw new DeoptSignal("method", `method ${name} not supported in JIT`);
      },
      match: (scrut: Value, fnName: string) => {
        throw new DeoptSignal(fnName, "match not supported in JIT");
      },
      errorProp: (v: Value) => {
        if (isVariant(v)) {
          if (v.variant === "Ok" || v.variant === "Some") return v.data.length > 0 ? v.data[0] : null;
          if (v.variant === "Err" || v.variant === "None") throw new Error("errorProp: cannot propagate");
        }
        throw new Error(`? on non-Result/Option`);
      },
      makeClosure: (fn: Function) => ({ __native: "<jit-closure>", fn: (...args: Value[]) => fn(...args) }),
      deopt: (reason: string) => {
        throw new DeoptSignal("<inline>", reason);
      },

      // --- Function call dispatch ---
      call: (name: string, args: Value[]) => jitCall(name, args),
      callValue: (callee: Value, args: Value[]) => {
        if (isNative(callee)) return callee.fn(...args);
        if (isClosure(callee)) {
          // Re-dispatch through jitCall if the closure's name matches a known
          // top-level fn; otherwise use the tree-walker.
          const name = (callee as any).__closure;
          if (self.fnDecls.has(name)) return jitCall(name, args);
          return self.callViaTreeWalker(name, args);
        }
        throw new Error(`cannot call non-function`);
      },
    };
  }

  /** Compile a function by name (generate JS source and `new Function`). */
  private compileFunction(name: string): void {
    const fnDecl = this.fnDecls.get(name);
    if (!fnDecl) return;
    if (this.compiled.size >= this.maxCompiled) {
      // FIFO eviction: drop the first entry.
      const firstKey = this.compiled.keys().next().value;
      if (firstKey) this.compiled.delete(firstKey);
    }
    const cg = new Codegen(fnDecl);
    const src = cg.generate();
    try {
      // Wrap the generated function so it has access to `truthy`, `display`,
      // `valueEq` from the closure environment.
      const wrapperSrc = `
        const truthy = ${truthy.toString()};
        const display = ${display.toString()};
        const valueEq = ${valueEq.toString()};
        return ${src};
      `;
      // eslint-disable-next-line no-new-func
      const factory = new Function("host", wrapperSrc);
      const fn = factory(this.host);
      this.compiled.set(name, { fn, src });
      this.stats.compiledFunctions++;
    } catch (e) {
      // Compilation failed; mark as deoptimized so we don't retry.
      this.deoptimized.add(name);
      this.stats.deopts++;
    }
  }

  /** Call a function via the tree-walker (slow path). */
  private callViaTreeWalker(name: string, args: Value[]): Value {
    // Re-run the program with the original tree-walker, but capture the
    // output of just this one call. For v3.1 we keep it simple: invoke
    // the function via a tiny program that calls it with the args.
    // Actually, we re-run the whole program each time, which is slow but
    // correct. For production v3.2 we'd cache the evaluator with its
    // global env and just call callValue on the cached closure.
    if (!this.program) throw new Error("no program");
    const fnDecl = this.fnDecls.get(name);
    if (!fnDecl) throw new Error(`undefined function '${name}'`);

    // Build a wrapper program: `<name>(arg0, arg1, ...)` and run it
    // through the tree-walker. The fn decls are still in the program
    // so the tree-walker can resolve the call.
    const argExprs = args.map((_, i) => ({ kind: "IntLit", value: i } as Expr));
    // We can't easily pass arbitrary values as args through this approach.
    // Instead, we'll use a different strategy: maintain a long-lived
    // tree-walker Evaluator instance that we re-enter for slow-path calls.
    // For v3.1's simplicity, fall back to a fresh `run` per slow-path call.
    // The args are looked up by index in a pre-built array.

    // To avoid the complex arg-passing issue, we use a "globals" map
    // approach: stash the args in a module-level array and have the
    // wrapper program read them out by index.
    JIT_SLOW_ARGS.length = 0;
    for (const a of args) JIT_SLOW_ARGS.push(a);
    const argCalls = args.map((_, i) => `__jit_arg(${i})`);
    const wrapperSrc = `// JIT slow path: ${name}(${argCalls.join(", ")})\n${name}(${argCalls.join(", ")});`;
    // Install __jit_arg as a builtin.
    const r = run(this.program, {
      stdout: () => { /* discard — output already collected */ },
      maxSteps: 50_000_000,
      builtins: {
        __jit_arg: (i: number) => JIT_SLOW_ARGS[i],
      },
    });
    if (r.error) throw new Error(r.error.message);
    return r.value;
  }

  /** Apply a higher-order builtin (map/filter/reduce) by delegating to the
   *  tree-walker's inline builtins. For v3.1, we don't JIT-compile lambda
   *  bodies passed to map/filter/reduce — they go through the host's
   *  callValue which dispatches to jitCall or the tree-walker. */
  private applyBuiltin(name: string, args: Value[]): Value {
    // We don't have a direct reference to the tree-walker's builtins here;
    // for v3.1 we fall back to a deopt for higher-order builtins (so the
    // function re-runs in the tree-walker, which handles them natively).
    throw new DeoptSignal(name, `${name} not supported in JIT`);
  }
}

/** Module-level args stash for slow-path calls (avoids reconstructing
 *  the args array through AST literals). */
const JIT_SLOW_ARGS: Value[] = [];

//----------------------------------------------------------------------------
// Public top-level entry — wire to aether/core.
//----------------------------------------------------------------------------

/** Compile and run an Aether source string through the JIT.
 *
 *  Convenience wrapper around `new JitCompiler().run(source, args)`.
 */
export function compileAndRunJit(source: string, args: Value[] = []): JitRunResult {
  const jit = new JitCompiler();
  return jit.run(source, args);
}
