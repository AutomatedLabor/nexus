/**
 * aether/core/lexer/lexer.ts
 * =========================
 * The Aether tokenizer.
 *
 * Token model (single String token carries interpolation segments)
 * ----------------------------------------------------------------
 * We tokenize a string literal — including interpolated forms like
 * `f"Hello, {name}!"` — as a *single* token of kind `"String"`. Its `value`
 * field is a list of `StringSegment` objects where each segment is either
 * `{ kind: "text", value: "..." }` (raw text) or
 * `{ kind: "interp", value: "name" }` (the raw inner source, including
 * nested `{ }` for arbitrary expressions). The parser re-lexes/parses the
 * `interp` segments into Expr nodes when building the AST.
 *
 * For nested interpolations and nested strings inside interpolation, the
 * lexer tracks brace depth and string state. We support arbitrary nesting.
 *
 * Tokens produced
 * ---------------
 *   Int, Float, Hex, Binary, Octal, Char, String, Ident, Keyword, Punct, Eof.
 * Plus an Error token used by `lexWithErrors` (lexer keeps going past errors).
 *
 * Whitespace and comments (line // and nestable block comments) are skipped,
 * but block comments that are not terminated produce an error.
 *
 * Source locations
 * ---------------
 * Every token has a `loc: SourceLocation` spanning its slice of the source.
 * `Position` is 1-based line/col, plus 0-based absolute offset.
 */
import { loc as makeLoc, type SourceLocation, type Position } from "../ast/ast";
import type { StringSegment } from "../ast/ast";

export type TokenKind =
  | "Int"
  | "Float"
  | "Hex"
  | "Binary"
  | "Octal"
  | "Char"
  | "String"
  | "Ident"
  | "Keyword"
  | "Punct"
  | "Eof"
  | "Error";

export interface Token {
  kind: TokenKind;
  value: string;       // raw source slice (for Int/Float/Ident/etc.). For String tokens, segments are in `segments`.
  segments?: StringSegment[]; // present on String tokens
  loc: SourceLocation;
}

export interface LexError {
  message: string;
  loc: SourceLocation;
}

const KEYWORDS = new Set<string>([
  "let", "mut", "const", "fn", "enum", "struct", "type", "match", "if",
  "else", "while", "for", "in", "return", "break", "continue", "print",
  "true", "false", "unit", "self", "as", "range", "import", "pub", "use",
  "or", "do",
  // v3: trait / impl / dyn
  "trait", "impl", "dyn",
  // v3-borrow: move expression (RFC-004)
  "move",
]);

const PUNCT = [
  // longer operators first — handled by longest-match loop below
  "..=", "...", "..", "::", "->", "=>", "==", "!=", "<=", ">=", "&&", "||",
  "+=", "-=", "*=", "/=", "%=", "<<", ">>", "??", "?", "!", "~",
  "+", "-", "*", "/", "%", "&", "|", "^", "<", ">", "=",
  "(", ")", "[", "]", "{", "}", ",", ";", ":", ".", "@", "#",
];
// Sort by descending length so the longest match wins.
const PUNCT_SORTED = [...PUNCT].sort((a, b) => b.length - a.length);

const IDENT_START = /[\p{ID_Start}$_]/u;
const IDENT_CONT = /[\p{ID_Continue}$_]/u;

//----------------------------------------------------------------------------
// Lexer state
//----------------------------------------------------------------------------
interface State {
  src: string;
  file: string;
  pos: number;
  line: number;
  col: number;
  tokens: Token[];
  errors: LexError[];
}

function cur(s: State): string {
  return s.pos < s.src.length ? s.src[s.pos] : "";
}

function peek(s: State, n: number): string {
  return s.pos + n < s.src.length ? s.src[s.pos + n] : "";
}

function advance(s: State): string {
  const c = s.src[s.pos];
  if (c === "\n") { s.line++; s.col = 1; }
  else { s.col++; }
  s.pos++;
  return c;
}

function posOf(s: State): Position {
  return { line: s.line, col: s.col, offset: s.pos };
}

