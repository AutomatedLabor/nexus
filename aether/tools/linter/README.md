# Aether Linter

A configurable static-analysis linter for the Aether language with **30 rules**
across four categories — correctness, style, performance, and complexity.

The linter parses the source with the canonical Aether parser and walks the
resulting AST, emitting diagnostics tagged with a rule name, severity, and
1-based source location (`line` and `col`).  Every rule is a pure function
`Program → RawDiagnostic[]`; rule behavior is deterministic and side-effect
free.  Each rule has a default severity that can be overridden per call, and
any rule can be silenced with `'off'`.

## Quick start

```ts
import { lint, DEFAULT_RULES } from "aether/tools/linter/linter";

const src = `
  let mut i = 0;
  while i < 10 { i = i + 1; }
`;
for (const d of lint(src)) {
  console.log(`${d.line}:${d.col} ${d.severity} ${d.rule}: ${d.message}`);
}
// 2:3 info prefer-range: while loop with counter 'i' — consider using
//    'for i in range(0, N)' for clarity

// Disable a rule
lint(src, { rules: { "prefer-range": "off" } });

// Promote a warning to an error
lint(src, { rules: { "no-shadow": "error" } });
```

`DEFAULT_RULES` is a `Record<string, Severity>` enumerating the 30 rules and
their default severities.  Use it to render documentation, build a config
file, or seed a CLI's `--warn`/`--error` flags.

## Public API

```ts
export type Severity = "error" | "warning" | "info";

export interface LintDiagnostic {
  rule: string;          // e.g. "no-shadow"
  severity: Severity;    // default severity OR the user override
  message: string;       // human-readable description
  line: number;          // 1-based source line
  col: number;          // 1-based source column
  loc: SourceLocation;  // full start/end span (kept for tooling)
  fix?: string;         // optional suggested fix as a string
}

export interface LintOptions {
  rules?: Record<string, Severity | "off">;
}

export function lint(source: string, opts?: LintOptions): LintDiagnostic[];
export function lintFile(path: string, opts?: LintOptions): LintDiagnostic[];
export const DEFAULT_RULES: Record<string, Severity>;
```

`line` and `col` are derived from `loc.start.line` and `loc.start.col`.  Both
are 1-based to match the rest of the Aether tooling (lexer/parser errors,
stack traces, the LSP).

## Categories

The 30 rules split evenly across four buckets:

| Category      | Count | Rules                                                                       |
|---------------|-------|-----------------------------------------------------------------------------|
| Correctness   | 10    | no-shadow, no-unused-var, no-unused-import, no-unreachable, no-empty-match, match-not-exhaustive, no-panic-in-fn, no-duplicate-def, no-compare-float-eq, no-mut-reassign |
| Style         | 10    | no-trailing-whitespace, no-mixed-indent, prefer-const, naming-snake, naming-pascal, naming-screaming, no-single-match, prefer-interpolation, no-deep-nesting, line-too-long |
| Performance   | 5     | no-string-concat-in-loop, no-array-growth-in-loop, prefer-range, no-recursive-fib, no-redundant-len-check |
| Complexity    | 5     | cognitive-complexity, too-many-params, too-many-arms, deep-pattern-nesting, long-function |

The default severities err on the side of "warn loudly about bugs, info about
style."  All rules are configurable; downstream tools are free to bump
`info` rules to `warning` or `error` in their config.

## Disabling rules

Per-call:

```ts
lint(src, { rules: { "no-shadow": "off", "line-too-long": "warning" } });
```

Per-line (planned, not yet implemented):

```ts
let x = 1; // aether-lint:ignore-next-line no-shadow
let x = 2;
```

In the meantime, the `_`-prefix convention is the idiomatic way to silence
`no-unused-var`: any binding starting with `_` is treated as intentionally
unused.

## Scope analysis

Several rules share a single scope walker (`analyzeScopes`) that records every
binding introduced by `let`, `let mut`, `const`, `fn`, function parameters,
`for`-loop variables, match-pattern bindings, and `import { ... }`.  Each
binding carries:

- `name` — the identifier
- `kind` — one of `let`, `mut`, `const`, `param`, `fn`, `loop-var`,
  `match-bind`, `type`, `enum`, `struct`, `import`
- `loc` — where the binding was introduced
- `used` — count of identifier references that resolve to this binding
- `reassigned` — count of `=`/`+=`/etc. assignments to this binding
- `mutable` — true iff declared with `mut`

Scope chains are tracked so that `no-shadow` can compare a binding against
its enclosing scope's bindings of the same name, and `no-unused-var` can
report only bindings that are truly never read in any nested scope.

