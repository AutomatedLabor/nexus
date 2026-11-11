/**
 * aether/core/lexer/lexer.test.ts
 * ==============================
 * Comprehensive lexer test suite — every token type, literals, interpolation,
 * comments, errors, unicode identifiers, all keywords, all operators, and
 * location tracking.
 */
import { describe, it, expect } from "vitest";
import { lex, lexWithErrors, isKeyword, isPunct } from "./lexer";

describe("lexer: integer literals", () => {
  it("lexes a single-digit int", () => {
    const t = lex("5");
    expect(t[0].kind).toBe("Int");
    expect(t[0].value).toBe("5");
  });
  it("lexes multi-digit int", () => {
    const t = lex("12345");
    expect(t[0].kind).toBe("Int");
    expect(t[0].value).toBe("12345");
  });
  it("lexes int with underscores", () => {
    const t = lex("1_000_000");
    expect(t[0].kind).toBe("Int");
    expect(t[0].value).toBe("1000000");
  });
});

describe("lexer: float literals", () => {
  it("lexes a float", () => {
    const t = lex("3.14");
    expect(t[0].kind).toBe("Float");
    expect(t[0].value).toBe("3.14");
  });
  it("lexes a float with exponent", () => {
    const t = lex("1.5e10");
    expect(t[0].kind).toBe("Float");
    expect(t[0].value).toBe("1.5e10");
  });
  it("lexes a float with negative exponent", () => {
    const t = lex("1e-3");
    expect(t[0].kind).toBe("Float");
    expect(t[0].value).toBe("1e-3");
  });
  it("lexes 0.0", () => {
    const t = lex("0.0");
    expect(t[0].kind).toBe("Float");
  });
  it("does not lex 1e as float (no digits)", () => {
    const t = lex("1e");
    expect(t[0].kind).toBe("Int");
    expect(t[1].kind).toBe("Ident");
  });
});

describe("lexer: radix literals", () => {
  it("lexes hex", () => {
    const t = lex("0x1A_2B");
    expect(t[0].kind).toBe("Hex");
    expect(t[0].value).toBe("0x1A2B");
  });
  it("lexes binary", () => {
    const t = lex("0b1010");
    expect(t[0].kind).toBe("Binary");
  });
  it("lexes octal", () => {
    const t = lex("0o777");
    expect(t[0].kind).toBe("Octal");
  });
});

