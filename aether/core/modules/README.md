# Aether Module System — `aether/core/modules`

> A REAL file-based module resolver + loader for multi-file Aether programs.
> Maps RFC-003's `import { foo } from "./mod.ae";` syntax to actual files on
> disk, parses + compiles + runs each module in topological order, and wires
> the imports so an entry file can call functions defined in another file.

## 1. What this is

`aether/core/modules/modules.ts` is the v2 module system: it lets an Aether
program split its code across multiple files, import public bindings from
other files, and reuse libraries. The implementation is host-side TypeScript
(no parser changes); it extracts imports via regex, strips them before
passing source to the existing parser, and shares values via the evaluator's
`RunOptions.env`.

The system supports:

- `import { foo, bar } from "./mod.ae";` — RFC-003-style named imports.
- `import { foo as alias } from "./mod.ae";` — aliased imports.
- `import "./mod.ae";` — whole-module import (for side effects; no names bound).
- `pub fn name(...) { ... }` — public function exports (parser sets
  `exported: true` on `FnDecl`).
- `pub const NAME = expr;` — public constant exports (we transform to
  `const NAME = expr;` for the parser and record `NAME` for export collection).
- `pub use { a, b } from "./mod.ae";` — re-export listed names.
- `pub use name from "./mod.ae";` — re-export a single name.
- `pub use * from "./mod.ae";` — wildcard re-export (all of the dep's exports).
- Relative path resolution (`./`, `../`, `../../../`) with `.ae` extension
  auto-appended.
- Absolute paths.
- Cycle detection with the cycle path in the error message.
- Diamond dependencies (each module loaded once, cached by absolute path).
- Library modules' stdout suppressed by default (only the entry's prints
  reach `runModule`'s output).

## 2. Why regex preprocessing (and not parser changes)

The existing lexer recognizes `import`, `pub`, and `use` as keywords. The
parser:

- Handles `import "path" { names };` (path first, names after, **no `from`
  keyword**) — the v1 form. This is what RFC-003 calls the "deprecated
  string-literal form".
- Handles `pub fn name(...)` — sets `exported: true` on the `FnDecl` AST node.
- Does NOT handle `import { names } from "path";` (the RFC-003 form the
  verification example uses).
- Does NOT handle the `use` keyword (parseStmt falls through to
  parseExprOrAssignStmt, which throws because `use` is a keyword, not an
  identifier).
- Does NOT handle `pub const`, `pub use`, or any `pub` other than `pub fn`.

RFC-003 explicitly allows the source-preprocessing approach for v2:

> Note: the lexer/parser already parse import and pub (check — if not, the
> module system works at the source-preprocessing level: extract imports via
> regex, compile each file, share exports).

We take that route. The advantages:

- **No parser regression risk.** The v1 parser has 800+ tests; touching it
  for RFC-003 syntax would risk breaking existing programs. Regex
  preprocessing doesn't touch the parser at all.
- **Smaller blast radius.** The module system is a new file; the parser is
  the most-tested file in the codebase.
- **Forward compatibility.** When the parser eventually supports `from`
  and `use` natively, the regex layer can be removed without changing the
  `ModuleGraph` public API.

The disadvantage is that we don't get parse-error diagnostics for imports
(e.g. "expected `from`, found `path`"). The regex silently ignores
malformed imports. For v1, that's acceptable — the error message
`does not export 'name'` is what users will see, which is informative
enough.

## 3. Resolution algorithm

Given `import { greet } from "./utils.ae";` in `/tmp/modtest/main.ae`:

1. Read the file at `/tmp/modtest/main.ae`.
2. Extract imports via regex: `[{ localName: "greet", remoteName: "greet" }]`
   with `path = "./utils.ae"`.
3. Strip imports from the source.
4. For each import:
   a. Resolve `./utils.ae` against the importer's directory:
      `path.resolve("/tmp/modtest", "./utils.ae")` → `/tmp/modtest/utils.ae`.
      Append `.ae` if missing.
   b. Recursively load `/tmp/modtest/utils.ae`:
      - Preprocess its source (extract its imports, strip, etc.).
      - Build a fresh env.
      - Pre-populate env with its own imports' values.
      - `compile(cleanedSource, { env })`.
      - Scan the AST for `pub fn name` (with `exported === true`) and look up
        the closure in env; add to `mod.exports`.
      - Scan pub const specs (extracted via regex) and look up the value in
        env; add to `mod.exports`.
      - Scan pub use specs and apply re-exports from the named dep.
      - Cache the Module.
   c. Wire each imported name into the importer's env:
      `env.vars.set(localName, { value: dep.exports.get(remoteName), mut: false })`.
5. Compile + run the importer's cleaned source with the populated env.
6. Collect the importer's exports (same as step 4b's scan).
7. Cache the Module.

