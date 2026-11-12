# 01. Type Preservation Proof Outline

## Theorem statement

**Theorem (Type Preservation).**  If `Γ ⊢ e : τ` (the expression `e` is
well-typed with type `τ` in typing environment `Γ`) and `Σ ⊨ σ : Γ`
(the store `σ` is well-typed with respect to `Γ` under the store
typing `Σ`) and `⟨e, ρ, σ⟩ ⟶ ⟨e′, ρ′, σ′⟩` (the expression takes a
small-step), then there exists `Γ′` extending `Γ` such that `Γ′ ⊢ e′ :
τ` and `Σ′ ⊨ σ′ : Γ′`.

In words: a step preserves the type.  Combined with Progress (which
says a well-typed expression either is a value, is a panic, or
steps), this gives Type Soundness (a well-typed program either
evaluates to a value of the expected type, panics, or diverges).

## Proof outline (by induction on the typing derivation)

The proof is by induction on the structure of the typing derivation
`Γ ⊢ e : τ`.  Each typing rule corresponds to one case.

### Case T-Int (and other literals)

`Γ ⊢ n : int`.  The expression `n` is a value; it cannot step (other
than the trivial identity step, which preserves the type).  ✓.

### Case T-Var

`Γ(x) = τ`.  The expression `x` steps by `E-Var` to the value `v =
σ(ρ(x))`.  Since `Σ ⊨ σ : Γ`, `σ(ρ(x)) : Γ(x) = τ`, so `v : τ`.  The
type is preserved.  ✓.

### Case T-BinOp-IntInt

`Γ ⊢ e₁ op e₂ : int` with `op ∈ {+, -, *, //, %, &, |, ^, <<, >>}`
and `Γ ⊢ e₁ : int`, `Γ ⊢ e₂ : int`.  The step is one of:

- `E-Step-LHS`: `⟨e₁, ρ, σ⟩ ⟶ ⟨e₁′, ρ′, σ′⟩`.  By IH on `e₁` (with
  type `int`), `Γ′ ⊢ e₁′ : int` for some `Γ′ ⊇ Γ`.  Then `Γ′ ⊢ e₁′
  op e₂ : int` by `T-BinOp-IntInt`.  ✓.
- `E-Step-RHS`: similar, using IH on `e₂`.  ✓.
- `E-AddIntInt` (or analog): `e₁ ⟹ n₁`, `e₂ ⟹ n₂`, `n = n₁ ⊕ n₂`,
  `e ⟹ n`.  The result `n` has type `int` (because `n₁, n₂ : int` and
  `⊕` preserves int).  ✓.
- `E-DivByZero` (panic): `e ⟹ panic p`.  A panic has any type
  (bottom), so `panic p : int`.  ✓.

### Case T-BinOp-NumWidening

Similar; the widening rule preserves the widened type.  When both
operands are values, the operation produces a value of `widen(τ₁,
τ₂)`.  ✓.

### Case T-If

`Γ ⊢ if e_cond { e_then } else { e_else } : τ`.  Steps:

- `e_cond` steps: by IH, `e_cond′ : bool`; the `if` has type `τ`.  ✓.
- `E-If-True`: `e_cond ⟹ true`, `e` steps to `e_then`.  By the typing
  hypothesis, `Γ ⊢ e_then : τ`, so the result has type `τ`.  ✓.
- `E-If-False`: similar, `e_else : τ`.  ✓.

### Case T-Call

`Γ ⊢ f(arg₁, …, argₙ) : τ_ret` with `Γ ⊢ f : (τ₁, …, τₙ) -> τ_ret`
and `Γ ⊢ arg_i : τ_i`.  Steps:

- `f` steps: by IH, `f′ : (τ₁, …, τₙ) -> τ_ret`; the call has type
  `τ_ret`.  ✓.
- An argument `arg_j` steps: by IH, `arg_j′ : τ_j`; the call has type
  `τ_ret`.  ✓.
- `E-Call-Closure`: the call evaluates the body in a new frame with
  parameters bound.  By `T-Fn`, the body has type `τ_ret` in the
  extended environment.  The result has type `τ_ret`.  ✓.
- `E-Call-Native`: native functions return values; the type matches
  the declared return type (assuming the builtin's TS type matches
  its Aether signature).  ✓.

### Case T-Lambda

`Γ ⊢ fn(x: τ_x) = e : (τ_x) -> τ_ret`.  The step `E-Lambda-Capture`
produces `closure(λx.e, ρ, captures)`, which has type `(τ_x) ->
τ_ret`.  ✓.

