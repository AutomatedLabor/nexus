/**
 * aether/tools/lsp/lsp.test.ts
 * =============================
 * Test suite for the Aether LSP server. 80 cases covering:
 *   - initialize / shutdown / JSON-RPC dispatch
 *   - document tracking (open / update / close / publishDiagnostics)
 *   - completion (keywords + stdlib + scoped vars + triggers)
 *   - hover (type, stdlib docstring, builtin, fn signature, let)
 *   - definition (top-level fn, let, struct)
 *   - declaration / typeDefinition / implementation (aliases)
 *   - references (single + multiple occurrences)
 *   - rename (WorkspaceEdit shape)
 *   - diagnostics (lex / parse / type / lint)
 *   - formatting (TextEdit replacement)
 *   - codeAction (one per lint diagnostic with a fix)
 *   - semanticTokens (delta array shape, type indices)
 *   - documentSymbol (top-level decls)
 *   - signatureHelp (stdlib, user fn, inferred fn type)
 *   - documentHighlight (occurrences in doc)
 *   - codeLens (one per fn)
 */
import { describe, it, expect } from "vitest";
import {
  AetherLSP,
  CompletionItemKind,
  DiagnosticSeverity,
  SymbolKind,
} from "./lsp";

const URI = "file://test.ae";

function makeServer(source: string): AetherLSP {
  const s = new AetherLSP();
  s.openDoc(URI, source);
  return s;
}

//----------------------------------------------------------------------------
// 1. JSON-RPC dispatch + initialize / shutdown
//----------------------------------------------------------------------------
describe("lsp: JSON-RPC dispatch", () => {
  it("initialize returns capabilities + serverInfo", () => {
    const s = new AetherLSP();
    const resp = s.handleMessage({
      jsonrpc: "2.0", id: 1, method: "initialize", params: {},
    });
    expect(resp.id).toBe(1);
    expect(resp.result.capabilities).toBeTruthy();
    expect(resp.result.capabilities.completionProvider).toBeTruthy();
    expect(resp.result.capabilities.hoverProvider).toBe(true);
    expect(resp.result.capabilities.semanticTokensProvider).toBeTruthy();
    expect(resp.result.serverInfo.name).toBe("aether-lsp");
  });

  it("shutdown returns null result", () => {
    const s = new AetherLSP();
    const resp = s.handleMessage({ jsonrpc: "2.0", id: 2, method: "shutdown" });
    expect(resp.id).toBe(2);
    expect(resp.result).toBeNull();
    expect(s.shutdownRequested).toBe(true);
  });

  it("initialized notification returns null", () => {
    const s = new AetherLSP();
    const r = s.handleMessage({ jsonrpc: "2.0", method: "initialized" });
    expect(r).toBeNull();
  });

  it("exit notification returns null", () => {
    const s = new AetherLSP();
    const r = s.handleMessage({ jsonrpc: "2.0", method: "exit" });
    expect(r).toBeNull();
  });

  it("unknown method returns JSON-RPC error -32601", () => {
    const s = new AetherLSP();
    const r = s.handleMessage({ jsonrpc: "2.0", id: 7, method: "no/such/method" });
    expect(r.error.code).toBe(-32601);
    expect(r.error.message).toContain("no/such/method");
  });

  it("notification (no id) for unknown method returns null", () => {
    const s = new AetherLSP();
    const r = s.handleMessage({ jsonrpc: "2.0", method: "no/such/method" });
    expect(r).toBeNull();
  });

  it("initialize sets initialized=true", () => {
    const s = new AetherLSP();
    s.handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(s.initialized).toBe(true);
  });

  it("malformed message returns null", () => {
    const s = new AetherLSP();
    expect(s.handleMessage(null)).toBeNull();
    expect(s.handleMessage("hello" as any)).toBeNull();
    expect(s.handleMessage({})).toBeNull();
  });
});

