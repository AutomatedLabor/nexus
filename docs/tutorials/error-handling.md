# Error Handling in Aether

> Audience: anyone writing Aether code that can fail.
> Prerequisites: [language-basics.md](language-basics.md) and
> [types-and-generics.md](types-and-generics.md). 30 minutes.

Aether has two complementary error mechanisms:

- **Values** — `Result<T, E>` for "may fail" and `Option<T>`
  for "may be absent". These are ordinary enums; the `?`
  operator is ordinary syntax sugar for early-return.
- **Panics** — for invariant violations. A panic aborts the
  current task with a message; it is unrecoverable in v1.

This tutorial covers both, plus the patterns that arise:
exhaustive matching, propagation, default values, and panic
vs. error.

## 1. The two mechanisms, summarized

| | `Result` / `Option` | `panic` |
|---|---|---|
| Mechanism | ordinary enum value | runtime abort |
| Recoverable? | yes — pattern match | no in v1 |
| When to use | ordinary failure | invariant violation |
| Syntax | `Result::Ok`, `Result::Err`, `Option::Some`, `Option::None`, `?` | `panic(msg)`, `assert`, `assert_eq` |
| Cost | zero at runtime (just a tag) | aborts the program |

The principle: **errors are values, panics are bugs**. If your
function can fail in a way that the caller should handle, return
`Result`. If your function hits an impossible state, panic.

## 2. `Option<T>` — maybe absent

`Option<T>` is an enum with two variants:

```aether
enum Option<T> { Some(T), None, }
```

It represents "a value that may be absent". There is no `null`
in Aether; you use `Option` instead.

### 2.1 Returning `Option`

```aether
fn lookup(xs: [int], i: int) -> Option<int> {
  if i < 0 { Option::None }
  else if i >= len(xs) { Option::None }
  else { Option::Some(xs[i]) }
}
```

The caller has to handle the `None` case explicitly. The type
checker enforces this — you cannot use an `Option<int>` as an
`int`.

### 2.2 Pattern matching

```aether
match lookup([1, 2, 3], 1) {
  Option::Some(v) => print(f"found {v}"),
  Option::None    => print("not found"),
}
// → found 2
```

The match is exhaustive because you cover both variants. If you
forget one, the compiler will (in v2) reject it; in v1, the
convention is to always include both arms.

### 2.3 `unwrap` with a default

```aether
fn unwrap<T>(o: Option<T>, default: T) -> T {
  match o {
    Option::Some(v) => v,
    Option::None    => default,
  }
}

print(unwrap(lookup([1, 2, 3], 1), 0));    // → 2
print(unwrap(lookup([1, 2, 3], 5), 0));    // → 0
```

This is the "give me a default if absent" pattern. Use it when
the absence is not exceptional and you have a sensible default.

### 2.4 The `?` operator

The `?` postfix operator unwraps an `Option` and early-returns
on `None`:

```aether
fn add_first_two(xs: [int]) -> Option<int> {
  let a = lookup(xs, 0)?;
  let b = lookup(xs, 1)?;
  Option::Some(a + b)
}

match add_first_two([10, 20, 30]) {
  Option::Some(s) => print(s),
  Option::None    => print("not enough elements"),
}
// → 30
```

`lookup(xs, 0)?` evaluates to the inner value if `Some`, or
early-returns `Option::None` from `add_first_two` if `None`.
The `?` is sugar for:

```aether
let a = match lookup(xs, 0) {
  Option::Some(v) => v,
  Option::None    => return Option::None,
};
```

The `?` operator only works on `Option` and `Result` (and only
inside a function that returns an `Option` or `Result`,
respectively). Applying `?` to any other type is a type error:

```aether
fn bad() -> int {
  let x = 5?;
  x
}
// → ? operator can only be applied to Result or Option, found int
```

## 3. `Result<T, E>` — maybe failed

`Result<T, E>` is an enum with two variants:

```aether
enum Result<T, E> { Ok(T), Err(E), }
```

It represents "a computation that may fail with an error of
type `E`". The error type is parameterized, so different
operations can have different error types.

### 3.1 Returning `Result`

```aether
fn parse_int(s: string) -> Result<int, string> {
  // Imagine parsing logic; in v1 you might use a stdlib helper.
  if s == "42" { Result::Ok(42) }
  else { Result::Err(f"not 42: {s}") }
}
```

