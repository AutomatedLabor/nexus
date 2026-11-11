# Idiomatic Aether

> Audience: someone who has finished the tutorials and wants to
> know what "good" Aether looks like.
> Prerequisites: all ten tutorials. 40 minutes.

This guide presents 20 patterns that, taken together, define
idiomatic Aether. Each pattern has a name, a short rationale,
and a runnable example.

The patterns cluster into five groups:

- **Bindings** (1-4): how to introduce names.
- **Types** (5-9): how to model data.
- **Control flow** (10-13): how to branch, loop, and dispatch.
- **Errors** (14-17): how to handle failure.
- **Style** (18-20): how to organize code.

For the anti-patterns this guide is the inverse of, see
[anti-patterns.md](anti-patterns.md).

## Pattern 1: `let` by default, `let mut` when you must

`let` is the default binding form. Use `let mut` only when you
genuinely need to reassign.

```aether
// Idiomatic.
let x = 42;
let name = "Alice";
let xs = [1, 2, 3];

// Idiomatic for accumulators.
let mut sum = 0;
for x in xs { sum = sum + x; }

// Anti-pattern: mut where you do not need it.
let mut pi = 3.14159;   // pi is never reassigned
```

The principle: mutation is a side effect. Use it where the
mutation is the point; do not use it where a fresh `let` would
do.

## Pattern 2: `const` for compile-time constants

Use `const` for values that are known at compile time and will
not change in any version of the program. Physical constants,
configuration values, magic numbers — these are `const`.

```aether
const PI: float = 3.14159;
const MAX_RETRIES: int = 3;
const GREETING: string = "hello, world";

let area = PI * r * r;
```

In v1, `const` is mostly cosmetic — the evaluator treats it
like `let` — but the convention signals intent. The v2 linter
will prefer `const` for compile-time-known values.

## Pattern 3: Annotate function signatures, infer locals

Function signatures should have explicit type annotations on
parameters and return types. Local variables can rely on
inference.

```aether
// Idiomatic: explicit params and return.
fn add(a: int, b: int) -> int { a + b }

// Idiomatic: inferred local.
let total = add(2, 3);

// Anti-pattern: redundant local annotation.
let total: int = add(2, 3);
```

The principle: type annotations at boundaries (function
signatures, public APIs), inference within. This makes the
code easier to read and easier to refactor.

## Pattern 4: Use `type` aliases for domain meaning

Type aliases make code self-documenting. A `UserId` is clearer
than an `int`.

```aether
type UserId = int;
type EmailAddress = string;
type Timestamp = int;

fn get_user(id: UserId) -> User { ... }
fn send_email(to: EmailAddress, body: string) -> () { ... }
fn now() -> Timestamp { ... }
```

In v1, type aliases are transparent — the compiler does not
distinguish `UserId` from `int`. Use them anyway; the v2 plan
adds newtype wrappers that make them distinct.

## Pattern 5: Use `Option` for absence, `Result` for failure

There is no `null` in Aether. Use `Option<T>` for "may be
absent" and `Result<T, E>` for "may fail".

```aether
// Idiomatic: Option for absence.
fn lookup(xs: [int], i: int) -> Option<int> {
  if i < 0 || i >= len(xs) { Option::None }
  else { Option::Some(xs[i]) }
}

// Idiomatic: Result for failure.
fn parse_int(s: string) -> Result<int, string> {
  // ... parsing logic
  Result::Ok(42)
}

// Anti-pattern: using -1 as a sentinel.
fn lookup_bad(xs: [int], i: int) -> int {
  if i < 0 || i >= len(xs) { -1 }
  else { xs[i] }
}
```

The principle: encode the possibility of absence/failure in
the type, not in a magic value.

## Pattern 6: Use `enum` for closed sets of alternatives

When a value can be one of N distinct things, model it as an
enum. The compiler (in v2) will enforce exhaustive matching.

```aether
// Idiomatic.
enum HttpStatus {
  Ok,
  NotFound,
  ServerError(int),
}

fn describe(s: HttpStatus) -> string {
  match s {
    HttpStatus::Ok           => "ok",
    HttpStatus::NotFound     => "not found",
    HttpStatus::ServerError(c) => f"server error {c}",
  }
}

// Anti-pattern: int codes.
let status = 200;
let desc = if status == 200 { "ok" } else { ... };
```

## Pattern 7: Use `struct` for open sets of fields

When a value has a fixed set of named fields, model it as a
struct. Do not use a map; the struct gives you type safety.

```aether
// Idiomatic.
struct User { id: int, name: string, email: string }
fn greet(u: User) -> string { f"hello, {u.name}" }

// Anti-pattern: map with string keys.
let u: map[string]string = { "id": "1", "name": "Alice", "email": "..." };
```

## Pattern 8: Prefer tuple over struct for "obvious" pairs

A `(int, int)` pair is fine if the meaning is obvious from
context. A struct is better if the meaning is not.

```aether
// Idiomatic: tuple for an obvious pair.
fn div_mod(a: int, b: int) -> (int, int) { (a / b, a % b) }
let (q, r) = div_mod(17, 5);

// Idiomatic: struct for an unclear pair.
struct Point { x: int, y: int }
let origin = Point { x: 0, y: 0 };
```