For `runModule(entryPath)`:

- Resolve the entry to an absolute path.
- `graph.load(entry, { stdout }, true)` — `isEntry = true` means use the
  caller's stdout for the entry's prints; library modules (loaded via
  recursive `load` calls with `isEntry = false`) get stdout suppressed.
- Return `{ output, error? }`.

### 3.1 Path resolution

`resolveImport(importPath, fromFile)`:

- `./mod.ae` and `../mod.ae` resolve against the importer's directory via
  `path.resolve(path.dirname(fromFile), importPath)`.
- Absolute paths (`/abs/path/mod.ae`) are used as-is.
- Bare names like `aether.http.server` (no `./`, no `..`, not absolute)
  throw — the RFC-003 registry protocol is a v2.1 item.
- `.ae` is appended if missing.
- Throws if the resolved file doesn't exist on disk.

### 3.2 Visibility

- `pub fn name(...)` → exported. The parser sets `exported: true` on the
  FnDecl; we read this flag from the AST after running.
- `pub const NAME = expr;` → exported. We strip the `pub` keyword (transform
  to `const NAME = expr;`), let the parser handle it, then look up the value
  in env after running.
- `pub use { a, b } from "./mod.ae";` → re-export. We collect `a, b` from
  `mod.ae`'s exports and add them to this module's exports under the same
  names.
- `pub use name from "./mod.ae";` → re-export a single name.
- `pub use * from "./mod.ae";` → wildcard re-export. We copy ALL of
  `mod.ae`'s exports into this module's exports.
- Non-`pub` items are private. They're in the module's env (so the module
  itself can use them) but not in `mod.exports` (so importers can't see
  them). Importing a non-`pub` name fails with
  `module 'X' does not export 'name'`.

### 3.3 Cycles

RFC-003 says cycles are allowed (each module is initialized once;
subsequent imports see the partially-initialized module). The task spec
for this v1 prototype says to **throw** with the cycle path, which is what
we do:

```sh
$ bun -e "import { runModule } from './modules'; console.log(runModule('tests/modules/cyclic_a.ae'))"
{ output: [], error: 'circular dependency: .../cyclic_a.ae -> .../cyclic_b.ae -> .../cyclic_a.ae' }
```

Cycle detection works by tracking the active loading chain in
`ModuleGraph.stack`: a path is a cycle if it's already on the stack when
we try to load it. The error message includes the full chain so the user
can see exactly which modules form the cycle.

The v2 design will revisit partial-initialization semantics (RFC-003 §
"Module resolution algorithm": "Cycles are allowed (two modules that
import each other) but each module is initialized once (the first import
wins; subsequent imports see the partially-initialized module)").

### 3.4 Diamond dependencies

If A imports B and C, and both B and C import D, the diamond is fine:
D is loaded once (cached by absolute path), and both B and C see the same
Module instance. The fixture `tests/modules/diamond_*.ae` demonstrates this.

### 3.5 Stdout suppression

