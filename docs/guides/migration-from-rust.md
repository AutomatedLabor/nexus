# Migration from Rust

> Audience: a Rust programmer wanting to learn Aether.
> Prerequisites: comfort with Rust. 25 minutes.

This guide is a translation table: Rust → Aether. The biggest
honest caveat upfront: **Aether v1 has no borrow checker, no
lifetimes, no `&`/`&mut`/`*`, no `move`, no `Drop`**. The
memory model is GC. This is the v1 reality; the v2 plan adds
borrow checking — see
[../rfcs/rfc-004-borrow-checker.md](../rfcs/rfc-004-borrow-checker.md).

For the v1 ownership model, see
[../tutorials/ownership.md](../tutorials/ownership.md).

## 1. The big picture

| Aspect | Rust | Aether v1 |
|--------|------|-----------|
| Memory | ownership + borrow check | GC |
| Mutation | `let mut` required | `let mut` required |
| Null | `Option<T>` | `Option<T>` |
| Errors | `Result<T, E>` | `Result<T, E>` |
| Async | `async`/`await` | sync only (v2 planned) |
| Generics | full monomorphization | full monomorphization (v1) |
| Traits | yes | not in v1 (planned for v2) |
| Pattern matching | `match`, exhaustive | `match`, exhaustive (in v2) |
| Macros | yes | not in v1 (planned for v2) |
| Modules | yes (v1) | not in v1 (planned for v2) |
| Concurrency | `Send`/`Sync` | sync only |

Aether and Rust share a syntactic lineage. `enum`, `match`,
`Option`, `Result`, the `?` operator, `let`/`let mut`, `fn`,
`->` — all the same shape. What you have to *unlearn* for v1:

- `&` and `&mut` are not in Aether v1. References are implicit.
- `move` is not a keyword. All values are reference types.
- `clone()` is not a method. Use stdlib `slice` or build a new
  struct.
- `Drop` is not a trait. The GC handles cleanup.
- `Box`, `Rc`, `Arc` are not in Aether v1. Everything is GC'd.
- `unsafe` is not a keyword. There is no FFI.

What you *keep*:

- `enum` with `Option` and `Result` is the same shape.
- `match` is the same shape.
- `let`/`let mut` mean what you expect.
- The `?` operator works on `Result` and `Option`.
- Generics with `<T>` work the same way.
- String interpolation with `f"{x}"` is similar to
  `format!("{x}")`.

## 2. Variables

### 2.1 let / let mut / const

```rust
// Rust
let x: i32 = 42;
let mut y: f64 = 3.14;
const PI: f64 = 3.14159;
```

```aether
// Aether
let x: int = 42;
let mut y: float = 3.14;
const PI: float = 3.14159;
```

Differences:

- Aether has one `int` (64-bit) and one `float` (IEEE double);
  Rust has `i8`/`i16`/`i32`/`i64`/`u8`/.../`f32`/`f64`.
- Aether's `const` is runtime-evaluated in v1; Rust's `const`
  is compile-time-evaluated.
- Aether's `let` is immutable; Rust's `let` is immutable (same).
- Aether's `let mut` allows reassignment; Rust's `let mut`
  allows reassignment (same).

### 2.2 Shadowing

```rust
// Rust — shadowing is idiomatic
let x = 5;
let x = x + 1;
let x = x * 2;
```

```aether
// Aether — shadowing works, but distinct names are clearer
let x = 5;
let x = x + 1;   // shadows
let x = x * 2;   // shadows again
```

Shadowing works in both. Aether convention is to use distinct
names unless the shadow is one step; see
[../guides/idiomatic-aether.md](../guides/idiomatic-aether.md)
pattern 4.

### 2.3 Destructuring

```rust
let (a, b) = (1, 2);
let [x, y, ..] = [1, 2, 3, 4];
let Point { x, y } = p;
```

```aether
let (a, b) = (1, 2);
// Array destructuring in `let` is not supported in v1; use `match`.
let p = (1, 2);
let (x, y) = p;
// Struct destructuring in `let`:
struct Point { x: int, y: int }
let pt = Point { x: 1, y: 2 };
match pt { Point { x: a, y: b } => print(f"{a}, {b}") }
```

Aether supports tuple destructuring in `let`. Array
destructuring in `let` is not in v1; use `match` for it.

## 3. Functions

### 3.1 Declaration

```rust
// Rust
fn add(a: i32, b: i32) -> i32 {
    a + b
}
```

```aether
// Aether
fn add(a: int, b: int) -> int {
  a + b
}
```

