/**
 * aether/tools/linter/linter.ts
 * ==============================
 * Static analysis linter for the Aether language with 30 configurable
 * rules across four categories: correctness, style, performance,
 * complexity.
 *
 * Each rule is a pure function `(ast: Program, source: string) =>
 * RawDiagnostic[]`.  Rules emit diagnostics tagged with their rule name
 * and a default severity; the user can override the severity per rule
 * via `LintOptions.rules` (set to `'off'` to disable).
 *
 * Public API
 * ----------
 *   lint(source, opts?)         -> LintDiagnostic[]
 *   lintFile(path, opts?)       -> LintDiagnostic[]
 *   DEFAULT_RULES: Record<string, Severity>
 *
 * Categories (30 rules total)
 * ---------------------------
 *   Correctness  (10): no-shadow, no-unused-var, no-unused-import,
 *                       no-unreachable, no-empty-match, match-not-exhaustive,
 *                       no-panic-in-fn, no-duplicate-def,
 *                       no-compare-float-eq, no-mut-reassign
 *   Style        (10): no-trailing-whitespace, no-mixed-indent,
 *                       prefer-const, naming-snake, naming-pascal,
 *                       naming-screaming, no-single-match,
 *                       prefer-interpolation, no-deep-nesting,
 *                       line-too-long
 *   Performance  (5):  no-string-concat-in-loop, no-array-growth-in-loop,
 *                       prefer-range, no-recursive-fib,
 *                       no-redundant-len-check
 *   Complexity   (5):  cognitive-complexity, too-many-params,
 *                       too-many-arms, deep-pattern-nesting, long-function
 */
import { readFileSync } from "fs";
import { lex } from "../../core/lexer/lexer";
import { parse } from "../../core/parser/parser";
import { walk } from "../../core/ast/visitor";
import type {
  Program, Node, Expr, Stmt, Pattern, TypeNode,
  SourceLocation, Block, FnDecl, Match, MatchArm, Param, Call,
} from "../../core/ast/ast";

//-----------------------------------------------------------------------------
// Public types
//-----------------------------------------------------------------------------
export type Severity = "error" | "warning" | "info";

export interface LintDiagnostic {
  rule: string;
  severity: Severity;
  message: string;
  /** 1-based line of the diagnostic's primary location. */
  line: number;
  /** 1-based column of the diagnostic's primary location. */
  col: number;
  /** Full source location (kept for tooling that wants the span). */
  loc: SourceLocation;
  /** Optional suggested fix as a string. */
  fix?: string;
}

export interface LintOptions {
  /** Per-rule severity override.  Use `'off'` to disable a rule. */
  rules?: Record<string, Severity | "off">;
}

/** Default severity for every rule. */
export const DEFAULT_RULES: Record<string, Severity> = {};

//-----------------------------------------------------------------------------
// Rule registry
//-----------------------------------------------------------------------------
interface RawDiagnostic {
  message: string;
  loc: SourceLocation;
  fix?: string;
}
type RuleFn = (ast: Program, source: string) => RawDiagnostic[];
interface Rule {
  name: string;
  severity: Severity;
  fn: RuleFn;
}

const RULES: Rule[] = [];

function rule(name: string, severity: Severity, fn: RuleFn): void {
  RULES.push({ name, severity, fn });
  DEFAULT_RULES[name] = severity;
}

//-----------------------------------------------------------------------------
// Public entry points
//-----------------------------------------------------------------------------
export function lint(source: string, opts?: LintOptions): LintDiagnostic[] {
  const tokens = lex(source, "<linter>");
  const { program } = parse(tokens, "<linter>");
  return lintProgram(program, source, opts);
}

export function lintFile(path: string, opts?: LintOptions): LintDiagnostic[] {
  return lint(readFileSync(path, "utf8"), opts);
}

/** Lower-level entry point: lint a pre-parsed program.  Useful for tests. */
export function lintProgram(program: Program, source: string, opts?: LintOptions): LintDiagnostic[] {
  const overrides = opts?.rules ?? {};
  const out: LintDiagnostic[] = [];
  for (const r of RULES) {
    const sev = overrides[r.name] ?? r.severity;
    if (sev === "off") continue;
    const diags = r.fn(program, source);
    for (const d of diags) {
      out.push({
        rule: r.name,
        severity: sev as Severity,
        message: d.message,
        line: d.loc.start.line,
        col: d.loc.start.col,
        loc: d.loc,
        fix: d.fix,
      });
    }
  }
  return out;
}

//-----------------------------------------------------------------------------
// Scope analysis (shared by no-shadow, no-unused-var, no-mut-reassign,
// prefer-const).  A single pass over the AST that records every binding
// with its kind, location, enclosing scope chain, and usage count.
//-----------------------------------------------------------------------------
interface Binding {
  name: string;
  kind: "let" | "mut" | "const" | "param" | "fn" | "loop-var" | "match-bind" | "type" | "enum" | "struct" | "import";
  loc: SourceLocation;
  used: number;
  reassigned: number;
  /** True if the binding is `let mut` or `param mut` etc. */
  mutable: boolean;
}

interface Scope {
  bindings: Map<string, Binding>;
  parent: Scope | null;
}

