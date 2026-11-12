# Chapter 17 — The package ecosystem

> Aether v3 ships 25 packages in `aether-packages/`, from `aether-list` and `aether-string` to `aether-graph` and `aether-state-machine`. Each is a real library: 200-500 LOC of pure Aether, a `tests/tests.ae` file with 20+ asserts, a `README.md` with API docs, an `aether.toml` manifest, and an `examples/example.ae` demo. This chapter covers the package model, the `aether.toml` manifest, how to use packages from a project, the package registry vision, and the package browser in the playground. Ten runnable examples show packages in action.

A package is Aether's unit of distribution. A package is a directory with `src/lib.ae` (the library code), `tests/tests.ae` (the test suite), `examples/example.ae` (a demo), `README.md` (documentation), and `aether.toml` (the manifest). The module loader resolves `import { foo } from "aether-string"` to a real file on disk (currently a relative path; the registry protocol is a v3.2 item).

The 25 packages in v3:

| Category | Packages |
| --- | --- |
| Collections | `aether-list`, `aether-dict`, `aether-set`, `aether-rb-tree`, `aether-tree`, `aether-graph`, `aether-heap-extra`, `aether-lru`, `aether-state-machine` |
| Strings | `aether-string`, `aether-text` |
| Parsing | `aether-parser`, `aether-regex`, `aether-json`, `aether-diff` |
| Encoding | `aether-base64`, `aether-base64-extra`, `aether-uuid` |
| Math | `aether-math`, `aether-matrix` |
| Functional | `aether-functional`, `aether-iterator`, `aether-validate` |
| Sort | `aether-sort` |
| Result | `aether-result` |
| Logging | `aether-logging` |
| Datetime | `aether-datetime` |
| FS | `aether-fs` |
| Process | `aether-process` |

Plus the `aether-apps/` directory, which contains the three real apps (database, web-framework, regex-engine — see Chapter 19).

---

## 17.1 The `aether.toml` manifest

Every package has an `aether.toml` file at its root. The manifest declares the package's name, version, edition, dependencies, and exports. The format:

```toml
[package]
name = "aether-string"
version = "0.1.0"
description = "Extended string operations for Aether — 30 pure functions covering splitting/joining, trimming, case conversion, alignment, reversal, and edit distances."
edition = "v3"

[dependencies]
# No external dependencies — uses only core builtins (charCode, fromCharCode,
# strSlice, len, push, strSlice).

[exports]
# Exposed via `pub fn` declarations in src/lib.ae.
```

### Fields

- `name` — the package's identifier, matches the directory name. Must match `^[a-z][a-z0-9-]*$`.
- `version` — a semver string (`MAJOR.MINOR.PATCH`).
- `description` — a one-line summary.
- `edition` — the Aether edition the package targets (`v1`, `v2`, `v3`).
- `dependencies` — a list of `{ name = "version" }` entries for other packages this package imports.
- `exports` — a list of names this package re-exports (in addition to its `pub fn`s).

The manifest is read by the module loader when resolving imports. Currently, the loader resolves `import { foo } from "aether-string"` to `./aether-packages/aether-string/src/lib.ae` (a relative path). The registry protocol (RFC-012) will resolve it to a registry-hosted package by version.

### Example 1: a minimal manifest

```toml
[package]
name = "my-package"
version = "0.1.0"
description = "My first Aether package."
edition = "v3"

[dependencies]
# No dependencies.

[exports]
# All pub fns are auto-exported.
```

This is enough for a package with no dependencies and only `pub fn` exports. The module loader auto-discovers `pub fn`s in `src/lib.ae`; the `exports` section is for re-exporting names imported from other packages (using `pub use`).

---

## 17.2 How to use a package

A package is used by importing its `pub fn`s. The import statement is the same as for any module:

```aether
import { split, join, levenshtein } from "aether-string";

let parts = split("hello,world,again", ",");
print(parts);          // [hello, world, again]
print(join(parts, " | "));   // hello | world | again
print(levenshtein("kitten", "sitting"));   // 3
```

The module loader resolves `"aether-string"` to the package's `src/lib.ae` file (currently by walking up from the importing file's directory looking for `aether-packages/aether-string/`; the registry protocol will replace this with a version-pinned lookup).

### Example 2: a multi-package project

```aether
// main.ae — a project that uses 3 packages
import { split, join } from "aether-string";
import { map, filter } from "aether-list";
import { isEmail } from "aether-validate";

let raw = "alice@example.com, bob@example.com, charlie";
let emails = split(raw, ", ");
let valid = filter(emails, fn(s: string) -> bool { isEmail(s) });
print(valid);   // [alice@example.com, bob@example.com]
```

