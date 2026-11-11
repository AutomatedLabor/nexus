# 05 — Statements & Declarations

> **Status:** 🧪 Experimental
> **Subsystem:** `aether/core/ast`, `aether/core/parser`
> **Spec version:** 0.1

Statements glue expressions together. In Aether the distinction is
small: most things are expressions, and a *statement* is either a
declaration that introduces a name into scope, or an expression whose
value is intentionally discarded.

## 1. Grammar

```
Stmt        ::= DeclStmt | ExprStmt | EmptyStmt
EmptyStmt   ::= ";"
ExprStmt    ::= Expr ";"?                          // ; required iff ambiguous
DeclStmt    ::= LetStmt | ConstStmt | FnDecl | TypeDecl | StructDecl
              | EnumDecl | TraitDecl | ImplDecl | ModDecl | UseDecl | ExternDecl

LetStmt     ::= "let" Pattern (":" Type)? ("=" Expr)? ";"?
ConstStmt   ::= "const" Identifier (":" Type)? "=" Expr ";"
FnDecl      ::= "fn" Identifier GenericParams? "(" ParamList? ")"
                  ("->" Type)? ("async")? WhereClause? Block ";"?
TypeDecl    ::= "type" Identifier GenericParams? "=" Type ";"
StructDecl  ::= "struct" Identifier GenericParams? "{" FieldList? "}" ";"
EnumDecl    ::= "enum" Identifier GenericParams? "{" VariantList? "}" ";"
TraitDecl   ::= "trait" Identifier GenericParams? (":" SuperList)? "{" TraitItem* "}" ";"
ImplDecl    ::= "impl" GenericParams? TraitRef? "for" Type "{" ImplItem* "}" ";"
ModDecl     ::= "mod" Identifier ("{" ItemList "}" | ";")
UseDecl     ::= "use" UseTree ";"
ExternDecl  ::= "extern" "fn" Identifier "(" ParamList? ")" ("->" Type)? ";"   // FFI (§14)
```

## 2. `let` bindings

```
LetStmt ::= "let" Pattern (":" Type)? ("=" Expr)? ";"?
```

