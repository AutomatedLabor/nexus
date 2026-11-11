# Error handling

> Audience: you want to know how Aether programs fail, how to recover, and how to surface problems to users.
> Time: ~30 minutes. Every example is runnable.

Aether has two complementary error mechanisms:

1. **Panics** — unrecoverable. `panic(msg)`, index-out-of-bounds, division by zero, no match arm matched, missing struct field, undefined name. The program aborts; the runtime captures the message in `runtime.error`; output emitted before the panic is preserved.
2. **`Result<T, E>`** — recoverable. A value that's either `Ok(v)` (the success) or `Err(e)` (the error). The `?` operator propagates the error to the caller. Functions that can fail return `Result`; callers decide whether to handle or propagate.

This tutorial covers both, plus the `Option<T>` parallel for absence, plus the patterns you'll use 90% of the time.

---

## 1. Panics — unrecoverable errors

A panic aborts the program. There is no `try/catch` in v1 — once a panic fires, the program is done.

### `panic(msg)`

```aether
fn divide(a: int, b: int) -> int {
  if b == 0 {
    panic("division by zero");
  }
  a / b
}

print(divide(10, 2));   // 5
print(divide(10, 0));    // panics: "division by zero"
```

`panic(msg)` throws a `PanicSignal` (see `aether/core/eval/eval.ts`). The signal is caught at the top-level `run`, which records the message in `runtime.error.message` and stops executing. The Output tab shows whatever was printed before the panic.

### Implicit panics

Several runtime conditions panic automatically:

```aether
let xs = [1, 2, 3];
print(xs[5]);           // panic: array index out of bounds: 5

let m = mapNew();
mapSet(m, "a", 1);
print(mapGet(m, "b"));  // panic: map key not found: "b" — actually, mapGet panics if absent;
                        // use mapHas first

print(10 / 0);          // panic: division by zero
print(10 % 0);          // panic: modulo by zero

struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
match p {
  Point { x: _, y: 0 } => "on axis",
  // no other arm
}
// if the match doesn't match the first arm, panic: no match arm matched

print(undefined_thing); // panic: undefined name 'undefined_thing'
                        // — actually this is a *type* error caught before run, but if it slipped through,
                        // runtime panic
```

The full list of implicit panics (from `aether/core/eval/eval.ts`):

- `array index out of bounds: N`
- `string index out of bounds: N`
- `tuple index out of bounds: N`
- `map key not found: <key>`
- `division by zero`
- `modulo by zero`
- `no match arm matched`
- `cannot call non-function value <...>`
- `cannot index into <type>`
- `struct <Name> has no field '<field>'`
- `cannot access field '<field>' on <type>`
- `? operator applied to non-Result/Option: <value>`
- `cannot iterate over <type>`
- `execution step limit exceeded (N)`
- `assertion failed` / `assertion failed: <a> != <b>`

Each of these is documented in the [error catalog](../reference/error-catalog.md) with a cause and a fix.

### When to panic

Panic when:

