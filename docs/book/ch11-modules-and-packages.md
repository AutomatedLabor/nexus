# Chapter 11 — Modules and packages

> Aether v2 has a real module system: `import { foo } from "./mod.ae";`, `pub fn`, `pub const`, `pub use`. Files map to modules; relative paths are resolved against the importing file's directory; cycles are detected and reported. This chapter covers the syntax, the resolution algorithm, the cycle-handling, and the package manager vision.

---

## 11.1 The module system

Aether v2's module system is the one RFC-003 specifies:

- `import { foo, bar } from "./mod.ae";` — import named exports.
- `pub fn name(...) -> T { ... }` — declare an exported function.
- `pub const NAME = expr;` — declare an exported constant.
- `pub use { a, b } from "./other.ae";` — re-export.
- `pub use * from "./other.ae";` — wildcard re-export.
- Non-`pub` items are private (visible only within the module).

The module system is implemented in `aether/core/modules/modules.ts` (~600 lines of TypeScript). It uses *regex preprocessing* for imports — see ADR-14 for why. The parser doesn't yet support the RFC-003 import syntax natively; the module loader extracts imports with a regex, strips them before passing the source to the parser, and shares values via the evaluator's `RunOptions.env`.

---

## 11.2 Syntax

### 11.2.1 Importing

```aether
import { greet, farewell } from "./utils.ae";

greet("Aether");
farewell("Aether");
```

The import statement:

- Lists names in `{ ... }`.
- After `from`, a string with the module path (relative or absolute).
- Ends with `;`.

Multiple imports from the same module:

```aether
import { greet } from "./utils.ae";
import { farewell } from "./utils.ae";
```

Or combined:

```aether
import { greet, farewell } from "./utils.ae";
```

### 11.2.2 Aliasing

```aether
import { greet as hello } from "./utils.ae";
hello("Aether");
```

