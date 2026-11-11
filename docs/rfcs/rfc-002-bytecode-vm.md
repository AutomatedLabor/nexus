# RFC-002 — Bytecode VM for Aether v2

> Status: Draft
> Stage: 0 (Proposal)
> Discussion: open
> Related: [RFC-001 async/await](rfc-001-async-await.md), [RFC-004 borrow checker](rfc-004-borrow-checker.md), [ADR-01 tree-walking interpreter for v1](../decisions/adr-01-tree-walking-interpreter-for-v1.md)

## Summary

Aether v2 introduces a bytecode virtual machine as the production runtime, alongside the v1 tree-walking interpreter (which is kept for REPL, LSP, and debug). The compiler lowers the AST to a compact bytecode; the VM executes it. This delivers 10–100x throughput improvement over the tree-walker, enables suspend/resume for async (RFC-001), and supports `unsafe`/FFI (post-borrow-checker, RFC-004). The tree-walker remains the default for short-lived interactive scenarios where latency matters more than throughput.

This RFC specifies the bytecode format, the VM architecture, the compiler lowering, the debug-info format, the step-limit-to-fuel transition, and the relationship to the existing tree-walker.

## Motivation

Aether v1's tree-walking interpreter (in `aether/core/eval/eval.ts`, ~1081 lines) is correct and small, but slow. Each AST node visit is a JS function call; each evaluation step is a method dispatch on the node's kind tag. For a typical program, this is fine — sub-millisecond to tens of milliseconds. For real workloads (the Benchmarks view's `fib(25)`, ~150K calls, ~1.5M steps, ~330ms), it's painful. For `fib(30)`, ~2.7M calls, it blows the 1,000,000-step default limit and panics.

The tree-walker has three structural limits:

1. **Per-step overhead.** Each AST node visit is a JS function call with the overhead of dispatch, argument passing, and a return. A bytecode VM dispatch is a switch-case in a tight loop, ~10x cheaper.
2. **No suspend/resume.** The tree-walker has no way to pause a partially-evaluated closure. The call stack is the JS call stack; you can't freeze it and resume later. This is the blocker for async/await (RFC-001).
3. **No type specialization.** The tree-walker treats `+` as a runtime dispatch on operand types. A bytecode VM can specialize `IntAdd` vs `FloatAdd` vs `StringConcat` at compile time, skipping the runtime dispatch.

The motivation for the bytecode VM is to fix these three. The motivation is *not* to match native-code performance — that would need a JIT (v3+) — but to be 10–100x faster than the tree-walker, fast enough for production use, and to enable the async runtime (RFC-001) and the borrow checker (RFC-004).

## Detailed design

### Bytecode format

The bytecode is a flat array of 32-bit instructions. Each instruction is:

- 8-bit opcode (`Op` enum).
- 8-bit register operand (R0–R255).
- 16-bit operand (immediate value, register index, or jump target).

The VM has 256 registers per frame (compile-time-allocated; the register allocator manages a free list). The operand stack is implicit — operations like `Op.Add` pop two registers and push one. (Actually the design is register-based, not stack-based — see §3.)

The opcodes (sketch, ~50 total):

```
// Constants
Op.LoadInt     reg, imm16      // load int literal
Op.LoadFloat   reg, imm16      // load float literal (index into constant pool)
Op.LoadString  reg, imm16      // load string literal (index into constant pool)
Op.LoadBool    reg, imm8       // load bool literal
Op.LoadUnit    reg             // load ()
Op.LoadNull    reg             // load null (for sentinel)

// Arithmetic
Op.Add         reg, lhs, rhs
Op.Sub         reg, lhs, rhs
Op.Mul         reg, lhs, rhs
Op.Div         reg, lhs, rhs   // float division
Op.IDiv        reg, lhs, rhs   // int division (truncates)
Op.Mod         reg, lhs, rhs
Op.Neg         reg, lhs
Op.Not         reg, lhs
Op.BitAnd      reg, lhs, rhs
Op.BitOr       reg, lhs, rhs
Op.BitXor      reg, lhs, rhs
Op.BitNot      reg, lhs
Op.Shl         reg, lhs, rhs
Op.Shr         reg, lhs, rhs

// Comparison
Op.Eq          reg, lhs, rhs
Op.Neq         reg, lhs, rhs
Op.Lt          reg, lhs, rhs
Op.Le          reg, lhs, rhs
Op.Gt          reg, lhs, rhs
Op.Ge          reg, lhs, rhs

// Control flow
Op.Jmp         target
Op.JmpIf      reg, target
Op.JmpIfNot   reg, target
Op.Return     reg
Op.Br         reg, target_table   // switch-style branch (for match)

// Calls
Op.Call       reg, fn_reg, args_start, args_count
Op.CallBuiltin reg, builtin_id, args_start, args_count
Op.TailCall    fn_reg, args_start, args_count   // tail-call optimization

// Closures
Op.MakeClosure reg, fn_index, captures_start, captures_count
Op.LoadCapture reg, capture_index

// Data
Op.MakeArray   reg, items_start, items_count
Op.MakeMap     reg, entries_start, entries_count
Op.MakeStruct  reg, struct_id, fields_start, fields_count
Op.MakeVariant reg, enum_id, variant_id, args_start, args_count
Op.MakeTuple   reg, items_start, items_count
Op.MakeRange   reg, start_reg, end_reg, inclusive_flag

// Field access
Op.GetField    reg, base_reg, field_index
Op.SetField    base_reg, field_index, value_reg   // requires &mut
Op.GetIndex    reg, base_reg, index_reg
Op.SetIndex    base_reg, index_reg, value_reg
Op.GetTupleField reg, base_reg, tuple_index
Op.GetAsync    reg, base_reg, key_reg              // for maps

// Pattern match
Op.Match       scrutinee_reg, arms_table           // arms_table is a list of (pattern, target)

// Conversions
Op.IntToFloat  reg, lhs
Op.FloatToInt  reg, lhs                            // truncates
Op.AsInt       reg, lhs                            // alias of FloatToInt
Op.AsFloat     reg, lhs                            // alias of IntToFloat

// Async (RFC-001)
Op.Suspend     // suspend the current frame
Op.Resume      reg, value_reg                      // resume a suspended frame
Op.Await       reg, future_reg
Op.Spawn       reg, future_reg
Op.SendChannel reg, ch_reg, value_reg
Op.RecvChannel reg, ch_reg, result_reg

// Memory (RFC-004, post-borrow-checker)
Op.LoadPtr     reg, ptr_reg, offset
Op.StorePtr    ptr_reg, offset, value_reg
Op.AllocBox    reg, value_reg                     // allocate a Box<T>

// Debug
Op.Breakpoint                                   // debugger breakpoint
Op.Trace        reg                                // trace a value to the inspector
```

The exact opcode list will evolve during implementation; the sketch above is for discussion.

### VM architecture

The VM is a register-based interpreter (vs. the tree-walker's AST-walking). Each frame has:

- **256 registers** (typed values: int, float, bool, string, char, unit, ref, closure, struct, variant, etc.).
- **Instruction pointer** (IP) into the bytecode array.
- **Constant pool** (literals: strings, floats, big integers).
- **Captures** (for closures: a list of register indices in the enclosing frame).
- **Stack of operand references** (for variadic operations like `MakeArray`).

The VM main loop:

```
while (running) {
  const op = bytecode[ip++];
  switch (op) {
    case Op.Add: {
      const reg = bytecode[ip++];
      const lhs = bytecode[ip++];
      const rhs = bytecode[ip++];
      frame[reg] = frame[lhs] + frame[rhs];   // (with type specialization)
      break;
    }
    // ... ~50 cases ...
  }
}
```

The dispatch is direct (a switch in a loop). Indirect dispatch (a jump table) is faster but requires aligned bytecode and is more complex. The v2 design starts with direct dispatch; v3 may switch to threaded dispatch or computed-goto (with a JIT or asm.js).

### Compilation: AST → bytecode

The compiler (`aether/fmt/compile.ts`, planned) walks the AST and emits bytecode. The pipeline becomes:

```
source → lex → parse → check → lower → emit → bytecode
```

The `lower` stage transforms the AST (e.g., desugaring `?` to match arms, expanding `+=` to `=` and `+`). The `emit` stage walks the lowered AST and emits bytecode for each node.

The register allocator is a simple linear-scan: each binding gets a register, registers are freed when the binding goes out of scope. For nested scopes, the allocator uses a free-list. The allocator is conservative — it over-allocates slightly to avoid the cost of perfect allocation.

The compiler emits:

- A constant pool (literals that don't fit in 16 bits, plus all strings).
- A bytecode array (the instructions).
- A debug-info table (mapping bytecode IP → source location, for stack traces and the LSP).
- A function table (each function: bytecode offset, parameter count, capture count, return type).

### Step limit → fuel

The tree-walker's `maxSteps` (default 1M) becomes the VM's `fuel` (a similar concept, but maps to actual CPU time more accurately). Each instruction costs 1 fuel; some instructions (`Call`, `MakeArray`, allocation) cost more. The default fuel budget is 10M (10x the tree-walker's 1M, because VM instructions are finer-grained than AST node visits). When the fuel runs out, the VM throws `PanicSignal("execution fuel exceeded (N)")`.

The fuel budget is configurable: `RunOptions.maxFuel`. The Benchmarks view uses a high budget (1B?) for the canned benchmarks. Production code stays under 10M; misbehaving code is caught.

### Async support

The bytecode VM has explicit suspend/resume instructions (RFC-001). When an async function awaits a future, the VM:

1. Captures the frame (registers, IP, captures).
2. Registers a continuation with the future.
3. Returns control to the executor (with a `Suspend` signal).
4. When the future resolves, the executor calls the continuation, which restores the frame and resumes.

This is impossible in the tree-walker because the JS call stack can't be captured/restored. The bytecode VM's explicit frame makes it trivial.

### Debug info

Each emitted instruction has a `source: { line, col, file }` mapping (a sorted table of `ip → source_loc`). When the VM throws, the panic message includes the source location of the current IP. The LSP / debugger uses this to step through source code while executing bytecode.

The debug info is ~30% of the bytecode size (3 bytes per IP for source mapping). v2 emits it by default; production builds can strip it (a `--strip-debug` flag) for smaller bundles.

### Relationship to the tree-walker

The tree-walker (v1) is kept for:

- **REPL** — single-expression evaluation, where compilation latency would dominate.
- **LSP** — incremental type-checking during editing, where the AST is already in memory.
- **Debug** — step-through debugging, where the bytecode VM's instruction-level stepping is too fine.

The bytecode VM is used for:

- **Production runs** — the `aether build` output is bytecode.
- **Async** — the tree-walker can't suspend/resume.
- **Benchmarks** — the Benchmarks view runs the VM for accurate throughput numbers.

The user chooses via the `edition` field in `aether.toml` (`v1` for tree-walker, `v2` for VM) or per-call (`compileAndRun(source, { runtime: "vm" | "walker" })`).

## Alternatives considered

### Keep the tree-walker, optimize it

The tree-walker can be made faster: inline caches, hidden classes, direct function calls instead of method dispatch. V8 does a lot of this for JS. The achievable speedup is ~3-5x; the achievable limit (matching the JS engine's own JIT) is still far below a bytecode VM. The async suspend/resume problem is unsolvable in the tree-walker. The decision to add a bytecode VM is the right one for v2.

### JIT to JavaScript

Lower the AST to JavaScript and let V8 JIT it. This is the approach some languages take (e.g., Scheme-to-JS compilers). It gets the JIT for free but has problems:

- The codegen is non-trivial (closures, captures, control flow all need careful lowering).
- The host's GC behavior leaks through in unpredictable ways.
- Stack traces show generated JS, not Aether source.
- It doesn't solve the async suspend/resume problem (V8 doesn't expose continuations).
- Debugging is hard — you can't set a breakpoint in Aether source and have the JS engine respect it.

For v2, the explicit bytecode VM is the right answer.

### JIT to wasm

Compile the AST to wasm directly, on the fly. This is the Cranelift / Wasmtime approach. Advantages: very fast (near native). Disadvantages: build complexity (wasm-pack), FFI overhead, large runtime (Wasmtime is ~10MB). The v2 plan keeps the bytecode VM as the primary runtime; wasm-JIT is a v3+ item.

### Native via Cranelift / LLVM

Compile Aether directly to native code, ahead of time. This is the rustc approach. Advantages: peak performance. Disadvantages: huge implementation cost (the compiler is a multi-year project), no browser support, no interactive development. v3+ at the earliest.

## Drawbacks

- **Implementation cost.** The bytecode VM is a multi-month project (vs. the tree-walker's weekend). The compiler lowering, the VM itself, the register allocator, the debug-info format — each is a substantial piece of work.
- **Two runtimes.** Aether v2 has both the tree-walker (kept for REPL/LSP/debug) and the bytecode VM. Bugs in one vs. the other are possible (the same Aether program must run identically in both — the conformance test suite catches discrepancies). The implementation cost of maintaining both is real.
- **Compilation latency.** The tree-walker has zero compilation latency; the VM has 10–100ms compile time. For interactive use (REPL), the tree-walker wins; for production runs, the VM wins.
- **Bytecode is opaque.** A user can't easily read the bytecode to understand what's happening (unlike the AST, which is human-readable). The debug info helps but doesn't fully close the gap.
- **Debug info size.** The source mapping adds ~30% to the bytecode. Production builds strip it; debug builds keep it.
- **Different step semantics.** The tree-walker's "step" (one AST node) and the VM's "fuel" (one instruction) are different units. The Benchmarks view's "steps" column means different things for the two runtimes; we'll need to label them differently.

## Open questions

1. **Register count.** 256 registers is enough for most functions; very long functions may need more. The design uses a frame-level register file (each call gets its own 256), so this is rarely a constraint, but the register allocator may need to spill.
2. **Constant pool size.** The 16-bit immediate limits constant pool size to 65K. For programs with >65K unique strings (rare), we'd need a 32-bit index. The design can be extended with `Op.LoadString32` for the rare case.
3. **Tail-call optimization.** The `Op.TailCall` instruction reuses the current frame. Whether the VM enforces this (and rejects non-tail calls) or makes it best-effort is open.
4. **Polymorphic vs. monomorphic dispatch.** For `Op.Add` on `int` vs `float`, do we specialize at compile time (separate `Op.IntAdd` and `Op.FloatAdd`) or check at runtime (`Op.Add` with a type tag)? Compile-time specialization is faster but increases opcode count. The sketch above uses specialization.

## Cross-references

- [RFC-001 async/await](rfc-001-async-await.md) — the suspend/resume motivation.
- [RFC-004 borrow checker](rfc-004-borrow-checker.md) — the affine-types motivation (the VM provides the foundation for `unsafe`/FFI).
- [../decisions/adr-01-tree-walking-interpreter-for-v1.md](../decisions/adr-01-tree-walking-interpreter-for-v1.md) — the v1 decision (tree-walker).
- [../decisions/adr-10-browser-runnable-core.md](../decisions/adr-10-browser-runnable-core.md) — the browser constraint.
- [../tutorials/performance.md](../tutorials/performance.md) § 11 — the v2 plan from the performance angle.
- `aether/core/eval/eval.ts` — the v1 tree-walker, kept alongside the VM.

## Prior art

- **Lua** — register-based bytecode VM; the design is heavily influenced by Lua 5.x.
- **Python** — stack-based bytecode (CEval); the design avoids stack-based for register-based.
- **Ruby** (YARV) — stack-based bytecode, similar to Python.
- **JavaScript** (V8 Ignition) — register-based bytecode interpreter (with a JIT on top, TurboFan). The closest analogue to Aether's design.
- **Erlang BEAM** — register-based bytecode VM with pattern-matching instructions; relevant for the `Match` opcode.
- **Rust** (MIR) — mid-level IR; not a bytecode VM but the closest "lowered IR" analogue.
- **OCaml** (Lambda/Flambda) — intermediate representations before native code.
- **WebAssembly** itself — a stack-based bytecode VM; useful as a target for v3+ JIT compilation.

## Status

This RFC is at stage 0 (Proposal). The next step is to prototype the VM in TypeScript (without the full compiler lowering, using a hand-written bytecode for the example programs) to validate the opcode set and the register allocator. If the prototype runs `fib(25)` in 30ms (vs. the tree-walker's 330ms), the RFC moves to stage 1 (Implementation sketch).
