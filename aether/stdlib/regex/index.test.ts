import { describe, it, expect } from "vitest";
import * as R from "./index";

describe("regex module", () => {
  it("regex: compiles", () => {
    const re = R.regex("\\d+");
    expect(re).toBeInstanceOf(RegExp);
    expect(re.test("123")).toBe(true);
  });
  it("regex: with flags", () => {
    const re = R.regex("a", "i");
    expect(re.test("A")).toBe(true);
  });
  it("regex: bad pattern panics", () => {
    expect(() => R.regex("(")).toThrow();
  });

  it("match: simple", () => {
    expect(R.match("hello", "ell")).toEqual(["ell"]);
  });
  it("match: with capture groups", () => {
    expect(R.match("2024-06-15", "(\\d+)-(\\d+)-(\\d+)")).toEqual(["2024-06-15", "2024", "06", "15"]);
  });
  it("match: no match returns null", () => {
    expect(R.match("abc", "z")).toBeNull();
  });

  it("matchAll: returns all matches", () => {
    expect(R.matchAll("a1 b2 c3", "(\\w)(\\d)")).toEqual([
      ["a1", "a", "1"],
      ["b2", "b", "2"],
      ["c3", "c", "3"],
    ]);
  });
  it("matchAll: empty when no match", () => {
    expect(R.matchAll("abc", "z")).toEqual([]);
  });

  it("replace: first only", () => {
    expect(R.replace("a-a-a", "-", "+")).toBe("a+a-a");
  });
  it("replaceAll: all occurrences", () => {
    expect(R.replaceAll("a-a-a", "-", "+")).toBe("a+a+a");
  });
  it("replaceAll: with capture group ref", () => {
    expect(R.replaceAll("hello", "l", "L")).toBe("heLLo");
  });

  it("split: by pattern", () => {
    expect(R.split("a,b;c", /[,;]/)).toEqual(["a", "b", "c"]);
  });
  it("split: empty pattern yields chars", () => {
    expect(R.split("abc", "")).toEqual(["a", "b", "c"]);
  });

  it("test: true on match", () => {
    expect(R.test("abc123", "\\d+")).toBe(true);
  });
  it("test: false on no match", () => {
    expect(R.test("abc", "\\d+")).toBe(false);
  });

  it("extract: group 0 (whole match)", () => {
    expect(R.extract("Phone: 555-1234", "(\\d{3})-(\\d{4})", 0)).toBe("555-1234");
  });
  it("extract: capture group 1", () => {
    expect(R.extract("Phone: 555-1234", "(\\d{3})-(\\d{4})", 1)).toBe("555");
  });
  it("extract: out-of-range group panics", () => {
    expect(() => R.extract("x", "(x)", 5)).toThrow();
  });
  it("extract: no match returns null", () => {
    expect(R.extract("abc", "z", 0)).toBeNull();
  });

  it("groups: capture groups of first match", () => {
    expect(R.groups("2024-06-15", "(\\d+)-(\\d+)-(\\d+)")).toEqual(["2024", "06", "15"]);
  });
  it("groups: no match returns null", () => {
    expect(R.groups("abc", "z")).toBeNull();
  });

  it("firstMatch", () => {
    expect(R.firstMatch("hello world", "\\w+")).toBe("hello");
  });
  it("firstMatch: no match returns null", () => {
    expect(R.firstMatch("abc", "z")).toBeNull();
  });

  it("count: matches", () => {
    expect(R.count("foo bar foo baz foo", "foo")).toBe(3);
  });
  it("count: zero", () => {
    expect(R.count("abc", "z")).toBe(0);
  });

  it("startsWithMatch: true at start", () => {
    expect(R.startsWithMatch("hello world", "hello")).toBe(true);
  });
  it("startsWithMatch: false when not at start", () => {
    expect(R.startsWithMatch("hello world", "world")).toBe(false);
  });
  it("endsWithMatch: true at end", () => {
    expect(R.endsWithMatch("hello world", "world")).toBe(true);
  });
  it("endsWithMatch: false when not at end", () => {
    expect(R.endsWithMatch("hello world", "hello")).toBe(false);
  });

  it("escape: metacharacters", () => {
    expect(R.escape("a.b*c+d?e^f$g|h{i}j(k)l[m]n\\o")).toBe(
      "a\\.b\\*c\\+d\\?e\\^f\\$g\\|h\\{i\\}j\\(k\\)l\\[m\\]n\\\\o"
    );
  });
  it("escape: no metacharacters unchanged", () => {
    expect(R.escape("abc123")).toBe("abc123");
  });

  it("flags: returns flags of RegExp", () => {
    expect(R.flags(R.regex("a", "gi"))).toBe("gi");
  });
  it("flags: empty for string pattern", () => {
    expect(R.flags("a")).toBe("");
  });

  it("supports precompiled regex passed as string", () => {
    expect(R.test("abc", "b")).toBe(true);
  });
});
