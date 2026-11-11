# Migration from TypeScript

> Audience: a TypeScript programmer wanting to learn Aether.
> Prerequisites: comfort with TypeScript. 25 minutes.

This guide is a translation table: TypeScript → Aether. For
each TypeScript construct, it gives the Aether equivalent with
a side-by-side example. The end of the guide lists what is
*missing* in Aether v1 and what to do about it.

For the language tour, see
[../tutorials/getting-started.md](../tutorials/getting-started.md).
For the type system, see
[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md).

## 1. The big picture

Aether and TypeScript share a genealogy: both are statically
typed, both have type inference, both have generics, both have
algebraic data types (in TS's case, discriminated unions). The
main differences:

| Aspect | TypeScript | Aether |
|--------|------------|--------|
| Type system | structural | nominal (for structs/enums), structural (for functions/tuples) |
| Mutation | mutable by default | immutable by default |
| Null/undefined | `null`, `undefined` | `Option<T>` (no null) |
| Exceptions | `throw`/`try`/`catch` | `Result<T, E>` (no exceptions) |
| Async | `async`/`await` (in v1) | sync only (async planned for v2) |
| Classes | `class` with methods | no classes; `struct` + free functions |
| Inference | bidirectional | bidirectional |
| Strictness | opt-in `strict` | strict by default |

If you have used TypeScript with `strict: true` and discriminated
unions, Aether will feel familiar. The main shifts are: nominal
types instead of structural, immutability by default, no
exceptions, no async.

## 2. Variables

### 2.1 `let` and `const`

```ts
// TypeScript
let x: number = 42;
let mut = 0; mut = 1;
const PI = 3.14159;
```

```aether
// Aether
let x: int = 42;       // immutable
let mut y: int = 0;     // mutable
y = 1;
const PI: float = 3.14159;
```

| TS | Aether | Notes |
|----|--------|-------|
| `let x: T` | `let x: T` | TS `let` is mutable; Aether `let` is immutable |
| `let x = 1; x = 2;` | `let mut x = 1; x = 2;` | Aether needs `mut` |
| `const x = 1;` | `const x: int = 1;` or `let x = 1;` | both work; `const` signals intent |

### 2.2 Number types

```ts
// TypeScript — one number type
let n: number = 42;
let f: number = 3.14;
```

```aether
// Aether — two numeric types
let n: int = 42;
let f: float = 3.14;
```

TypeScript has one `number` (IEEE double). Aether has two:
`int` (64-bit integer, wraps on overflow) and `float` (IEEE
double). `int` widens to `float` automatically; the reverse
needs `as int`.

### 2.3 String

```ts
let s: string = "hello";
let interp = `hello, ${name}!`;
```

```aether
let s: string = "hello";
let interp = f"hello, {name}!";
```

Aether uses `f"..."` (like Python) instead of `` `...` `` (like
JS). The interpolation syntax is `{expr}` in both.

### 2.4 Boolean

```ts
let b: boolean = true;
let c = !b;
let d = b && c;
```

```aether
let b: bool = true;
let c = !b;
let d = b && c;
```

The type is `bool` (not `boolean`). The operators are the same.

## 3. Functions

### 3.1 Declaration

```ts
// TypeScript
function add(a: number, b: number): number {
  return a + b;
}

// arrow function
const add = (a: number, b: number): number => a + b;
```

```aether
// Aether
fn add(a: int, b: int) -> int {
  a + b
}

// closure
let add = fn(a: int, b: int) -> int { a + b };
```

Differences:

- Aether uses `fn` instead of `function`.
- Return type is `-> int` instead of `: int`.
- Aether functions return the last expression (no `return`
  needed for the common case).
- Aether closures use `fn(args) -> ret { body }` instead of
  `(args) => body`.

### 3.2 Generics

```ts
// TypeScript
function id<T>(x: T): T { return x; }
```

```aether
// Aether
fn id<T>(x: T) -> T { x }
```

Same syntax. Aether also accepts a turbofish form at the call
site: `id::<int>(42)`, but most of the time you do not need it.

### 3.3 Optional parameters

```ts
// TypeScript
function greet(name: string, greeting: string = "hi"): string {
  return `${greeting}, ${name}`;
}
greet("ada");
greet("ada", "howdy");
```

```aether
// Aether v1 — no default arguments; use overloads or Option<T>
fn greet(name: string, greeting: string) -> string {
  f"{greeting}, {name}"
}
fn greet_default(name: string) -> string { greet(name, "hi") }

print(greet_default("ada"));
print(greet("ada", "howdy"));
```

Aether v1 does not support default arguments. The workaround
is to write a wrapper, or to use `Option<T>` for the optional
parameter. Default arguments are planned for v2; see
[../spec/05-statements-and-declarations.md](../spec/05-statements-and-declarations.md).

## 4. Types

### 4.1 Object types → struct

```ts
// TypeScript
interface User {
  id: number;
  name: string;
}
const alice: User = { id: 1, name: "Alice" };
```

```aether
// Aether
struct User { id: int, name: string }
let alice = User { id: 1, name: "Alice" };
```

Differences:

- Aether has `struct` (nominal) instead of `interface`
  (structural).
- Construction is `Name { field: value, ... }`.
- Aether structs cannot have methods (use free functions); v2
  may add `impl` blocks.

### 4.2 Discriminated unions → enum

```ts
// TypeScript
type HttpStatus =
  | { kind: "ok" }
  | { kind: "notFound" }
  | { kind: "serverError"; code: number };

function describe(s: HttpStatus): string {
  switch (s.kind) {
    case "ok": return "ok";
    case "notFound": return "not found";
    case "serverError": return `server error ${s.code}`;
  }
}
```

```aether
// Aether
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

Aether's `enum` is the same idea as a TypeScript
discriminated union, but with first-class language support.
The `match` is exhaustive (in v2; in v1 it is a discipline).

### 4.3 Generics

```ts
type Pair<A, B> = { first: A; second: B };
```

```aether
struct Pair<A, B> { first: A, second: B }
```

Same syntax for generics on types.

### 4.4 Type aliases

```ts
type UserId = number;
type Point2D = [number, number];
```

```aether
type UserId = int;
type Point2D = (int, int);
```

Type aliases work the same way. Note: tuples are `(int, int)`
in Aether, not `[number, number]` (which is an array).

### 4.5 Tuple

```ts
let p: [number, string] = [1, "two"];
p[0] // 1
```

```aether
let p: (int, string) = (1, "two");
p.0  // 1
```

Aether tuples use parens, not brackets. Field access is `.0`,
`.1`, etc., not `[0]`, `[1]`.

### 4.6 Array

```ts
let xs: number[] = [1, 2, 3];
let ys: Array<number> = [1, 2, 3];
```

```aether
let xs: [int] = [1, 2, 3];
```

Aether arrays are `[T]`. There is no `Array<T>` form.

### 4.7 Map

```ts
let m: Map<string, number> = new Map();
m.set("a", 1);
m.get("a"); // 1
```

```aether
let m: map[string]int = { "a": 1, "b": 2 };
print(m["a"]);   // 1
```

Aether map literals use `{ k: v, ... }`. Get/set is via `[]`.
Note: in v1, `m[k]` panics if `k` is not present; use
`map_get`/`map_has` from the stdlib to handle absence.

### 4.8 Optional

```ts
let x: number | null = null;
```

```aether
let x: Option<int> = Option::None;
```

Aether has no `null`. Use `Option<T>` for "may be absent".
Pattern match to extract the value.

## 5. Control flow

### 5.1 if/else

```ts
let parity = n % 2 === 0 ? "even" : "odd";
```

```aether
let parity = if n % 2 == 0 { "even" } else { "odd" };
```

Aether uses `if`/`else` as an expression (no ternary
operator). The branches are blocks; the value is the last
expression.

### 5.2 while

```ts
let i = 0;
while (i < 10) {
  i++;
}
```

```aether
let mut i = 0;
while i < 10 {
  i = i + 1;
}
```

Same shape. Aether needs `mut` on the counter; the
`++` operator does not exist (use `i = i + 1` or `i += 1`).

### 5.3 for

```ts
for (let i = 0; i < 10; i++) {
  console.log(i);
}

for (const x of [1, 2, 3]) {
  console.log(x);
}
```

```aether
for i in range(0, 10) {
  print(i);
}

for x in [1, 2, 3] {
  print(x);
}
```

Aether has `for x in iterable`, no C-style `for`. Use `range`
for index loops.

### 5.4 switch

```ts
switch (n) {
  case 0: return "zero";
  case 1:
  case 2: return "small";
  default: return "many";
}
```

```aether
match n {
  0       => "zero",
  1 | 2   => "small",
  _       => "many",
}
```

Aether uses `match` instead of `switch`. There is no
fallthrough; arms are separated by `,`. The `_` is the
wildcard (like `default`).

## 6. Functions and closures

### 6.1 Higher-order functions

```ts
const doubled = [1, 2, 3].map(x => x * 2);
const evens = [1, 2, 3, 4].filter(x => x % 2 === 0);
const sum = [1, 2, 3, 4].reduce((a, b) => a + b, 0);
```

```aether
let doubled = map([1, 2, 3], fn(x: int) -> int { x * 2 });
let evens = filter([1, 2, 3, 4], fn(x: int) -> bool { x % 2 == 0 });
let sum = reduce([1, 2, 3, 4], fn(a: int, b: int) -> int { a + b }, 0);
```

Aether's `map`, `filter`, `reduce` are free functions, not
array methods. Closures use `fn(args) -> ret { body }` instead
of `(args) => body`.

### 6.2 Capturing `this`

```ts
class Counter {
  private count = 0;
  inc() { this.count++; }
  get() { return this.count; }
}
```

```aether
// Aether: use a closure with a captured mut.
fn make_counter() -> (fn() -> int, fn() -> int) {
  let mut count = 0;
  let inc = fn() -> int { count = count + 1; count };
  let get = fn() -> int { count };
  (inc, get)
}

let (inc, get) = make_counter();
inc(); inc();
print(get());   // 2
```

Aether has no classes. Use a factory function that returns a
tuple of closures. The captured `mut` is the private state.

## 7. Errors

### 7.1 try/catch → Result

```ts
function parse(s: string): number {
  const n = parseInt(s, 10);
  if (isNaN(n)) throw new Error("not a number");
  return n;
}

try {
  const n = parse("hello");
} catch (e) {
  console.error(e);
}
```

```aether
fn parse(s: string) -> Result<int, string> {
  // ... imagine parsing
  if s == "42" { Result::Ok(42) }
  else { Result::Err("not a number") }
}

match parse("hello") {
  Result::Ok(n)  => print(n),
  Result::Err(e) => print(f"error: {e}"),
}
```

Aether has no `throw`/`try`/`catch`. Use `Result<T, E>` for
"may fail". Pattern match at the call site to handle.

### 7.2 Optional chaining → Option

```ts
const name = user?.profile?.name ?? "anonymous";
```

```aether
// Aether: pattern match
fn get_name(u: User) -> string {
  match u.profile {
    Option::Some(p) => p.name,
    Option::None    => "anonymous",
  }
}
```

Aether has no `?.` or `??` operators. Use `Option<T>` and
`match`. The `?` operator (early-return on `None`) works
inside functions that return `Option<T>`.

## 8. Async

### 8.1 The honest status

Aether v1 is **single-threaded and synchronous**. There is no
`async`/`await`, no `Promise`, no `setTimeout`, no
`fetch`. See
[../tutorials/concurrency.md](../tutorials/concurrency.md)
for the v1 reality and the v2 plan.

### 8.2 What to do today

Write your code as if it were synchronous. When v2 ships, the
upgrade to `async`/`await` will be mechanical (add `async` to
the function, `await` before the call).

```ts
// TypeScript today
async function fetchUser(id: number): Promise<User> {
  const resp = await fetch(`/users/${id}`);
  return resp.json();
}
```

```aether
// Aether v1 today (no async)
fn fetch_user(id: int) -> User {
  // pretend this is fast — v1 has no fetch
  User { id: id, name: "user" }
}

// v2 sketch (not yet)
// async fn fetch_user(id: int) -> User {
//   let resp = await http_get(f"/users/{id}");
//   parse_user(resp)
// }
```

## 9. What is missing in Aether v1

| TS feature | Aether v1 | Workaround |
|------------|-----------|------------|
| `null` / `undefined` | not present | `Option<T>` |
| `throw` / `try` / `catch` | not present | `Result<T, E>` |
| `async` / `await` / `Promise` | not present | sync only; v2 planned |
| classes | not present | `struct` + free functions |
| inheritance | not present | composition with closures |
| `interface` (structural) | `struct` (nominal) | use `struct` |
| default arguments | not present | wrapper functions; v2 planned |
| rest/spread in functions | not present | use arrays; v2 planned |
| `?.` / `??` | not present | `match` on `Option` |
| template literal types | not present | n/a |
| conditional types | not present | n/a |
| mapped types | not present | n/a |
| type guards | not present | `match` |
| `enum` (TS-style) | `enum` (ADT) | use Aether `enum` |
| `any` | not present | n/a |
| `unknown` | not present | `Option<T>` or `Result<T, E>` |
| decorators | not present | n/a |
| `Symbol`/`BigInt` | not present | n/a |

The big shift: Aether v1 is intentionally smaller than
TypeScript. Anything you cannot do without, you have to
work around. The v2 plan adds most of the missing pieces;
see [../rfcs/](../rfcs/).

## 10. A worked example: porting a small TS program

Here is a small TypeScript program and its Aether port.

### 10.1 TypeScript

```ts
// stats.ts
interface Stats {
  mean: number;
  max: number;
  n: number;
}

function computeStats(xs: number[]): Stats {
  if (xs.length === 0) throw new Error("empty");
  let total = 0;
  let max = xs[0];
  for (const x of xs) {
    total += x;
    if (x > max) max = x;
  }
  return { mean: total / xs.length, max, n: xs.length };
}

try {
  const s = computeStats([3, 1, 4, 1, 5, 9, 2, 6]);
  console.log(`mean=${s.mean}, max=${s.max}, n=${s.n}`);
} catch (e) {
  console.error(e);
}
```

### 10.2 Aether

```aether
// stats.ae
struct Stats { mean: float, max: int, n: int }

fn compute_stats(xs: [int]) -> Stats {
  if len(xs) == 0 { panic("empty"); }
  let total = reduce(xs, fn(a: int, b: int) -> int { a + b }, 0);
  let max_val = reduce(xs, fn(a: int, b: int) -> int { if a > b { a } else { b } }, xs[0]);
  Stats {
    mean: (total as float) / (len(xs) as float),
    max: max_val,
    n: len(xs),
  }
}

let s = compute_stats([3, 1, 4, 1, 5, 9, 2, 6]);
print(f"mean={s.mean}, max={s.max}, n={s.n}");
// → mean=3.875, max=9, n=8
```

The Aether version:

- Uses `struct Stats` instead of `interface Stats`.
- Uses `panic` for the invariant (empty input).
- Uses `reduce` instead of a manual `for ... of` loop.
- Uses string interpolation instead of template literals.
- Has no `try`/`catch` (the panic propagates).

## 11. Where to go next

- **[../tutorials/getting-started.md](../tutorials/getting-started.md)**
  — the first tutorial.
- **[../tutorials/language-basics.md](../tutorials/language-basics.md)**
  — the full surface tour.
- **[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)**
  — the type system.
- **[../tutorials/error-handling.md](../tutorials/error-handling.md)**
  — `Result` and `Option` in depth.
- **[../guides/idiomatic-aether.md](idiomatic-aether.md)** —
  what good Aether looks like.
- **[../guides/anti-patterns.md](anti-patterns.md)** — what to
  avoid.

Welcome from TypeScript. The mental shift is: nominal types,
immutability by default, no exceptions, no async. Once those
four things click, the rest is syntax.
