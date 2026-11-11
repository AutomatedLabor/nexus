/**
 * aether/tools/formatter/formatter.ts
 * ====================================
 * Deterministic, idempotent code formatter for the Aether language.
 *
 * Pipeline: lex → parse → walk AST → pretty-print with consistent style.
 *
 * Core property: idempotency.  `format(format(x)) === format(x)` for every
 * source string `x` whose parse is clean.  Comments are preserved through a
 * separate pre-scan that records each comment's source location; the printer
 * reattaches comments to the AST node that "owns" them (leading comment
 * before a node, trailing comment on the same line as a node's end).
 *
 * Style choices
 * -------------
 *   - 2-space indentation by default (configurable via `indent`).
 *   - One statement per line.
 *   - `{` on the same line for fn / if / while / for / match / lambda.
 *   - `}` on its own line at the parent indent for multi-line constructs.
 *   - Single-line blocks `{ expr }` when the body is a single expression
 *     that fits within the configured `lineWidth`.
 *   - Spaces around binary operators, after commas, after colons; no space
 *     before `;` or `,`.
 *   - Trailing comma in multi-line arrays / struct / enum / map (toggle with
 *     `trailingComma`, default `true`).
 *   - String interpolation preserved as `f"...{x}..."`.
 *   - Line and block comments preserved.
 *
 * Public API
 * ----------
 *   format(source, opts?)   -> string
 *   formatFile(path, opts?)  -> string
 *   extractComments(source) -> Comment[]   (helper used by the linter too)
 */
// Note: we deliberately do NOT statically import `fs` here. The browser
// bundle (Next.js / Turbopack) cannot resolve Node built-ins, and the only
// function in this module that touches the filesystem is `formatFile`,
// which is Node-only (CLI). We resolve `fs` lazily through `globalThis`
// indirection so bundlers don't try to pull `fs` into the browser bundle.
import { lex } from "../../core/lexer/lexer";
import { parse } from "../../core/parser/parser";
import type {
  Program,
  Expr,
  Stmt,
  Pattern,
  TypeNode,
  Block,
  Param,
  TypeParam,
  MatchArm,
  MapEntry,
  StructExprField,
  StructField,
  EnumVariantDecl,
  StringSegment,
  SourceLocation,
} from "../../core/ast/ast";

//-----------------------------------------------------------------------------
// Public options and types
//-----------------------------------------------------------------------------
export interface FormatOptions {
  /** Indent width in spaces. Default 2. */
  indent?: number;
  /** Maximum line width in characters. Default 100. */
  lineWidth?: number;
  /** Emit trailing comma in multi-line arrays / struct / enum / map. Default true. */
  trailingComma?: boolean;
  /** Emit semicolons after statements. Default true. Setting `false` may
   *  produce output that does not re-parse — Aether's grammar requires `;`
   *  after most statements. The option is kept for API completeness. */
  semi?: boolean;
}

export interface Comment {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  startOffset: number;
  endOffset: number;
  kind: "line" | "block";
  text: string;
  /** True iff only whitespace precedes the comment on its start line. */
  ownLine: boolean;
}

const DEFAULT_OPTS: Required<FormatOptions> = {
  indent: 2,
  lineWidth: 100,
  trailingComma: true,
  semi: true,
};

//-----------------------------------------------------------------------------
// Public entry points
//-----------------------------------------------------------------------------
export function format(source: string, opts?: FormatOptions): string {
  const o: Required<FormatOptions> = { ...DEFAULT_OPTS, ...opts };
  const comments = extractComments(source);
  const tokens = lex(source, "<formatter>");
  const { program } = parse(tokens, "<formatter>");
  const p = new Printer(o, comments);
  p.printProgram(program);
  return p.finalize();
}

export function formatFile(path: string, opts?: FormatOptions): string {
  // Lazy `fs` access via globalThis indirection — hidden from bundlers so
  // the browser bundle never tries to resolve `fs`. Throws a clean error
  // in the browser (formatFile is Node-only).
  const req = (globalThis as any).require;
  if (typeof req !== "function") {
    throw new Error("formatFile() requires Node.js (fs not available in browser)");
  }
  const fs = req("fs");
  return format(fs.readFileSync(path, "utf8"), opts);
}

