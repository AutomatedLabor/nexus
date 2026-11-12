# RFC-013 — Mechanized proofs in Lean4

> Status: Draft
> Stage: 0 (Proposal)
> Discussion: open
> Related: [Chapter 18 formal semantics](../book/ch18-formal-semantics.md), [Formal corpus](../formal/), [ADR-23 formal proofs as outlines](../decisions/adr-23-formal-proofs-as-outlines.md), [RFC-002 bytecode VM](rfc-002-bytecode-vm.md), [RFC-004 borrow checker](rfc-004-borrow-checker.md)

## Summary

Aether v3.3 mechanizes the v3 formal proofs in Lean4, the modern proof assistant. The 10 proof outlines (in `docs/formal/proofs/01-type-preservation.md` through `10-jit-correctness.md`) are translated, one by one, into Lean4 theorems, with full machine-checked proofs. The goal is *not* to mechanize the whole language — that's a multi-year project. The goal is to mechanize the three core theorems: type preservation (proof 01), progress (proof 02), and borrow safety (proof 03). The remaining 7 proofs (trait coherence, async safety, GC safety, termination of pattern compilation, IR equivalence, native codegen correctness, JIT correctness) are mechanized after the core three, as the language stabilizes in v3.1/v3.2.

The mechanization is the v3.3 milestone: the moment when the formal semantics stop being prose and become machine-checked. The prose outlines (ADR-23) are the design; the Lean4 mechanization is the verification. Both will exist after v3.3 — the prose for human readers, the Lean4 for machine checking.

This RFC specifies the Lean4 model, the choice of Lean4 over Coq/Agda/Isabelle, the order of mechanization, the trust boundary (what's mechanized, what's not), and the relationship to the existing v3 proofs.

## Motivation

The v3 formal corpus (in `docs/formal/`, ~37.6K words) is *prose*. The 10 proof outlines are sketches — the lemmas are stated, the cases are listed, but the proofs are "this case is by induction on the typing derivation; the other cases are similar." This is honest (ADR-23): prose proofs are how most PL papers are written, but they're not *machine-checked*. A mistake in the prose (an omitted case, an induction that doesn't quite go through) wouldn't be caught until a reader or a future mechanization finds it.

The motivation for mechanization:

1. **Machine-checked.** A Lean4 proof is machine-checked: the proof assistant verifies every step, so a mistake is impossible (modulo bugs in Lean4 itself, which is a much smaller surface). The prose outlines depend on careful reviewing; the Lean4 proofs depend on the proof assistant.
2. **Publishable.** A PL paper with mechanized proofs is more publishable (the PL community increasingly expects mechanization). The v3 formal corpus is publishable as a "prose + outline" paper; the v3.3 corpus is publishable as a "prose + mechanized" paper.
3. **Trust.** A reader has to trust the reviewer of a prose proof. A reader of a Lean4 proof has to trust Lean4 (and the model's soundness, which Lean4 verifies). The trust boundary is smaller and more auditable.
4. **Maintainability.** As the language evolves (v3.1, v3.2), the prose outlines have to be updated. The updates are easy (an outline is 2-3 pages) but require a PL researcher's attention. The Lean4 proofs also have to be updated, but the proof assistant catches update bugs (a missing case becomes a Lean4 error, not a silent bug).
5. **The borrow-safety proof is novel.** The borrow-safety proof (proof 03) is the hardest of the 10 — the borrow rules are non-syntactic (they involve a borrow graph), and the proof needs an inductive invariant that the borrow graph is well-formed. The prose outline is a sketch; the Lean4 mechanization forces the invariant to be precise, which is the real work.

The motivation is *not* "mechanize everything" — the v3.3 goal is the three core proofs, not all 10. The remaining 7 are v3.3+ stretch goals.

## Detailed design

### The Lean4 model

The Lean4 model is a deep embedding of Aether's syntax, typing, and evaluation. The model has:

- **`AetherType`** — an inductive type for Aether's types: `int`, `float`, `bool`, `string`, `unit`, `arrow` (function types), `struct`, `enum`, `ref` (shared borrows), `mut_ref` (mutable borrows), `dyn` (trait objects), etc.
- **`AetherExpr`** — an inductive type for Aether's expressions: literals, variables, let-bindings, binary ops, function calls, match, if-else, struct construction, enum construction, borrows, dereferences, etc.
- **`AetherValue`** — an inductive type for Aether's runtime values: integers, floats, booleans, strings, closures, struct instances, enum instances, references, etc.
- **`AetherContext`** — a typing context (a list of `(name, AetherType)` pairs).
- **`HasType : AetherContext → AetherExpr → AetherType → Prop`** — the typing relation, inductively defined by the typing rules (one rule per syntactic form).
- **`Step : AetherExpr → AetherExpr → Prop`** — the small-step evaluation relation, inductively defined by the evaluation rules.
- **`IsValue : AetherExpr → Prop`** — the value predicate.

The three core theorems:

```lean
-- Type preservation: if Γ ⊢ e : τ and e steps to e', then Γ ⊢ e' : τ.
theorem type_preservation :
  ∀ Γ e τ e',
    HasType Γ e τ →
    Step e e' →
    HasType Γ e' τ
  := by
    intros Γ e τ e' Ht Hs
    induction Ht
    -- ~50 cases, one per typing rule
    sorry  -- the actual proof

-- Progress: if Γ ⊢ e : τ, then either e is a value or e steps to some e'.
theorem progress :
  ∀ Γ e τ,
    HasType Γ e τ →
    (IsValue e ∨ ∃ e', Step e e')
  := by
    intros Γ e τ Ht
    induction Ht
    -- ~50 cases
    sorry

-- Borrow safety: if a well-typed program evaluates, the borrow rules
-- (no double-borrow, no use-after-move) are preserved.
theorem borrow_safety :
  ∀ Γ e τ,
    HasType Γ e τ →
    BorrowWellFormed e →
    Step e e' →
    BorrowWellFormed e'
  := by
    intros Γ e τ Ht Hbw Hs
    sorry
```

The `sorry` is a placeholder. The v3.3 milestone is to replace each `sorry` with a real Lean4 proof. The borrow-safety proof (proof 03) is the hardest — the borrow graph is non-syntactic, and the inductive invariant is the real work.

### The choice of Lean4

Lean4 is the choice over Coq, Agda, and Isabelle/HOL. The reasons:

1. **Modern tooling.** Lean4 has a modern IDE integration (the Lean4 VS Code extension), a modern package manager (Lake), and a modern build system. Coq's tooling is older; Agda's is sparser; Isabelle's is mature but heavy.
2. **Mathlib.** Lean4's Mathlib has the largest library of mechanized mathematics (and computer science constructs); the typing rules, the small-step semantics, and the invariants are easier to express with Mathlib's help. Coq's library is comparable but harder to navigate; Agda's is smaller; Isabelle's is comparable.
3. **Performance.** Lean4's elaborator is fast (the proof-checking time is seconds-to-minutes, not hours); Coq is comparable; Agda is slower; Isabelle is comparable. For the v3.3 milestone (10 proofs), the proof-checking time matters.
4. **Community.** Lean4 has an active community (the Lean4 Zulip is very active, with PL researchers and math researchers). Coq has an active community; Agda's is smaller; Isabelle's is mature but smaller.
5. **The Aether team's familiarity.** The Aether core team has Lean4 experience (some team members have used Lean4 for previous PL papers). Coq, Agda, and Isabelle would require more ramp-up.

The choice is *not* a judgment of Lean4 vs Coq vs Agda vs Isabelle in general — all four are capable. The choice is a judgment of Lean4 vs the others for the Aether v3.3 milestone, given the team, the tooling, and the timeline.

### The order of mechanization

The order is from easiest to hardest, with the highest-value proofs first:

1. **Type preservation (proof 01)** — the easiest. The proof is by induction on the typing derivation; the cases are mechanical. Estimated 1-2 months.
2. **Progress (proof 02)** — similar to type preservation. Estimated 1-2 months.
3. **Borrow safety (proof 03)** — the hardest of the three core. The borrow graph is non-syntactic; the inductive invariant is the real work. Estimated 3-4 months.
4. **Trait coherence (proof 04)** — depends on the orphan rule (ADR-18); the proof is by induction on the trait resolution. Estimated 2 months.
5. **Async safety (proof 05)** — depends on the coroutine-frame design (ADR-20); the proof is by induction on the executor's scheduling. Estimated 3 months.
6. **GC safety (proof 06)** — depends on the v3 GC; the proof is by induction on the GC's trace. Estimated 2 months.
7. **Termination of pattern compilation (proof 07)** — depends on the pattern-matching compiler; the proof is by a measure on the pattern complexity. Estimated 1 month.
8. **IR equivalence (proof 08)** — depends on the 8 optimizer passes; the proof is by induction on the pass sequence. Estimated 3 months.
9. **Native codegen correctness (proof 09)** — depends on the x86 backend's instruction selection; the proof is by simulation between the IR and the x86. Estimated 4-6 months.
10. **JIT correctness (proof 10)** — depends on the JIT's deopt table; the proof is by simulation between the JIT-compiled code and the structured interpreter. Estimated 4-6 months.

The total: 24-32 months (2-3 years). The v3.3 milestone is the first three proofs (6-8 months); the remaining 7 are v3.3+ stretch goals.

### The trust boundary

The mechanization is sound *modulo*:

- **The Lean4 prover.** Lean4 is itself a complex piece of software (~50K LOC); a bug in Lean4 could let an incorrect proof pass. This is a small surface (Lean4 is heavily tested), but it's a real surface. A future "Lean4 is verified" milestone (a verified Lean4 kernel) would close this gap; for v3.3, we trust Lean4.
- **The model.** The Lean4 model is a deep embedding of Aether; if the model doesn't match the actual Aether language (e.g., the model has a typing rule that the actual language doesn't), the proofs are about the model, not the language. The model is the spec; the implementation has to match the model. The conformance test suite (the 2366 tests) checks the implementation against the spec; if the implementation diverges from the model, the conformance test catches it.
- **The axioms.** The Lean4 model uses Mathlib's axioms (e.g., functional extensionality, classical logic). These are standard axioms, trusted by the math community, but they're axioms nonetheless.