Library modules (anything loaded via a recursive `load` call from another
module) get their stdout suppressed by default — only the entry's prints
reach `runModule`'s output. This matches production behavior (libraries
shouldn't print) and avoids confusing output when a library has init code.

To disable suppression (e.g. for debugging a library's init), pass
`{ suppressLibraryStdout: false }`. The fixture
`tests/modules/side_effect_*.ae` demonstrates this — the library
`side_effect.ae` prints "library loaded", but
`runModule('side_effect_main.ae').output` is just `["42"]` (the entry's
print of `lib_fn()`).

## 4. Public API

```ts
export interface Module {
  name: string;        // absolute path (v2 will use dotted module paths)
  path: string;        // absolute file path
  source: string;      // original source (before stripping)
  exports: Map<string, Value>;  // public bindings
}

export class ModuleGraph {
  resolveImport(importPath: string, fromFile: string): string;
  load(absPath: string, opts?: ModuleRunOptions, isEntry?: boolean): Module;
  resolveAll(entry: string, opts?: ModuleRunOptions): Module[];  // topo order
  error?: string;
}

export function runModule(
  entryPath: string,
  opts?: ModuleRunOptions,
): { output: string[]; error?: string };
```

Plus the preprocessing helpers (exposed for tests):

```ts
export function extractImports(source: string): ParsedImport[];
export function extractPubUses(source: string): PubUseSpec[];
export function extractPubConsts(source: string): PubConstSpec[];
export function preprocess(source: string): PreprocessedSource;
export function stripImports(source: string): string;
export function stripPubUses(source: string): string;
export function stripPubConst(source: string): string;
```

## 5. Usage

### 5.1 Single-file program (v1 backward compat)

```aether
// main.ae
pub fn double(n: int) -> int { n * 2 }
print(double(21));
```

```sh
$ bun -e "import { runModule } from './modules'; console.log(runModule('main.ae'))"
{ output: ["42"] }
```

### 5.2 Two-file program (the verification example)

```aether
// utils.ae
pub fn greet(name: string) -> string { "Hello, " + name + "!" }
```

```aether
// main.ae
import { greet } from "./utils.ae";
print(greet("Aether"));
```

```sh
$ bun -e "import { runModule } from './modules'; console.log(runModule('main.ae'))"
{ output: ["Hello, Aether!"] }
```

### 5.3 Multiple imports + aliasing

```aether
import { greet as hello, goodbye as bye } from "./utils.ae";
print(hello("X"));
print(bye("Y"));
```

### 5.4 Re-export

```aether
// reexport.ae
pub use { greet } from "./utils.ae";
```

```aether
// main.ae
import { greet } from "./reexport.ae";
print(greet("Reexported"));
```

### 5.5 Wildcard re-export

```aether
// reexport_wildcard.ae
pub use * from "./utils.ae";
```

```aether
// main.ae
import { greet, goodbye } from "./reexport_wildcard.ae";
print(greet("W1"));
print(goodbye("W2"));
```

### 5.6 Pub const

```aether
// constants.ae
pub const PI = 3;
pub const GREETING = "hello";
const HIDDEN = 42;  // not exported
```

```aether
// main.ae
import { PI, GREETING } from "./constants.ae";
print(PI);
print(GREETING);
```

### 5.7 Diamond dependency

```aether
// base.ae
pub fn base() -> int { 100 }

// left.ae
import { base } from "./base.ae";
pub fn a() -> int { base() + 1 }

// right.ae
import { base } from "./base.ae";
pub fn b() -> int { base() + 2 }

// main.ae
import { a } from "./left.ae";
import { b } from "./right.ae";
print(a() + b());  // (100+1) + (100+2) = 203
```

## 6. Error messages

| Situation                                | Error message                                                          |
|------------------------------------------|------------------------------------------------------------------------|
| Entry file doesn't exist                 | `entry file not found: '/path/to/main.ae'`                             |
| Imported file doesn't exist              | `module not found: './mod.ae' (resolved to '/abs/mod.ae')`             |
| Bare name (no `./`, `..`, or `/`)       | `module not found: 'aether.http.server' (only relative paths ...)`     |
| Importing a non-exported name           | `module '/abs/utils.ae' does not export 'nonexistent'`                |
| Importing a private (non-pub) function   | `module '/abs/utils.ae' does not export 'private_fn'`                  |
| Circular dependency                       | `circular dependency: /a.ae -> /b.ae -> /a.ae`                        |
| Runtime panic in a module                | `runtime error in '/abs/mod.ae': kaboom`                               |
| Parse error in a module                  | `parse error in '/abs/mod.ae': expected ')', found ';' at 4:20`         |

## 7. How it maps to RFC-003

RFC-003 specifies the full v2 vision: dotted module paths
(`aether.http.server`), the registry protocol, `aether.toml` manifests,
`aether install` / `aether build` / `aether run`. This v1 prototype
implements the subset that doesn't require a registry:

| RFC-003 surface                     | This v1 prototype              | Status                               |
|-------------------------------------|--------------------------------|--------------------------------------|
| `import { a, b } from "./mod.ae";`  | ✅ Supported                   | Named imports + aliasing.            |
| `import { a as b } from "mod";`     | ✅ Supported                   | Aliased imports.                     |
| `import "mod";` (whole-module)      | ✅ Supported                   | No names bound; dep loads for side effects. |
| `import aether.http.server;`        | ❌ Throws                     | Registry is v2.1.                   |
| `pub fn`                            | ✅ Supported                   | Parser sets `exported = true`.       |
| `pub const`                         | ✅ Supported (regex)            | Transformed to `const`; recorded for export. |
| `pub use { a, b } from "mod";`      | ✅ Supported (regex)            | Re-export.                          |
| `pub use name from "mod";`          | ✅ Supported (regex)            | Single re-export.                   |
| `pub use * from "mod";`             | ✅ Supported (regex)            | Wildcard re-export.                 |
| `module myapp.utils.list;`          | ❌ Not supported              | Module declaration; v2 follow-up.   |
| `aether.toml` manifest              | ❌ Not supported              | Package manager; v2.1 follow-up.     |
| `aether install` / `aether build`    | ❌ Not supported              | Package manager; v2.1 follow-up.     |
| Relative paths (`./`, `../`)        | ✅ Supported                   | Path resolution via `path.resolve`. |
| Absolute paths                      | ✅ Supported                   | Pass-through.                       |
| Cycles (allowed in RFC)             | ❌ Throws (per task spec)      | v2 will revisit partial-init.       |
| Diamond dependencies                 | ✅ Supported                   | Cached by absolute path.            |
| Library stdout suppression           | ✅ Supported                   | Only the entry's prints reach output. |

The plan for v2.1+:

1. **Registry protocol.** `import aether.http.server;` resolves via the
   algorithm in RFC-003 § "Module resolution algorithm": local file →
   `aether_modules/aether/http/server.ae` → named package
   `aether_modules/aether-http/aether/http/server.ae`. Out of scope for
   this prototype.
2. **`aether.toml` manifests.** The manifest declares the package name,
   version, edition, and dependencies. The CLI's `aether new` command (in
   `aether/tools/cli/cli.ts`) scaffolds a stub `aether.toml` for new
   projects, but the loader doesn't read it yet — it just resolves
   relative paths.
