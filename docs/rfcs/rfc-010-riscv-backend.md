# RFC-010 — RISC-V native backend

> Status: Draft
> Stage: 1 (Implementation sketch)
> Discussion: open
> Related: [Chapter 15 the x86 backend](../book/ch15-the-x86-backend.md), [RFC-009 ARM64 backend](rfc-009-arm64-backend.md), [ADR-17 x86 structured interpreter](../decisions/adr-17-x86-structured-interpreter.md), [ADR-25 4 runtimes coexist](../decisions/adr-25-4-runtimes-coexist.md), [RFC-011 JIT compiler](rfc-011-jit-compiler.md)

## Summary

Aether v3.1 adds a RISC-V native backend, the sixth runtime. The backend lowers Aether IR to RISC-V (RV64IMAFDC, the "G" general-purpose extension plus the C compressed extension), parses the assembly with a hand-written parser, and runs it in a structured interpreter — following the same pattern as the x86 and ARM64 backends (ADR-17, RFC-009). The expected speedup over the v2 bytecode VM is **2-3x** (slightly lower than x86's 3.5x and ARM64's 3-4x, because RISC-V's smaller register file — 16 vs 16/31 — and the C extension's variable encoding add some overhead). The backend targets the educational use case (RISC-V is the cleanest teaching ISA), the open-hardware community (SiFive, the RISC-V International ecosystem), and the cross-compilation use case (compile to RISC-V, run on a SiFive board or a VisionFive 2).

This RFC specifies the RISC-V instruction subset, the calling convention, the register allocation, the structured interpreter, the calling convention for host builtins, the C extension handling, and the relationship to the existing x86 and ARM64 backends.

## Motivation

The v3 milestone shipped four runtimes. The v3.1 milestone adds ARM64 (RFC-009) and RISC-V. RISC-V is the principled choice:

1. **The open ISA.** RISC-V is the open ISA — anyone can implement it, anyone can extend it, no licensing fees. The choice for emerging markets (the RISC-V International ecosystem), academia (RISC-V is the default teaching ISA in many universities), and the open-hardware community (SiFive, the VisionFive 2, the BeagleV). An Aether that compiles to RISC-V is a hedge against the closed-ISA future.
2. **The cleanest teaching ISA.** The base RV32I is 37 instructions; RV64I is the same with 64-bit. The instruction encoding is regular (a fixed 16/32-bit format, with the C compressed extension for the variable case). The register file is small (16 GP registers). The instruction selection is almost mechanical (the regularity of the encoding makes it so). A student who learns native codegen from the RISC-V backend can apply it to a much wider range of hardware than x86 or ARM64.
3. **The cleanest target.** RISC-V is the cleanest target: the ISA is small, the encoding is regular, the calling convention is simple (the RISC-V ELF psABI), the spec is well-documented (the RISC-V ISA Manual is ~600 pages, vs the ARM64 ARM Manual at ~8000 pages and the Intel SDM at ~5000 pages). The implementation is smaller than the x86 or ARM64 backends (~1200 LOC vs ~1800 and ~1500).
4. **The cross-compilation use case.** Compile to RISC-V on a laptop, download the binary, run on a SiFive board. The playground's "Compile to RISC-V" button (v3.1) produces a `.bin` file the user can `scp` to their RISC-V board and run. The structured interpreter in the playground is for teaching; the real binary is for deployment.

The motivation is *not* performance — RISC-V's smaller register file (16 vs 16/31) and the C extension's variable encoding make the 2-3x speedup slightly lower than the x86 (3.5x) and ARM64 (3-4x) backends. The motivation is principle: open ISA, clean teaching, clean target, cross-compilation.

## Detailed design

### The RISC-V instruction subset

The backend targets RV64IMAFDC: the base integer ISA (RV64I), the multiply extension (M), the atomic extension (A), the float extension (F), the double extension (D), and the compressed extension (C). The v3.1 backend uses a small subset (~30 instructions) covering ~95% of the generated code:

