/**
 * Aether stdlib — `validate` module.
 *
 * Common input-validation predicates: format checks (email, URL, IP, UUID,
 * date, time), character-class checks (alpha, numeric, alnum, lower, upper,
 * whitespace, ASCII), and value checks (in-range, one-of, non-empty,
 * length, regex match).
 *
 * Every function returns a boolean — no exceptions on invalid input by
 * design (that's the whole point of a predicate).  Functions DO throw on
 * wrong-type *arguments* (e.g. passing a number where a string is expected),
 * because that's a programming error, not a validation failure.
 */

// ---------------------------------------------------------------------------
// Format checks
// ---------------------------------------------------------------------------

/** True when `s` looks like a syntactically valid email address. */
export function isEmail(s: string): boolean {
  assertString(s, "isEmail");
  // Pragmatic: local-part@domain.tld with reasonable restrictions.
  return /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(s);
}

/** True when `s` looks like a URL with an http(s) scheme. */
export function isUrl(s: string): boolean {
  assertString(s, "isUrl");
  return /^https?:\/\/[A-Za-z0-9.\-]+(:\d+)?(\/[^\s]*)?$/i.test(s);
}

/** True when `s` is a dotted-quad IPv4 address with each octet in [0,255]. */
export function isIpv4(s: string): boolean {
  assertString(s, "isIpv4");
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return false;
  for (let i = 1; i <= 4; i++) {
    const oct = m[i];
    if (oct.length > 1 && oct[0] === "0") return false; // no leading zeros
    const n = parseInt(oct, 10);
    if (n < 0 || n > 255) return false;
  }
  return true;
}

/** True when `s` is a ( textual, colon-separated ) IPv6 address. */
export function isIpv6(s: string): boolean {
  assertString(s, "isIpv6");
  if (s.length === 0) return false;
  // Reject runs of 3+ colons outright.
  if (s.includes(":::")) return false;
  // "::" may appear at most once.
  const firstDouble = s.indexOf("::");
  const lastDouble = s.lastIndexOf("::");
  if (firstDouble !== -1 && firstDouble !== lastDouble) return false;
  const hasDouble = firstDouble !== -1;
  // Split into groups; empty strings represent the "::" gap.
  const parts = s.split(":").filter((p) => p !== "");
  for (const p of parts) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(p)) return false;
  }
  if (hasDouble) {
    // "::" represents one or more zero groups; we have at most 7 explicit.
    return parts.length <= 7;
  } else {
    // No "::" shortcut: need exactly 8 hex groups.
    return parts.length === 8;
  }
}

/** True when `s` is a UUID in canonical 8-4-4-4-12 hex form (any version). */
export function isUuid(s: string): boolean {
  assertString(s, "isUuid");
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
}

/** True when `s` is a date in ISO YYYY-MM-DD form (validating month/day). */
export function isDate(s: string): boolean {
  assertString(s, "isDate");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  // Validate against actual calendar.
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return false;
  return true;
}