//-----------------------------------------------------------------------------
// Comment extraction
//
// A small hand-rolled scanner that walks the source recording each `// ...`
// line comment and `/* ... */` (nestable) block comment with its source
// range and "ownLine" classification.  Strings, char literals, and the
// leading `f` of f-strings are skipped so `//` inside a string literal does
// not start a comment.
//-----------------------------------------------------------------------------
export function extractComments(source: string): Comment[] {
  const out: Comment[] = [];
  const n = source.length;
  let i = 0;
  let line = 1;
  let col = 1;
  // True iff the current source line (so far) contains any non-whitespace
  // content.  Reset on every newline.
  let nonWsOnLine = false;

  while (i < n) {
    const c = source[i];
    const c2 = i + 1 < n ? source[i + 1] : "";

    // f-string starts with `f"` — only treat as string when followed by `"`.
    if (c === '"' || (c === "f" && c2 === '"')) {
      if (c === "f") { i++; col++; }
      // consume opening `"`
      i++; col++;
      while (i < n && source[i] !== '"') {
        if (source[i] === "\\") {
          // escape: skip next char
          i += 2; col += 2;
          continue;
        }
        if (source[i] === "{") {
          // interpolation — skip past matching `}` (with nesting for inner
          // strings and braces).  Inner strings can themselves contain `}`
          // and `"`, so track a small state machine.
          let depth = 1;
          i++; col++;
          while (i < n && depth > 0) {
            const ic = source[i];
            if (ic === '"') {
              // skip the inner string
              i++; col++;
              while (i < n && source[i] !== '"') {
                if (source[i] === "\\") { i += 2; col += 2; continue; }
                if (source[i] === "\n") { line++; col = 1; i++; }
                else { i++; col++; }
              }
              if (i < n) { i++; col++; }
              continue;
            }
            if (ic === "{") depth++;
            else if (ic === "}") depth--;
            if (ic === "\n") { line++; col = 1; }
            else col++;
            i++;
          }
          continue;
        }
        if (source[i] === "\n") {
          line++; col = 1; nonWsOnLine = false;
          i++;
          continue;
        }
        i++; col++;
      }
      if (i < n) { i++; col++; }  // closing `"`
      nonWsOnLine = true;
      continue;
    }

    // Char literal: `'c'` or `'\n'`
    if (c === "'") {
      i++; col++;
      if (i < n && source[i] === "\\") { i += 2; col += 2; }
      else if (i < n) { i++; col++; }
      if (i < n && source[i] === "'") { i++; col++; }
      nonWsOnLine = true;
      continue;
    }

    // Line comment
    if (c === "/" && c2 === "/") {
      const start = i;
      const startLine = line;
      const startCol = col;
      const ownLine = !nonWsOnLine;
      while (i < n && source[i] !== "\n") { i++; col++; }
      out.push({
        startLine, startCol,
        endLine: line, endCol: col,
        startOffset: start, endOffset: i,
        kind: "line",
        text: source.slice(start, i),
        ownLine,
      });
      // The comment itself counts as non-whitespace on the line.
      nonWsOnLine = true;
      continue;
    }

    // Block comment (nestable)
    if (c === "/" && c2 === "*") {
      const start = i;
      const startLine = line;
      const startCol = col;
      const ownLine = !nonWsOnLine;
      i += 2; col += 2;
      let depth = 1;
      while (i < n && depth > 0) {
        if (source[i] === "/" && i + 1 < n && source[i + 1] === "*") {
          depth++; i += 2; col += 2;
        } else if (source[i] === "*" && i + 1 < n && source[i + 1] === "/") {
          depth--; i += 2; col += 2;
        } else if (source[i] === "\n") {
          line++; col = 1; nonWsOnLine = false; i++;
        } else {
          i++; col++;
        }
      }
      out.push({
        startLine, startCol,
        endLine: line, endCol: col,
        startOffset: start, endOffset: i,
        kind: "block",
        text: source.slice(start, i),
        ownLine,
      });
      nonWsOnLine = true;
      continue;
    }

    if (c === "\n") {
      line++; col = 1; nonWsOnLine = false;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++; col++;
      continue;
    }
    // Any other character is non-whitespace.
    nonWsOnLine = true;
    i++; col++;
  }
  return out;
}

//-----------------------------------------------------------------------------
// Precedence (must match parser/parser.ts)
//-----------------------------------------------------------------------------
const BIN_PREC: Record<string, number> = {
  "||": 1,
  "or": 1,
  "&&": 2,
  "==": 3, "!=": 3, "<": 3, "<=": 3, ">": 3, ">=": 3,
  "|": 4, "^": 4, "&": 4, "<<": 4, ">>": 4,
  "+": 5, "-": 5,
  "*": 6, "/": 6, "%": 6,
};
const RANGE_PREC = 4;
const AS_PREC = 7;
const UNARY_PREC = 9;
const POSTFIX_PREC = 10;
const ATOM_PREC = 11;

function binPrec(op: string): number {
  return BIN_PREC[op] ?? 3; // comparison default
}

