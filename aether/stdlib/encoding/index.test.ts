import { describe, it, expect } from "vitest";
import * as E from "./index";

describe("encoding: json", () => {
  it("jsonStringify + jsonParse round-trip", () => {
    const s = E.jsonStringify({ a: 1, b: "x" });
    expect(s).toBe('{"a":1,"b":"x"}');
    expect(E.jsonParse(s)).toEqual({ a: 1, b: "x" });
  });
  it("jsonPretty: indented", () => {
    const s = E.jsonPretty({ a: 1 });
    expect(s).toContain('  "a": 1');
  });
  it("jsonParse: bad input panics", () => {
    expect(() => E.jsonParse("{not json")).toThrow();
  });
});

describe("encoding: base64", () => {
  it("base64Encode/Decode round-trip ASCII", () => {
    const e = E.base64Encode("Hello, Aether!");
    expect(E.base64Decode(e)).toBe("Hello, Aether!");
  });
  it("base64: handles UTF-8", () => {
    const e = E.base64Encode("héllo😀");
    expect(E.base64Decode(e)).toBe("héllo😀");
  });
  it("base64: known vector", () => {
    expect(E.base64Encode("foo")).toBe("Zm9v");
    expect(E.base64Decode("Zm9v")).toBe("foo");
  });
  it("base64: empty string", () => {
    expect(E.base64Encode("")).toBe("");
    expect(E.base64Decode("")).toBe("");
  });
});

describe("encoding: hex", () => {
  it("hexEncode/Decode round-trip", () => {
    expect(E.hexEncode("Aether")).toBe("416574686572");
    expect(E.hexDecode("416574686572")).toBe("Aether");
  });
  it("hex: UTF-8 multibyte", () => {
    const e = E.hexEncode("é");
    expect(E.hexDecode(e)).toBe("é");
  });
  it("hex: odd length panics", () => {
    expect(() => E.hexDecode("abc")).toThrow();
  });
  it("hex: bad digit panics", () => {
    expect(() => E.hexDecode("zz")).toThrow();
  });
});

describe("encoding: utf8 / bytes", () => {
  it("utf8Encode: ASCII", () => {
    expect(E.utf8Encode("AB")).toEqual([0x41, 0x42]);
  });
  it("utf8Encode: multibyte", () => {
    expect(E.utf8Encode("é")).toEqual([0xc3, 0xa9]);
  });
  it("utf8Decode round-trip", () => {
    const bytes = E.utf8Encode("hello😀");
    expect(E.utf8Decode(bytes)).toBe("hello😀");
  });
  it("bytesToString is alias", () => {
    expect(E.bytesToString([0x41, 0x42])).toBe("AB");
  });
});

describe("encoding: url", () => {
  it("urlEncode/Decode round-trip", () => {
    const e = E.urlEncode("hello world&foo=bar");
    expect(E.urlDecode(e)).toBe("hello world&foo=bar");
  });
  it("urlEncode: special chars", () => {
    expect(E.urlEncode("a/b?c=d")).toBe("a%2Fb%3Fc%3Dd");
  });
  it("urlDecode: bad input panics", () => {
    expect(() => E.urlDecode("%ZZ")).toThrow();
  });
});

describe("encoding: csv", () => {
  it("csvParse: simple", () => {
    expect(E.csvParse("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });
  it("csvParse: quoted with comma", () => {
    expect(E.csvParse('"a,b",c')).toEqual([["a,b", "c"]]);
  });
  it("csvParse: embedded newline in quotes", () => {
    expect(E.csvParse('"line1\nline2",b')).toEqual([["line1\nline2", "b"]]);
  });
  it("csvParse: escaped quote", () => {
    expect(E.csvParse('"She said ""hi""",b')).toEqual([['She said "hi"', "b"]]);
  });
  it("csvStringify: simple round-trip", () => {
    const rows = [
      ["a", "b", "c"],
      ["1", "2", "3"],
    ];
    expect(E.csvStringify(rows)).toBe("a,b,c\n1,2,3");
  });
  it("csvStringify: quotes fields with comma", () => {
    expect(E.csvStringify([["a,b", "c"]])).toBe('"a,b",c');
  });
  it("csvStringify: quotes fields with quote", () => {
    expect(E.csvStringify([['He said "hi"', "x"]])).toBe('"He said ""hi""",x');
  });
  it("csvStringify + csvParse round-trip", () => {
    const rows = [["a,b", 'c"d', "e\nf"], ["1", "2", "3"]];
    const s = E.csvStringify(rows);
    expect(E.csvParse(s)).toEqual(rows);
  });
});

describe("encoding: yaml/toml/msgpack", () => {
  it("yamlStringify: scalar", () => {
    expect(E.yamlStringify("hello")).toBe("hello");
  });
  it("yamlStringify: array", () => {
    const y = E.yamlStringify(["a", "b"]);
    expect(y).toContain("- a");
    expect(y).toContain("- b");
  });
  it("yamlStringify: object", () => {
    const y = E.yamlStringify({ a: 1, b: "two" });
    expect(y).toContain("a: 1");
    expect(y).toContain("b: two");
  });
  it("tomlStringify: flat", () => {
    const t = E.tomlStringify({ name: "Aether", version: 1 });
    expect(t).toContain('name = "Aether"');
    expect(t).toContain("version = 1");
  });
  it("tomlStringify: nested table", () => {
    const t = E.tomlStringify({ server: { port: 8080, host: "127.0.0.1" } });
    expect(t).toContain("[server]");
    expect(t).toContain("port = 8080");
    expect(t).toContain('host = "127.0.0.1"');
  });
  it("msgpackPack: small int inline", () => {
    expect(E.msgpackPack(5)).toEqual([5]);
  });
  it("msgpackPack: negative int", () => {
    expect(E.msgpackPack(-1)).toEqual([0xff]);
  });
  it("msgpackPack: string", () => {
    // 'fixstr' for length < 32
    const bytes = E.msgpackPack("ab");
    expect(bytes[0]).toBe(0xa0 | 2);
    expect(bytes.slice(1)).toEqual([0x61, 0x62]);
  });
  it("msgpackPack: array", () => {
    const bytes = E.msgpackPack([1, 2]);
    expect(bytes[0]).toBe(0x90 | 2);
    expect(bytes.slice(1)).toEqual([1, 2]);
  });
  it("msgpackPack: null", () => {
    expect(E.msgpackPack(null)).toEqual([0xc0]);
  });
});

describe("encoding: query", () => {
  it("queryParse: simple", () => {
    expect(E.queryParse("a=1&b=2")).toEqual({ a: "1", b: "2" });
  });
  it("queryParse: leading ?", () => {
    expect(E.queryParse("?a=1")).toEqual({ a: "1" });
  });
  it("queryParse: empty", () => {
    expect(E.queryParse("")).toEqual({});
  });
  it("queryParse: encoded chars", () => {
    expect(E.queryParse("name=John%20Doe")).toEqual({ name: "John Doe" });
  });
  it("queryStringify", () => {
    const s = E.queryStringify({ a: "1", b: "two" });
    expect(s).toContain("a=1");
    expect(s).toContain("b=two");
  });
  it("urlencode: object", () => {
    expect(E.urlencode({ a: "1", b: "2" })).toBe("a=1&b=2");
  });
  it("urlencode: string falls back to encodeURIComponent", () => {
    expect(E.urlencode("a b")).toBe("a%20b");
  });
  it("queryStringify + queryParse round-trip", () => {
    const obj = { a: "1", b: "two and three", c: "4" };
    expect(E.queryParse(E.queryStringify(obj))).toEqual(obj);
  });
});
