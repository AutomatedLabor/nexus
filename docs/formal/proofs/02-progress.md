# 02. Progress Proof Outline

## Theorem statement

**Theorem (Progress).**  For any well-typed expression `Γ ⊢ e : τ`
and any well-typed store `Σ ⊨ σ : Γ`, either:

- `e` is a value (`Val(e)`), or
- `e` is a panic (`e = panic p`), or
- there exists `(e′, ρ′, σ′)` such that `⟨e, ρ, σ⟩ ⟶ ⟨e′, ρ′, σ′⟩`.

In words: a well-typed expression is either a value, a panic, or
can take a step.  There are no "stuck" states (configurations that
are not values and cannot step).

Combined with Preservation (which says a step preserves the type),
this gives Type Soundness: a well-typed program either produces a
value of the expected type, panics (a controlled failure with a
message), or diverges.  A "stuck" state is impossible.

## Proof outline (by induction on the typing derivation)

The proof is by induction on the structure of the typing derivation
`Γ ⊢ e : τ`.  Each typing rule corresponds to one case.

### Case T-Int, T-Float, T-Bool, T-String, T-Char, T-Unit

The expression `e` is a literal, which is a value (`Val(e)`).  ✓.

### Case T-Var

`e = x` and `Γ(x) = τ`.  Since `Σ ⊨ σ : Γ`, the location `ℓ = ρ(x)`
exists and `σ(ℓ) = v` for some `v : τ`.  By `E-Var`, `⟨x, ρ, σ⟩ ⟹
v`.  So the expression steps (to the value).  ✓.

### Case T-BinOp-IntInt

`e = e₁ op e₂` with `op ∈ {+, -, *, //, %, &, |, ^, <<, >>}` and
`Γ ⊢ e₁ : int`, `Γ ⊢ e₂ : int`.  By IH:

- If `e₁` is not a value, it steps; by `E-Step-LHS`, `e` steps.  ✓.
- If `e₁` is a value `n₁` and `e₂` is not a value, `e₂` steps; by
  `E-Step-RHS`, `e` steps.  ✓.
- If both are values `n₁, n₂`:
  - For `+`, `-`, `*`: `E-AddIntInt` (or the analog) gives `⟨e₁ op
    e₂, ρ, σ⟩ ⟹ n` for `n = n₁ ⊕ n₂`.  ✓.
  - For `//`: if `n₂ ≠ 0`, `E-IDiv` gives a step.  If `n₂ = 0`, the
    expression steps to a panic (`E-DivByZero`).  Either way, `e`
    takes a step.  ✓.
  - For `%`: similar — `E-Mod` if `n₂ ≠ 0`, panic otherwise.  ✓.
  - For `&`, `|`, `^`, `<<`, `>>`: `E-Bit` gives a step.  ✓.

### Case T-BinOp-NumWidening

Similar to T-BinOp-IntInt, but with `E-AddIntFloat`, `E-AddFloatAny`,
`E-Div` (float division is total — no panic).  ✓.

### Case T-BinOp-Compare, T-BinOp-Eq

Both operands step by IH; when both are values, `E-Cmp` or `E-Eq`/
`E-Neq` gives a step.  ✓.

### Case T-BinOp-Logical

`e = e₁ && e₂` (or `||`).  By IH:

- If `e₁` steps, `e` steps.  ✓.
- If `e₁` is a value `b`:
  - `b = true` (for `&&`): by `E-AndTrue`, `e` steps to evaluate
    `e₂`.  ✓.
  - `b = false` (for `&&`): by `E-AndFalse`, `e` steps to `false`.
    ✓.
  - `b = true` (for `||`): by `E-OrTrue`, `e` steps to `true`.  ✓.
  - `b = false` (for `||`): by `E-OrFalse`, `e` steps to evaluate
    `e₂`.  ✓.

### Case T-If

`e = if e_cond { e_then } else { e_else }`.  By IH:

- If `e_cond` steps, `e` steps.  ✓.
- If `e_cond` is a value `b`:
  - `b = true`: by `E-If-True`, `e` steps to `e_then`.  ✓.
  - `b = false`: by `E-If-False`, `e` steps to `e_else`.  ✓.

(Note: the type system ensures `b : bool`, so `b ∈ {true, false}` —
no other value is possible.)

### Case T-Call

`e = f(arg₁, …, argₙ)`.  By IH on `f`:

- If `f` steps, `e` steps by `E-Call-Step-Callee`.  ✓.
- If `f` is a value:
  - `f = closure(λx.e_body, ρ_c, [ℓⱼ])`: by `T-Call`, `f : (τ₁,
    …, τₙ) -> τ_ret`, so `λx.e_body` has `n` parameters.  By IH on
    each `arg_i`:
    - If the leftmost non-value argument is `arg_j`, it steps; by
      `E-Call-Step-Arg-j`, `e` steps.  ✓.
    - If all arguments are values: by `E-Call-Closure`, `e` steps
      to evaluate the body.  ✓.
  - `f = native(fn)`: similar; `E-Call-Native`.  ✓.

### Case T-Lambda

`e = fn(x: τ) = e_body`.  By `E-Lambda-Capture`, `e` steps to
`closure(λx.e_body, ρ, captures)`.  ✓.

