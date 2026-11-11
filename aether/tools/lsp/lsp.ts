/**
 * aether/tools/lsp/lsp.ts
 * =======================
 * A real Language Server Protocol (LSP) implementation for the Aether
 * language. The server speaks JSON-RPC 2.0 over stdio and implements the
 * core LSP method surface — 20+ methods backed by the real Aether
 * pipeline (lex → parse → check → lint → format → run).
 *
 * Each LSP method consumes the cached per-document state:
 *   - tokens (from lex)
 *   - AST  (from parse)
 *   - nodeTypes map (from check)
 *   - lint diagnostics (from lint)
 *
 * Methods implemented (count = 21):
 *   1.  initialize                         — server capabilities handshake
 *   2.  shutdown                            — graceful shutdown
 *   3.  textDocument/didOpen                — track new document
 *   4.  textDocument/didChange              — update document content
 *   5.  textDocument/didClose               — drop document
 *   6.  textDocument/completion             — keywords + stdlib + scoped vars
 *   7.  textDocument/hover                  — type / docstring of identifier
 *   8.  textDocument/definition             — find declaration of identifier
 *   9.  textDocument/references             — all occurrences
 *  10.  textDocument/rename                 — WorkspaceEdit with changes
 *  11.  textDocument/publishDiagnostics     — type errors + lint (push)
 *  12.  textDocument/formatting             — run formatter, return TextEdit[]
 *  13.  textDocument/codeAction             — one CodeAction per lint fix
 *  14.  textDocument/semanticTokens/full    — delta-encoded token array
 *  15.  textDocument/documentSymbol         — top-level declarations
 *  16.  textDocument/signatureHelp          — signature of called function
 *  17.  textDocument/documentHighlight      — same-name occurrences in doc
 *  18.  textDocument/declaration            — alias of definition
 *  19.  textDocument/typeDefinition         — alias of definition (v1)
 *  20.  textDocument/implementation         — alias of definition (v1)
 *  21.  textDocument/codeLens              — one lens per fn: "fn N params"
 *
 * JSON-RPC transport: messages are framed with `Content-Length: N\r\n\r\n`
 * then a JSON body. `runLSP()` reads stdin, dispatches each message to
 * `handleMessage`, and writes the response (or notification) to stdout.
 * Tests call `handleMessage` directly with a parsed JSON message.
 *
 * Aether-specific notes
 * ---------------------
 * - The AST is *node-identity-keyed* in the type map (the checker stores
 *   types on the AST node object itself, not on a string id). This means
 *   each LSP query re-parses the document once and uses the resulting
 *   AST throughout — we can't look up types by (uri, range).
 * - Source positions are 1-based line/col in the AST and 0-based in LSP.
 *   `toLspPos` and `fromLspPos` convert between the two.
 * - Completion items use the LSP `InsertTextFormat.PlainText` and the
 *   Aether keyword/stdlib name as `insertText`.
 */
import {
  lexWithErrors,
  type Token,
  type LexError,
} from "../../core/lexer/lexer";
import { parse, type ParseError } from "../../core/parser/parser";
import { check, type TypeError } from "../../core/sema/sema";
import {
  type Program,
  type Stmt,
  type Expr,
  type Node,
  type FnDecl,
  type EnumDecl,
  type StructDecl,
  type TypeAlias,
  type Let,
  type MutLet,
  type Const,
  type Ident,
  type Call,
  type SourceLocation,
  type Position as AstPosition,
} from "../../core/ast/ast";
import { walk } from "../../core/ast/visitor";
import { format } from "../formatter/formatter";
import { lint, type LintDiagnostic } from "../linter/linter";
import {
  STDLIB_MANIFEST,
  findStdlibFn,
} from "../../stdlib/index";
import { typeToString, type Type, type TFunc } from "../../core/types/types";

//----------------------------------------------------------------------------
// KindedNode — the subset of `Node` that has a string `kind` discriminant
// (Param, TypeParam, StructField, MatchArm, MapEntry, StructExprField,
// StringSegment, EnumVariantDecl are auxiliary and don't have a usable one).
//----------------------------------------------------------------------------
type KindedNode = Node & { kind: string };

function kindOf(node: Node): string | null {
  if ("kind" in node && typeof (node as { kind?: unknown }).kind === "string") {
    const k = (node as { kind: unknown }).kind as string;
    // Exclude non-AST kinds that piggyback on the `kind` field.
    if (k === "unit" || k === "tuple" || k === "struct" ||
        k === "text" || k === "interp") return null;
    return k;
  }
  return null;
}

/** Walk the AST, calling `fn` only on nodes with a real `kind` discriminant. */
function walkKind(root: Node, fn: (node: KindedNode, parent: Node | null) => void): void {
  walk(root, {
    enter(node, parent) {
      if (kindOf(node) !== null) fn(node as KindedNode, parent);
    },
  });
}

//----------------------------------------------------------------------------
// LSP types (subset that we emit / consume)
//----------------------------------------------------------------------------
export interface Position {
  line: number; // 0-based
  character: number; // 0-based
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface CompletionItem {
  label: string;
  kind: number; // CompletionItemKind enum
  detail?: string;
  documentation?: string;
  insertText?: string;
  insertTextFormat?: number;
}

export interface Hover {
  contents: MarkupContent;
  range?: Range;
}

export interface MarkupContent {
  kind: "markdown" | "plaintext";
  value: string;
}

export interface Diagnostic {
  range: Range;
  severity: number; // DiagnosticSeverity enum
  source?: string;
  message: string;
  code?: string | number;
}

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: number; // SymbolKind enum
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export interface SignatureInformation {
  label: string;
  documentation?: string;
  parameters?: ParameterInformation[];
}
export interface ParameterInformation {
  label: string;
  documentation?: string;
}
export interface SignatureHelp {
  signatures: SignatureInformation[];
  activeSignature?: number;
  activeParameter?: number;
}

export interface CodeAction {
  title: string;
  kind: string;
  edit?: WorkspaceEdit;
  diagnostics?: Diagnostic[];
}
export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
}
export interface CodeLens {
  range: Range;
  command?: { title: string; command: string; arguments?: any[] };
}

export interface SemanticTokens {
  data: number[];
}

export interface DocumentHighlight {
  range: Range;
  kind?: number;
}