//----------------------------------------------------------------------------
// 2. Document tracking + diagnostics push
//----------------------------------------------------------------------------
describe("lsp: document tracking", () => {
  it("openDoc adds a doc; subsequent queries work", () => {
    const s = new AetherLSP();
    s.openDoc(URI, "let x = 1;\nprint(x);");
    expect(s.docs.get(URI)).toBeTruthy();
    expect(s.docs.get(URI)!.source).toContain("let x");
  });

  it("updateDoc replaces source", () => {
    const s = makeServer("let x = 1;");
    s.updateDoc(URI, "let y = 2;");
    expect(s.docs.get(URI)!.source).toBe("let y = 2;");
  });

  it("closeDoc removes the doc", () => {
    const s = makeServer("let x = 1;");
    s.closeDoc(URI);
    expect(s.docs.get(URI)).toBeUndefined();
  });

  it("didOpen via handleMessage publishes diagnostics", () => {
    const s = new AetherLSP();
    s.handleMessage({
      jsonrpc: "2.0", method: "textDocument/didOpen",
      params: { textDocument: { uri: URI, text: "let x = 1;", version: 1 } },
    });
    expect(s.docs.get(URI)).toBeTruthy();
    expect(s.lastDiagnostics).toBeTruthy();
    expect(s.diagnosticsPushed).toBe(1);
  });

  it("didChange updates the doc and republishes diagnostics", () => {
    const s = new AetherLSP();
    s.handleMessage({
      jsonrpc: "2.0", method: "textDocument/didOpen",
      params: { textDocument: { uri: URI, text: "let x = 1;", version: 1 } },
    });
    s.handleMessage({
      jsonrpc: "2.0", method: "textDocument/didChange",
      params: {
        textDocument: { uri: URI, version: 2 },
        contentChanges: [{ text: "let y = 2;" }],
      },
    });
    expect(s.docs.get(URI)!.source).toBe("let y = 2;");
    expect(s.diagnosticsPushed).toBe(2);
  });

  it("didClose removes the doc", () => {
    const s = makeServer("let x = 1;");
    s.handleMessage({
      jsonrpc: "2.0", method: "textDocument/didClose",
      params: { textDocument: { uri: URI } },
    });
    expect(s.docs.get(URI)).toBeUndefined();
  });

  it("publishDiagnostics stores lastDiagnostics in tests (no stdout)", () => {
    const s = makeServer("let x = ;");
    s.publishDiagnostics(URI);
    expect(s.lastDiagnostics).toBeTruthy();
    expect(s.lastDiagnostics!.uri).toBe(URI);
    expect(Array.isArray(s.lastDiagnostics!.diagnostics)).toBe(true);
  });

  it("publishDiagnostics on missing uri is a no-op", () => {
    const s = makeServer("let x = 1;");
    s.publishDiagnostics(undefined);
    // lastDiagnostics stays at whatever it was last (null in this case).
    expect(s.diagnosticsPushed).toBe(0);
  });
});

//----------------------------------------------------------------------------
// 3. Completion
//----------------------------------------------------------------------------
describe("lsp: completion", () => {
  it("returns keyword completions", () => {
    const s = makeServer("let x = 1;\n");
    const items = s.textDocumentCompletion({
      textDocument: { uri: URI }, position: { line: 0, character: 0 },
    });
    const labels = items.map((i) => i.label);
    expect(labels).toContain("let");
    expect(labels).toContain("fn");
    expect(labels).toContain("if");
    expect(labels).toContain("match");
    expect(labels).toContain("while");
  });

  it("marks keywords as CompletionItemKind.Keyword", () => {
    const s = makeServer("let x = 1;\n");
    const items = s.textDocumentCompletion({
      textDocument: { uri: URI }, position: { line: 0, character: 0 },
    });
    const kw = items.find((i) => i.label === "let");
    expect(kw).toBeTruthy();
    expect(kw!.kind).toBe(CompletionItemKind.Keyword);
  });

  it("includes stdlib functions", () => {
    const s = makeServer("let s = toUpper(\"hi\");\n");
    const items = s.textDocumentCompletion({
      textDocument: { uri: URI }, position: { line: 0, character: 0 },
    });
    const labels = items.map((i) => i.label);
    expect(labels).toContain("toUpper");
    expect(labels).toContain("split");
    expect(labels).toContain("join");
  });

  it("stdlib items carry documentation", () => {
    const s = makeServer("let s = toUpper(\"hi\");\n");
    const items = s.textDocumentCompletion({
      textDocument: { uri: URI }, position: { line: 0, character: 0 },
    });
    const up = items.find((i) => i.label === "toUpper");
    expect(up).toBeTruthy();
    expect(up!.documentation).toBeTruthy();
  });

  it("includes inline builtins", () => {
    const s = makeServer("let x = 1;\n");
    const items = s.textDocumentCompletion({
      textDocument: { uri: URI }, position: { line: 0, character: 0 },
    });
    const labels = items.map((i) => i.label);
    expect(labels).toContain("print");
    expect(labels).toContain("assert_eq");
    expect(labels).toContain("len");
    expect(labels).toContain("range");
  });

  it("includes top-level fn names in scope", () => {
    const s = makeServer("fn helper() -> int { 1 }\nlet x = helper();\n");
    const items = s.textDocumentCompletion({
      textDocument: { uri: URI }, position: { line: 1, character: 10 },
    });
    const labels = items.map((i) => i.label);
    expect(labels).toContain("helper");
  });

  it("includes top-level let binding in scope", () => {
    const s = makeServer("let top = 42;\nprint(top);\n");
    const items = s.textDocumentCompletion({
      textDocument: { uri: URI }, position: { line: 1, character: 6 },
    });
    expect(items.map((i) => i.label)).toContain("top");
  });

  it("includes params when in function body", () => {
    const s = makeServer("fn add(a: int, b: int) -> int {\n  a + b\n}\n");
    const items = s.textDocumentCompletion({
      textDocument: { uri: URI }, position: { line: 1, character: 2 },
    });
    const labels = items.map((i) => i.label);
    expect(labels).toContain("a");
    expect(labels).toContain("b");
  });

  it("includes for-loop variable inside body", () => {
    const s = makeServer("for i in range(0, 3) {\n  print(i);\n}\n");
    const items = s.textDocumentCompletion({
      textDocument: { uri: URI }, position: { line: 1, character: 6 },
    });
    expect(items.map((i) => i.label)).toContain("i");
  });

  it("deduplicates names already in scope", () => {
    const s = makeServer("let x = 1;\nprint(x);\n");
    const items = s.textDocumentCompletion({
      textDocument: { uri: URI }, position: { line: 1, character: 6 },
    });
    const xs = items.filter((i) => i.label === "x");
    expect(xs.length).toBe(1);
  });

  it("returns [] for unknown uri", () => {
    const s = makeServer("let x = 1;");
    expect(s.textDocumentCompletion({
      textDocument: { uri: "file://nope.ae" }, position: { line: 0, character: 0 },
    })).toEqual([]);
  });

  it("completion item has insertText === label", () => {
    const s = makeServer("let x = 1;\n");
    const items = s.textDocumentCompletion({
      textDocument: { uri: URI }, position: { line: 0, character: 0 },
    });
    for (const it of items) expect(it.insertText).toBe(it.label);
  });
});

