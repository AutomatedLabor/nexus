# 08 — Error Handling

> **Status:** 🧪 Experimental
> **Subsystem:** `aether/core/ast`, `aether/core/eval`, `aether/vm`
> **Spec version:** 0.1

Aether has two complementary error mechanisms:

- **Values:** `Result<T, E>` and `Option<T>` for ordinary,
  recoverable errors. The `?` operator propagates them.
- **Panics:** for invariant violations and unrecoverable conditions.
  Panics abort the current task; `try { ... } catch ...` can recover
  them within the same task.

This section specifies both, plus the pattern syntax they share
with `match` and `let`.

## 1. `Result` and `Option`

`Result` and `Option` are ordinary enums in the prelude:

```aether
enum Option<T> { None, Some(T) }
enum Result<T, E> { Ok(T), Err(E) }
```

There is no language-level special-casing for them except that the
`?` operator is hard-wired to their shapes. User-defined enums are
not eligible for `?`.

## 2. The `?` operator

```
PostfixExpr ::= ... | PostfixExpr "?"            // see §04 §1
```

`e?` is the question-mark operator. Its semantics depend on the
type of `e`:

- If `e: Option<T>`:
  - `Some(v)` produces `v` (type `T`).
  - `None` causes an early `return None` from the enclosing
    function, which must therefore return `Option<_>`.

- If `e: Result<T, E>`:
  - `Ok(v)` produces `v` (type `T`).
  - `Err(e)` causes an early `return Err(e.into())` from the
    enclosing function. The function's error type must be
    convertible from `E` via the `From` trait (§2.2).

The `?` operator may also appear in a `try` block, in which case a
`None`/`Err` causes the `try` block to yield to the matching
`catch` arm instead of returning from the enclosing function
(§5.2).

### 2.1 Type rules

The enclosing function's return type must be compatible:

- If `e: Option<T>`, the enclosing function (or `try`) must produce
  `Option<U>` for some `U` such that `T <: U`. The `None` returned
  is of type `Option<U>`.
- If `e: Result<T, E>`, the enclosing function (or `try`) must
  produce `Result<U, F>` such that `T <: U` and `E: Into<F>`. The
  `Err(e.into())` returned is of type `Result<U, F>`.

If neither constraint holds, `E1107`.

### 2.2 `From`-conversion

The `?` operator uses the `From` trait to widen errors:

```aether
trait From<T> { fn from(value: T) -> Self; }
trait Into<T> { fn into(self) -> T; }       // blanket: from Into via From
```

`From` is a blanket-provided trait; the stdlib provides `From`
impls between common error types (e.g. `IoError: From<ParseError>`
where applicable).

## 3. `raise`

```
RaiseExpr ::= "raise" Expr
```

`raise e` constructs an error and propagates it. It is sugar for
`return Err(e)`, except that it does not require the enclosing
function's return type to be spelled out if it can be inferred.
`raise` is a diverging expression of type `!`.

```aether
fn lookup(table: &Map<String, Int>, key: String) -> Result<Int, LookupError> {
    match table.get(&key) {
        Some(v) => Ok(*v),
        None    => raise LookupError::NotFound(key),
    }
}
```

## 4. Patterns

Patterns are shared between `match`, `let`, function parameters,
`for`/`spawn` bindings, and `catch` clauses. The pattern grammar:

```
Pattern     ::= OrPattern
OrPattern   ::= LeafPattern ("|" LeafPattern)*
LeafPattern ::= Literal
              | "_" | Identifier
              | "(" Pattern ("," Pattern)* ","? ")"
              | "[" Pattern ("," Pattern)* ","? "]"
              | "{" FieldPat ("," FieldPat)* ","? "}"
              | Pattern ":" Type
              | "&" Pattern | "&mut" Pattern
              | PathExpr ("(" PatternList ")")?        // enum variant
              | Pattern "if" Expr                       // guard (only in match arms)
FieldPat    ::= Identifier (":" Pattern)?
              | ".."
PatternList ::= Pattern ("," Pattern)* ","?
```

### 4.1 Pattern kinds

