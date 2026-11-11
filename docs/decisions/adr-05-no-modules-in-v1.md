# ADR-05 — No modules in v1

> Status: Accepted
> Date: 2023-09-15
> Decision-maker: Aether core team
> Supersedes: none
> Superseded by: (none yet; v2 modules RFC is at
> [../rfcs/rfc-003-modules-and-packages.md](../rfcs/rfc-003-modules-and-packages.md))

## Context

Aether v1 needed to pick a *program organization* story: how
do you split code across files? The options were:

1. **Single-file programs.** No modules; every program is
   one source string. This is the simplest possible model
   and the one the playground uses.
2. **Simple file imports.** A `import "filename";` statement
   reads the file at compile time and inlines its contents.
   Like C's `#include`, but typed.
3. **Module system with paths.** Like Rust's `mod`/`use` or
   Python's `import`. Files map to module paths; `use`
   brings names into scope; visibility (`pub`) is per-item.
4. **Package manager + modules.** Like Cargo + Rust's
   modules. Modules live in packages; packages have
   versions; dependencies are declared in a manifest.

The constraints on the decision were:

- **Browser runnable.** v1 has no file system access in the
  playground. A module system that requires reading files
  from disk cannot work in the browser.
- **Implementation size.** A full module system (with name
  resolution across files, visibility rules, dependency
  cycles) is a multi-week project. v1 had a weekend.
- **Teaching value.** v1 is, in part, a teaching artifact.
  A single-file program is easier to reason about than a
  multi-file one. The compile pipeline is already four
  stages; adding a loader makes it five.
- **Forward-compatibility with v2.** The v2 plan needs a
  real module system (and a package manager). Whatever v1
  does, v2 has to be able to extend it without breaking v1
  programs.

## Decision

**Aether v1 has no module system. Every program is a single
source string.** The playground compiles and runs whatever
text is in the editor.

The lexer and parser still recognize `import` as a keyword
and parse `import "path";` as an `Import` AST node, but the
node is never resolved. This is a forward-compatibility
placeholder: v2 will resolve imports; v1 just keeps the
syntax parseable so that future v1 programs that use
`import` do not break the parser.

## Alternatives considered

### Simple file imports (option 2)

This is the C `#include` model. It is simple but has
problems:

- It requires file system access, which the browser does
  not have.
- It does not handle cycles gracefully (you need include
  guards or `#pragma once`).
- It does not scale to large programs (every file is
  re-parsed at every include site).

For v1, this is no better than no modules, and it adds
complexity. For v2, the proper module system (option 3) is
the right answer.

### Module system with paths (option 3, the v2 plan)

A proper module system is the right answer for v2. It
handles cycles, scales to large programs, and provides
encapsulation via visibility. The v2 plan is at
[../rfcs/rfc-003-modules-and-packages.md](../rfcs/rfc-003-modules-and-packages.md).

For v1, the implementation cost was too high. The browser
constraint also bit: where do you put the files in a browser
playground? Local storage? IndexedDB? A server? Each option
adds complexity that v1 could not afford.

### Package manager + modules (option 4, the v2 plan)

This is the right answer for v2 production use. Cargo-style
package management with semver, a registry, lockfiles. v1
has none of this; v2 RFC is at
[../rfcs/rfc-003-modules-and-packages.md](../rfcs/rfc-003-modules-and-packages.md).

## Consequences

### Positive

- **Smallest possible v1.** No module system means no
  loader, no name resolution across files, no visibility
  rules. The compile pipeline is `source → lex → parse →
  check → run`, four stages.
- **Browser-runnable.** No file system access needed. The
  playground compiles whatever is in the editor.
- **Easy to teach.** A single source string is easy to
  reason about. The tutorials can put everything in one
  code block.
- **Forward-compatible.** The `import` keyword is parsed
  but not resolved, so v1 programs that use `import` do
  not break the parser. v2 will resolve imports.

### Negative

- **No packages.** You cannot install a library; you
  cannot share code across programs except by copy-paste
  (or the Share URL, which shares the source string).
- **No code reuse across programs.** Every program is
  self-contained. The stdlib is global, which mitigates
  this somewhat, but you cannot factor your own code
  into libraries.
- **No `pub`.** Since there are no modules, there is no
  visibility. Every name is visible to every other name
  in the same source string.
- **The `import` placeholder is a footgun.** v1 silently
  ignores `import "foo";` statements. A user who writes
  one expecting it to do something will be confused.

## Mitigations

- The [../tutorials/tooling.md](../tutorials/tooling.md)
  tutorial explicitly says "no modules in v1" and points
  at the v2 RFC.
- The [../tutorials/error-handling.md](../tutorials/error-handling.md)
  guide tells users to put everything in one file.
- The Share URL is the v1 substitute for a package: you
  can share a program by encoding the source in a URL.
- The stdlib is global, so common functionality is
  available without imports.

## Reversibility

The decision is **reversible**. Adding a module system in
v2 does not break any v1 program, because v1 programs are
single-file and do not use `import` for anything. The v2
plan is to resolve imports; v1 programs that do not use
`import` will work unchanged; v1 programs that *do* use
`import` will start resolving (which may break if they
were using `import` as a no-op, but that is a feature, not
a regression).

## Cross-references

- [../rfcs/rfc-003-modules-and-packages.md](../rfcs/rfc-003-modules-and-packages.md)
  — the v2 modules and packages plan.
- [../spec/06-modules-and-packages.md](../spec/06-modules-and-packages.md)
  — the spec for v2 modules.
- [../tutorials/tooling.md](../tutorials/tooling.md) §9 —
  what does NOT exist in v1.
- [../decisions/adr-07-single-playground-route.md](adr-07-single-playground-route.md)
  — the related decision to keep the playground a single
  route.