3. **Cycles with partial initialization.** Return a partially-initialized
   Module when a cycle is detected, instead of throwing. The first import
   wins; subsequent imports see whatever was in `mod.exports` at the time
   of the cycle. This is the RFC-003 behavior. The task spec for v1 chose
   to throw instead (clearer error for the common case of accidental
   cycles). The v2 design will revisit.
4. **Native parser support for `from`.** Replace the regex preprocessing
   with parser support for `import { names } from "path";` syntax. Smaller
   win than it sounds — the regex approach works correctly; the parser
   change is mostly about better error messages.

## 8. Testing

`modules.test.ts` has 57 tests covering:

- `extractImports` (regex): basic, aliased, multiple, bare, whitespace,
  commented-out (accidentally JS-aware via `^[ \t]*` anchor), stripping.
- `extractPubUses`: list, single, wildcard, stripping.
- `extractPubConsts`: extraction, non-pub ignored, downgrade.
- `preprocess` (combined): all features together.
- `ModuleGraph.resolveImport`: relative, `../`, deep `../../../`, `.ae`
  auto-append, missing file, bare-name rejection, absolute.
- `ModuleGraph.load`: single-file, utils.ae exports, caching, closure
  shape.
- `runModule` end-to-end: main, multi, alias, nested, deep, no-extension,
  no-imports, side-effect suppression, suppressLibraryStdout=false.
