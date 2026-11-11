import { describe, it, expect } from "vitest";
import * as S from "./index";

describe("string module", () => {
  it("split: by separator", () => {
    expect(S.split("a,b,c", ",")).toEqual(["a", "b", "c"]);
  });
  it("split: default whitespace", () => {
    expect(S.split("  a b   c ")).toEqual(["a", "b", "c"]);
  });
  it("split: empty separator yields code points", () => {
    expect(S.split("abc", "")).toEqual(["a", "b", "c"]);
  });
  it("split: empty string with sep yields ['']", () => {
    expect(S.split("", ",")).toEqual([""]);
  });

  it("join: with separator", () => {
    expect(S.join(["a", "b", "c"], "-")).toBe("a-b-c");
  });
  it("join: default comma", () => {
    expect(S.join([1, 2, 3])).toBe("1,2,3");
  });
  it("join: empty array", () => {
    expect(S.join([], "|")).toBe("");
  });

  it("trim: both sides", () => {
    expect(S.trim("  hi  ")).toBe("hi");
  });
  it("trim: no whitespace", () => {
    expect(S.trim("hi")).toBe("hi");
  });

  it("trimStart", () => {
    expect(S.trimStart("  hi  ")).toBe("hi  ");
  });
  it("trimEnd", () => {
    expect(S.trimEnd("  hi  ")).toBe("  hi");
  });

  it("toUpper / toLower", () => {
    expect(S.toUpper("aBc")).toBe("ABC");
    expect(S.toLower("aBc")).toBe("abc");
  });
  it("toUpper: non-ascii", () => {
    expect(S.toUpper("café")).toBe("CAFÉ");
  });

  it("replace: first only", () => {
    expect(S.replace("a-a-a", "-", "+")).toBe("a+a-a");
  });
  it("replace: no match", () => {
    expect(S.replace("abc", "z", "y")).toBe("abc");
  });
  it("replaceAll", () => {
    expect(S.replaceAll("a-a-a", "-", "+")).toBe("a+a+a");
  });
  it("replaceAll: empty from is a no-op", () => {
    expect(S.replaceAll("abc", "", "X")).toBe("abc");
  });

  it("startsWith", () => {
    expect(S.startsWith("hello", "he")).toBe(true);
    expect(S.startsWith("hello", "lo")).toBe(false);
  });
  it("endsWith", () => {
    expect(S.endsWith("hello", "lo")).toBe(true);
    expect(S.endsWith("hello", "he")).toBe(false);
  });
  it("contains", () => {
    expect(S.contains("hello", "ell")).toBe(true);
    expect(S.contains("hello", "xyz")).toBe(false);
  });
  it("indexOf", () => {
    expect(S.indexOf("hello", "l")).toBe(2);
    expect(S.indexOf("hello", "z")).toBe(-1);
  });

  it("slice: one arg", () => {
    expect(S.slice("hello", 1)).toBe("ello");
  });
  it("slice: two args", () => {
    expect(S.slice("hello", 1, 3)).toBe("el");
  });
  it("slice: negative start", () => {
    expect(S.slice("hello", -2)).toBe("lo");
  });

  it("charAt: valid", () => {
    expect(S.charAt("abc", 1)).toBe("b");
  });
  it("charAt: out of bounds panics", () => {
    expect(() => S.charAt("abc", 5)).toThrow();
  });

  it("charCode", () => {
    expect(S.charCode("A", 0)).toBe(65);
  });
  it("charCode: out of bounds panics", () => {
    expect(() => S.charCode("A", 1)).toThrow();
  });

  it("fromCharCode: ASCII", () => {
    expect(S.fromCharCode(65)).toBe("A");
  });
  it("fromCharCode: code point above BMP", () => {
    expect(S.fromCharCode(0x1f600)).toBe("😀");
  });
  it("fromCharCode: out of range panics", () => {
    expect(() => S.fromCharCode(-1)).toThrow();
  });

  it("repeat", () => {
    expect(S.repeat("ab", 3)).toBe("ababab");
  });
  it("repeat: zero", () => {
    expect(S.repeat("ab", 0)).toBe("");
  });
  it("repeat: negative panics", () => {
    expect(() => S.repeat("ab", -1)).toThrow();
  });

  it("padStart: default space", () => {
    expect(S.padStart("5", 3)).toBe("  5");
  });
  it("padStart: custom char", () => {
    expect(S.padStart("5", 3, "0")).toBe("005");
  });
  it("padEnd", () => {
    expect(S.padEnd("5", 3, ".")).toBe("5..");
  });

  it("reverse: ASCII", () => {
    expect(S.reverse("abc")).toBe("cba");
  });
  it("reverse: Unicode", () => {
    expect(S.reverse("a😀b")).toBe("b😀a");
  });

  it("len: ASCII", () => {
    expect(S.len("abc")).toBe(3);
  });
  it("len: Unicode counts code points", () => {
    expect(S.len("a😀b")).toBe(3);
  });

  it("isEmpty", () => {
    expect(S.isEmpty("")).toBe(true);
    expect(S.isEmpty("x")).toBe(false);
  });

  it("toInt: decimal", () => {
    expect(S.toInt("42")).toBe(42);
  });
  it("toInt: trimmed signed", () => {
    expect(S.toInt("  -7 ")).toBe(-7);
  });
  it("toInt: truncates float syntax", () => {
    expect(S.toInt("3.9")).toBe(3);
  });
  it("toInt: invalid panics", () => {
    expect(() => S.toInt("nope")).toThrow();
  });

  it("format: %s %d %f", () => {
    expect(S.format("%s=%d", "x", 7)).toBe("x=7");
    expect(S.format("pi=%f", 3.14159)).toBe("pi=3.141590");
  });
  it("format: width and precision", () => {
    expect(S.format("%5.2f", 3.14159)).toBe(" 3.14");
    expect(S.format("%-5.2f|", 3.1)).toBe("3.10 |");
  });
  it("format: hex and oct", () => {
    expect(S.format("%x", 255)).toBe("ff");
    expect(S.format("%X", 255)).toBe("FF");
    expect(S.format("%o", 8)).toBe("10");
  });
  it("format: literal percent", () => {
    expect(S.format("100%%", )).toBe("100%");
  });
  it("format: %s truncates with precision", () => {
    expect(S.format("%.2s", "hello")).toBe("he");
  });
});