// LSP enums (re-declared locally to avoid pulling in vscode-languageserver-types)
export const CompletionItemKind = {
  Text: 1, Method: 2, Function: 3, Constructor: 4, Field: 5, Variable: 6,
  Class: 7, Interface: 8, Module: 9, Property: 10, Unit: 11, Value: 12,
  Enum: 13, Keyword: 14, Snippet: 15, Color: 16, File: 17, Reference: 18,
  Folder: 19, EnumMember: 20, Constant: 21, Struct: 22, Event: 23,
  Operator: 24, TypeParameter: 25,
} as const;

export const DiagnosticSeverity = {
  Error: 1, Warning: 2, Information: 3, Hint: 4,
} as const;

export const SymbolKind = {
  File: 1, Module: 2, Namespace: 3, Package: 4, Class: 5, Method: 6,
  Property: 7, Field: 8, Constructor: 9, Enum: 10, EnumMember: 11,
  Interface: 12, Function: 13, Variable: 14, Constant: 15, String: 16,
  Number: 17, Boolean: 18, Array: 19, Object: 20, Key: 21, Null: 22,
  Struct: 23, Operator: 24, TypeParameter: 25,
} as const;

// Semantic token types (indexed by position in the legend)
export const SemanticTokenTypes = [
  "namespace", "type", "class", "enum", "interface", "struct", "typeParameter",
  "parameter", "variable", "property", "enumMember", "event", "function",
  "method", "macro", "keyword", "modifier", "comment", "string", "number",
  "regexp", "operator",
] as const;

// Token modifiers we use (subset; encoded as a bitmask in the delta array).
export const SemanticTokenModifiers = [
  "declaration", "definition", "readonly", "static", "deprecated",
  "abstract", "async", "modification", "documentation", "defaultLibrary",
] as const;

//----------------------------------------------------------------------------
// Aether keyword set (kept in sync with lexer.ts)
//----------------------------------------------------------------------------
const KEYWORDS = [
  "let", "mut", "const", "fn", "enum", "struct", "type", "match", "if",
  "else", "while", "for", "in", "return", "break", "continue", "print",
  "true", "false", "unit", "self", "as", "range", "import", "pub", "use",
  "or", "do",
];

// Built-in functions that exist in the inline evaluator (always in scope).
const INLINE_BUILTINS = [
  "print", "println", "range", "len", "type_of", "assert", "assert_eq",
  "panic", "str", "int", "float", "min", "max", "abs", "sqrt",
  "push", "pop", "map", "filter", "reduce",
];

//----------------------------------------------------------------------------
// Per-document cached state
//----------------------------------------------------------------------------
interface DocState {
  uri: string;
  source: string;
  version?: number;
  tokens: Token[];
  lexErrors: LexError[];
  ast: Program;
  parseErrors: ParseError[];
  typeErrors: TypeError[];
  nodeTypes: Map<Expr, Type>;
  lint: LintDiagnostic[];
}

//----------------------------------------------------------------------------
// Position conversion helpers
//   AST: line/col are 1-based.
//   LSP: line/character are 0-based.
//----------------------------------------------------------------------------
function toLspPos(p: AstPosition): Position {
  return { line: p.line - 1, character: p.col - 1 };
}

function fromLspPos(p: Position): AstPosition {
  return { line: p.line + 1, col: p.character + 1, offset: 0 };
}

function toLspRange(loc: SourceLocation): Range {
  return { start: toLspPos(loc.start), end: toLspPos(loc.end) };
}

//----------------------------------------------------------------------------
// Position-in-range check (LSP semantics: end is exclusive)
//----------------------------------------------------------------------------
function lspPosInLoc(pos: Position, loc: SourceLocation, inclusiveEnd = false): boolean {
  const start = loc.start;
  const end = loc.end;
  const line1 = pos.line + 1;
  const col1 = pos.character + 1;
  if (line1 < start.line) return false;
  if (line1 > end.line) return false;
  if (line1 === start.line && col1 < start.col) return false;
  if (line1 === end.line) {
    return inclusiveEnd ? col1 <= end.col : col1 < end.col;
  }
  return true;
}

//----------------------------------------------------------------------------
// Compute the offset (0-based char index) of an LSP Position in the source.
//----------------------------------------------------------------------------
function lspToOffset(source: string, pos: Position): number {
  let offset = 0;
  let line = 0;
  while (line < pos.line && offset < source.length) {
    if (source[offset] === "\n") line++;
    offset++;
  }
  let col = 0;
  while (col < pos.character && offset < source.length && source[offset] !== "\n") {
    offset++;
    col++;
  }
  return offset;
}

//----------------------------------------------------------------------------
// Word boundary helper: extract the identifier under the LSP position.
//----------------------------------------------------------------------------
function wordAt(source: string, pos: Position): { word: string; start: Position; end: Position } | null {
  const offset = lspToOffset(source, pos);
  // Match a single identifier-continuation char (ID_Continue includes ID_Start).
  const identChar = /[\p{ID_Continue}$_]/u;
  let s = offset;
  while (s > 0 && identChar.test(source[s - 1])) s--;
  let e = offset;
  while (e < source.length && identChar.test(source[e])) e++;
  if (e <= s) return null;
  const word = source.slice(s, e);
  let line = 0, col = 0;
  for (let i = 0; i < s; i++) {
    if (source[i] === "\n") { line++; col = 0; } else col++;
  }
  const start = { line, character: col };
  let endLine = line, endCol = col;
  for (let i = s; i < e; i++) {
    if (source[i] === "\n") { endLine++; endCol = 0; } else endCol++;
  }
  return { word, start, end: { line: endLine, character: endCol } };
}

//----------------------------------------------------------------------------
// The Aether LSP server
//----------------------------------------------------------------------------
export class AetherLSP {
  /** Open documents keyed by URI. */
  docs: Map<string, DocState> = new Map();
  /** Whether the server is initialized. */
  initialized = false;
  /** Whether the server has been asked to shut down. */
  shutdownRequested = false;
  /** Diagnostic push counter — emits `textDocument/publishDiagnostics`. */
  diagnosticsPushed = 0;

  // --------------------------------------------------------------------------
  // Document tracking — public methods called by tests / the JSON-RPC loop.
  // --------------------------------------------------------------------------

  /** Open a document with the given source. */
  openDoc(uri: string, source: string, version?: number): void {
    this.docs.set(uri, this.parseDoc(uri, source, version));
  }