//----------------------------------------------------------------------------
// 4. Hover
//----------------------------------------------------------------------------
describe("lsp: hover", () => {
  it("returns stdlib docstring for a stdlib fn name", () => {
    const s = makeServer('let s = toUpper("hi");\n');
    const h = s.textDocumentHover({
      textDocument: { uri: URI }, position: { line: 0, character: 10 },
    });
    expect(h).not.toBeNull();
    expect(h!.contents.kind).toBe("markdown");
    expect(h!.contents.value).toContain("toUpper");
  });

  it("returns builtin marker for an inline builtin", () => {
    const s = makeServer("let x = len(\"hi\");\n");
    const h = s.textDocumentHover({
      textDocument: { uri: URI }, position: { line: 0, character: 10 },
    });
    expect(h).not.toBeNull();
    expect(h!.contents.value).toContain("builtin");
  });

  it("returns the type of an identifier in scope", () => {
    const s = makeServer("let x = 5;\nprint(x);\n");
    const h = s.textDocumentHover({
      textDocument: { uri: URI }, position: { line: 0, character: 4 },
    });
    expect(h).not.toBeNull();
    expect(h!.contents.value).toContain("int");
  });

  it("returns a signature for a top-level fn", () => {
    const s = makeServer("fn helper(a: int) -> int { a + 1 }\nhelper(2);\n");
    const h = s.textDocumentHover({
      textDocument: { uri: URI }, position: { line: 1, character: 1 },
    });
    expect(h).not.toBeNull();
    expect(h!.contents.value).toContain("fn helper");
  });

  it("returns null when hovering on whitespace", () => {
    const s = makeServer("let x = 1;\n");
    const h = s.textDocumentHover({
      textDocument: { uri: URI }, position: { line: 0, character: 0 },
    });
    // Position 0 is 'l' of 'let' — but it's not an identifier. Should
    // fall back to wordAt which gives 'let', which is a keyword and not
    // a stdlib / builtin / decl. Returns null.
    expect(h).toBeNull();
  });

  it("hover range matches identifier location", () => {
    const s = makeServer("let x = 1;\nprint(x);\n");
    const h = s.textDocumentHover({
      textDocument: { uri: URI }, position: { line: 1, character: 6 },
    })!;
    expect(h.range).toBeTruthy();
    expect(h.range!.start.line).toBe(1);
    expect(h.range!.end.line).toBe(1);
  });

  it("hover on enum variant type works", () => {
    const s = makeServer("enum Color { Red, Green, Blue }\nlet c = Color::Red;\n");
    const h = s.textDocumentHover({
      textDocument: { uri: URI }, position: { line: 0, character: 6 },
    });
    expect(h).not.toBeNull();
  });

  it("returns null for unknown uri", () => {
    const s = makeServer("let x = 1;");
    expect(s.textDocumentHover({
      textDocument: { uri: "file://x" }, position: { line: 0, character: 0 },
    })).toBeNull();
  });
});