- The program is in a state that shouldn't be possible (a `match` arm that should never fire because the precondition was checked earlier).
- The caller violated a precondition (passing a negative index to a function that requires non-negative).
- An operation that should never fail failed (e.g., parsing a string that the program just constructed, so it can't be invalid).

Don't panic when:

- The error is expected (a file might not exist, a network request might time out, a parse might fail). Return `Result` instead.
- The error is recoverable (the caller might want to retry, ignore, or transform). Return `Result` instead.

### `assert` and `assert_eq` — panics for testing

```aether
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}

assert(fib(10) == 55);              // panics if false
assert_eq(fib(10), 55);             // panics if a != b
assert_eq(fib(10), 55, "fib(10) should be 55");  // optional message
```

`assert(cond)` panics with `assertion failed` (or `assertion failed: <msg>` if a third argument is given) when `cond` is false. `assert_eq(a, b)` panics with `assertion failed: <a> != <b>` when `a` and `b` aren't deeply equal.

These are inline builtins, always in scope. They're the primary testing mechanism in v1 (see [testing.md](testing.md)). They compose with `Result` — you can `assert_eq(parse("42"), Result::Ok(42));` and have it panic with a useful message if the parse fails.

---

## 2. `Result<T, E>` — recoverable errors

`Result<T, E>` is an enum (one of two standard prelude enums, the other being `Option<T>`):

```aether
enum Result<T, E> { Ok(T), Err(E), }
```

A function that can fail returns `Result<T, E>`. The caller has to handle both cases — either by pattern matching, by `?` propagation, or by `unwrap` (which panics on `Err`).

### Construction

```aether
let ok: result<int, string> = Result::Ok(42);
let err: result<int, string> = Result::Err("oh no");
```

`Result::Ok(v)` constructs the success variant carrying `v`. `Result::Err(e)` constructs the error variant carrying `e`. The type is `result<T, E>` (lowercase, like all built-in generic types).

### Pattern matching

```aether
fn parse_int(s: string) -> result<int, string> {
  // imagine a real implementation
  if s == "42" {
    Result::Ok(42)
  } else if s == "7" {
    Result::Ok(7)
  } else {
    Result::Err(f"not a number: {s}")
  }
}

match parse_int("42") {
  Result::Ok(n)  => print(f"got {n}"),         // got 42
  Result::Err(e) => print(f"error: {e}"),
}

match parse_int("hello") {
  Result::Ok(n)  => print(f"got {n}"),
  Result::Err(e) => print(f"error: {e}"),       // error: not a number: hello
}
```

The `match` forces both arms; you can't forget to handle the error case (well, v1 doesn't enforce exhaustiveness, so you could write only the `Ok` arm and panic at runtime, but the idiomatic code handles both).

### The `?` operator — propagate errors

`expr?` either unwraps an `Ok(v)` to `v`, or returns `Err(e)` from the enclosing function (with `e` from the `Err`).

```aether
fn parse_and_double(s: string) -> result<int, string> {
  let n = parse_int(s)?;       // unwrap Ok, propagate Err
  Result::Ok(n * 2)
}

match parse_and_double("42") {
  Result::Ok(n)  => print(f"got {n}"),           // got 84
  Result::Err(e) => print(f"error: {e}"),
}

match parse_and_double("hello") {
  Result::Ok(n)  => print(f"got {n}"),
  Result::Err(e) => print(f"error: {e}"),        // error: not a number: hello
}
```

`let n = parse_int(s)?;` does:

1. Evaluate `parse_int(s)` — gives `Result<int, string>`.
2. Pattern-match: if `Ok(v)`, evaluate to `v` and bind `n = v`.
3. If `Err(e)`, `return Result::Err(e)` from `parse_and_double` immediately.

The enclosing function's return type must be compatible — `parse_and_double` returns `result<int, string>`, which is the same `Err` type as `parse_int`. If the types don't match (e.g., the caller returns `result<int, bool>`), the type checker rejects with `cannot unify string with bool` or similar.

### `?` on `Option`

`?` also works on `Option<T>` — it unwraps `Some(v)` to `v`, and returns `None` from the enclosing function (whose return type must be `option<U>`).

```aether
fn first_even(xs: [int]) -> Option<int> {
  for x in xs {
    if x % 2 == 0 {
      return Option::Some(x);
    }
  }
  Option::None
}

fn first_even_doubled(xs: [int]) -> Option<int> {
  let x = first_even(xs)?;     // unwrap Some, propagate None
  Option::Some(x * 2)
}

match first_even_doubled([1, 3, 5, 8]) {
  Option::Some(n) => print(f"got {n}"),         // got 16
  Option::None => print("no even"),
}

match first_even_doubled([1, 3, 5]) {
  Option::Some(n) => print(f"got {n}"),
  Option::None => print("no even"),             // no even
}
```

`?` on `Option` propagates `None`; `?` on `Result` propagates `Err`. The type checker rejects `?` on a non-Result/Option with `? operator can only be applied to Result or Option, found <type>`.

### Chaining `?` — the common pattern