  /** Update an open document's source. */
  updateDoc(uri: string, source: string, version?: number): void {
    const prev = this.docs.get(uri);
    this.docs.set(uri, this.parseDoc(uri, source, version ?? prev?.version));
  }

  /** Close a document. */
  closeDoc(uri: string): void {
    this.docs.delete(uri);
  }

  /** Re-run the Aether pipeline on a document and cache the result. */
  private parseDoc(uri: string, source: string, version?: number): DocState {
    const file = uri.startsWith("file://") ? uri.slice("file://".length) : uri;
    const { tokens, errors: lexErrors } = lexWithErrors(source, file);
    const { program, errors: parseErrors } = parse(tokens, file);
    let typeErrors: TypeError[] = [];
    let nodeTypes: Map<Expr, Type> = new Map();
    try {
      const r = check(program);
      typeErrors = r.errors;
      nodeTypes = r.types;
    } catch (e) {
      typeErrors = [{ message: (e as Error).message, loc: program.loc }];
    }
    let lintDiags: LintDiagnostic[] = [];
    try {
      lintDiags = lint(source);
    } catch (e) {
      lintDiags = [];
    }
    return {
      uri, source, version, tokens, lexErrors, ast: program,
      parseErrors, typeErrors, nodeTypes, lint: lintDiags,
    };
  }

  // --------------------------------------------------------------------------
  // JSON-RPC dispatch
  // --------------------------------------------------------------------------

  /**
   * Handle a single parsed JSON-RPC message. Returns the response object
   * (without the wrapping `jsonrpc`/`id` fields added by the transport) or
   * `null` for notifications and messages that produce no response.
   *
   * For notifications that emit follow-up notifications (e.g.
   * `didOpen` publishes diagnostics), this method writes them directly to
   * stdout via `sendNotification` — but only when `stdio` is available
   * (i.e. when running under `runLSP`, not in tests). In tests, the caller
   * can read the latest pushed diagnostics via `lastDiagnostics`.
   */
  lastDiagnostics: { uri: string; diagnostics: Diagnostic[] } | null = null;
  stdout?: (s: string) => void;

  handleMessage(msg: any): any | null {
    if (!msg || typeof msg !== "object") return null;
    const method: string = msg.method ?? "";
    const id = msg.id;
    const params = msg.params ?? {};

    if (method === "initialize") {
      const result = this.initialize(params);
      this.initialized = true;
      return id === undefined ? null : makeResponse(id, result);
    }
    if (method === "initialized") return null;
    if (method === "shutdown") {
      this.shutdownRequested = true;
      return id === undefined ? null : makeResponse(id, null);
    }
    if (method === "exit") return null;

    if (method === "textDocument/didOpen") {
      const td = params.textDocument;
      if (td) this.openDoc(td.uri, td.text, td.version);
      this.publishDiagnostics(td?.uri);
      return null;
    }
    if (method === "textDocument/didChange") {
      const td = params.textDocument;
      const changes = params.contentChanges ?? [];
      const last = changes[changes.length - 1];
      if (last && last.text !== undefined) {
        this.updateDoc(td.uri, last.text, td.version);
      }
      this.publishDiagnostics(td.uri);
      return null;
    }
    if (method === "textDocument/didClose") {
      this.closeDoc(params.textDocument?.uri);
      return null;
    }

    switch (method) {
      case "textDocument/completion":
        return id === undefined ? null : makeResponse(id, this.textDocumentCompletion(params));
      case "textDocument/hover":
        return id === undefined ? null : makeResponse(id, this.textDocumentHover(params));
      case "textDocument/definition":
        return id === undefined ? null : makeResponse(id, this.textDocumentDefinition(params));
      case "textDocument/declaration":
        return id === undefined ? null : makeResponse(id, this.textDocumentDefinition(params));
      case "textDocument/typeDefinition":
        return id === undefined ? null : makeResponse(id, this.textDocumentDefinition(params));
      case "textDocument/implementation":
        return id === undefined ? null : makeResponse(id, this.textDocumentDefinition(params));
      case "textDocument/references":
        return id === undefined ? null : makeResponse(id, this.textDocumentReferences(params));
      case "textDocument/rename":
        return id === undefined ? null : makeResponse(id, this.textDocumentRename(params));
      case "textDocument/formatting":
        return id === undefined ? null : makeResponse(id, this.textDocumentFormatting(params));
      case "textDocument/codeAction":
        return id === undefined ? null : makeResponse(id, this.textDocumentCodeAction(params));
      case "textDocument/semanticTokens/full":
        return id === undefined ? null : makeResponse(id, this.textDocumentSemanticTokens(params));
      case "textDocument/documentSymbol":
        return id === undefined ? null : makeResponse(id, this.textDocumentDocumentSymbol(params));
      case "textDocument/signatureHelp":
        return id === undefined ? null : makeResponse(id, this.textDocumentSignatureHelp(params));
      case "textDocument/documentHighlight":
        return id === undefined ? null : makeResponse(id, this.textDocumentDocumentHighlight(params));
      case "textDocument/codeLens":
        return id === undefined ? null : makeResponse(id, this.textDocumentCodeLens(params));
      case "textDocument/diagnostic":
        return id === undefined ? null : makeResponse(id, this.textDocumentDiagnostics(params));
    }
    if (id === undefined) return null;
    return makeErrorResponse(id, -32601, `Method not found: ${method}`);
  }

  // --------------------------------------------------------------------------
  // Diagnostics push (notification)
  // --------------------------------------------------------------------------
  publishDiagnostics(uri?: string): void {
    if (!uri) return;
    const doc = this.docs.get(uri);
    const diagnostics = doc ? this.computeDiagnostics(doc) : [];
    this.lastDiagnostics = { uri, diagnostics };
    this.diagnosticsPushed++;
    if (this.stdout) {
      const notif = {
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: { uri, diagnostics },
      };
      this.stdout(frameMessage(JSON.stringify(notif)));
    }
  }

