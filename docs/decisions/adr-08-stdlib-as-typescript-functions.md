# ADR-08 — Stdlib as TypeScript functions

> Status: Accepted
> Date: 2023-09-15
> Decision-maker: Aether core team
> Supersedes: none
> Superseded by: none

## Context

Aether v1 needed a *standard library*: the set of functions
available to every program (string operations, math, I/O,
collections, etc.). The question was: what language are
stdlib functions written in?

The options were:

1. **Aether itself.** Write the stdlib in Aether. Compile
   it once and bundle the AST or bytecode with the
   compiler.
2. **TypeScript (the host language).** Write the stdlib
   in TypeScript, exposing each function via a
   `registerBuiltin` hook that the evaluator calls.
3. **A mix: core types in Aether, helpers in TypeScript.**
   For example, `Option` and `Result` are Aether enums
   (declared in the prelude); `string.split` is a
   TypeScript function.

The constraints on the decision were:

- **Implementation size.** Writing the stdlib in Aether
  means writing a lot of Aether code (which is slower to
  write than TypeScript, because the language is younger
  and less ergonomic). It also means the compiler has to
  compile the stdlib at startup.
- **Performance.** Aether v1 is a tree-walker; stdlib
  functions written in Aether would be slow (each
  function call is 5-20 steps). Stdlib functions written
  in TypeScript run at native JS speed.
- **Teaching value.** v1 is, in part, a teaching artifact.
  A stdlib written in Aether would be a great teaching
  example. A stdlib written in TypeScript is invisible to
  the user (they just call the functions).
- **Forward-compatibility with v2.** The v2 plan is a
  bytecode VM. Stdlib functions written in TypeScript can
  be exposed to the VM via an FFI; stdlib functions written
  in Aether can be compiled to bytecode. Either is
  possible; neither is foreclosed by the v1 choice.

## Decision

**Aether v1's stdlib is written in TypeScript.** Each
stdlib module is a TypeScript file in
`aether/stdlib/<module>/index.ts`. The file exports a
`register` function that takes a `registerBuiltin(name,
fn)` hook and registers each function under its Aether
name.

The core types (`Option`, `Result`) are declared as Aether
enums in the prelude (a special source string that the
evaluator evaluates at startup). User-defined types in
Aether are Aether declarations; builtin functions in
Aether are TypeScript implementations.

A small set of *inline builtins* are hardcoded in the
evaluator (`aether/core/eval/eval.ts`): `print`, `println`,
`range`, `len`, `type_of`, `assert`, `assert_eq`, `panic`,
`str`, `int`, `float`, `min`, `max`, `abs`, `sqrt`, `push`,
`pop`, `map`, `filter`, `reduce`. These are the most-used
functions; they are inlined because they need to call
Aether closures (via the evaluator's `callValue`), which
the stdlib versions cannot do.

## Alternatives considered

### Stdlib in Aether (option 1)

Writing the stdlib in Aether would be a great teaching
artifact. It would also be slow (each function call is a
tree-walk), and it would require the compiler to compile
the stdlib at startup (added latency). For v1, the
tradeoff was wrong: performance and implementation speed
won.

For v2, with the bytecode VM, the tradeoff may flip: the
stdlib in Aether, compiled to bytecode, would be fast
enough and a great teaching artifact. The v2 plan keeps
this option open; see
[../spec/12-stdlib.md](../spec/12-stdlib.md).

### Mix (option 3, the chosen approach for some functions)

The `Option` and `Result` enums are Aether declarations in
the prelude (a special source string the evaluator runs at
startup). The string/array/map operations are TypeScript.
The inline builtins (`print`, `map`, `reduce`, etc.) are
TypeScript functions hardcoded in the evaluator.

This mix is the right balance: the things that need to be
Aether types are Aether types; the things that need to be
fast are TypeScript; the things that need to call closures
are inlined.

## Consequences

### Positive

- **Fast.** Stdlib functions run at native JS speed. A
  `map(arr, fn)` is a JavaScript `for` loop with a
  closure call, not a tree-walk over a `for` AST.
- **Small implementation.** The stdlib is ~3000 lines of
  TypeScript, much of it is one-liner wrappers around
  JavaScript built-ins (`s.trim()`, `Math.abs(n)`, etc.).
- **Easy to extend.** Adding a stdlib function is
  writing a TypeScript function and adding it to a
  `register` call. No AST changes; no parser changes.
- **Forward-compatible with v2.** The v2 bytecode VM can
  call the same TypeScript functions via an FFI; the
  Aether-declared types (`Option`, `Result`) compile to
  bytecode. No stdlib rewrite needed.

### Negative

- **Not a teaching artifact.** The stdlib is invisible to
  the user; they cannot read it to learn how Aether
  works. The evaluator itself (in
  `aether/core/eval/eval.ts`) is the teaching artifact,
  not the stdlib.
- **FFI boundary.** Each stdlib function is a JavaScript
  function called from the Aether evaluator. The
  boundary is a `any`-typed FFI: arguments and return
  values are untyped at the call site. Bugs in the
  stdlib (wrong type assumptions) are not caught at
  compile time.
- **Naming collisions.** A small number of stdlib
  functions share a name with the evaluator's inline
  builtins (`print`, `len`, `map`, `filter`, `reduce`,
  `min`, `max`, `abs`, `sqrt`, `push`, `pop`). The
  inline builtins win because they are written last.
  This is documented in `aether/stdlib/index.ts`.
- **No type-level stdlib.** The stdlib is all functions;
  there are no stdlib-defined types in v1 (other than
  `Option` and `Result` in the prelude). The v2 plan
  adds stdlib types like `List<T>`, `Channel<T>`,
  `Future<T>`.

## Mitigations

- The stdlib modules each have a `MANIFEST` object that
  lists every function's name, signature, and description.
  The playground uses this manifest for autocomplete (when
  it ships in v2).
- The evaluator's inline builtins are documented in
  [../tutorials/stdlib-tour.md](../tutorials/stdlib-tour.md)
  §2 (naming collisions) and in the inline comments in
  `aether/core/eval/eval.ts`.
- The v2 plan includes a `docgen` tool that produces API
  documentation from the stdlib's `MANIFEST` objects; see
  [../spec/13-tooling.md](../spec/13-tooling.md).

## Reversibility

The decision is **reversible but not free**. Switching
the stdlib to Aether (option 1) would mean rewriting ~3000
lines of TypeScript in Aether. The compiler would need to
compile the stdlib at startup; the evaluator would run
the stdlib as Aether code (slower). The v2 plan does not
propose this switch; the TypeScript implementation is
working.

The mix (option 3) is the current shape; we extend it
incrementally as needed.

## Cross-references

- [../spec/12-stdlib.md](../spec/12-stdlib.md) — the stdlib
  spec.
- [../tutorials/stdlib-tour.md](../tutorials/stdlib-tour.md)
  — the stdlib tutorial with examples.
- [../decisions/adr-01-tree-walking-interpreter-for-v1.md](adr-01-tree-walking-interpreter-for-v1.md)
  — the tree-walker decision that makes the TypeScript
  stdlib a natural fit.
- [../decisions/adr-10-browser-runnable-core.md](adr-10-browser-runnable-core.md)
  — the browser constraint that drives the TypeScript
  implementation language.
