# 04. Trait Coherence Proof Outline

## Theorem statement

**Theorem (Trait Coherence).**  For any pair `(T, m)` where `T` is
a concrete type and `m` is a method name, the trait registry's
`resolve(T, m)` function returns at most one impl.  Equivalently,
there is no ambiguous method resolution.

This is the central guarantee of Aether's trait system (RFC; see
`aether/core/traits/traits.ts`).  It ensures that method dispatch
is deterministic and that adding a new impl can't silently change
the behavior of existing code.

## Background: the trait registry

The `TraitRegistry` maintains:

```
interface TraitRegistry {
  traits: Map<string, TraitDecl>;                 // traitName -> decl
  impls: Map<string, ImplBlock>;                   // mangled name -> impl
  genericImpls: Map<string, ImplBlock>;            // for generic impls
  // mangled name = `${traitName}__${implTypeName}` (for non-generic)
  //              = `${traitName}__${implTypeName}__${typeArgsHash}` (for generic)
}
```

The invariant: for each mangled name, at most one impl exists.

## Proof outline

### Step 1: The uniqueness invariant

**Lemma (Registry-Uniqueness).**  For each mangled name `key`, the
registry has at most one `ImplBlock`.

Proof: `declareImpl` checks `impls.has(key)` before adding; if
the key exists, it rejects the duplicate.  So no duplicate entry
is added.  ✓.

The check is at line ~XXX of `traits.ts`:

```typescript
const key = `${traitName}__${implTypeName}`;
if (this.impls.has(key)) {
  throw new Error(`duplicate impl of ${traitName} for ${implTypeName}`);
}
this.impls.set(key, impl);
```

This is the orphan-rule approximation in v1: "globally unique impl
per (trait, concrete type)" rather than Rust's proper orphan rule
(which is crate-relative).

### Step 2: The resolution function

`resolve(T, m)`: given a concrete type `T` and a method name `m`,
find the impl that provides `m` for `T`.

```
function resolve(T, m):
  for each impl I in registry.impls:
    if I matches (T, m):  // I.traitName has method m, I.implType matches T
      return I
  // fallback: try generic impls
  for each generic impl G in registry.genericImpls:
    if G matches T with substitution θ, and G has method m:
      return G[θ]
  return null  // no impl found; sema rejects the call
```

The resolution is **deterministic** if:

- The impl set is unique (by Registry-Uniqueness).
- The generic impl matching is deterministic (by Unification-
  Determinism below).

### Step 3: Unification determinism

**Lemma (Unification-Determinism).**  For any type `T` and generic
impl `G`, the unification of `G.implType` with `T` produces at most
one substitution `θ`.

Proof: Hindley-Milner unification is deterministic (the Robinson
algorithm produces the most general unifier, which is unique up to
renaming).  Aether's unification (in `aether/core/types/types.ts`)
follows this algorithm.  ✓.

### Step 4: The no-ambiguity theorem

**Theorem (No-Ambiguous-Resolution).**  For any `(T, m)`,
`resolve(T, m)` returns at most one impl.

Proof:

- For non-generic impls: by Registry-Uniqueness, at most one impl
  for `(traitName, T)` exists.  So `resolve` returns at most one.
  ✓.
- For generic impls: by Unification-Determinism, at most one
  generic impl matches `T` with a unique substitution.  So
  `resolve` returns at most one.  ✓.

(For the case where both a non-generic and a generic impl match,
v1 takes the non-generic one (more specific).  This is the "first
match wins" rule.  v2 may add proper specialization with coherence
checks.)

### Step 5: Object safety for `dyn Trait`

A trait is object-safe iff it has no associated types and no `Self`
in any method's *parameter* position.

**Theorem (Object-Safety-Soundness).**  If `Trait` is object-safe,
then `dyn Trait` values support all the trait's methods via
vtable dispatch.

Proof:

- Each method `m` of `Trait` has signature `(self, args) -> ret`
  where `self : dyn Trait`.
- The vtable for a `dyn Trait` value has an entry for each method,
  pointing to the impl's closure.