function locFrom(s: State, start: Position): SourceLocation {
  return makeLoc(start, { line: s.line, col: s.col, offset: s.pos }, s.file);
}

function push(s: State, kind: TokenKind, start: Position, value: string, segments?: StringSegment[]): void {
  const t: Token = {
    kind,
    value,
    loc: makeLoc(start, { line: s.line, col: s.col, offset: s.pos }, s.file),
  };
  if (segments) t.segments = segments;
  s.tokens.push(t);
}

function err(s: State, start: Position, message: string): void {
  s.errors.push({ message, loc: makeLoc(start, { line: s.line, col: s.col, offset: s.pos }, s.file) });
  // also push an Error token so the parser can recover
  s.tokens.push({ kind: "Error", value: "", loc: makeLoc(start, { line: s.line, col: s.col, offset: s.pos }, s.file) });
}

//----------------------------------------------------------------------------
// Public API
//----------------------------------------------------------------------------
export function lex(source: string, file = "<aether>"): Token[] {
  return lexWithErrors(source, file).tokens;
}

export function lexWithErrors(source: string, file = "<aether>"): { tokens: Token[]; errors: LexError[] } {
  const s: State = { src: source, file, pos: 0, line: 1, col: 1, tokens: [], errors: [] };
  while (s.pos < s.src.length) {
    const start = posOf(s);
    const c = cur(s);
    // Whitespace
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { advance(s); continue; }
    // Comments
    if (c === "/" && peek(s, 1) === "/") { skipLineComment(s); continue; }
    if (c === "/" && peek(s, 1) === "*") { skipBlockComment(s, start); continue; }
    // Numbers
    if (isDigit(c) || (c === "." && isDigit(peek(s, 1)) && !prevIsAtom(s))) { scanNumber(s, start); continue; }
    // Char
    if (c === "'") { scanChar(s, start); continue; }
    // String (possibly f-string)
    if (c === '"' || (c === "f" && peek(s, 1) === '"')) { scanString(s, start); continue; }
    // Identifiers / keywords
    if (IDENT_START.test(c)) { scanIdent(s, start); continue; }
    // Punctuation
    if (scanPunct(s, start)) continue;
    // Unrecognized character
    err(s, start, `unexpected character '${c}'`);
    advance(s);
  }
  // EOF token
  const eofPos = posOf(s);
  s.tokens.push({
    kind: "Eof",
    value: "",
    loc: makeLoc(eofPos, eofPos, s.file),
  });
  return { tokens: s.tokens, errors: s.errors };
}

function isDigit(c: string): boolean { return c >= "0" && c <= "9"; }
function isHexDigit(c: string): boolean { return /[0-9a-fA-F]/.test(c); }
function isBinDigit(c: string): boolean { return c === "0" || c === "1"; }
function isOctDigit(c: string): boolean { return c >= "0" && c <= "7"; }

/** Whether the previous token is something that, if followed by `.`, must
 *  be treated as field access rather than the start of a float literal. */
function prevIsAtom(s: State): boolean {
  const prev = s.tokens[s.tokens.length - 1];
  if (!prev) return false;
  if (prev.kind === "Ident" || prev.kind === "Char" || prev.kind === "String") return true;
  if (prev.kind === "Int" || prev.kind === "Float" || prev.kind === "Hex" || prev.kind === "Binary" || prev.kind === "Octal") return true;
  if (prev.kind === "Punct" && (prev.value === ")" || prev.value === "]")) return true;
  if (prev.kind === "Keyword" && (prev.value === "true" || prev.value === "false" || prev.value === "self" || prev.value === "unit")) return true;
  return false;
}

//----------------------------------------------------------------------------
// Comment skippers
//----------------------------------------------------------------------------
function skipLineComment(s: State): void {
  while (s.pos < s.src.length && cur(s) !== "\n") advance(s);
}

