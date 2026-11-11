# 04 — Expressions

> **Status:** 🧪 Experimental
> **Subsystem:** `aether/core/ast`, `aether/core/parser`
> **Spec version:** 0.1

Expressions are the heart of Aether. Almost every construct that
produces a value is an expression, including `if`, `match`, and
blocks. This section specifies their grammar, evaluation order,
and typing rules.

## 1. Grammar overview

```
Expr        ::= AssignExpr
AssignExpr  ::= RangeExpr ("=" | "+=" | "-=" | "*=" | "/=" | "%=" | "&=" | "|=" | "^=" | "<<=" | ">>=" | "??=") AssignExpr
RangeExpr   ::= OrExpr (".." | "..=") OrExpr
OrExpr      ::= AndExpr ("||" AndExpr)*
AndExpr     ::= CmpExpr ("&&" CmpExpr)*
CmpExpr     ::= BitOrExpr (("<" | "<=" | ">" | ">=" | "==" | "!=" | "is" | "as") BitOrExpr)*
BitOrExpr   ::= BitXorExpr ("|" BitXorExpr)*
BitXorExpr  ::= BitAndExpr ("^" BitAndExpr)*
BitAndExpr  ::= ShiftExpr ("&" ShiftExpr)*
ShiftExpr   ::= AddExpr (("<<" | ">>") AddExpr)*
AddExpr     ::= MulExpr (("+" | "-") MulExpr)*
MulExpr     ::= PowExpr (("*" | "/" | "%") PowExpr)*
PowExpr     ::= UnaryExpr ("**" UnaryExpr)?
UnaryExpr   ::= ("-" | "!" | "~" | "&" | "&mut" | "*" | "await")* PostfixExpr
PostfixExpr ::= PrimExpr (Call | Field | Index | "?" | ".await" | "as" Type)*
PrimExpr    ::= Literal | PathExpr | "(" ExprSeq? ")" | ArrayLit | MapLit | Block
              | If | Match | Loop | For | While | Closure | Spawn | Try
ExprSeq     ::= Expr ("," Expr)* ","?
```

Precedence is given by the grammar above; higher productions bind
looser. All binary operators are **left-associative** except `**`,
`..`, `..=`, and `=`/compound-assignment, which are
right-associative. The grammar is unambiguous by construction; the
parser is a Pratt-style recursive-descent parser driven by these
precedence levels.

## 2. Literals

