# ADR-18 — Trait coherence forbids orphan impls

> Status: Accepted
> Date: 2026-11-12
> Decision-maker: Aether core team
> Related: [Chapter 11 traits and impls](../book/ch11-traits-and-impls.md), [Formal proof 04 trait coherence](../formal/proofs/04-trait-coherence.md), [ADR-02 nominal types structural functions](adr-02-nominal-types-structural-functions.md)

## Context

Aether v3 introduces a trait system (in `aether/core/traits/`, ~691 LOC) — the language mechanism for ad-hoc polymorphism. A trait is a set of method signatures; a type implements the trait by providing the methods; generic functions constrain their type parameters with trait bounds. The v3 trait system supports `Ord`, `Eq`, `Show`, `Iterator`, plus the `#[derive]` attribute, the `dyn` keyword, super-traits, and associated types. See Chapter 11 for the full design.

The central design question for any trait system is the *coherence* rule — the rule that determines which `impl` blocks are allowed and which are rejected. Without a coherence rule, two packages could both implement the same trait for the same type, and the compiler couldn't decide which one to use. This is the "orphan impl" problem.

Aether v3 had to choose between three options:

1. **Allow orphan impls, last-wins.** Any package can implement any trait for any type. If two packages implement the same trait for the same type, the last-loaded one wins. Pros: maximum flexibility. Cons: implicit dependencies between packages (package A's behavior depends on whether package B is loaded); hard-to-debug conflicts; "trait coherence" is unsound in general.
2. **Allow orphan impls, but with explicit conflict resolution.** Any package can implement any trait for any type. If a conflict occurs, the user must write a "disambiguation" declaration (`use PackageA::Show for int;`). Pros: flexibility + explicit conflict resolution. Cons: the disambiguation declarations propagate through the dependency graph, leading to a tangled mess.
3. **Forbid orphan impls (the Rust rule).** An `impl Trait for Type` must live in the same module as either the trait or the type. If you want to implement someone else's trait on someone else's type, you must wrap the type in a newtype that you own. Pros: coherence is decidable; no implicit dependencies; the dependency graph is clean. Cons: less flexible; the newtype dance is annoying.

The constraints on the decision were:

- **Decidability.** The compiler must be able to decide, for any `impl` block, whether it's allowed, and for any call site, which `impl` block is used. This must hold across multiple packages, with no global registry. Option 1 (last-wins) is decidable per-call but not per-program (the "last" depends on load order); option 3 (forbid orphans) is decidable per-impl and per-call.
- **Predictability.** When the user writes `Show for int`, they should know whether the compiler will accept it. Option 1 is unpredictable (depends on what other packages are loaded). Option 3 is predictable (the impl is accepted iff it's in the same module as `Show` or `int`).
- **No global registry.** Aether packages don't have a global registry of impls (the v3.2 package registry, RFC-012, is a future item). Even with a registry, the registry doesn't enforce coherence; the compiler does. The coherence rule has to be local: an `impl` is rejected iff it's an orphan, regardless of what other packages exist.
- **Implementation simplicity.** The v3 trait system had to ship in a sprint. The orphan-rule check is a few hundred lines (the compiler checks, for each `impl`, whether the trait or the type is defined in the current module). Option 2 (disambiguation declarations) is much more complex (the compiler has to track all uses of all impls and propagate disambiguation).

## Decision

**Aether v3 forbids orphan impls.** An `impl Trait for Type` must live in the same module as either the trait or the type. The check is at the `impl` block, not at the use site.

The rule, stated precisely:

> An `impl<T...> TraitName<TypeArgs> for TypeName` is allowed iff at least one of the following holds:
> 1. `TraitName` (with its `TypeArgs`) is defined in the same module as the `impl` block.
> 2. `TypeName` is defined in the same module as the `impl` block.

Equivalently: an `impl` is *rejected* iff both the trait and the type are defined in other modules. The rejected `impl` is an "orphan" — it has no parent in the current module.

The newtype workaround: if you want to implement someone else's trait on someone else's type, you wrap the type in a new type that you own, then implement the trait on the new type:

```aether
// Package a defines MyTrait; package b defines TheirType.
// Package c wants MyTrait for TheirType — forbidden.

// Workaround in package c:
struct MyWrapper { inner: TheirType }
impl MyTrait for MyWrapper {
  fn foo(self) -> int { /* delegate to self.inner */ }
}
```

The newtype costs one wrapping/unwrapping at the API boundary, but it's local — it doesn't affect other packages. This is the Rust pattern (the `Deref` trait makes it ergonomic); Aether doesn't yet have `Deref` (it's a v3.1 item).

The error message names the trait, the type, and the modules that own each. The user sees exactly what to move where:

```
error: orphan impl
  impl Show for int  -- this is rejected
  because:
    trait `Show` is defined in module `aether/stdlib/traits`
    type  `int`   is defined in module `aether/core/builtin`
    the impl is in module `mypackage/myfile`
  hint: wrap `int` in a newtype defined in `mypackage/myfile`
        and implement Show on the newtype.
```

## Alternatives considered

### Allow orphan impls, last-wins

Maximum flexibility. Any package can extend any type with any trait. Pros: extremely powerful; libraries can extend the stdlib without forking it. Cons:

- **Implicit dependencies.** Package A's behavior depends on whether package B is loaded. If B is loaded, A's `Show for int` is hidden; if not, A's is used. This makes A's behavior depend on B's presence — a non-local, hard-to-debug dependency.
- **Conflicts.** If both A and B implement `Show for int`, which one is "last"? It depends on the order packages are listed in `aether.toml`. The user has to manage this manually.
- **Coherence unsoundness.** Without a coherence rule, the compiler can't prove that an `impl` is unique. This breaks the trait-coherence formal proof (proof 04 in the formal corpus). The proof depends on the orphan rule.

This option is rejected for v3. It might be revisited for v4 if a soundness-preserving extension is found (e.g., Haskell's "orphan instances with a global uniqueness check" — but Haskell's check is famously expensive).

### Allow orphan impls with explicit disambiguation

Any package can implement any trait for any type. Conflicts are resolved by the user writing `use PackageA::Show for int;` at the use site. Pros: flexibility + explicit resolution. Cons:

- **Disambiguation declarations propagate.** If A and B both `impl Show for int`, every file that uses `Show` on `int` must disambiguate. The disambiguation is repeated at every use site, or hoisted into a `use` block, which then has to be repeated in every file.
- **Coherence is undecidable without a global analysis.** The compiler has to scan the entire program to find all impls of `Show for int`, then check that the user's disambiguation resolves to exactly one. This breaks separate compilation.
- **Trait resolution becomes ambiguous.** When a generic function `f<T: Show>(x: T)` is called with `int`, the compiler has to look at all visible `Show for int` impls and pick one. Without a coherence rule, "pick one" requires a disambiguation declaration at the call site, which propagates up the call stack.

This is the Haskell approach (with the `UndecidableInstances`/`OverlappingInstances` extensions). It works in Haskell because of Haskell's global analysis, but it's a poor fit for Aether's separate-compilation model.

### Forbid orphan impls (the Rust rule) — accepted

Decidability, predictability, no global registry, simple implementation. The newtype workaround is annoying but local. This is the rule Rust uses (since 1.0), and it's worked at scale (the Rust ecosystem has ~100K crates, all without orphan-impl conflicts). For Aether v3 — a research language with a smaller ecosystem — the same rule is appropriate.

## Consequences

### Positive

- **Decidability.** The compiler can decide, for any `impl` block, whether it's allowed, by a local check (is the trait or the type in the current module?). No global analysis required.
- **Predictability.** When the user writes `impl Show for int`, they know whether it'll be accepted, by looking at where `Show` and `int` are defined. No surprises from other packages.
- **Soundness.** The trait-coherence formal proof (proof 04) goes through: there is at most one `impl Trait for Type` for any (trait, type) pair, so trait resolution is a function (not a relation), and the type-safety proof (proof 01) doesn't have to handle ambiguity.
- **No implicit dependencies.** A package's behavior depends only on its own code and its explicit dependencies (via `import`). No "trait leakage" from one package to another.
- **Implementation simplicity.** The check is a few hundred lines (in `aether/core/traits/coherence.ts`). The error messages are clear. The user knows what to do.

### Negative

- **The newtype dance.** If you want to implement someone else's trait on someone else's type, you wrap in a newtype. The wrapping costs an allocation (or at least a constructor call) and an unwrapping at the API boundary. This is annoying for adapters, wrappers, and "extension trait" patterns.
- **No "blanket impls" across packages.** A blanket impl is `impl<T> MyTrait for T where T: OtherTrait`. If `MyTrait` and `OtherTrait` are in different packages, the blanket impl is an orphan and is rejected. This limits some adapter patterns.
- **No retroactive extension.** You can't add a trait to an existing type without either owning the trait or owning the type. This is by design (it's what makes coherence decidable), but it's a real limitation. The newtype workaround is the escape hatch.
- **No `Deref`-style ergonomics (yet).** Rust's newtype pattern is ergonomic because of `Deref` (auto-deref through the newtype). Aether v3 doesn't have `Deref` (it's a v3.1 item), so the newtype pattern is more verbose.

### Mitigations

- For the newtype dance: the `#[derive]` attribute (Chapter 11 §11.6) reduces the boilerplate for derived traits. For hand-written impls, the newtype is a one-time cost.
- For the no-blanket-impls: a future "coherence exception" mechanism (v3.2 or v4) could allow blanket impls in specific cases (e.g., the stdlib's blanket `impl<T: Show> ToString for T`). The exception mechanism would have to be sound (which is non-trivial); the v3 design doesn't include it.
- For the no-`Deref`: the v3.1 plan is to add `Deref` (RFC under discussion), which will make the newtype pattern ergonomic.

## Reversibility

This decision is **reversible in principle but not in practice**. The orphan rule is a soundness-critical part of the trait system; relaxing it requires re-doing the trait-coherence formal proof (proof 04). If a soundness-preserving extension is found (e.g., specialization, which Rust is still figuring out), v4 might relax the rule. For v3 and v3.x, the rule stays.

## Cross-references

- [Chapter 11 traits and impls](../book/ch11-traits-and-impls.md) §11.4 — the chapter walkthrough of coherence.
- [Formal proof 04 trait coherence](../formal/proofs/04-trait-coherence.md) — the formal proof that depends on this rule.
- [ADR-02 nominal types structural functions](adr-02-nominal-types-structural-functions.md) — the v1 decision to use nominal types, which is what makes the orphan rule well-defined (the "owner" of a type is the module that declared it).
- [RFC-012 package registry](../rfcs/rfc-012-package-registry.md) — the v3.2 package registry, which inherits the coherence rule (packages can't publish orphan impls).
