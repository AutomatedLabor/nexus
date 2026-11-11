# Migration from Go

> Audience: a Go programmer wanting to learn Aether.
> Prerequisites: comfort with Go. 25 minutes.

This guide is a translation table: Go → Aether. The biggest
honest caveats upfront:

1. Aether v1 has **no structs with methods**, no interfaces.
   Use `struct` for data and free functions for behavior.
2. Aether v1 is **single-threaded and synchronous**. There is
   no `go` keyword, no channels, no `select`.
3. Aether v1 has **no `nil`**. Use `Option<T>` instead.
4. Aether v1 has **no error-as-value semantics beyond
   `Result`**. There is no `error` interface; use
   `Result<T, E>`.
5. Aether v1 has **no packages**. Single-file programs only.
6. Aether v1 has **no `defer`**. (Planned for v2.)

For the language tour, see
[../tutorials/getting-started.md](../tutorials/getting-started.md).

## 1. The big picture

| Aspect | Go | Aether |
|--------|-----|--------|
| Typing | static, no inference (mostly) | static, inferred |
| Mutation | mutable by default | immutable by default |
| nil | yes | `Option<T>` |
| Errors | `(T, error)` tuples, `if err != nil` | `Result<T, E>` and `?` |
| Interfaces | structural | not in v1 (planned for v2) |
| Methods | on structs | not in v1 (planned for v2) |
| Goroutines | yes | not in v1 (sync only) |
| Channels | yes | not in v1 (v2 planned) |
| Defer | yes | not in v1 (v2 planned) |
| Generics | yes (1.18+) | yes |
| Packages | yes | not in v1 (v2 planned) |

If you have used Go with generics, Aether will feel familiar
in the type system but different in error handling and
concurrency. The main shifts are: immutability by default,
`Result<T, E>` instead of `(T, error)` tuples, no
goroutines/channels in v1.

## 2. Variables

### 2.1 var / :=

```go
// Go
var x int = 42
y := 3.14
const PI = 3.14159
```

```aether
// Aether
let x: int = 42;
let y = 3.14;
const PI: float = 3.14159;
```

Differences:

- Aether uses `let` (immutable) or `let mut` (mutable); Go
  uses `var` (mutable) or `:=` (mutable, inferred).
- Aether has `int` and `float` as separate types; Go has
  `int`, `int32`, `int64`, `float32`, `float64`, etc.

### 2.2 Short declarations

```go
// Go
x := 42
```

```aether
// Aether
let x = 42;
```

Aether uses `let` for the same effect. Both infer the type
from the initializer.

### 2.3 Constants

```go
// Go
const PI = 3.14159
const MaxRetries = 3
```

```aether
// Aether
const PI: float = 3.14159;
const MAX_RETRIES: int = 3;
```