```
// RV64I base (integer)
addi  rd, rs1, imm12     // rd = rs1 + imm12 (12-bit immediate)
add   rd, rs1, rs2       // rd = rs1 + rs2
sub   rd, rs1, rs2       // rd = rs1 - rs2
mul   rd, rs1, rs2       // rd = rs1 * rs2 (M extension)
div   rd, rs1, rs2       // rd = rs1 / rs2 (M extension, signed)
divu  rd, rs1, rs2       // rd = rs1 / rs2 (M extension, unsigned)
rem   rd, rs1, rs2       // rd = rs1 % rs2 (M extension, signed)
and   rd, rs1, rs2       // rd = rs1 & rs2
or    rd, rs1, rs2       // rd = rs1 | rs2
xor   rd, rs1, rs2       // rd = rs1 ^ rs2
sll   rd, rs1, rs2       // rd = rs1 << rs2 (logical)
srl   rd, rs1, rs2       // rd = rs1 >> rs2 (logical)
sra   rd, rs1, rs2       // rd = rs1 >> rs2 (arithmetic)
slt   rd, rs1, rs2       // rd = (rs1 < rs2) ? 1 : 0 (signed)
slti  rd, rs1, imm12     // rd = (rs1 < imm12) ? 1 : 0
sltu  rd, rs1, rs2       // unsigned
sltiu rd, rs1, imm12     // unsigned

// Memory
ld    rd, imm12(rs1)     // load 8 bytes (RV64)
sd    rs2, imm12(rs1)    // store 8 bytes (RV64)
lw    rd, imm12(rs1)     // load 4 bytes (sign-extended)
sw    rs2, imm12(rs1)    // store 4 bytes
lwu   rd, imm12(rs1)     // load 4 bytes (zero-extended)
lh    rd, imm12(rs1)     // load 2 bytes
sh    rs2, imm12(rs1)    // store 2 bytes
lb    rd, imm12(rs1)     // load 1 byte
sb    rs2, imm12(rs1)    // store 1 byte

// Control flow
beq   rs1, rs2, label    // branch if equal
bne   rs1, rs2, label    // branch if not equal
blt   rs1, rs2, label    // branch if less than (signed)
bltu  rs1, rs2, label    // unsigned
bge   rs1, rs2, label    // branch if greater or equal (signed)
bgeu  rs1, rs2, label    // unsigned
jal   rd, label          // jump and link (rd = return address)
jalr  rd, imm12(rs1)     // jump and link register
lui   rd, imm20         // load upper immediate (20-bit, fills bits 12-31)
auipc rd, imm20         // add upper immediate to PC

// Pseudo-instructions (the assembler expands these)
li    rd, imm           // load immediate (lui + addi)
la    rd, label         // load address (auipc + addi)
mv    rd, rs            // move (addi rd, rs, 0)
neg   rd, rs            // negate (sub rd, x0, rs)
not   rd, rs            // bitwise not (xori rd, rs, -1)
j     label             // jump (jal x0, label)
jr    rs                // jump register (jalr x0, 0(rs))
ret                     // return (jalr x0, 0(ra))
call  label             // call (auipc + jalr)
```

The subset is intentionally small. The v3.1 backend doesn't support the A (atomic) extension, the F/D (float/double) extensions (the same limitation as the x86 and ARM64 backends; v3.2 will add them), or the V (vector) extension (v3.3+).

The C (compressed) extension: 16-bit encodings of the most common instructions (`c.addi`, `c.ld`, `c.sd`, `c.beq`, etc.). The v3.1 backend handles the C extension by parsing it as a separate instruction class (the 16-bit form). The structured interpreter dispatches on the high bits of the instruction (bits 15-13) to distinguish C from non-C.

### The calling convention

The backend uses the RISC-V ELF psABI calling convention (the standard Linux RISC-V calling convention):

- **Integer/pointer arguments** in registers a0-a7 (x10-x17, first 8 args).
- **Float arguments** in registers fa0-fa7 (f10-f17, first 8 float args).
- **Return value** in a0 (or a1 for 128-bit returns).
- **Caller-saved** (the callee may clobber): t0-t6 (x5-x7, x28-x31), a0-a7 (x10-x17), ft0-ft11 (f0-f11).
- **Callee-saved** (the callee must preserve): s0-s11 (x8-x9, x18-x27), fs0-fs11 (f8-f19).
- **Special registers**: zero (x0, hardwired zero), ra (x1, return address), sp (x2, stack pointer), gp (x3, global pointer), tp (x4, thread pointer), fp (x8, frame pointer, = s0).
- **Stack**: 16-byte aligned. The stack grows downward; sp points to the last used slot.
- **Frame**: `addi sp, sp, -FRAME_SIZE; sd ra, FRAME_SIZE-8(sp); sd fp, FRAME_SIZE-16(sp); addi fp, sp, FRAME_SIZE` (prologue); the epilogue reverses.

The backend's prologue:

```
myfunc:
  addi  sp, sp, #-FRAME_SIZE     // allocate frame
  sd    ra, FRAME_SIZE-8(sp)    // save return address
  sd    fp, FRAME_SIZE-16(sp)   // save frame pointer
  addi  fp, sp, FRAME_SIZE      // fp = sp + FRAME_SIZE
  // ... body ...
  ld    ra, FRAME_SIZE-8(sp)
  ld    fp, FRAME_SIZE-16(sp)
  addi  sp, sp, FRAME_SIZE
  ret                            // jump to ra
```

