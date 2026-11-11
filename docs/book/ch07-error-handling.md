# Chapter 7 — Error handling

> Aether has two kinds of errors: *recoverable* errors (returned as `Result<T, E>` values, propagated with `?`) and *unrecoverable* errors (panics, which unwind the stack and stop the program). This chapter covers the `Result` type, the `?` operator, when to use `panic` vs `Result`, the error catalog, and how to read errors in the playground.

---

## 7.1 Two kinds of errors

Aether's error model is the Rust/ML model:

- **Recoverable errors** are values of type `Result<T, E>`. The function returns either `Result::Ok(value)` (the success case) or `Result::Err(error)` (the failure case). The caller decides what to do with the error: propagate it with `?`, handle it with `match`, or convert it to a panic with `unwrap()` (planned for v2.x; for now, use `match`).

- **Unrecoverable errors** are panics. `panic(msg)` throws a `PanicSignal` that unwinds the stack and stops the program. The top-level run loop catches the panic and converts it to an error report. Panics are for *programmer errors*: invariant violations, unreachable code, "this should never happen" cases.

The rule of thumb:

- If the caller can reasonably handle the error (file not found, parse failure, network timeout), return a `Result`.
- If the caller can't handle the error (logic bug, broken invariant, type error slipping past the type checker), `panic`.

---

## 7.2 The `Result` type

`Result<T, E>` is a built-in generic enum:

```aether
enum Result<T, E> {
  Ok(T),
  Err(E),
}
```

The two arms are:

- `Result::Ok(value)` — the success case. `value` has type `T`.
- `Result::Err(error)` — the failure case. `error` has type `E`.

`T` and `E` can be any type. Common patterns:

- `Result<int, string>` — an int result with a string error message.
- `Result<int, ErrorCode>` — an int result with a typed error code (an enum).
- `Result<void, string>` — just a fallible operation with no useful success value (use `Result::Ok(())` for the success case).
- `Result<T, string>` — a generic result with a string error (the most common idiom).

The shorthand `result<T, E>` (lowercase) is interchangeable with `Result<T, E>` in type annotations.

### 7.2.1 Constructing a `Result`

```aether
fn parse_int(s: string) -> result<int, string> {
  if s == "42" { Result::Ok(42) } else { Result::Err("not 42") }
}
fn divide(a: int, b: int) -> result<int, string> {
  if b == 0 { Result::Err("div by zero") } else { Result::Ok(a / b) }
}

print(parse_int("42"));    // Ok(42)
print(parse_int("x"));     // Err("not 42")
print(divide(10, 2));       // Ok(5)
print(divide(10, 0));       // Err("div by zero")
```

### 7.2.2 Matching on `Result`

```aether
let r = divide(10, 0);
match r {
  Result::Ok(q) => print(f"quotient = {q}"),
  Result::Err(e) => print(f"error: {e}"),
}
```

The pattern `Result::Ok(q)` binds `q` to the success value. The pattern `Result::Err(e)` binds `e` to the error value.

### 7.2.3 `Result` as an expression

`match` is an expression, so you can use a `Result`-handling `match` inline:

```aether
let r = divide(10, 2);
let msg = match r {
  Result::Ok(q) => f"got {q}",
  Result::Err(e) => f"failed: {e}",
};
print(msg);
```

---

## 7.3 The `?` operator

The `?` postfix operator *propagates* an error. It's shorthand for `match`:

```aether
let n = parse_int(s)?;
```

is sugar for:

```aether
let n = match parse_int(s) {
  Result::Ok(v) => v,
  Result::Err(e) => return Result::Err(e),
};
```

`?` requires the enclosing function to return a `Result` (or `Option`). The error type must unify with the enclosing function's error type.

### 7.3.1 Example: chaining `?`

```aether
fn parse_int(s: string) -> result<int, string> {
  if s == "42" { Result::Ok(42) } else { Result::Err("not 42") }
}
fn parse_two(s1: string, s2: string) -> result<(int, int), string> {
  let a = parse_int(s1)?;
  let b = parse_int(s2)?;
  Result::Ok((a, b))
}
print(parse_two("42", "42"));   // Ok((42, 42))
print(parse_two("42", "x"));    // Err("not 42")
```

The `?` after `parse_int(s2)` short-circuits: if it returns `Err`, the function returns that `Err` immediately, without running the `Result::Ok((a, b))` line.