- A `let` introduces one or more bindings via pattern destructuring.
  Patterns are specified in [§08 §4](./08-error-handling.md#patterns).
- A `let` with an initializer assigns the value; a `let` without one
  declares an uninitialized local that must be definitely assigned
  before use (see [§03 6.3](./03-type-system.md#definite-assignment)).
- An optional type annotation constrains inference.
- `let` is non-reassignable by default: `let x = 5;` declares an
  *immutable* binding. To declare a mutable binding, use `let mut`:

  ```aether
  let mut x = 0;
  x = x + 1;        // OK
  ```

- A `let` that shadows a previous binding of the same name in the
  same scope is allowed, but produces a warning `W1010` if the shadowed
  binding is still live (i.e. used afterward) to catch typos.

```aether
let (a, b) = (1, 2);
let Point { x, y } = origin;
let mut counter: Int = 0;
```

## 3. `const` items

```
ConstStmt ::= "const" Identifier (":" Type)? "=" Expr ";"
```

- A `const` declares a compile-time constant. The initializer is
  evaluated at compile time and must be a *constant expression*:
  literals, references to other `const` items, and a small set of
  pure functions (`const fn`, see §3.1).
- `const` items have no fixed address; they are inlined at use sites
  for primitives, and interned for `String` / `Bytes` constants.
- A `const` declared inside a function is scoped to that function.

### 3.1 `const fn`

A function declared with `const fn` may be called at compile time.
The body of a `const fn` is restricted to:

- no allocation, no async, no spawning,
- no panicking constructs reachable on any input,
- no I/O,
- only calls to other `const fn`s and pure stdlib functions on the
  `const-allow` list (the operators `+ - * / %`, `== < <= > >=`,
  `if`, `match`, `let`).

The compiler is permitted to evaluate `const fn` calls at runtime
instead, in which case the same restrictions do not apply.

## 4. `fn` declarations

```
FnDecl ::= "fn" Identifier GenericParams?
           "(" ParamList? ")" ("->" Type)? ("async")?
           WhereClause? (Block | ";")
```

- A top-level `fn` declares a function in the enclosing module.
- A function with a body (`{ ... }`) is *defined*; one with `;` is
  *declared* and must be defined elsewhere (e.g. by an `impl` block
  for trait methods, or by an `extern "..."` block for FFI).
- `pub` makes the function visible outside the module.
- Parameters may have default values:

  ```aether
  fn greet(name: String, greeting: String = "hello") -> String {
      format("{greeting}, {name}")
  }
  ```

  A parameter with a default must come after all parameters without
  defaults. The default value is a constant expression.
- `async fn` declares an async function whose return type is
  `Future<Output = T>` where `T` is the declared return type. See
  [§07](./07-functions-closures-async.md).

## 5. `type` aliases

```
TypeDecl ::= "type" Identifier GenericParams? "=" Type ";"
```

Type aliases are transparent synonyms; see [§03 §3.1](./03-type-system.md#type-aliases).

## 6. `struct` declarations

```
StructDecl ::= "struct" Identifier GenericParams? "{" FieldList? "}" (";")?
FieldList  ::= Field ("," Field)* ","?
Field      ::= ("pub" ("(" "..." ")")?)? Identifier ":" Type
```

- Each field may be `pub` or private. A field with no `pub` is
  visible only inside the declaring module and its descendants.
- The `pub(crate)` form (visible within the current package) is
  permitted as a parenthesised visibility modifier.
- A field may be tagged with `#[default]` to participate in
  struct-update syntax (§6.2 below).
- A struct may have at most one `#[derive]` attribute group; see
  [§03 §7](./03-type-system.md#builtin-traits).

### 6.1 Construction

```aether
let p = Point { x: 1.0, y: 2.0 };
let q = Point { x: 3.0, ..p };       // struct update: copy remaining from p
```

- Field-order construction is not supported; only named-field
  construction.
- The struct-update `..p` copies all fields not explicitly named
  from `p`. `p` must be a place or a `Move`-able value.

### 6.2 Visibility and constructors

A struct's constructor (`Type { ... }`) is visible wherever the
struct is, *except* when the struct is declared with
`#[non_exhaustive]`, in which case construction outside the declaring
module requires a public constructor function. This lets modules
evolve their struct internals without breaking downstream
constructors.

## 7. `enum` declarations

```
EnumDecl   ::= "enum" Identifier GenericParams? "{" VariantList? "}" (";")?
VariantList ::= Variant ("," Variant)* ","?
Variant    ::= Identifier (TupleVariant | StructVariant)?
TupleVariant ::= "(" TypeList ")"
StructVariant ::= "{" FieldList? "}"
```

- See [§03 §3.3](./03-type-system.md#enums-algebraic-data-types) for the
  typing rules.
- An enum may be marked `#[non_exhaustive]`; downstream `match`
  expressions are then required to have a `_` arm even if the
  upstream enum later adds variants.

## 8. `trait` declarations

```
TraitDecl   ::= "trait" Identifier GenericParams? (":" SuperList)? "{" TraitItem* "}" (";")?
SuperList   ::= TraitRef ("+" TraitRef)*
TraitItem   ::= FnSig ("{" FnBody? "}" | ";")
              | "type" Identifier (":" Bound)? ";"
              | "const" Identifier (":" Type)? "=" Expr ";"
```

- A trait declares required methods (no body), default methods (with
  body), associated types, and associated constants.
- A trait's super-traits must be implemented before the trait itself
  can be implemented.
- A trait may be marked `#[sealed]` to forbid downstream `impl`s.
- A trait with `Self: Sized` in a super-trait bound is *not*
  object-safe (i.e. cannot be made into a `dyn Trait`).

## 9. `impl` blocks

```
ImplDecl ::= "impl" GenericParams? (TraitRef "for")? Type "{" ImplItem* "}" (";")?
ImplItem ::= FnDecl | ConstStmt | TypeDecl
```

- An `impl Trait for Type` provides trait methods. An `impl Type`
  provides inherent methods. See [§03 §3.5](./03-type-system.md#implementations).
- Conflicting impls (two `impl`s providing the same method for the
  same type/trait pair) are an error `E1021`.
- The orphan rule (`E1020`) restricts where impls may live; see
  [§03 §6.5](./03-type-system.md#trait-conformance).

## 10. `mod` and `use`

Module and use declarations are specified in
[§06 Modules & Packages](./06-modules-and-packages.md). The short
form is:

```aether
mod geometry;            // declared in src/geometry.ae or src/geometry/_mod.ae
mod geometry { ... }     // inline
use geometry::Shape;
use geometry::{Circle, Square};
use geometry::Shape as Figure;
```

## 11. `extern` declarations

```
ExternDecl ::= "extern" LinkName? ("{" ExternItem* "}" | FnSig ";")
LinkName    ::= StringLit
ExternItem  ::= "fn" Identifier FnSig ";"
              | "static" Identifier ":" Type ";"
```

`extern` blocks declare foreign functions and globals, typically
loaded via the host's FFI mechanism. The exact calling convention,
symbol resolution, and ABI are specified in
[§14 Interoperability](./14-interoperability.md). The `LinkName`
defaults to the C ABI for the host platform.

```aether
extern "c" {
    fn c_strlen(s: *const u8) -> usize;
}
```

## 12. Attributes

A declaration may carry one or more attributes prefixed with `#`:

```
Attr ::= "#" "[" AttrPath ("=" AttrArg | "(" AttrArgs ")")? "]"
```

Built-in attributes (recognized by the compiler):

| Attribute | Applies to | Effect |
|---|---|---|
| `#[derive(Eq, Ord, Clone, Display, Debug, Default)]` | structs, enums | auto-impl the named traits |
| `#[non_exhaustive]` | structs, enums | forbids out-of-crate exhaustive construction/matching |
| `#[sealed]` | traits | forbids out-of-crate `impl`s |
| `#[fundamental]` | traits, structs | relaxes the orphan rule for this type |
| `#[inline]` `#[inline(always)]` `#[inline(never)]` | functions | VM hint about whether to specialize a call |
| `#[cold]` | functions | VM hint: rare path, lay out at end of bytecode |
| `#[test]` | functions | marks the function as a test (see [§15](./15-conformance-and-tests.md)) |
| `#[bench]` | functions | marks the function as a benchmark (§13) |
| `#[ignore]` | tests, benches | skip by default |
| `#[cfg(condition)]` | any item | conditional compilation |
| `#[deprecated(since, message)]` | any item | emit deprecation warning on use |
| `#[doc = "..."]` | any item | attach a doc comment |
| `#[allow(lint)]` | any item | suppress a lint |
| `#[deny(lint)]` | any item | promote a lint to error |

Unknown attributes are a warning (`W1099`), not an error; this
permits third-party tools to add attributes without breaking the
compiler.

## 13. Expression statements

An expression followed by `;` is an expression statement. The value
is discarded. The `;` is *required* when the expression's omission
would make the following token ambiguous (e.g. a function call
followed by another expression), and *optional* at the end of a
block, where a trailing expression without `;` is the block's value.

A block whose trailing expression is followed by `;` has type
`Unit`; a block whose trailing expression is not followed by `;` has
the type of the expression.

## 14. Item ordering

Aether permits items to appear in any order within a module. Name
resolution is performed across the whole module before type
checking, so mutual recursion between functions is supported
without forward declarations:

```aether
fn is_even(n: Int) -> Bool { if n == 0 { true } else { is_odd(n - 1) } }
fn is_odd(n: Int) -> Bool  { if n == 0 { false } else { is_even(n - 1) } }
```

This is a deliberate departure from C-family languages that require
forward declarations, and matches the behavior of ML and TypeScript.

## 15. Conformance

A conformant parser MUST accept any permutation of top-level items
that matches the grammar, MUST resolve names in a single
whole-module pass before type-checking, and MUST report a single
diagnostic per duplicate declaration.
