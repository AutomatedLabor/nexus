# ADR-25 — All four runtimes coexist

> Status: Accepted
> Date: 2026-11-12
> Decision-maker: Aether core team
> Related: [Chapter 14 the WASM backend](../book/ch14-the-wasm-backend.md), [Chapter 15 the x86 backend](../book/ch15-the-x86-backend.md), [Chapter 9 the bytecode VM](../book/ch09-the-bytecode-vm.md), [ADR-01 tree-walking interpreter for v1](adr-01-tree-walking-interpreter-for-v1.md), [ADR-15 v2 keeps tree-walker](adr-15-v2-keeps-tree-walker.md), [RFC-002 bytecode VM](../rfcs/rfc-002-bytecode-vm.md), [RFC-006 WASM backend](../rfcs/rfc-006-wasm-backend.md)

## Context

Aether v3 ships four runtimes: the tree-walker (v1), the bytecode VM (v2), the WASM backend (v3), and the x86 backend (v3). All four are maintained, all four are tested, all four are exposed in the playground (the "Runtime mode" toggle), and all four produce the same answer on the canonical `fib(10) = 55` benchmark. The 2366-test suite passes on all four (with documented exceptions: the tree-walker doesn't support coroutine frames; the x86 backend's `match` on float returns 0; the bytecode VM has 13/15 parity with the tree-walker on edge cases).

This is a deliberate choice. The simpler alternative would have been to ship only one runtime (the fastest, say, the x86 backend) and deprecate the others. We didn't.

The four runtimes:

1. **Tree-walker (v1).** Walks the AST directly; each AST node is a JavaScript function call; no compilation step. ~1000 LOC in `aether/core/eval/eval.ts`. Used for: REPL, LSP, debug, fast feedback in the playground. Throughput: ~100x slower than the v2 VM. Latency: zero compile time.
2. **Bytecode VM (v2).** Lowers the AST to a compact bytecode; dispatches in a register-based interpreter. ~2000 LOC in `aether/vm/vm.ts`. Used for: production runs, async (coroutine frames), benchmarks that need 10-100x throughput. Throughput: ~10x faster than the tree-walker. Latency: 10-100ms compile time.
3. **WASM backend (v3).** Lowers the IR to WebAssembly; runs in the browser's WASM engine. ~1500 LOC in `aether/vm/wasm/wasm.ts`. Used for: in-browser near-native speed; the playground's "Run WASM" button. Throughput: ~1.6x faster than the v2 VM (3.9x over the tree-walker). Latency: 50-200ms compile time.
4. **x86 backend (v3).** Lowers the IR to NASM-syntax x86-64; runs in a structured interpreter. ~1800 LOC in `aether/vm/x86/x86.ts`. Used for: the playground's "Run x86" button; teaching (the user sees the x86 instructions). Throughput: ~3.5x faster than the v2 VM. Latency: 50-200ms compile time.

Three options were on the table:

1. **Keep only the tree-walker.** Simplest; one runtime; no compile step. Pros: tiny implementation; zero compile latency. Cons: 100x slower than the v2 VM; can't do async (no suspend/resume); can't do production workloads.
2. **Keep the tree-walker and the bytecode VM.** Two runtimes; the v2 model. Pros: production throughput (the VM) and interactive latency (the tree-walker); the v2 model. Cons: doesn't get the WASM speedup; doesn't get the x86 teaching value.
3. **Keep all four runtimes.** The v3 model. Pros: maximum flexibility (the user picks the runtime per use case); the playground showcases all four; the WASM and x86 backends are real research artifacts. Cons: 4x the maintenance; 4x the test surface; bugs in one vs. the other are possible (the conformance suite catches discrepancies).

The constraints on the decision were:

- **Use case coverage.** Different runtimes serve different use cases. The tree-walker is best for the REPL (zero compile latency). The bytecode VM is best for production runs (10x throughput, async support). The WASM backend is best for in-browser near-native speed (3.9x speedup). The x86 backend is best for teaching (the user sees the x86 instructions). Killing any runtime kills its use case.
- **Teaching value.** The playground's "Runtime mode" toggle is a teaching artifact: the user can run the same program on all four runtimes and see the difference. Killing any runtime reduces the teaching value.
- **Research artifact.** The four runtimes are a research artifact (this is what a research language is for). Killing any runtime reduces the research artifact.
- **Maintenance cost.** Four runtimes are 4x the maintenance of one. The 2366-test suite has to pass on all four; bugs in one vs. the other are caught by the conformance suite. The maintenance cost is real.
- **Conformance.** The same Aether program must run identically on all four runtimes (modulo documented quirks: the tree-walker doesn't support coroutine frames; the x86 backend's `match` on float returns 0; the bytecode VM has 13/15 parity with the tree-walker on edge cases). The conformance suite enforces this.

## Decision

**The v3 ships all four runtimes, all maintained, all tested, all exposed in the playground.** The user picks the runtime per use case (via the playground's "Runtime mode" toggle, or via the `compileAndRun(source, { runtime })` API).

The use cases:

| Runtime      | Best for                        | Speedup over v2 VM | Compile latency |
|--------------|---------------------------------|--------------------|------------------|
| Tree-walker  | REPL, LSP, debug, fast feedback | 0.1x               | 0                |
| Bytecode VM  | Production runs, async          | 1x                 | 10-100ms         |
| WASM backend | In-browser near-native         | 1.6x               | 50-200ms         |
| x86 backend  | Teaching (x86 visibility)      | 3.5x               | 50-200ms         |

The conformance rule: the same Aether program must produce the same answer on all four runtimes, modulo documented quirks. The 2366-test suite has a conformance layer that runs each test on all four runtimes and compares the outputs. The documented quirks (the tree-walker doesn't support coroutine frames; the x86 backend's `match` on float returns 0; the bytecode VM has 13/15 parity with the tree-walker on edge cases) are exceptions, listed in the spec and in the playground's UI.

The maintenance cost is real: ~4x the implementation, ~4x the tests, ~4x the bug surface. The 2366 tests pass on all four runtimes; the conformance layer catches discrepancies. The runtime teams are small (one engineer per runtime, plus a shared front-end team that maintains the lexer/parser/type-checker shared by all four).

## Alternatives considered

### Keep only the tree-walker

Simplest. Pros: tiny implementation; zero compile latency. Cons:

- **No throughput.** 100x slower than the v2 VM. Real programs (the database, the web-framework, the regex-engine in Chapter 19) are too slow on the tree-walker.
- **No async.** The tree-walker can't suspend/resume (the JS call stack can't be captured). Async is JS Promises only.
- **No production.** The tree-walker has a 1M-step limit; real programs hit it.

This option is rejected. The tree-walker is kept as one of four, not as the only one.

### Keep the tree-walker and the bytecode VM (the v2 model)

Two runtimes. Pros: production throughput + interactive latency. Cons:

- **No WASM speedup.** The v2 VM is 10x faster than the tree-walker but 1.6x slower than the WASM backend. The playground's in-browser experience is worse without WASM.
- **No x86 teaching.** The x86 backend is a teaching artifact; without it, the playground can't show the user what their Aether code lowers to in x86.
- **Less research.** The v3 milestone is a research artifact; two runtimes is less than four.

This option is rejected. The v2 model was the v2 milestone; the v3 milestone goes beyond.

### Keep all four runtimes — accepted

Maximum flexibility, maximum teaching value, maximum research. The maintenance cost is real but sustainable (the 2366-test suite is the safety net; the runtime teams are small).

## Consequences

### Positive

- **Use case coverage.** Each runtime serves its use case. The REPL is instant (tree-walker); production is fast (bytecode VM); in-browser is near-native (WASM); teaching shows the x86 (x86 backend). No use case is sacrificed.
- **Teaching value.** The playground's "Runtime mode" toggle is a unique teaching artifact: the user runs the same program on four runtimes and sees the difference (the tree-walker's trace, the bytecode VM's instruction stream, the WASM module, the x86 assembly). No other language playground has this.
- **Research artifact.** The four runtimes are a research artifact, demonstrating that Aether's IR is a good host for multiple backends (the same IR lowers to bytecode, WASM, and x86). This is the kind of demonstration that PL researchers value.
- **Conformance.** The 2366-test suite's conformance layer catches discrepancies. The runtime teams have to fix bugs in their runtime to match the others; this drives quality.
- **Forward compatibility.** The v3.1 plan (ARM64, RISC-V) and the v3.2 plan (JIT) extend the runtime set. The four-runtimes-coexist decision is the foundation for adding more.

