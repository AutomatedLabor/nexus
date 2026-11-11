/**
 * Aether stdlib — `text` module.
 *
 * Higher-level text utilities (line/word splitting, indentation, wrapping,
 * case conversion, truncation).  Unicode-aware where it matters: case
 * conversions use the default Unicode mapping, splitting and length use
 * code points via `Array.from(s)` (so astral-plane characters such as
 * emoji count as one unit, not two).
 */

export function lines(s: string): string[] {
  assertString(s, "lines");
  // Split on \n and remove a trailing \r from each line (handles \r\n).
  const out = s.split("\n");
  for (let i = 0; i < out.length; i++) {
    if (out[i].endsWith("\r")) out[i] = out[i].slice(0, -1);
  }
  // If the string ended with \n we get a trailing "" — drop it to mirror
  // the intuition that "a\nb\n".lines() is ["a", "b"].
  if (out.length > 1 && out[out.length - 1] === "") out.pop();
  return out;
}

export function words(s: string): string[] {
  assertString(s, "words");
  const m = s.trim().match(/\S+/g);
  return m ? m : [];
}

export function unlines(arr: any[]): string {
  if (!Array.isArray(arr)) throw new Error("unlines: expected array");
  return arr.map((x) => String(x)).join("\n");
}

export function unwords(arr: any[]): string {
  if (!Array.isArray(arr)) throw new Error("unwords: expected array");
  return arr.map((x) => String(x)).join(" ");
}

export function indent(s: string, n: number): string {
  assertString(s, "indent");
  assertInt(n, "indent");
  if (n < 0) throw new Error("indent: negative count");
  const pad = " ".repeat(n);
  return pad + s.split("\n").join("\n" + pad);
}

export function dedent(s: string): string {
  assertString(s, "dedent");
  const ls = s.split("\n");
  // Find minimum non-zero leading whitespace across non-blank lines.
  let min = Infinity;
  for (const line of ls) {
    if (line.trim() === "") continue;
    const m = line.match(/^[ \t]*/);
    const w = m ? m[0].length : 0;
    if (w < min) min = w;
  }
  if (min === Infinity || min === 0) return s;
  return ls.map((line) => line.slice(min)).join("\n");
}

export function wrap(s: string, width: number): string {
  assertString(s, "wrap");
  assertInt(width, "wrap");
  if (width <= 0) throw new Error("wrap: width must be positive");
  const ws = words(s);
  if (ws.length === 0) return "";
  const out: string[] = [];
  let line = ws[0];
  for (let i = 1; i < ws.length; i++) {
    if (line.length + 1 + ws[i].length <= width) {
      line += " " + ws[i];
    } else {
      out.push(line);
      line = ws[i];
    }
  }
  out.push(line);
  return out.join("\n");
}

export function center(s: string, width: number): string {
  assertString(s, "center");
  assertInt(width, "center");
  if (width < s.length) return s;
  const total = width - s.length;
  const left = Math.floor(total / 2);
  const right = total - left;
  return " ".repeat(left) + s + " ".repeat(right);
}

export function left(s: string, width: number): string {
  assertString(s, "left");
  assertInt(width, "left");
  if (width <= s.length) return s;
  return s + " ".repeat(width - s.length);
}

export function right(s: string, width: number): string {
  assertString(s, "right");
  assertInt(width, "right");
  if (width <= s.length) return s;
  return " ".repeat(width - s.length) + s;
}

export function titleCase(s: string): string {
  assertString(s, "titleCase");
  // Capitalise the first letter of each word; words are runs of word
  // characters separated by whitespace OR punctuation (hyphens, etc.).
  // Lower-case the rest of each word. We split on \w+ so punctuation like
  // hyphens is preserved verbatim while each maximal word run is cased.
  return s.replace(/\b\w+\b/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function camelCase(s: string): string {
  assertString(s, "camelCase");
  const words = splitWords(s);
  if (words.length === 0) return "";
  return (
    words[0].toLowerCase() +
    words
      .slice(1)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("")
  );
}

export function snakeCase(s: string): string {
  assertString(s, "snakeCase");
  return splitWords(s).map((w) => w.toLowerCase()).join("_");
}

export function kebabCase(s: string): string {
  assertString(s, "kebabCase");
  return splitWords(s).map((w) => w.toLowerCase()).join("-");
}

export function truncate(s: string, n: number, ellipsis: string = "..."): string {
  assertString(s, "truncate");
  assertString(ellipsis, "truncate");
  assertInt(n, "truncate");
  if (n < 0) throw new Error("truncate: negative length");
  // Count by code points so emoji truncate cleanly.
  const cps = Array.from(s);
  if (cps.length <= n) return s;
  const e = Array.from(ellipsis);
  // Reserve space for the ellipsis if it fits.
  const keep = Math.max(0, n - e.length);
  return cps.slice(0, keep).join("") + ellipsis;
}

// ---------------------------------------------------------------------------
// Word splitting shared by case converters.
// ---------------------------------------------------------------------------
function splitWords(s: string): string[] {
  // Treat runs of non-alphanumeric as separators; also split on case
  // transitions (e.g. "camelCase" → ["camel", "Case"]).
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1\0$2")
    .replace(/[\W_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
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
  module: "text",
  fns: [
    { name: "lines", sig: "(s: string) -> string[]", desc: "Split on \\n; strip trailing \\r." },
    { name: "words", sig: "(s: string) -> string[]", desc: "Split on whitespace runs." },
    { name: "unlines", sig: "(arr: any[]) -> string", desc: "Join with \\n." },
    { name: "unwords", sig: "(arr: any[]) -> string", desc: "Join with single space." },
    { name: "indent", sig: "(s: string, n: int) -> string", desc: "Indent every line by n spaces." },
    { name: "dedent", sig: "(s: string) -> string", desc: "Strip common leading whitespace." },
    { name: "wrap", sig: "(s: string, width: int) -> string", desc: "Word-wrap to width." },
    { name: "center", sig: "(s: string, width: int) -> string", desc: "Center in width spaces." },
    { name: "left", sig: "(s: string, width: int) -> string", desc: "Left-align (pad right)." },
    { name: "right", sig: "(s: string, width: int) -> string", desc: "Right-align (pad left)." },
    { name: "titleCase", sig: "(s: string) -> string", desc: "Title case (per word)." },
    { name: "camelCase", sig: "(s: string) -> string", desc: "Convert to camelCase." },
    { name: "snakeCase", sig: "(s: string) -> string", desc: "Convert to snake_case." },
    { name: "kebabCase", sig: "(s: string) -> string", desc: "Convert to kebab-case." },
    { name: "truncate", sig: "(s: string, n: int, ellipsis?: string) -> string", desc: "Truncate to n code points, with ellipsis." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("lines", lines);
  registerBuiltin("words", words);
  registerBuiltin("unlines", unlines);
  registerBuiltin("unwords", unwords);
  registerBuiltin("indent", indent);
  registerBuiltin("dedent", dedent);
  registerBuiltin("wrap", wrap);
  registerBuiltin("center", center);
  registerBuiltin("left", left);
  registerBuiltin("right", right);
  registerBuiltin("titleCase", titleCase);
  registerBuiltin("camelCase", camelCase);
  registerBuiltin("snakeCase", snakeCase);
  registerBuiltin("kebabCase", kebabCase);
  registerBuiltin("truncate", truncate);
}
