/**
 * Aether stdlib — `parser` module.
 *
 * A tiny parser-combinator library.  A parser is a function
 *
 *   (input: string, pos: number) -> ParseResult
 *
 * where `ParseResult` is one of:
 *
 *   { ok: true,  value, pos }   — success, advanced to `pos`
 *   { ok: false, error, pos }   — failure at `pos`
 *
 * The combinators in this module compose parsers into bigger parsers.
 * See `README.md` for the design rationale (why combinators vs a
 * generator-based parser).
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParseResult<T> =
  | { ok: true; value: T; pos: number }
  | { ok: false; error: string; pos: number };

export type Parser<T> = (input: string, pos: number) => ParseResult<T>;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Always succeed with `value` (consume no input). */
export function parserOk<T>(value: T): Parser<T> {
  return (_input: string, pos: number) => ({ ok: true, value, pos });
}

/** Always fail with message `msg`. */
export function parserFail(msg: string): Parser<any> {
  return (_input: string, pos: number) => ({ ok: false, error: msg, pos });
}

/** Match a single specific character `c`. */
export function parserChar(c: string): Parser<string> {
  if (typeof c !== "string" || c.length !== 1) {
    throw new Error("parserChar: expected single character");
  }
  return (input: string, pos: number) => {
    if (pos < input.length && input[pos] === c) {
      return { ok: true, value: c, pos: pos + 1 };
    }
    return { ok: false, error: "expected '" + c + "'", pos };
  };
}

/** Match a literal string `s` (in full). */
export function parserString(s: string): Parser<string> {
  if (typeof s !== "string") throw new Error("parserString: expected string");
  return (input: string, pos: number) => {
    if (input.substr(pos, s.length) === s) {
      return { ok: true, value: s, pos: pos + s.length };
    }
    return { ok: false, error: "expected '" + s + "'", pos };
  };
}

/** Match a single digit `0-9`. */
export function parserDigit(): Parser<string> {
  return (input: string, pos: number) => {
    if (pos < input.length && input[pos] >= "0" && input[pos] <= "9") {
      return { ok: true, value: input[pos], pos: pos + 1 };
    }
    return { ok: false, error: "expected digit", pos };
  };
}

/** Match a single letter `a-zA-Z`. */
export function parserLetter(): Parser<string> {
  return (input: string, pos: number) => {
    if (pos < input.length) {
      const c = input[pos];
      if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) {
        return { ok: true, value: c, pos: pos + 1 };
      }
    }
    return { ok: false, error: "expected letter", pos };
  };
}

// ---------------------------------------------------------------------------
// Combinators
// ---------------------------------------------------------------------------

/** `parserBind(p, fn)`: parse with `p`, then apply `fn(value)` to get the
 *  next parser, and run that.  The monadic bind — the most general
 *  combinator; `parserMap`, `parserThen`, etc. can be built on it. */
export function parserBind<T, U>(p: Parser<T>, fn: (v: T) => Parser<U>): Parser<U> {
  if (typeof p !== "function") throw new Error("parserBind: expected parser");
  if (typeof fn !== "function") throw new Error("parserBind: expected function");
  return (input: string, pos: number) => {
    const r = p(input, pos);
    if (!r.ok) return r;
    return fn(r.value)(input, r.pos);
  };
}

/** `parserMap(p, fn)`: parse with `p`, then transform the value with `fn`. */
export function parserMap<T, U>(p: Parser<T>, fn: (v: T) => U): Parser<U> {
  if (typeof p !== "function") throw new Error("parserMap: expected parser");
  if (typeof fn !== "function") throw new Error("parserMap: expected function");
  return (input: string, pos: number) => {
    const r = p(input, pos);
    if (!r.ok) return r;
    return { ok: true, value: fn(r.value), pos: r.pos };
  };
}

/** `parserThen(a, b)`: parse `a` then `b`, return the result of `b`
 *  (discards `a`'s value).  Useful when `a` is a delimiter. */
