/**
 * aether/core/eval/eval.ts
 * ========================
 * The Aether tree-walking evaluator (v1 runtime).
 *
 * `run(program, opts)` walks the AST produced by the parser and executes it,
 * returning the value of the program's last top-level expression plus the
 * captured stdout output, any thrown runtime error, and a step counter.
 *
 * Simplifications / v1 limitations (documented)
 * ---------------------------------------------
 * - Synchronous. There is no scheduler, no green threads. `spawn`/`select`
 *   and other async primitives live in `aether/stdlib/async` and are callable
 *   only from host code, not from a sync Aether script.
 * - Generic type parameters are erased at runtime — they're compile-time only.
 *   `id<int>(42)` calls the same closure as `id(42)`.
 * - Int and Float are both JS `number`. `int`-only operators (`&`, `|`, `^`,
 *   `<<`, `>>`, `%`) truncate to integer via `Math.trunc` before and after.
 *   Plain `+`/`-`/`*`/`/` keep JS semantics (`/` is float division).
 * - Strings are JS `string`. Arrays are JS `Array`. Maps are JS `Map`.
 *   Structs are tagged `{ __struct, fields }`. Enum variants are tagged
 *   `{ __variant, variant, data }`. Ranges (returned by `range(...)`) are
 *   `{ __range, start, end, step }`.
 * - Error propagation `expr?` unwraps an `Ok`/`Some` value, or propagates the
 *   `Err`/`None` by returning it from the enclosing function. We model this by
 *   throwing a `ReturnSignal` carrying the `Err`/`None` value.
 * - `panic(msg)` throws a `PanicSignal`, caught at the top level and reported
 *   in `RunResult.error`.
 * - Match arms are evaluated in order; the first matching pattern wins.
 *   Guard expressions are evaluated with the pattern's bindings in scope.
 *
 * Public surface
 * --------------
 *   run(program, opts?) -> RunResult
 *   type Value, RunOptions, RunResult
 *   class ReturnSignal, BreakSignal, ContinueSignal, PanicSignal
 */
import type {
  Program,
  Stmt,
  Expr,
  Pattern,
  FnDecl,
  EnumDecl,
  StructDecl,
  Block,
  MatchArm,
  StringSegment,
} from "../ast/ast";

//----------------------------------------------------------------------------
// Public types
//----------------------------------------------------------------------------

/**
 * A runtime Aether value.
 *
 * Tagged shapes (`__struct`, `__variant`, `__closure`, `__native`, `__range`)
 * use a string sentinel field that the evaluator pattern-matches on. The
 * sentinel doubles as a defensive check against accidental struct/enum name
 * collisions: a user struct named `__closure` cannot exist because Aether
 * identifiers can't start with two underscores.
 */
export type Value =
  | number
  | string
  | boolean
  | null
  | Value[]
  | Map<Value, Value>
  | { __struct: string; fields: Record<string, Value> }
  | { __variant: string; variant: string; data: Value[] }
  | { __closure: string; fn: FnDecl; env: Env }
  | { __native: string; fn: (...args: Value[]) => Value }
  | { __range: string; start: number; end: number; step: number };

export interface RunOptions {
  /** Sink for `print`/`println` output. Default: push to `output` array. */
  stdout?: (s: string) => void;
  /** Hard cap on evaluation steps. Default 1_000_000. */
  maxSteps?: number;
  /** Host-supplied builtins, merged with the inline builtins. */
  builtins?: Record<string, (...args: Value[]) => Value>;
  /** Optional seed environment (used by tests). */
  env?: Env;
}

export interface RunResult {
  /** Value of the program's last top-level expression, or null. */
  value: Value;
  /** Captured output, one entry per `println` (no trailing newline). */
  output: string[];
  /** Runtime error if `panic` was thrown or another runtime error occurred. */
  error?: { message: string; stack?: string };
  /** Number of evaluation steps performed (for infinite-loop protection). */
  steps: number;
}

//----------------------------------------------------------------------------
// Lexical environment
//----------------------------------------------------------------------------

export interface Env {
  vars: Map<string, { value: Value; mut: boolean }>;
  parent?: Env;
}

export function newEnv(parent?: Env): Env {
  return { vars: new Map(), parent };
}

function envGet(env: Env, name: string): { value: Value; mut: boolean } | undefined {
  let e: Env | undefined = env;
  while (e) {
    const v = e.vars.get(name);
    if (v !== undefined) return v;
    e = e.parent;
  }
  return undefined;
}

