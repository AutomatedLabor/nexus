import { describe, it, expect } from "vitest";
import * as V from "./index";

describe("validate module", () => {
  it("isEmail: valid", () => {
    expect(V.isEmail("foo@bar.com")).toBe(true);
    expect(V.isEmail("foo.bar+baz@sub.example.org")).toBe(true);
  });
  it("isEmail: invalid", () => {
    expect(V.isEmail("foo")).toBe(false);
    expect(V.isEmail("foo@bar")).toBe(false);
    expect(V.isEmail("@bar.com")).toBe(false);
    expect(V.isEmail("foo@.com")).toBe(false);
  });

  it("isUrl: valid", () => {
    expect(V.isUrl("http://example.com")).toBe(true);
    expect(V.isUrl("https://example.com/path/to/page")).toBe(true);
    expect(V.isUrl("http://localhost:3000/api")).toBe(true);
  });
  it("isUrl: invalid", () => {
    expect(V.isUrl("ftp://example.com")).toBe(false);
    expect(V.isUrl("example.com")).toBe(false);
  });

  it("isIpv4: valid", () => {
    expect(V.isIpv4("192.168.0.1")).toBe(true);
    expect(V.isIpv4("0.0.0.0")).toBe(true);
    expect(V.isIpv4("255.255.255.255")).toBe(true);
  });
  it("isIpv4: invalid", () => {
    expect(V.isIpv4("256.1.1.1")).toBe(false);
    expect(V.isIpv4("1.2.3")).toBe(false);
    expect(V.isIpv4("01.02.03.04")).toBe(false); // leading zeros
    expect(V.isIpv4("1.2.3.4.5")).toBe(false);
  });

  it("isIpv6: valid", () => {
    expect(V.isIpv6("::1")).toBe(true);
    expect(V.isIpv6("2001:db8::1")).toBe(true);
    expect(V.isIpv6("fe80::1")).toBe(true);
    expect(V.isIpv6("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(true);
  });
  it("isIpv6: invalid", () => {
    expect(V.isIpv6("1.2.3.4")).toBe(false);
    expect(V.isIpv6("gggg::1")).toBe(false);
    expect(V.isIpv6("")).toBe(false);
  });

  it("isUuid: valid v4", () => {
    expect(V.isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });
  it("isUuid: invalid", () => {
    expect(V.isUuid("550e8400-e29b-41d4-a716")).toBe(false);
    expect(V.isUuid("not-a-uuid")).toBe(false);
    expect(V.isUuid("ZZZe8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("isDate: valid", () => {
    expect(V.isDate("2024-02-29")).toBe(true);  // leap year
    expect(V.isDate("2023-12-31")).toBe(true);
    expect(V.isDate("2000-01-01")).toBe(true);
  });
  it("isDate: invalid", () => {
    expect(V.isDate("2023-02-29")).toBe(false);  // not a leap year
    expect(V.isDate("2023-13-01")).toBe(false);
    expect(V.isDate("2023-04-31")).toBe(false);
    expect(V.isDate("not-a-date")).toBe(false);
  });

  it("isTime: valid HH:MM", () => {
    expect(V.isTime("13:45")).toBe(true);
    expect(V.isTime("00:00")).toBe(true);
    expect(V.isTime("23:59")).toBe(true);
  });
  it("isTime: valid HH:MM:SS", () => {
    expect(V.isTime("13:45:30")).toBe(true);
  });
  it("isTime: invalid", () => {
    expect(V.isTime("24:00")).toBe(false);
    expect(V.isTime("12:60")).toBe(false);
    expect(V.isTime("12:5")).toBe(false);
  });

  it("isAlpha / isNumeric / isAlnum", () => {
    expect(V.isAlpha("hello")).toBe(true);
    expect(V.isAlpha("hello123")).toBe(false);
    expect(V.isNumeric("12345")).toBe(true);
    expect(V.isNumeric("12.3")).toBe(false);
    expect(V.isAlnum("hello123")).toBe(true);
    expect(V.isAlnum("hello 123")).toBe(false);
    expect(V.isAlpha("")).toBe(false);
    expect(V.isNumeric("")).toBe(false);
  });

  it("isLower / isUpper", () => {
    expect(V.isLower("lowercase")).toBe(true);
    expect(V.isLower("Mixed")).toBe(false);
    expect(V.isUpper("UPPERCASE")).toBe(true);
    expect(V.isUpper("MIXEDcase")).toBe(false);
    expect(V.isLower("")).toBe(false);
  });

  it("isWhitespace", () => {
    expect(V.isWhitespace("   \t\n")).toBe(true);
    expect(V.isWhitespace(" a ")).toBe(false);
    expect(V.isWhitespace("")).toBe(false);
  });

  it("isAscii", () => {
    expect(V.isAscii("plain ASCII text!")).toBe(true);
    expect(V.isAscii("café")).toBe(false); // é > 127
    expect(V.isAscii("")).toBe(false);
  });

  it("isInRange", () => {
    expect(V.isInRange(5, 1, 10)).toBe(true);
    expect(V.isInRange(1, 1, 10)).toBe(true);
    expect(V.isInRange(10, 1, 10)).toBe(true);
    expect(V.isInRange(0, 1, 10)).toBe(false);
    expect(V.isInRange(11, 1, 10)).toBe(false);
  });

  it("isOneOf", () => {
    expect(V.isOneOf("b", ["a", "b", "c"])).toBe(true);
    expect(V.isOneOf("d", ["a", "b", "c"])).toBe(false);
    expect(V.isOneOf(3, [1, 2, 3])).toBe(true);
  });
  it("isOneOf: non-array panics", () => {
    expect(() => V.isOneOf(1, "abc" as any)).toThrow();
  });

  it("isNonEmpty", () => {
    expect(V.isNonEmpty("x")).toBe(true);
    expect(V.isNonEmpty("")).toBe(false);
    expect(V.isNonEmpty(" ")).toBe(true);  // not stripped
  });

  it("isLength", () => {
    expect(V.isLength("abc", 3)).toBe(true);
    expect(V.isLength("abc", 2)).toBe(false);
  });

  it("isMaxLength", () => {
    expect(V.isMaxLength("abc", 3)).toBe(true);
    expect(V.isMaxLength("abcd", 3)).toBe(false);
    expect(V.isMaxLength("", 0)).toBe(true);
  });

  it("matches: literal", () => {
    expect(V.matches("hello world", "world")).toBe(true);
    expect(V.matches("hello world", "xyz")).toBe(false);
  });
  it("matches: regex anchors", () => {
    expect(V.matches("12345", "^\\d{5}$")).toBe(true);
    expect(V.matches("1234", "^\\d{5}$")).toBe(false);
  });
  it("matches: invalid regex panics", () => {
    expect(() => V.matches("x", "(")).toThrow();
  });

  it("wrong-type arg panics", () => {
    expect(() => V.isEmail(123 as any)).toThrow();
    expect(() => V.isInRange("x" as any, 1, 2)).toThrow();
    expect(() => V.isAlpha(123 as any)).toThrow();
  });
});
