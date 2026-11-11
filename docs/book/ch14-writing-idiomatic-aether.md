# Chapter 14 — Writing idiomatic Aether

> 20 patterns that make Aether code feel like Aether, and 20 anti-patterns that make it feel like translated C/Python/JS. This chapter is opinionated. It draws on the existing `docs/guides/idiomatic-aether.md` and `docs/guides/anti-patterns.md` and updates them for v2.

---

## 14.1 Twenty idiomatic patterns

### 1. Prefer immutability.

Use `let` by default. Use `let mut` only when you actually reassign.

```aether
// Good:
let xs = [1, 2, 3];
let doubled = map(xs, fn(x: int) -> int { x * 2 });

// Avoid:
let mut xs = [1, 2, 3];   // mut is unnecessary — never reassigned
```

### 2. Use `Option` and `Result` for fallible values.

Don't return `-1` for "not found". Don't return `null` for "missing". Return `Option::None` or `Result::Err`.

```aether
// Good:
fn first<T>(xs: [T]) -> option<T> {
  if len(xs) > 0 { Option::Some(xs[0]) } else { Option::None }
}

// Avoid:
fn first_or_neg_one(xs: [int]) -> int {
  if len(xs) > 0 { xs[0] } else { -1 }   // ambiguous: -1 might be a real value
}
```

### 3. Pattern-match exhaustively (or with a wildcard).

Always include a `_ => ...` arm if you're not sure you've enumerated all variants. v1 doesn't check exhaustiveness; v2.1 will.

```aether
// Good:
fn name(c: Color) -> string {
  match c {
    Color::Red => "red",
    Color::Green => "green",
    Color::Blue => "blue",
    _ => "?",   // future-proofs against new variants
  }
}
```

### 4. Use `filter`/`map`/`reduce` instead of `for` loops.

```aether
// Good:
let sum = reduce(xs, fn(a: int, x: int) -> int { a + x }, 0);

// Avoid:
let mut sum = 0;
for x in xs { sum = sum + x; }
```

(For simple accumulation, `reduce` is more concise. For multi-step pipelines, `filter` then `map` then `reduce` reads better than three nested loops.)

### 5. Use `?` to propagate errors.

Don't manually `match` on `Result` just to propagate. Use `?`.

```aether
// Good:
fn double_parse(s: string) -> result<int, string> {
  let n = parse_int(s)?;
  Result::Ok(n * 2)
}

// Avoid:
fn double_parse(s: string) -> result<int, string> {
  match parse_int(s) {
    Result::Ok(n) => Result::Ok(n * 2),
    Result::Err(e) => Result::Err(e),
  }
}
```

### 6. Use `match` instead of long `if`/`else` chains.

```aether
// Good:
let kind = match n {
  0 => "zero",
  1 => "one",
  2 => "two",
  _ => "many",
};

// Avoid:
let kind = if n == 0 { "zero" } else {
  if n == 1 { "one" } else {
    if n == 2 { "two" } else { "many" }
  }
};
```

### 7. Use `enum` (ADTs) for tagged unions, not structs with a `kind` field.

```aether
// Good:
enum Shape { Circle(float), Rect(float, float), Point { x: float, y: float } }

// Avoid:
struct Shape { kind: string, r: float, w: float, h: float, x: float, y: float }
```

### 8. Use struct spread for "with one field changed".

```aether
// Good:
let q = Point { x: 10, ..p };

// Avoid:
let q = Point { x: 10, y: p.y };   // verbose, error-prone
```

### 9. Use `type` aliases for clarity.

```aether
// Good:
type IntFn = fn(int) -> int;
type IntPair = (int, int);
let f: IntFn = fn(x: int) -> int { x + 1 };

// Avoid:
let f: fn(int) -> int = fn(x: int) -> int { x + 1 };
```

### 10. Use `pipe` and `compose` from `functional` for pipelines.

