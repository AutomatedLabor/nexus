# RFC-003 — Modules and packages for Aether v2

> Status: Draft
> Stage: 0 (Proposal)
> Discussion: open
> Related: [ADR-05 no modules in v1](../decisions/adr-05-no-modules-in-v1.md), [RFC-005 LSP](rfc-005-lsp.md)

## Summary

Aether v2 introduces a module system and a package manager. Modules map to files; files map to module paths (`aether/http/server.ae` exports module `aether.http.server`). Visibility (`pub`) is per-item. Packages declare dependencies in `aether.toml`; `aether install` fetches them; `aether build` compiles a package to a bytecode bundle. The v1 single-file model (see [ADR-05](../decisions/adr-05-no-modules-in-v1.md)) is preserved: a program with no `import` and no `aether.toml` runs as before, on the tree-walker.

This RFC specifies the module path syntax, the `import`/`use` semantics, the visibility rules, the package manifest format, the dependency resolution algorithm, the registry protocol, and the relationship to v1's single-file model.

## Motivation

Aether v1 has no module system (see [ADR-05](../decisions/adr-05-no-modules-in-v1.md)). Every program is a single source string. The lexer/parser recognize `import` as a keyword but the AST node is never resolved. The rationale was the v1 implementation cost (modules are a multi-week project) and the browser constraint (no file system in the playground).

The motivation for v2 is real code reuse:

1. **Shared libraries.** Users want to share code across programs without copy-paste. The Share URL works for one program; it doesn't scale to a library used by 100 programs.
2. **Namespacing.** Even within one program, you want to organize code into modules with named imports. The stdlib is one namespace; user code is another; collision is inevitable.
3. **Encapsulation.** A library author wants `pub` to expose only the public API; the internals are hidden from consumers.
4. **Dependency management.** A real project depends on other projects; tracking versions and updating them by hand is a chore. A package manager automates it.
5. **Registry.** A central registry (think crates.io, npm) lets users discover and trust libraries. Without one, every library is a git URL; with one, every library has a name, a version, and a maintainer.

The motivation is *not* to enforce any particular project structure — modules and packages support many layouts, from "one file" (the v1 model) to "monorepo with 1000 packages".

## Detailed design

### Module paths

A module path is a dot-separated list of identifiers: `aether.http.server`, `myapp.utils.list`, `acme.collections.btree`. The path maps to a file:

- `aether.http.server` → `aether/http/server.ae`
- `myapp.utils.list` → `myapp/utils/list.ae`
- `acme.collections.btree` → `acme/collections/btree.ae`

The mapping is from dot-separated to slash-separated, with `.ae` appended. The root of the mapping is the project root (where `aether.toml` lives). For dependencies, the root is `aether_modules/<dependency-name>/`.

Module paths must start with a letter and contain only letters, digits, and dots. They can't contain `..` (no parent traversal) or absolute paths — security feature.

### `import` and `use`

```aether
// Import the whole module, access via `Module.item`.
import aether.http.server;
let s = server.start(8080);

// Import specific items.
import { start, stop } from aether.http.server;
let s = start(8080);
stop(s);

// Import with alias.
import { start as start_server } from aether.http.server;
let s = start_server(8080);

// Import the whole module with alias.
import aether.http.server as http;
let s = http.start(8080);

// Wildcard import (brings all `pub` items into scope).
import * from aether.http.server;
let s = start(8080);
```

The v1 parser already accepts `import "string"` (with a string literal); the v2 form uses module-path identifiers instead. The string-literal form is kept for backward compatibility but is deprecated.

### `pub` and visibility

```aether
// myapp/utils/list.ae

pub fn empty() -> List { List::Nil }
pub fn cons(x: int, rest: List) -> List { List::Node(x, rest) }
pub fn length(l: List) -> int { ... }

fn helper(l: List) -> int { ... }   // private, not exported

pub enum List { Nil, Node(int, List), }
pub type IntList = List;             // type alias, pub

// (the enum's variants are pub if the enum is pub; private enums can't be
// constructed outside the module.)
```

- `pub` on a top-level item (`fn`, `enum`, `struct`, `type`, `const`) makes it visible to importers.
- Non-`pub` items are visible only within the module.
- `pub` on a struct field makes the field accessible outside the module; non-`pub` fields are read-only-internal.
- `pub` on an enum variant makes the variant constructible outside the module.

### Module-level declarations

Each `.ae` file is a module. The file can declare:

- `pub` and non-`pub` items (functions, enums, structs, types, consts).
- `import` statements (other modules to bring into scope).
- `use` statements (aliases for type names).
- A `module` declaration at the top (optional; defaults to the file path):

```aether
module myapp.utils.list;

import aether.collections;

pub enum List { Nil, Node(int, List), }

pub fn empty() -> List { List::Nil }
```

The `module` declaration must match the file's path; if it doesn't, the compiler errors.

