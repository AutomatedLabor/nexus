# ADR-14 — Regex preprocessing for imports

> Status: Accepted
> Date: 2024-04-15
> Decision-maker: Aether core team
> Supersedes: none
> Superseded by: (none yet; v2.1 will move imports into the parser — see [RFC-003](../rfcs/rfc-003-modules-and-packages.md))
> Related: [RFC-003](../rfcs/rfc-003-modules-and-packages.md), [ADR-05](adr-05-no-modules-in-v1.md)

## Context

Aether v2 introduces a real module system (Chapter 11). The syntax is RFC-003's:

```aether
import { greet, farewell } from "./utils.ae";
pub fn greet(name: string) -> () { print(f"Hello, {name}!"); }
pub const VERSION: string = "1.0.0";
pub use { greet } from "./utils.ae";
```

The architectural question: **how does the parser handle the new `import { ... } from "...";` syntax?**

The parser (`aether/core/parser/parser.ts`) was written for v1, where:
- The lexer recognizes `import`, `pub`, and `use` as keywords.
- The parser handles `import "path";` (path first, no `from`, no names — a v1 no-op form).
- The parser handles `pub fn name(...)` (sets `exported: true` on the FnDecl).
- The parser does *not* handle `import { names } from "path";`, `pub const`, `pub use`, or `as` aliasing.

The options for v2's module system:

### Option A: Extend the parser

Add the RFC-003 import syntax to the parser. Touch the lexer (no change — keywords exist), the parser (add `parseImport`, extend `parsePub`, add `parseUse`), the AST (new `ImportDecl`, `UseDecl` nodes), and the module loader (consume the new AST nodes).

### Option B: Regex preprocessing

Don't change the parser. The module loader (`aether/core/modules/modules.ts`) extracts imports with a regex *before* parsing, strips them from the source, and passes the stripped source to the existing parser. After parsing and running, the loader collects the `pub` bindings as exports and wires the imports via the evaluator's `RunOptions.env`.

## Constraints on the decision

- **Implementation cost.** The parser is ~2k lines; a careful extension is ~500 lines. The regex approach is ~50 lines for the regexes plus ~200 for the loader changes.
- **Risk of regression.** The parser is the most-touched file in the codebase. A parser bug breaks every program; a regex bug breaks only the module system.
- **Future flexibility.** RFC-003's import syntax may evolve (e.g., `import type { ... }` for type-only imports, `import * as ns from "..."` for namespace imports). A regex change is small; a parser change is bigger.
- **Error messages.** The parser can give precise error messages for malformed imports (with `line:col`). A regex can only say "no match" or "match but malformed" — less precise.
- **v2.1 plan.** The module system will eventually have its own parser support (Option A), but we want v2 to ship first.

## Options considered in detail

### Option A: Extend the parser (rejected for v2)

**Pros:**

- Precise error messages with `line:col`.
- Future-proof — adding more syntax is just another parser case.
- The AST has explicit nodes for imports/exports; tooling (LSP, docgen) can use them.
- The linter can lint import statements (e.g., "unused import").

**Cons:**

- Implementation cost: ~500 lines of parser changes, plus AST additions, plus the module loader consuming the new nodes.
- Risk of regression: the parser is critical; any bug breaks every program.
- The v1 syntax (`import "path";` no-op) has to coexist with the v2 syntax; the parser has to handle both.

### Option B: Regex preprocessing (chosen for v2)

**Pros:**

- Implementation cost: ~50 lines of regex plus ~200 of loader changes.
- The parser is untouched; zero regression risk.
- Future flexibility: changing the regex is small.
- The v1 syntax (`import "path";` no-op) is unaffected — the regex doesn't touch it.

**Cons:**

- Error messages are less precise ("regex didn't match" vs "expected '}' at line 5:10").
- The AST has no nodes for imports — tooling has to look at the raw source.
- The linter can't lint import statements (it sees the stripped source).
- `as` aliasing is supported in the regex but not in the parser (the loader handles the rename).

### Option C: Use a separate "module-system parser" that runs alongside the main parser

A smaller parser that only handles imports, exports, and `use`. The main parser is unchanged.

**Pros:**

- The main parser is untouched.
- The module-system parser can be precise (with `line:col` error messages).

**Cons:**

- Two parsers to maintain.
- The "module-system parser" still has to coexist with the main parser's tokens.
- Implementation cost is somewhere between A and B.

## Decision

**Aether v2 uses Option B: regex preprocessing for imports.**

The module loader (`aether/core/modules/modules.ts`):

1. Reads the source.
2. Extracts imports with a regex: `^\s*import\s+\{([^}]+)\}\s+from\s+"([^"]+)"\s*;?` (and similar for `pub use`).
3. Strips the matched imports from the source.
4. Passes the stripped source to the existing parser.
5. Compiles and runs the parsed AST via the existing v1 compiler.
6. Collects the `pub` bindings as exports (parsing the original source for `pub fn`, `pub const`, `pub use` declarations).
7. Wires the imports: for each import, looks up the name in the imported module's exports, binds it in the current module's environment via `RunOptions.env`.

## Rationale

1. **Smaller blast radius.** The parser is critical; the regex is not. A regex bug breaks the module system; a parser bug breaks everything. We chose the lower-risk path for v2.

2. **Faster to ship.** ~250 lines vs ~700. The regex approach shipped in two days; the parser approach would have taken two weeks (parser changes + AST additions + loader changes + tests).

3. **Easier to revert.** If the RFC-003 import syntax changes, only the regex needs updating. If we'd extended the parser, the parser changes would have to be reverted too.

4. **Documented.** This ADR records the trade-off. v2.1 will revisit (Option A) when the import syntax has stabilized.

5. **The error-message cost is real.** A malformed import gets a "regex didn't match" error, not a precise "expected '}' at line 5:10". The fix is to write the import correctly (the RFC-003 form is unambiguous); the playground's error message is "import not recognized" with the line number (we can find the line via a regex match on the source).

## Consequences

- **The parser doesn't recognize RFC-003 imports.** `import { foo } from "./mod.ae";` parsed without the module loader would be a parse error (`expected string after import, found '{'`).
- **The module loader is the only way to use imports.** `aether run main.ae` (the CLI's `run` command) detects imports and uses the module loader. `compileAndRun(source)` (the API) doesn't — it's the v1 single-file entry point.
- **`pub fn` works in the parser.** `pub fn name(...)` is parsed as a regular `fn` with `exported: true`; the loader collects it as an export.
- **`pub const` is a regex transformation.** The loader transforms `pub const NAME = expr;` to `const NAME = expr;` (which the parser handles) and records `NAME` for export collection.
- **`pub use { ... } from ...` is a regex transformation.** The loader extracts the re-export list and collects the names from the imported module's exports.
- **`as` aliasing works in the regex.** `import { greet as hello } from "...";` — the regex captures the alias and the loader binds `hello` to the imported `greet` value.
- **Error messages are less precise.** A malformed import gets a "regex didn't match" message. The user has to look at the line and figure out the issue.

## What we rejected

- **Extending the parser (Option A)** — rejected for v2 because of regression risk and implementation cost. Will revisit in v2.1.
- **A separate module-system parser (Option C)** — rejected because two parsers is more complexity than one parser + one regex.

## What's next

- v2.1 will move imports into the parser natively. The RFC-003 syntax will be stable by then.
- The module loader is the source of truth for v2: `aether/core/modules/modules.ts`.
- The tests in `aether/core/modules/modules.test.ts` exercise the loader (multi-file programs, cycles, re-exports, private helpers, public constants).
- The `tests/modules/` directory has 30+ multi-file test cases for the module system.
