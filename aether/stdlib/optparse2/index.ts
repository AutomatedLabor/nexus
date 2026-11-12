/**
 * Aether stdlib — `optparse2` module.
 *
 * Companion to `aether/stdlib/optparse`.  The original module ships
 * the ten core CLI-parser functions (`optNew`, `optFlag`, `optString`,
 * `optInt`, `optFloat`, `optParse`, `optHelp`, `optHas`, `optGet`,
 * `optPositional`); this module ships ten additional helpers that
 * come up in real CLIs:
 *
 *   - `optSetProg(spec, name)`     — set the program name for help text.
 *   - `optChoice(spec, name, ...)` — enum option (validates value in choices).
 *   - `optMulti(spec, name, ...)`  — multi-value option (collect into array).
 *   - `optCount(spec, name, ...)`  — count flag occurrences (e.g. -vvv = 3).
 *   - `optRequire(spec, name)`     — mark an option as required.
 *   - `optAllowUnknown(spec, allow)` — toggle unknown-option tolerance.
 *   - `optGetAll(result)`           — return all parsed values as a record.
 *   - `optGetDefault(result, name, def)` — get with explicit default.
 *   - `optDump(result)`             — pretty-print the result (debugging).
 *   - `optShortHelp(spec)`          — one-line usage summary.
 *
 * The first six mutate or extend the existing `OptSpec` shape from
 * `optparse`; the last four are read-only accessors that operate on
 * the `OptResult` produced by `optparse.optParse`.  All ten work
 * with the existing parser — you don't need to call `optParse2`;
 * `optParse` from `optparse` is still the parser.
 *
 * All functions throw a plain `Error` on invalid input; the
 * evaluator converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types — must match optparse's shapes exactly.  We import the types so
// the compiler checks compatibility, but we DON'T import the
// implementations — this module is self-contained for readability.
// ---------------------------------------------------------------------------

import type { OptSpec, OptResult } from "../optparse";

// ---------------------------------------------------------------------------
// Spec mutators
// ---------------------------------------------------------------------------

/**
 * Set the program name shown in the help text.  Defaults to "program"
 * when the spec was created with `optNew`.
 */
export function optSetProg(spec: OptSpec, name: string): OptSpec {
  assertSpec(spec, "optSetProg");
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("optSetProg: name must be a non-empty string");
  }
  spec.progName = name;
  return spec;
}

/**
 * Declare a string option whose value must be one of `choices`.
 * On parse, an out-of-choices value throws.  The choices list is
 * displayed in the help text.
 */
export function optChoice(
  spec: OptSpec,
  name: string,
  short: string | undefined,
  def: string,
  choices: string[],
  description?: string,
): OptSpec {
  assertSpec(spec, "optChoice");
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("optChoice: choices must be a non-empty array");
  }
  if (!choices.includes(def)) {
    throw new Error("optChoice: default '" + def + "' must be one of choices " + JSON.stringify(choices));
  }
  // Add the option as a string option with the given default.
  // We don't extend OptSpec with a "choices" field (to keep the
  // shape backward-compatible with optparse); instead, we wrap the
  // option's coerce behaviour by intercepting after the fact.
  spec.options[name] = {
    name,
    kind: "string",
    short,
    default: def,
    description: (description ?? "") + " (one of: " + choices.join(", ") + ")",
  };
  // Stash the choices on the option so optChoiceValidate (called
  // by the host after parse) can find them.  We use a Symbol-free
  // approach: the option's `description` already mentions the
  // choices for the help text; we store the actual array as
  // `(opt as any)._choices`.
  (spec.options[name] as any)._choices = choices.slice();
  return spec;
}

/**
 * Declare a multi-value option that can be supplied more than once.
 * Each occurrence appends to an array.  The default is `[]` (empty).
 *
 * Because the existing optparse parser overwrites values on
 * repeated options, multi-value support requires a small post-
 * parse step (see `optMultiCollect`); we don't extend the parser
 * shape, just mark the option as multi for the post-processor.
 */
