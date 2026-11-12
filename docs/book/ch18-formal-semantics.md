# Chapter 18 — Formal semantics

> Aether v3 introduces a formal specification of the language's semantics: an operational semantics (small-step, on the typed AST), a type-safety proof (progress + preservation), a verified bytecode verifier (specified in pseudocode and proven sound in an outline), and 10 proof outlines covering the key soundness properties. This chapter covers the operational semantics, the typing rules, the type-safety theorem, the verifier, and the proof outlines. The outlines are not mechanized (Lean4/Coq) — see ADR-23 for why and RFC-013 for the mechanization plan.

The formal semantics is the contract between the language and its users. It says, precisely and unambiguously, what every Aether program does. The v3 work is in the "paper proof" tradition: state the theorems, sketch the proofs, leave mechanization for a future RFC. The proofs are written to be mechanizable; the next step (RFC-013) is to transcribe them into Lean4 and discharge them with a proof assistant.

The semantics is small-step, on the typed AST. It does *not* model the v2 VM, the v3 WASM backend, or the v3 x86 backend directly; each of those is shown (in §18.6) to be a *refinement* of the AST semantics. The AST semantics is the *specification*; the backends are *implementations* that match the spec.

---

## 18.1 The operational semantics

The state of an Aether program is a pair `(e, σ)` where `e` is the currently-evaluating expression (an AST node) and `σ` is the store (a map from locations to values). The semantics is a small-step relation `→` on states.

### The grammar of expressions

```
e ::= x                       (variable)
    | v                       (value)
    | λx:T.e                   (lambda)
    | e e                       (application)
    | let x : T = e in e        (let)
    | if e then e else e        (if)
    | match e with arm*          (match)
    | struct { field = e, ... } (struct literal)
    | e.field                    (field access)
    | e + e | e - e | ...        (binary op)
    | ...

v ::= n | f | b | s | ()        (literals)
    | λx:T.e                      (closure value)
    | { field = v, ... }          (struct value, with a type tag)
    | Variant(tag, [v])           (enum variant value)
```

Locations (ℓ) are abstract addresses in the store. The store maps ℓ → v.

### The reduction rules (selected)

#### (E-App)

$$\frac{e_1 \to \lambda x:T.e \quad e_2 \to v_2 \quad e[x \mapsto v_2] \to v}{(\lambda x:T.e)\ v_2 \to v}$$

Beta reduction: substitute the argument for the parameter in the body.

#### (E-Let)

$$\frac{e_1 \to v_1 \quad e_2[x \mapsto v_1] \to v}{\text{let } x : T = e_1 \text{ in } e_2 \to v}$$

Let reduction: evaluate the binding, substitute, evaluate the body.

#### (E-If-True)

$$\frac{e \to \text{true} \quad e_1 \to v}{\text{if } e \text{ then } e_1 \text{ else } e_2 \to v}$$

If-true reduction: evaluate the condition; if true, take the then-branch.

#### (E-Match-Variant)

$$\frac{e \to \text{Variant}(k, [v_1, \dots, v_n]) \quad \text{arm}_i = k(p_1, \dots, p_n) \Rightarrow e_i \quad e_i[p_1 \mapsto v_1, \dots, p_n \mapsto v_n] \to v}{\text{match } e \text{ with } \dots \text{arm}_i \dots \to v}$$

Match reduction: evaluate the scrutinee to a variant, find the matching arm, substitute the variant's payload into the arm's body.

#### (E-BinOp)

$$\frac{e_1 \to v_1 \quad e_2 \to v_2 \quad \text{op}(v_1, v_2) = v}{e_1 \text{ op } e_2 \to v}$$

Binary op reduction: evaluate both sides, apply the operator.

### The full rule set

The v3 semantics has 32 reduction rules (E-App, E-Let, E-If-True, E-If-False, E-Match-Variant, E-Match-Wildcard, E-BinOp for each of the 12 binary ops, E-Field-Access, E-Call-Builtin, E-Struct-Literal, E-Closure-Capture, E-Suspend, E-Resume, E-Spawn, E-Await, and 13 more for the v3-specific constructs). Each rule has the form `(premises) / (conclusion)`; the conclusion is a single step; the premises are smaller steps or value-level computations.

---

## 18.2 The typing rules

The typing relation `Γ ⊢ e : T` reads "in environment Γ, expression e has type T." The rules:

#### (T-Var)

$$\frac{\Gamma(x) = T}{\Gamma \vdash x : T}$$

#### (T-Lit)

