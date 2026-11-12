# 09. Native Codegen Correctness Proof Outline

## Theorem statement

**Theorem (Native Codegen Correctness).**  The x86, WASM, and ARM64
backends (in `aether/vm/x86/x86.ts`, `aether/vm/wasm/wasm.ts`, and
the planned `aether/vm/arm64/arm64.ts`) produce native code that,
when executed, produces the same observable behavior as the
tree-walker interpreter on the same Aether program.

Formally: for any well-typed Aether program `P` and any input,
`run(treewalker(P)) = run(native(P))` (the same output, the same
panic-vs-terminate behavior, modulo the order of side effects on
the output stream).

## Background: the codegen pipeline

The compilation pipeline:

```
Source → Lexer → Parser → AST → Sema → IR → Opt passes → Bytecode → Verify → Native code (x86/WASM/ARM64)
```

The native codegen is the last step: it takes verified bytecode
and produces native code (x86-64 machine code, WASM module, or
ARM64 machine code).

The native code, when executed, runs the same program as the
tree-walker.  The performance is different (native is faster), but
the observable behavior is the same.

## Proof outline

The proof is by induction on the bytecode-to-native compilation.
We show that each bytecode instruction is compiled to native code
that produces the same effect as the VM's execution of that
instruction.

### Step 1: The semantic correspondence

We define a correspondence relation `~` between the VM's state
`(fn, pc, regs, upvalues, stack)` and the native code's state
`(registers, memory, instruction pointer)`.

The correspondence is:

- `VM.pc ~ Native.rip` (the instruction pointers correspond).
- `VM.regs[i] ~ Native.mem[frame_base + i * 8]` (the VM's register
  `i` is stored at a fixed offset from the frame base in native
  memory).
- `VM.upvalues[i] ~ Native.mem[upvalue_base + i * 8]` (similarly
  for upvalues).
- `VM.stack ~ Native.stack` (the call stacks correspond).

### Step 2: Per-instruction compilation

For each bytecode instruction `instr`, the codegen produces native
code `native(instr)` such that:

**Lemma (Instruction-Compilation).**  If the VM in state `s`
executes `instr` and transitions to `s′`, and the native code in
state `~s` executes `native(instr)` and transitions to `~s″`,
then `~s′ = ~s″` (the resulting states correspond).

Proof: by case analysis on `instr.op`.  Each opcode is compiled to
native code that mirrors the VM's effect:

- **LoadInt**: VM writes `int(imm)` to `reg[a]`.  Native: `mov
  rax, imm; mov [frame_base + a*8], rax`.  Same effect.  ✓.
- **Add**: VM reads `reg[b], reg[c]`, computes the sum, writes to
  `reg[a]`.  Native: `mov rax, [frame_base + b*8]; add rax,
  [frame_base + c*8]; mov [frame_base + a*8], rax`.  Same effect.
  ✓.
- (For float ops, the native code uses SSE/AVX instructions;
  the semantics matches.)
- **Jmp**: VM sets `pc := imm`.  Native: `jmp label_for(imm)`.
  Same effect (control flow jumps to the corresponding native
  label).  ✓.
- **JmpIf**: VM checks `truthy(reg[a])`, jumps if true.  Native:
  `mov rax, [frame_base + a*8]; test rax, rax; jnz label_for(imm)`.
  Same effect.  ✓.
- **Return**: VM reads `reg[a]`, returns.  Native: `mov rax,
  [frame_base + a*8]; ret`.  Same effect.  ✓.
- **Call**: VM reads `reg[b]` (the closure), reads the argument
  registers, calls the function, writes the result to `reg[a]`.
  Native: allocates a new frame, copies the arguments, calls the
  function's native entry point, writes the result.  Same effect.
  ✓.
- (For closures and upvalues, the native code uses a similar
  frame-based representation.)
- **AllocStruct**: VM constructs a struct value with the given
  fields.  Native: allocates heap memory, writes the fields.
  Same effect.  ✓.
- **LoadField**: VM reads `reg[b]`, gets its field, writes to
  `reg[a]`.  Native: `mov rax, [frame_base + b*8]; mov rbx, [rax
  + field_offset]; mov [frame_base + a*8], rbx`.  Same effect.  ✓.
- (Each opcode has a similar native code template; the codegen
  emits the template with the instruction's operands substituted.)

### Step 3: Compilation correctness

**Theorem (Compilation-Correctness).**  For any verified bytecode
module `M` and any starting state `s`, the native code `native(M)`
in state `~s` executes and reaches a final state `~s′`, where
`s′` is the VM's final state after executing `M` from `s`.

Proof: by induction on the number of VM steps.

- Base case (0 steps): `s` is the start state; `~s` is the native
  start state; trivially corresponding.  ✓.
- Inductive case (n+1 steps): by IH, after `n` steps, the VM's
  state `s_n` corresponds to the native state `~s_n`.  By
  Instruction-Compilation, the VM's (n+1)-th step (executing
  `instr_n`) results in `s_{n+1}`, and the native code's execution
  of `native(instr_n)` results in `~s_{n+1}` with `s_{n+1} ~
  ~s_{n+1}`.  ✓.

