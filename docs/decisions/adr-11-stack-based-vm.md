# ADR-11 — Stack-based VM for v2

> Status: Accepted
> Date: 2024-03-01
> Decision-maker: Aether core team
> Supersedes: none
> Superseded by: (none yet)
> Related: [ADR-01](adr-01-tree-walking-interpreter-for-v1.md), [RFC-002](../rfcs/rfc-002-bytecode-vm.md), [ADR-12](adr-12-ssa-ir-without-phi.md)

## Context

Aether v2 introduces a bytecode VM to address the v1 tree-walker's perf ceiling (see ADR-01 for why v1 used a tree-walker, and RFC-002 for the v2 VM motivation). Once the decision to build a VM was made, the next architectural choice was: **stack-based** or **register-based**?

A *stack-based* VM has:
- An operand stack (push, pop, peek).
- Instructions that take their operands from the stack and push results back.
- Example: the JVM, the .NET CLR, Python's CPython VM, Lua 5.0's VM.

A *register-based* VM has:
- A fixed-size register file per call frame.
- Instructions that reference registers by index (`r1`, `r2`, ...).
- Example: Lua 5.1+'s VM, Dalvik, Android's ART, LuaJIT's IR.

There are also hybrids — register-based with a stack for spills, or stack-based with explicit local slots — but the two main camps are clear.

The constraints on the decision:

- **Implementation cost.** The tree-walker is the reference; the VM should be implementable in a reasonable time (a few weeks, not a few months).
- **Code density.** Bytecode size matters for the playground's "load program" step and for a future WASM backend. Smaller bytecode loads faster.
- **Dispatch cost.** Each instruction's dispatch is a switch case in the VM's main loop. The fewer instructions, the better the host's branch predictor predicts.
- **Optimizer integration.** The VM should be a good target for the 8 optimizer passes (constant folding, DCE, CSE, inlining, TCO, LICM, strength reduction, branch simplification).
- **REPL / debug / LSP integration.** The VM should be debuggable; the IR should be readable; the bytecode should be disassemble-able.
- **Future backends.** The VM is one target; a WASM backend (RFC-006) and a native backend (planned) are others. The choice should not lock out future backends.

## Options considered

### Option 1: Pure stack-based

Like the JVM. Each instruction has implicit operands (the top of the stack).

- `LoadInt 42` — push 42.
- `LoadInt 10` — push 10.
- `Add` — pop two, push sum.
- `Print` — pop, print.

Pros:
- Code density is excellent — most instructions are 1 byte (opcode) + 1-2 byte immediate. No register indices.
- The instruction set is small (~30-50 opcodes).
- Simple to implement (push, pop, peek).
- Easy to write a codegen (just emit pushes and pops in post-order).

Cons:
- Lots of stack traffic. Each `Add` is two pops and a push — three memory operations.
- Hard to address operands by name. The intermediate IR has to keep track of stack depths.
- Hard to do CSE / LICM / inlining — these passes want to address values by name (register), not by stack position.
- The stack itself is a hot memory location; spilling to the heap (for non-trivial closures) is awkward.

### Option 2: Pure register-based

Like Lua 5.1+. Each instruction has explicit register operands.

- `LoadInt r1, 42`
- `LoadInt r2, 10`
- `Add r3, r1, r2`
- `Print r3`

Pros:
- The optimizer passes are easy: registers are first-class names; CSE, LICM, inlining all "just work".
- The IR can be a simple three-address form: `dest, src1, src2`.
- No stack to manage.
- Each instruction is self-contained — easier to disassemble and debug.