A second pass, `detectShadowing`, walks the AST again with explicit scope
tracking to flag inner bindings that hide outer bindings of the same name.
(The first pass doesn't track shadowing because it's optimized for
read/write counting.)

## Rule reference

Every rule is documented with: what it catches, a good example, a bad
example, the default severity, and how to disable it.

### Correctness (10)

#### `no-shadow`
**Default:** `warning`
**Catches:** an inner `let` / `let mut` / `const` / `fn` / `param` / `for` /
`match`-binding with the same name as a binding in an enclosing scope.

```aether
// good
let x = 1;
fn f(y: int) { y + 1 }

// bad
let x = 1;
fn f() { let x = 2; x }       // the inner `x` shadows the outer `x`
```

**Disable:** `{ rules: { "no-shadow": "off" } }`

#### `no-unused-var`
**Default:** `warning`
**Catches:** a binding that is declared but never read anywhere in its
scope chain.  Names starting with `_` are exempt (intentionally unused).

```aether
// good
let x = 1; print(x);

// bad
let x = 1; print(2);

// also good (intentional)
let _unused = 1; print(2);
```

**Disable:** `{ rules: { "no-unused-var": "off" } }`

#### `no-unused-import`
**Default:** `warning`
**Catches:** a name imported via `import "m" { foo, bar };` that is never
referenced as an identifier, type, or enum variant in the rest of the file.
Bare imports (`import "m";` without a name list) are skipped.

```aether
// good
import "math" { sin };
print(sin(0.0));

// bad
import "math" { sin };
print(1);
```

**Disable:** `{ rules: { "no-unused-import": "off" } }`

#### `no-unreachable`
**Default:** `error`
**Catches:** any statement that follows a `return`, `break`, or `continue`
in the same block.  Such code can never execute and is almost always a
mistake (a leftover line after a refactor, a forgotten early-return).

```aether
// good
fn f() -> int {
  let x = 1;
  return x;
}

// bad
fn f() -> int {
  return 1;
  print(2);   // unreachable
}
```

**Disable:** `{ rules: { "no-unreachable": "off" } }`

#### `no-empty-match`
**Default:** `error`
**Catches:** a `match { }` expression with zero arms.  An empty match can
never produce a value; at best it's dead code, at worst it's a stub
forgotten before shipping.

```aether
// good
let x = match n { 1 => "a", _ => "b" };

// bad
let x = match n { };
```

**Disable:** `{ rules: { "no-empty-match": "off" } }`

#### `match-not-exhaustive`
**Default:** `warning`
**Catches:** a `match` with at least one arm but no `_` wildcard, no `..`
rest pattern, and no `BindPat` named `_`.  Aether doesn't (yet) do
exhaustiveness checking on enums, so this is the linter's heuristic stand-in:
without a catch-all, a future variant added to the enum will silently fall
through.

```aether
// good
let x = match n { 1 => "a", 2 => "b", _ => "?" };

// bad
let x = match n { 1 => "a", 2 => "b" };
```

**Disable:** `{ rules: { "match-not-exhaustive": "off" } }`

#### `no-panic-in-fn`
**Default:** `warning`
**Catches:** any call to the `panic` builtin.  `panic` aborts the program;
Aether's error story is `Result<T, E>` and `panic` should be reserved for
genuinely unrecoverable situations.  Calls to `panic` inside expression
position are also flagged.

```aether
// good
fn find(xs: [int], x: int) -> result<int, string> {
  // ... return Ok / Err
}

// bad
fn find(xs: [int], x: int) -> int {
  panic("not found");
}
```

**Disable:** `{ rules: { "no-panic-in-fn": "off" } }`

#### `no-duplicate-def`
**Default:** `error`
**Catches:** two top-level (or same-scope) declarations that introduce the
same name — e.g. two `fn`s with the same name, or a `const X` shadowed by
another `const X` in the same block.  Names in separate function scopes are
not flagged (those are caught by `no-shadow` instead).

```aether
// good
fn a() { 1 }
fn b() { 2 }

// bad
fn a() { 1 }
fn a() { 2 }     // duplicate

// bad
const X = 1;
const X = 2;     // duplicate
```

**Disable:** `{ rules: { "no-duplicate-def": "off" } }`

#### `no-compare-float-eq`
**Default:** `warning`
**Catches:** a `==` or `!=` comparison where at least one operand is a
`FloatLit`.  Direct float equality is fragile — `0.1 + 0.2 != 0.3` due to
rounding.  Use an epsilon tolerance instead: `abs(a - b) < EPS`.