```aether
// Good:
let result = pipe(
  [1, 2, 3, 4, 5],
  fn(xs) -> [int] { filter(xs, fn(x: int) -> bool { x > 2 }) },
  fn(xs) -> [int] { map(xs, fn(x: int) -> int { x * x }) },
  fn(xs) -> int { reduce(xs, fn(a: int, x: int) -> int { a + x }, 0) }
);
print(result);   // 50 (9 + 16 + 25)

// Or use `pipeFns` to compose:
let pipeline = pipeFns(
  fn(xs: [int]) -> [int] { filter(xs, fn(x: int) -> bool { x > 2 }) },
  fn(xs: [int]) -> [int] { map(xs, fn(x: int) -> int { x * x }) },
  fn(xs: [int]) -> int { reduce(xs, fn(a: int, x: int) -> int { a + x }, 0) }
);
print(pipeline([1, 2, 3, 4, 5]));   // 50
```

### 11. Use `assert` and `assert_eq` for invariants and tests.

```aether
// Good:
fn fact(n: int) -> int {
  assert(n >= 0, "fact: n must be non-negative");
  if n <= 1 { 1 } else { n * fact(n - 1) }
}

// In tests:
assert_eq(fact(5), 120);
```

### 12. Use `panic` for "this should never happen".

```aether
// Good:
fn unreachable() -> int {
  panic("unreachable");
}

// In a match arm that "can never be reached":
match c {
  Color::Red => 1,
  Color::Green => 2,
  Color::Blue => 3,
  _ => panic("unreachable"),
}
```

### 13. Use closures for short, single-use functions.

```aether
// Good:
let doubled = map(xs, fn(x: int) -> int { x * 2 });

// Avoid (for short functions):
fn double(x: int) -> int { x * 2 }
let doubled = map(xs, double);
```

