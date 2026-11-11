# ADR-12 — SSA IR without phi nodes

> Status: Accepted
> Date: 2024-03-15
> Decision-maker: Aether core team
> Supersedes: none
> Superseded by: (none yet)
> Related: [ADR-11](adr-11-stack-based-vm.md), [RFC-002](../rfcs/rfc-002-bytecode-vm.md)

## Context

Aether v2's bytecode VM (ADR-11) needs an intermediate representation (IR) between the AST and the bytecode. The IR is the substrate for the 8 optimizer passes (Chapter 10). The natural choice for an optimizer-friendly IR is **SSA** (Static Single Assignment), the form used by LLVM, Cranelift, and most modern compilers.

In SSA, every variable is assigned exactly once. When a variable would be re-assigned (in source-level code), SSA introduces a new version: `x1 = ...; x2 = ...`. At control-flow join points (where two paths converge and a variable has different versions on each path), SSA introduces **phi nodes** — a special instruction that picks the right version based on which path was taken:

```
  if cond {
    x1 = 1
  } else {
    x2 = 2
  }
  x3 = phi(x1, x2)  // x3 is x1 if we came from the then, x2 if from the else
```

Phi nodes are the canonical SSA mechanism, but they have costs:

- **Implementation cost.** Building SSA requires a dominance-frontier analysis; inserting phi nodes correctly is non-trivial.
- **Optimizer complexity.** Some passes (e.g., copy propagation) have to handle phi nodes specially.
- **Codegen cost.** Phi nodes don't map directly to a register-based VM; the codegen has to "deconstruct" SSA by inserting copies at the right places (the "SSA deconstruction" pass).

The decision: **does Aether v2 use full SSA with phi nodes, or a simpler "SSA-without-phi" form?**

The constraints:

- **Optimizer benefit.** The 8 passes need a substrate where "this value flows to here" is easy to compute. SSA gives this for free; non-SSA requires dataflow analysis.
- **Implementation cost.** Aether v2 is a teaching-language compiler; the IR should be readable and explainable.
- **Codegen simplicity.** The IR is lowered to bytecode by `codegen.ts`. The simpler the IR, the simpler the codegen.
- **v1 personality.** Aether v1 didn't have an IR; the tree-walker walked the AST directly. The v2 IR should be a clean step up, not a paradigm shift.

## Options considered

### Option 1: Full SSA with phi nodes

The standard form. Each variable is assigned once; phi nodes at join points.

Pros:
- Textbook-grade optimizer substrate. Constant folding, CSE, DCE, LICM, etc. all "just work".
- Easy dataflow analyses (each value's reaching definitions are explicit).
- Future-friendly: native backends (LLVM, Cranelift) take SSA directly.

Cons:
- Implementation cost: dominance analysis, phi insertion, SSA deconstruction.
- The IR is harder to read for a newcomer (phi nodes are an acquired taste).
- The codegen needs an SSA deconstruction pass.

### Option 2: SSA-without-phi (register-numbered)

Each register is assigned exactly once. There are no phi nodes. At control-flow joins, the IR uses `Br` (a conditional branch) directly; the "join" is just the next block.

```
  L0: LoadInt r0, 1     // x1
  L1: LoadInt r1, 2     // x2
  L2: Br rcond, L10, L20
  L10: ...
  L20: ...
  L30: ...                // join — no phi needed
```

This is sometimes called "linear SSA" or "register-numbered IR". It's *not* technically SSA (because the same source variable maps to multiple registers, and there's no phi to merge them at joins). But it has the SSA *spirit*: each register is assigned once, so dataflow is easy to compute.

Pros:
- No phi nodes; simpler IR.
- No SSA deconstruction; the codegen just emits the registers as-is.
- Optimizer passes that don't need join-point info (constant folding, DCE, CSE, strength reduction) work fine.
- The IR is more readable for newcomers.