### 7.3.2 `?` on `Option`

`?` also works on `Option`:

```aether
fn first<T>(xs: [T]) -> option<T> {
  if len(xs) > 0 { Option::Some(xs[0]) } else { Option::None }
}
fn first_double(xs: [int]) -> option<int> {
  let x = first(xs)?;
  Option::Some(x * 2)
}
print(first_double([1, 2, 3]));   // Some(2)
print(first_double([]));          // None
```

### 7.3.3 `?` on a non-Result/Option is a type error

```aether
let n = 42?;
// type error: ? operator can only be applied to Result or Option, found int
```

### 7.3.4 The error type must match

The `?` operator's error type must unify with the enclosing function's error type. If they don't, the type checker reports `cannot unify <T> with <U>`:

```aether
fn f() -> result<int, string> {
  let r: result<int, int> = Result::Err(42);
  let n = r?;   // type error: cannot unify int with string
  Result::Ok(n)
}
```

The fix: convert the error explicitly with a `match` (or a `map_err` function, planned for v2.x).

### 7.3.5 What `?` desugars to

```aether
let n = expr?;
```

becomes (conceptually):

```aether
let n = match expr {
  Result::Ok(v) => v,
  Result::Err(e) => return Result::Err(e),
};
```

(for `Result`), or:

```aether
let n = match expr {
  Option::Some(v) => v,
  Option::None => return Option::None,
};
```

(for `Option`).

In the v1 tree-walker, `?` evaluates `expr`, checks if it's a `Result::Err` or `Option::None`, and *if so, throws a special signal* that the function-call machinery catches and converts to an early return. In the v2 VM, `?` compiles to the `UnwrapOrProp` opcode, which jumps to the function's error-return block.

---

## 7.4 `panic` — unrecoverable errors

`panic(msg)` throws a `PanicSignal` that unwinds the stack:

```aether
fn divide(a: int, b: int) -> int {
  if b == 0 { panic("division by zero"); }
  a / b
}
print(divide(10, 0));   // runtime: panic: division by zero
```

Panics are for *invariant violations*: things that should never happen if the program is correct. They're not for expected failure modes (use `Result` for those).

### 7.4.1 When to use `panic`

Use `panic` for:

- **Invariants the type checker can't enforce.** "This array should always be non-empty when we reach this point." If it's empty, `panic` (the caller violated a contract).
- **Unreachable code.** `match` arms that "can never be reached" can `panic("unreachable")` to make the assumption explicit.
- **`assert` and `assert_eq`.** These are panic-shaped: `assert(false)` panics with `assertion failed`. `assert_eq(a, b)` panics with `assertion failed: <a> != <b>` if `a != b`.

Don't use `panic` for:

- Expected failure modes (file not found, network timeout, parse error). Use `Result`.
- User input validation. Use `Result`.
- Conditional control flow. Use `if`/`match`.

### 7.4.2 `assert` and `assert_eq`

```aether
fn fact(n: int) -> int {
  assert(n >= 0, "fact: n must be non-negative");
  if n <= 1 { 1 } else { n * fact(n - 1) }
}
print(fact(5));    // 120
// print(fact(-1));   // panic: assertion failed: fact: n must be non-negative
```

```aether
assert_eq(fact(5), 120);
// if not equal: panic: assertion failed: 120 != 0
```

`assert` and `assert_eq` are the *testing* primitives. The `aether test` command (Chapter 13) runs all `.test.ae` files (and any `.ae` file that calls `assert`/`assert_eq`).

### 7.4.3 The PanicSignal mechanism

A `PanicSignal` is a JS exception (in v1) or a VM-level signal (in v2). The top-level run loop catches it and converts it to an error report. Inside the program, a `PanicSignal` unwinds the stack: each function call along the way is popped; any `finally`-style cleanup (none in v1; planned for v2.x) runs.

The step counter (default 1M) is separate from panics. A program can run for many steps and then panic, or panic on the first instruction.

---

## 7.5 Reading errors in the playground

The Errors tab shows each error with its stage (`lex`, `parse`, `type`, `runtime`) and the source location. Click an error to scroll the editor to the relevant line.

### 7.5.1 Stages

