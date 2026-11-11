# Types and Generics

> Audience: someone who finished [language-basics.md](language-basics.md)
> and wants the type system.
> Prerequisites: the playground open, 60 minutes.

Aether's type system is its strongest inheritance from ML, Rust,
and TypeScript. It has:

- **Primitives** — `int`, `float`, `bool`, `string`, `char`,
  `unit`.
- **Tuples** — fixed-size, heterogeneous, structural.
- **Arrays** — growable, homogeneous, `T`.
- **Maps** — `map[K]V`, hash-based, key must be hashable.
- **Enums** — algebraic data types with unit, tuple, and struct
  variants.
- **Structs** — nominal record types with named fields.
- **Generics** — parametric polymorphism with optional bounds.
- **Type aliases** — transparent synonyms.
- **Type inference** — bidirectional, Hindley-Milner-ish.
- **Numeric widening** — `int` to `float` is automatic.
- **Pattern matching** — exhaustive over enum, struct, tuple,
  array, and literal patterns.

This tutorial walks each of these in turn with runnable examples.
The reference is
[../spec/03-type-system.md](../spec/03-type-system.md).

## 1. Primitive types

Aether v1 has six primitive types:

| Type | Values | Default literal |
|------|--------|-----------------|
| `int` | 64-bit signed integer | `42`, `0xFF`, `0b1010`, `0o17` |
| `float` | IEEE 754 double | `3.14`, `1e10` |
| `bool` | `true` / `false` | `true`, `false` |
| `string` | UTF-8 string | `"hi"`, `f"x={x}"` |
| `char` | Unicode scalar value | `'a'`, `'\n'`, `'\u{1F600}'` |
| `unit` | `()` | `()` |

(Literal suffixes like `42u8` are not yet supported in v1; the
single `int` and `float` are the only numeric types. The spec
[../spec/03-type-system.md](../spec/03-type-system.md) §1.1 lists
the v2 plan for `i8`/`i16`/`i32`/`u8`/etc.)

### 1.1 `int`

`int` is a 64-bit signed integer. Literals support decimal, hex
(`0x`), binary (`0b`), and octal (`0o`) prefixes, and underscores
between digits:

```aether
let dec   = 1_000_000;
let hex   = 0xFF;
let bin   = 0b1010;
let oct   = 0o17;

print(dec);   // → 1000000
print(hex);   // → 255
print(bin);   // → 10
print(oct);   // → 15
```

`int` wraps on overflow in v1 (because the underlying JS number
representation does). For checked arithmetic, the v2 plan includes
`checked_add`, `checked_mul`, etc.

### 1.2 `float`

`float` is IEEE 754 double precision. Literals require either a
decimal point or an exponent:

```aether
let pi = 3.14159;
let big = 6.022e23;
let small = 1e-10;
```

`int` widens to `float` in mixed arithmetic:

```aether
let mixed = 1 + 0.5;
print(type_of(mixed));
// → float
```

The reverse is not automatic; use `as int` (which truncates toward
zero) or the stdlib `floor`, `ceil`, `round` functions for other
rounding modes.

### 1.3 `bool`

Two values, `true` and `false`. Produced by comparison operators
and combined by `&&`, `||`, `!`. The type checker rejects non-bool
operands for `&&` and `||`:

```aether
print(1 && 2);
// → left of '&&' must be bool, found int
```

### 1.4 `string`

UTF-8, growable. String literals come in two forms:

```aether
let plain = "hello";
let interp = f"hello, {name}!";
```

See [language-basics.md](language-basics.md) §7 for the full string
discussion.

### 1.5 `char`

Single Unicode scalar value. Char literals use single quotes:

```aether
let a = 'a';
let nl = '\n';
let heart = '\u{2764}';
```

### 1.6 `unit`

The unit type has exactly one value, `()`. It is the type of
expressions that have no meaningful return value:

```aether
let r = print("hi");
print(type_of(r));
// → unit
```

## 2. Tuples

A tuple is a fixed-size, heterogeneous, structural collection.