### 3.2 Pattern matching

```aether
match parse_int("42") {
  Result::Ok(n)  => print(f"got {n}"),
  Result::Err(e) => print(f"error: {e}"),
}
// → got 42

match parse_int("hello") {
  Result::Ok(n)  => print(f"got {n}"),
  Result::Err(e) => print(f"error: {e}"),
}
// → error: not 42: hello
```

### 3.3 The `?` operator on `Result`

```aether
fn double_parse(s: string) -> Result<int, string> {
  let n = parse_int(s)?;
  Result::Ok(n * 2)
}

match double_parse("21") {
  Result::Ok(n)  => print(f"doubled: {n}"),
  Result::Err(e) => print(f"error: {e}"),
}
// → doubled: 42

match double_parse("hello") {
  Result::Ok(n)  => print(f"doubled: {n}"),
  Result::Err(e) => print(f"error: {e}"),
}
// → error: not 42: hello
```

`parse_int(s)?` unwraps the `Ok` value or early-returns
`Result::Err(e)` from `double_parse`. The error type must match:
`double_parse` returns `Result<int, string>`, and `parse_int`
also returns `Result<int, string>`, so the propagation is
direct.

### 3.4 Chaining operations

The `?` operator is most useful when you have a sequence of
operations that can each fail:

```aether
fn read_config(path: string) -> Result<Config, string> {
  let text = read_file(path)?;          // Result<string, string>
  let parsed = parse_config(text)?;     // Result<Config, string>
  Result::Ok(parsed)
}
```

Without `?`, the same code would be a pyramid of nested
`match` expressions. With `?`, it reads top-to-bottom like
synchronous code. This is the killer feature of `Result`.

### 3.5 Different error types

If two operations have different error types, you need to
convert one to the other. In v1, the conversion is manual
because there is no `From` trait:

```aether
enum IoError { NotFound, Permission, }
enum AppError { Io(IoError), Parse(string), }

fn read_and_parse(path: string) -> Result<int, AppError> {
  let text = match read_file(path) {
    Result::Ok(t)   => t,
    Result::Err(e)  => return Result::Err(AppError::Io(e)),
  };
  let n = match parse_int(text) {
    Result::Ok(v)   => v,
    Result::Err(e)  => return Result::Err(AppError::Parse(e)),
  };
  Result::Ok(n)
}
```

In v2, the `?` operator will use the `From` trait to convert
automatically. See
[../spec/08-error-handling.md](../spec/08-error-handling.md)
§2.2 for the design.

## 4. Panic — unrecoverable

A panic aborts the current task with a message. In v1, there
is no recovery: the evaluator stops and reports the message to
the host. The playground shows the panic message in the Output
pane.

### 4.1 `panic`

```aether
fn factorial(n: int) -> int {
  if n < 0 { panic("factorial of negative number"); }
  if n <= 1 { 1 } else { n * factorial(n - 1) }
}

print(factorial(5));     // → 120
print(factorial(-1));    // → panic: factorial of negative number
```

`panic(msg)` throws a runtime error. The message is the
argument. In v1, the panic message is displayed verbatim in the
output pane.

### 4.2 `assert` and `assert_eq`

```aether
fn sqrt(n: float) -> float {
  assert(n >= 0);
  // ... pretend to compute sqrt
  n
}

fn parse_strict(s: string) -> int {
  let n = int(s);
  assert_eq(n, 42);
  n
}
```

`assert(cond)` panics with `assertion failed` if `cond` is
false. `assert_eq(a, b)` panics with `assertion failed: A != B`
if `a` and `b` are not deep-equal.

These are for invariant violations, not for ordinary error
handling. Use `Result` for "the user gave me bad input"; use
`assert` for "the caller violated a documented precondition".

### 4.3 Implicit panics

Some operations panic implicitly:

- **Array index out of bounds.** `xs[10]` on a 3-element array
  panics with `array index out of bounds: 10`.
- **Map key missing.** `m["missing"]` panics with `map key
  not found: "missing"`.