function envSetMut(env: Env, name: string, value: Value): boolean {
  let e: Env | undefined = env;
  while (e) {
    const existing = e.vars.get(name);
    if (existing !== undefined) {
      if (!existing.mut) return false; // immutable
      existing.value = value;
      return true;
    }
    e = e.parent;
  }
  return false;
}

//----------------------------------------------------------------------------
// Control-flow signals (carried as JS exceptions)
//----------------------------------------------------------------------------

class ReturnSignal {
  readonly __signal = "return";
  constructor(public value: Value) {}
}
class BreakSignal {
  readonly __signal = "break";
}
class ContinueSignal {
  readonly __signal = "continue";
}
class PanicSignal {
  readonly __signal = "panic";
  constructor(public message: string, public stack?: string) {}
}

//----------------------------------------------------------------------------
// Helpers
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

/** Display a value as a string for `print`, interpolation, and `str()`. */
export function display(v: Value): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  if (Array.isArray(v)) return "[" + v.map(display).join(", ") + "]";
  if (v instanceof Map) {
    const parts: string[] = [];
    for (const [k, val] of v) parts.push(`${display(k)}: ${display(val)}`);
    return "{" + parts.join(", ") + "}";
  }
  if (isStruct(v)) {
    const parts = Object.keys(v.fields).map((k) => `${k}: ${display(v.fields[k])}`);
    return `${v.__struct} { ${parts.join(", ")} }`;
  }
  if (isVariant(v)) {
    if (v.data.length === 0) return `${v.__variant}::${v.variant}`;
    return `${v.__variant}::${v.variant}(${v.data.map(display).join(", ")})`;
  }
  if (isClosure(v)) return `<closure ${v.fn.name}>`;
  if (isNative(v)) return `<native ${v.__native}>`;
  if (isRange(v)) return `range(${v.start}, ${v.end}${v.step !== 1 ? ", " + v.step : ""})`;
  return String(v);
}

/** Deep equality used by `assert_eq` and `==` on arrays/structs/maps. */
export function valueEq(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a === "number" || typeof a === "string" || typeof a === "boolean") return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!valueEq(a[i], b[i])) return false;
    return true;
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (!b.has(k)) return false;
      if (!valueEq(v, b.get(k) as Value)) return false;
    }
    return true;
  }
  if (isStruct(a) && isStruct(b)) {
    if (a.__struct !== b.__struct) return false;
    const ak = Object.keys(a.fields);
    const bk = Object.keys(b.fields);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!(k in b.fields)) return false;
      if (!valueEq(a.fields[k], b.fields[k])) return false;
    }
    return true;
  }
  if (isVariant(a) && isVariant(b)) {
    if (a.__variant !== b.__variant || a.variant !== b.variant) return false;
    if (a.data.length !== b.data.length) return false;
    for (let i = 0; i < a.data.length; i++) if (!valueEq(a.data[i], b.data[i])) return false;
    return true;
  }
  return false;
}

/** Truthiness for `if`/`while`/match guards: empty array/string/null are falsy. */
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
// Evaluator
//----------------------------------------------------------------------------

class Evaluator {
  steps = 0;
  maxSteps: number;
  output: string[] = [];
  stdout: (s: string) => void;
  root: Env;

  constructor(opts: RunOptions) {
    this.maxSteps = opts.maxSteps ?? 1_000_000;
    this.stdout = opts.stdout ?? ((s: string) => { this.output.push(s); });
    this.root = opts.env ?? newEnv();
    if (opts.builtins) {
      for (const [name, fn] of Object.entries(opts.builtins)) {
        this.root.vars.set(name, { value: { __native: name, fn }, mut: false });
      }
    }
    this.installInlineBuiltins();
  }

  tick(): void {
    this.steps++;
    if (this.steps > this.maxSteps) {
      throw new PanicSignal(`execution step limit exceeded (${this.maxSteps})`);
    }
  }

  run(program: Program): RunResult {
    try {
      // Hoist all declarations (fn/enum/struct) so order doesn't matter.
      for (const s of program.body) this.hoist(s, this.root);
      let last: Value = null;
      for (const s of program.body) {
        last = this.execStmt(s, this.root);
      }
      return { value: last, output: this.output, steps: this.steps };
    } catch (e) {
      if (e instanceof PanicSignal) {
        return {
          value: null,
          output: this.output,
          steps: this.steps,
          error: { message: e.message, stack: e.stack },
        };
      }
      // Unknown error — wrap as panic.
      const msg = e instanceof Error ? e.message : String(e);
      return {
        value: null,
        output: this.output,
        steps: this.steps,
        error: { message: msg, stack: e instanceof Error ? e.stack : undefined },
      };
    }
  }

