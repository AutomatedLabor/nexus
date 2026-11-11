# ADR-10 — Browser-runnable core

> Status: Accepted
> Date: 2023-09-15
> Decision-maker: Aether core team
> Supersedes: none
> Superseded by: none

## Context

The Aether v1 user surface is the playground — a web page. The whole compile-and-run cycle has to fit in the browser: there is no install step, no `aether` binary, no server-side compilation, no native binary download. The user opens the URL and writes code.

This single constraint — *the whole compiler has to run in the browser* — drove a surprising number of downstream decisions: implementation language (JS/TS, not Rust); binary size (~1 MB max); synchronous-feeling runtime (single Run click → single result); no main-thread hangs (step limit + Web Worker); instant-feeling compile (under 100ms, no server roundtrip).

The options for the runtime location were:

1. **Pure browser.** The compiler and runtime are both TypeScript, both run in the browser (in a Web Worker). No server-side component. The user opens the URL and the entire tool is downloaded once.
2. **Server-side compiler, browser UI.** The compiler runs on a Node.js server; the browser sends source code, the server compiles and runs, the browser displays the result. Like CodeSandbox or Replit's hosted mode.
3. **Wasm-compiled compiler.** The compiler is written in Rust/OCaml/C++ and compiled to wasm; the browser loads the wasm module and runs the compiler in-wasm.

## Decision

**Aether v1 is a pure browser implementation.** The compiler (`aether/core/`) and the stdlib (`aether/stdlib/`) are TypeScript modules. The playground app (`src/app/`) imports the compiler via a Web Worker (`src/lib/aether-worker.ts`); the worker calls `compileAndRun(source, opts)` and posts the `CompileResult` back to the main thread. The browser downloads the entire tool once (the Next.js bundle includes the Aether compiler); subsequent runs are local, no network roundtrips.

The evaluator's `maxSteps` (default 1,000,000) bounds execution time so a runaway program can't freeze the worker. The Benchmarks view uses 50,000,000 because the canned benchmarks are known-bounded; the playground's default uses 1,000,000 to keep the worst-case latency under a second on a slow phone.

## Alternatives considered

### Server-side compiler (option 2)

The compiler runs on a Node server; the browser is a thin client. Advantages: the compiler can be any language; the compile step can be more expensive; the server can cache results, share programs, persist user state.

Disadvantages for v1: server cost (traffic spikes need capacity); latency (every Run is a network roundtrip); no offline; privacy (source is sent to the server); operational complexity (deploy, monitor, scale, patch).

For v1, the pure-browser approach won on every axis. For v2, the server may be added for cloud-save and Share-with-short-URL — the *core* compile stays in the browser; the server is only for persistence.

### Wasm-compiled compiler (option 3)

The compiler is written in Rust/OCaml, compiled to wasm, loaded as a wasm module. Advantages: faster pattern matching, more correct-by-construction (Rust's type system), a closed black box that's easy to deploy.

Disadvantages for v1:

- **Build complexity.** Setting up `wasm-pack` and integrating with Next.js's bundler is non-trivial. The host app stays in JavaScript; the wasm module is a separate build.
- **FFI overhead.** Every call from JavaScript to wasm has a marshaling cost. The compile pipeline makes many small calls; FFI overhead may dominate the compile time.
- **Implementation size.** A Rust compiler of equivalent functionality would be larger (in source lines) than the TypeScript one — Rust's verbosity plus the FFI glue.
- **Debugging.** Stack traces in wasm are worse than in TypeScript. The v1 implementation is still being debugged.
- **The teaching story.** The implementation should be readable by someone learning how languages work. TypeScript is more accessible than Rust.

For v2, when the bytecode VM lands (see [../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md)), we may revisit wasm — the VM has tighter performance requirements and the build pipeline will already be more complex. For v1, the TypeScript implementation is the right choice.

### Hand-written in JS, no framework

The compiler is plain JavaScript (not TypeScript); the playground is plain HTML + a `<script>` tag. This would be the smallest possible implementation. The downside: no types on the compiler means bugs TypeScript catches at compile time would only surface at runtime; no React means the playground UI would be hand-rolled DOM manipulation, which is more code than the React equivalent.

For v1, the React + TypeScript approach is the right balance of correctness, ergonomics, and implementation size.

## Consequences

### Positive

- **Zero marginal cost.** Every user's run is local; the server is a static file host (Next.js on a CDN). Traffic spikes cost nothing.
- **Offline.** Once the playground is loaded, it works without a network.
- **Privacy.** The source never leaves the browser (except for the Share URL, which the user explicitly opts into).
- **Latency.** Run is sub-millisecond to start; compile itself takes 1–50ms depending on program size.
- **Deployable as a static site.** The Next.js bundle can be statically exported.

### Negative

- **Bundle size.** The Aether compiler is ~200 KB minified; the framework + UI adds another ~500 KB. Total under 1 MB gzipped.
- **No server features.** No user accounts, no persisted programs, no shared snippets (other than Share URLs). v2 adds some; the architecture is compatible.
- **Browser JS engine dependence.** GC, strings, numbers, regex are the host engine's. Aether tries to be portable, but edge cases can differ.
- **No `unsafe`, no FFI.** The runtime can't call into C or system libraries. v2 will add an FFI for the bytecode VM.

## Mitigations

- The playground's Web Worker (`src/lib/aether-worker.ts`) keeps the main thread responsive even if the evaluator wedges. The worker can be terminated from the main thread.
- The `maxSteps` limit caps the worst-case execution time. The default (1M) is tuned for ~50ms worst-case on a fast desktop, ~500ms on a slow phone. The Benchmarks view uses 50M for known-bounded programs.
- The `package.json` pins specific versions of every dependency, so the bundle is deterministic.
- The v2 plan keeps the compiler in TypeScript (it's working) and adds server-side features alongside it (cloud-save, Share-with-short-URL, package registry). The browser-runnable core stays; the server is additive.

## Reversibility

The decision is **partially reversible**. Moving the compiler to a server (option 2) would be a substantial refactor but not a rewrite — the TypeScript compiler would run on a Node server instead of in a browser. Moving to wasm (option 3) would be a rewrite (Rust or OCaml implementation of the compiler), but the AST shape and the public API (`compileAndRun` returning a `CompileResult`) would stay the same.

The v2 plan does not propose either switch. The TypeScript implementation in the browser is working.

## Cross-references

- [../decisions/adr-01-tree-walking-interpreter-for-v1.md](adr-01-tree-walking-interpreter-for-v1.md) — the tree-walker decision, which leans on the browser-runnable constraint.
- [../decisions/adr-08-stdlib-as-typescript-functions.md](adr-08-stdlib-as-typescript-functions.md) — the stdlib-in-TypeScript decision, which depends on the browser-runnable constraint.
- [../decisions/adr-05-no-modules-in-v1.md](adr-05-no-modules-in-v1.md) — the no-modules decision, which depends on the browser constraint (no file system access).
- [../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md) — the v2 bytecode VM plan, which may revisit the wasm question.
- [../tutorials/tooling.md](../tutorials/tooling.md) § 8 — the playground tech stack.