//-----------------------------------------------------------------------------
// Flat-string computation
//
// Standalone functions that produce the canonical single-line
// representation of an expression / type / pattern / etc.  Used by the
// printer to decide whether a construct fits within `lineWidth`.
// Returns `null` when the construct can't be flattened (e.g., a block with
// statements, or a match expression).
//-----------------------------------------------------------------------------
function flatExpr(e: Expr): string | null {
  switch (e.kind) {
    case "IntLit": return String(e.value);
    case "FloatLit": return String(e.value);
    case "BoolLit": return e.value ? "true" : "false";
    case "CharLit": return `'${escapeChar(e.value)}'`;
    case "UnitLit": return "()";
    case "Ident": return e.name;
    case "StringLit": return flatStringLit(e.segments);
    case "Binary": {
      const l = flatExpr(e.left);
      const r = flatExpr(e.right);
      if (l === null || r === null) return null;
      return l + " " + e.op + " " + r;
    }
    case "Unary": {
      const o = flatExpr(e.operand);
      if (o === null) return null;
      return e.op + o;
    }
    case "Assign": {
      const l = flatExpr(e.target);
      const r = flatExpr(e.value);
      if (l === null || r === null) return null;
      return l + " = " + r;
    }
    case "CompoundAssign": {
      const l = flatExpr(e.target);
      const r = flatExpr(e.value);
      if (l === null || r === null) return null;
      return l + " " + e.op + "= " + r;
    }
    case "Call": {
      const callee = flatExpr(e.callee);
      if (callee === null) return null;
      const args: string[] = [];
      for (const a of e.args) {
        const f = flatExpr(a);
        if (f === null) return null;
        args.push(f);
      }
      let s = callee;
      if (e.typeArgs && e.typeArgs.length > 0) {
        s += "<" + e.typeArgs.map(flatType).join(", ") + ">";
      }
      s += "(" + args.join(", ") + ")";
      return s;
    }
    case "MethodCall": {
      const obj = flatExpr(e.object);
      if (obj === null) return null;
      const args: string[] = [];
      for (const a of e.args) {
        const f = flatExpr(a);
        if (f === null) return null;
        args.push(f);
      }
      return obj + "." + e.name + "(" + args.join(", ") + ")";
    }
    case "Index": {
      const o = flatExpr(e.object);
      const ix = flatExpr(e.index);
      if (o === null || ix === null) return null;
      return o + "[" + ix + "]";
    }
    case "Field": {
      const o = flatExpr(e.object);
      if (o === null) return null;
      return o + "." + e.name;
    }
    case "TupleField": {
      const o = flatExpr(e.object);
      if (o === null) return null;
      return o + "." + String(e.index);
    }
    case "TupleExpr": {
      const items: string[] = [];
      for (const el of e.elements) {
        const f = flatExpr(el);
        if (f === null) return null;
        items.push(f);
      }
      if (items.length === 1) return "(" + items[0] + ",)";
      return "(" + items.join(", ") + ")";
    }
    case "ArrayExpr": {
      const items: string[] = [];
      for (const el of e.elements) {
        const f = flatExpr(el);
        if (f === null) return null;
        items.push(f);
      }
      return "[" + items.join(", ") + "]";
    }
    case "MapExpr": {
      const items: string[] = [];
      for (const en of e.entries) {
        const k = flatExpr(en.key);
        const v = flatExpr(en.value);
        if (k === null || v === null) return null;
        items.push(k + ": " + v);
      }
      return "{" + items.join(", ") + "}";
    }
    case "StructExpr": {
      const items: string[] = [];
      for (const f of e.fields) {
        const v = flatExpr(f.value);
        if (v === null) return null;
        items.push(f.name + ": " + v);
      }
      let s = e.name + " { " + items.join(", ");
      if (e.spread) {
        const sp = flatExpr(e.spread);
        if (sp === null) return null;
        if (items.length) s += ", ";
        s += ".." + sp;
      }
      s += " }";
      return s;
    }
    case "EnumVariant": {
      const args: string[] = [];
      for (const a of e.args) {
        const f = flatExpr(a);
        if (f === null) return null;
        args.push(f);
      }
      let s = e.enumName + "::" + e.variant;
      if (args.length > 0) s += "(" + args.join(", ") + ")";
      return s;
    }
    case "Lambda": {
      const params = e.params.map(flatParam).join(", ");
      const body = flatBlock(e.body);
      if (body === null) return null;
      let s = "fn(" + params + ")";
      if (e.ret) s += " -> " + flatType(e.ret);
      s += " " + body;
      return s;
    }
    case "If": return flatIf(e);
    case "Match": return null;
    case "Block": return flatBlock(e);
    case "Paren": {
      const inner = flatExpr(e.expr);
      if (inner === null) return null;
      return "(" + inner + ")";
    }
    case "Cast":
    case "As": {
      const inner = flatExpr(e.expr);
      if (inner === null) return null;
      return inner + " as " + flatType(e.type);
    }
    case "Range": {
      const s = flatExpr(e.start);
      const en = flatExpr(e.end);
      if (s === null || en === null) return null;
      return s + (e.inclusive ? "..=" : "..") + en;
    }
    case "ErrorProp": {
      const inner = flatExpr(e.expr);
      if (inner === null) return null;
      return inner + "?";
    }
    case "SelfExpr": return "self";
    case "Spread": {
      const inner = flatExpr(e.expr);
      if (inner === null) return null;
      return "..." + inner;
    }
    case "Return": {
      if (!e.expr) return "return";
      const inner = flatExpr(e.expr);
      if (inner === null) return null;
      return "return " + inner;
    }
  }
}

function flatBlock(e: Expr): string | null {
  if (e.kind !== "Block") return null;
  if (e.stmts.length === 0) {
    if (!e.expr) return "{ }";
    const inner = flatExpr(e.expr);
    if (inner === null) return null;
    return "{ " + inner + " }";
  }
  return null;
}

function flatIf(e: Expr & { kind: "If" }): string | null {
  const cond = flatExpr(e.cond);
  if (cond === null) return null;
  const thenB = flatBlock(e.then);
  if (thenB === null) return null;
  let s = "if " + cond + " " + thenB;
  if (e.else) {
    let elseS: string | null;
    if (e.else.kind === "If") {
      elseS = flatIf(e.else);
    } else {
      elseS = flatBlock(e.else);
    }
    if (elseS === null) return null;
    s += " else " + elseS;
  }
  return s;
}