- Method dispatch: `o.m(args)` for `o : dyn Trait` looks up `m` in
  `o.vtable` and calls the closure with `[o.data, ...args]`.
- Since the trait is object-safe (no `Self` in parameters, no
  associated types), the closure's signature is fully determined by
  the trait (no `Self` to substitute).
- So the dispatch is well-typed.  ✓.

For non-object-safe traits, `dyn Trait` is rejected by sema (the
T-Dyn rule requires object-safety).  ✓.

### Step 6: Trait bounds

A generic function `fn f<T: Ord>(x: T)` requires `T : Ord`.  At a
call site, sema checks that the inferred `T` (e.g., `int`) has an
impl of `Ord`.

**Lemma (Bound-Satisfaction).**  For a generic call `f(v)` with
`v : T_concrete` and `f` declared with bound `T : Trait`, the
registry has an impl of `Trait` for `T_concrete` (or a generic impl
that matches `T_concrete`).

Proof: sema checks this at the call site.  If no impl is found,
sema rejects the call with "trait bound not satisfied".  ✓.

### Step 7: Super-traits

A trait `Sub : Super` requires that any `impl Sub for T` also
provides all of `Super`'s methods (or inherits them from `impl
Super for T`).

**Lemma (Super-Trait-Soundness).**  If `impl Sub for T` exists and
`Sub : Super`, then `T : Super` (either via a direct `impl Super
for T` or via the `Sub` impl providing `Super`'s methods).

Proof: sema checks at `impl Sub for T` declaration time that all
`Super`'s methods are provided (either by the `Sub` impl or by an
existing `Super` impl).  ✓.

## Assumptions

1. The orphan rule is approximated (globally unique, not
   crate-relative).  v2 will add crate-relative orphan checks.
2. No specialization (the first impl wins; later, more-specific
   impls are not preferred).  v2 will need a proper specialization
   coherence check.
3. No higher-kinded types (HKT).  Associated types are first-class
   but cannot themselves be parameterized by other types.
4. No GATs (generic associated types).  `type Item<T>` is not
   supported; only `type Item;`.
5. Unification is total (terminates with at most one substitution
   or fails).  This is standard for Hindley-Milner.

## Key lemmas

1. **Registry-Uniqueness**: at most one impl per mangled name.
2. **Unification-Determinism**: at most one substitution per
   unification.
3. **No-Ambiguous-Resolution**: `resolve` returns at most one impl.
4. **Object-Safety-Soundness**: `dyn Trait` works for object-safe
   traits.
5. **Bound-Satisfaction**: trait bounds are checked at call sites.
6. **Super-Trait-Soundness**: super-traits' methods are provided.

## What's mechanized vs hand-waved

- **Mechanized** (in future Coq/Lean work): the uniqueness
  invariant (a Map with check-on-insert is straightforward to
  model).  The case-by-case resolution proof.  Estimated Coq
  effort: ~5000 lines.
- **Hand-waved**: the unification algorithm's correctness (standard
  Robinson, but mechanizing it requires significant infrastructure).
  The sema layer's bound-checking and super-trait-checking (depends
  on the type representation and the trait registry).
  The orphan-rule approximation (v1's limitation, documented).

## Conclusion

Trait coherence is the central guarantee of Aether's trait system.
The proof reduces to:

1. Registry-Uniqueness: at most one impl per (trait, type) pair.
2. Unification-Determinism: at most one substitution per
   unification.
3. No-Ambiguous-Resolution: `resolve` returns at most one impl.

The v1 limitations (orphan-rule approximation, no specialization,
no HKT, no GATs) are documented; v2 will address them.

The proof is paper-style; full mechanization is future work.  The
key lemmas are local invariants of the registry and the unification
algorithm; the theorems are global consequences (no ambiguous
resolution).

Together with type preservation (`01-type-preservation.md`) and
progress (`02-progress.md`), trait coherence ensures that
well-typed Aether programs with traits have unambiguous method
dispatch and don't go wrong.