Cons:
- LICM and TCO need a bit more care (they want to know "is this value loop-invariant?" — without phi, the answer is "yes if all its operands are loop-invariant, recursively").
- Some advanced optimizations (e.g., value numbering across loop boundaries) need phi or an equivalent.
- The dataflow analysis for "which values reach this point" is implicit (you have to walk the IR), not explicit (as in phi).

### Option 3: A "mutable registers" IR (no SSA at all)

Each register can be assigned multiple times. Like LLVM IR *before* the SSA pass, or like a classic three-address IR.

Pros:
- Simplest IR to build.
- Maps cleanly to a register-based VM.

Cons:
- Optimizer passes have to do explicit dataflow analysis (reaching definitions, live variables) — the very thing SSA was invented to avoid.
- The 8 optimizer passes are much harder to write correctly.

## Decision

**Aether v2 uses Option 2: SSA-without-phi (register-numbered IR).**

Each register is assigned exactly once (in the IR builder). At control-flow joins, there are no phi nodes; the IR uses `Br` (conditional branch) directly, and the "join" is just the next instruction. The 8 optimizer passes operate on this IR.

## Rationale

1. **Implementation cost.** The IR builder is ~600 lines of TypeScript. A full SSA builder with phi insertion would be ~1500. The simpler form is a 2× win on implementation cost.

2. **Optimizer passes work.** Constant folding, DCE, CSE, inlining, strength reduction, branch simplification all work without phi nodes (they don't need join-point info). LICM and TCO need a bit more care, but the v2 implementations are correct (see `licm.ts` and `tco.ts`).

3. **The IR is readable.** A newcomer to the codebase can read `aether/core/ir/ir.ts` and `aether/core/opt/irbuilder.ts` in an afternoon. The phi node version requires a separate "SSA primer" doc.

4. **The codegen is simple.** No SSA deconstruction. The codegen (`codegen.ts`) walks the IR and emits bytecode; each IR instruction becomes one bytecode instruction (modulo a few special cases).

5. **The benchmark cost is acceptable.** The optimizer gives 30-40% on top of the VM's 5-10× speedup (Chapter 10's numbers). Full SSA might give another 10-20% on top of that, but the implementation cost is high. Aether is a teaching language; the 40% is the floor we need.

6. **Future backends.** The WASM backend (RFC-006) compiles the IR to WASM. WASM is a stack-based VM, but its locals are register-like. The register-numbered IR maps cleanly to WASM locals. The native backend (planned) might want full SSA (LLVM takes SSA); we can convert at that boundary if needed.

## Consequences

- **Each register is assigned once.** The IR builder enforces this. The optimizer passes preserve it (they create new registers for new values; they don't reassign existing ones).
- **No phi nodes.** The IR has `Br` (conditional branch) and `Jmp` (unconditional jump); control-flow joins are just the next instruction.
- **The 8 optimizer passes work on this IR.** Constant folding, DCE, CSE, inlining, TCO, LICM, strength reduction, branch simplification. All are correct (verified by tests) and effective (verified by benchmarks).
- **The codegen is straightforward.** Each IR instruction becomes one bytecode instruction (or a small sequence).
- **The IR is the disassembler's source.** The disassembler (`bytecode.ts:disassemble`) prints the bytecode in a form that mirrors the IR — `Add r2, r0, r1`, etc.

## What we rejected

- **Full SSA with phi nodes** — rejected because of the implementation cost and readability cost.
- **A "mutable registers" IR** — rejected because the optimizer passes would need explicit dataflow analysis.

## What's next

- The IR builder (`aether/core/opt/irbuilder.ts`) walks the AST and emits the register-numbered IR.
- The 8 optimizer passes (`aether/core/opt/*.ts`) transform the IR.
- The codegen (`aether/vm/codegen/codegen.ts`) lowers the optimized IR to bytecode.
- The VM (`aether/vm/interpreter/vm.ts`) interprets the bytecode.
- The future native backend (RFC pending) may use a "lower to full SSA" pass before handing off to LLVM or Cranelift.