/** True when `s` is a time in HH:MM (or HH:MM:SS) 24-hour form. */
export function isTime(s: string): boolean {
  assertString(s, "isTime");
  const m = /^(\d{2}):(\d{2})(:(\d{2}))?$/.exec(s);
  if (!m) return false;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h < 0 || h > 23) return false;
  if (mi < 0 || mi > 59) return false;
  if (m[4] !== undefined) {
    const se = parseInt(m[4], 10);
    if (se < 0 || se > 59) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Character-class checks
// ---------------------------------------------------------------------------

export function isAlpha(s: string): boolean {
  assertString(s, "isAlpha");
  if (s.length === 0) return false;
  return /^[A-Za-z]+$/.test(s);
}
export function isNumeric(s: string): boolean {
  assertString(s, "isNumeric");
  if (s.length === 0) return false;
  return /^[0-9]+$/.test(s);
}
export function isAlnum(s: string): boolean {
  assertString(s, "isAlnum");
  if (s.length === 0) return false;
  return /^[A-Za-z0-9]+$/.test(s);
}
export function isLower(s: string): boolean {
  assertString(s, "isLower");
  if (s.length === 0) return false;
  return /^[a-z]+$/.test(s);
}
export function isUpper(s: string): boolean {
  assertString(s, "isUpper");
  if (s.length === 0) return false;
  return /^[A-Z]+$/.test(s);
}
export function isWhitespace(s: string): boolean {
  assertString(s, "isWhitespace");
  if (s.length === 0) return false;
  return /^\s+$/.test(s);
}
export function isAscii(s: string): boolean {
  assertString(s, "isAscii");
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Value checks
// ---------------------------------------------------------------------------

export function isInRange(n: number, lo: number, hi: number): boolean {
  assertNum(n, "isInRange");
  assertNum(lo, "isInRange");
  assertNum(hi, "isInRange");
  return n >= lo && n <= hi;
}

export function isOneOf<T>(v: T, opts: T[]): boolean {
  if (!Array.isArray(opts)) throw new Error("isOneOf: expected array of options");
  for (const o of opts) if (o === v) return true;
  return false;
}

export function isNonEmpty(s: string): boolean {
  assertString(s, "isNonEmpty");
  return s.length > 0;
}

export function isLength(s: string, n: number): boolean {
  assertString(s, "isLength");
  assertInt(n, "isLength");
  return s.length === n;
}

export function isMaxLength(s: string, n: number): boolean {
  assertString(s, "isMaxLength");
  assertInt(n, "isMaxLength");
  return s.length <= n;
}

export function matches(s: string, pattern: string): boolean {
  assertString(s, "matches");
  assertString(pattern, "matches");
  try {
    return new RegExp(pattern).test(s);
  } catch {
    throw new Error("matches: invalid regex '" + pattern + "'");
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "validate",
  fns: [
    { name: "isEmail", sig: "(s: string) -> bool", desc: "True when s looks like a valid email address." },
    { name: "isUrl", sig: "(s: string) -> bool", desc: "True when s looks like an http(s) URL." },
    { name: "isIpv4", sig: "(s: string) -> bool", desc: "True when s is a dotted-quad IPv4 address." },
    { name: "isIpv6", sig: "(s: string) -> bool", desc: "True when s is a textual colon-separated IPv6 address." },
    { name: "isUuid", sig: "(s: string) -> bool", desc: "True when s is a canonical UUID (8-4-4-4-12)." },
    { name: "isDate", sig: "(s: string) -> bool", desc: "True when s is an ISO date (YYYY-MM-DD, calendar-validated)." },
    { name: "isTime", sig: "(s: string) -> bool", desc: "True when s is HH:MM or HH:MM:SS 24-hour time." },
    { name: "isAlpha", sig: "(s: string) -> bool", desc: "True when s contains only ASCII letters." },
    { name: "isNumeric", sig: "(s: string) -> bool", desc: "True when s contains only digits." },
    { name: "isAlnum", sig: "(s: string) -> bool", desc: "True when s contains only letters and digits." },
    { name: "isLower", sig: "(s: string) -> bool", desc: "True when s is all lowercase ASCII letters." },
    { name: "isUpper", sig: "(s: string) -> bool", desc: "True when s is all uppercase ASCII letters." },
    { name: "isWhitespace", sig: "(s: string) -> bool", desc: "True when s is all whitespace." },
    { name: "isAscii", sig: "(s: string) -> bool", desc: "True when every char in s has code <= 127." },
    { name: "isInRange", sig: "(n, lo, hi) -> bool", desc: "True when lo <= n <= hi." },
    { name: "isOneOf", sig: "(v, opts: any[]) -> bool", desc: "True when v is in opts (strict equality)." },
    { name: "isNonEmpty", sig: "(s: string) -> bool", desc: "True when s has length > 0." },
    { name: "isLength", sig: "(s: string, n: int) -> bool", desc: "True when s has exactly n characters." },
    { name: "isMaxLength", sig: "(s: string, n: int) -> bool", desc: "True when s has at most n characters." },
    { name: "matches", sig: "(s: string, pattern: string) -> bool", desc: "True when s matches the regex pattern." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("isEmail", isEmail);
  registerBuiltin("isUrl", isUrl);
  registerBuiltin("isIpv4", isIpv4);
  registerBuiltin("isIpv6", isIpv6);
  registerBuiltin("isUuid", isUuid);
  registerBuiltin("isDate", isDate);
  registerBuiltin("isTime", isTime);
  registerBuiltin("isAlpha", isAlpha);
  registerBuiltin("isNumeric", isNumeric);
  registerBuiltin("isAlnum", isAlnum);
  registerBuiltin("isLower", isLower);
  registerBuiltin("isUpper", isUpper);
  registerBuiltin("isWhitespace", isWhitespace);
  registerBuiltin("isAscii", isAscii);
  registerBuiltin("isInRange", isInRange);
  registerBuiltin("isOneOf", isOneOf);
  registerBuiltin("isNonEmpty", isNonEmpty);
  registerBuiltin("isLength", isLength);
  registerBuiltin("isMaxLength", isMaxLength);
  registerBuiltin("matches", matches);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertString(x: any, fn: string): asserts x is string {
  if (typeof x !== "string") {
    throw new Error(fn + ": expected string, got " + (x === null ? "null" : x === undefined ? "undefined" : typeof x));
  }
}

function assertNum(x: any, fn: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x)) {
    throw new Error(fn + ": expected number, got " + (x === null ? "null" : x === undefined ? "undefined" : typeof x));
  }
}

function assertInt(x: any, fn: string): asserts x is number {
  assertNum(x, fn);
}