```aether
let p = (1, 2.0, "three");
print(p.0);   // → 1
print(p.1);   // → 2
print(p.2);   // → three
```

Field access is by position: `t.0`, `t.1`, ..., `t.N`. Out-of-bounds
access is a type error (caught at compile time):

```aether
let p = (1, 2);
print(p.5);
// → tuple field .5 out of bounds (length 2)
```

Tuples are structural: two tuples with the same element types are
the same type. `(int, string)` and `(int, string)` are
interchangeable. Tuples are immutable; you cannot assign to a
field. To "update", build a new tuple:

```aether
let p = (1, 2);
let q = (p.0 + 1, p.1);
print(q);   // → (2, 2)
```

The unit value `()` is not the empty tuple — it is its own type. A
1-tuple is written with a trailing comma: `(1,)`. `(1)` is just
`1`.

### 2.1 Tuple patterns

Tuples destructure in `let` and `match`:

```aether
let (a, b, c) = (1, 2, 3);
print(a); print(b); print(c);
// → 1
// → 2
// → 3
```

```aether
fn fst(t: (int, int)) -> int {
  match t { (a, _) => a }
}
print(fst((99, 100)));
// → 99
```

Tuple patterns must match the arity:

```aether
let (a, b) = (1, 2, 3);
// → tuple pattern arity 2 does not match 3
```

## 3. Arrays

An array is a growable, homogeneous list. The type is `[T]` where
`T` is the element type.

```aether
let nums = [1, 2, 3];
print(nums[0]);   // → 1
print(len(nums)); // → 3
```

All elements must have the same type:

```aether
let bad = [1, "two", true];
// → elements of array literal must have a common type
```

Indexing is `[]`, with bounds checking at runtime:

```aether
let xs = [1, 2, 3];
print(xs[5]);
// → array index out of bounds: 5
```

The index type must be `int`:

```aether
let xs = [1, 2, 3];
print(xs[1.5]);
// → array index must be int, found float
```

See [language-basics.md](language-basics.md) §8 for the array
operations tour (`map`, `filter`, `reduce`, `push`, `pop`).

### 3.1 Array patterns

Arrays destructure in `match`:

```aether
fn head(xs: [int]) -> int {
  match xs {
    [x, ..] => x,
  }
}

print(head([10, 20, 30]));
// → 10
```

The `..` is a "rest" pattern that matches zero or more remaining
elements.

## 4. Maps

A map is a hash-based key/value store. The type is `map[K]V`, where
`K` must be a hashable type (currently `int`, `string`, `bool`,
`char`, and tuples thereof).

```aether
let m: map[string]int = { "a": 1, "b": 2 };
print(m["a"]);   // → 1
print(m["b"]);   // → 2
```

Construction uses `{ k: v, ... }` syntax:

```aether
let prices = { "apple": 0.99, "banana": 0.59, "cherry": 2.49 };
print(prices["banana"]);
// → 0.59
```

Indexing by key panics if the key is missing:

```aether
let m = { "x": 1 };
print(m["missing"]);
// → map key not found: "missing"
```

Use the stdlib `map_get` with a default, or `map_has` to test
membership:

```aether
let m = { "x": 1 };
if map_has(m, "y") {
  print("y is present");
} else {
  print("y is absent");
}
// → y is absent
```

The stdlib `collections` module provides the full map API:
`map_new`, `map_set`, `map_get`, `map_has`, `map_delete`,
`map_keys`, `map_values`, `map_entries`, `map_size`. See
[stdlib-tour.md](stdlib-tour.md).

### 4.1 Map types must match

The key and value types are part of the map's type. Mixing types
is a type error:

```aether
let m: map[string]int = { "x": 1, "y": "two" };
// → field 'y': expected int, found string
```

## 5. Enums (algebraic data types)

An enum is a sum type with one or more variants. Each variant is
either:

- a **unit variant** — just a name,
- a **tuple variant** — carries positional data,
- a **struct variant** — carries named fields.

```aether
enum Shape {
  Circle(int),                    // tuple variant
  Rect(int, int),                 // tuple variant with 2 fields
  Point { x: int, y: int },       // struct variant
  Unit,                           // unit variant
}
```