```aether
fn read_int(s: string) -> result<int, string> {
  let n = parse_int(s)?;
  if n < 0 {
    Result::Err(f"negative: {n}")
  } else {
    Result::Ok(n)
  }
}

fn read_two_ints(a: string, b: string) -> result<(int, int), string> {
  let x = read_int(a)?;
  let y = read_int(b)?;
  Result::Ok((x, y))
}

match read_two_ints("3", "4") {
  Result::Ok((x, y)) => print(f"{x} + {y} = {x + y}"),   // 3 + 4 = 7
  Result::Err(e) => print(f"error: {e}"),
}

match read_two_ints("3", "-4") {
  Result::Ok((x, y)) => print(f"{x} + {y} = {x + y}"),
  Result::Err(e) => print(f"error: {e}"),                 // error: negative: -4
}

match read_two_ints("3", "x") {
  Result::Ok((x, y)) => print(f"{x} + {y} = {x + y}"),
  Result::Err(e) => print(f"error: {e}"),                 // error: not a number: x
}
```

Each `?` is an early-exit point. The function reads top-to-bottom as "do step 1, do step 2, do step 3, return the result" — the error propagation is implicit but visible at every `?`. This is the Rust pattern (and the OCaml `let*` / Haskell `do` pattern), and it's the recommended style in Aether for chains of fallible operations.

### `unwrap` — explicit panic on error

Aether v1 doesn't have a built-in `unwrap` method on `Result`/`Option` — but you can write one:

```aether
fn unwrap<T, E>(r: result<T, E>) -> T {
  match r {
    Result::Ok(v)  => v,
    Result::Err(e) => panic(f"called unwrap on Err: {e}"),
  }
}

fn unwrap_or<T, E>(r: result<T, E>, default: T) -> T {
  match r {
    Result::Ok(v)  => v,
    Result::Err(_) => default,
  }
}

print(unwrap(parse_int("42")));            // 42
print(unwrap_or(parse_int("hello"), 0));   // 0
// print(unwrap(parse_int("hello")));      // panics: called unwrap on Err: not a number: hello
```

`unwrap` is "I'm sure this is Ok, panic if not". Use it for prototyping, for tests, for cases where the error is genuinely impossible. For production code, prefer `?` or explicit `match`.

### `map`, `and_then` — combinators (write your own)

The v1 stdlib doesn't ship `map`/`and_then` for `Result` (the inline `map` is for arrays). You can write them:

```aether
fn result_map<T, E, U>(r: result<T, E>, f: fn(T) -> U) -> result<U, E> {
  match r {
    Result::Ok(v)  => Result::Ok(f(v)),
    Result::Err(e) => Result::Err(e),
  }
}

fn result_and_then<T, E, U>(r: result<T, E>, f: fn(T) -> result<U, E>) -> result<U, E> {
  match r {
    Result::Ok(v)  => f(v),
    Result::Err(e) => Result::Err(e),
  }
}

let r = result_map(parse_int("42"), fn(n: int) -> int { n * 2 });
print(r);   // Ok(42) -> Ok(84)
```

These are useful when you want to transform a `Result` without consuming it. In v2 the stdlib will include them as methods; see [RFC-003 modules and packages](../rfcs/rfc-003-modules-and-packages.md).

---

## 3. `Option<T>` — absence

`Option<T>` is the other standard prelude enum:

```aether
enum Option<T> { Some(T), None, }
```

It represents "maybe a T". Where `Result` is for fallibility, `Option` is for absence. Use it where you'd use `null` in TypeScript or `None` in Python.

### Construction

```aether
let some: option<int> = Option::Some(42);
let none: option<int> = Option::None;
```

### Pattern matching

```aether
fn first_even(xs: [int]) -> Option<int> {
  for x in xs {
    if x % 2 == 0 { return Option::Some(x); }
  }
  Option::None
}

match first_even([1, 3, 5, 8]) {
  Option::Some(n) => print(f"got {n}"),       // got 8
  Option::None => print("no even"),
}
```

### `?` on Option

```aether
fn first_even_doubled(xs: [int]) -> Option<int> {
  let n = first_even(xs)?;
  Option::Some(n * 2)
}
```

Same as `?` on `Result`, but propagates `None`.

### `unwrap_or`

```aether
fn unwrap_or<T>(o: option<T>, default: T) -> T {
  match o {
    Option::Some(v) => v,
    Option::None => default,
  }
}

print(unwrap_or(first_even([1, 3, 5]), 0));   // 0
print(unwrap_or(first_even([2, 4, 6]), 0));   // 2
```