The trust boundary is: trust Lean4, trust the model, trust the axioms. The proofs themselves are machine-checked; the trust is in the surrounding system.

### The relationship to the existing v3 proofs

The v3 proof outlines (the prose) and the v3.3 Lean4 proofs (the mechanization) coexist. The prose is the design; the Lean4 is the verification. A reader of the prose can follow the proof (the lemmas, the cases, the induction strategy); a reader of the Lean4 can verify the proof (every step is machine-checked).

The two are kept in sync: every change to the prose outline (because the language evolves, or because a bug is found) is reflected in the Lean4 proof, and vice versa. The sync is manual (a Lean4 proof change is a PR to the Lean4 model; the prose outline is updated to match). The sync cost is real but manageable (a few hours per change).

The 10 proof outlines, after mechanization:

- **Mechanized in v3.3**: 01 (type preservation), 02 (progress), 03 (borrow safety).
- **Mechanized in v3.3+**: 04 (trait coherence), 05 (async safety), 06 (GC safety), 07 (termination of pattern compilation), 08 (IR equivalence), 09 (native codegen correctness), 10 (JIT correctness).

The prose outlines for all 10 are kept; the Lean4 proofs are added as they're mechanized.

## Alternatives considered

### Mechanize in Coq

Coq is the older, more established proof assistant. Pros: large library; many PL papers mechanized in Coq; mature tooling. Cons: the tooling is older (Coq's IDE is less polished than Lean4's); the community is smaller (Coq's Zulip is less active than Lean4's); the Aether team has less Coq experience.

This option is rejected for v3.3. A future "Coq port" (v4+) is possible, if the Coq community contributes it.

### Mechanize in Agda

Agda is a dependently-typed language with proof assistant capabilities. Pros: the most elegant model (dependent types are the natural setting for PL proofs); the smallest trusted core. Cons: the library is smaller than Lean4's or Coq's; the tooling is sparser; the community is smaller; the Aether team has less Agda experience.

This option is rejected for v3.3. Agda is a research favorite, but the practical choice is Lean4.

### Mechanize in Isabelle/HOL

Isabelle/HOL is a mature proof assistant with strong automation. Pros: the strongest automation (Sledgehammer); the most mature tooling; the largest library of mechanized PL papers. Cons: the model is in higher-order logic (not dependent types), which is less natural for PL proofs; the Aether team has less Isabelle experience.

This option is rejected for v3.3. Isabelle is a strong choice for some PL papers, but the dependent-types setting (Lean4) is more natural for Aether's proofs.

### Don't mechanize (keep the prose outlines)

The v3 formal corpus is prose; keep it that way. Pros: no mechanization effort. Cons:

- **Not machine-checked.** A subtle bug in the prose wouldn't be caught.
- **Less publishable.** A PL paper with mechanized proofs is more publishable.
- **No trust.** A reader has to trust the reviewer.
- **Harder to maintain.** The prose outlines have to be updated as the language evolves; the updates are easy but require a PL researcher's attention.