function flatType(t: TypeNode): string {
  switch (t.kind) {
    case "NamedType": return t.name;
    case "PrimitiveType": return t.name;
    case "UnitType": return "()";
    case "GenericType": return t.name + "<" + t.args.map(flatType).join(", ") + ">";
    case "FuncType": return "fn(" + t.params.map(flatType).join(", ") + ") -> " + flatType(t.ret);
    case "TupleType": {
      const items = t.types.map(flatType);
      if (items.length === 1) return "(" + items[0] + ",)";
      return "(" + items.join(", ") + ")";
    }
    case "ArrayType": return "[" + flatType(t.elem) + "]";
    case "MapType": return "map[" + flatType(t.key) + "] " + flatType(t.value);
    case "OptionType": return "option<" + flatType(t.inner) + ">";
    case "ResultType": return "result<" + flatType(t.ok) + ", " + flatType(t.err) + ">";
  }
}

function flatParam(p: Param): string {
  let s = p.name;
  if (p.type) s += ": " + flatType(p.type);
  return s;
}

function flatPattern(p: Pattern): string {
  switch (p.kind) {
    case "WildcardPat": return "_";
    case "BindPat": {
      let s = p.name;
      if (p.mut) s = "mut " + s;
      if (p.type) s += ": " + flatType(p.type);
      return s;
    }
    case "LitPat": {
      const v = flatExpr(p.value);
      return v === null ? "_" : v;
    }
    case "TuplePat": {
      const items = p.elements.map(flatPattern);
      if (items.length === 1) return "(" + items[0] + ",)";
      return "(" + items.join(", ") + ")";
    }
    case "ArrayPat": return "[" + p.elements.map(flatPattern).join(", ") + "]";
    case "StructPat": {
      const items = p.fields.map(f => f.name + ": " + flatPattern(f.pattern));
      let s = p.name + " { " + items.join(", ");
      if (p.rest) {
        if (items.length) s += ", ";
        s += "..";
      }
      s += " }";
      return s;
    }
    case "EnumPat": {
      let s = p.enumName + "::" + p.variant;
      if (p.subpatterns.length) s += "(" + p.subpatterns.map(flatPattern).join(", ") + ")";
      return s;
    }
    case "OrPat": return p.patterns.map(flatPattern).join(" | ");
    case "RestPat": return "..";
  }
}

function flatStringLit(segs: StringSegment[]): string {
  const hasInterp = segs.some(s => s.kind === "interp");
  let s = hasInterp ? 'f"' : '"';
  for (const seg of segs) {
    if (seg.kind === "text") {
      s += escapeString(seg.value);
    } else {
      s += "{" + (seg.value) + "}";
    }
  }
  s += '"';
  return s;
}

//-----------------------------------------------------------------------------
// Escape helpers (mirroring ast/visitor.ts)
//-----------------------------------------------------------------------------
function escapeString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}
function escapeChar(s: string): string {
  if (s === "\n") return "\\n";
  if (s === "\t") return "\\t";
  if (s === "\r") return "\\r";
  if (s === "\\") return "\\\\";
  if (s === "'") return "\\'";
  return s;
}

//-----------------------------------------------------------------------------
// Printer
//-----------------------------------------------------------------------------
class Printer {
  out: string[] = [];
  indent = 0;
  opts: Required<FormatOptions>;
  comments: Comment[];
  commentIdx = 0;
  atLineStart = true;

  constructor(opts: Required<FormatOptions>, comments: Comment[]) {
    this.opts = opts;
    this.comments = comments;
  }

  // ----- low-level -----
  emit(s: string): void {
    if (s.length === 0) return;
    this.out.push(s);
    this.atLineStart = false;
  }

  nl(): void {
    this.out.push("\n" + this.indentStr());
    this.atLineStart = true;
  }

  indentStr(): string {
    return " ".repeat(this.indent * this.opts.indent);
  }

  /** Current column (characters since the last `\n`). */
  col(): number {
    for (let i = this.out.length - 1; i >= 0; i--) {
      const s = this.out[i];
      const nl = s.lastIndexOf("\n");
      if (nl >= 0) {
        let c = s.length - nl - 1;
        for (let k = i + 1; k < this.out.length; k++) c += this.out[k].length;
        return c;
      }
    }
    return this.out.reduce((a, s) => a + s.length, 0);
  }

  finalize(): string {
    let s = this.out.join("");
    // Strip trailing whitespace per line.
    s = s.replace(/[ \t]+$/gm, "");
    // Collapse trailing newlines, ensure exactly one terminating newline.
    s = s.replace(/\n*$/, "");
    return s + "\n";
  }

  // ----- comment interleaving -----
  /** Emit any comments whose startOffset is strictly less than `offset`
   *  as leading (own-line) comments at the current indent. */
  emitLeading(offset: number): void {
    while (this.commentIdx < this.comments.length &&
           this.comments[this.commentIdx].startOffset < offset) {
      const c = this.comments[this.commentIdx++];
      if (!this.atLineStart) this.nl();
      this.emit(c.text);
    }
  }

  /** If the next comment is on `line` and is not own-line, emit it as a
   *  trailing comment (separated by a single space). */
  emitTrailing(line: number): void {
    if (this.commentIdx < this.comments.length) {
      const c = this.comments[this.commentIdx];
      if (c.startLine === line && !c.ownLine) {
        this.emit(" " + c.text);
        this.commentIdx++;
      }
    }
  }

  /** Drain all remaining comments (used at the end of the file). */
  emitRemaining(): void {
    while (this.commentIdx < this.comments.length) {
      const c = this.comments[this.commentIdx++];
      if (!this.atLineStart) this.nl();
      this.emit(c.text);
    }
  }