### When `Option`, when `Result`?

Use `Option` when "no value" is a normal outcome — looking up a key in a map, finding an element in an array, parsing an optional argument. Use `Result` when "error" carries information — a parse failure with a message, a network error with a status code, a validation error with a field name.

If you find yourself writing `Result<T, ()>` (error type is unit), you probably want `Option<T>`. If you find yourself writing `Option<T>` with the `None` case always accompanied by a separate error message variable, you probably want `Result<T, string>`.

---

## 4. Error type design

The `E` in `Result<T, E>` can be any type. Common choices:

### `Result<T, string>` — a message

```aether
fn parse_int(s: string) -> result<int, string> {
  if s == "42" { Result::Ok(42) }
  else { Result::Err(f"not a number: {s}") }
}
```

The simplest. Use when the error is just a description. The downside: callers can't programmatically distinguish error kinds (without string-matching, which is fragile).

### `Result<T, MyError>` — a custom enum

```aether
enum ParseError {
  Empty,
  NotANumber(string),
  OutOfRange(int),
}

fn parse_range(s: string, lo: int, hi: int) -> result<int, ParseError> {
  if len(s) == 0 {
    Result::Err(ParseError::Empty)
  } else if s == "42" {
    Result::Err(ParseError::NotANumber(s))
  } else {
    // imagine a real implementation
    Result::Ok(42)
  }
}

match parse_range("hello", 0, 100) {
  Result::Ok(n)  => print(f"got {n}"),
  Result::Err(ParseError::Empty)         => print("empty input"),
  Result::Err(ParseError::NotANumber(s)) => print(f"not a number: {s}"),
  Result::Err(ParseError::OutOfRange(n)) => print(f"out of range: {n}"),
}
```

The caller can pattern-match on the error kind and react differently. This is the Rust idiom and the recommended style for libraries.

### `Result<T, [ErrorKind]>` — multiple errors

If you want to accumulate multiple errors (e.g., during validation), return a `Result<T, [ParseError]>`:

```aether
fn validate(xs: [int]) -> result<int, [string]> {
  let mut errors = [];
  let mut sum = 0;
  for x in xs {
    if x < 0 { push(errors, f"negative: {x}"); }
    sum = sum + x;
  }
  if len(errors) > 0 {
    Result::Err(errors)
  } else {
    Result::Ok(sum)
  }
}

match validate([1, -2, 3, -4]) {
  Result::Ok(s)  => print(f"sum = {s}"),
  Result::Err(es) => {
    for e in es { print(f"error: {e}"); }
  },
}
```

The v1 stdlib doesn't have a multi-error data type; this is a hand-rolled pattern. v2 may add one.

---

## 5. Patterns — propagating, mapping, and recovering

### Propagate with `?`

The default. Use when the caller can't usefully handle the error and should let it bubble up.

```aether
fn read_config() -> result<Config, string> {
  let raw = read_file("config.json")?;
  let parsed = parse_config(raw)?;
  Result::Ok(parsed)
}
```

### Recover with `unwrap_or`

```aether
let port = unwrap_or(parse_int(env("PORT")), 8080);   // 8080 if PORT unset/invalid
```

Provide a default value when the error is recoverable.

### Recover with `match`

```aether
let n = match parse_int(input) {
  Result::Ok(v)  => v,
  Result::Err(_) => 0,     // default on error
};
```

More verbose than `unwrap_or`, but lets you log the error or compute a different default per error kind.

### Transform with `result_map`

```aether
let doubled = result_map(parse_int("42"), fn(n: int) -> int { n * 2 });
```

Useful when you want to apply a function to the `Ok` value but propagate the `Err` unchanged. In v1 you write `result_map` yourself (see §2 above); v2 will have it as a method.

### Recover from a panic — you can't

v1 has no `try/catch`. A panic is unrecoverable. If you want recoverable behavior, use `Result` from the start — don't `panic` and hope to catch it later.

