# ADR-19 — Borrow checker uses non-lexical lifetimes (NLL)

> Status: Accepted
> Date: 2026-11-12
> Decision-maker: Aether core team
> Related: [Chapter 12 ownership and borrowing](../book/ch12-ownership-and-borrowing.md), [RFC-004 borrow checker](../rfcs/rfc-004-borrow-checker.md), [Formal proof 03 borrow safety](../formal/proofs/03-borrow-safety.md), [ADR-06 GC over borrow checker for v1](adr-06-gc-over-borrow-checker-for-v1.md)

## Context

Aether v3 introduces a borrow checker (in `aether/core/borrow/`, ~942 LOC) — the language mechanism that enforces ownership and borrowing rules at compile time. The borrow checker is the v3 cornerstone for memory safety: without it, the v3 type system can't distinguish `&T` (shared reference) from `&mut T` (mutable reference), can't prevent double-borrow, and can't prevent use-after-move. See Chapter 12 for the full design.

The central design question for any borrow checker is the *lifetime* model — the rule that determines when a borrow is "live" and when it ends. Two options were on the table:

1. **Lexical lifetimes.** A borrow is live from its declaration to the end of the enclosing scope (`}` for blocks, end of function for function bodies, end of `let` for `let`-bindings). This is the Rust 2015 model. Pros: simple to implement (a borrow ends at the scope's `}`); simple to explain. Cons: rejects many obviously-correct programs (e.g., a borrow that's used once and never again, but lives until the scope ends).
2. **Non-lexical lifetimes (NLL).** A borrow is live from its declaration to its *last use*, not to the end of the enclosing scope. This is the Rust 2018+ model. Pros: accepts more correct programs; closer to the user's mental model ("the borrow is over when I'm done with it"). Cons: more complex to implement (the compiler has to compute last-use information); harder to explain (the rule "the borrow ends at its last use" is intuitive but the formal definition involves control-flow analysis).

The constraints on the decision were:

- **Usability.** The v2 GC was simple but rejected nothing (every program was memory-safe, by virtue of the GC). The v3 borrow checker is a step *toward* the user, not away — it has to accept the programs the user expects to be correct. Lexical lifetimes reject many such programs (a `let r = &x; print(*r); /* r never used again */` keeps `x` borrowed until the scope ends, blocking any `&mut x` after the print). NLL accepts these.
- **Implementation size.** The v3 borrow checker had to ship in a sprint. Lexical lifetimes are ~400 LOC; NLL is ~900 LOC (the borrow graph, the use-after-borrow analysis, the last-use computation). Both fit in a sprint, but NLL requires more careful work.
- **Soundness.** The borrow checker has to be sound (it can't accept a program that violates the borrow rules). NLL is sound (the last-use analysis is conservative: a borrow is ended only when the compiler can prove it's not used again). The formal proof (proof 03) goes through with either model; NLL just accepts more programs.
- **Forward compatibility.** Rust moved from lexical to NLL in 2018; the move was a major usability improvement but required a rewrite of the borrow checker. Aether could skip the lexical stage and go straight to NLL (which is what we did).

## Decision

**The v3 borrow checker uses non-lexical lifetimes (NLL).** A borrow is live from its declaration to its last use, not to the end of the enclosing scope.

The algorithm:

1. **Build the borrow graph.** For each `let r = &x;` or `let r = &mut x;`, record a borrow edge from `r` to `x`. The borrow graph is a DAG (borrows can't form cycles because each borrow is from a later point in the program).
2. **Compute last-use.** For each borrow, find the last point in the control-flow graph where `r` is used. This is a standard backwards dataflow analysis: start from the end of each block, propagate "is `r` live?" backwards, and the last-use is the first point where `r` becomes dead.
3. **Check for conflicts.** For each borrow, check that no other access to `x` (a `&x`, a `&mut x`, or a move of `x`) occurs between the borrow's declaration and its last use. If a conflict is found, report a borrow-checker error.

The error messages are precise:

```
error: cannot borrow `x` as mutable because it is also borrowed as shared
  let r = &x;          // shared borrow starts here
  print(*r);           // last use of r
  let mut y = &mut x;  // ERROR: x is still borrowed by r (until the print above)
  *y = 42;
```

Wait — that's actually accepted by NLL, because the last use of `r` is the `print(*r);` line, and the `&mut x` is after that. The borrow of `x` by `r` ends at the print. The `&mut x` is fine. The error message above would only fire if `r` were used *after* the `&mut x`:

```
error: cannot borrow `x` as mutable because it is also borrowed as shared
  let r = &x;          // shared borrow starts here
  let mut y = &mut x;  // ERROR: x is borrowed by r (until line 4)
  *y = 42;
  print(*r);           // last use of r — borrow lasts until here
```

The error message points to the start of the borrow, the conflicting borrow, and the last use — the user can see the entire conflict span. This is the Rust 2018+ error message style.

The NLL analysis is a backwards dataflow:
- Start at the end of each block.
- A variable is "live" if it's used in a successor block, or used in this block before being redefined.
- The first point (going backwards) where a variable becomes "dead" is its last use.

The borrow graph is updated: a borrow ends at the last use of the borrow variable. Two borrows conflict if their live ranges overlap and one is mutable.

## Alternatives considered

### Lexical lifetimes (Rust 2015 model)

A borrow is live from its declaration to the end of the enclosing scope. Pros: simple to implement (~400 LOC); simple to explain. Cons:

- **Rejects obviously-correct programs.** A `let r = &x; print(*r); /* r never used again */ let mut y = &mut x; *y = 42;` is rejected because `r` lives until the `}` of the enclosing scope. The user has to add `{ let r = &x; print(*r); }` to scope-limit the borrow. This is the classic NLL-motivating example.
- **Forces unnatural code shape.** Users have to think about scope boundaries to manage borrows, which is a foreign concept.
- **Doesn't match the user's mental model.** The user thinks "the borrow is over when I'm done with it," not "the borrow is over when the scope ends."

This is the model Rust used from 1.0 to 2018. The Rust community's experience was that it was a constant source of friction. Aether chose to skip this stage.

### NLL with two-phase borrows

The Rust 2018 NLL has a refinement: a `&mut x` doesn't conflict with an existing `&x` if the `&mut x` is "activated" (i.e., the first actual write through the `&mut`) only after the `&x` is dead. This is "two-phase borrows" — the borrow has a "reserved" phase and an "activated" phase. Pros: even more programs accepted (the `let r = &x; let mut y = &mut x; print(*r); *y = 42;` example is accepted, because the `&mut x` is reserved but not activated while `r` is still live, and activated only after `r`'s last use). Cons: more complex; the rule is hard to explain; the implementation is ~300 LOC of additional code.