- **Division by zero.** `7 / 0` panics with `division by zero`.
- **Modulo by zero.** `7 % 0` panics with `modulo by zero`.
- **Step limit exceeded.** Infinite loops hit the step limit
  and panic with `execution step limit exceeded (1000000)`.
- **No match arm matched.** A `match` that falls through all
  arms panics with `no match arm matched` (in v1; v2 will
  enforce exhaustiveness at compile time).
- **`?` on `Err` outside a function returning `Result`.** v1
  panics if the `?` cannot find an enclosing `Result`-returning
  function. (This should be a type error, but v1's flow analysis
  is limited; see [error-catalog.md](../reference/error-catalog.md).)

The full catalog of runtime panics is in
[../reference/error-catalog.md](../reference/error-catalog.md).

### 4.4 When to panic vs. return `Result`

Panic when:

- The caller violated a documented precondition (negative
  input to `factorial`).
- An invariant has been broken (a value that the type system
  should have prevented but did not in v1).
- The program is in an unrecoverable state (out of memory,
  corrupted state).

Return `Result` when:

- The operation can fail in an ordinary way (file not found,
  parse error, network timeout).
- The caller should decide what to do (retry, log, propagate).
- The failure is a value, not a control-flow event.

The boundary is judgment. The principle: panic if the caller
*cannot* recover; return `Result` if the caller *might want
to*.

## 5. Error propagation patterns

### 5.1 The `?` chain

```aether
fn load_user(id: int) -> Result<User, string> {
  let text = read_file(f"/users/{id}")?;
  let user = parse_user(text)?;
  Result::Ok(user)
}
```

This is the canonical pattern. Each `?` propagates an error;
the function returns the first error or the final `Ok` value.

### 5.2 Pattern match with `match`

```aether
fn load_user(id: int) -> Result<User, string> {
  match read_file(f"/users/{id}") {
    Result::Ok(text) => match parse_user(text) {
      Result::Ok(user) => Result::Ok(user),
      Result::Err(e)   => Result::Err(e),
    },
    Result::Err(e) => Result::Err(e),
  }
}
```

This is the long form. It is more verbose but more explicit.
Use it when you need to do something other than propagate (log
the error, transform it, fall back to a default).

### 5.3 Map the error

```aether
fn load_user(id: int) -> Result<User, AppError> {
  let text = match read_file(f"/users/{id}") {
    Result::Ok(t)  => t,
    Result::Err(e) => return Result::Err(AppError::Io(e)),
  };
  let user = match parse_user(text) {
    Result::Ok(u)  => u,
    Result::Err(e) => return Result::Err(AppError::Parse(e)),
  };
  Result::Ok(user)
}
```

Use this when you want to convert between error types. In v2,
the `?` operator will do this automatically via the `From`
trait; in v1, the conversion is manual.

### 5.4 Default on error

```aether
fn load_user_or_default(id: int) -> User {
  match load_user(id) {
    Result::Ok(u)  => u,
    Result::Err(_) => User { id: id, name: "anonymous" },
  }
}
```

Use this when the error is not important and you have a sensible
default. The `_` pattern discards the error; the function always
returns a `User`.

### 5.5 Try multiple things

```aether
fn load_user_smart(id: int) -> Result<User, string> {
  match load_from_cache(id) {
    Result::Ok(u) => Result::Ok(u),
    Result::Err(_) => load_from_disk(id),
  }
}
```

Use this when you want to fall back to a secondary source on
error. The first error is discarded; the second result is
returned.

### 5.6 Log and propagate

```aether
fn load_user_logged(id: int) -> Result<User, string> {
  let result = load_user(id);
  match result {
    Result::Ok(_)  => { /* success: no log */ },
    Result::Err(e) => print(f"warning: load_user({id}) failed: {e}"),
  }
  result
}
```

Use this when you want to log errors but still propagate them.
The `match` produces `()` (because both arms return unit), and
the function returns the original `result`.

## 6. `Option` vs. `Result`

When do you use `Option` and when do you use `Result`?

- Use `Option` when the absence is **expected**, not an error.
  Examples: looking up a key in a map (the key may not be
  present, that is fine); finding an element in an array (the
  element may not match, that is fine).
- Use `Result` when the failure is **exceptional**, an error
  worth reporting. Examples: parsing a string (the string may
  be invalid); reading a file (the file may not exist); making
  a network request (the request may fail).