### 5.1 Construction

```aether
let c = Shape::Circle(5);
let r = Shape::Rect(3, 4);
let p = Shape::Point { x: 1, y: 2 };
let u = Shape::Unit;
```

The `::` syntax is `EnumName::VariantName`. The variant carries
its data inside parens (tuple) or braces (struct).

### 5.2 Pattern matching

`match` over an enum destructures it:

```aether
fn area(s: Shape) -> int {
  match s {
    Shape::Circle(r)       => 3 * r * r,
    Shape::Rect(w, h)      => w * h,
    Shape::Point { x, y }  => 0,
    Shape::Unit            => 0,
  }
}

print(area(Shape::Circle(2)));    // → 12
print(area(Shape::Rect(3, 4)));   // → 12
print(area(Shape::Point { x: 1, y: 2 }));   // → 0
print(area(Shape::Unit));   // → 0
```

Each arm is `Pattern => Expr,`. The pattern destructures the
variant and binds the inner values to names. The `=>` is the
"arrow" of the arm. Trailing comma is optional.

### 5.3 Built-in `Option` and `Result`

The standard prelude (see
[../spec/12-stdlib.md](../spec/12-stdlib.md)) declares two enums:

```aether
enum Option<T> { Some(T), None, }
enum Result<T, E> { Ok(T), Err(E), }
```

These are ordinary enums; they have no special language treatment
except that the `?` operator is hard-wired to their shapes (see
[error-handling.md](error-handling.md)).

`Option<T>` represents "a value that may be absent":

```aether
fn lookup(xs: [int], i: int) -> Option<int> {
  if i < 0 { Option::None }
  else if i >= len(xs) { Option::None }
  else { Option::Some(xs[i]) }
}

match lookup([1, 2, 3], 1) {
  Option::Some(v) => print(f"found {v}"),
  Option::None    => print("not found"),
}
// → found 2
```

`Result<T, E>` represents "a computation that may fail":

```aether
fn parse_int(s: string) -> Result<int, string> {
  // ... imagine parsing logic
  Result::Ok(42)
}

match parse_int("42") {
  Result::Ok(n)  => print(f"got {n}"),
  Result::Err(e) => print(f"error: {e}"),
}
// → got 42
```

See [error-handling.md](error-handling.md) for the full
`Result`/`Option` story.

### 5.4 Generic enums

Enums can be generic:

```aether
enum Tree<T> {
  Leaf(T),
  Node(T, [Tree<T>]),
}

fn sum_int_tree(t: Tree<int>) -> int {
  match t {
    Tree::Leaf(v)      => v,
    Tree::Node(v, kids) => v + reduce(map(kids, sum_int_tree), fn(a: int, b: int) -> int { a + b }, 0),
  }
}

let t = Tree::Node(1, [Tree::Leaf(2), Tree::Node(3, [Tree::Leaf(4)])]);
print(sum_int_tree(t));
// → 10
```

### 5.5 Or-patterns

A pattern can match multiple shapes with `|`:

```aether
fn classify(n: int) -> string {
  match n {
    0 | 1 | 2 => "small",
    3 | 4 | 5 => "medium",
    _         => "large",
  }
}
```

### 5.6 Wildcards

The `_` pattern matches anything and binds nothing:

```aether
fn describe(o: Option<int>) -> string {
  match o {
    Option::Some(_) => "got something",
    Option::None    => "got nothing",
  }
}
```

### 5.7 Exhaustiveness

Aether v1 does not yet enforce strict exhaustiveness (you can
forget an arm and the compiler will not warn). v2 will. The
idiomatic practice is to always include a `_` arm or cover all
variants explicitly. See
[../guides/idiomatic-aether.md](../guides/idiomatic-aether.md) for
the convention.

## 6. Structs

A struct is a nominal record type with named fields.

```aether
struct Point { x: int, y: int }

let p = Point { x: 1, y: 2 };
print(p.x);    // → 1
print(p.y);    // → 2
```

### 6.1 Construction