  // --------------------------------------------------------------------------
  // initialize
  // --------------------------------------------------------------------------
  initialize(_params: any): any {
    return {
      capabilities: {
        textDocumentSync: 1, // Full sync
        completionProvider: {
          triggerCharacters: [".", ":"],
          resolveProvider: false,
        },
        hoverProvider: true,
        definitionProvider: true,
        declarationProvider: true,
        typeDefinitionProvider: true,
        implementationProvider: true,
        referencesProvider: true,
        renameProvider: true,
        documentFormattingProvider: true,
        codeActionProvider: true,
        semanticTokensProvider: {
          legend: {
            tokenTypes: [...SemanticTokenTypes],
            tokenModifiers: [...SemanticTokenModifiers],
          },
          full: true,
          range: false,
        },
        documentSymbolProvider: true,
        signatureHelpProvider: {
          triggerCharacters: ["(", ","],
        },
        documentHighlightProvider: true,
        codeLensProvider: { resolveProvider: false },
        diagnosticProvider: {
          interFileDependencies: false,
          workspaceDiagnostics: false,
        },
      },
      serverInfo: {
        name: "aether-lsp",
        version: "1.0.0",
      },
    };
  }

  // --------------------------------------------------------------------------
  // Completion
  // --------------------------------------------------------------------------
  textDocumentCompletion(params: any): CompletionItem[] {
    const doc = this.docs.get(params.textDocument?.uri);
    if (!doc) return [];
    const items: CompletionItem[] = [];
    const seen = new Set<string>();

    for (const kw of KEYWORDS) {
      if (seen.has(kw)) continue;
      seen.add(kw);
      items.push({
        label: kw,
        kind: CompletionItemKind.Keyword,
        detail: "keyword",
        insertText: kw,
        insertTextFormat: 1,
      });
    }

    for (const mod of STDLIB_MANIFEST) {
      for (const fn of mod.fns) {
        if (seen.has(fn.name)) continue;
        seen.add(fn.name);
        items.push({
          label: fn.name,
          kind: CompletionItemKind.Function,
          detail: `${mod.module}: ${fn.sig}`,
          documentation: fn.desc,
          insertText: fn.name,
          insertTextFormat: 1,
        });
      }
    }

    for (const b of INLINE_BUILTINS) {
      if (seen.has(b)) continue;
      seen.add(b);
      items.push({
        label: b,
        kind: CompletionItemKind.Function,
        detail: "builtin",
        insertText: b,
        insertTextFormat: 1,
      });
    }

    const pos = params.position;
    const inScope = this.scopedNamesAt(doc, pos);
    for (const name of inScope) {
      if (seen.has(name)) continue;
      seen.add(name);
      items.push({
        label: name,
        kind: CompletionItemKind.Variable,
        insertText: name,
        insertTextFormat: 1,
      });
    }
    return items;
  }

  /**
   * Collect identifiers in scope at `pos` by walking the AST and only
   * visiting nodes whose location precedes (or contains) `pos`.
   */
  private scopedNamesAt(doc: DocState, pos: Position): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (n: string) => { if (n && !seen.has(n)) { seen.add(n); out.push(n); } };

    for (const s of doc.ast.body) {
      const name = declName(s);
      if (name) add(name);
    }