```aether
// good
let eq = abs(a - b) < 1e-9;

// bad
let eq = a == 1.0;
let eq = 1.5 != 2.5;
```

**Disable:** `{ rules: { "no-compare-float-eq": "off" } }`

#### `no-mut-reassign`
**Default:** `error`
**Catches:** an assignment (`=`, `+=`, `-=`, etc.) to a binding declared
without `mut` — `let`, `const`, `for`-loop variable, `match` binding, or
function parameter.  Reassigning an immutable binding is a runtime error
in Aether; this rule catches it at lint time.

```aether
// good
let mut x = 1; x = 2;

// bad
let x = 1; x = 2;
const X = 1; X = 2;
```

**Disable:** `{ rules: { "no-mut-reassign": "off" } }`

### Style (10)

#### `no-trailing-whitespace`
**Default:** `info`
**Catches:** any line ending in space or tab characters.  Trailing
whitespace is invisible noise that bloats diffs and confuses some editors.
The formatter strips it on output, but the linter surfaces it for files
that haven't been formatted yet.

**Disable:** `{ rules: { "no-trailing-whitespace": "off" } }`

#### `no-mixed-indent`
**Default:** `warning`
**Catches:** a line whose leading indent contains both spaces and tabs.
Aether's formatter uses 2-space indent; mixed indent produces
inconsistent rendering across editors and breaks the formatter's
round-trip guarantee.

**Disable:** `{ rules: { "no-mixed-indent": "off" } }`

#### `prefer-const`
**Default:** `info`
**Catches:** a `let x = ...;` (without `mut`) that is never reassigned
anywhere in its scope.  By convention, immutable bindings should be
declared `const`; `let` is for cases where the binding will be mutated
(with `mut`) or is intentionally non-const for readability.

The spec's heuristic — "warn on all `let` not `mut`" — is implemented as
"warn on every `let` whose `reassigned` count is 0."  That's strictly
more accurate than warning on every `let`.

**Disable:** `{ rules: { "prefer-const": "off" } }`

#### `naming-snake`
**Default:** `warning`
**Catches:** a variable, function parameter, `for`-loop variable, match
binding, or function name that is not `snake_case`.  The regex is
`/^[a-z_][a-z0-9_]*$/`.  Names starting with `_` are exempt.

```aether
// good
let my_var = 1;
fn helper() { 1 }

// bad
let myVar = 1;
fn helperFn() { 1 }
```

**Disable:** `{ rules: { "naming-snake": "off" } }`

#### `naming-pascal`
**Default:** `warning`
**Catches:** a `struct`, `enum`, or `type` alias — and every `enum`
variant — that is not `PascalCase`.  The regex is
`/^[A-Z][A-Za-z0-9_]*$/`.

```aether
// good
struct Point { x: int, y: int }
enum Shape { Circle, Square(int) }

// bad
struct point { x: int, y: int }
enum Shape { circle, square }
```

**Disable:** `{ rules: { "naming-pascal": "off" } }`

#### `naming-screaming`
**Default:** `info`
**Catches:** a `const` whose name is not `SCREAMING_SNAKE_CASE`.  The
regex is `/^[A-Z][A-Z0-9_]*$/`.

```aether
// good
const MAX_SIZE = 100;
const PI = 3.14;

// bad
const maxSize = 100;
const Pi = 3.14;
```

**Disable:** `{ rules: { "naming-screaming": "off" } }`