  // --------------------------------------------------------------------------
  // Hoisting
  // --------------------------------------------------------------------------
  hoist(s: Stmt, env: Env): void {
    switch (s.kind) {
      case "FnDecl": {
        env.vars.set(s.name, { value: { __closure: s.name, fn: s, env }, mut: false });
        return;
      }
      case "EnumDecl":
      case "StructDecl":
      case "TypeAlias":
      case "Import":
        return;
    }
  }

  // --------------------------------------------------------------------------
  // Statements — returns the value of the last expression in a block-ish stmt
  // --------------------------------------------------------------------------
  execStmt(s: Stmt, env: Env): Value {
    this.tick();
    switch (s.kind) {
      case "Let":
      case "Const": {
        const v = this.eval(s.init, env);
        env.vars.set(s.name, { value: v, mut: false });
        return null;
      }
      case "MutLet": {
        const v = this.eval(s.init, env);
        env.vars.set(s.name, { value: v, mut: true });
        return null;
      }
      case "FnDecl":
        // Already hoisted; re-bind in case of shadowing in nested scopes.
        env.vars.set(s.name, { value: { __closure: s.name, fn: s, env }, mut: false });
        return null;
      case "EnumDecl":
      case "StructDecl":
      case "TypeAlias":
      case "Import":
        return null;
      case "Return": {
        const v = s.expr ? this.eval(s.expr, env) : null;
        throw new ReturnSignal(v);
      }
      case "Break":
        throw new BreakSignal();
      case "Continue":
        throw new ContinueSignal();
      case "While": {
        let last: Value = null;
        while (truthy(this.eval(s.cond, env))) {
          this.tick();
          try {
            last = this.execBlock(s.body, env);
          } catch (sig) {
            if (sig instanceof BreakSignal) break;
            if (sig instanceof ContinueSignal) continue;
            throw sig;
          }
        }
        return last;
      }
      case "ForIn": {
        const iter = this.eval(s.iterable, env);
        const items: Value[] = iterToItems(iter);
        let last: Value = null;
        for (const item of items) {
          this.tick();
          const child = newEnv(env);
          child.vars.set(s.varName, { value: item, mut: false });
          try {
            last = this.execBlock(s.body, child);
          } catch (sig) {
            if (sig instanceof BreakSignal) break;
            if (sig instanceof ContinueSignal) continue;
            throw sig;
          }
        }
        return last;
      }
      case "Print": {
        const v = this.eval(s.expr, env);
        this.stdout(display(v));
        return null;
      }
      case "ExprStmt": {
        return this.eval(s.expr, env);
      }
      case "AssignStmt": {
        return this.eval({ kind: "Assign", loc: s.loc, target: s.target, value: s.value }, env);
      }
      case "BlockStmt": {
        const child = newEnv(env);
        return this.execBlock({ kind: "Block", loc: s.loc, stmts: s.body, expr: null }, child);
      }
    }
    return null;
  }

  // Execute a Block (statements + optional trailing expr) in `env`.
  execBlock(b: Block, env: Env): Value {
    let last: Value = null;
    for (const s of b.stmts) {
      last = this.execStmt(s, env);
    }
    if (b.expr) {
      last = this.eval(b.expr, env);
    }
    return last;
  }

