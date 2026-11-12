# ADR-22 — Packages use a TOML manifest

> Status: Accepted
> Date: 2026-11-12
> Decision-maker: Aether core team
> Related: [Chapter 17 the package ecosystem](../book/ch17-the-package-ecosystem.md), [RFC-003 modules and packages](../rfcs/rfc-003-modules-and-packages.md), [RFC-012 package registry](../rfcs/rfc-012-package-registry.md), [ADR-21 bootstrap host builtins](adr-21-bootstrap-host-builtins.md)

## Context

Aether v3 ships 25 packages (Chapter 17): `aether-list`, `aether-string`, `aether-result`, `aether-math`, `aether-dict`, `aether-iterator`, `aether-set`, `aether-sort`, `aether-parser`, `aether-regex`, `aether-json`, `aether-base64`, `aether-uuid`, `aether-rb-tree`, `aether-lru`, `aether-functional`, `aether-validate`, `aether-tree`, `aether-heap-extra`, `aether-graph`, `aether-matrix`, `aether-state-machine`, `aether-diff`, `aether-logger`, `aether-base64-extra`. Each package is a directory of `.ae` files plus a manifest. The manifest is the package's metadata: name, version, dependencies, entry point, exports.

The manifest format is a real choice. The options were:

1. **TOML (Tom's Obvious Minimal Language).** A simple, line-oriented, key-value format. Used by Cargo (Rust), Poetry (Python), and many other modern package managers. Pros: simple to parse (~200 LOC for the subset Aether uses); human-readable; comments; no quoting of strings; well-established.
2. **JSON.** A structured, nested format. Used by npm (JavaScript), pip (Python, in some places), and many others. Pros: structured (nested objects, arrays); parsers exist everywhere (the v3 stdlib has `aether-json`). Cons: no comments; verbose; trailing commas are an error in strict JSON.
3. **Aether syntax itself.** Use Aether to declare the package: `package aether-list { version = "0.1.0"; deps = ["aether-string"]; }`. Pros: no new format to learn; the Aether parser already exists; the manifest is just an Aether declaration. Cons: Aether doesn't have a `package` keyword (it'd be a new declaration form); the manifest has to be parsed by the Aether parser, which means the parser has to be available before any package can be loaded (a chicken-and-egg problem for the bootstrap).
4. **YAML.** A line-oriented, indentation-sensitive format. Used by GitHub Actions, Docker Compose, many CI systems. Pros: human-readable; comments. Cons: the spec is large and ambiguous (the YAML 1.2 spec is ~85 pages; there are multiple incompatible parsers); the indentation rules are a common source of bugs.

The constraints on the decision were:

- **Parser simplicity.** The v3 manifest parser had to be a few hundred lines, not a few thousand. TOML's subset (sections, key-value pairs, strings, arrays) is ~200 LOC. JSON is ~500 LOC (and we already have `aether-json`, so it's "free"). Aether syntax is "free" (the parser exists) but requires extending the parser. YAML is ~2000 LOC for a compliant parser.
- **Human-readability.** The manifest is hand-edited. The format should be readable, commentable, and not error-prone. TOML wins; JSON loses (no comments); Aether syntax is OK but mixes "config" with "code"; YAML is OK but the indentation rules bite.
- **Tool compatibility.** Many tools (Cargo, Poetry, the GitHub Actions ecosystem) use TOML. Reusing TOML means Aether manifests are familiar to users coming from those ecosystems.
- **Forward compatibility.** The v3.2 package registry (RFC-012) will publish packages with their manifests. The manifest format has to be stable across v3, v3.1, v3.2, and beyond. TOML is stable (the spec hasn't changed significantly since 1.0); JSON is stable; YAML is in flux (1.1 vs 1.2 vs the proposed 1.3); Aether syntax is whatever we make it.

## Decision

**Aether v3 packages use a TOML manifest, named `aether.toml`.** The manifest specifies the package name, version, dependencies, entry point, and exports.

The format (a real v3 example, `aether-list/aether.toml`):

```toml
[package]
name = "aether-list"
version = "0.1.0"
authors = ["Aether team"]
edition = "v3"
description = "Linked list, cons cells, and list utilities"

[dependencies]
aether-string = "0.1.0"
aether-iterator = "0.1.0"

[exports]
# Public modules (the import resolver searches these)
modules = ["list", "cons", "iter"]
# Public entry points (for executables; empty for libraries)
entry = ""
```

The fields:

- **`[package]`** — the package's metadata. `name` (required, matches the directory name), `version` (SemVer), `authors`, `edition` (the Aether edition: `v1`, `v2`, `v3`; determines the default runtime), `description`.
- **`[dependencies]`** — a list of `name = "version"` pairs. The version is a SemVer requirement (e.g., `"0.1.0"` means `^0.1.0`, i.e., `>=0.1.0, <0.2.0`).
- **`[exports]`** — the package's public modules and entry point. The import resolver searches the listed modules; the entry point is the file run when the package is invoked as an executable.

The manifest parser is in `aether/core/modules/manifest.ts` (~200 LOC). It's a hand-written TOML subset parser: sections (`[section]`), key-value pairs (`key = value`), strings (`"..."`), arrays (`[a, b, c]`), and comments (`# ...`). It doesn't support inline tables, multi-line strings, or any of TOML's more exotic features; the v3 packages don't need them.

The choice of TOML is the choice of "simple, line-oriented, commentable." The v3 manifests are 5-20 lines each; the format is self-explanatory; a reader can edit one without reading the TOML spec.

## Alternatives considered

### JSON

Use `aether.json`. Pros: structured; the v3 stdlib already has `aether-json` (so the parser is "free"). Cons:

- **No comments.** JSON famously doesn't support comments. The v3 manifests have comments (e.g., `# Public modules (the import resolver searches these)` in the example above). JSON would force these into out-of-band documentation, which is worse.
- **Verbose.** JSON requires quotes around all keys and string values, brackets for nesting, commas between items. The TOML version above is 12 lines; the JSON equivalent would be 18 lines.
- **Trailing commas.** Strict JSON rejects trailing commas (which are a common edit artifact). The v3 packages would have to lint against this.
- **Tool compatibility.** npm uses JSON; Cargo uses TOML. The audience Aether targets (systems programmers, Rust refugees) is more familiar with TOML.

JSON is rejected for v3. The stdlib has `aether-json` for data interchange, not for human-edited manifests.

### Aether syntax itself

Use Aether to declare the package: `package.ae` containing `package aether-list { version = "0.1.0"; deps = ["aether-string"]; }`. Pros: no new format; the Aether parser already exists; the manifest is just an Aether declaration. Cons:

- **Parser extension.** Aether doesn't have a `package` keyword. Adding one is a parser extension, which means changing the lexer (new keyword), the AST (new node), and the type checker (new declaration). The v3 parser is in TypeScript; the v3.1 parser (the bootstrap, Chapter 16) doesn't have it either; adding it would mean re-implementing it in Aether.
- **Chicken-and-egg.** The manifest is read by the package loader, which runs before any Aether code is parsed. If the manifest is Aether, the loader has to parse Aether, which means the parser has to be loaded before the manifest, which means the package containing the parser has to have a manifest, which means the loader has to read a manifest, which... is a chicken-and-egg problem. The bootstrap (Chapter 16) can solve this, but it's an extra complication.
- **Tool compatibility.** No other ecosystem uses "the language itself" for manifests. TOML and JSON are familiar.

This option is rejected for v3. A future "Aether-as-manifest" mode (v4+) is possible, after the bootstrap is complete and the chicken-and-egg problem is solved by the bootstrap being the parser.

### YAML

Use `aether.yaml`. Pros: human-readable; comments; line-oriented. Cons:

- **Spec ambiguity.** The YAML spec is large (1.2 is ~85 pages) and has multiple incompatible parsers. The YAML 1.1 vs 1.2 vs 1.3 transitions are a known source of bugs.
- **Indentation rules.** YAML's indentation rules are a common source of bugs (one wrong space, and the parser silently misinterprets the document).
- **Tool compatibility.** Cargo and Poetry don't use YAML; the audience Aether targets is more familiar with TOML.

YAML is rejected for v3.

## Consequences

### Positive

- **Simple parser.** The manifest parser is ~200 LOC of hand-written TOML. Easy to audit; easy to extend.
- **Human-readable.** The manifests are 5-20 lines; the format is self-explanatory; comments are first-class.
- **Tool compatibility.** TOML is what Cargo and Poetry use. Users coming from Rust or Python recognize the format immediately.
- **Forward compatibility.** TOML is stable (the spec hasn't changed significantly since 1.0). The v3 manifests will work in v3.1, v3.2, and beyond without changes.
- **Bootstrap-friendly.** The manifest parser is small enough to be re-implemented in Aether in the bootstrap (the v3.1 plan). The bootstrap will have a hand-written TOML parser (~100 LOC of Aether) for reading its own manifest.

### Negative

- **TOML subset is non-standard.** The v3 parser supports only sections, key-value pairs, strings, arrays, and comments. It doesn't support inline tables, multi-line strings, or datetimes. A user trying to use a feature the parser doesn't support gets an unclear error.
- **No nested objects.** TOML's flat-section structure (`[package]`, `[dependencies]`, `[exports]`) is fine for the v3 manifests but doesn't scale to deep nesting. If the v3.2 package registry needs deeply-nested metadata (e.g., per-platform dependencies), TOML's flat structure is awkward.
- **Not JSON.** Tooling that expects JSON (e.g., some CI systems that auto-discover manifests by parsing JSON) won't work with Aether's TOML manifests. This is a minor inconvenience.

### Mitigations

- For the TOML subset: the v3 manifest parser is documented (in the spec, §06). A user who hits an unsupported feature gets a clear error ("unsupported TOML feature: inline table"). The v3.1 plan is to extend the parser to support more TOML features (inline tables, multi-line strings).
- For the no-nested-objects: the v3.2 package registry will use multiple sections (`[dependencies]`, `[dev-dependencies]`, `[platform.linux.dependencies]`) for nesting, which TOML handles cleanly.
- For the not-JSON issue: a future `aether build --json-manifest` mode (v3.1) could emit a JSON equivalent of the manifest, for tooling that expects JSON.

## Reversibility

This decision is **reversible in v4**, but the v3 manifests will keep working. The manifest parser can be extended (to support more TOML features, or to support a JSON alternative) without breaking existing manifests. The v3.2 package registry will accept TOML; a future JSON alternative (v4) would be opt-in.

## Cross-references

- [Chapter 17 the package ecosystem](../book/ch17-the-package-ecosystem.md) — the chapter walkthrough, with the 25 packages and their manifests.
- [RFC-003 modules and packages](../rfcs/rfc-003-modules-and-packages.md) — the v2 RFC that introduced the module system; the manifest format was TBD at the time.
- [RFC-012 package registry](../rfcs/rfc-012-package-registry.md) — the v3.2 package registry, which inherits the TOML manifest format.
- [ADR-21 bootstrap host builtins](adr-21-bootstrap-host-builtins.md) — the bootstrap's three-builtin contract, which includes reading the manifest (via `read_file`).
- [Spec §06 modules and packages](../spec/06-modules-and-packages.md) — the spec for the module system and the manifest format.