Struct literals use `Name { field: value, ... }`:

```aether
let origin = Point { x: 0, y: 0 };
let unit_x = Point { x: 1, y: 0 };
```

The field names must match the declaration. Unknown fields are a
type error:

```aether
let bad = Point { x: 1, y: 2, z: 3 };
// → struct Point has no field 'z'
```

Missing fields are also a type error:

```aether
let bad = Point { x: 1 };
// → missing field 'y' in struct Point
```

### 6.2 Field types

Field types must be declared. They can be any type: primitives,
tuples, arrays, maps, enums, structs, generics:

```aether
struct Person {
  name: string,
  age: int,
  hobbies: [string],
}

let alice = Person { name: "Alice", age: 30, hobbies: ["reading", "hiking"] };
print(alice.name);
print(alice.hobbies[0]);
```

### 6.3 Struct patterns

Structs destructure in `match` and `let`:

```aether
struct Point { x: int, y: int }

fn sum(p: Point) -> int {
  match p { Point { x: a, y: b } => a + b }
}

print(sum(Point { x: 3, y: 4 }));
// → 7
```

You can also use shorthand `Point { x, y }` to bind fields with the
same name (planned for v2; in v1 you must write `x: x`):

```aether
let p = Point { x: 1, y: 2 };
match p {
  Point { x: x, y: y } => print(f"{x}, {y}"),
}
// → 1, 2
```

### 6.4 Struct spread

Use `..base` to copy fields from another struct:

```aether
struct Point { x: int, y: int }

let a = Point { x: 1, y: 2 };
let b = Point { x: 5, ..a };
print(b.x);   // → 5
print(b.y);   // → 2
```

The spread must come last in the literal. The spread struct must
have the same type as the literal.

### 6.5 Generic structs

```aether
struct Pair<A, B> { first: A, second: B }

let p = Pair { first: 42, second: "answer" };
print(p.first);    // → 42
print(p.second);   // → answer
```

## 7. Generics

Generics are parametric polymorphism: a function or type that
works for any concrete type `T`.

### 7.1 Generic functions

```aether
fn id<T>(x: T) -> T { x }

print(id<int>(42));         // → 42
print(id<string>("hi"));    // → hi
print(id(7));               // → 7   (type inferred)
```

Most of the time, the compiler infers the type arguments from the
value arguments. The explicit `<int>` form is rarely needed.

### 7.2 Generic enums

```aether
enum Option<T> { Some(T), None, }

fn unwrap<T>(o: Option<T>, default: T) -> T {
  match o {
    Option::Some(v) => v,
    Option::None    => default,
  }
}

print(unwrap(Option::Some(42), 0));    // → 42
print(unwrap(Option::None, 99));        // → 99
print(unwrap(Option::Some("hi"), "?")); // → hi
```

### 7.3 Generic structs

```aether
struct Stack<T> {
  items: [T],
}

fn new_stack<T>() -> Stack<T> {
  Stack { items: [] }
}

fn push<T>(s: Stack<T>, v: T) -> Stack<T> {
  Stack { items: push(s.items, v) }
}

let s = push(push(new_stack(), 1), 2);
print(s.items);
// → [1, 2]
```

### 7.4 Bounds

A type parameter can have a bound, written `T: SomeTrait`. In v1,
bounds are recorded but not enforced (see
[../spec/03-type-system.md](../spec/03-type-system.md) §4.2 for the
v2 plan). The bound syntax is `T: TraitName`:

```aether
fn max<T: Ord>(a: T, b: T) -> T {
  if a > b { a } else { b }
}
```

The bound is a hint to the reader and to the future borrow checker;
in v1, the body of `max` is type-checked as if `T` had no bounds,
so `a > b` works only because `>` happens to be defined for the
concrete type at the call site.

### 7.5 Multiple type parameters

```aether
enum Result<T, E> { Ok(T), Err(E), }

fn ok<T, E>(v: T) -> Result<T, E> { Result::Ok(v) }
fn err<T, E>(e: E) -> Result<T, E> { Result::Err(e) }

let r1: Result<int, string> = ok(42);
let r2: Result<int, string> = err("bad");
print(r1);
print(r2);
```