  // --------------------------------------------------------------------------
  // Expressions
  // --------------------------------------------------------------------------
  eval(e: Expr, env: Env): Value {
    this.tick();
    switch (e.kind) {
      case "IntLit":
      case "FloatLit":
      case "BoolLit":
        return e.value;
      case "CharLit":
        return e.value;
      case "StringLit":
        return this.evalStringLit(e.segments, env);
      case "UnitLit":
        return null;
      case "Ident": {
        const v = envGet(env, e.name);
        if (v === undefined) throw new PanicSignal(`undefined name '${e.name}'`);
        return v.value;
      }
      case "Paren":
        return this.eval(e.expr, env);
      case "Binary":
        return this.evalBinary(e, env);
      case "Unary":
        return this.evalUnary(e, env);
      case "Assign":
        return this.evalAssign(e, env);
      case "CompoundAssign":
        return this.evalCompoundAssign(e, env);
      case "Call":
        return this.evalCall(e, env);
      case "Index":
        return this.evalIndex(e, env);
      case "Field":
        return this.evalField(e, env);
      case "MethodCall":
        return this.evalMethodCall(e, env);
      case "TupleExpr":
        return e.elements.map((el) => this.eval(el, env));
      case "ArrayExpr":
        return e.elements.map((el) => this.eval(el, env));
      case "MapExpr": {
        const m = new Map<Value, Value>();
        for (const ent of e.entries) {
          const k = this.eval(ent.key, env);
          const v = this.eval(ent.value, env);
          m.set(k, v);
        }
        return m;
      }
      case "StructExpr":
        return this.evalStructExpr(e, env);
      case "EnumVariant":
        return this.evalEnumVariant(e, env);
      case "Lambda":
        return { __closure: "<lambda>", fn: lambdaToFnDecl(e), env };
      case "If":
        return this.evalIf(e, env);
      case "Match":
        return this.evalMatch(e, env);
      case "Block": {
        const child = newEnv(env);
        return this.execBlock(e, child);
      }
      case "Cast":
      case "As":
        return this.evalCast(e, env);
      case "Range":
        return this.evalRange(e, env);
      case "ErrorProp":
        return this.evalErrorProp(e, env);
      case "TupleField":
        return this.evalTupleField(e, env);
      case "SelfExpr":
        throw new PanicSignal("`self` is not supported outside of a method");
      case "Spread":
        throw new PanicSignal("spread `...x` is not a standalone expression");
      case "Return": {
        const v = e.expr ? this.eval(e.expr, env) : null;
        throw new ReturnSignal(v);
      }
    }
  }

  evalStringLit(segments: StringSegment[], env: Env): string {
    let out = "";
    for (const seg of segments) {
      if (seg.kind === "text") {
        out += seg.value;
      } else if (seg.expr) {
        out += display(this.eval(seg.expr, env));
      } else {
        // Fallback: literal value (shouldn't happen post-parse).
        out += seg.value;
      }
    }
    return out;
  }

  evalBinary(e: Extract<Expr, { kind: "Binary" }>, env: Env): Value {
    const op = e.op;
    // Short-circuit boolean operators
    if (op === "&&") {
      const l = this.eval(e.left, env);
      if (!truthy(l)) return false;
      return truthy(this.eval(e.right, env));
    }
    if (op === "||") {
      const l = this.eval(e.left, env);
      if (truthy(l)) return true;
      return truthy(this.eval(e.right, env));
    }
    // Python-style `or`: return LHS if truthy, else RHS (preserves type)
    if (op === "or") {
      const l = this.eval(e.left, env);
      if (truthy(l)) return l;
      return this.eval(e.right, env);
    }
    const l = this.eval(e.left, env);
    const r = this.eval(e.right, env);
    switch (op) {
      case "+":
        if (typeof l === "string" || typeof r === "string") {
          return display(l) + display(r);
        }
        if (Array.isArray(l) && Array.isArray(r)) return [...l, ...r];
        return (l as number) + (r as number);
      case "-": return (l as number) - (r as number);
      case "*": return (l as number) * (r as number);
      case "/":
        if ((r as number) === 0) throw new PanicSignal("division by zero");
        return (l as number) / (r as number);
      case "%": {
        const b = (r as number) | 0;
        if (b === 0) throw new PanicSignal("modulo by zero");
        const a = Math.trunc(l as number);
        const m = ((a % b) + b) % b; // Python-style positive modulo
        return m;
      }
      case "==": return valueEq(l, r);
      case "!=": return !valueEq(l, r);
      case "<": return (l as number) < (r as number);
      case "<=": return (l as number) <= (r as number);
      case ">": return (l as number) > (r as number);
      case ">=": return (l as number) >= (r as number);
      case "&": return (Math.trunc(l as number) & Math.trunc(r as number)) | 0;
      case "|": return (Math.trunc(l as number) | Math.trunc(r as number)) | 0;
      case "^": return (Math.trunc(l as number) ^ Math.trunc(r as number)) | 0;
      case "<<": return (Math.trunc(l as number) << Math.trunc(r as number)) | 0;
      case ">>": return (Math.trunc(l as number) >> Math.trunc(r as number)) | 0;
    }
    throw new PanicSignal(`unknown binary operator '${op}'`);
  }

  evalUnary(e: Extract<Expr, { kind: "Unary" }>, env: Env): Value {
    const v = this.eval(e.operand, env);
    switch (e.op) {
      case "-": return -(v as number);
      case "!": return !truthy(v);
      case "~": return ~Math.trunc(v as number);
    }
    throw new PanicSignal(`unknown unary operator '${e.op}'`);
  }

  evalAssign(e: Extract<Expr, { kind: "Assign" }>, env: Env): Value {
    const v = this.eval(e.value, env);
    this.assignTo(e.target, v, env);
    return v;
  }