function analyzeScopes(program: Program): Binding[] {
  const root: Scope = { bindings: new Map(), parent: null };
  const allBindings: Binding[] = [];
  let current: Scope = root;

  function pushScope(): void { current = { bindings: new Map(), parent: current }; }
  function popScope(): void { if (current.parent) current = current.parent; }

  function addBinding(b: Binding): void {
    current.bindings.set(b.name, b);
    allBindings.push(b);
  }

  function lookup(name: string): Binding | null {
    let s: Scope | null = current;
    while (s) {
      const b = s.bindings.get(name);
      if (b) return b;
      s = s.parent;
    }
    return null;
  }

  function lookupInOuter(name: string): Binding | null {
    let s: Scope | null = current.parent;
    while (s) {
      const b = s.bindings.get(name);
      if (b) return b;
      s = s.parent;
    }
    return null;
  }

  function visitExpr(e: Expr): void {
    if (!e) return;
    switch (e.kind) {
      case "Ident": {
        const b = lookup(e.name);
        if (b) b.used++;
        return;
      }
      case "Binary":
        visitExpr(e.left);
        visitExpr(e.right);
        return;
      case "Unary":
        visitExpr(e.operand);
        return;
      case "Assign":
        visitExpr(e.target);
        visitExpr(e.value);
        // Mark target as reassigned if it's an Ident.
        if (e.target.kind === "Ident") {
          const b = lookup(e.target.name);
          if (b) b.reassigned++;
        }
        return;
      case "CompoundAssign":
        visitExpr(e.target);
        visitExpr(e.value);
        if (e.target.kind === "Ident") {
          const b = lookup(e.target.name);
          if (b) { b.used++; b.reassigned++; }
        }
        return;
      case "Call":
        visitExpr(e.callee);
        for (const a of e.args) visitExpr(a);
        return;
      case "MethodCall":
        visitExpr(e.object);
        for (const a of e.args) visitExpr(a);
        return;
      case "Index":
        visitExpr(e.object);
        visitExpr(e.index);
        return;
      case "Field":
        visitExpr(e.object);
        return;
      case "TupleField":
        visitExpr(e.object);
        return;
      case "TupleExpr":
        for (const el of e.elements) visitExpr(el);
        return;
      case "ArrayExpr":
        for (const el of e.elements) visitExpr(el);
        return;
      case "MapExpr":
        for (const en of e.entries) { visitExpr(en.key); visitExpr(en.value); }
        return;
      case "StructExpr":
        for (const f of e.fields) visitExpr(f.value);
        if (e.spread) visitExpr(e.spread);
        return;
      case "EnumVariant":
        for (const a of e.args) visitExpr(a);
        return;
      case "Lambda":
        pushScope();
        for (const p of e.params) addBinding({ name: p.name, kind: "param", loc: p.loc, used: 0, reassigned: 0, mutable: false });
        if (e.ret) visitType(e.ret);
        visitExpr(e.body);
        popScope();
        return;
      case "If":
        visitExpr(e.cond);
        visitExpr(e.then);
        if (e.else) visitExpr(e.else);
        return;
      case "Match":
        visitExpr(e.scrutinee);
        for (const arm of e.arms) visitMatchArm(arm);
        return;
      case "Block":
        pushScope();
        for (const s of e.stmts) visitStmt(s);
        if (e.expr) visitExpr(e.expr);
        popScope();
        return;
      case "Paren":
        visitExpr(e.expr);
        return;
      case "Cast": case "As":
        visitExpr(e.expr);
        visitType(e.type);
        return;
      case "Range":
        visitExpr(e.start);
        visitExpr(e.end);
        return;
      case "ErrorProp":
        visitExpr(e.expr);
        return;
      case "Spread":
        visitExpr(e.expr);
        return;
      case "Return":
        if (e.expr) visitExpr(e.expr);
        return;
      case "SelfExpr": case "IntLit": case "FloatLit":
      case "BoolLit": case "CharLit": case "UnitLit": case "StringLit":
        return;
    }
  }

  function visitMatchArm(arm: MatchArm): void {
    pushScope();
    visitPattern(arm.pattern);
    if (arm.guard) visitExpr(arm.guard);
    visitExpr(arm.body);
    popScope();
  }

  function visitPattern(p: Pattern): void {
    switch (p.kind) {
      case "WildcardPat": return;
      case "BindPat":
        addBinding({ name: p.name, kind: "match-bind", loc: p.loc, used: 0, reassigned: 0, mutable: !!p.mut });
        return;
      case "LitPat":
        if (p.value) visitExpr(p.value);
        return;
      case "TuplePat":
        for (const sub of p.elements) visitPattern(sub);
        return;
      case "ArrayPat":
        for (const sub of p.elements) visitPattern(sub);
        return;
      case "StructPat":
        for (const f of p.fields) visitPattern(f.pattern);
        return;
      case "EnumPat":
        for (const sub of p.subpatterns) visitPattern(sub);
        return;
      case "OrPat":
        for (const sub of p.patterns) visitPattern(sub);
        return;
      case "RestPat": return;
    }
  }

  function visitType(t: TypeNode): void {
    if (!t) return;
    switch (t.kind) {
      case "ArrayType": visitType(t.elem); return;
      case "MapType": visitType(t.key); visitType(t.value); return;
      case "OptionType": visitType(t.inner); return;
      case "ResultType": visitType(t.ok); visitType(t.err); return;
      case "TupleType": for (const sub of t.types) visitType(sub); return;
      case "FuncType": for (const sub of t.params) visitType(sub); visitType(t.ret); return;
      case "GenericType": for (const sub of t.args) visitType(sub); return;
      case "NamedType": case "PrimitiveType": case "UnitType": return;
    }
  }

  function visitStmt(s: Stmt): void {
    switch (s.kind) {
      case "Let":
        addBinding({ name: s.name, kind: "let", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        if (s.type) visitType(s.type);
        visitExpr(s.init);
        return;
      case "MutLet":
        addBinding({ name: s.name, kind: "mut", loc: s.loc, used: 0, reassigned: 0, mutable: true });
        if (s.type) visitType(s.type);
        visitExpr(s.init);
        return;
      case "Const":
        addBinding({ name: s.name, kind: "const", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        if (s.type) visitType(s.type);
        visitExpr(s.init);
        return;
      case "ExprStmt":
        visitExpr(s.expr);
        return;
      case "FnDecl": {
        addBinding({ name: s.name, kind: "fn", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        pushScope();
        for (const p of s.params) addBinding({ name: p.name, kind: "param", loc: p.loc, used: 0, reassigned: 0, mutable: false });
        if (s.ret) visitType(s.ret);
        // FnDecl body is a Block — but we don't want to push a second scope.
        // Visit its stmts + trailing expr directly.
        for (const st of s.body.stmts) visitStmt(st);
        if (s.body.expr) visitExpr(s.body.expr);
        popScope();
        return;
      }
      case "EnumDecl":
        addBinding({ name: s.name, kind: "enum", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        return;
      case "StructDecl":
        addBinding({ name: s.name, kind: "struct", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        return;
      case "TypeAlias":
        addBinding({ name: s.name, kind: "type", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        if (s.type) visitType(s.type);
        return;
      case "Return":
        if (s.expr) visitExpr(s.expr);
        return;
      case "Break": case "Continue": return;
      case "While":
        visitExpr(s.cond);
        pushScope();
        for (const st of s.body.stmts) visitStmt(st);
        if (s.body.expr) visitExpr(s.body.expr);
        popScope();
        return;
      case "ForIn":
        addBinding({ name: s.varName, kind: "loop-var", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        visitExpr(s.iterable);
        pushScope();
        for (const st of s.body.stmts) visitStmt(st);
        if (s.body.expr) visitExpr(s.body.expr);
        popScope();
        return;
      case "Import":
        for (const n of s.names) addBinding({ name: n, kind: "import", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        return;
      case "Print":
        visitExpr(s.expr);
        return;
      case "AssignStmt":
        visitExpr(s.target);
        visitExpr(s.value);
        if (s.target.kind === "Ident") {
          const b = lookup(s.target.name);
          if (b) b.reassigned++;
        }
        return;
      case "BlockStmt":
        pushScope();
        for (const st of s.body) visitStmt(st);
        popScope();
        return;
    }
  }

  for (const s of program.body) visitStmt(s);
  return allBindings;
}

/** Detect whether a binding shadows an outer binding. Returns the
 *  shadowing bindings (with a reference to the shadowed binding's loc
 *  for the message). */
function detectShadowing(program: Program): Array<{ binding: Binding; shadowed: Binding }> {
  // Re-walk with shadow detection.  We can't just use analyzeScopes
  // because it doesn't track outer bindings at the point of definition.
  const root: Scope = { bindings: new Map(), parent: null };
  const out: Array<{ binding: Binding; shadowed: Binding }> = [];
  let current: Scope = root;

  function pushScope(): void { current = { bindings: new Map(), parent: current }; }
  function popScope(): void { if (current.parent) current = current.parent; }

  function addBinding(b: Binding): void {
    // Look up the name in OUTER scopes only (same-scope redefinition is
    // not shadowing — it's a separate error).
    let s: Scope | null = current.parent;
    while (s) {
      const existing = s.bindings.get(b.name);
      if (existing) {
        out.push({ binding: b, shadowed: existing });
        break;
      }
      s = s.parent;
    }
    current.bindings.set(b.name, b);
  }

  function visitExpr(e: Expr): void {
    if (!e) return;
    switch (e.kind) {
      case "Lambda":
        pushScope();
        for (const p of e.params) addBinding({ name: p.name, kind: "param", loc: p.loc, used: 0, reassigned: 0, mutable: false });
        if (e.ret) {} // skip types
        visitExpr(e.body);
        popScope();
        return;
      case "If":
        visitExpr(e.cond);
        visitExpr(e.then);
        if (e.else) visitExpr(e.else);
        return;
      case "Match":
        visitExpr(e.scrutinee);
        for (const arm of e.arms) {
          pushScope();
          visitPattern(arm.pattern);
          if (arm.guard) visitExpr(arm.guard);
          visitExpr(arm.body);
          popScope();
        }
        return;
      case "Block":
        pushScope();
        for (const s of e.stmts) visitStmt(s);
        if (e.expr) visitExpr(e.expr);
        popScope();
        return;
      case "Binary": visitExpr(e.left); visitExpr(e.right); return;
      case "Unary": visitExpr(e.operand); return;
      case "Assign": visitExpr(e.target); visitExpr(e.value); return;
      case "CompoundAssign": visitExpr(e.target); visitExpr(e.value); return;
      case "Call": visitExpr(e.callee); for (const a of e.args) visitExpr(a); return;
      case "MethodCall": visitExpr(e.object); for (const a of e.args) visitExpr(a); return;
      case "Index": visitExpr(e.object); visitExpr(e.index); return;
      case "Field": visitExpr(e.object); return;
      case "TupleField": visitExpr(e.object); return;
      case "TupleExpr": for (const el of e.elements) visitExpr(el); return;
      case "ArrayExpr": for (const el of e.elements) visitExpr(el); return;
      case "MapExpr": for (const en of e.entries) { visitExpr(en.key); visitExpr(en.value); } return;
      case "StructExpr": for (const f of e.fields) visitExpr(f.value); if (e.spread) visitExpr(e.spread); return;
      case "EnumVariant": for (const a of e.args) visitExpr(a); return;
      case "Paren": visitExpr(e.expr); return;
      case "Cast": case "As": visitExpr(e.expr); return;
      case "Range": visitExpr(e.start); visitExpr(e.end); return;
      case "ErrorProp": visitExpr(e.expr); return;
      case "Spread": visitExpr(e.expr); return;
      case "Return": if (e.expr) visitExpr(e.expr); return;
      case "SelfExpr": case "IntLit": case "FloatLit":
      case "BoolLit": case "CharLit": case "UnitLit": case "StringLit":
      case "Ident": return;
    }
  }

  function visitPattern(p: Pattern): void {
    if (!p) return;
    switch (p.kind) {
      case "BindPat":
        addBinding({ name: p.name, kind: "match-bind", loc: p.loc, used: 0, reassigned: 0, mutable: !!p.mut });
        return;
      case "TuplePat": for (const sub of p.elements) visitPattern(sub); return;
      case "ArrayPat": for (const sub of p.elements) visitPattern(sub); return;
      case "StructPat": for (const f of p.fields) visitPattern(f.pattern); return;
      case "EnumPat": for (const sub of p.subpatterns) visitPattern(sub); return;
      case "OrPat": for (const sub of p.patterns) visitPattern(sub); return;
      case "WildcardPat": case "RestPat": case "LitPat": return;
    }
  }

  function visitStmt(s: Stmt): void {
    switch (s.kind) {
      case "Let":
        addBinding({ name: s.name, kind: "let", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        visitExpr(s.init);
        return;
      case "MutLet":
        addBinding({ name: s.name, kind: "mut", loc: s.loc, used: 0, reassigned: 0, mutable: true });
        visitExpr(s.init);
        return;
      case "Const":
        addBinding({ name: s.name, kind: "const", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        visitExpr(s.init);
        return;
      case "FnDecl":
        addBinding({ name: s.name, kind: "fn", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        pushScope();
        for (const p of s.params) addBinding({ name: p.name, kind: "param", loc: p.loc, used: 0, reassigned: 0, mutable: false });
        for (const st of s.body.stmts) visitStmt(st);
        if (s.body.expr) visitExpr(s.body.expr);
        popScope();
        return;
      case "EnumDecl":
        addBinding({ name: s.name, kind: "enum", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        return;
      case "StructDecl":
        addBinding({ name: s.name, kind: "struct", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        return;
      case "TypeAlias":
        addBinding({ name: s.name, kind: "type", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        return;
      case "ExprStmt": visitExpr(s.expr); return;
      case "Return": if (s.expr) visitExpr(s.expr); return;
      case "Break": case "Continue": return;
      case "While":
        visitExpr(s.cond);
        pushScope();
        for (const st of s.body.stmts) visitStmt(st);
        if (s.body.expr) visitExpr(s.body.expr);
        popScope();
        return;
      case "ForIn":
        addBinding({ name: s.varName, kind: "loop-var", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        visitExpr(s.iterable);
        pushScope();
        for (const st of s.body.stmts) visitStmt(st);
        if (s.body.expr) visitExpr(s.body.expr);
        popScope();
        return;
      case "Import":
        for (const n of s.names) addBinding({ name: n, kind: "import", loc: s.loc, used: 0, reassigned: 0, mutable: false });
        return;
      case "Print": visitExpr(s.expr); return;
      case "AssignStmt": visitExpr(s.target); visitExpr(s.value); return;
      case "BlockStmt":
        pushScope();
        for (const st of s.body) visitStmt(st);
        popScope();
        return;
    }
  }

  for (const s of program.body) visitStmt(s);
  return out;
}

//-----------------------------------------------------------------------------
// Generic AST walker that records the parent chain (used by some rules
// that need to know what encloses a node).
//-----------------------------------------------------------------------------
interface WalkEntry {
  node: Node;
  parent: Node | null;
  depth: number;
}

/** A node tagged with its `kind` discriminant — the subset of `Node` that
 *  has a string `kind` field.  `Param`, `TypeParam`, `StructField`,
 *  `MatchArm`, `MapEntry`, `StructExprField`, `StringSegment`, and
 *  `EnumVariantDecl` are filtered out by `kindOf` callers. */
type KindedNode = Node & { kind: string };

function kindOf(node: Node): string | null {
  if ("kind" in node && typeof (node as { kind?: unknown }).kind === "string") {
    // EnumVariantDecl has kind: "unit"|"tuple"|"struct" — exclude.
    const k = (node as { kind: unknown }).kind as string;
    // Heuristic: AST node kinds are CamelCase strings like "FnDecl".
    // EnumVariantDecl kinds are lowercase "unit"/"tuple"/"struct".
    // StringSegment kinds are "text"/"interp".
    if (k === "unit" || k === "tuple" || k === "struct" || k === "text" || k === "interp") return null;
    return k;
  }
  return null;
}

function collectNodes(program: Program): WalkEntry[] {
  const out: WalkEntry[] = [];
  walk(program, {
    enter(node, parent) {
      out.push({ node, parent, depth: 0 });
    },
    leave() {},
  });
  return out;
}

/** Walk with depth tracking.  Returns a flat list of {node, parent, depth}. */
function walkWithDepth(program: Program, visit: (node: KindedNode, parent: Node | null, depth: number) => void): void {
  const stack: Array<{ node: Node; parent: Node | null; entered: boolean; depth: number }> = [
    { node: program, parent: null, entered: false, depth: 0 },
  ];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (!top.entered) {
      top.entered = true;
      const k = kindOf(top.node);
      if (k !== null) visit(top.node as KindedNode, top.parent, top.depth);
      const kids = childrenOf(top.node);
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push({ node: kids[i], parent: top.node, entered: false, depth: top.depth + 1 });
      }
    } else {
      stack.pop();
    }
  }
}

function childrenOf(node: Node): Node[] {
  const out: Node[] = [];
  if (!node || typeof node !== "object" || !("kind" in node)) return out;
  for (const [, v] of Object.entries(node as unknown as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item && typeof item === "object" && "kind" in (item as object)) {
          out.push(item as Node);
        }
      }
    } else if (typeof v === "object" && "kind" in (v as object)) {
      out.push(v as Node);
    }
  }
  return out;
}

/** Convenience walker that only invokes `fn` for nodes with a string
 *  `kind` discriminant (i.e., real AST nodes — not Param, StructField,
 *  MatchArm, etc.). */
function walkKind(root: Node, fn: (node: KindedNode, parent: Node | null) => void): void {
  walk(root, {
    enter(node, parent) {
      if (kindOf(node) !== null) fn(node as KindedNode, parent);
    },
  });
}

//-----------------------------------------------------------------------------
// Source line helpers
//-----------------------------------------------------------------------------
function lineAt(source: string, lineNum: number): string {
  const lines = source.split("\n");
  return lines[lineNum - 1] ?? "";
}

//-----------------------------------------------------------------------------
// CORRECTNESS RULES (10)
//-----------------------------------------------------------------------------

// 1. no-shadow
rule("no-shadow", "warning", (ast) => {
  const shadows = detectShadowing(ast);
  return shadows.map(s => ({
    message: `'${s.binding.name}' shadows an outer binding of the same name (declared at ${s.shadowed.loc.start.line}:${s.shadowed.loc.start.col})`,
    loc: s.binding.loc,
  }));
});

// 2. no-unused-var
rule("no-unused-var", "warning", (ast) => {
  const bindings = analyzeScopes(ast);
  const out: RawDiagnostic[] = [];
  for (const b of bindings) {
    // Intentionally-unused convention: names starting with `_`.
    if (b.name.startsWith("_")) continue;
    // Skip type/enum/struct declarations — those are tested elsewhere.
    if (b.kind === "type" || b.kind === "enum" || b.kind === "struct") continue;
    if (b.used === 0) {
      out.push({
        message: `'${b.name}' is declared but never used (prefix with '_' to silence)`,
        loc: b.loc,
      });
    }
  }
  return out;
});

// 3. no-unused-import
rule("no-unused-import", "warning", (ast) => {
  const out: RawDiagnostic[] = [];
  // Collect all imported names.
  const imports: Array<{ names: string[]; loc: SourceLocation }> = [];
  walkKind(ast, (node) => {
      if (node.kind === "Import") {
        imports.push({ names: (node as Stmt & { kind: "Import" }).names, loc: node.loc });
      }
    });
  if (imports.length === 0) return out;
  // Collect all identifiers used in the program.
  const usedIdents = new Set<string>();
  walkKind(ast, (node) => {
      if (node.kind === "Ident") usedIdents.add((node as Expr & { kind: "Ident" }).name);
      // Also count named types and enum variant names.
      if (node.kind === "NamedType" || node.kind === "GenericType") {
        usedIdents.add((node as TypeNode & { name: string }).name);
      }
      if (node.kind === "EnumVariant" || node.kind === "EnumPat") {
        usedIdents.add((node as { enumName: string }).enumName);
      }
    });
  for (const imp of imports) {
    if (imp.names.length === 0) continue;  // bare import — nothing to check
    for (const n of imp.names) {
      if (!usedIdents.has(n)) {
        out.push({
          message: `imported name '${n}' is never used`,
          loc: imp.loc,
        });
      }
    }
  }
  return out;
});

// 4. no-unreachable
rule("no-unreachable", "error", (ast) => {
  const out: RawDiagnostic[] = [];
  walkKind(ast, (node) => {
      if (node.kind !== "Block" && node.kind !== "BlockStmt") return;
      const stmts = (node as { stmts: Stmt[] }).stmts;
      for (let i = 0; i < stmts.length; i++) {
        const s = stmts[i];
        if (s.kind === "Return" || s.kind === "Break" || s.kind === "Continue") {
          // Anything after this is unreachable.
          for (let j = i + 1; j < stmts.length; j++) {
            out.push({
              message: `unreachable code after '${s.kind.toLowerCase()}'`,
              loc: stmts[j].loc,
            });
          }
          break;
        }
      }
    });
  return out;
});

// 5. no-empty-match
rule("no-empty-match", "error", (ast) => {
  const out: RawDiagnostic[] = [];
  walkKind(ast, (node) => {
      if (node.kind === "Match" && (node as Match).arms.length === 0) {
        out.push({
          message: "match has no arms — it can never produce a value",
          loc: node.loc,
        });
      }
    });
  return out;
});

// 6. match-not-exhaustive
rule("match-not-exhaustive", "warning", (ast) => {
  const out: RawDiagnostic[] = [];
  walkKind(ast, (node) => {
      if (node.kind !== "Match") return;
      const m = node as Match;
      if (m.arms.length === 0) return;  // handled by no-empty-match
      // Check for a wildcard / rest / `_` arm.
      const hasWildcard = m.arms.some(a =>
        a.pattern.kind === "WildcardPat" ||
        a.pattern.kind === "RestPat" ||
        (a.pattern.kind === "BindPat" && a.pattern.name === "_") ||
        (a.pattern.kind === "OrPat" && a.pattern.patterns.some(p =>
          p.kind === "WildcardPat" || p.kind === "RestPat" ||
          (p.kind === "BindPat" && p.name === "_")
        ))
      );
      if (!hasWildcard) {
        out.push({
          message: "match is not exhaustive — consider adding a `_` wildcard arm",
          loc: m.loc,
        });
      }
    });
  return out;
});

// 7. no-panic-in-fn
rule("no-panic-in-fn", "warning", (ast) => {
  const out: RawDiagnostic[] = [];
  walkKind(ast, (node) => {
      if (node.kind !== "Call") return;
      const c = node as Expr & { kind: "Call" };
      if (c.callee.kind === "Ident" && c.callee.name === "panic") {
        out.push({
          message: "panic() aborts the program — prefer Result<T, E> for recoverable errors",
          loc: node.loc,
        });
      }
    });
  return out;
});

// 8. no-duplicate-def
rule("no-duplicate-def", "error", (ast) => {
  const out: RawDiagnostic[] = [];
  // Detect two top-level (or same-scope) declarations that introduce the
  // same name: `fn`, `struct`, `enum`, `type`, `const`, top-level `let`,
  // and `import { a, b }` where `a` or `b` collide with a prior binding.
  // We use a small scope walker so that nested blocks are also checked.
  interface Entry { name: string; kind: string; loc: SourceLocation; }
  const stack: Array<Map<string, Entry>> = [new Map()];
  function push(): void { stack.push(new Map()); }
  function pop(): void { stack.pop(); }
  function declare(name: string, kind: string, loc: SourceLocation): void {
    const top = stack[stack.length - 1];
    const prev = top.get(name);
    if (prev) {
      out.push({
        message: `'${name}' is already declared in this scope (previous declaration at ${prev.loc.start.line}:${prev.loc.start.col})`,
        loc,
      });
    } else {
      top.set(name, { name, kind, loc });
    }
  }
  function visitStmts(stmts: Stmt[]): void {
    for (const s of stmts) {
      switch (s.kind) {
        case "Let": case "MutLet": declare(s.name, s.kind, s.loc); break;
        case "Const": declare(s.name, "const", s.loc); break;
        case "FnDecl": declare(s.name, "fn", s.loc); push(); visitStmts(s.body.stmts); pop(); break;
        case "EnumDecl": declare(s.name, "enum", s.loc); break;
        case "StructDecl": declare(s.name, "struct", s.loc); break;
        case "TypeAlias": declare(s.name, "type", s.loc); break;
        case "Import":
          for (const n of s.names) declare(n, "import", s.loc);
          break;
        case "While": push(); visitStmts(s.body.stmts); pop(); break;
        case "ForIn": declare(s.varName, "for", s.loc); push(); visitStmts(s.body.stmts); pop(); break;
        case "BlockStmt": push(); visitStmts(s.body); pop(); break;
        default: break;
      }
    }
  }
  visitStmts(ast.body);
  return out;
});

// 9. no-compare-float-eq
rule("no-compare-float-eq", "warning", (ast) => {
  const out: RawDiagnostic[] = [];
  walkKind(ast, (node) => {
      if (node.kind !== "Binary") return;
      const b = node as Expr & { kind: "Binary"; op: string; left: Expr; right: Expr };
      if (b.op !== "==" && b.op !== "!=") return;
      // Heuristic: a FloatLit on either side.
      if (b.left.kind === "FloatLit" || b.right.kind === "FloatLit") {
        out.push({
          message: `direct float comparison with '${b.op}' — use an epsilon tolerance (abs(a - b) < EPS) instead`,
          loc: node.loc,
        });
      }
    });
  return out;
});

// 10. no-mut-reassign
rule("no-mut-reassign", "error", (ast) => {
  const out: RawDiagnostic[] = [];
  const bindings = analyzeScopes(ast);
  // Build a map of (name, loc) -> binding.
  // We need to detect AssignStmt/Assign where the target is an Ident whose
  // binding is not mutable.
  for (const b of bindings) {
    if (b.kind === "let" || b.kind === "const" || b.kind === "loop-var" || b.kind === "match-bind" || b.kind === "param") {
      if (b.reassigned > 0 && !b.mutable) {
        out.push({
          message: `'${b.name}' is reassigned but was not declared 'mut' — add 'mut' to the binding`,
          loc: b.loc,
        });
      }
    }
  }
  return out;
});

//-----------------------------------------------------------------------------
// STYLE RULES (10)
//-----------------------------------------------------------------------------

// 11. no-trailing-whitespace
rule("no-trailing-whitespace", "info", (_ast, source) => {
  const out: RawDiagnostic[] = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;
    const m = line.match(/[ \t]+$/);
    if (m) {
      const lineNum = i + 1;
      const col = line.length - m[0].length + 1;
      out.push({
        message: `trailing whitespace (${m[0].length} chars)`,
        loc: { file: "<linter>", start: { line: lineNum, col, offset: 0 }, end: { line: lineNum, col: line.length + 1, offset: 0 } },
      });
    }
  }
  return out;
});

// 12. no-mixed-indent
rule("no-mixed-indent", "warning", (_ast, source) => {
  const out: RawDiagnostic[] = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.match(/^[ \t]*/)?.[0] ?? "";
    if (indent.includes(" ") && indent.includes("\t")) {
      out.push({
        message: "line mixes spaces and tabs in its leading indent — pick one (spaces recommended)",
        loc: { file: "<linter>", start: { line: i + 1, col: 1, offset: 0 }, end: { line: i + 1, col: indent.length + 1, offset: 0 } },
      });
    }
  }
  return out;
});

// 13. prefer-const
rule("prefer-const", "info", (ast) => {
  const out: RawDiagnostic[] = [];
  const bindings = analyzeScopes(ast);
  for (const b of bindings) {
    if (b.kind === "let" && b.reassigned === 0 && !b.name.startsWith("_")) {
      out.push({
        message: `'${b.name}' is declared 'let' but never reassigned — prefer 'const' (or 'let mut' if mutation is intended)`,
        loc: b.loc,
      });
    }
  }
  return out;
});

// 14. naming-snake
rule("naming-snake", "warning", (ast) => {
  const out: RawDiagnostic[] = [];
  const snakeRe = /^[a-z_][a-z0-9_]*$/;
  const bindings = analyzeScopes(ast);
  for (const b of bindings) {
    // Apply to variables (let, mut, const, param, loop-var, match-bind).
    if (b.kind === "let" || b.kind === "mut" || b.kind === "param" || b.kind === "loop-var" || b.kind === "match-bind") {
      if (b.name === "_" || b.name.startsWith("_")) continue;
      if (!snakeRe.test(b.name)) {
        out.push({
          message: `'${b.name}' is not snake_case — use lowercase letters, digits, and underscores`,
          loc: b.loc,
        });
      }
    }
  }
  // Also fn names.
  walkKind(ast, (node) => {
      if (node.kind === "FnDecl") {
        const f = node as FnDecl;
        if (!snakeRe.test(f.name)) {
          out.push({
            message: `function '${f.name}' is not snake_case`,
            loc: f.loc,
          });
        }
      }
    });
  return out;
});

// 15. naming-pascal
rule("naming-pascal", "warning", (ast) => {
  const out: RawDiagnostic[] = [];
  const pascalRe = /^[A-Z][A-Za-z0-9_]*$/;
  walkKind(ast, (node) => {
      if (node.kind === "EnumDecl" || node.kind === "StructDecl" || node.kind === "TypeAlias") {
        const decl = node as { name: string; loc: SourceLocation };
        if (!pascalRe.test(decl.name)) {
          out.push({
            message: `type '${decl.name}' is not PascalCase — start with an uppercase letter`,
            loc: decl.loc,
          });
        }
      }
      if (node.kind === "EnumDecl") {
        const e = node as Stmt & { kind: "EnumDecl"; variants: { name: string; loc: SourceLocation }[] };
        for (const v of e.variants) {
          if (!pascalRe.test(v.name)) {
            out.push({
              message: `enum variant '${v.name}' is not PascalCase`,
              loc: v.loc,
            });
          }
        }
      }
    });
  return out;
});

// 16. naming-screaming
rule("naming-screaming", "info", (ast) => {
  const out: RawDiagnostic[] = [];
  const screamingRe = /^[A-Z][A-Z0-9_]*$/;
  const bindings = analyzeScopes(ast);
  for (const b of bindings) {
    if (b.kind === "const") {
      if (!screamingRe.test(b.name)) {
        out.push({
          message: `const '${b.name}' is not SCREAMING_SNAKE_CASE — uppercase the name to signal a constant`,
          loc: b.loc,
        });
      }
    }
  }
  return out;
});

// 17. no-single-match
rule("no-single-match", "info", (ast) => {
  const out: RawDiagnostic[] = [];
  walkKind(ast, (node) => {
      if (node.kind !== "Match") return;
      const m = node as Match;
      if (m.arms.length === 1) {
        out.push({
          message: "match has a single arm — consider using 'if' with a pattern destructuring binding instead",
          loc: m.loc,
        });
      }
    });
  return out;
});

// 18. prefer-interpolation
rule("prefer-interpolation", "info", (ast) => {
  const out: RawDiagnostic[] = [];
  walkKind(ast, (node) => {
      if (node.kind !== "Binary") return;
      const b = node as Expr & { kind: "Binary"; op: string; left: Expr; right: Expr };
      if (b.op !== "+") return;
      // Heuristic: at least one side is a StringLit and the other is
      // something that could be interpolated (Ident, Call, Field, etc.).
      const isStr = (e: Expr): boolean => e.kind === "StringLit";
      const isInterpable = (e: Expr): boolean =>
        e.kind === "Ident" || e.kind === "Call" || e.kind === "MethodCall" ||
        e.kind === "Field" || e.kind === "Index" || e.kind === "TupleField";
      if (isStr(b.left) && isInterpable(b.right)) {
        out.push({
          message: "string concatenation — consider using an f-string: f\"...{expr}\"",
          loc: b.loc,
        });
      } else if (isStr(b.right) && isInterpable(b.left)) {
        out.push({
          message: "string concatenation — consider using an f-string: f\"{expr}...\"",
          loc: b.loc,
        });
      }
    });
  return out;
});

// 19. no-deep-nesting
rule("no-deep-nesting", "warning", (ast) => {
  const out: RawDiagnostic[] = [];
  const MAX = 4;
  walkWithDepth(ast, (node, _parent, depth) => {
    // Count only nesting-introducing nodes.
    if (node.kind === "Block" || node.kind === "If" || node.kind === "While" ||
        node.kind === "ForIn" || node.kind === "Match" || node.kind === "Lambda") {
      if (depth > MAX) {
        out.push({
          message: `nesting depth ${depth} exceeds the recommended maximum of ${MAX} — extract a helper`,
          loc: node.loc,
        });
      }
    }
  });
  return out;
});

// 20. line-too-long
rule("line-too-long", "info", (_ast, source) => {
  const out: RawDiagnostic[] = [];
  const MAX = 100;
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > MAX) {
      out.push({
        message: `line is ${lines[i].length} chars long (max ${MAX}) — consider wrapping`,
        loc: { file: "<linter>", start: { line: i + 1, col: MAX + 1, offset: 0 }, end: { line: i + 1, col: lines[i].length + 1, offset: 0 } },
      });
    }
  }
  return out;
});

//-----------------------------------------------------------------------------
// PERFORMANCE RULES (5)
//-----------------------------------------------------------------------------

// 21. no-string-concat-in-loop
rule("no-string-concat-in-loop", "warning", (ast) => {
  const out: RawDiagnostic[] = [];
  // Find While / ForIn bodies, then look for `s = s + ...` or `s += ...`
  // patterns where the target is a string-building accumulator.
  walkKind(ast, (node) => {
      if (node.kind !== "While" && node.kind !== "ForIn") return;
      const body = (node as { body: Block }).body;
      walkKind({ kind: "Block", loc: node.loc, stmts: body.stmts, expr: body.expr } as Node, (inner) => {
          // `s = s + expr` or `s += expr`
          if (inner.kind === "AssignStmt") {
            const a = inner as Stmt & { kind: "AssignStmt"; target: Expr; value: Expr };
            // Compound assign: target is assigned with op=
            if (a.value.kind === "CompoundAssign" && a.value.op === "+") {
              out.push({
                message: "string concat with `+=` inside a loop is O(n²) — consider a string builder or join()",
                loc: inner.loc,
              });
            }
            // Plain assign with right side Binary +
            if (a.value.kind === "Binary" && a.value.op === "+" &&
                a.target.kind === "Ident" && a.value.left.kind === "Ident" &&
                (a.target as Expr & { kind: "Ident" }).name === (a.value.left as Expr & { kind: "Ident" }).name) {
              out.push({
                message: "string concat inside a loop is O(n²) — consider a string builder or join()",
                loc: inner.loc,
              });
            }
          }
        });
    });
  return out;
});

// 22. no-array-growth-in-loop
rule("no-array-growth-in-loop", "warning", (ast) => {
  const out: RawDiagnostic[] = [];
  walkKind(ast, (node) => {
      if (node.kind !== "While" && node.kind !== "ForIn") return;
      const body = (node as { body: Block }).body;
      walkKind({ kind: "Block", loc: node.loc, stmts: body.stmts, expr: body.expr } as Node, (inner) => {
          if (inner.kind === "ExprStmt") {
            const e = (inner as Stmt & { kind: "ExprStmt"; expr: Expr }).expr;
            if (e.kind === "Call" && e.callee.kind === "Ident" && e.callee.name === "push") {
              out.push({
                message: "push() inside a loop — if the size is known, preallocate the array for better performance",
                loc: inner.loc,
              });
            }
            if (e.kind === "MethodCall" && e.name === "push") {
              out.push({
                message: "push() inside a loop — if the size is known, preallocate the array for better performance",
                loc: inner.loc,
              });
            }
          }
          if (inner.kind === "AssignStmt") {
            const a = inner as Stmt & { kind: "AssignStmt"; target: Expr; value: Expr };
            if (a.target.kind === "Call" && a.target.callee.kind === "Ident" && a.target.callee.name === "push") {
              out.push({
                message: "push() inside a loop — if the size is known, preallocate the array for better performance",
                loc: inner.loc,
              });
            }
          }
        });
    });
  return out;
});

// 23. prefer-range
rule("prefer-range", "info", (ast) => {
  const out: RawDiagnostic[] = [];
  // Heuristic: detect `while i < N { ...; i = i + 1; }` patterns.
  walkKind(ast, (node) => {
      if (node.kind !== "While") return;
      const w = node as Stmt & { kind: "While"; cond: Expr; body: Block };
      // Cond must be `i < N` (Ident < something).
      if (w.cond.kind !== "Binary" || w.cond.op !== "<") return;
      if (w.cond.left.kind !== "Ident") return;
      const counterName = w.cond.left.name;
      // Body must contain `i = i + 1` or `i += 1`.
      let increments = false;
      for (const s of w.body.stmts) {
        if (s.kind === "AssignStmt") {
          const a = s as Stmt & { kind: "AssignStmt"; target: Expr; value: Expr };
          if (a.target.kind === "Ident" && a.target.name === counterName) {
            if (a.value.kind === "CompoundAssign" && a.value.op === "+") increments = true;
            if (a.value.kind === "Binary" && a.value.op === "+" &&
                a.value.left.kind === "Ident" && a.value.left.name === counterName &&
                a.value.right.kind === "IntLit" && a.value.right.value === 1) increments = true;
          }
        }
      }
      if (increments) {
        out.push({
          message: `while loop with counter '${counterName}' — consider using 'for ${counterName} in range(0, N)' for clarity`,
          loc: w.loc,
          fix: `for ${counterName} in range(0, ...) { ... }`,
        });
      }
    });
  return out;
});

// 24. no-recursive-fib
rule("no-recursive-fib", "warning", (ast) => {
  const out: RawDiagnostic[] = [];
  walkKind(ast, (node) => {
      if (node.kind !== "FnDecl") return;
      const f = node as FnDecl;
      // Match the typical naive fib pattern: function name starts with
      // "fib" and the body has 2+ recursive calls to itself.
      if (!/^fib/i.test(f.name)) return;
      let selfCalls = 0;
      walkKind(f, (inner) => {
          if (inner.kind === "Call") {
            const c = inner as Call;
            if (c.callee.kind === "Ident" && c.callee.name === f.name) {
              selfCalls++;
            }
          }
        });
      if (selfCalls >= 2) {
        out.push({
          message: `function '${f.name}' has ${selfCalls} recursive self-calls — naive Fibonacci is O(2^n); use memoization or an iterative version`,
          loc: f.loc,
        });
      }
    });
  return out;
});

// 25. no-redundant-len-check
rule("no-redundant-len-check", "info", (ast) => {
  const out: RawDiagnostic[] = [];
  walkKind(ast, (node) => {
      if (node.kind !== "Binary") return;
      const b = node as Expr & { kind: "Binary"; op: string; left: Expr; right: Expr };
      // Detect `len(x) == 0` or `len(x) != 0` or `len(x) < 1`.
      const isLenCall = (e: Expr): boolean =>
        e.kind === "Call" && e.callee.kind === "Ident" && e.callee.name === "len" && e.args.length === 1;
      const isZero = (e: Expr): boolean => e.kind === "IntLit" && e.value === 0;
      const isOne = (e: Expr): boolean => e.kind === "IntLit" && e.value === 1;
      if ((b.op === "==" || b.op === "!=") && ((isLenCall(b.left) && isZero(b.right)) || (isLenCall(b.right) && isZero(b.left)))) {
        out.push({
          message: `comparing len(x) to 0 — semantically fine, but the explicit length check is slightly redundant; consider documenting intent`,
          loc: b.loc,
        });
      }
      if (b.op === "<" && isLenCall(b.left) && isOne(b.right)) {
        out.push({
          message: "len(x) < 1 is equivalent to len(x) == 0 — prefer the equality form",
          loc: b.loc,
        });
      }
    });
  return out;
});

//-----------------------------------------------------------------------------
// COMPLEXITY RULES (5)
//-----------------------------------------------------------------------------

// 26. cognitive-complexity
rule("cognitive-complexity", "warning", (ast) => {
  const out: RawDiagnostic[] = [];
  const THRESHOLD = 15;
  walkKind(ast, (node) => {
      if (node.kind !== "FnDecl") return;
      const f = node as FnDecl;
      let score = 0;
      let depth = 0;
      function visit(e: Node): void {
        if (!e || typeof e !== "object" || !("kind" in e)) return;
        switch (e.kind) {
          case "If":
            score += 1 + depth;
            depth++;
            break;
          case "While": case "ForIn":
            score += 1 + depth;
            depth++;
            break;
          case "Match":
            score += 1 + depth;
            depth++;
            break;
          case "Lambda":
            // Lambdas don't increase complexity themselves but their
            // bodies do.
            break;
        }
        for (const child of childrenOf(e)) visit(child);
        switch (e.kind) {
          case "If": case "While": case "ForIn": case "Match":
            depth--;
            break;
        }
      }
      visit(f.body);
      if (score > THRESHOLD) {
        out.push({
          message: `function '${f.name}' has cognitive complexity ${score} (max ${THRESHOLD}) — consider extracting helpers`,
          loc: f.loc,
        });
      }
    });
  return out;
});

// 27. too-many-params
rule("too-many-params", "warning", (ast) => {
  const out: RawDiagnostic[] = [];
  const MAX = 5;
  walkKind(ast, (node) => {
      if (node.kind !== "FnDecl") return;
      const f = node as FnDecl;
      if (f.params.length > MAX) {
        out.push({
          message: `function '${f.name}' has ${f.params.length} parameters (max ${MAX}) — consider grouping into a struct`,
          loc: f.loc,
        });
      }
    });
  return out;
});

// 28. too-many-arms
rule("too-many-arms", "warning", (ast) => {
  const out: RawDiagnostic[] = [];
  const MAX = 10;
  walkKind(ast, (node) => {
      if (node.kind !== "Match") return;
      const m = node as Match;
      if (m.arms.length > MAX) {
        out.push({
          message: `match has ${m.arms.length} arms (max ${MAX}) — consider refactoring with a lookup table or polymorphism`,
          loc: m.loc,
        });
      }
    });
  return out;
});

// 29. deep-pattern-nesting
rule("deep-pattern-nesting", "warning", (ast) => {
  const out: RawDiagnostic[] = [];
  const MAX = 3;
  function patternDepth(p: Pattern): number {
    switch (p.kind) {
      case "WildcardPat": case "BindPat": case "RestPat": case "LitPat": return 1;
      case "TuplePat": case "ArrayPat": {
        let d = 0;
        for (const sub of p.elements) d = Math.max(d, patternDepth(sub));
        return 1 + d;
      }
      case "StructPat": {
        let d = 0;
        for (const f of p.fields) d = Math.max(d, patternDepth(f.pattern));
        return 1 + d;
      }
      case "EnumPat": {
        let d = 0;
        for (const sub of p.subpatterns) d = Math.max(d, patternDepth(sub));
        return 1 + d;
      }
      case "OrPat": {
        let d = 0;
        for (const sub of p.patterns) d = Math.max(d, patternDepth(sub));
        return d;  // OrPat doesn't add depth itself.
      }
    }
    return 1;
  }
  walkKind(ast, (node) => {
      if (node.kind !== "Match") return;
      const m = node as Match;
      for (const arm of m.arms) {
        const d = patternDepth(arm.pattern);
        if (d > MAX) {
          out.push({
            message: `pattern nesting depth ${d} exceeds ${MAX} — consider binding sub-patterns to locals in the arm body`,
            loc: arm.loc,
          });
        }
      }
    });
  return out;
});

// 30. long-function
rule("long-function", "warning", (ast) => {
  const out: RawDiagnostic[] = [];
  const MAX = 50;
  walkKind(ast, (node) => {
      if (node.kind !== "FnDecl") return;
      const f = node as FnDecl;
      const span = f.loc.end.line - f.loc.start.line;
      if (span > MAX) {
        out.push({
          message: `function '${f.name}' spans ${span} lines (max ${MAX}) — consider extracting helpers`,
          loc: f.loc,
        });
      }
    });
  return out;
});

// Re-export a small helper used by tests.
export { analyzeScopes };
