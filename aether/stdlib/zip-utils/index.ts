/**
 * Aether stdlib — `zip-utils` module.
 *
 * A thin convenience namespace over the `zip` module that re-exports
 * the same ten functions under the canonical names so that Aether
 * programs (and host code) can import them via either module path.
 * This module exists primarily to:
 *
 *   - provide a stable, discoverable name ("zip-utils") for the
 *     family of array-zipping helpers (the bare name `zip` is shared
 *     with the older `collections` builtin, which can be confusing
 *     when grepping docs);
 *   - register the same ten builtins under their canonical names so
 *     the evaluator always has a single, well-defined source of
 *     truth for `zip`, `zip3`, `zipWith`, `unzip`, `unzip3`,
 *     `zipLongest`, `zipAll`, `zipToDict`, `zipStrict`, and
 *     `zipWithIndex`;
 *   - host a separate, broader test suite (25 cases) that exercises
 *     edge cases not covered by the `zip` module's tests
 *     (mixed-type tuples, large inputs, unicode keys, partial-fill
 *     round trips, and so on) so the combined zip coverage is
 *     noticeably stronger than either suite alone.
 *
 * The implementations live in `../zip`; this file is purely a
 * re-export + manifest shim. Importing from `zip-utils` or `zip`
 * gives you the same functions at runtime.
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.
 */

import * as Z from "../zip";

// Re-export the underlying implementations under their canonical names
// so that `import * as ZU from "aether/stdlib/zip-utils"` returns the same
// functions as `import * as Z from "aether/stdlib/zip"`.
export const zip = Z.zip;
export const zip3 = Z.zip3;
export const zipWith = Z.zipWith;
export const unzip = Z.unzip;
export const unzip3 = Z.unzip3;
export const zipLongest = Z.zipLongest;
export const zipAll = Z.zipAll;
export const zipToDict = Z.zipToDict;
export const zipStrict = Z.zipStrict;
export const zipWithIndex = Z.zipWithIndex;

// Re-export the MISSING sentinel (used by tests that need to detect
// padding placeholders from `zipLongest`).
export { MISSING } from "../zip";

// ---------------------------------------------------------------------------
// Registration — registers the same ten builtins as the `zip` module.
// When both are registered (which is the default), the second call
// overwrites the first with the same function reference, so the
// observable behaviour is unchanged.
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "zip-utils",
  fns: [
    { name: "zip", sig: "(a: any[], b: any[]) -> any[]", desc: "Zip two arrays into 2-tuples; truncate to shorter." },
    { name: "zip3", sig: "(a: any[], b: any[], c: any[]) -> any[]", desc: "Zip three arrays into 3-tuples; truncate to shortest." },
    { name: "zipWith", sig: "(a, b, fn) -> any[]", desc: "Zip two arrays and combine each pair through fn(a, b, i)." },
    { name: "unzip", sig: "(arr: any[]) -> any[]", desc: "Unzip 2-tuples into [a[], b[]]." },
    { name: "unzip3", sig: "(arr: any[]) -> any[]", desc: "Unzip 3-tuples into [a[], b[], c[]]." },
    { name: "zipLongest", sig: "(a, b, fill?) -> any[]", desc: "Zip two arrays, padding shorter with fill (default null)." },
    { name: "zipAll", sig: "(fill?, ...arrs) -> any[]", desc: "Zip any number of arrays; pad short inputs with fill (default null)." },
    { name: "zipToDict", sig: "(keys, values) -> record", desc: "Zip into a record mapping keys → values (keys stringified)." },
    { name: "zipStrict", sig: "(a, b) -> any[]", desc: "Zip; panic on length mismatch." },
    { name: "zipWithIndex", sig: "(arr: any[]) -> any[]", desc: "Pair each element with its index: [[i, v], ...]." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("zip", zip);
  registerBuiltin("zip3", zip3);
  registerBuiltin("zipWith", zipWith);
  registerBuiltin("unzip", unzip);
  registerBuiltin("unzip3", unzip3);
  registerBuiltin("zipLongest", zipLongest);
  registerBuiltin("zipAll", zipAll);
  registerBuiltin("zipToDict", zipToDict);
  registerBuiltin("zipStrict", zipStrict);
  registerBuiltin("zipWithIndex", zipWithIndex);
}