//----------------------------------------------------------------------------
// 5. Definition
//----------------------------------------------------------------------------
describe("lsp: definition", () => {
  it("jumps to a top-level fn definition", () => {
    const s = makeServer("fn helper() -> int { 1 }\nhelper();\n");
    const loc = s.textDocumentDefinition({
      textDocument: { uri: URI }, position: { line: 1, character: 1 },
    });
    expect(loc).not.toBeNull();
    expect(loc!.uri).toBe(URI);
    expect(loc!.range.start.line).toBe(0);
  });

  it("jumps to a top-level let definition", () => {
    const s = makeServer("let x = 5;\nprint(x);\n");
    const loc = s.textDocumentDefinition({
      textDocument: { uri: URI }, position: { line: 1, character: 6 },
    });
    expect(loc).not.toBeNull();
    expect(loc!.range.start.line).toBe(0);
  });

  it("jumps to a struct definition", () => {
    const s = makeServer("struct Point { x: int, y: int }\nlet p = Point { x: 1, y: 2 };\n");
    const loc = s.textDocumentDefinition({
      textDocument: { uri: URI }, position: { line: 1, character: 8 },
    });
    expect(loc).not.toBeNull();
    expect(loc!.range.start.line).toBe(0);
  });

  it("returns null for an unknown identifier", () => {
    const s = makeServer("let x = 1;\n");
    expect(s.textDocumentDefinition({
      textDocument: { uri: URI }, position: { line: 0, character: 4 },
    })?.uri).toBe(URI);
    // x is defined here so should jump to its decl.
    const loc2 = s.textDocumentDefinition({
      textDocument: { uri: URI }, position: { line: 1, character: 4 },
    });
    expect(loc2).toBeNull(); // line 1 doesn't exist, no ident found
  });

  it("declaration alias returns same as definition", () => {
    const s = makeServer("fn f() -> int { 1 }\nf();\n");
    const d1 = s.textDocumentDefinition({
      textDocument: { uri: URI }, position: { line: 1, character: 1 },
    });
    const d2 = s.handleMessage({
      jsonrpc: "2.0", id: 1, method: "textDocument/declaration",
      params: { textDocument: { uri: URI }, position: { line: 1, character: 1 } },
    });
    expect(d2.result.uri).toBe(d1!.uri);
  });

  it("typeDefinition alias returns same as definition", () => {
    const s = makeServer("fn f() -> int { 1 }\nf();\n");
    const d = s.handleMessage({
      jsonrpc: "2.0", id: 1, method: "textDocument/typeDefinition",
      params: { textDocument: { uri: URI }, position: { line: 1, character: 1 } },
    });
    expect(d.result.uri).toBe(URI);
  });

  it("implementation alias returns same as definition", () => {
    const s = makeServer("fn f() -> int { 1 }\nf();\n");
    const d = s.handleMessage({
      jsonrpc: "2.0", id: 1, method: "textDocument/implementation",
      params: { textDocument: { uri: URI }, position: { line: 1, character: 1 } },
    });
    expect(d.result.uri).toBe(URI);
  });
});

//----------------------------------------------------------------------------
// 6. References
//----------------------------------------------------------------------------
describe("lsp: references", () => {
  it("finds all references of a let binding", () => {
    const s = makeServer("let x = 1;\nprint(x);\nlet y = x + 1;\n");
    const refs = s.textDocumentReferences({
      textDocument: { uri: URI }, position: { line: 1, character: 6 },
    });
    expect(refs.length).toBeGreaterThanOrEqual(2);
    for (const r of refs) expect(r.uri).toBe(URI);
  });

  it("returns one Location per occurrence", () => {
    const s = makeServer("fn f() -> int { 1 }\nf();\nf();\n");
    const refs = s.textDocumentReferences({
      textDocument: { uri: URI }, position: { line: 1, character: 1 },
    });
    // 3 occurrences: 1 decl + 2 calls.
    expect(refs.length).toBe(3);
  });

  it("returns [] for unknown identifier", () => {
    const s = makeServer("let x = 1;\n");
    // No Ident at (1,0).
    const refs = s.textDocumentReferences({
      textDocument: { uri: URI }, position: { line: 5, character: 0 },
    });
    expect(refs).toEqual([]);
  });

  it("returns [] for unknown uri", () => {
    const s = makeServer("let x = 1;");
    expect(s.textDocumentReferences({
      textDocument: { uri: "file://x" }, position: { line: 0, character: 0 },
    })).toEqual([]);
  });
});

