/**
 * Aether stdlib — `optparse` module.
 *
 * A tiny command-line option parser.  Provides just enough structure
 * to declare flags and typed options and parse a `string[]` argument
 * list into a record of values.  Designed for short CLIs that don't
 * want to pull in a full argparse-style library.
 *
 * The ten functions:
 *
 *   - `optNew()`                — create a fresh parser spec.
 *   - `optFlag(spec, name, ...)` — declare a boolean flag.
 *   - `optString(spec, name, ...)` — declare a string option (takes a value).
 *   - `optInt(spec, name, ...)` — declare an integer option.
 *   - `optFloat(spec, name, ...)` — declare a float option.
 *   - `optParse(spec, argv)` — parse an argv array, returning a result.
 *   - `optHelp(spec)` — return a help string summarising the spec.
 *   - `optHas(result, name)` — true if the option was supplied.
 *   - `optGet(result, name)` — fetch the option's value (or default).
 *   - `optPositional(result)` — return the array of positional args.
 *
 * Supported flag/option syntax:
 *
 *   --flag            boolean flag (true if present)
 *   --no-flag         boolean flag negation (false if present)
 *   --opt value       long option with value (next argv element)
 *   --opt=value       long option with value (same argv element)
 *   -f                short flag (single char)
 *   -fvalue           short flag with attached value
 *
 * Anything that isn't a flag/option is treated as a positional
 * argument.  The first standalone `--` terminates option parsing;
 * everything after it is positional, even if it starts with `-`.
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.  `optParse` throws on
 * unknown options (unless the spec was created with `allowUnknown`)
 * and on malformed values (e.g. non-integer where an int was expected).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OptSpec {
  // Each option: name -> spec
  options: Record<string, {
    name: string;
    kind: "flag" | "string" | "int" | "float";
    short?: string;       // single-char short alias
    default: any;         // default value when absent
    description?: string; // for help text
  }>;
  // Whether to allow unknown long options (they're silently ignored
  // and treated as positional).  Defaults to false (strict).
  allowUnknown: boolean;
  // Program name shown in the help text.  Defaults to "program".
  progName: string;
}

export interface OptResult {
  values: Record<string, any>;     // name -> parsed value
  positionals: string[];           // positional args (after option parsing)
  supplied: Record<string, boolean>; // name -> true if user supplied
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Create a fresh, empty option parser spec. */
export function optNew(): OptSpec {
  return {
    options: {},
    allowUnknown: false,
    progName: "program",
  };
}

// Internal helper: register a single option on the spec.
function addOpt(
  spec: OptSpec,
  name: string,
  kind: "flag" | "string" | "int" | "float",
  short: string | undefined,
  def: any,
  description: string | undefined,
): void {
  assertSpec(spec, "addOpt");
  if (typeof name !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
    throw new Error("addOpt: name must match /^[a-zA-Z][a-zA-Z0-9_-]*$/; got " + name);
  }
  if (short !== undefined && (typeof short !== "string" || short.length !== 1)) {
    throw new Error("addOpt: short must be a single char or undefined");
  }
  if (spec.options[name] !== undefined) {
    throw new Error("addOpt: option '" + name + "' already declared");
  }
  spec.options[name] = { name, kind, short, default: def, description };
}

/**
 * Declare a boolean flag.  `default` defaults to `false`.  When the
 * flag is present in argv, its value becomes `true`.  Use `--no-NAME`
 * to explicitly set it to `false`.
 */
export function optFlag(
  spec: OptSpec,
  name: string,
  short?: string,
  def: boolean = false,
  description?: string,
): OptSpec {
  addOpt(spec, name, "flag", short, def, description);
  return spec;
}

/** Declare a string option that takes a value. */
export function optString(
  spec: OptSpec,
  name: string,
  short?: string,
  def: string = "",
  description?: string,
): OptSpec {
  addOpt(spec, name, "string", short, def, description);
  return spec;
}

/** Declare an integer option.  Parses with `Number()` + `Math.trunc`. */
export function optInt(
  spec: OptSpec,
  name: string,
  short?: string,
  def: number = 0,
  description?: string,
): OptSpec {
  addOpt(spec, name, "int", short, def, description);
  return spec;
}

