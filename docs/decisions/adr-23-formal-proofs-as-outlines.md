# ADR-23 — Formal proofs are outlines, not mechanized

> Status: Accepted
> Date: 2026-11-12
> Decision-maker: Aether core team
> Related: [Chapter 18 formal semantics](../book/ch18-formal-semantics.md), [Formal corpus](../formal/), [RFC-013 mechanized proofs](../rfcs/rfc-013-mechanized-proofs.md), [ADR-23 this document]

## Context

Aether v3 ships a formal semantics corpus (in `docs/formal/`, ~37.6K words) covering operational semantics, type safety, the bytecode verifier, and 10 proof outlines. The corpus is *prose* — the lemmas are stated, the cases are listed, the proofs are sketched — but the proofs are not *machine-checked*. A mistake in the prose (an omitted case, an induction that doesn't quite go through) wouldn't be caught until a reader or a future mechanization effort finds it.

This is a deliberate choice. The v3 milestone was a coherent research language with a formal foundation, not a mechanized proof. Mechanization (in Lean4 or Coq) is a v3.3 milestone (RFC-013). The v3 corpus is the *outline* for the mechanization — the lemmas, the cases, the invariants, the induction strategies — written in a form that a mechanization engineer (or a careful reader) can follow.

Three options were on the table:

1. **Outline-only (the v3 choice).** The 10 proof outlines are prose: the lemma is stated in mathematical notation, the cases are listed, the induction is sketched. The proof is "this case is by induction on the typing derivation; the other cases are similar." Pros: fast to write (~6 months); readable by a PL researcher; the outline is the design of the eventual mechanization. Cons: not machine-checked; bugs possible.
2. **Mechanize in Lean4/Coq from the start.** Write the 10 proofs in Lean4 (or Coq) as part of the v3 milestone. Pros: machine-checked; bugs are caught; the formal model is precise. Cons: 12-18 months of work (each proof is 1-3 months of Lean4/Coq work); the model has to be re-done if the language changes; the team doesn't have a Lean4/Coq expert on staff.
3. **Mix: outline the easy proofs, mechanize the hard ones.** Outline the type-preservation and progress proofs (which are standard, well-understood); mechanize the borrow-safety and async-safety proofs (which are novel, harder). Pros: limited mechanization effort (3-6 months); the novel proofs are checked. Cons: the model is split (two proofs in prose, two in Lean4), which makes the corpus harder to read; the "easy" proofs might have subtle bugs that the mechanization would have caught.

The constraints on the decision were:

- **Time.** The v3 milestone was 6 months of work. The formal corpus was one piece; the language, the runtimes, the packages, the apps were others. Full mechanization in 6 months was infeasible.
- **Expertise.** The Aether team is PL researchers with experience in type systems and operational semantics, but not in Lean4/Coq. Mechanization would have required either hiring (a 6-month recruitment cycle) or training (a 3-month ramp-up). Neither fit the v3 timeline.
- **Volatility.** The v3 language was in flux during the milestone. The trait system, the borrow checker, the async runtime all changed shape during the implementation. Mechanizing a moving target is a recipe for re-work.
- **Audience.** The v3 formal corpus is read by PL researchers (who can read prose proofs) and by potential mechanization engineers (who need the outline before they can mechanize). Both audiences are served by the outline-only approach.

## Decision

**The v3 formal proofs are outlines, not mechanized.** The corpus (in `docs/formal/`) consists of:

- **Operational semantics** (`operational-semantics.md`, ~22K words): the formal model of Aether's syntax, typing rules, and evaluation rules. This is the foundation; the proofs build on it.
- **Type safety** (`type-safety.md`, ~16K words): the type-preservation and progress theorems, with the proof outlines.
- **Bytecode verifier** (`bytecode-verifier.md`, ~14K words): the verifier's specification, with the soundness proof outline.
- **10 proof outlines** (`proofs/01-type-preservation.md` through `proofs/10-jit-correctness.md`, ~3K words each): the lemmas, the cases, the induction strategies.

The 10 proof outlines:

1. **Type preservation** — evaluation preserves types.
2. **Progress** — well-typed terms either are values or take a step.
3. **Borrow safety** — the borrow rules prevent double-borrow and use-after-move.
4. **Trait coherence** — the orphan rule ensures trait resolution is a function.
5. **Async safety** — coroutine frames don't leak or race.
6. **GC safety** — the GC doesn't collect live values.
7. **Termination of pattern compilation** — the pattern-matching compiler terminates.
8. **IR equivalence** — the IR builder preserves semantics (the optimized IR has the same behavior as the unoptimized IR).
9. **Native codegen correctness** — the x86 backend produces code with the same behavior as the bytecode VM.
10. **JIT correctness** — the JIT-compiled code has the same behavior as the structured interpreter.

Each outline is structured: the lemma is stated (in mathematical notation), the proof strategy is sketched (induction on X, case analysis on Y, the invariant is Z), the cases are listed (case 1: ..., case 2: ..., etc.), and the tricky cases are discussed (the borrow-safety proof's case for nested borrows is the hard one; the JIT-correctness proof's case for deopt is the hard one).

The choice is *outline-only*, not "no formal work." The outlines are real proofs — the lemmas are stated precisely, the cases are exhaustive, the invariants are defined. They're just not machine-checked.

## Alternatives considered

### Mechanize in Lean4/Coq from the start

Write the 10 proofs in Lean4 (or Coq) as part of v3. Pros: machine-checked; bugs are caught. Cons:

- **Time.** 12-18 months of work, vs 6 months for outlines. The v3 milestone would have slipped by a year.
- **Expertise.** The Aether team doesn't have a Lean4/Coq expert on staff. Hiring or training would have added 3-6 months to the timeline.
- **Volatility.** The v3 language changed shape during the milestone. Mechanizing a moving target would have meant re-doing the proofs every time the language changed. The outline-only approach absorbs changes more easily (an outline is 2-3 pages; a mechanized proof is 100-300 lines of Lean4, with many dependencies on the model).
- **Cost/benefit.** The v3 milestone is a research language demonstrating a coherent set of features. The formal corpus is the foundation, not the deliverable. The deliverable is the language and the playground. Mechanization is the v3.3 milestone, after the language is stable.

This option is rejected for v3. It's the v3.3 plan (RFC-013).

### Mix: outline the easy proofs, mechanize the hard ones

Outline the type-preservation and progress proofs (standard); mechanize the borrow-safety and async-safety proofs (novel). Pros: limited mechanization effort. Cons:

- **Split model.** Two proofs in prose, two in Lean4. The model is split: the prose proofs use one set of definitions, the Lean4 proofs use another. The reader has to translate between them.
- **Subtle bugs in the "easy" proofs.** The type-preservation and progress proofs are standard, but they're not trivial. A mechanization would have caught subtle bugs (e.g., a missing case in the type-preservation proof for the new `match` form). The outline-only approach relies on careful reviewing.
- **Coordination cost.** The prose proofs and the Lean4 proofs have to be kept in sync. If the language changes, both have to be updated. This is a maintenance burden.

This option is rejected for v3. The v3.3 plan is to mechanize *all 10 proofs* in Lean4, in a single model, after the language is stable.

### No formal work

Skip the formal corpus entirely; just implement the language. Pros: maximum time for the language. Cons:

- **No foundation.** The borrow checker, the trait system, the async runtime are all designed against formal models. Without the models, the designs are ad-hoc and the bugs are hard to find.
- **No publishable result.** A research language without a formal corpus is hard to publish. The PL community expects a formal model.
- **No mechanization seed.** The v3.3 mechanization needs the outline as a seed. Without the outline, the mechanization starts from scratch.

This option is rejected for v3.

## Consequences

### Positive

- **Fast.** The formal corpus was written in ~6 months, as part of the v3 milestone. The 10 proof outlines are ~3K words each; the operational semantics and type safety are ~22K and ~16K words; the bytecode verifier is ~14K words. The total is ~37.6K words, written in 6 months — a sustainable pace.
- **Readable.** The corpus is read by PL researchers (who can read prose proofs) and by potential mechanization engineers (who need the outline). Both audiences are served.
- **Adaptable.** The v3 language changed shape during the milestone; the outlines were updated to match. A mechanization would have been much harder to update.
- **Seed for mechanization.** The v3.3 plan (RFC-013) is to mechanize the 10 proofs in Lean4, using the outlines as the design. The mechanization engineer can follow the outline (the lemma, the cases, the induction strategy), translating the prose to Lean4 line by line.
- **Self-contained.** The corpus is a coherent document. A reader can read the operational semantics, the type safety, the bytecode verifier, and the 10 proof outlines end-to-end, without having to learn Lean4/Coq first.

### Negative

- **Not machine-checked.** The proofs are prose; a subtle bug (an omitted case, an induction that doesn't quite go through) wouldn't be caught until a reader or a mechanization finds it.
- **Reviewer burden.** The proofs are reviewed by humans. A careful reviewer can find most bugs, but not all. The mechanization would have found them all.
- **Trust.** A reader has to trust the reviewer. A mechanization is trust-free (the proof assistant checks the proof).
- **Maintenance.** As the language evolves (v3.1, v3.2), the outlines have to be updated. The updates are easy (an outline is 2-3 pages) but require a PL researcher's attention. A mechanization would have caught update bugs.

### Mitigations

- For the "not machine-checked" issue: the v3.3 plan (RFC-013) is to mechanize the 10 proofs in Lean4. The outlines are the seed; the mechanization is the verification.
- For the reviewer burden: the corpus was reviewed by the Aether core team (3 PL researchers) and by an external reviewer (a PL professor). The reviews found ~20 bugs, all fixed before the v3 milestone.
- For the trust issue: the corpus is published (open-access); the community can review it. The mechanization will be published (open-source, on GitHub); the community can check it.
- For the maintenance issue: the v3.1, v3.2, v3.3 changes are planned (RFC-009 to RFC-013). The outlines will be updated as the language evolves; the mechanization will be updated after the language stabilizes.

## Reversibility

This decision is **reversible in v3.3**. The outlines are the design of the mechanization; the mechanization is the verification. The v3.3 milestone is to mechanize the 10 proofs in Lean4, using the outlines as the seed.

The decision is *not* reversible in the sense of "remove the outlines after mechanization." The outlines are valuable as human-readable documentation, even after mechanization. The mechanization is the machine-checked version; the outline is the human-readable version. Both will exist.

## Cross-references

- [Chapter 18 formal semantics](../book/ch18-formal-semantics.md) — the chapter walkthrough, with the key inference rules and commentary.
- [Formal corpus](../formal/) — the actual formal documents (operational semantics, type safety, bytecode verifier, 10 proof outlines).
- [RFC-013 mechanized proofs](../rfcs/rfc-013-mechanized-proofs.md) — the v3.3 plan to mechanize the 10 proofs in Lean4.
- [ADR-18 trait coherence no orphans](adr-18-trait-coherence-no-orphans.md) — the trait-coherence decision, which the formal proof (proof 04) depends on.
- [ADR-19 borrow checker with NLL](adr-19-borrow-checker-with-nll.md) — the borrow-checker decision, which the formal proof (proof 03) depends on.
- [ADR-20 async via coroutine frames](adr-20-async-via-coroutine-frames.md) — the async decision, which the formal proof (proof 05) depends on.
