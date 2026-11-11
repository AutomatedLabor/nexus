/**
 * Aether stdlib — `string` module.
 *
 * Every function is a pure TypeScript implementation that operates on plain
 * JavaScript values (strings, numbers, arrays, …) that the Aether evaluator
 * hands to builtins.  Each function throws a plain `Error` on invalid input;
 * the evaluator converts thrown errors into Aether panics.
 *
 * The module exports a `register(env)` function that registers every
 * function under its Aether name via the shared `registerBuiltin` hook.
 */

// Aether values map to JS: int/float = number, string = string, bool = boolean,
// array = JS array.  Builtins receive JS values and return JS values.
// We use `any` for value-shaped parameters (with a comment) to match the
// evaluator's untyped FFI boundary; everything else is strict TS.

export function split(s: string, sep?: string): string[] {
  assertString(s, "split");
  if (sep === undefined || sep === null) {
    // Default separator: split on whitespace runs (like Aether's `words`).
    return s.trim().length === 0 ? [] : s.trim().split(/\s+/);
  }
  assertString(sep, "split");
  if (sep === "") {
    // Split into characters (Unicode-aware via Array.from).
    return Array.from(s);
  }
  return s.split(sep);
}

export function join(arr: any[], sep: string = ","): string {
  if (!Array.isArray(arr)) throw new Error("join: expected array");
  assertString(sep, "join");
  return arr.map((x) => toDisplay(x)).join(sep);
}

export function trim(s: string): string {
  assertString(s, "trim");
  return s.trim();
}

export function trimStart(s: string): string {
  assertString(s, "trimStart");
  return s.trimStart();
}

export function trimEnd(s: string): string {
  assertString(s, "trimEnd");
  return s.trimEnd();
}

export function toUpper(s: string): string {
  assertString(s, "toUpper");
  return s.toUpperCase();
}

export function toLower(s: string): string {
  assertString(s, "toLower");
  return s.toLowerCase();
}

export function replace(s: string, from: string, to: string): string {
  assertString(s, "replace");
  assertString(from, "replace");
  assertString(to, "replace");
  // First occurrence only (mirrors Aether's `replace` semantics).
  const idx = s.indexOf(from);
  if (idx === -1) return s;
  return s.slice(0, idx) + to + s.slice(idx + from.length);
}

export function replaceAll(s: string, from: string, to: string): string {
  assertString(s, "replaceAll");
  assertString(from, "replaceAll");
  assertString(to, "replaceAll");
  if (from === "") return s; // avoid infinite loop on empty match
  return s.split(from).join(to);
}

export function startsWith(s: string, prefix: string): boolean {
  assertString(s, "startsWith");
  assertString(prefix, "startsWith");
  return s.startsWith(prefix);
}

export function endsWith(s: string, suffix: string): boolean {
  assertString(s, "endsWith");
  assertString(suffix, "endsWith");
  return s.endsWith(suffix);
}

export function contains(s: string, sub: string): boolean {
  assertString(s, "contains");
  assertString(sub, "contains");
  return s.includes(sub);
}

export function indexOf(s: string, sub: string): number {
  assertString(s, "indexOf");
  assertString(sub, "indexOf");
  const i = s.indexOf(sub);
  return i; // -1 when not found (Aether int)
}

export function slice(s: string, start: number, end?: number): string {
  assertString(s, "slice");
  assertInt(start, "slice");
  if (end !== undefined && end !== null) {
    assertInt(end, "slice");
    return s.slice(start, end as number);
  }
  return s.slice(start);
}

export function charAt(s: string, i: number): string {
  assertString(s, "charAt");
  assertInt(i, "charAt");
  if (i < 0 || i >= s.length) throw new Error("charAt: index out of bounds");
  return s.charAt(i);
}

export function charCode(s: string, i: number): number {
  assertString(s, "charCode");
  assertInt(i, "charCode");
  if (i < 0 || i >= s.length) throw new Error("charCode: index out of bounds");
  return s.charCodeAt(i);
}

export function fromCharCode(n: number): string {
  assertInt(n, "fromCharCode");
  if (n < 0 || n > 0x10ffff) throw new Error("fromCharCode: code point out of range");
  if (n <= 0xffff) return String.fromCharCode(n);
  // Encode as a UTF-16 surrogate pair.
  const code = n - 0x10000;
  const hi = 0xd800 + (code >> 10);
  const lo = 0xdc00 + (code & 0x3ff);
  return String.fromCharCode(hi, lo);
}