export function parserThen<A, B>(a: Parser<A>, b: Parser<B>): Parser<B> {
  return parserBind(a, () => b);
}

/** `parserOr(a, b)`: try `a`, and if it fails, try `b` at the same position. */
export function parserOr<T>(a: Parser<T>, b: Parser<T>): Parser<T> {
  if (typeof a !== "function" || typeof b !== "function") {
    throw new Error("parserOr: expected parsers");
  }
  return (input: string, pos: number) => {
    const ra = a(input, pos);
    if (ra.ok) return ra;
    const rb = b(input, pos);
    if (rb.ok) return rb;
    // Combine errors: prefer the one that got further.
    return rb.pos >= ra.pos ? rb : ra;
  };
}

/** `parserMany(p)`: match `p` zero or more times, return array of values. */
export function parserMany<T>(p: Parser<T>): Parser<T[]> {
  if (typeof p !== "function") throw new Error("parserMany: expected parser");
  return (input: string, pos: number) => {
    const out: T[] = [];
    let cur = pos;
    // Safety bound to prevent infinite loops on zero-width parsers.
    let safety = 0;
    while (safety < 100000) {
      const r = p(input, cur);
      if (!r.ok) break;
      if (r.pos === cur) break; // no progress, stop
      out.push(r.value);
      cur = r.pos;
      safety++;
    }
    return { ok: true, value: out, pos: cur };
  };
}

/** `parserMany1(p)`: match `p` one or more times, return array of values.
 *  Fails if `p` doesn't match at least once. */
export function parserMany1<T>(p: Parser<T>): Parser<T[]> {
  if (typeof p !== "function") throw new Error("parserMany1: expected parser");
  return (input: string, pos: number) => {
    const first = p(input, pos);
    if (!first.ok) return first;
    const out: T[] = [first.value];
    let cur = first.pos;
    let safety = 0;
    while (safety < 100000) {
      const r = p(input, cur);
      if (!r.ok) break;
      if (r.pos === cur) break;
      out.push(r.value);
      cur = r.pos;
      safety++;
    }
    return { ok: true, value: out, pos: cur };
  };
}

/** `parserOptional(p)`: match `p` zero or one times.  Returns null if not present. */
export function parserOptional<T>(p: Parser<T>): Parser<T | null> {
  if (typeof p !== "function") throw new Error("parserOptional: expected parser");
  return (input: string, pos: number) => {
    const r = p(input, pos);
    if (r.ok) return { ok: true, value: r.value, pos: r.pos };
    return { ok: true, value: null, pos };
  };
}

/** `parserSepBy(p, sep)`: zero or more `p` separated by `sep`. */
export function parserSepBy<T, S>(p: Parser<T>, sep: Parser<S>): Parser<T[]> {
  return parserOr(parserSepBy1(p, sep), parserOk<T[]>([]));
}

/** `parserSepBy1(p, sep)`: one or more `p` separated by `sep`. */
export function parserSepBy1<T, S>(p: Parser<T>, sep: Parser<S>): Parser<T[]> {
  if (typeof p !== "function" || typeof sep !== "function") {
    throw new Error("parserSepBy1: expected parsers");
  }
  return (input: string, pos: number) => {
    const first = p(input, pos);
    if (!first.ok) return first;
    const out: T[] = [first.value];
    let cur = first.pos;
    let safety = 0;
    while (safety < 100000) {
      const s = sep(input, cur);
      if (!s.ok) break;
      const next = p(input, s.pos);
      if (!next.ok) break;
      out.push(next.value);
      cur = next.pos;
      safety++;
    }
    return { ok: true, value: out, pos: cur };
  };
}

