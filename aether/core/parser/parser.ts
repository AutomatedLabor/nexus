/**
 * aether/core/parser/parser.ts
 * ===========================
 * Recursive-descent + Pratt parser for Aether.
 *
 * Pipeline:
 *   tokens → parse(tokens) → { program, errors }
 *
 * Precedence (low → high):
 *   `||`               1
 *   `&&`               2
 *   `== != < <= > >=`  3
 *   `.. ..=`           4
 *   `+ -`              5
 *   `* / %`            6
 *   `as`               7
 *   `?`                8 (postfix)
 *   unary `! -`        9 (prefix)
 *   postfix call/index/field/method  10
 *   atoms              11
 *
 * Error recovery: on a parse error, the parser records an error with the
 * location and a message of the form
 *   "expected ';', found '}' at line 42:15"
 * and skips to the next `;` or `}` (whichever comes first), then continues
 * parsing. All errors are collected and returned alongside the partial AST.
 *
 * Simplified in v1
 * ----------------
 * - `Import` is parsed and emitted as an `Import` AST node but never
 *   resolved. Single-file programs only.
 * - Struct literals `Name { ... }` are disambiguated from block bodies via an
 *   `allowStruct` flag, threaded into `parseExpr`. Inside `if`/`while`/`for`/
 *   `match` heads, struct literals are disabled.
 * - `match` arms do not support `if` guards beyond `Pattern if Expr => Body`.
 * - Generics support `<T: Ord>` constraint syntax but the sema layer treats
 *   the constraint name opaquely.
 */
import {
  loc as makeLoc,
  SOURCE_LOCATION_ZERO,
  type SourceLocation,
  type Program,
  type Stmt,
  type Expr,
  type Pattern,
  type TypeNode,
  type Param,
  type TypeParam,
  type StructField,
  type EnumVariantDecl,
  type StringSegment,
  type MatchArm,
  type MapEntry,
  type StructExprField,
} from "../ast/ast";
import {
  lex,
  lexWithErrors,
  type Token,
  type LexError,
  isPunct,
  isKeyword,
} from "../lexer/lexer";

export interface ParseError {
  message: string;
  loc: SourceLocation;
}

export interface ParseResult {
  program: Program;
  errors: ParseError[];
}

export function parse(tokens: Token[], file = "<aether>"): ParseResult {
  const p = new Parser(tokens, file);
  return p.parse();
}

export function parseSource(source: string, file = "<aether>"): ParseResult {
  const { tokens } = lexWithErrors(source, file);
  return parse(tokens, file);
}

//----------------------------------------------------------------------------
// Precedence
//----------------------------------------------------------------------------
const BIN_PREC: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3, "!=": 3, "<": 3, "<=": 3, ">": 3, ">=": 3,
  // range `.. ..=` is handled specially below (precedence 4)
  // Bitwise / shift — looser than add (5), tighter than range (4):
  "|": 4, "^": 4, "&": 4, "<<": 4, ">>": 4,
  "+": 5, "-": 5,
  "*": 6, "/": 6, "%": 6,
  // `as` is precedence 7 (handled specially in the binary loop)
};
const RANGE_PREC = 4;
const AS_PREC = 7;

//----------------------------------------------------------------------------
// Parser
//----------------------------------------------------------------------------
class Parser {
  tokens: Token[];
  pos = 0;
  errors: ParseError[] = [];
  file: string;

  constructor(tokens: Token[], file: string) {
    this.tokens = tokens;
    this.file = file;
  }

  parse(): ParseResult {
    const body: Stmt[] = [];
    const start = this.peek().loc.start;
    while (!this.atEnd()) {
      const stmt = this.parseStmt();
      if (stmt) body.push(stmt);
    }
    const end = this.tokens.length > 0 ? this.tokens[this.tokens.length - 1].loc.end : start;
    return {
      program: { kind: "Program", body, loc: makeLoc(start, end, this.file) },
      errors: this.errors,
    };
  }

  // -------- token helpers --------
  peek(n = 0): Token {
    return this.tokens[this.pos + n] ?? { kind: "Eof", value: "", loc: SOURCE_LOCATION_ZERO };
  }

  advance(): Token {
    return this.tokens[this.pos++] ?? this.peek();
  }

  atEnd(): boolean {
    return this.peek().kind === "Eof";
  }

  isPunct(value: string, n = 0): boolean {
    const t = this.peek(n);
    return isPunct(t, value);
  }

  isKeyword(value: string, n = 0): boolean {
    const t = this.peek(n);
    return isKeyword(t, value);
  }

  eatPunct(value: string): boolean {
    if (this.isPunct(value)) { this.advance(); return true; }
    return false;
  }

  eatKeyword(value: string): boolean {
    if (this.isKeyword(value)) { this.advance(); return true; }
    return false;
  }

  expectPunct(value: string): Token | null {
    if (this.isPunct(value)) return this.advance();
    this.err(`expected '${value}', found '${this.peek().value || "<eof>"}' at ${locStr(this.peek().loc)}`);
    return null;
  }

  expectIdent(): string | null {
    const t = this.peek();
    if (t.kind === "Ident") { this.advance(); return t.value; }
    this.err(`expected identifier, found '${t.value || "<eof>"}' at ${locStr(t.loc)}`);
    return null;
  }

  err(message: string, loc?: SourceLocation): void {
    this.errors.push({ message, loc: loc ?? this.peek().loc });
  }

  recover(): void {
    while (!this.atEnd()) {
      const t = this.advance();
      if (t.kind === "Punct" && (t.value === ";" || t.value === "}")) return;
    }
  }

  locFrom(start: SourceLocation): SourceLocation {
    return makeLoc(start.start, this.tokens[this.pos - 1]?.loc.end ?? start.end, this.file);
  }