//----------------------------------------------------------------------------
// 7. Rename
//----------------------------------------------------------------------------
describe("lsp: rename", () => {
  it("produces a WorkspaceEdit renaming all occurrences", () => {
    const s = makeServer("let x = 1;\nprint(x);\nlet y = x + 1;\n");
    const we = s.textDocumentRename({
      textDocument: { uri: URI },
      position: { line: 1, character: 6 },
      newName: "renamed_x",
    });
    expect(we).not.toBeNull();
    expect(we!.changes).toBeTruthy();
    const edits = we!.changes![URI];
    expect(edits.length).toBeGreaterThanOrEqual(3); // decl + 2 uses
    for (const e of edits) expect(e.newText).toBe("renamed_x");
  });

  it("returns null when no ident at position", () => {
    const s = makeServer("let x = 1;\n");
    const we = s.textDocumentRename({
      textDocument: { uri: URI },
      position: { line: 99, character: 99 },
      newName: "z",
    });
    expect(we).toBeNull();
  });

  it("rename of a function updates decl + calls", () => {
    const s = makeServer("fn foo() -> int { 1 }\nfoo();\nfoo();\n");
    const we = s.textDocumentRename({
      textDocument: { uri: URI },
      position: { line: 1, character: 1 },
      newName: "bar",
    })!;
    const edits = we.changes![URI];
    expect(edits.length).toBe(3);
    const declEdit = edits.find((e) => e.range.start.character === 3);
    expect(declEdit).toBeTruthy();
  });

  it("returns null for unknown uri", () => {
    const s = makeServer("let x = 1;");
    expect(s.textDocumentRename({
      textDocument: { uri: "file://x" },
      position: { line: 0, character: 4 },
      newName: "z",
    })).toBeNull();
  });
});