This option is rejected for v3.3. The v3 prose outlines are the foundation (ADR-23); the v3.3 mechanization is the verification.

## Drawbacks

- **Time.** The 3 core proofs are 6-8 months of work; the remaining 7 are 18-24 months. The total is 2-3 years. The v3.3 milestone is the first 3 proofs; the remaining 7 are v3.3+ stretch goals.
- **Expertise.** The Aether team has Lean4 experience, but not deep Lean4 expertise. The mechanization requires either hiring a Lean4 expert (a 6-month recruitment cycle) or training (a 3-month ramp-up). Both fit the v3.3 timeline but require investment.
- **Model drift.** The Lean4 model has to match the actual Aether language. As the language evolves (v3.1, v3.2), the model has to be updated. The conformance test suite (the 2366 tests) is the safety net, but the model drift is a real maintenance burden.
- **Trust boundary.** The mechanization is sound *modulo* Lean4, the model, and the axioms. The trust boundary is smaller than the prose-only approach (where the trust is in the reviewer), but it's not zero. A future "verified Lean4 kernel" would close the gap; for v3.3, we trust Lean4.
- **Volatility.** The v3.1 and v3.2 milestones (ARM64, RISC-V, JIT, package registry) will change the language. The mechanization has to keep up. The v3.3 milestone is timed for after v3.1 and v3.2, when the language is more stable.

## Open questions

1. **The model's granularity.** The model has to be detailed enough to express the proofs but not so detailed that the proofs are intractable. The v3.3 plan is to start with a coarse model (typing + small-step semantics, no borrow graph) and refine it as needed.
2. **The borrow graph.** The borrow-safety proof needs a borrow graph (a non-syntactic invariant). The design of the borrow graph in Lean4 is open — it could be a relation on expressions, or a separate data structure. The v3.3 plan is to start with a relation and refine.
3. **The JIT-correctness proof's deopt table.** The JIT-correctness proof (proof 10) needs a model of the deopt table. The deopt table is a side-table that maps JIT instructions to structured-interpreter IPs; modeling it in Lean4 is open. The v3.3+ plan is to defer this until the JIT (RFC-011) is implemented.
4. **The Mathlib dependency.** The model uses Mathlib's axioms (functional extensionality, classical logic). Whether to depend on Mathlib (and its axioms) or to use a smaller core is open. The v3.3 plan is to use Mathlib (the convenience outweighs the axiom cost); a future "minimal axioms" version (v4+) is possible.

## Cross-references

- [Chapter 18 formal semantics](../book/ch18-formal-semantics.md) — the chapter walkthrough, with the key inference rules.
- [Formal corpus](../formal/) — the v3 prose outlines (the design).
- [ADR-23 formal proofs as outlines](../decisions/adr-23-formal-proofs-as-outlines.md) — the v3 decision (prose outlines); the v3.3 mechanization is the verification.
- [RFC-002 bytecode VM](rfc-002-bytecode-vm.md) — the v2 RFC, which sketched the formal model.
- [RFC-004 borrow checker](rfc-004-borrow-checker.md) — the borrow-checker RFC, which the borrow-safety proof (proof 03) is for.
- [RFC-011 JIT compiler](rfc-011-jit-compiler.md) — the JIT RFC, which the JIT-correctness proof (proof 10) is for.
- [Chapter 20 the road ahead](../book/ch20-the-road-ahead.md) §20.7 — the mechanization in the roadmap.

## Prior art

- **The CompCert proof (Coq)** — the mechanized C compiler; the reference for compiler-correctness proofs.
- **The Rust borrowing proof (Iris)** — the Rust borrow-checker proof (in Iris, a Coq library); the reference for borrow-safety proofs.
- **The Lean4 Mathlib** — the mechanized mathematics library; the reference for Lean4 models.
- **The IronFleet paper (Lean)** — a mechanized distributed system; the reference for Lean4 models of real systems.
- **The v3 prose outlines** — the design that the v3.3 mechanization is verifying.

## Status

This RFC is at stage 0 (Proposal). The next step is to prototype the Lean4 model (the inductive types for AetherType, AetherExpr, AetherValue, the typing relation, the small-step semantics) and validate it on a small Aether subset (e.g., the lambda calculus + integers + borrows). If the prototype can prove type preservation for the lambda calculus in ~2 weeks, the RFC moves to stage 1 (Implementation sketch). The v3.3 milestone is the mechanization of the 3 core proofs; the v3.3+ stretch goal is the remaining 7.
