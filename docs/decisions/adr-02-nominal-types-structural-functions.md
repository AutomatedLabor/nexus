# ADR-02 — Nominal types, structural functions

> Status: Accepted
> Date: 2023-09-15
> Decision-maker: Aether core team
> Supersedes: none
> Superseded by: none

## Context

Aether v1 had to pick a *type identity* rule: when are two types "the same"? The choice has implications for type checking, pattern matching, ergonomics, and the surface feel of the language.

Two main options:

1. **Nominal typing.** Two types are the same iff they have the same name. Two `struct`s with identical fields are distinct types. This is the Rust, Swift, and OCaml approach.
2. **Structural typing.** Two types are the same iff they have the same structure (the same fields, the same variants). Two `struct`s with identical fields are the same type. This is the TypeScript and Go interface approach.

The decision was not all-or-nothing: a language can have nominal *named* types and structural *anonymous* types. Aether ends up with a hybrid: nominal for `struct` and `enum`, structural for tuples, arrays, maps, and function types.

The constraints on the decision were:

- **Implementation cost.** Pure nominal typing requires every type to be declared and named, which is awkward for tuples and function types (you'd need a `type` alias for every `(int, int)` you use). Pure structural typing requires the type checker to compare structures everywhere, which is more expensive but conceptually simpler. A hybrid keeps both costs down.
- **Ergonomics.** Common case (tuples, functions) should "just work" without boilerplate. Rare case (defining a domain model with named types) should support encapsulation.
- **Pattern matching.** Match patterns on `enum` and `struct` need to know the *type name* to dispatch. Structural typing alone can't tell `Option::Some(42)` from `Result::Ok(42)` — they have the same shape (`{ variant: "Some" | "Ok", data: [42] }`).
- **Forward-compatibility with v2.** v2 adds traits, which are structural ("a value implements a trait iff it has the right methods"). v1's hybrid leaves room for this.

## Decision

**Aether v1 uses nominal typing for `struct` and `enum`, and structural typing for tuples, arrays, maps, and function types.**

Concretely:

- `struct Point { x: int, y: int }` and `struct Coord { x: int, y: int }` are *distinct* types. A function expecting a `Point` will reject a `Coord`.
- `(int, int)` and `(int, int)` are *the same* type. A function expecting an `(int, int)` will accept any tuple of two `int`s.
- `fn(int) -> int` and `fn(int) -> int` are the same type. A function expecting an `fn(int) -> int` will accept any function with that signature.
- `enum Option<T> { Some(T), None }` is nominally distinct from any user-defined enum with the same variants.
- `map[string]int` is structural: any two maps with the same key and value types are the same type.

The implementation is in `aether/core/types/types.ts` — `typeEq` does a kind-by-kind comparison, and the type checker's `checkTypeEq` (in `aether/core/sema/sema.ts`) follows the same rule. For `Struct` and `Enum`, the comparison includes the `name` field; for `Tuple`, `Array`, `Map`, `Func`, it does not.

## Alternatives considered

### All nominal (Rust-style)

Everything is nominal: tuples, functions, and arrays would all need names. This is the Rust approach (modulo the built-in primitives). The cost: heavy. You would need a `type` alias for every tuple shape you use, and the syntax gets noisy fast. Rust gets away with this because tuples are rare in idiomatic Rust; Aether uses them more (e.g., returning `(value, error)` pairs, destructuring in `match`).

### All structural (TypeScript-style)

Everything is structural: `struct`s with the same fields are interchangeable. This is the TypeScript approach. The benefit: lightweight, easy to refactor, no need to think about identity. The cost: weak encapsulation. Two unrelated modules can accidentally define `Point` and have their values silently flow between them. More importantly, structural typing alone can't distinguish enum variants: `Option::Some(42)` and `Result::Ok(42)` would be the same type, breaking pattern matching.

### Hybrid (the chosen approach)

Nominal for `struct`/`enum` (so you can build a domain model with named types and so pattern matching works), structural for tuples/functions (so the ergonomics stay light). This is what ML does (e.g., OCaml has nominal variant types and structural tuples/records depending on age), and it is what Aether does.

## Consequences

### Positive

- **Strong encapsulation.** Two `struct`s with the same fields are distinct types. This catches mistakes like passing a `UserId` where a `PostId` is expected (in v2, when newtypes are added; in v1, type aliases are transparent).
- **Lightweight tuples and functions.** You do not need a `type` alias to use a `(int, int)` or an `fn(int) -> int`. The types are inferred and structural.
- **Pattern matching works.** Because `enum` is nominal, `match Option::Some(42) { Result::Ok(_) => ... }` is a type error (the scrutinee's type `Option<int>` does not match the pattern's type `Result<_, _>`). The sema reports `pattern expects result<_, _>, scrutinee is option<int>`.
- **Familiar to ML/Rust programmers.** The shape is the one most Aether users will recognize.
- **Forward-compatible with v2 traits.** Traits can be structural (a value implements a trait iff it has the right methods); the v2 design uses this.

### Negative

- **`struct` identity is sometimes awkward.** If you want to "rename" a struct, you need a `type` alias (which is transparent in v1). v2 will add newtype wrappers.
- **Two type systems in one language.** The split between nominal and structural has to be learned. The rule ("struct/enum nominal; tuple/array/map/fn structural") is short but unobvious to a newcomer.
- **`map[string]int` is structural.** Two maps with the same key and value types are the same type. This is what you want, but it is a different rule from `struct`.
- **Type aliases are transparent.** `type Age = int;` doesn't create a new type; `Age` and `int` are interchangeable. This is the price of v1's simplicity. v2 will add newtypes.

## Mitigations

- The [../tutorials/types-and-generics.md](../tutorials/types-and-generics.md) tutorial explicitly walks through which types are nominal and which are structural.
- The [../guides/migration-from-typescript.md](../guides/migration-from-typescript.md) guide calls out the difference for TypeScript users, who expect structural typing everywhere.
- The v2 plan adds newtype wrappers for cases where nominal identity matters even for primitive types (`UserId = int` becomes a distinct type, not just an alias).

## Reversibility

The decision is **mostly reversible**. Switching to all-structural would be a breaking change but small in code terms (the sema's `checkTypeEq` would change to ignore names). Switching to all-nominal would be a bigger breaking change (tuples and functions would need to be re-thought).

The v2 plan does not propose either change. The hybrid is working.

## Cross-references

- [../spec/03-type-system.md](../spec/03-type-system.md) §1.5 — the spec section for nominal types.
- [../tutorials/types-and-generics.md](../tutorials/types-and-generics.md) — the type system in depth.
- [../guides/migration-from-typescript.md](../guides/migration-from-typescript.md) — the structural-to-nominal shift for TS migrants.
- [../guides/migration-from-rust.md](../guides/migration-from-rust.md) — the same-shape types for Rust migrants.
- [../reference/glossary.md](../reference/glossary.md) — terms "nominal typing", "structural typing", "ADT" defined.
