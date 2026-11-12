import { describe, it, expect } from "vitest";
import * as OP from "./index";

describe("optparse module", () => {
  // optNew --------------------------------------------------------------
  it("optNew: returns a fresh spec", () => {
    const s = OP.optNew();
    expect(s).toBeDefined();
    expect(s.options).toEqual({});
    expect(s.allowUnknown).toBe(false);
  });

  // optFlag -------------------------------------------------------------
  it("optFlag: registers a flag with default false", () => {
    const s = OP.optFlag(OP.optNew(), "verbose");
    expect(s.options["verbose"].kind).toBe("flag");
    expect(s.options["verbose"].default).toBe(false);
  });
  it("optFlag: accepts a short alias", () => {
    const s = OP.optFlag(OP.optNew(), "verbose", "v");
    expect(s.options["verbose"].short).toBe("v");
  });
  it("optFlag: accepts a custom default", () => {
    const s = OP.optFlag(OP.optNew(), "debug", undefined, true);
    expect(s.options["debug"].default).toBe(true);
  });
  it("optFlag: panic on duplicate name", () => {
    const s = OP.optFlag(OP.optNew(), "x");
    expect(() => OP.optFlag(s, "x")).toThrow();
  });

  // optString / optInt / optFloat --------------------------------------
  it("optString: registers a string option", () => {
    const s = OP.optString(OP.optNew(), "name", undefined, "anon");
    expect(s.options["name"].kind).toBe("string");
    expect(s.options["name"].default).toBe("anon");
  });
  it("optInt: registers an int option", () => {
    const s = OP.optInt(OP.optNew(), "count", "n", 10);
    expect(s.options["count"].kind).toBe("int");
    expect(s.options["count"].short).toBe("n");
  });
  it("optFloat: registers a float option", () => {
    const s = OP.optFloat(OP.optNew(), "ratio");
    expect(s.options["ratio"].kind).toBe("float");
  });
  it("optInt: panic on invalid short (not single char)", () => {
    expect(() => OP.optInt(OP.optNew(), "count", "xyz")).toThrow();
  });

  // optParse: flags -----------------------------------------------------
  it("optParse: flag present -> true", () => {
    const s = OP.optFlag(OP.optNew(), "verbose");
    const r = OP.optParse(s, ["--verbose"]);
    expect(r.values["verbose"]).toBe(true);
    expect(OP.optHas(r, "verbose")).toBe(true);
  });
  it("optParse: flag absent -> default", () => {
    const s = OP.optFlag(OP.optNew(), "verbose");
    const r = OP.optParse(s, []);
    expect(r.values["verbose"]).toBe(false);
    expect(OP.optHas(r, "verbose")).toBe(false);
  });
  it("optParse: --no-NAME negates a flag", () => {
    const s = OP.optFlag(OP.optNew(), "verbose", undefined, true);
    const r = OP.optParse(s, ["--no-verbose"]);
    expect(r.values["verbose"]).toBe(false);
    expect(OP.optHas(r, "verbose")).toBe(true);
  });
  it("optParse: short flag works", () => {
    const s = OP.optFlag(OP.optNew(), "verbose", "v");
    const r = OP.optParse(s, ["-v"]);
    expect(r.values["verbose"]).toBe(true);
  });

  // optParse: value options --------------------------------------------
  it("optParse: --opt value form", () => {
    const s = OP.optString(OP.optNew(), "name");
    const r = OP.optParse(s, ["--name", "Alice"]);
    expect(r.values["name"]).toBe("Alice");
  });
  it("optParse: --opt=value form", () => {
    const s = OP.optString(OP.optNew(), "name");
    const r = OP.optParse(s, ["--name=Alice"]);
    expect(r.values["name"]).toBe("Alice");
  });
  it("optParse: short option with attached value", () => {
    const s = OP.optInt(OP.optNew(), "count", "n");
    const r = OP.optParse(s, ["-n42"]);
    expect(r.values["count"]).toBe(42);
  });
  it("optParse: short option with next-arg value", () => {
    const s = OP.optInt(OP.optNew(), "count", "n");
    const r = OP.optParse(s, ["-n", "7"]);
    expect(r.values["count"]).toBe(7);
  });
  it("optParse: float parsing", () => {
    const s = OP.optFloat(OP.optNew(), "ratio");
    const r = OP.optParse(s, ["--ratio", "3.14"]);
    expect(r.values["ratio"]).toBeCloseTo(3.14);
  });
  it("optParse: int rejects non-numeric", () => {
    const s = OP.optInt(OP.optNew(), "count");
    expect(() => OP.optParse(s, ["--count", "abc"])).toThrow();
  });
  it("optParse: missing value throws", () => {
    const s = OP.optString(OP.optNew(), "name");
    expect(() => OP.optParse(s, ["--name"])).toThrow();
  });
  it("optParse: unknown option throws (strict)", () => {
    const s = OP.optNew();
    expect(() => OP.optParse(s, ["--bogus"])).toThrow();
  });

  // optParse: positionals ----------------------------------------------
  it("optParse: positionals collected", () => {
    const s = OP.optNew();
    const r = OP.optParse(s, ["foo", "bar", "baz"]);
    expect(OP.optPositional(r)).toEqual(["foo", "bar", "baz"]);
  });
  it("optParse: -- terminates options", () => {
    const s = OP.optNew();
    const r = OP.optParse(s, ["foo", "--", "--bar", "-x"]);
    expect(OP.optPositional(r)).toEqual(["foo", "--bar", "-x"]);
  });
  it("optParse: mixed flags and positionals", () => {
    const s = OP.optFlag(OP.optNew(), "verbose", "v");
    const r = OP.optParse(s, ["file.txt", "-v", "out.txt"]);
    expect(r.values["verbose"]).toBe(true);
    expect(OP.optPositional(r)).toEqual(["file.txt", "out.txt"]);
  });

  // optHelp / optGet ----------------------------------------------------
  it("optHelp: returns a multi-line usage string", () => {
    const s = OP.optFlag(OP.optNew(), "verbose", "v", false, "verbose mode");
    const h = OP.optHelp(s);
    expect(h).toContain("Usage:");
    expect(h).toContain("--verbose");
    expect(h).toContain("-v");
    expect(h).toContain("verbose mode");
  });
  it("optGet: returns value", () => {
    const s = OP.optInt(OP.optNew(), "n", undefined, 5);
    const r = OP.optParse(s, ["--n", "42"]);
    expect(OP.optGet(r, "n")).toBe(42);
  });
  it("optGet: returns default when not supplied", () => {
    const s = OP.optInt(OP.optNew(), "n", undefined, 5);
    const r = OP.optParse(s, []);
    expect(OP.optGet(r, "n")).toBe(5);
  });
  it("optGet: panic on unknown name", () => {
    const r = OP.optParse(OP.optNew(), []);
    expect(() => OP.optGet(r, "nope")).toThrow();
  });
});
