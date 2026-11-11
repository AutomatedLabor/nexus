# ADR-15 — v2 keeps the tree-walker

> Status: Accepted
> Date: 2024-04-15
> Decision-maker: Aether core team
> Supersedes: none
> Superseded by: (none yet)
> Related: [ADR-01](adr-01-tree-walking-interpreter-for-v1.md), [ADR-11](adr-11-stack-based-vm.md), [ADR-13](adr-13-async-via-promises.md), [RFC-002](../rfcs/rfc-002-bytecode-vm.md)

## Context

Aether v2 introduces a bytecode VM (ADR-11) that's 5-10× faster than v1's tree-walker (ADR-01). The VM is the recommended backend for performance-sensitive code; `aether run:vm` is the CLI's fast path.

The architectural question: **does v2 keep the tree-walker alongside the VM, or retire it?**

Most language implementations with both an interpreter and a VM retire the interpreter eventually. For example:

- Python kept the tree-walking CPython interpreter and added the Faster CPython optimizations in 3.11+; PyPy is a separate project with a JIT.
- Lua kept the tree-walker for 5.0 and switched to a register-based VM in 5.1; the tree-walker is gone.
- Ruby kept MRI (AST interpreter) and added YJIT (a JIT); both are still maintained.
- Rust retired the old "AST evaluator" debug mode when MIR + codegen matured; the project is simpler for it.

The decision space:

### Option A: Retire the tree-walker in v2

The tree-walker (`aether/core/eval/eval.ts`) is removed in v2. The VM is the only backend. The CLI's `aether run` becomes an alias for `aether run:vm`.

### Option B: Keep the tree-walker alongside the VM

Both backends stay. The CLI exposes `aether run` (tree-walker) and `aether run:vm` (VM). The playground has a toggle. The tree-walker is the default for REPL, debug, and LSP; the VM is the default for "fast" execution.

## Constraints on the decision

- **Implementation cost.** Maintaining two backends is more work than one. The tree-walker has to be updated for every new language feature (the VM has to be updated too, but the tree-walker is simpler — it walks the AST directly).
- **Test surface.** Both backends share the test corpus. If a test passes on the VM but fails on the tree-walker (or vice versa), it's a real bug.
- **REPL / debug / LSP latency.** The tree-walker has lower startup latency (no compile step); the VM has higher throughput. For interactive use (REPL, debug, LSP), the tree-walker is often better.
- **Future backends.** The WASM backend (RFC-006) and the native backend (planned) will add more backends. Keeping the tree-walker sets the precedent of "multiple backends coexist".
- **"v1 personality."** Aether v1 was the tree-walker; v2 keeps it. The book (this one) talks about "the tree-walker" and "the VM" as coexisting implementations.

## Options considered in detail

### Option A: Retire the tree-walker

**Pros:**

- One backend to maintain; less code, fewer bugs.
- The CLI is simpler: one `run` command.
- The "two backends that should agree" problem goes away (no parity bugs).
- The test corpus runs once (not twice).

**Cons:**

- REPL / debug / LSP latency is higher (the VM has to compile before it can run).
- The tree-walker is the *simplest* backend to teach — walking an AST is a 30-line interpreter; a stack-based VM with an IR and 8 optimizer passes is a 6k-line project.
- The tree-walker is the "reference implementation" — when the VM does something weird, the tree-walker shows what the AST semantics are.
- The async runtime's `await` is simpler in the tree-walker (it can call JS `await` directly; the VM has to do something more elaborate — see ADR-13).

### Option B: Keep the tree-walker alongside the VM (chosen)

**Pros:**

- REPL / debug / LSP get low-latency execution.
- The tree-walker is the reference; the VM is the optimization.
- New language features can be prototyped in the tree-walker first, then lowered to the VM.
- The "v1 personality" is preserved; users who liked v1 keep it.
- The book can show both backends side-by-side (Chapter 9 does this).

**Cons:**

- Two backends to maintain.
- Parity bugs (13/15 examples pass on both; the two exceptions are documented in Chapter 9).
- The test corpus runs twice (once per backend).

## Decision