  // ----- program / statements -----
  printProgram(p: Program): void {
    for (const s of p.body) {
      // For ExprStmt the parser's loc.start sometimes points to the
      // enclosing block's `{` rather than to the wrapped expression.
      // Use the inner expression's loc.start.offset to emit leading
      // comments in the right place.
      const inner = s.kind === "ExprStmt" ? s.expr : null;
      const leadingOffset = inner ? inner.loc.start.offset : s.loc.start.offset;
      this.emitLeading(leadingOffset);
      if (!this.atLineStart) this.nl();
      this.printStmt(s);
      this.emitTrailing(s.loc.end.line);
    }
    this.emitRemaining();
  }

  printStmt(s: Stmt): void {
    switch (s.kind) {
      case "Let":
        this.emit("let " + s.name);
        if (s.type) { this.emit(": "); this.printType(s.type); }
        this.emit(" = ");
        this.printExpr(s.init, 0);
        if (this.opts.semi) this.emit(";");
        return;
      case "MutLet":
        this.emit("let mut " + s.name);
        if (s.type) { this.emit(": "); this.printType(s.type); }
        this.emit(" = ");
        this.printExpr(s.init, 0);
        if (this.opts.semi) this.emit(";");
        return;
      case "Const":
        this.emit("const " + s.name);
        if (s.type) { this.emit(": "); this.printType(s.type); }
        this.emit(" = ");
        this.printExpr(s.init, 0);
        if (this.opts.semi) this.emit(";");
        return;
      case "ExprStmt":
        this.printExpr(s.expr, 0);
        if (this.opts.semi) this.emit(";");
        return;
      case "FnDecl":
        if (s.exported) this.emit("pub ");
        this.emit("fn " + s.name);
        this.printTypeParams(s.generics);
        this.emit("(");
        for (let i = 0; i < s.params.length; i++) {
          if (i) this.emit(", ");
          this.printParam(s.params[i]);
        }
        this.emit(")");
        if (s.ret) { this.emit(" -> "); this.printType(s.ret); }
        this.emit(" ");
        this.printBlock(s.body);
        return;
      case "EnumDecl":
        this.emit("enum " + s.name);
        this.printTypeParams(s.generics);
        this.emit(" {");
        this.indent++;
        for (let i = 0; i < s.variants.length; i++) {
          const v = s.variants[i];
          this.emitLeading(v.loc.start.offset);
          this.nl();
          this.printEnumVariant(v);
          this.emit(this.mlComma(i, s.variants.length));
          this.emitTrailing(v.loc.end.line);
        }
        this.emitLeading(s.loc.end.offset);
        this.indent--;
        this.nl();
        this.emit("}");
        return;
      case "StructDecl":
        this.emit("struct " + s.name);
        this.printTypeParams(s.generics);
        if (s.fields.length === 0) {
          this.emit(" { }");
          return;
        }
        // Multi-line struct decl (idiomatic Aether).
        this.emit(" {");
        this.indent++;
        for (let i = 0; i < s.fields.length; i++) {
          const f = s.fields[i];
          this.emitLeading(f.loc.start.offset);
          this.nl();
          this.emit(f.name + ": ");
          this.printType(f.type);
          this.emit(this.mlComma(i, s.fields.length));
          this.emitTrailing(f.loc.end.line);
        }
        this.emitLeading(s.loc.end.offset);
        this.indent--;
        this.nl();
        this.emit("}");
        return;
      case "TypeAlias":
        this.emit("type " + s.name);
        this.printTypeParams(s.generics);
        this.emit(" = ");
        this.printType(s.type);
        if (this.opts.semi) this.emit(";");
        return;
      case "Return":
        this.emit("return");
        if (s.expr) { this.emit(" "); this.printExpr(s.expr, 0); }
        if (this.opts.semi) this.emit(";");
        return;
      case "Break":
        this.emit("break");
        if (this.opts.semi) this.emit(";");
        return;
      case "Continue":
        this.emit("continue");
        if (this.opts.semi) this.emit(";");
        return;
      case "While":
        this.emit("while ");
        this.printExpr(s.cond, 0);
        this.emit(" ");
        this.printBlock(s.body);
        return;
      case "ForIn":
        this.emit("for " + s.varName + " in ");
        this.printExpr(s.iterable, 0);
        this.emit(" ");
        this.printBlock(s.body);
        return;
      case "Import":
        this.emit('import "' + s.path + '"');
        if (s.names.length) this.emit(" { " + s.names.join(", ") + " }");
        if (this.opts.semi) this.emit(";");
        return;
      case "Print":
        this.emit("print(");
        this.printExpr(s.expr, 0);
        this.emit(")");
        if (this.opts.semi) this.emit(";");
        return;
      case "AssignStmt":
        // The parser wraps `x op= y;` as AssignStmt(target=x,
        // value=CompoundAssign(op, target=x, value=y)).  Detect that shape
        // and print `x op= y;` rather than the lossy `x = x op= y;`.
        if (s.value.kind === "CompoundAssign") {
          this.printExpr(s.value, 0);
        } else {
          this.printExpr(s.target, 0);
          this.emit(" = ");
          this.printExpr(s.value, 0);
        }
        if (this.opts.semi) this.emit(";");
        return;
      case "BlockStmt":
        this.printBlockStmt(s);
        return;
    }
  }