### Case T-Match

`Γ ⊢ match scrut { p_i => b_i } : τ` with `scrut : τ_scrut` and each
arm `b_i : τ` (in the environment extended by the pattern's
bindings).  Steps:

- `scrut` steps: by IH, `scrut′ : τ_scrut`; the match has type `τ`.
  ✓.
- `E-Match`: `scrut ⟹ v` (with `v : τ_scrut`), the matched arm
  `p_j` extends `Γ` to `Γ′` with bindings `bind(p_j)` of types
  matching the pattern.  By `T-Match`'s hypothesis, `Γ′ ⊢ b_j : τ`.
  The result has type `τ`.  ✓.

### Case T-Let

`Γ ⊢ let x : τ = e_init ⇝ Γ[x : τ]`.  Steps:

- `e_init` steps: by IH, `e_init′ : τ`.  The `let` has the same
  type and extends `Γ` similarly.  ✓.
- `S-Let`: `e_init ⟹ v` (with `v : τ`), the `let` produces `⟨ρ[x ↦
  ℓ], σ[ℓ ↦ v], ⟂⟩`.  The new environment extends `Γ` with `x : τ`.
  ✓.

### Case T-Fn

`Γ ⊢ fn f(...) { e_body } : (τ₁, …, τₙ) -> τ_ret`.  The step `S-Fn`
produces the closure and binds `f : (τ₁, …, τₙ) -> τ_ret` in the new
environment.  ✓.

### Other cases

The remaining cases (T-Struct, T-Enum, T-MethodCall, T-Borrow-*, T-
Ok, T-Err, T-Some, T-None, T-ErrorProp-*, T-While, T-ForIn, T-Block)
follow the same pattern: each step either evaluates a sub-expression
(preserving types by IH) or applies a constructor (preserving the
declared type).

## Key lemmas

1. **Canonical Forms**: if `v : τ` and `v` is a value, then `v` has
   the shape associated with `τ` (e.g., `τ = int` implies `v = n`;
   `τ = (τ₁, …) -> τ_ret` implies `v = closure` or `v = native`).
2. **Substitution**: if `Γ, x : τ_x ⊢ e : τ` and `Γ ⊢ e_x : τ_x`,
   then `Γ ⊢ e[x ↦ e_x] : τ`.
3. **Weakening**: if `Γ ⊢ e : τ` and `x ∉ dom(Γ)`, then `Γ, x : τ_x
   ⊢ e : τ`.
4. **Store Typing**: if `Σ ⊨ σ : Γ` and `⟨e, ρ, σ⟩ ⟶ ⟨e′, ρ′, σ′⟩`,
   then `Σ ⊨ σ′ : Γ` (the store typing is preserved; new locations
   are typed by their initial values).

## Assumptions

1. The sema layer is sound (only well-typed programs are accepted).
2. The runtime is sound (the tree-walker and VM implement the
   operational semantics faithfully).
3. No integer overflow (the formal model treats `int = ℤ`; the
   implementation truncates at `±2^53`, which is a value-level
   approximation).
4. Limited subtyping (only `int <: float` and `T <: dyn Trait`).
5. Single-threaded execution (no parallel async).

## What's mechanized vs hand-waved

- **Mechanized** (in future Coq/Lean work): the substitution lemma,
  weakening, canonical forms, the case-by-case preservation proof.
  These are standard and amenable to mechanization.
- **Hand-waved**: the sema layer's soundness (depends on the
  parser, type representation, and trait registry — large codebases).
  The runtime's soundness (depends on the eval.ts and vm.ts
  implementations, which are tested but not mechanically verified).
  The native-function signature matching (assumed by manual review).
  The GC's correctness (assumed; proven in `06-gc-safety.md`).

The proof is paper-style; full mechanization is future work.  The
key lemmas are standard; the per-construct cases are uniform.  The
mechanization roadmap is: define AST + typing rules + operational
semantics in Coq; prove substitution/weakening/canonical forms;
prove preservation by case analysis.  Estimated effort: ~5000
lines of Coq.

## Conclusion

Type preservation is the central theorem of Aether's type-safety
story.  The proof is by induction on the typing derivation, with one
case per typing rule.  Each case is a small argument using the IH
and the rule's hypothesis.  The lemmas (substitution, weakening,
canonical forms, store typing) are standard.

The proof establishes that a single step preserves the type.  By
induction on the number of steps, a multi-step evaluation preserves
the type, which is the basis for type soundness.