**Aether v2 keeps the tree-walker alongside the VM (Option B).**

The CLI exposes:
- `aether run <file>` — tree-walker (the default, for low-latency startup).
- `aether run:vm <file>` — bytecode VM (for throughput).
- `aether repl` — tree-walker (interactive).
- `aether check <file>` — type-check only (no execution).
- `aether build <file> -o <out>` — compile to bytecode (no execution).

The playground has a "VM" checkbox in the Run panel; the default is the tree-walker for low-latency feedback.

The tree-walker is the default for:
- The CLI's `run` command (no `:vm`).
- The CLI's `repl` command.
- The planned LSP's "evaluate this expression for hover" feature (RFC-007).
- The playground's default Run.

The VM is the default for:
- The CLI's `run:vm` command.
- The planned `aether bench` command.
- The playground's Run with the "VM" checkbox checked.
- The future WASM backend's "compile and run in the browser" path (RFC-006).

## Rationale

1. **REPL / debug / LSP latency.** The tree-walker has ~5ms startup; the VM has ~50ms startup (the IR build, the optimizer passes, the codegen, and the bytecode assembly all run before the first instruction). For interactive use (REPL, LSP hover, debugger step-over), the tree-walker is faster to *respond*.

2. **The tree-walker is the reference.** When the VM does something unexpected (e.g., a benchmark runs faster than expected, or a program panics differently than the tree-walker), the tree-walker is the source of truth for "what should this program do?" The VM matches the tree-walker; the tree-walker matches the spec.

3. **The tree-walker is simpler to teach.** A 30-line AST-walking interpreter is in every "implement a language" tutorial. The VM with 80+ opcodes and 8 optimizer passes is a 6k-line project. For educators (a key Aether audience — see Chapter 1), the tree-walker is the on-ramp; the VM is the destination.

4. **New features prototype in the tree-walker first.** When we add (say) `async fn` (RFC-001), we'll implement it in the tree-walker first (where it's a few lines — call JS `await`), then in the VM (where it's a state-machine transformation). The tree-walker is the "easy mode" for language design.

5. **The async runtime is simpler in the tree-walker.** The tree-walker can `await` JS Promises directly (it's running on the host's JS engine). The VM has to implement `await` as a bytecode op + a Promise-poll loop. For v2's async (which is Promise-based — see ADR-13), the tree-walker is the simpler path.

6. **The cost of maintaining two backends is real but bounded.** Both backends share the lexer, parser, type checker, and AST. The only divergence is the execution backend. The "parity bug" risk is mitigated by the test corpus running both backends in CI.

## Consequences

- **Two backends in the codebase.** `aether/core/eval/eval.ts` (tree-walker, ~2k lines) and `aether/vm/interpreter/vm.ts` (VM, ~3k lines) plus the IR/codegen/opt (~3k lines).
- **Two CLI commands.** `aether run` and `aether run:vm`. Both have the same surface; the difference is the backend.
- **Parity is a soft requirement.** 13/15 canonical examples produce identical output. The two exceptions are documented (Chapter 9 § 9.7) and have known root causes.
- **The test corpus runs twice in CI.** Once with the tree-walker, once with the VM. Both have to pass for a PR to merge.
- **The planned LSP** (RFC-007) will use the tree-walker for low-latency features (hover, completion) and the VM for full-program execution.
- **The future WASM backend** (RFC-006) will be a *third* backend, sharing the IR with the VM (the IR is lowered to WASM directly, skipping the bytecode step).

## What we rejected

- **Retiring the tree-walker (Option A)** — rejected because of REPL/LSP latency, the teaching value of a simple interpreter, and the simplicity of the async runtime in the tree-walker.

## What's next

- The tree-walker is at `aether/core/eval/eval.ts`; the VM is at `aether/vm/interpreter/vm.ts`.
- The CLI exposes both (`run` and `run:vm`); the playground has a toggle.
- The planned LSP (RFC-007) will use the tree-walker for low-latency features.
- The future WASM backend (RFC-006) will be a third backend, sharing the IR.
- The book (Chapter 9, Chapter 15) treats both backends as coexisting implementations.
