# RFC-011 — Tiered JIT compiler

> Status: Draft
> Stage: 0 (Proposal)
> Discussion: open
> Related: [Chapter 9 the bytecode VM](../book/ch09-the-bytecode-vm.md), [Chapter 15 the x86 backend](../book/ch15-the-x86-backend.md), [RFC-009 ARM64 backend](rfc-009-arm64-backend.md), [RFC-010 RISC-V backend](rfc-010-riscv-backend.md), [ADR-17 x86 structured interpreter](../decisions/adr-17-x86-structured-interpreter.md), [Formal proof 10 JIT correctness](../formal/proofs/10-jit-correctness.md)

## Summary

Aether v3.2 adds a tiered JIT (just-in-time) compiler, the seventh runtime. The JIT monitors the v2 bytecode VM and the structured interpreters (x86, ARM64, RISC-V); when a function is detected "hot" (called more than N times or running more than M fuel), the JIT compiles the function to native x86/ARM64/RISC-V code in an in-memory buffer, marks the buffer executable (where the sandbox allows; the v3.2 playground runs in a non-sandboxed Worker that allows `mmap` with `PROT_EXEC`), and dispatches future calls directly to the native code. Deopt (falling back to the structured interpreter when an assumption is violated) is supported via a side-table that maps each JIT-compiled instruction to the structured-interpreter IP that resumes it.

The expected speedup over the v2 VM is **10-30x** (and over the structured interpreters, **3-10x**). On the canonical `fib(25)` benchmark, the v2 VM runs in ~50ms, the x86 structured interpreter in ~25ms, and the projected JIT in ~5ms — a 10x speedup over the v2 VM and a 5x speedup over the structured interpreter. The JIT is the v3.2 capstone: it closes the gap to "real native code" for hot loops.

This RFC specifies the tiering model, the profiling, the codegen, the deopt mechanism, the in-memory buffer management, the security model (the sandbox constraint), and the relationship to the existing runtimes.

## Motivation

The v3 milestone shipped four runtimes; the v3.1 milestone adds ARM64 and RISC-V (six total). The structured interpreters (x86, ARM64, RISC-V) are 3-4x faster than the v2 VM, but they're *simulators* — each simulated instruction is ~100 ns of JavaScript work. Real native code (the v4 AOT compiler) is 2-3x faster than the structured interpreters. The JIT is the in-between: compile the hot functions to real native code, on the fly, and run them at near-AOT speed.

The motivation is threefold:

1. **Performance.** The structured interpreters are 3-4x faster than the v2 VM. The JIT is another 3-10x faster than the structured interpreters. For real workloads (the database, the web-framework, the regex-engine in Chapter 19), the JIT closes the gap to "real native code" for hot loops.
2. **The playground's "Run" button.** The playground's "Run" button currently runs the v2 VM (the default). The v3.2 plan is to default to the JIT, so the playground's "Run" button is 10-30x faster than the v2 VM, with no user action. The "Runtime mode" toggle still allows the user to pick the v2 VM (for debugging) or the structured interpreters (for teaching).
3. **The v4 AOT foundation.** The JIT's codegen is the same codegen the v4 AOT compiler will use. The JIT is the testbed for the v4 codegen: by running the JIT in the playground, we validate the codegen on real workloads before committing to the v4 AOT compiler.

The motivation is *not* "match the v2 VM" — the v2 VM is the baseline. The motivation is "match real native code for hot loops, without leaving the playground."

## Detailed design

### The tiering model

The JIT is tiered: tier 0 is the v2 VM (interpret), tier 1 is the structured interpreter (the x86/ARM64/RISC-V backend, simulating the native code), tier 2 is the JIT (real native code).

```
                       ┌──────────────────────────────┐
                       │                              │
                       │  v2 VM (tier 0)              │
                       │  ~50 ns/instruction          │
                       │                              │
                       └──────────────────────────────┘
                                     │
                                     │ function called > N=100 times
                                     │ or running > M=10K fuel
                                     ▼
                       ┌──────────────────────────────┐
                       │                              │
                       │  Structured interpreter     │
                       │  (tier 1)                    │
                       │  ~100 ns/instruction         │
                       │  + profiling                  │
                       │                              │
                       └──────────────────────────────┘
                                     │
                                     │ function called > N'=1000 times
                                     │ or running > M'=100K fuel
                                     │ AND profile is stable
                                     ▼
                       ┌──────────────────────────────┐
                       │                              │
                       │  JIT (tier 2)                │
                       │  ~3-10 ns/instruction         │
                       │  + deopt side-table          │
                       │                              │
                       └──────────────────────────────┘
```