## 8. Type inference

Aether does bidirectional type inference, in the spirit of
Hindley-Milner with Swift-style contextual typing for literals and
closures. In practice, this means:

- **Annotations are optional** in most places. The compiler fills
  in the type from the initializer when it can.
- **Literals are contextually typed.** In `let x: int = 5;`, the
  literal `5` is checked against `int`. In `let x: float = 5;`, it
  is checked against `float` and widened.
- **Closures' parameter types** must be annotated. The compiler
  does not infer closure parameter types from the body. This is a
  v1 limitation; see
  [../decisions/adr-01-tree-walking-interpreter-for-v1.md](../decisions/adr-01-tree-walking-interpreter-for-v1.md)
  for the rationale.

### 8.1 What the compiler can infer

```aether
let x = 42;            // int
let y = 3.14;          // float
let s = "hi";          // string
let b = true;          // bool
let u = ();            // unit
let xs = [1, 2, 3];    // [int]
let p = (1, "two");    // (int, string)
let f = fn(a: int, b: int) -> int { a + b };  // fn(int, int) -> int
```

### 8.2 What the compiler cannot infer

The compiler cannot infer:

- Closure parameter types. You must write `fn(x: int) -> int { ... }`
  even when the closure is passed to `map` and the array type is
  known. (The plan for v2 is to allow `fn(x) { ... }` and infer
  from context; see [../rfcs/rfc-005-lsp.md](../rfcs/rfc-005-lsp.md)
  for how the inference engine is being refactored to support
  this.)
- Generic type arguments at call sites in some edge cases. Use the
  turbofish `::<T>` form when in doubt: `id::<int>(42)`.
- The return type of a recursive function. You must annotate it:
  `fn fib(n: int) -> int { ... }`.

### 8.3 Numeric widening

`int` widens to `float` automatically:

```aether
let x: float = 42;     // int widens to float
let y = 1 + 0.5;       // int widens to float; result is float
print(type_of(y));
// → float
```

The reverse (narrowing `float` to `int`) is not automatic; use
`as int`:

```aether
let f = 3.7;
let n = f as int;
print(n);    // → 3
```

`as int` truncates toward zero. For other rounding modes, use the
stdlib `floor`, `ceil`, `round`.

## 9. Type aliases

A type alias is a transparent synonym. The aliased type and the
alias are interchangeable for subtyping, trait conformance, and
pattern matching.

```aether
type UserId = int;
type Point2D = (int, int);
type IntList = [int];

let u: UserId = 42;
let p: Point2D = (1, 2);
let xs: IntList = [1, 2, 3];
```

Type aliases can be generic:

```aether
type Pair<T> = (T, T);

let p: Pair<int> = (1, 2);
```

Use type aliases to:

- Give a domain meaning to a primitive (`UserId`, `Timestamp`,
  `EmailAddress`).
- Shorten a long generic type (`IntList` for `[int]`).
- Document an API surface.

Note: in v1, type aliases are purely cosmetic — the compiler does
not distinguish `UserId` from `int` for type checking. v2 will
introduce *newtype* wrappers that are distinct types (see
[../spec/03-type-system.md](../spec/03-type-system.md) §3.1 for the
plan).

## 10. Pattern matching on types

`match` is the workhorse for working with enums, structs, tuples,
and arrays. Here is a summary of pattern forms with one example
each.

### 10.1 Literal patterns

```aether
fn describe(n: int) -> string {
  match n {
    0       => "zero",
    1       => "one",
    2 | 3   => "small",
    _       => "many",
  }
}
```

### 10.2 Wildcard patterns

```aether
fn ignore(o: Option<int>) -> string {
  match o {
    Option::Some(_) => "got something",
    Option::None    => "got nothing",
  }
}
```

### 10.3 Identifier patterns

```aether
fn unwrap(o: Option<int>) -> int {
  match o {
    Option::Some(v) => v,
    Option::None    => 0,
  }
}
```