  printBlockStmt(s: Stmt & { kind: "BlockStmt" }): void {
    this.emit("{");
    this.indent++;
    for (const st of s.body) {
      this.emitLeading(st.loc.start.offset);
      this.nl();
      this.printStmt(st);
      this.emitTrailing(st.loc.end.line);
    }
    this.emitLeading(s.loc.end.offset);
    this.indent--;
    this.nl();
    this.emit("}");
  }

  /** Comma after element `i` of a multi-line sequence — empty when the
   *  user disabled trailing commas AND this is the last element. */
  mlComma(i: number, total: number): string {
    if (i < total - 1) return ",";
    return this.opts.trailingComma ? "," : "";
  }

  printEnumVariant(v: { name: string; kind: "unit" | "tuple" | "struct"; types?: TypeNode[]; fields?: StructField[]; loc: SourceLocation }): void {
    this.emit(v.name);
    if (v.kind === "tuple") {
      this.emit("(");
      const ts = v.types ?? [];
      for (let i = 0; i < ts.length; i++) {
        if (i) this.emit(", ");
        this.printType(ts[i]);
      }
      this.emit(")");
    } else if (v.kind === "struct") {
      const fs = v.fields ?? [];
      if (fs.length === 0) {
        this.emit(" { }");
      } else {
        this.emit(" { ");
        for (let i = 0; i < fs.length; i++) {
          if (i) this.emit(", ");
          this.emit(fs[i].name + ": ");
          this.printType(fs[i].type);
        }
        this.emit(" }");
      }
    }
  }

  printTypeParams(ps: TypeParam[]): void {
    if (!ps.length) return;
    this.emit("<");
    for (let i = 0; i < ps.length; i++) {
      if (i) this.emit(", ");
      this.emit(ps[i].name);
      if (ps[i].constraint) this.emit(": " + ps[i].constraint);
    }
    this.emit(">");
  }

  printParam(p: Param): void {
    this.emit(p.name);
    if (p.type) { this.emit(": "); this.printType(p.type); }
  }

  // ----- types -----
  printType(t: TypeNode): void {
    this.emit(flatType(t));
  }

  // ----- patterns -----
  printPattern(p: Pattern): void {
    this.emit(flatPattern(p));
  }

  // ----- expressions -----
  printExpr(e: Expr, parentPrec: number): void {
    const prec = exprPrec(e);
    if (prec < parentPrec) {
      // Need parens — but we preserve the AST's Paren nodes; this case is
      // for safety when the AST has an unusual child (e.g., a binary as the
      // right operand of a left-associative binary at the same precedence).
      this.emit("(");
      this.printExpr(e, 0);
      this.emit(")");
      return;
    }
    switch (e.kind) {
      case "IntLit": this.emit(String(e.value)); return;
      case "FloatLit": this.emit(String(e.value)); return;
      case "BoolLit": this.emit(e.value ? "true" : "false"); return;
      case "CharLit": this.emit("'" + escapeChar(e.value) + "'"); return;
      case "UnitLit": this.emit("()"); return;
      case "Ident": this.emit(e.name); return;
      case "StringLit": this.printStringLit(e.segments); return;
      case "Binary":
        this.printExpr(e.left, binPrec(e.op));
        this.emit(" " + e.op + " ");
        // Right operand needs parens if same precedence (left-associative).
        this.printExpr(e.right, binPrec(e.op) + 1);
        return;
      case "Unary":
        this.emit(e.op);
        this.printExpr(e.operand, UNARY_PREC);
        return;
      case "Assign":
        this.printExpr(e.target, ATOM_PREC);
        this.emit(" = ");
        this.printExpr(e.value, 0);
        return;
      case "CompoundAssign":
        this.printExpr(e.target, ATOM_PREC);
        this.emit(" " + e.op + "= ");
        this.printExpr(e.value, 0);
        return;
      case "Call":
        this.printExpr(e.callee, POSTFIX_PREC);
        if (e.typeArgs && e.typeArgs.length > 0) {
          this.emit("<");
          for (let i = 0; i < e.typeArgs.length; i++) {
            if (i) this.emit(", ");
            this.printType(e.typeArgs[i]);
          }
          this.emit(">");
        }
        this.emit("(");
        for (let i = 0; i < e.args.length; i++) {
          if (i) this.emit(", ");
          this.printExpr(e.args[i], 0);
        }
        this.emit(")");
        return;
      case "MethodCall":
        this.printExpr(e.object, POSTFIX_PREC);
        this.emit("." + e.name + "(");
        for (let i = 0; i < e.args.length; i++) {
          if (i) this.emit(", ");
          this.printExpr(e.args[i], 0);
        }
        this.emit(")");
        return;
      case "Index":
        this.printExpr(e.object, POSTFIX_PREC);
        this.emit("[");
        this.printExpr(e.index, 0);
        this.emit("]");
        return;
      case "Field":
        this.printExpr(e.object, POSTFIX_PREC);
        this.emit("." + e.name);
        return;
      case "TupleField":
        this.printExpr(e.object, POSTFIX_PREC);
        this.emit("." + String(e.index));
        return;
      case "TupleExpr":
        this.printTupleExpr(e);
        return;
      case "ArrayExpr":
        this.printArrayExpr(e);
        return;
      case "MapExpr":
        this.printMapExpr(e);
        return;
      case "StructExpr":
        this.printStructExpr(e);
        return;
      case "EnumVariant":
        this.emit(e.enumName + "::" + e.variant);
        if (e.args.length > 0) {
          this.emit("(");
          for (let i = 0; i < e.args.length; i++) {
            if (i) this.emit(", ");
            this.printExpr(e.args[i], 0);
          }
          this.emit(")");
        }
        return;
      case "Lambda":
        this.emit("fn(");
        for (let i = 0; i < e.params.length; i++) {
          if (i) this.emit(", ");
          this.printParam(e.params[i]);
        }
        this.emit(")");
        if (e.ret) { this.emit(" -> "); this.printType(e.ret); }
        this.emit(" ");
        this.printBlock(e.body as Block);
        return;
      case "If":
        this.printIf(e);
        return;
      case "Match":
        this.printMatch(e);
        return;
      case "Block":
        this.printBlock(e);
        return;
      case "Paren":
        this.emit("(");
        this.printExpr(e.expr, 0);
        this.emit(")");
        return;
      case "Cast":
      case "As":
        this.printExpr(e.expr, AS_PREC + 1);
        this.emit(" as ");
        this.printType(e.type);
        return;
      case "Range":
        this.printExpr(e.start, RANGE_PREC + 1);
        this.emit(e.inclusive ? "..=" : "..");
        this.printExpr(e.end, RANGE_PREC + 1);
        return;
      case "ErrorProp":
        this.printExpr(e.expr, POSTFIX_PREC);
        this.emit("?");
        return;
      case "SelfExpr":
        this.emit("self");
        return;
      case "Spread":
        this.emit("...");
        this.printExpr(e.expr, ATOM_PREC);
        return;
      case "Return":
        this.emit("return");
        if (e.expr) { this.emit(" "); this.printExpr(e.expr, 0); }
        return;
    }
  }