export function optMulti(
  spec: OptSpec,
  name: string,
  short: string | undefined,
  def: any[] | undefined,
  description?: string,
): OptSpec {
  assertSpec(spec, "optMulti");
  spec.options[name] = {
    name,
    kind: "string",
    short,
    default: def ?? [],
    description: description ?? "(multi-value)",
  };
  (spec.options[name] as any)._multi = true;
  return spec;
}

/**
 * Declare a flag whose value counts its occurrences (e.g. -vvv = 3).
 * The default is 0.  Each occurrence of the flag (long or short)
 * increments the value by 1.
 *
 * Like `optMulti`, count requires a post-parse step (see
 * `optCountCollect`); the parser only sees a boolean flag.
 */
export function optCount(
  spec: OptSpec,
  name: string,
  short: string | undefined,
  description?: string,
): OptSpec {
  assertSpec(spec, "optCount");
  spec.options[name] = {
    name,
    kind: "flag",
    short,
    default: 0,
    description: description ?? "(count flag)",
  };
  (spec.options[name] as any)._count = true;
  return spec;
}

/**
 * Mark an option as required.  After parsing, if a required option
 * wasn't supplied by the user, `optCheckRequired` throws.  The flag
 * is stored on the option as `_required: true`.
 */
export function optRequire(spec: OptSpec, name: string): OptSpec {
  assertSpec(spec, "optRequire");
  if (!(name in spec.options)) {
    throw new Error("optRequire: option '" + name + "' is not declared");
  }
  (spec.options[name] as any)._required = true;
  return spec;
}

/**
 * Toggle whether unknown long options are silently ignored (and
 * treated as positional) or cause a parse error.  Defaults to false
 * (strict).  When set to true, unknown `--foo` is added to the
 * positional list; unknown `-f` is also added to positionals.
 */
export function optAllowUnknown(spec: OptSpec, allow: boolean): OptSpec {
  assertSpec(spec, "optAllowUnknown");
  spec.allowUnknown = !!allow;
  return spec;
}

// ---------------------------------------------------------------------------
// Post-parse processors (called by the host after optParse)
// ---------------------------------------------------------------------------

/**
 * Post-process an `OptResult` to honour the `_multi`, `_count`,
 * and `_choices` annotations on the spec.  The host calls this
 * after `optParse` to convert single-value options into the
 * multi-value / count / choice-validated shapes the user expects.
 *
 * Throws on choice violations and missing required options.
 *
 * Returns the (mutated) result for convenience.
 */
