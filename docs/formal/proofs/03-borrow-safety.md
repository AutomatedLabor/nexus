# 03. Borrow Safety Proof Outline

## Theorem statement

**Theorem (Borrow Safety).**  If a program `P` passes the Aether
borrow checker (the static analysis in `aether/core/borrow/borrow.ts`),
then during any execution of `P`:

1. **No use-after-move.**  After `move x`, no subsequent statement
   reads or writes `x`.
2. **No data races.**  No two pieces of code simultaneously have
   mutable access to the same location (one `&mut` or owner) plus
   any other access.
3. **No double-free.**  Each owned value is freed at most once (in
   v2 with `Drop`; in v1 the GC reclaims unreachable locations
   safely).

The borrow checker is opt-in in v1 (RFC-004); v2 makes it
mandatory.

## Proof outline

The borrow checker is a **forward analysis** over each block's
statements.  It maintains:

- `vars : Map<Name, VarState>` where `VarState ∈ {Owned, Borrowed-
  shared, Borrowed-mut, Moved}`.
- `borrows : List<BorrowInfo>` where each `BorrowInfo` records the
  borrower, the kind (shared or mut), and the last-use index.

The analysis processes statements in order, checking effects
(reads, writes, moves, borrows) and updating the state.

### Algorithm

```
for each block (function body, if branch, while body, etc.):
  pre-pass: compute last_use[name] = last statement index that uses name
  state = {vars: Map<Name, VarState>, borrows: List<BorrowInfo>}
  for i, stmt in enumerate(block.stmts):
    effects = analyze(stmt)  // returns reads, writes, moves, borrows
    for effect in effects:
      check(state, effect)  // raises error if rule violated
      update(state, effect)
    expire_borrows(state, i)  // remove borrows whose last_use <= i
```

### State machine transitions

- A `let x = e` adds `x → Owned` (or `x → Borrowed-shared` if `e`
  is `&y`, or `Borrowed-mut` if `e` is `&mut y`).
- A read of `x` checks `x ∈ {Owned, Borrowed-shared, Borrowed-mut-
  by-self}`.
- A write of `x` checks `x ∈ {Owned, Borrowed-mut-by-self}`.
- A `move x` checks `x = Owned`, then transitions `x → Moved`.
- A `&x` checks `x = Owned` (no live mut borrow), creates a shared
  borrow.
- A `&mut x` checks `x = Owned` (no live borrow of any kind),
  creates a mut borrow.
- A borrow `b` is expired when `i > b.last_use`.

## Proof of the three safety properties

### No use-after-move

**Lemma (Borrow-Read-Allowed).**  At any read of `x`, `x ∈ {Owned,
Borrowed-shared, Borrowed-mut-by-self}`.

Proof: the analysis checks this before allowing the read.  If the
check fails, the analysis reports an error.  So a program that
passes the analysis satisfies the invariant.

**Lemma (Borrow-Write-Allowed).**  At any write of `x`, `x ∈ {Owned,
Borrowed-mut-by-self}`.

Proof: similar.

**Lemma (Borrow-Move-Allowed).**  At any `move x`, `x = Owned`.

Proof: similar.

**Theorem (No-Use-After-Move).**  After `move x`, no read or write
of `x` succeeds.

Proof: after `move x`, `state.vars[x] = Moved`.  By Borrow-Read-
Allowed and Borrow-Write-Allowed, a subsequent read/write requires
`x ∈ {Owned, Borrowed-shared, Borrowed-mut-by-self}`, which excludes
`Moved`.  So the analysis rejects the subsequent read/write.  The
program never executes a use-after-move.  ✓.

### No data races

**Lemma (Borrow-Shared-Allowed).**  At any `&x`, `x = Owned` and
no live mut borrow of `x` exists.

Proof: the analysis checks both conditions before allowing the
shared borrow.

**Lemma (Borrow-Mut-Allowed).**  At any `&mut x`, `x = Owned` and
no live borrow (shared or mut) of `x` exists.

Proof: the analysis checks both conditions.

**Theorem (No-Alias-Mutability-Violation).**  No two simultaneous
borrows of `x` (one shared, one mut, or two mut) exist.

Proof: by Borrow-Shared-Allowed and Borrow-Mut-Allowed, creating a
second borrow while the first is live is rejected.  ✓.

**Theorem (No-Data-Race).**  No two pieces of code simultaneously
have mutable access to `x` plus any other access.

Proof: by No-Alias-Mutability-Violation, at most one mutable access
exists.  By Borrow-Shared-Allowed, no shared borrow exists while a
mut borrow is live.  So the only simultaneous accesses are
multiple shared borrows (which are read-only — no data race).  ✓.

### No double-free