Same shape. Aether uses `int` instead of `i32`. The body is
the same; the last expression is the return value.

### 3.2 Closures

```rust
// Rust
let add = |a: i32, b: i32| a + b;
let inc = |x| x + 1;
```

```aether
// Aether
let add = fn(a: int, b: int) -> int { a + b };
let inc = fn(x: int) -> int { x + 1 };
```

Aether closures use `fn(args) -> ret { body }` (full syntax)
instead of `|args| body` (short syntax). The v1 compiler
requires parameter type annotations on closures; v2 may infer
them.

### 3.3 Higher-order functions

```rust
// Rust
let doubled: Vec<i32> = vec![1, 2, 3].iter().map(|x| x * 2).collect();
let sum: i32 = vec![1, 2, 3].iter().sum();
```

```aether
// Aether
let doubled = map([1, 2, 3], fn(x: int) -> int { x * 2 });
let sum = reduce([1, 2, 3], fn(a: int, b: int) -> int { a + b }, 0);
```

Aether's `map`, `filter`, `reduce` are free functions, not
methods on iterators. There is no `.iter()` or `.collect()`.

### 3.4 Generics

```rust
// Rust
fn id<T>(x: T) -> T { x }
fn max<T: Ord>(a: T, b: T) -> T {
    if a > b { a } else { b }
}
```

```aether
// Aether
fn id<T>(x: T) -> T { x }
fn max<T: Ord>(a: T, b: T) -> T {
  if a > b { a } else { b }
}
```

Same syntax, including the `T: Ord` bound. The bound is
recorded but not enforced in v1; see
[../spec/03-type-system.md](../spec/03-type-system.md) §4.2.

### 3.5 Recursion

```rust
// Rust
fn fib(n: u32) -> u32 {
    if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
```

```aether
// Aether
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
```

Same shape. Aether has a step limit (1,000,000 steps by
default) that bounds recursion; see
[../tutorials/performance.md](../tutorials/performance.md).

## 4. Types

### 4.1 Struct

```rust
// Rust
struct Point { x: i32, y: i32 }
let p = Point { x: 1, y: 2 };
println!("{}", p.x);
```

```aether
// Aether
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
print(p.x);
```

Same shape. Aether structs cannot have methods (use free
functions; v2 may add `impl` blocks).

### 4.2 Enum

```rust
// Rust
enum Shape {
    Circle(i32),
    Rect(i32, i32),
    Unit,
}

fn area(s: Shape) -> i32 {
    match s {
        Shape::Circle(r) => 3 * r * r,
        Shape::Rect(w, h) => w * h,
        Shape::Unit => 0,
    }
}
```

```aether
// Aether
enum Shape {
  Circle(int),
  Rect(int, int),
  Unit,
}

fn area(s: Shape) -> int {
  match s {
    Shape::Circle(r)    => 3 * r * r,
    Shape::Rect(w, h)   => w * h,
    Shape::Unit         => 0,
  }
}
```

Same shape. Aether `enum` is an ADT in the Rust tradition.

### 4.3 Option and Result

```rust
// Rust
fn lookup(xs: &[i32], i: usize) -> Option<i32> {
    if i < xs.len() { Some(xs[i]) } else { None }
}
```

```aether
// Aether
fn lookup(xs: [int], i: int) -> Option<int> {
  if i < 0 || i >= len(xs) { Option::None }
  else { Option::Some(xs[i]) }
}
```

Same shape, but:

- Aether has no `&[i32]`; use `[int]` (arrays are reference
  types in v1).
- Aether has no `usize`; use `int`.
- Aether uses `Option::Some`/`Option::None` (with the `::`
  prefix).

### 4.4 Tuple

```rust
// Rust
let p: (i32, i32) = (1, 2);
let (a, b) = p;
println!("{} {}", a, b);
```

```aether
// Aether
let p: (int, int) = (1, 2);
let (a, b) = p;
print(f"{a} {b}");
```

Same shape. Aether tuples are structural and immutable.

### 4.5 Vec / array

```rust
// Rust
let xs: Vec<i32> = vec![1, 2, 3];
let ys: [i32; 3] = [1, 2, 3];
```

```aether
// Aether — one array type
let xs: [int] = [1, 2, 3];
```

Aether has one array type: `[T]` (growable, like `Vec<T>`).
There is no fixed-size array `[T; N]`.

### 4.6 HashMap

```rust
// Rust
let mut m: HashMap<String, i32> = HashMap::new();
m.insert("a".to_string(), 1);
m.get("a");   // Option<&i32>
```