Literals are specified in [§02 §5](./02-lexical-structure.md#literals).
Each literal has a default type:

- integer → `Int`
- float → `Float`
- char → `Char`
- string → `String`
- byte string → `Bytes`
- `true`/`false` → `Bool`
- `()` → `Unit`

Literals are subject to contextual typing: in `let x: u8 = 5;`, the
literal `5` is checked against `u8` and its type is unified with `u8`.
If the literal value does not fit, the checker reports `E1100`.

## 3. Paths

```
PathExpr ::= ("::")? Identifier ("::" Identifier)*
           ("::" "<" TypeList ">")?
```

- `foo` — a local, then a module-level item, then an enum variant
  of the enclosing enum.
- `mod::foo` — qualified path.
- `::foo` — absolute path from the crate root.
- `List::<Int>::new` — turbofish instantiation: explicitly provides
  type arguments at a call site.

A path resolves at name resolution time (see [§06](./06-modules-and-packages.md)).
Unresolved paths are `E1040`.

## 4. Calls, fields, indexes

```
Call  ::= "(" ExprSeq? ")"
Field ::= "." Identifier | "." IntLit        // tuple field by position
Index ::= "[" Expr "]"
```

- `f(a, b)` — call. The callee `f` may be a function, a closure, or
  a callable implementing the `Fn`/`FnOnce`/`FnMut` family of traits
  (see [§12 stdlib::fn-traits](./12-stdlib.md)).
- `x.y` — field access. For tuples, `x.0`, `x.1`. For named struct,
  `x.field_name`. A field whose name is a keyword is accessed as
  `x.r#type`.
- `x[i]` — index. The index type must be `Int`/`Uint`/`usize`, and
  the receiver must implement `Index<Idx, Output = T>`. Out-of-bounds
  access is a panic in release, a checked panic with a stack trace
  in debug.
- `x.method(a, b)` is sugar for `T::method(&x, a, b)` (or `&mut x`
  for `&mut self` methods, or `x` for `self` methods). Auto-ref is
  applied to the receiver to match the method's `self` form.

## 5. Unary operators

| Op | Operand | Result | Notes |
|----|---------|--------|-------|
| `-` | numeric | numeric | negation; panics on `Int::MIN` in debug |
| `!` | `Bool` | `Bool` | logical not |
| `~` | integer | integer | bitwise not |
| `&` | place | `&T` | shared borrow |
| `&mut` | place | `&mut T` | exclusive borrow |
| `*` | `&T` / `&mut T` | `T` | dereference (copy or move) |
| `await` | `Future<T>` | `T` | suspends the task (§07) |

`await` may also be written postfix as `expr.await` (idiomatic form).
The two forms are equivalent.

## 6. Binary operators

### 6.1 Arithmetic

| Op | Types | Behavior |
|----|-------|----------|
| `+` `-` `*` `/` `%` | integers | wrap on overflow in release; panic in debug |
| `+` `-` `*` `/` | floats | IEEE 754 |
| `%` | floats | `fmod`-style remainder |
| `**` | numeric | power; for `Int` exponent ≥ 0 only, else `E1102` |

### 6.2 Bitwise

`<<`, `>>`, `&`, `|`, `^` operate on integers. Shift amounts ≥ the
width of the type are masked (`shift & (width - 1)`) in release and
panic in debug. The right operand of `>>` on a signed integer is a
**logical** shift for unsigned types and an **arithmetic** shift for
signed types.

### 6.3 Comparison and logic

`==`, `!=` require `Eq`. `<`, `<=`, `>`, `>=` require `Ord`. `&&` and
`||` are short-circuiting and require `Bool` operands and produce a
`Bool`. There is no implicit truthiness: `if 0 { ... }` is a type
error.

### 6.4 `is` and `as`

- `e is T` is a runtime type test, valid only when `e: &dyn Trait` or
  `e: dynamic`. It produces `Bool`. For trait objects, it tests the
  underlying concrete type (only the original type is reportable; no
  super/subclass relation).
- `e as T` is a cast. Permitted casts:
  - between integer widths (truncating or zero/sign-extending),
  - `Int` ↔ `Float` (with rounding),
  - `&T` ↔ `&dyn Trait` when `T: Trait`,
  - `&[T; N]` ↔ `&[T]`,
  - any `T` to a *stricter* `&dyn Trait` for the trait the type
    implements.
  Other casts are `E1103`.

## 7. Ranges

```
RangeExpr ::= AddExpr ".." AddExpr        // half-open: [start, end)
            | AddExpr "..=" AddExpr       // inclusive: [start, end]
            | AddExpr ".."                 // open-ended: [start, ∞)
            | ".." AddExpr                 // [0, end) -- only in `for`
            | ".."                         // [0, ∞)   -- only in `for`
```

- `0..10` has type `Range<Int>` and is iterable.
- `0..=10` has type `RangeInclusive<Int>`.
- `5..` produces an unbounded range, iterable only if `T: Step`.
- The bounds must be `Step` (an integer or a type implementing the
  `Step` trait, see [§12](./12-stdlib.md)).

## 8. `match`

```
Match ::= "match" Expr "{" MatchArm ("," MatchArm)* ","? "}"
MatchArm ::= Pattern ("if" Expr)? "=>" ExprSeq ","
```

- A `match` expression evaluates the scrutinee once, then tries each
  arm in order. The first arm whose pattern matches *and* whose guard
  (if any) evaluates to `true` is taken. The arm's body is evaluated
  and the result is the value of the `match`.
- All arms must have the **same** type, modulo the never-coercion.
- Patterns are specified in [§08 4 Patterns](./08-error-handling.md#patterns) —
  yes, patterns are reused across `match`, `let`, function parameters,
  and `for`/`spawn` bindings.
- Exhaustiveness is checked by the type checker (see
  [§03 6.6](./03-type-system.md#exhaustiveness)). Non-exhaustive
  matches are `E1031`.
- The scrutinee is moved into the match unless explicitly borrowed;
  the binding modes of patterns are inferred (move vs. ref) based on
  the scrutinee's type and on whether the pattern contains `ref` /
  `&` patterns. See [§08](./08-error-handling.md#binding-modes).

```aether
let n = 3;
let s = match n {
    0 => "zero",
    1 | 2 => "small",
    3..=9 => "medium",
    _ => "big",
};
```

## 9. `if` / `else`

```
If ::= "if" Expr Block ("else" (If | Block))?
```

- The condition must be `Bool`. The `then` and `else` blocks must
  have the same type, modulo never-coercion. An `if` without `else`
  has type `Unit`; the `then` block therefore must not produce a
  non-`Unit` value.
- `if let P = e { ... } else { ... }` is sugar for a two-arm `match`
  against `e` with patterns `P` and `_`, where the `else` arm is the
  `_` arm. The same exhaustiveness rules apply.

## 10. Blocks

```
Block ::= "{" Stmt* Expr? "}"
```

- A block is a sequence of statements followed by an optional
  trailing expression. The value (and type) of the block is the
  value of the trailing expression, or `Unit` if there is no trailing
  expression. A trailing expression is any expression that is not
  followed by a semicolon.
- Statements inside a block are evaluated in order for their side
  effects. Their values are discarded.
- Blocks introduce a new scope; bindings do not escape.

```aether
let x = {
    let y = compute();
    y + 1
};
```

## 11. Closures

```
Closure ::= "|" ParamList? "|" ("->" Type)? Block
          | "move" "|" ParamList? "|" ("->" Type)? Block
Param ::= Identifier (":" Type)?
```

- A closure captures variables from its enclosing scope. By default,
  captures are by reference (with a `&T` or `&mut T` per-use). With
  the `move` keyword, captures are by value (cloning if necessary).
- A closure with no captures is coerced to a `fn` type.
- A closure with `&` captures is `Fn` (callable many times).
- A closure with `&mut` captures is `FnMut` (callable many times,
  mutably).
- A closure that *moves* a captured value out of its environment on
  a call is `FnOnce`.
- The body of a closure is a `Block`, so the last expression is its
  return value. Explicit `return` inside a closure returns from the
  closure, not the enclosing function.
- Parameter and return types may be elided; inference fills them in
  from the call site or the expected type.

```aether
let add = |a, b| a + b;
let double = |x: Int| x * 2;
let make_adder = |n| move |x| x + n;     // captures n by value
```

## 12. Loops

```
Loop  ::= "loop" Block
While ::= "while" Expr Block
For   ::= "for" Pattern "in" Expr Block
```

- `loop { ... }` runs forever; the only exit is `break expr` or a
  `return` from the enclosing function. The type of a `loop` without
  a `break expr` is `!`; the type of a `loop` whose only `break`s
  produce `T` is `T`.
- `while cond { ... }` always has type `Unit`.
- `for p in iter { ... }` requires `iter: IntoIterator`; the loop
  body's type is `Unit`.
- `break` exits the innermost loop; `break e` exits with value `e`
  (only valid in `loop`). `continue` skips to the next iteration of
  the innermost loop.
- Labels (`'outer: loop { ... break 'outer 5; ... }`) are supported
  and are required for breaking or continuing a non-innermost loop.

## 13. `spawn` and `try`

```
Spawn ::= "spawn" Expr        // expr must be Future<T> or async fn
Try    ::= "try" Block ("catch" "(" Pattern ")" Block)*
```

- `spawn expr` schedules `expr` (a future) on the runtime and returns
  a `JoinHandle<T>`. Awaiting the handle yields the future's result
  or the panic that aborted it. See [§07 4](./07-functions-closures-async.md#spawning-tasks).
- `try { ... } catch (e) { ... }` is the structured panic-recovery
  form. The body of `try` is evaluated; if a panic is raised inside,
  the first matching `catch` arm is taken, binding the panic payload
  to `e`. Panics that escape a `try` propagate to the task and abort
  it; `catch` only catches panics in the same task. See
  [§08 5](./08-error-handling.md#panics).

## 14. `return`, `break`, `continue`, `raise`

These are *diverging* expressions with type `!`:

```
Diverge ::= "return" Expr?
         | "break" Label? Expr?
         | "continue" Label?
         | "raise" Expr
```

- `return e` returns from the enclosing function. `return` alone
  returns `()`.
- `break` and `continue` are scoped by their nearest loop or by an
  explicit label.
- `raise e` constructs an error and propagates it. `e: E` and the
  enclosing function must return `Result<_, E>`; `raise` is sugar for
  `return Err(e)`.

## 15. Assignment

```
Assign ::= LValue "=" Expr
          | LValue CompoundOp Expr
LValue  ::= Identifier | Index | Field | "*" UnaryExpr
```

- The left side must be a *place expression*: a local, a field, an
  index, or a dereference.
- Compound assignment `x op= y` is sugar for `x = x op y`, evaluated
  once for `x`. The operators are: `+= -= *= /= %= &= |= ^= <<= >>=
  **= ??=`.
- `??=` is "default if null": `x ??= y` assigns `y` to `x` iff `x`
  is `None`; otherwise `x` is unchanged. Available only when `x:
  Option<T>`.

## 16. Evaluation order

Aether specifies a **strict left-to-right** evaluation order:

1. Function arguments are evaluated left to right.
2. Binary operators evaluate left then right.
3. Assignment evaluates the right side first, then the left side
   (this differs from C and matches Rust; the goal is to make
   `a[i] = a[j] = v` predictable).
4. The receiver of a method call is evaluated before the arguments.
5. Short-circuiting operators (`&&`, `||`) evaluate the right side
   only if needed.
6. Interpolation expressions in a string are evaluated left to right.

The compiler is free to reorder evaluations that have no observable
side effect, including floating-point computations *only* under
`#[optimize(strict)]`. Default optimization reorders integer
computations but not floating-point.

## 17. Generics vs. shifts

When the parser sees `>>` in a context where a generic-argument list
is open, it requests the lexer to re-lex the token as two `>` tokens.
The rule (the **generics-friendly re-lex** rule of
[§02 §6](./02-lexical-structure.md#punctuation-and-operators)) is
triggered iff:

- the parser is inside a `<...>` generic argument list, and
- the innermost `>` would close a *nested* generic argument list, and
- the character immediately following the `>>` is `>`, `)`, `]`,
  `}`, `,`, `;`, `=`, `:`, `::`, `->`, `=>`, `+`, whitespace, or
  EOF.

Otherwise `>>` is the shift operator. This is the only case in which
the lexer is not stateless; the parser carries the generic-nesting
depth and signals the lexer.

## 18. Conformance

A conformant parser MUST produce an AST matching the grammar above,
MUST reject ill-formed input with a parser error (`E2xxx`), and MUST
support error recovery (skipping to a synchronization token such as
`;`, `}`, or the start of a new top-level item) so that multiple
parser errors per file are possible.
