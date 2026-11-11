/**
 * Aether stdlib — `regex` module.
 *
 * Thin, opinionated wrapper over the JS `RegExp` engine.  Patterns are
 * strings; the engine supports the full JavaScript regex syntax.  Helpers
 * accept either a pre-compiled `RegExp` (e.g. one returned by `regex`) or a
 * pattern string — both work in every entrypoint.
 *
 * To keep the surface area small and predictable, the wrapper does NOT
 * support per-call flag overrides via the pattern string syntax `"/foo/g"` —
 * if you need flags, pass a `RegExp` instance built with `regex(pattern,
 * flags)`.
 */

export function regex(pattern: string, flags: string = ""): RegExp {
  assertString(pattern, "regex");
  assertString(flags, "regex");
  try {
    return new RegExp(pattern, flags);
  } catch (e: any) {
    throw new Error("regex: invalid pattern '" + pattern + "': " + (e?.message ?? String(e)));
  }
}

function toRegExp(p: RegExp | string): RegExp {
  if (p instanceof RegExp) return p;
  if (typeof p !== "string") throw new Error("regex: expected pattern string or RegExp");
  try {
    return new RegExp(p);
  } catch (e: any) {
    throw new Error("regex: invalid pattern '" + p + "': " + (e?.message ?? String(e)));
  }
}

export function match(s: string, pattern: RegExp | string): string[] | null {
  assertString(s, "match");
  const re = toRegExp(pattern);
  const m = s.match(re);
  if (!m) return null;
  // Convert the match array (which has `index`/`input` attached) to a plain
  // array of capture-group strings.
  return Array.from(m) as string[];
}

export function matchAll(s: string, pattern: RegExp | string): string[][] {
  assertString(s, "matchAll");
  const re = toRegExp(pattern);
  if (!re.global) {
    // matchAll requires the global flag — promote automatically.
    return matchAll(s, new RegExp(re.source, re.flags + "g"));
  }
  const out: string[][] = [];
  for (const m of s.matchAll(re)) out.push(Array.from(m) as string[]);
  return out;
}

export function replace(s: string, pattern: RegExp | string, repl: string): string {
  assertString(s, "replace");
  assertString(repl, "replace");
  const re = toRegExp(pattern);
  if (re.global) {
    return s.replace(re, repl);
  }
  // Non-global regex: replace the first occurrence.
  return s.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + ""), repl);
}

export function replaceAll(s: string, pattern: RegExp | string, repl: string): string {
  assertString(s, "replaceAll");
  assertString(repl, "replaceAll");
  let re = toRegExp(pattern);
  if (!re.global) re = new RegExp(re.source, re.flags + "g");
  return s.replace(re, repl);
}

export function split(s: string, pattern: RegExp | string): string[] {
  assertString(s, "split");
  const re = toRegExp(pattern);
  return s.split(re);
}

export function test(s: string, pattern: RegExp | string): boolean {
  assertString(s, "test");
  const re = toRegExp(pattern);
  return re.test(s);
}

export function extract(s: string, pattern: RegExp | string, group: number = 0): string | null {
  assertString(s, "extract");
  assertInt(group, "extract");
  const re = toRegExp(pattern);
  const m = s.match(re);
  if (!m) return null;
  if (group < 0 || group >= m.length) throw new Error("extract: group out of range");
  return m[group] ?? null;
}

export function groups(s: string, pattern: RegExp | string): string[] | null {
  assertString(s, "groups");
  const re = toRegExp(pattern);
  const m = s.match(re);
  if (!m) return null;
  // Slice off match[0] (the whole match) so the result is just capture groups.
  return Array.from(m).slice(1) as string[];
}

export function firstMatch(s: string, pattern: RegExp | string): string | null {
  assertString(s, "firstMatch");
  const re = toRegExp(pattern);
  const m = s.match(re);
  return m ? (m[0] as string) : null;
}

export function count(s: string, pattern: RegExp | string): number {
  assertString(s, "count");
  let re = toRegExp(pattern);
  if (!re.global) re = new RegExp(re.source, re.flags + "g");
  const matches = s.match(re);
  return matches ? matches.length : 0;
}

export function startsWithMatch(s: string, pattern: RegExp | string): boolean {
  assertString(s, "startsWithMatch");
  const re = toRegExp(pattern);
  // Anchor at start without modifying the pattern (in case of alternations).
  const anchored = new RegExp("^(?:" + re.source + ")", re.flags.replace("g", ""));
  return anchored.test(s);
}

export function endsWithMatch(s: string, pattern: RegExp | string): boolean {
  assertString(s, "endsWithMatch");
  const re = toRegExp(pattern);
  const anchored = new RegExp("(?:" + re.source + ")$", re.flags.replace("g", ""));
  return anchored.test(s);
}

export function escape(s: string): string {
  assertString(s, "escape");
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function flags(pattern: RegExp | string): string {
  if (pattern instanceof RegExp) return pattern.flags;
  return "";
}

// ---------------------------------------------------------------------------
function assertString(x: any, fn: string): asserts x is string {
  if (typeof x !== "string") throw new Error(fn + ": expected string, got " + typeof x);
}
function assertInt(x: any, fn: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x) || !Number.isInteger(x)) {
    throw new Error(fn + ": expected integer, got " + String(x));
  }
}

// ---------------------------------------------------------------------------
export const MANIFEST = {
  module: "regex",
  fns: [
    { name: "regex", sig: "(pattern: string, flags?: string) -> regex", desc: "Compile a JS RegExp." },
    { name: "match", sig: "(s: string, pattern) -> string[]?", desc: "First match + captures, or null." },
    { name: "matchAll", sig: "(s: string, pattern) -> string[][]", desc: "All matches + captures." },
    { name: "replace", sig: "(s: string, pattern, repl: string) -> string", desc: "Replace first match." },
    { name: "replaceAll", sig: "(s: string, pattern, repl: string) -> string", desc: "Replace all matches." },
    { name: "split", sig: "(s: string, pattern) -> string[]", desc: "Split by pattern." },
    { name: "test", sig: "(s: string, pattern) -> bool", desc: "Boolean match test." },
    { name: "extract", sig: "(s: string, pattern, group?: int) -> string?", desc: "Capture group N (default 0)." },
    { name: "groups", sig: "(s: string, pattern) -> string[]?", desc: "All capture groups of first match." },
    { name: "firstMatch", sig: "(s: string, pattern) -> string?", desc: "Whole match string or null." },
    { name: "count", sig: "(s: string, pattern) -> int", desc: "Number of matches." },
    { name: "startsWithMatch", sig: "(s: string, pattern) -> bool", desc: "Pattern matches at start." },
    { name: "endsWithMatch", sig: "(s: string, pattern) -> bool", desc: "Pattern matches at end." },
    { name: "escape", sig: "(s: string) -> string", desc: "Escape regex metacharacters." },
    { name: "flags", sig: "(pattern) -> string", desc: "Return flags of a RegExp." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("regex", regex);
  registerBuiltin("match", match);
  registerBuiltin("matchAll", matchAll);
  registerBuiltin("replace", replace);
  registerBuiltin("replaceAll", replaceAll);
  registerBuiltin("split", split);
  registerBuiltin("test", test);
  registerBuiltin("extract", extract);
  registerBuiltin("groups", groups);
  registerBuiltin("firstMatch", firstMatch);
  registerBuiltin("count", count);
  registerBuiltin("startsWithMatch", startsWithMatch);
  registerBuiltin("endsWithMatch", endsWithMatch);
  registerBuiltin("escape", escape);
  registerBuiltin("flags", flags);
}