### Negative

- **4x maintenance.** Four runtimes are 4x the implementation, 4x the tests, 4x the bug surface. The 2366-test suite passes on all four; the maintenance is real but sustainable.
- **Conformance bugs.** The same Aether program may produce different answers on different runtimes (the documented quirks). The user has to know which quirks apply to which runtime. The playground's UI shows the runtime mode; the spec lists the quirks.
- **Bundle size.** The playground's bundle includes all four runtimes (~500 KB total). The tree-walker is ~50 KB; the bytecode VM is ~100 KB; the WASM backend is ~150 KB; the x86 backend is ~200 KB. The total is acceptable for a research playground; it would be too large for a production app.
- **Cognitive load.** The user has to choose a runtime. The playground's UI makes this easy (the "Runtime mode" toggle), but it's an extra choice. A future "auto" mode (v3.1) could pick the runtime based on the program (small program → tree-walker; long-running → VM; benchmark → WASM; teaching → x86).

### Mitigations

- For the 4x maintenance: the runtime teams are small (one engineer per runtime). The shared front-end (lexer, parser, type checker, IR builder, optimizer) is one team. The maintenance is sustainable.
- For the conformance bugs: the spec lists the quirks; the playground's UI shows the runtime mode. The user knows what they're getting.
- For the bundle size: the playground loads runtimes on demand (the tree-walker is always loaded; the bytecode VM, WASM backend, and x86 backend are lazy-loaded). The initial bundle is ~150 KB; the total is ~500 KB.
- For the cognitive load: the v3.1 plan is to add an "auto" mode (RFC under discussion) that picks the runtime based on the program. The user can opt out (pick a specific runtime).

## Reversibility

This decision is **not reversible** in the sense of "kill a runtime." Each runtime has its use case; killing it kills the use case. The decision is reversible in the sense of "add more runtimes" — that's the v3.1 (ARM64, RISC-V) and v3.2 (JIT) plan.

## Cross-references

- [Chapter 14 the WASM backend](../book/ch14-the-wasm-backend.md) — the WASM backend chapter.
- [Chapter 15 the x86 backend](../book/ch15-the-x86-backend.md) — the x86 backend chapter.
- [Chapter 9 the bytecode VM](../book/ch09-the-bytecode-vm.md) — the bytecode VM chapter.
- [Chapter 2 your first program](../book/ch02-your-first-program.md) — the tree-walker, used for the first program.
- [ADR-01 tree-walking interpreter for v1](adr-01-tree-walking-interpreter-for-v1.md) — the v1 decision (tree-walker).
- [ADR-15 v2 keeps tree-walker](adr-15-v2-keeps-tree-walker.md) — the v2 decision (keep the tree-walker alongside the VM).
- [ADR-16 WASM via host calls](adr-16-wasm-via-host-calls.md) — the WASM backend's host-call decision.
- [ADR-17 x86 structured interpreter](adr-17-x86-structured-interpreter.md) — the x86 backend's structured-interpreter decision.
- [RFC-002 bytecode VM](../rfcs/rfc-002-bytecode-vm.md) — the v2 RFC.
- [RFC-006 WASM backend](../rfcs/rfc-006-wasm-backend.md) — the v3 WASM RFC.
- [RFC-009 ARM64 backend](../rfcs/rfc-009-arm64-backend.md) — the v3.1 ARM64 RFC.
- [RFC-010 RISC-V backend](../rfcs/rfc-010-riscv-backend.md) — the v3.1 RISC-V RFC.
- [RFC-011 JIT compiler](../rfcs/rfc-011-jit-compiler.md) — the v3.2 JIT RFC.