  // =====================================================================
  // Statements
  // =====================================================================
  parseStmt(): Stmt | null {
    const start = this.peek().loc;
    try {
      if (this.isKeyword("let")) return this.parseLet();
      if (this.isKeyword("const")) return this.parseConst();
      if (this.isKeyword("fn")) return this.parseFnOrLambda();
      if (this.isKeyword("enum")) return this.parseEnum();
      if (this.isKeyword("struct")) return this.parseStruct();
      if (this.isKeyword("type")) return this.parseTypeAlias();
      if (this.isKeyword("return")) return this.parseReturn();
      if (this.isKeyword("break")) { this.advance(); this.expectPunct(";"); return { kind: "Break", loc: this.locFrom(start) }; }
      if (this.isKeyword("continue")) { this.advance(); this.expectPunct(";"); return { kind: "Continue", loc: this.locFrom(start) }; }
      if (this.isKeyword("while")) return this.parseWhile();
      if (this.isKeyword("for")) return this.parseFor();
      if (this.isKeyword("import")) return this.parseImport();
      if (this.isKeyword("pub")) return this.parsePub();
      if (this.isKeyword("print")) return this.parsePrint();
      // expression statement or assignment
      return this.parseExprOrAssignStmt();
    } catch (e) {
      if (e instanceof ParseAbort) {
        this.err(e.message, e.loc);
        this.recover();
        return null;
      }
      throw e;
    }
  }

  parseLet(): Stmt {
    const start = this.peek().loc;
    this.advance(); // let
    let mut = false;
    if (this.isKeyword("mut")) { this.advance(); mut = true; }
    const name = this.expectIdent();
    let type: TypeNode | undefined;
    if (this.eatPunct(":")) type = this.parseType();
    this.expectPunct("=");
    const init = this.parseExpr();
    this.expectPunct(";");
    const loc = this.locFrom(start);
    if (mut) {
      return { kind: "MutLet", loc, name: name ?? "_", type, init };
    }
    return { kind: "Let", loc, name: name ?? "_", type, init };
  }

  parseConst(): Stmt {
    const start = this.peek().loc;
    this.advance();
    const name = this.expectIdent();
    let type: TypeNode | undefined;
    if (this.eatPunct(":")) type = this.parseType();
    this.expectPunct("=");
    const init = this.parseExpr();
    this.expectPunct(";");
    return { kind: "Const", loc: this.locFrom(start), name: name ?? "_", type, init };
  }

  parseFnOrLambda(): Stmt {
    const start = this.peek().loc;
    this.advance(); // fn
    if (this.peek().kind === "Ident") {
      // function declaration
      const name = this.advance().value;
      const generics = this.parseTypeParams();
      const params = this.parseParams();
      let ret: TypeNode | undefined;
      if (this.eatPunct("->")) ret = this.parseType();
      const body = this.parseBlock();
      return { kind: "FnDecl", loc: this.locFrom(start), name, generics, params, ret, body };
    } else {
      // lambda used as expression statement (rare)
      this.pos--; // un-consume `fn`
      const e = this.parseExpr();
      this.expectPunct(";");
      return { kind: "ExprStmt", loc: this.locFrom(start), expr: e };
    }
  }

  parseEnum(): Stmt {
    const start = this.peek().loc;
    this.advance();
    const name = this.expectIdent();
    const generics = this.parseTypeParams();
    this.expectPunct("{");
    const variants: EnumVariantDecl[] = [];
    while (!this.isPunct("}") && !this.atEnd()) {
      const vStart = this.peek().loc;
      const vName = this.expectIdent();
      if (!vName) { this.recover(); continue; }
      if (this.eatPunct("(")) {
        const types: TypeNode[] = [];
        if (!this.isPunct(")")) {
          do {
            if (this.isPunct(")")) break;
            types.push(this.parseType());
          } while (this.eatPunct(","));
        }
        this.expectPunct(")");
        variants.push({ name: vName, kind: "tuple", types, loc: this.locFrom(vStart) });
      } else if (this.eatPunct("{")) {
        const fields: StructField[] = [];
        if (!this.isPunct("}")) {
          do {
            if (this.isPunct("}")) break;
            const fname = this.expectIdent();
            this.expectPunct(":");
            const ftype = this.parseType();
            if (fname) fields.push({ name: fname, type: ftype, loc: this.locFrom(vStart) });
          } while (this.eatPunct(","));
        }
        this.expectPunct("}");
        variants.push({ name: vName, kind: "struct", fields, loc: this.locFrom(vStart) });
      } else {
        variants.push({ name: vName, kind: "unit", loc: this.locFrom(vStart) });
      }
      this.eatPunct(",");
    }
    this.expectPunct("}");
    return { kind: "EnumDecl", loc: this.locFrom(start), name: name ?? "_", generics, variants };
  }

  parseStruct(): Stmt {
    const start = this.peek().loc;
    this.advance();
    const name = this.expectIdent();
    const generics = this.parseTypeParams();
    this.expectPunct("{");
    const fields: StructField[] = [];
    if (!this.isPunct("}")) {
      do {
        if (this.isPunct("}")) break;
        const fname = this.expectIdent();
        this.expectPunct(":");
        const ftype = this.parseType();
        if (fname) fields.push({ name: fname, type: ftype, loc: this.locFrom(start) });
      } while (this.eatPunct(","));
    }
    this.expectPunct("}");
    return { kind: "StructDecl", loc: this.locFrom(start), name: name ?? "_", generics, fields };
  }

  parseTypeAlias(): Stmt {
    const start = this.peek().loc;
    this.advance();
    const name = this.expectIdent();
    const generics = this.parseTypeParams();
    this.expectPunct("=");
    const type = this.parseType();
    this.expectPunct(";");
    return { kind: "TypeAlias", loc: this.locFrom(start), name: name ?? "_", generics, type };
  }