This project imports from three packages (`aether-string`, `aether-list`, `aether-validate`). The module loader resolves each import to its package's `src/lib.ae`, collects the exports, and wires them into the importer's environment. The whole program is ~5 lines plus the imports.

---

## 17.3 The 25 packages — a tour

### Collections

**`aether-list`** — extended list operations: `map`, `filter`, `reduce`, `flatMap`, `chunk`, `partition`, `zip`, `intersperse`, etc. 40 functions on `[T]`. Built on `push`, `pop`, `len`, and recursion.

**`aether-dict`** — a hash map (`Dict<K, V>`). `dictNew`, `dictSet`, `dictGet`, `dictHas`, `dictDelete`, `dictKeys`, `dictValues`, `dictEntries`. Built on a JS `Map` under the hood (via a small host shim).

**`aether-set`** — a hash set (`Set<T>`). `setNew`, `setAdd`, `setHas`, `setDelete`, `setUnion`, `setIntersect`, `setDifference`, `setSubset`.

**`aether-rb-tree`** — a red-black tree, the canonical balanced BST. `insert`, `delete`, `find`, `range`, `min`, `max`. ~400 LOC of Aether.

**`aether-tree`** — a generic N-ary tree with `treeNew`, `treeAddChild`, `treeBfs`, `treeDfs`, `treeFlatten`. Useful for ASTs, document outlines, etc.

**`aether-graph`** — a directed graph: `graphNew`, `graphAddNode`, `graphAddEdge`, `graphBfs`, `graphDfs`, `graphShortestPath`, `graphTopoSort`, `graphMst`.

**`aether-heap-extra`** — extra heap operations beyond the stdlib's `heapNew`/`heapPush`/`heapPop`: `heapMerge`, `heapReplace`, `heapUpdateKey`, `heapSort`. Useful for priority-queue-heavy algorithms.

**`aether-lru`** — an LRU cache. `lruNew(capacity)`, `lruGet(key)`, `lruPut(key, value)`, `lruLen`. O(1) lookups via a map + doubly-linked list.

**`aether-state-machine`** — a finite state machine: `fsmNew(states, transitions)`, `fsmStart(initial)`, `fsmSend(event)`, `fsmCurrent()`. Useful for protocol implementations and UI flows.

### Strings

**`aether-string`** — 30 string primitives: `split`, `join`, `trim`, `replace`, `replaceAll`, `startsWith`, `endsWith`, `contains`, `indexOf`, `slice`, `padLeft`, `padRight`, `center`, `repeat`, `reverse`, `toUpper`, `toLower`, `capitalize`, `camelCase`, `snake_case`, `kebabCase`, `titleCase`, `words`, `lines`, `unlines`, `unwords`, `levenshtein`, `hamming`. The reference string library.

**`aether-text`** — prose-level utilities: `lines`, `words`, `unlines`, `unwords`, `indent`, `dedent`, `wrap`, `center`, `left`, `right`, `titleCase`, `camelCase`, `snake_case`, `kebabCase`, `truncate`, `wordCount`, `charCount`. 17 functions for formatting paragraphs.

### Parsing

**`aether-parser`** — a parser-combinator library: `parserChar`, `parserString`, `parserMany`, `parserOr`, `parserSepBy`, `parserRun`, etc. Useful for writing small parsers (CSV, INI, custom formats).

**`aether-regex`** — a regex engine: `regex(pattern)`, `match(re, s)`, `matchAll(re, s)`, `replace(re, s, repl)`. The full regex syntax (with `?`, `+`, `*`, `\d`, `\w`, character classes, anchors). Aether's own regex is a port of the Russ Cox NFA algorithm.

**`aether-json`** — `jsonParse(s)`, `jsonStringify(v)`, `jsonPretty(v)`. The JSON parser is a hand-written recursive descent; the serializer handles ints, floats, strings, arrays, maps, null, true, false.

**`aether-diff`** — line-level diffing: `diff(a, b)`, `diffLines(a, b)`, `diffChars(a, b)`. Myers algorithm. Useful for version-control UIs and test failure reporting.

### Encoding

**`aether-base64`** — `base64Encode(bytes)`, `base64Decode(s)`. RFC 4648 standard.

**`aether-base64-extra`** — URL-safe base64, padding-stripped base64, base64 with custom alphabets.

**`aether-uuid`** — `uuid1()`, `uuid3()`, `uuid4()`, `uuid5()`, `uuidParse(s)`, `uuidStringify(b)`, `uuidCompare(a, b)`. All five RFC 4122 UUID variants.

### Math