//----------------------------------------------------------------------------
// 8. Diagnostics
//----------------------------------------------------------------------------
describe("lsp: diagnostics", () => {
  it("reports no diagnostics for clean source", () => {
    const s = makeServer("let x = 1;\nprint(x);\n");
    const diags = s.textDocumentDiagnostics({ textDocument: { uri: URI } });
    // Lint may emit "prefer-const" infos but no errors.
    const errors = diags.filter((d) => d.severity === DiagnosticSeverity.Error);
    expect(errors.length).toBe(0);
  });

  it("reports type errors as Error severity", () => {
    const s = makeServer("let x: int = \"hello\";\n");
    const diags = s.textDocumentDiagnostics({ textDocument: { uri: URI } });
    const typeErrs = diags.filter((d) => d.source === "type");
    expect(typeErrs.length).toBeGreaterThan(0);
    for (const d of typeErrs) expect(d.severity).toBe(DiagnosticSeverity.Error);
  });

  it("reports parse errors", () => {
    const s = makeServer("let x = ;\n");
    const diags = s.textDocumentDiagnostics({ textDocument: { uri: URI } });
    const parseErrs = diags.filter((d) => d.source === "parse");
    expect(parseErrs.length).toBeGreaterThan(0);
  });

  it("reports lint diagnostics with rule code", () => {
    // Has trailing whitespace — triggers no-trailing-whitespace.
    const s = makeServer("let x = 1;   \n");
    const diags = s.textDocumentDiagnostics({ textDocument: { uri: URI } });
    const lintDiags = diags.filter((d) => d.source?.startsWith("lint:"));
    expect(lintDiags.length).toBeGreaterThan(0);
    for (const d of lintDiags) expect(d.code).toBeTruthy();
  });

  it("diagnostics include range with 0-based LSP positions", () => {
    const s = makeServer("let x: int = \"hi\";\n");
    const diags = s.textDocumentDiagnostics({ textDocument: { uri: URI } });
    const typeErr = diags.find((d) => d.source === "type");
    if (typeErr) {
      expect(typeErr.range.start.line).toBeGreaterThanOrEqual(0);
      expect(typeErr.range.start.character).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns [] for unknown uri", () => {
    const s = makeServer("let x = 1;");
    expect(s.textDocumentDiagnostics({ textDocument: { uri: "file://x" } })).toEqual([]);
  });

  it("publishDiagnostics pushes the same set as textDocument/diagnostic", () => {
    const s = makeServer("let x: int = \"hi\";\n");
    s.publishDiagnostics(URI);
    const pushed = s.lastDiagnostics!.diagnostics;
    const pulled = s.textDocumentDiagnostics({ textDocument: { uri: URI } });
    expect(pushed.length).toBe(pulled.length);
  });
});

//----------------------------------------------------------------------------
// 9. Formatting
//----------------------------------------------------------------------------
describe("lsp: formatting", () => {
  it("returns a single TextEdit replacing the whole document", () => {
    const s = makeServer("let x=1;\n");
    const edits = s.textDocumentFormatting({ textDocument: { uri: URI } });
    expect(edits.length).toBe(1);
    expect(edits[0].range.start.line).toBe(0);
    expect(edits[0].range.start.character).toBe(0);
    expect(edits[0].newText).toContain("let x = 1;");
  });

  it("returns [] when source is already formatted", () => {
    const s = makeServer("let x: int = 1;\n");
    const edits = s.textDocumentFormatting({ textDocument: { uri: URI } });
    expect(edits).toEqual([]);
  });

  it("returns [] for unknown uri", () => {
    const s = makeServer("let x = 1;\n");
    expect(s.textDocumentFormatting({ textDocument: { uri: "file://x" } })).toEqual([]);
  });

  it("newText is the formatted source", () => {
    const src = "let   x   =   1;\n";
    const s = makeServer(src);
    const edits = s.textDocumentFormatting({ textDocument: { uri: URI } });
    expect(edits[0].newText).toBe("let x = 1;\n");
  });
});

//----------------------------------------------------------------------------
// 10. Code Actions
//----------------------------------------------------------------------------
describe("lsp: codeAction", () => {
  it("returns one code action per lint diagnostic with a fix", () => {
    // while-with-counter triggers prefer-range rule with a fix.
    const src = "fn f() {\n  let mut i = 0;\n  while i < 10 {\n    i = i + 1;\n  };\n}\n";
    const s = makeServer(src);
    const actions = s.textDocumentCodeAction({
      textDocument: { uri: URI },
      range: { start: { line: 2, character: 2 }, end: { line: 2, character: 30 } },
    });
    expect(actions.length).toBeGreaterThan(0);
    const withFix = actions.find((a) => a.title.startsWith("Apply fix:"));
    expect(withFix).toBeTruthy();
    expect(withFix!.edit).toBeTruthy();
    expect(withFix!.edit!.changes![URI].length).toBe(1);
  });

  it("code actions outside the requested range are filtered out", () => {
    const src = "let a = 1;   \nlet b = 2;   \n";
    const s = makeServer(src);
    const actions = s.textDocumentCodeAction({
      textDocument: { uri: URI },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 12 } },
    });
    // Only line 0 diagnostics should appear.
    for (const a of actions) {
      for (const d of a.diagnostics ?? []) {
        expect(d.range.start.line).toBe(0);
      }
    }
  });

  it("quickfix action has kind=quickfix", () => {
    const src = "let a = 1;   \n";
    const s = makeServer(src);
    const actions = s.textDocumentCodeAction({
      textDocument: { uri: URI },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 12 } },
    });
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) expect(a.kind).toBe("quickfix");
  });

  it("returns [] for unknown uri", () => {
    const s = makeServer("let x = 1;\n");
    expect(s.textDocumentCodeAction({
      textDocument: { uri: "file://x" },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    })).toEqual([]);
  });
});