  parseReturn(): Stmt {
    const start = this.peek().loc;
    this.advance();
    let expr: Expr | null = null;
    if (!this.isPunct(";") && !this.isPunct("}") && !this.atEnd()) {
      expr = this.parseExpr();
    }
    this.expectPunct(";");
    return { kind: "Return", loc: this.locFrom(start), expr };
  }

  parseWhile(): Stmt {
    const start = this.peek().loc;
    this.advance();
    const cond = this.parseExpr(false);
    const body = this.parseBlock();
    return { kind: "While", loc: this.locFrom(start), cond, body };
  }

  parseFor(): Stmt {
    const start = this.peek().loc;
    this.advance();
    const varName = this.expectIdent();
    if (!this.eatKeyword("in")) this.err(`expected 'in', found '${this.peek().value}' at ${locStr(this.peek().loc)}`);
    const iterable = this.parseExpr(false);
    const body = this.parseBlock();
    return { kind: "ForIn", loc: this.locFrom(start), varName: varName ?? "_", iterable, body };
  }

  parseImport(): Stmt {
    const start = this.peek().loc;
    this.advance();
    let path = "";
    if (this.peek().kind === "String") { path = (this.peek().segments || []).map(s => s.value).join(""); this.advance(); }
    else { this.err(`expected string after import, found '${this.peek().value}'`); }
    const names: string[] = [];
    if (this.eatPunct("{")) {
      do {
        if (this.isPunct("}")) break;
        const n = this.expectIdent();
        if (n) names.push(n);
      } while (this.eatPunct(","));
      this.expectPunct("}");
    }
    this.eatPunct(";");
    return { kind: "Import", loc: this.locFrom(start), path, names };
  }

  parsePub(): Stmt {
    const start = this.peek().loc;
    this.advance();
    if (this.isKeyword("fn")) {
      const d = this.parseFnOrLambda() as any;
      if (d && d.kind === "FnDecl") d.exported = true;
      return d;
    }
    this.err(`expected 'fn' after 'pub', found '${this.peek().value}'`);
    this.recover();
    return { kind: "ExprStmt", loc: this.locFrom(start), expr: { kind: "UnitLit", loc: this.locFrom(start) } };
  }

  parsePrint(): Stmt {
    const start = this.peek().loc;
    this.advance();
    this.expectPunct("(");
    const expr = this.parseExpr();
    this.expectPunct(")");
    this.expectPunct(";");
    return { kind: "Print", loc: this.locFrom(start), expr };
  }

  parseExprOrAssignStmt(): Stmt {
    const start = this.peek().loc;
    const e = this.parseExpr();
    if (this.isPunct("=")) {
      this.advance();
      const value = this.parseExpr();
      this.expectPunct(";");
      return { kind: "AssignStmt", loc: this.locFrom(start), target: e, value };
    }
    if (this.isPunct("+=") || this.isPunct("-=") || this.isPunct("*=") || this.isPunct("/=") || this.isPunct("%=")) {
      const op = this.advance().value[0];
      const value = this.parseExpr();
      this.expectPunct(";");
      return { kind: "AssignStmt", loc: this.locFrom(start), target: e, value: { kind: "CompoundAssign", loc: this.locFrom(start), op, target: e, value } };
    }
    this.expectPunct(";");
    return { kind: "ExprStmt", loc: this.locFrom(start), expr: e };
  }

  // =====================================================================
  // Type parameters and parameters
  // =====================================================================
  parseTypeParams(): TypeParam[] {
    const out: TypeParam[] = [];
    if (!this.isPunct("<")) return out;
    this.advance();
    do {
      if (this.isPunct(">")) break;
      const nameTok = this.advance();
      let constraint: string | undefined;
      if (this.eatPunct(":")) {
        constraint = this.advance().value;
      }
      out.push({ name: nameTok.value, constraint, loc: nameTok.loc });
    } while (this.eatPunct(","));
    this.expectPunct(">");
    return out;
  }

  parseParams(): Param[] {
    const out: Param[] = [];
    this.expectPunct("(");
    if (!this.isPunct(")")) {
      do {
        if (this.isPunct(")")) break;
        const start = this.peek().loc;
        let nameTok: Token;
        let type: TypeNode | undefined;
        // `self` parameter
        if (this.isKeyword("self")) { nameTok = this.advance(); }
        else { nameTok = this.advance(); }
        if (nameTok.kind !== "Ident" && !isKeyword(nameTok, "self")) {
          this.err(`expected parameter name, found '${nameTok.value}' at ${locStr(nameTok.loc)}`);
        }
        if (this.eatPunct(":")) type = this.parseType();
        out.push({ name: nameTok.value, type, loc: start });
      } while (this.eatPunct(","));
    }
    this.expectPunct(")");
    return out;
  }

  // =====================================================================
  // Types
  // =====================================================================
  parseType(): TypeNode {
    return this.parseFuncType();
  }

  parseFuncType(): TypeNode {
    if (this.isKeyword("fn")) {
      const start = this.peek().loc;
      this.advance();
      this.expectPunct("(");
      const params: TypeNode[] = [];
      if (!this.isPunct(")")) {
        do {
          if (this.isPunct(")")) break;
          params.push(this.parseType());
        } while (this.eatPunct(","));
      }
      this.expectPunct(")");
      this.expectPunct("->");
      const ret = this.parseType();
      return { kind: "FuncType", loc: this.locFrom(start), params, ret };
    }
    return this.parsePrimaryType();
  }