function skipBlockComment(s: State, start: Position): void {
  advance(s); advance(s); // consume "/*"
  let depth = 1;
  while (s.pos < s.src.length && depth > 0) {
    if (cur(s) === "/" && peek(s, 1) === "*") {
      advance(s); advance(s); depth++;
    } else if (cur(s) === "*" && peek(s, 1) === "/") {
      advance(s); advance(s); depth--;
    } else {
      advance(s);
    }
  }
  if (depth > 0) err(s, start, "unterminated block comment");
}

//----------------------------------------------------------------------------
// Numbers
//----------------------------------------------------------------------------
function scanNumber(s: State, start: Position): void {
  let raw = "";
  // Hex / binary / octal
  if (cur(s) === "0" && (peek(s, 1) === "x" || peek(s, 1) === "X")) {
    advance(s); advance(s);
    while (s.pos < s.src.length && (isHexDigit(cur(s)) || cur(s) === "_")) raw += advance(s);
    push(s, "Hex", start, "0x" + raw.replace(/_/g, ""));
    return;
  }
  if (cur(s) === "0" && (peek(s, 1) === "b" || peek(s, 1) === "B")) {
    advance(s); advance(s);
    while (s.pos < s.src.length && (isBinDigit(cur(s)) || cur(s) === "_")) raw += advance(s);
    push(s, "Binary", start, "0b" + raw.replace(/_/g, ""));
    return;
  }
  if (cur(s) === "0" && (peek(s, 1) === "o" || peek(s, 1) === "O")) {
    advance(s); advance(s);
    while (s.pos < s.src.length && (isOctDigit(cur(s)) || cur(s) === "_")) raw += advance(s);
    push(s, "Octal", start, "0o" + raw.replace(/_/g, ""));
    return;
  }
  // Decimal int / float
  let isFloat = false;
  let enteredExp = false;
  while (s.pos < s.src.length && (isDigit(cur(s)) || cur(s) === "_")) raw += advance(s);
  // fractional part
  if (cur(s) === "." && isDigit(peek(s, 1))) {
    isFloat = true;
    raw += advance(s);
    while (s.pos < s.src.length && (isDigit(cur(s)) || cur(s) === "_")) raw += advance(s);
  }
  // exponent
  if (cur(s) === "e" || cur(s) === "E") {
    const save = s.pos;
    const saveLine = s.line, saveCol = s.col;
    enteredExp = true;
    let exp = advance(s); // e
    if (cur(s) === "+" || cur(s) === "-") exp += advance(s);
    if (isDigit(cur(s))) {
      isFloat = true;
      while (s.pos < s.src.length && isDigit(cur(s))) exp += advance(s);
      raw += exp;
    } else {
      // not an exponent; restore
      s.pos = save; s.line = saveLine; s.col = saveCol;
    }
  }
  // suffix-less int literal: ensure we didn't stop on a letter (e.g. "12abc").
  // Don't fail on 'e'/'E' from a recovered (failed) exponent parse — those
  // will be lexed as a separate Ident by the main loop.
  if (s.pos < s.src.length && IDENT_START.test(cur(s)) && !isDigit(cur(s))) {
    const isExpChar = cur(s) === "e" || cur(s) === "E";
    if (!isExpChar || !enteredExp) {
      while (s.pos < s.src.length && IDENT_CONT.test(cur(s))) raw += advance(s);
      err(s, start, `invalid number literal '${raw}'`);
      return;
    }
  }
  push(s, isFloat ? "Float" : "Int", start, raw.replace(/_/g, ""));
}

//----------------------------------------------------------------------------
// Characters
//----------------------------------------------------------------------------
function scanChar(s: State, start: Position): void {
  advance(s); // consume opening '
  let value = "";
  if (s.pos >= s.src.length) { err(s, start, "unterminated char literal"); return; }
  if (cur(s) === "\\") {
    advance(s);
    value = scanEscape(s);
  } else if (cur(s) === "'") {
    err(s, start, "empty char literal");
    advance(s);
    return;
  } else {
    value = advance(s);
  }
  if (cur(s) !== "'") { err(s, start, "unterminated char literal"); return; }
  advance(s); // consume closing '
  push(s, "Char", start, value);
}

