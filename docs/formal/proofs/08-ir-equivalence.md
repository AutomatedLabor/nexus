# 08. IR Equivalence Proof Outline

## Theorem statement

**Theorem (IR Equivalence).**  The 8 IR optimization passes in
`aether/core/opt/` (constant folding, dead-code elimination,
common-subexpression elimination, inlining, tail-call
optimization, loop-invariant code motion, strength reduction,
branch simplification) each preserve program semantics.  When
applied in the default pipeline order, they collectively preserve
semantics: an Aether program `P`, when compiled with the default
optimization pipeline, produces the same observable behavior as
`P` compiled without optimization.

Formally: for any well-typed Aether program `P` and any input,
`run(P) = run(opt(P))` (the same output, the same final store
modulo fresh locations, the same panic-vs-terminate behavior).

## Background: the 8 passes

The default pipeline (see `aether/core/opt/index.ts`):

1. **constantFolding** — folds constant arithmetic: `2 + 3` → `5`,
   `if true { a } else { b }` → `a`.
2. **dce** (dead-code elimination) — removes instructions whose
   results are never used.
3. **cse** (common-subexpression elimination) — collapses
   redundant expressions: `a + b; a + b` → `t = a + b; t; t`.
4. **inlining** — inlines small function calls: `f(x)` → the body
   of `f` with `x` substituted.
5. **tco** (tail-call optimization) — marks tail calls as jumps
   (so they don't grow the stack).
6. **licm** (loop-invariant code motion) — hoists loop-invariant
   expressions out of the loop.
7. **strengthReduction** — replaces expensive ops with cheaper
   ones: `x * 2` → `x << 1`.
8. **branchSimplification** — collapses constant branches and
   merges trivial blocks.

## Proof outline

The proof is by induction on the pipeline: we show each pass
preserves semantics, then the composition preserves semantics.

### Step 1: Each pass preserves semantics

For each pass, we state and prove a preservation theorem.

**Theorem (ConstantFolding-Preservation).**  If `e` evaluates to
`v` (i.e., `⟨e, ρ, σ⟩ ⟹ v`), and `constantFolding(e) = e′`, then
`⟨e′, ρ, σ⟩ ⟹ v` (the folded expression evaluates to the same
value).

Proof: by induction on the structure of `e`.  For each folding
rule, the folded expression is semantically equivalent to the
original.  For example:

- `n₁ + n₂` (where `n₁, n₂` are int literals) folds to `n₁ + n₂`
  (the integer sum).  By `E-AddIntInt`, the unfolded expression
  evaluates to `n₁ + n₂`; the folded expression is the literal `n₁
  + n₂`, which evaluates to itself.  Same value.  ✓.
- `if true { e_then } else { e_else }` folds to `e_then`.  By
  `E-If-True`, the unfolded expression evaluates to `e_then`'s
  value; the folded expression is `e_then`, which evaluates to the
  same value.  ✓.

For expressions that don't fold (no constant operands, no
constant condition), the pass returns the expression unchanged;
trivially equivalent.  ✓.

**Theorem (DCE-Preservation).**  If `e` evaluates to `v`, and
`dce(e) = e′`, then `⟨e′, ρ, σ⟩ ⟹ v`.

Proof: DCE removes instructions whose results are never used.
For each removed instruction `i`:

- `i` has no observable side effects (the pass checks this; if `i`
  has side effects, it's not removed).
- `i`'s result is not used (the pass checks this by liveness
  analysis).

So removing `i` doesn't change the observable behavior.  ✓.

**Theorem (CSE-Preservation).**  If `e` evaluates to `v`, and
`cse(e) = e′`, then `⟨e′, ρ, σ⟩ ⟹ v`.

Proof: CSE replaces `e_i` (an occurrence of a common
subexpression) with a reference to a temporary `t` that holds the
result of an earlier occurrence `e_j`.  By the IH, `e_i` and `e_j`
evaluate to the same value (they're syntactically identical and
have the same environment).  So replacing `e_i` with `t` (which
holds `e_j`'s value) yields the same value.  ✓.

(Note: CSE requires that `e_j` has no side effects and dominates
`e_i`.  The pass checks both; if either fails, `e_i` is not
replaced.)

**Theorem (Inlining-Preservation).**  If `e` evaluates to `v`,
and `inlining(e) = e′`, then `⟨e′, ρ, σ⟩ ⟹ v`.

Proof: inlining replaces `f(arg)` with the body of `f` (with
`arg` substituted for the parameter).  By the substitution lemma
(standard), the substituted body has the same type as `f(arg)`'s
return type.  By the operational semantics, the substituted body
evaluates to the same value as `f(arg)`.  ✓.

(The pass only inlines functions that are small (body size below
a threshold) and don't have recursive callsite depth above a
limit.  For larger functions, the pass leaves the call in place;
trivially equivalent.)

**Theorem (TCO-Preservation).**  If `e` evaluates to `v`, and
`tco(e) = e′`, then `⟨e′, ρ, σ⟩ ⟹ v`.

Proof: TCO marks a tail call as a jump (instead of a call).  The
jump reuses the current frame (instead of pushing a new one).  By
the operational semantics, the jump's behavior is the same as the
call's behavior (the body is evaluated with the parameters bound
to the arguments).  The only difference is the stack usage (the
jump doesn't grow the stack).  The observable behavior (the
result value) is the same.  ✓.

(The pass only marks calls in tail position — the last expression
in a function body, with no surrounding cleanup.  For non-tail
calls, the pass leaves them as calls; trivially equivalent.)

**Theorem (LICM-Preservation).**  If `e` evaluates to `v`, and
`licm(e) = e′`, then `⟨e′, ρ, σ⟩ ⟹ v`.

