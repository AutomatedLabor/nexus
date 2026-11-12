import { describe, it, expect } from "vitest";
import * as O2 from "./index";
import * as O from "../optparse";

describe("optparse2 module", () => {
  // optSetProg ----------------------------------------------------------
  it("optSetProg: sets the program name", () => {
    const s = O.optNew();
    O2.optSetProg(s, "mycli");
    expect(s.progName).toBe("mycli");
  });
  it("optSetProg: throws on empty name", () => {
    const s = O.optNew();
    expect(() => O2.optSetProg(s, "")).toThrow(/non-empty string/);
  });
  it("optSetProg: throws on non-spec input", () => {
    expect(() => O2.optSetProg(null as any, "x")).toThrow(/expected an OptSpec/);
  });
  it("optSetProg: appears in optShortHelp", () => {
    const s = O.optNew();
    O2.optSetProg(s, "frob");
    expect(O2.optShortHelp(s)).toContain("frob");
  });

  // optChoice ----------------------------------------------------------
  it("optChoice: declares a choice option with valid default", () => {
    const s = O.optNew();
    O2.optChoice(s, "color", undefined, "red", ["red", "green", "blue"]);
    expect(s.options["color"].default).toBe("red");
    expect(s.options["color"].description).toContain("red, green, blue");
  });
  it("optChoice: throws when default is not in choices", () => {
    const s = O.optNew();
    expect(() => O2.optChoice(s, "color", undefined, "yellow", ["red", "green", "blue"]))
      .toThrow(/must be one of choices/);
  });
  it("optChoice: throws on empty choices array", () => {
    const s = O.optNew();
    expect(() => O2.optChoice(s, "color", undefined, "x", [])).toThrow(/non-empty array/);
  });
  it("optChoice + optFinalize: accepts a value in choices", () => {
    const s = O.optNew();
    O2.optChoice(s, "color", undefined, "red", ["red", "green", "blue"]);
    const r = O.optParse(s, ["--color", "green"]);
    O2.optFinalize(s, r);
    expect(r.values.color).toBe("green");
  });
  it("optChoice + optFinalize: rejects a value outside choices", () => {
    const s = O.optNew();
    O2.optChoice(s, "color", undefined, "red", ["red", "green", "blue"]);
    const r = O.optParse(s, ["--color", "yellow"]);
    expect(() => O2.optFinalize(s, r)).toThrow(/must be one of/);
  });

  // optMulti -----------------------------------------------------------
  it("optMulti: declares a multi-value option", () => {
    const s = O.optNew();
    O2.optMulti(s, "file", "f", []);
    expect(s.options["file"].default).toEqual([]);
    expect((s.options["file"] as any)._multi).toBe(true);
  });
  it("optMulti + optFinalize: defaults to [] when not supplied", () => {
    const s = O.optNew();
    O2.optMulti(s, "file", "f", []);
    const r = O.optParse(s, []);
    O2.optFinalize(s, r);
    expect(r.values.file).toEqual([]);
  });
  it("optMulti + optFinalize: wraps single value into array when supplied once", () => {
    const s = O.optNew();
    O2.optMulti(s, "file", "f", []);
    const r = O.optParse(s, ["--file", "a.txt"]);
    O2.optFinalize(s, r);
    expect(r.values.file).toEqual(["a.txt"]);
  });

  // optCount -----------------------------------------------------------
  it("optCount: declares a count flag", () => {
    const s = O.optNew();
    O2.optCount(s, "verbose", "v");
    expect(s.options["verbose"].default).toBe(0);
    expect((s.options["verbose"] as any)._count).toBe(true);
  });
  it("optCount + optFinalize: defaults to 0 when not supplied", () => {
    const s = O.optNew();
    O2.optCount(s, "verbose", "v");
    const r = O.optParse(s, []);
    O2.optFinalize(s, r);
    expect(r.values.verbose).toBe(0);
  });

  // optRequire ---------------------------------------------------------
  it("optRequire: marks an existing option as required", () => {
    const s = O.optNew();
    O.optString(s, "name", undefined, "");
    O2.optRequire(s, "name");
    expect((s.options["name"] as any)._required).toBe(true);
  });
  it("optRequire: throws on unknown option", () => {
    const s = O.optNew();
    expect(() => O2.optRequire(s, "nope")).toThrow(/not declared/);
  });
  it("optRequire + optFinalize: passes when supplied", () => {
    const s = O.optNew();
    O.optString(s, "name", undefined, "");
    O2.optRequire(s, "name");
    const r = O.optParse(s, ["--name", "Alice"]);
    expect(() => O2.optFinalize(s, r)).not.toThrow();
  });
  it("optRequire + optFinalize: throws when not supplied", () => {
    const s = O.optNew();
    O.optString(s, "name", undefined, "");
    O2.optRequire(s, "name");
    const r = O.optParse(s, []);
    expect(() => O2.optFinalize(s, r)).toThrow(/required option 'name' was not supplied/);
  });

  // optAllowUnknown ----------------------------------------------------
  it("optAllowUnknown: sets the spec's allowUnknown flag", () => {
    const s = O.optNew();
    O2.optAllowUnknown(s, true);
    expect(s.allowUnknown).toBe(true);
    O2.optAllowUnknown(s, false);
    expect(s.allowUnknown).toBe(false);
  });
  it("optAllowUnknown: when true, unknown options become positionals", () => {
    const s = O.optNew();
    O2.optAllowUnknown(s, true);
    const r = O.optParse(s, ["--unknown", "value", "pos1"]);
    expect(r.positionals).toContain("--unknown");
    expect(r.positionals).toContain("value");
    expect(r.positionals).toContain("pos1");
  });

  // optGetAll ----------------------------------------------------------
  it("optGetAll: returns a shallow copy of values", () => {
    const s = O.optNew();
    O.optString(s, "name", undefined, "default");
    O.optInt(s, "count", "c", 0);
    const r = O.optParse(s, ["--name", "Alice", "-c", "5"]);
    const all = O2.optGetAll(r);
    expect(all).toEqual({ name: "Alice", count: 5 });
  });
  it("optGetAll: returns a copy (modifying it doesn't affect the result)", () => {
    const s = O.optNew();
    O.optString(s, "name", undefined, "default");
    const r = O.optParse(s, ["--name", "Alice"]);
    const all = O2.optGetAll(r);
    all.name = "Bob";
    expect(r.values.name).toBe("Alice");
  });
  it("optGetAll: throws on non-OptResult", () => {
    expect(() => O2.optGetAll(null as any)).toThrow(/expected an OptResult/);
  });

  // optGetDefault ------------------------------------------------------
  it("optGetDefault: returns the supplied value when supplied", () => {
    const s = O.optNew();
    O.optString(s, "name", undefined, "default");
    const r = O.optParse(s, ["--name", "Alice"]);
    expect(O2.optGetDefault(r, "name", "fallback")).toBe("Alice");
  });
  it("optGetDefault: returns the explicit fallback when not supplied", () => {
    const s = O.optNew();
    O.optString(s, "name", undefined, "default");
    const r = O.optParse(s, []);
    // The spec default would be "default", but optGetDefault returns the fallback.
    expect(O2.optGetDefault(r, "name", "fallback")).toBe("fallback");
  });
  it("optGetDefault: throws on non-OptResult", () => {
    expect(() => O2.optGetDefault(null as any, "x", "y")).toThrow(/expected an OptResult/);
  });

  // optDump ------------------------------------------------------------
  it("optDump: produces a multi-line string with all options", () => {
    const s = O.optNew();
    O.optString(s, "name", undefined, "default");
    O.optInt(s, "count", "c", 0);
    const r = O.optParse(s, ["--name", "Alice", "-c", "5", "pos1"]);
    const dump = O2.optDump(r);
    expect(dump).toContain("OptResult:");
    expect(dump).toContain("name");
    expect(dump).toContain("Alice");
    expect(dump).toContain("count");
    expect(dump).toContain("5");
    expect(dump).toContain("positionals");
    expect(dump).toContain("pos1");
  });
  it("optDump: marks supplied options with *", () => {
    const s = O.optNew();
    O.optString(s, "name", undefined, "default");
    const r = O.optParse(s, ["--name", "Alice"]);
    expect(O2.optDump(r)).toContain("* name");
  });

  // optShortHelp -------------------------------------------------------
  it("optShortHelp: returns a one-line usage summary", () => {
    const s = O.optNew();
    O2.optSetProg(s, "mytool");
    O.optString(s, "input", undefined, "");
    O.optInt(s, "verbose", "v", 0);
    const help = O2.optShortHelp(s);
    expect(help).toContain("Usage: mytool [options] [args...]");
    expect(help).toContain("2 options");
  });
  it("optShortHelp: pluralizes correctly for 1 option", () => {
    const s = O.optNew();
    O.optString(s, "x", undefined, "");
    const help = O2.optShortHelp(s);
    expect(help).toContain("1 option");
    expect(help).not.toContain("1 options");
  });

  // optFinalize --------------------------------------------------------
  it("optFinalize: passes a clean result through unchanged", () => {
    const s = O.optNew();
    O.optString(s, "name", undefined, "default");
    const r = O.optParse(s, ["--name", "Alice"]);
    const out = O2.optFinalize(s, r);
    expect(out.values.name).toBe("Alice");
  });
  it("optFinalize: throws on non-spec input", () => {
    const r: any = { values: {}, supplied: {}, positionals: [] };
    expect(() => O2.optFinalize(null as any, r)).toThrow(/expected an OptSpec/);
  });
});