The rule of thumb: if you would have to look up which field is
which, use a struct.

## Pattern 9: Use generics to avoid duplication

If you find yourself writing the same function twice for two
types, write it once generically.

```aether
// Idiomatic: one generic function.
fn first<T>(xs: [T]) -> Option<T> {
  if len(xs) == 0 { Option::None } else { Option::Some(xs[0]) }
}

// Anti-pattern: one function per type.
fn first_int(xs: [int]) -> Option<int> { ... }
fn first_str(xs: [string]) -> Option<string> { ... }
```

## Pattern 10: Pattern match exhaustively

When you `match` over an enum, cover every variant explicitly.
The `_` wildcard is a last resort.

```aether
// Idiomatic: cover every variant.
fn describe(o: Option<int>) -> string {
  match o {
    Option::Some(v) => f"got {v}",
    Option::None    => "got nothing",
  }
}

// Anti-pattern: wildcard that hides a missing variant.
fn describe_bad(o: Option<int>) -> string {
  match o {
    Option::Some(v) => f"got {v}",
    _               => "got nothing",   // what about None?
  }
}
```

In v2, the compiler will enforce this. In v1, it is a
discipline.

## Pattern 11: Use `for` + `range` for index loops

For indexed loops, use `for i in range(start, end)` instead of
`while`.

```aether
// Idiomatic.
for i in range(0, 10) {
  print(i);
}

// Anti-pattern: while with manual counter.
let mut i = 0;
while i < 10 {
  print(i);
  i = i + 1;
}
```

The `for` form is shorter, harder to get wrong, and faster (the
`range` builtin is a native loop in TypeScript).

## Pattern 12: Use `map`, `filter`, `reduce` for transformations

These three higher-order functions are the workhorses of
idiomatic Aether. They are more concise and faster than manual
loops.

```aether
let nums = [1, 2, 3, 4, 5];

// Idiomatic.
let squares = map(nums, fn(x: int) -> int { x * x });
let evens   = filter(nums, fn(x: int) -> bool { x % 2 == 0 });
let sum     = reduce(nums, fn(a: int, b: int) -> int { a + b }, 0);

// Anti-pattern: manual loop with mutation.
let mut squares = [];
for x in nums { squares = push(squares, x * x); }
```

## Pattern 13: Use `match` for dispatch

When you have a function that does different things based on a
value, use `match`. Do not chain `if`/`else`.

```aether
// Idiomatic.
fn describe(n: int) -> string {
  match n {
    0 | 1     => "small",
    2 | 3     => "medium",
    _         => "large",
  }
}

// Anti-pattern: if/else chain.
fn describe_bad(n: int) -> string {
  if n == 0 || n == 1 { "small" }
  else if n == 2 || n == 3 { "medium" }
  else { "large" }
}
```

## Pattern 14: Use `?` for error propagation

The `?` operator is the idiomatic way to propagate errors. It
turns a pyramid of nested `match` into a flat sequence.

```aether
// Idiomatic.
fn load_user(id: int) -> Result<User, string> {
  let text = read_file(f"/users/{id}")?;
  let user = parse_user(text)?;
  Result::Ok(user)
}

// Anti-pattern: nested match.
fn load_user_bad(id: int) -> Result<User, string> {
  match read_file(f"/users/{id}") {
    Result::Ok(text) => match parse_user(text) {
      Result::Ok(user) => Result::Ok(user),
      Result::Err(e)   => Result::Err(e),
    },
    Result::Err(e) => Result::Err(e),
  }
}
```

## Pattern 15: Define one error type per module

Group related errors into a single enum. Do not use `string`
for errors in production code; the type system cannot help
you.

```aether
// Idiomatic.
enum AppError {
  Io(string),
  Parse(string),
  NotFound(int),
}

fn load_user(id: int) -> Result<User, AppError> { ... }

// Anti-pattern: string errors.
fn load_user_bad(id: int) -> Result<User, string> { ... }
```

## Pattern 16: Convert errors at module boundaries

When an error from one module needs to become an error from
another, convert explicitly. In v1, the conversion is manual;
in v2, the `From` trait will do it automatically.

```aether
enum AppError { Io(IoError), Parse(ParseError), }

fn load_user(id: int) -> Result<User, AppError> {
  let text = match read_file(...) {
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

## Pattern 17: Distinguish `panic` from `Result`

`panic` for invariant violations; `Result` for expected
failures. The caller cannot recover from a panic; they can
from a `Result`.

```aether
// Idiomatic: panic for invariant.
fn factorial(n: int) -> int {
  if n < 0 { panic("factorial of negative number"); }
  if n <= 1 { 1 } else { n * factorial(n - 1) }
}

// Idiomatic: Result for expected failure.
fn parse_int(s: string) -> Result<int, string> {
  // ... might fail
  Result::Ok(42)
}

