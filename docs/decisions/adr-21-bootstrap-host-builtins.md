# ADR-21 — Bootstrap uses three host builtins

> Status: Accepted
> Date: 2026-11-12
> Decision-maker: Aether core team
> Related: [Chapter 16 self-hosting](../book/ch16-self-hosting.md), [ADR-08 stdlib as TypeScript functions](adr-08-stdlib-as-typescript-functions.md), [RFC-003 modules and packages](../rfcs/rfc-003-modules-and-packages.md)

## Context

Aether v3's bootstrap (in `aether/bootstrap/`, ~2400 LOC of Aether) is the first stage of self-hosting: a lexer and parser for Aether written in Aether itself. The bootstrap is a real compiler — it reads Aether source, produces an Aether AST, and (in v3.1) will produce typed AST and IR. See Chapter 16 for the design.

The central design question for any bootstrap is: how does the bootstrapped compiler interact with the outside world? A compiler is a program that reads files, prints diagnostics, and produces output. In Aether's case, the bootstrap needs to (a) read the source file (file IO), (b) print diagnostics (stdout), and (c) read its own source (for self-replication, the v4 milestone). Aether v3 has `aether-fs` (a package providing file IO) and the stdlib `print` (for stdout). The bootstrap could use either of these. The question is what's the *minimal* set of host primitives the bootstrap needs.

Three options were on the table:

1. **Use the full stdlib.** The bootstrap uses `aether-fs`, `print`, `aether-string`, `aether-dict`, and any other stdlib function it wants. Pros: maximum expressiveness; the bootstrap can use any stdlib function. Cons: the bootstrap depends on the stdlib; if the stdlib has a bug, the bootstrap has a bug; the bootstrap is harder to audit (it depends on ~566 functions in 27 modules).
2. **Use three host builtins: `read_file`, `print`, `panic`.** The bootstrap uses three (and only three) functions provided by the host: `read_file(path) -> string`, `print(string) -> ()`, and `panic(string) -> ()`. Everything else (strings, dicts, lists, the parser, the AST) is implemented in Aether, in the bootstrap itself. Pros: minimal dependency; the bootstrap is self-contained; the audit surface is tiny. Cons: the bootstrap has to re-implement some stdlib functions (e.g., a `dict` for the lexer's keyword table).
3. **Use one host builtin: `eval`.** The bootstrap uses a single `eval(string) -> value` builtin that runs Aether source. The bootstrap is then a single call to `eval`. Pros: absolutely minimal. Cons: `eval` is the entire compiler; the bootstrap is meaningless. This is a degenerate case.

The constraints on the decision were:

- **Auditability.** The bootstrap is the foundation of self-replication (v4). It has to be auditable — a reader should be able to read the entire bootstrap in an afternoon and understand it. Using the full stdlib (~566 functions in 27 modules) makes the audit surface huge.
- **Bootstrappability.** The bootstrap has to be runnable on the v3 Aether VM (so it can be used to bootstrap the v3.1 compiler). The v3 VM supports all the language features the bootstrap needs (functions, structs, enums, pattern matching, recursion, closures). The bootstrap shouldn't use features that the v3 VM doesn't support.
- **Portability.** The bootstrap has to run on all four backends (tree-walker, bytecode VM, WASM, x86). The three host builtins (`read_file`, `print`, `panic`) have to be provided by each backend. They are: each backend has a host-call mechanism (the tree-walker uses JS; the VM uses host functions; the WASM backend uses host imports; the x86 backend uses host calls).
- **Implementation simplicity.** The bootstrap had to ship in a sprint. Using three host builtins meant the bootstrap was ~2400 LOC of Aether (the lexer, the AST, the parser, a small dict, a small list). Using the full stdlib would have meant ~1500 LOC (re-using stdlib functions) but at the cost of auditability.

## Decision

**The v3 bootstrap uses three (and only three) host builtins: `read_file`, `print`, `panic`.** Everything else is implemented in Aether, in the bootstrap itself.

The three builtins:

- **`read_file(path: string) -> string`** — read a file from the host filesystem. Returns the file's contents as a string. Errors (file not found, permission denied) are reported via `panic`.
- **`print(s: string) -> ()`** — write a string to stdout (followed by a newline). Used for diagnostics and the parser's output.
- **`panic(msg: string) -> ()`** — abort the program with an error message. Used for unrecoverable errors (file-not-found, syntax errors that the parser can't recover from).

These three are the *only* functions the bootstrap calls that aren't Aether. Everything else — strings (concatenation, slicing, length), the keyword table (a hand-written hash map in the lexer), the AST (a set of structs), the parser (a recursive-descent parser), the error reporter (formats error messages with line numbers) — is implemented in Aether, in `aether/bootstrap/`.

The choice of three is not arbitrary. The bootstrap needs:

- **Input** — read the source file. This is `read_file`.
- **Output** — print the AST (or, in v3.1, the IR or the bytecode). This is `print`.
- **Failure** — abort on unrecoverable errors. This is `panic`.

Anything else the bootstrap needs, it implements in Aether. For example, the lexer's keyword table (`if`, `else`, `let`, `fn`, ...) is a hand-written hash map (a list of `(string, token_type)` pairs, searched linearly — a hash map would be premature optimization for a 30-keyword language). The parser's token stream is a hand-written list (a struct with a `head: Token` and `tail: List` field). The error reporter formats messages with line numbers by counting newlines in the source (a 10-line Aether function).

The three builtins are provided by each backend:

- **Tree-walker.** `read_file` uses Node's `fs.readFileSync` (or `fetch` in the browser); `print` uses `console.log`; `panic` throws a JS exception.
- **Bytecode VM.** `read_file` is a host function (calls the JS `fs.readFileSync`); `print` is a host function (`console.log`); `panic` throws a VM-internal exception.
- **WASM backend.** `read_file` is a host import (the browser page fetches the file); `print` is a host import; `panic` is a host import that aborts the WASM module.
- **x86 backend.** `read_file` is a host call (the structured interpreter calls a JS function); `print` is a host call; `panic` is a host call.

## Alternatives considered

### Use the full stdlib

The bootstrap uses `aether-fs`, `print`, `aether-string`, `aether-dict`, etc. Pros: maximum expressiveness; the bootstrap is shorter (~1500 LOC vs ~2400). Cons:

- **Auditability.** The bootstrap depends on ~566 functions in 27 modules. A reader can't audit the bootstrap without also auditing the stdlib. The audit surface is huge.
- **Bootstrappability.** The bootstrap has to run on the v3 VM. The stdlib is implemented in TypeScript (the host's language); the bootstrap, to use the stdlib, has to call TypeScript functions through the VM's host-call mechanism. This works, but it means the bootstrap isn't *pure* Aether — it depends on the TypeScript stdlib.
- **Self-replication.** The v4 self-replicating compiler can't depend on the TypeScript stdlib (it has to be pure Aether, compiling itself). Using the full stdlib in the bootstrap would mean the v4 milestone requires re-implementing the stdlib in Aether first — a major detour.

The full stdlib approach is rejected for v3.

### Use one host builtin: `eval`

The bootstrap uses a single `eval(string) -> value` builtin. The bootstrap is then `eval(read_file("compiler.ae"))`. Pros: absolutely minimal. Cons:

- **Degenerate.** `eval` is the entire compiler. The bootstrap is meaningless — it's a one-line wrapper around the host's `eval`. The audit surface is the entire host compiler, which is exactly what we're trying to bootstrap away from.
- **No teaching value.** The bootstrap is partly a teaching artifact (Chapter 16). A one-line bootstrap teaches nothing.
- **No portability.** `eval` is a JS function; it can't be implemented on the WASM or x86 backends (which don't have a JS engine). The bootstrap would only run on the tree-walker.

This option is rejected as degenerate.

### Use no host builtins (a fully self-contained bootstrap)

The bootstrap uses no host builtins at all — the source is provided as a string literal in the bootstrap itself (the bootstrap contains its own source as a constant). Pros: fully self-contained; no host dependency. Cons:

- **Impractical.** The bootstrap's source is ~2400 LOC; embedding it as a string literal would make the bootstrap ~4800 LOC (the source, plus the literal). Maintaining two copies of the source (the literal and the actual code) is a recipe for drift.
- **No file IO.** The bootstrap can't read other files (e.g., the v3.1 plan is for the bootstrap to read a `compiler.ae` file and parse it; without file IO, this is impossible).

This option is rejected as impractical.

## Consequences

### Positive

- **Auditability.** The bootstrap is ~2400 LOC of pure Aether. A reader can audit it in an afternoon. The only external dependency is three host builtins (each ~10 LOC of host code, easy to audit).
- **Self-replication.** The bootstrap is the foundation for v4 self-replication. The three-builtin contract is small enough to be re-implemented in any host (Node, browser, WASM, x86 backend, a future bare-metal Aether runtime).
- **Portability.** The bootstrap runs on all four backends, because the three builtins are provided by each. The playground's "bootstrap" tab runs the bootstrap on the bytecode VM (the fastest backend with full stdlib support); the same code, with the same three builtins, runs on the tree-walker, the WASM backend, and the x86 backend.
- **Teaching value.** The bootstrap is a real compiler (lexer + parser), written in a real language (Aether), runnable in the playground. A student can read it, understand it, modify it, and see the results immediately. This is the kind of teaching artifact that "Build Your Own Lisp" or "Crafting Interpreters" aims at, but in a real language with real tooling.
- **Forward compatibility.** The bootstrap is the foundation for the v3.1 type checker, IR builder, and codegen, which will all be written in Aether (the second-pass port, Chapter 20 §20.6). The three-builtin contract is the seed of the v4 self-replicating compiler.

### Negative

- **Re-implements some stdlib.** The bootstrap has its own `dict` (a small hash map, ~50 LOC) for the keyword table; its own `list` (a cons list, ~30 LOC) for the token stream; its own string operations (slicing, length, concat, ~100 LOC) for the lexer. This is ~200 LOC of duplicated code, but it's *intentional* duplication: the bootstrap is meant to be self-contained.
- **Slower than the TypeScript host.** The bootstrap lexer/parser is ~2x slower than the TypeScript host lexer/parser (because Aether's tree-walker is ~100x slower than TypeScript, but the bootstrap does less work — it's only a lexer/parser, not a full compiler). For the playground's interactive use, this is fine (the bootstrap parses a 1000-line file in ~50ms vs the host's ~25ms).
- **No error recovery.** The bootstrap parser is a simple recursive-descent parser that panics on the first error (via `panic`). It doesn't recover and continue. A real compiler needs error recovery (report multiple errors per parse); the v3.1 plan is to add it.
- **No incremental parsing.** The bootstrap parses the whole file at once. No incremental parsing for LSP-style edits. The v3.1 plan is to add incremental parsing, dependent on the LSP (RFC-007).

### Mitigations

- For the duplicated stdlib: the bootstrap's `dict`, `list`, and string operations are intentionally simple (linear search, cons list, naive slicing). They're not meant to be fast; they're meant to be readable. The stdlib's `aether-dict`, `aether-list`, `aether-string` are the fast versions.
- For the speed: the bootstrap runs on the bytecode VM (the fast Aether runtime), not the tree-walker. The 2x slowdown is acceptable for a teaching artifact.
- For error recovery: the v3.1 plan is to add error recovery (RFC under discussion). The v3 bootstrap is a teaching artifact, not a production compiler; error recovery is a v3.1 concern.
- For incremental parsing: the v3.1 plan is to add it, dependent on the LSP.

## Reversibility

This decision is **not reversible** in the sense of "add more host builtins to the bootstrap." The three-builtin contract is part of the bootstrap's design; adding more builtins would break the auditability and the self-replication story. The decision is reversible in the sense of "use a different set of three builtins" — e.g., `read_file`, `print`, `read_stdin` instead of `read_file`, `print`, `panic`. That's a minor change, not a fundamental one.

## Cross-references

- [Chapter 16 self-hosting](../book/ch16-self-hosting.md) — the chapter walkthrough, with the 10+ examples.
- [ADR-08 stdlib as TypeScript functions](adr-08-stdlib-as-typescript-functions.md) — the v1 decision (stdlib in TypeScript), which the bootstrap's three-builtin contract is a deliberate counterweight to.
- [RFC-003 modules and packages](../rfcs/rfc-003-modules-and-packages.md) — the v2 module system, which the bootstrap uses (the bootstrap's `aether/bootstrap/lexer.ae`, `aether/bootstrap/parser.ae`, etc. are separate modules).
- [Chapter 20 the road ahead](../book/ch20-the-road-ahead.md) §20.6 — the v3.3 second-pass port (the bootstrap done right: full compiler in Aether).
- [RFC-012 package registry](../rfcs/rfc-012-package-registry.md) — the v3.2 package registry, which the bootstrap will be the first package published to.