The v2 plan adds a `catch_panic` style mechanism for the rare cases where you genuinely need to catch a panic (e.g., calling into a third-party parser you don't trust). See [RFC-002 bytecode VM](../rfcs/rfc-002-bytecode-vm.md).

---

## 6. A worked example — a small CLI argument parser

```aether
enum CliError {
  MissingFlag(string),
  InvalidValue(string, string),
}

struct Args {
  host: string,
  port: int,
}

fn parse_args(args: [string]) -> result<Args, CliError> {
  let mut host = "localhost";
  let mut port = 8080;
  let mut i = 0;
  while i < len(args) {
    let a = args[i];
    if a == "--host" {
      if i + 1 >= len(args) {
        return Result::Err(CliError::MissingFlag("--host"));
      }
      host = args[i + 1];
      i = i + 2;
    } else if a == "--port" {
      if i + 1 >= len(args) {
        return Result::Err(CliError::MissingFlag("--port"));
      }
      let s = args[i + 1];
      match parse_int_simple(s) {
        Result::Ok(n) => {
          port = n;
          i = i + 2;
        },
        Result::Err(_) => return Result::Err(CliError::InvalidValue("--port", s)),
      }
    } else {
      i = i + 1;
    }
  }
  Result::Ok(Args { host, port })
}

fn parse_int_simple(s: string) -> result<int, string> {
  if s == "8080" { Result::Ok(8080) }
  else if s == "3000" { Result::Ok(3000) }
  else { Result::Err(f"not a port: {s}") }
}

let test_args = ["--host", "example.com", "--port", "3000"];
match parse_args(test_args) {
  Result::Ok(args) => print(f"host={args.host} port={args.port}"),  // host=example.com port=3000
  Result::Err(CliError::MissingFlag(f))        => print(f"missing value for {f}"),
  Result::Err(CliError::InvalidValue(f, v))   => print(f"invalid value for {f}: {v}"),
}
```

This uses every pattern: an enum of error kinds, a struct for the success value, `Result<T, E>` as the return type, pattern matching on the error, and the `?`-style would propagate but here we use `return` explicitly because the error types differ.

---

## 7. Common pitfalls

### Forgetting the `Err` arm

```aether
match parse_int("42") {
  Result::Ok(n) => print(n),
  // forgot Err arm — runtime panics with "no match arm matched" if input is "hello"
}
```

The v1 type checker doesn't enforce exhaustiveness. Add the `Err` arm or a wildcard.

### Wrong `Err` type with `?`

```aether
fn parse_int(s: string) -> result<int, string> {
  Result::Ok(42)
}

fn foo() -> result<int, bool> {       // returns Err(bool)
  let n = parse_int("?")?;            // Err is string — type mismatch
  Result::Ok(n)
}
```

`?` propagates the `Err` of the source, so the enclosing function's `Err` type must match. The type checker will report `cannot unify string with bool`.

### `unwrap` on `Err`

```aether
let n = unwrap(parse_int("hello"));   // panic: called unwrap on Err: ...
```

`unwrap` is for "I'm sure this is Ok". If you're not sure, use `?` or `unwrap_or`.

### Panicking where you should `Result`

```aether
fn divide(a: int, b: int) -> int {
  if b == 0 { panic("div by zero"); }   // forces caller to check before calling
  a / b
}

// vs.

fn divide_safe(a: int, b: int) -> result<int, string> {
  if b == 0 { Result::Err("div by zero") }
  else { Result::Ok(a / b) }
}
```

`panic` is for *programmer* errors (the caller violated a contract). `Result` is for *expected* errors (the operation is fallible). Choose based on who's responsible: if the caller should have checked, panic; if the operation is naturally fallible, `Result`.

---

## 8. What's next

- [testing.md](testing.md) — `assert`, `assert_eq`, the planned test runner.
- [stdlib-tour.md](stdlib-tour.md) — the io, regex, encoding modules, which return `Result` for fallible operations.
- [reference/error-catalog.md](../reference/error-catalog.md) — every error message, decoded.
- [decisions/adr-09-vitest-for-implementation-tests.md](../decisions/adr-09-vitest-for-implementation-tests.md) — the test runner design.

Aether's error story is, in three sentences: panic for programmer errors and unrecoverable conditions, `Result<T, E>` for expected errors, `?` to propagate, `Option<T>` for absence. There's no `try/catch` in v1 — panics are unrecoverable. v2 may add a `catch_panic` for the rare cases where you need to recover from a panic you didn't author.
