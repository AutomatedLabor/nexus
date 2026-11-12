# ADR-16 — WASM backend uses host calls for heap operations

> Status: Accepted
> Date: 2026-11-12
> Decision-maker: Aether core team
> Related: [RFC-006 WASM backend](../rfcs/rfc-006-wasm-backend.md), [Chapter 14 the WASM backend](../book/ch14-the-wasm-backend.md), [ADR-11 stack-based VM](adr-11-stack-based-vm.md), [ADR-17 x86 structured interpreter](adr-17-x86-structured-interpreter.md)

## Context

Aether v3's WASM backend (in `aether/vm/wasm/wasm.ts`, ~1500 LOC) lowers Aether IR to WebAssembly. It is the third runtime — after the tree-walker (v1) and the bytecode VM (v2) — and the second "compiled" runtime (the x86 backend is the third). It runs in the browser's WASM engine (V8 Liftoff/TurboFan, SpiderMonkey baseline/Ion), giving near-native speed for a sandboxed environment. The measured speedup on the canonical `fib(25)` benchmark is **3.9x over the tree-walker** and **1.6x over the v2 bytecode VM**.

The central design question for any WASM backend is: how do you do heap operations? WASM as a language has linear memory (`memory` declaration), instruction loads/stores (`i32.load`, `i64.store`, etc.), and a `grow_memory` instruction. It does *not* have `malloc`, `free`, GC, or anything resembling a higher-level heap abstraction. A language like Aether — with strings, arrays, maps, and structs that all live on the heap — needs all of these. We had to choose between three options:

1. **Compile a heap allocator into the WASM module.** Generate WASM code that implements a free-list, a bump allocator, or a mark-sweep GC, link it into every Aether-compiled WASM module.
2. **Use the host's heap (via JS) through host imports.** Have the host (browser page) provide `alloc`, `free`, `load`, `store`, and a small set of higher-level operations as imported functions. The WASM module calls these via the standard WASM import mechanism.
3. **Use WASM's GC proposal (the `gc` feature).** The GC proposal adds struct/array types to WASM itself, with the engine's GC managing them. This is the "right" long-term answer.

The constraints on the decision were:

- **Implementation size.** The v3 WASM backend had to fit in a single sprint of work. A free-list allocator in raw WASM is a 500-line project; a real GC is a multi-month project. Host imports are an afternoon.
- **Browser compatibility.** The playground has to run on every modern browser (Chrome 110+, Firefox 110+, Safari 16+). The WASM GC proposal shipped in Chrome 119 and Firefox 120 (late 2023) but is still not in all Safari versions; relying on it would break the playground for some users in 2024-25.
- **Heap-operation richness.** Aether has six heap-shaped value types (string, array, map, struct, variant, closure). Implementing each as a raw-WASM layout is straightforward but tedious. Delegating to the host lets the host's existing JS implementation handle the layout, freeing the WASM backend to focus on the numeric/control-flow code that benefits from compilation.
- **Performance.** The goal is "near-native" — 1.5-4x faster than the v2 VM. A host call costs ~5-20 ns (the WASM-to-JS transition). A free-list `malloc` costs ~10-50 ns. The two are comparable for small allocations; the host call wins for large allocations (the host's GC is highly tuned). For the *numeric* part of Aether programs (arithmetic, control flow, tight loops), WASM compiles to native code with no host calls — that's where the speedup comes from.

## Decision

**The v3 WASM backend uses host imports for all heap operations.** The host (browser page or Node host) provides a small set of imported functions; the WASM module calls them via the standard import mechanism.

The imports (sketch; see Chapter 14 for the full list):

```wat
(import "host" "alloc"      (func $alloc (param i32) (result i32)))
(import "host" "free"       (func $free (param i32)))
(import "host" "load_i64"   (func $load_i64 (param i32) (result i64)))
(import "host" "store_i64"  (func $store_i64 (param i32 i64)))
(import "host" "load_i32"   (func $load_i32 (param i32) (result i32)))
(import "host" "store_i32"  (func $store_i32 (param i32 i32)))
(import "host" "print"      (func $print (param i64)))
(import "host" "string_eq"  (func $string_eq (param i32 i32) (result i32)))
(import "host" "string_len" (func $string_len (param i32) (result i32)))
(import "host" "array_push" (func $array_push (param i32 i64)))
```

The numeric and control-flow code (arithmetic, branches, calls) is compiled to native WASM instructions. Heap operations go through the host.

Aether values are represented as a tagged `i64` — low 3 bits are the tag, high 61 bits are the payload (an offset for heap values; a direct value for ints, floats, bools). The tags: 0=int, 1=float, 2=bool, 3=string, 4=array, 5=closure, 6=struct/variant, 7=reference. This is a NaN-boxing-like scheme with i64 (not f64). The advantage: every value is exactly 8 bytes; ints/floats/bools need no allocation. The disadvantage: 60-bit ints (not 64-bit); floats need an extra step to extract bits.

The choice to use host imports is the choice to *not* implement a heap allocator in WASM. The trade-off is: heap operations pay a host-call cost (5-20 ns each) but get the host's highly-tuned GC. Numeric operations pay no cost — they're compiled to native WASM. The net result is the 1.6x speedup over the v2 VM, measured on the standard benchmarks (fib, sum, ackermann).

## Alternatives considered

### Compile a heap allocator into the WASM module

Generate WASM code for a free-list allocator, link it into every Aether-compiled module. Pros: no host dependency; the module is self-contained and can run anywhere. Cons: 500+ lines of WASM-allocator code in every module; the allocator has to handle fragmentation, GC, and finalization; and the resulting allocator is unlikely to match V8's GC for performance. The host-imports approach delegates all of this to V8's existing GC, which is decades of tuning we can't replicate.

This approach is the right answer for a *standalone* Aether-WASM deployment (where there's no host to delegate to). The v3 WASM backend targets the browser playground, which always has a host. A future "Aether-WASM-standalone" backend (v4+) might compile a real allocator; v3 doesn't.

### Use WASM's GC proposal

Use the `gc` feature — `struct`, `array`, `externref`, `anyref` types, with the engine's GC managing them. Pros: this is what WASM's GC is designed for; performance should match or exceed the host-imports approach (the GC is in the engine, not in JS); the WASM module is cleaner (no host imports for heap ops). Cons: browser support is uneven (Chrome 119+, Firefox 120+, Safari 17.2+ — late 2023/early 2024). Relying on it would break the playground for some users in 2024-25. The proposal also has rough edges (the `i31ref` type, the `eqref`/`anyref` distinction) that haven't fully stabilized.

The decision: defer to v3.2 or v4, when the GC proposal is universal. For v3, host imports work today.

### Compile to JavaScript directly

Skip WASM entirely; lower Aether to JavaScript and let V8 JIT it. Pros: no WASM, no host-import boundary, no separate compile step. Cons: the JS engine's GC leaks through (the same issue as the tree-walker, see ADR-13); the JS engine's optimizations are tuned for JS shapes (hidden classes, inline caches), not for Aether's shapes; debugging is harder (stack traces show generated JS, not Aether source). This is the "lower to JS" option we rejected in RFC-002.

## Consequences

### Positive

- **Implementation simplicity.** The WASM backend is ~1500 LOC, of which ~500 is the codegen (IR → WAT → binary) and ~500 is the host-call marshaling. A real heap allocator would have doubled the LOC. The host-import approach lets the backend focus on the numeric/control-flow code that benefits from compilation.
- **Performance.** 1.6x speedup over the v2 VM on the standard benchmarks. The numeric code (which is most of `fib`, `sum`, `ackermann`) is compiled to native WASM with no host calls. The heap calls cost 5-20 ns each, which is competitive with a hand-written free-list.
- **Browser compatibility.** Works on every modern browser (Chrome 110+, Firefox 110+, Safari 16+). The host imports are plain WASM; no experimental features required. The playground's "WASM" toggle works today.
- **Tunability.** The host can use V8's GC, SpiderMonkey's GC, or any other engine's GC. The Aether code doesn't care; the host-call boundary is a clean seam. If V8 ships a faster GC tomorrow, Aether-WASM programs get faster for free.
- **Debuggability.** Heap operations are visible at the host boundary — the host can log them, instrument them, or intercept them. This is useful for the playground's Inspector (the "WASM" tab shows the host calls).

### Negative

- **Not standalone.** The WASM module can't run without a host. A `compileToWasm(source)` call produces a binary that needs a host with the `host.alloc`/`host.load_i64`/... imports. This is fine for the browser playground; it's a problem for "compile to WASM and run on a server" deployments.
- **Host-call overhead.** Each heap operation pays a 5-20 ns host-call cost. For programs dominated by heap operations (string-heavy, array-heavy), this can dominate. The benchmarks show Aether-WASM is still 1.6x faster than the v2 VM *overall*, but for a string-heavy program the speedup might be 1.2x instead of 3.9x.
- **Tag bit tax.** 3 tag bits per value means 60-bit ints (not 64-bit). Programs that need full 64-bit ints have to use the slower path (the host's `BigInt`-equivalent). This is rare in practice but is a real limitation.
- **No WASM GC integration.** The host's heap is opaque to the WASM module. The module can't introspect heap objects, can't iterate them, can't use the WASM GC proposal's `anyref` types. The host-import boundary is a one-way valve: the WASM module can call the host, but the host's heap is a black box.

### Mitigations

- For the "not standalone" issue: a future `aether build --wasm-standalone` mode (v3.2 or v4) can link a heap allocator into the module. The host-import boundary is the default; the standalone mode is opt-in.
- For the host-call overhead: the v3 optimizer inlines small functions, which reduces call sites. Future optimizer passes (loop-invariant heap-pointer caching, escape analysis) could reduce heap calls further.
- For the tag-bit tax: the v3.1 plan is to add an `i128` type for programs that need >60-bit ints; the cost is a slower path, but the option exists.

## Reversibility

This decision is **reversible in v3.2**. The host-import boundary is a compile-time choice in the WASM codegen; switching to either the "compile a heap allocator" or "use WASM GC" approach is a codegen change, not a language change. The Aether source is unchanged.

## Cross-references

- [RFC-006 WASM backend](../rfcs/rfc-006-wasm-backend.md) — the original RFC.
- [Chapter 14 the WASM backend](../book/ch14-the-wasm-backend.md) — the chapter walkthrough.
- [ADR-11 stack-based VM](adr-11-stack-based-vm.md) — the v2 VM design (which the WASM backend's IR builds on).
- [ADR-17 x86 structured interpreter](adr-17-x86-structured-interpreter.md) — the parallel x86 decision (which uses a structured interpreter, not host imports, for the same sandbox reason).
- [ADR-10 browser-runnable core](adr-10-browser-runnable-core.md) — the browser constraint that drove this decision.
