# Aether Anti-Patterns

> Audience: anyone writing Aether code and wondering what to
> avoid.
> Prerequisites: [../guides/idiomatic-aether.md](idiomatic-aether.md).
> 35 minutes.

This guide presents 20 anti-patterns, each with the *bad* form,
the *good* form, and a one-paragraph explanation of why. The
patterns cluster into five groups:

- **Mutability** (1-3): too much `mut`.
- **Errors** (4-7): mishandling `Result` and `Option`.
- **Recursion** (8-10): deep recursion without step awareness.
- **Strings and arrays** (11-14): O(n²) traps.
- **Style** (15-20): readability and maintenance.

For the inverse, see [idiomatic-aether.md](idiomatic-aether.md).

## Anti-pattern 1: `let mut` everywhere

```aether
// Bad.
let mut pi = 3.14159;
let mut greeting = "hello";
let mut xs = [1, 2, 3];
print(pi);

// Good.
let pi = 3.14159;
let greeting = "hello";
let xs = [1, 2, 3];
print(pi);
```

**Why:** `let mut` is for variables you actually reassign. Using
it for read-only bindings signals to the reader that mutation
might happen, even when it does not. The compiler treats them
the same in v1; the reader does not.

## Anti-pattern 2: Reassigning a `let`

```aether
// Bad.
let x = 42;
x = 43;
// → cannot assign to immutable variable 'x'

// Good.
let mut x = 42;
x = 43;

// Also good.
let x = 42;
let y = 43;
```

**Why:** `let` is the default; if you need to reassign, declare
`let mut`. The type checker enforces this. The error message
is clear; do not ignore it.

## Anti-pattern 3: Mutable everything in a loop

```aether
// Bad.
let mut total = 0;
let mut count = 0;
let mut max = 0;
let mut min = 0;
for x in xs {
  total = total + x;
  count = count + 1;
  if x > max { max = x; }
  if x < min { min = x; }
}

// Good (when stats are independent).
let total = reduce(xs, fn(a: int, b: int) -> int { a + b }, 0);
let count = len(xs);
let max_val = reduce(xs, fn(a: int, b: int) -> int { if a > b { a } else { b } }, xs[0]);
let min_val = reduce(xs, fn(a: int, b: int) -> int { if a < b { a } else { b } }, xs[0]);
```

**Why:** Multiple `mut` bindings in a loop are a sign that you
are accumulating several values. Use `reduce` for each. The
result is shorter and harder to get wrong.

## Anti-pattern 4: Using `-1` (or `null`-equivalent) as a sentinel

```aether
// Bad.
fn find(xs: [int], target: int) -> int {
  for i in range(0, len(xs)) {
    if xs[i] == target { return i; }
  }
  -1
}

// Good.
fn find(xs: [int], target: int) -> Option<int> {
  for i in range(0, len(xs)) {
    if xs[i] == target { return Option::Some(i); }
  }
  Option::None
}
```

**Why:** `-1` is a valid `int`. The caller cannot tell from the
type that `find` might return "not found". With `Option<int>`,
the type forces the caller to handle the `None` case.

## Anti-pattern 5: Panicking on bad input

```aether
// Bad.
fn parse_int(s: string) -> int {
  if s == "42" { 42 } else { panic("not 42"); }
}

// Good.
fn parse_int(s: string) -> Result<int, string> {
  if s == "42" { Result::Ok(42) } else { Result::Err("not 42") }
}
```

**Why:** `panic` is for invariant violations, not for
expected failures. The caller of `parse_int` should be able
to recover from a bad input; with `Result`, they can.

## Anti-pattern 6: Ignoring a `Result`

```aether
// Bad.
fn bad() {
  parse_int("hello");   // result discarded
  print("done");
}

// Good.
fn good() {
  match parse_int("hello") {
    Result::Ok(n)  => print(f"got {n}"),
    Result::Err(e) => print(f"error: {e}"),
  }
}

// Also good (when you really mean to discard).
fn also_good() {
  let _ = parse_int("hello");
  print("done");
}
```

