# ADR-01 — Tree-walking interpreter for v1

> Status: Accepted
> Date: 2023-09-15
> Decision-maker: Aether core team
> Supersedes: none
> Superseded by: (none yet; v2 bytecode VM RFC is at
> [../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md))

## Context

The first version of Aether needed an *execution backend* —
the part that takes a parsed program and runs it. The choice
of backend determines, more than almost any other single
decision, what the v1 language *feels like* to use, what it
can do, and how big the implementation has to be.

Three options were on the table:

1. **Tree-walking interpreter.** Walk the AST directly. Each
   AST node is a JavaScript object; each evaluation step is a
   method dispatch on the node's kind tag. No compilation
   step. No bytecode. No VM.
2. **Bytecode VM.** Lower the AST to a compact bytecode
   intermediate representation; execute the bytecode in a
   stack-based VM. Compilation is a separate step from
   execution.
3. **JIT compilation.** Lower the AST to JavaScript and let
   the host's JIT compile it to native code. Or use a JIT
   library like Cranelift or LLVM.

The constraints on the decision were:

- **Implementation size.** The v1 compiler had to fit in a
  single weekend of work. A bytecode VM is a 2-month project;
  a JIT is a year.
- **Browser runnable.** v1 had to run in the browser, in a
  single web page, with no install step. The user opens the
  playground and writes code. This ruled out solutions that
  required a server or a native binary.
- **Teaching value.** v1 is, in part, a teaching artifact.
  The implementation has to be readable by someone learning
  how languages work. A tree-walker is ~1000 lines and
  obvious; a VM is ~5000 lines and intricate.
- **Latency.** The playground's "Run" button has to feel
  instant. A compilation step adds latency; tree-walking has
  none.
- **Throughput.** Throughput (raw execution speed) was the
  lowest priority for v1. The playground is for small
  programs; throughput matters for production, which is v2.

## Decision

**Aether v1 uses a tree-walking interpreter.** The evaluator
lives in `aether/core/eval/eval.ts` and is about 1000 lines
of TypeScript. It walks the AST directly, using JavaScript
function dispatch to handle each AST node kind.

The evaluator has a step counter (default 1,000,000 steps)
that bounds how long a program can run. This prevents
infinite loops from hanging the browser tab.

The compiler pipeline is:

```
source → lex → parse → check → run
```

There is no bytecode stage. The AST that the parser produces
is the same AST that the evaluator walks.

## Alternatives considered

### Bytecode VM (the v2 plan)

A bytecode VM gives 10-100x better throughput than a
tree-walker, at the cost of a compilation step (latency) and
implementation complexity (lines of code). For v1, the
tradeoff was wrong: we cared more about latency and
implementation size than about throughput. For v2, the
tradeoff flips: production users care about throughput, and
we can hide the compilation latency behind an LSP. The v2
plan is at
[../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md).

### JIT to JavaScript

Lower the AST to JavaScript and use the host's JIT. This is
attractive because it gets the JIT for free, but it has
problems:

- The codegen is non-trivial (closures, captures, control
  flow all need careful lowering).
- The host's GC behavior leaks through in ways that are
  hard to predict (the GC pauses are the JS engine's
  pauses, not Aether's).
- Debugging is harder: stack traces show generated JS, not
  Aether source.

For v1, the simplicity of a tree-walker won.

### Native code via Cranelift / LLVM

Way out of scope for v1. The build infrastructure alone
(wasm-pack, target triples) is a multi-week project. v2
may revisit; v3 may do it for real.

## Consequences

### Positive

- **Tiny implementation.** The evaluator is ~1000 lines;
  the whole v1 compiler is ~5000. This is small enough to
  read in an afternoon and audit end-to-end.
- **Zero compilation latency.** The "Run" button feels
  instant. The playground can re-run on every keystroke if
  it wants to (it does not, but it could).
- **Browser-native.** The whole v1 implementation runs in
  the browser with no install step. This is a feature for
  the playground audience.
- **Easy to instrument.** The step counter, the Inspector's
  Steps tab, and the debugger are all straightforward to
  build on a tree-walker. A VM would need a separate debug
  info format.
- **Forward-compatible with v2.** The AST is the same; the
  v2 bytecode VM will lower the same AST to bytecode. No
  front-end rewrite.

### Negative

- **Slow.** A tree-walker is 100-1000x slower than native
  code. For tight loops, this is painful; for `fib(30)`, it
  exceeds the step limit.
- **Step limit.** The 1,000,000-step limit is a hard cap.
  Programs that need more either have to be rewritten (use
  `reduce` instead of recursion, use a closed form) or run
  with a higher limit (and risk UI freeze).
- **GC behavior.** The v1 GC is the host JavaScript runtime's
  GC. Pause times, allocation patterns, and heap layout are
  not under Aether's control. This is fine for the
  playground but would be a problem for production.
- **No `unsafe`.** A tree-walker cannot expose raw pointers
  or FFI. v2 will need a VM for these.

### Mitigations

- The step limit is configurable via `maxSteps`. Programs
  that need more headroom can bump it; programs that hit it
  get a clear panic.
- The [../tutorials/performance.md](../tutorials/performance.md)
  guide documents the v1 performance characteristics and
  teaches users how to write fast code within the limit.
- The [../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md)
  RFC sketches the v2 plan, which keeps the tree-walker for
  REPL/LSP/debug and adds a bytecode VM for production.

## Reversibility

This decision is **reversible**. The AST is the same; the v2
bytecode VM will lower the same AST. The tree-walker remains
for REPL/LSP/debug scenarios where latency matters more than
throughput.

## Cross-references

- [../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md)
  — the v2 bytecode VM plan.
- [../spec/09-compiler-pipeline.md](../spec/09-compiler-pipeline.md)
  §2.9 — the spec section for the evaluator.
- [../tutorials/performance.md](../tutorials/performance.md)
  — performance characteristics of the tree-walker.
- [../decisions/adr-10-browser-runnable-core.md](adr-10-browser-runnable-core.md)
  — the browser constraint that drove this decision.
- [../decisions/adr-09-vitest-for-implementation-tests.md](adr-09-vitest-for-implementation-tests.md)
  — how the tree-walker is tested.