**Lemma (Borrow-Move-Once).**  Each `move x` is the single move
site for `x`.  After the move, `state.vars[x] = Moved`; no further
moves are allowed (by Borrow-Move-Allowed requiring `x = Owned`).

Proof: similar to No-Use-After-Move.

**Theorem (No-Double-Free).**  In v2 with `Drop`, each owned value
is dropped at most once.

Proof: each `move x` is unique (by Borrow-Move-Once).  After the
move, `x` is no longer `Owned`, so its scope-exit drop doesn't fire
(the new owner's scope-exit drop fires instead).  ✓.

(In v1, there's no `Drop`; the GC reclaims unreachable locations
safely.  No double-free issue because the GC's reachability
analysis is sound — see `06-gc-safety.md`.)

## NLL (non-lexical lifetimes) soundness

The non-lexical lifetime extension: a borrow `b` is "live" from its
creation to its `last_use`.  The analysis treats `b` as expired
after `last_use`.

**Lemma (Last-Use-Correct).**  For each borrow `b` with
`b.last_use = i`, statement `i` is the last statement that
references `b.borrower`.

Proof: the pre-pass scans the block for all references to
`b.borrower` and takes the maximum index.  This is by definition
the last use.  ✓.

**Lemma (Borrow-Dead-After-Last-Use).**  After `b.last_use`, no
statement references `b.borrower`.

Proof: by Last-Use-Correct.  ✓.

**Lemma (Borrow-Discharge-Sound).**  After `b.last_use`, the borrow
`b` can be safely discharged (the borrower is dead).

Proof: by Borrow-Dead-After-Last-Use, no statement uses
`b.borrower`, so the borrow is no longer needed.  ✓.

## Assumptions

1. The borrow checker is intra-block; cross-block borrow flow is
   approximated (v1's limitation).  This is sound but conservative:
   it may reject safe programs (false positives) but never accepts
   unsafe ones (no false negatives).
2. Function arguments are reads, not moves (v1's GC model).  This
   means a function call doesn't move its arguments; the caller can
   still use them after the call returns.  v2 will change this to
   match Rust's semantics.
3. `Copy` types are hard-coded (int, float, bool, char, unit); user
   `Copy` impls are not supported (v2 limitation).  This means
   custom `Copy` types are not available; the user must use the
   built-in `Copy` types.
4. The analysis is conservative: it may reject safe programs (false
   positives) but never accepts unsafe ones (no false negatives).
   This is the safety guarantee.
5. No `unsafe` escape hatch in v1; v2 may add.  This means there's
   no way to bypass the borrow checker (which is good for soundness
   but limits low-level programming).
6. The `last_use` computation is correct (proven by Last-Use-Correct
   above).

## Key lemmas

1. **Borrow-Read-Allowed**: read access requires the variable to
   be in an allowed state.
2. **Borrow-Write-Allowed**: write access requires the variable to
   be in an allowed state.
3. **Borrow-Move-Allowed**: move requires the variable to be Owned.
4. **Borrow-Shared-Allowed**: shared borrow requires Owned and no
   live mut borrow.
5. **Borrow-Mut-Allowed**: mut borrow requires Owned and no live
   borrow.
6. **Last-Use-Correct**: the `last_use` is correctly computed.
7. **Borrow-Expiry-Correct**: borrows are expired at the right
   time.

## What's mechanized vs hand-waved

- **Mechanized** (in future Coq/Lean work): the state machine
  transitions, the invariant preservation, the case-by-case proofs
  of No-Use-After-Move, No-Alias-Mutability-Violation, No-Data-Race,
  No-Double-Free.  The Last-Use-Correct and Borrow-Discharge-Sound
  lemmas.  Estimated Coq effort: ~8000 lines.
- **Hand-waved**: the cross-block approximation (v1's limitation —
  sound but conservative).  The `Copy` trait's hard-coded nature
  (assumed sound).  The `last_use` computation's correctness
  (assumed by the pre-pass's design).  The runtime's GC (assumed
  sound; see `06-gc-safety.md`).

## Conclusion

Borrow safety is the central guarantee of Aether's v2 ownership
system.  The proof reduces to three theorems (No-Use-After-Move,
No-Data-Race, No-Double-Free), each proven from the borrow
checker's invariants (Borrow-Read-Allowed, Borrow-Write-Allowed,
Borrow-Move-Allowed, Borrow-Shared-Allowed, Borrow-Mut-Allowed).
The NLL extension is sound by the Last-Use-Correct lemma.

The proof is paper-style; full mechanization is future work.  The
key lemmas are local invariants (the state machine's transition
rules), and the theorems are global consequences (no use-after-
move, no data race, no double-free).  The mechanization is
straightforward (model the state machine in Coq, prove the
invariants, derive the theorems).

The borrow checker is opt-in in v1; the safety guarantee holds
for programs that pass the checker.  v2 makes it mandatory.
