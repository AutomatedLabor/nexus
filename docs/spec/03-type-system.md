# 03 — Type System

> **Status:** 🧪 Experimental
> **Subsystem:** `aether/core/types`, `aether/core/sema`, `aether/core/checker`
> **Spec version:** 0.1

This section specifies Aether's static type system: what types exist,
how they relate, and what the inference algorithm guarantees.

## 1. Type categories

```
Type ::= Primitive | Function | Tuple | Array | Slice | Map | Set
       | Named | Generic | Reference | TraitObject | Never | Infer
```

### 1.1 Primitive types

| Type | Description | Width | Default value |
|------|-------------|-------|---------------|
| `Int` (`i64`) | signed machine integer | 64-bit | — (no implicit init) |
| `Uint` (`u64`) | unsigned machine integer | 64-bit | — |
| `i8` `i16` `i32` `i64` `isize` | signed fixed-width | — | — |
| `u8` `u16` `u32` `u64` `usize` | unsigned fixed-width | — | — |
| `Float` (`f64`) | IEEE 754 double | 64-bit | — |
| `f32` | IEEE 754 single | 32-bit | — |
| `Bool` | boolean | 1 byte (`0`/`1`) | — |
| `Char` | Unicode scalar value | 4 bytes | — |
| `String` | UTF-8 string | variable | `""` |
| `Bytes` | byte buffer | variable | `b""` |
| `Unit` (`()`) | the unit type | 0 bytes | `()` |

Integer widths narrower than the default widen to `Int`/`Float` only
when explicitly cast. Arithmetic on narrower widths wraps on overflow
in release builds and panics in debug builds. `Int`/`Float` arithmetic
panics on overflow in debug, and is defined to wrap (for `Int`) or
saturate (for `Float`) in release; `checked_*` methods are provided
for explicit handling (see [§12 stdlib::num](./12-stdlib.md)).

### 1.2 Function types

```
FnType    ::= "fn" "(" ParamList? ")" ("->" Type)? ("async")?
ParamList ::= Param ("," Param)*
Param     ::= Type | Identifier ":" Type
```

- `fn(Int, String) -> Bool` is the type of a synchronous function.
- `async fn(Int) -> String` is the type of an async function; it is
  sugar for `fn(Int) -> Future<String>`.
- A function type with no return type is `fn(...) -> Unit`.
- Function types are **contravariant** in their parameter types and
  **covariant** in their return type. They are nominally subtyped
  only via `&` references and trait objects; function types otherwise
  use invariance for captured lifetimes (which Aether does not have,
  so this is moot in 0.1).

### 1.3 Tuples

```
TupleType ::= "(" Type ("," Type)+ ","? ")"
```

- `(Int, String)` is a 2-tuple.
- `(Int,)` is a 1-tuple; `(Int)` is just `Int`. The trailing comma is
  permitted for the 1-tuple and forbidden for the 0-tuple.
- `()` is the unit type, not the empty tuple.
- Tuples are structural: `(Int, String)` and `(Int, String)` are the
  same type. Field access is by position: `t.0`, `t.1`.

### 1.4 Arrays, slices, maps, sets

```
ArrayType ::= "[" Type ";" IntLit "]"
SliceType ::= "[" Type "]"
MapType   ::= "{" Type ":" Type "}"
SetType   ::= "{" Type "}"
```

- `[T; N]` is a fixed-size array of `N` elements of type `T`. `N` is
  a compile-time constant.
- `[T]` is a slice — a reference to a contiguous run of `T`. Array
  types coerce to slice types.
- `{K: V}` is a hash map from `K` to `V`, requiring `K: Hash + Eq`.
- `{T}` is a hash set of `T`, requiring `T: Hash + Eq`.

### 1.5 Named types

A named type is introduced by a `type`, `struct`, `enum`, or `trait`
declaration. Named types are **nominal**: two `struct`s with
identical fields are distinct types.

### 1.6 Generic types

```
GenericType ::= Identifier "<" TypeList ">"  // user-facing
TypeList    ::= Type ("," Type)*
```

