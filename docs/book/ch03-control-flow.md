# Chapter 3 — Control flow

> `if`/`else` is an expression. `while` is a loop. `for in` iterates. `match` is a real expression with patterns, guards, and exhaustiveness. `break`/`continue` work as you expect. This chapter covers all five, with the emphasis on *expression-style* control flow — the thing that makes Aether feel like an ML and not a C.

---

## 3.1 `if` and `else` as expressions

Aether's `if` is an expression, not a statement. The result of an `if`/`else` is the value of the branch that was taken. Both branches must have the same type (the compiler unifies them).

```aether
let n = 5;
let s = if n > 0 { "positive" } else { "non-positive" };
print(s);   // positive
```

Both branches must yield the same type. If they don't, the type checker reports `cannot unify <T> with <U>`.

```aether
// Type error:
// let x = if true { 1 } else { "two" };
//   arms have type int and string — can't unify

// Fix:
let x = if true { 1 } else { 2 };
```

The `else` is mandatory when the `if` is used as an expression. Without `else`, the type checker would have to invent a type for the missing branch, and Aether doesn't have a `never`/bottom type. (A `return` or `panic` in one arm is fine — those have type `never` in spirit; the checker treats them as "any" for unification.)

```aether
fn classify(n: int) -> string {
  if n < 0 {
    return "negative";    // early return — no value, so the if-expression
                         // doesn't need to unify with anything
  };
  if n == 0 { "zero" } else { "positive" }
}
```

### 3.1.1 `if` as a statement

When an `if` is used as a statement (its value is discarded), the `else` is optional:

```aether
let n = 5;
if n > 0 { print("positive"); }
// No else — fine, the if's value is ()
```

### 3.1.2 Condition must be `bool`

Aether does *not* have truthiness. The condition must be a `bool`. `if 1 { ... }` is a type error.

```aether
let n = 1;
// Type error: if condition must be bool, found int
// if n { print("hi"); }

// Fix:
if n > 0 { print("hi"); }
// or
if n != 0 { print("hi"); }
```

This is a deliberate choice — truthiness is a classic source of bugs in JS/Python (`if (x)` when `x` is `0` or `""` or `null`). Aether requires the explicit comparison.

### 3.1.3 `else if` chains

Aether has no `else if` keyword; you nest `else { if ... }`:

```aether
let n = 0;
let s = if n > 0 { "positive" } else {
  if n < 0 { "negative" } else { "zero" }
};
print(s);   // zero
```

This is verbose; for many branches, prefer `match` (§3.4).

---

## 3.2 `while`

`while` is a loop with a `bool` condition:

```aether
let mut i = 0;
let mut acc = 0;
while i < 10 {
  acc = acc + i;
  i = i + 1;
}
print(acc);   // 45
```

The condition must be `bool` (same rule as `if`). The body is a block (a series of statements with an optional trailing expression — but the trailing expression is discarded; `while` always returns `()`).

### 3.2.1 `break` and `continue`

Both work inside `while`:

```aether
let mut i = 0;
let mut evens = [];
while i < 20 {
  i = i + 1;
  if i % 2 == 1 { continue; }    // skip odd
  if i > 10 { break; }            // stop at 11
  push(evens, i);
}
print(evens);   // [2, 4, 6, 8, 10]
```

`break` exits the loop. `continue` skips to the next iteration. Both are scoped to the innermost loop. They produce a type error if used outside a `while` or `for`:

```aether
fn f() -> () {
  break;   // type error: 'break' outside of a loop
}
```

### 3.2.2 `while` is a statement, not an expression

`while` evaluates to `()`. You can't do `let x = while ... { ... };` and expect a useful value. Use `for in` with `reduce`, or use recursion, or use a mutable accumulator that you read after the loop. (This is a deliberate constraint — making `while` an expression would require break-with-value semantics like Rust, which Aether doesn't have.)

---

## 3.3 `for in`

`for` is for iterating. It binds a variable to each element of an iterable and runs a block:

```aether
for i in range(0, 5) {
  print(i);
}
// 0
// 1
// 2
// 3
// 4
```

The iterable can be a `range`, an array, or a string:

```aether
let xs = [10, 20, 30];
for x in xs { print(x); }

let s = "abc";
for c in s { print(c); }   // iterates by code point
```

The compiler reports `cannot iterate over <T>` if you try to iterate a non-iterable:

```aether
// Type error: cannot iterate over int
// for x in 42 { print(x); }
```

### 3.3.1 `break` and `continue` in `for`

Same semantics as `while`:

```aether
for i in range(0, 10) {
  if i == 5 { break; }
  if i % 2 == 0 { continue; }
  print(i);   // 1, 3
}
```

### 3.3.2 A scoping quirk to be aware of

There is a *known* quirk in v1 where a `let` binding declared before a `for` loop and *referenced after the loop* in some configurations gets "undefined name". This is documented in the `binary_tree.ae` example as a known issue. The workaround is to use recursion (for accumulators) or to compute the value inside the loop and write it to a `let mut` declared *outside*. Chapter 14 covers this in detail in the anti-patterns section.