  /** Precedence of an expression node, used to decide when to add parens. */
  exprPrecForChild(): number { return 0; }

  printTupleExpr(e: Expr & { kind: "TupleExpr" }): void {
    if (e.elements.length === 0) { this.emit("()"); return; }
    const flat = flatExpr(e);
    if (flat !== null && this.col() + flat.length <= this.opts.lineWidth) {
      this.emit(flat);
      return;
    }
    // Multi-line tuple (rare).
    this.emit("(");
    this.indent++;
    for (let i = 0; i < e.elements.length; i++) {
      const el = e.elements[i];
      this.emitLeading(el.loc.start.offset);
      this.nl();
      this.printExpr(el, 0);
      this.emit(this.mlComma(i, e.elements.length));
    }
    this.emitLeading(e.loc.end.offset);
    this.indent--;
    this.nl();
    this.emit(")");
  }

  printArrayExpr(e: Expr & { kind: "ArrayExpr" }): void {
    if (e.elements.length === 0) { this.emit("[]"); return; }
    const flat = flatExpr(e);
    if (flat !== null && this.col() + flat.length <= this.opts.lineWidth) {
      this.emit(flat);
      return;
    }
    // Multi-line.
    this.emit("[");
    this.indent++;
    for (let i = 0; i < e.elements.length; i++) {
      const el = e.elements[i];
      this.emitLeading(el.loc.start.offset);
      this.nl();
      this.printExpr(el, 0);
      this.emit(this.mlComma(i, e.elements.length));
    }
    this.emitLeading(e.loc.end.offset);
    this.indent--;
    this.nl();
    this.emit("]");
  }

  printMapExpr(e: Expr & { kind: "MapExpr" }): void {
    if (e.entries.length === 0) { this.emit("{}"); return; }
    const flat = flatExpr(e);
    if (flat !== null && this.col() + flat.length <= this.opts.lineWidth) {
      this.emit(flat);
      return;
    }
    // Multi-line.
    this.emit("{");
    this.indent++;
    for (let i = 0; i < e.entries.length; i++) {
      const en = e.entries[i];
      this.emitLeading(en.loc.start.offset);
      this.nl();
      this.printExpr(en.key, 0);
      this.emit(": ");
      this.printExpr(en.value, 0);
      this.emit(this.mlComma(i, e.entries.length));
    }
    this.emitLeading(e.loc.end.offset);
    this.indent--;
    this.nl();
    this.emit("}");
  }

  printStructExpr(e: Expr & { kind: "StructExpr" }): void {
    if (e.fields.length === 0 && !e.spread) {
      this.emit(e.name + " { }");
      return;
    }
    const flat = flatExpr(e);
    if (flat !== null && this.col() + flat.length <= this.opts.lineWidth) {
      this.emit(flat);
      return;
    }
    // Multi-line.
    this.emit(e.name + " {");
    this.indent++;
    for (let i = 0; i < e.fields.length; i++) {
      const f = e.fields[i];
      this.emitLeading(f.loc.start.offset);
      this.nl();
      this.emit(f.name + ": ");
      this.printExpr(f.value, 0);
      this.emit(this.mlComma(i, e.fields.length + (e.spread ? 1 : 0)));
    }
    if (e.spread) {
      if (!this.atLineStart) this.nl();
      this.emit("..");
      this.printExpr(e.spread, 0);
      if (this.opts.trailingComma) this.emit(",");
    }
    this.emitLeading(e.loc.end.offset);
    this.indent--;
    this.nl();
    this.emit("}");
  }