**Why:** A discarded `Result` is a silent failure. The linter
(planned for v2) will warn on this. In v1, use `let _ = ...` to
make the discard explicit.

## Anti-pattern 7: Forgetting a `match` arm

```aether
// Bad.
fn describe(o: Option<int>) -> int {
  match o { Option::Some(v) => v }
  // → no match arm matched (runtime panic) when o is None
}

// Good.
fn describe(o: Option<int>) -> int {
  match o {
    Option::Some(v) => v,
    Option::None    => 0,
  }
}
```

**Why:** A `match` that does not cover all variants will panic
at runtime when the uncovered variant occurs. In v2, the
compiler will reject this at compile time; in v1, the
discipline is yours.

## Anti-pattern 8: Deep recursion without step awareness

```aether
// Bad: hits step limit at fib(30).
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
print(fib(30));
// → execution step limit exceeded (1000000)

// Good: iterative.
fn fib(n: int) -> int {
  let mut a = 0;
  let mut b = 1;
  let mut i = 0;
  while i < n {
    let t = a + b;
    a = b;
    b = t;
    i = i + 1;
  }
  a
}
print(fib(30));
// → 832040
```

**Why:** Aether v1 has a step limit (default 1,000,000). Deep
recursion burns steps fast; `fib(30)` is about 50 million
steps. Iterative solutions fit in the budget.

See [../tutorials/performance.md](../tutorials/performance.md)
for the full performance discussion.

## Anti-pattern 9: Recursion for what should be a loop

```aether
// Bad.
fn sum_recursive(n: int) -> int {
  if n == 0 { 0 } else { n + sum_recursive(n - 1) }
}

// Good.
fn sum_iterative(n: int) -> int {
  let mut acc = 0;
  let mut i = 1;
  while i <= n {
    acc = acc + i;
    i = i + 1;
  }
  acc
}

// Best (when the operation is simple aggregation).
fn sum_reduce(n: int) -> int {
  reduce(range(1, n + 1), fn(a: int, b: int) -> int { a + b }, 0)
}
```

**Why:** Each recursive call costs 5-20 steps. A `while`
iteration costs 4-8. `reduce` is a native loop and is fastest.
For non-trivial recursion (like tree traversal), recursion is
fine; for linear loops, prefer iteration.

## Anti-pattern 10: Mutual recursion that does not terminate

```aether
// Bad: infinite loop, hits step limit.
fn is_even(n: int) -> bool {
  if n == 0 { true } else { is_odd(n - 1) }
}
fn is_odd(n: int) -> bool {
  if n == 0 { false } else { is_even(n - 1) }
}
print(is_even(-1));
// → execution step limit exceeded

// Good: handle negative inputs.
fn is_even(n: int) -> bool {
  if n < 0 { is_even(-n) }
  else if n == 0 { true }
  else { is_odd(n - 1) }
}
```

**Why:** Recursive functions must terminate; otherwise the
step limit catches them. The error message (`execution step
limit exceeded`) is unhelpful for diagnosing the cause; think
about termination before you write the recursion.

## Anti-pattern 11: String concatenation in a loop

```aether
// Bad: O(n²) in total length.
let mut s = "";
for w in words {
  s = s + w + ", ";
}
print(s);

// Good: O(n).
let s = join(words, ", ");
print(s);
```

**Why:** String `+` creates a new string each time, copying
the entire left operand. In a loop of n iterations, this is
O(n²). `join` builds the result in one pass.

## Anti-pattern 12: `+` for arrays in a loop

```aether
// Bad: O(n²) in total length.
let mut xs: [int] = [];
for i in range(0, 100) {
  xs = xs + [i];
}

// Good: push.
let mut xs: [int] = [];
for i in range(0, 100) {
  xs = push(xs, i);
}

// Best: pre-build with map.
let xs = map(range(0, 100), fn(i: int) -> int { i });
```

**Why:** Array `+` creates a new array each time. `push` is
faster (the inline builtin mutates the underlying array).
`map` is fastest (a native loop in TypeScript).

## Anti-pattern 13: Linear search where a map would do