  parsePrimaryType(): TypeNode {
    const t = this.peek();
    const start = t.loc;
    if (this.isPunct("(")) {
      this.advance();
      if (this.eatPunct(")")) return { kind: "UnitType", loc: this.locFrom(start) };
      const types: TypeNode[] = [];
      do {
        if (this.isPunct(")")) break;
        types.push(this.parseType());
      } while (this.eatPunct(","));
      this.expectPunct(")");
      return { kind: "TupleType", loc: this.locFrom(start), types };
    }
    if (this.isPunct("[")) {
      this.advance();
      const elem = this.parseType();
      this.expectPunct("]");
      return { kind: "ArrayType", loc: this.locFrom(start), elem };
    }
    // `map`, `option`, `result` are not keywords — they are Ident tokens.
    // Treat them as the corresponding sugar type nodes.
    if ((this.isKeyword("map") || (t.kind === "Ident" && t.value === "map"))) {
      this.advance();
      this.expectPunct("[");
      const key = this.parseType();
      this.expectPunct("]");
      const value = this.parseType();
      return { kind: "MapType", loc: this.locFrom(start), key, value };
    }
    if ((this.isKeyword("option") || (t.kind === "Ident" && t.value === "option"))) {
      this.advance();
      this.expectPunct("<");
      const inner = this.parseType();
      this.expectPunct(">");
      return { kind: "OptionType", loc: this.locFrom(start), inner };
    }
    if ((this.isKeyword("result") || (t.kind === "Ident" && t.value === "result"))) {
      this.advance();
      this.expectPunct("<");
      const ok = this.parseType();
      this.expectPunct(",");
      const err = this.parseType();
      this.expectPunct(">");
      return { kind: "ResultType", loc: this.locFrom(start), ok, err };
    }
    if (t.kind === "Ident" || t.kind === "Keyword") {
      // Primitive names: int, float, bool, string, char, unit
      const name = this.advance().value;
      if (PRIMITIVE_TYPES.has(name)) {
        return { kind: "PrimitiveType", loc: this.locFrom(start), name };
      }
      // `unit` keyword
      if (name === "unit") return { kind: "UnitType", loc: this.locFrom(start) };
      if (this.isPunct("<")) {
        this.advance();
        const args: TypeNode[] = [];
        do {
          if (this.isPunct(">")) break;
          args.push(this.parseType());
        } while (this.eatPunct(","));
        this.expectPunct(">");
        return { kind: "GenericType", loc: this.locFrom(start), name, args };
      }
      return { kind: "NamedType", loc: this.locFrom(start), name };
    }
    this.err(`expected type, found '${t.value || "<eof>"}' at ${locStr(t.loc)}`);
    return { kind: "UnitType", loc: this.locFrom(start) };
  }

  // =====================================================================
  // Patterns
  // =====================================================================
  parsePattern(): Pattern {
    let p = this.parsePatternAtom();
    if (this.isPunct("|")) {
      const patterns: Pattern[] = [p];
      while (this.eatPunct("|")) patterns.push(this.parsePatternAtom());
      const start = p.loc.start;
      p = { kind: "OrPat", loc: makeLoc(start, this.tokens[this.pos - 1].loc.end, this.file), patterns };
    }
    return p;
  }

  parsePatternAtom(): Pattern {
    const t = this.peek();
    const start = t.loc;
    if (this.isPunct("_") || (t.kind === "Ident" && t.value === "_")) {
      this.advance();
      return { kind: "WildcardPat", loc: this.locFrom(start) };
    }
    if (this.isPunct("..")) {
      this.advance();
      return { kind: "RestPat", loc: this.locFrom(start) };
    }
    if (this.isPunct("(")) {
      this.advance();
      const elements: Pattern[] = [];
      if (!this.isPunct(")")) {
        do {
          if (this.isPunct(")")) break;
          elements.push(this.parsePattern());
        } while (this.eatPunct(","));
      }
      this.expectPunct(")");
      return { kind: "TuplePat", loc: this.locFrom(start), elements };
    }
    if (this.isPunct("[")) {
      this.advance();
      const elements: Pattern[] = [];
      let rest: number | null = null;
      if (!this.isPunct("]")) {
        let i = 0;
        do {
          if (this.isPunct("]")) break;
          if (this.isPunct("..")) {
            this.advance();
            rest = i;
          } else {
            elements.push(this.parsePattern());
            i++;
          }
        } while (this.eatPunct(","));
      }
      this.expectPunct("]");
      return { kind: "ArrayPat", loc: this.locFrom(start), elements, rest };
    }
    if (this.isKeyword("mut")) {
      this.advance();
      const name = this.expectIdent();
      let type: TypeNode | undefined;
      if (this.eatPunct(":")) type = this.parseType();
      return { kind: "BindPat", loc: this.locFrom(start), name: name ?? "_", mut: true, type };
    }
    if (t.kind === "Ident" || t.kind === "Keyword") {
      // Could be: enum variant `Enum::Variant(...)`, struct pat `Name { ... }`,
      // or a binding `x` / `x: type`.
      const name = this.advance().value;
      if (this.isPunct("::")) {
        this.advance();
        const variant = this.advance().value;
        let subpatterns: Pattern[] = [];
        if (this.eatPunct("(")) {
          if (!this.isPunct(")")) {
            do {
              if (this.isPunct(")")) break;
              subpatterns.push(this.parsePattern());
            } while (this.eatPunct(","));
          }
          this.expectPunct(")");
        }
        return { kind: "EnumPat", loc: this.locFrom(start), enumName: name, variant, subpatterns };
      }
      if (this.isPunct("{")) {
        this.advance();
        const fields: { name: string; pattern: Pattern; loc: SourceLocation }[] = [];
        let hasRest = false;
        if (!this.isPunct("}")) {
          do {
            if (this.isPunct("}")) break;
            if (this.isPunct("..")) { this.advance(); hasRest = true; break; }
            const fname = this.expectIdent();
            let pat: Pattern;
            if (this.eatPunct(":")) pat = this.parsePattern();
            else if (fname) pat = { kind: "BindPat", loc: this.locFrom(start), name: fname };
            else pat = { kind: "WildcardPat", loc: this.locFrom(start) };
            if (fname) fields.push({ name: fname, pattern: pat, loc: this.locFrom(start) });
          } while (this.eatPunct(","));
        }
        this.expectPunct("}");
        return { kind: "StructPat", loc: this.locFrom(start), name, fields, rest: hasRest };
      }
      // plain binding; allow `x: type` annotation
      let type: TypeNode | undefined;
      if (this.eatPunct(":")) type = this.parseType();
      return { kind: "BindPat", loc: this.locFrom(start), name, type };
    }
    // literal pattern: int, float, string, char, bool, -literal
    if (t.kind === "Int" || t.kind === "Float" || t.kind === "Hex" || t.kind === "Binary" || t.kind === "Octal" || t.kind === "Char" || t.kind === "String") {
      const e = this.parseAtom(true);
      return { kind: "LitPat", loc: this.locFrom(start), value: e };
    }
    if (this.isKeyword("true") || this.isKeyword("false")) {
      const e = this.parseAtom(true);
      return { kind: "LitPat", loc: this.locFrom(start), value: e };
    }
    if (this.isPunct("-")) {
      const e = this.parseExpr();
      return { kind: "LitPat", loc: this.locFrom(start), value: e };
    }
    this.err(`expected pattern, found '${t.value || "<eof>"}' at ${locStr(t.loc)}`);
    return { kind: "WildcardPat", loc: this.locFrom(start) };
  }