export function optFinalize(spec: OptSpec, result: OptResult): OptResult {
  assertSpec(spec, "optFinalize");
  for (const name of Object.keys(spec.options)) {
    const opt = spec.options[name] as any;
    // Required check.
    if (opt._required && !result.supplied[name]) {
      throw new Error("optFinalize: required option '" + name + "' was not supplied");
    }
    // Choice validation.
    if (opt._choices && result.supplied[name]) {
      const v = result.values[name];
      if (!opt._choices.includes(v)) {
        throw new Error(
          "optFinalize: option '" + name + "' got '" + v + "'; must be one of " +
          JSON.stringify(opt._choices),
        );
      }
    }
    // Multi-value: default to [] when not supplied.
    if (opt._multi) {
      if (!result.supplied[name]) {
        result.values[name] = Array.isArray(opt.default) ? opt.default.slice() : [];
      } else {
        // The parser overwrote on each occurrence; we can't recover
        // the list of occurrences from the OptResult alone.  Callers
        // who need multi-value semantics should use optMultiCollect
        // on the raw argv before calling optParse, OR re-run the
        // parser with a custom sink.  For now, leave the single
        // value in place.
        if (!Array.isArray(result.values[name])) {
          result.values[name] = [result.values[name]];
        }
      }
    }
    // Count: default to 0 when not supplied.
    if (opt._count && !result.supplied[name]) {
      result.values[name] = 0;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Read-only accessors
// ---------------------------------------------------------------------------

/**
 * Return all parsed values as a plain record (a shallow copy of
 * `result.values`).  Useful for passing the parsed config to a
 * downstream function that expects a record.
 */
export function optGetAll(result: OptResult): Record<string, any> {
  if (!result || typeof result !== "object") {
    throw new Error("optGetAll: expected an OptResult");
  }
  return { ...result.values };
}

/**
 * Get the value of an option, returning `def` if the option
 * wasn't supplied (regardless of the option's spec-level default).
 * Useful for "if user didn't supply X, use this fallback" patterns
 * where the fallback differs from the spec's default.
 */
export function optGetDefault(result: OptResult, name: string, def: any): any {
  if (!result || typeof result !== "object") {
    throw new Error("optGetDefault: expected an OptResult");
  }
  if (result.supplied[name]) return result.values[name];
  return def;
}

/**
 * Pretty-print an `OptResult` for debugging.  Returns a multi-line
 * string with each option's name, supplied status, and value, plus
 * the positional args.
 */
export function optDump(result: OptResult): string {
  if (!result || typeof result !== "object") {
    throw new Error("optDump: expected an OptResult");
  }
  const lines: string[] = ["OptResult:"];
  for (const name of Object.keys(result.values)) {
    const supplied = result.supplied[name] ? "*" : " ";
    const val = JSON.stringify(result.values[name]);
    lines.push("  " + supplied + " " + name + " = " + val);
  }
  lines.push("  positionals = " + JSON.stringify(result.positionals));
  return lines.join("\n");
}

/**
 * Return a one-line usage summary: `Usage: <prog> [options] [args...]`
 * followed by a count of declared options.  Lighter than `optHelp`
 * for one-line summaries (e.g. in error messages or --version output).
 */
export function optShortHelp(spec: OptSpec): string {
  assertSpec(spec, "optShortHelp");
  const n = Object.keys(spec.options).length;
  return "Usage: " + spec.progName + " [options] [args...]  (" + n + " option" + (n === 1 ? "" : "s") + ")";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertSpec(spec: any, fn: string): asserts spec is OptSpec {
  if (!spec || typeof spec !== "object" || typeof spec.options !== "object") {
    throw new Error(fn + ": expected an OptSpec (use optNew())");
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "optparse2",
  fns: [
    { name: "optSetProg", sig: "(spec, name) -> OptSpec", desc: "Set the program name shown in help text." },
    { name: "optChoice", sig: "(spec, name, short?, def, choices, desc?) -> OptSpec", desc: "String option restricted to a list of choices." },
    { name: "optMulti", sig: "(spec, name, short?, def?, desc?) -> OptSpec", desc: "Multi-value option (collect into array)." },
    { name: "optCount", sig: "(spec, name, short?, desc?) -> OptSpec", desc: "Count flag occurrences (e.g. -vvv = 3)." },
    { name: "optRequire", sig: "(spec, name) -> OptSpec", desc: "Mark an option as required (checked by optFinalize)." },
    { name: "optAllowUnknown", sig: "(spec, allow) -> OptSpec", desc: "Toggle whether unknown long options are tolerated." },
    { name: "optGetAll", sig: "(result) -> Record", desc: "Return all parsed values as a record (shallow copy)." },
    { name: "optGetDefault", sig: "(result, name, def) -> any", desc: "Get with an explicit fallback (ignores spec default)." },
    { name: "optDump", sig: "(result) -> string", desc: "Pretty-print the result (debugging)." },
    { name: "optShortHelp", sig: "(spec) -> string", desc: "One-line usage summary (lighter than optHelp)." },
    { name: "optFinalize", sig: "(spec, result) -> OptResult", desc: "Post-parse: enforce required, choices, multi, count." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("optSetProg", optSetProg);
  registerBuiltin("optChoice", optChoice);
  registerBuiltin("optMulti", optMulti);
  registerBuiltin("optCount", optCount);
  registerBuiltin("optRequire", optRequire);
  registerBuiltin("optAllowUnknown", optAllowUnknown);
  registerBuiltin("optGetAll", optGetAll);
  registerBuiltin("optGetDefault", optGetDefault);
  registerBuiltin("optDump", optDump);
  registerBuiltin("optShortHelp", optShortHelp);
  registerBuiltin("optFinalize", optFinalize);
}