  evalCompoundAssign(e: Extract<Expr, { kind: "CompoundAssign" }>, env: Env): Value {
    const cur = this.eval(e.target, env);
    const rhs = this.eval(e.value, env);
    let nv: Value;
    switch (e.op) {
      case "+": nv = (cur as number) + (rhs as number); break;
      case "-": nv = (cur as number) - (rhs as number); break;
      case "*": nv = (cur as number) * (rhs as number); break;
      case "/":
        if ((rhs as number) === 0) throw new PanicSignal("division by zero");
        nv = (cur as number) / (rhs as number); break;
      case "%": {
        const b = (rhs as number) | 0;
        if (b === 0) throw new PanicSignal("modulo by zero");
        nv = ((Math.trunc(cur as number) % b) + b) % b; break;
      }
      default: throw new PanicSignal(`unknown compound assign '${e.op}='`);
    }
    this.assignTo(e.target, nv, env);
    return nv;
  }

  assignTo(target: Expr, value: Value, env: Env): void {
    if (target.kind === "Ident") {
      const ok = envSetMut(env, target.name, value);
      if (!ok) {
        const info = envGet(env, target.name);
        if (info === undefined) throw new PanicSignal(`undefined name '${target.name}'`);
        throw new PanicSignal(`cannot assign to immutable variable '${target.name}'`);
      }
      return;
    }
    if (target.kind === "Index") {
      const obj = this.eval(target.object, env);
      const idx = this.eval(target.index, env);
      if (Array.isArray(obj)) {
        const i = idx as number;
        if (i < 0 || i >= obj.length) throw new PanicSignal(`array index out of bounds: ${i}`);
        obj[i] = value;
        return;
      }
      if (obj instanceof Map) {
        obj.set(idx, value);
        return;
      }
      throw new PanicSignal("cannot index-assign into non-array/map");
    }
    if (target.kind === "Field") {
      const obj = this.eval(target.object, env);
      if (isStruct(obj)) {
        obj.fields[target.name] = value;
        return;
      }
      throw new PanicSignal(`cannot assign field '${target.name}' on non-struct`);
    }
    throw new PanicSignal(`invalid assignment target: ${target.kind}`);
  }

  evalCall(e: Extract<Expr, { kind: "Call" }>, env: Env): Value {
    const callee = this.eval(e.callee, env);
    const args = e.args.map((a) => this.eval(a, env));
    return this.callValue(callee, args, e.callee);
  }

  callValue(callee: Value, args: Value[], calleeNode?: Expr): Value {
    if (isClosure(callee)) {
      const fn = callee.fn;
      const child = newEnv(callee.env);
      for (let i = 0; i < fn.params.length; i++) {
        const p = fn.params[i];
        const a = i < args.length ? args[i] : null;
        child.vars.set(p.name, { value: a, mut: p.name === "self" });
      }
      try {
        return this.execBlock(fn.body, child);
      } catch (sig) {
        if (sig instanceof ReturnSignal) return sig.value;
        throw sig;
      }
    }
    if (isNative(callee)) {
      return callee.fn(...args);
    }
    throw new PanicSignal(`cannot call non-function value${calleeNode ? ` '${describeCallee(calleeNode)}'` : ""}`);
  }

  evalIndex(e: Extract<Expr, { kind: "Index" }>, env: Env): Value {
    const obj = this.eval(e.object, env);
    const idx = this.eval(e.index, env);
    if (Array.isArray(obj)) {
      const i = idx as number;
      if (i < 0 || i >= obj.length) throw new PanicSignal(`array index out of bounds: ${i}`);
      return obj[i];
    }
    if (typeof obj === "string") {
      const i = idx as number;
      if (i < 0 || i >= obj.length) throw new PanicSignal(`string index out of bounds: ${i}`);
      return obj[i];
    }
    if (obj instanceof Map) {
      if (!obj.has(idx)) throw new PanicSignal(`map key not found: ${display(idx)}`);
      return obj.get(idx) as Value;
    }
    throw new PanicSignal(`cannot index into ${typeof obj}`);
  }

  evalField(e: Extract<Expr, { kind: "Field" }>, env: Env): Value {
    const obj = this.eval(e.object, env);
    if (isStruct(obj)) {
      if (!(e.name in obj.fields)) throw new PanicSignal(`struct ${obj.__struct} has no field '${e.name}'`);
      return obj.fields[e.name];
    }
    // Allow field-style access on enum variants? Not in v1.
    throw new PanicSignal(`cannot access field '${e.name}' on ${typeof obj}`);
  }