### Register allocation

RISC-V has 31 GP registers (x0-x31, with x0 hardwired to zero) and 32 FP registers (f0-f31). The allocator uses linear-scan, with 16 allocatable GP registers (after reserving x0/zero, x1/ra, x2/sp, x3/gp, x4/tp, x8/fp = s0, x10-x17 = a0-a7, x28-x31 = t3-t6) and 16 allocatable FP registers (after reserving f0-f11 = ft0-ft11 and f12-f17 = fa0-fa7).

The allocation strategy:

- **Arguments** in a0-a7 (per the psABI).
- **Locals** in s1-s11 (callee-saved; the function saves and restores them in the prologue/epilogue).
- **Temporaries** in t0-t6 (caller-saved; the function can clobber them).
- **Frame pointer** in s0 (= fp).
- **Return address** in ra.

The allocator is the same linear-scan as the x86 and ARM64 backends, with 16 registers (vs x86's 16, ARM64's 16). The smaller register count (vs ARM64's 31 in principle, but the allocator uses the same 16) means slightly more spilling for tight loops, hence the 2-3x speedup vs 3-4x for ARM64.

### The structured interpreter

The structured interpreter mirrors the x86 and ARM64 backends. It parses the RISC-V assembly into a list of instructions, and runs the instructions in a loop:

- **31 GP registers** as a JavaScript `BigInt64Array` (with x0 = 0 always).
- **32 FP registers** as a JavaScript `Float64Array`.
- **The PC** as an integer index into the instruction array.
- **The stack** as a JavaScript `BigInt64Array` of 4096 entries (32 KB).
- **Memory** as a JavaScript `ArrayBuffer` (rarely used; most loads/stores go through the stack).

The interpreter dispatches each instruction by opcode. The cost is ~100 ns per instruction; the instruction count per program is ~3-5x lower than the bytecode VM; the net speedup is 2-3x.

### Host builtins

The structured interpreter provides the three host builtins (the same as the x86 and ARM64 backends and the bootstrap, ADR-21): `read_file`, `print`, `panic`. The RISC-V backend's calling convention for host builtins is:

```
li    a0, string_offset
li    a1, string_length
call  host_print
```

The host `print` reads a0 (string offset) and a1 (string length), reads the bytes from memory, prints them, and returns. The structured interpreter intercepts the `call` to known host functions and dispatches to JavaScript.

### The codegen

The codegen walks the IR and emits RISC-V instructions. The mapping from IR ops to RISC-V:

| IR op                  | RISC-V                                            |
|------------------------|---------------------------------------------------|
| `LoadInt r, 5`         | `li Xd, 5` (lui + addi)                           |
| `Add r, lhs, rhs`      | `add Xd, Xn, Xm`                                  |
| `Sub r, lhs, rhs`      | `sub Xd, Xn, Xm`                                  |
| `Mul r, lhs, rhs`      | `mul Xd, Xn, Xm`                                  |
| `Eq r, lhs, rhs`       | `sub Xd, Xn, Xm; seqz Xd, Xd` (set if zero)       |
| `Lt r, lhs, rhs`       | `slt Xd, Xn, Xm`                                  |
| `JmpIf r, label`       | `bnez Xd, label`                                  |
| `Call r, fn_reg`       | `call fn`                                          |
| `Return r`             | `mv a0, Xd; ret`                                  |

The codegen is simpler than x86 (regular encoding, no ModR/M byte) and similar to ARM64 (both are RISC, both have 3-operand arithmetic). The C compressed extension is handled by the assembler (the parser distinguishes C from non-C by the high bits).

### Cross-compilation

The structured interpreter is for teaching (the user sees the RISC-V instructions, the registers, the memory). For deployment (the user wants to run on real RISC-V hardware), the backend needs a real RISC-V encoder (the v4 plan).

The v3.1 plan includes a "Compile to RISC-V binary" mode (in the playground's "Build" menu), which produces an ELF binary the user can `scp` to their RISC-V board. This requires a real RISC-V encoder, which is ~1500 LOC (less than the x86 encoder because RISC-V's encoding is regular). The v3.1 plan is to implement the encoder as part of the backend.

## Alternatives considered

### Use the WASM backend as the "RISC-V backend"

Run the WASM backend on a RISC-V host (which has a WASM engine, e.g., Wasmtime on RISC-V). Pros: no new backend. Cons:

- **Not really RISC-V.** The user expects "RISC-V backend" to mean "RISC-V machine code." Calling WASM "RISC-V" is dishonest (same argument as in ADR-17).
- **Different perf characteristics.** WASM has the host-call cost; RISC-V doesn't.
- **Teaching value.** The RISC-V backend is partly a teaching artifact. WASM hides the RISC-V.

This option is rejected for the same reason as the x86 and ARM64 backends.

### Use a real RISC-V encoder

Write the byte sequences for each RISC-V instruction directly into an `ArrayBuffer`; mark the buffer executable; jump to it. Pros: real native speed. Cons:

- **Sandbox.** The browser sandbox doesn't allow executing arbitrary machine code (same as x86 and ARM64).
- **Encoder complexity.** A real RISC-V encoder is ~1500 LOC (simpler than x86's ~5000, simpler than ARM64's ~2000, but still complex).
- **Outside the sandbox.** On a non-sandboxed runtime, this would be possible. For v3.1's playground use case, it isn't (except for the "Compile to RISC-V binary" cross-compilation mode, which is the encoder, implemented separately).

The structured interpreter is the right answer for the playground. The real encoder is for cross-compilation.

### Use a RISC-V interpreter library (like Unicorn with the RISC-V module, or Spike)

Pros: real RISC-V semantics. Cons:

- **Bundle size.** Unicorn is ~3 MB; Spike is ~10 MB.
- **Latency.** Both have startup costs.
- **Complexity.** Both have large APIs.

The structured interpreter is the right answer.

## Drawbacks

- **More maintenance.** Six runtimes is more than five. The maintenance is real but sustainable.
- **Bundle size.** The RISC-V backend adds ~150 KB to the playground's bundle. The total is ~850 KB.
- **Not real native code.** The structured interpreter simulates RISC-V in JavaScript. The "speedup" is over the v2 VM, not over real RISC-V code.
- **No floating-point.** The v3.1 subset doesn't include the F/D extensions. Programs that use floats fall back to the v2 VM. The v3.2 plan is to add floating-point.
- **No atomics.** The v3.1 subset doesn't include the A extension. Programs that need atomics (for the future parallel runtime, v4+) fall back to the v2 VM. The v3.2 plan is to add atomics.
- **2-3x speedup, not 3-4x.** RISC-V's smaller register file and the C extension's variable encoding add some overhead. The speedup is real but slightly lower than ARM64.

## Open questions

1. **C extension handling.** The C extension adds 16-bit encodings, which the parser has to distinguish from the 32-bit encodings. The v3.1 backend handles it; the implementation is ~100 LOC. Whether the C extension is worth the implementation cost (vs just using 32-bit encodings) is open.
2. **Frame pointer convention.** The RISC-V psABI allows omitting the frame pointer (s0 is then a general-purpose callee-saved register). The v3.1 backend keeps the frame pointer; a future "release" mode (v3.2) could omit it for ~1 register of extra allocation.
3. **Cross-compilation target.** The v3.1 backend supports both the structured interpreter (in-browser) and the real encoder (cross-compilation). Whether the encoder is shipped in the v3.1 milestone or deferred to v3.2 is open.

## Cross-references

- [Chapter 15 the x86 backend](../book/ch15-the-x86-backend.md) — the parallel x86 backend.
- [RFC-009 ARM64 backend](rfc-009-arm64-backend.md) — the parallel ARM64 RFC.
- [ADR-17 x86 structured interpreter](../decisions/adr-17-x86-structured-interpreter.md) — the x86 decision; the RISC-V backend follows the same approach.
- [ADR-25 4 runtimes coexist](../decisions/adr-25-4-runtimes-coexist.md) — the v3 decision; the RISC-V backend is the v3.1 addition.
- [RFC-011 JIT compiler](rfc-011-jit-compiler.md) — the v3.2 JIT plan, which builds on the x86, ARM64, and RISC-V backends.
- [Chapter 20 the road ahead](../book/ch20-the-road-ahead.md) §20.3 — the RISC-V backend in the roadmap.

## Prior art

- **The RISC-V ISA Manual** — the official specification, the reference for instruction selection.
- **The Rust RISC-V backend (rustc)** — the production-quality Rust backend, the reference for the calling convention.
- **Spike** — the official RISC-V ISA simulator; a different approach (real simulator, not structured interpreter).
- **Unicorn engine** — the RISC-V emulator, used in security research.
- **The v3 x86 and ARM64 backends** — the parallel backends, the design template.

## Status

This RFC is at stage 1 (Implementation sketch). The next step is to prototype the RISC-V backend (instruction selection + register allocation + codegen + structured interpreter) and validate the 2-3x speedup. If the prototype runs `fib(25)` in ~30ms (vs the v2 VM's 50ms), the RFC moves to stage 2 (Implementation). The cross-compilation encoder is a v3.2 stretch goal.