```aether
// Bad: O(n) per lookup, O(n²) for n lookups.
fn count(words: [string]) -> map[string]int {
  let counts = map_new();
  for w in words {
    let mut found = false;
    let keys = map_keys(counts);
    for k in keys {
      if k == w {
        let n = map_get(counts, k);
        map_set(counts, k, n + 1);
        found = true;
      }
    }
    if !found { map_set(counts, w, 1); }
  }
  counts
}

// Good: O(1) per lookup via map_has.
fn count(words: [string]) -> map[string]int {
  let counts = map_new();
  for w in words {
    if map_has(counts, w) {
      map_set(counts, w, map_get(counts, w) + 1);
    } else {
      map_set(counts, w, 1);
    }
  }
  counts
}
```

**Why:** Maps are hash tables; `map_has` and `map_get` are
O(1) average. Linear search through `map_keys` is O(n). For
large maps, the difference is enormous.

## Anti-pattern 14: Repeated `len()` calls in a loop

```aether
// Bad: calls len() every iteration.
let mut i = 0;
while i < len(long_array) {
  // ...
  i = i + 1;
}

// Good: hoist the length.
let n = len(long_array);
let mut i = 0;
while i < n {
  // ...
  i = i + 1;
}
```

**Why:** `len()` is O(1) for arrays, but the function call
itself costs 2-3 steps per iteration. Hoisting it saves those
steps. The evaluator does not optimize this; you have to.

## Anti-pattern 15: Long `if`/`else if` chains

```aether
// Bad.
fn describe(n: int) -> string {
  if n == 0 { "zero" }
  else if n == 1 { "one" }
  else if n == 2 { "two" }
  else if n == 3 { "three" }
  else { "many" }
}

// Good.
fn describe(n: int) -> string {
  match n {
    0       => "zero",
    1       => "one",
    2       => "two",
    3       => "three",
    _       => "many",
  }
}
```

**Why:** `match` is more concise, more readable, and faster
than a chain of `if`s. It also signals "dispatch on a value"
clearly.

## Anti-pattern 16: Cryptic names

```aether
// Bad.
fn f(x: int, y: int) -> int { x + y }
let a = [1, 2, 3];
let b = f(a[0], a[1]);

// Good.
fn add(a: int, b: int) -> int { a + b }
let xs = [1, 2, 3];
let sum = add(xs[0], xs[1]);
```

**Why:** Names should describe what they are. `f`, `a`, `b`
tell the reader nothing; `add`, `xs`, `sum` tell the reader
everything. The compiler does not care; the reader does.

## Anti-pattern 17: Giant functions

```aether
// Bad: 200-line function.
fn process_request(req: Request) -> Response {
  // ... parse, validate, authenticate, route, execute, log, respond
}

// Good: split into small functions.
fn process_request(req: Request) -> Response {
  let parsed = parse(req);
  let validated = validate(parsed);
  let authed = authenticate(validated);
  let routed = route(authed);
  let response = execute(routed);
  log(req, response);
  response
}
```

**Why:** Small functions are easier to test, easier to read,
and easier to refactor. The rule of thumb: if a function does
not fit on one screen, it is doing too much.

## Anti-pattern 18: Re-declaring the same name

```aether
// Bad: shadowing makes the code hard to read.
let x = 1;
let x = x + 1;
let x = x * 2;
print(x);

// Good: use distinct names.
let x = 1;
let y = x + 1;
let z = y * 2;
print(z);

// Also good (transformations).
let x = 1;
let x_plus_1 = x + 1;
let x_plus_1_doubled = x_plus_1 * 2;
print(x_plus_1_doubled);
```

**Why:** Shadowing is allowed in Aether (and useful when
transforming an immutable value), but chains of shadows make
the code hard to follow. Prefer distinct names unless the
shadow is one step.

## Anti-pattern 19: Magic numbers

```aether
// Bad.
fn is_admin(role: int) -> bool { role == 1 }
fn is_user(role: int) -> bool { role == 2 }
fn is_guest(role: int) -> bool { role == 3 }

// Good.
type Role = int;
const ADMIN: Role = 1;
const USER: Role = 2;
const GUEST: Role = 3;

fn is_admin(role: Role) -> bool { role == ADMIN }
fn is_user(role: Role) -> bool { role == USER }
fn is_guest(role: Role) -> bool { role == GUEST }
```