(`as` is supported in the regex-preprocessing layer; the parser doesn't yet see it natively.)

### 11.2.3 Exporting

```aether
// utils.ae
pub fn greet(name: string) -> () {
  print(f"Hello, {name}!");
}

pub fn farewell(name: string) -> () {
  print(f"Goodbye, {name}!");
}

fn helper() -> () { ... }   // private — not exported
```

The `pub` keyword marks a binding as exported. Without `pub`, the binding is private to the module.

### 11.2.4 Re-exporting

```aether
// re_exporter.ae
pub use { greet, farewell } from "./utils.ae";
```

Other modules can `import { greet } from "./re_exporter.ae";` and get `greet` from `utils.ae` via `re_exporter.ae`.

Wildcard re-export:

```aether
pub use * from "./utils.ae";
```

Re-exports all of `utils.ae`'s exports as this module's exports.

Single-name re-export:

```aether
pub use greet from "./utils.ae";
```

### 11.2.5 Public constants

```aether
// constants.ae
pub const PI: float = 3.14159;
pub const VERSION: string = "1.0.0";
```

```aether
// main.ae
import { PI, VERSION } from "./constants.ae";
print(PI);
print(VERSION);
```

The module loader transforms `pub const NAME = expr;` to `const NAME = expr;` and records `NAME` for export collection after running the module.

---

## 11.3 File resolution

The module loader resolves import paths:

- `./mod.ae` — relative to the importing file's directory.
- `../mod.ae` — relative to the parent of the importing file's directory.
- `/abs/path/mod.ae` — absolute (rare; mostly for programmatic use).
- `mod.ae` (no `./`) — *not* supported (RFC-003's registry protocol is a v2.1 item).

If the path doesn't end in `.ae`, the loader appends it:

```aether
import { foo } from "./mod";   // resolves to ./mod.ae
```

The loader throws a clear error if the file doesn't exist:

```
Module not found: /path/to/importer/mod.ae (from /path/to/importer/main.ae)
```

---

## 11.4 The loading algorithm

`runModule(entryPath, opts?)` in `aether/core/modules/modules.ts`:

1. **Resolve all imports.** Starting from the entry, recursively find all imports, resolve their paths, build a dependency graph.
2. **Topological sort.** Order the modules so that dependencies come before dependents.
3. **Detect cycles.** If the graph has a cycle, throw with the cycle path.
4. **Compile and run each module in topological order.** For each module:
   - Strip the import statements from the source (regex preprocessing).
   - Compile and run the stripped source via the existing v1 compiler.
   - Collect the `pub` bindings as exports (from the evaluator's environment).
5. **Wire imports.** For each module, populate the import bindings from the imported modules' exports.
6. **Run the entry.** The entry module's top-level statements run, with imports resolved.

### 11.4.1 The topological sort

The graph is built by following `import` statements. Each module is a node; each import is a directed edge. The topological sort produces a linear order where every module comes before any module that imports it.

If the graph has a cycle, the sort fails. Aether v2 *throws* with the cycle path:

```
Module cycle: /a/main.ae -> /b/utils.ae -> /a/main.ae
```

(RFC-003 says cycles are allowed in the full design — each module is initialized once; subsequent imports see the partially-initialized module. v2 doesn't implement partial-initialization yet; the v2.1 design will revisit.)

### 11.4.2 The compile-and-run step

For each module:

```typescript
const strippedSource = stripImports(module.source);   // regex
const result = compile(strippedSource, { env: collectedEnv });
// result.output is the module's side effect (any top-level prints)
// result.env has the module's bindings — including `pub` ones
const exports = collectExports(result.env, module.source);
```

The `collectedEnv` is the union of all previously-loaded modules' exports, populated into the next module's `RunOptions.env` so that its imports resolve.

### 11.4.3 Export collection

The module loader parses the original source (before stripping) to find:

- `pub fn name(...)` declarations (the parser sets `exported: true` on the FnDecl).
- `pub const NAME = ...` declarations (transformed to `const NAME = ...` and recorded).
- `pub use { ... } from ...` re-exports (collected from the imported module's exports).

The loader then collects the values of these names from the run result's environment and exposes them as the module's exports.

---

## 11.5 Visibility rules

| Declaration                           | Visibility | Exported? |
|---------------------------------------|------------|-----------|
| `pub fn name(...) -> T { ... }`       | Public     | Yes       |
| `pub const NAME = ...`                | Public     | Yes       |
| `pub use { a, b } from "./m.ae";`    | Public     | Yes (re-export) |
| `pub use * from "./m.ae";`           | Public     | Yes (wildcard) |
| `fn name(...) -> T { ... }`           | Private    | No        |
| `const NAME = ...`                    | Private    | No        |
| `let x = ...`                         | Private    | No        |
| `let mut x = ...`                     | Private    | No        |
| `struct Name { ... }`                 | Private    | No        |
| `enum Name { ... }`                   | Private    | No        |
| `type Name = ...`                     | Private    | No        |

Note: in v2, `pub struct` and `pub enum` are not yet supported (the parser accepts `pub fn` and `pub const` only). This is a v2.1 item.

---

## 11.6 A complete example

Two files: `utils.ae` and `main.ae`.

**`utils.ae`:**

```aether
// utils.ae
pub const VERSION: string = "1.0.0";

pub fn greet(name: string) -> () {
  print(f"Hello, {name}! (v{VERSION})");
}

pub fn farewell(name: string) -> () {
  print(f"Goodbye, {name}!");
}

fn internal_helper() -> () {
  // not exported
  print("(internal)");
}
```

**`main.ae`:**

```aether
// main.ae
import { greet, farewell, VERSION } from "./utils.ae";

greet("Aether");
print(f"Running version {VERSION}");
farewell("Aether");
```

Run with:

```bash
aether run main.ae
```

(The CLI's `run` command detects imports and uses the module loader. See Chapter 13.)

Output:

```
Hello, Aether! (v1.0.0)
Running version 1.0.0
Goodbye, Aether!
```

---

## 11.7 Cycles

Aether v2 detects cycles and throws. Given:

**`a.ae`:**

```aether
import { b } from "./b.ae";
pub fn a() -> () { print("a"); b(); }
```

**`b.ae`:**

```aether
import { a } from "./a.ae";
pub fn b() -> () { print("b"); a(); }
```

Running `aether run a.ae` throws:

```
Module cycle: /path/to/a.ae -> /path/to/b.ae -> /path/to/a.ae
```

The fix: break the cycle (extract a third module, or use a forward declaration).

v2.1 will revisit partial-initialization semantics (RFC-003 allows it; v2 doesn't yet implement it).

---

## 11.8 The `aether.toml` manifest

Aether's package manifest is `aether.toml`. It's a TOML file with:

```toml
[package]
name = "my-project"
version = "0.1.0"
edition = "2024"
authors = ["You <you@example.com>"]

[dependencies]
serde = "1.2"
http = { version = "0.9", path = "../http" }
```

(Planned; not yet implemented. v2 today uses no manifest — the module system is file-based, with relative imports. The package manager is a v2.1 item, see RFC-008.)

The `aether new <name>` command scaffolds a new project with a minimal `aether.toml`:

```toml
[package]
name = "<name>"
version = "0.1.0"
edition = "2024"
```

Plus a `main.ae` with a hello-world and a `README.md`.

---

## 11.9 The package manager vision

The package manager is RFC-008. The vision:

- `aether add <dep>` — add a dependency to `aether.toml` and download it.
- `aether remove <dep>` — remove a dependency.
- `aether update` — update all dependencies to their latest compatible versions.
- `aether publish` — publish the current package to the registry.
- `aether login` — authenticate with the registry.
- `aether search <query>` — search the registry.

The registry will be a hosted service (RFC-008 specifies the design). v2 today has no registry; dependencies are git URLs or local paths.

---

## 11.10 The module system's relationship to the parser

The parser supports `import "path";` (a v1 syntax that was a no-op) and `pub fn name(...)`. It does *not* natively support `import { names } from "path";`, `pub const`, `pub use`, or `as` aliasing.

The module loader works around this by *regex preprocessing*: it extracts the RFC-003 import statements with a regex, strips them before passing the source to the parser, and shares values via the evaluator's `RunOptions.env`.

This is a deliberate choice (see ADR-14):

- **Smaller blast radius.** No parser regression risk.
- **Faster to ship.** Regex + the existing parser is ~50 lines; parser changes are ~500.
- **Easier to revert.** If the RFC-003 import syntax changes, only the regex needs updating.
- **Documented.** ADR-14 explains the trade-off.

The cost: the parser can't give error messages for malformed imports (the regex is the parser). And `as` aliasing is only supported in the regex, not in the parser. v2.1 will move imports into the parser natively.

---

## 11.11 Eight runnable examples

These are multi-file examples; each is a pair (or more) of `.ae` files. Save them in a directory and run `aether run main.ae`.

**1. Hello from another module.**

`utils.ae`:
```aether
pub fn greet(name: string) -> () {
  print(f"Hello, {name}!");
}
```

`main.ae`:
```aether
import { greet } from "./utils.ae";
greet("Aether");
```

**2. Public constants.**

`config.ae`:
```aether
pub const PI: float = 3.14159;
pub const E: float = 2.71828;
```

`main.ae`:
```aether
import { PI, E } from "./config.ae";
print(PI);
print(E);
```

**3. Re-export.**

`utils.ae`:
```aether
pub fn greet(name: string) -> () { print(f"Hello, {name}!"); }
```

`re_exporter.ae`:
```aether
pub use { greet } from "./utils.ae";
```

`main.ae`:
```aether
import { greet } from "./re_exporter.ae";
greet("via re-export");
```

**4. Wildcard re-export.**

`utils.ae`:
```aether
pub fn a() -> () { print("a"); }
pub fn b() -> () { print("b"); }
```

`api.ae`:
```aether
pub use * from "./utils.ae";
```

`main.ae`:
```aether
import { a, b } from "./api.ae";
a();
b();
```

**5. Private helper.**

`utils.ae`:
```aether
pub fn greet(name: string) -> () {
  print(format_greeting(name));
}
fn format_greeting(name: string) -> string {
  "Hello, " + name + "!"
}
```

`main.ae`:
```aether
import { greet } from "./utils.ae";
greet("Aether");
// import { format_greeting } from "./utils.ae";   // error: not exported
```

**6. Aliasing.**

`utils.ae`:
```aether
pub fn greet(name: string) -> () { print(f"Hello, {name}!"); }
```

`main.ae`:
```aether
import { greet as hello } from "./utils.ae";
hello("Aether");
```

**7. Multiple imports from one module.**

`utils.ae`:
```aether
pub fn add(a: int, b: int) -> int { a + b }
pub fn mul(a: int, b: int) -> int { a * b }
```

`main.ae`:
```aether
import { add, mul } from "./utils.ae";
print(add(2, 3));
print(mul(2, 3));
```

**8. A diamond dependency.**

`base.ae`:
```aether
pub fn hello() -> () { print("hello from base"); }
```

`left.ae`:
```aether
pub use { hello } from "./base.ae";
```

`right.ae`:
```aether
pub use { hello } from "./base.ae";
```

`main.ae`:
```aether
import { hello as left_hello } from "./left.ae";
import { hello as right_hello } from "./right.ae";
left_hello();
right_hello();
```

(Both print "hello from base" — `base.ae` is loaded once, despite being imported via two paths. The module loader caches by absolute path.)

---

## 11.12 Summary

- Aether v2 has a real module system: `import { ... } from "./path";`, `pub fn`, `pub const`, `pub use`.
- Files map to modules; relative paths are resolved against the importing file's directory.
- The module loader uses *regex preprocessing* (ADR-14) for imports — the parser doesn't yet support the RFC-003 syntax natively.
- The loading algorithm: resolve all imports → topological sort → detect cycles → compile and run each module in topological order → wire imports → run the entry.
- Cycles throw with the cycle path (v2 doesn't yet implement partial-initialization).
- `aether.toml` is the package manifest (planned; v2 today uses no manifest).
- The package manager is RFC-008 (planned for v2.1).
- `pub` controls visibility: `pub fn`, `pub const`, `pub use` are exported; everything else is private.

The next chapter is async and concurrency: the async runtime, `spawn`, channels, `select`, `timeout`, and the v2 suspend/resume plan.