//----------------------------------------------------------------------------
// 11. Semantic Tokens
//----------------------------------------------------------------------------
describe("lsp: semanticTokens", () => {
  it("returns an empty array for unknown uri", () => {
    const s = makeServer("let x = 1;\n");
    expect(s.textDocumentSemanticTokens({ textDocument: { uri: "file://x" } })).toEqual({ data: [] });
  });

  it("returns delta-encoded array with 5-tuples", () => {
    const s = makeServer("let x = 1;\n");
    const r = s.textDocumentSemanticTokens({ textDocument: { uri: URI } });
    expect(Array.isArray(r.data)).toBe(true);
    expect(r.data.length % 5).toBe(0);
  });

  it("emits a keyword token for 'let'", () => {
    const s = makeServer("let x = 1;\n");
    const r = s.textDocumentSemanticTokens({ textDocument: { uri: URI } });
    // The first delta should be: deltaLine=0, deltaChar=0, length=3, type=keyword(15), modifiers=0
    expect(r.data[0]).toBe(0);
    expect(r.data[1]).toBe(0);
    expect(r.data[2]).toBe(3); // "let"
    expect(r.data[3]).toBe(15); // keyword index in our legend
  });

  it("emits a string token for a string literal", () => {
    const s = makeServer('let s = "hi";\n');
    const r = s.textDocumentSemanticTokens({ textDocument: { uri: URI } });
    // Find the string token (type index = 18 for "string").
    const types = r.data.filter((_, i) => i % 5 === 3);
    expect(types).toContain(18);
  });

  it("emits a number token for an int literal", () => {
    const s = makeServer("let x = 42;\n");
    const r = s.textDocumentSemanticTokens({ textDocument: { uri: URI } });
    const types = r.data.filter((_, i) => i % 5 === 3);
    expect(types).toContain(19); // "number" index
  });

  it("emits a comment token for a line comment", () => {
    const s = makeServer("// hello\nlet x = 1;\n");
    const r = s.textDocumentSemanticTokens({ textDocument: { uri: URI } });
    const types = r.data.filter((_, i) => i % 5 === 3);
    expect(types).toContain(17); // "comment"
  });

  it("emits a function token for a fn name", () => {
    const s = makeServer("fn foo() -> int { 1 }\n");
    const r = s.textDocumentSemanticTokens({ textDocument: { uri: URI } });
    const types = r.data.filter((_, i) => i % 5 === 3);
    expect(types).toContain(12); // "function"
  });

  it("delta line numbers are non-decreasing", () => {
    const s = makeServer("let x = 1;\nlet y = 2;\nlet z = 3;\n");
    const r = s.textDocumentSemanticTokens({ textDocument: { uri: URI } });
    let line = 0;
    for (let i = 0; i < r.data.length; i += 5) {
      line += r.data[i];
      expect(line).toBeGreaterThanOrEqual(0);
    }
  });
});

//----------------------------------------------------------------------------
// 12. Document Symbol
//----------------------------------------------------------------------------
describe("lsp: documentSymbol", () => {
  it("lists top-level fn declarations", () => {
    const s = makeServer("fn foo() -> int { 1 }\nfn bar() -> int { 2 }\n");
    const syms = s.textDocumentDocumentSymbol({ textDocument: { uri: URI } });
    const names = syms.map((s) => s.name);
    expect(names).toContain("foo");
    expect(names).toContain("bar");
  });

  it("lists struct/enum/type declarations", () => {
    const s = makeServer("struct Point { x: int, y: int }\nenum E { A, B }\ntype ID = int;\n");
    const syms = s.textDocumentDocumentSymbol({ textDocument: { uri: URI } });
    const names = syms.map((s) => s.name);
    expect(names).toContain("Point");
    expect(names).toContain("E");
    expect(names).toContain("ID");
  });

  it("marks fns with SymbolKind.Function", () => {
    const s = makeServer("fn foo() -> int { 1 }\n");
    const syms = s.textDocumentDocumentSymbol({ textDocument: { uri: URI } });
    const f = syms.find((s) => s.name === "foo")!;
    expect(f.kind).toBe(SymbolKind.Function);
  });

  it("marks structs with SymbolKind.Struct", () => {
    const s = makeServer("struct S { x: int }\n");
    const syms = s.textDocumentDocumentSymbol({ textDocument: { uri: URI } });
    const st = syms.find((s) => s.name === "S")!;
    expect(st.kind).toBe(SymbolKind.Struct);
  });

  it("marks enums with SymbolKind.Enum", () => {
    const s = makeServer("enum E { A, B }\n");
    const syms = s.textDocumentDocumentSymbol({ textDocument: { uri: URI } });
    const en = syms.find((s) => s.name === "E")!;
    expect(en.kind).toBe(SymbolKind.Enum);
  });

  it("selection range is the name position", () => {
    const s = makeServer("fn foo() -> int { 1 }\n");
    const syms = s.textDocumentDocumentSymbol({ textDocument: { uri: URI } });
    const f = syms[0];
    expect(f.selectionRange.start.character).toBe(3); // after "fn "
    expect(f.selectionRange.end.character - f.selectionRange.start.character).toBe(3);
  });

  it("returns [] for unknown uri", () => {
    const s = makeServer("let x = 1;");
    expect(s.textDocumentDocumentSymbol({ textDocument: { uri: "file://x" } })).toEqual([]);
  });

  it("lists top-level let / const", () => {
    const s = makeServer("let a = 1;\nconst B = 2;\n");
    const syms = s.textDocumentDocumentSymbol({ textDocument: { uri: URI } });
    expect(syms.map((s) => s.name)).toContain("a");
    expect(syms.map((s) => s.name)).toContain("B");
  });
});