The tiering is:
1. **Tier 0 (v2 VM).** All functions start here. The VM runs the function; a side-counter tracks how many times the function is called and how much fuel it consumes.
2. **Tier 1 (structured interpreter).** When the function's counter exceeds the tier-1 threshold (N=100 calls or M=10K fuel), the function is "promoted" to tier 1. The structured interpreter runs the function (with the same instruction-selection, register-allocation, and codegen as the v3.1 backends); a profiler records the types of the operands (for type-specialization) and the branch frequencies (for branch-layout optimization).
3. **Tier 2 (JIT).** When the tier-1 counter exceeds the tier-2 threshold (N'=1000 calls or M'=100K fuel), and the profile is stable (the operand types haven't changed in the last 100 calls), the function is "promoted" to tier 2. The JIT compiles the function to native x86/ARM64/RISC-V code, marks the buffer executable, and dispatches future calls directly to the native code.

The deopt: if a tier-2 function's assumption (e.g., "the operand is always int") is violated (the operand is now a float), the JIT deopts — falls back to tier 1, re-runs the function from the current IP, and re-profiles. The deopt side-table maps each JIT-compiled instruction to the tier-1 IP that resumes it.

### The profiling

The profiler records, for each function:

- **Call count.** How many times the function has been called.
- **Fuel consumed.** How much fuel the function has consumed (a proxy for runtime).
- **Operand types.** For each operand of each instruction, the type of the value (int, float, bool, string, array, etc.). Used for type-specialization (the JIT emits `i64 add` if the operand is always int; `f64 add` if it's always float; a polymorphic dispatch if it varies).
- **Branch frequencies.** For each branch, how often each side is taken. Used for branch-layout optimization (the JIT lays out the hot path first, the cold path second).
- **Inline cache hits.** For each call site, the receiver type (the "monomorphic" case) and the call target. Used for inline caching (the JIT patches the call site to a direct call to the monomorphic target).

The profiler runs in tier 1 (the structured interpreter), with ~10% overhead. The profile is sampled (every 10th call is profiled; the rest are not), reducing the overhead to ~1%.

### The codegen

The JIT codegen is the same codegen as the v3.1 structured interpreters, with two extensions:

1. **Type-specialization.** The JIT emits type-specific instructions (e.g., `i64 add` vs `f64 add`), based on the profile.
2. **Inline caching.** The JIT patches call sites to direct calls to the monomorphic target, with a fallback to the lookup if the type changes.

The codegen produces a buffer of native code (x86, ARM64, or RISC-V, depending on the host), which is marked executable and dispatched to.

The codegen is in `aether/vm/jit/codegen.ts` (~2000 LOC, shared across the three ISAs with ISA-specific backends). The x86 backend is the most mature (it reuses the v3.1 x86 backend's instruction selection); the ARM64 and RISC-V backends are new (built on the v3.1 ARM64 and RISC-V backends).

### The deopt mechanism

The deopt side-table maps each JIT-compiled instruction to the tier-1 IP that resumes it. The table is:

```
JIT instruction → tier-1 IP, register state mapping
```

When a JIT-compiled function needs to deopt (because an assumption is violated), the runtime:

1. Looks up the current JIT instruction in the side-table.
2. Restores the tier-1 register state from the mapping (the JIT registers and the tier-1 registers may have different layouts).
3. Jumps to the tier-1 IP.
4. The structured interpreter takes over, re-runs the function from the deopt point, and re-profiles.

The deopt is rare in steady state (the profile is stable, the assumptions hold), but it's the safety net that makes the JIT correct. Without deopt, the JIT would have to either (a) be conservative (no specialization, no speedup) or (b) be unsound (incorrect results when an assumption is violated).

The formal correctness proof (proof 10 in the formal corpus) is the JIT-correctness proof: the JIT-compiled code has the same behavior as the structured interpreter, modulo the deopt points. The proof is the hardest of the 10 (the deopt table has to be shown correct for every deopt point), and the v3.2 milestone includes the proof's mechanization (RFC-013).

### The in-memory buffer management

The JIT allocates a `WebAssembly.Memory` (or a `SharedArrayBuffer` in v3.2 with cross-worker JIT) for the JIT-compiled code. The buffer is marked executable (via `mmap` with `PROT_EXEC` on non-sandboxed runtimes, or via a custom WASM module on sandboxed runtimes).

The v3.2 playground runs in a Vercel Worker (not the sandboxed V8 edge runtime), which allows `mmap` with `PROT_EXEC`. The Worker is the JIT's host; the JIT's compiled code runs in the Worker's process. The browser sandbox doesn't allow this (the same constraint as the structured interpreters); the v3.2 playground detects the sandbox and falls back to the structured interpreter (tier 1) if the JIT is not available.

The buffer is managed with a bump allocator: each JIT-compiled function gets a chunk; the chunk is freed when the function is deopted (and re-JIT-compiled with a new assumption) or when the function is GC'd (the function's code is freed when the function is no longer referenced). The bump allocator is simple; fragmentation is handled by a "compaction" pass that runs every ~1000 JIT-compilations.

### The security model

The JIT runs in a non-sandboxed Worker (the v3.2 playground's Worker); the Worker can `mmap` with `PROT_EXEC`. The browser sandbox doesn't allow this; the v3.2 playground detects the sandbox and falls back to the structured interpreter.

The security concern: JIT-compiled code is machine code, which can be anything (including exploits). The JIT's codegen is trusted (it's the v3.2 Aether JIT codegen, audited); the JIT-compiled code is the output of the codegen, not user-supplied. The user's Aether source is compiled to IR, the IR is JIT-compiled to native code, the native code is the JIT's output. There's no path for the user to inject arbitrary machine code (the IR is type-checked, the codegen is trusted, the buffer is writable only by the JIT).

The formal correctness proof (proof 10) is the safety guarantee: the JIT-compiled code has the same behavior as the structured interpreter. The proof covers the codegen (the codegen is correct), the deopt (the deopt is correct), and the buffer management (the buffer is not corrupted by the JIT).

## Alternatives considered

### Stay with the structured interpreters (no JIT)

The structured interpreters are 3-4x faster than the v2 VM. The v3.1 milestone ships them. The v3.2 milestone could just polish the structured interpreters (add floating-point, add SIMD) and skip the JIT. Pros: less work; no JIT complexity. Cons:

- **No real native speed.** The structured interpreters are simulators; the JIT is real native code. The 3-10x speedup is real.
- **No v4 foundation.** The v4 AOT compiler needs the codegen; the JIT is the testbed.
- **The playground's "Run" button.** The structured interpreters are 3-4x faster than the v2 VM, but the JIT is another 3-10x. The playground's "Run" button on the JIT is 10-30x faster than the v2 VM; on the structured interpreters, only 3-4x. The user notices.

This option is rejected for v3.2. The structured interpreters are the v3.1 milestone; the JIT is the v3.2 milestone.

### Use a JIT library (like V8's TurboFan, or Cranelift)

Pros: production-quality JIT; no JIT codegen to write. Cons:

- **Bundle size.** Cranelift is ~5 MB; TurboFan is part of V8 (not directly usable from a separate project).
- **Integration.** Cranelift's IR is different from Aether's IR; the integration would require a translation pass.
- **Sandbox.** Cranelift produces machine code; running it in the browser sandbox is the same problem as the JIT itself.

The v3.2 JIT is small (~2000 LOC of codegen, ~1000 LOC of profiler, ~1000 LOC of deopt, ~500 LOC of buffer management). A Cranelift integration would be ~10,000 LOC of translation + ~5 MB of bundle. The custom JIT is the right answer for v3.2; a Cranelift integration is a v4+ option.

### AOT compiler instead of JIT

Compile the whole program ahead-of-time, before running. Pros: no JIT overhead; the whole program is native code. Cons:

- **Compile time.** An AOT compiler takes 1-10 seconds for a 1000-line program; the user notices.
- **No profiling.** The AOT compiler has to be conservative (no type-specialization without a profile); the speedup is lower.
- **The playground's "Run" button.** The AOT compiler's 1-10s compile time is too slow for the playground's interactive use case. The JIT's incremental compilation (only hot functions) is the right model.

The AOT compiler is the v4 milestone, not the v3.2 milestone. The JIT is the in-between.

## Drawbacks

- **Sandbox.** The JIT runs in a non-sandboxed Worker; the browser sandbox doesn't allow `mmap` with `PROT_EXEC`. The playground has to detect the sandbox and fall back. The fallback is the structured interpreter (tier 1), which is slower but sandbox-compatible.
- **Complexity.** The JIT is ~5000 LOC (codegen + profiler + deopt + buffer management). The maintenance is real.
- **Deopt bugs.** The deopt mechanism is the safety net, but it's also a bug surface. A deopt bug (an incorrect side-table entry) would cause incorrect results. The formal proof (proof 10) is the safety guarantee, but the proof is itself an outline (not mechanized) until v3.3.
- **Bundle size.** The JIT adds ~300 KB to the playground's bundle. The total is ~1.1 MB (with all six runtimes).
- **Tier-2 warmup.** The JIT has to warm up (the function has to be called 1000 times before it's JIT-compiled). For short-lived programs (the playground's "Run" button on a 10-line program), the JIT doesn't kick in. The structured interpreter (tier 1) handles the short-lived case.

## Open questions

1. **Tier thresholds.** N=100/M=10K for tier 1, N'=1000/M'=100K for tier 2. Are these right? The thresholds are tuned for the canonical benchmarks; they might need to be tuned for other workloads. The v3.2 plan is to make them configurable (via `RunOptions.jitThresholds`).
2. **Deopt side-table size.** The side-table is ~1 KB per JIT-compiled function. For 1000 JIT-compiled functions, that's 1 MB. Is this acceptable? The v3.2 plan is to compress the side-table (the entries are mostly the same — many JIT instructions map to the same tier-1 IP).
3. **Multi-threaded JIT.** The v3.2 JIT is single-threaded (the Worker is single-threaded). The v3.3+ plan is to support multi-threaded JIT (with a SharedArrayBuffer for the buffer, and a separate Worker for the JIT compilation).
4. **Cross-ISA JIT.** The v3.2 JIT runs on the host's ISA (x86 on x86 hardware, ARM64 on ARM64 hardware, RISC-V on RISC-V hardware). Cross-ISA JIT (compile to ARM64 on x86 hardware) is the v4 plan, with the cross-compilation encoder (RFC-009, RFC-010).

## Cross-references

- [Chapter 9 the bytecode VM](../book/ch09-the-bytecode-vm.md) — the v2 VM, tier 0.
- [Chapter 15 the x86 backend](../book/ch15-the-x86-backend.md) — the x86 structured interpreter, tier 1.
- [RFC-009 ARM64 backend](rfc-009-arm64-backend.md) — the ARM64 structured interpreter, tier 1.
- [RFC-010 RISC-V backend](rfc-010-riscv-backend.md) — the RISC-V structured interpreter, tier 1.
- [ADR-17 x86 structured interpreter](../decisions/adr-17-x86-structured-interpreter.md) — the structured-interpreter approach; the JIT builds on it.
- [Formal proof 10 JIT correctness](../formal/proofs/10-jit-correctness.md) — the formal correctness proof.
- [RFC-013 mechanized proofs](rfc-013-mechanized-proofs.md) — the v3.3 plan to mechanize proof 10.
- [Chapter 20 the road ahead](../book/ch20-the-road-ahead.md) §20.4 — the JIT in the roadmap.

## Prior art

- **V8 (TurboFan)** — the JavaScript JIT, the reference for tiering and deopt.
- **HotSpot (Oracle/OpenJDK)** — the Java JIT, the reference for profiling and inline caching.
- **LuaJIT (Trace-based)** — the Lua JIT, the reference for trace-based compilation (a different approach from method-based; the v3.2 JIT is method-based).
- **Cranelift** — the Rust JIT/AOT codegen, the reference for the codegen.
- **The v3 x86 backend** — the design template (the JIT's codegen builds on it).

## Status

This RFC is at stage 0 (Proposal). The next step is to prototype the JIT (tiering + profiling + codegen + deopt) and validate the 10-30x speedup on the canonical benchmarks. If the prototype runs `fib(25)` in ~5ms (vs the structured interpreter's 25ms), the RFC moves to stage 1 (Implementation sketch). The v3.2 milestone is the implementation; the v3.3 milestone is the mechanization of the correctness proof.