- **Lex errors** — from the lexer. The lexer is lenient: on an unexpected character, it pushes an `Error` token and continues. So you can see multiple lex errors at once.
- **Parse errors** — from the parser. The parser is also lenient: on an unexpected token, it reports the error, attempts to recover (skip to the next `;` or `}`), and continues.
- **Type errors** — from the type checker. The type checker is lenient too: it reports the error and continues with a fallback type (often `()`).
- **Runtime errors** — from the evaluator or VM. These are *fatal* — once a runtime panic fires, the program stops. (Subsequent runtime errors aren't reported because the program is no longer running.)

### 7.5.2 Lenient playground semantics

Aether's lenient semantics (ADR-09) mean type errors don't block execution. The program runs anyway, and you see both the type error and the runtime output. This is intentional — in a teaching playground, it's instructive to see what a slightly-typed-wrong program does at runtime.

For example, this program:

```aether
let x: int = "hello";
print(x);
```

Reports a type error (`expected int, found string`) *and* runs to completion. At runtime, `x` is the string `"hello"` (the type error doesn't *convert* the value), so `print(x)` prints `hello`.

This is a deliberate design choice. The cost is that the type system is "advisory" in the playground; the benefit is that learners see the connection between types and runtime behavior.

In production (CLI, future LSP), the type checker will be strict by default; the playground's leniency is configurable.

### 7.5.3 Common error patterns

The error catalog (`docs/reference/error-catalog.md`) lists 60+ errors with cause/fix/example for each. Here are the most common patterns:

**Missing semicolon.** `expected ';', found 'X' at <file>:line:col`. Add the `;`.

**Type mismatch.** `expected <T>, found <U>`. Change either the annotation or the value.

**Undefined name.** `undefined name 'X'`. Define `X`, import it, or use a different name.

**Wrong number of arguments.** `expected N arguments, found M`. Add or remove arguments.

**Out-of-bounds index.** `array index out of bounds: N`. Check the length first.

**Division by zero.** `division by zero`. Check the divisor first, or use a `Result`.

**No match arm matched.** Add a `_ => ...` arm (or enumerate all variants).

---

## 7.6 The error catalog

The error catalog (`docs/reference/error-catalog.md`) is the comprehensive list of every error message the implementation produces. It's organized by stage:

1. **Lex errors** — 7 entries (`unexpected character`, `unterminated block comment`, `invalid number literal`, `unterminated char literal`, `empty char literal`, `unterminated string interpolation`, `unterminated string literal`).
2. **Parse errors** — 17 entries (`expected 'X', found 'Y'`, `expected identifier`, `expected type`, `expected pattern`, `expected 'in'`, `expected string after import`, `expected 'fn' after 'pub'`, `expected parameter name`, `expected field name`, `unexpected end of input`, `unexpected token`, `failed to parse interpolation`, `expected ',' or '}' after match arm`, `expected ';'`, `expected ';' or '}' in block`).
3. **Type errors** — 40+ entries (`unknown primitive type`, `'break'/'continue' outside of a loop`, `expected <T>, found <U>`, `'return' outside of a function`, `expected return type <T>, found <U>`, `while condition must be bool`, `cannot iterate over <T>`, `undefined name`, `cannot assign to immutable variable`, `cannot assign <T> to <U>`, `? operator can only be applied to Result or Option`, `left/right of '<op>' must be bool`, `cannot compare <T> with <U>`, `operator '<op>' not defined for <T> and <U>`, `bitwise '<op>' requires int operands`, `'!' requires bool`, `unary '-' requires int or float`, `'~' requires int`, `cannot call non-function of type <T>`, `expected N arguments, found M`, `argument N: expected <T>, found <U>`, `array index must be int`, `map key must be <T>`, `tuple index N out of bounds`, `tuple index must be an integer literal`, `string index must be int`, `cannot index <T>`, `struct <Name> has no field '<field>'`, `tuple field .N out of bounds`, `cannot access tuple field on <T>`, `unknown struct`, `field '<field>': expected <T>`, `missing field`, `unknown enum`, `enum has no variant`, `variant expects N args`, `unit variant takes no arguments`, `if condition must be bool`, `match guard must be bool`, `cannot cast <T> as <U>`, `pattern expects <T>`, `literal pattern does not match scrutinee`, `tuple pattern cannot match`, `tuple pattern arity`, `array pattern cannot match`, `unknown struct/enum in pattern`, `struct variants must be matched with { field }`, `unit variant takes no subpatterns`, `cannot unify`).
4. **Runtime errors** — 20+ entries (`panic: <message>`, `array index out of bounds`, `string index out of bounds`, `tuple index out of bounds`, `map key not found`, `division by zero`, `modulo by zero`, `no match arm matched`, `cannot call non-function value`, `struct has no field` (runtime), `? operator applied to non-Result/Option`, `cannot iterate over <type>`, `execution step limit exceeded`, `assertion failed`, `assertion failed: <a> != <b>`, `undefined name` (runtime), `cannot assign to immutable variable` (runtime), `invalid assignment target`, `cannot assign field on non-struct`, `unknown binary/unary/compound operator`, `cannot index-assign into non-array/map`, `cannot index into <type>`, `cannot access field on <type>`, `no method on <type>`, `spread base is not a struct`, `cannot apply tuple field to non-tuple`, `int/float: cannot parse`, `push/pop/map/filter/reduce: expected array`, `len: unsupported value`, `Maximum call stack size exceeded`).

Each error has a cause, a fix, and a bad→good example. The catalog is the place to look when you see an error you don't understand.

---

## 7.7 Eight runnable examples

**1. `Result` for fallible division.**

```aether
fn divide(a: int, b: int) -> result<int, string> {
  if b == 0 { Result::Err("div by zero") } else { Result::Ok(a / b) }
}
match divide(10, 2) {
  Result::Ok(q) => print(q),
  Result::Err(e) => print(f"err: {e}"),
}
```

**2. `?` to propagate.**

```aether
fn parse(s: string) -> result<int, string> {
  if s == "42" { Result::Ok(42) } else { Result::Err("bad") }
}
fn dbl(s: string) -> result<int, string> {
  let n = parse(s)?;
  Result::Ok(n * 2)
}
print(dbl("42"));
print(dbl("x"));
```

**3. `Option` and `?`.**

```aether
fn first<T>(xs: [T]) -> option<T> {
  if len(xs) > 0 { Option::Some(xs[0]) } else { Option::None }
}
fn dbl_first(xs: [int]) -> option<int> {
  let x = first(xs)?;
  Option::Some(x * 2)
}
print(dbl_first([1, 2]));
print(dbl_first([]));
```

**4. `panic` for invariant violation.**

```aether
fn fact(n: int) -> int {
  if n < 0 { panic("n must be non-negative"); }
  if n <= 1 { 1 } else { n * fact(n - 1) }
}
print(fact(5));
```

**5. `assert` for preconditions.**

```aether
fn sqrt_safe(n: float) -> float {
  assert(n >= 0, "n must be non-negative");
  sqrt(n)
}
print(sqrt_safe(16.0));
```

**6. `assert_eq` for tests.**

```aether
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
assert_eq(fib(10), 55);
assert_eq(fib(15), 610);
print("all tests pass");
```

**7. Chaining `?` for a parser.**

```aether
fn parse_int(s: string) -> result<int, string> {
  if s == "42" { Result::Ok(42) } else { Result::Err("not 42") }
}
fn parse_pair(s1: string, s2: string) -> result<(int, int), string> {
  let a = parse_int(s1)?;
  let b = parse_int(s2)?;
  Result::Ok((a, b))
}
print(parse_pair("42", "42"));
print(parse_pair("42", "x"));
```

**8. `match` on `Result` as an expression.**

```aether
fn divide(a: int, b: int) -> result<int, string> {
  if b == 0 { Result::Err("div by zero") } else { Result::Ok(a / b) }
}
let r = divide(10, 0);
let msg = match r {
  Result::Ok(q) => f"ok: {q}",
  Result::Err(e) => f"err: {e}",
};
print(msg);
```

---

## 7.8 Summary

- Two kinds of errors: `Result<T, E>` (recoverable) and `panic` (unrecoverable).
- `Result<T, E>` is a built-in enum with `Ok(T)` and `Err(E)` arms. Match to handle; `?` to propagate.
- `?` short-circuits: if the operand is `Err`/`None`, the function returns that error immediately. The error type must unify with the enclosing function's error type.
- `panic(msg)` throws a `PanicSignal` that unwinds and stops the program. Use for invariant violations, unreachable code, and `assert`/`assert_eq` failures.
- The error catalog lists 60+ errors by stage (lex, parse, type, runtime) with cause, fix, and example for each.
- The playground's lenient semantics mean type errors don't block execution — you see both the type error and the runtime output. This is for teaching.

The next chapter is the standard library tour: 18 modules, with one or two examples each.