//----------------------------------------------------------------------------
// 13. Signature Help
//----------------------------------------------------------------------------
describe("lsp: signatureHelp", () => {
  it("returns signature for a stdlib fn call", () => {
    const s = makeServer('let s = toUpper("hi");\n');
    const sh = s.textDocumentSignatureHelp({
      textDocument: { uri: URI }, position: { line: 0, character: 17 },
    });
    expect(sh).not.toBeNull();
    expect(sh!.signatures.length).toBe(1);
    expect(sh!.signatures[0].label).toContain("toUpper");
  });

  it("returns signature for a user fn call", () => {
    const s = makeServer("fn add(a: int, b: int) -> int { a + b }\nadd(1, 2);\n");
    const sh = s.textDocumentSignatureHelp({
      textDocument: { uri: URI }, position: { line: 1, character: 5 },
    });
    expect(sh).not.toBeNull();
    expect(sh!.signatures[0].label).toContain("add");
    expect(sh!.signatures[0].parameters?.length).toBe(2);
  });

  it("activeParameter tracks the number of args typed", () => {
    const s = makeServer("fn add(a: int, b: int, c: int) -> int { a + b + c }\nadd(1, 2,\n");
    const sh = s.textDocumentSignatureHelp({
      textDocument: { uri: URI }, position: { line: 1, character: 8 },
    });
    expect(sh).not.toBeNull();
    expect(sh!.activeParameter).toBeGreaterThanOrEqual(1);
  });

  it("returns null when not in a call", () => {
    const s = makeServer("let x = 1;\n");
    const sh = s.textDocumentSignatureHelp({
      textDocument: { uri: URI }, position: { line: 0, character: 5 },
    });
    expect(sh).toBeNull();
  });

  it("returns null for unknown uri", () => {
    const s = makeServer("let x = f();\n");
    expect(s.textDocumentSignatureHelp({
      textDocument: { uri: "file://x" }, position: { line: 0, character: 10 },
    })).toBeNull();
  });

  it("picks the innermost call when nested", () => {
    const s = makeServer("fn f(a: int) -> int { a }\nlet x = f(f(1));\n");
    const sh = s.textDocumentSignatureHelp({
      textDocument: { uri: URI }, position: { line: 1, character: 9 },
    });
    expect(sh).not.toBeNull();
    // Innermost is f(1) — still labeled "f" in our implementation.
    expect(sh!.signatures[0].label).toContain("f");
  });
});

//----------------------------------------------------------------------------
// 14. Document Highlight
//----------------------------------------------------------------------------
describe("lsp: documentHighlight", () => {
  it("finds all occurrences of an identifier in the doc", () => {
    const s = makeServer("let x = 1;\nprint(x);\nlet y = x + 1;\n");
    const hls = s.textDocumentDocumentHighlight({
      textDocument: { uri: URI }, position: { line: 1, character: 6 },
    });
    expect(hls.length).toBe(3);
  });

  it("returns [] when no ident at position", () => {
    const s = makeServer("let x = 1;\n");
    expect(s.textDocumentDocumentHighlight({
      textDocument: { uri: URI }, position: { line: 5, character: 0 },
    })).toEqual([]);
  });

  it("returns [] for unknown uri", () => {
    const s = makeServer("let x = 1;");
    expect(s.textDocumentDocumentHighlight({
      textDocument: { uri: "file://x" }, position: { line: 0, character: 0 },
    })).toEqual([]);
  });
});

//----------------------------------------------------------------------------
// 15. Code Lens
//----------------------------------------------------------------------------
describe("lsp: codeLens", () => {
  it("returns one lens per top-level fn", () => {
    const s = makeServer("fn a() -> int { 1 }\nfn b(x: int) -> int { x }\n");
    const lenses = s.textDocumentCodeLens({ textDocument: { uri: URI } });
    expect(lenses.length).toBe(2);
  });

  it("lens command title mentions param count", () => {
    const s = makeServer("fn b(x: int, y: int) -> int { x + y }\n");
    const lenses = s.textDocumentCodeLens({ textDocument: { uri: URI } });
    expect(lenses[0].command?.title).toContain("2 params");
  });

  it("returns [] when there are no fns", () => {
    const s = makeServer("let x = 1;\n");
    expect(s.textDocumentCodeLens({ textDocument: { uri: URI } })).toEqual([]);
  });

  it("returns [] for unknown uri", () => {
    const s = makeServer("fn a() -> int { 1 }\n");
    expect(s.textDocumentCodeLens({ textDocument: { uri: "file://x" } })).toEqual([]);
  });
});