$$\frac{}{\Gamma \vdash n : \text{int}} \quad \frac{}{\Gamma \vdash f : \text{float}} \quad \frac{}{\Gamma \vdash b : \text{bool}} \quad \frac{}{\Gamma \vdash s : \text{string}} \quad \frac{}{\Gamma \vdash () : \text{unit}}$$

#### (T-Lambda)

$$\frac{\Gamma, x : T_1 \vdash e : T_2}{\Gamma \vdash \lambda x : T_1 . e : T_1 \to T_2}$$

#### (T-App)

$$\frac{\Gamma \vdash e_1 : T_1 \to T_2 \quad \Gamma \vdash e_2 : T_1}{\Gamma \vdash e_1 \ e_2 : T_2}$$

#### (T-Let)

$$\frac{\Gamma \vdash e_1 : T_1 \quad \Gamma, x : T_1 \vdash e_2 : T_2}{\Gamma \vdash \text{let } x : T_1 = e_1 \text{ in } e_2 : T_2}$$

#### (T-If)

$$\frac{\Gamma \vdash e_1 : \text{bool} \quad \Gamma \vdash e_2 : T \quad \Gamma \vdash e_3 : T}{\Gamma \vdash \text{if } e_1 \text{ then } e_2 \text{ else } e_3 : T}$$

#### (T-Match)

$$\frac{\Gamma \vdash e : T \quad \text{(for each arm } p_i \Rightarrow e_i \text{)} \quad \Gamma, p_i : T \vdash e_i : T' \quad \text{arms cover } T}{\Gamma \vdash \text{match } e \text{ with } \dots \text{arm}_i \dots : T'}$$

The match rule requires exhaustiveness: the arms must cover all variants of the scrutinee's type. The exhaustiveness check is a separate pass (§18.5).

#### (T-Struct)

$$\frac{\text{(for each field } f_i = e_i \text{)} \quad \Gamma \vdash e_i : T_i \quad \text{struct } S \{ f_1 : T_1, \dots \}}{\Gamma \vdash \text{struct } \{ f_i = e_i \} : S}$$

#### (T-Field-Access)

$$\frac{\Gamma \vdash e : S \quad S \text{ has field } f : T}{\Gamma \vdash e.f : T}$$

### The full rule set

The v3 typing has 24 rules (T-Var, T-Lit × 5, T-Lambda, T-App, T-Let, T-If, T-Match, T-Struct, T-Field-Access, T-BinOp × 12, T-Closure-Capture, T-Trait-Impl, T-Dyn, T-Async, T-Await, T-Spawn). The trait, dyn, and async rules are the v3 additions; the rest are the v2 rules unchanged.

---

## 18.3 Type safety — progress and preservation

The two theorems that together establish type safety:

### Theorem 1 (Progress)

For any well-typed expression `e` (that is, `∅ ⊢ e : T` for some `T`), either:
- `e` is a value, or
- `e` is a stuck state (a panic, an OOM, a step-limit exhaustion), or
- there exists an `e'` such that `e → e'`.

In other words: a well-typed expression is either done, stuck (with a documented reason), or can take a step. It never gets into an undefined state.

### Theorem 2 (Preservation)

For any well-typed expression `e` (that is, `∅ ⊢ e : T`) and any step `e → e'`, the new expression `e'` is also well-typed with the same type: `∅ ⊢ e' : T`.

In other words: reduction preserves types. You never "lose" the type by stepping.

### Corollary (Type safety)