The decision: defer to v3.1 or later. Two-phase borrows are a refinement, not a fundamental change; the v3 NLL is sound without them, and they can be added later if the use case arises (it usually does, for iterator-style code).

### Linear types without a borrow checker

Skip the borrow checker entirely; use linear types (every value is used exactly once, no borrows). Pros: simpler; no need for borrow analysis. Cons:

- **No shared borrows.** Linear types can't express `&T` (shared, multiple readers) — they only express "owned T" (one reader, by value). The stdlib's `print(*r)` and the trait `Show::show(&self)` require shared borrows.
- **Doesn't match Aether's design.** Aether's v3 trait system has `&self` and `&mut self` (Chapter 11); linear types don't fit.

This is the approach of, e.g., Linear Haskell. Aether chose Rust-style borrows.

## Consequences

### Positive

- **Accepts more correct programs.** The motivating example (`let r = &x; print(*r); let mut y = &mut x; *y = 42;`) is accepted. The user's mental model matches the compiler's behavior.
- **No "scope-tetris."** The user doesn't have to add artificial `{ }` blocks to limit borrow scopes. The code shape matches what the user writes.
- **Sound.** The last-use analysis is conservative: a borrow ends only when the compiler can prove it's not used again. The formal proof (proof 03) goes through.
- **Forward-compatible.** Two-phase borrows (a future refinement) can be added without changing the v3 model. The NLL algorithm is the foundation; two-phase is an extension.
- **Familiar.** Rust 2018+ users will recognize the model and the error messages. The cognitive cost of switching from Rust to Aether is low.

### Negative

- **More complex implementation.** The borrow checker is ~900 LOC, vs ~400 for lexical. The complexity is in the backwards dataflow analysis and the borrow graph.
- **Harder to explain.** "The borrow ends at its last use" is intuitive but the formal definition involves control-flow analysis. The error messages have to point to the start, the conflict, and the last use — three points, not one.
- **Slower compile times.** The NLL analysis is a backwards dataflow over the control-flow graph. For a 1000-line file, it's ~10ms (negligible). For a 100K-line file (which v3 doesn't have), it could be 1s — still acceptable.
- **Some programs still rejected.** The two-phase-borrows example (`let r = &x; let mut y = &mut x; print(*r); *y = 42;`) is rejected by v3 NLL because the `&mut x` is a borrow conflict with the still-live `&x`. The user has to reorder or scope-limit.

### Mitigations

- For the implementation complexity: the borrow checker is in its own module (`aether/core/borrow/`), separate from the type checker. The dataflow analysis is a standard backwards dataflow, reusing the compiler's CFG.
- For the error messages: the error message points to all three points (start, conflict, last use). The user sees the entire conflict span, not just one line.
- For the still-rejected programs: the v3.1 plan is to add two-phase borrows (RFC under discussion) for the iterator-style use case. The current workaround is to reorder the code (compute `*r` first, then take the `&mut`).

## Reversibility

This decision is **not reversible** in the sense of "switch back to lexical." The v3 borrow checker is NLL; the formal proof (proof 03) assumes NLL. Switching back to lexical would break the proof and require re-doing it. The decision is reversible in the sense of "extend NLL with two-phase borrows" — that's a v3.1 item, not a v3 reversal.

## Cross-references

- [Chapter 12 ownership and borrowing](../book/ch12-ownership-and-borrowing.md) — the chapter walkthrough.
- [RFC-004 borrow checker](../rfcs/rfc-004-borrow-checker.md) — the original RFC (which sketched lexical; the implementation moved to NLL).
- [Formal proof 03 borrow safety](../formal/proofs/03-borrow-safety.md) — the formal proof that depends on this rule.
- [ADR-06 GC over borrow checker for v1](adr-06-gc-over-borrow-checker-for-v1.md) — the v1 decision (GC instead of borrow checker), which v3 reverses.
- [RFC-013 mechanized proofs](../rfcs/rfc-013-mechanized-proofs.md) — the v3.3 plan to mechanize the borrow-safety proof in Lean4.