  printIf(e: Expr & { kind: "If" }): void {
    const flat = flatIf(e);
    if (flat !== null && this.col() + flat.length <= this.opts.lineWidth) {
      this.emit(flat);
      return;
    }
    // Multi-line.  `else if` chains stay on the same line.
    this.emit("if ");
    this.printExpr(e.cond, 0);
    this.emit(" ");
    this.printBlockMulti(e.then as Block);
    let cur: Expr | null = e.else ?? null;
    while (cur) {
      if (cur.kind === "If") {
        this.emit(" else if ");
        this.printExpr(cur.cond, 0);
        this.emit(" ");
        this.printBlockMulti(cur.then as Block);
        cur = cur.else ?? null;
      } else if (cur.kind === "Block") {
        this.emit(" else ");
        // The else block can be single-line if it fits (e.g., `else { 2 }`).
        this.printBlock(cur);
        cur = null;
      } else {
        this.emit(" else ");
        this.printExpr(cur, 0);
        cur = null;
      }
    }
  }

  printMatch(e: Expr & { kind: "Match" }): void {
    this.emit("match ");
    this.printExpr(e.scrutinee, 0);
    this.emit(" {");
    this.indent++;
    for (let i = 0; i < e.arms.length; i++) {
      const arm = e.arms[i];
      this.emitLeading(arm.loc.start.offset);
      this.nl();
      this.printPattern(arm.pattern);
      if (arm.guard) {
        this.emit(" if ");
        this.printExpr(arm.guard, 0);
      }
      this.emit(" => ");
      this.printMatchArmBody(arm.body);
      this.emit(this.mlComma(i, e.arms.length));
      this.emitTrailing(arm.loc.end.line);
    }
    this.emitLeading(e.loc.end.offset);
    this.indent--;
    this.nl();
    this.emit("}");
  }

  printMatchArmBody(body: Expr): void {
    // If the body is a Block with statements, we'd ideally go multi-line.
    // For a one-expr block that fits, use `{ expr }`. Otherwise multi-line.
    if (body.kind === "Block") {
      const flat = flatBlock(body);
      if (flat !== null && this.col() + flat.length <= this.opts.lineWidth) {
        this.emit(flat);
        return;
      }
      this.printBlockMulti(body);
      return;
    }
    this.printExpr(body, 0);
  }

  /** Print a block in multi-line form (always with newlines). */
  printBlockMulti(b: Block): void {
    this.emit("{");
    this.indent++;
    for (const s of b.stmts) {
      // For ExprStmt the parser's loc.start sometimes points to the
      // enclosing block's `{` rather than to the wrapped expression
      // (a known parser limitation with `if { … };` statements).  Use
      // the inner expression's loc.start.offset, which always points to
      // the actual first token of the statement, so any leading comments
      // land in the right place.
      const inner = s.kind === "ExprStmt" ? s.expr : null;
      const leadingOffset = inner ? inner.loc.start.offset : s.loc.start.offset;
      this.emitLeading(leadingOffset);
      this.nl();
      this.printStmt(s);
      this.emitTrailing(s.loc.end.line);
    }
    if (b.expr) {
      this.emitLeading(b.expr.loc.start.offset);
      this.nl();
      this.printExpr(b.expr, 0);
      this.emitTrailing(b.expr.loc.end.line);
    }
    this.emitLeading(b.loc.end.offset);
    this.indent--;
    this.nl();
    this.emit("}");
  }

  /** Print a block, choosing single-line vs multi-line based on width. */
  printBlock(b: Block): void {
    // Empty block — single line.
    if (b.stmts.length === 0 && !b.expr) {
      this.emit("{ }");
      return;
    }
    // Block with a single trailing expr — try single line.
    if (b.stmts.length === 0 && b.expr) {
      const flat = flatBlock(b);
      if (flat !== null && this.col() + flat.length <= this.opts.lineWidth) {
        this.emit(flat);
        return;
      }
    }
    // Otherwise multi-line.
    this.printBlockMulti(b);
  }

  printStringLit(segs: StringSegment[]): void {
    this.emit(flatStringLit(segs));
  }
}

//-----------------------------------------------------------------------------
// Precedence helper used by the printer.
//-----------------------------------------------------------------------------
function exprPrec(e: Expr): number {
  switch (e.kind) {
    case "IntLit": case "FloatLit": case "BoolLit": case "StringLit":
    case "CharLit": case "UnitLit": case "Ident": case "SelfExpr":
      return ATOM_PREC;
    case "Binary":
      return binPrec(e.op);
    case "Unary":
      return UNARY_PREC;
    case "Range":
      return RANGE_PREC;
    case "Cast": case "As":
      return AS_PREC;
    case "Call": case "MethodCall": case "Index": case "Field":
    case "TupleField": case "ErrorProp": case "Paren":
      return POSTFIX_PREC;
    case "Spread":
      return ATOM_PREC;  // `...x` is treated as a prefix that yields an atom-ish expr
    case "Assign": case "CompoundAssign":
      return 0;  // lower than any binary (treated like a statement-expr)
    case "Lambda":
      return 0;
    case "If": case "Match": case "Block":
      return 0;
    case "TupleExpr": case "ArrayExpr": case "MapExpr": case "StructExpr":
    case "EnumVariant": case "Return":
      return ATOM_PREC;
  }
  return ATOM_PREC;
}