export function repeat(s: string, n: number): string {
  assertString(s, "repeat");
  assertInt(n, "repeat");
  if (n < 0) throw new Error("repeat: count must be non-negative");
  return s.repeat(n);
}

export function padStart(s: string, n: number, ch: string = " "): string {
  assertString(s, "padStart");
  assertInt(n, "padStart");
  assertString(ch, "padStart");
  if (ch.length !== 1) throw new Error("padStart: padding must be a single char");
  return s.padStart(n, ch);
}

export function padEnd(s: string, n: number, ch: string = " "): string {
  assertString(s, "padEnd");
  assertInt(n, "padEnd");
  assertString(ch, "padEnd");
  if (ch.length !== 1) throw new Error("padEnd: padding must be a single char");
  return s.padEnd(n, ch);
}

export function reverse(s: string): string {
  assertString(s, "reverse");
  // Unicode-aware: split by code points, not UTF-16 units.
  return Array.from(s).reverse().join("");
}

export function len(s: string): number {
  assertString(s, "len");
  // Return code-point count (Unicode-aware).
  return Array.from(s).length;
}

export function isEmpty(s: string): boolean {
  assertString(s, "isEmpty");
  return s.length === 0;
}

export function toInt(s: string): number {
  assertString(s, "toInt");
  const t = s.trim();
  if (t === "") throw new Error("toInt: empty string");
  // Accept optional sign, decimal, exponent; produce integer via Math.trunc.
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error("toInt: cannot parse '" + s + "'");
  return Math.trunc(n);
}

/**
 * printf-style formatting: supports %s (string), %d (int), %f (float, 6 dp),
 * %x/%X (hex), %o (octal), %% (literal percent), with optional width and
 * precision like %5.2f.  Arguments are consumed positionally.
 */
export function format(fmt: string, ...args: any[]): string {
  assertString(fmt, "format");
  let i = 0;
  let out = "";
  for (let k = 0; k < fmt.length; k++) {
    const c = fmt[k];
    if (c !== "%") {
      out += c;
      continue;
    }
    // Parse a format specifier: %[flags][width][.prec]conv
    let spec = "";
    k++;
    while (k < fmt.length && "0123456789.-+ #".includes(fmt[k])) {
      spec += fmt[k];
      k++;
    }
    if (k >= fmt.length) throw new Error("format: trailing % in format string");
    const conv = fmt[k];
    if (conv === "%") {
      out += "%";
      continue;
    }
    const arg = args[i++];
    out += formatOne(spec, conv, arg);
  }
  return out;
}

function formatOne(spec: string, conv: string, arg: any): string {
  // spec looks like [flags][width][.prec] — extract width (first digit run)
  // and precision (digits after the dot).
  const widthMatch = spec.match(/(\d+)(?=\.|$)/);
  const width = widthMatch ? parseInt(widthMatch[1], 10) : 0;
  const precMatch = spec.match(/\.(\d+)/);
  const prec = precMatch ? parseInt(precMatch[1], 10) : -1;
  const leftAlign = spec.includes("-");
  let body: string;
  switch (conv) {
    case "s":
      body = String(arg ?? "");
      if (prec >= 0) body = body.slice(0, prec);
      break;
    case "d": {
      const n = Math.trunc(Number(arg));
      body = n.toString();
      break;
    }
    case "f": {
      const n = Number(arg);
      body = n.toFixed(prec >= 0 ? prec : 6);
      break;
    }
    case "x":
      body = Math.trunc(Number(arg)).toString(16);
      break;
    case "X":
      body = Math.trunc(Number(arg)).toString(16).toUpperCase();
      break;
    case "o":
      body = Math.trunc(Number(arg)).toString(8);
      break;
    case "b":
      body = Math.trunc(Number(arg)).toString(2);
      break;
    default:
      throw new Error("format: unknown conversion '%" + conv + "'");
  }
  if (width > body.length) {
    const pad = " ".repeat(width - body.length);
    body = leftAlign ? body + pad : pad + body;
  }
  return body;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertString(x: any, fn: string): asserts x is string {
  if (typeof x !== "string") {
    throw new Error(fn + ": expected string, got " + describe(x));
  }
}

function assertInt(x: any, fn: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x)) {
    throw new Error(fn + ": expected number, got " + describe(x));
  }
}

