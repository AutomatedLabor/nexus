import { describe, it, expect } from "vitest";
import * as T from "./index";

describe("text module", () => {
  it("lines: simple", () => {
    expect(T.lines("a\nb\nc")).toEqual(["a", "b", "c"]);
  });
  it("lines: handles \\r\\n", () => {
    expect(T.lines("a\r\nb\r\nc")).toEqual(["a", "b", "c"]);
  });
  it("lines: trailing newline drops empty", () => {
    expect(T.lines("a\nb\n")).toEqual(["a", "b"]);
  });
  it("lines: empty string yields ['']", () => {
    expect(T.lines("")).toEqual([""]);
  });

  it("words: simple", () => {
    expect(T.words("a b c")).toEqual(["a", "b", "c"]);
  });
  it("words: collapses whitespace", () => {
    expect(T.words("  a\tb\n  c ")).toEqual(["a", "b", "c"]);
  });
  it("words: empty string", () => {
    expect(T.words("")).toEqual([]);
  });

  it("unlines", () => {
    expect(T.unlines(["a", "b", "c"])).toBe("a\nb\nc");
  });
  it("unwords", () => {
    expect(T.unwords(["a", "b", "c"])).toBe("a b c");
  });
  it("unlines: coerces non-strings", () => {
    expect(T.unlines([1, 2, 3])).toBe("1\n2\n3");
  });

  it("indent: simple", () => {
    expect(T.indent("a\nb", 2)).toBe("  a\n  b");
  });
  it("indent: zero is no-op", () => {
    expect(T.indent("a\nb", 0)).toBe("a\nb");
  });
  it("indent: negative panics", () => {
    expect(() => T.indent("a", -1)).toThrow();
  });

  it("dedent: removes common indentation", () => {
    const s = "  a\n  b\n    c";
    const r = T.dedent(s);
    expect(r).toBe("a\nb\n  c");
  });
  it("dedent: no common indentation is unchanged", () => {
    expect(T.dedent("a\n  b")).toBe("a\n  b");
  });
  it("dedent: ignores blank lines", () => {
    expect(T.dedent("  a\n\n  b")).toBe("a\n\nb");
  });

  it("wrap: simple", () => {
    expect(T.wrap("hello world foo bar", 10)).toBe("hello\nworld foo\nbar");
  });
  it("wrap: long word stays on its own line", () => {
    expect(T.wrap("a supercalifragilistic word", 5)).toBe("a\nsupercalifragilistic\nword");
  });
  it("wrap: empty string", () => {
    expect(T.wrap("", 5)).toBe("");
  });
  it("wrap: width must be positive", () => {
    expect(() => T.wrap("x", 0)).toThrow();
  });

  it("center", () => {
    expect(T.center("hi", 6)).toBe("  hi  ");
  });
  it("center: odd total favors right", () => {
    expect(T.center("hi", 5)).toBe(" hi  ");
  });
  it("center: width shorter than string returns unchanged", () => {
    expect(T.center("hello", 3)).toBe("hello");
  });

  it("left", () => {
    expect(T.left("hi", 4)).toBe("hi  ");
  });
  it("right", () => {
    expect(T.right("hi", 4)).toBe("  hi");
  });
  it("left/right: width shorter is no-op", () => {
    expect(T.left("hello", 3)).toBe("hello");
    expect(T.right("hello", 3)).toBe("hello");
  });

  it("titleCase", () => {
    expect(T.titleCase("hello world")).toBe("Hello World");
    expect(T.titleCase("HELLO WORLD")).toBe("Hello World");
  });
  it("titleCase: hyphenated", () => {
    expect(T.titleCase("well-being")).toBe("Well-Being");
  });

  it("camelCase: from snake", () => {
    expect(T.camelCase("hello_world_foo")).toBe("helloWorldFoo");
  });
  it("camelCase: from kebab", () => {
    expect(T.camelCase("hello-world")).toBe("helloWorld");
  });
  it("camelCase: from PascalCase", () => {
    expect(T.camelCase("HelloWorld")).toBe("helloWorld");
  });
  it("camelCase: from spaces", () => {
    expect(T.camelCase("hello world")).toBe("helloWorld");
  });

  it("snakeCase", () => {
    expect(T.snakeCase("HelloWorld")).toBe("hello_world");
    expect(T.snakeCase("hello-world foo")).toBe("hello_world_foo");
    expect(T.snakeCase("camelCaseWord")).toBe("camel_case_word");
  });

  it("kebabCase", () => {
    expect(T.kebabCase("HelloWorld")).toBe("hello-world");
    expect(T.kebabCase("hello_world")).toBe("hello-world");
    expect(T.kebabCase("camelCaseWord")).toBe("camel-case-word");
  });

  it("truncate: short string unchanged", () => {
    expect(T.truncate("hello", 10)).toBe("hello");
  });
  it("truncate: with ellipsis", () => {
    expect(T.truncate("hello world", 8)).toBe("hello...");
  });
  it("truncate: custom ellipsis", () => {
    expect(T.truncate("hello world", 8, "*")).toBe("hello w*");
  });
  it("truncate: very short leaves ellipsis only", () => {
    expect(T.truncate("hello world", 3)).toBe("...");
  });
  it("truncate: n=0 yields ellipsis (just-ellipsis branch of spec)", () => {
    expect(T.truncate("hello world", 0)).toBe("...");
  });
  it("truncate: n<ellipsis-length yields just ellipsis (spec)", () => {
    // cps = ["a", "😀", "b"], n = 2; ellipsis default "..." is 3 cps.
    // Per spec: n (2) < ellipsis length (3), so "just ellipsis" => "...".
    expect(T.truncate("a😀b", 2)).toBe("...");
  });
});