/** Declare a float option.  Parses with `Number()`. */
export function optFloat(
  spec: OptSpec,
  name: string,
  short?: string,
  def: number = 0,
  description?: string,
): OptSpec {
  addOpt(spec, name, "float", short, def, description);
  return spec;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse `argv` against `spec`.  Returns an `OptResult` with the
 * parsed values and positional arguments.
 *
 * Throws on unknown options (unless `allowUnknown` was set on the
 * spec) and on malformed values.
 */
export function optParse(spec: OptSpec, argv: string[]): OptResult {
  assertSpec(spec, "optParse");
  if (!Array.isArray(argv)) throw new Error("optParse: argv must be an array");

  // Initialize the result with defaults and mark all as not supplied.
  const result: OptResult = { values: {}, positionals: [], supplied: {} };
  for (const name of Object.keys(spec.options)) {
    result.values[name] = spec.options[name].default;
    result.supplied[name] = false;
  }

  // Build a reverse index: short flag char -> option name.
  const shortToName: Record<string, string> = {};
  for (const name of Object.keys(spec.options)) {
    const s = spec.options[name].short;
    if (s !== undefined) shortToName[s] = name;
  }

  let i = 0;
  let seenDashDash = false;
  while (i < argv.length) {
    const arg = argv[i];
    if (typeof arg !== "string") {
      throw new Error("optParse: argv elements must be strings; got " + typeof arg);
    }
    if (seenDashDash) {
      result.positionals.push(arg);
      i++;
      continue;
    }
    if (arg === "--") {
      seenDashDash = true;
      i++;
      continue;
    }
    // Long form: --name or --name=value or --no-name
    if (arg.startsWith("--")) {
      const rest = arg.slice(2);
      const eqIdx = rest.indexOf("=");
      let name: string;
      let inlineVal: string | undefined;
      if (eqIdx >= 0) {
        name = rest.slice(0, eqIdx);
        inlineVal = rest.slice(eqIdx + 1);
      } else {
        name = rest;
      }
      // Handle --no-name for flags.
      const neg = name.startsWith("no-");
      let realName = name;
      let negate = false;
      if (neg) {
        realName = name.slice(3);
        negate = true;
      }
      const opt = spec.options[realName];
      if (!opt) {
        if (spec.allowUnknown) {
          result.positionals.push(arg);
          i++;
          continue;
        }
        throw new Error("optParse: unknown option '--" + name + "'");
      }
      if (opt.kind === "flag") {
        if (inlineVal !== undefined) {
          throw new Error("optParse: flag '--" + realName + "' does not take a value");
        }
        result.values[realName] = negate ? false : true;
        result.supplied[realName] = true;
        i++;
        continue;
      }
      // Value option: get the value from inline or the next argv.
      let val: string;
      if (inlineVal !== undefined) {
        val = inlineVal;
      } else {
        if (i + 1 >= argv.length) {
          throw new Error("optParse: option '--" + realName + "' requires a value");
        }
        val = argv[i + 1];
        i++;
      }
      result.values[realName] = coerceValue(opt.kind, val, realName);
      result.supplied[realName] = true;
      i++;
      continue;
    }
    // Short form: -f or -fvalue
    if (arg.startsWith("-") && arg.length > 1) {
      const c = arg[1];
      const name = shortToName[c];
      if (!name) {
        if (spec.allowUnknown) {
          result.positionals.push(arg);
          i++;
          continue;
        }
        throw new Error("optParse: unknown short option '-" + c + "'");
      }
      const opt = spec.options[name];
      if (opt.kind === "flag") {
        result.values[name] = true;
        result.supplied[name] = true;
        i++;
        continue;
      }
      // Value option: take the rest of the arg, or the next argv.
      let val: string;
      if (arg.length > 2) {
        val = arg.slice(2);
      } else {
        if (i + 1 >= argv.length) {
          throw new Error("optParse: option '-" + c + "' requires a value");
        }
        val = argv[i + 1];
        i++;
      }
      result.values[name] = coerceValue(opt.kind, val, name);
      result.supplied[name] = true;
      i++;
      continue;
    }
    // Positional argument.
    result.positionals.push(arg);
    i++;
  }
  return result;
}

function coerceValue(kind: string, val: string, name: string): any {
  if (kind === "string") return val;
  if (kind === "int") {
    const n = Number(val);
    if (!Number.isFinite(n)) {
      throw new Error("optParse: option '" + name + "' expects an integer; got '" + val + "'");
    }
    return Math.trunc(n);
  }
  if (kind === "float") {
    const n = Number(val);
    if (!Number.isFinite(n)) {
      throw new Error("optParse: option '" + name + "' expects a float; got '" + val + "'");
    }
    return n;
  }
  return val;
}

// ---------------------------------------------------------------------------
// Help text and accessors
// ---------------------------------------------------------------------------

/**
 * Build a help string summarising the spec.  Each option is shown
 * with its short and long forms, its kind, its default value, and
 * its description (if any).  The string is multi-line and intended
 * to be printed directly.
 */
export function optHelp(spec: OptSpec): string {
  assertSpec(spec, "optHelp");
  const lines: string[] = [];
  lines.push("Usage: " + spec.progName + " [options] [args...]");
  lines.push("");
  lines.push("Options:");
  const names = Object.keys(spec.options);
  for (const name of names) {
    const opt = spec.options[name];
    const shortStr = opt.short ? "-" + opt.short + ", " : "    ";
    const longStr = "--" + name;
    const kindStr = opt.kind === "flag" ? "" : " <" + opt.kind + ">";
    const defStr =
      opt.default === "" || opt.default === 0 || opt.default === false
        ? ""
        : "  (default: " + JSON.stringify(opt.default) + ")";
    const descStr = opt.description ? "    " + opt.description : "";
    lines.push("  " + shortStr + longStr + kindStr + defStr + descStr);
  }
  return lines.join("\n");
}

/**
 * Return true if the option was supplied by the user (as opposed to
 * falling back to its default).
 */
export function optHas(result: OptResult, name: string): boolean {
  if (!result || typeof result !== "object") {
    throw new Error("optHas: expected an OptResult");
  }
  return !!result.supplied[name];
}

/**
 * Get the value of an option.  If the option wasn't supplied, the
 * default from the spec is returned.  Throws if the option name
 * wasn't declared.
 */
export function optGet(result: OptResult, name: string): any {
  if (!result || typeof result !== "object") {
    throw new Error("optGet: expected an OptResult");
  }
  if (!(name in result.values)) {
    throw new Error("optGet: unknown option '" + name + "'");
  }
  return result.values[name];
}

/** Return the array of positional arguments. */
export function optPositional(result: OptResult): string[] {
  if (!result || typeof result !== "object") {
    throw new Error("optPositional: expected an OptResult");
  }
  return Array.isArray(result.positionals) ? result.positionals.slice() : [];
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
  module: "optparse",
  fns: [
    { name: "optNew", sig: "() -> OptSpec", desc: "Create a fresh, empty option parser spec." },
    { name: "optFlag", sig: "(spec, name, short?, def?, desc?) -> OptSpec", desc: "Declare a boolean flag (default false)." },
    { name: "optString", sig: "(spec, name, short?, def?, desc?) -> OptSpec", desc: "Declare a string option that takes a value." },
    { name: "optInt", sig: "(spec, name, short?, def?, desc?) -> OptSpec", desc: "Declare an integer option." },
    { name: "optFloat", sig: "(spec, name, short?, def?, desc?) -> OptSpec", desc: "Declare a float option." },
    { name: "optParse", sig: "(spec, argv) -> OptResult", desc: "Parse argv against the spec; throws on unknown or malformed." },
    { name: "optHelp", sig: "(spec) -> string", desc: "Build a multi-line help string summarising the spec." },
    { name: "optHas", sig: "(result, name) -> bool", desc: "True if the option was supplied by the user." },
    { name: "optGet", sig: "(result, name) -> any", desc: "Get the value of an option (or its default)." },
    { name: "optPositional", sig: "(result) -> string[]", desc: "Return the array of positional arguments." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("optNew", optNew);
  registerBuiltin("optFlag", optFlag);
  registerBuiltin("optString", optString);
  registerBuiltin("optInt", optInt);
  registerBuiltin("optFloat", optFloat);
  registerBuiltin("optParse", optParse);
  registerBuiltin("optHelp", optHelp);
  registerBuiltin("optHas", optHas);
  registerBuiltin("optGet", optGet);
  registerBuiltin("optPositional", optPositional);
}