**`aether-math`** — 30 math functions: `gcd`, `lcm`, `factorial`, `isPrime`, `primesUpTo`, `fib`, `pow`, `modPow`, `exp`, `log`, `sqrt_`, `cbrt`, `sin`, `cos`, `tan`, `atan`, `atan2`, `floor`, `ceil`, `round`, `trunc`, `clamp`, `lerp`, `sign`, `abs_`, `min_`, `max_`, `sum_`, `mean`, `deg`, `rad`.

**`aether-matrix`** — `matrixFromRows`, `matrixZero`, `matrixIdentity`, `matrixMul`, `matrixTranspose`, `matrixDeterminant2`, `matrixDeterminant3`, `matrixTrace`, `matrixMap`. 2D matrices as `[[float]]`.

### Functional

**`aether-functional`** — combinators: `compose`, `pipe`, `partial`, `curry`, `uncurry`, `flip`, `identity`, `constant`, `memoize`, `once`, `try_`, `when`, `unless`. 25 functions for higher-order programming.

**`aether-iterator`** — lazy iterators: `iterate`, `take`, `drop`, `takeWhile`, `dropWhile`, `map`, `filter`, `scan`, `cycle`, `repeat`, `unfold`, `window`. 25 functions on `Iterator<T>`.

**`aether-validate`** — predicates: `isEmail`, `isUrl`, `isIpv4`, `isUuid`, `isDate`, `isAlpha`, `isNumeric`, `isAlnum`, `isLower`, `isUpper`, `isInRange`, `isOneOf`, `isNonEmpty`, `isLength`, `matches`. 15 validators for input validation.

### Sort

**`aether-sort`** — 10 sort algorithms: `sortQuick`, `sortMerge`, `sortHeap`, `sortInsertion`, `sortSelection`, `sortBubble`, `sortCocktail`, `sortComb`, `sortShell`, `sortRadix`, `sortCounting`, `sortBucket`, `sortGnome`, `sortStable`. Useful for benchmarks and teaching.

### Result

**`aether-result`** — the `Result<T, E>` type and combinators: `Ok`, `Err`, `isOk`, `map`, `mapErr`, `andThen`, `orElse`, `unwrap`, `unwrapOr`. The canonical error-handling type.

### Logging

**`aether-logging`** — structured logging: `new`, `silent`, `verbose`, `log`, `debug`, `info`, `warn`, `error`, `withContext`, `format`. 10 functions for leveled, contextual logging.

### Datetime

**`aether-datetime`** — UTC-based datetime: `now`, `today`, `year`, `month`, `day`, `hour`, `minute`, `second`, `dayOfWeek`, `addDays`, `addHours`, `addMinutes`, `diffSeconds`, `diffDays`, `isLeapYear`, `daysInMonth`, `toISO`, `fromISO`. 18 functions. Calendar math via Howard Hinnant's algorithm.

### FS

**`aether-fs`** — file system interface: `readFile`, `writeFile`, `fileExists`, `listDir` (stub), `pathJoin`, `pathSplit`, `pathExt`, `pathBase`, `pathDir`, `pathNormalize`. 10 functions; IO is host-bound, path ops are pure Aether.

### Process

**`aether-process`** — process interface: `argv`, `env`, `exit`, `cwd` (stub), `pid` (stub), `spawn` (stub), `sleep`, `time`, `now`. 8 functions. Stubs panic with clear messages.

---

## 17.4 The package registry vision

Currently, `import { foo } from "aether-string"` resolves to `./aether-packages/aether-string/src/lib.ae` — a relative path. This is fine for monorepos and for the playground (which ships all 25 packages) but not for distributed development: a project that depends on `aether-string` needs to either (a) copy the package into its tree, or (b) have the package at a known absolute path.

The v3.2 package registry (RFC-012) addresses this. The plan:

1. **A registry server** (`registry.aether-lang.org`) hosts packages by `name@version`.
2. **A package client** (`aether install aether-string@0.1.0`) downloads and caches packages locally.
3. **The module loader** resolves `import { foo } from "aether-string"` to the cached version, with version constraints from the project's `aether.toml`.
4. **A lockfile** (`aether.lock`) pins the exact versions, for reproducible builds.

The registry protocol is on the v3.2 roadmap. For v3, the relative-path resolution is the documented model.

---

## 17.5 The package browser in the playground

The playground has a "Packages" view (`/src/components/playground/views/packages-view.tsx`) that lists all 25 packages with their description, function count, and a "Run example" button. The view is sourced from the `aether.toml` manifests of each package (the playground scans `aether-packages/` at build time).

### Example 3: the package browser's view model

```ts
type PackageView = {
  name: string;
  version: string;
  description: string;
  functionCount: number;
  exampleSource: string;
};
```