The identifier `v` binds the inner value.

### 10.4 Tuple patterns

```aether
fn first(t: (int, int, int)) -> int {
  match t { (a, _, _) => a }
}
```

### 10.5 Array patterns

```aether
fn classify(xs: [int]) -> string {
  match xs {
    []       => "empty",
    [x]      => "one",
    [x, y]   => "two",
    [x, ..]  => "many",
  }
}
```

The `..` is a "rest" pattern that matches zero or more remaining
elements.

### 10.6 Struct patterns

```aether
struct Point { x: int, y: int }

fn classify(p: Point) -> string {
  match p {
    Point { x: 0, y: 0 } => "origin",
    Point { x: 0, y: _ } => "on y-axis",
    Point { x: _, y: 0 } => "on x-axis",
    Point { x: _, y: _ } => "elsewhere",
  }
}
```

### 10.7 Enum patterns

```aether
enum Shape { Circle(int), Rect(int, int), Unit }

fn describe(s: Shape) -> string {
  match s {
    Shape::Circle(r)    => f"circle of radius {r}",
    Shape::Rect(w, h)   => f"rect {w}x{h}",
    Shape::Unit         => "unit",
  }
}
```

### 10.8 Or-patterns

```aether
fn is_weekend(day: string) -> bool {
  match day {
    "Sat" | "Sun" => true,
    _             => false,
  }
}
```

### 10.9 Guards

A `match` arm can have a guard — an `if` that further restricts
when the arm matches. In v1, guards are parsed but not fully
integrated into exhaustiveness; the convention is to put a nested
`if` inside the arm body:

```aether
fn classify(n: int) -> string {
  match n {
    _ => if n > 0 { "positive" } else { if n < 0 { "negative" } else { "zero" } },
  }
}
```

(v2 will support `pattern if guard => body` directly; see
[../spec/04-expressions.md](../spec/04-expressions.md).)

## 11. A worked example: a typed JSON tree

Here is a small but complete program that uses generics, enums,
pattern matching, and recursion to build a typed JSON tree:

```aether
enum Json {
  Null,
  Bool(bool),
  Num(float),
  Str(string),
  Arr([Json]),
  Obj(map[string]Json),
}

fn pretty(j: Json, indent: int) -> string {
  let pad = " ".repeat(indent * 2);
  match j {
    Json::Null       => "null",
    Json::Bool(b)    => if b { "true" } else { "false" },
    Json::Num(n)     => str(n),
    Json::Str(s)      => f"\"{s}\"",
    Json::Arr(items)  => {
      let parts = map(items, fn(x: Json) -> string { pretty(x, indent + 1) });
      f"[{join(parts, ", ")}]"
    },
    Json::Obj(fields) => {
      let keys = map_keys(fields);
      let parts = map(keys, fn(k: string) -> string {
        f"\"{k}\": {pretty(map_get(fields, k), indent + 1)}"
      });
      f"{{{join(parts, ", ")}}}"
    },
  }
}

let j = Json::Obj({
  "name": Json::Str("Alice"),
  "age":  Json::Num(30.0),
  "hobbies": Json::Arr([Json::Str("hiking"), Json::Str("reading")]),
  "active": Json::Bool(true),
});

print(pretty(j, 0));
```

This example uses:

- A recursive enum with unit, tuple, and struct-ish (well, here,
  tuple) variants.
- Generic `map` over arrays.
- Pattern matching to dispatch over the variant.
- String interpolation for output.
- The stdlib `join`, `map_keys`, `map_get`, `str`.

## 12. Where to go next

- **[error-handling.md](error-handling.md)** — `Result`, `Option`,
  the `?` operator.
- **[ownership.md](ownership.md)** — what "no borrow checker"
  means in v1.
- **[stdlib-tour.md](stdlib-tour.md)** — the ten stdlib modules.
- **[idiomatic-aether.md](../guides/idiomatic-aether.md)** — 20
  patterns to internalize, including when to use enums vs.
  structs vs. tuples.

You now have the full type system. The next tutorials cover error
handling, the stdlib, and the runtime.