  // =====================================================================
  // Expressions
  // =====================================================================
  parseExpr(allowStruct = true): Expr {
    return this.parseBinary(0, allowStruct);
  }

  parseBinary(minPrec: number, allowStruct: boolean): Expr {
    let left = this.parseUnary(allowStruct);
    while (true) {
      const t = this.peek();
      if (t.kind === "Punct" && (t.value in BIN_PREC) && BIN_PREC[t.value] >= minPrec) {
        const op = this.advance().value;
        const right = this.parseBinary(BIN_PREC[op] + 1, allowStruct);
        left = { kind: "Binary", loc: this.locFrom(left.loc), op, left, right };
        left = this.applyPostfix(left, allowStruct);
        continue;
      }
      if (t.kind === "Keyword" && t.value === "as" && AS_PREC >= minPrec) {
        this.advance();
        const type = this.parseType();
        left = { kind: "As", loc: this.locFrom(left.loc), expr: left, type };
        left = this.applyPostfix(left, allowStruct);
        continue;
      }
      // `or` keyword as low-precedence short-circuit (Python-style: returns the
      // value, not a bool). Kept distinct from the boolean `||` operator so the
      // sema layer can type them differently.
      if (t.kind === "Keyword" && t.value === "or" && 0 >= minPrec) {
        this.advance();
        const right = this.parseBinary(1, allowStruct);
        left = { kind: "Binary", loc: this.locFrom(left.loc), op: "or", left, right };
        continue;
      }
      // Range
      if (t.kind === "Punct" && (t.value === ".." || t.value === "..=") && RANGE_PREC >= minPrec) {
        const op = this.advance().value;
        const right = this.parseBinary(RANGE_PREC + 1, allowStruct);
        left = { kind: "Range", loc: this.locFrom(left.loc), start: left, end: right, inclusive: op === "..=" };
        continue;
      }
      break;
    }
    return left;
  }

  parseUnary(allowStruct: boolean): Expr {
    const t = this.peek();
    if (t.kind === "Punct" && (t.value === "!" || t.value === "-" || t.value === "~")) {
      const op = this.advance().value;
      const operand = this.parseUnary(allowStruct);
      return { kind: "Unary", loc: this.locFrom(t.loc), op, operand };
    }
    return this.parsePostfix(undefined, allowStruct);
  }

  parsePostfix(initial: Expr | undefined, allowStruct: boolean): Expr {
    let e = initial ?? this.parseAtom(allowStruct);
    while (true) {
      const t = this.peek();
      if (t.kind === "Punct" && t.value === "(") {
        const start = e.loc.start;
        this.advance();
        const args: Expr[] = [];
        if (!this.isPunct(")")) {
          do {
            if (this.isPunct(")")) break;
            args.push(this.parseExpr());
          } while (this.eatPunct(","));
        }
        this.expectPunct(")");
        e = { kind: "Call", loc: this.locFrom({ start, end: start, file: this.file }), callee: e, args };
        continue;
      }
      if (t.kind === "Punct" && t.value === "[") {
        const start = e.loc.start;
        this.advance();
        const index = this.parseExpr();
        this.expectPunct("]");
        e = { kind: "Index", loc: this.locFrom({ start, end: start, file: this.file }), object: e, index };
        continue;
      }
      if (t.kind === "Punct" && t.value === ".") {
        const start = e.loc.start;
        this.advance();
        const next = this.peek();
        if (next.kind === "Int") {
          this.advance();
          e = { kind: "TupleField", loc: this.locFrom({ start, end: start, file: this.file }), object: e, index: parseInt(next.value, 10) };
          continue;
        }
        const name = next.value;
        if (next.kind !== "Ident" && next.kind !== "Keyword") {
          this.err(`expected field name, found '${next.value}' at ${locStr(next.loc)}`);
          break;
        }
        this.advance();
        if (this.isPunct("(")) {
          this.advance();
          const args: Expr[] = [];
          if (!this.isPunct(")")) {
            do {
              if (this.isPunct(")")) break;
              args.push(this.parseExpr());
            } while (this.eatPunct(","));
          }
          this.expectPunct(")");
          e = { kind: "MethodCall", loc: this.locFrom({ start, end: start, file: this.file }), object: e, name, args };
        } else {
          e = { kind: "Field", loc: this.locFrom({ start, end: start, file: this.file }), object: e, name };
        }
        continue;
      }
      if (t.kind === "Punct" && t.value === "?") {
        const start = e.loc.start;
        this.advance();
        e = { kind: "ErrorProp", loc: this.locFrom({ start, end: start, file: this.file }), expr: e };
        continue;
      }
      if (allowStruct && t.kind === "Punct" && t.value === "{") {
        // Struct literal — only if followed by `Ident:` or `}` and the callee
        // is an Ident (not an arbitrary expression).
        if (e.kind === "Ident") {
          const save = this.pos;
          this.advance();
          if (this.isPunct("}")) {
            // empty struct literal
            this.advance();
            e = { kind: "StructExpr", loc: this.locFrom(e.loc), name: e.name, fields: [], spread: null };
            continue;
          }
          // peek for `Ident :` pattern
          if (this.peek().kind === "Ident" && this.isPunct(":", 1)) {
            const fields: StructExprField[] = [];
            do {
              if (this.isPunct("}")) break;
              if (this.isPunct("..")) break; // trailing spread handled below
              const fname = this.advance().value;
              this.expectPunct(":");
              const value = this.parseExpr(false);
              fields.push({ name: fname, value, loc: this.locFrom({ start: this.peek().loc.start, end: this.peek().loc.start, file: this.file }) });
            } while (this.eatPunct(","));
            let spread: Expr | null = null;
            if (this.isPunct("..")) {
              this.advance();
              spread = this.parseExpr(false);
              // allow optional trailing comma after spread
              this.eatPunct(",");
            }
            this.expectPunct("}");
            e = { kind: "StructExpr", loc: this.locFrom(e.loc), name: e.name, fields, spread };
            continue;
          }
          // Not a struct literal — restore and bail out
          this.pos = save;
          break;
        }
      }
      break;
    }
    return e;
  }