  evalMethodCall(e: Extract<Expr, { kind: "MethodCall" }>, env: Env): Value {
    // v1: method calls are syntactic sugar for free-function calls on the
    // receiver, e.g. `arr.push(v)` → `push(arr, v)`. We try the builtin scope
    // first; if found, call it with [receiver, ...args]. If not found, fall
    // back to throwing a "no method" error.
    const recv = this.eval(e.object, env);
    const args = [recv, ...e.args.map((a) => this.eval(a, env))];
    const fn = envGet(env, e.name);
    if (fn && (isNative(fn.value) || isClosure(fn.value))) {
      return this.callValue(fn.value, args);
    }
    throw new PanicSignal(`no method '${e.name}' on ${typeof recv}`);
  }

  evalStructExpr(e: Extract<Expr, { kind: "StructExpr" }>, env: Env): Value {
    const fields: Record<string, Value> = {};
    if (e.spread) {
      const base = this.eval(e.spread, env);
      if (isStruct(base)) {
        for (const [k, v] of Object.entries(base.fields)) fields[k] = v;
      } else {
        throw new PanicSignal(`spread base is not a struct`);
      }
    }
    for (const f of e.fields) {
      fields[f.name] = this.eval(f.value, env);
    }
    return { __struct: e.name, fields };
  }

  evalEnumVariant(e: Extract<Expr, { kind: "EnumVariant" }>, env: Env): Value {
    const data = e.args.map((a) => this.eval(a, env));
    return { __variant: e.enumName, variant: e.variant, data };
  }

  evalIf(e: Extract<Expr, { kind: "If" }>, env: Env): Value {
    if (truthy(this.eval(e.cond, env))) {
      return this.eval(e.then, env);
    }
    if (e.else) return this.eval(e.else, env);
    return null;
  }

  evalMatch(e: Extract<Expr, { kind: "Match" }>, env: Env): Value {
    const v = this.eval(e.scrutinee, env);
    for (const arm of e.arms) {
      this.tick();
      const child = newEnv(env);
      if (this.matchPattern(arm.pattern, v, child)) {
        if (arm.guard) {
          if (!truthy(this.eval(arm.guard, child))) continue;
        }
        return this.eval(arm.body, child);
      }
    }
    throw new PanicSignal("no match arm matched");
  }

  evalCast(e: Extract<Expr, { kind: "As" | "Cast" }>, env: Env): Value {
    const v = this.eval(e.expr, env);
    const ty = e.type;
    switch (ty.kind) {
      case "PrimitiveType":
        switch (ty.name) {
          case "int": return Math.trunc(v as number);
          case "float": return v as number;
          case "bool": return truthy(v);
          case "string": return display(v);
          case "char": return display(v)[0] ?? "";
        }
        break;
      case "NamedType":
        // No-op cast to user type (erased at runtime).
        return v;
      case "UnitType":
        return null;
    }
    return v;
  }

  evalRange(e: Extract<Expr, { kind: "Range" }>, env: Env): Value {
    const start = this.eval(e.start, env) as number;
    const end = this.eval(e.end, env) as number;
    const step = 1;
    // inclusive ranges have end+1 as the JS upper bound.
    const adjEnd = e.inclusive ? end + 1 : end;
    return { __range: "range", start, end: adjEnd, step };
  }

  evalErrorProp(e: Extract<Expr, { kind: "ErrorProp" }>, env: Env): Value {
    const v = this.eval(e.expr, env);
    // Option/Result: success = Some/Ok; failure = None/Err (propagate).
    if (isVariant(v)) {
      if (v.variant === "Ok" || v.variant === "Some") {
        return v.data.length > 0 ? v.data[0] : null;
      }
      if (v.variant === "Err" || v.variant === "None") {
        // Propagate by returning from the enclosing function.
        throw new ReturnSignal(v);
      }
    }
    throw new PanicSignal(`? operator applied to non-Result/Option: ${display(v)}`);
  }

  evalTupleField(e: Extract<Expr, { kind: "TupleField" }>, env: Env): Value {
    const obj = this.eval(e.object, env);
    if (Array.isArray(obj)) {
      if (e.index < 0 || e.index >= obj.length) throw new PanicSignal(`tuple index out of bounds: ${e.index}`);
      return obj[e.index];
    }
    throw new PanicSignal(`cannot apply tuple field .${e.index} to non-tuple`);
  }

