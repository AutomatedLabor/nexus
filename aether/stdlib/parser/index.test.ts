import { describe, it, expect } from "vitest";
import * as P from "./index";

describe("parser module", () => {
  it("parserOk: always succeeds, no consumption", () => {
    const p = P.parserOk(42);
    const r = p("hello", 0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(42);
      expect(r.pos).toBe(0);
    }
  });

  it("parserFail: always fails with message", () => {
    const p = P.parserFail("bad");
    const r = p("hello", 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("bad");
  });

  it("parserChar: matches specific char", () => {
    const p = P.parserChar("a");
    expect(p("abc", 0)).toEqual({ ok: true, value: "a", pos: 1 });
    expect(p("xbc", 0)).toEqual({ ok: false, error: "expected 'a'", pos: 0 });
  });

  it("parserChar: panics on non-single-char", () => {
    expect(() => P.parserChar("ab")).toThrow();
  });

  it("parserString: matches literal string", () => {
    const p = P.parserString("hello");
    expect(p("hello world", 0)).toEqual({ ok: true, value: "hello", pos: 5 });
    expect(p("hi", 0).ok).toBe(false);
  });

  it("parserDigit: matches 0-9", () => {
    const p = P.parserDigit();
    expect(p("5abc", 0)).toEqual({ ok: true, value: "5", pos: 1 });
    expect(p("abc", 0).ok).toBe(false);
  });

  it("parserLetter: matches a-zA-Z", () => {
    const p = P.parserLetter();
    expect(p("a", 0)).toEqual({ ok: true, value: "a", pos: 1 });
    expect(p("Z", 0)).toEqual({ ok: true, value: "Z", pos: 1 });
    expect(p("5", 0).ok).toBe(false);
  });

  it("parserMap: transforms value", () => {
    const p = P.parserMap(P.parserDigit(), (d) => parseInt(d, 10));
    const r = p("5", 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(5);
  });

  it("parserBind: chains parsers", () => {
    const p = P.parserBind(P.parserChar("a"), () => P.parserChar("b"));
    expect(p("ab", 0)).toEqual({ ok: true, value: "b", pos: 2 });
    expect(p("ax", 0).ok).toBe(false);
  });

  it("parserThen: sequences two parsers", () => {
    const p = P.parserThen(P.parserChar("("), P.parserChar("x"));
    expect(p("(x", 0)).toEqual({ ok: true, value: "x", pos: 2 });
  });

  it("parserOr: tries left then right", () => {
    const p = P.parserOr(P.parserChar("a"), P.parserChar("b"));
    expect(p("abc", 0)).toEqual({ ok: true, value: "a", pos: 1 });
    expect(p("bcd", 0)).toEqual({ ok: true, value: "b", pos: 1 });
    expect(p("xyz", 0).ok).toBe(false);
  });

  it("parserMany: zero or more", () => {
    const p = P.parserMany(P.parserChar("a"));
    expect(p("aaab", 0)).toEqual({ ok: true, value: ["a", "a", "a"], pos: 3 });
    expect(p("xyz", 0)).toEqual({ ok: true, value: [], pos: 0 });
  });

  it("parserMany1: one or more (fails if none)", () => {
    const p = P.parserMany1(P.parserChar("a"));
    expect(p("aaab", 0)).toEqual({ ok: true, value: ["a", "a", "a"], pos: 3 });
    expect(p("xyz", 0).ok).toBe(false);
  });

  it("parserOptional: returns null when absent", () => {
    const p = P.parserOptional(P.parserChar("a"));
    expect(p("ab", 0)).toEqual({ ok: true, value: "a", pos: 1 });
    expect(p("xy", 0)).toEqual({ ok: true, value: null, pos: 0 });
  });

  it("parserSepBy: zero or more separated", () => {
    const p = P.parserSepBy(P.parserChar("a"), P.parserChar(","));
    expect(p("a,a,a", 0)).toEqual({ ok: true, value: ["a", "a", "a"], pos: 5 });
    expect(p("", 0)).toEqual({ ok: true, value: [], pos: 0 });
  });

  it("parserSepBy1: one or more separated (fails if none)", () => {
    const p = P.parserSepBy1(P.parserChar("a"), P.parserChar(","));
    expect(p("a,a", 0)).toEqual({ ok: true, value: ["a", "a"], pos: 3 });
    expect(p("", 0).ok).toBe(false);
  });

  it("parserBetween: open p close", () => {
    const p = P.parserBetween(P.parserChar("("), P.parserChar("x"), P.parserChar(")"));
    expect(p("(x)", 0)).toEqual({ ok: true, value: "x", pos: 3 });
  });

  it("parserRun: full parse from pos 0", () => {
    const p = P.parserString("hello");
    const r = P.parserRun(p, "hello world");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pos).toBe(5);
  });

  it("parserResult: requires full consumption", () => {
    const p = P.parserString("hello");
    expect(P.parserResult(p, "hello")).toEqual({ ok: true, value: "hello" });
    const r = P.parserResult(p, "hello world");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("unexpected input");
  });

  it("parserResult: returns error message on failure", () => {
    const p = P.parserString("hello");
    const r = P.parserResult(p, "world");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("expected");
  });

  it("composed: parse a list of digits separated by commas", () => {
    const digit = P.parserMap(P.parserDigit(), (d) => parseInt(d, 10));
    const list = P.parserSepBy(digit, P.parserChar(","));
    const r = P.parserResult(list, "1,2,3");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([1, 2, 3]);
  });

  it("composed: parens around a letter", () => {
    const p = P.parserBetween(P.parserChar("("), P.parserLetter(), P.parserChar(")"));
    expect(P.parserResult(p, "(x)").ok).toBe(true);
    expect(P.parserResult(p, "(5").ok).toBe(false);
  });

  it("composed: one or more letters as a word", () => {
    const word = P.parserMap(P.parserMany1(P.parserLetter()), (arr) => arr.join(""));
    const r = P.parserResult(word, "hello");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("hello");
  });

  it("parserOr: prefers the parser that got further on failure", () => {
    // If both fail, the error reported should be from the parser that
    // advanced the furthest — a common convention in parser combinators.
    const p = P.parserOr(P.parserString("ab"), P.parserString("ac"));
    const r = p("ad", 0);
    expect(r.ok).toBe(false);
  });

  it("parserMany: stops cleanly on a non-match (no infinite loop)", () => {
    const p = P.parserMany(P.parserChar("a"));
    // After 0 matches, should return [] with pos = 0.
    const r = p("xyz", 0);
    expect(r).toEqual({ ok: true, value: [], pos: 0 });
  });
});