    const posOffset = lspToOffset(doc.source, pos);
    walkKind(doc.ast, (node) => {
      switch (node.kind) {
        case "FnDecl": {
          const f = node as FnDecl;
          if (lspPosInLoc(pos, f.loc, true)) {
            for (const p of f.params) add(p.name);
          }
          return;
        }
        case "Let":
        case "MutLet":
        case "Const": {
          const d = node as Let | MutLet | Const;
          if (d.loc.start.offset <= posOffset || lspPosInLoc(pos, d.loc, true)) {
            add(d.name);
          }
          return;
        }
        case "ForIn": {
          const f = node as Extract<Stmt, { kind: "ForIn" }>;
          if (lspPosInLoc(pos, f.loc, true)) add(f.varName);
          return;
        }
        case "Lambda": {
          const l = node as Extract<Expr, { kind: "Lambda" }>;
          if (lspPosInLoc(pos, l.loc, true)) {
            for (const p of l.params) add(p.name);
          }
          return;
        }
      }
    });
    return out;
  }

  // --------------------------------------------------------------------------
  // Hover
  // --------------------------------------------------------------------------
  textDocumentHover(params: any): Hover | null {
    const doc = this.docs.get(params.textDocument?.uri);
    if (!doc) return null;
    const pos = params.position;
    const ident = this.findIdentAt(doc, pos);
    if (!ident) return null;

    // Inline builtins (print, len, assert_eq, ...) take precedence over the
    // stdlib functions that share their name — the inline versions are the
    // ones actually callable from a script.
    if (INLINE_BUILTINS.includes(ident.name)) {
      return {
        contents: {
          kind: "markdown",
          value: `**${ident.name}** *(builtin)*\n\nBuilt-in Aether function.`,
        },
        range: toLspRange(ident.loc),
      };
    }

    // If this name refers to a top-level fn/enum/struct/type/let/mut/const
    // declaration, prefer the declaration signature — it includes the
    // function name + params which is more useful than just the type.
    const decl = this.findDeclByName(doc, ident.name);
    if (decl && (decl.kind === "FnDecl" || decl.kind === "EnumDecl" ||
                  decl.kind === "StructDecl" || decl.kind === "TypeAlias")) {
      return {
        contents: {
          kind: "markdown",
          value: `\`${declSignature(decl)}\``,
        },
        range: toLspRange(ident.loc),
      };
    }

    // Stdlib function — return desc + sig.
    const std = findStdlibFn(ident.name);
    if (std) {
      return {
        contents: {
          kind: "markdown",
          value: `**${std.name}** \`${std.sig}\`\n\n${std.desc}`,
        },
        range: toLspRange(ident.loc),
      };
    }

    // Local variable / function — look up type from the checker.
    if (ident.node && ident.node.kind === "Ident") {
      const t = doc.nodeTypes.get(ident.node as unknown as Expr);
      if (t) {
        return {
          contents: {
            kind: "markdown",
            value: `\`${ident.name}: ${typeToString(t)}\``,
          },
          range: toLspRange(ident.loc),
        };
      }
    }

    // Fallback: if the name refers to a local let/mut/const, infer the
    // type from the initializer expression.
    if (decl && (decl.kind === "Let" || decl.kind === "MutLet" || decl.kind === "Const")) {
      const d = decl as Let | MutLet | Const;
      const t = doc.nodeTypes.get(d.init as Expr);
      if (t) {
        return {
          contents: {
            kind: "markdown",
            value: `\`${ident.name}: ${typeToString(t)}\``,
          },
          range: toLspRange(ident.loc),
        };
      }
      return {
        contents: {
          kind: "markdown",
          value: `\`${declSignature(decl)}\``,
        },
        range: toLspRange(ident.loc),
      };
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // Definition / Declaration / TypeDefinition / Implementation (all the same)
  // --------------------------------------------------------------------------
  textDocumentDefinition(params: any): Location | null {
    const doc = this.docs.get(params.textDocument?.uri);
    if (!doc) return null;
    const ident = this.findIdentAt(doc, params.position);
    if (!ident) return null;
    const decl = this.findDeclByName(doc, ident.name);
    if (!decl) return null;
    return { uri: doc.uri, range: toLspRange(decl.loc) };
  }

  // --------------------------------------------------------------------------
  // References
  // --------------------------------------------------------------------------
  textDocumentReferences(params: any): Location[] {
    const doc = this.docs.get(params.textDocument?.uri);
    if (!doc) return [];
    const ident = this.findIdentAt(doc, params.position);
    if (!ident) return [];
    const name = ident.name;
    const out: Location[] = [];
    // Include the declaration site (if any) so the references list is
    // consistent with most editors' expectation.
    const decl = this.findDeclByName(doc, name);
    if (decl) out.push({ uri: doc.uri, range: nameRangeOfDecl(decl) });
    walkKind(doc.ast, (node) => {
      if (node.kind === "Ident" && (node as Ident).name === name) {
        out.push({ uri: doc.uri, range: toLspRange(node.loc) });
      }
    });
    return out;
  }

  // --------------------------------------------------------------------------
  // Rename
  // --------------------------------------------------------------------------
  textDocumentRename(params: any): WorkspaceEdit | null {
    const doc = this.docs.get(params.textDocument?.uri);
    if (!doc) return null;
    const pos = params.position;
    const ident = this.findIdentAt(doc, pos);
    if (!ident) return null;
    const newName: string = params.newName ?? ident.name;
    if (!newName) return null;
    const edits: TextEdit[] = [];

    const decl = this.findDeclByName(doc, ident.name);
    if (decl) {
      edits.push({ range: nameRangeOfDecl(decl), newText: newName });
    }
    walkKind(doc.ast, (node) => {
      if (node.kind === "Ident" && (node as Ident).name === ident.name) {
        edits.push({ range: toLspRange(node.loc), newText: newName });
      }
    });
    if (edits.length === 0) return null;
    return { changes: { [doc.uri]: edits } };
  }

  // --------------------------------------------------------------------------
  // Diagnostics (pull-style: textDocument/diagnostic)
  // --------------------------------------------------------------------------
  textDocumentDiagnostics(params: any): Diagnostic[] {
    const doc = this.docs.get(params.textDocument?.uri);
    if (!doc) return [];
    return this.computeDiagnostics(doc);
  }

  private computeDiagnostics(doc: DocState): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const e of doc.lexErrors) {
      out.push({
        range: toLspRange(e.loc),
        severity: DiagnosticSeverity.Error,
        source: "lex",
        message: e.message,
      });
    }
    for (const e of doc.parseErrors) {
      out.push({
        range: toLspRange(e.loc),
        severity: DiagnosticSeverity.Error,
        source: "parse",
        message: e.message,
      });
    }
    for (const e of doc.typeErrors) {
      out.push({
        range: toLspRange(e.loc),
        severity: DiagnosticSeverity.Error,
        source: "type",
        message: e.message,
      });
    }
    for (const d of doc.lint) {
      const sev = d.severity === "error"
        ? DiagnosticSeverity.Error
        : d.severity === "warning"
          ? DiagnosticSeverity.Warning
          : d.severity === "info"
            ? DiagnosticSeverity.Information
            : DiagnosticSeverity.Hint;
      out.push({
        range: toLspRange(d.loc),
        severity: sev,
        source: `lint:${d.rule}`,
        message: d.message,
        code: d.rule,
      });
    }
    return out;
  }

  // --------------------------------------------------------------------------
  // Formatting
  // --------------------------------------------------------------------------
  textDocumentFormatting(params: any): TextEdit[] {
    const doc = this.docs.get(params.textDocument?.uri);
    if (!doc) return [];
    let formatted: string;
    try {
      formatted = format(doc.source);
    } catch (e) {
      return [];
    }
    if (formatted === doc.source) return [];
    const lines = doc.source.split("\n");
    const lastLine = lines.length - 1;
    const lastChar = lines[lastLine].length;
    return [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: lastLine, character: lastChar },
      },
      newText: formatted,
    }];
  }

  // --------------------------------------------------------------------------
  // Code Action
  // --------------------------------------------------------------------------
  textDocumentCodeAction(params: any): CodeAction[] {
    const doc = this.docs.get(params.textDocument?.uri);
    if (!doc) return [];
    const out: CodeAction[] = [];
    const range = params.range;
    for (const d of doc.lint) {
      const loc = d.loc;
      const dRange = toLspRange(loc);
      if (!rangesOverlap(dRange, range) && !rangeContains(range, dRange)) continue;
      if (!d.fix) {
        out.push({
          title: `lint: ${d.rule} (${d.message})`,
          kind: "quickfix",
          diagnostics: [{
            range: dRange,
            severity: d.severity === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
            source: `lint:${d.rule}`,
            message: d.message,
            code: d.rule,
          }],
        });
        continue;
      }
      const lineStart = { line: dRange.start.line, character: 0 };
      const lineEnd = { line: dRange.start.line, character: 10000 };
      out.push({
        title: `Apply fix: ${d.fix}`,
        kind: "quickfix",
        edit: {
          changes: {
            [doc.uri]: [{
              range: { start: lineStart, end: lineEnd },
              newText: d.fix,
            }],
          },
        },
        diagnostics: [{
          range: dRange,
          severity: DiagnosticSeverity.Warning,
          source: `lint:${d.rule}`,
          message: d.message,
          code: d.rule,
        }],
      });
    }
    return out;
  }

  // --------------------------------------------------------------------------
  // Semantic Tokens (full)
  // --------------------------------------------------------------------------
  textDocumentSemanticTokens(params: any): SemanticTokens {
    const doc = this.docs.get(params.textDocument?.uri);
    if (!doc) return { data: [] };

    interface Tok {
      line: number; char: number; length: number; type: number; modifiers: number;
    }
    const toks: Tok[] = [];
    const typeIdx = (name: string): number =>
      (SemanticTokenTypes as readonly string[]).indexOf(name);

    for (const t of doc.tokens) {
      const loc = t.loc;
      const line = loc.start.line - 1;
      const char = loc.start.col - 1;
      let type = -1;
      if (t.kind === "Keyword") type = typeIdx("keyword");
      else if (t.kind === "String") type = typeIdx("string");
      else if (t.kind === "Char") type = typeIdx("string");
      else if (t.kind === "Int" || t.kind === "Float" || t.kind === "Hex" ||
               t.kind === "Binary" || t.kind === "Octal") type = typeIdx("number");
      else if (t.kind === "Ident") continue;
      if (type < 0) continue;
      toks.push({ line, char, length: t.value.length, type, modifiers: 0 });
    }

    const src = doc.source;
    let i = 0;
    let line = 0, col = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === "/" && src[i + 1] === "/") {
        const startLine = line, startCol = col;
        let end = i + 2;
        while (end < src.length && src[end] !== "\n") end++;
        toks.push({
          line: startLine, char: startCol, length: end - i,
          type: typeIdx("comment"), modifiers: 0,
        });
        i = end; col += (end - (i - (end - i)));
        // We didn't advance line, just skip past the comment chars.
        col += 0; // no-op for clarity
        continue;
      }
      if (c === "/" && src[i + 1] === "*") {
        const startLine = line, startCol = col;
        let end = i + 2;
        let endLine = line, endCol = col + 2;
        while (end < src.length && !(src[end] === "*" && src[end + 1] === "/")) {
          if (src[end] === "\n") { endLine++; endCol = 0; } else endCol++;
          end++;
        }
        const len = (end + 2) - i;
        toks.push({
          line: startLine, char: startCol, length: len,
          type: typeIdx("comment"), modifiers: 0,
        });
        i = end + 2;
        line = endLine;
        col = endCol + 2;
        continue;
      }
      if (c === "\n") { line++; col = 0; i++; continue; }
      col++; i++;
    }

    const fnNames = new Set<string>();
    const typeNames = new Set<string>();
    for (const s of doc.ast.body) {
      if (s.kind === "FnDecl") fnNames.add((s as FnDecl).name);
      if (s.kind === "EnumDecl" || s.kind === "StructDecl" || s.kind === "TypeAlias") {
        typeNames.add((s as EnumDecl | StructDecl | TypeAlias).name);
      }
    }
    walkKind(doc.ast, (node) => {
      if (node.kind === "Ident") {
        const id = node as Ident;
        const line0 = id.loc.start.line - 1;
        const char0 = id.loc.start.col - 1;
        const len = id.loc.end.col - id.loc.start.col;
        let type = typeIdx("variable");
        if (fnNames.has(id.name)) type = typeIdx("function");
        else if (typeNames.has(id.name)) type = typeIdx("type");
        toks.push({
          line: line0, char: char0, length: len, type, modifiers: 0,
        });
        return;
      }
      if (node.kind === "FnDecl") {
        const f = node as FnDecl;
        const line0 = f.loc.start.line - 1;
        const char0 = f.loc.start.col - 1 + 3;
        toks.push({
          line: line0, char: char0, length: f.name.length,
          type: typeIdx("function"), modifiers: 1 << 0,
        });
        return;
      }
      if (node.kind === "EnumDecl" || node.kind === "StructDecl" || node.kind === "TypeAlias") {
        const d = node as EnumDecl | StructDecl | TypeAlias;
        const kwLen = node.kind === "EnumDecl" ? 5 : node.kind === "StructDecl" ? 7 : 5;
        const line0 = d.loc.start.line - 1;
        const char0 = d.loc.start.col - 1 + kwLen + 1;
        toks.push({
          line: line0, char: char0, length: d.name.length,
          type: typeIdx("type"), modifiers: 1 << 0,
        });
        return;
      }
      if (node.kind === "Let" || node.kind === "MutLet" || node.kind === "Const") {
        const d = node as Let | MutLet | Const;
        const kwLen = node.kind === "Let" ? 4 : node.kind === "MutLet" ? 8 : 6;
        const line0 = d.loc.start.line - 1;
        const char0 = d.loc.start.col - 1 + kwLen + 1;
        toks.push({
          line: line0, char: char0, length: d.name.length,
          type: typeIdx("variable"), modifiers: 1 << 0,
        });
        return;
      }
    });

    toks.sort((a, b) => a.line - b.line || a.char - b.char);
    const data: number[] = [];
    let prevLine = 0, prevChar = 0;
    for (const t of toks) {
      const deltaLine = t.line - prevLine;
      const deltaChar = deltaLine === 0 ? t.char - prevChar : t.char;
      data.push(deltaLine, deltaChar, t.length, t.type, t.modifiers);
      prevLine = t.line;
      prevChar = t.char;
    }
    return { data };
  }

  // --------------------------------------------------------------------------
  // Document Symbol
  // --------------------------------------------------------------------------
  textDocumentDocumentSymbol(params: any): DocumentSymbol[] {
    const doc = this.docs.get(params.textDocument?.uri);
    if (!doc) return [];
    const out: DocumentSymbol[] = [];
    for (const s of doc.ast.body) {
      const sym = stmtToSymbol(s);
      if (sym) out.push(sym);
    }
    return out;
  }

  // --------------------------------------------------------------------------
  // Signature Help
  // --------------------------------------------------------------------------
  textDocumentSignatureHelp(params: any): SignatureHelp | null {
    const doc = this.docs.get(params.textDocument?.uri);
    if (!doc) return null;
    const pos = params.position;

    let best: Call | null = null;
    walkKind(doc.ast, (node) => {
      if (node.kind === "Call") {
        const c = node as Call;
        if (lspPosInLoc(pos, c.loc, true)) {
          best = c;
        }
      }
    });
    if (!best) return null;
    const call = best as Call;

    let fnName: string | null = null;
    if (call.callee.kind === "Ident") fnName = (call.callee as Ident).name;

    let label = "";
    let paramLabels: { label: string }[] = [];

    if (fnName) {
      const std = findStdlibFn(fnName);
      if (std) {
        label = `${std.name}${std.sig.slice(std.sig.indexOf("("))}`;
        const sigParams = extractParamsFromSig(std.sig);
        paramLabels = sigParams.map((p) => ({ label: p }));
        return {
          signatures: [{ label, documentation: std.desc, parameters: paramLabels }],
          activeSignature: 0,
          activeParameter: Math.min(
            Math.max(0, call.args.length - 1),
            Math.max(0, paramLabels.length - 1),
          ),
        };
      }
      const decl = this.findDeclByName(doc, fnName);
      if (decl && decl.kind === "FnDecl") {
        const f = decl as FnDecl;
        const plabels = f.params.map((p) =>
          p.type ? `${p.name}: ${typeNodeStr(p.type)}` : p.name);
        label = `${f.name}(${plabels.join(", ")})` +
          (f.ret ? ` -> ${typeNodeStr(f.ret)}` : "");
        paramLabels = plabels.map((p) => ({ label: p }));
        return {
          signatures: [{ label, documentation: `user function ${f.name}`, parameters: paramLabels }],
          activeSignature: 0,
          activeParameter: Math.min(
            Math.max(0, call.args.length - 1),
            Math.max(0, paramLabels.length - 1),
          ),
        };
      }
    }

    if (call.callee) {
      const t = doc.nodeTypes.get(call.callee as Expr);
      if (t && t.kind === "Func") {
        const tf = t as TFunc;
        const labels = tf.params.map((p, i) => `arg${i}: ${typeToString(p)}`);
        label = `(${labels.join(", ")}) -> ${typeToString(tf.ret)}`;
        return {
          signatures: [{ label, parameters: labels.map((l) => ({ label: l })) }],
          activeSignature: 0,
          activeParameter: Math.min(
            Math.max(0, call.args.length - 1),
            Math.max(0, labels.length - 1),
          ),
        };
      }
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // Document Highlight
  // --------------------------------------------------------------------------
  textDocumentDocumentHighlight(params: any): DocumentHighlight[] {
    const doc = this.docs.get(params.textDocument?.uri);
    if (!doc) return [];
    const ident = this.findIdentAt(doc, params.position);
    if (!ident) return [];
    const out: DocumentHighlight[] = [];
    // Include the declaration's name position as a highlight too.
    const decl = this.findDeclByName(doc, ident.name);
    if (decl) out.push({ range: nameRangeOfDecl(decl), kind: 1 });
    walkKind(doc.ast, (node) => {
      if (node.kind === "Ident" && (node as Ident).name === ident.name) {
        out.push({ range: toLspRange(node.loc), kind: 1 });
      }
    });
    return out;
  }

  // --------------------------------------------------------------------------
  // Code Lens (one per fn: "fn N params → ret")
  // --------------------------------------------------------------------------
  textDocumentCodeLens(params: any): CodeLens[] {
    const doc = this.docs.get(params.textDocument?.uri);
    if (!doc) return [];
    const out: CodeLens[] = [];
    for (const s of doc.ast.body) {
      if (s.kind === "FnDecl") {
        const f = s as FnDecl;
        const argCount = f.params.length;
        out.push({
          range: toLspRange(f.loc),
          command: {
            title: `${argCount} param${argCount === 1 ? "" : "s"}`,
            command: "",
          },
        });
      }
    }
    return out;
  }

  // --------------------------------------------------------------------------
  // Helpers: find Ident at position; find declaration by name
  // --------------------------------------------------------------------------

  /** Find an Ident node (expression position) whose loc contains `pos`. */
  private findIdentAt(doc: DocState, pos: Position): {
    name: string;
    loc: SourceLocation;
    node: KindedNode | null;
  } | null {
    let best: { name: string; loc: SourceLocation; node: KindedNode | null } | null = null;
    walkKind(doc.ast, (node) => {
      if (node.kind === "Ident") {
        const id = node as Ident;
        if (lspPosInLoc(pos, id.loc, true)) {
          best = { name: id.name, loc: id.loc, node };
        }
      }
    });
    if (best) return best;
    const w = wordAt(doc.source, pos);
    if (w) {
      return {
        name: w.word,
        loc: {
          file: fileOfUri(doc.uri),
          start: fromLspPos(w.start),
          end: fromLspPos(w.end),
        },
        node: null,
      };
    }
    return null;
  }

  /** Find the declaration (top-level or local) with the given name. */
  private findDeclByName(doc: DocState, name: string): Stmt | null {
    for (const s of doc.ast.body) {
      const dn = declName(s);
      if (dn === name) return s;
    }
    let found: Stmt | null = null;
    walkKind(doc.ast, (node) => {
      if (node === (doc.ast as unknown as KindedNode)) return;
      const dn = declNameOf(node as any);
      if (dn === name) found = node as unknown as Stmt;
    });
    return found;
  }
}

//----------------------------------------------------------------------------
// Free functions: response builders, message framing
//----------------------------------------------------------------------------
function makeResponse(id: any, result: any): any {
  return { jsonrpc: "2.0", id, result };
}

function makeErrorResponse(id: any, code: number, message: string): any {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function frameMessage(body: string): string {
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

//----------------------------------------------------------------------------
// Helpers for AST walking
//----------------------------------------------------------------------------
function declName(s: Stmt): string | null {
  return declNameOf(s as any);
}

function declNameOf(node: any): string | null {
  if (!node) return null;
  switch (node.kind) {
    case "FnDecl": return node.name;
    case "EnumDecl": return node.name;
    case "StructDecl": return node.name;
    case "TypeAlias": return node.name;
    case "Let": case "MutLet": case "Const": return node.name;
  }
  return null;
}

/** Pretty-print a function/enum/struct/type/let signature for hover. */
function declSignature(d: any): string {
  if (!d) return "";
  switch (d.kind) {
    case "FnDecl": {
      const params = d.params.map((p: any) =>
        p.type ? `${p.name}: ${typeNodeStr(p.type)}` : p.name).join(", ");
      return `fn ${d.name}(${params})${d.ret ? ` -> ${typeNodeStr(d.ret)}` : ""}`;
    }
    case "EnumDecl":
      return `enum ${d.name} { ${d.variants.map((v: any) => v.name).join(", ")} }`;
    case "StructDecl":
      return `struct ${d.name} { ${d.fields.map((f: any) => f.name).join(", ")} }`;
    case "TypeAlias":
      return `type ${d.name} = ${typeNodeStr(d.type)};`;
    case "Let":
      return `let ${d.name}${d.type ? `: ${typeNodeStr(d.type)}` : ""} = …;`;
    case "MutLet":
      return `let mut ${d.name}${d.type ? `: ${typeNodeStr(d.type)}` : ""} = …;`;
    case "Const":
      return `const ${d.name}${d.type ? `: ${typeNodeStr(d.type)}` : ""} = …;`;
  }
  return "";
}

/** Convert an AST type node back to source-ish Aether text. */
function typeNodeStr(t: any): string {
  if (!t) return "()";
  switch (t.kind) {
    case "PrimitiveType": return t.name;
    case "NamedType": return t.name;
    case "UnitType": return "()";
    case "ArrayType": return `[${typeNodeStr(t.elem)}]`;
    case "MapType": return `map[${typeNodeStr(t.key)}]${typeNodeStr(t.value)}`;
    case "OptionType": return `option<${typeNodeStr(t.inner)}>`;
    case "ResultType": return `result<${typeNodeStr(t.ok)}, ${typeNodeStr(t.err)}>`;
    case "TupleType":
      return `(${t.types.map(typeNodeStr).join(", ")})`;
    case "FuncType":
      return `fn(${t.params.map(typeNodeStr).join(", ")}) -> ${typeNodeStr(t.ret)}`;
    case "GenericType":
      return `${t.name}<${t.args.map(typeNodeStr).join(", ")}>`;
  }
  return "()";
}

/** Range of just the name token of a declaration. */
function nameRangeOfDecl(decl: any): Range {
  const loc = decl.loc as SourceLocation;
  // kwLen = length of just the keyword (no trailing space).
  const kwLen =
    decl.kind === "FnDecl" ? 2 :
    decl.kind === "EnumDecl" ? 4 :
    decl.kind === "StructDecl" ? 6 :
    decl.kind === "TypeAlias" ? 4 :
    decl.kind === "Let" ? 3 :
    decl.kind === "MutLet" ? 7 :
    decl.kind === "Const" ? 5 : 0;
  // The name starts after `kw` + 1 space.
  const startChar = loc.start.col - 1 + kwLen + 1;
  return {
    start: { line: loc.start.line - 1, character: startChar },
    end: { line: loc.start.line - 1, character: startChar + (decl.name?.length ?? 0) },
  };
}

/** Convert an AST statement to an LSP DocumentSymbol. */
function stmtToSymbol(s: Stmt): DocumentSymbol | null {
  let name = "";
  let detail = "";
  let kind = 0;
  switch (s.kind) {
    case "FnDecl": name = s.name; detail = "fn"; kind = SymbolKind.Function; break;
    case "EnumDecl": name = s.name; detail = "enum"; kind = SymbolKind.Enum; break;
    case "StructDecl": name = s.name; detail = "struct"; kind = SymbolKind.Struct; break;
    case "TypeAlias": name = s.name; detail = "type"; kind = SymbolKind.Class; break;
    case "Let": name = s.name; detail = "let"; kind = SymbolKind.Variable; break;
    case "MutLet": name = s.name; detail = "let mut"; kind = SymbolKind.Variable; break;
    case "Const": name = s.name; detail = "const"; kind = SymbolKind.Constant; break;
    default: return null;
  }
  const range = toLspRange(s.loc);
  return {
    name, detail, kind, range,
    selectionRange: nameRangeOfDecl(s as any),
  };
}

/** Extract parameter labels from a stdlib sig string like "(s: string, n?: int) -> bool". */
function extractParamsFromSig(sig: string): string[] {
  const open = sig.indexOf("(");
  const close = sig.lastIndexOf(")");
  if (open < 0 || close < 0) return [];
  const body = sig.slice(open + 1, close);
  if (!body.trim()) return [];
  return body.split(",").map((s) => s.trim());
}

/** Collect bind names from a Match arm pattern. */
function patternBindNames(p: any): string[] {
  if (!p) return [];
  switch (p.kind) {
    case "BindPat": return [p.name];
    case "TuplePat":
    case "ArrayPat":
      return p.elements.flatMap(patternBindNames);
    case "StructPat":
      return p.fields.map((f: any) => patternBindNames(f.pattern)).flat();
    case "EnumPat":
      return (p.subpatterns || []).flatMap(patternBindNames);
    case "OrPat":
      return p.patterns.flatMap(patternBindNames);
    case "WildcardPat":
    case "LitPat":
    case "RestPat":
      return [];
  }
  return [];
}

/** Strip the `file://` prefix from a URI for use as a file path. */
function fileOfUri(uri: string): string {
  return uri.startsWith("file://") ? uri.slice("file://".length) : uri;
}

/** LSP Range overlap check. */
function rangesOverlap(a: Range, b: Range): boolean {
  if (a.end.line < b.start.line) return false;
  if (a.start.line > b.end.line) return false;
  if (a.end.line === b.start.line && a.end.character <= b.start.character) return false;
  if (a.start.line === b.end.line && a.start.character >= b.end.character) return false;
  return true;
}

function rangeContains(outer: Range, inner: Range): boolean {
  return (
    (outer.start.line < inner.start.line ||
      (outer.start.line === inner.start.line && outer.start.character <= inner.start.character)) &&
    (outer.end.line > inner.end.line ||
      (outer.end.line === inner.end.line && outer.end.character >= inner.end.character))
  );
}

//----------------------------------------------------------------------------
// runLSP — stdio JSON-RPC loop
//----------------------------------------------------------------------------
export function runLSP(): void {
  const server = new AetherLSP();
  server.stdout = (s) => process.stdout.write(s);

  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string | Buffer) => {
    buffer += chunk.toString();
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) break;
      const header = buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length: (\d+)/i);
      if (!match) {
        buffer = buffer.slice(headerEnd + 4);
        continue;
      }
      const len = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + len) break;
      const body = buffer.slice(bodyStart, bodyStart + len);
      buffer = buffer.slice(bodyStart + len);
      let msg: any;
      try {
        msg = JSON.parse(body);
      } catch (e) {
        continue;
      }
      try {
        const resp = server.handleMessage(msg);
        if (resp !== null) {
          process.stdout.write(frameMessage(JSON.stringify(resp)));
        }
      } catch (e) {
        const id = (msg && msg.id !== undefined) ? msg.id : null;
        const errResp = makeErrorResponse(id, -32603, (e as Error).message);
        process.stdout.write(frameMessage(JSON.stringify(errResp)));
      }
    }
  });

  process.stdin.on("end", () => {
    process.exit(0);
  });
}