  // --------------------------------------------------------------------------
  // Pattern matching — returns true on match, with bindings added to `env`.
  // --------------------------------------------------------------------------
  matchPattern(p: Pattern, v: Value, env: Env): boolean {
    this.tick();
    switch (p.kind) {
      case "WildcardPat":
        return true;
      case "BindPat":
        env.vars.set(p.name, { value: v, mut: !!p.mut });
        return true;
      case "LitPat": {
        const lit = this.eval(p.value, env);
        return valueEq(lit, v);
      }
      case "TuplePat": {
        if (!Array.isArray(v)) return false;
        if (p.elements.length !== v.length) return false;
        for (let i = 0; i < p.elements.length; i++) {
          if (!this.matchPattern(p.elements[i], v[i], env)) return false;
        }
        return true;
      }
      case "ArrayPat": {
        if (!Array.isArray(v)) return false;
        const nprefix = p.elements.length;
        if (p.rest === null || p.rest === undefined) {
          if (v.length !== nprefix) return false;
          for (let i = 0; i < nprefix; i++) {
            if (!this.matchPattern(p.elements[i], v[i], env)) return false;
          }
          return true;
        }
        // rest present: prefix matches first n, the rest is captured by `..`.
        if (v.length < nprefix) return false;
        for (let i = 0; i < nprefix; i++) {
          if (!this.matchPattern(p.elements[i], v[i], env)) return false;
        }
        return true;
      }
      case "StructPat": {
        if (!isStruct(v)) return false;
        if (v.__struct !== p.name) return false;
        for (const f of p.fields) {
          if (!(f.name in v.fields)) return false;
          if (!this.matchPattern(f.pattern, v.fields[f.name], env)) return false;
        }
        return true;
      }
      case "EnumPat": {
        if (!isVariant(v)) return false;
        if (v.__variant !== p.enumName) return false;
        if (v.variant !== p.variant) return false;
        if (p.subpatterns.length !== v.data.length) {
          // Allow unit variant with 0 subpatterns to match a 0-arg variant.
          if (p.subpatterns.length === 0 && v.data.length === 0) return true;
          return false;
        }
        for (let i = 0; i < p.subpatterns.length; i++) {
          if (!this.matchPattern(p.subpatterns[i], v.data[i], env)) return false;
        }
        return true;
      }
      case "OrPat": {
        for (const sub of p.patterns) {
          const subEnv = newEnv(env.parent);
          // Copy parent's vars (each OrPat branch must not leak bindings to
          // siblings, but bindings from earlier scopes remain visible).
          for (const [k, val] of env.vars) subEnv.vars.set(k, val);
          if (this.matchPattern(sub, v, subEnv)) {
            // Promote successful branch's bindings into env.
            for (const [k, val] of subEnv.vars) {
              if (!env.vars.has(k)) env.vars.set(k, val);
            }
            return true;
          }
        }
        return false;
      }
      case "RestPat":
        // Handled inside ArrayPat.
        return true;
    }
  }