```aether
// Aether
let m: map[string]int = { "a": 1, "b": 2 };
print(m["a"]);   // 1
```

Aether maps use `{ k: v }` literals. Get is `m[k]` (panics if
missing) or `map_get` (returns null if missing, in v1; v2 may
return `Option`).

## 5. Control flow

### 5.1 if/else

```rust
// Rust
let parity = if n % 2 == 0 { "even" } else { "odd" };
```

```aether
// Aether
let parity = if n % 2 == 0 { "even" } else { "odd" };
```

Same shape. `if` is an expression in both languages.

### 5.2 while / for / loop

```rust
// Rust
let mut i = 0;
while i < 10 {
    i += 1;
}

for i in 0..10 {
    println!("{}", i);
}

loop {
    break;
}
```

```aether
// Aether
let mut i = 0;
while i < 10 {
  i = i + 1;
}

for i in range(0, 10) {
  print(i);
}

// Aether has no `loop`; use `while true`.
while true {
  break;
}
```

Aether has no `loop` keyword; use `while true`. Aether has no
`0..10` range syntax; use `range(0, 10)`.

### 5.3 match

```rust
// Rust
match n {
    0 => "zero",
    1 | 2 => "small",
    _ => "many",
}
```

```aether
// Aether
match n {
  0       => "zero",
  1 | 2   => "small",
  _       => "many",
}
```

Same shape. Aether `match` is an expression, like Rust's.

## 6. Memory — the honest differences

### 6.1 No `&` and `&mut`

```rust
// Rust
fn add_one(x: &mut i32) {
    *x += 1;
}
let mut n = 5;
add_one(&mut n);
```

```aether
// Aether — no references; return the new value
fn add_one(x: int) -> int { x + 1 }
let n = 5;
let m = add_one(n);
print(m);   // 6
```

Aether v1 has no `&` or `&mut`. To "mutate" a value, return a
new one. (For arrays and maps, you can mutate through the
reference: `xs[i] = ...` works, but you do not need to mark
the binding `mut` for that — see
[../tutorials/ownership.md](../tutorials/ownership.md) §4.3.)

### 6.2 No `move` semantics

```rust
// Rust — move
let s1 = String::from("hello");
let s2 = s1;   // s1 is moved, unusable
println!("{}", s2);
```

```aether
// Aether — copy the reference
let s1 = "hello";
let s2 = s1;   // both s1 and s2 are valid
print(s2);
```

Aether v1 has no move; all values are reference types. Both
`s1` and `s2` are valid after the assignment.

### 6.3 No `clone()`

```rust
// Rust
let v1 = vec![1, 2, 3];
let v2 = v1.clone();
```

```aether
// Aether — use slice for shallow copy
let v1 = [1, 2, 3];
let v2 = slice(v1, 0, len(v1));
```

Aether v1 has no `clone()` method. Use stdlib `slice(arr, 0,
len(arr))` for arrays. For maps, build a new map from the
entries. For structs, build a new struct with the same fields.

### 6.4 No `Box`, `Rc`, `Arc`

Aether v1 has no smart pointers. Everything is GC'd. You do
not need to choose between `Box`, `Rc`, `Arc`, `&`; just use
the value.

### 6.5 Recursive data structures

```rust
// Rust — needs Box because List cannot be infinite size
enum List<T> {
    Empty,
    Cons(T, Box<List<T>>),
}
```

```aether
// Aether — no Box needed; GC handles it
enum List<T> {
  Empty,
  Cons(T, List<T>),
}
```

This is one place where Aether v1 is simpler than Rust:
recursive data structures do not need `Box`. The GC handles
the indirection.

## 7. Errors

### 7.1 Result and ?

```rust
// Rust
fn parse(s: &str) -> Result<i32, String> {
    // ... parsing logic
    Ok(42)
}

fn double(s: &str) -> Result<i32, String> {
    let n = parse(s)?;
    Ok(n * 2)
}
```

```aether
// Aether
fn parse(s: string) -> Result<int, string> {
  // ... parsing logic
  Result::Ok(42)
}

fn double(s: string) -> Result<int, string> {
  let n = parse(s)?;
  Result::Ok(n * 2)
}
```

Same shape, including the `?` operator.

### 7.2 panic!

```rust
// Rust
fn factorial(n: i32) -> i32 {
    if n < 0 { panic!("negative"); }
    if n <= 1 { 1 } else { n * factorial(n - 1) }
}
```