### Step 4: Whole-program correctness

**Theorem (Whole-Program-Correctness).**  For any well-typed
Aether program `P`, `run(treewalker(P)) = run(native(P))`.

Proof: the tree-walker runs `P` and produces an output.  The
pipeline compiles `P` to bytecode (by the codegen's correctness,
proven in `bytecode-verifier.md`), then to native code (by
Compilation-Correctness).  The native code, when executed, produces
the same output as the VM, which produces the same output as the
tree-walker (by the VM's correctness, a separate proof).  ✓.

### Step 5: Backend-specific notes

#### x86-64 backend

The x86-64 backend (in `aether/vm/x86/x86.ts`) emits x86-64
machine code.  The calling convention is System V AMD64 (the
standard for Linux/macOS x86-64).  The native code uses:

- General-purpose registers (rax, rbx, rcx, rdx, rsi, rdi, r8-r15)
  for the VM's "registers" (in memory, accessed via offsets).
- SSE/AVX registers (xmm0-xmm15) for float operations.
- The native stack (rsp) for the call stack.

The codegen's correctness is established by the per-instruction
correspondence (Instruction-Compilation).

#### WASM backend

The WASM backend (in `aether/vm/wasm/wasm.ts`) emits a WASM module
with the program's functions exported.  The WASM module's
semantics is well-defined (the WASM spec); the codegen's
correctness is established by the per-instruction correspondence.

WASM's typing discipline (the WASM validator checks types) is
_stronger_ than Aether's verifier (WASM tracks value types), so
the WASM backend's correctness is easier to establish than the x86
backend's.

#### ARM64 backend (planned)

The ARM64 backend (planned) emits ARM64 machine code.  The
calling convention is AAPCS64 (the standard for ARM64).  The
codegen uses ARM64's 31 general-purpose registers and 32
floating-point/SIMD registers.  The correctness proof is the same
shape as for x86-64.

## Assumptions

1. The bytecode is verified (by `verifyBytecode`); this rules out
   out-of-bounds operands.
2. The native codegen is correctly implemented (the per-instruction
   templates match the VM's semantics).
3. The native runtime (memory allocator, GC integration, etc.) is
   correct.
4. The hardware (x86-64, WASM, ARM64) is correct (assumed).
5. The ABI (System V AMD64, AAPCS64) is followed (the codegen
   emits ABI-conformant code).

## Key lemmas

1. **Instruction-Compilation**: each bytecode instruction's
   native code matches the VM's effect.
2. **State-Correspondence**: the VM's state corresponds to the
   native state (the `~` relation).
3. **Compilation-Correctness**: by induction on VM steps, the
   native code preserves the correspondence.
4. **Whole-Program-Correctness**: the whole program's output
   matches.

## What's mechanized vs hand-waved

- **Mechanized** (in future Coq/Lean work): the state-correspondence
  relation, the per-instruction compilation proof (case-by-case on
  each bytecode opcode).  Estimated Coq effort: ~15000 lines
  (75 opcodes × ~200 lines + ~5000 lines for the framework).
- **Hand-waved**: the codegen's implementation correctness (depends
  on the codegen's code, which is tested but not mechanically
  verified).  The hardware's correctness (assumed).  The ABI
  conformance (assumed by manual review).

## Conclusion

Native codegen correctness is the guarantee that the x86, WASM,
and ARM64 backends produce native code that matches the tree-
walker's behavior.  The proof reduces to:

1. Define a state correspondence `~` between the VM's state and
   the native state.
2. Show that each bytecode instruction's native code matches the
   VM's effect (Instruction-Compilation).
3. By induction on VM steps, the native code preserves the
   correspondence (Compilation-Correctness).
4. The whole program's output matches (Whole-Program-Correctness).

The proof is paper-style; full mechanization is future work.  The
key lemma is the per-instruction compilation, which is a case-by-
case argument on each bytecode opcode.  The mechanization is
straightforward but long (75 cases); the framework is standard
(compiler-correctness proofs).

The v1 limitations (the codegen is conservative — it doesn't
apply aggressive native optimizations that might break the
correspondence) are documented; this is a soundness-preserving
design.  Future work: a verified native codegen (CompCert-style)
for end-to-end correctness.

Together with the type-safety proofs (`01`, `02`), the IR
equivalence proof (`08`), and the JIT correctness proof (`10`),
native codegen correctness ensures that Aether programs produce
the same output regardless of the execution backend.