- **Literal:** matches a value via `==` (`Eq`). `true`, `false,
  integer/float/char/string literals.
- **Wildcard `_`:** matches anything, binds nothing.
- **Identifier:** binds the matched value to the name. Inside an
  enum-variant pattern, the *first* bare identifier with no binding
  is treated as a binding; subsequent identifiers in the same
  variant are looked up as field names. To force a binding to refer
  to a field, use `field: binding`.
- **Tuple:** matches a tuple of the corresponding arity. `()` is
  the unit pattern.
- **Array:** matches a fixed-size array. A trailing `..` allows a
  shorter pattern that matches a prefix.
- **Struct:** matches a struct's named fields. Fields not
  mentioned are ignored unless `..` is *absent*, in which case
  exhaustiveness of fields is required (warning `W1050` if `..`
  is omitted and not all fields are named). `..` is a *rest*
  pattern.
- **Enum variant:** `Shape::Circle(r)` matches the `Circle`
  variant and binds `r` to the inner value.
- **`ref`/`&mut` patterns:** explicit binding-mode annotation. See
  §4.3.
- **Guard:** `p if cond` matches `p` then evaluates `cond`; if
  `cond` is `false`, the arm is not taken and matching continues.
  Guards are valid only in `match` arms, not in `let` or function
  parameter patterns.

### 4.2 Range patterns

A range pattern is `a .. b` or `a ..= b`, where `a` and `b` are
constant expressions of an integer or `Char` type. The pattern
matches values `v` with `a <= v < b` (half-open) or
`a <= v <= b` (inclusive). Ranges may be open-ended: `.. b`, `a ..`,
or `..`, with the obvious meaning.

### 4.3 Binding modes

A pattern's binding mode (move vs. `ref` vs. `ref mut`) is inferred:

- If the scrutinee is a *value* (rvalue or `move`-able), default is
  move.
- If the scrutinee is a *reference* (`&T` or `&mut T`), default is
  `ref` (or `ref mut` for `&mut T`).
- An explicit `ref p` or `&p` forces the binding to be a shared
  reference; `ref mut p` or `&mut p` forces a mutable reference.

This is the same algorithm Rust uses (RFC 2005); the goal is to
remove the need for explicit `ref`/`ref mut` in 99% of patterns.

### 4.4 Exhaustiveness

For `match` expressions and `let P = e` where `P` does not match
all possible values of `e`'s type, the checker reports `E1031`.
For destructuring `let`s, the convention is:

- `let P = e` requires `P` to be *irrefutable* (matches every value
  of `e`'s type).
- `let P = e else { ... }` is *refutable*: if `P` does not match,
  the `else` block runs and must diverge (`return`, `raise`,
  `break`, `continue`, or `panic!`). This is the "let-else"
  pattern.

## 5. Panics

A **panic** is an unrecoverable-from-within-the-current-task error.
Panics propagate up the call stack, unwinding it until they reach
either a `try` block or the task boundary. At the task boundary, a
panic aborts the task and (for the `main` task) the process.

### 5.1 Sources of panics

- Explicit: `panic!("msg")`, `unreachable!()`, `todo!()`.
- Integer overflow in `debug` mode (release mode wraps for `Int`,
  saturates for `Float`).
- Array out-of-bounds.
- Division by zero.
- Stack overflow.
- `Option::unwrap()` / `Result::unwrap()` on `None`/`Err`.
- `SelfPoll` (an async future polled itself synchronously).
- A failed `assert!` / `assert_eq!` / `assert_ne!`.
- A `Cancelled` raised at the first `await` after a
  `handle.cancel()`.

### 5.2 Panic payload

A panic carries a **payload**:

```aether
struct Panic {
    message: String,
    location: SourceLocation,
    backtrace: Backtrace,
    cause: Option<Box<Panic>>,    // for re-panics from a catch
}
```

The payload is a heap-allocated record. Catching a panic gives the
catcher access to the payload. Catchers that re-`raise` (which is
*not* `raise`; panics have their own `panic!` form) may wrap the
original payload.

### 5.3 `try` / `catch`

```aether
try {
    let x = compute()?;
    x + 1
} catch (e: IoError) {
    -1
} catch (e: Panic) {
    println("task panicked: {e.message}");
    -2
}
```

- `try` evaluates its body. The body may use `?`, `raise`, and may
  panic; all three are caught by the `catch` arms.
- Each `catch (pat)` arm is tried in order. The pattern matches
  against the propagated value:
  - For `?`/`raise` propagation, the value is the `Err(e)`.
  - For panics, the value is the `Panic` payload, matched with
    `Panic { message, .. }` or simply `_`.
- The first arm whose pattern matches and whose guard (if any)
  evaluates to `true` is taken. The arm's body becomes the value of
  the `try` block.
- If no `catch` arm matches and a value was propagated, the
  propagation continues outward (to the enclosing function or
  enclosing `try`).
- A `try` with no `catch` is a syntax error.

### 5.4 Unwinding semantics

Unwinding is a structured process: each frame between the panic
site and the catching `try` is unwound, running any `defer` blocks
(§6) and any `Drop` finalizers (§11 4). Unwinding is *not* an
exception in the C++ sense: it is visible only to `try`/`catch`,
not to plain `if`/`match`/loop frames.

A program may opt out of unwinding for the whole crate with
`#![panic = "abort"]`: a panic at the task boundary aborts the
process without running `Drop`/`defer` blocks. This is intended
for `wasm32` and embedded targets.

## 6. `defer`

```
DeferStmt ::= "defer" Block
```

A `defer` block schedules its body to run when the enclosing scope
exits, whether by normal fall-through, `return`, `raise`, panic, or
`break`/`continue` past it. Multiple `defer`s in the same scope run
in reverse order (LIFO). `defer` is the analogue of Go's `defer`
and Rust's `Drop`.

```aether
fn copy_file(src: String, dst: String) -> Result<(), IoError> {
    let r = File::open(src)?;
    defer { r.close(); }
    let w = File::create(dst)?;
    defer { w.close(); }
    // ... copy bytes ...
    Ok(())
}
```

A `defer` block cannot return a value; it must produce `()`. A
panic inside a `defer` block propagates as if the original
exit-mode were `panic` (i.e. replaces the normal exit value with a
panic).

## 7. Lints

The linter (`aether lint`) recognizes a set of error-handling
lints:

- `unused_result`: warns when a `Result`-returning call is
  discarded without `?`, `let _ = ...`, or `_ = ...`.
- `unwrap_used`: warns on `.unwrap()` (configurable to `deny`).
- `panic_in_lib`: warns on `panic!` / `unwrap` in a library crate
  (only `raise` is preferred in libraries).
- `let_underscore_must_use`: warns when a `#[must_use]` function's
  return value is dropped via `let _ =`.

## 8. Conformance

A conformant implementation MUST:

- propagate `?`-errors and `raise` values structurally,
- run `defer` blocks in LIFO order on every scope exit path,
- abort a task on an uncaught panic without affecting other tasks
  or the host process,
- run all `Drop`/`defer` cleanups during unwinding before
  transferring control to a `catch`,
- guarantee that a `try { ... } catch (e: Panic) { ... }` catches
  panics raised in the same task and in synchronously awaited
  futures, but **not** panics from a different task (those are
  observable only via `JoinHandle.await`).