**Why:** Magic numbers are unreadable. Naming them makes the
code self-documenting. The compiler does not care; the reader
does. (Even better in v1: use an enum.)

## Anti-pattern 20: Comment-what instead of comment-why

```aether
// Bad.
let x = 42;   // assign 42 to x
let y = x + 1;  // add 1 to x and assign to y
print(y);   // print y

// Good.
// The answer is 42 because of the Great Question of Life,
// the Universe, and Everything (Adams, 1979). Adding one to
// it gives a wrong answer, which is the point of this test.
let x = 42;
let y = x + 1;
print(y);
```

**Why:** The "what" is visible from the code. The "why" is
not. Comments should explain the why; the code explains the
what.

## A worked example: refactoring an anti-pattern

Here is a small program with several anti-patterns. We will
refactor it.

### 20.1 Before

```aether
fn process(xs: [int]) -> int {
  let mut total = 0;
  let mut count = 0;
  let mut max = -1000000;
  let mut min = 1000000;
  let mut found_negatives = 0;
  let mut found_positives = 0;
  for x in xs {
    total = total + x;
    count = count + 1;
    if x > max { max = x; }
    if x < min { min = x; }
    if x < 0 { found_negatives = found_negatives + 1; }
    if x > 0 { found_positives = found_positives + 1; }
  }
  print("total:");
  print(total);
  print("count:");
  print(count);
  print("max:");
  print(max);
  print("min:");
  print(min);
  print("negatives:");
  print(found_negatives);
  print("positives:");
  print(found_positives);
  total
}
```

### 20.2 After

```aether
type Stats = (int, int, int, int, int, int);

fn compute_stats(xs: [int]) -> Stats {
  if len(xs) == 0 { panic("empty input"); }
  let total = reduce(xs, fn(a: int, b: int) -> int { a + b }, 0);
  let count = len(xs);
  let max_val = reduce(xs, fn(a: int, b: int) -> int { if a > b { a } else { b } }, xs[0]);
  let min_val = reduce(xs, fn(a: int, b: int) -> int { if a < b { a } else { b } }, xs[0]);
  let negatives = len(filter(xs, fn(x: int) -> bool { x < 0 }));
  let positives = len(filter(xs, fn(x: int) -> bool { x > 0 }));
  (total, count, max_val, min_val, negatives, positives)
}

fn print_stats(s: Stats) -> () {
  let (total, count, max_val, min_val, neg, pos) = s;
  print(f"total:     {total}");
  print(f"count:     {count}");
  print(f"max:       {max_val}");
  print(f"min:       {min_val}");
  print(f"negatives: {neg}");
  print(f"positives: {pos}");
}

let stats = compute_stats([3, -1, 4, -1, 5, 9, -2, 6, 5, 3]);
print_stats(stats);
```

The refactored version:

- Splits the function into a pure `compute_stats` (no I/O) and
  a `print_stats` (only I/O).
- Uses `reduce` and `filter` instead of `mut` accumulators.
- Returns the stats as a tuple (better for testing).
- Uses string interpolation to combine the label and the value.
- Adds a panic for the empty-input invariant (this is an
  invariant, not an expected failure).

It is also faster: about 5x fewer steps because of the
native-loop `reduce`/`filter`/`len` calls.

## Where to go next

- **[idiomatic-aether.md](idiomatic-aether.md)** — the patterns
  to aim for.
- **[../tutorials/performance.md](../tutorials/performance.md)**
  — why some anti-patterns are slow.
- **[../tutorials/error-handling.md](../tutorials/error-handling.md)**
  — the right way to handle `Result` and `Option`.
- **[../reference/error-catalog.md](../reference/error-catalog.md)**
  — what the compiler tells you when you hit an anti-pattern.

Anti-patterns are how you learn a language. Hit them, fix
them, internalize the fix. The 20 above cover most of what
you will see in your first month of Aether.
