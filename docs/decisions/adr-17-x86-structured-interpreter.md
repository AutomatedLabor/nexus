# ADR-17 — x86 backend uses a structured interpreter

> Status: Accepted
> Date: 2026-11-12
> Decision-maker: Aether core team
> Related: [Chapter 15 the x86 backend](../book/ch15-the-x86-backend.md), [ADR-16 WASM via host calls](adr-16-wasm-via-host-calls.md), [RFC-011 JIT compiler](../rfcs/rfc-011-jit-compiler.md)

## Context

Aether v3's x86-64 backend (in `aether/vm/x86/x86.ts`, ~1800 LOC) lowers Aether IR to NASM-syntax x86-64 assembly. It is the fourth runtime — after the tree-walker, the bytecode VM, and the WASM backend — and the third "compiled" runtime. The measured speedup over the v2 VM on the canonical benchmarks is **3.5x** (on the `fib` and `sum` benchmarks; the `ackermann` benchmark gets 4x).

A normal x86 backend has three stages: instruction selection (IR → asm instructions), register allocation (assign registers to virtual registers), and code emission (asm text → machine code). The first two stages are pure code transformations; the third stage is where things get complicated. The standard approach is to emit NASM-syntax assembly text, shell out to `nasm` (the Netwide Assembler) and `ld` (the linker), producing a `.o` file or an executable, then run it.

The playground runs in the browser, in a sandboxed environment (Vercel's edge function or the in-browser V8). The sandbox has no `nasm`, no `ld`, no shell, no `execve`. The standard approach is impossible. We had to choose between three options:

1. **Emit machine code directly, in JavaScript, with a hand-written x86 encoder.** Write the byte sequences for `mov`, `add`, `jmp`, etc., directly into an `ArrayBuffer`. Mark the buffer executable (via `WebAssembly.Module` with custom sections, or via a JIT-style approach). Run the resulting machine code.
2. **Emit NASM text, parse it with a hand-written NASM parser, and produce machine code from the parsed representation.** Write a small subset of an assembler in JavaScript; emit text, parse it, encode it. Avoids the complexity of directly emitting machine code but adds the complexity of a parser.
3. **Emit NASM text, and simulate the x86 machine on the parsed representation.** Don't produce machine code at all; instead, parse the assembly into a structured representation (a list of instructions with operands), and write a structured interpreter that executes the instructions. The "backend" is then a tree-walker over x86 instructions, not an actual x86 executor.

The constraints on the decision were:

- **Sandbox.** The playground runs in Vercel's edge runtime, which is a sandboxed V8. No shell, no `execve`, no `mmap` of executable memory (the `--jitless` flag is on by default for security). Option 1 (direct machine code emission + execute) is impossible in the sandbox without exploits that would be a security incident.
- **Implementation size.** The v3 x86 backend had to ship in a sprint. A full x86 encoder (handling the entire instruction set, addressing modes, ModR/M bytes, REX prefixes, branch displacement fixups) is a 5000-line project. A NASM parser is ~1000 lines. A structured interpreter over a parsed instruction list is ~1500 lines.
- **Performance.** The goal was "noticeably faster than the v2 VM." The structured interpreter simulates the x86 machine in JavaScript; each simulated instruction is ~100 ns of JS work. The v2 VM dispatches a bytecode instruction in ~50 ns. The x86 backend *should* be slower than the v2 VM in raw instruction throughput — but it isn't, because the x86 backend has *far fewer* instructions per program (a tight loop in x86 is 3-5 instructions; in bytecode it's 10-15). The net is a 3.5x speedup.
- **Teaching value.** The x86 backend is partly a teaching artifact. A "real" x86 backend that emits machine code would be opaque; a structured interpreter is inspectable. The playground's "x86" tab shows the assembly, the register state, and the IP at each step — the structured interpreter is what makes that possible.

## Decision

**The v3 x86 backend emits NASM-syntax assembly text, parses it into a structured representation, and executes it with a structured interpreter.** No machine code is emitted; no `nasm` is invoked; no executable is produced. The "backend" is a tree-walker over x86 instructions.

The pipeline:

```
Aether IR
   │
   ▼
Instruction selection   (IR ops → x86 instructions, register-only)
   │
   ▼
Register allocation      (linear-scan, 16 GP registers, callee-saved convention)
   │
   ▼
Code emission            (x86 instructions → NASM-syntax text)
   │
   ▼
Parse NASM text          (a small hand-written parser; ~30 instructions supported)
   │
   ▼
Structured interpreter   (execute the parsed instructions; simulate the x86 machine)
```

The supported instruction subset is small: `mov`, `add`, `sub`, `imul`, `idiv`, `neg`, `and`, `or`, `xor`, `not`, `shl`, `shr`, `cmp`, `jmp`, `je`/`jne`/`jl`/`jle`/`jg`/`jge`, `call`, `ret`, `push`, `pop`, `lea`, `label`. ~30 instructions cover ~95% of the generated code; the other 5% (rare addressing modes, division) is handled with slower fallback paths.

The structured interpreter simulates:
- **16 GP registers** (rax, rbx, rcx, rdx, rsi, rdi, rbp, rsp, r8-r15) as a JavaScript `Int32Array` (or `BigInt64Array` for the 64-bit operations).
- **The flag register** (ZF, SF, CF, OF) as a small set of booleans.
- **The instruction pointer** as an integer index into the instruction array.
- **The stack** as a JavaScript array (or a typed array view of "memory").
- **"Memory"** as a JavaScript `ArrayBuffer` for `mov [mem]` and `lea` operations (rarely used; most loads/stores go through registers).

The calling convention is the System V AMD64 ABI (the Linux/macOS convention): integer args in rdi, rsi, rdx, rcx, r8, r9; return in rax; callee-saved are rbx, rbp, r12-r15; caller-saved are rax, rcx, rdx, rsi, rdi, r8-r11. The structured interpreter implements the call/ret instructions as push/pop on the simulated stack.

## Alternatives considered

### Emit machine code directly (a real x86 encoder)

Write the byte sequences for each instruction into an `ArrayBuffer`; mark the buffer executable; jump to it. Pros: real native speed (the closest to "real" x86). Cons:

- **Sandbox.** The browser sandbox doesn't allow executing arbitrary machine code. The `Wasm` runtime can execute WASM (which is verified), but not arbitrary x86. This is the killer.
- **Encoder complexity.** A real x86 encoder is 5000+ lines of code (handling REX prefixes, ModR/M bytes, SIB bytes, immediate sizes, branch displacement fixups). Way out of scope for v3.
- **Even outside the sandbox**, marking memory as executable (`mmap` with `PROT_EXEC`) requires platform-specific code (POSIX vs Windows, Linux vs macOS), and is disallowed by some hardened runtimes.

This is the right answer for a real AOT compiler (which v4 might be, see Chapter 20). For v3's playground use case, it's not possible.

### Use the WASM backend as a "native" backend

Run the WASM backend and call it "native." WASM runs near-native speed in modern engines (Liftoff+TurboFan in V8 are real JITs). Pros: no separate x86 backend needed; the WASM backend already exists. Cons:

- **Not really x86.** The user expects "x86 backend" to mean "x86 machine code." Calling WASM "x86" is dishonest. The playground's "x86" toggle would be a lie.
- **Different perf characteristics.** WASM is sandboxed (the host-call cost; see ADR-16); x86 (a real backend, or even the structured interpreter) doesn't have that cost. The benchmarks would tell a different story.
- **Teaching value.** The x86 backend is partly a teaching artifact. The user sees actual x86 instructions; they learn how their Aether code lowers to machine code. WASM hides that (it's a stack machine, not a register machine).

### Use a real x86 interpreter library (like Unicorn)

Unicorn (the qiling/unicorn-engine) is a real x86 emulator, with a JavaScript binding (`unicorn-js`). Pros: real x86 semantics; no encoder needed; supports the full instruction set. Cons:

- **Bundle size.** Unicorn compiled to WASM is ~3 MB. The playground's current bundle is ~500 KB. Adding Unicorn would 6x the bundle size for a single feature.
- **Latency.** Unicorn has a startup cost (instantiating the WASM module, setting up the emulator). For the playground's interactive "Run" button, this is too slow.
- **Complexity.** Unicorn's API is large and the integration cost is high (mapping Aether values to Unicorn's memory model, handling syscalls, etc.). A sprint of work would be a stretch.

This is the right answer for a "real" emulator, but the structured interpreter is the right answer for the playground.

