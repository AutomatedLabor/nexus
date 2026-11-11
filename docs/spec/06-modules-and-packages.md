# 06 — Modules & Packages

> **Status:** 🧪 Experimental
> **Subsystem:** `aether/core/sema` (name resolution), `aether/tools/build`
> **Spec version:** 0.1

This section specifies how Aether programs are organized into
files, modules, and packages, and how names are resolved across
them.

## 1. The three units of organization

| Unit | Lives in | Identified by | Example |
|------|----------|----------------|---------|
| **File** | the filesystem | its path | `src/geometry/shape.ae` |
| **Module** | a single file or directory tree | a path | `geometry::shape` |
| **Package** | a directory with `aether.toml` | name + version | `serde = "1.2"` |

A *file* contains at most one *module*. A *package* is the unit of
versioning and distribution. Every package has a *crate root* module
that is the entry point for `use` resolution from outside.

## 2. Module hierarchy

### 2.1 File-based modules

Every `.ae` file is a module. The module path is derived from the
file's path relative to the package's source directory (default
`src/`). Subdirectories become nested modules.

```
src/
├── main.ae                  → crate root (binary crate)
├── lib.ae                   → crate root (library crate)
└── geometry/
    ├── _mod.ae              → module `geometry`
    ├── shape.ae             → module `geometry::shape`
    └── collision/
        ├── _mod.ae          → module `geometry::collision`
        └── sat.ae           → module `geometry::collision::sat`
```

- A directory's module is defined by a `_mod.ae` file inside it
  (analogue of Rust's `mod.rs` or Python's `__init__.py`). A
  directory without a `_mod.ae` is an error `E1041`.
- A directory module MAY re-export its children via `pub use`:

  ```aether
  // src/geometry/_mod.ae
  pub mod shape;
  pub mod collision;
  ```

- The crate root is `main.ae` for a binary crate and `lib.ae` for a
  library crate. A package may have both; the binary crate is the
  one that gets compiled to an executable, the library crate is the
  one imported by other packages.

### 2.2 Inline modules

```aether
mod geometry {
    pub fn origin() -> Point { Point { x: 0.0, y: 0.0 } }

    pub mod shape {
        pub enum Shape { Circle(Float), Square(Float) }
    }
}
```

- An inline `mod foo { ... }` block defines a submodule inside the
  enclosing file. The block has its own scope; items declared inside
  are private to the block unless marked `pub`.
- Inline modules may be nested to any depth.

### 2.3 Module declaration vs. file discovery

`mod geometry;` (no body) is a **forward declaration**: it tells
the resolver to look for a module file at one of the conventional
locations relative to the current module's file:

1. `geometry.ae` in the same directory, or
2. `geometry/_mod.ae` in a subdirectory.

If both exist, the resolver picks the subdirectory form and warns
`W1042` about the unused file. If neither exists, `E1040`.

## 3. Visibility

```
Visibility ::= "pub" | "pub" "(" VisScope ")" | <nothing>
VisScope   ::= "crate" | "self" | "super" | "in" Path
```

- `pub` — visible everywhere the module is reachable.
- `pub(crate)` — visible only inside the current package (crate).
- `pub(self)` — equivalent to private (no `pub`); included for
  symmetry.
- `pub(super)` — visible to the parent module.
- `pub(in path)` — visible to a specific ancestor module.

A `pub` item in a private module is itself effectively private:
visibility is the *intersection* of the visibility of the item and
the visibility of every module on the path to it. To re-expose a
private path, use `pub use`:

```aether
// src/internal.ae
pub(crate) fn helper() { ... }

// src/lib.ae
pub use internal::helper;     // re-export under lib's namespace
```

## 4. `use` declarations

```
UseDecl ::= "use" UseTree ";"
UseTree  ::= UseRoot ("::" UseTreeSuffix)?
UseRoot  ::= "::" Path | Path
UseTreeSuffix ::= "{" (UseTree ("," UseTree)* ","?) "}"
                | "*" | UseRename
UseRename ::= Identifier "as" Identifier
```

Examples:

```aether
use geometry::Shape;                       // single import
use geometry::{Circle, Square, Rect};       // group import
use geometry::Shape as Figure;              // rename
use geometry::collision::*;                // glob import
use ::std::collections::List;               // absolute path (crate-external)
```

- A `use` brings a name into the current scope under the chosen
  alias. It does not copy code; it is a name-binding.
- Glob imports (`*`) are permitted but discouraged in `pub` modules;
  the linter (`aether lint`) emits `W1043` for glob imports in a
  module's `pub` interface.
- Conflicting `use`s (two names bound to the same identifier) are an
  error `E1044` unless one shadows the other in a strictly more
  specific scope.
- `use` paths may name a *type*, a *function*, a *module*, or an
  *enum variant*. The resolver disambiguates by kind: an enum variant
  import brings the variant constructor; a module import brings the
  module namespace.

### 4.1 Prelude

Every module implicitly imports a **prelude** — a curated set of
commonly-used names from `core::prelude`. The prelude contains:

- `Option`, `Result`, `Ok`, `Err`, `None`, `Some` (and the enums
  themselves),
- `List`, `Map`, `Set`, `Box`, `Rc`, `Arc`,
- `panic!`, `todo!`, `unreachable!`, `assert!`, `assert_eq!`,
  `assert_ne!`, `format!`, `println!`, `eprintln!`, `print!`,
  `dbg!`,
- primitive type aliases `Int`, `Float`, `Bool`, `Char`, `String`,
  `Bytes`, `Unit`,
- the `Display`, `Debug`, `Clone`, `Eq`, `Ord`, `Hash`, `Default`,
  `Iterator`, `IntoIterator`, `FromIterator`, `From`, `Into`
  traits,
- the `Future`, `await`, `spawn`, `Channel`, `JoinHandle` items.

A program may opt out of the prelude with
`#![no_prelude]` at the crate root.

### 4.2 Resolution order

For a given identifier reference `x` at a use site, the resolver
tries in order:

1. **Local scope** (block/function parameters).
2. **Module scope** (items declared in the current module, including
   `use` aliases).
3. **Enum scope**: if the current context is an enum, `x` may be a
   variant of that enum.
4. **Prelude**.
5. **External crate** — only if `x` is the name of an external crate
   listed in `aether.toml` `[dependencies]`.

The first match wins. Ambiguity between two equally-specific scopes
(e.g. two `use`s) is `E1044`. The resolver is **order-independent**
within a module: forward references are allowed
(see [§05 §14](./05-statements-and-declarations.md#item-ordering)).

## 5. Packages and `aether.toml`

A package is defined by an `aether.toml` manifest at its root:

```toml
[package]
name        = "geometry"
version     = "0.4.1"
edition     = "0.1"          # spec edition this package targets
authors     = ["..."]
license     = "MIT"

[dependencies]
serde       = "1.2"
async-http  = { version = "0.3", features = ["tls"] }
internal    = { path = "../internal" }     # path dependency

[dev-dependencies]
aether-test = "0.2"

[features]
tls         = ["async-http/tls"]

[runtime]
mode        = "cooperative"               # or "work-stealing"
gc          = "generational"               # or "marksweep"
```

- `name` is the package's identifier, used in `use` paths as the
  root segment.
- `version` is semver 2.0. Two packages with the same `name` cannot
  coexist in a dependency graph at different versions; the build
  tool rejects this with `E1045` unless the resolver is told to
  permit duplicates.
- `edition` declares which spec edition the source targets. The
  compiler supports a rolling window of editions; older editions
  are accepted with a deprecation warning.
- `path` dependencies are resolved relative to the manifest and
  recompiled when changed.
- `features` enable optional functionality; a feature may depend on
  features in dependencies.

## 6. Crate root and entry points

A package with a `main.ae` (or `[package] entry = "..."`) is a
**binary crate**: it produces an executable. The entry function is
`pub fn main()` (or `pub async fn main()`). The compiler emits a
host-specific wrapper that initializes the runtime, invokes `main`,
and exits with the returned exit code.

A package with a `lib.ae` is a **library crate**: it is importable
by other packages via its name. A package may have both.

## 7. Conditional compilation

```
CfgExpr ::= "(" CfgKey ("=" CfgVal)? ")"
          | "any" "(" CfgExpr ("," CfgExpr)* ")"
          | "all" "(" CfgExpr ("," CfgExpr)* ")"
          | "not" "(" CfgExpr ")"
CfgKey  ::= Identifier
CfgVal  ::= StringLit
```

`#[cfg(expr)]` on an item includes or excludes the item based on the
build configuration. Standard `cfg` keys:

| Key | Values | Set when |
|---|---|---|
| `target_os` | `"linux"`, `"macos"`, `"windows"`, `"wasi"`, ... | platform |
| `target_arch` | `"x86_64"`, `"aarch64"`, `"wasm32"`, ... | CPU arch |
| `feature` | feature name | feature enabled in `aether.toml` |
| `debug_assertions` | (no value) | debug build |
| `test` | (no value) | test build |
| `bench` | (no value) | benchmark build |

```aether
#[cfg(target_os = "linux")]
fn platform_init() { ... }

#[cfg(any(target_os = "macos", target_os = "ios"))]
fn platform_init() { ... }
```

The same `cfg` syntax is available via `aether build --cfg key=value`
on the command line for ad-hoc experiments.

## 8. Conformance

A conformant module resolver MUST:

- map file paths to module paths deterministically (per §2.1),
- reject circular `use` aliases with `E1046`,
- emit one diagnostic per missing or ambiguous name,
- complete name resolution in time linear in the size of the
  package's source files.

A conformant package manager (the `aether build` tool) MUST:

- produce a single deterministic build graph from a manifest,
- refuse to build a package whose dependency graph has two versions
  of the same package by default,
- pin transitive dependencies to the versions chosen at first
  resolution and store them in a lockfile (`aether.lock`).