- Error handling: missing import, missing export, private violation,
  runtime panic, parse error, missing entry.
- Cycles: two-node, three-node chain.
- Pub const: export + import, hidden const.
- Re-exports: list, wildcard, module exports include re-exported names.
- Diamond dependency: correct sum, topo order.
- Output capture: custom stdout sink, multi-print ordering.
- Closure semantics: lexical capture (imported closure retains its own
  module's env).
- `resolveAll`: topo order, cycle throws.

Run with:

```
bunx vitest run aether/core/modules
```

The test fixtures live in `tests/modules/` (28 `.ae` files):
`main.ae`, `utils.ae`, `multi_main.ae`, `multi_alias.ae`, `cyclic_a.ae`,
`cyclic_b.ae`, `missing_import.ae`, `missing_export.ae`,
`private_violation.ae`, `use_pub_const.ae`, `import_pub_const.ae`,
`reexport.ae`, `reexport_main.ae`, `reexport_wildcard.ae`,
`reexport_wildcard_main.ae`, `nested/main.ae`, `deep/a/b/main.ae`,
`no_extension_main.ae`, `side_effect.ae`, `side_effect_main.ae`,
`recursive.ae`, `recursive_chain.ae`, `no_imports.ae`, `runtime_error.ae`,
`runtime_error_main.ae`, `syntax_error.ae`, `diamond_top.ae`,
`diamond_left.ae`, `diamond_right.ae`, `diamond_base.ae`.

## 9. Relationship to the v1 single-file model

A v1 program (no `import`, no `pub`, no `use`) runs identically under this
module system. `runModule('no_imports.ae')` is equivalent to
`compileAndRun(source)` — same output, same runtime semantics. The v1
playground uses the `compileAndRun` path; the v2 CLI's `aether run` uses
`runModule` (which handles both single-file and multi-file).

This is the RFC-003 § "Relationship to v1's single-file model" guarantee:

> A v1 program (no `import`, no `aether.toml`) runs identically under v2.
> The v2 compiler recognizes the absence of imports and treats the file as
> a "module of one file, no package" — the simplest case.

## 10. Cross-references

- `docs/rfcs/rfc-003-modules-and-packages.md` — the design RFC (paths,
  imports, pub, packages, registry).
- `docs/decisions/adr-05-no-modules-in-v1.md` — the v1 decision (single-file).
- `aether/core/index.ts` — `compile` (lex + parse + check + run) is the
  per-module entry point.
- `aether/core/eval/eval.ts` — the tree-walker; `RunOptions.env` is how we
  inject imported bindings into a module's scope.
- `aether/core/parser/parser.ts` — handles `pub fn` (sets `exported`) and
  `import "path" { names };` (the v1 string form).
- `aether/core/lexer/lexer.ts` — recognizes `import`, `pub`, `use` as
  keywords.
- `aether/tools/cli/cli.ts` — the `aether run` CLI command uses
  `runModule` to support multi-file programs.