Cons:
- Code density is worse. Each instruction needs 2-3 register indices (1 byte each), on top of the opcode and immediate.
- The register file per frame is bigger (a fixed-size array per frame, even if most slots are unused).
- More instructions to dispatch (the host's branch predictor has more cases to learn).
- Harder to write a codegen — you have to allocate registers (a register allocator).

### Option 3: Hybrid — register file with stack for evaluation

Like LuaJIT's IR. A register file per frame, but with an operand stack for short-lived values.

Pros:
- Best of both: dense instructions for short expressions, register-named values for the optimizer.

Cons:
- Two parallel mechanisms to manage.
- The "register vs stack" decision per value adds complexity.

### Option 4: Stack-based with named locals

Like Python 3.x's CPython VM. The operand stack is for evaluation; locals (variables) are addressed by index in a side table.

Pros:
- Stack-based dispatch density + named locals for the optimizer.
- Python's VM is well-understood; the design is proven.

Cons:
- Still has the stack-traffic problem for short-lived values.
- The "is this a local or a stack slot?" decision per value.

## Decision

**Aether v2 uses a stack-based VM, but with a register file per frame for named values (locals, parameters, captured upvalues).**

The instruction set has 80+ opcodes (see Chapter 9). The "stack-based" part is conceptual — most instructions take a destination *register* (e.g., `Add r_dst, r_lhs, r_rhs`). The "named locals" part is that locals are stored in registers (not on a separate operand stack).

In effect, this is a *register-based* VM in the Lua 5.1+ sense, but we call it "stack-based" because:

- The frame stack is the dominant data structure (one frame per call, allocated on the call stack).
- The register file is *per frame* (not a global register file).
- The codegen is a simple post-order traversal of the AST: each expression's result is stored in a fresh register; each statement emits its instructions.

The optimizer passes operate on the IR (which is register-numbered), not the bytecode. The IR has `LoadInt r0, 42`, `Add r2, r0, r1`, etc. The codegen lowers the IR to bytecode (which has the same opcode shape). The VM interprets the bytecode.

This is the Lua 5.1+ design (a "register-based VM with a per-frame register file"), but we keep the "stack-based" terminology for consistency with the literature on stack VMs.

## Rationale

The decision came down to:

1. **Optimizer integration is critical.** The 8 optimizer passes (constant folding, DCE, CSE, inlining, TCO, LICM, strength reduction, branch simplification) all need to address values by name. A pure stack-based VM would require an extra layer of "stack-shape tracking" in the IR; a register-based VM has the names built-in.

2. **Code density matters less than we thought.** The benchmark corpus is small (6 benchmarks); the bytecode fits in a few KB. The "load program" step is <1ms either way. Density would matter more for a native backend (RFC pending) — but there we'd use a different IR (e.g., LLVM IR), not the bytecode directly.

3. **The implementation cost of a register allocator is real.** A simple "allocate a fresh register per value" works (we don't need graph coloring), and we get CSE / DCE / LICM essentially for free. A pure stack-based VM would require "stack-shape analysis" which is the same work in a different shape.

4. **The disassembler and debugger are easier with named registers.** `Add r2, r0, r1` is self-documenting; `Add` (with implicit operands on a stack) requires the reader to track the stack mentally.

5. **Future backends are easier.** The WASM backend (RFC-006) compiles the IR to WASM, which is a stack-based VM itself — but WASM's locals are register-like. A register-based IR maps cleanly to WASM locals.

## Consequences

- **Per-frame register file.** Each frame has a `regs: Value[]` array of fixed size (the function's `regCount`). Most slots are unused for most functions; the memory cost is acceptable.
- **Codegen is a post-order traversal.** Each expression gets a fresh register; each statement emits its instructions. The IR builder does the same. No register allocator needed (we just allocate fresh registers).
- **The IR is "SSA-without-phi" (see ADR-12).** Each register is assigned once. The 8 optimizer passes work on this IR.
- **Bytecode is the serialized form of the IR.** The opcode shape is the same (e.g., `Add r_dst, r_lhs, r_rhs`); the encoding is a compact binary format.
- **Disassembler output is human-readable.** Each instruction is a line: opcode + operands. The match-table side table and the variadic register-list side table are shown as cross-references.

## What we rejected

- **A pure stack-based VM** — rejected because of the optimizer integration cost.
- **A pure register-based VM with a register allocator** — rejected because the allocator is unnecessary complexity; "fresh register per value" is simpler and gets the same optimizer benefits.
- **A hybrid (stack + registers)** — rejected because two parallel mechanisms add complexity without enough benefit.

## What's next

- The 8 optimizer passes operate on the IR (Chapter 10).
- The codegen lowers the optimized IR to bytecode (`aether/vm/codegen/codegen.ts`).
- The VM interprets the bytecode (`aether/vm/interpreter/vm.ts`).
- The disassembler (`aether/vm/bytecode/bytecode.ts:disassemble`) prints the bytecode for debugging.
- The WASM backend (RFC-006) will compile the IR to WASM directly (skipping the bytecode step).