```aether
// Aether
fn factorial(n: int) -> int {
  if n < 0 { panic("negative"); }
  if n <= 1 { 1 } else { n * factorial(n - 1) }
}
```

Aether uses `panic(msg)` (function call) instead of
`panic!(msg)` (macro). The semantics are the same: abort the
current task with the message.

### 7.3 No `From` trait

```rust
// Rust — From trait auto-converts in ?
fn load_user(id: i32) -> Result<User, AppError> {
    let text = read_file(...)?;   // io::Error -> AppError via From
    let user = parse_user(text)?; // ParseError -> AppError via From
    Ok(user)
}
```

```aether
// Aether — manual conversion
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

Aether v1 has no `From` trait. You must convert manually. v2
will add `From`; see
[../spec/08-error-handling.md](../spec/08-error-handling.md)
§2.2.

## 8. What is missing in Aether v1

| Rust feature | Aether v1 | Workaround |
|--------------|-----------|------------|
| Borrow check | not present | implicit references; GC |
| Lifetimes | not present | n/a |
| `&` / `&mut` / `*` | not present | implicit |
| `move` | not present | n/a (everything is reference type) |
| `clone()` | not present | stdlib `slice` / manual copy |
| `Box` / `Rc` / `Arc` | not present | n/a (everything is GC'd) |
| `Drop` | not present | n/a |
| Traits | not present | free functions; v2 planned |
| `impl` blocks | not present | free functions; v2 planned |
| Macros | not present | n/a |
| `async`/`await` | not present | sync only; v2 planned |
| `Send`/`Sync` | not present | sync only |
| Modules | not present | single file; v2 planned |
| Crates | not present | single file; v2 planned |
| FFI / `extern "C"` | not present | n/a |
| `unsafe` | not present | n/a |
| `derive` | not present | manual |
| `?Sized` | not present | n/a |
| `std::collections::*` | stdlib `collections` | `map_new`, `set_new` |
| `std::fs` | partial | stdlib `io` (Node only) |
| `std::net` | not present | n/a |
| `std::thread` | not present | sync only |
| `std::process` | partial | stdlib `io` (Node only) |

## 9. A worked example: porting a small Rust program

### 9.1 Rust

```rust
// stats.rs
use std::collections::HashMap;

fn word_count(text: &str) -> HashMap<String, u32> {
    let mut counts = HashMap::new();
    for word in text.split_whitespace() {
        let entry = counts.entry(word.to_string()).or_insert(0);
        *entry += 1;
    }
    counts
}

fn main() {
    let counts = word_count("the cat the dog the bird");
    for (word, n) in &counts {
        println!("{}: {}", word, n);
    }
}
```

### 9.2 Aether

```aether
// stats.ae
fn word_count(text: string) -> map[string]int {
  let counts = map_new();
  for word in split(text, " ") {
    if map_has(counts, word) {
      map_set(counts, word, map_get(counts, word) + 1);
    } else {
      map_set(counts, word, 1);
    }
  }
  counts
}

let counts = word_count("the cat the dog the bird");
let keys = map_keys(counts);
for w in keys {
  print(f"{w}: {map_get(counts, w)}");
}
// → the: 3
// → cat: 1
// → dog: 1
// → bird: 1
```

Differences:

- No `use std::collections::HashMap`; the stdlib `map_*`
  functions are global.
- No `&str`; use `string`.
- No `.split_whitespace()`; use stdlib `split`.
- No `.entry().or_insert()`; use `map_has`/`map_get`/`map_set`.
- No `for (word, n) in &counts`; iterate over `map_keys`.

## 10. Where to go next

- **[../tutorials/ownership.md](../tutorials/ownership.md)** —
  the v1 memory model and the v2 plan.
- **[../tutorials/error-handling.md](../tutorials/error-handling.md)**
  — `Result` and `Option` in depth.
- **[../tutorials/concurrency.md](../tutorials/concurrency.md)**
  — the v1 sync reality and the v2 async plan.
- **[../guides/idiomatic-aether.md](idiomatic-aether.md)** —
  what good Aether looks like.
- **[../rfcs/rfc-004-borrow-checker.md](../rfcs/rfc-004-borrow-checker.md)**
  — the v2 ownership plan.

Welcome from Rust. The mental shift is: drop the borrow
checker, drop the lifetime annotations, drop the
`Box`/`Rc`/`Arc` choice. The cost is no compile-time memory
safety guarantee. The benefit is simpler code, especially for
recursive data structures. The v2 plan adds the borrow checker
back; until then, the GC carries you.
