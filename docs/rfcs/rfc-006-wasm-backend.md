# RFC-006 — WASM backend

> Status: Draft
> Stage: 1 (Proposal)
> Discussion: open
> Related: [RFC-002 bytecode VM](rfc-002-bytecode-vm.md), [ADR-11 stack-based VM](../decisions/adr-11-stack-based-vm.md), [ADR-12 SSA IR without phi](../decisions/adr-12-ssa-ir-without-phi.md), [ADR-15 v2 keeps tree-walker](../decisions/adr-15-v2-keeps-tree-walker.md)

## Summary

Compile Aether to WebAssembly. The WASM backend is a *third* execution backend (alongside the v1 tree-walker and the v2 bytecode VM). It enables the playground to run Aether programs *without* a JS interpreter — the Aether source compiles to WASM, the browser runs the WASM, and the result comes back to JS via a small FFI.

The RFC specifies: the IR-to-WASM compilation strategy, the WASM module shape, the FFI for stdlib calls, the runtime support (memory, gc, channels), the playground integration, and the perf targets.

## Motivation

Aether's playground runs in the browser. The current execution path is:

1. JS bundle (Next.js + the Aether compiler) loads.
2. User clicks Run.
3. The compiler (lexer, parser, type checker, IR builder, optimizer, codegen) runs in JS.
4. The VM (a JS function) interprets the bytecode.

This works (the VM is fast — Chapter 9), but it has costs:

- The VM is a JS interpreter; it pays the JS-engine's overhead on every instruction dispatch.
- The VM's optimizer passes run in JS; they're fast but not as fast as a JIT-compiled optimizer would be.
- The playground's startup cost includes the JS engine's parse/compile time for the Aether-compiler bundle (~50ms on a fast machine).

Compiling Aether to WASM addresses these:

- The WASM module is JIT-compiled by the browser's WASM engine (V8's Liftoff + TurboFan, SpiderMonkey's baseline + Ion). Once compiled, WASM runs at near-native speed.
- The Aether compiler can stay in JS (it's a compile step, not a runtime step); the *generated* WASM is fast.
- The playground's "Run" step becomes: compile to WASM (in JS), instantiate the WASM module, call the WASM `main` function. The WASM execution is faster than the VM's JS interpretation.

The motivation is *not* "WASM is cool" — it's "make the playground faster and more responsive". The WASM backend is a perf upgrade, not a paradigm shift.

## Detailed design

### The compilation pipeline

```
  Aether source
        │
        ▼
  Lexer ──► tokens
        │
        ▼
  Parser ──► AST
        │
        ▼
  Type checker ──► typed AST
        │
        ▼
  IR builder ──► IR (the same IR as the v2 VM)
        │
        ▼
  8 optimizer passes (the same as the v2 VM)
        │
        ▼
  WASM codegen ──► WASM module (binary)
        │
        ▼
  Browser's WASM engine ──► execution
```

The first five stages (lex, parse, sema, IR, opt) are *shared* with the v2 VM. The WASM codegen is a new stage (~1000 lines of TypeScript) that lowers the optimized IR to WASM.

### The WASM module shape

Each Aether function becomes a WASM function. The WASM module has:

- A `memory` (1 page = 64KB, growable) for the heap (arrays, strings, maps, structs).
- A `table` for indirect function calls (closures).
- A `main` function (the entry point; takes no args, returns an `i32` exit code).
- One WASM function per Aether function.
- Imported functions for the stdlib (FFI — see below).

The WASM type for Aether values is `i64` (a tagged value: low 3 bits = tag, high 61 bits = payload). This is a "NaN-boxing"-like scheme (but with i64, not f64). The tags:

- `0` — int (60-bit signed integer).
- `1` — bool (0 or 1).
- `2` — string (a pointer to a string header in memory).
- `3` — array (a pointer to an array header).
- `4` — map (a pointer).
- `5` — struct (a pointer).
- `6` — enum variant (a pointer; the variant tag is in the header).
- `7` — float (a pointer to an f64 in memory; floats > 2^53 lose precision in the i64 payload, so we allocate).

(This is a sketch; the actual encoding may differ — see "Open questions".)

### The FFI for stdlib

The stdlib is implemented in TypeScript (ADR-08). For the WASM backend, the stdlib is exposed to WASM as *imported functions*:

```wasm
  (import "stdlib" "print_string" (func $print_string (param i32)))
  (import "stdlib" "string_split" (func $string_split (param i64 i64) (result i64)))
  ;; ... etc.
```

The browser-side JS glue (in the playground) implements these imported functions, calling the existing TS stdlib. The result is a hybrid: WASM runs Aether code; JS runs stdlib code; the boundary is the FFI.

This keeps the stdlib implementation unchanged (the same TS code runs in the browser either way) while letting the Aether code itself run as fast WASM.

### The runtime support

The WASM module needs runtime support for:

- **Memory allocation.** A `malloc`-like function in WASM (or imported from JS). Allocates string headers, array headers, struct headers, etc.
- **Garbage collection.** Either a conservative GC (scan the WASM memory for pointers) or an exact GC (the compiler emits explicit GC-root lists). v2.x starts with a conservative GC; v2.x+1 may move to exact GC.
- **Channels.** Channels are heap-allocated objects; `send`/`recv` are FFI calls into JS (which uses JS `Promise` — ADR-13). The WASM `recv` is a blocking call that polls a flag in the channel header (set by JS when a value arrives).
- **Async.** Async is JS-Promise-based (ADR-13); the WASM backend uses the same Promises via the FFI. Aether functions that `await` a Promise are suspended via the state-machine transformation (RFC-001) — this is the v2.x suspend/resume plan.

### The playground integration

The playground's Run button:

1. Compiles the Aether source to WASM (in JS) — ~50ms for a typical program.
2. Instantiates the WASM module with the stdlib imports — ~5ms.
3. Calls the WASM `main` function — runs until it returns or panics.
4. Captures the output (printed via the FFI) and any panic — returns to the UI.

The "VM" checkbox becomes a three-way toggle: Tree-walker / VM / WASM. The default is Tree-walker for low-latency feedback; WASM is for the fastest execution.

### The perf targets

| Benchmark      | Tree-walker | VM    | WASM (target) |
|----------------|-------------|-------|---------------|
| `fib-15`       | ~30ms       | ~3ms  | ~0.3ms        |
| `fib-20`       | ~200ms      | ~20ms | ~2ms          |
| `sum-500k`     | ~1.5s       | ~150ms | ~15ms        |
| `factorial-100` | ~1ms       | ~0.5ms | ~0.05ms      |
| `str-concat`   | ~50ms       | ~10ms | ~5ms          |
| `array-build`  | ~30ms       | ~5ms  | ~1ms          |

(These are *targets*; the actual perf depends on the WASM engine and the codegen quality. The 10× target over the VM is reasonable for tight numeric code; for stdlib-heavy code, the speedup is smaller because the stdlib is still JS.)

## Drawbacks

- **Implementation cost.** ~2000 lines of new TypeScript (WASM codegen, FFI glue, runtime support). Plus tests, docs, and the playground UI for the toggle.
- **Complexity.** A third backend to maintain. The tree-walker and the VM coexist (ADR-15); WASM joins the party.
- **Debugging.** WASM stack traces are different from JS stack traces. The playground's error messages will need a WASM-aware formatter.
- **Memory semantics.** WASM's memory is linear (a single byte array); Aether's heap objects need a header layout and a GC. This is a real implementation; not free.
- **Async.** The WASM backend's async (via the state-machine transformation) is a v2.x feature (RFC-001). v2's WASM backend will support *synchronous* Aether code; async is a v2.x+1 item.

## Alternatives

### Alternative 1: Compile Aether to JS

Lower the IR to JS; let the JS engine JIT it.

**Pros:**

- No new backend; reuses the host's JS engine.
- Stdlib calls are direct JS calls (no FFI).

**Cons:**

- The JS engine's JIT is unpredictable (warmup, deopts, GC pauses).
- The Aether-compiler's output is a JS function per Aether function; the JS engine has to parse and JIT them — this takes ~100ms for a typical program, vs ~50ms for WASM.
- The generated JS is harder to debug than the bytecode disassembly.
- The "compile to JS" path is what Aether v1's tree-walker effectively does (the tree-walker is JS); the perf gain over the tree-walker would be modest.

**Rejected** because the perf gain is small and the JS-engine's JIT unpredictability hurts the playground's responsiveness.

### Alternative 2: Use an existing WASM-targeting language (AssemblyScript, Rust)

Implement the Aether compiler in AssemblyScript or Rust, compile *that* to WASM, and have the WASM compiler compile Aether source to WASM.

**Pros:**

- AssemblyScript / Rust have good WASM tooling.
- The compiler runs as WASM, not JS — fast startup.

**Cons:**

- The Aether compiler is currently TypeScript; rewriting in AS or Rust is a big effort.
- The compiler would run in a WASM sandbox, which complicates the FFI to the playground's React UI.

**Rejected** because of the implementation cost. v2.x+1 may revisit if the compiler-in-WASM approach proves valuable.

### Alternative 3: Skip WASM; optimize the VM further

Invest in VM-level optimizations (better dispatch, register allocation, more aggressive inlining) instead of building a WASM backend.

**Pros:**

- No new backend; the VM stays the only fast path.
- The VM optimizations benefit the CLI too (where WASM is awkward).

**Cons:**

- The VM is a JS interpreter; its dispatch is bounded by the JS engine's switch performance (~10ns/instruction). WASM's dispatch is ~1ns/instruction. The 10× gap is real.
- Aether's perf target (Chapter 9) is "5-10× faster than the tree-walker" for the VM; the WASM target is another 10× on top.

**Rejected** because the perf gap is too large to close with VM-level optimizations alone.

## Open questions

1. **Value encoding.** NaN-boxing (f64-based) vs tagged i64 vs a tagged pointer scheme? The choice affects codegen complexity and perf. v2.x will prototype all three.

2. **GC strategy.** Conservative GC (scan memory for pointers) is simple but may retain dead objects. Exact GC (compiler emits root lists) is precise but complex. v2.x starts conservative; v2.x+1 may move to exact.

3. **Closure representation.** Closures need a WASM `table` for indirect calls. The table's growth is bounded but not free. v2.x will measure the cost.

4. **Async.** The state-machine transformation (RFC-001) is needed for `await` to work in WASM. Without it, async Aether functions can't be compiled to WASM. v2.x will limit WASM to synchronous Aether code; v2.x+1 will add async.

5. **Stdlib FFI overhead.** Each FFI call is a JS-to-WASM boundary crossing (~100ns). For stdlib-heavy code, this is the bottleneck. v2.x will measure and optimize.

## Stages

- **Stage 0** (this RFC) — proposal.
- **Stage 1** — prototype the WASM codegen for a subset of Aether (no closures, no match, no async). Measure perf. ~2 weeks.
- **Stage 2** — extend the codegen to all of Aether v2 (closures, match, all stdlib). ~4 weeks.
- **Stage 3** — integrate with the playground (the three-way toggle, the error message formatter, the disassembler view). ~2 weeks.
- **Stage 4** — ship as the default "fast" backend in the playground; the VM stays as the "compatibility" backend. ~1 week.

## Backwards compatibility

The WASM backend is *new*; no existing code breaks. The CLI keeps `aether run` (tree-walker), `aether run:vm` (VM), and adds `aether run:wasm` (WASM). The playground adds a toggle.

## Future possibilities

- **AOT to native.** The WASM codegen is the basis for a native backend (compile the same IR to LLVM IR or Cranelift). v2.x+2.
- **Embed Aether in other WASM runtimes.** Aether compiled to WASM can run in any WASM runtime (Wasmtime, Wasmer, WasmEdge). v2.x+2.
- **Aether in the server.** A WASM-compiled Aether module can be a server-side component (Fastly Compute@Edge, Cloudflare Workers). v2.x+3.

## Summary

The WASM backend is a third execution backend that compiles Aether to WebAssembly. It's faster than the VM (target: 10× faster for tight numeric code) and works in the browser (the playground) and in Node (the CLI's `aether run:wasm`). The implementation cost is ~2000 lines of new TypeScript; the payoff is a 10× perf upgrade for the playground's "fast" path. The async support is a v2.x+1 item (it requires the state-machine transformation of RFC-001).

This RFC is Stage 1 (Proposal). The next step is a prototype that compiles a subset of Aether to WASM and measures the perf.