  applyPostfix(e: Expr, allowStruct: boolean): Expr {
    return this.parsePostfix(e, allowStruct);
  }

  parseAtom(allowStruct: boolean): Expr {
    const t = this.peek();
    const start = t.loc;
    if (t.kind === "Int") {
      this.advance();
      return { kind: "IntLit", loc: this.locFrom(start), value: parseInt(t.value, 10) };
    }
    if (t.kind === "Float") {
      this.advance();
      return { kind: "FloatLit", loc: this.locFrom(start), value: parseFloat(t.value) };
    }
    if (t.kind === "Hex") {
      this.advance();
      return { kind: "IntLit", loc: this.locFrom(start), value: parseInt(t.value.slice(2), 16) };
    }
    if (t.kind === "Binary") {
      this.advance();
      return { kind: "IntLit", loc: this.locFrom(start), value: parseInt(t.value.slice(2), 2) };
    }
    if (t.kind === "Octal") {
      this.advance();
      return { kind: "IntLit", loc: this.locFrom(start), value: parseInt(t.value.slice(2), 8) };
    }
    if (t.kind === "Char") {
      this.advance();
      return { kind: "CharLit", loc: this.locFrom(start), value: t.value };
    }
    if (t.kind === "String") {
      this.advance();
      const segments = this.parseStringSegments(t.segments || []);
      return { kind: "StringLit", loc: this.locFrom(start), segments };
    }
    if (t.kind === "Keyword") {
      if (t.value === "true") { this.advance(); return { kind: "BoolLit", loc: this.locFrom(start), value: true }; }
      if (t.value === "false") { this.advance(); return { kind: "BoolLit", loc: this.locFrom(start), value: false }; }
      if (t.value === "self") { this.advance(); return { kind: "SelfExpr", loc: this.locFrom(start) }; }
      if (t.value === "unit") { this.advance(); return { kind: "UnitLit", loc: this.locFrom(start) }; }
      if (t.value === "fn") {
        // lambda
        this.advance();
        const params = this.parseParams();
        let ret: TypeNode | undefined;
        if (this.eatPunct("->")) ret = this.parseType();
        const body = this.parseBlock();
        return { kind: "Lambda", loc: this.locFrom(start), params, ret, body };
      }
      if (t.value === "return") {
        this.advance();
        let expr: Expr | null = null;
        if (!this.isPunct(";") && !this.isPunct("}") && !this.isPunct(")") && !this.atEnd()) {
          expr = this.parseExpr();
        }
        return { kind: "Return", loc: this.locFrom(start), expr };
      }
      if (t.value === "if") return this.parseIf();
      if (t.value === "match") return this.parseMatch();
      if (t.value === "range") {
        // could be a function call: range(a, b)
        this.advance();
        if (this.isPunct("(")) {
          this.advance();
          const args: Expr[] = [];
          if (!this.isPunct(")")) {
            do {
              if (this.isPunct(")")) break;
              args.push(this.parseExpr());
            } while (this.eatPunct(","));
          }
          this.expectPunct(")");
          return { kind: "Call", loc: this.locFrom(start), callee: { kind: "Ident", loc: this.locFrom(start), name: "range" }, args };
        }
        // bare `range` ident
        return { kind: "Ident", loc: this.locFrom(start), name: "range" };
      }
      // other keywords used as identifiers (rare) — fall through
    }
    if (this.isPunct("(")) {
      this.advance();
      if (this.eatPunct(")")) return { kind: "UnitLit", loc: this.locFrom(start) };
      const e = this.parseExpr();
      if (this.eatPunct(",")) {
        const elements: Expr[] = [e];
        do {
          if (this.isPunct(")")) break;
          elements.push(this.parseExpr());
        } while (this.eatPunct(","));
        this.expectPunct(")");
        return { kind: "TupleExpr", loc: this.locFrom(start), elements };
      }
      this.expectPunct(")");
      return { kind: "Paren", loc: this.locFrom(start), expr: e };
    }
    if (this.isPunct("[")) {
      this.advance();
      const elements: Expr[] = [];
      if (!this.isPunct("]")) {
        do {
          if (this.isPunct("]")) break;
          if (this.isPunct("..")) {
            this.advance();
            const spread = this.parseExpr(false);
            void spread;
            // for v1 we ignore spread in arrays (would desugar in future)
            continue;
          }
          elements.push(this.parseExpr());
        } while (this.eatPunct(","));
      }
      this.expectPunct("]");
      return { kind: "ArrayExpr", loc: this.locFrom(start), elements };
    }
    if (this.isPunct("{")) {
      return this.parseBraceExpr();
    }
    if (t.kind === "Ident") {
      const name = this.advance().value;
      // EnumVariant: Name::Variant
      if (this.isPunct("::")) {
        this.advance();
        const variant = this.advance().value;
        let args: Expr[] = [];
        if (this.eatPunct("(")) {
          if (!this.isPunct(")")) {
            do {
              if (this.isPunct(")")) break;
              args.push(this.parseExpr());
            } while (this.eatPunct(","));
          }
          this.expectPunct(")");
        }
        return { kind: "EnumVariant", loc: this.locFrom(start), enumName: name, variant, args };
      }
      // Generic instantiation: name<type, ...>(args). Disambiguate from a
      // comparison `name < x` by peeking: the token right after `<` must be a
      // valid type-starting token.
      if (this.isPunct("<") && couldStartType(this.peek(1))) {
        const save = this.pos;
        const saveErrCount = this.errors.length;
        this.advance(); // consume `<`
        const typeArgs: TypeNode[] = [];
        let valid = true;
        try {
          do {
            if (this.isPunct(">")) break;
            typeArgs.push(this.parseType());
          } while (this.eatPunct(","));
          if (!this.eatPunct(">")) valid = false;
        } catch {
          valid = false;
        }
        const errored = this.errors.length !== saveErrCount;
        if (valid && !errored && this.isPunct("(")) {
          this.advance();
          const args: Expr[] = [];
          if (!this.isPunct(")")) {
            do {
              if (this.isPunct(")")) break;
              args.push(this.parseExpr());
            } while (this.eatPunct(","));
          }
          this.expectPunct(")");
          return { kind: "Call", loc: this.locFrom(start), callee: { kind: "Ident", loc: this.locFrom(start), name }, args, typeArgs };
        }
        // not a generic call — restore and treat as plain ident
        this.errors.length = saveErrCount;
        this.pos = save;
      }
      return { kind: "Ident", loc: this.locFrom(start), name };
    }
    if (t.kind === "Eof" || t.kind === "Error") {
      this.err(`unexpected end of input at ${locStr(t.loc)}`);
      return { kind: "UnitLit", loc: this.locFrom(start) };
    }
    this.err(`unexpected token '${t.value}' at ${locStr(t.loc)}`);
    this.advance();
    return { kind: "UnitLit", loc: this.locFrom(start) };
  }