The `exampleSource` is the content of `examples/example.ae`. Clicking "Run example" runs the example via the playground's compile-and-run pipeline.

---

## 17.6 Building a new package — end-to-end example

### Example 4: scaffold a new package

```bash
$ mkdir -p aether-packages/aether-stats/src
$ mkdir -p aether-packages/aether-stats/tests
$ mkdir -p aether-packages/aether-stats/examples
```

### Example 5: the manifest

```toml
# aether-packages/aether-stats/aether.toml
[package]
name = "aether-stats"
version = "0.1.0"
description = "Statistical functions for Aether — mean, median, variance, stdDev."
edition = "v3"

[dependencies]

[exports]
```

### Example 6: the library

```aether
// aether-packages/aether-stats/src/lib.ae
pub fn mean(xs: [float]) -> float {
  let mut sum = 0.0;
  let mut i = 0;
  while i < len(xs) {
    sum = sum + xs[i];
    i = i + 1;
  }
  sum / float(len(xs))
}

pub fn variance(xs: [float]) -> float {
  let m = mean(xs);
  let mut sum = 0.0;
  let mut i = 0;
  while i < len(xs) {
    let d = xs[i] - m;
    sum = sum + d * d;
    i = i + 1;
  }
  sum / float(len(xs))
}

pub fn stdDev(xs: [float]) -> float {
  sqrt(variance(xs))
}
```

### Example 7: the tests

```aether
// aether-packages/aether-stats/tests/tests.ae
import { mean, variance, stdDev } from "../src/lib.ae";

assert_eq(mean([1.0, 2.0, 3.0, 4.0, 5.0]), 3.0);
assert_eq(variance([1.0, 2.0, 3.0, 4.0, 5.0]), 2.0);
assert_eq(stdDev([1.0, 2.0, 3.0, 4.0, 5.0]), 1.4142135623730951);

print("aether-stats: all assertions passed");
```

### Example 8: the example

```aether
// aether-packages/aether-stats/examples/example.ae
import { mean, variance, stdDev } from "../src/lib.ae";

let xs = [1.0, 2.0, 3.0, 4.0, 5.0];
print("mean: " + str(mean(xs)));
print("variance: " + str(variance(xs)));
print("stdDev: " + str(stdDev(xs)));
```

### Example 9: run the tests

```bash
$ aether test aether-packages/aether-stats/tests
# PASS aether-packages/aether-stats/tests/tests.ae
# 1 passed, 0 failed
```

### Example 10: use the package from a project

```aether
// my-project/main.ae
import { mean, stdDev } from "aether-stats";

let xs = [60.0, 65.0, 70.0, 75.0, 80.0];
print("mean: " + str(mean(xs)));        // 70.0
print("stdDev: " + str(stdDev(xs)));   // ~7.07
```

The module loader resolves `"aether-stats"` to `./aether-packages/aether-stats/src/lib.ae`, runs the library module to collect `pub fn`s, and wires them into the project's environment. The whole project is 5 lines plus the imports.

---

## 17.7 Conventions for package authors

- **Pure Aether where possible.** Avoid host calls; build on the core builtins. Packages that *must* call the host (e.g., `aether-fs` for `readFile`) use the `_host_X.ae` helper-module pattern to capture same-named builtins without shadowing.
- **`while` + `push`, not `for in`.** Aether's v1/v2 evaluator has a for-loop-scope quirk that breaks some `for in` loops. Packages use `while` with explicit indices to avoid it.
- **20+ assertions in tests.** Each package's `tests/tests.ae` has at least 20 `assert_eq` calls covering every `pub fn`, including edge cases.
- **800-word README.** Each package's README has an intro, an API table, a "How to use" section, "Design notes," and "Future work." The README is the primary documentation.
- **An example.** Each package has `examples/example.ae` that exercises every `pub fn` with a small input.

---

## 17.8 Summary

- **25 packages** in v3 cover collections, strings, parsing, encoding, math, functional, sort, result, logging, datetime, FS, and process.
- **`aether.toml`** is the manifest format: name, version, description, edition, dependencies, exports.
- **Using a package** is `import { foo } from "package-name"`; the module loader resolves to `./aether-packages/package-name/src/lib.ae`.
- **The package registry** (RFC-012, v3.2) will host packages by `name@version`, with a client (`aether install`) and a lockfile (`aether.lock`).
- **The package browser** in the playground shows all 25 packages with descriptions, function counts, and runnable examples.
- **Conventions**: pure Aether, `while` + `push` (not `for in`), 20+ tests, 800-word README, an example.

The next chapter (Chapter 18) covers the formal semantics — the operational semantics, type safety, the bytecode verifier, and the 10 proof outlines that underpin the v3 design.