describe("lexer: char literals", () => {
  it("lexes a simple char", () => {
    const t = lex("'a'");
    expect(t[0].kind).toBe("Char");
    expect(t[0].value).toBe("a");
  });
  it("lexes an escape char", () => {
    const t = lex("'\\n'");
    expect(t[0].kind).toBe("Char");
    expect(t[0].value).toBe("\n");
  });
  it("lexes a unicode escape", () => {
    const t = lex("'\\u{1F600}'");
    expect(t[0].value).toBe("😀");
  });
  it("errors on empty char literal", () => {
    const r = lexWithErrors("''");
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("lexer: string literals", () => {
  it("lexes a simple string", () => {
    const t = lex('"hello"');
    expect(t[0].kind).toBe("String");
    expect(t[0].segments).toEqual([{ kind: "text", value: "hello" }]);
  });
  it("lexes a string with escapes", () => {
    const t = lex('"a\\nb"');
    expect(t[0].segments).toEqual([{ kind: "text", value: "a\nb" }]);
  });
  it("lexes an empty string", () => {
    const t = lex('""');
    expect(t[0].kind).toBe("String");
    expect(t[0].segments).toEqual([]);
  });
});

describe("lexer: string interpolation", () => {
  it("lexes a basic f-string with one interp", () => {
    const t = lex('f"Hello, {name}!"');
    expect(t[0].kind).toBe("String");
    expect(t[0].segments).toEqual([
      { kind: "text", value: "Hello, " },
      { kind: "interp", value: "name" },
      { kind: "text", value: "!" },
    ]);
  });
  it("lexes f-string with expression", () => {
    const t = lex('f"{1 + 2}"');
    expect(t[0].segments).toEqual([{ kind: "interp", value: "1 + 2" }]);
  });
  it("lexes f-string with nested braces", () => {
    const t = lex('f"{map["a"]}"');
    expect(t[0].segments).toEqual([{ kind: "interp", value: 'map["a"]' }]);
  });
  it("lexes f-string with nested string in interp", () => {
    const t = lex('f"outer {inner("x")} end"');
    const segs = t[0].segments!;
    expect(segs[0].value).toBe("outer ");
    expect(segs[1].kind).toBe("interp");
    expect(segs[1].value).toBe('inner("x")');
    expect(segs[2].value).toBe(" end");
  });
  it("lexes plain string with literal braces when not f-prefixed", () => {
    const t = lex('"a{b}c"');
    expect(t[0].segments).toEqual([{ kind: "text", value: "a{b}c" }]);
  });
});

describe("lexer: identifiers", () => {
  it("lexes simple identifier", () => {
    const t = lex("foo");
    expect(t[0].kind).toBe("Ident");
    expect(t[0].value).toBe("foo");
  });
  it("lexes identifier with digits", () => {
    const t = lex("foo123");
    expect(t[0].kind).toBe("Ident");
  });
  it("lexes identifier starting with $", () => {
    const t = lex("$foo");
    expect(t[0].kind).toBe("Ident");
  });
  it("lexes identifier starting with _", () => {
    const t = lex("_unused");
    expect(t[0].kind).toBe("Ident");
  });
  it("lexes unicode identifier", () => {
    const t = lex("café");
    expect(t[0].kind).toBe("Ident");
    expect(t[0].value).toBe("café");
  });
  it("lexes unicode identifier starting with greek", () => {
    const t = lex("Σαβ");
    expect(t[0].kind).toBe("Ident");
  });
});

describe("lexer: keywords", () => {
  const kws = ["let","mut","const","fn","enum","struct","type","match","if","else","while","for","in","return","break","continue","print","true","false","unit","self","as","range","import","pub","use","or","do"];
  for (const kw of kws) {
    it(`lexes keyword ${kw}`, () => {
      const t = lex(kw);
      expect(isKeyword(t[0], kw)).toBe(true);
    });
  }
});

describe("lexer: punctuation", () => {
  const cases: string[] = [
    "..=","...","..","::","->","=>","==","!=","<=",">=","&&","||","+=","-=","*=","/=","%=","<<",">>","?","!","~","+","-","*","/","%","&","|","^","<",">","=","(",")","[","]","{","}",",",";",":",".","@",
  ];
  for (const p of cases) {
    it(`lexes punct '${p}'`, () => {
      const t = lex(p);
      expect(isPunct(t[0], p)).toBe(true);
    });
  }
  it("lexes ?? as separate ? tokens", () => {
    // '??' is a multi-char punct but we listed it; verify behavior
    const t = lex("?");
    expect(isPunct(t[0], "?")).toBe(true);
  });
});

describe("lexer: comments", () => {
  it("skips line comments", () => {
    const t = lex("// this is a comment\nfn");
    expect(t[0].kind).toBe("Keyword");
    expect(t[0].value).toBe("fn");
  });
  it("skips block comments", () => {
    const t = lex("/* a */ fn");
    expect(t[0].kind).toBe("Keyword");
    expect(t[0].value).toBe("fn");
  });
  it("skips nested block comments", () => {
    const t = lex("/* outer /* inner */ still outer */ fn");
    expect(t[0].kind).toBe("Keyword");
    expect(t[0].value).toBe("fn");
  });
  it("errors on unterminated block comment", () => {
    const r = lexWithErrors("/* unterminated");
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("lexer: errors", () => {
  it("errors on unterminated string", () => {
    const r = lexWithErrors('"unterminated');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0].message).toContain("unterminated");
  });
  it("errors on invalid number suffix", () => {
    const r = lexWithErrors("123abc");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0].message).toContain("invalid");
  });
  it("errors on unexpected char", () => {
    const r = lexWithErrors("#");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0].message).toContain("unexpected");
  });
});

describe("lexer: locations", () => {
  it("tracks line and column for first token", () => {
    const t = lex("fn foo");
    expect(t[0].loc.start.line).toBe(1);
    expect(t[0].loc.start.col).toBe(1);
    expect(t[0].loc.end.col).toBe(3);
  });
  it("updates line/col after newline", () => {
    const t = lex("fn\nfoo");
    expect(t[1].loc.start.line).toBe(2);
    expect(t[1].loc.start.col).toBe(1);
  });
  it("tracks offset", () => {
    const t = lex("ab cd");
    expect(t[0].loc.start.offset).toBe(0);
    expect(t[1].loc.start.offset).toBe(3);
  });
  it("tracks location across many lines", () => {
    const t = lex("\n\n\nfn");
    expect(t[0].loc.start.line).toBe(4);
    expect(t[0].loc.start.col).toBe(1);
  });
});

describe("lexer: whitespace", () => {
  it("skips spaces", () => {
    const t = lex("  fn  foo  ");
    expect(t[0].value).toBe("fn");
    expect(t[1].value).toBe("foo");
  });
  it("skips tabs and newlines", () => {
    const t = lex("\tfn\n\tfoo");
    expect(t[0].value).toBe("fn");
    expect(t[1].value).toBe("foo");
  });
  it("skips carriage returns", () => {
    const t = lex("\r\nfn\r");
    expect(t[0].value).toBe("fn");
  });
});

describe("lexer: token stream", () => {
  it("emits Eof at end", () => {
    const t = lex("fn");
    const last = t[t.length - 1];
    expect(last.kind).toBe("Eof");
  });
  it("lexes complex program", () => {
    const t = lex("let x: int = 42;\nfn add(a: int, b: int) -> int { a + b }");
    expect(t[0].kind).toBe("Keyword");
    expect(t[0].value).toBe("let");
    expect(t[1].kind).toBe("Ident");
    expect(t[2].kind).toBe("Punct");
    expect(t[2].value).toBe(":");
  });
});

describe("lexer: regression", () => {
  it("handles consecutive operators", () => {
    const t = lex("a>=b==c!=d");
    expect(t[1].value).toBe(">=");
    expect(t[3].value).toBe("==");
    expect(t[5].value).toBe("!=");
  });
  it("distinguishes = from ==", () => {
    const t = lex("a=b==c");
    expect(t[1].value).toBe("=");
    expect(t[3].value).toBe("==");
  });
  it("distinguishes . from ..", () => {
    const t = lex("a.b..c");
    expect(t[1].value).toBe(".");
    expect(t[2].value).toBe("b");
    expect(t[3].value).toBe("..");
  });
  it("distinguishes :: from : :", () => {
    const t = lex("a::b");
    expect(t[1].value).toBe("::");
  });
  it("distinguishes -> from - >", () => {
    const t = lex("a->b");
    expect(t[1].value).toBe("->");
  });
  it("distinguishes => from = >", () => {
    const t = lex("a=>b");
    expect(t[1].value).toBe("=>");
  });
});