/** `parserBetween(open, p, close)`: match `open`, `p`, `close`; return `p`'s value. */
export function parserBetween<O, T, C>(open: Parser<O>, p: Parser<T>, close: Parser<C>): Parser<T> {
  return parserBind(open, () => parserBind(p, (v) => parserMap(close, () => v)));
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

/** Run `p` on `input` from position 0; return the result.  Does NOT
 *  require the parser to consume the whole input. */
export function parserRun<T>(p: Parser<T>, input: string): ParseResult<T> {
  if (typeof p !== "function") throw new Error("parserRun: expected parser");
  if (typeof input !== "string") throw new Error("parserRun: expected string");
  return p(input, 0);
}

/** Run `p` on `input` from position 0; require that it consumes the
 *  whole input.  Returns `{ ok: true, value }` or `{ ok: false, error }`.
 *  This is the convenience wrapper for "parse this whole string". */
export function parserResult<T>(p: Parser<T>, input: string): { ok: true; value: T } | { ok: false; error: string } {
  const r = parserRun(p, input);
  if (!r.ok) return { ok: false, error: r.error + " at pos " + r.pos };
  if (r.pos !== input.length) {
    return { ok: false, error: "unexpected input at pos " + r.pos + ": '" + input.substr(r.pos, 20) + "'" };
  }
  return { ok: true, value: r.value };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "parser",
  fns: [
    { name: "parserOk", sig: "(v) -> Parser", desc: "Always-succeed parser yielding v (no input consumed)." },
    { name: "parserFail", sig: "(msg: string) -> Parser", desc: "Always-fail parser with message msg." },
    { name: "parserBind", sig: "(p, fn) -> Parser", desc: "Monadic bind: parse p, then apply fn(value) to get next parser." },
    { name: "parserMap", sig: "(p, fn) -> Parser", desc: "Map: parse p, transform value with fn." },
    { name: "parserThen", sig: "(a, b) -> Parser", desc: "Sequence a then b, return b's value." },
    { name: "parserOr", sig: "(a, b) -> Parser", desc: "Choice: try a; if it fails, try b at same pos." },
    { name: "parserMany", sig: "(p) -> Parser<any[]>", desc: "Zero or more p." },
    { name: "parserMany1", sig: "(p) -> Parser<any[]>", desc: "One or more p (fails if none)." },
    { name: "parserOptional", sig: "(p) -> Parser<any?>", desc: "Zero or one p (null if not present)." },
    { name: "parserSepBy", sig: "(p, sep) -> Parser<any[]>", desc: "Zero or more p separated by sep." },
    { name: "parserSepBy1", sig: "(p, sep) -> Parser<any[]>", desc: "One or more p separated by sep." },
    { name: "parserBetween", sig: "(open, p, close) -> Parser", desc: "Match open p close, return p's value." },
    { name: "parserChar", sig: "(c: string) -> Parser", desc: "Match a single specific character." },
    { name: "parserString", sig: "(s: string) -> Parser", desc: "Match a literal string in full." },
    { name: "parserDigit", sig: "() -> Parser", desc: "Match a single digit 0-9." },
    { name: "parserLetter", sig: "() -> Parser", desc: "Match a single letter a-zA-Z." },
    { name: "parserRun", sig: "(p, input) -> ParseResult", desc: "Run p on input from pos 0; return ParseResult." },
    { name: "parserResult", sig: "(p, input) -> {ok, value?}", desc: "Run p on input; require full consumption." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("parserOk", parserOk);
  registerBuiltin("parserFail", parserFail);
  registerBuiltin("parserBind", parserBind);
  registerBuiltin("parserMap", parserMap);
  registerBuiltin("parserThen", parserThen);
  registerBuiltin("parserOr", parserOr);
  registerBuiltin("parserMany", parserMany);
  registerBuiltin("parserMany1", parserMany1);
  registerBuiltin("parserOptional", parserOptional);
  registerBuiltin("parserSepBy", parserSepBy);
  registerBuiltin("parserSepBy1", parserSepBy1);
  registerBuiltin("parserBetween", parserBetween);
  registerBuiltin("parserChar", parserChar);
  registerBuiltin("parserString", parserString);
  registerBuiltin("parserDigit", parserDigit);
  registerBuiltin("parserLetter", parserLetter);
  registerBuiltin("parserRun", parserRun);
  registerBuiltin("parserResult", parserResult);
}