(The named-function version is fine if `double` is used in multiple places; the inline closure is fine if it's used once.)

### 14. Use the stdlib.

Don't reinvent `split`, `join`, `sort`, `unique`, `chunk`, `take`, `drop`, etc. The stdlib has 396 functions across 18 modules; check the API reference first.

```aether
// Good:
let parts = split("a,b,c", ",");

// Avoid:
fn my_split(s: string, sep: string) -> [string] {
  // ... 30 lines of code ...
}
```

### 15. Use `for x in iterable { ... }` instead of index-based loops.

```aether
// Good:
for x in xs { print(x); }

// Avoid:
let mut i = 0;
while i < len(xs) { print(xs[i]); i = i + 1; }
```

### 16. Prefer `string.format` or f-strings over `+` for string building.

```aether
// Good:
print(f"x = {x}, y = {y}");
print(format("%s = %d", "answer", 42));

// Avoid:
print("x = " + str(x) + ", y = " + str(y));
```

### 17. Use `numeric widening` instead of explicit casts where possible.

```aether
// Good:
let f: float = 42;     // int widens

// Avoid:
let f: float = 42 as float;   // unnecessary cast
```

### 18. Use explicit `as int` for narrowing (don't rely on integer-division semantics).

```aether
// Good:
let n: int = 3.99 as int;   // explicit, clearly truncates to 3

// Avoid:
let n = 3.99 / 1;   // also 3 (because / on a float returns a float, then the let coerces)
                    // but unclear to the reader
```

### 19. Use recursive enums for tree-shaped data.

```aether
// Good:
enum List { Node(int, List), Nil, }
enum Tree { Node(int, Tree, Tree), Leaf, }

// Avoid:
struct List { head: int, tail: option<List> }   // awkward — needs a pointer-like thing
```

### 20. Write small functions.

Each function should do one thing. If a function is over 50 lines, consider splitting it. The linter's `long-function` rule (planned) flags functions over 100 lines.

```aether
// Good:
fn process(xs: [int]) -> [int] {
  let filtered = filter(xs, fn(x: int) -> bool { x > 0 });
  let doubled = map(filtered, fn(x: int) -> int { x * 2 });
  let sorted = sort(doubled);
  sorted
}

// Avoid:
fn process(xs: [int]) -> [int] {
  let mut result = [];
  for x in xs {
    if x > 0 {
      let y = x * 2;
      push(result, y);
    }
  }
  // ... sort manually ...
  result
}
```

---

## 14.2 Twenty anti-patterns

### 1. Using `mut` when `let` would do.

```aether
// Bad:
let mut x = 42;
print(x);
// (x is never reassigned)

// Good:
let x = 42;
print(x);
```

(The linter's `unused-mut` rule flags this.)

### 2. Using truthiness.

```aether
// Bad:
let n = 5;
if n { print("non-zero"); }   // type error: if condition must be bool

// Good:
if n != 0 { print("non-zero"); }
```

### 3. Returning `-1` for "not found".

```aether
// Bad:
fn find(xs: [int], target: int) -> int {
  for i in range(0, len(xs)) {
    if xs[i] == target { return i; }
  }
  return -1;
}

// Good:
fn find(xs: [int], target: int) -> option<int> {
  for i in range(0, len(xs)) {
    if xs[i] == target { return Option::Some(i); }
  }
  Option::None
}
```

### 4. Using `panic` for expected failure.

```aether
// Bad:
fn parse_int(s: string) -> int {
  if s == "42" { 42 } else { panic("not 42"); }
}

// Good:
fn parse_int(s: string) -> result<int, string> {
  if s == "42" { Result::Ok(42) } else { Result::Err("not 42") }
}
```

### 5. Missing a wildcard arm in `match`.

```aether
// Bad (v1 panics at runtime if Green or Blue):
fn name(c: Color) -> string {
  match c { Color::Red => "red" }
}

// Good:
fn name(c: Color) -> string {
  match c {
    Color::Red => "red",
    Color::Green => "green",
    Color::Blue => "blue",
    _ => "?",
  }
}
```

### 6. Manually propagating `Result` instead of using `?`.

```aether
// Bad:
fn double_parse(s: string) -> result<int, string> {
  match parse_int(s) {
    Result::Ok(n) => Result::Ok(n * 2),
    Result::Err(e) => Result::Err(e),
  }
}

// Good:
fn double_parse(s: string) -> result<int, string> {
  let n = parse_int(s)?;
  Result::Ok(n * 2)
}
```

### 7. Using `while` with index for a simple iteration.

```aether
// Bad:
let mut i = 0;
while i < len(xs) {
  print(xs[i]);
  i = i + 1;
}

// Good:
for x in xs { print(x); }
```

### 8. Reimplementing stdlib functions.

```aether
// Bad:
fn my_split(s: string, sep: string) -> [string] { /* ... */ }

// Good:
let parts = split("a,b,c", ",");
```

### 9. Long `if`/`else` chains instead of `match`.

```aether
// Bad:
let kind = if n == 0 { "zero" } else {
  if n == 1 { "one" } else {
    if n == 2 { "two" } else { "many" }
  }
};

// Good:
let kind = match n {
  0 => "zero",
  1 => "one",
  2 => "two",
  _ => "many",
};
```

### 10. Using a `kind` field instead of an `enum`.

```aether
// Bad:
struct Shape { kind: string, r: float, w: float, h: float, x: float, y: float }

// Good:
enum Shape {
  Circle(float),
  Rect(float, float),
  Point { x: float, y: float },
}
```

### 11. Manually updating struct fields (verbose).

```aether
// Bad:
let q = Point { x: 10, y: p.y };

// Good:
let q = Point { x: 10, ..p };
```

### 12. String concatenation in a loop.

```aether
// Bad:
let mut s = "";
for i in range(0, 100) {
  s = s + str(i) + ",";   // O(n²) — each concat copies the whole string
}
print(s);

// Good:
let parts = map(range(0, 100), fn(i: int) -> string { str(i) });
print(join(parts, ","));   // O(n)
```

### 13. `len(xs)` in a loop condition (recomputed each iteration).

```aether
// Bad:
let mut i = 0;
while i < len(xs) {
  print(xs[i]);
  i = i + 1;
}

// Good:
let n = len(xs);
let mut i = 0;
while i < n {
  print(xs[i]);
  i = i + 1;
}

// Or better:
for x in xs { print(x); }
```

### 14. Using `for` loop's scoping quirk (v1).

There's a known quirk in v1 where a `let` binding declared before a `for` loop and *referenced after the loop* in some configurations gets "undefined name". The workaround is to use recursion or to call a helper function that returns the accumulator.

```aether
// Bad (may fail in v1):
let mut t = List::Nil;
for v in [1, 2, 3] {
  t = list_prepend(t, v);
}
print(t);   // may report "undefined name 't'"

// Good (use recursion):
fn build(xs: [int], i: int, acc: List) -> List {
  if i >= len(xs) { acc } else {
    build(xs, i + 1, list_prepend(acc, xs[i]))
  }
}
let t = build([1, 2, 3], 0, List::Nil);
print(t);
```

(See `examples/binary_tree.ae` for a worked example. This will be fixed in v2.x.)

### 15. Using `float ==` for equality.

```aether
// Bad:
let x = 0.1 + 0.2;
if x == 0.3 { print("equal"); }   // false! 0.1 + 0.2 = 0.30000000000000004

// Good:
let x = 0.1 + 0.2;
if abs(x - 0.3) < 1e-9 { print("equal"); }
```

### 16. Division by zero without a check.

```aether
// Bad:
fn divide(a: int, b: int) -> int { a / b }   // panics at runtime if b == 0

// Good:
fn divide(a: int, b: int) -> result<int, string> {
  if b == 0 { Result::Err("div by zero") } else { Result::Ok(a / b) }
}
```

### 17. Infinite loop without `break`.

```aether
// Bad:
while true {
  print("hi");
}

// Good:
let mut i = 0;
while i < 10 {
  print("hi");
  i = i + 1;
}
```

### 18. Unreachable code after `return` / `panic`.

```aether
// Bad:
fn f() -> int {
  return 42;
  print("never reached");   // dead code
}

// Good:
fn f() -> int {
  return 42;
}
```

### 19. Unused parameters and bindings.

```aether
// Bad:
fn add(a: int, b: int) -> int { a }   // b is unused

// Good:
fn add(a: int, b: int) -> int { a + b }
// Or, if b is intentionally unused:
fn add(a: int, _b: int) -> int { a }
```

### 20. Reinventing `Option`/`Result` with custom enums.

```aether
// Bad:
enum MyOption<T> { SomeValue(T), NoValue, }

// Good:
enum Option<T> { Some(T), None, }   // built-in
```

(Use the built-in `Option`/`Result`. They have `?`, they have pattern matching, they're idiomatic.)

---

## 14.3 Putting it together

A small "idiomatic" example combining many of the above:

```aether
// A small parser for "key=value" lines.
// Returns a Result of (string, string); errors on lines without `=`.

type Pair = (string, string);

fn parse_line(s: string) -> result<Pair, string> {
  let trimmed = trim(s);
  if isEmpty(trimmed) {
    Result::Err("empty line")
  } else {
    let idx = indexOf(trimmed, "=");
    if idx < 0 {
      Result::Err(f"missing '=' in '{trimmed}'")
    } else {
      let key = slice(trimmed, 0, idx);
      let val = slice(trimmed, idx + 1);
      Result::Ok((key, val))
    }
  }
}

fn parse_config(s: string) -> result<[Pair], string> {
  let lines = lines(s);
  let mut pairs = [];
  for line in lines {
    let r = parse_line(line)?;
    push(pairs, r);
  }
  Result::Ok(pairs)
}

let cfg = "name=Aether\nversion=2";
let r = parse_config(cfg);
match r {
  Result::Ok(pairs) => {
    for p in pairs {
      match p {
        (k, v) => print(f"{k} = {v}"),
      }
    }
  },
  Result::Err(e) => print(f"err: {e}"),
}
```

(Note: `?` inside a `for` loop works — the `?` returns from the enclosing *function*, not the loop. The `parse_config` function returns `Result::Err(e)` if any line fails.)

This example uses:

- `type` alias for clarity (Pattern 9).
- `Result` for fallibility (Pattern 2).
- `?` for propagation (Pattern 5).
- `match` for branching (Pattern 6).
- `for x in iterable` (Pattern 15).
- Stdlib functions (`trim`, `isEmpty`, `indexOf`, `slice`, `lines`) (Pattern 14).
- Closures in `for` are unnecessary here (no `map`/`filter`/`reduce`).
- No `mut` beyond the accumulator (Pattern 1).
- No manual `if n == 0 { return -1 }` (Anti-pattern 3).
- No string concatenation in a loop (Anti-pattern 12 — we use `push` to an array, then print at the end).

---

## 14.4 Eight runnable examples

**1. Immutability with `map`.**

```aether
let xs = [1, 2, 3];
print(map(xs, fn(x: int) -> int { x + 1 }));
```

**2. `Option` for "not found".**

```aether
fn find(xs: [int], target: int) -> option<int> {
  for i in range(0, len(xs)) {
    if xs[i] == target { return Option::Some(i); }
  }
  Option::None
}
print(find([1, 2, 3], 2));
print(find([1, 2, 3], 5));
```

**3. `?` for propagation.**

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

**4. `match` on an enum.**

```aether
enum Color { Red, Green, Blue, }
fn name(c: Color) -> string {
  match c {
    Color::Red => "red",
    Color::Green => "green",
    Color::Blue => "blue",
    _ => "?",
  }
}
print(name(Color::Red));
```

**5. Struct spread.**

```aether
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
let q = Point { x: 10, ..p };
print(q.x);
print(q.y);
```

**6. Recursive enum.**

```aether
enum List { Node(int, List), Nil, }
fn length(l: List) -> int {
  match l {
    List::Node(_, rest) => 1 + length(rest),
    List::Nil => 0,
  }
}
let l = List::Node(1, List::Node(2, List::Node(3, List::Nil)));
print(length(l));
```

**7. `pipe` for pipelines.**

```aether
let xs = [1, 2, 3, 4, 5];
let result = pipe(
  xs,
  fn(xs: [int]) -> [int] { filter(xs, fn(x: int) -> bool { x > 2 }) },
  fn(xs: [int]) -> [int] { map(xs, fn(x: int) -> int { x * x }) },
  fn(xs: [int]) -> int { reduce(xs, fn(a: int, x: int) -> int { a + x }, 0) }
);
print(result);   // 50
```

**8. `assert_eq` for tests.**

```aether
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
assert_eq(fib(10), 55);
assert_eq(fib(15), 610);
print("all tests pass");
```

---

## 14.5 Summary

- 20 idiomatic patterns: prefer immutability; use `Option`/`Result`; pattern-match exhaustively; use `filter`/`map`/`reduce`; use `?`; use `match`; use `enum` for ADTs; use struct spread; use `type` aliases; use `pipe`/`compose`; use `assert`/`assert_eq`; use `panic` for unreachable; use closures for short functions; use the stdlib; use `for x in iterable`; use f-strings / `format`; use widening; use explicit `as int` for narrowing; use recursive enums for trees; write small functions.
- 20 anti-patterns: don't use `mut` unnecessarily; don't use truthiness; don't return `-1` for not-found; don't use `panic` for expected failure; don't miss `match` arms; don't manually propagate `Result`; don't use `while` with index for simple iteration; don't reinvent stdlib; don't use long `if`/`else` chains; don't use `kind` fields; don't manually update struct fields; don't concat strings in loops; don't recompute `len(xs)` in loops; watch the for-loop scoping quirk (v1); don't use `float ==`; don't divide by zero; don't write infinite loops; don't leave unreachable code; don't leave unused parameters; don't reinvent `Option`/`Result`.

The next chapter is internals and contributing: the compiler pipeline, the AST, the IR, the VM, how to add a language feature, how to add a stdlib function, the 3× test/doc/bench rule, and the contributor guide.