### Case T-Match

`e = match scrut { p_i => b_i }`.  By IH:

- If `scrut` steps, `e` steps.  ✓.
- If `scrut` is a value `v`: by exhaustiveness (a hypothesis of
  T-Match), some arm's pattern `p_j` matches `v`.  By `E-Match`,
  `e` steps to evaluate `b_j` in the extended environment.  ✓.

### Case T-Let

`e = let x = e_init`.  By IH:

- If `e_init` steps, `e` steps.  ✓.
- If `e_init` is a value `v`: by `S-Let`, `e` steps to allocate the
  binding and yield `⟂`.  ✓.

### Case T-Fn

`e = fn f(...) { ... }`.  By `S-Fn`, `e` steps to allocate the
closure and yield `⟂`.  ✓.

### Case T-Struct

`e = S { f₁ : v₁, …, fₙ : vₙ }`.  By IH, each `v_i` either is a
value or steps.  The leftmost non-value `v_j` steps; by the field-
literal context rule, `e` steps.  If all are values, `e` steps to
construct the struct value.  ✓.

### Case T-Enum

Similar to T-Struct.  ✓.

### Case T-MethodCall

`e = o.m(args)`.  By IH on `o`:

- If `o` steps, `e` steps.  ✓.
- If `o` is a value: the resolved method `fn` is a closure (static
  dispatch) or a vtable entry (dynamic dispatch).  By IH on the
  arguments, the leftmost non-value one steps; if all are values,
  by `E-MethodCall-Static` or `E-MethodCall-Dyn`, `e` steps.  ✓.

### Cases T-Borrow-*, T-Deref, T-Move

In v1 GC mode, these are identity (see §5.10 of
`operational-semantics.md`).  By IH:

- If the operand steps, `e` steps.  ✓.
- If the operand is a value, by `E-Borrow-Shared`, `E-Borrow-Mut`,
  `E-Deref`, or `E-Move`, `e` steps to the same value.  ✓.

### Cases T-Ok, T-Err, T-Some, T-None

These are constructors of `Result` and `Option`; they're values
(the constructor applied to a value payload, or `None` is a
constant).  By `E-Ok`, `E-Err`, `E-Some`, `E-None`, the expression
steps to the value.  ✓.

### Case T-ErrorProp-Result

`e = e_inner?` with `e_inner : Result<τ, E>`.  By IH:

- If `e_inner` steps, `e` steps.  ✓.
- If `e_inner` is a value:
  - `Ok(v)`: by `E-ErrProp-Ok`, `e` steps to `v`.  ✓.
  - `Err(e)`: by `E-ErrProp-Err`, `e` steps to `return Err(e)`.  ✓.

(Note: `e_inner : Result<τ, E>` ensures `e_inner` is either `Ok` or
`Err` of the right types — no other value is possible.)

### Case T-ErrorProp-Option

Similar; `E-ErrProp-Some` or `E-ErrProp-None`.  ✓.

### Cases T-While, T-ForIn, T-Block

These statements have similar progress proofs; the controlling
expression steps (or is a value), and the body steps by IH.  ✓.

## Conclusion

In every case, the well-typed expression either is a value, is a
panic, or takes a step.  There are no "stuck" states.

## Key lemmas

1. **Canonical Forms**: if `v : τ` and `v` is a value, then `v` has
   the shape associated with `τ`.  Used in T-Call (the callee is a
   closure or native), T-Match (the scrutinee is a value of the
   expected type), T-ErrorProp-* (the inner expression is Ok/Some or
   Err/None).
2. **Exhaustiveness** (for T-Match): the arms cover every value of
   the scrutinee's type.  This is a hypothesis of T-Match, enforced
   by the sema layer's Maranget algorithm.
3. **Store Typing**: the store is well-typed, so variable lookups
   succeed.

## Assumptions

1. The sema layer enforces exhaustiveness for match expressions.
2. The sema layer enforces trait-bound satisfaction (so method
   calls resolve to a real impl).
3. The runtime's `truthy` function is total (returns `true` or
   `false` for every value).
4. No integer overflow (the formal model treats `int = ℤ`; the
   implementation's `±2^53` truncation doesn't affect progress).

## What's mechanized vs hand-waved

- **Mechanized**: the case-by-case progress proof is amenable to
  mechanization.  Each case is a small argument using IH + the
  rule's hypothesis.  Estimated Coq effort: ~3000 lines.
- **Hand-waved**: the sema layer's exhaustiveness check (depends on
  the parser, the type representation, and the Maranget algorithm).
  The runtime's `truthy` function (assumed total).
  The `display` function for string interpolation (assumed total).

## Conclusion

Progress is the second central theorem of Aether's type-safety
story.  The proof is by induction on the typing derivation, with
one case per typing rule.  Each case is a small argument using the
IH and the rule's hypothesis.  The key lemmas (canonical forms,
exhaustiveness, store typing) are standard.

Together with Preservation (`01-type-preservation.md`), Progress
establishes Type Soundness: a well-typed program either produces a
value of the expected type, panics, or diverges.  No "stuck"
states are possible.