  parseStringSegments(segments: StringSegment[]): StringSegment[] {
    return segments.map(seg => {
      if (seg.kind === "text") return seg;
      // re-lex and parse the inner expression
      try {
        const innerTokens = lexSource(seg.value, this.file);
        const sub = new Parser(innerTokens, this.file);
        if (sub.tokens.length > 1) {
          const e = sub.parseExpr();
          if (sub.errors.length > 0) {
            for (const err of sub.errors) this.errors.push(err);
          }
          return { kind: "interp", value: seg.value, expr: e };
        }
      } catch (e) {
        this.err(`failed to parse interpolation '${seg.value}': ${(e as Error).message}`);
      }
      return seg;
    });
  }

  parseIf(): Expr {
    const start = this.peek().loc;
    this.advance(); // if
    const cond = this.parseExpr(false);
    const then = this.parseBlock();
    let els: Expr | null = null;
    if (this.eatKeyword("else")) {
      if (this.isKeyword("if")) els = this.parseIf();
      else els = this.parseBlock();
    }
    return { kind: "If", loc: this.locFrom(start), cond, then, else: els };
  }

  parseMatch(): Expr {
    const start = this.peek().loc;
    this.advance();
    const scrutinee = this.parseExpr(false);
    this.expectPunct("{");
    const arms: MatchArm[] = [];
    while (!this.isPunct("}") && !this.atEnd()) {
      const aStart = this.peek().loc;
      const pattern = this.parsePattern();
      let guard: Expr | null = null;
      if (this.eatKeyword("if")) guard = this.parseExpr(false);
      this.expectPunct("=>");
      const body = this.parseExpr();
      arms.push({ pattern, guard, body, loc: this.locFrom(aStart) });
      if (!this.eatPunct(",")) {
        // allow trailing without comma if next is `}`
        if (!this.isPunct("}")) {
          this.err(`expected ',' or '}' after match arm at ${locStr(this.peek().loc)}`);
          this.recover();
        }
      }
    }
    this.expectPunct("}");
    return { kind: "Match", loc: this.locFrom(start), scrutinee, arms };
  }

  parseBlock(): any /* Block */ {
    const start = this.peek().loc;
    this.expectPunct("{");
    const stmts: Stmt[] = [];
    let trailing: Expr | null = null;
    while (!this.isPunct("}") && !this.atEnd()) {
      if (this.isStmtStart()) {
        const s = this.parseStmt();
        if (s) stmts.push(s);
        continue;
      }
      const e = this.parseExpr();
      if (this.isPunct("=")) {
        // assignment statement
        this.advance();
        const value = this.parseExpr();
        this.expectPunct(";");
        stmts.push({ kind: "AssignStmt", loc: this.locFrom(start), target: e, value });
        continue;
      }
      if (this.isPunct("+=") || this.isPunct("-=") || this.isPunct("*=") || this.isPunct("/=") || this.isPunct("%=")) {
        const op = this.advance().value[0];
        const value = this.parseExpr();
        this.expectPunct(";");
        stmts.push({ kind: "AssignStmt", loc: this.locFrom(start), target: e, value: { kind: "CompoundAssign", loc: this.locFrom(start), op, target: e, value } });
        continue;
      }
      if (this.isPunct(";")) {
        this.advance();
        if (isAssignmentExpr(e)) {
          stmts.push({ kind: "AssignStmt", loc: e.loc, target: (e as any).target, value: (e as any).value });
        } else {
          stmts.push({ kind: "ExprStmt", loc: this.locFrom(start), expr: e });
        }
        continue;
      }
      if (this.isPunct("}")) {
        trailing = e;
        break;
      }
      this.err(`expected ';', found '${this.peek().value}' at ${locStr(this.peek().loc)}`);
      this.recover();
    }
    this.expectPunct("}");
    return { kind: "Block", loc: this.locFrom(start), stmts, expr: trailing };
  }