- `List<Int>` is an instantiation of `List` with `Int`.
- A type parameter without an explicit bound is unconstrained; an
  explicit bound is written `T: Trait` (see §4.2).
- Aether uses **monomorphization** for generics by default: each
  instantiation of a generic function or type is compiled separately.
  Trait objects (§4.5) are the dynamic-dispatch escape hatch.

### 1.7 References

```
Reference ::= "&" Type | "&mut" Type
```

- Aether has no ownership system in the Rust sense — the GC owns all
  heap data. `&T` and `&mut T` are **borrow references**: lightweight
  pointers that the borrow checker (§6.4) verifies do not outlive the
  borrowed value and do not alias in a way that violates the
  read-many / write-one discipline.
- `&mut` does **not** transfer ownership; it asserts exclusive
  access for the duration of the borrow. A function returning `&mut`
  to GC-managed memory is fine, but the borrow must end before any
  GC safe point that could invalidate the alias.

### 1.8 Trait objects

```
TraitObject ::= "dyn" TraitRef
TraitRef    ::= Path ("<" TypeList ">")?
```

- `dyn Draw` is the type of a value of any type `T` that implements
  `Draw`, accessed through a vtable. Trait objects are always passed
  by reference; `dyn Trait` is shorthand for `&dyn Trait` and is the
  only object-safe form. See §4.5.

### 1.9 Never type

The type `!` (never) is the type of expressions that do not return a
value: `return`, `break`, `continue`, `raise`, `panic!(...)`,
`unreachable!()`, and infinite loops. `!` coerces to any other type,
so `let x = return 5;` is well-typed at any expected type.

### 1.10 Infer

The placeholder `_` is a type that asks the type checker to infer the
type at this position. `let x: _ = 5;` is permitted but discouraged;
the checker is required to flag `_` at a position where it cannot
infer a type with error `E1001`.

## 2. Built-in generic types

The prelude (see §6) provides:

- `Option<T>` — `enum Option<T> { None, Some(T) }`
- `Result<T, E>` — `enum Result<T, E> { Ok(T), Err(E) }`
- `List<T>` — a growable array, equivalent to `std::collections::List<T>`
- `Future<Output>` — a future value produced by `async`
- `Channel<T>` — an async channel, see [§07 4.3](./07-functions-closures-async.md#channels)
- `JoinHandle<T>` — a handle returned by `spawn`, see §07.
- `Range<T>` — `start..end`, `start..=end`, see [§04 7 Ranges](./04-expressions.md#ranges).

## 3. User-defined types

### 3.1 Type aliases

```aether
type UserId = u64;
type Pair<T> = (T, T);
```

A type alias is a *transparent* synonym. The aliased type and the alias
are interchangeable for subtyping, trait conformance, and pattern
matching. Aliases may be generic. An alias to a generic type may fix
some parameters:

```aether
type IntList = List<Int>;
```

### 3.2 Structs

```aether
struct Point { x: Float, y: Float }
struct Tree<T> {
    value: T,
    children: List<Tree<T>>,
}
```

- Structs have named fields. Tuple-structs are *not* supported; use a
  tuple type instead. (Q-STRUCT-1: re-evaluate for 0.2.)
- A struct with no fields (`struct Empty {}`) is allowed and is
  inhabited by exactly one value (`Empty {}`).
- Field types must be sized (i.e. not `dyn Trait` without `&`).
- A field may be `pub` to expose it outside the module; by default
  fields are private to the declaring module.

### 3.3 Enums (algebraic data types)

```aether
enum Shape {
    Circle(Float),                 // tuple variant
    Square { side: Float },        // struct variant
    Rect { w: Float, h: Float },
    Empty,
}

enum List<T> {
    Nil,
    Cons(T, Box<List<T>>),
}
```

- An enum variant is one of: a unit variant (`Empty`), a tuple
  variant (`Circle(Float)`), or a struct variant (`Rect { ... }`).
- Variants are accessed as `Shape::Circle`, `Shape::Square`, etc.
- Variants of a generic enum are themselves generic in the enum's
  parameters; `List::Cons(1, ...)` instantiates `T = Int`.
- Recursive enums require indirection: `Box<T>` is the standard
  heap-boxed pointer (see §6.3). The compiler rejects directly
  recursive enum variants with error `E1010`.

### 3.4 Traits

A trait is a set of method signatures and, optionally, default
implementations:

```aether
trait Display {
    fn to_string(&self) -> String;
}

trait Ord<T> : Eq<T> {
    fn cmp(&self, other: &T) -> Ordering;
    fn lt(&self, other: &T) -> Bool { self.cmp(other) == Less }
}
```

- A trait may declare **required** methods (no body) and **default**
  methods (with a body).
- A trait may declare **super-traits** (`: Eq<T>` above); implementing
  `Ord<T>` requires `Eq<T>` to also be implemented.
- A trait may declare **associated types** and **constants**:
  ```aether
  trait Iterator {
      type Item;
      fn next(&mut self) -> Option<Self::Item>;
  }
  ```
- A trait may be **sealed** to the declaring module, preventing
  out-of-crate implementations (see §5).

### 3.5 Implementations

```aether
impl Display for Point {
    fn to_string(&self) -> String {
        format("({x}, {y})", x = self.x, y = self.y)
    }
}
```

- `impl Trait for Type` provides the required methods of `Trait` for
  `Type`. Default methods may be overridden.
- `impl Type { ... }` defines inherent methods on `Type`, not
  associated with any trait.
- Generic impls are permitted:
  ```aether
  impl<T: Display> Display for List<T> { ... }
  ```

## 4. Subtyping and coercion

Aether has a deliberately small subtyping relation:

```
T <: T                                  (reflexive)
! <: T                                  (never)
&T <: &U                  if T <: U      (covariant ref)
&mut T <: &mut U          if T == U      (invariant)
dyn A <: dyn B            if A <: B      (trait objects)
fn(T) -> U <: fn(T') -> U' if T' <: T, U <: U'   (function)
```

All other types are *invariant*. There is no implicit numeric
widening; use explicit `as` casts (§4.1 of [§04](./04-expressions.md)).

## 5. Bounds and where-clauses

Generic declarations constrain their type parameters with bounds:

```aether
fn max<T: Ord>(a: T, b: T) -> T { if a < b { b } else { a } }

fn merge<T>(xs: List<T>, ys: List<T>) -> List<T>
where T: Ord + Clone
{
    // ...
}
```

- `T: Ord` requires `T` to implement `Ord`.
- `T: Ord + Clone` is a conjunction.
- `where` clauses are equivalent to inline bounds and are preferred
  when bounds are non-trivial.
- A `+` bound may also include `?Sized` (allow unsized, used only in
  trait-object context) and `'static` (no non-static captures; trivially
  true since Aether has no lifetimes — reserved for forward compat).

## 6. Inference algorithm

### 6.1 Bidirectional inference

Aether uses a **bidirectional** type inference algorithm (a la Pierce &
Turner), with rank-1 generalization for top-level `let` bindings. The
algorithm has two judgments:

- `Γ ⊢ e ⇐ τ` — *check* expression `e` against expected type `τ`.
- `Γ ⊢ e ⇒ τ` — *synthesize* a type `τ` for expression `e`.

The two judgments interlock: synthesis may fall back to checking via
an *expected-type-driven* insertion of coercions and default
substitutions; checking may fall back to synthesis when the expected
type is not informative (e.g. for literals).

### 6.2 Generalization

After type-checking a top-level `let`-bound function with no explicit
type annotations, the checker generalizes all unconstrained type
variables to universally-quantified variables:

```aether
let id = |x| x;        // inferred: fn<T>(T) -> T
```

Generalization is rank-1: a generalized type may not itself contain
quantified types under arrows. Rank-N is rejected with error `E1005`.

### 6.3 Definite assignment

Every local must be definitely assigned before use on every control
flow path. Uninitialized `let` is permitted:

```aether
let x: Int;
if cond { x = 1; } else { x = 2; }
println(x);          // OK: x is definitely assigned on both branches
```

Use before assignment is error `E1011`.

### 6.4 Borrow checking

Aether has a **lightweight** borrow checker that enforces only:

- A `&mut T` borrow of a local must end before any subsequent move of
  that local to a closure that may outlive the borrow. Since the GC
  owns all values, "move" here means "capture by a closure or pass to
  a `spawn`", not a heap move.
- A `&mut T` borrow and a `&T` borrow of the same local may not
  overlap in time.
- A `&T` borrow may overlap with other `&T` borrows.

The checker does not enforce Rust-style aliasing of heap data;
that's the GC's job. The goal is to catch *obvious* foot-guns, not to
be a full ownership system.

### 6.5 Trait conformance

The checker verifies that every `impl Trait for Type` provides all
required methods, that default-method overrides have compatible
signatures, and that the impl satisfies the trait's bounds. The
checker also detects **orphan-rule** violations: an `impl` outside
the module that declared either the trait or the type is rejected
with `E1020`, unless the impl is in the module that declares the
type (orphan rule by type) or the trait is marked `#[fundamental]`.

### 6.6 Exhaustiveness

`match` expressions must cover every possible value of the scrutinee
type. The checker computes usefulness of each arm and reports an
error if any arm is unreachable (`E1030`) or if the match is not
exhaustive (`E1031`). See [§04 8 Match](./04-expressions.md#match).

## 7. Builtin traits

The prelude declares the following traits. Their semantics are
specified here so that user code can rely on them; their
implementations are provided for primitive types and (where
appropriate) for generic collection types by `aether/stdlib`.

| Trait | Signature | Provided for |
|---|---|---|
| `Eq`      | `fn eq(&self, other: &Self) -> Bool`             | primitives, `String`, tuples, arrays up to 12 |
| `Ord`     | `fn cmp(&self, other: &Self) -> Ordering`         | primitives, `String` |
| `Hash`    | `fn hash(&self, state: &mut Hasher)`              | primitives, `String` |
| `Clone`   | `fn clone(&self) -> Self`                         | primitives, all `#[derive]`-able types |
| `Display` | `fn to_string(&self) -> String`                  | primitives, `String`, `Option`, `Result` |
| `Debug`   | `fn fmt(&self, f: &mut Formatter) -> Unit`        | primitives, all `#[derive]`-able types |
| `Default` | `fn default() -> Self`                            | primitives (zero value), `String`, `Vec` |
| `Iterator`| `type Item; fn next(&mut self) -> Option<Self::Item>` | collections, ranges |
| `FromStr` | `fn from_str(s: &str) -> Result<Self, ParseError>`| primitives, `String`, `Path` |
| `IntoIter`| `fn into_iter(self) -> Self::IntoIter`            | collections |
| `Drop`    | `fn drop(&mut self)`                              | opt-in; finalizers (see [§11](./11-memory-and-gc.md)) |
| `Send`    | (marker)                                          | most types except `Rc`, `Cell`, `RefCell` |
| `Sync`    | (marker)                                          | most types except `Rc`, `Cell`, `RefCell` |
| `Sized`   | (marker)                                          | everything by default; `?Sized` opts out |

The `derive` macro generates `Eq`, `Ord`, `Hash`, `Clone`, `Display`,
`Debug`, `Default` for user types whose fields all implement them.

## 8. Conformance

A conformant type checker MUST:

- accept every program whose types are consistent under the inference
  algorithm above,
- reject every program that has a type error, with a diagnostic whose
  code is one of `E1000`–`E1099`,
- infer the same types for the same program regardless of declaration
  order within a module (i.e. inference is order-independent),
- complete in time polynomial in the size of the program (in the
  absence of pathological `where` clauses).

The checker MAY report warnings (`W1000`–`W1099`) for code that is
well-typed but suspicious (e.g. `let _ = x;` immediately followed by
`return`).