### Packages and `aether.toml`

A package is a directory with an `aether.toml` file. The manifest declares:

```toml
[package]
name = "myapp"
version = "0.1.0"
edition = "v2"           # or "v1" for backward-compat

[dependencies]
aether-http = "1.2.3"
serde = { version = "0.4", source = "github:aether-lang/serde" }
local-lib = { path = "../local-lib" }
```

- `name` — the package name (must match the directory name; used by importers).
- `version` — semver.
- `edition` — `"v1"` (tree-walker, sync, no modules) or `"v2"` (bytecode VM, async, modules). The edition determines the runtime.
- `dependencies` — a map of name → version spec (or detailed table). Versions are semver. Sources: the default is the registry; `github:owner/repo` is a git source; `path: "..."` is a local path (for monorepos).

### `aether install`

```sh
aether install             # install all deps from aether.toml
aether install aether-http # install a specific package
aether install --update     # update to latest compatible versions
```

`aether install` fetches the dependencies into `aether_modules/`. The registry protocol is HTTP: GET `https://registry.aether-lang.org/v1/packages/<name>/<version>` returns a tarball; `aether install` extracts it into `aether_modules/<name>/`. A `aether.lock` file pins the resolved versions for reproducibility.

### `aether build`

```sh
aether build                  # build the current package
aether build --release        # optimized build (no debug info)
aether build --target wasm    # build to wasm (RFC-002)
```

`aether build` compiles the package's modules + dependencies' modules into a bytecode bundle at `build/main.aec`. The bundle is a single file that the VM executes. The build also produces:

- `build/main.aec` — the bytecode bundle.
- `build/main.aec.debug` — the debug info (if not stripped).
- `build/main.aec.types` — the type stubs for the package's public API (so consumers can type-check against the library without re-parsing the source).

### `aether run`

```sh
aether run                   # run the current package's main module
aether run path/to/file.ae  # run a specific file (v1-style, no modules)
```

`aether run` is the v2 equivalent of pressing Run in the playground. It loads the bytecode bundle and runs the VM. The `path/to/file.ae` form is the v1 single-file mode, kept for backward compat.

### `aether test`

See [RFC-005](rfc-005-lsp.md) § 4 and the [testing tutorial](../tutorials/testing.md) § 5. `aether test` discovers `test` blocks in the package's modules and runs them with failure aggregation. The runner is integrated with the LSP so test failures appear inline in the editor.

### Module resolution algorithm

Given an `import aether.http.server;` statement in `myapp/main.ae`:

1. Look for `aether/http/server.ae` in the current package's source root.
2. If not found, look for `aether_modules/aether/http/server.ae` (a dependency's source).
3. If not found, look for `aether_modules/aether-http/aether/http/server.ae` (a named package `aether-http` that contains a `aether/http/server.ae`).
4. If still not found, error: `cannot find module 'aether.http.server'`.

The algorithm is similar to Rust's and Node's: local file → local node_modules → named package. Cycles are allowed (two modules that import each other) but each module is initialized once (the first import wins; subsequent imports see the partially-initialized module).

### Visibility rules

- A `pub` item in module `A` is visible to any module that imports `A`.
- A non-`pub` item in module `A` is visible only to `A` itself and to modules that import `A`'s parent (if any).
- There are no "test-only" visibility modifiers in v2 (Rust's `#[cfg(test)]`); tests live in `test_*` modules that can access `pub` items.
- `pub(crate)` (visible to the same package but not to importers) is planned.

### The registry

The Aether package registry lives at `https://registry.aether-lang.org`. The protocol:

- `GET /v1/packages/<name>` — list all versions.
- `GET /v1/packages/<name>/<version>` — get the tarball URL and metadata.
- `GET /v1/packages/<name>/latest` — get the latest version.
- `POST /v1/publish` — publish a new version (auth required).

The registry is hosted by the Aether core team. Mirroring is supported (a `--registry` flag points to a mirror URL). Self-hosting is supported for private organizations (the `aether install --registry https://internal.example.com` flag).

### Relationship to v1's single-file model

A v1 program (no `import`, no `aether.toml`) runs identically under v2. The v2 compiler recognizes the absence of imports and treats the file as a "module of one file, no package" — the simplest case. The v1 playground uses this mode.

A v1 program with `import "foo";` (the deprecated string form) produces a deprecation warning and a v2 error (`cannot find module 'foo'` — the string form isn't a valid module path). Users should migrate to the identifier form.

## Alternatives considered

### Single-file only (v1 model)

Keep v1's "every program is one file" model. Add stdlib functions but no module system. The user paste-stitches code from elsewhere. This works for the playground but doesn't scale to production. v2 needs modules.

### C-style `#include`

`import "foo.ae"` literally inlines the file at the import site, like C's `#include`. Advantages: trivial implementation. Disadvantages: no namespacing (every name collides), no cycles, no encapsulation (everything is visible to the includer), no packages (you'd need a build system anyway).

### JavaScript CommonJS / ESM

Node's `require()` / `module.exports` (CommonJS) or `import` / `export` (ESM). The ESM model is similar to what we're proposing; the difference is the module path syntax (Aether uses dot-separated identifiers, JS uses URL-like paths). Aether's syntax is closer to Rust's `use` / `pub` model, which we prefer.

### Python's `import`

Python's `import foo.bar` brings the package `foo` with submodule `bar` into scope as `foo.bar`. Similar to our design. Python's `from foo import bar` is similar to our `import { bar } from foo`. The differences are surface syntax; the model is the same.

### Haskell's modules

Haskell's `module Foo (export1, export2) where ...` declares a module with an explicit export list. Aether's `pub`-per-item is more granular (you don't have to maintain the export list), but Haskell's model is also valid. We chose `pub`-per-item for ergonomics.

### Go packages

Go's packages are flat — no nested modules within a package. Aether's design allows nesting (`aether.http.server`), which Go's doesn't. The choice is a trade-off: nesting gives more structure, but more path typing.

## Drawbacks

- **Implementation cost.** The module system is a multi-month project; the package manager is another multi-month project. The registry is an ongoing operational cost (hosting, monitoring, security review).
- **The `aether_modules/` directory is a footgun.** Like `node_modules/` in JS, it can grow huge; users commit it by accident. The `.gitignore` should include it. The v2 docs will say this loudly.
- **Dependency hell.** Two dependencies that depend on incompatible versions of a third. Semver helps; lockfiles help; the v2 design includes both.
- **Module path collisions.** Two packages both defining `aether.http.server` — the import system can't disambiguate. The mitigation is that package names are unique in the registry, so `aether-http` (one package) provides `aether.http.server`, and `acme-http` (another package) provides `acme.http.server` — different module paths.
- **Build complexity.** With modules + dependencies + bytecode bundles, the build system is more complex than v1's "compile the source string". The v2 build tool hides most of this, but contributors building Aether itself need to understand it.
- **Registry centralization.** A central registry is a single point of failure (if it goes down, `aether install` stops working). Mirroring and self-hosting mitigate but don't eliminate.

## Open questions

1. **Conditional compilation.** Should the module system support `#[cfg(target = "browser")]` (Rust-style)? The v2 design tracks this; the API is open.
2. **Workspaces.** Multi-package monorepos (Rust's workspaces, JS's npm workspaces). The v2 design includes a `[workspace]` section in `aether.toml` for this; the implementation is open.
3. **Build scripts.** Some packages need pre-build code generation (e.g., generating Aether code from a schema). The v2 design supports `build = "build.ae"` in `aether.toml`, executed before the main build.
4. **Private packages.** A package that's not on the registry but is shared within an organization. The v2 design supports `path:` dependencies and git dependencies for this; a private registry is on the table.
5. **Version range syntax.** `"1.2.3"` (exact), `"^1.2.3"` (compatible), `"~1.2.3"` (patch-only), `"*"` (any). The v2 design uses semver, with `^` as the default when no operator is specified (npm's behavior).

## Cross-references

- [ADR-05 no modules in v1](../decisions/adr-05-no-modules-in-v1.md) — the v1 decision.
- [RFC-005 LSP](rfc-005-lsp.md) — the LSP's `textDocument/definition` uses module resolution.
- [RFC-002 bytecode VM](rfc-002-bytecode-vm.md) — the VM that runs the build output.
- [../tutorials/tooling.md](../tutorials/tooling.md) § 3 — the v2 plan from the tooling angle.

## Prior art

- **Rust** (Cargo + modules) — the closest analogue. `mod`/`use`/`pub`, `Cargo.toml`, crates.io. Aether's design is heavily influenced by Rust.
- **Node.js** (npm + ESM) — the JS ecosystem. `import`/`export`, `package.json`, npm registry. Aether's `aether.toml` mirrors `package.json`; `aether_modules/` mirrors `node_modules/`.
- **Python** (pip + modules) — `import foo.bar`, `setup.py`/`pyproject.toml`, PyPI.
- **Go** (modules) — `go.mod`, `go.sum`, the Go module proxy. The Go model is simpler than Cargo (no `pub`, just visibility by capitalization); we prefer Rust's explicit `pub`.
- **Swift** (Swift Package Manager) — `Package.swift`, the Swift Package Registry.
- **Elixir** (Mix + Hex) — `mix.exs`, hex.pm.

## Status

This RFC is at stage 0 (Proposal). The next step is to prototype the module resolution algorithm in TypeScript (without the package manager, using local paths only) to validate the import semantics. If the prototype works, the RFC moves to stage 1 (Implementation sketch) and the package manager design (registry protocol, lockfile format, `aether install`/`aether build` commands) gets specified in detail.