Proof: LICM hoists a loop-invariant expression `e_inv` out of the
loop.  The hoisting is sound iff:

- `e_inv` doesn't depend on any variable modified in the loop
  (the pass checks this).
- `e_inv` has no side effects (the pass checks this).
- `e_inv` doesn't panic (the pass checks this; if `e_inv` could
  panic, hoisting it would change the panic's location).

With these conditions, hoisting `e_inv` out of the loop doesn't
change the observable behavior: `e_inv` is computed once (before
the loop), and the result is used inside the loop.  The total
work is the same as if `e_inv` were recomputed each iteration, but
the result is the same (since `e_inv` doesn't depend on loop
state).  ✓.

**Theorem (StrengthReduction-Preservation).**  If `e` evaluates
to `v`, and `strengthReduction(e) = e′`, then `⟨e′, ρ, σ⟩ ⟹ v`.

Proof: strength reduction replaces an expensive operation with a
cheaper one that produces the same result.  For example:

- `x * 2` → `x << 1` (shift is cheaper than multiply; same result
  for integers).
- `x * 4` → `x << 2`.
- `x / 2` → `x >> 1` (for non-negative integers).

Each replacement is sound: the two operations produce the same
value for the same input.  ✓.

(The pass only applies when the replacement is sound; e.g., it
doesn't replace `x * 2` with `x << 1` if `x` is a float, because
the shift doesn't apply to floats.)

**Theorem (BranchSimplification-Preservation).**  If `e`
evaluates to `v`, and `branchSimplification(e) = e′`, then
`⟨e′, ρ, σ⟩ ⟹ v`.

Proof: branch simplification collapses:

- `if true { a } else { b }` → `a` (the else branch is dead).
- `if false { a } else { b }` → `b` (the then branch is dead).
- Two consecutive blocks with no control flow between them → one
  merged block.

Each transformation is sound: the simplified expression evaluates
to the same value as the original (the dead branches are not
evaluated; the merged blocks have the same instructions).  ✓.

### Step 2: Composition of passes preserves semantics

**Theorem (Pipeline-Preservation).**  If `e` evaluates to `v`,
and `pipeline(e) = e′` (applying the 8 passes in order), then
`⟨e′, ρ, σ⟩ ⟹ v`.

Proof: by induction on the number of passes.

- Base case (0 passes): `e′ = e`, trivially equivalent.  ✓.
- Inductive case (n+1 passes): by IH, the first `n` passes
  preserve semantics: `e_n` evaluates to `v`.  By the (n+1)-th
  pass's preservation theorem, `e_{n+1} = pass_{n+1}(e_n)`
  evaluates to `v`.  ✓.

So the default pipeline preserves semantics.  ✓.

### Step 3: Fixpoint semantics

The default pipeline is applied once.  For aggressive
optimization, the pipeline can be applied multiple times until a
fixpoint (no further changes).  The fixpoint preserves semantics
(by induction on the number of iterations; each iteration
preserves semantics).

## Assumptions

1. Each pass is correctly implemented (the pass's transformation
   matches the formal description).
2. The passes don't introduce new type errors (each pass
   preserves well-typedness — a separate invariant, not proven
   here).
3. The IR is correctly translated to bytecode (a separate
   proof, not here; the codegen is sound).
4. The passes' side-effect, dominance, and liveness analyses are
   sound (these are pass-specific invariants).
5. The passes are total (each pass terminates — proven separately
   for each pass; e.g., constant folding terminates because the
   AST is finite).

## Key lemmas

1. **Substitution lemma**: substituting a same-typed expression
   for a variable preserves the type.  Used in Inlining.
2. **Liveness analysis soundness**: the liveness analysis
   correctly identifies which variables are used downstream.
   Used in DCE.
3. **Dominance analysis soundness**: the dominance analysis
   correctly identifies which expressions dominate others.  Used
   in CSE.
4. **Side-effect analysis soundness**: the side-effect analysis
   correctly identifies which expressions have no side effects.
   Used in DCE, CSE, LICM.
5. **Tail-position identification**: the pass correctly identifies
   tail positions.  Used in TCO.
6. **Loop-invariance analysis soundness**: the loop-invariance
   analysis correctly identifies loop-invariant expressions.  Used
   in LICM.
7. **Strength-reduction soundness**: each strength reduction
   replacement produces the same result.  Used in
   StrengthReduction.

## What's mechanized vs hand-waved

- **Mechanized** (in future Coq/Lean work): the per-pass
  preservation proofs (each is a case-by-case argument on the
  transformation).  Estimated Coq effort: ~10000 lines (8 passes ×
  ~1000 lines + ~2000 lines for the composition).
- **Hand-waved**: the side-effect, dominance, and liveness
  analyses' soundness (depends on the IR's data structures).  The
  passes' termination (assumed by the AST's finiteness).  The
  codegen's soundness (a separate proof, not here).

## Conclusion

IR equivalence is the guarantee that the 8 optimization passes
collectively preserve program semantics.  The proof reduces to:

1. Each pass preserves semantics (8 separate preservation
   theorems).
2. Composition of passes preserves semantics (induction on the
   pipeline length).
3. Fixpoint application preserves semantics (induction on the
   number of iterations).

The proof is paper-style; full mechanization is future work.  The
key lemmas are the per-pass preservation theorems; the composition
is a straightforward induction.

The v1 limitations (each pass is conservative — it doesn't apply
when the transformation might not be sound) are documented; this
is a soundness-preserving design (the passes never produce wrong
code, but they may miss optimization opportunities).

Together with the type-safety proofs (`01`, `02`) and the
codegen-correctness proofs (`09`, `10`), IR equivalence ensures
that optimized Aether programs produce the same output as
unoptimized ones (modulo performance).
