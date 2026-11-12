# RFC-009 — ARM64 native backend

> Status: Draft
> Stage: 1 (Implementation sketch)
> Discussion: open
> Related: [Chapter 15 the x86 backend](../book/ch15-the-x86-backend.md), [ADR-17 x86 structured interpreter](../decisions/adr-17-x86-structured-interpreter.md), [ADR-25 4 runtimes coexist](../decisions/adr-25-4-runtimes-coexist.md), [RFC-010 RISC-V backend](rfc-010-riscv-backend.md), [RFC-011 JIT compiler](rfc-011-jit-compiler.md), [RFC-006 WASM backend](rfc-006-wasm-backend.md)

## Summary

Aether v3.1 adds an ARM64 native backend, the fifth runtime. The backend lowers Aether IR to ARM64 (AArch64) assembly, parses the assembly with a hand-written parser (mirroring the x86 backend's approach in ADR-17), and runs it in a structured interpreter. The expected speedup over the v2 bytecode VM is **3-4x** on the canonical benchmarks — comparable to the x86 backend's measured 3.5x. The backend targets the playground (running on Apple Silicon in the browser, where ARM64 is the host ISA), and the cross-compilation use case (compile to ARM64 on an x86 laptop, download the binary, run on a Raspberry Pi or AWS Graviton).

This RFC specifies the ARM64 instruction subset, the calling convention, the register allocation, the structured interpreter, the calling convention for host builtins, and the relationship to the existing x86 backend (shared IR, shared optimizer, separate instruction selection).

## Motivation

The v3 milestone shipped four runtimes (tree-walker, bytecode VM, WASM, x86). The v3.1 milestone adds ARM64, for three reasons:

1. **The playground's audience increasingly runs on Apple Silicon.** Apple's M-series chips (M1, M2, M3, M4) are ARM64; the playground's audience is shifting to ARM64 hardware. An Aether that compiles to ARM64 in the browser, runs near-native speed on Apple Silicon, and shows the user the actual ARM64 instructions is a real differentiator. The x86 backend runs on Apple Silicon (via Rosetta) but doesn't show the user the ARM64 instructions; the ARM64 backend does.
2. **The server market is shifting to ARM64.** AWS Graviton (Graviton3, Graviton4) is ARM64; the cost-performance is competitive with x86 (Graviton4 is ~30% cheaper than equivalent x86 instances for many workloads). Aether programs that compile to ARM64 can run on Graviton natively, without emulation.
3. **The educational value.** ARM64 is the ISA of the modern mobile/embedded world (every modern Android phone, every Raspberry Pi 3+, every Apple Silicon Mac). A student who learns ARM64 from the Aether backend can apply it to a much wider range of hardware than x86.

The x86 backend (Chapter 15) demonstrates that a structured interpreter over a parsed assembly is feasible, sandbox-compatible, and 3.5x faster than the v2 VM. The ARM64 backend follows the same pattern: the same approach, a different ISA.

## Detailed design

### The ARM64 instruction subset

The ARM64 (AArch64) ISA has ~1200 instructions in the full A64 instruction set. The backend uses a small subset (~40 instructions) that covers ~95% of the generated code. The subset:

```
// Arithmetic (register-register)
add   Xd, Xn, Xm        // Xd = Xn + Xm
sub   Xd, Xn, Xm        // Xd = Xn - Xm
mul   Xd, Xn, Xm        // Xd = Xn * Xm
sdiv  Xd, Xn, Xm        // Xd = Xn / Xm (signed)
udiv  Xd, Xn, Xm        // Xd = Xn / Xm (unsigned)
neg   Xd, Xn            // Xd = -Xn

// Arithmetic (immediate)
add   Xd, Xn, #imm12    // Xd = Xn + imm12 (12-bit immediate)
sub   Xd, Xn, #imm12
mov   Xd, #imm16        // Xd = imm16 (16-bit immediate, zero-extended)

// Logical
and   Xd, Xn, Xm
or    Xd, Xn, Xm
eor   Xd, Xn, Xm
mvn   Xd, Xn            // Xd = ~Xn

// Shifts
lsl   Xd, Xn, Xm        // logical shift left
lsr   Xd, Xn, Xm        // logical shift right
asr   Xd, Xn, Xm        // arithmetic shift right

// Comparison
cmp   Xn, Xm           // sets flags (NZCV)
cmp   Xn, #imm12

// Conditional branches (after cmp)
b.eq  label
b.ne  label
b.lt  label
b.le  label
b.gt  label
b.ge  label
b.al  label             // always (unconditional)

// Unconditional branch
b     label

// Function call
bl    label             // branch with link (sets X30 = return address)
ret                     // return (jump to X30)

// Memory
ldr   Xd, [Xn]          // load 8 bytes
ldr   Xd, [Xn, #imm12]   // load 8 bytes with offset
str   Xd, [Xn]          // store 8 bytes
str   Xd, [Xn, #imm12]
ldr   Xd, [Xn, Xm]       // load with register offset
str   Xd, [Xn, Xm]
ldp   Xd1, Xd2, [Xn]    // load pair (two registers)
stp   Xd1, Xd2, [Xn]    // store pair

// Stack
mov   sp, Xn            // move stack pointer
add   sp, sp, #imm12
sub   sp, sp, #imm12

// Special
nop                     // no operation
brk  #imm16             // breakpoint (used for panic)
```

The subset is intentionally small. ARM64 has floating-point instructions (`fadd`, `fmul`, etc.), SIMD instructions (`add.4s`), and atomic instructions (`ldaxr`, `stlxr`), but the v3.1 backend doesn't support them (the v3 x86 backend has the same limitation — `match` on float returns 0). A future v3.2 will add floating-point (with the SIMD instructions for vectorized loops).

### The calling convention

The backend uses the AAPCS64 (ARM Architecture Procedure Call Standard) calling convention, the same one used by Linux, macOS, and iOS on ARM64:

- **Integer/pointer arguments** in registers X0-X7 (first 8 args).
- **Float arguments** in registers V0-V7 (first 8 float args).
- **Return value** in X0 (or V0 for floats).
- **Caller-saved** (the callee may clobber): X0-X7, V0-V7, X9-X15, V16-V31.
- **Callee-saved** (the callee must preserve): X19-X28, V8-V15 (the lower 64 bits of V registers).
- **Special registers**: X8 (indirect result location, used for large returns), X9 (frame pointer, optional), X16-X17 (IP0/IP1, intra-procedure-call scratch), X18 (platform register, reserved).
- **Stack**: 16-byte aligned. The stack grows downward; `sp` points to the last used slot.
- **Frame**: `stp x29, x30, [sp, #-16]!` (push frame pointer and return address); `ldp x29, x30, [sp], #16` (pop on return).

The backend's prologue:

```
myfunc:
  stp   x29, x30, [sp, #-16]!   // push fp, lr
  mov   x29, sp                 // fp = sp
  sub   sp, sp, #FRAME_SIZE     // allocate locals
  // ... body ...
  add   sp, sp, #FRAME_SIZE
  ldp   x29, x30, [sp], #16     // pop fp, lr
  ret
```

### Register allocation

ARM64 has 31 GP registers (X0-X30, with X31 = sp/zr disambiguated by context) and 32 FP registers (V0-V31). The allocator uses linear-scan, with 16 allocatable GP registers (X0-X15, after reserving X16-X17 for IP0/IP1 and X18 for the platform register) and 16 allocatable FP registers (V0-V15, after reserving V16-V31 for temporaries).

The allocation strategy:

- **Arguments** in X0-X7 (per AAPCS64).
- **Locals** in X19-X28 (callee-saved; the function saves and restores them in the prologue/epilogue).
- **Temporaries** in X9-X15 (caller-saved; the function can clobber them).
- **Frame pointer** in X29.
- **Return address** in X30.

The allocator is the same linear-scan as the x86 backend (with 16 registers vs x86's 16, but ARM64's regularity makes the allocation simpler — no register class constraints, no partial-register shenanigans).

### The structured interpreter

The structured interpreter mirrors the x86 backend's (ADR-17). It parses the ARM64 assembly into a list of instructions (with operands), and runs the instructions in a loop:

- **31 GP registers** as a JavaScript `BigInt64Array` (or `Int32Array` for 32-bit operations).
- **32 FP registers** as a JavaScript `Float64Array`.
- **The NZCV flags** as a small struct (N, Z, C, V booleans).
- **The PC** as an integer index into the instruction array.
- **The stack** as a JavaScript `BigInt64Array` of 4096 entries (simulating 32 KB of stack).
- **Memory** as a JavaScript `ArrayBuffer` (rarely used; most loads/stores go through the stack).

The interpreter dispatches each instruction by opcode (a switch-case over the ~40 supported opcodes). The cost is ~100 ns per instruction (similar to the x86 backend), and the instruction count per program is ~3-5x lower than the bytecode VM, giving the 3-4x net speedup.

### Host builtins

The structured interpreter provides three host builtins (the same as the bootstrap, ADR-21): `read_file`, `print`, `panic`. The ARM64 backend's calling convention for host builtins is:

```
bl    host_print            // call host_print
```

The host `print` function reads X0 (the string offset) and X1 (the string length), reads the bytes from memory, prints them, and returns. The ARM64 backend's structured interpreter intercepts the `bl` to known host functions and dispatches to JavaScript.

The three host builtins cover the backend's IO needs: `read_file` for the playground's "load file" feature, `print` for stdout, `panic` for unrecoverable errors. Everything else (string manipulation, math, lists, dicts) is in the Aether stdlib, called via the normal function-call mechanism.

### The codegen

The codegen walks the IR and emits ARM64 instructions. The mapping from IR ops to ARM64:

| IR op                  | ARM64                                            |
|------------------------|--------------------------------------------------|
| `LoadInt r, 5`         | `mov Xd, #5`                                      |
| `Add r, lhs, rhs`      | `add Xd, Xn, Xm`                                  |
| `Sub r, lhs, rhs`      | `sub Xd, Xn, Xm`                                  |
| `Mul r, lhs, rhs`      | `mul Xd, Xn, Xm`                                  |
| `Eq r, lhs, rhs`       | `cmp Xn, Xm; cset Xd, b.eq` (set if equal)        |
| `Lt r, lhs, rhs`       | `cmp Xn, Xm; cset Xd, b.lt`                      |
| `JmpIf r, label`       | `cbnz Xd, label` (compare and branch if non-zero)|
| `Call r, fn_reg`       | `bl fn`                                          |
| `Return r`             | `mov X0, Xd; ret`                                |

The codegen is similar to the x86 backend's, with ARM64-specific differences: ARM64's load-store model (no register-memory operations; all arithmetic is register-register), the 3-operand form (`add Xd, Xn, Xm` vs x86's `add Xd, Xm` which is 2-operand), and the condition codes (NZCV vs x86's RFLAGS).

## Alternatives considered

### Use the WASM backend as the "ARM64 backend"

Run the WASM backend and call it "ARM64" — modern browsers JIT the WASM to ARM64 anyway (V8's TurboFan on Apple Silicon compiles WASM to ARM64 machine code). Pros: no new backend needed. Cons:

- **Not really ARM64.** The user expects "ARM64 backend" to mean "ARM64 machine code." Calling WASM "ARM64" is dishonest (the same argument as in ADR-17 for the x86 backend).
- **Different perf characteristics.** WASM has the host-call cost (ADR-16); ARM64 (the structured interpreter) doesn't. The benchmarks would tell a different story.
- **Teaching value.** The ARM64 backend is partly a teaching artifact. WASM hides the ARM64 (it's a stack machine, not a register machine).

This option is rejected for the same reason as the x86 backend.

### Use a real ARM64 encoder (machine code emission)

Write the byte sequences for each ARM64 instruction directly into an `ArrayBuffer`; mark the buffer executable; jump to it. Pros: real native speed. Cons:

- **Sandbox.** The browser sandbox doesn't allow executing arbitrary machine code (the same constraint as the x86 backend, ADR-17).
- **Encoder complexity.** A real ARM64 encoder is ~2000 LOC (vs ~1500 for x86 — ARM64's fixed 32-bit encoding is simpler than x86's variable-length, but still complex).
- **Outside the sandbox.** On a non-sandboxed runtime (Node, the future v4 AOT compiler), this would be possible. For v3.1's playground use case, it isn't.

This is the right answer for a real AOT compiler (v4); v3.1 uses the structured interpreter.

### Use an ARM64 interpreter library (like Unicorn with the ARM64 module)

Pros: real ARM64 semantics. Cons:

- **Bundle size.** Unicorn compiled to WASM is ~3 MB (the same argument as in ADR-17).
- **Latency.** Unicorn has a startup cost.
- **Complexity.** Unicorn's API is large.

The structured interpreter is the right answer for the playground.

## Drawbacks

- **More maintenance.** Five runtimes is more than four. The 2366-test suite's conformance layer has to pass on all five; the maintenance is real but sustainable.
- **Bundle size.** The ARM64 backend adds ~200 KB to the playground's bundle. The total is ~700 KB.
- **Not real native code.** The structured interpreter simulates ARM64 in JavaScript. The "speedup" is over the v2 VM (which is also simulated), not over real ARM64 code. A real ARM64 backend (v4) would be 2-3x faster.
- **No floating-point.** The v3.1 subset doesn't include `fadd`/`fmul`/etc. Programs that use floats fall back to the v2 VM. The v3.2 plan is to add floating-point.
- **No SIMD.** The v3.1 subset doesn't include `add.4s`/etc. Programs that benefit from vectorization (matrix multiplication, image processing) don't get the speedup. The v3.2 plan is to add SIMD.

## Open questions

1. **Frame pointer convention.** AAPCS64 allows omitting the frame pointer (X29 is then a general-purpose callee-saved register). The v3.1 backend keeps the frame pointer (for stack-walk-friendly debugging); a future "release" mode (v3.2) could omit it for ~1 register of extra allocation.
2. **Tail-call optimization.** The v3.1 backend doesn't do TCO (it pushes a frame for every call). A future v3.2 could add TCO, mirroring the v2 VM's `Op.TailCall`.
3. **Cross-compilation target.** The v3.1 backend runs in the structured interpreter in the browser. For "compile to ARM64 and download the binary" (the cross-compilation use case), the backend needs a real ARM64 encoder (the v4 plan, RFC under discussion).

## Cross-references

- [Chapter 15 the x86 backend](../book/ch15-the-x86-backend.md) — the parallel x86 backend, with the structured-interpreter approach.
- [ADR-17 x86 structured interpreter](../decisions/adr-17-x86-structured-interpreter.md) — the x86 decision; the ARM64 backend follows the same approach.
- [ADR-25 4 runtimes coexist](../decisions/adr-25-4-runtimes-coexist.md) — the v3 decision; the ARM64 backend is the v3.1 addition.
- [RFC-010 RISC-V backend](rfc-010-riscv-backend.md) — the parallel RISC-V RFC.
- [RFC-011 JIT compiler](rfc-011-jit-compiler.md) — the v3.2 JIT plan, which builds on both the x86 and ARM64 backends.
- [RFC-006 WASM backend](rfc-006-wasm-backend.md) — the v3 WASM backend, the third runtime.
- [Chapter 20 the road ahead](../book/ch20-the-road-ahead.md) §20.2 — the ARM64 backend in the roadmap.

## Prior art

- **Apple's ARM64 backend in LLVM** — the production-quality ARM64 backend, the reference for instruction selection.
- **The Rust ARM64 backend (rustc)** — the production-quality Rust backend, the reference for the calling convention.
- **Unicorn engine** — the ARM64 emulator, used in security research; a different approach (real emulator, not structured interpreter).
- **The v3 x86 backend** — the parallel backend, the design template.

## Status

This RFC is at stage 1 (Implementation sketch). The next step is to prototype the ARM64 backend (instruction selection + register allocation + codegen + structured interpreter) and validate the 3-4x speedup on the canonical benchmarks. If the prototype runs `fib(25)` in ~25ms (vs the v2 VM's 50ms), the RFC moves to stage 2 (Implementation).