function describe(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}

function toDisplay(x: any): string {
  if (typeof x === "string") return x;
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  if (typeof x === "object") {
    try {
      return JSON.stringify(x);
    } catch {
      return String(x);
    }
  }
  return String(x);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "string",
  fns: [
    { name: "split", sig: "(s: string, sep?: string) -> string[]", desc: "Split a string by a separator (or whitespace if omitted)." },
    { name: "join", sig: "(arr: any[], sep?: string) -> string", desc: "Join an array of values into a string with a separator." },
    { name: "trim", sig: "(s: string) -> string", desc: "Strip leading and trailing whitespace." },
    { name: "trimStart", sig: "(s: string) -> string", desc: "Strip leading whitespace." },
    { name: "trimEnd", sig: "(s: string) -> string", desc: "Strip trailing whitespace." },
    { name: "toUpper", sig: "(s: string) -> string", desc: "Uppercase the string (locale-independent)." },
    { name: "toLower", sig: "(s: string) -> string", desc: "Lowercase the string." },
    { name: "replace", sig: "(s: string, from: string, to: string) -> string", desc: "Replace the first occurrence of `from` with `to`." },
    { name: "replaceAll", sig: "(s: string, from: string, to: string) -> string", desc: "Replace every occurrence of `from` with `to`." },
    { name: "startsWith", sig: "(s: string, prefix: string) -> bool", desc: "Test whether `s` begins with `prefix`." },
    { name: "endsWith", sig: "(s: string, suffix: string) -> bool", desc: "Test whether `s` ends with `suffix`." },
    { name: "contains", sig: "(s: string, sub: string) -> bool", desc: "Test whether `s` contains `sub`." },
    { name: "indexOf", sig: "(s: string, sub: string) -> int", desc: "Return the first index of `sub`, or -1." },
    { name: "slice", sig: "(s: string, start: int, end?: int) -> string", desc: "Return the substring [start, end)." },
    { name: "charAt", sig: "(s: string, i: int) -> string", desc: "Return the character at index `i` (panics if out of bounds)." },
    { name: "charCode", sig: "(s: string, i: int) -> int", desc: "Return the UTF-16 code unit at index `i`." },
    { name: "fromCharCode", sig: "(n: int) -> string", desc: "Build a single-character string from a code point." },
    { name: "repeat", sig: "(s: string, n: int) -> string", desc: "Repeat `s` `n` times." },
    { name: "padStart", sig: "(s: string, n: int, ch?: string) -> string", desc: "Left-pad `s` with `ch` (default space) to length `n`." },
    { name: "padEnd", sig: "(s: string, n: int, ch?: string) -> string", desc: "Right-pad `s` with `ch` to length `n`." },
    { name: "reverse", sig: "(s: string) -> string", desc: "Reverse by Unicode code point." },
    { name: "len", sig: "(s: string) -> int", desc: "Return code-point length." },
    { name: "isEmpty", sig: "(s: string) -> bool", desc: "True when length is 0." },
    { name: "toInt", sig: "(s: string) -> int", desc: "Parse the string as an integer; panic if invalid." },
    { name: "format", sig: "(fmt: string, ...args: any) -> string", desc: "printf-style formatting (%s/%d/%f/%x/%%)." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("split", split);
  registerBuiltin("join", join);
  registerBuiltin("trim", trim);
  registerBuiltin("trimStart", trimStart);
  registerBuiltin("trimEnd", trimEnd);
  registerBuiltin("toUpper", toUpper);
  registerBuiltin("toLower", toLower);
  registerBuiltin("replace", replace);
  registerBuiltin("replaceAll", replaceAll);
  registerBuiltin("startsWith", startsWith);
  registerBuiltin("endsWith", endsWith);
  registerBuiltin("contains", contains);
  registerBuiltin("indexOf", indexOf);
  registerBuiltin("slice", slice);
  registerBuiltin("charAt", charAt);
  registerBuiltin("charCode", charCode);
  registerBuiltin("fromCharCode", fromCharCode);
  registerBuiltin("repeat", repeat);
  registerBuiltin("padStart", padStart);
  registerBuiltin("padEnd", padEnd);
  registerBuiltin("reverse", reverse);
  registerBuiltin("len", len);
  registerBuiltin("isEmpty", isEmpty);
  registerBuiltin("toInt", toInt);
  registerBuiltin("format", format);
}