function scanEscape(s: State): string {
  const c = advance(s);
  switch (c) {
    case "n": return "\n";
    case "r": return "\r";
    case "t": return "\t";
    case "0": return "\0";
    case "\\": return "\\";
    case "'": return "'";
    case '"': return '"';
    case "u": {
      // \u{...}
      let hex = "";
      if (cur(s) === "{") {
        advance(s);
        while (s.pos < s.src.length && cur(s) !== "}" && hex.length < 8) hex += advance(s);
        if (cur(s) === "}") advance(s);
      }
      const code = parseInt(hex, 16);
      return Number.isNaN(code) ? "" : String.fromCodePoint(code);
    }
    default: return c;
  }
}

//----------------------------------------------------------------------------
// Strings (with interpolation)
//----------------------------------------------------------------------------
function scanString(s: State, start: Position): void {
  let isF = false;
  if (cur(s) === "f") { isF = true; advance(s); }
  advance(s); // consume opening "
  const segments: StringSegment[] = [];
  let text = "";
  while (s.pos < s.src.length && cur(s) !== '"') {
    const c = cur(s);
    if (c === "\\") {
      advance(s);
      text += scanEscape(s);
      continue;
    }
    if (isF && c === "{") {
      if (text) { segments.push({ kind: "text", value: text }); text = ""; }
      // Scan until matching } accounting for nesting and strings.
      advance(s); // consume {
      let depth = 1;
      let inner = "";
      while (s.pos < s.src.length && depth > 0) {
        const c2 = cur(s);
        if (c2 === "{") { depth++; inner += advance(s); continue; }
        if (c2 === "}") {
          depth--;
          if (depth === 0) { advance(s); break; }
          inner += advance(s);
          continue;
        }
        if (c2 === '"') {
          // consume nested string verbatim
          inner += advance(s);
          while (s.pos < s.src.length && cur(s) !== '"') {
            if (cur(s) === "\\") { inner += advance(s); inner += advance(s); continue; }
            inner += advance(s);
          }
          if (s.pos < s.src.length) inner += advance(s); // closing "
          continue;
        }
        inner += advance(s);
      }
      if (depth > 0) { err(s, start, "unterminated string interpolation"); return; }
      segments.push({ kind: "interp", value: inner });
      continue;
    }
    text += advance(s);
  }
  if (text) segments.push({ kind: "text", value: text });
  if (s.pos >= s.src.length) { err(s, start, "unterminated string literal"); return; }
  advance(s); // consume closing "
  push(s, "String", start, "", segments);
}

//----------------------------------------------------------------------------
// Identifiers / keywords
//----------------------------------------------------------------------------
function scanIdent(s: State, start: Position): void {
  let raw = "";
  while (s.pos < s.src.length && IDENT_CONT.test(cur(s))) raw += advance(s);
  if (KEYWORDS.has(raw)) {
    push(s, "Keyword", start, raw);
  } else {
    push(s, "Ident", start, raw);
  }
  // Lookahead: 'f' prefix for f-strings is only allowed when not part of an
  // ident run. We always treat a single-char "f" immediately followed by `"`
  // as an f-string, so identifiers starting with `f` are unaffected.
}

//----------------------------------------------------------------------------
// Punctuation (longest-match)
//----------------------------------------------------------------------------
function scanPunct(s: State, start: Position): boolean {
  for (const p of PUNCT_SORTED) {
    if (startsWithAt(s, p)) {
      for (let i = 0; i < p.length; i++) advance(s);
      push(s, "Punct", start, p);
      return true;
    }
  }
  return false;
}

function startsWithAt(s: State, p: string): boolean {
  for (let i = 0; i < p.length; i++) {
    if (s.src[s.pos + i] !== p[i]) return false;
  }
  return true;
}

//----------------------------------------------------------------------------
// Helpers
//----------------------------------------------------------------------------
export function isKeyword(t: Token, kw: string): boolean {
  return t.kind === "Keyword" && t.value === kw;
}
export function isPunct(t: Token, p: string): boolean {
  return t.kind === "Punct" && t.value === p;
}