  parseBraceExpr(): Expr {
    const start = this.peek().loc;
    this.advance(); // `{`
    if (this.isPunct("}")) { this.advance(); return { kind: "Block", loc: this.locFrom(start), stmts: [], expr: null }; }
    if (!this.isStmtStart()) {
      // Could be a map literal: { key: value, ... } or a block.
      const firstExpr = this.parseExpr();
      if (this.isPunct(":")) {
        this.advance();
        const value = this.parseExpr();
        const entries: MapEntry[] = [{ key: firstExpr, value, loc: this.locFrom(start) }];
        while (this.eatPunct(",")) {
          if (this.isPunct("}")) break;
          const k = this.parseExpr();
          this.expectPunct(":");
          const v = this.parseExpr();
          entries.push({ key: k, value: v, loc: this.locFrom(start) });
        }
        this.expectPunct("}");
        return { kind: "MapExpr", loc: this.locFrom(start), entries };
      }
      // It's a block. firstExpr is either ExprStmt or trailing.
      const stmts: Stmt[] = [];
      if (this.isPunct(";")) {
        this.advance();
        if (isAssignmentExpr(firstExpr)) {
          stmts.push({ kind: "AssignStmt", loc: firstExpr.loc, target: (firstExpr as any).target, value: (firstExpr as any).value });
        } else {
          stmts.push({ kind: "ExprStmt", loc: this.locFrom(start), expr: firstExpr });
        }
      } else if (this.isPunct("}")) {
        this.advance();
        return { kind: "Block", loc: this.locFrom(start), stmts, expr: firstExpr };
      } else {
        this.err(`expected ';' or '}' in block at ${locStr(this.peek().loc)}`);
        this.recover();
      }
      // continue parsing rest of block
      let trailing: Expr | null = null;
      while (!this.isPunct("}") && !this.atEnd()) {
        if (this.isStmtStart()) {
          const s = this.parseStmt();
          if (s) stmts.push(s);
          continue;
        }
        const e = this.parseExpr();
        if (this.isPunct(";")) {
          this.advance();
          if (isAssignmentExpr(e)) {
            stmts.push({ kind: "AssignStmt", loc: e.loc, target: (e as any).target, value: (e as any).value });
          } else {
            stmts.push({ kind: "ExprStmt", loc: this.locFrom(start), expr: e });
          }
        } else if (this.isPunct("}")) {
          trailing = e;
          break;
        } else {
          this.err(`expected ';' or '}' in block at ${locStr(this.peek().loc)}`);
          this.recover();
        }
      }
      this.expectPunct("}");
      return { kind: "Block", loc: this.locFrom(start), stmts, expr: trailing };
    }
    // Statement-start: parse statements
    const stmts: Stmt[] = [];
    let trailing: Expr | null = null;
    while (!this.isPunct("}") && !this.atEnd()) {
      if (this.isStmtStart()) {
        const s = this.parseStmt();
        if (s) stmts.push(s);
        continue;
      }
      const e = this.parseExpr();
      if (this.isPunct(";")) {
        this.advance();
        if (isAssignmentExpr(e)) {
          stmts.push({ kind: "AssignStmt", loc: e.loc, target: (e as any).target, value: (e as any).value });
        } else {
          stmts.push({ kind: "ExprStmt", loc: this.locFrom(start), expr: e });
        }
      } else if (this.isPunct("}")) {
        trailing = e;
        break;
      } else {
        this.err(`expected ';' or '}' in block at ${locStr(this.peek().loc)}`);
        this.recover();
      }
    }
    this.expectPunct("}");
    return { kind: "Block", loc: this.locFrom(start), stmts, expr: trailing };
  }

  isStmtStart(): boolean {
    const t = this.peek();
    if (t.kind !== "Keyword") return false;
    if (t.value === "fn") {
      // `fn name` is a declaration; `fn(` is a lambda expression.
      return this.peek(1).kind === "Ident";
    }
    return [
      "let", "const", "enum", "struct", "type", "return", "break",
      "continue", "while", "for", "import", "pub", "print",
    ].includes(t.value);
  }
}

function isAssignmentExpr(e: Expr): boolean {
  return e.kind === "Assign" || e.kind === "CompoundAssign";
}

const PRIMITIVE_TYPES = new Set<string>(["int", "float", "bool", "string", "char"]);

function locStr(loc: SourceLocation): string {
  return `${loc.start.line}:${loc.start.col}`;
}

/** Whether a token could plausibly start a type. */
function couldStartType(t: Token): boolean {
  if (t.kind === "Ident") return true;
  if (t.kind === "Keyword" && ["fn", "map", "option", "result", "unit", "self", "true", "false"].includes(t.value)) return t.value === "fn" || t.value === "map" || t.value === "option" || t.value === "result" || t.value === "unit";
  if (t.kind === "Punct" && (t.value === "(" || t.value === "[")) return true;
  return false;
}

// Thrown to abort a sub-parse for error recovery.
class ParseAbort extends Error {
  loc: SourceLocation;
  constructor(message: string, loc: SourceLocation) {
    super(message);
    this.loc = loc;
  }
}

// Re-lex a snippet of source (used for string interpolation segments).
function lexSource(source: string, file: string): Token[] {
  return lex(source, file);
}