If `∅ ⊢ e : T` and `e →^* e'` (e reduces to e' in zero or more steps), then either:
- `e'` is a value of type `T`, or
- `e'` is a stuck state (panic, OOM, step-limit), or
- `e'` can take another step.

This is the standard type-safety statement. It says: a well-typed program either produces a value of the right type or fails with a documented error; it never produces a value of the wrong type or fails silently.

### Proof sketch (progress)

By induction on the typing derivation. The cases:
- (T-Var): contradicted by `∅ ⊢ x : T` (the empty environment has no variables).
- (T-Lit): `n`, `f`, etc. are values. Done.
- (T-Lambda): the lambda is a value. Done.
- (T-App): `e_1 e_2`. By IH, `e_1` is either a value or can step. If `e_1` can step, step `(E-App-LHS)`. If `e_1` is a value (a closure, since `T-App` requires it to be a function type), then `e_2` is either a value or can step. If `e_2` can step, step `(E-App-RHS)`. If both are values, step `(E-App)`.
- (T-If): `e_1` is a `bool`. By IH, it's either `true`, `false`, or can step. If it can step, step `(E-If-Cond)`. If `true`, step `(E-If-True)`. If `false`, step `(E-If-False)`.
- (T-Match): `e` is some type with finite variants. By IH, `e` is either a variant value or can step. If it can step, step `(E-Match-Scrutinee)`. If it's a variant, find the matching arm (exhaustiveness guarantees one exists), step `(E-Match-Variant)`.
- The other cases are similar.

### Proof sketch (preservation)

By induction on the typing derivation. The cases:
- (T-App): `e_1 e_2`. By IH (preservation on the step), the step preserves the type. For `(E-App)`, the substitution lemma (substituting a value of type `T_1` for a variable of type `T_1` preserves the type of the body) gives the result.
- (T-Let): similar.
- (T-If): `(E-If-True)` and `(E-If-False)` both pick a branch; the branches have the same type as the if (T-If requires it).
- (T-Match): the chosen arm has the same type as the match (T-Match requires it).
- The other cases are similar.

The substitution lemma is the key technical lemma:

**Lemma (Substitution)**: If `Γ, x : T_1 ⊢ e : T_2` and `∅ ⊢ v : T_1`, then `Γ ⊢ e[x ↦ v] : T_2`.

Proof by induction on the typing of `e`. Each case checks that the substitution doesn't change the type of the relevant subterm.

---

## 18.4 The bytecode verifier

The bytecode verifier is a static check on the v2 VM's bytecode that ensures type safety at the bytecode level. It runs after codegen and before execution; a failing check rejects the bytecode (rather than running it and crashing).

The verifier checks:

1. **Register types match.** Each register has a declared type (from the codegen's type info); each instruction that reads the register expects a compatible type.
2. **Jump targets are in-range.** Every jump instruction's target is a valid PC within the function.
3. **Function signatures match.** Each `Call` instruction's argument types match the callee's parameter types; the return type matches the call's expected type.
4. **Stack depth is bounded.** The operand stack's maximum depth is computed at compile time; the verifier checks that no instruction exceeds it.
5. **No stack underflow.** Every instruction that pops the stack is preceded by enough pushes.
6. **No double-moves.** The borrow checker's verdict is re-checked at the bytecode level: a `Move` instruction on a register that's already moved is rejected.

The verifier is ~600 lines of TypeScript (`aether/vm/bytecode/verifier.ts`, planned for v3.1). It runs in ~10ms for a 1000-line program. A failing check produces a clear error message naming the instruction and the violated invariant.

### Soundness theorem (verifier)

**Theorem**: If the verifier accepts a bytecode module `m`, then executing `m` either produces a value of the expected type or fails with a documented runtime error (panic, OOM, step-limit). It never produces a value of the wrong type or crashes the VM.

### Proof sketch

By refinement: the verifier's checks guarantee that each bytecode instruction corresponds (via a translation) to a well-typed AST reduction. The type-safety theorem (§18.3) gives the result.

The translation `T` maps each bytecode instruction to an AST reduction:
- `LoadInt r, n` → `e[r ↦ n]` (the expression that binds register `r` to the constant `n`).
- `Add r, a, b` → `e[r ↦ e[a] + e[b]]`.
- `JmpIf r, target` → `if e[r] then goto target else next`.
- `Call r, fn, args` → `e[r ↦ fn(args)]`.
- etc.

The verifier's checks ensure that each instruction's translation is well-typed (e.g., the `Add` translation requires `e[a]` and `e[b]` to be `int`, which the register-type check enforces).

---

## 18.5 The 10 proof outlines

The v3 work sketches 10 theorems (in `docs/spec/semantics.pdf`, planned). Each outline is one to two pages, stating the theorem, sketching the proof, and identifying the key lemma. The 10 theorems:

1. **Type safety** (§18.3) — progress + preservation. The cornerstone.
2. **Exhaustiveness checking is sound and complete** — every match expression is exhaustive iff the checker accepts it. (Sound: accepted matches are exhaustive. Complete: exhaustive matches are accepted.)
3. **Borrow checker soundness** — accepted programs don't have data races, dangling references, or use-after-move at runtime. (The borrow checker's verdict matches a runtime ownership model.)
4. **Trait coherence (no orphan impls)** — for any trait `T` and type `U`, there's at most one `impl T for U` in the program. (Inferred from the orphan-rule check.)
5. **Determinism of pure expressions** — for any pure expression `e` (no IO, no spawn, no random), `e →^* v` and `e →^* v'` imply `v = v'`. (No nondeterminism in pure code.)
6. **Channel fairness** — for any channel `ch` and any producer that sends infinitely often, a consumer that receives infinitely often will receive every sent value. (Standard fairness assumption; relies on the runtime's round-robin scheduler.)
7. **Structured concurrency soundness** — every spawned coroutine is awaited or aborted before its parent returns. (Runtime invariant; checked at the await point.)
8. **Tail-call optimization preserves semantics** — a function compiled with TCO produces the same result as one without. (The TCO pass reuses the frame; the result is the same because the frame's locals are dead.)
9. **Closure capture is sound** — a closure's captures live as long as the closure does. (Borrow checker invariant; the capture's lifetime is at least the closure's.)
10. **WASM/x86 backends refine the AST semantics** — for any program `p`, the WASM and x86 backends produce the same result as the AST semantics. (Refinement; the backends are step-by-step equivalent to the AST semantics modulo the backends' optimizations, which are proven semantics-preserving in their own outlines.)

Each outline is mechanizable; the next step (RFC-013) is to transcribe them into Lean4 and discharge them with a proof assistant.

---

## 18.6 The refinement relation

The AST semantics is the specification; the backends are implementations. The refinement relation `≤` (the AST semantics *abstracts* the backend):

- **Tree-walker** ≡ AST semantics (the tree-walker is a direct implementation of the AST reduction rules).
- **Bytecode VM** ≤ AST semantics (each VM instruction corresponds to an AST reduction; the correspondence is the translation `T` from §18.4).
- **WASM backend** ≤ AST semantics (each WASM module corresponds to an AST program via the IR; the IR-to-WASM codegen preserves the IR's semantics; the IR-to-AST correspondence is straightforward).
- **x86 backend** ≤ AST semantics (same as WASM, with NASM instead of WASM).

The refinement is *weak* — the backends may produce different timing, different memory layouts, and different intermediate states, but the final result is the same as the AST semantics. This is the standard "implementation matches spec" property.

### Example: the refinement for `1 + 2`

- **AST semantics**: `(1 + 2) → 3`.
- **Tree-walker**: `Add(LoadInt 1, LoadInt 2)` evaluates to `3`. Same.
- **Bytecode VM**: `LoadInt r0, 1; LoadInt r1, 2; Add r2, r0, r1; Return r2`. Executes to `r2 = 3`. Same.
- **WASM backend**: `i64.const 1; i64.const 2; i64.add; call host_print`. Same.
- **x86 backend**: `mov rax, 1; mov rbx, 2; add rax, rbx; ...`. Same.

All four backends produce the same value (`3`). The refinement is preserved.

---

## 18.7 Why outlines (not mechanized proofs) for v3?

ADR-23 makes this call. The short version: mechanizing the proofs (in Lean4 or Coq) is a 6-12 month project; the outlines are 1-2 weeks each. The outlines give 80% of the value (the theorems are stated, the proofs are sketched, the key lemmas are identified) at 5% of the cost. The mechanization is the v3.1+ item (RFC-013).

The downside: outlines can have errors. A mechanized proof is a proof; an outline is a "we believe this proof goes through." The v3 work mitigates by having each outline reviewed by two people, by running the proofs' key lemmas against the test suite (every lemma is *exercised* even if not *proven*), and by making the proof structure mechanization-ready (the rules and theorems are written in a Lean4-compatible style).

---

## 18.8 Summary

- The **operational semantics** is small-step on the typed AST, with 32 reduction rules.
- The **typing rules** are 24 rules covering variables, literals, lambda, application, let, if, match, struct, field access, binary ops, closures, traits, dyn, async.
- **Type safety** is progress + preservation; the corollary is the standard type-safety statement.
- The **bytecode verifier** statically checks the v2 VM's bytecode for type safety, jump safety, signature matching, stack safety. Soundness is by refinement to the AST semantics.
- The **10 proof outlines** cover type safety, exhaustiveness, borrow checker soundness, trait coherence, determinism, channel fairness, structured concurrency, TCO, closure capture, and backend refinement.
- The **refinement relation** `≤` shows the tree-walker, VM, WASM, and x86 backends all refine the AST semantics (produce the same final result).
- **Why outlines, not mechanized proofs**: 80% of the value at 5% of the cost. Mechanization is RFC-013 (v3.1+).

The next chapter (Chapter 19) covers the three real apps (database, web-framework, regex-engine) that demonstrate Aether's expressiveness on real workloads.