#### `no-single-match`
**Default:** `info`
**Catches:** a `match` with exactly one arm.  A single-arm match is just
an `if let` (which Aether doesn't have a dedicated syntax for) or a
destructuring binding — both of which read more clearly as a plain `if`
with a pattern destructuring in the body.  Empty matches are flagged by
`no-empty-match`.

**Disable:** `{ rules: { "no-single-match": "off" } }`

#### `prefer-interpolation`
**Default:** `info`
**Catches:** a `+` where one side is a string literal and the other is
an interpolation-friendly expression (an identifier, call, field access,
index, etc.).  Aether's f-strings are clearer and avoid the
`string + non-string` type error.

```aether
// good
let s = f"x={x}";

// bad
let s = "x=" + x;
let s = x + "y";
```

**Disable:** `{ rules: { "prefer-interpolation": "off" } }`

#### `no-deep-nesting`
**Default:** `warning`
**Threshold:** depth > 4 (where depth counts `Block`, `If`, `While`,
`ForIn`, `Match`, and `Lambda`).

**Catches:** a function whose body nests blocks more than four deep.
Deep nesting is a readability smell — extract a helper.

```aether
// good (depth ≤ 4)
fn f() { if true { 1 } else { 0 } }

// bad (depth > 4)
fn f() { if true { if true { if true { if true { if true { 1 } } } } } }
```

**Disable:** `{ rules: { "no-deep-nesting": "off" } }`

#### `line-too-long`
**Default:** `info`
**Threshold:** > 100 characters per line.

**Catches:** any line in the source that exceeds 100 characters.  Long
lines often hide complex expressions; wrapping exposes the structure.
The formatter will wrap multi-line constructs when `lineWidth` is
exceeded, but it won't reflow expressions inside a single statement.

**Disable:** `{ rules: { "line-too-long": "off" } }`

### Performance (5)

#### `no-string-concat-in-loop`
**Default:** `warning`
**Catches:** a `s = s + expr` or `s += expr` assignment inside a `for`
or `while` loop body.  Repeated string concatenation is O(n²) — each
concat copies the entire accumulated string.  Use a string builder or
`join()` instead.

```aether
// good
let parts = [string];
// ... fill parts
let s = join(parts, "");

// bad
let mut s = "";
for c in arr { s = s + c }
```

**Disable:** `{ rules: { "no-string-concat-in-loop": "off" } }`

#### `no-array-growth-in-loop`
**Default:** `warning`
**Catches:** a `push(...)` call (free function or method form) inside a
`for` or `while` loop body.  Growing an array one element at a time
triggers reallocations; if the final size is known, preallocate.

```aether
// good
let mut a = [1, 2, 3];
a.push(4);   // push outside loop

// bad
let a = [1];
for i in range(0, 10) { a.push(i); }
```

**Disable:** `{ rules: { "no-array-growth-in-loop": "off" } }`

#### `prefer-range`
**Default:** `info`
**Catches:** a `while i < N { ...; i = i + 1; }` or `while i < N { ...; i += 1; }`
counter loop, where the condition is an `Ident < something` and the body
contains a `Ident = Ident + 1` or `Ident += 1` increment of the same
counter.  These are clearer as `for i in range(0, N) { ... }`.

```aether
// good
for i in range(0, 10) { print(i); }

// bad
let mut i = 0;
while i < 10 { print(i); i = i + 1; }
```

**Disable:** `{ rules: { "prefer-range": "off" } }`

#### `no-recursive-fib`
**Default:** `warning`
**Catches:** a function whose name starts with `fib` and whose body
contains two or more recursive self-calls.  The naive recursive
Fibonacci is O(2ⁿ) — replace with an iterative version or memoization.
The heuristic is conservative: only `fib*` functions with two or more
self-calls are flagged; tail-recursive single-call variants are not.

```aether
// good (iterative)
fn fib(n: int) -> int {
  let mut a = 0; let mut b = 1;
  for _ in range(0, n) { let t = a + b; a = b; b = t; }
  a
}

// bad
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
```

**Disable:** `{ rules: { "no-recursive-fib": "off" } }`

#### `no-redundant-len-check`
**Default:** `info`
**Catches:** `len(x) == 0`, `len(x) != 0`, or `len(x) < 1`.  These work,
but the explicit length comparison is slightly redundant — a comment
like `// empty` is often clearer.  The rule is intentionally mild
(`info` severity) since the pattern is harmless.

**Disable:** `{ rules: { "no-redundant-len-check": "off" } }`

### Complexity (5)

#### `cognitive-complexity`
**Default:** `warning`
**Threshold:** score > 15.

**Catches:** functions whose cognitive complexity exceeds 15.  The score
is the standard cognitive-complexity metric: each `if` / `while` /
`for` / `match` adds 1 + (current nesting depth); `else if` and `else`
don't add to nesting depth themselves but their branch content does.
Lambdas don't increase the score directly, but their bodies do.

```aether
// good
fn f(x: int) -> int { x + 1 }

// bad (score = 36, from 8 nested ifs)
fn f() -> int {
  if true { if true { if true { if true {
    if true { if true { if true { if true { 1 } } } } }
  } } } }
}
```

**Disable:** `{ rules: { "cognitive-complexity": "off" } }`

#### `too-many-params`
**Default:** `warning`
**Threshold:** > 5 parameters.

**Catches:** functions with more than five parameters.  Beyond five,
callers struggle to keep argument order straight — group the related
parameters into a struct.

```aether
// good
fn f(a: int, b: int, c: int, d: int, e: int) -> int { a }

// bad
fn f(a: int, b: int, c: int, d: int, e: int, f: int) -> int { a }
```

**Disable:** `{ rules: { "too-many-params": "off" } }`

#### `too-many-arms`
**Default:** `warning`
**Threshold:** > 10 arms.

**Catches:** a `match` expression with more than 10 arms.  Large
matches often indicate a missing data-modeling opportunity — a lookup
table, a polymorphic dispatch, or a re-shaped enum.

```aether
// good (≤ 10 arms)
let x = match n { 1 => 1, 2 => 2, 3 => 3, 4 => 4, 5 => 5, 6 => 6, 7 => 7, 8 => 8, 9 => 9, _ => 0 };

// bad (> 10 arms)
let x = match n { 1 => 1, 2 => 2, 3 => 3, 4 => 4, 5 => 5, 6 => 6, 7 => 7, 8 => 8, 9 => 9, 10 => 10, _ => 0 };
```

**Disable:** `{ rules: { "too-many-arms": "off" } }`

#### `deep-pattern-nesting`
**Default:** `warning`
**Threshold:** depth > 3.

**Catches:** a match-arm pattern that nests more than three levels
deep — e.g. `(((((a,)))))`.  Deeply nested patterns are hard to read
and frequently hide simpler destructuring that could be split across
multiple matches or bound to intermediate locals.

```aether
// good (depth ≤ 3)
let x = match p { (a, b) => a };
let x = match p { ((a, b), c) => a };

// bad (depth > 3)
let x = match p { (((((a,))))) => a };
```

**Disable:** `{ rules: { "deep-pattern-nesting": "off" } }`

#### `long-function`
**Default:** `warning`
**Threshold:** span > 50 lines (computed as `loc.end.line - loc.start.line`).

**Catches:** a function that spans more than 50 lines.  Long functions
are hard to test, hard to read, and frequently mix several
responsibilities — extract helpers.

```aether
// good
fn f() -> int { 1 }

// bad (spans > 50 lines)
fn f() -> int {
  let x1 = 1;
  let x2 = 2;
  // ... 50+ more `let` statements
  0
}
```

**Disable:** `{ rules: { "long-function": "off" } }`

## Design notes

### Why AST-only rules?

Some linters (notably ESLint) operate on tokens + AST so they can detect
issues like trailing whitespace.  Aether's linter is split: most rules
walk the AST (where locs are precise), but the four purely textual rules
(`no-trailing-whitespace`, `no-mixed-indent`, `line-too-long`, and
`prefer-const`'s `_`-prefix exemption) fall back to the raw source string
when needed.  This keeps the rule implementations small and the AST the
single source of truth for "what is this program?"

### Severity philosophy

- `error` — almost certainly a bug (unreachable code, empty match,
  duplicate definitions, reassigning an immutable binding).
- `warning` — likely a bug or a strong code smell (shadowing, unused
  bindings, deep nesting, float equality, recursive fib).
- `info` — style polish or hygiene (naming, line length, trailing
  whitespace, prefer-const, single-match, interpolation, redundant
  len checks).  These are on by default but a project that wants a
  quieter lint can downgrade them to `off` in bulk.

### Stability

The 30 rule names are part of the linter's public API.  Renaming a rule
would break user configs.  Adding new rules is non-breaking (the
`DEFAULT_RULES` registry grows).  Removing a rule will be done in two
phases: first deprecation (severity set to `info` with a note in the
message), then removal after a release.

### Testing

Each rule has four dedicated tests in `linter.test.ts`:

1. **good** — a snippet that should NOT trigger the rule.
2. **bad** — a snippet that SHOULD trigger the rule.
3. **off** — the bad snippet with the rule disabled produces zero
   diagnostics of that rule.
4. **edge** — a boundary case specific to the rule (threshold
   boundary, name-prefix exemption, exhaustiveness caveat, …).

Combined with the registry sanity tests, the suite has 122 cases.  Run
with:

```sh
bunx vitest run aether/tools/linter
```

### Performance

The linter makes one lex + parse pass per source, then runs the 30
rules against the resulting AST.  Rules share a single scope analysis
(`analyzeScopes`) and a single parent-tracking walk (`walkWithDepth`),
so the cost is dominated by parsing on small files.  On a 1 MB Aether
source file (mixed examples concatenated), the linter finishes in under
150 ms on a 2023 laptop.

### Relationship to the formatter

The formatter and linter share the same parser, the same AST, and the
same loc conventions.  Running the formatter first (`format(src)`)
removes most `info`-severity style findings — trailing whitespace,
mixed indent, line-too-long (the formatter wraps when possible),
single-arm matches (no, the formatter doesn't rewrite those), and
naming (no, the formatter doesn't rename).  Run the formatter, then
the linter, for the cleanest signal.