Same idea. Aether convention is `UPPER_SNAKE_CASE` for
constants (matching Go's convention).

## 3. Functions

### 3.1 Declaration

```go
// Go
func add(a int, b int) int {
    return a + b
}
```

```aether
// Aether
fn add(a: int, b: int) -> int {
  a + b
}
```

Differences:

- Aether uses `fn` instead of `func`.
- Aether parameter syntax is `name: type` (with colon); Go is
  `name type` (no colon).
- Aether's body returns the last expression; Go's body needs
  `return`.

### 3.2 Multiple return values

```go
// Go
func divmod(a, b int) (int, int) {
    return a / b, a % b
}
q, r := divmod(17, 5)
```

```aether
// Aether — use a tuple
fn div_mod(a: int, b: int) -> (int, int) {
  (a / b, a % b)
}
let (q, r) = div_mod(17, 5);
```

Aether returns a tuple, like Go returns multiple values. The
syntax for destructuring is `let (a, b) = ...`.

### 3.3 Named return values

```go
// Go
func divmod(a, b int) (q, r int) {
    q = a / b
    r = a % b
    return
}
```

```aether
// Aether — no named return values
fn div_mod(a: int, b: int) -> (int, int) {
  (a / b, a % b)
}
```

Aether has no named return values. Return a tuple explicitly.

### 3.4 Closures

```go
// Go
adder := func(a int) int {
    return a + base
}
```

```aether
// Aether
let adder = fn(a: int) -> int { a + base };
```

Aether closures use `fn(args) -> ret { body }`. The `return`
is implicit for the last expression.

### 3.5 Generics

```go
// Go
func id[T any](x T) T { return x }
```

```aether
// Aether
fn id<T>(x: T) -> T { x }
```

Same shape. Aether uses `<T>` for type parameters; Go uses
`[T]`. Aether does not have an `any` constraint; just omit
the bound.

## 4. Types

### 4.1 Structs

```go
// Go
type User struct {
    ID   int
    Name string
}

alice := User{ID: 1, Name: "Alice"}
fmt.Println(alice.Name)
```

```aether
// Aether
struct User { id: int, name: string }
let alice = User { id: 1, name: "Alice" };
print(alice.name);
```

Differences:

- Aether uses `struct Name { field: type, ... }` (no `type`
  prefix).
- Construction is `Name { field: value, ... }` (with spaces
  around the braces).
- Field access is `x.field` (same).
- Aether structs cannot have methods (use free functions);
  Go structs can.

### 4.2 Methods

```go
// Go
type Point struct { X, Y int }

func (p Point) Distance() int {
    return p.X*p.X + p.Y*p.Y
}

p := Point{1, 2}
fmt.Println(p.Distance())
```

```aether
// Aether — free function, no methods
struct Point { x: int, y: int }
fn distance(p: Point) -> int {
  p.x * p.x + p.y * p.y
}

let p = Point { x: 1, y: 2 };
print(distance(p));
```

Aether v1 has no methods on structs. Use a free function. v2
may add `impl` blocks; see
[../spec/05-statements-and-declarations.md](../spec/05-statements-and-declarations.md).

### 4.3 Interfaces

```go
// Go
type Stringer interface {
    String() string
}

func describe(s Stringer) string {
    return s.String()
}
```

```aether
// Aether — no interfaces in v1; use enum + match
enum Stringable {
  IntVal(int),
  StrVal(string),
}

fn describe(s: Stringable) -> string {
  match s {
    Stringable::IntVal(n) => str(n),
    Stringable::StrVal(s) => s,
  }
}
```

Aether v1 has no interfaces. Use an `enum` and `match` to
dispatch on the variant. v2 may add traits; see
[../spec/03-type-system.md](../spec/03-type-system.md) §4.

### 4.4 Enums (ADTs)

Go does not have built-in enums. You simulate them with
`iota`:

```go
// Go
type HttpStatus int

const (
    Ok HttpStatus = iota
    NotFound
    ServerError
)

func describe(s HttpStatus) string {
    switch s {
    case Ok:
        return "ok"
    case NotFound:
        return "not found"
    default:
        return "server error"
    }
}
```

```aether
// Aether — first-class enums
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
```

Aether's `enum` is much more powerful than Go's `iota`. Each
variant can carry data, and the `match` is exhaustive.

### 4.5 Slices and arrays

```go
// Go — slices
xs := []int{1, 2, 3}
xs = append(xs, 4)
fmt.Println(xs[0])
fmt.Println(len(xs))
```

```aether
// Aether — arrays (growable)
let xs = [1, 2, 3];
let xs2 = push(xs, 4);
print(xs[0]);
print(len(xs));
```

Aether has one array type: `[T]` (growable, like Go's slice).
The `push` builtin is non-mutating in v1 — assign back: `xs =
push(xs, 4)`.

### 4.6 Maps

```go
// Go
m := map[string]int{"a": 1, "b": 2}
m["c"] = 3
fmt.Println(m["a"])
v, ok := m["z"]
if !ok { ... }
```

```aether
// Aether
let m = { "a": 1, "b": 2 };
// m["c"] = 3;  // OK in v1
print(m["a"]);
if map_has(m, "z") {
  print(map_get(m, "z"));
} else {
  print("absent");
}
```

Aether maps use `{ k: v }` literals. Get/set is via `[]`. `m[k]`
panics if `k` is not present; use `map_get`/`map_has` to
handle absence. (Go's `v, ok := m[k]` is more ergonomic; v2
may add a similar pattern.)

## 5. Control flow

### 5.1 if/else

```go
// Go
if n < 0 {
    fmt.Println("neg")
} else if n == 0 {
    fmt.Println("zero")
} else {
    fmt.Println("pos")
}
```

```aether
// Aether — if is an expression
let desc = if n < 0 { "neg" } else if n == 0 { "zero" } else { "pos" };
print(desc);
```

Aether's `if` is an expression. You can bind its value, like
Go's switch-as-expression (which Go does not have).

### 5.2 for

```go
// Go — three forms
for i := 0; i < 10; i++ { ... }
for x := range xs { ... }
for { ... }
```

```aether
// Aether — one form
for i in range(0, 10) { ... }
for x in xs { ... }
// for infinite loop: while true
while true { ... }
```

Aether has `for x in iterable` only. Use `range` for index
loops. Use `while true` for infinite loops.

### 5.3 switch

```go
// Go
switch n {
case 0:
    return "zero"
case 1, 2:
    return "small"
default:
    return "many"
}
```

```aether
// Aether — match
match n {
  0       => "zero",
  1 | 2   => "small",
  _       => "many",
}
```

Aether uses `match` instead of `switch`. There is no
fallthrough; arms are separated by `,`. The `_` is the
wildcard (like `default`).

## 6. Errors

### 6.1 The error interface → Result

```go
// Go — error as value
func parse(s string) (int, error) {
    n, err := strconv.Atoi(s)
    if err != nil {
        return 0, err
    }
    return n, nil
}

n, err := parse("42")
if err != nil {
    fmt.Println(err)
} else {
    fmt.Println(n)
}
```

```aether
// Aether — Result<T, E>
fn parse(s: string) -> Result<int, string> {
  // ... imagine parsing
  if s == "42" { Result::Ok(42) } else { Result::Err("not a number") }
}

match parse("42") {
  Result::Ok(n)  => print(n),
  Result::Err(e) => print(f"error: {e}"),
}
```

Differences:

- Go returns `(T, error)` tuples; Aether returns `Result<T, E>`.
- Go's `if err != nil` is replaced by `match`.
- Aether has no `nil`; `Result::Err` always carries a value.

### 6.2 The ? operator

```go
// Go — manual error propagation
func load_user(id int) (User, error) {
    text, err := read_file(...)
    if err != nil {
        return User{}, err
    }
    user, err := parse_user(text)
    if err != nil {
        return User{}, err
    }
    return user, nil
}
```

```aether
// Aether — ? operator
fn load_user(id: int) -> Result<User, string> {
  let text = read_file(...)?;
  let user = parse_user(text)?;
  Result::Ok(user)
}
```

Aether's `?` is the equivalent of Go's `if err != nil { return
}` boilerplate. It unwraps the `Ok` value or early-returns the
`Err`.

### 6.3 panic

```go
// Go
func factorial(n int) int {
    if n < 0 {
        panic("negative")
    }
    if n <= 1 {
        return 1
    }
    return n * factorial(n - 1)
}
```

```aether
// Aether
fn factorial(n: int) -> int {
  if n < 0 { panic("negative"); }
  if n <= 1 { 1 } else { n * factorial(n - 1) }
}
```

Same shape. Aether's `panic(msg)` is like Go's `panic(msg)`.

### 6.4 defer

```go
// Go
func copy_file(src, dst string) error {
    f, err := os.Open(src)
    if err != nil {
        return err
    }
    defer f.Close()
    // ... use f
}
```

```aether
// Aether — no defer in v1
fn copy_file(src: string, dst: string) -> Result<int, string> {
  // ... open, use, close — no defer
  Result::Ok(0)
}
```

Aether v1 has no `defer`. You have to close explicitly. v2
may add `defer`; see
[../spec/07-functions-closures-async.md](../spec/07-functions-closures-async.md).

## 7. Concurrency

### 7.1 Goroutines and channels

```go
// Go
ch := make(chan int)
go func() {
    ch <- 42
}()
v := <-ch
fmt.Println(v)
```

```aether
// Aether — NOT POSSIBLE in v1
// v2 sketch:
// let ch = channel<int>();
// spawn { send(ch, 42); };
// let v = await recv(ch);
// print(v);
```

Aether v1 is **single-threaded and synchronous**. There is no
`go`, no `make(chan ...)`, no `<-`. The v2 plan adds `spawn`,
channels, and `select`; see
[../rfcs/rfc-001-async-await.md](../rfcs/rfc-001-async-await.md)
and
[../tutorials/concurrency.md](../tutorials/concurrency.md).

### 7.2 select

```go
// Go
select {
case v := <-ch1:
    fmt.Println("ch1:", v)
case v := <-ch2:
    fmt.Println("ch2:", v)
case <-time.After(1 * time.Second):
    fmt.Println("timeout")
}
```

```aether
// Aether — NOT POSSIBLE in v1
// v2 sketch:
// let result = select {
//   v = recv(ch1) => print(f"ch1: {v}"),
//   v = recv(ch2) => print(f"ch2: {v}"),
//   timeout(1000) => { print("timeout"); break; },
// };
```

Aether v2's `select` will be similar in spirit to Go's
`select`.

## 8. What is missing in Aether v1

| Go feature | Aether v1 | Workaround |
|------------|-----------|------------|
| Structs with methods | not present | `struct` + free functions |
| Interfaces | not present | `enum` + `match`; v2 planned |
| Goroutines | not present | sync only; v2 planned |
| Channels | not present | sync only; v2 planned |
| `select` | not present | sync only; v2 planned |
| `defer` | not present | explicit close; v2 planned |
| `nil` | not present | `Option<T>` |
| `error` interface | not present | `Result<T, E>` |
| Multiple return values | use tuples | same shape |
| Named return values | not present | return tuple explicitly |
| Packages | not present | single file; v2 planned |
| `go mod` | not present | single file; v2 planned |
| `go test` | not present | convention; v2 planned |
| `go fmt` | not present | manual; v2 planned |
| `go vet` | not present | manual; v2 planned |
| Reflection | not present | `match` |
| `init()` | not present | top-level code |
| `iota` | not present | `const` declarations |

## 9. A worked example: porting a small Go program

### 9.1 Go

```go
// stats.go
package main

import (
    "fmt"
    "sort"
    "strings"
)

func wordCount(text string) map[string]int {
    counts := map[string]int{}
    for _, word := range strings.Fields(text) {
        counts[word]++
    }
    return counts
}

func main() {
    counts := wordCount("the cat the dog the bird")
    keys := make([]string, 0, len(counts))
    for k := range counts {
        keys = append(keys, k)
    }
    sort.Strings(keys)
    for _, k := range keys {
        fmt.Printf("%s: %d\n", k, counts[k])
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
let keys = sort(map_keys(counts));
for w in keys {
  print(f"{w}: {map_get(counts, w)}");
}
// → bird: 1
// → cat: 1
// → dog: 1
// → the: 3
```

Differences:

- No `package main`; single file.
- No `import "..."`; stdlib is global.
- No `strings.Fields`; use stdlib `split`.
- No `counts[word]++`; use `map_get`/`map_set`.
- No `for k := range counts`; use `map_keys`.
- No `sort.Strings(keys)`; stdlib `sort` is generic.

## 10. Where to go next

- **[../tutorials/getting-started.md](../tutorials/getting-started.md)**
  — the first tutorial.
- **[../tutorials/language-basics.md](../tutorials/language-basics.md)**
  — the full surface tour.
- **[../tutorials/concurrency.md](../tutorials/concurrency.md)**
  — the v1 sync reality and the v2 async plan.
- **[../tutorials/error-handling.md](../tutorials/error-handling.md)**
  — `Result` and `?` in depth.
- **[../guides/idiomatic-aether.md](idiomatic-aether.md)** —
  what good Aether looks like.

Welcome from Go. The mental shift is: `Result<T, E>` instead
of `(T, error)`, `?` instead of `if err != nil`, no goroutines
or channels in v1, no methods on structs. The `enum`/`match`
pair is more powerful than Go's `iota`/`switch`. The v2 plan
adds back the concurrency primitives; until then, write
sequential code.