## Consequences

### Positive

- **Sandbox-compatible.** No `nasm`, no `ld`, no executable memory. The structured interpreter runs entirely in JavaScript, in the sandboxed V8. The playground's "x86" toggle works today, on every browser, with no special permissions.
- **Teaching value.** The user sees actual x86 instructions. The playground's "x86" tab shows the assembly, the register state, the IP, the flags, the simulated stack — the structured interpreter makes all of this visible. A real x86 backend would show machine code; the structured interpreter shows what that machine code *means*.
- **Implementation simplicity.** The backend is ~1800 LOC (instruction selection + register allocation + code emission + NASM parser + structured interpreter). Comparable to the WASM backend (~1500 LOC). A real x86 encoder would have been 5000+ LOC.
- **Performance.** Despite being a simulator, the x86 backend is 3.5x faster than the v2 VM on the standard benchmarks. The reason: the x86 backend emits fewer instructions per program (a tight loop is 3-5 x86 instructions vs 10-15 bytecode instructions). The structured interpreter's per-instruction cost (~100 ns) is higher than the v2 VM's (~50 ns), but the instruction count is 3-5x lower, so the net is faster.
- **Honest.** The playground says "x86 backend" and shows x86 instructions. The user can paste the assembly into a real NASM and assemble it (modulo the 30-instruction subset). The backend doesn't pretend to be something it isn't.

### Negative

- **Not real native code.** The structured interpreter simulates the x86 machine in JavaScript. The "speedup" is a speedup over the v2 VM (which is also simulated), not over real native code. A real x86 backend (a v4 item, see Chapter 20) would be 2-3x faster than this.
- **Instruction subset.** Only ~30 instructions are supported. Programs that lower to unsupported instructions (e.g., `match` on a float, see the "known quirks" in the spec) fall back to a slower path or return 0. The v3 `match` on float, for example, returns 0 because the structured interpreter doesn't support the `ucomiss`/`ucomisd` floating-point comparison instructions. This is documented as a known quirk.
- **No `lea` for address arithmetic.** The structured interpreter supports `lea` but only for simple cases; complex addressing modes (e.g., `lea rax, [rbx + rcx*4 + 16]`) are not supported. The codegen avoids them by using multiple `add` instructions.
- **Branch displacement fixups.** The structured interpreter doesn't have displacement fixups (because it doesn't emit machine code); the parsed instructions store jump targets as instruction indices, not as byte offsets. This is fine for the interpreter but means the parsed representation can't be assembled by a real NASM without a translation pass.

### Mitigations

- For the "not real native code" issue: the playground's UI is honest about what the x86 backend is. The "Run x86" button is labeled "Run (x86 simulated)"; the Inspector's x86 tab shows "simulated x86 instructions." The user knows what they're getting.
- For the instruction subset: the v3.1 plan is to expand the subset (especially for floating-point), and the v4 plan is to ship a real x86 encoder for the AOT compiler.
- For the `lea` limitation: the codegen uses `add` sequences; this costs a few instructions per address computation but is correct.
- For the branch displacement fixups: a future translation pass (v3.1) can convert the structured representation to real machine code, for the AOT compiler use case.

## Reversibility

This decision is **reversible in v4**. The structured interpreter is the v3 implementation; a real x86 encoder (for the AOT compiler, RFC-011) is the v4 implementation. The instruction selection and register allocation stages are shared between the two; only the code emission stage differs.

## Cross-references

- [Chapter 15 the x86 backend](../book/ch15-the-x86-backend.md) — the chapter walkthrough, with the 30-instruction subset enumerated.
- [ADR-16 WASM via host calls](adr-16-wasm-via-host-calls.md) — the parallel WASM decision (which uses host imports, not a structured interpreter, for the same sandbox reason).
- [RFC-011 JIT compiler](../rfcs/rfc-011-jit-compiler.md) — the v3.2 JIT plan, which builds on the x86 backend's instruction selection but adds a real encoder.
- [ADR-11 stack-based VM](adr-11-stack-based-vm.md) — the v2 VM design, which the x86 backend's IR builds on.
- [RFC-009 ARM64 backend](../rfcs/rfc-009-arm64-backend.md) — the v3.1 ARM64 backend, which uses the same structured-interpreter approach.