  // --------------------------------------------------------------------------
  // Inline builtins — always available, plus whatever the host passes.
  // --------------------------------------------------------------------------
  installInlineBuiltins(): void {
    const set = (name: string, fn: (...args: Value[]) => Value) => {
      this.root.vars.set(name, { value: { __native: name, fn }, mut: false });
    };

    set("print", (s) => { this.stdout(display(s)); return null; });
    set("println", (s) => { this.stdout(display(s)); return null; });
    set("range", (...args) => {
      let start = 0, end = 0, step = 1;
      if (args.length === 1) end = args[0] as number;
      else if (args.length === 2) { start = args[0] as number; end = args[1] as number; }
      else if (args.length >= 3) { start = args[0] as number; end = args[1] as number; step = args[2] as number; }
      return { __range: "range", start, end, step };
    });
    set("len", (v) => {
      if (typeof v === "string" || Array.isArray(v)) return v.length;
      if (v instanceof Map) return v.size;
      if (isStruct(v)) return Object.keys(v.fields).length;
      throw new Error(`len: unsupported value ${typeof v}`);
    });
    set("type_of", (v) => {
      if (v === null) return "unit";
      if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
      if (typeof v === "string") return "string";
      if (typeof v === "boolean") return "bool";
      if (Array.isArray(v)) return "array";
      if (v instanceof Map) return "map";
      if (isStruct(v)) return v.__struct;
      if (isVariant(v)) return v.__variant;
      if (isClosure(v)) return "fn";
      if (isNative(v)) return "fn";
      if (isRange(v)) return "range";
      return typeof v;
    });
    set("assert", (cond, msg) => {
      if (!truthy(cond)) throw new PanicSignal(`assertion failed${msg ? ": " + display(msg) : ""}`);
      return null;
    });
    set("assert_eq", (a, b) => {
      if (!valueEq(a, b)) throw new PanicSignal(`assertion failed: ${display(a)} != ${display(b)}`);
      return null;
    });
    set("panic", (msg) => { throw new PanicSignal(display(msg)); });
    set("str", (v) => display(v));
    set("int", (v) => {
      if (typeof v === "string") {
        const n = parseInt(v, 10);
        if (Number.isNaN(n)) throw new Error(`int: cannot parse '${v}'`);
        return n;
      }
      return Math.trunc(v as number);
    });
    set("float", (v) => {
      if (typeof v === "string") {
        const n = parseFloat(v);
        if (Number.isNaN(n)) throw new Error(`float: cannot parse '${v}'`);
        return n;
      }
      return v as number;
    });
    set("min", (...args) => {
      if (args.length === 0) return 0;
      if (args.length === 1 && Array.isArray(args[0])) return Math.min(...(args[0] as number[]));
      return Math.min(...(args as number[]));
    });
    set("max", (...args) => {
      if (args.length === 0) return 0;
      if (args.length === 1 && Array.isArray(args[0])) return Math.max(...(args[0] as number[]));
      return Math.max(...(args as number[]));
    });
    set("abs", (n) => Math.abs(n as number));
    set("sqrt", (n) => Math.sqrt(n as number));
    set("push", (arr, v) => {
      if (!Array.isArray(arr)) throw new Error("push: expected array");
      arr.push(v);
      return arr;
    });
    set("pop", (arr) => {
      if (!Array.isArray(arr)) throw new Error("pop: expected array");
      return arr.pop() ?? null;
    });
    // Higher-order builtins — use this.callValue so Aether closures work too.
    const self = this;
    set("map", (arr, fn) => {
      if (!Array.isArray(arr)) throw new Error("map: expected array");
      const out: Value[] = [];
      for (let i = 0; i < arr.length; i++) out.push(self.callValue(fn, [arr[i], i]));
      return out;
    });
    set("filter", (arr, fn) => {
      if (!Array.isArray(arr)) throw new Error("filter: expected array");
      const out: Value[] = [];
      for (let i = 0; i < arr.length; i++) {
        if (truthy(self.callValue(fn, [arr[i], i]))) out.push(arr[i]);
      }
      return out;
    });
    set("reduce", (arr, fn, init) => {
      if (!Array.isArray(arr)) throw new Error("reduce: expected array");
      let acc = init;
      for (let i = 0; i < arr.length; i++) acc = self.callValue(fn, [acc, arr[i], i]);
      return acc;
    });
  }
}

// Convert a Value used as a `for in` iterable into a flat list of items.
function iterToItems(v: Value): Value[] {
  if (Array.isArray(v)) return v;
  if (isRange(v)) {
    const out: Value[] = [];
    if (v.step > 0) {
      for (let i = v.start; i < v.end; i += v.step) out.push(i);
    } else if (v.step < 0) {
      for (let i = v.start; i > v.end; i += v.step) out.push(i);
    }
    return out;
  }
  if (typeof v === "string") {
    return Array.from(v) as Value[];
  }
  if (v instanceof Map) {
    return Array.from(v.keys());
  }
  throw new PanicSignal(`cannot iterate over ${typeof v}`);
}

// Convert a Lambda Expr into a FnDecl so the closure-calling code path is
// shared. The synthesized FnDecl has the lambda's params, no name, and a
// body whose single stmt is the lambda's body expression.
function lambdaToFnDecl(e: Extract<Expr, { kind: "Lambda" }>): FnDecl {
  const body: Block = {
    kind: "Block",
    loc: e.body.kind === "Block" ? e.body.loc : e.loc,
    stmts: [],
    expr: e.body.kind === "Block" ? null : e.body,
  };
  if (e.body.kind === "Block") {
    body.stmts = (e.body as Block).stmts;
    body.expr = (e.body as Block).expr ?? null;
  }
  return {
    kind: "FnDecl",
    loc: e.loc,
    name: "<lambda>",
    generics: [],
    params: e.params,
    ret: e.ret,
    body,
  };
}

function describeCallee(e: Expr): string {
  if (e.kind === "Ident") return e.name;
  return "<expression>";
}

//----------------------------------------------------------------------------
// Public entry point
//----------------------------------------------------------------------------

export function run(program: Program, opts: RunOptions = {}): RunResult {
  const ev = new Evaluator(opts);
  return ev.run(program);
}