Example of the quirk (v1, in some configurations):

```aether
let mut t = List::Nil;
for v in [1, 2, 3] {
  t = list_prepend(t, v);
}
print(t);   // may report "undefined name 't'"
```

The idiomatic fix:

```aether
fn build(xs: [int]) -> List {
  match xs[0..] {  // hypothetical slice — actual idiom uses recursion
    ...
  }
}
// or use the recursive helper pattern from binary_tree.ae
```

This will be fixed in v2.x; the workaround is to use recursion or to call a helper function that returns the accumulator.

---

## 3.4 `match` — the deep section

`match` is Aether's pattern-matching expression. It's a real expression — it returns the value of the arm that matched. It supports:

- Literal patterns: `1`, `"hello"`, `true`, `'a'`.
- Variable patterns: `x` (binds the value).
- Wildcard: `_` (matches anything, doesn't bind).
- Tuple patterns: `(a, b, c)`.
- Array patterns: `[a, b, c]` or `[a, ...rest]` (limited — see below).
- Struct patterns: `Point { x, y }` or `Point { x: xp, y: yp }`.
- Enum patterns: `Option::Some(v)`, `Color::Red`, `Result::Ok(v) | Result::Err(e)`.
- Or-patterns: `1 | 2 | 3`.
- Guards: `pattern if cond => expr`.

The scrutinee can be any expression. The arms are tried in order; the first match wins. There is *no exhaustiveness check* in v1 — if no arm matches, the program panics at runtime with `no match arm matched`. v2.1 will add exhaustiveness checking. In the meantime, *always add a `_ => ...` arm* unless you've enumerated all variants explicitly.

### 3.4.1 Basic examples

```aether
let n = 3;
let s = match n {
  0 => "zero",
  1 => "one",
  2 => "two",
  _ => "many",
};
print(s);   // many
```

```aether
let c = 'a';
let kind = match c {
  'a' | 'e' | 'i' | 'o' | 'u' => "vowel",
  _ => "consonant",
};
print(kind);   // vowel
```

### 3.4.2 Tuple destructuring

```aether
let p = (3, 4);
let sum = match p {
  (a, b) => a + b,
};
print(sum);   // 7
```

```aether
let pairs = [(1, "one"), (2, "two"), (3, "three")];
for pair in pairs {
  let s = match pair {
    (n, name) => f"{n} = {name}",
  };
  print(s);
}
```

Tuple patterns must match the arity. The type checker reports `tuple pattern arity N does not match M` if they don't.

### 3.4.3 Array patterns

```aether
let xs = [1, 2, 3];
let s = match xs {
  [] => "empty",
  [a] => f"one: {a}",
  [a, b] => f"two: {a}, {b}",
  _ => "many",
};
print(s);   // many
```

(Aether's array pattern support is conservative — it supports fixed-length patterns and `[a, ...]`-style "at least one" patterns in v2; v1 supports fixed-length only. The `_` wildcard is the catch-all.)

### 3.4.4 Struct patterns

```aether
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
let s = match p {
  Point { x: 0, y: 0 } => "origin",
  Point { x: 0, y } => f"on y-axis at {y}",
  Point { x, y: 0 } => f"on x-axis at {x}",
  Point { x, y } => f"({x}, {y})",
};
print(s);   // (1, 2)
```

You can use the field name as a shorthand: `Point { x, y }` binds `x` to `p.x` and `y` to `p.y`.

### 3.4.5 Enum patterns

```aether
enum Option<T> { Some(T), None, }
enum Result<T, E> { Ok(T), Err(E), }

fn double(o: Option<int>) -> int {
  match o {
    Option::Some(v) => v * 2,
    Option::None => 0,
  }
}

fn sqrt_or_zero(r: Result<float, string>) -> float {
  match r {
    Result::Ok(x) => sqrt(x),
    Result::Err(_) => 0.0,
  }
}

print(double(Option::Some(21)));   // 42
print(sqrt_or_zero(Result::Ok(16.0)));   // 4
```

### 3.4.6 Guards

A guard is a `if cond` after the pattern:

```aether
let n = 15;
let kind = match n {
  x if x < 0 => "negative",
  0 => "zero",
  x if x < 10 => "small",
  _ => "large",
};
print(kind);   // large
```

Guards must be `bool`. The type checker reports `match guard must be bool, found <T>` if they aren't.

### 3.4.7 Or-patterns

```aether
let c = 'x';
let kind = match c {
  'a' | 'e' | 'i' | 'o' | 'u' |
  'A' | 'E' | 'I' | 'O' | 'U' => "vowel",
  _ => "consonant",
};
print(kind);
```

Or-patterns share a single arm body. The variables bound by the patterns must agree (you can't bind `v` in one alternative and not in another).

### 3.4.8 Nested patterns

```aether
enum Tree { Node(int, Tree, Tree), Leaf, }
let t = Tree::Node(1, Tree::Node(2, Tree::Leaf, Tree::Leaf), Tree::Leaf);
let s = match t {
  Tree::Leaf => "leaf",
  Tree::Node(_, Tree::Leaf, Tree::Leaf) => "single node with two leaves",
  Tree::Node(v, l, r) => f"node {v} with subtrees",
};
print(s);
```

### 3.4.9 `match` is an expression — use it like one

```aether
fn describe(xs: [int]) -> string {
  match xs {
    [] => "empty",
    [x] => f"one: {x}",
    [a, b] => f"two: {a}, {b}",
    _ => "many",
  }
}

let arrs = [[1], [1, 2], [1, 2, 3]];
for a in arrs { print(describe(a)); }
```

### 3.4.10 Exhaustiveness — a runtime note

Aether does *not* check exhaustiveness at compile time (v1; v2.1 will). If no arm matches at runtime, the program panics:

```aether
enum Color { Red, Green, Blue, }
fn name(c: Color) -> string {
  match c {
    Color::Red => "red",
  }   // missing Green and Blue — no exhaustiveness error in v1
}
print(name(Color::Green));   // runtime: no match arm matched
```

The fix: always add a `_ => ...` arm unless you've enumerated all variants.

```aether
fn name(c: Color) -> string {
  match c {
    Color::Red => "red",
    Color::Green => "green",
    Color::Blue => "blue",
  }   // OK — all three variants covered
}
```

---

## 3.5 `break`, `continue`, and early return

`break` and `continue` work inside `while` and `for`. `return` works inside `fn` (not at the top level — that's a type error: `'return' outside of a function`).

`return` is a *statement*, not an expression. It doesn't have a type (or, in spirit, has type `never`). It can appear inside an `if` arm to short-circuit:

```aether
fn first_even(xs: [int]) -> int {
  for x in xs {
    if x % 2 == 0 { return x; }
  }
  return 0;
}
```

### 3.5.1 Expression-style vs early-return style

The same function can be written in two styles:

**Early-return style:**

```aether
fn classify(n: int) -> string {
  if n < 0 { return "negative"; }
  if n == 0 { return "zero"; }
  return "positive";
}
```

**Expression style:**

```aether
fn classify(n: int) -> string {
  if n < 0 { "negative" } else if n == 0 { "zero" } else { "positive" }
}
```

(Actually, Aether doesn't have `else if`; you nest `else { if ... }`. The expression-style version is therefore:

```aether
fn classify(n: int) -> string {
  if n < 0 { "negative" } else {
    if n == 0 { "zero" } else { "positive" }
  }
}
```

Or, more readably, with `match`:

```aether
fn classify(n: int) -> string {
  match true {
    _ if n < 0 => "negative",
    _ if n == 0 => "zero",
    _ => "positive",
  }
}
```

The idiomatic Aether preference is *expression-style* — return values from the bottom of the function, use `match` for branching, use `return` only for early exits (error paths, etc.).

---

## 3.6 Eight runnable examples

**1. `if` as expression — max of two.**

```aether
fn max(a: int, b: int) -> int {
  if a > b { a } else { b }
}
print(max(3, 7));   // 7
```

**2. `while` with break.**

```aether
let mut i = 0;
while true {
  if i >= 5 { break; }
  print(i);
  i = i + 1;
}
```

**3. `for in` over a string.**

```aether
let s = "Aether";
let mut count = 0;
for c in s { count = count + 1; }
print(count);   // 6
```

**4. `match` on an int.**

```aether
let n = 2;
print(match n {
  0 => "zero",
  1 => "one",
  2 => "two",
  _ => "many",
});
```

**5. `match` on a tuple.**

```aether
let p = (3, 4);
print(match p {
  (0, 0) => "origin",
  (x, 0) => f"x-axis at {x}",
  (0, y) => f"y-axis at {y}",
  (x, y) => f"({x}, {y})",
});
```

**6. `match` on an enum (with a `_` arm).**

```aether
enum Color { Red, Green, Blue, }
fn name(c: Color) -> string {
  match c {
    Color::Red => "red",
    _ => "not red",
  }
}
print(name(Color::Green));   // not red
```

**7. `match` with a guard.**

```aether
let n = 15;
print(match n {
  x if x < 0 => "negative",
  0 => "zero",
  x if x < 10 => "small",
  _ => "large",
});
```

**8. `continue` to skip.**

```aether
for i in range(0, 10) {
  if i % 3 == 0 { continue; }
  print(i);
}
// 1, 2, 4, 5, 7, 8
```

---

## 3.7 Summary

- `if`/`else` is an expression. Both arms must unify to the same type. The condition must be `bool`.
- `while` is a loop with a `bool` condition. It evaluates to `()`. `break` and `continue` work inside it.
- `for x in iterable { ... }` iterates a range, array, or string. Same `break`/`continue` semantics.
- `match` is the workhorse: literals, tuples, arrays, structs, enums, or-patterns, guards. Always include a `_ => ...` arm in v1 (no exhaustiveness check yet).
- `return` is a statement, not an expression. Use it for early exits, not for the function's main value.
- The idiomatic style is *expression-style*: `fn f() -> T { match ... { ... } }`, with `return` only for early-exit/error paths.

The next chapter is functions and closures: parameters, return types, generics, closure capture, recursion, and the call stack.