// Anti-pattern: panic for expected failure.
fn parse_int_bad(s: string) -> int {
  // ... might fail
  panic("parse failed");
}
```

## Pattern 18: Keep functions small

A function should do one thing. If you cannot describe what it
does in a single sentence, split it.

```aether
// Idiomatic: small, focused functions.
fn mean(xs: [int]) -> float {
  reduce(xs, fn(a: int, b: int) -> int { a + b }, 0) as float / len(xs) as float
}

fn variance(xs: [int]) -> float {
  let m = mean(xs);
  let sq = map(xs, fn(x: int) -> float { let d = x as float - m; d * d });
  reduce(sq, fn(a: float, b: float) -> float { a + b }, 0.0) / len(xs) as float
}

// Anti-pattern: one big function that does everything.
fn stats(xs: [int]) -> (float, float, int, int) {
  // 50 lines of mean, variance, min, max computation.
  ...
}
```

## Pattern 19: Use `snake_case` for functions, `PascalCase` for types

This is the convention from Rust and ML. Stick to it.

```aether
// Idiomatic.
fn parse_int(s: string) -> int { ... }
struct UserProfile { ... }
enum HttpStatus { ... }

// Anti-pattern.
fn ParseInt(s: string) -> int { ... }   // PascalCase function
struct user_profile { ... }              // snake_case type
```

## Pattern 20: Name things for the reader, not the writer

A name should describe what the thing *is* or *does*, not what
*you* were thinking when you wrote it.

```aether
// Idiomatic: self-describing names.
fn find_first_even(xs: [int]) -> Option<int> { ... }
let is_admin = user.role == "admin";
let mut total_price = 0;

// Anti-pattern: cryptic or wrong names.
fn ffe(xs: [int]) -> Option<int> { ... }      // abbrev
let flag = user.role == "admin";             // vague
let mut x = 0;                                // uninformative
```

The rule: a reader who knows the domain should be able to
guess what your code does without reading the implementation.

## A worked example: idiomatic Aether in 50 lines

Here is a small program that uses most of the patterns above.
It is a tiny HTTP-status-code library.

```aether
// http_status.ae — idiomatic Aether.

// Pattern 4: type aliases.
type StatusCode = int;
type ReasonPhrase = string;

// Pattern 6: enum for closed alternatives.
enum HttpStatus {
  Ok,
  Created,
  NotFound,
  ServerError(StatusCode),
}

// Pattern 18: small, focused functions.
fn code(s: HttpStatus) -> StatusCode {
  match s {
    HttpStatus::Ok           => 200,
    HttpStatus::Created      => 201,
    HttpStatus::NotFound    => 404,
    HttpStatus::ServerError(c) => c,
  }
}

fn reason(s: HttpStatus) -> ReasonPhrase {
  match s {
    HttpStatus::Ok           => "OK",
    HttpStatus::Created      => "Created",
    HttpStatus::NotFound    => "Not Found",
    HttpStatus::ServerError(_) => "Internal Server Error",
  }
}

// Pattern 5: Result for failure.
fn from_code(c: StatusCode) -> Result<HttpStatus, string> {
  match c {
    200       => Result::Ok(HttpStatus::Ok),
    201       => Result::Ok(HttpStatus::Created),
    404       => Result::Ok(HttpStatus::NotFound),
    n if n >= 500 && n < 600 => Result::Ok(HttpStatus::ServerError(n)),
    _         => Result::Err(f"unknown status code: {c}"),
  }
}

// Pattern 14: ? for propagation.
fn describe(c: StatusCode) -> Result<string, string> {
  let s = from_code(c)?;
  Result::Ok(f"{code(s)} {reason(s)}")
}

// Tests.
fn test_describe() {
  assert_eq(describe(200), Result::Ok("200 OK"));
  assert_eq(describe(404), Result::Ok("404 Not Found"));
  assert_eq(describe(500), Result::Ok("500 Internal Server Error"));
  // assert_eq(describe(999), Result::Err("unknown status code: 999"));
}

test_describe();
print("all http_status tests passed");
```

This program uses patterns 4, 5, 6, 10, 14, 15, 17, 18, 19,
and 20. Read it as a model of what idiomatic Aether looks like.

## Where to go next

- **[anti-patterns.md](anti-patterns.md)** — 20 anti-patterns
  with their fixes.
- **[../tutorials/idiomatic-aether.md is this guide.**
- **[../tutorials/stdlib-tour.md](../tutorials/stdlib-tour.md)**
  — when to use which stdlib function.
- **[../guides/migration-from-typescript.md](migration-from-typescript.md)**
  — if you are coming from TypeScript.
- **[../guides/migration-from-rust.md](migration-from-rust.md)**
  — if you are coming from Rust.
- **[../guides/migration-from-python.md](migration-from-python.md)**
  — if you are coming from Python.
- **[../guides/migration-from-go.md](migration-from-go.md)**
  — if you are coming from Go.

Idiomatic Aether is: immutability by default, types at
boundaries, `enum`/`struct` for modeling, `Option`/`Result`
for absence and failure, `?` for propagation, `match` for
dispatch, `map`/`filter`/`reduce` for transformation, small
functions, descriptive names. The 20 patterns above are the
shape of the language. Internalize them and your code will
read like the rest of the Aether corpus.