The boundary is judgment. A common rule of thumb: if the caller
would say "what went wrong?", use `Result`; if the caller would
say "was it there?", use `Option`.

## 7. Common pitfalls

### 7.1 Forgetting the `None` arm

```aether
fn bad(o: Option<int>) -> int {
  match o { Option::Some(v) => v }
  // → no match arm matched (runtime panic) when o is None
}
```

Always include the `None` arm. In v2, the compiler will reject
this at compile time; in v1, the convention is to always include
both arms.

### 7.2 Ignoring a `Result`

```aether
fn bad() {
  let _ = parse_int("hello");   // result discarded
  print("done");
}
// → done  (silently swallowed the error)
```

If you really mean to discard the result, write `let _ = ...`
to make it explicit. The linter (planned for v2) will warn on
discarded `Result` values that are not explicitly bound to `_`.

### 7.3 Using `panic` for ordinary failure

```aether
fn bad(s: string) -> int {
  let n = int(s);   // panics on invalid input
  n
}
```

If the input can be invalid, return `Result`. `panic` is for
invariants, not for bad input.

### 7.4 Mixing error types

```aether
enum AppError { Io(IoError), Parse(ParseError), }

fn bad(s: string) -> Result<int, AppError> {
  let n = parse_int(s)?;   // parse_int returns Result<int, string>
  // → type error: cannot convert Result<int, string> to Result<int, AppError>
}
```

In v1, you must convert manually. See §5.3 above.

### 7.5 Using `?` outside a `Result`-returning function

```aether
fn bad(s: string) -> int {
  let n = parse_int(s)?;   // ? but bad returns int, not Result
  n
}
// → type error: enclosing function must return Result or Option
```

The `?` operator needs an enclosing function that returns a
compatible `Result` or `Option`. The type checker enforces this.

## 8. A worked example: a small file pipeline

Here is a small program that uses most of the patterns above.
It is a sketch — the actual `read_file` and `parse_csv` are
stdlib functions, not v1 builtins — but the shape is real:

```aether
enum AppError {
  FileNotFound(string),
  Parse(string),
  Empty,
}

fn read_config(path: string) -> Result<string, AppError> {
  // Imagine a stdlib read_file.
  if path == "" {
    Result::Err(AppError::FileNotFound("empty path"))
  } else {
    Result::Ok("name,age\nAlice,30\nBob,25")
  }
}

fn parse_csv(text: string) -> Result<[string], AppError> {
  let lines = split(text, "\n");
  if len(lines) < 2 { Result::Err(AppError::Empty) }
  else { Result::Ok(lines) }
}

fn load_people(path: string) -> Result<[string], AppError> {
  let text = read_config(path)?;
  let lines = parse_csv(text)?;
  Result::Ok(lines)
}

match load_people("users.csv") {
  Result::Ok(lines) => {
    for l in lines { print(l); }
  },
  Result::Err(e) => {
    match e {
      AppError::FileNotFound(p) => print(f"file not found: {p}"),
      AppError::Parse(m)        => print(f"parse error: {m}"),
      AppError::Empty           => print("empty input"),
    }
  },
}
```

This example uses:

- A custom `AppError` enum with three variants.
- The `?` operator to propagate errors through `load_people`.
- A `match` at the top level that handles each error variant
  explicitly.
- The `split` stdlib function.

## 9. Where to go next

- **[../reference/error-catalog.md](../reference/error-catalog.md)**
  — every error message the compiler and runtime can produce,
  with bad → good examples.
- **[../spec/08-error-handling.md](../spec/08-error-handling.md)**
  — the spec for v2 error handling, including `try`/`catch`
  blocks and the `From` trait.
- **[../guides/idiomatic-aether.md](../guides/idiomatic-aether.md)**
  — patterns for using `Result` and `Option` idiomatically.
- **[../guides/anti-patterns.md](../guides/anti-patterns.md)**
  — error-handling anti-patterns to avoid.

Aether's error handling is "values, not exceptions" — like Rust
and Go, not like Python and JavaScript. The pattern is simple
to learn, composes well, and forces you to think about failure
at the type level. The cost is some boilerplate; the `?`
operator and (in v2) the `From` trait keep the boilerplate
small.
